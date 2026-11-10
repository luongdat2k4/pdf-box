/** Seconds the /begin screen waits before its button lets the user into the app. */
export const BEGIN_SECONDS = 3

// In memory on purpose: every cold start of the app passes through /begin once, then never again in that session.
let begun = false

export function hasBegun(): boolean {
  return begun
}

export function markBegun(): void {
  begun = true
}
