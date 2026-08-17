export const NEAR_BOTTOM_THRESHOLD = 120

export function distanceFromBottom(scrollHeight: number, scrollTop: number, clientHeight: number): number {
  return Math.max(0, scrollHeight - scrollTop - clientHeight)
}

export function isNearBottom(scrollHeight: number, scrollTop: number, clientHeight: number): boolean {
  return distanceFromBottom(scrollHeight, scrollTop, clientHeight) <= NEAR_BOTTOM_THRESHOLD
}
