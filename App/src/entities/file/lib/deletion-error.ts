import { t } from '@/shared/i18n'
import { errorMessage } from '@/shared/lib/error'

export function deletionErrorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code
  return code === 'NO_WRITE_PERMISSION' || code === 'PERMISSION_LOST' ? t('file.deleteDenied') : errorMessage(error)
}
