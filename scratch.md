# Phase 1: 암호화 export/백업 강화 (전체 봉투 암호화)

/ sh-dev-loop --tdd --auto 실행 중. 근거: memory/project_security_direction.md Phase 1

## 봉투 포맷
```
{ format:'devnote-encrypted-backup', version:1, kdf:'PBKDF2', iterations, salt(hex,백업전용), ciphertext }
```
평문 ExportSchema JSON 전체를 crypto.encrypt로 감쌈. 기존 content 암호화(`{enc:1,ct}`)와 직교. 평문 백업 호환 유지. 비번검증=AES-GCM 인증태그 실패.

## Advisor 보강 (반영 확정)
1. deriveKey(passphrase, salt, iterations=PBKDF2_ITERATIONS) 파라미터화 — unwrap이 봉투 iterations 사용
2. [BLOCKING] crypto.ts:53 btoa(...spread) → 대용량 RangeError. 청크 변환 + ~500KB 테스트
3. import: isEncryptedBackup 가드를 isValidExportSchema 앞에
4. 플로우: 파일→봉투감지→패스프레이즈→복호화→카운트→ImportModeModal. 아키텍처 A(상류 1회 복호화)

## SubTask 진행
- [ ] 1 [TDD] envelope.ts + crypto.ts(btoa fix, deriveKey param)
- [ ] 2 export.ts passphrase 옵션
- [ ] 3 import.ts detectBackupType/decryptBackup + 방어가드
- [ ] 4 내보내기 UI (ExportOptionsModal)
- [ ] 5 가져오기 UI (ImportPassphraseModal)
- [ ] 6 검증

## 결정
- TDD 적격: SubTask 1만 (순수 암호화 로직). 2~3 IO·5/4 UI = test-after
- 아키텍처 A: 복호화는 UI 오케스트레이션 1회, importData/parseImportPreview는 평문만
<!-- scratch-done -->
