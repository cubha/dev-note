import { describe, it, expect, beforeEach } from 'vitest'
import { db, ensureConfig } from '../core/db'
import { runSync } from '../features/sync/syncEngine'
import { generateDEK } from '../core/sync-crypto'
import { isEncryptedNoteFile, isSyncManifest } from '../features/sync/sync-schema'
import type { StorageProvider, RemoteFile } from '../features/sync/providers/StorageProvider'
import type { Item } from '../core/db'

// 클라우드 1개를 여러 "기기"가 공유하는 시뮬레이션용 메모리 프로바이더
class FakeCloud implements StorageProvider {
  readonly id = 'google-drive' as const
  files = new Map<string, string>()
  authenticate(): Promise<void> { return Promise.resolve() }
  isAuthenticated(): boolean { return true }
  list(): Promise<RemoteFile[]> {
    return Promise.resolve([...this.files.keys()].map((name) => ({ name, id: name, modifiedTime: 0 })))
  }
  get(name: string): Promise<string | null> { return Promise.resolve(this.files.get(name) ?? null) }
  put(name: string, content: string): Promise<void> { this.files.set(name, content); return Promise.resolve() }
  remove(name: string): Promise<void> { this.files.delete(name); return Promise.resolve() }
  signOut(): void {}
}

async function addItem(title: string, content: string): Promise<number> {
  return (await db.items.add({
    folderId: null, title, type: 'note', tags: [], order: 0,
    pinned: false, content, updatedAt: 100, createdAt: 100,
  } as Omit<Item, 'id'>)) as number
}

async function resetLocalDB() {
  await db.items.clear()
  await db.folders.clear()
  await db.syncState.clear()
  await db.config.clear()
  await ensureConfig()
}

const dekKey = () => generateDEK()

