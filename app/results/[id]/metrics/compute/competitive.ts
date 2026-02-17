/**
 * Pure computation functions extracted from page.tsx useMemo blocks
 * for the Competitive tab metrics.
 *
 * Every function is side-effect-free: no hooks, no state, no closures.
 */

import type { Result, RunStatusResponse } from '../../tabs/shared';
import type {
  BrandBreakdownRow,
  BrandPositioningRow,
  PromptPerformanceMatrix,
  ModelPreferenceEntry,
  BrandCooccurrenceEntry,
  BrandSourceHeatmap,
  BrandSourceHeatmapRow,
  AllBrandsAnalysisRow,
  ProviderVisibilityScore,
} from '../types';
import { isCategoryName, getTextForRanking, getDomain } from '../../tabs/shared';

// ---------------------------------------------------------------------------
// Local constants (mirrors page.tsx local PROVIDER_ORDER)
// ---------------------------------------------------------------------------

const PROVIDER_ORDER = ['openai', 'gemini', 'anthropic', 'perplexity', 'grok', 'llama', 'ai_overviews'];

// ---------------------------------------------------------------------------
// Sentiment score map (shared across several functions)
// ---------------------------------------------------------------------------

const SENTIMENT_SCORE_MAP: Record<string, number> = {
  'strong_endorsement': 5,
  'positive_endorsement': 4,
  'neutral_mention': 3,
  'conditional': 2,
  'negative_comparison': 1,
  'not_mentioned': 0,
};

// ---------------------------------------------------------------------------
// computeBrandBreakdownStats  (page.tsx line 1667)
// ---------------------------------------------------------------------------

