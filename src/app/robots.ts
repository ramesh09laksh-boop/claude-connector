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
        // `/mcp` and `/oauth` are machine endpoints, not pages: one speaks
        // JSON-RPC and 401s without a token, the other only means anything
        // inside an OAuth redirect. `/.well-known/` is deliberately *not*
        // listed — those documents are meant to be fetched, and Anthropic's
        // crawler-agnostic discovery request has to reach them.
        disallow: [
          "/api/",
          "/dashboard",
          "/teams",
          "/settings",
          "/invite",
          "/mcp",
          "/oauth",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
