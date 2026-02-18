/**
 * Pure computation functions extracted from page.tsx and ReferenceTab.tsx useMemo blocks.
 * No hooks, no state, no closures — only typed inputs and outputs.
 */

import type { Result, Source, RunStatusResponse } from '../../tabs/shared';
import { isCategoryName } from '../../tabs/shared';
import type { SourceGapRow, SourceSentimentGapRow } from '../types';

// ---------------------------------------------------------------------------
// sourceGapAnalysis  (page.tsx line 2171 / ReferenceTab.tsx line 150)
// ---------------------------------------------------------------------------

export function computeSourceGapAnalysis(
  runStatus: RunStatusResponse | null,
  globallyFilteredResults: Result[],
  sourceGapProviderFilter: string,
  sourceGapPromptFilter: string,
  excludedBrands: Set<string>,
): SourceGapRow[] {
  if (!runStatus) return [];

  const searchedBrand = runStatus.brand;

  // Get results with sources, optionally filtered by provider and prompt
  const resultsWithSources = globallyFilteredResults.filter(
    (r: Result) => !r.error && r.sources && r.sources.length > 0 &&
      (sourceGapProviderFilter === 'all' || r.provider === sourceGapProviderFilter) &&
      (sourceGapPromptFilter === 'all' || r.prompt === sourceGapPromptFilter)
  );

  if (resultsWithSources.length === 0) return [];

  // Helper function to extract snippet around a brand mention
  const extractSnippet = (text: string, brandName: string, contextChars: number = 80): string | null => {
    const lowerText = text.toLowerCase();
    const lowerBrand = brandName.toLowerCase();
    const index = lowerText.indexOf(lowerBrand);
    if (index === -1) return null;

    const start = Math.max(0, index - contextChars);
    const end = Math.min(text.length, index + brandName.length + contextChars);

    let snippet = text.substring(start, end);
    if (start > 0) snippet = '...' + snippet;
    if (end < text.length) snippet = snippet + '...';

    return snippet;
  };

  // Track per-source stats
  const sourceStats: Record<string, {
    domain: string;
    totalCitations: number; // Number of responses citing this source
    brandCitations: number; // Number of responses where brand is mentioned AND this source is cited
    competitorCitations: Record<string, number>; // Per-competitor citation counts
    urls: Map<string, { url: string; title: string; count: number }>; // Individual URLs
    snippets: Array<{ brand: string; snippet: string; isBrand: boolean; provider: string; prompt: string; responseText: string; resultId: string }>; // Response snippets
  }> = {};

  // Process each result
  resultsWithSources.forEach((r: Result) => {
    if (!r.sources) return;

    // Get unique domains in this response and track URLs
    const domainsInResponse = new Set<string>();
    const urlsInResponse: { domain: string; url: string; title: string }[] = [];

    r.sources.forEach((source: Source) => {
      if (!source.url) return;
      try {
        const hostname = new URL(source.url).hostname.replace(/^www\./, '');
        domainsInResponse.add(hostname);
        urlsInResponse.push({ domain: hostname, url: source.url, title: source.title || '' });
      } catch {
        // Skip invalid URLs
      }
    });

    // For each domain, track brand and competitor mentions
    domainsInResponse.forEach(domain => {
      if (!sourceStats[domain]) {
        sourceStats[domain] = {
          domain,
          totalCitations: 0,
          brandCitations: 0,
          competitorCitations: {},
          urls: new Map(),
          snippets: [],
        };
      }

      sourceStats[domain].totalCitations += 1;

      // Track URLs for this domain
      urlsInResponse
        .filter(u => u.domain === domain)
        .forEach(u => {
          const existing = sourceStats[domain].urls.get(u.url);
          if (existing) {
            existing.count += 1;
          } else {
            sourceStats[domain].urls.set(u.url, { url: u.url, title: u.title, count: 1 });
          }
        });

      // Check if searched brand is mentioned and extract snippet
      if (r.brand_mentioned && r.response_text) {
        sourceStats[domain].brandCitations += 1;
        const snippet = extractSnippet(r.response_text, searchedBrand);
        if (snippet) {
          sourceStats[domain].snippets.push({
            brand: searchedBrand,
            snippet,
            isBrand: true,
            provider: r.provider,
            prompt: r.prompt,
            responseText: r.response_text,
            resultId: r.id,
          });
        }
      }

      // Check competitors mentioned and extract snippets
      const isCategory = runStatus.search_type === 'category';
      const rCompBrands = (r.all_brands_mentioned?.length ? r.all_brands_mentioned : r.competitors_mentioned || [])
        .filter(b => b.toLowerCase() !== (runStatus?.brand || '').toLowerCase() && !excludedBrands.has(b) && !(isCategory && isCategoryName(b, runStatus?.brand || '')));
      if (rCompBrands.length > 0 && r.response_text) {
        const responseText = r.response_text; // Capture for TypeScript narrowing
        rCompBrands.forEach(competitor => {
          if (!sourceStats[domain].competitorCitations[competitor]) {
            sourceStats[domain].competitorCitations[competitor] = 0;
          }
          sourceStats[domain].competitorCitations[competitor] += 1;

          const snippet = extractSnippet(responseText, competitor);
          if (snippet) {
            sourceStats[domain].snippets.push({
              brand: competitor,
              snippet,
              isBrand: false,
              provider: r.provider,
              prompt: r.prompt,
              responseText,
              resultId: r.id,
            });
          }
        });
      }
    });
  });

  // Convert to array with calculated metrics
  return Object.values(sourceStats)
    .filter(stat => stat.totalCitations >= 2) // Only include sources with at least 2 citations
    .map(stat => {
      const brandRate = (stat.brandCitations / stat.totalCitations) * 100;

      // Find top competitor for this source
      let topCompetitor = '';
      let topCompetitorCount = 0;
      Object.entries(stat.competitorCitations).forEach(([competitor, count]) => {
        if (count > topCompetitorCount) {
          topCompetitor = competitor;
          topCompetitorCount = count;
        }
      });

      const topCompetitorRate = stat.totalCitations > 0
        ? (topCompetitorCount / stat.totalCitations) * 100
        : 0;

      // Gap: positive means competitor is cited more, negative means brand is cited more
      const gap = topCompetitorRate - brandRate;

      // Opportunity Score: Higher when gap is large AND source is frequently cited
      // Normalize by total citations to weight more important sources higher
      const opportunityScore = gap > 0
        ? (gap / 100) * Math.log10(stat.totalCitations + 1) * 100
        : 0;

      // Convert URLs map to sorted array
      const urlDetails = Array.from(stat.urls.values())
        .sort((a, b) => b.count - a.count);

      return {
        domain: stat.domain,
        totalCitations: stat.totalCitations,
        brandRate,
        topCompetitor,
        topCompetitorRate,
        gap,
        opportunityScore,
        urls: urlDetails,
        snippets: stat.snippets,
      };
    })
    .filter(stat => stat.gap > 0) // Only show sources where competitors have an advantage
    .sort((a, b) => b.opportunityScore - a.opportunityScore);
}

