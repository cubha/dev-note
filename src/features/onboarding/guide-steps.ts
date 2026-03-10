// src/features/onboarding/guide-steps.ts
//
// 사용 가이드 슬라이드 데이터

export interface GuideStep {
  title: string
  description: string
  icon: 'cards' | 'folders' | 'search' | 'editor' | 'export' | 'ai'
  tips: string[]
}

export const GUIDE_STEPS: GuideStep[] = [
  {
    title: '카드 기반 정보 관리',
    description:
      '5종 카드 타입으로 서버, DB, API, 메모, 문서를 체계적으로 관리하세요.',
    icon: 'cards',
    tips: ['Ctrl+N으로 새 카드 생성', '카드 클릭으로 상세 보기'],
  },
  {
    title: '폴더 & 태그 정리',
    description:
      '폴더 트리로 계층 구조를, 태그로 횡단 분류를 지원합니다.',
    icon: 'folders',
    tips: ['드래그로 순서 변경', '우클릭으로 이름 변경/삭제'],
  },
  {
    title: '강력한 검색',
    description:
      '제목, 태그, 콘텐츠를 포함한 키워드 검색으로 원하는 정보를 빠르게 찾으세요.',
    icon: 'search',
    tips: ['Ctrl+K로 검색 포커스', '타입/태그 필터 조합 가능'],
  },
  {
    title: '전문 에디터',
    description:
      'CodeMirror 기반 코드 에디터와 Markdown 미리보기를 지원합니다.',
    icon: 'editor',
    tips: ['Ctrl+S로 저장', 'Document 카드는 섹션별 편집 가능'],
  },
  {
    title: '백업 & 내보내기',
    description:
      'JSON 파일로 데이터를 내보내고 가져올 수 있습니다. 주기적 백업을 권장합니다.',
    icon: 'export',
    tips: ['설정에서 내보내기/가져오기', 'File System Access API 지원'],
  },
]
