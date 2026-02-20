/**
 * Pure computation functions extracted from page.tsx useMemo blocks.
 * No hooks, no state, no closures — just typed input/output transforms.
 */

import type { Result, RunStatusResponse } from '../../tabs/shared';
import { stripDiacritics } from './normalization';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Canonical provider display order (by popularity) — matches page.tsx */
export const PROVIDER_ORDER = ['openai', 'gemini', 'anthropic', 'perplexity', 'grok', 'llama', 'ai_overviews'];

// ---------------------------------------------------------------------------
// availablePrompts
// ---------------------------------------------------------------------------

/** Extract unique prompts from run results. */
export function computeAvailablePrompts(runStatus: RunStatusResponse | null): string[] {
  if (!runStatus) return [];
  const prompts = new Set<string>();
  runStatus.results.forEach((r: Result) => {
    prompts.add(r.prompt);
  });
  return Array.from(prompts);
}

// ---------------------------------------------------------------------------
// availableProviders
// ---------------------------------------------------------------------------

/** Extract unique providers (non-errored) sorted by PROVIDER_ORDER, then extras. */
export function computeAvailableProviders(runStatus: RunStatusResponse | null): string[] {
  if (!runStatus) return [];
  const providers = new Set<string>();
  runStatus.results.forEach((r: Result) => {
    if (!r.error) providers.add(r.provider);
  });
  return PROVIDER_ORDER.filter(p => providers.has(p)).concat(
    Array.from(providers).filter(p => !PROVIDER_ORDER.includes(p))
  );
}

// ---------------------------------------------------------------------------
// availableBrands
// ---------------------------------------------------------------------------

/** Collect all brand names from results, excluding category name for category searches. */
export function computeAvailableBrands(runStatus: RunStatusResponse | null): string[] {
  if (!runStatus) return [];
  const isCategory = runStatus.search_type === 'category';
  const brands = new Set<string>();
  if (runStatus.brand && !isCategory) {
    brands.add(runStatus.brand);
  }
  const brandLower = runStatus.brand?.toLowerCase() || '';
  runStatus.results.forEach((r: Result) => {
    if (!r.error) {
      const rBrands = r.all_brands_mentioned?.length ? r.all_brands_mentioned : r.competitors_mentioned || [];
      rBrands.forEach((b: string) => brands.add(b));
    }
  });
  // For category searches, remove the category name itself
  if (isCategory) {
    for (const b of Array.from(brands)) {
      if (b.toLowerCase() === brandLower) brands.delete(b);
    }
  }
  return Array.from(brands).sort();
}

// ---------------------------------------------------------------------------
// correctedResults
// ---------------------------------------------------------------------------

/**
 * Fix brand_mentioned for results where the backend missed a mention
 * (e.g., AI Overviews responses where the brand appears in supplemental sections).
 */
export function computeCorrectedResults(runStatus: RunStatusResponse | null): Result[] {
  if (!runStatus) return [];
  const brandLower = stripDiacritics(runStatus.brand).toLowerCase();
  return runStatus.results.map((result: Result) => {
    if (!result.brand_mentioned && result.response_text && !result.error) {
      if (stripDiacritics(result.response_text).toLowerCase().includes(brandLower)) {
        return { ...result, brand_mentioned: true };
      }
    }
    return result;
  });
}

// ---------------------------------------------------------------------------
// globallyFilteredResults
// ---------------------------------------------------------------------------

/**
 * Apply global LLM / prompt / brand filters to corrected results.
 */
