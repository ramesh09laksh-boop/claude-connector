import Link from "next/link";

import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/site-footer";
import { getOptionalUser } from "@/lib/auth-guards";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * A real landing page, not a redirect to sign-in — Lanes is a product other
 * people sign up for.
 *
 * Nothing here is fabricated: no testimonials, customer logos, star ratings,
 * user counts or press mentions. The app has no users and everyone reading
 * knows it. Any section that would need social proof to work is left out.
 */
const capabilities = [
  {
    title: "One board per team",
    body: "Every team in your organisation gets exactly one board, with the columns you decide on. No hunting for which board the work is on.",
  },
  {
    title: "Invite by link",
    body: "Generate a link for a team and paste it in your group chat. Anyone who opens it joins with the role you picked. Expires in seven days, revocable any time.",
  },
  {
    title: "Drag a card to move it",
    body: "Move cards between columns by pointer or by keyboard — space to lift, arrows to move, space to drop.",
  },
  {
    title: "Owners, admins and members",
    body: "Owners run the organisation, admins manage teams and columns, members get on with the cards. Everyone sees the same board.",
  },
];

export default async function LandingPage() {
  const session = await getOptionalUser();

  return (
    <>
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            {site.name}
          </Link>
          <nav className="flex items-center gap-2">
            {session ? (
              <Button render={<Link href="/dashboard" />} nativeButton={false} size="sm">Go to your board</Button>
            ) : (
              <>
                <Button render={<Link href="/sign-in" />} nativeButton={false} variant="ghost" size="sm">Sign in</Button>
                <Button render={<Link href="/sign-up" />} nativeButton={false} size="sm">Get started</Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto w-full max-w-5xl px-6 py-20 sm:py-28">
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            {site.tagline}
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">
            Lanes is a Kanban board for teams that want their work visible in one
            place — an organisation, teams inside it, and one board each.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button render={<Link href={session ? "/dashboard" : "/sign-up"} />} nativeButton={false} size="lg">{session ? "Go to your board" : "Start a board"}</Button>
            {session ? null : (
              <Button render={<Link href="/sign-in" />} nativeButton={false} variant="outline" size="lg">I already have an account</Button>
            )}
          </div>
        </section>

        <section className="border-t bg-muted/30">
          <div className="mx-auto w-full max-w-5xl px-6 py-16 sm:py-20">
            <h2 className="text-2xl font-semibold tracking-tight">
              What you can do
            </h2>
            <div className="mt-8 grid gap-6 sm:grid-cols-2">
              {capabilities.map((item) => (
                <div
                  key={item.title}
                  className="rounded-lg border bg-card p-6 shadow-sm"
                >
                  <h3 className="font-medium">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-5xl px-6 py-16 sm:py-20">
          <h2 className="text-2xl font-semibold tracking-tight">
            Sign in with an email and a password
          </h2>
          <p className="mt-3 max-w-xl text-muted-foreground">
            That&apos;s the whole of it. Forgot your password and Lanes emails
            you a reset link. Your board updates itself every few seconds, so a
            teammate&apos;s move shows up without anyone pressing refresh.
          </p>
          <Button render={<Link href={session ? "/dashboard" : "/sign-up"} />} nativeButton={false} className="mt-6">{session ? "Go to your board" : "Create an account"}</Button>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
