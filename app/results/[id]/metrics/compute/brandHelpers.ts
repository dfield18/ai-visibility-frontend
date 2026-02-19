/**
 * Canonical brand extraction, mention counting, and share-of-voice helpers.
 *
 * ALL compute functions must use these helpers instead of re-deriving brand
 * lists or mention counts from raw Result objects. This eliminates the
 * inconsistencies where different files used text search, different array
 * fields, or skipped isCategoryName / excludedBrands filtering.
 *
 * Reference implementation: competitive.ts already uses the correct pattern
 * (array fields + isCategoryName + excludedBrands). These helpers replicate
 * that pattern as shared, reusable functions.
 */

import type { Result } from '../../tabs/shared';
import { isCategoryName } from '../../tabs/shared';

// Re-export getEffectiveSentiment so there's one import location for brand helpers
export { getEffectiveSentiment, hasEffectiveSentiment } from './sentiment';

// ---------------------------------------------------------------------------
// getResultBrands — canonical brand list from a single result
// ---------------------------------------------------------------------------

/**
 * Extract the brand list from a single result using array fields only
 * (never text search). Applies isCategoryName + excludedBrands filtering.
 *
 * For non-category reports, the searched brand is included via
 * `result.brand_mentioned` (which is a boolean for the searched brand).
 * Competitors come from `all_brands_mentioned` with fallback to
 * `competitors_mentioned`.
 *
 * For category reports, `brand_mentioned` is the category-level flag
 * (not a real brand) so we skip it and only use array fields, filtering
 * out the category name.
 */
export function getResultBrands(
  result: Result,
  searchedBrand: string,
  isCategory: boolean,
  excludedBrands: Set<string>,
): string[] {
  const brands: string[] = [];

  // Add searched brand if mentioned (non-category only)
  if (!isCategory && result.brand_mentioned && !excludedBrands.has(searchedBrand)) {
    brands.push(searchedBrand);
  }

  // Get competitor/brand array with standard fallback
  const rBrands = result.all_brands_mentioned?.length
    ? result.all_brands_mentioned
    : result.competitors_mentioned || [];

  for (const b of rBrands) {
    if (excludedBrands.has(b)) continue;
    if (isCategory && isCategoryName(b, searchedBrand)) continue;
    // For non-category, skip searched brand in competitor arrays (already added above via brand_mentioned)
    if (!isCategory && b === searchedBrand) continue;
    if (!brands.includes(b)) {
      brands.push(b);
    }
  }

  return brands;
}

// ---------------------------------------------------------------------------
// getAllBrandsFromResults — unique brand set across all results
// ---------------------------------------------------------------------------

/**
 * Build a deduplicated brand set across all results, applying the same
 * filtering rules as getResultBrands.
 */
export function getAllBrandsFromResults(
  results: Result[],
  searchedBrand: string,
  isCategory: boolean,
  excludedBrands: Set<string>,
): Set<string> {
  const allBrands = new Set<string>();

  for (const result of results) {
    if (result.error) continue;
    const brands = getResultBrands(result, searchedBrand, isCategory, excludedBrands);
    for (const b of brands) {
      allBrands.add(b);
    }
  }

  return allBrands;
}

// ---------------------------------------------------------------------------
// isBrandMentionedInResult — whether a specific brand appears in a result
// ---------------------------------------------------------------------------

/**
 * Check if a specific brand is mentioned in a result. Uses array fields only,
 * never text search. For the searched brand in non-category reports, uses
 * `result.brand_mentioned`.
 */
export function isBrandMentionedInResult(
  result: Result,
  brand: string,
  searchedBrand: string,
  isCategory: boolean,
): boolean {
  const isSearchedBrand = !isCategory && brand === searchedBrand;
  if (isSearchedBrand) {
    return !!result.brand_mentioned;
  }
  return result.all_brands_mentioned?.length
    ? result.all_brands_mentioned.includes(brand)
    : !!result.competitors_mentioned?.includes(brand);
}

// ---------------------------------------------------------------------------
// countTotalBrandMentionSlots — share of voice denominator
// ---------------------------------------------------------------------------

/**
 * Count the total number of brand mention "slots" across all results.
 * This is the denominator for share of voice calculations.
 *
 * For non-category reports:
 *   - Each result contributes: brand_mentioned (0 or 1) + competitor array length
 *   - This means if a result mentions the searched brand + 3 competitors,
 *     that's 4 total mention slots.
 *
 * For category reports:
 *   - Only array brands (minus category name and excluded brands) count.
 *   - brand_mentioned is NOT counted (it's the category-level flag).
 */
export function countTotalBrandMentionSlots(
  results: Result[],
  searchedBrand: string,
  isCategory: boolean,
  excludedBrands: Set<string>,
): number {
  let total = 0;

  for (const result of results) {
    if (result.error) continue;

    // Searched brand slot (non-category only)
    if (!isCategory && result.brand_mentioned && !excludedBrands.has(searchedBrand)) {
      total++;
    }

    // Competitor/brand array slots
    const rBrands = result.all_brands_mentioned?.length
      ? result.all_brands_mentioned
      : result.competitors_mentioned || [];

    for (const b of rBrands) {
      if (excludedBrands.has(b)) continue;
      if (isCategory && isCategoryName(b, searchedBrand)) continue;
      // For non-category, skip searched brand in competitor arrays (already counted above)
      if (!isCategory && b === searchedBrand) continue;
      total++;
    }
  }

  return total;
}

// ---------------------------------------------------------------------------
// countBrandMentions — share of voice numerator for one brand
// ---------------------------------------------------------------------------

/**
 * Count how many results mention a specific brand. Uses array fields only.
 * Applies the same exclusion guards as the SoV denominator so numerator
 * and denominator use identical filtering semantics.
 */
export function countBrandMentions(
  results: Result[],
  brand: string,
  searchedBrand: string,
  isCategory: boolean,
  excludedBrands: Set<string> = new Set(),
): number {
  if (excludedBrands.has(brand)) return 0;
  if (isCategory && isCategoryName(brand, searchedBrand)) return 0;

  let count = 0;

  for (const result of results) {
    if (result.error) continue;
    if (isBrandMentionedInResult(result, brand, searchedBrand, isCategory)) {
      count++;
    }
  }

  return count;
}

// ---------------------------------------------------------------------------
// computeBrandShareOfVoice — single canonical SoV calculation
// ---------------------------------------------------------------------------

/**
 * Compute the share of voice percentage for a single brand.
 * SoV = (brand's mention count) / (total mention slots across all brands) * 100
 */
export function computeBrandShareOfVoice(
  brand: string,
  results: Result[],
  searchedBrand: string,
  isCategory: boolean,
  excludedBrands: Set<string>,
): number {
  const totalSlots = countTotalBrandMentionSlots(results, searchedBrand, isCategory, excludedBrands);
  if (totalSlots === 0) return 0;

  const brandMentions = countBrandMentions(results, brand, searchedBrand, isCategory, excludedBrands);
  return (brandMentions / totalSlots) * 100;
}
