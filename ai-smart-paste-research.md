# AI Smart Paste 기능 리서치 보고서

> 작성일: 2026-03-07
> 대상 프로젝트: dev-note (React 19 + Vite SPA, 완전 로컬 오프라인 전용)
> 목적: 비정형 텍스트 → 카드 필드 자동 구조화 기능의 구현 가능성 분석

---

## 0. 핵심 제약 사항 (Critical Constraint)

> **CLAUDE.md 프로젝트 절대 금지 항목:**
> `외부 서버/API 호출 추가 (완전 로컬 오프라인 전용)`

이 제약은 AI Smart Paste 구현 방식 선택에 결정적 영향을 미친다.
외부 LLM API(Claude, OpenAI 등) 직접 호출은 이 규칙에 위배된다.

**따라서 본 보고서에서는 3가지 전략을 계층별로 분석한다:**

| 계층 | 방식 | 오프라인 | 규칙 준수 | 비정형 텍스트 처리 |
|------|------|---------|----------|-----------------|
| **Tier 1** | 정규식 + 전용 파서 (결정론적) | O | O | 구조화 입력만 |
| **Tier 2** | 브라우저 내장 LLM (WebLLM) | O | O | 가능 (제한적) |
| **Tier 3** | 외부 LLM API (BYOK 방식) | X | **X (규칙 위반)** | 우수 |

> **권고**: Tier 1을 MVP로 구현하고, 사용자가 원할 경우 Tier 3을 **"선택적 온라인 기능"**으로 제공.
> 단, Tier 3 도입 시 CLAUDE.md 규칙 수정에 대한 사용자 동의가 선행되어야 한다.

---

## 1. 현재 프로젝트와의 적합성 검토

### 1-1. DevNote 핵심 목적과의 부합도

DevNote는 **개발자의 접속정보(서버, DB, API)와 메모를 관리하는 로컬 도구**다.
개발 현장에서 접속정보는 다음과 같은 비정형 형태로 공유된다:

```
# Slack 메시지
프로덕션 DB 접속 정보입니다
호스트: db-master.company.com
포트: 5432
계정: dbadmin / P@ssw0rd!
DB: prod_main

# SSH config 블록
Host prod-server
  HostName 10.0.1.50
  User deploy
  Port 2222
  IdentityFile ~/.ssh/deploy_key

# 이메일 본문
API 엔드포인트: https://api.service.com/v2
인증: Bearer eyJhbGciOiJIUzI1NiIs...
메서드: POST
Content-Type: application/json
```

이런 텍스트를 **복사 → 붙여넣기 → 자동 구조화**하는 기능은 DevNote의 핵심 사용 시나리오에 **직접적으로 부합**한다.

### 1-2. 카드 타입별 추출 가능 필드 정의

현재 `FIELD_SCHEMAS` (`src/core/types.ts`) 기준:

| 카드 타입 | 추출 대상 필드 | 비정형 텍스트 예시 |
|----------|--------------|-------------------|
| **Server** | `host`, `port`, `username`, `password`, `keyPath`, `note` | SSH config, `user@host:port`, Slack 공유 텍스트 |
| **DB** | `host`, `port`, `dbName`, `username`, `password`, `note` | 연결 문자열 URI, Key=Value 형식, 자연어 메모 |
| **API** | `url`, `method`, `apiKey`, `token`, `headers`, `note` | curl 명령, Postman 공유, API 문서 발췌 |
| **Note** | `content` | 전체 텍스트를 content에 그대로 삽입 |
| **Custom** | `content` | 전체 텍스트를 content에 그대로 삽입 (마크다운) |

### 1-3. 사용자 워크플로우 관점 실용성

**현재 워크플로우** (Smart Paste 없음):
```
[Slack에서 정보 복사] → [DevNote 새 카드 생성] → [타입 선택] → [각 필드에 수동 입력] → [저장]
```
→ 6개 필드를 개별적으로 복사-붙여넣기해야 하므로 **5~10회의 클립보드 조작** 필요

**개선된 워크플로우** (Smart Paste):
```
[Slack에서 정보 복사] → [DevNote Smart Paste] → [자동 채워진 필드 확인/수정] → [저장]
```
→ **1회 붙여넣기 + 확인**으로 단축

**실용성 평가: 높음** — 특히 Server/DB/API 타입은 필드가 5~6개이므로 효과가 크다.

---

## 2. 구현 가능성 및 기술 스택 분석

### 2-1. Tier 1: 정규식 + 전용 파서 (권장 MVP)

외부 의존 없이 **결정론적 파싱**으로 구조화된 입력을 처리한다.
dev-note의 오프라인 전용 원칙에 완벽히 부합.

#### Server 타입 파서

```typescript
// SSH 접속 문자열: user@host:port
const SSH_CONNECT = /(\w[\w.-]*)@([\w.\-]+)(?::(\d{1,5}))?/;

// SSH config 블록 감지
const SSH_CONFIG_HOST = /^\s*Host\s+(\S+)/m;
const SSH_CONFIG_HOSTNAME = /^\s*HostName\s+(\S+)/m;
const SSH_CONFIG_USER = /^\s*User\s+(\S+)/m;
const SSH_CONFIG_PORT = /^\s*Port\s+(\d+)/m;
const SSH_CONFIG_IDENTITY = /^\s*IdentityFile\s+(.+)/m;

// 한글 라벨: "호스트: xxx" / "포트: xxx"
const KR_HOST = /호스트\s*[:：]\s*(\S+)/;
const KR_PORT = /포트\s*[:：]\s*(\d+)/;
const KR_USER = /(?:계정|사용자|유저|아이디)\s*[:：]\s*(\S+)/;
const KR_PASS = /(?:비밀번호|패스워드|비번)\s*[:：]\s*(\S+)/;
```

