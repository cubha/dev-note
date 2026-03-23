/**
 * className 조합 유틸리티
 * falsy 값(false, undefined, null, '')을 자동 제거하고 공백으로 결합
 */
export const cn = (...classes: (string | false | null | undefined)[]): string =>
  classes.filter(Boolean).join(' ')
