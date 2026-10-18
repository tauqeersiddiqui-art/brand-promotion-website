import { NextResponse } from "next/server";
import { getCurrentUser, isAdminEmail } from "./auth";

export type ApiUser = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  created_at: string;
};

/** Returns the user or a 401 response. */
export async function requireUser(): Promise<
  { user: ApiUser; error: null } | { user: null; error: NextResponse }
> {
  const user = (await getCurrentUser()) as ApiUser | null;
  if (!user) {
    return {
      user: null,
      error: NextResponse.json({ error: "Please log in." }, { status: 401 }),
    };
  }
  return { user, error: null };
}

/** Returns the user (must be admin) or a 401/403 response. */
export async function requireAdmin(): Promise<
  { user: ApiUser; error: null } | { user: null; error: NextResponse }
> {
  const { user, error } = await requireUser();
  if (error) return { user: null, error };
  if (user.role !== "admin") {
    return {
      user: null,
      error: NextResponse.json({ error: "Admin access required." }, { status: 403 }),
    };
  }
  return { user, error: null };
}

export function isAdminUser(user: ApiUser): boolean {
  return user.role === "admin" || isAdminEmail(user.email);
}

export function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
