// src/core/metaCrypto.ts
//
// 메타데이터(태그·폴더명) at-rest 암호화.
// content와 같은 AES-GCM 프리미티브·`"enc":1` 마커를 재사용해 평문/암호문을 값 단위로 판별한다.
// 마커 판별이 핵심인 이유: 백필은 DB 업그레이드가 아니라 잠금 해제 시점에 돌기 때문에
// 평문과 암호문이 한동안 섞여 있고, 모든 변환이 그 혼재 상태를 그대로 견뎌야 한다.
//
// 태그는 배열을 통째로 감싸지 않고 **원소별**로 암호화한다 — `string[]` 타입과
// `tags.includes(x)` 의미가 그대로 남아, 복호화 지점만 추가하면 기존 필터 코드가 안 바뀐다.

import { isEncryptedContent, encryptContent, decryptContent } from './content'

/** 잠금 상태에서 폴더명 대신 보여줄 라벨 — 카드 제목은 평문 유지지만 폴더명은 암호화 대상이다 */
export const LOCKED_FOLDER_LABEL = '🔒 잠긴 폴더'

// ── 값 단위 규칙 (단일 소스) ────────────────────────────────
// 태그·폴더명은 담는 그릇만 다를 뿐 같은 규칙을 따른다. 가드를 함수마다 다시 쓰면
// 한 곳만 빠져도 이중 암호화(멱등 깨짐)나 렌더 크래시가 나므로 여기 한 번만 둔다.

/** 빈 값과 이미 암호문인 값은 그대로 — 이것이 백필을 여러 번 돌려도 안전한 이유다. */
async function encryptValue(value: string, key: CryptoKey): Promise<string> {
  if (value === '' || isEncryptedContent(value)) return value
  return encryptContent(value, key)
}

/**
 * 평문은 그대로 통과(백필 진행 중 혼재 허용), 키 부재·복호화 실패는 null.
 * null을 무엇으로 바꿀지는 **호출부가 정한다** — 태그는 제외, 폴더명은 잠금 라벨.
 * 여기서 예외를 던지지 않는 이유: 트리·목록 렌더 경로라 한 값이 깨지면 화면 전체가 죽는다.
 */
async function decryptValue(value: string, key: CryptoKey | null): Promise<string | null> {
  if (!isEncryptedContent(value)) return value
  if (!key) return null
  try {
    return await decryptContent(value, key)
  } catch {
    return null
  }
}

/** 태그 배열을 원소별로 암호화한다(멱등). */
export async function encryptTags(tags: string[], key: CryptoKey): Promise<string[]> {
  return Promise.all(tags.map((t) => encryptValue(t, key)))
}

/**
 * 태그 배열을 복호화한다. 읽을 수 없는 원소는 **조용히 제외** —
 * 암호문이나 깨진 문자열이 태그 칩으로 화면에 뜨는 것보다 안 보이는 편이 낫다.
 */
export async function decryptTags(tags: string[], key: CryptoKey | null): Promise<string[]> {
  const results = await Promise.all(tags.map((t) => decryptValue(t, key)))
  return results.filter((t): t is string => t !== null)
}

/** 폴더명을 암호화한다(멱등). */
export async function encryptFolderName(name: string, key: CryptoKey): Promise<string> {
  return encryptValue(name, key)
}

/** 폴더명을 복호화한다. 읽을 수 없으면 잠금 라벨 — 트리에는 빈칸 대신 이유가 보여야 한다. */
export async function decryptFolderName(name: string, key: CryptoKey | null): Promise<string> {
  return (await decryptValue(name, key)) ?? LOCKED_FOLDER_LABEL
}
