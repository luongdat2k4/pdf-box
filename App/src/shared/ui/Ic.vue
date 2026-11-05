<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { icons, type IconName } from '@/shared/config/icons'

defineProps<{ name: IconName; size?: number | string; spin?: boolean }>()
</script>

<template>
  <Icon
    :icon="icons[name]"
    :width="size ?? 22"
    :height="size ?? 22"
    :class="{ spin }"
    aria-hidden="true"
  />
</template>
