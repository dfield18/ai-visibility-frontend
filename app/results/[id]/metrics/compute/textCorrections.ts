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

/** Provider name variants — used to detect per-provider context in GPT text. */
const PROVIDER_PATTERNS = /\b(?:chatgpt|gpt[-‑ ]?4|openai|claude|anthropic|gemini|google|perplexity|grok|llama|meta|ai\s*overviews?)\b/i;

/**
 * Check if a provider name appears in the text window before the given offset.
 * When a provider name is nearby, the percentage is likely a per-provider stat
 * (from real backend data) and should NOT be replaced with the overall visibility.
 */
function isNearProvider(text: string, offset: number, windowSize = 120): boolean {
  const start = Math.max(0, offset - windowSize);
  const window = text.slice(start, offset);
  return PROVIDER_PATTERNS.test(window);
}

/**
 * Find the brand mentioned closest (and before) a given offset in the text.
 * Uses word-boundary regex to avoid matching brand names that are substrings
 * of other words (e.g., brand "On" inside "recommendations").
 * For short brand names (≤ 3 chars), also requires the match to be capitalized
 * in the original text to skip common words like "on", "be", "it".
 */
function findNearestBrand(
  text: string,
  offset: number,
  sortedStats: BrandBreakdownRow[],
  windowSize = 200,
): BrandBreakdownRow | null {
  const start = Math.max(0, offset - windowSize);
  const window = text.slice(start, offset);
  const windowLower = window.toLowerCase();

  let nearest: BrandBreakdownRow | null = null;
  let nearestPos = -1;

  for (const stat of sortedStats) {
    const brandLower = stat.brand.toLowerCase();
    const escaped = brandLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'g');
    let match: RegExpExecArray | null;
    let lastPos = -1;
    while ((match = regex.exec(windowLower)) !== null) {
      // For short brand names (≤ 3 chars), require capitalization in the
      // original text to avoid matching common words like "on", "in", "be"
      if (brandLower.length <= 3) {
        const originalChar = window[match.index];
        if (originalChar !== originalChar.toUpperCase()) continue;
      }
      lastPos = match.index;
    }
    if (lastPos !== -1 && (lastPos > nearestPos || (lastPos === nearestPos && stat.brand.length > (nearest?.brand.length ?? 0)))) {
      nearest = stat;
      nearestPos = lastPos;
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

  // --- 3a. Fix "XX% share of voice" — replace with correct share of voice ---
  // GPT may write share-of-voice numbers; replace with the correct SoV from stats.
  text = text.replace(
    /\b(\d+\.?\d*)(%\s*(?:share of (?:voice|all mentions|total (?:brand )?mentions|mentions)))/gi,
    (_match: string, _num: string, suffix: string, offset: number) => {
      const nearest = findNearestBrand(text, offset, sortedStats);
      const stat = nearest || leader;
      return `${stat.shareOfVoice.toFixed(1)}${suffix}`;
    },
  );

  // --- 3b. Fix "share of voice of/at/is XX%" (number AFTER term) ---
  text = text.replace(
    /((?:share of (?:voice|all mentions|total (?:brand )?mentions|mentions))\s+(?:of|at|is|around|approximately|:)\s*)(\d+\.?\d*)(%)/gi,
    (_match: string, prefix: string, _num: string, pctSign: string, offset: number) => {
      const nearest = findNearestBrand(text, offset, sortedStats);
      const stat = nearest || leader;
      return `${prefix}${stat.shareOfVoice.toFixed(1)}${pctSign}`;
    },
  );

  // --- 3c. Fix "XX% <visibility metric term>" (number BEFORE metric term) ---
  // Catches: "58% of AI responses", "58% visibility score", "58% visibility",
  //          "58% mention rate", "58% of results", "58% of queries", etc.
  // Finds nearest brand in preceding text; falls back to leader.
  // Skips replacement when a provider name is nearby (per-provider stats are correct).
  text = text.replace(
    /\b(\d+\.?\d*)(%\s*(?:mention rates?|visibility scores?|visibility|of (?:all )?(?:AI )?(?:responses?|results|queries|answers|platforms|models)))/gi,
    (match: string, _num: string, suffix: string, offset: number) => {
      if (isNearProvider(text, offset)) return match;
      const nearest = findNearestBrand(text, offset, sortedStats);
      const vis = nearest ? simpleVis(nearest).toFixed(1) : leaderVis;
      return `${vis}${suffix}`;
    },
  );

  // --- 4. Fix "<visibility metric term> <connector> XX%" (number AFTER metric term) ---
  // e.g. "visibility score of 41.7%", "visibility score at 58%", "score is 75%"
  // Finds nearest brand before the metric term; falls back to leader.
  // Skips replacement when a provider name is nearby (per-provider stats are correct).
  text = text.replace(
    /((?:mention rates?|visibility scores?|visibility)\s+(?:of|at|is|around|approximately|:)\s*)(\d+\.?\d*)(%)/gi,
    (match: string, prefix: string, _num: string, pctSign: string, offset: number) => {
      if (isNearProvider(text, offset)) return match;
      const nearest = findNearestBrand(text, offset, sortedStats);
      const vis = nearest ? simpleVis(nearest).toFixed(1) : leaderVis;
      return `${prefix}${vis}${pctSign}`;
    },
  );

  // --- 5. Fix "in XX% of" patterns (appears in / mentioned in / found in) ---
  // e.g. "appears in 58% of AI-generated responses", "mentioned in 75% of answers"
  // Finds nearest brand; falls back to leader.
  // Skips replacement when a provider name is nearby (per-provider stats are correct).
  text = text.replace(
    /(\bin\s+)(\d+\.?\d*)(%)(\s+of\b)/gi,
    (match: string, inWord: string, _num: string, pctSign: string, ofWord: string, offset: number) => {
      if (isNearProvider(text, offset)) return match;
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
 * Correction function for OverviewTab's AI Analysis section.
 *
 * The GPT prompt is instructed to NOT include percentages or numbers.
 * This function:
 *   1. Prepends a short stats header with top brands + visibility scores
 *      (derived from the same BrandBreakdownRow[] data used everywhere else)
 *   2. Strips any stray percentages GPT may have included (safety net)
 *   3. Normalises terminology ("mention rate" → "visibility score")
 */
export function correctIndustryAISummary(
  text: string,
  brandBreakdownStats: BrandBreakdownRow[],
): string {
  if (brandBreakdownStats.length === 0) return text;

  // --- Build deterministic stats header from computed data ---
  const topN = brandBreakdownStats.filter(b => simpleVis(b) > 0).slice(0, 5);
  const topList = topN.map(b => `${b.brand} (${simpleVis(b).toFixed(1)}%)`).join(', ');
  const totalBrands = brandBreakdownStats.length;
  const totalResponses = brandBreakdownStats[0]?.total ?? 0;
  const statsHeader = `**Top brands**: ${topList} | ${totalBrands} brands across ${totalResponses} responses\n\n`;

  // --- Safety net: strip stray percentages GPT included despite instructions ---
  text = text.replace(/\s*\(\d+\.?\d*%\)/g, '');  // "(XX%)" parenthetical annotations
  text = text.replace(
    /\b\d+\.?\d*%\s*(?=visibility|mention|of (?:AI |all )?responses|of (?:all )?(?:results|queries|answers|platforms))/gi,
    '',
  );  // "XX% visibility …" or "XX% of responses …"
  text = text.replace(/  +/g, ' ');

  // --- Terminology ---
  text = text.replace(/mention rates?/gi, 'visibility score');

  return statsHeader + text;
}