export function computeBrandBreakdownStats(
  runStatus: RunStatusResponse | null,
  globallyFilteredResults: Result[],
  brandBreakdownLlmFilter: string,
  brandBreakdownPromptFilter: string,
  excludedBrands: Set<string>,
): BrandBreakdownRow[] {
  if (!runStatus) return [];
  const isCategory = runStatus.search_type === 'category';

  const results = globallyFilteredResults.filter((r: Result) => {
    if (r.error) return false;
    if (brandBreakdownLlmFilter !== 'all' && r.provider !== brandBreakdownLlmFilter) return false;
    if (brandBreakdownPromptFilter !== 'all' && r.prompt !== brandBreakdownPromptFilter) return false;
    return true;
  });

  const searchedBrand = runStatus.brand;

  // Get all brands: searched brand + competitors (exclude category name for industry searches)
  const allBrands = new Set<string>(isCategory ? [] : [searchedBrand]);
  results.forEach(r => {
    const rBrands = r.all_brands_mentioned?.length ? r.all_brands_mentioned : r.competitors_mentioned || [];
    rBrands.forEach(c => { if (!isCategory || !isCategoryName(c, searchedBrand)) allBrands.add(c); });
  });
  // Remove excluded brands
  for (const eb of excludedBrands) {
    allBrands.delete(eb);
  }

  const sentimentScoreMap = SENTIMENT_SCORE_MAP;

  // Count responses where any (non-excluded) brand was ranked #1 — denominator so top result rates sum to 100%
  const responsesWithAnyBrand = results.filter(r => {
    if (!r.response_text) return false;
    const rBrands = r.all_brands_mentioned?.length ? r.all_brands_mentioned : r.competitors_mentioned || [];
    const filteredBrands = isCategory
      ? rBrands.filter(b => !isCategoryName(b, searchedBrand) && !excludedBrands.has(b))
      : rBrands.filter(b => !excludedBrands.has(b));
    return filteredBrands.length > 0 || (!isCategory && r.brand_mentioned && !excludedBrands.has(searchedBrand));
  }).length;

  const brandStats = Array.from(allBrands).map(brand => {
    const isSearchedBrand = brand === searchedBrand;
    const total = results.length;

    // Count mentions for this brand (flat count for display purposes)
    const mentioned = results.filter(r => {
      if (isSearchedBrand) {
        return r.brand_mentioned;
      } else {
        return r.all_brands_mentioned?.length ? r.all_brands_mentioned.includes(brand) : r.competitors_mentioned?.includes(brand);
      }
    }).length;

    // Compute visibility score as average of per-provider rates.
    // This weights each provider equally regardless of how many responses it has.
    const providerMentions: Record<string, { mentioned: number; total: number }> = {};
    for (const r of results) {
      if (!providerMentions[r.provider]) {
        providerMentions[r.provider] = { mentioned: 0, total: 0 };
      }
      providerMentions[r.provider].total++;
      const isMentioned = isSearchedBrand
        ? r.brand_mentioned
        : (r.all_brands_mentioned?.length ? r.all_brands_mentioned.includes(brand) : r.competitors_mentioned?.includes(brand));
      if (isMentioned) {
        providerMentions[r.provider].mentioned++;
      }
    }
    const providerRates = Object.values(providerMentions).map(p => p.total > 0 ? (p.mentioned / p.total) * 100 : 0);
    const visibilityScore = providerRates.length > 0
      ? providerRates.reduce((sum, rate) => sum + rate, 0) / providerRates.length
      : 0;

    // Share of Voice: this brand's mentions / total brand mentions across all results
    // For industry reports, exclude category mentions (r.brand_mentioned) from denominator
    // so that all brands' share of voice sums to 100%
    let totalBrandMentions = 0;
    let thisBrandMentions = 0;
    results.forEach(r => {
      if (!isCategory && r.brand_mentioned) totalBrandMentions++;
      const rBrands = r.all_brands_mentioned?.length ? r.all_brands_mentioned : r.competitors_mentioned || [];
      if (isCategory) {
        // For industry: only count actual brands, not the category name
        const filteredBrands = rBrands.filter(b => !isCategoryName(b, searchedBrand));
        totalBrandMentions += filteredBrands.length;
      } else {
        totalBrandMentions += rBrands.length;
      }

      if (isSearchedBrand && r.brand_mentioned) {
        thisBrandMentions++;
      } else if (!isSearchedBrand && (r.all_brands_mentioned?.length ? r.all_brands_mentioned.includes(brand) : r.competitors_mentioned?.includes(brand))) {
        thisBrandMentions++;
      }
    });
    const shareOfVoice = totalBrandMentions > 0 ? (thisBrandMentions / totalBrandMentions) * 100 : 0;

    // First Position and Avg Rank
    let firstPositionCount = 0;
    const ranks: number[] = [];

    results.forEach(r => {
      const isMentioned = isSearchedBrand ? r.brand_mentioned : (r.all_brands_mentioned?.length ? r.all_brands_mentioned.includes(brand) : r.competitors_mentioned?.includes(brand));
      if (!isMentioned) return;

      const allBrandsInResponseRaw: string[] = r.all_brands_mentioned && r.all_brands_mentioned.length > 0
        ? r.all_brands_mentioned.filter((b): b is string => typeof b === 'string')
        : [searchedBrand, ...(r.competitors_mentioned || [])].filter((b): b is string => typeof b === 'string');
      // For industry reports, filter out category name and excluded brands from ranking comparison
      const allBrandsInResponse = isCategory
        ? allBrandsInResponseRaw.filter(b => !isCategoryName(b, searchedBrand) && !excludedBrands.has(b))
        : allBrandsInResponseRaw.filter(b => !excludedBrands.has(b));

      const brandLower = brand.toLowerCase();
      const rankingText = r.response_text ? getTextForRanking(r.response_text, r.provider).toLowerCase() : '';
      const brandPos = rankingText.indexOf(brandLower);
      let rank = allBrandsInResponse.length + 1;
      if (brandPos >= 0) {
        let brandsBeforeCount = 0;
        for (const b of allBrandsInResponse) {
          const bLower = b.toLowerCase();
          if (bLower === brandLower || bLower.includes(brandLower) || brandLower.includes(bLower)) continue;
          const bPos = rankingText.indexOf(bLower);
          if (bPos >= 0 && bPos < brandPos) brandsBeforeCount++;
        }
        rank = brandsBeforeCount + 1;
      }
      ranks.push(rank);

      if (rank === 1) {
        firstPositionCount++;
      }
    });

    const firstPositionRate = responsesWithAnyBrand > 0 ? (firstPositionCount / responsesWithAnyBrand) * 100 : 0;
    const avgRank = ranks.length > 0 ? ranks.reduce((a, b) => a + b, 0) / ranks.length : null;

    // Average sentiment
    const sentimentResults = results.filter(r => {
      if (isSearchedBrand) {
        return r.brand_mentioned && r.brand_sentiment && r.brand_sentiment !== 'not_mentioned';
      } else {
        return (r.all_brands_mentioned?.length ? r.all_brands_mentioned.includes(brand) : r.competitors_mentioned?.includes(brand)) && r.competitor_sentiments?.[brand] && r.competitor_sentiments[brand] !== 'not_mentioned';
      }
    });

    let avgSentimentScore: number | null = null;
    if (sentimentResults.length > 0) {
      const sentimentSum = sentimentResults.reduce((sum, r) => {
        if (isSearchedBrand) {
          return sum + (sentimentScoreMap[r.brand_sentiment || ''] || 0);
        } else {
          return sum + (sentimentScoreMap[r.competitor_sentiments?.[brand] || ''] || 0);
        }
      }, 0);
      avgSentimentScore = sentimentSum / sentimentResults.length;
    }

    // Track per-prompt stats for this brand
    const promptStats: Record<string, { mentioned: number; total: number; sentiment: string | null }> = {};
    results.forEach(r => {
      if (!promptStats[r.prompt]) {
        promptStats[r.prompt] = { mentioned: 0, total: 0, sentiment: null };
      }
      promptStats[r.prompt].total++;

      const isMentioned = isSearchedBrand ? r.brand_mentioned : (r.all_brands_mentioned?.length ? r.all_brands_mentioned.includes(brand) : r.competitors_mentioned?.includes(brand));
      if (isMentioned) {
        promptStats[r.prompt].mentioned++;
        // Get sentiment for this prompt
        if (isSearchedBrand && r.brand_sentiment && r.brand_sentiment !== 'not_mentioned') {
          promptStats[r.prompt].sentiment = r.brand_sentiment;
        } else if (!isSearchedBrand && r.competitor_sentiments?.[brand] && r.competitor_sentiments[brand] !== 'not_mentioned') {
          promptStats[r.prompt].sentiment = r.competitor_sentiments[brand];
        }
      }
    });

    // Convert to array of prompts with stats
    const promptsWithStats = Object.entries(promptStats)
      .map(([prompt, stats]) => ({
        prompt,
        mentioned: stats.mentioned,
        total: stats.total,
        rate: stats.total > 0 ? (stats.mentioned / stats.total) * 100 : 0,
        sentiment: stats.sentiment,
      }))
      .filter(p => p.mentioned > 0) // Only include prompts where brand is mentioned
      .sort((a, b) => b.rate - a.rate);

    return {
      brand,
      isSearchedBrand,
      total,
      mentioned,
      visibilityScore,
      shareOfVoice,
      firstPositionRate,
      avgRank,
      avgSentimentScore,
      promptsWithStats,
    };
  });

  // Sort by visibility score descending
  return brandStats.sort((a, b) => b.visibilityScore - a.visibilityScore);
}

