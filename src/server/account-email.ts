/**
 * Cloudflare Worker bindings used for account email.
 *
 * Cloudflare Email Routing handles inbound forwarding; Resend sends outbound
 * transactional email using a verified sender address.
 */
export interface AccountEmailBindings {
  /** Resend API key stored as a Cloudflare Worker secret. */
  RESEND_API_KEY?: string;
  /** Verified sender address, optionally routed by Cloudflare Email Routing. */
  EMAIL_FROM?: string;
  /** Public application origin used to construct email links. */
  APP_URL?: string;
}

/** A single-use account token and the hash persisted in D1. */
export interface AccountToken {
  /** Raw token included only in the delivered link. */
  rawToken: string;
  /** SHA-256 token digest safe to persist in D1. */
  tokenHash: string;
  /** Absolute expiration time. */
  expiresAt: Date;
}

/** Operations that may consume an account token. */
export type AccountTokenPurpose = "verify-email" | "reset-password" | "change-email";

/**
 * Hash a raw account token before storing or looking it up in D1.
 * @param rawToken The high-entropy token from an account action link.
 * @returns Lowercase hexadecimal SHA-256 digest.
 */
export async function hashAccountToken(rawToken: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawToken));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Create a cryptographically random token with a hash and expiry timestamp.
 * @param ttlMilliseconds Token lifetime measured from the current time.
 * @returns The raw token, its database-safe digest, and expiration date.
 */
export async function createAccountToken(ttlMilliseconds: number): Promise<AccountToken> {
  const bytes = new Uint8Array(new ArrayBuffer(32));
  crypto.getRandomValues(bytes);
  const rawToken = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const tokenHash = await hashAccountToken(rawToken);
  return { rawToken, tokenHash, expiresAt: new Date(Date.now() + ttlMilliseconds) };
}

/**
 * Throw a descriptive configuration error when outbound email is not configured.
 * @param env Worker bindings used by the account email sender.
 * @throws {Error} If the sender, API key, or secure app URL is missing or invalid.
 */
export function assertAccountEmailConfigured(env: AccountEmailBindings): void {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    throw new Error("Account email is not configured: set RESEND_API_KEY and EMAIL_FROM.");
  }
  const appUrl = env.APP_URL;
  if (!appUrl) throw new Error("Account email is not configured: APP_URL is missing.");
  let origin: URL;
  try {
    origin = new URL(appUrl);
  } catch {
    throw new Error("Account email is not configured with a valid APP_URL.");
  }
  if (origin.protocol !== "https:" && origin.hostname !== "localhost") {
    throw new Error("Account email is not configured with a secure APP_URL.");
  }
}

/**
 * Build an absolute URL on the configured app origin, optionally adding a
 * single-use token as a query parameter.
 * @param env Worker bindings containing the validated public app URL.
 * @param path App-relative path for the action or account page.
 * @param token Optional one-time token to include in the query string.
 * @returns Absolute URL suitable for a message link.
 */
export function getAccountActionUrl(env: AccountEmailBindings, path: string, token?: string): string {
  assertAccountEmailConfigured(env);
  const origin = new URL(env.APP_URL ?? "");
  const url = new URL(path, origin);
  if (token) url.searchParams.set("token", token);
  return url.toString();
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

/**
 * Send a transactional account email through Resend. The configured sender may
 * be an address managed by Cloudflare Email Routing.
 * @param env Worker bindings for Resend and the configured application origin.
 * @param message Recipient, subject, link label/URL, and explanatory text.
 * @throws {Error} If configuration is invalid or the provider rejects delivery.
 */
export async function sendAccountEmail(
  env: AccountEmailBindings,
  message: { to: string; subject: string; actionUrl: string; actionLabel: string; explanation: string },
): Promise<void> {
  assertAccountEmailConfigured(env);

  const actionUrl = escapeHtml(message.actionUrl);
  const explanation = escapeHtml(message.explanation);
  const actionLabel = escapeHtml(message.actionLabel);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [message.to],
      subject: message.subject,
      text: `${message.explanation}\n\n${message.actionLabel}: ${message.actionUrl}\n\nIf you did not request this, you can ignore this message.`,
      html: `<p>${explanation}</p><p><a href="${actionUrl}">${actionLabel}</a></p><p>If you did not request this, you can ignore this message.</p>`,
    }),
  });

  if (!response.ok) {
    console.error("Account email provider rejected a message.", { status: response.status });
    throw new Error("The account email provider could not send the message.");
  }
}

/**
 * Send a best-effort notice after a user successfully signs in.
 * @param env Worker bindings for outbound account email.
 * @param email Verified account address receiving the notice.
 * @param signedInAt Sign-in time; defaults to the current time.
 */
export async function sendLoginNotification(
  env: AccountEmailBindings,
  email: string,
  signedInAt: Date = new Date(),
): Promise<void> {
  await sendAccountEmail(env, {
    to: email,
    subject: "New sign-in to your EdgeNote account",
    actionUrl: getAccountActionUrl(env, "/forgot-password"),
    actionLabel: "Secure your account",
    explanation: `A successful sign-in to your EdgeNote account occurred at ${signedInAt.toISOString()} (UTC). If this was not you, reset your password.`,
  });
}