#### DB 타입 파서

```typescript
// URI 형식: postgresql://user:pass@host:5432/dbname
const DB_URI = /(postgres(?:ql)?|mysql|mariadb|mongodb|redis|mssql):\/\/(?:([^:@]+)(?::([^@]+))?@)?([\w.\-]+)(?::(\d+))?\/?(\w+)?/i;

// Key=Value 형식 (ADO.NET, JDBC 등)
// Host=localhost;Port=5432;Database=mydb;Username=admin;Password=secret
const KV_PATTERNS: Record<string, RegExp> = {
  host: /(?:Host|Server|Data Source)\s*=\s*([^;\n]+)/i,
  port: /Port\s*=\s*(\d+)/i,
  dbName: /(?:Database|Initial Catalog|dbname)\s*=\s*([^;\n]+)/i,
  username: /(?:User(?:name)?|User Id|UID)\s*=\s*([^;\n]+)/i,
  password: /(?:Password|PWD)\s*=\s*([^;\n]+)/i,
};

// JDBC URL: jdbc:mysql://host:3306/dbname
const JDBC_URL = /jdbc:(\w+):\/\/([\w.\-]+)(?::(\d+))?\/?(\w+)?/i;
```

#### API 타입 파서

```typescript
// curl 명령 파싱
const CURL_URL = /curl\s+(?:.*?\s+)?['"]?(https?:\/\/\S+?)['"]?(?:\s|$)/i;
const CURL_METHOD = /curl\s+.*?-X\s+(GET|POST|PUT|PATCH|DELETE)/i;
const CURL_HEADER = /-H\s+['"]([^'"]+)['"]/gi;

// URL
const URL_PATTERN = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/i;

// HTTP 메서드
const HTTP_METHOD = /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/;

// Bearer 토큰
const BEARER_TOKEN = /(?:Bearer|Authorization)\s*[:=]?\s*["']?([A-Za-z0-9\-_.~+/=]{20,})["']?/i;

// API Key
const API_KEY = /(?:api[_-]?key|x-api-key)\s*[:=]\s*["']?([^\s"']+)["']?/i;
```

#### 공통 패턴

```typescript
// IP 주소
const IPV4 = /\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/;

// 포트 번호 (라벨 동반)
const LABELED_PORT = /\bport\s*[:=]\s*(\d{1,5})\b/i;

// "계정 / 비번" 슬래시 구분 패턴 (한국어 커뮤니케이션에서 흔함)
const SLASH_CRED = /(\S+)\s*\/\s*(\S+)/;
```

#### 예상 번들 크기 영향

- 순수 정규식 로직: **~3-5KB** (gzipped)
- 추가 파서 라이브러리 없음 (자체 구현)
- 기존 번들에 거의 영향 없음

#### 한계

| 처리 가능 | 처리 불가 |
|----------|----------|
| `user@host:port` 형식 | "프로덕션 서버에 접속하려면 VPN 켜고..." |
| SSH config 블록 | 자연어 속에 흩어진 정보 |
| DB 연결 문자열 (URI/KV) | 스크린샷 OCR 결과 텍스트 |
| curl 명령 | "어제 보내준 그 API 키로 접속해봐" |
| `Host: xxx / Port: xxx` 라벨 형식 | 테이블 형식 (탭/스페이스 구분) |

---

### 2-2. Tier 2: 브라우저 내장 LLM (WebLLM)

브라우저에서 LLM을 직접 실행하여 비정형 텍스트도 처리 가능.
오프라인 동작이 가능하므로 프로젝트 규칙에 부합하나, **실용성 제약이 큼**.

#### 기술 스택

```typescript
// @mlc-ai/web-llm: WebGPU 가속 브라우저 LLM
import { CreateMLCEngine } from "@mlc-ai/web-llm";

const engine = await CreateMLCEngine("SmolLM2-360M-Instruct-q4f16_1-MLC", {
  initProgressCallback: (progress) => {
    console.log(`모델 로딩: ${(progress.progress * 100).toFixed(0)}%`);
  }
});

const response = await engine.chat.completions.create({
  messages: [
    {
      role: "system",
      content: `Extract server connection info as JSON matching this schema:
        { host: string, port: number, username: string, password: string | null, note: string | null }
        Use null for missing fields. Respond with JSON only.`
    },
    { role: "user", content: pastedText }
  ],
  response_format: { type: "json_object" },
  temperature: 0,
  max_tokens: 500,
});

const extracted = JSON.parse(response.choices[0].message.content);
```

#### 현실적 제약

| 항목 | 수치 | 영향 |
|------|------|------|
| 모델 다운로드 크기 | ~250-500MB | 첫 사용 시 장시간 대기 |
| 초기 로딩 시간 | 5~30초 (GPU 성능 의존) | UX 저하 |
| 추론 시간 | 1~5초/요청 | 수용 가능하나 정규식 대비 느림 |
| WebGPU 지원 | Chrome 113+, Edge 113+ | Firefox 미지원 (dev-note는 Firefox 대응) |
| 추출 정확도 | 중간 (360M 모델 한계) | 복잡한 컨텍스트 이해 부족 |
| 메모리 사용 | 1~2GB GPU VRAM | 저사양 기기에서 불가 |

