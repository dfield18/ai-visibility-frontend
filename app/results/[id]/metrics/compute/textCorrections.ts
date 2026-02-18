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

/**
 * Find the brand mentioned closest (and before) a given offset in the text.
 * Uses plain string indexOf — no regex.  Returns null if no brand found.
 */
function findNearestBrand(
  text: string,
  offset: number,
  sortedStats: BrandBreakdownRow[],
  windowSize = 200,
): BrandBreakdownRow | null {
  const start = Math.max(0, offset - windowSize);
  const window = text.slice(start, offset).toLowerCase();

  let nearest: BrandBreakdownRow | null = null;
  let nearestPos = -1;

  for (const stat of sortedStats) {
    const pos = window.lastIndexOf(stat.brand.toLowerCase());
    if (pos !== -1 && (pos > nearestPos || (pos === nearestPos && stat.brand.length > (nearest?.brand.length ?? 0)))) {
      nearest = stat;
      nearestPos = pos;
    }
  }

  return nearest;
}

// ---------------------------------------------------------------------------
// correctBrandMetricsInText  (shared — used by both tabs)
// ---------------------------------------------------------------------------

/**
 * Fix brand percentages, brand counts, and terminology in GPT-generated text.
 *
 * This is the SHARED function used by both Industry Overview and Analysis tab.
 * It only corrects wrong numbers — it does NOT annotate brand names or inject
 * definitions, which would break sentence flow in recommendation cards.
 *
 * Corrections applied (in order):
 *   1. "Brand: X/Y (Z%)" patterns — replace with computed values
 *   2. "Brand (XX%)" patterns — replace percentage with correct visibility
 *   3. "XX% <metric term>" — find nearest brand, replace percentage
 *   4. "<metric term> <connector> XX%" — find nearest brand, replace percentage
 *   5. "in XX% of" — find nearest brand, replace percentage
 *   6. Brand counts ("N unique brands", etc.)
 *   7. Terminology: "mention rate" → "visibility score"
 */
