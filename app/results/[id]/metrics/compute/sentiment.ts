/**
 * Pure computation functions extracted from page.tsx and SentimentTab.tsx useMemo blocks.
 * No hooks, no state, no closures — just typed input/output transforms.
 */

import type { Result, RunStatusResponse } from '../../tabs/shared';
import { isCategoryName, getProviderLabel, getDomain } from '../../tabs/shared';
import type {
  SentimentDataPoint,
  SentimentProviderBrandOption,
  SentimentByProviderRow,
  CompetitorSentimentRow,
} from '../types';
import { PROVIDER_ORDER } from './base';

// ---------------------------------------------------------------------------
// getEffectiveSentiment (helper used by multiple computations)
// ---------------------------------------------------------------------------

const _sentScores: Record<string, number> = {
  strong_endorsement: 5,
  positive_endorsement: 4,
  neutral_mention: 3,
  conditional: 2,
  negative_comparison: 1,
};
const _scoreToSent: Record<number, string> = {
  5: 'strong_endorsement',
  4: 'positive_endorsement',
  3: 'neutral_mention',
  2: 'conditional',
  1: 'negative_comparison',
};

/**
 * For industry (category) reports, compute sentiment as the average across
 * individual brand sentiments instead of using the category-level sentiment.
 * For other search types, returns brand_sentiment directly.
 */
export function getEffectiveSentiment(
  r: Result,
  isIndustryReport: boolean,
  searchedBrand: string,
  excludedBrands: Set<string>,
): string | null {
  if (isIndustryReport && r.competitor_sentiments) {
    const scores = Object.entries(r.competitor_sentiments)
      .filter(([brand, s]) => (s as string) in _sentScores && !excludedBrands.has(brand) && !isCategoryName(brand, searchedBrand))
      .map(([, s]) => _sentScores[s as keyof typeof _sentScores]);
    if (scores.length > 0) {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      const nearest = Object.keys(_scoreToSent).map(Number).reduce((prev, curr) => Math.abs(curr - avg) < Math.abs(prev - avg) ? curr : prev);
      return _scoreToSent[nearest];
    }
    return null;
  }
  return r.brand_sentiment || null;
}

/**
 * Check whether a result has usable sentiment data.
 */
export function hasEffectiveSentiment(
  r: Result,
  isIndustryReport: boolean,
  searchedBrand: string,
  excludedBrands: Set<string>,
): boolean {
  if (r.error) return false;
  if (isIndustryReport) {
    if (!r.competitor_sentiments) return false;
    return Object.keys(r.competitor_sentiments).some(b => !excludedBrands.has(b) && !isCategoryName(b, searchedBrand));
  }
  return !!r.brand_sentiment;
}

// ---------------------------------------------------------------------------
// Sentiment label helpers (local to SentimentTab)
// ---------------------------------------------------------------------------

function getSentimentLabelLocal(sentiment: string | null | undefined, issueMode: boolean): string {
  switch (sentiment) {
    case 'strong_endorsement': return issueMode ? 'Supportive' : 'Strong';
    case 'positive_endorsement': return issueMode ? 'Leaning Supportive' : 'Positive';
    case 'neutral_mention': return issueMode ? 'Balanced' : 'Neutral';
    case 'conditional': return issueMode ? 'Mixed' : 'Conditional';
    case 'negative_comparison': return issueMode ? 'Critical' : 'Negative';
    case 'not_mentioned': return issueMode ? 'Not Discussed' : 'Not Mentioned';
    default: return 'Unknown';
  }
}

function getSentimentBarColor(sentiment: string): string {
  switch (sentiment) {
    case 'strong_endorsement': return '#047857'; // emerald-700
    case 'positive_endorsement': return '#10b981'; // emerald-500
    case 'neutral_mention': return '#3b82f6';
    case 'conditional': return '#fde68a'; // amber-200 (very light)
    case 'negative_comparison': return '#ef4444';
    case 'not_mentioned': return '#9ca3af';
    default: return '#9ca3af';
  }
}

// ---------------------------------------------------------------------------
// computeSentimentInsights (from page.tsx line 3074)
// ---------------------------------------------------------------------------

