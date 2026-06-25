// vitest 전역 셋업 — Dexie 통합 테스트용 IndexedDB 폴리필.
// db.ts(싱글톤) import 전에 globalThis.indexedDB를 패치해야 하므로 setupFiles로 등록한다.
import 'fake-indexeddb/auto'
