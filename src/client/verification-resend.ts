const VERIFICATION_RESEND_COOLDOWN_MS = 5 * 60 * 1000;
const STORAGE_KEY_PREFIX = "edgenote-verification-resend:";

/**
 * Read the remaining verification resend cooldown for this browser tab and email.
 * Server-side cooldowns remain authoritative when session storage is unavailable.
 */
export function getVerificationResendCooldownMs(email: string, now = Date.now()): number {
  if (typeof window === "undefined") return 0;

  try {
    const key = `${STORAGE_KEY_PREFIX}${email.trim().toLowerCase()}`;
    const availableAt = Number(window.sessionStorage.getItem(key));
    if (!Number.isFinite(availableAt) || availableAt <= now) {
      window.sessionStorage.removeItem(key);
      return 0;
    }
    return availableAt - now;
  } catch (error) {
    console.warn("Unable to read the verification resend browser cooldown.", error);
    return 0;
  }
}

/**
 * Start a five-minute verification resend cooldown for this browser tab and email.
 */
export function recordVerificationResend(email: string, now = Date.now()): void {
  if (typeof window === "undefined") return;

  try {
    const key = `${STORAGE_KEY_PREFIX}${email.trim().toLowerCase()}`;
    window.sessionStorage.setItem(key, String(now + VERIFICATION_RESEND_COOLDOWN_MS));
  } catch (error) {
    console.warn("Unable to save the verification resend browser cooldown.", error);
  }
}
