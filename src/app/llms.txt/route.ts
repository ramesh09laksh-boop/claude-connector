import { publicPages, site, siteUrl } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Generated from the same `publicPages` list as the sitemap and the footer, so
 * it cannot fall behind.
 *
 * Worth being honest about: this is a proposed convention that no major AI
 * crawler has publicly committed to reading. It costs a dozen lines and helps
 * anyone pointing an assistant at the app. What a crawler is *permitted* to do
 * lives in robots.txt and nowhere else — this file neither grants nor withholds
 * anything.
 */
export async function GET() {
  const body = [
    `# ${site.name}`,
    "",
    `> ${site.description}`,
    "",
    `${site.name} is a Kanban board for teams: an organisation holds teams, each team has exactly one board, and cards move between columns by drag and drop. Sign-in is email and password.`,
    "",
    "## Pages",
    "",
    ...publicPages.map(
      (page) =>
        `- [${page.title}](${siteUrl}${page.path === "/" ? "" : page.path}): ${page.summary}`,
    ),
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
