export interface AccountEmailBindings {
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  APP_URL?: string;
}

export interface AccountToken {
  rawToken: string;
  tokenHash: string;
  expiresAt: Date;
}

export type AccountTokenPurpose = "verify-email" | "reset-password" | "change-email";

export async function hashAccountToken(rawToken: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawToken));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createAccountToken(ttlMilliseconds: number): Promise<AccountToken> {
  const bytes = new Uint8Array(new ArrayBuffer(32));
  crypto.getRandomValues(bytes);
  const rawToken = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const tokenHash = await hashAccountToken(rawToken);
  return { rawToken, tokenHash, expiresAt: new Date(Date.now() + ttlMilliseconds) };
}

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

export function getAccountActionUrl(env: AccountEmailBindings, path: string, token: string): string {
  assertAccountEmailConfigured(env);
  const origin = new URL(env.APP_URL ?? "");
  const url = new URL(path, origin);
  url.searchParams.set("token", token);
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