// ---------------------------------------------------------------------------
// computeBrandPositioningStats  (page.tsx line 1861)
// ---------------------------------------------------------------------------

export function computeBrandPositioningStats(
  runStatus: RunStatusResponse | null,
  globallyFilteredResults: Result[],
  brandPositioningLlmFilter: string,
  brandPositioningPromptFilter: string,
  excludedBrands: Set<string>,
): BrandPositioningRow[] {
  if (!runStatus) return [];
  const isCategory = runStatus.search_type === 'category';

  const results = globallyFilteredResults.filter((r: Result) => {
    if (r.error) return false;
    if (brandPositioningLlmFilter !== 'all' && r.provider !== brandPositioningLlmFilter) return false;
    if (brandPositioningPromptFilter !== 'all' && r.prompt !== brandPositioningPromptFilter) return false;
    return true;
  });

  const searchedBrand = runStatus.brand;

  // Get all brands: searched brand + competitors (exclude category name and excluded brands for industry searches)
  const allBrands = new Set<string>(isCategory ? [] : [searchedBrand]);
  results.forEach(r => {
    const rBrands = r.all_brands_mentioned?.length ? r.all_brands_mentioned : r.competitors_mentioned || [];
    rBrands.forEach(c => { if ((!isCategory || !isCategoryName(c, searchedBrand)) && !excludedBrands.has(c)) allBrands.add(c); });
  });

  const sentimentScoreMap = SENTIMENT_SCORE_MAP;

  const brandStats = Array.from(allBrands).map(brand => {
    const isSearchedBrand = brand === searchedBrand;
    const total = results.length;

    // Count mentions for this brand (flat count for display purposes)
    const mentioned = results.filter(r => {
      if (isSearchedBrand) {
        return r.brand_mentioned;
      } else {
        return r.all_brands_mentioned?.length ? r.all_brands_mentioned.includes(brand) : r.competitors_mentioned?.includes(brand);
      }
    }).length;

    // Compute visibility score as average of per-provider rates.
    const providerMentions: Record<string, { mentioned: number; total: number }> = {};
    for (const r of results) {
      if (!providerMentions[r.provider]) {
        providerMentions[r.provider] = { mentioned: 0, total: 0 };
      }
      providerMentions[r.provider].total++;
      const isMentioned = isSearchedBrand
        ? r.brand_mentioned
        : (r.all_brands_mentioned?.length ? r.all_brands_mentioned.includes(brand) : r.competitors_mentioned?.includes(brand));
      if (isMentioned) {
        providerMentions[r.provider].mentioned++;
      }
    }
    const providerRates = Object.values(providerMentions).map(p => p.total > 0 ? (p.mentioned / p.total) * 100 : 0);
    const visibilityScore = providerRates.length > 0
      ? providerRates.reduce((sum, rate) => sum + rate, 0) / providerRates.length
      : 0;

    // Average sentiment
    const sentimentResults = results.filter(r => {
      if (isSearchedBrand) {
        return r.brand_mentioned && r.brand_sentiment && r.brand_sentiment !== 'not_mentioned';
      } else {
        return (r.all_brands_mentioned?.length ? r.all_brands_mentioned.includes(brand) : r.competitors_mentioned?.includes(brand)) && r.competitor_sentiments?.[brand] && r.competitor_sentiments[brand] !== 'not_mentioned';
      }
    });

    let avgSentimentScore: number | null = null;
    if (sentimentResults.length > 0) {
      const sentimentSum = sentimentResults.reduce((sum, r) => {
        if (isSearchedBrand) {
          return sum + (sentimentScoreMap[r.brand_sentiment || ''] || 0);
        } else {
          return sum + (sentimentScoreMap[r.competitor_sentiments?.[brand] || ''] || 0);
        }
      }, 0);
      avgSentimentScore = sentimentSum / sentimentResults.length;
    }

    return {
      brand,
      isSearchedBrand,
      mentioned,
      visibilityScore,
      avgSentimentScore,
    };
  });

  // Sort by visibility score descending
  return brandStats.sort((a, b) => b.visibilityScore - a.visibilityScore);
}

