import { redirect } from "next/navigation";
import { checkAdminCredentials, startAdminSession, getAdminSession } from "@/lib/auth";

export default async function LoginPage(props: {
  searchParams: Promise<{ redirect?: string; error?: string }>;
}) {
  const sp = await props.searchParams;
  const existing = await getAdminSession();
  if (existing) {
    redirect(sp.redirect ?? "/admin");
  }

  async function loginAction(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const redirectTo = String(formData.get("redirect") ?? "/admin");
    const ok = await checkAdminCredentials(email, password);
    if (!ok) {
      redirect(`/admin/login?error=invalid&redirect=${encodeURIComponent(redirectTo)}`);
    }
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
        <input type="hidden" name="redirect" value={sp.redirect ?? "/admin"} />
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
