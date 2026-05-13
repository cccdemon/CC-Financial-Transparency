import Link from "next/link";
import type { ReactNode } from "react";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <header className="border-b border-neutral-200 dark:border-neutral-800">
        <div className="mx-auto max-w-5xl flex items-center justify-between p-4">
          <Link href="/admin" className="font-semibold">cc-financial · admin</Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/admin/months" className="hover:underline">Months</Link>
            <Link href="/admin/profit-loss" className="hover:underline">G/V</Link>
            <Link href="/admin/income" className="hover:underline">Income</Link>
            <Link href="/admin/expenses" className="hover:underline">Expenses</Link>
            <Link href="/admin/recurring-expenses" className="hover:underline">Recurring</Link>
            <Link href="/admin/giveaways" className="hover:underline">Giveaways</Link>
            <Link href="/admin/twitch" className="hover:underline">Twitch</Link>
            <form action="/api/admin/logout" method="post">
              <button type="submit" className="text-sm text-neutral-500 hover:underline">Sign out</button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-6">{children}</main>
    </div>
  );
}