// ---------------------------------------------------------------------------
// computePromptPerformanceMatrix  (page.tsx line 1940)
// ---------------------------------------------------------------------------

export function computePromptPerformanceMatrix(
  runStatus: RunStatusResponse | null,
  globallyFilteredResults: Result[],
  promptMatrixLlmFilter: string,
  excludedBrands: Set<string>,
): PromptPerformanceMatrix {
  if (!runStatus) return { brands: [], prompts: [], matrix: [] };
  const isCategory = runStatus.search_type === 'category';

  const results = globallyFilteredResults.filter((r: Result) => {
    if (r.error) return false;
    if (promptMatrixLlmFilter !== 'all' && r.provider !== promptMatrixLlmFilter) return false;
    return true;
  });
  if (results.length === 0) return { brands: [], prompts: [], matrix: [] };

  const searchedBrand = runStatus.brand;
  const prompts = Array.from(new Set(results.map(r => r.prompt)));

  // Get all brands mentioned (exclude category name and excluded brands for industry searches)
  const allBrands = new Set<string>(isCategory ? [] : [searchedBrand]);
  results.forEach(r => {
    const rBrands = r.all_brands_mentioned?.length ? r.all_brands_mentioned : r.competitors_mentioned || [];
    rBrands.forEach(c => { if ((!isCategory || !isCategoryName(c, searchedBrand)) && !excludedBrands.has(c)) allBrands.add(c); });
  });
  const brands = Array.from(allBrands);

  // Build matrix: for each brand and prompt, calculate visibility rate
  const matrix = brands.map(brand => {
    const isSearchedBrand = brand === searchedBrand;
    return prompts.map(prompt => {
      const promptResults = results.filter(r => r.prompt === prompt);
      const mentioned = promptResults.filter(r => {
        if (isSearchedBrand) return r.brand_mentioned;
        return r.all_brands_mentioned?.length ? r.all_brands_mentioned.includes(brand) : r.competitors_mentioned?.includes(brand);
      }).length;
      return promptResults.length > 0 ? (mentioned / promptResults.length) * 100 : 0;
    });
  });

  return { brands, prompts, matrix };
}

// ---------------------------------------------------------------------------
// computeModelPreferenceData  (page.tsx line 1979)
// ---------------------------------------------------------------------------

