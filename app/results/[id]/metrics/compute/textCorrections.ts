/**
 * Shared text correction utilities for fixing GPT-hallucinated metrics
 * in AI-generated analysis text. Used by both OverviewTab (AI Analysis section)
 * and RecommendationsTab (Analysis tab for industry reports).
 */

import type { BrandBreakdownRow } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Simple visibility: mentioned / total * 100 (matches overviewMetrics.overallVisibility) */
const simpleVis = (stat: { mentioned: number; total: number }) =>
  stat.total > 0 ? (stat.mentioned / stat.total) * 100 : 0;

/** Build sorted brand regexes (longest first to avoid partial matches). */
function buildBrandRegexes(stats: BrandBreakdownRow[]) {
  const sorted = [...stats].sort((a, b) => b.brand.length - a.brand.length);
  return sorted.map(b => ({
    stat: b,
    escaped: b.brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  }));
}

// ---------------------------------------------------------------------------
// correctBrandMetricsInText
// ---------------------------------------------------------------------------

/**
 * Fix brand percentages, brand counts, and terminology in GPT-generated text.
 * Shared between Industry Overview (AI Analysis) and Analysis tab (recommendations).
 *
 * Does NOT include Market Leader injection or Competitive Landscape paragraph
 * rebuild — those are specific to the AI summary format (see correctIndustryAISummary).
 */
