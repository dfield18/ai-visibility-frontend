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

  // --- Apply shared metric corrections FIRST on GPT's raw text ---
  // This must run before ML injection and competitive landscape rebuild so those
  // deterministic (already-correct) sections aren't re-processed by the regex
  // number-replacement logic.
  text = correctBrandMetricsInText(text, brandBreakdownStats);

  // --- Market Leader injection ---
  // Put visibility score FIRST with its definition inline so the correct number
  // is always associated with the label, even if GPT wrote a wrong number earlier.
  const mlStats = `, with a ${simpleVis(leader).toFixed(1)}% visibility score (% of AI responses that mention the brand) and a ${leader.shareOfVoice.toFixed(1)}% share of voice (% of total brand mentions captured)`;
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

  // --- Annotate first occurrence of each brand with visibility % ---
  // (appropriate for the long-form AI summary, NOT for recommendation cards)
  // For short brands (≤3 chars like "On"), use case-sensitive matching to avoid
  // annotating common words like "on", "in", "be" (same guard as findNearestBrand).
  const sortedStats = [...brandBreakdownStats].sort((a, b) => b.brand.length - a.brand.length);
  const annotated = new Set<string>();
  for (const stat of sortedStats) {
    const key = stat.brand.toLowerCase();
    if (annotated.has(key)) continue;
    const escaped = stat.brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const flags = stat.brand.length <= 3 ? '' : 'i';
    text = text.replace(
      new RegExp(`\\b(${escaped})\\b(?!\\s*\\()`, flags),
      `$1 (${simpleVis(stat).toFixed(1)}%)`
    );
    annotated.add(key);
  }

  // --- Add "visibility score" definition on first occurrence ---
  // Skip if followed by "(" (already defined) or "of <digit>" (would break sentence).
  // The ML injection above already includes the definition inline, so check if it's
  // already present before adding it again.
  const hasVsDefinition = /visibility score\s*\(\s*%\s*of\s*AI\s*responses/i.test(text);
  if (!hasVsDefinition) {
    let vsDefined = false;
    text = text.replace(/visibility scores?(?!\s*\(|\s+of\s+\d)/gi, () => {
      if (!vsDefined) { vsDefined = true; return 'visibility score (% of AI responses that mention the brand)'; }
      return 'visibility score';
    });
  }

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