#### 평가

> **결론: Tier 2는 현 시점에서 비권장**
> - WebGPU 미지원 브라우저 (Firefox) 대응 불가
> - 모델 크기 대비 추출 정확도가 Claude API에 비해 현저히 낮음
> - 초기 로딩 UX가 dev-note의 "가볍고 빠른" 컨셉과 불일치
> - 향후 브라우저 LLM 생태계가 성숙하면 재검토 가능

---

### 2-3. Tier 3: 외부 LLM API — BYOK (Bring Your Own Key)

> **주의: 현재 CLAUDE.md "외부 서버/API 호출 금지" 규칙에 위배됨**
> 도입 시 사용자 동의 하에 규칙 수정 필요 (예: "사용자가 명시적으로 활성화한 AI 기능 제외")

#### Anthropic Claude API Structured Output

2025년 11월 GA된 **Structured Outputs** (`output_config.format`) 기능으로
JSON 스키마 기반 **100% 보장된 구조화 응답**을 받을 수 있다.

```typescript
// src/core/ai-extract.ts (Tier 3 구현 시)

interface ExtractionResult {
  type: 'server' | 'db' | 'api' | 'note' | 'custom';
  title: string;
  fields: Record<string, string>;
  tags: string[];
}

const EXTRACTION_SCHEMA = {
  type: "object" as const,
  properties: {
    type: {
      type: "string",
      enum: ["server", "db", "api", "note", "custom"],
      description: "Type of information detected"
    },
    title: {
      type: "string",
      description: "Short descriptive title for the card"
    },
    fields: {
      type: "object",
      description: "Extracted field values. Keys must match FIELD_SCHEMAS keys.",
      additionalProperties: { type: "string" }
    },
    tags: {
      type: "array",
      items: { type: "string" },
      description: "Suggested tags (e.g., production, staging, internal)"
    }
  },
  required: ["type", "title", "fields", "tags"],
  additionalProperties: false
};

export async function extractWithClaude(
  apiKey: string,
  rawText: string,
  targetType?: ItemType   // 카드 타입이 이미 선택된 경우
): Promise<ExtractionResult> {
  const systemPrompt = `You are a structured data extraction assistant for a developer's tool.
Extract server, database, or API connection information from the given text.

Field mappings by type:
- server: host, port(default 22), username, password, keyPath, note
- db: host, port(default 3306/5432), dbName, username, password, note
- api: url, method(default GET), apiKey, token, headers, note
- note/custom: content

Rules:
- Extract ONLY information explicitly present in the text
- Use empty string "" for fields not mentioned (do not guess)
- Preserve exact values without modification
- For port, use standard defaults only if type is clear but port is unspecified
${targetType ? `- The target card type is "${targetType}", extract fields for this type only` : '- Auto-detect the most appropriate type'}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: rawText }],
      output_config: {
        format: {
          type: "json_schema",
          schema: EXTRACTION_SCHEMA
        }
      }
    })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message ?? `API error: ${response.status}`);
  }

  const result = await response.json();
  const textBlock = result.content?.find(
    (b: { type: string }) => b.type === "text"
  );
  if (!textBlock) throw new Error("No text content in response");

  return JSON.parse(textBlock.text) as ExtractionResult;
}
```

#### 카드 타입별 JSON Schema 설계안

```typescript
// 타입별 전용 스키마 (targetType이 지정된 경우 사용)
export const TYPE_EXTRACTION_SCHEMAS: Record<ItemType, object> = {
  server: {
    type: "object",
    properties: {
      host:     { type: "string", description: "Hostname or IP address" },
      port:     { type: "string", description: "Port number, default '22'" },
      username: { type: "string", description: "Login username" },
      password: { type: "string", description: "Password if mentioned" },
      keyPath:  { type: "string", description: "SSH key path or key content" },
      note:     { type: "string", description: "Additional notes or context" },
    },
    required: ["host", "port", "username", "password", "keyPath", "note"],
    additionalProperties: false,
  },
  db: {
    type: "object",
    properties: {
      host:     { type: "string", description: "Database host" },
      port:     { type: "string", description: "Port (PostgreSQL:5432, MySQL:3306)" },
      dbName:   { type: "string", description: "Database name" },
      username: { type: "string", description: "Database user" },
      password: { type: "string", description: "Database password" },
      note:     { type: "string", description: "Additional notes" },
    },
    required: ["host", "port", "dbName", "username", "password", "note"],
    additionalProperties: false,
  },
  api: {
    type: "object",
    properties: {
      url:     { type: "string", description: "API endpoint URL" },
      method:  { type: "string", description: "HTTP method (GET/POST/PUT/DELETE)" },
      apiKey:  { type: "string", description: "API key if present" },
      token:   { type: "string", description: "Bearer/auth token if present" },
      headers: { type: "string", description: "Request headers as text" },
      note:    { type: "string", description: "Additional notes" },
    },
    required: ["url", "method", "apiKey", "token", "headers", "note"],
    additionalProperties: false,
  },
  note: {
    type: "object",
    properties: {
      content: { type: "string", description: "Full text content" },
    },
    required: ["content"],
    additionalProperties: false,
  },
  custom: {
    type: "object",
    properties: {
      content: { type: "string", description: "Full text content (markdown)" },
    },
    required: ["content"],
    additionalProperties: false,
  },
};
```

#### 브라우저에서의 API 호출 (SDK vs fetch)

| 방식 | 번들 크기 | 타입 안전성 | CORS |
|------|----------|-----------|------|
| `@anthropic-ai/sdk` | ~50KB gzipped | Zod 연동 가능 | `dangerouslyAllowBrowser: true` 필요 |
| `fetch` 직접 호출 | 0KB | 수동 타이핑 | `anthropic-dangerous-direct-browser-access` 헤더 |

> **권장: `fetch` 직접 호출** — dev-note는 최소 번들을 지향하며, API 호출 지점이 1곳뿐이므로 SDK 불필요

#### API 키 관리 방식

```typescript
// CryptoKey와 동일한 패턴: 메모리(Jotai atom)에만 유지
// store/atoms.ts
export const aiApiKeyAtom = atom<string | null>(null);

