/** Route that opens a library file in the matching viewer. */
export function openRoute(file: { id: string; kind: string }): string {
  return file.kind === 'pdf' ? `/reader/${file.id}` : `/office/${file.id}`
}
