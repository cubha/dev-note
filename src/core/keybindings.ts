// ================================================================
// keybindings.ts — 키바인딩 시스템 코어 타입/상수/유틸리티
// ================================================================

// ─── 타입 정의 ────────────────────────────────────────────────

export type CommandId =
  | 'card.new'
  | 'folder.new'
  | 'tab.close'
  | 'search.focus'
  | 'card.save'
  | 'escape.clear'
  | 'selection.delete'
  | 'editor.indent'
  | 'editor.outdent'
  | 'editor.deleteLine'
  | 'editor.toggleComment'
  | 'editor.moveLineUp'
  | 'editor.moveLineDown'
  | 'editor.copyLineDown';

export interface KeybindingDef {
  label: string;
  defaultKey: string;
  category: string;
}

export type UserOverrides = Record<string, { userKey: string | null; enabled: boolean }>;

// ─── 기본 키바인딩 상수 ────────────────────────────────────────

export const DEFAULT_KEYBINDINGS: Record<CommandId, KeybindingDef> = {
  'card.new': {
    label: '새 카드 생성',
    defaultKey: 'Mod+Alt+N',
    category: 'card',
  },
  'folder.new': {
    label: '새 폴더 생성',
    defaultKey: 'Mod+Alt+F',
    category: 'folder',
  },
  'tab.close': {
    label: '현재 탭 닫기',
    defaultKey: 'Mod+Alt+W',
    category: 'tab',
  },
  'search.focus': {
    label: '검색 포커스',
    defaultKey: 'Mod+K',
    category: 'search',
  },
  'card.save': {
    label: '카드 저장',
    defaultKey: 'Mod+S',
    category: 'card',
  },
  'escape.clear': {
    label: '선택 해제',
    defaultKey: 'Escape',
    category: 'ui',
  },
  'selection.delete': {
    label: '선택 항목 삭제',
    defaultKey: 'Delete',
    category: 'ui',
  },
  'editor.indent': {
    label: '들여쓰기',
    defaultKey: 'Mod+]',
    category: 'editor',
  },
  'editor.outdent': {
    label: '내어쓰기',
    defaultKey: 'Mod+[',
    category: 'editor',
  },
  'editor.deleteLine': {
    label: '줄 삭제',
    defaultKey: 'Shift+Mod+K',
    category: 'editor',
  },
  'editor.toggleComment': {
    label: '줄 주석 토글',
    defaultKey: 'Mod+/',
    category: 'editor',
  },
  'editor.moveLineUp': {
    label: '줄 위로 이동',
    defaultKey: 'Alt+ArrowUp',
    category: 'editor',
  },
  'editor.moveLineDown': {
    label: '줄 아래로 이동',
    defaultKey: 'Alt+ArrowDown',
    category: 'editor',
  },
  'editor.copyLineDown': {
    label: '줄 아래로 복사',
    defaultKey: 'Shift+Alt+ArrowDown',
    category: 'editor',
  },
};

// ─── 브라우저 예약 키 ──────────────────────────────────────────

export const BROWSER_RESERVED: Set<string> = new Set([
  'Mod+N',
  'Mod+T',
  'Mod+W',
  'Mod+R',
  'Mod+Shift+N',
  'Mod+Shift+T',
  'Mod+Shift+I',
  'Mod+Shift+J',
  'Mod+Tab',
  'F5',
  'F12',
]);

export const BROWSER_WARN: Set<string> = new Set([
  'Mod+F',
  'Mod+P',
  'Mod+D',
  'Mod+J',
  'Mod+L',
]);

// ─── validateKeybinding ───────────────────────────────────────

type ValidateResult =
  | { status: 'blocked'; message: string }
  | { status: 'warn'; message: string }
  | { status: 'conflict'; message: string; conflictId: string }
  | { status: 'ok' };

export function validateKeybinding(
  key: string,
  commandId: string,
  currentBindings: Record<string, string>,
): ValidateResult {
  if (BROWSER_RESERVED.has(key)) {
    return {
      status: 'blocked',
      message: `'${key}'는 브라우저가 예약한 단축키입니다. 다른 키를 선택해주세요.`,
    };
  }

  if (BROWSER_WARN.has(key)) {
    return {
      status: 'warn',
      message: `'${key}'는 일부 브라우저에서 기본 동작과 충돌할 수 있습니다.`,
    };
  }

  for (const [existingCommandId, existingKey] of Object.entries(currentBindings)) {
    if (existingKey === key && existingCommandId !== commandId) {
      return {
        status: 'conflict',
        message: `'${key}'는 이미 '${existingCommandId}' 명령에 할당되어 있습니다.`,
        conflictId: existingCommandId,
      };
    }
  }

  return { status: 'ok' };
}

// ─── suggestAlternatives ──────────────────────────────────────

export function suggestAlternatives(
  key: string,
  currentBindings: Record<string, string>,
): string[] {
  const usedKeys = new Set(Object.values(currentBindings));

  // 원본 키에서 기본 키 추출 (마지막 토큰)
  const parts = key.split('+');
  const baseKey = parts[parts.length - 1];
  const hasShift = parts.includes('Shift');
  const hasAlt = parts.includes('Alt');
  const hasMod = parts.includes('Mod');

  const candidates: string[] = [];

  // Alt 추가 변형
  if (!hasAlt) {
    const altVariant = hasMod
      ? `Mod+Alt+${baseKey}`
      : `Alt+${baseKey}`;
    candidates.push(altVariant);
  }

  // Shift 추가 변형
  if (!hasShift) {
    const shiftVariant = hasMod
      ? `Mod+Shift+${baseKey}`
      : `Shift+${baseKey}`;
    candidates.push(shiftVariant);
  }

  // Alt+Shift 추가 변형
  if (!hasAlt || !hasShift) {
    const altShiftVariant = hasMod
      ? `Mod+Alt+Shift+${baseKey}`
      : `Alt+Shift+${baseKey}`;
    candidates.push(altShiftVariant);
  }

  // Mod 추가 변형 (Mod 없는 경우)
  if (!hasMod) {
    candidates.push(`Mod+${baseKey}`);
  }

  const result: string[] = [];
  for (const candidate of candidates) {
    if (
      !BROWSER_RESERVED.has(candidate) &&
      !usedKeys.has(candidate) &&
      result.length < 3
    ) {
      result.push(candidate);
    }
  }

  return result;
}

// ─── getEffectiveBindings ─────────────────────────────────────

export function getEffectiveBindings(
  overrides: UserOverrides,
): Record<CommandId, string> {
  const result = {} as Record<CommandId, string>;

  for (const commandId of Object.keys(DEFAULT_KEYBINDINGS) as CommandId[]) {
    const override = overrides[commandId];

    if (override !== undefined) {
      // enabled: false이면 제외
      if (!override.enabled) continue;

      // userKey가 있으면 사용, null이면 기본값 사용
      const key = override.userKey ?? DEFAULT_KEYBINDINGS[commandId].defaultKey;
      result[commandId] = key;
    } else {
      // override 없으면 기본값 사용
      result[commandId] = DEFAULT_KEYBINDINGS[commandId].defaultKey;
    }
  }

  return result;
}
