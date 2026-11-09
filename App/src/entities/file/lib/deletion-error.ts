import { errorMessage } from '@/shared/lib/error'

export function deletionErrorMessage(error: unknown): string {
  return errorMessage(error)
}
