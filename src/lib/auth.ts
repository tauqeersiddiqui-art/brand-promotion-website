import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db } from "./db";

// Fail closed on a missing/short secret rather than silently falling back to a
// publicly known value, which would let anyone forge an admin session token.
const secretString = process.env.AUTH_SECRET || "";
if (secretString.length < 32) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "AUTH_SECRET must be set to a random string of at least 32 characters. Generate one with: openssl rand -base64 48"
    );
  }
  console.warn(
    "[auth] AUTH_SECRET is missing or shorter than 32 characters. Sessions are unsigned in development only — set AUTH_SECRET before deploying."
  );
}
const secret = new TextEncoder().encode(secretString);

export const COOKIE_NAME = "bp_session";
export const SESSION_DAYS = 7;

export type SessionPayload = {
  userId: number;
  email: string;
  role: "user" | "admin";
  name: string;
};

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret);
}

export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    if (
      typeof payload.userId !== "number" ||
      typeof payload.email !== "string" ||
      (payload.role !== "user" && payload.role !== "admin")
    ) {
      return null;
    }
    return {
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
      name: typeof payload.name === "string" ? payload.name : "",
    };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function setSessionCookie(token: string) {
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.set(COOKIE_NAME, "", { httpOnly: true, path: "/", maxAge: 0 });
}

/** Fresh user record from DB (checks the account still exists). */
export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;
  const user = db
    .prepare("SELECT id, name, email, phone, role, created_at FROM users WHERE id = ?")
    .get(session.userId) as
    | { id: number; name: string; email: string; phone: string | null; role: string; created_at: string }
    | undefined;
  return user ?? null;
}

export function isAdminEmail(email: string): boolean {
  const configured = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
  if (!configured) return false;
  return email.toLowerCase().trim() === configured;
}