export function computeGloballyFilteredResults(
  runStatus: RunStatusResponse | null,
  correctedResults: Result[],
  globalLlmFilter: string,
  globalPromptFilter: string,
  globalBrandFilter: string,
): Result[] {
  if (!runStatus) return [];

  return correctedResults.filter((result: Result) => {
    // LLM filter
    if (globalLlmFilter !== 'all' && result.provider !== globalLlmFilter) return false;

    // Prompt filter
    if (globalPromptFilter !== 'all' && result.prompt !== globalPromptFilter) return false;

    // Brand filter - check if brand is mentioned in this result
    if (globalBrandFilter !== 'all') {
      const isBrandMentioned = result.brand_mentioned && globalBrandFilter === runStatus.brand;
      const isCompetitorMentioned = result.all_brands_mentioned?.length ? result.all_brands_mentioned.includes(globalBrandFilter) : result.competitors_mentioned?.includes(globalBrandFilter);
      if (!isBrandMentioned && !isCompetitorMentioned) return false;
    }

    return true;
  });
}

// ---------------------------------------------------------------------------
// promptCost
// ---------------------------------------------------------------------------

/** Sum per-result LLM costs (excluding errored / no-cost results). */
export function computePromptCost(runStatus: RunStatusResponse | null): number {
  if (!runStatus) return 0;
  return runStatus.results
    .filter((r: Result) => !r.error && r.cost)
    .reduce((sum: number, r: Result) => sum + (r.cost || 0), 0);
}

// ---------------------------------------------------------------------------
// aiOverviewUnavailableCount
// ---------------------------------------------------------------------------

/** Count AI Overview results that errored (unavailable). */
export function computeAiOverviewUnavailableCount(
  runStatus: RunStatusResponse | null,
  globallyFilteredResults: Result[],
): number {
  if (!runStatus) return 0;
  return globallyFilteredResults.filter(
    (r: Result) => r.provider === 'ai_overviews' && r.error
  ).length;
}

// ---------------------------------------------------------------------------
// trackedBrands
// ---------------------------------------------------------------------------

/**
 * Build the set of tracked competitors (ones that were configured for tracking).
 * All entries are lowercased for case-insensitive comparison.
 */
export function computeTrackedBrands(runStatus: RunStatusResponse | null): Set<string> {
  if (!runStatus) return new Set<string>();
  const tracked = new Set<string>();
  if (runStatus.brand) {
    tracked.add(runStatus.brand.toLowerCase());
  }
  runStatus.results.forEach((r: Result) => {
    if (!r.error) {
      const rBrands = r.all_brands_mentioned?.length ? r.all_brands_mentioned : r.competitors_mentioned || [];
      rBrands.forEach((c: string) => tracked.add(c.toLowerCase()));
    }
  });
  return tracked;
}

// ---------------------------------------------------------------------------
// filteredAvailableBrands
// ---------------------------------------------------------------------------

/** Filter availableBrands by removing user-excluded brands. */
export function computeFilteredAvailableBrands(
  availableBrands: string[],
  excludedBrands: Set<string>,
): string[] {
  return availableBrands.filter(b => !excludedBrands.has(b));
}

// ---------------------------------------------------------------------------
// filteredTrackedBrands
// ---------------------------------------------------------------------------

/** Filter trackedBrands by removing user-excluded brands (case-insensitive). */
export function computeFilteredTrackedBrands(
  trackedBrands: Set<string>,
  excludedBrands: Set<string>,
): Set<string> {
  return new Set([...trackedBrands].filter(b => !Array.from(excludedBrands).some(eb => eb.toLowerCase() === b)));
}

// ---------------------------------------------------------------------------
// relatedIssues (issue reports only)
// ---------------------------------------------------------------------------

/**
 * For issue search types, extract related issues from competitors_mentioned,
 * excluding the searched issue itself. Sorted by frequency desc, then alphabetically.
 * Returns empty array for non-issue types.
 */
export function computeRelatedIssues(
  runStatus: RunStatusResponse | null,
  globallyFilteredResults: Result[],
): string[] {
  if (!runStatus || runStatus.search_type !== 'issue') return [];
  const searchedLower = (runStatus.brand || '').toLowerCase();
  const counts: Record<string, number> = {};
  for (const r of globallyFilteredResults) {
    if (r.error) continue;
    for (const issue of r.competitors_mentioned || []) {
      if (issue.toLowerCase() === searchedLower) continue;
      counts[issue] = (counts[issue] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name);
}
