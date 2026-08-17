import Link from "next/link";

import { SiteFooter } from "@/components/site-footer";

/**
 * Its own route group with a plain readable layout, reachable signed out.
 * Never inside the dashboard group — these pages are for people who don't have
 * an account yet.
 */
export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="border-b">
        <div className="mx-auto w-full max-w-2xl px-6 py-4">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Lanes
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <article className="space-y-6 leading-relaxed [&_h2]:mt-10 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-tight [&_li]:ml-5 [&_li]:list-disc [&_p]:text-[0.95rem] [&_ul]:space-y-1.5">
          {children}
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
