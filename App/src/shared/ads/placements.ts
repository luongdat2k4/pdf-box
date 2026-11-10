// Where ads are shown and how often (design-note/ads-plan.md, section 5). These are UX settings, not limits
// set by Google; keep them in one place so they can move to remote config later.

/** Sent to the SDK as `ad_placement`, so revenue can be read per spot. */
export type Placement = 'app_launch' | 'app_resume' | 'open_document' | 'tool_done'

/** Minimum time between two full-screen ads, counted from when the previous one was closed. */
export const FULL_SCREEN_GAP_MS = 60_000
/** Upper bound on full-screen ads in one session. */
export const MAX_FULL_SCREEN_PER_SESSION = 6
/** How long the launch screen waits for an app-open ad (SDK start-up included) before giving up. */
export const LAUNCH_DEADLINE_MS = 5_000
/** Time the app must have spent in the background before returning shows an app-open ad. */
export const RESUME_MIN_BACKGROUND_MS = 30_000
/** Opening documents from a list: the first of a session is free, then one in this many shows an ad. */
export const OPEN_DOCUMENT_EVERY = 2
