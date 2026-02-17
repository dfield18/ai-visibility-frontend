/**
 * Brand name normalization functions.
 * Merges diacritical variants ("Condé" vs "Conde") and prefix variants
 * ("National Geographic" + "National Geographic Traveler").
 * Pure functions — no hooks, no state, no closures.
 */

import type { Result } from '../../tabs/shared';
import type { BrandSentiment } from '@/lib/types';

/** Minimum character length for a brand name to be considered as a prefix candidate. */
const MIN_PREFIX_LENGTH = 10;

/** Sentiment merge priority — when two keys collapse, keep the higher-priority one. */
const SENTIMENT_PRIORITY: Record<string, number> = {
  strong_endorsement: 5,
  positive_endorsement: 4,
  neutral_mention: 3,
  conditional: 2,
  negative_comparison: 1,
  not_mentioned: 0,
};

/** Strip diacritical marks using Unicode NFD decomposition. "Condé" → "Conde" */
export function stripDiacritics(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Build a normalization map from all brand names found across results.
 * Returns Map<variant, canonical> (no identity mappings).
 *
 * Two merge strategies:
 * 1. Diacritical: "Condé Nast Traveler" and "Conde Nast Traveler" merge
 * 2. Prefix: "National Geographic Traveler" merges into "National Geographic"
 *    (only for multi-word names >= MIN_PREFIX_LENGTH chars)
 */
export function buildBrandNormalizationMap(results: Result[]): Map<string, string> {
  // Step 1: Collect all brand names and their frequencies
  const brandCounts = new Map<string, number>();
  for (const r of results) {
    if (r.error) continue;
    const brands = r.all_brands_mentioned?.length ? r.all_brands_mentioned : r.competitors_mentioned || [];
    for (const b of brands) {
      brandCounts.set(b, (brandCounts.get(b) || 0) + 1);
    }
    // Also count brands from competitor_sentiments keys
    if (r.competitor_sentiments) {
      for (const b of Object.keys(r.competitor_sentiments)) {
        if (!brandCounts.has(b)) brandCounts.set(b, 0);
      }
    }
  }

  if (brandCounts.size === 0) return new Map();

  const mapping = new Map<string, string>();

  // Step 2: Group by accent-stripped lowercase form
  const accentGroups = new Map<string, string[]>();
  for (const brand of brandCounts.keys()) {
    const key = stripDiacritics(brand).toLowerCase();
    if (!accentGroups.has(key)) accentGroups.set(key, []);
    accentGroups.get(key)!.push(brand);
  }

  // For groups with multiple variants, pick canonical
  for (const [, variants] of accentGroups) {
    if (variants.length <= 1) continue;
    // Sort: most frequent → fewest non-ASCII chars → shortest
    variants.sort((a, b) => {
      const countDiff = (brandCounts.get(b) || 0) - (brandCounts.get(a) || 0);
      if (countDiff !== 0) return countDiff;
      const nonAsciiA = (a.match(/[^\x00-\x7F]/g) || []).length;
      const nonAsciiB = (b.match(/[^\x00-\x7F]/g) || []).length;
      if (nonAsciiA !== nonAsciiB) return nonAsciiA - nonAsciiB;
      return a.length - b.length;
    });
    const canonical = variants[0];
    for (let i = 1; i < variants.length; i++) {
      mapping.set(variants[i], canonical);
    }
  }

  // Step 3: Prefix merge on canonical names
  // Resolve all current mappings first to get the set of canonical names
  const canonicalSet = new Set<string>();
  for (const brand of brandCounts.keys()) {
    canonicalSet.add(mapping.get(brand) ?? brand);
  }
  const canonicals = Array.from(canonicalSet).sort((a, b) => a.length - b.length);

  for (let i = 0; i < canonicals.length; i++) {
    const shorter = canonicals[i];
    // Only consider multi-word names >= MIN_PREFIX_LENGTH
    if (shorter.length < MIN_PREFIX_LENGTH || !shorter.includes(' ')) continue;
    const shorterNorm = stripDiacritics(shorter).toLowerCase();

    for (let j = i + 1; j < canonicals.length; j++) {
      const longer = canonicals[j];
      const longerNorm = stripDiacritics(longer).toLowerCase();
      // Check word-boundary prefix: shorter + " " must start the longer name
      if (longerNorm.startsWith(shorterNorm + ' ')) {
        // Map longer → shorter
        mapping.set(longer, shorter);
        // Update any existing mappings pointing to the longer name
        for (const [key, val] of mapping) {
          if (val === longer) mapping.set(key, shorter);
        }
      }
    }
  }

  // Remove identity mappings (shouldn't exist but defensive)
  for (const [key, val] of mapping) {
    if (key === val) mapping.delete(key);
  }

  return mapping;
}

/** Pick higher-priority sentiment when merging two values for the same brand. */
function mergeSentiment(a: BrandSentiment, b: BrandSentiment): BrandSentiment {
  return (SENTIMENT_PRIORITY[a] ?? 0) >= (SENTIMENT_PRIORITY[b] ?? 0) ? a : b;
}

/** Deduplicate a string array while preserving order (first occurrence wins). */
function dedup(arr: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of arr) {
    if (!seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }
  return result;
}

/**
 * Apply brand normalization to all brand-containing fields on each result.
 * Returns new Result[] with normalized brand names (immutable — does not mutate input).
 */
export function applyBrandNormalization(
  results: Result[],
  normMap: Map<string, string>,
): Result[] {
  if (normMap.size === 0) return results;

  return results.map(r => {
    let changed = false;

    // Normalize all_brands_mentioned
    let newAllBrands = r.all_brands_mentioned;
    if (r.all_brands_mentioned && r.all_brands_mentioned.length > 0) {
      const mapped = r.all_brands_mentioned.map(b => {
        const canonical = normMap.get(b);
        if (canonical) { changed = true; return canonical; }
        return b;
      });
      newAllBrands = changed ? dedup(mapped) : r.all_brands_mentioned;
    }

    // Normalize competitors_mentioned
    let compChanged = false;
    let newCompetitors = r.competitors_mentioned;
    if (r.competitors_mentioned && r.competitors_mentioned.length > 0) {
      const mapped = r.competitors_mentioned.map(b => {
        const canonical = normMap.get(b);
        if (canonical) { compChanged = true; return canonical; }
        return b;
      });
      if (compChanged) {
        changed = true;
        newCompetitors = dedup(mapped);
      }
    }

    // Normalize competitor_sentiments keys
    let newSentiments = r.competitor_sentiments;
    if (r.competitor_sentiments) {
      let sentChanged = false;
      const merged: Record<string, BrandSentiment> = {};
      for (const [brand, sentiment] of Object.entries(r.competitor_sentiments)) {
        const canonical = normMap.get(brand);
        const key = canonical ?? brand;
        if (canonical) sentChanged = true;
        if (merged[key]) {
          merged[key] = mergeSentiment(merged[key], sentiment);
        } else {
          merged[key] = sentiment;
        }
      }
      if (sentChanged) {
        changed = true;
        newSentiments = merged;
      }
    }

    // Normalize source_brand_sentiments inner keys
    let newSourceSentiments = r.source_brand_sentiments;
    if (r.source_brand_sentiments) {
      let srcChanged = false;
      const mergedSrc: Record<string, Record<string, BrandSentiment>> = {};
      for (const [source, brandMap] of Object.entries(r.source_brand_sentiments)) {
        const mergedInner: Record<string, BrandSentiment> = {};
        for (const [brand, sentiment] of Object.entries(brandMap)) {
          const canonical = normMap.get(brand);
          const key = canonical ?? brand;
          if (canonical) srcChanged = true;
          if (mergedInner[key]) {
            mergedInner[key] = mergeSentiment(mergedInner[key], sentiment);
          } else {
            mergedInner[key] = sentiment;
          }
        }
        mergedSrc[source] = mergedInner;
      }
      if (srcChanged) {
        changed = true;
        newSourceSentiments = mergedSrc;
      }
    }

    if (!changed) return r;

    return {
      ...r,
      all_brands_mentioned: newAllBrands,
      competitors_mentioned: newCompetitors,
      competitor_sentiments: newSentiments,
      source_brand_sentiments: newSourceSentiments,
    };
  });
}
