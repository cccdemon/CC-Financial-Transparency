import { redirect } from "next/navigation";
import { checkAdminCredentials, startAdminSession, getAdminSession } from "@/lib/auth";
import {
  assertSameOriginRequest,
  clearLoginFailures,
  isLoginRateLimited,
  loginRateLimitKey,
  recordLoginFailure,
  safeAdminRedirect,
} from "@/lib/security";

export default async function LoginPage(props: {
  searchParams: Promise<{ redirect?: string; error?: string }>;
}) {
  const sp = await props.searchParams;
  const redirectTo = safeAdminRedirect(sp.redirect, "/admin");
  const existing = await getAdminSession();
  if (existing) {
    redirect(redirectTo);
  }

  async function loginAction(formData: FormData) {
    "use server";
    await assertSameOriginRequest();
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const redirectTo = safeAdminRedirect(String(formData.get("redirect") ?? "/admin"), "/admin");
    const rateLimitKey = await loginRateLimitKey(email);
    if (isLoginRateLimited(rateLimitKey)) {
      redirect(`/admin/login?error=rate_limited&redirect=${encodeURIComponent(redirectTo)}`);
    }
    const ok = await checkAdminCredentials(email, password);
    if (!ok) {
      recordLoginFailure(rateLimitKey);
      redirect(`/admin/login?error=invalid&redirect=${encodeURIComponent(redirectTo)}`);
    }
    clearLoginFailures(rateLimitKey);
    await startAdminSession(email);
    redirect(redirectTo);
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950 p-6">
      <form
        action={loginAction}
        className="w-full max-w-sm space-y-4 rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900"
      >
        <h1 className="text-xl font-semibold">Admin sign in</h1>
        {sp.error && (
          <p className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">
            Invalid email or password.
          </p>
        )}
        <input type="hidden" name="redirect" value={redirectTo} />
        <Field name="email" type="email" label="Email" required />
        <Field name="password" type="password" label="Password" required />
        <button
          type="submit"
          className="w-full rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
          Sign in
        </button>
      </form>
    </main>
  );
}

function Field({ name, label, type, required }: { name: string; label: string; type: string; required?: boolean }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        className="block w-full rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
      />
    </label>
  );
}