export function computeModelPreferenceData(
  runStatus: RunStatusResponse | null,
  globallyFilteredResults: Result[],
  excludedBrands: Set<string>,
): ModelPreferenceEntry[] {
  if (!runStatus) return [];

  const results = globallyFilteredResults.filter((r: Result) => !r.error);
  if (results.length === 0) return [];

  const searchedBrand = runStatus.brand;
  const providerSet = new Set(results.map(r => r.provider));
  const providers = PROVIDER_ORDER.filter(p => providerSet.has(p)).concat(
    Array.from(providerSet).filter(p => !PROVIDER_ORDER.includes(p))
  );

  // Get top brands (searched + top competitors by mention count)
  const isCategory = runStatus.search_type === 'category';
  const brandCounts: Record<string, number> = isCategory ? {} : { [searchedBrand]: 0 };
  results.forEach(r => {
    if (!isCategory && r.brand_mentioned) brandCounts[searchedBrand]++;
    const rBrands = r.all_brands_mentioned?.length ? r.all_brands_mentioned : r.competitors_mentioned || [];
    rBrands.forEach(c => { if ((!isCategory || !isCategoryName(c, searchedBrand)) && !excludedBrands.has(c)) brandCounts[c] = (brandCounts[c] || 0) + 1; });
  });
  const topBrands = Object.entries(brandCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([brand]) => brand);

  // For each provider, calculate visibility rate for each brand
  return providers.map(provider => {
    const providerResults = results.filter(r => r.provider === provider);
    const brandRates: Record<string, number> = {};

    topBrands.forEach(brand => {
      const isSearchedBrand = brand === searchedBrand;
      const mentioned = providerResults.filter(r => {
        if (isSearchedBrand) return r.brand_mentioned;
        return r.all_brands_mentioned?.length ? r.all_brands_mentioned.includes(brand) : r.competitors_mentioned?.includes(brand);
      }).length;
      brandRates[brand] = providerResults.length > 0 ? (mentioned / providerResults.length) * 100 : 0;
    });

    return { provider, ...brandRates };
  });
}

// ---------------------------------------------------------------------------
// computeBrandCooccurrence  (page.tsx line 2023)
// ---------------------------------------------------------------------------

