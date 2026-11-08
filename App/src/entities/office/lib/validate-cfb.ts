import { assertPresentationSize, PRESENTATION_LIMITS, PresentationSafetyError } from './presentation-limits'

const END = 0xfffffffe
const FREE = 0xffffffff
const FAT = 0xfffffffd
const DIFAT = 0xfffffffc
const SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]
const invalid = (message: string): never => { throw new PresentationSafetyError('PRESENTATION_INVALID_CFB', message) }
const budget = (message: string): never => { throw new PresentationSafetyError('PRESENTATION_RESOURCE_LIMIT', message) }

/**
 * Reject malformed CFB before @web-ppt/core sees it (including encrypted OOXML in a CFB container).
 * Validates the exact FAT/MiniFAT chains that the upstream reader will traverse. Work and allocations
 * are bounded by the input file, not the upstream million-iteration guard. No dependency patch hook.
 */
export function validatePresentationCfb(data: ArrayBuffer): void {
  assertPresentationSize(data.byteLength)
  const bytes = new Uint8Array(data)
  if (bytes[0] !== 0xd0 || bytes[1] !== 0xcf) return // ZIP/non-CFB format validation belongs to the parser.
  if (bytes.length < 512 || SIGNATURE.some((byte, index) => bytes[index] !== byte)) invalid('Invalid CFB signature')
  const view = new DataView(data)
  const major = view.getUint16(26, true)
  const shift = view.getUint16(30, true)
  if (view.getUint16(28, true) !== 0xfffe || !((major === 3 && shift === 9) || (major === 4 && shift === 12))
    || view.getUint16(32, true) !== 6 || view.getUint32(56, true) !== 4096) invalid('Invalid CFB header')
  const sectorSize = 2 ** shift
  if (bytes.length % sectorSize !== 0 || bytes.length < 3 * sectorSize) invalid('Truncated CFB sectors')
  const sectorCount = bytes.length / sectorSize - 1
  const perFat = sectorSize / 4
  const fatCount = view.getUint32(44, true)
  if (!fatCount || fatCount > Math.ceil(sectorCount / perFat)) invalid('Invalid FAT sector count')
  const physical = (id: number) => {
    if (!Number.isInteger(id) || id < 0 || id >= sectorCount) invalid('CFB sector outside input')
    return (id + 1) * sectorSize
  }
  const occupied = new Set<number>()
  const claim = (id: number) => {
    physical(id)
    if (occupied.has(id)) invalid('CFB sector cycle or overlapping chains')
    occupied.add(id)
  }
  const fatSectors: number[] = []
  const addFat = (id: number) => {
    if (id === FREE) return
    claim(id); fatSectors.push(id)
    if (fatSectors.length > fatCount) invalid('Too many FAT sectors')
  }
  for (let i = 0; i < 109; i++) addFat(view.getUint32(76 + i * 4, true))
  const difatCount = view.getUint32(72, true)
  if (difatCount > sectorCount) invalid('Invalid DIFAT count')
  const difatSectors: number[] = []
  let difat = view.getUint32(68, true)
  for (let i = 0; i < difatCount; i++) {
    claim(difat); difatSectors.push(difat)
    const offset = physical(difat)
    for (let j = 0; j < perFat - 1; j++) addFat(view.getUint32(offset + j * 4, true))
    difat = view.getUint32(offset + sectorSize - 4, true)
  }
  if ((difat !== END && !(difatCount === 0 && difat === FREE)) || fatSectors.length !== fatCount
    || fatCount * perFat < sectorCount) invalid('Inconsistent CFB allocation table')
  const fat = new Uint32Array(fatCount * perFat)
  for (let i = 0; i < fatCount; i++) {
    const offset = physical(fatSectors[i]!)
    for (let j = 0; j < perFat; j++) fat[i * perFat + j] = view.getUint32(offset + j * 4, true)
  }
  for (const id of fatSectors) if (fat[id] !== FAT) invalid('Invalid FAT sector marker')
  for (const id of difatSectors) if (fat[id] !== DIFAT) invalid('Invalid DIFAT sector marker')

  function chain(start: number, expected?: number, max = sectorCount): number[] {
    if (expected === 0) {
      if (start !== END && start !== FREE) invalid('Non-empty chain for empty stream')
      return []
    }
    const result: number[] = []
    let current = start
    while (current !== END) {
      claim(current)
      if (result.length >= max || (expected !== undefined && result.length >= expected)) invalid('Overlong CFB chain')
      result.push(current)
      current = fat[current]!
    }
    if (!result.length || (expected !== undefined && result.length !== expected)) invalid('Truncated CFB chain')
    return result
  }

  const directory = chain(view.getUint32(48, true), undefined,
    Math.ceil(PRESENTATION_LIMITS.maxCfbDirectoryEntries * 128 / sectorSize))
  if (major === 4 && view.getUint32(40, true) !== directory.length) invalid('Invalid CFB directory length')
  const streams: { type: number; start: number; size: number }[] = []
  let totalStreamBytes = 0
  for (const sector of directory) {
    const offset = physical(sector)
    for (let pos = offset; pos < offset + sectorSize; pos += 128) {
      const type = view.getUint8(pos + 66)
      if (type === 0) continue
      if (type !== 1 && type !== 2 && type !== 5) invalid('Invalid directory entry type')
      const nameBytes = view.getUint16(pos + 64, true)
      if (nameBytes < 2 || nameBytes > 64 || nameBytes % 2) invalid('Invalid CFB name length')
      if (type === 1) continue
      if (view.getUint32(pos + 124, true) !== 0) budget('CFB stream exceeds mobile budget')
      const size = view.getUint32(pos + 120, true)
      if (size > bytes.length) invalid('CFB stream larger than its container')
      totalStreamBytes += size
      if (totalStreamBytes > PRESENTATION_LIMITS.maxCfbStreamBytes) budget('Too many CFB stream bytes')
      streams.push({ type, start: view.getUint32(pos + 116, true), size })
    }
  }
  const roots = streams.filter((stream) => stream.type === 5)
  if (roots.length !== 1) invalid('CFB must have one root stream')
  const root = roots[0]!
  chain(root.start, Math.ceil(root.size / sectorSize))
  const miniFatCount = view.getUint32(64, true)
  if (miniFatCount > Math.ceil(Math.ceil(root.size / 64) / perFat)) invalid('Oversized MiniFAT table')
  const miniFatSectors = chain(view.getUint32(60, true), miniFatCount)
  const miniFat = new Uint32Array(miniFatCount * perFat)
  for (let i = 0; i < miniFatCount; i++) {
    const offset = physical(miniFatSectors[i]!)
    for (let j = 0; j < perFat; j++) miniFat[i * perFat + j] = view.getUint32(offset + j * 4, true)
  }
  const usedMini = new Set<number>()
  for (const stream of streams) {
    if (stream.type === 5) continue
    if (stream.size >= 4096 || stream.size === 0) { chain(stream.start, Math.ceil(stream.size / sectorSize)); continue }
    const expected = Math.ceil(stream.size / 64)
    let current = stream.start
    for (let i = 0; i < expected; i++) {
      if (current >= miniFat.length || (current + 1) * 64 > root.size || usedMini.has(current)) invalid('Invalid or cyclic MiniFAT chain')
      usedMini.add(current)
      current = miniFat[current]!
    }
    if (current !== END) invalid('Overlong MiniFAT chain')
  }
}
