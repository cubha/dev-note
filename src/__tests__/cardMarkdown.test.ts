import { describe, it, expect } from 'vitest'
import { cardToMarkdown } from '../core/cardMarkdown'
import type { Item } from '../core/db'
import type { CardContent } from '../core/types'

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 1, folderId: null, title: '테스트 카드', type: 'server', tags: ['aws', '운영'],
    order: 0, pinned: false, content: '{}', updatedAt: 0, createdAt: 0,
    ...overrides,
  }
}

describe('cardToMarkdown — legacy', () => {
  it('제목 + 원문 텍스트를 그대로 담는다', () => {
    const content: CardContent = { format: 'legacy', text: '자유 메모 내용' }
    const md = cardToMarkdown(makeItem({ type: 'note' }), content)
    expect(md).toContain('테스트 카드')
    expect(md).toContain('자유 메모 내용')
  })
})

describe('cardToMarkdown — structured', () => {
  it('일반 필드는 포함하고 password 필드는 제외한다', () => {
    const content: CardContent = {
      format: 'structured',
      fields: [
        { key: 'host', label: 'Host', value: '10.0.0.1', type: 'text' },
        { key: 'password', label: 'Password', value: 'supersecret', type: 'password' },
      ],
    }
    const md = cardToMarkdown(makeItem(), content)
    expect(md).toContain('10.0.0.1')
    expect(md).not.toContain('supersecret')
  })

  it('빈 값 필드는 렌더하지 않는다', () => {
    const content: CardContent = {
      format: 'structured',
      fields: [{ key: 'note', label: '비고', value: '', type: 'multiline' }],
    }
    const md = cardToMarkdown(makeItem(), content)
    expect(md).not.toContain('비고')
  })

  it('태그를 포함한다', () => {
    const content: CardContent = { format: 'structured', fields: [] }
    const md = cardToMarkdown(makeItem({ tags: ['aws', '운영'] }), content)
    expect(md).toContain('aws')
    expect(md).toContain('운영')
  })

  it('multiline 필드는 불릿 한 줄이 아니라 제목+본문 블록으로 렌더한다(개행 보존, 리스트 깨짐 방지)', () => {
    const content: CardContent = {
      format: 'structured',
      fields: [{ key: 'content', label: '내용', value: '첫 줄\n\n둘째 문단', type: 'multiline' }],
    }
    const md = cardToMarkdown(makeItem({ type: 'note' }), content)
    expect(md).not.toContain('- **내용**:')
    expect(md).toContain('**내용**')
    expect(md).toContain('첫 줄\n\n둘째 문단')
  })

  it('single-line 필드는 기존처럼 불릿 한 줄로 렌더한다', () => {
    const content: CardContent = {
      format: 'structured',
      fields: [{ key: 'host', label: 'Host', value: '10.0.0.1', type: 'text' }],
    }
    const md = cardToMarkdown(makeItem(), content)
    expect(md).toContain('- **Host**: 10.0.0.1')
  })
})

describe('cardToMarkdown — hybrid: markdown 섹션', () => {
  it('섹션 텍스트를 포함한다', () => {
    const content: CardContent = {
      format: 'hybrid',
      sections: [{ id: 's1', type: 'markdown', title: '메모', collapsed: false, text: '본문 내용' }],
    }
    const md = cardToMarkdown(makeItem({ type: 'document' }), content)
    expect(md).toContain('본문 내용')
  })
})

describe('cardToMarkdown — hybrid: credentials 섹션', () => {
  it('host/username은 포함, password는 제외한다', () => {
    const content: CardContent = {
      format: 'hybrid',
      sections: [{
        id: 's1', type: 'credentials', title: '접속', collapsed: false,
        items: [{ id: 'c1', label: '운영서버', category: 'server', host: '10.0.0.1', port: '22', username: 'admin', password: 'topsecret', extra: '' }],
      }],
    }
    const md = cardToMarkdown(makeItem({ type: 'document' }), content)
    expect(md).toContain('10.0.0.1')
    expect(md).toContain('admin')
    expect(md).not.toContain('topsecret')
  })
})

describe('cardToMarkdown — hybrid: urls 섹션', () => {
  it('label/url을 포함한다', () => {
    const content: CardContent = {
      format: 'hybrid',
      sections: [{
        id: 's1', type: 'urls', title: '링크', collapsed: false,
        items: [{ id: 'u1', label: '관리자', url: 'https://example.com', note: '' }],
      }],
    }
    const md = cardToMarkdown(makeItem({ type: 'document' }), content)
    expect(md).toContain('https://example.com')
    expect(md).toContain('관리자')
  })
})

describe('cardToMarkdown — hybrid: env 섹션', () => {
  it('일반 key=value는 포함, secret 값은 마스킹한다', () => {
    const content: CardContent = {
      format: 'hybrid',
      sections: [{
        id: 's1', type: 'env', title: '환경변수', collapsed: false,
        pairs: [
          { id: 'e1', key: 'NODE_ENV', value: 'production', secret: false },
          { id: 'e2', key: 'API_SECRET', value: 'sk-verysecret', secret: true },
        ],
      }],
    }
    const md = cardToMarkdown(makeItem({ type: 'document' }), content)
    expect(md).toContain('NODE_ENV=production')
    expect(md).toContain('API_SECRET')
    expect(md).not.toContain('sk-verysecret')
  })
})

describe('cardToMarkdown — hybrid: code 섹션', () => {
  it('언어와 코드를 펜스 블록으로 포함한다', () => {
    const content: CardContent = {
      format: 'hybrid',
      sections: [{ id: 's1', type: 'code', title: '배포 스크립트', collapsed: false, language: 'bash', code: 'echo hello' }],
    }
    const md = cardToMarkdown(makeItem({ type: 'document' }), content)
    expect(md).toContain('```bash')
    expect(md).toContain('echo hello')
  })
})

describe('cardToMarkdown — 잠금(암호화) 카드는 이 함수 호출 전에 걸러진다는 전제', () => {
  it('평문 CardContent만 받으므로 암호문 관련 처리는 하지 않는다(계약 문서화용)', () => {
    const content: CardContent = { format: 'legacy', text: '평문' }
    expect(() => cardToMarkdown(makeItem(), content)).not.toThrow()
  })
})