export function computeSentimentInsights(
  runStatus: RunStatusResponse | null,
  globallyFilteredResults: Result[],
  excludedBrands: Set<string>,
): string[] {
  if (!runStatus) return [];

  const insights: string[] = [];
  const searchedBrand = runStatus.brand;
  const isCategory = runStatus.search_type === 'category';

  const formatProviderName = (p: string) => {
    switch (p) {
      case 'openai': return 'GPT-4o';
      case 'anthropic': return 'Claude';
      case 'perplexity': return 'Perplexity';
      case 'ai_overviews': return 'Google AI Overviews';
      case 'gemini': return 'Gemini';
      case 'grok': return 'Grok';
      case 'llama': return 'Llama';
      default: return p;
    }
  };

  // For industry reports, aggregate from competitor_sentiments (per-brand sentiments)
  // For other types, use brand_sentiment (response-level sentiment)
  const sentimentCounts: Record<string, number> = {
    strong_endorsement: 0,
    positive_endorsement: 0,
    neutral_mention: 0,
    conditional: 0,
    negative_comparison: 0,
  };

  // Per-brand aggregation for industry reports
  const perBrandSentiments: Record<string, { positive: number; total: number }> = {};
  // Per-provider aggregation
  const providerSentiments: Record<string, { positive: number; total: number }> = {};

  if (isCategory) {
    // Industry: use competitor_sentiments across all brands
    globallyFilteredResults.filter((r: Result) => !r.error && r.competitor_sentiments).forEach((r: Result) => {
      Object.entries(r.competitor_sentiments!).forEach(([brand, sentiment]) => {
        if (!sentiment || sentiment === 'not_mentioned') return;
        if (isCategoryName(brand, searchedBrand)) return;
        if (excludedBrands.has(brand)) return;
        if (sentimentCounts[sentiment] !== undefined) sentimentCounts[sentiment]++;
        // Per-brand
        if (!perBrandSentiments[brand]) perBrandSentiments[brand] = { positive: 0, total: 0 };
        perBrandSentiments[brand].total++;
        if (sentiment === 'strong_endorsement' || sentiment === 'positive_endorsement') perBrandSentiments[brand].positive++;
        // Per-provider
        if (!providerSentiments[r.provider]) providerSentiments[r.provider] = { positive: 0, total: 0 };
        providerSentiments[r.provider].total++;
        if (sentiment === 'strong_endorsement' || sentiment === 'positive_endorsement') providerSentiments[r.provider].positive++;
      });
    });
  } else {
    // Non-industry: use brand_sentiment
    globallyFilteredResults.filter((r: Result) => !r.error && r.brand_sentiment).forEach((r: Result) => {
      const sentiment = r.brand_sentiment || '';
      if (sentimentCounts[sentiment] !== undefined) sentimentCounts[sentiment]++;
      // Per-provider
      if (!providerSentiments[r.provider]) providerSentiments[r.provider] = { positive: 0, total: 0 };
      providerSentiments[r.provider].total++;
      if (r.brand_sentiment === 'strong_endorsement' || r.brand_sentiment === 'positive_endorsement') providerSentiments[r.provider].positive++;
    });
  }

  const total = Object.values(sentimentCounts).reduce((a, b) => a + b, 0);
  if (total === 0) return [];

  const positiveCount = sentimentCounts.strong_endorsement + sentimentCounts.positive_endorsement;
  const positiveRate = total > 0 ? (positiveCount / total) * 100 : 0;

  // 1. Overall sentiment insight
  const subjectLabel = isCategory ? `Brands in ${searchedBrand}` : searchedBrand;
  if (positiveRate >= 70) {
    insights.push(`${subjectLabel} receive${isCategory ? '' : 's'} highly positive framing — ${positiveRate.toFixed(0)}% of mentions are endorsements`);
  } else if (positiveRate >= 50) {
    insights.push(`${subjectLabel} ha${isCategory ? 've' : 's'} generally positive sentiment with ${positiveRate.toFixed(0)}% endorsement rate`);
  } else if (positiveRate >= 30) {
    insights.push(`${subjectLabel} ha${isCategory ? 've' : 's'} mixed sentiment — only ${positiveRate.toFixed(0)}% of mentions are positive endorsements`);
  } else {
    insights.push(`${subjectLabel} ha${isCategory ? 've' : 's'} challenging sentiment positioning — ${positiveRate.toFixed(0)}% positive endorsements`);
  }

  // 2. Strongest sentiment category
  const topSentiment = Object.entries(sentimentCounts).sort((a, b) => b[1] - a[1])[0];
  if (topSentiment && topSentiment[1] > 0) {
    const labelMap: Record<string, string> = {
      strong_endorsement: 'Strong',
      positive_endorsement: 'Positive',
      neutral_mention: 'Neutral',
      conditional: 'Conditional',
      negative_comparison: 'Negative',
    };
    const percentage = total > 0 ? (topSentiment[1] / total * 100).toFixed(0) : 0;
    insights.push(`Most common framing: "${labelMap[topSentiment[0]]}" (${percentage}% of brand mentions)`);
  }

  // 3. Caveat/negative analysis
  const negativeCount = sentimentCounts.conditional + sentimentCounts.negative_comparison;
  if (negativeCount > 0) {
    const negativeRate = (negativeCount / total) * 100;
    if (negativeRate > 20) {
      insights.push(`${negativeRate.toFixed(0)}% of mentions include caveats or negative comparisons — room for improvement`);
    }
  }

  // 4. Provider-specific sentiment patterns
  const providerRates = Object.entries(providerSentiments)
    .filter(([, data]) => data.total >= 2)
    .map(([provider, data]) => ({
      provider,
      rate: (data.positive / data.total) * 100,
      total: data.total,
    }))
    .sort((a, b) => b.rate - a.rate);

  if (providerRates.length >= 2) {
    const best = providerRates[0];
    const worst = providerRates[providerRates.length - 1];
    if (best.rate - worst.rate > 20) {
      insights.push(`${formatProviderName(best.provider)} is most positive (${best.rate.toFixed(0)}% endorsements) vs ${formatProviderName(worst.provider)} (${worst.rate.toFixed(0)}%)`);
    }
  }

  // 5. Brand comparison
  if (isCategory) {
    // For industry: compare top brands against each other
    const brandRates = Object.entries(perBrandSentiments)
      .filter(([, data]) => data.total >= 2)
      .map(([brand, data]) => ({ brand, rate: (data.positive / data.total) * 100, total: data.total }))
      .sort((a, b) => b.rate - a.rate);
    if (brandRates.length >= 2) {
      const best = brandRates[0];
      const worst = brandRates[brandRates.length - 1];
      if (best.rate - worst.rate > 15) {
        insights.push(`${best.brand} has the strongest sentiment (${best.rate.toFixed(0)}% positive) vs ${worst.brand} (${worst.rate.toFixed(0)}%)`);
      }
    }
  } else {
    // For non-industry: compare searched brand against competitors
    const competitorSentimentAgg: Record<string, { positive: number; total: number }> = {};
    globallyFilteredResults
      .filter((r: Result) => !r.error && r.competitor_sentiments)
      .forEach((r: Result) => {
        if (r.competitor_sentiments) {
          Object.entries(r.competitor_sentiments).forEach(([comp, sentiment]) => {
            if (!sentiment || sentiment === 'not_mentioned') return;
            if (!competitorSentimentAgg[comp]) competitorSentimentAgg[comp] = { positive: 0, total: 0 };
            competitorSentimentAgg[comp].total++;
            if (sentiment === 'strong_endorsement' || sentiment === 'positive_endorsement') competitorSentimentAgg[comp].positive++;
          });
        }
      });

    const competitorsWithBetterSentiment = Object.entries(competitorSentimentAgg)
      .filter(([, data]) => data.total >= 2)
      .filter(([, data]) => (data.positive / data.total) * 100 > positiveRate + 10);

    if (competitorsWithBetterSentiment.length > 0) {
      const topComp = competitorsWithBetterSentiment[0];
      const compRate = (topComp[1].positive / topComp[1].total) * 100;
      insights.push(`${topComp[0]} has stronger sentiment (${compRate.toFixed(0)}% positive) than ${searchedBrand} (${positiveRate.toFixed(0)}%)`);
    } else if (Object.keys(competitorSentimentAgg).length > 0) {
      insights.push(`${searchedBrand} has equal or better sentiment than tracked competitors`);
    }
  }

  return insights.slice(0, 5);
}

