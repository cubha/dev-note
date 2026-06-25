// src/features/sync/providers/GoogleDriveProvider.ts
//
// Google Drive appDataFolder 기반 BYO-storage 프로바이더.
// - 인증: Google Identity Services(GIS) 토큰 모델. drive.appdata 단독 스코프(검증 면제).
// - 토큰: 메모리에만 보관(localStorage/IndexedDB 금지 = 프로젝트 하드룰). 만료 시 silent 갱신.
// - zero-knowledge: 업로드 전 모든 콘텐츠는 호출자(syncEngine)가 DEK로 암호화한 상태.
//   이 프로바이더는 암호문 바이트만 다루며 평문/키를 보지 않는다.
// - 네트워크 접점(fetch/OAuth)은 이 파일에 한정(verify.sh Spec5 예외 디렉토리).

import type { StorageProvider, RemoteFile } from './StorageProvider'

const SCOPE = 'https://www.googleapis.com/auth/drive.appdata'
const GIS_SRC = 'https://accounts.google.com/gsi/client'
const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files'
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'

// ── GIS 최소 타입 선언 (@types/google.accounts 미설치, any 금지) ──
interface TokenResponse {
  access_token?: string
  expires_in?: number
  error?: string
}
interface TokenClient {
  callback: (resp: TokenResponse) => void
  requestAccessToken: (opts?: { prompt?: string }) => void
}
interface GisOAuth2 {
  initTokenClient: (config: {
    client_id: string
    scope: string
    callback: (resp: TokenResponse) => void
  }) => TokenClient
  revoke: (token: string, done?: () => void) => void
}
interface GoogleNS {
  accounts: { oauth2: GisOAuth2 }
}

function getGoogle(): GoogleNS | undefined {
  return (window as unknown as { google?: GoogleNS }).google
}

function loadGisScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (getGoogle()?.accounts?.oauth2) {
      resolve()
      return
    }
    const existing = document.querySelector(`script[src="${GIS_SRC}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('GIS 스크립트 로드 실패')), { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = GIS_SRC
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('GIS 스크립트 로드 실패'))
    document.head.appendChild(script)
  })
}

export class GoogleDriveProvider implements StorageProvider {
  readonly id = 'google-drive' as const

  private clientId: string
  private tokenClient: TokenClient | null = null
  private accessToken: string | null = null
  private tokenExpiry = 0 // epoch ms
  private fileIndex = new Map<string, string>() // name → fileId

  constructor(clientId: string | undefined) {
    if (!clientId) {
      throw new Error(
        'Google Drive 동기화에는 VITE_GOOGLE_CLIENT_ID 환경변수가 필요합니다',
      )
    }
    this.clientId = clientId
  }

  isAuthenticated(): boolean {
    return this.accessToken !== null && Date.now() < this.tokenExpiry
  }

  async authenticate(interactive: boolean): Promise<void> {
    await loadGisScript()
    const google = getGoogle()
    if (!google?.accounts?.oauth2) {
      throw new Error('GIS를 초기화할 수 없습니다')
    }
    if (!this.tokenClient) {
      this.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: this.clientId,
        scope: SCOPE,
        callback: () => {}, // requestToken에서 매번 교체
      })
    }
    await this.requestToken(interactive)
  }

  /** 토큰 요청 — interactive=false면 동의 UI 없이 silent 갱신 시도 */
  private requestToken(interactive: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      const client = this.tokenClient
      if (!client) {
        reject(new Error('토큰 클라이언트가 초기화되지 않았습니다'))
        return
      }
      client.callback = (resp: TokenResponse) => {
        if (resp.error || !resp.access_token) {
          reject(new Error('Google 인증에 실패했습니다 — 다시 연결해 주세요'))
          return
        }
        this.accessToken = resp.access_token
        // expires_in(초) 만료 60초 전을 유효 한도로 (네트워크 지연 버퍼)
        const ttl = (resp.expires_in ?? 3600) - 60
        this.tokenExpiry = Date.now() + ttl * 1000
        resolve()
      }
      client.requestAccessToken({ prompt: interactive ? 'consent' : '' })
    })
  }

  /** 유효 토큰 보장 — 만료 시 silent 갱신, 실패하면 호출자가 재인증 유도 */
  private async ensureToken(): Promise<string> {
    if (this.isAuthenticated() && this.accessToken) return this.accessToken
    await this.requestToken(false)
    if (!this.accessToken) throw new Error('동기화 토큰을 갱신할 수 없습니다 — 다시 연결해 주세요')
    return this.accessToken
  }

  private async authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.ensureToken()
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${token}`)
    let resp = await fetch(input, { ...init, headers })
    if (resp.status === 401) {
      // 토큰 만료/취소 → 1회 silent 갱신 후 재시도
      this.accessToken = null
      const fresh = await this.ensureToken()
      headers.set('Authorization', `Bearer ${fresh}`)
      resp = await fetch(input, { ...init, headers })
    }
    return resp
  }

  async list(): Promise<RemoteFile[]> {
    const url = `${DRIVE_FILES}?spaces=appDataFolder&pageSize=1000&fields=${encodeURIComponent(
      'files(id,name,modifiedTime)',
    )}`
    const resp = await this.authedFetch(url)
    if (!resp.ok) throw new Error(`Drive 목록 조회 실패 (${resp.status})`)
    const data = (await resp.json()) as {
      files?: Array<{ id: string; name: string; modifiedTime: string }>
    }
    const files = data.files ?? []
    this.fileIndex.clear()
    const result: RemoteFile[] = []
    for (const f of files) {
      this.fileIndex.set(f.name, f.id)
      result.push({ name: f.name, id: f.id, modifiedTime: Date.parse(f.modifiedTime) || 0 })
    }
    return result
  }

  private async resolveId(name: string): Promise<string | null> {
    if (this.fileIndex.has(name)) return this.fileIndex.get(name) ?? null
    await this.list()
    return this.fileIndex.get(name) ?? null
  }

  async get(name: string): Promise<string | null> {
    const id = await this.resolveId(name)
    if (!id) return null
    const resp = await this.authedFetch(`${DRIVE_FILES}/${id}?alt=media`)
    if (resp.status === 404) return null
    if (!resp.ok) throw new Error(`Drive 파일 읽기 실패 (${resp.status})`)
    return resp.text()
  }

  async put(name: string, content: string): Promise<void> {
    const id = await this.resolveId(name)
    if (id) {
      // 기존 파일 덮어쓰기 — 미디어 업로드(PATCH)
      const resp = await this.authedFetch(
        `${DRIVE_UPLOAD}/${id}?uploadType=media`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: content },
      )
      if (resp.ok) return
      // stale-HIT 방어(scope-critic): 다른 기기가 이 파일을 삭제/재생성해 캐시된 id가
      // 죽은 경우 PATCH는 404를 낸다. 캐시를 비우고 신규 생성으로 폴백한다(remove와 동일 패턴).
      if (resp.status !== 404) throw new Error(`Drive 파일 갱신 실패 (${resp.status})`)
      this.fileIndex.delete(name)
    }
    // 신규 파일 — multipart(메타데이터 + 본문)로 appDataFolder에 생성
    // boundary는 매 요청 난수화(본문이 boundary 문자열을 포함해 조기 종결되는 것 방어)
    const boundary = `devnote-${Array.from(crypto.getRandomValues(new Uint8Array(12))).map((b) => b.toString(16).padStart(2, '0')).join('')}`
    const metadata = JSON.stringify({ name, parents: ['appDataFolder'] })
    const body =
      `--${boundary}\r\n` +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      `${metadata}\r\n` +
      `--${boundary}\r\n` +
      'Content-Type: application/json\r\n\r\n' +
      `${content}\r\n` +
      `--${boundary}--`
    const resp = await this.authedFetch(`${DRIVE_UPLOAD}?uploadType=multipart&fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    })
    if (!resp.ok) throw new Error(`Drive 파일 생성 실패 (${resp.status})`)
    const created = (await resp.json()) as { id?: string }
    if (created.id) this.fileIndex.set(name, created.id)
  }

  async remove(name: string): Promise<void> {
    const id = await this.resolveId(name)
    if (!id) return
    const resp = await this.authedFetch(`${DRIVE_FILES}/${id}`, { method: 'DELETE' })
    // 204(성공) 또는 404(이미 없음) 모두 정상 처리
    if (!resp.ok && resp.status !== 404) {
      throw new Error(`Drive 파일 삭제 실패 (${resp.status})`)
    }
    this.fileIndex.delete(name)
  }

  signOut(): void {
    const token = this.accessToken
    if (token) {
      getGoogle()?.accounts.oauth2.revoke(token)
    }
    this.accessToken = null
    this.tokenExpiry = 0
    this.fileIndex.clear()
  }
}

/** 환경변수에서 client_id를 읽어 프로바이더를 생성한다. */
export function createGoogleDriveProvider(): GoogleDriveProvider {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
  return new GoogleDriveProvider(clientId)
}