// ---------------------------------------------------------------------------
// sourceSentimentGapAnalysis  (page.tsx line 2358)
// ---------------------------------------------------------------------------

export function computeSourceSentimentGapAnalysis(
  runStatus: RunStatusResponse | null,
  globallyFilteredResults: Result[],
  sourceSentimentGapProviderFilter: string,
  sourceSentimentGapPromptFilter: string,
  sentimentComparisonBrand: string,
  excludedBrands: Set<string>,
): SourceSentimentGapRow[] {
  if (!runStatus) return [];

  const searchedBrand = runStatus.brand;
  const isCategory = runStatus.search_type === 'category';
  // Use selected brand or default to searched brand (for industry, default resolved after data collection)
  let comparisonBrand = sentimentComparisonBrand || (isCategory ? '' : runStatus.brand);

  // Ordinal sentiment scale (1-5, higher = more positive)
  const sentimentScoreMap: Record<string, number> = {
    'strong_endorsement': 5,
    'positive_endorsement': 4,
    'neutral_mention': 3,
    'conditional': 2,
    'negative_comparison': 1,
    'not_mentioned': 0,
  };

  const sentimentLabelMap: Record<number, string> = {
    5: 'Strong',
    4: 'Positive',
    3: 'Neutral',
    2: 'Conditional',
    1: 'Negative',
    0: 'Not Mentioned',
  };

  // Helper to get magnitude label from absolute delta
  const getMagnitudeLabel = (absDelta: number): string => {
    if (absDelta === 0) return 'No advantage';
    if (absDelta === 1) return 'Slight';
    if (absDelta === 2) return 'Moderate';
    return 'Strong';
  };

  // Helper function to extract snippet around a brand mention
  const extractSnippet = (text: string, brandName: string, contextChars: number = 80): string | null => {
    const lowerText = text.toLowerCase();
    const lowerBrand = brandName.toLowerCase();
    const index = lowerText.indexOf(lowerBrand);
    if (index === -1) return null;

    const start = Math.max(0, index - contextChars);
    const end = Math.min(text.length, index + brandName.length + contextChars);

    let snippet = text.substring(start, end);
    if (start > 0) snippet = '...' + snippet;
    if (end < text.length) snippet = snippet + '...';

    return snippet;
  };

  // Get results with sources and sentiment data, optionally filtered
  const resultsWithSources = globallyFilteredResults.filter(
    (r: Result) => !r.error && r.sources && r.sources.length > 0 &&
      (sourceSentimentGapProviderFilter === 'all' || r.provider === sourceSentimentGapProviderFilter) &&
      (sourceSentimentGapPromptFilter === 'all' || r.prompt === sourceSentimentGapPromptFilter)
  );

  if (resultsWithSources.length === 0) return [];

  // Track per-source sentiment stats for ALL brands (not just searched brand vs competitors)
  const sourceStats: Record<string, {
    domain: string;
    allBrandSentiments: Record<string, number[]>; // Sentiment scores for each brand
    snippets: Array<{ brand: string; snippet: string; sentiment: string; sentimentScore: number; isBrand: boolean; provider: string; prompt: string; responseText: string; resultId: string }>;
    providers: Set<string>; // Track which providers cite this source
  }> = {};

  // Process each result
  resultsWithSources.forEach((r: Result) => {
    if (!r.sources) return;

    // Get unique domains in this response
    const domainsInResponse = new Set<string>();
    r.sources.forEach((source: Source) => {
      if (!source.url) return;
      try {
        const hostname = new URL(source.url).hostname.replace(/^www\./, '');
        domainsInResponse.add(hostname);
      } catch {
        // Skip invalid URLs
      }
    });

    // For each domain, track sentiment for ALL brands
    domainsInResponse.forEach(domain => {
      if (!sourceStats[domain]) {
        sourceStats[domain] = {
          domain,
          allBrandSentiments: {},
          snippets: [],
          providers: new Set(),
        };
      }
      // Track provider for this source
      sourceStats[domain].providers.add(r.provider);

      // Track searched brand sentiment (skip for industry — brand_sentiment is category-level)
      if (!isCategory && r.brand_mentioned && r.brand_sentiment && r.brand_sentiment !== 'not_mentioned') {
        const score = sentimentScoreMap[r.brand_sentiment] || 0;
        if (!sourceStats[domain].allBrandSentiments[searchedBrand]) {
          sourceStats[domain].allBrandSentiments[searchedBrand] = [];
        }
        sourceStats[domain].allBrandSentiments[searchedBrand].push(score);

        if (r.response_text) {
          const snippet = extractSnippet(r.response_text, searchedBrand);
          if (snippet) {
            sourceStats[domain].snippets.push({
              brand: searchedBrand,
              snippet,
              sentiment: r.brand_sentiment,
              sentimentScore: score,
              isBrand: true,
              provider: r.provider,
              prompt: r.prompt,
              responseText: r.response_text,
              resultId: r.id,
            });
          }
        }
      }

      // Track all competitor/brand sentiments
      // For industry: include all brands from competitor_sentiments, filtering category name and excluded brands
      // For other types: include competitors (excluding searched brand)
      const rSentBrands = isCategory
        ? (r.all_brands_mentioned?.length ? r.all_brands_mentioned : r.competitors_mentioned || [])
            .filter(b => !isCategoryName(b, searchedBrand) && !excludedBrands.has(b))
        : (r.all_brands_mentioned?.length ? r.all_brands_mentioned.filter(b => b.toLowerCase() !== (runStatus?.brand || '').toLowerCase()) : r.competitors_mentioned || []);
      if (rSentBrands.length > 0 && r.competitor_sentiments) {
        const responseText = r.response_text;
        rSentBrands.forEach(competitor => {
          const sentiment = r.competitor_sentiments?.[competitor];
          if (sentiment && sentiment !== 'not_mentioned') {
            const score = sentimentScoreMap[sentiment] || 0;
            if (!sourceStats[domain].allBrandSentiments[competitor]) {
              sourceStats[domain].allBrandSentiments[competitor] = [];
            }
            sourceStats[domain].allBrandSentiments[competitor].push(score);

            if (responseText) {
              const snippet = extractSnippet(responseText, competitor);
              if (snippet) {
                sourceStats[domain].snippets.push({
                  brand: competitor,
                  snippet,
                  sentiment,
                  sentimentScore: score,
                  isBrand: false,
                  provider: r.provider,
                  prompt: r.prompt,
                  responseText,
                  resultId: r.id,
                });
              }
            }
          }
        });
      }
    });
  });

  // For industry reports with no explicit selection, default to the brand with the most sentiment data
  if (isCategory && !comparisonBrand) {
    const brandDataCounts: Record<string, number> = {};
    Object.values(sourceStats).forEach(stat => {
      Object.entries(stat.allBrandSentiments).forEach(([brand, scores]) => {
        brandDataCounts[brand] = (brandDataCounts[brand] || 0) + scores.length;
      });
    });
    const sorted = Object.entries(brandDataCounts).sort((a, b) => b[1] - a[1]);
    comparisonBrand = sorted[0]?.[0] || '';
  }
  if (!comparisonBrand) return [];

  // Convert to array with calculated metrics based on selected comparison brand
  return Object.values(sourceStats)
    .filter(stat => {
      // Only include sources where the comparison brand has sentiment data
      const brandScores = stat.allBrandSentiments[comparisonBrand];
      return brandScores && brandScores.length >= 1;
    })
    .map(stat => {
      // Get sentiment for the comparison brand
      const brandScores = stat.allBrandSentiments[comparisonBrand] || [];
      const avgBrandScore = brandScores.length > 0
        ? brandScores.reduce((a, b) => a + b, 0) / brandScores.length
        : 0;
      const brandSentimentIndex = Math.round(avgBrandScore);

      // Find the other brand with best sentiment for this source (excluding comparison brand and excluded brands)
      let topCompetitor = '';
      let topCompetitorIndex = 0;
      let topCompetitorAvgScore = 0;
      Object.entries(stat.allBrandSentiments).forEach(([brand, scores]) => {
        if (brand !== comparisonBrand && !excludedBrands.has(brand) && !(isCategory && isCategoryName(brand, searchedBrand)) && scores.length > 0) {
          const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
          if (avg > topCompetitorAvgScore) {
            topCompetitor = brand;
            topCompetitorAvgScore = avg;
            topCompetitorIndex = Math.round(avg);
          }
        }
      });

      // Compute categorical gap (ordinal difference)
      const delta = topCompetitorIndex - brandSentimentIndex;
      const absDelta = Math.abs(delta);

      // Direction: who has the advantage
      const direction: 'competitor' | 'brand' | 'tie' =
        delta > 0 ? 'competitor' : delta < 0 ? 'brand' : 'tie';

      // Magnitude label
      const magnitudeLabel = getMagnitudeLabel(absDelta);

      // Human-readable label
      let labelText: string;
      if (direction === 'competitor') {
        labelText = `${magnitudeLabel} competitor advantage`;
      } else if (direction === 'brand') {
        labelText = `${magnitudeLabel} ${comparisonBrand} advantage`;
      } else {
        labelText = 'Even';
      }

      // Shift summary for tooltip (categorical, no numbers)
      const brandLabel = sentimentLabelMap[brandSentimentIndex] || 'Unknown';
      const competitorLabel = sentimentLabelMap[topCompetitorIndex] || 'Unknown';
      const shiftSummary = `${comparisonBrand}: ${brandLabel} → ${topCompetitor || 'Competitor'}: ${competitorLabel}`;

      // Bar value for rendering (-3 to +3 scale, capped)
      const clampedDelta = Math.min(Math.max(absDelta, 0), 3);
      const signedValue = direction === 'competitor' ? clampedDelta : direction === 'brand' ? -clampedDelta : 0;

      return {
        domain: stat.domain,
        totalMentions: Object.values(stat.allBrandSentiments).flat().length,
        brandSentimentIndex,
        brandSentimentLabel: brandLabel,
        topCompetitor,
        topCompetitorIndex,
        competitorSentimentLabel: competitorLabel,
        delta,
        direction,
        magnitudeLabel,
        labelText,
        shiftSummary,
        signedValue,
        snippets: stat.snippets,
        providers: Array.from(stat.providers),
        comparisonBrand, // Include which brand was used for comparison
      };
    })
    .filter(stat => stat.delta !== 0) // Show sources where there's any difference
    .sort((a, b) => b.signedValue - a.signedValue); // Sort by strongest competitor advantage first
}