// 선택적: 사용자 동의 후 localStorage에 저장 (편의성)
// 설정 UI에서 "API 키 기억하기" 토글 제공
```

#### 비용 시뮬레이션 (Claude Haiku 4.5)

| 항목 | 토큰 수 | 비용 |
|------|---------|------|
| Input (프롬프트 + 스키마 + 텍스트) | ~500 | $0.0005 |
| Output (JSON 결과) | ~200 | $0.001 |
| **1건 합계** | ~700 | **~$0.0015** |
| 1,000건 합계 | - | ~$1.50 |
| 10,000건 합계 | - | ~$15.00 |

> 개인 개발자 사용 패턴(하루 5~10건)으로 월 $0.30 이하.

#### 대안 API 비교

| API | 모델 | Input 가격 | Output 가격 | Structured Output | 특이사항 |
|-----|------|-----------|-----------|-------------------|---------|
| **Claude Haiku 4.5** | claude-haiku-4-5 | $1/MTok | $5/MTok | O (GA) | CORS 브라우저 직접 호출 지원 |
| OpenAI GPT-4o mini | gpt-4o-mini | $0.15/MTok | $0.60/MTok | O (GA) | 가격 최저, CORS는 프록시 필요 |
| Google Gemini Flash | gemini-2.0-flash | 무료 tier | 무료 tier | O | generativelanguage API 직접 호출 |

> OpenAI/Gemini는 브라우저 직접 호출 시 CORS 제한이 있어 프록시가 필요할 수 있음.
> Claude API는 `anthropic-dangerous-direct-browser-access` 헤더로 CORS를 해결하므로 **SPA에서 가장 간편**.

---

## 3. 유사 구현 사례 조사

### 3-1. 오픈소스 레퍼런스

| 프로젝트 | 프레임워크 | 핵심 구현 | 링크 |
|----------|-----------|----------|------|
| **Microsoft Smart Components** | Blazor + TypeScript | 3단계 파이프라인 (필드발견→LLM추출→폼채우기) | [dotnet/smartcomponents](https://github.com/dotnet/smartcomponents) |
| **Bitovi AI Component Paste** | React + Next.js | Zod 스키마 동적 생성 → OpenAI 구조화 추출 | [@bitovi/ai-component-paste](https://www.npmjs.com/package/@bitovi/ai-component-paste) |
| **Smart Form Filler** | Chrome Extension | Ollama 로컬 모델 지원 (프라이버시 중심) | [hddevteam/smart-form-filler](https://github.com/hddevteam/smart-form-filler) |

### 3-2. Microsoft Smart Components 아키텍처 (가장 성숙한 레퍼런스)

**3단계 파이프라인:**

```
[1단계: 필드 발견]        [2단계: LLM 추출]         [3단계: 폼 채우기]
클라이언트 TypeScript  →  서버 C# (LLM 호출)  →  클라이언트 JavaScript

폼의 input/select/       JSON Schema 동적 구성      JSON 파싱 후
textarea 순회 →          → LLM에 전달 →             각 필드에 값 설정
필드명/타입 추론          구조화 JSON 응답 수신       + DOM 이벤트 트리거
```

**핵심 설계 원칙 (dev-note에 차용 가능):**
- 정보 없는 필드는 `null`로 두고 **기존 값을 유지** (빈 값과 "정보 없음" 구분 불가)
- DOM 이벤트(`beforeinput`, `input`, `change`)를 순서대로 발생시켜 프레임워크 바인딩 호환
- `Temperature=0`으로 결정론적 출력 보장

### 3-3. 상용 서비스 UX 패턴

| 제품 | 입력 방식 | 확인 플로우 | 특이 UX |
|------|----------|-----------|---------|
| **Power Apps Copilot** | Ctrl+V (필드 미선택 시) 또는 전용 버튼 | 인라인 제안 + Accept/Clear 각각 | 출처(citation) 표시, 피드백 버튼 |
| **Syncfusion Smart Paste** | 전용 버튼 클릭 | 즉시 적용 (미리보기 없음) | 버튼 disabled 로딩 |
| **Bitovi AI Paste** | 전용 버튼 | `onExtracted` 콜백으로 제어 | React 제어/비제어 폼 모두 지원 |

---

## 4. UX/UI 설계 방향

### 4-1. Smart Paste 입력 배치 및 인터랙션

**권장안: 전용 텍스트 영역 + 파싱 버튼 (패턴 C)**

dev-note는 React 제어 폼이므로, 전용 입력 영역이 가장 자연스럽다.

```
┌──────────────────────────────────────────────┐
│  [Smart Paste]                           [×] │
│  ┌────────────────────────────────────────┐  │
│  │ 여기에 접속 정보를 붙여넣으세요...      │  │
│  │                                        │  │
│  │ (텍스트 영역, 3~5줄 높이)               │  │
│  └────────────────────────────────────────┘  │
│  [✨ 자동 채우기]    [취소]                   │
├──────────────────────────────────────────────┤
│  ── 일반 필드 입력 (기존 UI 유지) ──         │
│  Host / IP:  [________________]              │
│  Port:       [____]                          │
│  Username:   [________________]              │
│  Password:   [________________]              │
│  ...                                         │
└──────────────────────────────────────────────┘
```

**트리거 방식:**
- CardDetailEditor 상단에 `[📋 Smart Paste]` 토글 버튼
- 클릭하면 텍스트 영역 펼침 (collapse/expand)
- 기본 상태: 접힘 (기존 UI에 영향 없음)

**대안 (경량):**
- CardFormModal (새 카드 생성) 하단에 "텍스트에서 자동 입력" 링크
- 클릭하면 textarea 모달/드로워 표시

### 4-2. AI 결과 미리보기 → 적용 플로우

```
[사용자가 텍스트 붙여넣기]
    ↓
