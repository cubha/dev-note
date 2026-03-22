import { FIELD_SCHEMAS } from '../../core/types'
import type { FieldSchema } from '../../core/types'
import type { ItemType } from '../../core/db'

/** CodeMirror 에디터로 렌더링할 필드 키 (비고/내용) */
export const EDITOR_FIELD_KEYS = new Set(['note', 'content'])

/** 해당 타입에 폼 입력 필드(non-editor)가 있는지 */
export const hasFormFields = (type: ItemType): boolean => {
  return FIELD_SCHEMAS[type].some(s => !EDITOR_FIELD_KEYS.has(s.key))
}

/** 해당 타입에 에디터 필드(note/content)가 있는지 */
export const hasEditorField = (type: ItemType): boolean => {
  return FIELD_SCHEMAS[type].some(s => EDITOR_FIELD_KEYS.has(s.key))
}

/** 해당 타입의 에디터 필드 키 반환 (note 또는 content) */
export const getEditorFieldKey = (type: ItemType): string | null => {
  const schema = FIELD_SCHEMAS[type].find(s => EDITOR_FIELD_KEYS.has(s.key))
  return schema?.key ?? null
}

/** 해당 타입의 에디터 필드 스키마 반환 */
export const getEditorFieldSchema = (type: ItemType): FieldSchema | null => {
  return FIELD_SCHEMAS[type].find(s => EDITOR_FIELD_KEYS.has(s.key)) ?? null
}
