const STORAGE_KEY = 'pdftoolbox.onboarding.v1'

export function isOnboardingComplete(): boolean {
  return localStorage.getItem(STORAGE_KEY) === 'complete'
}

export function completeOnboarding(): void {
  localStorage.setItem(STORAGE_KEY, 'complete')
}