[✨ 자동 채우기 버튼 클릭]
    ↓
[파싱 중... (스피너, 0.5~2초)]
    ↓
[미리보기 표시]
    ┌─────────────────────────────────────┐
    │  추출된 정보 미리보기                 │
    │                                     │
    │  Host:     10.0.1.50    ✓ [수정]    │
    │  Port:     22           ✓ [수정]    │
    │  Username: deploy       ✓ [수정]    │
    │  Password: (감지 안됨)   ─ [직접입력] │
    │  Key Path: ~/.ssh/de... ✓ [수정]    │
    │                                     │
    │  [모두 적용]  [취소]                 │
    └─────────────────────────────────────┘
    ↓
[모두 적용 → 각 필드에 값 설정 + dirty 표시]
```

**미리보기 상태 표시:**
- ✓ (초록): 값이 추출됨
- ─ (회색): 해당 필드 정보 없음 (기존 값 유지)
- ⚠ (노랑): 불확실한 추출 (Tier 1 정규식의 `confidence: 'medium'`)

### 4-3. 로딩, 에러, 엣지케이스 처리

| 상황 | UX 처리 |
|------|---------|
| 파싱 중 | 버튼 → 스피너 + "분석 중..." 텍스트, 텍스트 영역 readonly |
| 파싱 성공 (전체) | 미리보기 표시 → "모두 적용" |
| 파싱 성공 (부분) | 추출된 필드만 표시, 나머지 "감지 안됨" |
| 파싱 실패 (형식 인식 불가) | "인식 가능한 정보를 찾지 못했습니다" + 직접 입력 안내 |
| API 오류 (Tier 3) | "AI 서비스 연결 실패. 수동으로 입력해주세요." + retry |
| 빈 텍스트 | "붙여넣기할 텍스트를 입력해주세요" (버튼 비활성) |
| 매우 긴 텍스트 (>5000자) | 앞 2000자만 사용 + "텍스트가 너무 깁니다" 경고 |

### 4-4. 민감 데이터 처리 주의사항

| 항목 | 처리 방안 |
|------|----------|
| Password 필드 | 미리보기에서 `••••••••` 마스킹, 호버 시 토글 |
| API Key / Token | 동일 마스킹 처리 |
| Tier 3 API 전송 시 | 경고 표시: "입력된 텍스트가 AI 서비스로 전송됩니다" |
| Tier 1 (로컬) | 데이터가 브라우저를 떠나지 않으므로 추가 경고 불필요 |
| 클립보드 접근 | `navigator.clipboard.readText()` 사용 시 권한 요청 필요 |

> **Tier 3 사용 시 필수 UX:**
> Smart Paste 텍스트 영역 하단에 "AI 분석 시 텍스트가 외부 서버로 전송됩니다" 고지문 표시

---

## 5. 구현 난이도 및 예상 작업량

### 5-1. 난이도 평가

| 항목 | Tier 1 (정규식) | Tier 3 (Claude API) |
|------|----------------|-------------------|
| 파서 로직 | **중** (타입별 정규식 작성 + 테스트) | **하** (프롬프트 + 스키마만) |
| UI 컴포넌트 | **중** (토글, 텍스트영역, 미리보기) | 동일 |
| 상태 관리 | **하** (useState로 충분) | **하** (+ API 키 atom 1개) |
| 보안 고려 | **하** (로컬 전용) | **중** (API 키 관리, 전송 경고) |
| 테스트 | **중** (다양한 입력 패턴 테스트) | **하** (모킹으로 간단) |
| **전체 난이도** | **중** | **중** |

### 5-2. 단계별 구현 순서

#### Phase 1: MVP — Tier 1 정규식 파서 (권장 먼저)

```
SubTask 1: 파서 모듈 구현 (src/core/smart-paste.ts)
  - 타입별 정규식 파서 함수 (parseServerText, parseDBText, parseAPIText)
  - 타입 자동 감지 함수 (detectCardType)
  - 파싱 결과 타입 정의 (ParseResult: { fields, confidence })

SubTask 2: Smart Paste UI 컴포넌트
  - SmartPastePanel 컴포넌트 (토글 가능한 텍스트 영역 + 파싱 버튼)
  - 미리보기 UI (추출된 필드 목록 + 적용/취소)