describe('runSync 통합 — 다기기 수렴 & tombstone', () => {
  beforeEach(async () => {
    await resetLocalDB()
  })

  it('push 라운드트립: 로컬 노트가 암호화되어 클라우드에 업로드된다', async () => {
    const cloud = new FakeCloud()
    const dekStr = dekKey()
    await addItem('서버 접속정보', '{"format":"legacy","text":"10.0.0.1"}')
    await addItem('API 키 메모', '{"format":"legacy","text":"sk-xxx"}')

    const r = await runSync(cloud, dekStr, 'deviceA', 1000)
    expect(r.pushed).toBe(2)
    // manifest + 노트 2개 파일 존재
    expect(cloud.files.has('manifest.json')).toBe(true)
    const encFiles = [...cloud.files.keys()].filter((n) => n.endsWith('.enc'))
    expect(encFiles).toHaveLength(2)
    // syncState 기록됨
    expect(await db.syncState.count()).toBe(2)
  })

  it('zero-knowledge: 업로드된 파일에 평문 제목/내용이 없다', async () => {
    const cloud = new FakeCloud()
    await addItem('비밀제목XYZ', '{"format":"legacy","text":"평문비밀1234"}')
    await runSync(cloud, dekKey(), 'deviceA', 1000)

    const encName = [...cloud.files.keys()].find((n) => n.endsWith('.enc')) as string
    const raw = cloud.files.get(encName) as string
    expect(raw).not.toContain('비밀제목XYZ')
    expect(raw).not.toContain('평문비밀1234')
    const parsed = JSON.parse(raw)
    expect(isEncryptedNoteFile(parsed)).toBe(true)
  })

  it('다른 기기가 같은 DEK로 노트를 복원한다(다운로드)', async () => {
    const cloud = new FakeCloud()
    const dek = generateDEK()
    // 기기 A: push
    await addItem('공유노트', '{"format":"legacy","text":"abc"}')
    await runSync(cloud, dek, 'deviceA', 1000)

    // 기기 B: 로컬 비움 + 같은 클라우드/DEK로 pull
    await resetLocalDB()
    const r = await runSync(cloud, dek, 'deviceB', 2000)
    expect(r.pulled).toBe(1)
    const items = await db.items.toArray()
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('공유노트')
    expect(items[0].content).toBe('{"format":"legacy","text":"abc"}')
  })

  it('tombstone 부활 방지: 삭제된 노트는 다른 기기에서 되살아나지 않는다', async () => {
    const cloud = new FakeCloud()
    const dek = generateDEK()
    // 기기 A: 두 노트 push
    const idX = await addItem('지울노트X', '{"format":"legacy","text":"x"}')
    await addItem('남길노트Y', '{"format":"legacy","text":"y"}')
    await runSync(cloud, dek, 'deviceA', 1000)

    // 기기 A: X 삭제 후 재동기화 → tombstone 전파
    await db.items.delete(idX)
    const delResult = await runSync(cloud, dek, 'deviceA', 2000)
    expect(delResult.tombstoned).toBe(1)
    const manifest = JSON.parse(cloud.files.get('manifest.json') as string)
    expect(isSyncManifest(manifest)).toBe(true)
    expect(Object.keys(manifest.tombstones)).toHaveLength(1)
    // 원격 X.enc 제거됨
    expect([...cloud.files.keys()].filter((n) => n.endsWith('.enc'))).toHaveLength(1)

    // 기기 B: 로컬 비움 + pull → Y만 복원, X는 부활하지 않음
    await resetLocalDB()
    await runSync(cloud, dek, 'deviceB', 3000)
    const titles = (await db.items.toArray()).map((i) => i.title)
    expect(titles).toEqual(['남길노트Y'])
  })

  it('수렴: 이미 동기화된 상태에서 재동기화하면 전송이 없다', async () => {
    const cloud = new FakeCloud()
    const dek = generateDEK()
    await addItem('안정노트', '{"format":"legacy","text":"z"}')
    await runSync(cloud, dek, 'deviceA', 1000)
    const second = await runSync(cloud, dek, 'deviceA', 2000)
    expect(second).toEqual({ pushed: 0, pulled: 0, conflicts: 0, tombstoned: 0, deletedLocal: 0 })
  })

  it('삭제-편집 충돌이 idempotent하게 수렴한다 (복제본 무한증식 없음)', async () => {
    const cloud = new FakeCloud()
    const dek = generateDEK()
    const key = () => dek

    // 1) 노트 push → uuid·base(V1) 확보
    await addItem('충돌노트', '{"format":"legacy","text":"v1"}')
    await runSync(cloud, key(), 'deviceA', 1000)
    const uuid = Object.keys(JSON.parse(cloud.files.get('manifest.json') as string).notes)[0]

    // 2) "다른 기기"가 원격을 v2로 편집(pull→edit→push)
    await resetLocalDB()
    await runSync(cloud, key(), 'deviceC', 2000)
    const pulled = await db.items.where('uuid').equals(uuid).first()
    await db.items.update((pulled as { id: number }).id, { content: '{"format":"legacy","text":"v2"}', updatedAt: 200 })
    await runSync(cloud, key(), 'deviceC', 2100)
    const V2 = JSON.parse(cloud.files.get('manifest.json') as string).notes[uuid].version

    // 3) deviceA의 삭제-편집 상태 구성: base=V1(구버전), 로컬에 노트 없음(삭제됨)
    await resetLocalDB()
    await runSync(cloud, key(), 'deviceA', 3000) // 먼저 pull로 V2 동기화…
    const restored = await db.items.where('uuid').equals(uuid).first()
    await db.items.delete((restored as { id: number }).id) // …그 뒤 로컬 삭제
    // base를 V1로 되돌려 "원격이 base 이후 편집됨" 상황을 만든다
    await db.syncState.put({ uuid, syncedVersion: 'STALE_BASE_V1' })
    void V2

    // 4) 충돌 해소 (원격 우선 복원)
    const c1 = await runSync(cloud, key(), 'deviceA', 4000)
    expect(c1.conflicts).toBe(1)
    expect(await db.items.count()).toBe(1)

    // 5) 두 번 더 동기화 → 무충돌·무복제(수렴)
    const c2 = await runSync(cloud, key(), 'deviceA', 5000)
    const c3 = await runSync(cloud, key(), 'deviceA', 6000)
    expect(c2).toEqual({ pushed: 0, pulled: 0, conflicts: 0, tombstoned: 0, deletedLocal: 0 })
    expect(c3).toEqual({ pushed: 0, pulled: 0, conflicts: 0, tombstoned: 0, deletedLocal: 0 })
    expect(await db.items.count()).toBe(1) // 복제본 증식 없음
  })

  it('폴더 안 노트가 다른 기기에서 수렴한다 (folderPath 해시 라운드트립)', async () => {
    const cloud = new FakeCloud()
    const dek = generateDEK()
    const key = () => dek

    // 기기 A: 폴더 안에 노트 생성 → push
    const folderId = (await db.folders.add({
      parentId: null, name: '프로젝트', order: 0, createdAt: 1,
    })) as number
    await db.items.add({
      folderId, title: '폴더노트', type: 'note', tags: ['t'], order: 0,
      pinned: false, content: '{"format":"legacy","text":"f"}', updatedAt: 100, createdAt: 100,
    } as Omit<Item, 'id'>)
    await runSync(cloud, key(), 'deviceA', 1000)

    // 기기 B: pull → 폴더 재구성
    await resetLocalDB()
    await runSync(cloud, key(), 'deviceB', 2000)
    const folders = await db.folders.toArray()
    expect(folders.map((f) => f.name)).toContain('프로젝트')
    const note = (await db.items.toArray())[0]
    expect(folders.find((f) => f.id === note.folderId)?.name).toBe('프로젝트')

    // 기기 B 재동기화 → 전송 없음(폴더 노트 해시가 라운드트립으로 일치)
    const second = await runSync(cloud, key(), 'deviceB', 3000)
    expect(second).toEqual({ pushed: 0, pulled: 0, conflicts: 0, tombstoned: 0, deletedLocal: 0 })
  })
})
