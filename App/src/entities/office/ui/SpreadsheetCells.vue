<script setup lang="ts">
import { computed } from 'vue'
import type { GridCell } from '../lib/spreadsheet'
const props = defineProps<{ cells: GridCell[]; zoom: number; left: number; top: number; selected: string }>()
defineEmits<{ select: [cell: GridCell] }>()
const rows = computed(() => {
  const groups = new Map<number, GridCell[]>()
  for (const cell of props.cells) {
    const group = groups.get(cell.row)
    if (group) group.push(cell)
    else groups.set(cell.row, [cell])
  }
  return [...groups.entries()]
})
</script>

<template>
  <div v-for="[row, group] in rows" :key="row" role="row" :aria-rowindex="row + 1" class="contents">
  <div v-for="cell in group" :key="cell.key" role="gridcell" :aria-label="`${cell.address}: ${cell.text}`"
    :aria-selected="selected === cell.address" :aria-rowindex="cell.row + 1" :aria-colindex="cell.column + 1"
    :aria-rowspan="cell.rowSpan" :aria-colspan="cell.colSpan"
    class="absolute flex cursor-cell items-center overflow-hidden border-r border-b border-line/70 px-2"
    :class="[selected === cell.address ? 'z-10 bg-emerald-50 ring-2 ring-inset ring-emerald-600' : 'bg-white', cell.numeric ? 'justify-end' : 'justify-start']"
    :style="{ left: `${left + cell.left * zoom}px`, top: `${top + cell.top * zoom}px`, width: `${cell.width * zoom}px`, height: `${cell.height * zoom}px`, fontSize: `${13 * zoom}px` }"
    @click="$emit('select', cell)">
    <span class="truncate">{{ cell.text }}</span>
  </div>
  </div>
</template>
