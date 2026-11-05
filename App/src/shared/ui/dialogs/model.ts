import { ref } from 'vue'

export type DialogState =
  | { kind: 'password'; title: string; message?: string; error: boolean; resolve: (v: string | null) => void }
  | { kind: 'prompt'; title: string; label: string; value: string; confirmText: string; resolve: (v: string | null) => void }
  | { kind: 'confirm'; title: string; message: string; confirmText: string; danger: boolean; resolve: (v: boolean) => void }

export const dialogState = ref<DialogState | null>(null)

export function askPassword(title: string, error = false, message?: string): Promise<string | null> {
  return new Promise((resolve) => {
    dialogState.value = { kind: 'password', title, message, error, resolve }
  })
}

export function askText(title: string, label: string, value = '', confirmText = 'OK'): Promise<string | null> {
  return new Promise((resolve) => {
    dialogState.value = { kind: 'prompt', title, label, value, confirmText, resolve }
  })
}

export function askConfirm(title: string, message: string, confirmText = 'OK', danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    dialogState.value = { kind: 'confirm', title, message, confirmText, danger, resolve }
  })
}

export interface Toast { id: number; text: string; error: boolean }
export const toasts = ref<Toast[]>([])
let toastId = 0

export function toast(text: string, error = false): void {
  const t = { id: ++toastId, text, error }
  toasts.value.push(t)
  setTimeout(() => (toasts.value = toasts.value.filter((x) => x.id !== t.id)), error ? 5000 : 2500)
}