export function correctBrandMetricsInText(
  text: string,
  brandBreakdownStats: BrandBreakdownRow[],
): string {
  if (brandBreakdownStats.length === 0) return text;

  // Sort brands longest-first so partial names don't shadow full names
  const sortedStats = [...brandBreakdownStats].sort((a, b) => b.brand.length - a.brand.length);
  const leader = brandBreakdownStats[0];
  const leaderVis = simpleVis(leader).toFixed(1);

  // --- 1. Fix "Brand: X/Y (Z%)" patterns ---
  for (const stat of sortedStats) {
    const escaped = stat.brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(
      new RegExp(`(${escaped})([:\\s]+)\\d+/\\d+\\s*\\(\\d+\\.?\\d*%\\)`, 'gi'),
      `$1$2${stat.mentioned}/${stat.total} (${simpleVis(stat).toFixed(1)}%)`
    );
  }

  // --- 2. Fix "Brand (XX%)" patterns ---
  for (const stat of sortedStats) {
    const escaped = stat.brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(
      new RegExp(`(${escaped}\\s*\\()\\d+\\.?\\d*(%)`, 'gi'),
      `$1${simpleVis(stat).toFixed(1)}$2`
    );
  }

  // --- 3. Fix "XX% <metric term>" (number BEFORE metric term) ---
  // Catches: "58% of AI responses", "58% visibility score", "58% visibility",
  //          "58% mention rate", "58% of results", "58% of queries", etc.
  // Finds nearest brand in preceding text; falls back to leader.
  text = text.replace(
    /\b(\d+\.?\d*)(%\s*(?:mention rates?|visibility scores?|visibility|of (?:all )?(?:AI )?(?:responses?|results|queries|answers|platforms|models)))/gi,
    (_match: string, _num: string, suffix: string, offset: number) => {
      const nearest = findNearestBrand(text, offset, sortedStats);
      const vis = nearest ? simpleVis(nearest).toFixed(1) : leaderVis;
      return `${vis}${suffix}`;
    },
  );

  // --- 4. Fix "<metric term> <connector> XX%" (number AFTER metric term) ---
  // e.g. "visibility score of 41.7%", "visibility score at 58%", "score is 75%"
  // Finds nearest brand before the metric term; falls back to leader.
  text = text.replace(
    /((?:mention rates?|visibility scores?|visibility)\s+(?:of|at|is|around|approximately|:)\s*)(\d+\.?\d*)(%)/gi,
    (_match: string, prefix: string, _num: string, pctSign: string, offset: number) => {
      const nearest = findNearestBrand(text, offset, sortedStats);
      const vis = nearest ? simpleVis(nearest).toFixed(1) : leaderVis;
      return `${prefix}${vis}${pctSign}`;
    },
  );

  // --- 5. Fix "in XX% of" patterns (appears in / mentioned in / found in) ---
  // e.g. "appears in 58% of AI-generated responses", "mentioned in 75% of answers"
  // Finds nearest brand; falls back to leader.
  text = text.replace(
    /(\bin\s+)(\d+\.?\d*)(%)(\s+of\b)/gi,
    (_match: string, inWord: string, _num: string, pctSign: string, ofWord: string, offset: number) => {
      const nearest = findNearestBrand(text, offset, sortedStats);
      const vis = nearest ? simpleVis(nearest).toFixed(1) : leaderVis;
      return `${inWord}${vis}${pctSign}${ofWord}`;
    },
  );

  // --- 6. Fix brand counts ---
  const correctBrandCount = brandBreakdownStats.length;
  text = text.replace(/\b\d+\s+(?:unique|different|distinct)\s+brands?\b/gi, `${correctBrandCount} unique brands`);
  text = text.replace(/\b\d+\s+brands?\s+(?:were\s+)?(?:mentioned|identified|found|recommended|detected|analyzed|tracked)\b/gi, `${correctBrandCount} brands mentioned`);
  text = text.replace(/(Total\s+(?:Unique\s+)?Brands?\s*(?:Mentioned)?[:\s]+)\d+/gi, `$1${correctBrandCount}`);

  // --- 7. Terminology ---
  text = text.replace(/mention rates?/gi, 'visibility score');

  return text;
}

// ---------------------------------------------------------------------------
// correctIndustryAISummary  (OverviewTab only)
// ---------------------------------------------------------------------------

/**
 * Full correction function used only by OverviewTab's AI Analysis section.
 * Calls correctBrandMetricsInText AND also handles:
 * - Market Leader stats injection
 * - Competitive Landscape paragraph rebuild
 * - First-occurrence brand annotation (appropriate for long-form summary)
 * - Visibility score definition (first occurrence only)
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

  // --- Apply shared metric corrections (number fixes, brand counts, terminology) ---
  text = correctBrandMetricsInText(text, brandBreakdownStats);

  // --- Annotate first occurrence of each brand with visibility % ---
  // (appropriate for the long-form AI summary, NOT for recommendation cards)
  const sortedStats = [...brandBreakdownStats].sort((a, b) => b.brand.length - a.brand.length);
  const annotated = new Set<string>();
  for (const stat of sortedStats) {
    const key = stat.brand.toLowerCase();
    if (annotated.has(key)) continue;
    const escaped = stat.brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(
      new RegExp(`\\b(${escaped})\\b(?!\\s*\\()`, 'i'),
      `$1 (${simpleVis(stat).toFixed(1)}%)`
    );
    annotated.add(key);
  }

  // --- Add "visibility score" definition on first occurrence ---
  // Skip if followed by "(" (already defined) or "of <digit>" (would break sentence)
  let vsDefined = false;
  text = text.replace(/visibility scores?(?!\s*\(|\s+of\s+\d)/gi, () => {
    if (!vsDefined) { vsDefined = true; return 'visibility score (% of AI responses that mention the brand)'; }
    return 'visibility score';
  });

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