export function computeBrandCooccurrence(
  runStatus: RunStatusResponse | null,
  globallyFilteredResults: Result[],
  excludedBrands?: Set<string>,
): BrandCooccurrenceEntry[] {
  if (!runStatus) return [];
  const isCategory = runStatus.search_type === 'category';

  const results = globallyFilteredResults.filter((r: Result) => !r.error);
  if (results.length === 0) return [];

  const searchedBrand = runStatus.brand;
  const cooccurrenceCounts: Record<string, { brand1: string; brand2: string; count: number }> = {};

  results.forEach(r => {
    // Get all brands mentioned in this response (exclude category name for industry searches)
    const brandsSet = new Set<string>();
    if (!isCategory && r.brand_mentioned) brandsSet.add(searchedBrand);
    const rBrands = r.all_brands_mentioned?.length ? r.all_brands_mentioned : r.competitors_mentioned || [];
    rBrands.forEach(c => {
      if ((!isCategory || !isCategoryName(c, searchedBrand)) && !excludedBrands?.has(c)) {
        brandsSet.add(c);
      }
    });
    const brandsInResponse = Array.from(brandsSet);

    // Count co-occurrences
    for (let i = 0; i < brandsInResponse.length; i++) {
      for (let j = i + 1; j < brandsInResponse.length; j++) {
        const brand1 = brandsInResponse[i];
        const brand2 = brandsInResponse[j];
        const key = [brand1, brand2].sort().join('|||');

        if (!cooccurrenceCounts[key]) {
          cooccurrenceCounts[key] = { brand1, brand2, count: 0 };
        }
        cooccurrenceCounts[key].count++;
      }
    }
  });

  // Convert to array and sort by count
  return Object.values(cooccurrenceCounts)
    .map(item => ({
      brand1: item.brand1,
      brand2: item.brand2,
      count: item.count,
      percentage: (item.count / results.length) * 100,
    }))
    .sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------
// computeCompetitiveInsights  (page.tsx line 2068)
// ---------------------------------------------------------------------------

export function computeCompetitiveInsights(
  runStatus: RunStatusResponse | null,
  brandBreakdownStats: BrandBreakdownRow[],
  modelPreferenceData: ModelPreferenceEntry[],
  brandCooccurrence: BrandCooccurrenceEntry[],
): string[] {
  if (!runStatus || brandBreakdownStats.length === 0) return [];

  const insights: string[] = [];
  const searchedBrand = runStatus.brand;
  const searchedBrandStats = brandBreakdownStats.find(s => s.isSearchedBrand);
  const competitors = brandBreakdownStats.filter(s => !s.isSearchedBrand);

  if (!searchedBrandStats) return [];

  // 1. Overall visibility ranking
  const visibilityRank = brandBreakdownStats.findIndex(s => s.isSearchedBrand) + 1;
  if (visibilityRank === 1) {
    insights.push(`${searchedBrand} leads in AI visibility with ${searchedBrandStats.visibilityScore.toFixed(0)}% visibility score`);
  } else if (visibilityRank <= 3) {
    const leader = brandBreakdownStats[0];
    insights.push(`${searchedBrand} ranks #${visibilityRank} in visibility (${searchedBrandStats.visibilityScore.toFixed(0)}%), behind ${leader.brand} (${leader.visibilityScore.toFixed(0)}%)`);
  } else {
    insights.push(`${searchedBrand} has low visibility at ${searchedBrandStats.visibilityScore.toFixed(0)}%, ranking #${visibilityRank} of ${brandBreakdownStats.length} brands`);
  }

  // 2. Sentiment comparison
  if (searchedBrandStats.avgSentimentScore !== null) {
    const betterSentimentCompetitors = competitors.filter(c =>
      c.avgSentimentScore !== null && c.avgSentimentScore > searchedBrandStats.avgSentimentScore!
    );
    if (betterSentimentCompetitors.length === 0) {
      insights.push(`${searchedBrand} has the most positive sentiment among all tracked brands`);
    } else if (betterSentimentCompetitors.length <= 2) {
      insights.push(`${betterSentimentCompetitors.map(c => c.brand).join(' and ')} ${betterSentimentCompetitors.length === 1 ? 'has' : 'have'} better sentiment than ${searchedBrand}`);
    }
  }

  // 3. First position analysis
  if (searchedBrandStats.firstPositionRate > 0) {
    const topPositionLeader = [...brandBreakdownStats].sort((a, b) => b.firstPositionRate - a.firstPositionRate)[0];
    if (topPositionLeader.isSearchedBrand) {
      insights.push(`${searchedBrand} wins the #1 position ${searchedBrandStats.firstPositionRate.toFixed(0)}% of the time - more than any competitor`);
    } else {
      insights.push(`${topPositionLeader.brand} leads in #1 positions (${topPositionLeader.firstPositionRate.toFixed(0)}%) vs ${searchedBrand} (${searchedBrandStats.firstPositionRate.toFixed(0)}%)`);
    }
  }

  // 4. Model preference insight
  if (modelPreferenceData.length > 0) {
    const formatModelName = (provider: string): string => {
      switch (provider) {
        case 'openai': return 'GPT-4o';
        case 'anthropic': return 'Claude';
        case 'perplexity': return 'Perplexity';
        case 'ai_overviews': return 'Google AI Overviews';
        case 'gemini': return 'Gemini';
        case 'google': return 'Gemini';
        case 'grok': return 'Grok';
        case 'llama': return 'Llama';
        default: return provider;
      }
    };

    let bestModel = '';
    let bestRate = 0;
    let worstModel = '';
    let worstRate = 100;

    modelPreferenceData.forEach(data => {
      const rate = (data as Record<string, string | number>)[searchedBrand] as number || 0;
      if (rate > bestRate) {
        bestRate = rate;
        bestModel = data.provider;
      }
      if (rate < worstRate) {
        worstRate = rate;
        worstModel = data.provider;
      }
    });

    if (bestModel && worstModel && bestModel !== worstModel && (bestRate - worstRate) > 10) {
      insights.push(`${searchedBrand} performs best on ${formatModelName(bestModel)} (${bestRate.toFixed(0)}%) and worst on ${formatModelName(worstModel)} (${worstRate.toFixed(0)}%)`);
    }
  }

  // 5. Co-occurrence insight
  if (brandCooccurrence.length > 0) {
    const topCooccurrence = brandCooccurrence.find(c =>
      c.brand1 === searchedBrand || c.brand2 === searchedBrand
    );
    if (topCooccurrence) {
      const otherBrand = topCooccurrence.brand1 === searchedBrand ? topCooccurrence.brand2 : topCooccurrence.brand1;
      insights.push(`${searchedBrand} is most often mentioned alongside ${otherBrand} (${topCooccurrence.count} times)`);
    }
  }

  return insights.slice(0, 5);
}

// ---------------------------------------------------------------------------
// computeCompetitorComparisonRatio  (page.tsx line 4496)
// ---------------------------------------------------------------------------

export function computeCompetitorComparisonRatio(
  runStatus: RunStatusResponse | null,
  brandBreakdownStats: BrandBreakdownRow[],
): number | null {
  if (!runStatus || brandBreakdownStats.length === 0) return null;

  const searchedBrandStats = brandBreakdownStats.find(s => s.isSearchedBrand);
  const competitors = brandBreakdownStats.filter(s => !s.isSearchedBrand);

  if (!searchedBrandStats || competitors.length === 0) return null;

  const avgCompetitorVisibility = competitors.reduce((sum, c) => sum + c.visibilityScore, 0) / competitors.length;

  if (avgCompetitorVisibility === 0) return searchedBrandStats.visibilityScore > 0 ? Infinity : 1;

  return searchedBrandStats.visibilityScore / avgCompetitorVisibility;
}

// ---------------------------------------------------------------------------
// computeAllBrandsAnalysisData  (page.tsx line 4512)
// ---------------------------------------------------------------------------

export function computeAllBrandsAnalysisData(
  runStatus: RunStatusResponse | null,
  globallyFilteredResults: Result[],
  brandBreakdownStats: BrandBreakdownRow[],
): AllBrandsAnalysisRow[] {
  if (!runStatus) return [];

  const results = globallyFilteredResults.filter((r: Result) => !r.error);
  const searchedBrand = runStatus.brand;

  // Get all brands from brandBreakdownStats (already sorted by visibility)
  const allBrands = brandBreakdownStats.map(b => b.brand);

  return allBrands.map(brand => {
    const isSearchedBrand = brand === searchedBrand;
    const brandStats = brandBreakdownStats.find(b => b.brand === brand);

    // Calculate per-provider stats for this brand
    const providerStats: Record<string, { mentioned: number; total: number }> = {};

    results.forEach(r => {
      if (!providerStats[r.provider]) {
        providerStats[r.provider] = { mentioned: 0, total: 0 };
      }
      providerStats[r.provider].total++;

      const isMentioned = isSearchedBrand
        ? r.brand_mentioned
        : (r.all_brands_mentioned?.length ? r.all_brands_mentioned.includes(brand) : r.competitors_mentioned?.includes(brand));

      if (isMentioned) {
        providerStats[r.provider].mentioned++;
      }
    });

    const providerScores: ProviderVisibilityScore[] = Object.entries(providerStats)
      .map(([provider, stats]) => ({
        provider,
        score: stats.total > 0 ? Math.round((stats.mentioned / stats.total) * 100) : 0,
      }))
      .sort((a, b) => {
        const aIdx = PROVIDER_ORDER.indexOf(a.provider);
        const bIdx = PROVIDER_ORDER.indexOf(b.provider);
        return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
      });

    // Calculate comparison to avg of other brands
    const otherBrands = brandBreakdownStats.filter(b => b.brand !== brand);
    const avgOtherVisibility = otherBrands.length > 0
      ? otherBrands.reduce((sum, b) => sum + b.visibilityScore, 0) / otherBrands.length
      : 0;
    const comparisonRatio = avgOtherVisibility > 0
      ? (brandStats?.visibilityScore || 0) / avgOtherVisibility
      : brandStats?.visibilityScore && brandStats.visibilityScore > 0 ? Infinity : 1;

    return {
      brand,
      isSearchedBrand,
      visibilityScore: brandStats?.visibilityScore || 0,
      providerScores,
      comparisonRatio,
      avgSentimentScore: brandStats?.avgSentimentScore || null,
    };
  });
}

// ---------------------------------------------------------------------------
// computeBrandSourceHeatmap  (page.tsx line 4835)
// ---------------------------------------------------------------------------

export function computeBrandSourceHeatmap(
  runStatus: RunStatusResponse | null,
  globallyFilteredResults: Result[],
  heatmapProviderFilter: string,
  excludedBrands: Set<string>,
): BrandSourceHeatmap {
  if (!runStatus) return { brands: [], sources: [], data: [], brandTotals: {} as Record<string, number>, searchedBrand: '', sentimentData: {} as Record<string, Record<string, { total: number; sum: number; avg: number }>> };

  const sentimentScores = SENTIMENT_SCORE_MAP;

  const sourceBrandCounts: Record<string, Record<string, number>> = {};
  const sourceBrandSentiments: Record<string, Record<string, { total: number; sum: number }>> = {};
  const brandTotalMentions: Record<string, number> = {};

  // Process all results to get per-brand citation counts per source
  const results = globallyFilteredResults.filter((r: Result) => {
    if (r.error || !r.sources || r.sources.length === 0) return false;
    if (heatmapProviderFilter !== 'all' && r.provider !== heatmapProviderFilter) return false;
    return true;
  });

  for (const result of results) {
    if (!result.sources) continue;

    // Get all brands mentioned in this result with their sentiments
    const isCategory = runStatus.search_type === 'category';
    const brandsInResult: Array<{ brand: string; sentiment: string | null }> = [];
    if (result.brand_mentioned && runStatus.brand && !isCategory) {
      brandsInResult.push({ brand: runStatus.brand, sentiment: result.brand_sentiment });
    }
    const heatmapBrands = (result.all_brands_mentioned?.length ? result.all_brands_mentioned : result.competitors_mentioned || [])
      .filter(b => !isCategoryName(b, runStatus?.brand || '') && !excludedBrands.has(b));
    heatmapBrands.forEach(comp => {
      brandsInResult.push({ brand: comp, sentiment: result.competitor_sentiments?.[comp] || null });
    });

    // Count brand mentions for sorting
    brandsInResult.forEach(({ brand }) => {
      brandTotalMentions[brand] = (brandTotalMentions[brand] || 0) + 1;
    });

    if (brandsInResult.length === 0) continue;

    // Track which domains have been counted for each brand in this response
    const seenDomainBrandPairs = new Set<string>();

    for (const source of result.sources) {
      if (!source.url) continue;
      const domain = getDomain(source.url);

      if (!sourceBrandCounts[domain]) {
        sourceBrandCounts[domain] = {};
        sourceBrandSentiments[domain] = {};
      }

      // Associate this source with all brands mentioned in the same response
      // This shows which sources are cited when each brand is discussed
      brandsInResult.forEach(({ brand, sentiment }) => {
        const pairKey = `${domain}:${brand}`;

        if (!seenDomainBrandPairs.has(pairKey)) {
          seenDomainBrandPairs.add(pairKey);
          sourceBrandCounts[domain][brand] = (sourceBrandCounts[domain][brand] || 0) + 1;

          // Track sentiment — prefer per-source sentiment, fall back to response-level
          if (!sourceBrandSentiments[domain][brand]) {
            sourceBrandSentiments[domain][brand] = { total: 0, sum: 0 };
          }
          const perSourceSent = result.source_brand_sentiments?.[domain]?.[brand];
          const effectiveSent = (perSourceSent && perSourceSent !== 'not_mentioned')
            ? perSourceSent : sentiment;
          if (effectiveSent && effectiveSent !== 'not_mentioned' && sentimentScores[effectiveSent] > 0) {
            sourceBrandSentiments[domain][brand].total += 1;
            sourceBrandSentiments[domain][brand].sum += sentimentScores[effectiveSent];
          }
        }
      });
    }
  }

  // Get top 15 sources by total citations (increased from 10 to show more coverage)
  const topSources = Object.entries(sourceBrandCounts)
    .map(([domain, brands]) => ({
      domain,
      total: Object.values(brands).reduce((sum, count) => sum + count, 0),
      brands,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 15);

  // Sort brands: searched brand first, then by total mentions
  const searchedBrand = runStatus.brand;
  const brandList = Object.keys(brandTotalMentions)
    .sort((a, b) => {
      if (a === searchedBrand) return -1;
      if (b === searchedBrand) return 1;
      return brandTotalMentions[b] - brandTotalMentions[a];
    });

  // Build heatmap data with counts
  const heatmapData: BrandSourceHeatmapRow[] = topSources.map(source => ({
    domain: source.domain,
    total: source.total,
    ...brandList.reduce((acc, brand) => {
      acc[brand] = source.brands[brand] || 0;
      return acc;
    }, {} as Record<string, number>),
  }));

  // Build sentiment data
  const sentimentData: Record<string, Record<string, { total: number; sum: number; avg: number }>> = {};
  topSources.forEach(source => {
    sentimentData[source.domain] = {};
    brandList.forEach(brand => {
      const data = sourceBrandSentiments[source.domain]?.[brand];
      if (data && data.total > 0) {
        sentimentData[source.domain][brand] = {
          ...data,
          avg: data.sum / data.total,
        };
      } else {
        sentimentData[source.domain][brand] = { total: 0, sum: 0, avg: 0 };
      }
    });
  });

  return {
    brands: brandList,
    sources: topSources.map(s => s.domain),
    data: heatmapData,
    brandTotals: brandTotalMentions,
    searchedBrand,
    sentimentData,
  };
}
