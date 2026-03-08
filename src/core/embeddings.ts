// src/core/embeddings.ts
//
// Transformers.js 기반 로컬 임베딩 엔진
// - all-MiniLM-L6-v2 모델 (384차원, q8 양자화 ~90MB)
// - 싱글턴 패턴 — 첫 호출 시 모델 로드, 이후 캐시
// - WebGPU 가속 시도 → WASM 폴백
// - 모델은 IndexedDB에 자동 캐시 (재다운로드 불필요)

import { pipeline, cos_sim } from '@huggingface/transformers'
import type { FeatureExtractionPipeline, ProgressInfo } from '@huggingface/transformers'

// ─── 상태 ────────────────────────────────────────────────────

export type EmbeddingStatus =
  | { state: 'idle' }
  | { state: 'loading'; progress: number }  // 0-100
  | { state: 'ready' }
  | { state: 'error'; message: string }

type StatusCallback = (status: EmbeddingStatus) => void

let embedder: FeatureExtractionPipeline | null = null
let loadingPromise: Promise<FeatureExtractionPipeline> | null = null
let statusCallback: StatusCallback | null = null

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2'
const VECTOR_DIM = 384

// ─── 공개 API ────────────────────────────────────────────────

/** 상태 변경 콜백 등록 */
export function onEmbeddingStatus(cb: StatusCallback): void {
  statusCallback = cb
}

/** 현재 임베더 준비 여부 */
export function isEmbedderReady(): boolean {
  return embedder !== null
}

/** 벡터 차원 수 */
export function getVectorDim(): number {
  return VECTOR_DIM
}

/** 임베더 초기화 (싱글턴) — 진행률 콜백 포함 */
export async function getEmbedder(): Promise<FeatureExtractionPipeline> {
  if (embedder) return embedder

  if (loadingPromise) return loadingPromise

  loadingPromise = (async () => {
    statusCallback?.({ state: 'loading', progress: 0 })

    try {
      const instance = await pipeline('feature-extraction', MODEL_ID, {
        dtype: 'q8',
        progress_callback: (event: ProgressInfo) => {
          if ('progress' in event && typeof event.progress === 'number') {
            statusCallback?.({ state: 'loading', progress: Math.round(event.progress) })
          }
        },
      })

      embedder = instance
      statusCallback?.({ state: 'ready' })
      return instance
    } catch (err) {
      const msg = err instanceof Error ? err.message : '모델 로드 실패'
      statusCallback?.({ state: 'error', message: msg })
      loadingPromise = null
      throw err
    }
  })()

  return loadingPromise
}

/** 텍스트 → 384차원 벡터 생성 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const model = await getEmbedder()
  const result = await model(text, { pooling: 'mean', normalize: true })
  return Array.from(result.data as Float32Array)
}

/** 코사인 유사도 계산 (Transformers.js 내장 함수 래핑) */
export function cosineSimilarity(a: number[], b: number[]): number {
  return cos_sim(a, b)
}

/** 텍스트의 해시 (변경 감지용, 간단한 FNV-1a) */
export function textHash(text: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}
