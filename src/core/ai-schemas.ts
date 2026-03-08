// src/core/ai-schemas.ts
//
// Claude API Structured Outputs용 JSON Schema 정의
// - SMART_PASTE_SCHEMA: 텍스트 → 카드 필드 추출 + 타입 감지

/** Smart Paste 응답 JSON Schema (constrained decoding) */
export const SMART_PASTE_SCHEMA = {
  type: 'object' as const,
  properties: {
    detectedType: {
      type: 'string' as const,
      enum: ['server', 'db', 'api', 'note', 'custom', 'document'],
      description: '입력 텍스트에서 감지된 카드 타입',
    },
    title: {
      type: 'string' as const,
      description: '카드 제목 (자동 생성, 20자 이내)',
    },
    fields: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          key:   { type: 'string' as const, description: 'FIELD_SCHEMAS에 정의된 필드 키' },
          value: { type: 'string' as const, description: '추출된 값, 없으면 빈 문자열' },
        },
        required: ['key', 'value'] as const,
        additionalProperties: false,
      },
      description: '카드 타입에 맞는 필드-값 쌍 배열',
    },
    suggestedTags: {
      type: 'array' as const,
      items: { type: 'string' as const },
      description: '추천 태그 (production, staging, mysql 등)',
    },
    confidence: {
      type: 'string' as const,
      enum: ['high', 'medium', 'low'],
      description: '추출 신뢰도',
    },
  },
  required: ['detectedType', 'title', 'fields', 'suggestedTags', 'confidence'] as const,
  additionalProperties: false,
}

/** 자연어 쿼리 → 구조화 검색 조건 JSON Schema */
export const NATURAL_QUERY_SCHEMA = {
  type: 'object' as const,
  properties: {
    searchTerms: {
      type: 'array' as const,
      items: { type: 'string' as const },
      description: '검색 키워드 배열 (Fuse.js에 전달할 텍스트)',
    },
    typeFilter: {
      type: 'string' as const,
      enum: ['server', 'db', 'api', 'note', 'custom', 'document', ''],
      description: '카드 타입 필터, 해당 없으면 빈 문자열',
    },
    tagFilter: {
      type: 'string' as const,
      description: '태그 필터, 해당 없으면 빈 문자열',
    },
  },
  required: ['searchTerms', 'typeFilter', 'tagFilter'] as const,
  additionalProperties: false,
}

/** Document Smart Paste — 자유형 텍스트 → HybridContent sections */
export const DOCUMENT_PASTE_SCHEMA = {
  type: 'object' as const,
  properties: {
    title: {
      type: 'string' as const,
      description: '문서 제목 (자동 생성, 30자 이내)',
    },
    suggestedTags: {
      type: 'array' as const,
      items: { type: 'string' as const },
      description: '추천 태그',
    },
    sections: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          type: {
            type: 'string' as const,
            enum: ['markdown', 'credentials', 'urls', 'env', 'code'],
            description: '섹션 타입',
          },
          title: {
            type: 'string' as const,
            description: '섹션 제목',
          },
          content: {
            type: 'string' as const,
            description: '섹션 내용 (JSON string — 타입별 구조화 데이터)',
          },
        },
        required: ['type', 'title', 'content'] as const,
        additionalProperties: false,
      },
      description: '구조화된 섹션 배열',
    },
    confidence: {
      type: 'string' as const,
      enum: ['high', 'medium', 'low'],
      description: '구조화 신뢰도',
    },
  },
  required: ['title', 'suggestedTags', 'sections', 'confidence'] as const,
  additionalProperties: false,
}

/** 콘텐츠 요약 JSON Schema */
export const SUMMARY_SCHEMA = {
  type: 'object' as const,
  properties: {
    summary: {
      type: 'string' as const,
      description: '카드 콘텐츠의 한글 요약 (2-3문장)',
    },
    keyPoints: {
      type: 'array' as const,
      items: { type: 'string' as const },
      description: '핵심 포인트 목록 (최대 5개)',
    },
  },
  required: ['summary', 'keyPoints'] as const,
  additionalProperties: false,
}
