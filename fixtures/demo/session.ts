export function rotateRefreshToken(current: string): string {
  return `${current}-rotated`;
}

