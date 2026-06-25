// src/features/sync/providers/StorageProvider.ts
//
// BYO-storage 프로바이더 추상 인터페이스.
// 동기화 엔진(syncEngine)·키 매니저(keyManager)는 이 인터페이스에만 의존하며
// 네트워크 접점(fetch/OAuth)은 구현체(GoogleDriveProvider 등)에 한정된다.
// → 추후 Dropbox 등 추가 시 이 인터페이스만 재구현하면 된다.

/** 원격 스토리지의 파일 메타데이터 */
export interface RemoteFile {
  name: string // 논리 파일명 ({uuid}.enc, manifest.json, meta.json)
  id: string // 프로바이더 고유 파일 ID
  modifiedTime: number // epoch ms
}

export interface StorageProvider {
  /** 프로바이더 식별자 (config.syncProvider와 일치) */
  readonly id: 'google-drive'

  /** OAuth 인증 — 토큰은 메모리에만 보관(localStorage 금지). 동의 UI가 뜰 수 있음. */
  authenticate(interactive: boolean): Promise<void>

  /** 현재 유효한 액세스 토큰을 보유 중인지 */
  isAuthenticated(): boolean

  /**
   * 동기화 폴더(appDataFolder)의 파일 목록.
   * 계약: syncEngine은 매 동기화 사이클 시작 시 list()를 호출해 구현체의 name→id 캐시를
   * 갱신해야 한다. 그래야 다기기 stale-cache로 인한 오답을 최소화한다.
   */
  list(): Promise<RemoteFile[]>

  /** 파일 내용(텍스트)을 읽는다. 없으면 null. */
  get(name: string): Promise<string | null>

  /** 파일을 생성/덮어쓴다 (upsert). */
  put(name: string, content: string): Promise<void>

  /** 파일을 삭제한다 (없으면 무시). */
  remove(name: string): Promise<void>

  /** 메모리 토큰을 폐기하고 연결을 끊는다. */
  signOut(): void
}