// ---------------------------------------------------------------------------
// computeBrandSentimentData (from SentimentTab.tsx line 375)
// ---------------------------------------------------------------------------

export function computeBrandSentimentData(
  globallyFilteredResults: Result[],
  isIndustryReport: boolean,
  isIssue: boolean,
  searchedBrand: string,
  excludedBrands: Set<string>,
): SentimentDataPoint[] {
  const sentimentCounts: Record<string, number> = {
    strong_endorsement: 0,
    positive_endorsement: 0,
    neutral_mention: 0,
    conditional: 0,
    negative_comparison: 0,
    not_mentioned: 0,
  };

  globallyFilteredResults
    .filter((r: Result) => !r.error)
    .forEach((r: Result) => {
      const sentiment = getEffectiveSentiment(r, isIndustryReport, searchedBrand, excludedBrands) || 'not_mentioned';
      if (sentimentCounts[sentiment] !== undefined) {
        sentimentCounts[sentiment]++;
      }
    });

  const total = Object.values(sentimentCounts).reduce((a, b) => a + b, 0);

  return Object.entries(sentimentCounts)
    .map(([sentiment, count]) => ({
      sentiment,
      label: getSentimentLabelLocal(sentiment, isIssue),
      count,
      percentage: total > 0 ? (count / total) * 100 : 0,
      color: getSentimentBarColor(sentiment),
    }))
    .filter(d => d.count > 0);
}

