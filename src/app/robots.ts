import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/site";

/**
 * AI crawlers are a separate, deliberate decision. Lanes' content is not the
 * product — these are marketing pages for a tool — so all three kinds are
 * allowed: training crawlers, search/citation crawlers (this is how an
 * assistant recommends the app with a link), and user-initiated fetchers
 * (blocking those blocks a visitor who chose to come).
 *
 * robots.txt is public, so it names no path anyone would rather keep quiet.
 * Everything disallowed below is already guessable and protected by the session
 * check. Crawl policy is not a security boundary.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/dashboard", "/teams", "/settings", "/invite"],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
