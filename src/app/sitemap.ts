import type { MetadataRoute } from "next";

import { publicPages, siteUrl } from "@/lib/site";

/**
 * Nothing behind sign-in goes in a sitemap — not /dashboard, not /teams, not
 * /settings, not /invite, not an API path. A sitemap is a list of pages you are
 * inviting a stranger to open, and every entry that redirects to sign-in is an
 * error in Search Console the operator has to learn to ignore.
 *
 * No `priority` or `changeFrequency`: Google ignores both.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return publicPages.map((page) => ({
    url: `${siteUrl}${page.path === "/" ? "" : page.path}`,
    lastModified,
  }));
}
