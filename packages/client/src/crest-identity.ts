// Coherent crest identity: one normalized primary crest plus compact secondary
// region badges. Replaces the old ad-hoc, overlapping full-size crest stacks.
import { championRegions, regionCrest, regionStyle } from "./regions";

export type CrestSize = "xs" | "sm" | "md" | "lg" | "xl";

function uniqueRegions(regions: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const region of regions) {
    if (!region || seen.has(region)) continue;
    seen.add(region);
    out.push(region);
  }
  return out.length > 0 ? out : ["Runeterra"];
}

function crestImage(region: string, className: string): HTMLImageElement {
  const image = document.createElement("img");
  image.src = regionCrest(region);
  image.alt = "";
  image.loading = "lazy";
  image.draggable = false;
  image.className = className;
  return image;
}

/**
 * Build a primary-crest-plus-badges mark.
 * - xs/sm are compact and keep at most one/two badges.
 * - md and larger show up to three secondary regions plus a +N overflow badge.
 */
export function crestMark(regions: string[], size: CrestSize = "md", className = ""): HTMLElement {
  const normalized = uniqueRegions(regions);
  const primary = normalized[0];
  const mark = document.createElement("div");
  mark.className = `rift-crest rift-crest-${size} ${className}`.trim();
  mark.dataset.count = String(normalized.length);
  mark.setAttribute("role", "img");
  mark.setAttribute("aria-label", `${normalized.join(" and ")} crest`);
  mark.style.setProperty("--region-primary", regionStyle(primary).color);
  mark.style.setProperty("--region-accent", regionStyle(primary).accent);

  const primaryWrap = document.createElement("div");
  primaryWrap.className = "rift-crest-primary";
  primaryWrap.appendChild(crestImage(primary, "rift-crest-image"));
  mark.appendChild(primaryWrap);

  const badgeLimit = size === "xs" ? 0 : size === "sm" ? 2 : 3;
  const badges = normalized.slice(1);
  if (badges.length > 0 && badgeLimit > 0) {
    const badgeRow = document.createElement("div");
    badgeRow.className = "rift-crest-badges";
    for (const region of badges.slice(0, badgeLimit)) {
      const badge = document.createElement("span");
      badge.className = "rift-crest-badge";
      badge.style.setProperty("--badge-color", regionStyle(region).color);
      badge.appendChild(crestImage(region, "rift-crest-badge-image"));
      badgeRow.appendChild(badge);
    }
    if (badges.length > badgeLimit) {
      const more = document.createElement("span");
      more.className = "rift-crest-more";
      more.textContent = `+${badges.length - badgeLimit}`;
      more.style.setProperty("--badge-color", regionStyle(badges[badgeLimit]).color);
      badgeRow.appendChild(more);
    }
    mark.appendChild(badgeRow);
  }
  return mark;
}

/** Convenience for a champion card/dossier. */
export function championCrestMark(
  champion: { profile?: { regions?: string[] }; region?: string },
  size: CrestSize = "md",
  className = "",
): HTMLElement {
  return crestMark(
    championRegions(champion as Parameters<typeof championRegions>[0]),
    size,
    className,
  );
}
