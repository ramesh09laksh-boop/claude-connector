"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState, useTransition } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/lib/auth-client";
import { setActiveOrganization } from "@/lib/actions/organizations";
import { UnverifiedEmailBanner } from "@/components/unverified-email-banner";

export type ShellUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  emailVerified: boolean;
};

export function AppShell({
  user,
  organizations,
  activeOrganizationId,
  teams,
  children,
}: {
  user: ShellUser;
  organizations: { id: string; name: string; role: string }[];
  activeOrganizationId: string | null;
  teams: { id: string; name: string }[];
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [switching, setSwitching] = useState(false);

  const activeOrg = organizations.find((o) => o.id === activeOrganizationId);
  const initials = user.name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  async function onSwitchOrganization(organizationId: string) {
    if (organizationId === activeOrganizationId) return;
    setSwitching(true);
    const result = await setActiveOrganization({ organizationId });
    setSwitching(false);
    if (result.ok) {
      startTransition(() => {
        router.push("/dashboard");
        router.refresh();
      });
    }
  }

  return (
    // A definite height, not a minimum: the board fills the space below the
    // header and scrolls inside itself, which is what lets a column be as tall
    // as the viewport. Ordinary pages scroll inside <main> instead.
    <div className="flex h-svh flex-col overflow-hidden">
      <header className="border-b bg-card">
        <div className="flex w-full items-center gap-3 px-4 py-3 sm:px-6">
          <Link href="/dashboard" className="font-semibold tracking-tight">
            Lanes
          </Link>

          {organizations.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    className="max-w-[12rem] justify-between truncate"
                    disabled={switching || pending}
                  />
                }
              >
                <span className="truncate">
                  {activeOrg?.name ?? "Choose organisation"}
                </span>
              </DropdownMenuTrigger>
              {/* DropdownMenuLabel is Base UI's GroupLabel and throws outside
                  a Group, which takes the whole menu down with it. */}
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Organisations</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {organizations.map((org) => (
                    <DropdownMenuItem
                      key={org.id}
                      onClick={() => void onSwitchOrganization(org.id)}
                    >
                      <span className="truncate">{org.name}</span>
                      {org.id === activeOrganizationId ? (
                        <span className="ml-auto text-xs text-muted-foreground">
                          Current
                        </span>
                      ) : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}

          {teams.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="hidden max-w-[12rem] truncate sm:inline-flex"
                  />
                }
              >
                Teams
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Teams</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {teams.map((t) => (
                    <DropdownMenuItem
                      key={t.id}
                      render={<Link href={`/teams/${t.id}`} className="truncate" />}
                    >
                      {t.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}

          <div className="ml-auto flex items-center gap-2">
            <Button
              render={<Link href="/settings" />}
              nativeButton={false}
              variant="ghost"
              size="sm"
            >
              Settings
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                className="rounded-full outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Your account"
              >
                <Avatar className="size-8">
                  {user.image ? <AvatarImage src={user.image} alt="" /> : null}
                  <AvatarFallback>{initials || "?"}</AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="font-normal">
                    <span className="block truncate font-medium">
                      {user.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {user.email}
                    </span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem render={<Link href="/settings" />}>
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      void signOut().then(() => {
                        router.push("/");
                        router.refresh();
                      });
                    }}
                  >
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {user.emailVerified ? null : <UnverifiedEmailBanner />}

      <main key={pathname} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
