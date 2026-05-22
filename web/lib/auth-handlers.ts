/**
 * Auth.js needs the route handler in app/api/auth/[...nextauth]/route.ts.
 * When NEXTAUTH_SECRET is empty (local dev), we serve a tiny stub instead so
 * Prisma + Google credentials don't need to be set just to poke the UI.
 */
import { NextResponse, type NextRequest } from "next/server";
import { isAuthDisabled } from "@/lib/owner";

async function realHandlers() {
  // Imported lazily so the module load doesn't blow up when env is unset.
  const { handlers } = await import("@/lib/auth");
  return handlers;
}

function stubResponse() {
  return NextResponse.json(
    { error: "auth_disabled", message: "Set NEXTAUTH_SECRET to enable sign-in." },
    { status: 503 },
  );
}

export async function GET(req: NextRequest) {
  if (isAuthDisabled()) return stubResponse();
  const h = await realHandlers();
  return h.GET(req);
}

export async function POST(req: NextRequest) {
  if (isAuthDisabled()) return stubResponse();
  const h = await realHandlers();
  return h.POST(req);
}
