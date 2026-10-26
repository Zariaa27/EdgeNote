export const SESSION_COOKIE = "edgenote_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export function isStrongSecret(secret: unknown): secret is string {
  return typeof secret === "string" && new TextEncoder().encode(secret).byteLength >= 32;
}

interface SessionClaims {
  sub: string;
  exp: number;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function importSessionKey(secret: string, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages,
  );
}

export async function createSessionToken(userId: string, secret: string): Promise<string> {
  const claims: SessionClaims = {
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const payload = encodeBase64Url(new TextEncoder().encode(JSON.stringify(claims)));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await importSessionKey(secret, ["sign"]),
    new TextEncoder().encode(payload),
  );
  return `${payload}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export async function getSessionUserId(request: Request, secret: string): Promise<string | null> {
  if (!isStrongSecret(secret)) return null;

  const cookie = request.headers.get("cookie") ?? "";
  const token = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  if (!token) return null;

  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;

  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await importSessionKey(secret, ["verify"]),
      decodeBase64Url(signature),
      new TextEncoder().encode(payload),
    );
    if (!valid) return null;

    const claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload))) as SessionClaims;
    return typeof claims.sub === "string" && claims.sub.length > 0 && claims.exp > Date.now() / 1000
      ? claims.sub
      : null;
  } catch {
    return null;
  }
}

export async function createSessionCookie(userId: string, secret: string, request: Request): Promise<string> {
  const token = await createSessionToken(userId, secret);
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}`;
}

export function clearSessionCookie(request: Request): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

async function derivePassword(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(new ArrayBuffer(16)) as Uint8Array<ArrayBuffer>;
  crypto.getRandomValues(salt);
  const iterations = 100_000;
  const derived = await derivePassword(password, salt, iterations);
  return `pbkdf2-sha256$${iterations}$${encodeBase64Url(salt)}$${encodeBase64Url(derived)}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [algorithm, iterationsValue, saltValue, hashValue, extra] = storedHash.split("$");
  if (algorithm !== "pbkdf2-sha256" || !iterationsValue || !saltValue || !hashValue || extra) return false;
  const iterations = Number(iterationsValue);
  if (!Number.isInteger(iterations) || iterations !== 100_000) return false;

  try {
    const expected = decodeBase64Url(hashValue);
    const actual = await derivePassword(password, decodeBase64Url(saltValue), iterations);
    if (expected.length !== actual.length) return false;
    let difference = 0;
    for (let index = 0; index < expected.length; index += 1) difference |= expected[index] ^ actual[index];
    return difference === 0;
  } catch {
    return false;
  }
}