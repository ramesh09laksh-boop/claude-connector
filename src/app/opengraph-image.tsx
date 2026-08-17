import { ImageResponse } from "next/og";

import { site } from "@/lib/site";

export const runtime = "nodejs";
export const alt = `${site.name} — ${site.description}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Inline styles only: the satori runtime knows nothing about Tailwind classes
 * or CSS variables, so the values from globals.css are written out literally
 * here. No stock mockup and no fabricated screenshot — just Lanes' own name on
 * Lanes' own background.
 */
export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0f1117",
          padding: "72px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "8px",
              background: "#6d78f0",
            }}
          />
          <span style={{ color: "#e8eaf2", fontSize: "30px", fontWeight: 600 }}>
            {site.name}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <span
            style={{
              color: "#f5f6fa",
              fontSize: "76px",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              lineHeight: 1.05,
            }}
          >
            {site.tagline}
          </span>
          <span style={{ color: "#a6acc0", fontSize: "30px", lineHeight: 1.35 }}>
            {site.description}
          </span>
        </div>

        {/* Three bars standing in for the three default columns. */}
        <div style={{ display: "flex", gap: "16px" }}>
          {["#6d78f0", "#4a5270", "#333a52"].map((colour) => (
            <div
              key={colour}
              style={{
                width: "150px",
                height: "10px",
                borderRadius: "999px",
                background: colour,
              }}
            />
          ))}
        </div>
      </div>
    ),
    size,
  );
}
