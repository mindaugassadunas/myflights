import { isAuthDisabled, OWNER_EMAIL } from "@/lib/owner";
import { signIn } from "@/lib/auth";

export const metadata = { title: "Sign in — Aloft" };
export const dynamic = "force-dynamic";

export default function LoginPage() {
  const disabled = isAuthDisabled();

  return (
    <div className="min-h-dvh flex items-center justify-center px-5">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div>
          <div className="text-[12px] font-mono-data uppercase tracking-wider text-text-secondary">
            Aloft
          </div>
          <h1 className="mt-1 text-[28px] leading-8 font-light">Welcome back</h1>
          <p className="mt-2 text-[14px] text-text-secondary">
            Only{" "}
            <span className="font-mono-data text-text-primary">{OWNER_EMAIL}</span>{" "}
            can sign in.
          </p>
        </div>

        {disabled ? (
          <div className="bg-surface border border-border rounded-[2px] p-4 text-left text-[14px] text-text-secondary">
            Sign-in is disabled in dev (NEXTAUTH_SECRET not set). The API uses{" "}
            <span className="font-mono-data text-text-primary">OWNER_EMAIL</span>{" "}
            directly.
          </div>
        ) : (
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/log" });
            }}
          >
            <button
              type="submit"
              className="w-full h-12 rounded-[8px] bg-accent text-bg font-medium"
            >
              Continue with Google
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
