export function formatSnakeLabel(value: string): string {
  return value
    .split('_')
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ')
}
