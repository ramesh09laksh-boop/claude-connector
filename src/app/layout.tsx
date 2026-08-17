import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { Toaster } from "@/components/ui/sonner";
import { legal } from "@/lib/legal";
import { site, siteUrl } from "@/lib/site";

import "./globals.css";

// globals.css maps --font-sans into Tailwind's font-sans, so the variable name
// has to match or every page silently falls back to a serif.
const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Everything in <head> is owned here, so there is exactly one owner and the
 * pages don't drift. `metadataBase` turns every relative image and canonical
 * path absolute; without it Next warns at build and falls back to localhost.
 * The `template` means each page sets only its own half.
 */
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: site.name, template: `%s · ${site.name}` },
  description: site.description,
  applicationName: site.name,
  openGraph: {
    type: "website",
    siteName: site.name,
    title: site.name,
    description: site.description,
    url: siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: site.name,
    description: site.description,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // One WebSite block. No Organization unless legal.entity is actually set —
  // inventing one writes a legal claim into machine-readable form. Never a
  // rating, review or price: Lanes has no customers and no price.
  const structuredData: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: site.name,
    url: siteUrl,
    description: site.description,
  };

  if (legal.entity) {
    structuredData.publisher = {
      "@type": "Organization",
      name: legal.entity,
    };
  }

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster richColors closeButton />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </body>
    </html>
  );
}
