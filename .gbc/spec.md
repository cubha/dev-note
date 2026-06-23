# 작업 명세

- [ ] 봉투 암호화: 평문 ExportSchema JSON 전체를 AES-GCM으로 감싼 EncryptedBackup{format:'devnote-encrypted-backup',version:1,kdf:'PBKDF2',iterations,salt(hex,백업전용 새 salt),ciphertext} 생성
- [ ] 봉투 복호화: unwrapEnvelope는 봉투에 기록된 iterations로 키 파생, 올바른 패스프레이즈면 원본 ExportSchema 복원
- [ ] 비번 검증: 틀린 패스프레이즈는 별도 해시 없이 AES-GCM 인증 태그 실패로 판정, 친절한 에러 메시지 throw
- [ ] 직교성: 기존 content 필드별 암호화({enc:1,ct})된 items를 포함한 백업도 봉투로 감싸고 복원 가능
- [ ] 대용량 안전성: 수백KB~MB 페이로드도 RangeError 없이 base64 변환(btoa 청크 처리)
- [ ] crypto-agility: deriveKey는 optional iterations 파라미터(기본 100000)를 받아 기존 content 암호화 경로 무영향
- [ ] 평문 호환: 봉투가 아닌 일반 ExportSchema 백업은 기존대로 가져오기 동작(회귀 없음)
- [ ] 가져오기 플로우: 파일→봉투 감지(detectBackupType)→패스프레이즈 입력→복호화→카운트 표시→ImportModeModal 순, 복호화는 상류 1회
