import uWS from "uWebSockets.js";

export function parseCookies(req: uWS.HttpRequest): Record<string, string> {
  const header = req.getHeader("cookie") ?? "";
  const cookies: Record<string, string> = {};
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key) cookies[key] = rest.join("=");
  }
  return cookies;
}

export interface UserIdResult {
  userId: string;
  setCookieHeader: string | null;
}

export function getOrCreateUserId(req: uWS.HttpRequest): UserIdResult {
  const cookies = parseCookies(req);
  const existing = cookies["revlclone_uid"];
  if (existing) {
    return { userId: existing, setCookieHeader: null };
  }

  const newId = crypto.randomUUID();
  return {
    userId: newId,
    setCookieHeader: `revlclone_uid=${newId}; Max-Age=31536000; Path=/; HttpOnly; SameSite=Lax`,
  };
}