SubTask 3: CardDetailEditor / CardFormModal 통합
  - SmartPastePanel 마운트
  - "적용" 시 기존 필드 상태 업데이트 로직
  - dirty 상태 처리

SubTask 4: 테스트 및 엣지케이스 처리
  - 다양한 입력 패턴 테스트 (SSH config, DB URI, curl 등)
  - 빈 입력, 긴 입력, 혼합 형식 등 엣지케이스
```

#### Phase 2: 고도화 — Tier 3 Claude API (사용자 동의 후)

```
SubTask 5: AI 추출 모듈 (src/core/ai-extract.ts)
  - Claude API fetch 래퍼
  - 카드 타입별 스키마 정의
  - 에러 핸들링 (네트워크, API 오류, 토큰 초과)

SubTask 6: API 키 관리 UI
  - Settings에 "AI Smart Paste" 섹션 추가
  - API 키 입력/저장/삭제 UI
  - aiApiKeyAtom (store/atoms.ts)

SubTask 7: SmartPastePanel에 AI 모드 통합
  - Tier 1 실패 시 "AI로 분석하기" 폴백 버튼
  - 또는 토글로 "정규식 모드 / AI 모드" 전환
  - 전송 경고 UX

SubTask 8: CLAUDE.md 규칙 업데이트
  - "외부 API 호출 금지" → "사용자가 명시적으로 활성화한 BYOK AI 기능 제외"
```

### 5-3. 예상 리스크 및 대응

| 리스크 | 확률 | 영향 | 대응 |
|--------|------|------|------|
| Tier 1 정규식이 다양한 형식을 커버하지 못함 | 높음 | 중 | 사용자 피드백으로 패턴 점진적 추가 |
| Claude API CORS 정책 변경 | 낮음 | 높음 | fetch → 프록시 전환, 또는 `@anthropic-ai/sdk` 사용 |
| 사용자가 API 키를 잘못 입력 | 중 | 하 | 키 검증 API 호출 (`GET /v1/messages` with test) |
| 민감 데이터가 AI로 전송되는 것에 대한 거부감 | 중 | 중 | Tier 1(로컬) 기본값, Tier 3은 명시적 옵트인 |
| CardDetailEditor가 CodeMirror 기반이라 필드 직접 설정 불가 | 높음 | 중 | CodeMirror dispatch로 텍스트 교체 |

#### CodeMirror 필드 설정 관련 참고

현재 `CardDetailEditor`는 CodeMirror 에디터를 사용하여 전체 콘텐츠를 편집한다.
Smart Paste로 추출된 필드를 CodeMirror에 반영하려면:

```typescript
// CodeMirror 에디터에 텍스트 설정
if (editorViewRef.current) {
  const view = editorViewRef.current;
  view.dispatch({
    changes: {
      from: 0,
      to: view.state.doc.length,
      insert: newText  // "Host: 10.0.1.50\nPort: 22\nUsername: deploy\n..."
    }
  });
}
```

또는 개별 필드 폼 방식으로 전환 시 (StructuredContent fields 직접 조작):

```typescript
// StructuredContent fields 배열에 직접 값 설정
const updatedFields = FIELD_SCHEMAS[type].map(schema => ({
  key: schema.key,
  label: schema.label,
  value: extractedFields[schema.key] ?? '',
  type: schema.type,
}));
```

---

## 6. 최종 권고안

### 6-1. 구현 권장 여부: **권장 (조건부)**

| 판단 기준 | 결과 |
|----------|------|
| 프로젝트 목적 부합도 | ✅ 매우 높음 — 핵심 사용 시나리오 |
| 기술적 구현 가능성 | ✅ 가능 — Tier 1은 추가 의존성 없음 |
| 프로젝트 규칙 준수 | ⚠️ Tier 1만 준수, Tier 3은 규칙 수정 필요 |
| 사용자 가치 | ✅ 높음 — 필드 5~6개 수동 입력 → 1회 붙여넣기 |
| 구현 복잡도 | ✅ 중간 — MVP 4개 SubTask로 충분 |

### 6-2. 권장 기술 스택

```
Phase 1 (MVP, 규칙 준수):
  ├── 파서: 순수 TypeScript 정규식 (추가 의존성 0)
  ├── UI: React 컴포넌트 (Tailwind CSS v4)
  ├── 상태: useState (로컬), Jotai atom 추가 없음
  └── 대상: Server, DB, API 타입 (Note/Custom은 전체 텍스트 삽입)

Phase 2 (선택적, 규칙 수정 후):
  ├── AI: Claude Haiku 4.5 (fetch 직접 호출, SDK 미사용)
  ├── 인증: BYOK (사용자 API 키 직접 입력)
  ├── 키 관리: aiApiKeyAtom (메모리) + 선택적 localStorage
  ├── 스키마: output_config.format (Structured Outputs)
  └── 비용: ~$0.0015/건, 월 $0.30 이하 (개인 사용)
```

### 6-3. 핵심 Pseudocode (Tier 1 MVP)

```typescript
// src/core/smart-paste.ts

import { FIELD_SCHEMAS } from './types';
import type { ItemType } from './db';

