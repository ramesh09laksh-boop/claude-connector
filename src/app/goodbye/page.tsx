import Link from "next/link";
import type { Metadata } from "next";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Account deleted",
  robots: { index: false },
};

export default function GoodbyePage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        Your account is gone
      </h1>
      <p className="max-w-md text-muted-foreground">
        Your profile and memberships have been deleted. Cards you created are
        still on their team&apos;s board, unassigned. Thanks for trying Lanes.
      </p>
      <Button render={<Link href="/" />} nativeButton={false} variant="outline">
        Back to the start
      </Button>
    </main>
  );
}
