import { isAuthDisabled } from "@/lib/owner";
import { signIn } from "@/lib/auth";

export const metadata = { title: "Sign in — MyFlights" };
export const dynamic = "force-dynamic";

export default function LoginPage() {
  const disabled = isAuthDisabled();

  return (
    <div className="min-h-dvh flex items-center justify-center px-5">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div>
          <div className="text-[12px] font-mono-data uppercase tracking-wider text-text-secondary">
            MyFlights
          </div>
          <h1 className="mt-1 text-[28px] leading-8 font-light">Your flight log</h1>
          <p className="mt-2 text-[14px] text-text-secondary">
            Sign in with Google to start logging flights.
          </p>
        </div>

        {disabled ? (
          <div className="bg-surface border border-border rounded-[2px] p-4 text-left text-[14px] text-text-secondary">
            Sign-in is disabled in dev (
            <span className="font-mono-data text-text-primary">NEXTAUTH_SECRET</span>{" "}
            not set). The app falls back to a single dev user so you can
            exercise the stack without Google OAuth configured.
          </div>
        ) : (
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/" });
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