export interface ParsedField {
  key: string;
  value: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface SmartPasteResult {
  detectedType: ItemType | null;
  fields: ParsedField[];
  unmatchedText: string;  // 파싱되지 않은 나머지 텍스트
}

/** 텍스트에서 카드 타입 자동 감지 */
export function detectCardType(text: string): ItemType | null {
  // DB URI 패턴 우선 (postgres://, mysql:// 등)
  if (/\b(postgres|mysql|mariadb|mongodb|redis|mssql):\/\//i.test(text)) return 'db';
  if (/jdbc:\w+:\/\//i.test(text)) return 'db';
  if (/\b(Database|Initial Catalog|dbname)\s*=/i.test(text)) return 'db';

  // API 패턴 (curl, HTTP URL + method)
  if (/\bcurl\s+/i.test(text)) return 'api';
  if (/https?:\/\/.*\bapi\b/i.test(text)) return 'api';
  if (/\b(api[_-]?key|bearer|authorization)\s*[:=]/i.test(text)) return 'api';

  // Server 패턴 (SSH config, user@host)
  if (/^\s*Host\s+\S+/m.test(text)) return 'server';
  if (/\w+@[\w.\-]+(?::\d+)?/.test(text)) return 'server';
  if (/\bssh\s+/i.test(text)) return 'server';

  return null;  // 자동 감지 실패 → 사용자 선택
}

/** 텍스트에서 필드 추출 (타입별 파서 실행) */
export function smartParse(text: string, type: ItemType): SmartPasteResult {
  const schemas = FIELD_SCHEMAS[type];
  const fields: ParsedField[] = [];

  // 타입별 파서 실행
  switch (type) {
    case 'server': parseServerFields(text, fields); break;
    case 'db':     parseDBFields(text, fields); break;
    case 'api':    parseAPIFields(text, fields); break;
    case 'note':
    case 'custom':
      fields.push({ key: 'content', value: text.trim(), confidence: 'high' });
      break;
  }

  // 스키마에 정의된 필드 중 미추출 필드는 빈 값으로 채우기
  for (const schema of schemas) {
    if (!fields.some(f => f.key === schema.key)) {
      fields.push({ key: schema.key, value: '', confidence: 'low' });
    }
  }

  return {
    detectedType: type,
    fields,
    unmatchedText: '',  // 향후 구현
  };
}

function parseServerFields(text: string, fields: ParsedField[]): void {
  // 1. SSH config 블록
  const hostName = text.match(/^\s*HostName\s+(\S+)/m);
  const user = text.match(/^\s*User\s+(\S+)/m);
  const port = text.match(/^\s*Port\s+(\d+)/m);
  const identity = text.match(/^\s*IdentityFile\s+(.+)/m);

  if (hostName) {
    fields.push({ key: 'host', value: hostName[1], confidence: 'high' });
    if (user) fields.push({ key: 'username', value: user[1], confidence: 'high' });
    if (port) fields.push({ key: 'port', value: port[1], confidence: 'high' });
    if (identity) fields.push({ key: 'keyPath', value: identity[1].trim(), confidence: 'high' });
    return;
  }

  // 2. user@host:port 패턴
  const sshConnect = text.match(/(\w[\w.-]*)@([\w.\-]+)(?::(\d{1,5}))?/);
  if (sshConnect) {
    fields.push({ key: 'username', value: sshConnect[1], confidence: 'high' });
    fields.push({ key: 'host', value: sshConnect[2], confidence: 'high' });
    if (sshConnect[3]) fields.push({ key: 'port', value: sshConnect[3], confidence: 'high' });
  }

  // 3. 한글/영문 라벨 매칭
  const labelPatterns: [string, RegExp][] = [
    ['host', /(?:호스트|host|ip|서버)\s*[:：=]\s*(\S+)/i],
    ['port', /(?:포트|port)\s*[:：=]\s*(\d+)/i],
    ['username', /(?:계정|사용자|유저|아이디|user(?:name)?)\s*[:：=]\s*(\S+)/i],
    ['password', /(?:비밀번호|패스워드|비번|pass(?:word)?)\s*[:：=]\s*(\S+)/i],
  ];

  for (const [key, pattern] of labelPatterns) {
    if (fields.some(f => f.key === key)) continue;  // 이미 추출됨
    const match = text.match(pattern);
    if (match) fields.push({ key, value: match[1], confidence: 'high' });
  }
}

function parseDBFields(text: string, fields: ParsedField[]): void {
  // 1. URI 형식
  const uri = text.match(
    /(postgres(?:ql)?|mysql|mariadb|mongodb|redis|mssql):\/\/(?:([^:@]+)(?::([^@]+))?@)?([\w.\-]+)(?::(\d+))?\/?(\w+)?/i
  );
  if (uri) {
    fields.push({ key: 'host', value: uri[4], confidence: 'high' });
    if (uri[5]) fields.push({ key: 'port', value: uri[5], confidence: 'high' });
    if (uri[6]) fields.push({ key: 'dbName', value: uri[6], confidence: 'high' });
    if (uri[2]) fields.push({ key: 'username', value: uri[2], confidence: 'high' });
    if (uri[3]) fields.push({ key: 'password', value: uri[3], confidence: 'high' });
    return;
  }

  // 2. Key=Value 형식
  const kvPatterns: [string, RegExp][] = [
    ['host', /(?:Host|Server|Data Source)\s*=\s*([^;\n]+)/i],
    ['port', /Port\s*=\s*(\d+)/i],
    ['dbName', /(?:Database|Initial Catalog|dbname)\s*=\s*([^;\n]+)/i],
    ['username', /(?:User(?:name)?|User Id|UID)\s*=\s*([^;\n]+)/i],
    ['password', /(?:Password|PWD)\s*=\s*([^;\n]+)/i],
  ];

  for (const [key, pattern] of kvPatterns) {
    const match = text.match(pattern);
    if (match) fields.push({ key, value: match[1].trim(), confidence: 'high' });
  }

  // 3. 한글 라벨 (Server 파서와 유사)
  const labelPatterns: [string, RegExp][] = [
    ['host', /(?:호스트|host|서버)\s*[:：=]\s*(\S+)/i],
    ['port', /(?:포트|port)\s*[:：=]\s*(\d+)/i],
    ['dbName', /(?:데이터베이스|DB명?|database)\s*[:：=]\s*(\S+)/i],
    ['username', /(?:계정|사용자|user(?:name)?)\s*[:：=]\s*(\S+)/i],
    ['password', /(?:비밀번호|패스워드|비번|pass(?:word)?)\s*[:：=]\s*(\S+)/i],
  ];

  for (const [key, pattern] of labelPatterns) {
    if (fields.some(f => f.key === key)) continue;
    const match = text.match(pattern);
    if (match) fields.push({ key, value: match[1], confidence: 'high' });
  }
}

function parseAPIFields(text: string, fields: ParsedField[]): void {
  // 1. URL 추출
  const url = text.match(/https?:\/\/[^\s<>"{}|\\^`\[\]]+/i);
  if (url) fields.push({ key: 'url', value: url[0], confidence: 'high' });

  // 2. curl -X METHOD
  const curlMethod = text.match(/curl\s+.*?-X\s+(GET|POST|PUT|PATCH|DELETE)/i);
  if (curlMethod) {
    fields.push({ key: 'method', value: curlMethod[1].toUpperCase(), confidence: 'high' });
  } else {
    const method = text.match(/\b(GET|POST|PUT|PATCH|DELETE)\b/);
    if (method) fields.push({ key: 'method', value: method[1], confidence: 'medium' });
  }

  // 3. Bearer 토큰
  const bearer = text.match(/(?:Bearer|Authorization)\s*[:=]?\s*["']?([A-Za-z0-9\-_.~+/=]{20,})["']?/i);
  if (bearer) fields.push({ key: 'token', value: bearer[1], confidence: 'high' });

  // 4. API Key
  const apiKey = text.match(/(?:api[_-]?key|x-api-key)\s*[:=]\s*["']?([^\s"']+)["']?/i);
  if (apiKey) fields.push({ key: 'apiKey', value: apiKey[1], confidence: 'high' });

  // 5. curl 헤더 추출
  const headers: string[] = [];
  const headerMatches = text.matchAll(/-H\s+['"]([^'"]+)['"]/gi);
  for (const m of headerMatches) {
    if (!/^Authorization/i.test(m[1])) {  // Bearer는 token으로 이미 추출
      headers.push(m[1]);
    }
  }
  if (headers.length > 0) {
    fields.push({ key: 'headers', value: headers.join('\n'), confidence: 'high' });
  }
}
```

### 6-4. 구현 진입 시 참고 파일 목록

| 파일 | 역할 | Smart Paste 관련 수정 |
|------|------|---------------------|
| `src/core/types.ts` | FIELD_SCHEMAS 정의 | 참조만 (수정 없음) |
| `src/core/content.ts` | parseContent, serializeContent | 참조만 |
| `src/features/cards/CardDetailEditor.tsx` | 카드 편집 뷰 | SmartPastePanel 마운트 |
| `src/features/cards/CardFormModal.tsx` | 카드 생성 모달 | SmartPastePanel 마운트 (선택적) |
| `src/store/atoms.ts` | Jotai atoms | aiApiKeyAtom 추가 (Tier 3) |

| 새로 생성할 파일 | 역할 |
|----------------|------|
| `src/core/smart-paste.ts` | 정규식 파서 + 타입 감지 로직 |
| `src/features/cards/SmartPastePanel.tsx` | UI 컴포넌트 |
| `src/core/ai-extract.ts` | Claude API 연동 (Tier 3, 선택적) |

---

## 부록: 참고 자료

### 오픈소스
- [dotnet/smartcomponents](https://github.com/dotnet/smartcomponents) — Microsoft Smart Paste 레퍼런스
- [@bitovi/ai-component-paste](https://www.npmjs.com/package/@bitovi/ai-component-paste) — React Smart Paste
- [hddevteam/smart-form-filler](https://github.com/hddevteam/smart-form-filler) — Ollama 로컬 LLM 지원

### 상용 서비스
- [Microsoft Power Apps Smart Paste](https://learn.microsoft.com/en-us/power-apps/user/form-filling-assistance)
- [Syncfusion Smart Paste Button](https://ej2.syncfusion.com/react/documentation/smart-paste-button/getting-started)

### Claude API
- [Structured Outputs (GA)](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- [Pricing](https://platform.claude.com/docs/en/about-claude/pricing) — Haiku 4.5: $1/$5 per MTok
- [CORS 브라우저 호출](https://simonwillison.net/2024/Aug/23/anthropic-dangerous-direct-browser-access/)

### 브라우저 LLM
- [WebLLM](https://github.com/mlc-ai/web-llm) — WebGPU 가속 (Firefox 미지원 주의)
- [Transformers.js](https://huggingface.co/docs/transformers.js/index) — ONNX 모델 브라우저 실행
