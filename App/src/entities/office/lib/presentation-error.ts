import { t, type MessageKey } from '@/shared/i18n'

const messages: Record<string, MessageKey> = {
  PRESENTATION_FILE_TOO_LARGE: 'slides.fileTooLarge', CONTENT_TOO_LARGE: 'slides.fileTooLarge',
  PRESENTATION_INVALID_CFB: 'slides.invalidFile', PRESENTATION_RESOURCE_LIMIT: 'slides.resourceLimit',
  PRESENTATION_TIMEOUT: 'slides.timeout', PasswordRequiredError: 'slides.passwordProtected', WrongPasswordError: 'slides.passwordProtected',
}
export function presentationError(error: unknown, fallback: MessageKey = 'slides.openFailed'): string {
  return t(messages[(error as { code?: string })?.code ?? ''] ?? fallback)
}