// ---------------------------------------------------------------------------
// filteredResults  (ReferenceTab.tsx line 128)
// ---------------------------------------------------------------------------

export function computeReferenceFilteredResults(
  runStatus: RunStatusResponse | null,
  globallyFilteredResults: Result[],
  filter: 'all' | 'mentioned' | 'not_mentioned',
  providerFilter: string,
): Result[] {
  if (!runStatus) return [];
  return globallyFilteredResults.filter((result: Result) => {
    const isAiOverviewError = result.provider === 'ai_overviews' && result.error;
    if (result.error && !isAiOverviewError) return false;
    if (!result.error) {
      if (filter === 'mentioned' && !result.brand_mentioned) return false;
      if (filter === 'not_mentioned' && result.brand_mentioned) return false;
    }
    if (providerFilter !== 'all' && result.provider !== providerFilter) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// aiOverviewUnavailableCount  (ReferenceTab.tsx line 142)
// ---------------------------------------------------------------------------

export function computeReferenceAiOverviewUnavailableCount(
  runStatus: RunStatusResponse | null,
  globallyFilteredResults: Result[],
): number {
  if (!runStatus) return 0;
  return globallyFilteredResults.filter(
    (r: Result) => r.provider === 'ai_overviews' && r.error
  ).length;
}
