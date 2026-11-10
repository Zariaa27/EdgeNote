import { clearSessionCookie } from "../../../../src/server/auth";

export async function POST(request: Request): Promise<Response> {
  const response = Response.json({ ok: true });
  response.headers.append("Set-Cookie", clearSessionCookie(request));
  response.headers.set("Cache-Control", "no-store");
  return response;
}