// ---------------------------------------------------------------------------
// computeSentimentProviderBrandOptions (from SentimentTab.tsx line 409)
// ---------------------------------------------------------------------------

export function computeSentimentProviderBrandOptions(
  runStatus: RunStatusResponse | null,
  globallyFilteredResults: Result[],
  isIndustryReport: boolean,
  excludedBrands: Set<string>,
): SentimentProviderBrandOption[] {
  if (!runStatus) return [];
  const options: SentimentProviderBrandOption[] = [];

  if (isIndustryReport) {
    // For industry reports, default to all brands average; exclude category name
    options.push({ value: '__all__', label: 'All Brands (average sentiment)', isSearched: false });
  } else if (runStatus.brand) {
    // For brand reports, show searched brand first
    options.push({ value: runStatus.brand, label: runStatus.brand, isSearched: true });
  }

  // Collect all competitors from competitor_sentiments
  const competitors = new Set<string>();
  const searchedBrand = runStatus?.brand || '';
  globallyFilteredResults.forEach((r: Result) => {
    if (!r.error && r.competitor_sentiments) {
      Object.keys(r.competitor_sentiments).forEach(comp => {
        if (!excludedBrands.has(comp) && !isCategoryName(comp, searchedBrand)) {
          competitors.add(comp);
        }
      });
    }
  });

  // Add competitors sorted alphabetically
  Array.from(competitors).sort().forEach(comp => {
    options.push({ value: comp, label: comp, isSearched: false });
  });

  return options;
}

// ---------------------------------------------------------------------------
// computeCitationSourceOptions (from SentimentTab.tsx line 451)
// ---------------------------------------------------------------------------

export function computeCitationSourceOptions(
  globallyFilteredResults: Result[],
): string[] {
  const domains = new Set<string>();
  globallyFilteredResults.forEach((r: Result) => {
    if (!r.error && r.sources) {
      r.sources.forEach((source) => {
        if (source.url) {
          domains.add(getDomain(source.url));
        }
      });
    }
  });
  return Array.from(domains).sort();
}

// ---------------------------------------------------------------------------
// computeSentimentByProvider (from SentimentTab.tsx line 465)
// ---------------------------------------------------------------------------