export function correctBrandMetricsInText(
  text: string,
  brandBreakdownStats: BrandBreakdownRow[],
): string {
  if (brandBreakdownStats.length === 0) return text;

  const brandRegexes = buildBrandRegexes(brandBreakdownStats);
  const leader = brandBreakdownStats[0];

  // --- Fix "Brand: X/Y (Z%)" patterns — replace with correct values ---
  for (const { stat, escaped } of brandRegexes) {
    text = text.replace(
      new RegExp(`(${escaped})([:\\s]+)\\d+/\\d+\\s*\\(\\d+\\.?\\d*%\\)`, 'gi'),
      `$1$2${stat.mentioned}/${stat.total} (${simpleVis(stat).toFixed(1)}%)`
    );
  }

  // --- Fix "Brand (XX%)" patterns — replace percentage in parens after brand name ---
  for (const { stat, escaped } of brandRegexes) {
    text = text.replace(
      new RegExp(`(${escaped}\\s*\\()\\d+\\.?\\d*(%)`, 'gi'),
      `$1${simpleVis(stat).toFixed(1)}$2`
    );
  }

  // --- Annotate each brand's first occurrence with its correct visibility score ---
  const annotated = new Set<string>();
  for (const { stat, escaped } of brandRegexes) {
    const key = stat.brand.toLowerCase();
    if (annotated.has(key)) continue;
    text = text.replace(
      new RegExp(`\\b(${escaped})\\b(?!\\s*\\()`, 'i'),
      `$1 (${simpleVis(stat).toFixed(1)}%)`
    );
    annotated.add(key);
  }

  // --- Fix market-dominance statements that refer to the leader without naming a brand ---
  // e.g. "no single brand dominating more than 58.3% of AI responses"
  // e.g. "the leading brand captures 58.3% of responses"
  const leaderVis = simpleVis(leader).toFixed(1);
  text = text.replace(
    /(?:more than|captures?|dominat(?:es?|ing)|leads? with|reaching)\s+(\d+\.?\d*)(%\s*(?:of (?:all )?(?:AI )?responses))/gi,
    (_match: string, _num: string, suffix: string) => `more than ${leaderVis}${suffix}`
  );

  // --- Fix standalone "XX% visibility/mention" in remaining paragraphs ---
  // Find nearest preceding brand; if ambiguous, strip the number.
  // Falls back to market leader when no brand is found nearby.
  text = text.replace(
    /\b(\d+\.?\d*)(%\s*(?:mention rate|visibility score|of (?:all )?(?:AI )?responses))/gi,
    (match: string, _num: string, suffix: string, offset: number) => {
      const start = Math.max(0, offset - 150);
      const before = text.slice(start, offset);
      const hits: { stat: typeof leader; pos: number }[] = [];
      for (const { stat, escaped } of brandRegexes) {
        const re = new RegExp(escaped, 'gi');
        let m;
        while ((m = re.exec(before)) !== null) {
          hits.push({ stat, pos: m.index });
        }
      }
      if (hits.length === 0) {
        // No brand nearby — use market leader as fallback
        return `${leaderVis}${suffix}`;
      }
      hits.sort((a, b) => b.pos - a.pos);
      const closest = hits[0];
      const isAmbiguous = hits.some(h =>
        h.stat.brand !== closest.stat.brand &&
        Math.abs(h.pos - closest.pos) < 40
      );
      if (isAmbiguous) return suffix.replace(/^%\s*/, '');
      return `${simpleVis(closest.stat).toFixed(1)}${suffix}`;
    },
  );

  // --- Replace brand counts — catch all variations GPT might use ---
  const correctBrandCount = brandBreakdownStats.length;
  // "23 unique/different/distinct brands"
  text = text.replace(/\b\d+\s+(?:unique|different|distinct)\s+brands?\b/gi, `${correctBrandCount} unique brands`);
  // "23 brands were mentioned/identified/found/recommended/analyzed"
  text = text.replace(/\b\d+\s+brands?\s+(?:were\s+)?(?:mentioned|identified|found|recommended|detected|analyzed|tracked)\b/gi, `${correctBrandCount} brands mentioned`);
  // "Total Unique Brands (Mentioned): 23"
  text = text.replace(/(Total\s+(?:Unique\s+)?Brands?\s*(?:Mentioned)?[:\s]+)\d+/gi, `$1${correctBrandCount}`);

  // --- Terminology: "mention rate" → "visibility score" ---
  text = text.replace(/mention rates?/gi, 'visibility score');

  // --- Add parenthetical definition on first "visibility score" only ---
  let vsDefined = false;
  text = text.replace(/visibility scores?(?!\s*\()/gi, () => {
    if (!vsDefined) { vsDefined = true; return 'visibility score (% of AI responses that mention the brand)'; }
    return 'visibility score';
  });

  return text;
}

// ---------------------------------------------------------------------------
// correctIndustryAISummary
// ---------------------------------------------------------------------------

/**
 * Full correction function used only by OverviewTab's AI Analysis section.
 * Calls correctBrandMetricsInText AND also handles:
 * - Market Leader stats injection
 * - Competitive Landscape paragraph rebuild
 * - "suggest/suggests" variation
 */
export function correctIndustryAISummary(
  text: string,
  brandBreakdownStats: BrandBreakdownRow[],
): string {
  if (brandBreakdownStats.length === 0) return text;

  const leader = brandBreakdownStats[0];

  // --- Market Leader injection ---
  const mlStats = `, with a ${leader.shareOfVoice.toFixed(1)}% share of all mentions (% of total brand mentions captured by this brand) and a ${simpleVis(leader).toFixed(1)}% visibility score`;
  text = text.replace(/(Market leader\s*[-–—]\s*[\s\S]+?)\.(?!\d)/i, `$1${mlStats}.`);

  // --- Replace "Competitive landscape" paragraph with deterministic text ---
  const scoreGroups = new Map<string, string[]>();
  const scoreOrder: string[] = [];
  for (const b of brandBreakdownStats) {
    const key = simpleVis(b).toFixed(1);
    if (!scoreGroups.has(key)) { scoreGroups.set(key, []); scoreOrder.push(key); }
    scoreGroups.get(key)!.push(b.brand);
  }
  const compSentences: string[] = [];
  for (const key of scoreOrder) {
    const brands = scoreGroups.get(key)!;
    const score = parseFloat(key);
    if (score <= 0) continue;
    const list = brands.length <= 2
      ? brands.map(b => `${b} (${key}%)`).join(' and ')
      : brands.slice(0, -1).map(b => `${b} (${key}%)`).join(', ') + ', and ' + `${brands[brands.length - 1]} (${key}%)`;
    if (score >= 99.9) {
      compSentences.push(`${list} ${brands.length === 1 ? 'leads' : 'lead'} with perfect visibility across all AI platforms`);
    } else if (score >= 75) {
      compSentences.push(`${list} ${brands.length === 1 ? 'follows' : 'follow'} with strong visibility`);
    } else if (score >= 50) {
      compSentences.push(`${list} ${brands.length === 1 ? 'maintains' : 'maintain'} moderate visibility`);
    } else if (score >= 25) {
      compSentences.push(`${list} ${brands.length === 1 ? 'shows' : 'show'} limited visibility`);
    } else {
      compSentences.push(`${list} ${brands.length === 1 ? 'has' : 'have'} minimal visibility`);
    }
  }
  if (compSentences.length > 0) {
    text = text.replace(
      /Competitive landscape\s*[-–—]\s*[\s\S]*?(?=\n\n|$)/i,
      `Competitive landscape – ${compSentences.join('. ')}.`
    );
  }

  // --- Apply shared brand metric corrections ---
  text = correctBrandMetricsInText(text, brandBreakdownStats);

  // --- Vary repeated "suggest/suggests" usage ---
  const alternatives = ['indicates', 'points to', 'reflects'];
  let altIdx = 0;
  let count = 0;
  text = text.replace(/\b(suggests?)\b/gi, (match) => {
    count++;
    if (count === 1) return match;
    return alternatives[(altIdx++) % alternatives.length];
  });

  return text;
}
