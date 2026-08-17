import Link from "next/link";
import type { ReactNode } from "react";

/** The frame both /sign-in and /sign-up sit in, so they can't drift apart. */
export function AuthFormShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-8 bg-muted/40 px-6 py-16">
      <Link href="/" className="text-lg font-semibold tracking-tight">
        Lanes
      </Link>
      <div className="w-full max-w-sm rounded-lg border bg-card p-8 shadow-sm">
        <div className="mb-6 space-y-1.5">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {children}
      </div>
      <p className="text-sm text-muted-foreground">{footer}</p>
    </main>
  );
}
