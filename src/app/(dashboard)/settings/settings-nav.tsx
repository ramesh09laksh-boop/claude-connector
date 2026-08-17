"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * Only the sections Lanes actually has. No Billing (no payments), no Connected
 * apps (no agent access), no Cookie preferences (no banner) and no
 * Notifications — every email Lanes sends is transactional, and transactional
 * email ignores preferences by design.
 */
const sections = [
  { href: "/settings", label: "Profile" },
  { href: "/settings/account", label: "Account" },
  { href: "/settings/security", label: "Security" },
];

export function SettingsNav({ showSystem }: { showSystem: boolean }) {
  const pathname = usePathname();
  const items = showSystem
    ? [...sections, { href: "/settings/system", label: "System" }]
    : sections;

  return (
    <nav className="mt-6 flex flex-wrap gap-1 border-b">
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
              active
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