export function computeSentimentByProvider(
  globallyFilteredResults: Result[],
  effectiveSentimentBrand: string,
  searchedBrand: string,
  isIndustryReport: boolean,
  isIssue: boolean,
  excludedBrands: Set<string>,
  sentimentProviderCitationFilter: string,
  sentimentProviderModelFilter: string,
): SentimentByProviderRow[] {
  const providerData: Record<string, {
    strong_endorsement: number;
    positive_endorsement: number;
    neutral_mention: number;
    conditional: number;
    negative_comparison: number;
    not_mentioned: number;
  }> = {};

  const isAllBrands = effectiveSentimentBrand === '__all__';
  const isSearchedBrandFlag = effectiveSentimentBrand === searchedBrand;

  globallyFilteredResults
    .filter((r: Result) => {
      if (r.error) return false;
      // For issues: filter by AI model if not "all"
      if (isIssue && sentimentProviderModelFilter !== 'all') {
        if (r.provider !== sentimentProviderModelFilter) return false;
      }
      // Filter by citation source domain if not "all"
      if (!isIssue && sentimentProviderCitationFilter !== 'all') {
        if (!r.sources || r.sources.length === 0) return false;
        const hasCitationFromDomain = r.sources.some(
          (source) => source.url && getDomain(source.url) === sentimentProviderCitationFilter
        );
        if (!hasCitationFromDomain) return false;
      }
      return true;
    })
    .forEach((r: Result) => {
      if (!providerData[r.provider]) {
        providerData[r.provider] = {
          strong_endorsement: 0,
          positive_endorsement: 0,
          neutral_mention: 0,
          conditional: 0,
          negative_comparison: 0,
          not_mentioned: 0,
        };
      }

      let sentiment: string;
      if (isAllBrands) {
        // Average sentiment across all brands in response
        sentiment = getEffectiveSentiment(r, isIndustryReport, searchedBrand, excludedBrands) || 'not_mentioned';
      } else if (isSearchedBrandFlag) {
        sentiment = getEffectiveSentiment(r, isIndustryReport, searchedBrand, excludedBrands) || 'not_mentioned';
      } else {
        // Use competitor_sentiments for individual competitors
        sentiment = r.competitor_sentiments?.[effectiveSentimentBrand] || 'not_mentioned';
      }

      if (sentiment in providerData[r.provider]) {
        providerData[r.provider][sentiment as keyof typeof providerData[string]]++;
      }
    });

  return Object.entries(providerData).map(([provider, counts]) => {
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const positiveTotal = counts.strong_endorsement + counts.positive_endorsement;
    return {
      provider,
      label: getProviderLabel(provider),
      strong_endorsement: counts.strong_endorsement,
      positive_endorsement: counts.positive_endorsement,
      neutral_mention: counts.neutral_mention,
      conditional: counts.conditional,
      negative_comparison: counts.negative_comparison,
      not_mentioned: counts.not_mentioned,
      total,
      strongRate: total > 0 ? (positiveTotal / total) * 100 : 0,
    };
  }).sort((a, b) => {
    const aIdx = PROVIDER_ORDER.indexOf(a.provider);
    const bIdx = PROVIDER_ORDER.indexOf(b.provider);
    return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
  });
}

// ---------------------------------------------------------------------------
// computeCompetitorSentimentData (from SentimentTab.tsx line 894)
// ---------------------------------------------------------------------------

export function computeCompetitorSentimentData(
  globallyFilteredResults: Result[],
  trackedBrands: Set<string>,
  searchedBrand: string,
): CompetitorSentimentRow[] {
  const competitorData: Record<string, {
    strong_endorsement: number;
    positive_endorsement: number;
    neutral_mention: number;
    conditional: number;
    negative_comparison: number;
    not_mentioned: number;
  }> = {};
  const trackedComps = trackedBrands;

  const searchedBrandForComp = searchedBrand;
  globallyFilteredResults
    .filter((r: Result) => !r.error && r.competitor_sentiments)
    .forEach((r: Result) => {
      if (r.competitor_sentiments) {
        Object.entries(r.competitor_sentiments).forEach(([comp, sentiment]) => {
          if (!trackedComps.has(comp.toLowerCase())) return;
          if (isCategoryName(comp, searchedBrandForComp)) return;
          if (!competitorData[comp]) {
            competitorData[comp] = {
              strong_endorsement: 0,
              positive_endorsement: 0,
              neutral_mention: 0,
              conditional: 0,
              negative_comparison: 0,
              not_mentioned: 0,
            };
          }
          if (sentiment in competitorData[comp]) {
            competitorData[comp][sentiment as keyof typeof competitorData[string]]++;
          }
        });
      }
    });

  return Object.entries(competitorData)
    .map(([competitor, counts]) => {
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      const mentionedTotal = total - counts.not_mentioned;
      const positiveTotal = counts.strong_endorsement + counts.positive_endorsement;
      return {
        competitor,
        strong_endorsement: counts.strong_endorsement,
        positive_endorsement: counts.positive_endorsement,
        neutral_mention: counts.neutral_mention,
        conditional: counts.conditional,
        negative_comparison: counts.negative_comparison,
        not_mentioned: counts.not_mentioned,
        total,
        mentionedTotal,
        strongRate: total > 0 ? (positiveTotal / total) * 100 : 0,
        positiveRate: mentionedTotal > 0 ? (positiveTotal / mentionedTotal) * 100 : 0,
      };
    })
    .sort((a, b) => b.strongRate - a.strongRate);
}
