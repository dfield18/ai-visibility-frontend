'use client';

import { useState, useMemo } from 'react';
import type { Result, RunStatusResponse, AISummaryResponse } from '../tabs/shared';
import type { SearchType } from '@/lib/types';
import { getSearchTypeConfig } from '@/lib/searchTypeConfig';
import type { BrandQuote } from '@/hooks/useApi';
import { categorizeDomain } from '../tabs/shared';

// ---------------------------------------------------------------------------
// Import ALL compute functions (direct file imports to avoid barrel-export TDZ)
// ---------------------------------------------------------------------------
import {
  computeAvailablePrompts,
  computeAvailableProviders,
  computeAvailableBrands,
  computeCorrectedResults,
  computeGloballyFilteredResults,
  computePromptCost,
  computeAiOverviewUnavailableCount,
  computeTrackedBrands,
  computeFilteredAvailableBrands,
  computeFilteredTrackedBrands,
} from './compute/base';
import {
  buildBrandNormalizationMap,
  applyBrandNormalization,
} from './compute/normalization';
import {
  computeFilteredBrandMentions,
  computeLlmBreakdownBrands,
  computeLlmBreakdownStats,
  computePromptBreakdownStats,
  computeScatterProviderOrder,
  computeScatterPlotData,
  computeRangeChartData,
  computeRangeProviderOrder,
  computeRangeViewDots,
  computeOverviewMetrics,
  computeLlmBreakdownTakeaway,
  computeProviderVisibilityScores,
  computeFilteredFramingByProvider,
  computeFramingEvidenceGroups,
  computePositionChartBrandOptions,
  computePositionByPlatformData,
  computeOverviewFilteredResults,
  computeOverviewSortedResults,
} from './compute/overview';
import {
  computeBrandBreakdownStats,
  computeBrandPositioningStats,
  computePromptPerformanceMatrix,
  computeModelPreferenceData,
  computeBrandCooccurrence,
  computeCompetitiveInsights,
  computeCompetitorComparisonRatio,
  computeAllBrandsAnalysisData,
  computeBrandSourceHeatmap,
} from './compute/competitive';
import {
  computeSentimentInsights,
  computeBrandSentimentData,
  computeSentimentProviderBrandOptions,
  computeCitationSourceOptions,
  computeSentimentByProvider,
  computeCompetitorSentimentData,
} from './compute/sentiment';
import {
  computeTopCitedSources,
  computeHasAnySources,
  computeKeyInfluencers,
  computeSourcesInsights,
  computeSourcePositioningData,
  computeSourcePositioningBrandOptions,
  computeBrandWebsiteCitations,
  computeBrandPresenceData,
  computeSourceCategoryData,
  computeDomainTableData,
  computePublisherPromptOptions,
  computePublisherBrandOptions,
  computeSortedDomainTableData,
  computeSourceBrandHeatmapData,
  computeHeatmapMaxValue,
} from './compute/sources';
import {
  computeSourceGapAnalysis,
  computeSourceSentimentGapAnalysis,
  computeReferenceFilteredResults,
  computeReferenceAiOverviewUnavailableCount,
} from './compute/reference';
import {
  computeQuickWins,
  computeAdOpportunities,
  computeSourceOpportunities,
  computeParsedAiRecommendations,
} from './compute/recommendations';

// ---------------------------------------------------------------------------
// Import metric types
// ---------------------------------------------------------------------------
import type {
  OverviewMetrics,
  ScatterPlotPoint,
  RangeChartRow,
  RangeViewDot,
  LlmBreakdownRow,
  PromptBreakdownRow,

  BrandMentionEntry,
  ProviderVisibilityScore,
  FramingEvidenceItem,
  PositionChartOption,
  PositionDot,
  BrandBreakdownRow,
  BrandPositioningRow,
  PromptPerformanceMatrix,
  ModelPreferenceEntry,
  BrandCooccurrenceEntry,
  BrandSourceHeatmap,
  AllBrandsAnalysisRow,
  SentimentDataPoint,
  SentimentProviderBrandOption,
  SentimentByProviderRow,
  CompetitorSentimentRow,
  TopCitedSource,
  KeyInfluencer,
  SourcePositioningRow,
  SourcePositioningBrandOption,
  BrandWebsiteCitationsResult,
  BrandPresenceData,
  SourceCategoryEntry,
  DomainTableRow,
  SourceBrandHeatmapData,
  SourceGapRow,
  SourceSentimentGapRow,
  QuickWin,
  AdOpportunity,
  SourceOpportunity,
  ParsedRecommendation,
} from './types';

// ---------------------------------------------------------------------------
// extractUntrackedBrands — migrated from page.tsx
// ---------------------------------------------------------------------------

function extractUntrackedBrands(
  text: string,
  trackedSet: Set<string>,
  categoryName: string,
): string[] {
  if (!text) return [];

  const excludeWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can',
    'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'my', 'your',
    'his', 'her', 'its', 'our', 'their', 'who', 'what', 'where', 'when', 'why', 'how',
    'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
    'not', 'only', 'same', 'so', 'than', 'too', 'very', 'just', 'also', 'now', 'here', 'there',
    'if', 'then', 'because', 'while', 'although', 'though', 'after', 'before', 'since', 'until',
    'best', 'top', 'good', 'great', 'new', 'first', 'last', 'long', 'little', 'own', 'right',
    'big', 'high', 'different', 'small', 'large', 'next', 'early', 'young', 'important', 'public',
    'bad', 'same', 'able', 'popular', 'known', 'well', 'overall', 'however', 'additionally',
    'furthermore', 'moreover', 'therefore', 'thus', 'hence', 'conclusion', 'summary', 'introduction',
    'example', 'note', 'please', 'thank', 'thanks', 'yes', 'no', 'maybe', 'perhaps',
    'running', 'shoes', 'shoe', 'sneakers', 'sneaker', 'boots', 'boot', 'sandals', 'sandal',
    'laptops', 'laptop', 'computers', 'computer', 'phones', 'phone', 'tablets', 'tablet',
    'cars', 'car', 'vehicles', 'vehicle', 'trucks', 'truck', 'suvs', 'suv',
    'brand', 'brands', 'company', 'companies', 'product', 'products', 'model', 'models',
    'price', 'prices', 'cost', 'costs', 'quality', 'performance', 'features', 'feature',
    'review', 'reviews', 'rating', 'ratings', 'recommendation', 'recommendations',
    'option', 'options', 'choice', 'choices', 'alternative', 'alternatives',
    'pro', 'pros', 'con', 'cons', 'advantage', 'advantages', 'disadvantage', 'disadvantages',
    'usa', 'us', 'uk', 'eu', 'asia', 'europe', 'america', 'american', 'european', 'asian',
    'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  ]);

  if (categoryName) {
    const catLower = categoryName.toLowerCase();
    excludeWords.add(catLower);
    excludeWords.add(catLower + 's');
    excludeWords.add(catLower.replace(/s$/, ''));
  }

  const brandPattern = /\b([A-Z][a-zA-Z0-9]*(?:\s+[A-Z][a-zA-Z0-9]*)*)\b/g;
  const potentialBrands = new Map<string, number>();

  let match;
  while ((match = brandPattern.exec(text)) !== null) {
    const brand = match[1];
    const brandLower = brand.toLowerCase();

    if (trackedSet.has(brandLower)) continue;
    if (excludeWords.has(brandLower)) continue;
    if (brand.length < 2) continue;

    const prevChar = text[match.index - 2];
    if (match.index <= 1 || prevChar === '.') {
      if (excludeWords.has(brandLower)) continue;
    }

    potentialBrands.set(brand, (potentialBrands.get(brand) || 0) + 1);
  }

  return Array.from(potentialBrands.entries())
    .filter(([_, count]) => count >= 1)
    .sort((a, b) => b[1] - a[1])
    .map(([brand]) => brand);
}

// ---------------------------------------------------------------------------
// Hook params
// ---------------------------------------------------------------------------

export interface UseResultsStoreParams {
  runStatus: RunStatusResponse | null;
  aiSummary: AISummaryResponse | undefined;
  isSummaryLoading: boolean;
  excludedBrands: Set<string>;
  setExcludedBrands: (brands: Set<string>) => void;
  brandQuotesMap: Record<string, BrandQuote[]>;
  /** Global LLM filter (from URL or state). Defaults to 'all'. */
  globalLlmFilter: string;
  /** Global prompt filter (from URL or state). Defaults to 'all'. */
  globalPromptFilter: string;
  /** Global brand filter (from URL or state). Defaults to 'all'. */
  globalBrandFilter: string;
}

// ===========================================================================
// useResultsStore
// ===========================================================================

export function useResultsStore(params: UseResultsStoreParams) {
  const {
    runStatus,
    aiSummary,
    isSummaryLoading,
    excludedBrands,
    setExcludedBrands,
    brandQuotesMap,
    globalLlmFilter,
    globalPromptFilter,
    globalBrandFilter,
  } = params;

  // =========================================================================
  // Derived booleans & config
  // =========================================================================
  const searchType: SearchType = (runStatus?.search_type as SearchType) || 'brand';
  const searchTypeConfig = getSearchTypeConfig(searchType);
  const isCategory = searchType === 'category';
  const isIssue = searchType === 'issue';
  const isPublicFigure = searchType === 'public_figure';
  const summary = runStatus?.summary ?? null;
  const brandMentionRate = summary?.brand_mention_rate ?? 0;

  // =========================================================================
  // Base computations (order matters — dependency chain)
  // =========================================================================
  const availablePrompts = useMemo(
    () => computeAvailablePrompts(runStatus),
    [runStatus],
  );

  const availableProviders = useMemo(
    () => computeAvailableProviders(runStatus),
    [runStatus],
  );

  const allAvailableBrandsRaw = useMemo(
    () => computeAvailableBrands(runStatus),
    [runStatus],
  );

  const correctedResults = useMemo(
    () => computeCorrectedResults(runStatus),
    [runStatus],
  );

  // Brand name normalization: merge diacritical variants ("Condé" / "Conde")
  // and prefix variants ("National Geographic" / "National Geographic Traveler")
  const brandNormMap = useMemo(
    () => buildBrandNormalizationMap(correctedResults),
    [correctedResults],
  );

  const normalizedResults = useMemo(
    () => brandNormMap.size > 0
      ? applyBrandNormalization(correctedResults, brandNormMap)
      : correctedResults,
    [correctedResults, brandNormMap],
  );

  // Post-process available brands with normalization map
  const allAvailableBrands = useMemo(() => {
    if (brandNormMap.size === 0) return allAvailableBrandsRaw;
    const seen = new Set<string>();
    const result: string[] = [];
    for (const b of allAvailableBrandsRaw) {
      const canonical = brandNormMap.get(b) ?? b;
      if (!seen.has(canonical)) {
        seen.add(canonical);
        result.push(canonical);
      }
    }
    return result.sort();
  }, [allAvailableBrandsRaw, brandNormMap]);

  const globallyFilteredResults = useMemo(
    () => computeGloballyFilteredResults(
      runStatus,
      normalizedResults,
      globalLlmFilter,
      globalPromptFilter,
      globalBrandFilter,
    ),
    [runStatus, normalizedResults, globalLlmFilter, globalPromptFilter, globalBrandFilter],
  );

  const promptCost = useMemo(
    () => computePromptCost(runStatus),
    [runStatus],
  );

  const totalBackendCost = runStatus?.actual_cost ?? 0;
  const analysisCost = Math.max(0, totalBackendCost - promptCost);

  const aiOverviewUnavailableCount = useMemo(
    () => computeAiOverviewUnavailableCount(runStatus, globallyFilteredResults),
    [runStatus, globallyFilteredResults],
  );

  // Post-process tracked brands with normalization map
  const trackedBrandsRaw = useMemo(
    () => computeTrackedBrands(runStatus),
    [runStatus],
  );

  const trackedBrands = useMemo(() => {
    if (brandNormMap.size === 0) return trackedBrandsRaw;
    // trackedBrands stores lowercase; normMap uses original case
    // Build a lowercase lookup from the normMap
    const lcMap = new Map<string, string>();
    for (const [variant, canonical] of brandNormMap) {
      lcMap.set(variant.toLowerCase(), canonical.toLowerCase());
    }
    const normalized = new Set<string>();
    for (const b of trackedBrandsRaw) {
      normalized.add(lcMap.get(b) ?? b);
    }
    return normalized;
  }, [trackedBrandsRaw, brandNormMap]);

  const filteredAvailableBrands = useMemo(
    () => computeFilteredAvailableBrands(allAvailableBrands, excludedBrands),
    [allAvailableBrands, excludedBrands],
  );

  const filteredTrackedBrands = useMemo(
    () => computeFilteredTrackedBrands(trackedBrands, excludedBrands),
    [trackedBrands, excludedBrands],
  );

  // =========================================================================
  // Filter state — Overview
  // =========================================================================
  const [brandMentionsProviderFilter, setBrandMentionsProviderFilter] = useState<string>('all');
  const [brandMentionsTrackingFilter, setBrandMentionsTrackingFilter] = useState<'all' | 'tracked'>('all');
  const [llmBreakdownBrandFilter, setLlmBreakdownBrandFilter] = useState<string>('');
  const [promptBreakdownLlmFilter, setPromptBreakdownLlmFilter] = useState<string>('all');
  const [tableSortColumn, setTableSortColumn] = useState<'default' | 'prompt' | 'llm' | 'position' | 'mentioned' | 'sentiment' | 'competitors'>('default');
  const [tableSortDirection, setTableSortDirection] = useState<'asc' | 'desc'>('asc');
  const [tableBrandFilter, setTableBrandFilter] = useState<string>('all');
  const [positionChartBrandFilter, setPositionChartBrandFilter] = useState<string>('__all__');
  const [positionChartPromptFilter, setPositionChartPromptFilter] = useState<string>('__all__');
  const [framingPromptFilter, setFramingPromptFilter] = useState<string>('all');
  // providerFilter used in the overview "All Results" table
  const [providerFilter, setProviderFilter] = useState<string>('all');

  // =========================================================================
  // Overview computations
  // =========================================================================
  const filteredBrandMentions = useMemo(
    () => computeFilteredBrandMentions(
      runStatus,
      globallyFilteredResults,
      brandMentionsProviderFilter,
      brandMentionsTrackingFilter,
      trackedBrands,
      extractUntrackedBrands,
      excludedBrands,
    ),
    [runStatus, globallyFilteredResults, brandMentionsProviderFilter, brandMentionsTrackingFilter, trackedBrands, excludedBrands],
  );

  const llmBreakdownBrands = useMemo(
    () => computeLlmBreakdownBrands(runStatus, globallyFilteredResults, excludedBrands),
    [runStatus, globallyFilteredResults, excludedBrands],
  );

  const llmBreakdownStats = useMemo(
    () => computeLlmBreakdownStats(runStatus, globallyFilteredResults, llmBreakdownBrandFilter, llmBreakdownBrands),
    [runStatus, globallyFilteredResults, llmBreakdownBrandFilter, llmBreakdownBrands],
  );

  const promptBreakdownStats = useMemo(
    () => computePromptBreakdownStats(runStatus, globallyFilteredResults, promptBreakdownLlmFilter, excludedBrands, llmBreakdownBrands),
    [runStatus, globallyFilteredResults, promptBreakdownLlmFilter, excludedBrands, llmBreakdownBrands],
  );

  const scatterProviderOrder = useMemo(
    () => computeScatterProviderOrder(runStatus, globallyFilteredResults),
    [runStatus, globallyFilteredResults],
  );

  const scatterPlotData = useMemo(
    () => computeScatterPlotData(runStatus, globallyFilteredResults, llmBreakdownBrands, scatterProviderOrder),
    [runStatus, globallyFilteredResults, llmBreakdownBrands, scatterProviderOrder],
  );

  const rangeChartData = useMemo(
    () => computeRangeChartData(runStatus, scatterPlotData),
    [runStatus, scatterPlotData],
  );

  const rangeProviderOrder = useMemo(
    () => computeRangeProviderOrder(rangeChartData),
    [rangeChartData],
  );

  const rangeViewDots = useMemo(
    () => computeRangeViewDots(scatterPlotData, rangeProviderOrder),
    [scatterPlotData, rangeProviderOrder],
  );

  const overviewMetrics = useMemo(
    () => computeOverviewMetrics(runStatus, globallyFilteredResults, llmBreakdownBrands, excludedBrands),
    [runStatus, globallyFilteredResults, llmBreakdownBrands, excludedBrands],
  );

  const llmBreakdownTakeaway = useMemo(
    () => computeLlmBreakdownTakeaway(llmBreakdownStats, llmBreakdownBrandFilter, llmBreakdownBrands, runStatus),
    [llmBreakdownStats, llmBreakdownBrandFilter, llmBreakdownBrands, runStatus],
  );

  const providerVisibilityScores = useMemo(
    () => computeProviderVisibilityScores(runStatus, globallyFilteredResults, llmBreakdownBrands),
    [runStatus, globallyFilteredResults, llmBreakdownBrands],
  );

  const filteredFramingByProvider = useMemo(
    () => computeFilteredFramingByProvider(
      isIssue,
      globallyFilteredResults,
      framingPromptFilter,
      overviewMetrics?.framingByProvider,
    ),
    [isIssue, globallyFilteredResults, framingPromptFilter, overviewMetrics],
  );

  const framingEvidenceGroups = useMemo(
    () => computeFramingEvidenceGroups(isIssue, runStatus, globallyFilteredResults),
    [isIssue, runStatus, globallyFilteredResults],
  );

  const positionChartBrandOptions = useMemo(
    () => computePositionChartBrandOptions(isCategory, globallyFilteredResults, excludedBrands, runStatus),
    [isCategory, globallyFilteredResults, excludedBrands, runStatus],
  );

  const positionByPlatformData = useMemo(
    () => computePositionByPlatformData(
      scatterPlotData,
      isCategory,
      runStatus,
      globallyFilteredResults,
      positionChartBrandFilter,
      positionChartPromptFilter,
      excludedBrands,
    ),
    [scatterPlotData, isCategory, runStatus, globallyFilteredResults, positionChartBrandFilter, positionChartPromptFilter, excludedBrands],
  );

  // Overview: filtered & sorted results for the All Results table
  const overviewFilteredResults = useMemo(
    () => computeOverviewFilteredResults(runStatus, globallyFilteredResults, providerFilter, tableBrandFilter),
    [runStatus, globallyFilteredResults, providerFilter, tableBrandFilter],
  );

  const overviewSortedResults = useMemo(
    () => computeOverviewSortedResults(overviewFilteredResults, tableSortColumn, tableSortDirection, runStatus),
    [overviewFilteredResults, tableSortColumn, tableSortDirection, runStatus],
  );

  // =========================================================================
  // Filter state — Competitive
  // =========================================================================
  const [brandBreakdownLlmFilter, setBrandBreakdownLlmFilter] = useState<string>('all');
  const [brandBreakdownPromptFilter, setBrandBreakdownPromptFilter] = useState<string>('all');
  const [brandPositioningLlmFilter, setBrandPositioningLlmFilter] = useState<string>('all');
  const [brandPositioningPromptFilter, setBrandPositioningPromptFilter] = useState<string>('all');
  const [promptMatrixLlmFilter, setPromptMatrixLlmFilter] = useState<string>('all');
  const [cooccurrenceView, setCooccurrenceView] = useState<'pairs' | 'venn'>('venn');
  const [compHeatmapProviderFilter, setCompHeatmapProviderFilter] = useState<string>('all');
  const [compHeatmapShowSentiment, setCompHeatmapShowSentiment] = useState<boolean>(false);

  // =========================================================================
  // Competitive computations
  // =========================================================================
  const brandBreakdownStats = useMemo(
    () => computeBrandBreakdownStats(runStatus, globallyFilteredResults, brandBreakdownLlmFilter, brandBreakdownPromptFilter, excludedBrands),
    [runStatus, globallyFilteredResults, brandBreakdownLlmFilter, brandBreakdownPromptFilter, excludedBrands],
  );

  // Unfiltered brand breakdown for the AI Analysis section (Industry Overview).
  // Uses 'all' for LLM/prompt filters so it's not affected by Competitive tab filter state.
  const unfilteredBrandBreakdownStats = useMemo(
    () => computeBrandBreakdownStats(runStatus, globallyFilteredResults, 'all', 'all', excludedBrands),
    [runStatus, globallyFilteredResults, excludedBrands],
  );

  const brandPositioningStats = useMemo(
    () => computeBrandPositioningStats(runStatus, globallyFilteredResults, brandPositioningLlmFilter, brandPositioningPromptFilter, excludedBrands),
    [runStatus, globallyFilteredResults, brandPositioningLlmFilter, brandPositioningPromptFilter, excludedBrands],
  );

  const promptPerformanceMatrix = useMemo(
    () => computePromptPerformanceMatrix(runStatus, globallyFilteredResults, promptMatrixLlmFilter, excludedBrands),
    [runStatus, globallyFilteredResults, promptMatrixLlmFilter, excludedBrands],
  );

  const modelPreferenceData = useMemo(
    () => computeModelPreferenceData(runStatus, globallyFilteredResults, excludedBrands),
    [runStatus, globallyFilteredResults, excludedBrands],
  );

  const brandCooccurrence = useMemo(
    () => computeBrandCooccurrence(runStatus, globallyFilteredResults, excludedBrands),
    [runStatus, globallyFilteredResults, excludedBrands],
  );

  const competitiveInsights = useMemo(
    () => computeCompetitiveInsights(runStatus, brandBreakdownStats, modelPreferenceData, brandCooccurrence),
    [runStatus, brandBreakdownStats, modelPreferenceData, brandCooccurrence],
  );

  const competitorComparisonRatio = useMemo(
    () => computeCompetitorComparisonRatio(runStatus, brandBreakdownStats),
    [runStatus, brandBreakdownStats],
  );

  const allBrandsAnalysisData = useMemo(
    () => computeAllBrandsAnalysisData(runStatus, globallyFilteredResults, brandBreakdownStats),
    [runStatus, globallyFilteredResults, brandBreakdownStats],
  );

  const brandSourceHeatmap = useMemo(
    () => computeBrandSourceHeatmap(runStatus, globallyFilteredResults, compHeatmapProviderFilter, excludedBrands),
    [runStatus, globallyFilteredResults, compHeatmapProviderFilter, excludedBrands],
  );

  // =========================================================================
  // Filter state — Sentiment
  // =========================================================================
  const [sentimentProviderBrandFilter, setSentimentProviderBrandFilter] = useState<string>('');
  const [sentimentProviderCitationFilter, setSentimentProviderCitationFilter] = useState<string>('all');
  const [sentimentProviderModelFilter, setSentimentProviderModelFilter] = useState<string>('all');
  const [competitorSentimentModelFilter, setCompetitorSentimentModelFilter] = useState<string>('all');

  // =========================================================================
  // Sentiment computations
  // =========================================================================
  const sentimentInsights = useMemo(
    () => computeSentimentInsights(runStatus, globallyFilteredResults, excludedBrands),
    [runStatus, globallyFilteredResults, excludedBrands],
  );

  const brandSentimentData = useMemo(
    () => computeBrandSentimentData(
      globallyFilteredResults,
      isCategory,
      isIssue,
      runStatus?.brand || '',
      excludedBrands,
    ),
    [globallyFilteredResults, isCategory, isIssue, runStatus?.brand, excludedBrands],
  );

  const sentimentProviderBrandOptions = useMemo(
    () => computeSentimentProviderBrandOptions(runStatus, globallyFilteredResults, isCategory, excludedBrands),
    [runStatus, globallyFilteredResults, isCategory, excludedBrands],
  );

  const citationSourceOptions = useMemo(
    () => computeCitationSourceOptions(globallyFilteredResults),
    [globallyFilteredResults],
  );

  // Resolve the effective brand for sentiment-by-provider (default depends on search type)
  const effectiveSentimentBrand = sentimentProviderBrandFilter ||
    (isCategory ? '__all__' : runStatus?.brand || '');

  const sentimentByProvider = useMemo(
    () => computeSentimentByProvider(
      globallyFilteredResults,
      effectiveSentimentBrand,
      runStatus?.brand || '',
      isCategory,
      isIssue,
      excludedBrands,
      sentimentProviderCitationFilter,
      sentimentProviderModelFilter,
    ),
    [globallyFilteredResults, effectiveSentimentBrand, runStatus?.brand, isCategory, isIssue, excludedBrands, sentimentProviderCitationFilter, sentimentProviderModelFilter],
  );

  const competitorSentimentData = useMemo(
    () => computeCompetitorSentimentData(globallyFilteredResults, trackedBrands, runStatus?.brand || '', competitorSentimentModelFilter),
    [globallyFilteredResults, trackedBrands, runStatus?.brand, competitorSentimentModelFilter],
  );

  // =========================================================================
  // Filter state — Sources
  // =========================================================================
  const [sourcesProviderFilter, setSourcesProviderFilter] = useState<string>('all');
  const [sourcesBrandFilter, setSourcesBrandFilter] = useState<string>('all');
  const [sourcePositioningBrandFilter, setSourcePositioningBrandFilter] = useState<string>('all');
  const [brandCitationsBrandFilter, setBrandCitationsBrandFilter] = useState<string>('all');
  const [brandCitationsProviderFilter, setBrandCitationsProviderFilter] = useState<string>('all');
  const [publisherPromptFilter, setPublisherPromptFilter] = useState<string>('all');
  const [publisherBrandFilter, setPublisherBrandFilter] = useState<string>('all');
  const [domainSortColumn, setDomainSortColumn] = useState<'domain' | 'usedPercent' | 'avgCitation' | 'category' | 'avgSentiment'>('usedPercent');
  const [domainSortDirection, setDomainSortDirection] = useState<'asc' | 'desc'>('desc');
  const [sourceBrandHeatmapProviderFilter, setSourceBrandHeatmapProviderFilter] = useState<string>('all');
  const [sourceBrandHeatmapSort, setSourceBrandHeatmapSort] = useState<string>('total');
  const [sourceBrandHeatmapView, setSourceBrandHeatmapView] = useState<'citations' | 'sentiment'>('citations');

  // =========================================================================
  // Sources computations
  // =========================================================================
  const topCitedSources = useMemo(
    () => computeTopCitedSources(runStatus, globallyFilteredResults, sourcesProviderFilter, sourcesBrandFilter),
    [runStatus, globallyFilteredResults, sourcesProviderFilter, sourcesBrandFilter],
  );

  const hasAnySources = useMemo(
    () => computeHasAnySources(runStatus, globallyFilteredResults),
    [runStatus, globallyFilteredResults],
  );

  const keyInfluencers = useMemo(
    () => computeKeyInfluencers(runStatus, globallyFilteredResults),
    [runStatus, globallyFilteredResults],
  );

  const sourcesInsights = useMemo(
    () => computeSourcesInsights(runStatus, globallyFilteredResults, topCitedSources, keyInfluencers),
    [runStatus, globallyFilteredResults, topCitedSources, keyInfluencers],
  );

  const sourcePositioningData = useMemo(
    () => computeSourcePositioningData(runStatus, globallyFilteredResults, sourcePositioningBrandFilter, excludedBrands, isCategory),
    [runStatus, globallyFilteredResults, sourcePositioningBrandFilter, excludedBrands, isCategory],
  );

  const sourcePositioningBrandOptions = useMemo(
    () => computeSourcePositioningBrandOptions(runStatus, globallyFilteredResults, isIssue, isPublicFigure, isCategory),
    [runStatus, globallyFilteredResults, isIssue, isPublicFigure, isCategory],
  );

  const brandWebsiteCitations = useMemo(
    () => computeBrandWebsiteCitations(
      globallyFilteredResults,
      runStatus?.brand,
      trackedBrands,
      brandCitationsBrandFilter,
      brandCitationsProviderFilter,
      isCategory,
    ),
    [globallyFilteredResults, runStatus?.brand, trackedBrands, brandCitationsBrandFilter, brandCitationsProviderFilter, isCategory],
  );

  const brandPresenceData = useMemo(
    () => computeBrandPresenceData(brandWebsiteCitations),
    [brandWebsiteCitations],
  );

  const sourceCategoryData = useMemo(
    () => computeSourceCategoryData(topCitedSources, categorizeDomain),
    [topCitedSources],
  );

  const domainTableData = useMemo(
    () => computeDomainTableData(runStatus, globallyFilteredResults, categorizeDomain, isCategory, excludedBrands),
    [runStatus, globallyFilteredResults, isCategory, excludedBrands],
  );

  const publisherPromptOptions = useMemo(
    () => computePublisherPromptOptions(domainTableData),
    [domainTableData],
  );

  const publisherBrandOptions = useMemo(
    () => computePublisherBrandOptions(domainTableData),
    [domainTableData],
  );

  const sortedDomainTableData = useMemo(
    () => computeSortedDomainTableData(domainTableData, domainSortColumn, domainSortDirection, publisherPromptFilter, publisherBrandFilter),
    [domainTableData, domainSortColumn, domainSortDirection, publisherPromptFilter, publisherBrandFilter],
  );

  const sourceBrandHeatmapData = useMemo(
    () => computeSourceBrandHeatmapData(
      isCategory,
      runStatus,
      globallyFilteredResults,
      sourceBrandHeatmapProviderFilter,
      sourceBrandHeatmapSort,
      sourceBrandHeatmapView,
      excludedBrands,
    ),
    [isCategory, runStatus, globallyFilteredResults, sourceBrandHeatmapProviderFilter, sourceBrandHeatmapSort, sourceBrandHeatmapView, excludedBrands],
  );

  const heatmapMaxValue = useMemo(
    () => computeHeatmapMaxValue(sourceBrandHeatmapData),
    [sourceBrandHeatmapData],
  );

  // =========================================================================
  // Filter state — Reference
  // =========================================================================
  const [refFilter, setRefFilter] = useState<'all' | 'mentioned' | 'not_mentioned'>('all');
  const [refProviderFilter, setRefProviderFilter] = useState<string>('all');
  const [sourceGapProviderFilter, setSourceGapProviderFilter] = useState<string>('all');
  const [sourceGapPromptFilter, setSourceGapPromptFilter] = useState<string>('all');
  const [sourceSentimentGapProviderFilter, setSourceSentimentGapProviderFilter] = useState<string>('all');
  const [sourceSentimentGapPromptFilter, setSourceSentimentGapPromptFilter] = useState<string>('all');
  const [sentimentComparisonBrand, setSentimentComparisonBrand] = useState<string>('');

  // =========================================================================
  // Reference computations
  // =========================================================================
  const sourceGapAnalysis = useMemo(
    () => computeSourceGapAnalysis(runStatus, globallyFilteredResults, sourceGapProviderFilter, sourceGapPromptFilter, excludedBrands),
    [runStatus, globallyFilteredResults, sourceGapProviderFilter, sourceGapPromptFilter, excludedBrands],
  );

  const sourceSentimentGapAnalysis = useMemo(
    () => computeSourceSentimentGapAnalysis(
      runStatus,
      globallyFilteredResults,
      sourceSentimentGapProviderFilter,
      sourceSentimentGapPromptFilter,
      sentimentComparisonBrand,
      excludedBrands,
    ),
    [runStatus, globallyFilteredResults, sourceSentimentGapProviderFilter, sourceSentimentGapPromptFilter, sentimentComparisonBrand, excludedBrands],
  );

  const referenceFilteredResults = useMemo(
    () => computeReferenceFilteredResults(runStatus, globallyFilteredResults, refFilter, refProviderFilter),
    [runStatus, globallyFilteredResults, refFilter, refProviderFilter],
  );

  const referenceAiOverviewUnavailableCount = useMemo(
    () => computeReferenceAiOverviewUnavailableCount(runStatus, globallyFilteredResults),
    [runStatus, globallyFilteredResults],
  );

  // =========================================================================
  // Recommendation computations
  // =========================================================================
  const quickWins = useMemo(
    () => computeQuickWins(runStatus, promptBreakdownStats, brandBreakdownStats, llmBreakdownStats, globallyFilteredResults, isPublicFigure),
    [runStatus, promptBreakdownStats, brandBreakdownStats, llmBreakdownStats, globallyFilteredResults, isPublicFigure],
  );

  const adOpportunities = useMemo(
    () => computeAdOpportunities(runStatus, promptBreakdownStats, brandBreakdownStats),
    [runStatus, promptBreakdownStats, brandBreakdownStats],
  );

  const sourceOpportunities = useMemo(
    () => computeSourceOpportunities(runStatus, globallyFilteredResults),
    [runStatus, globallyFilteredResults],
  );

  const parsedAiRecommendations = useMemo(
    () => computeParsedAiRecommendations(aiSummary?.recommendations, isCategory, unfilteredBrandBreakdownStats),
    [aiSummary?.recommendations, isCategory, unfilteredBrandBreakdownStats],
  );

  // =========================================================================
  // Return
  // =========================================================================
  return {
    // -- Base data --
    runStatus,
    correctedResults,
    globallyFilteredResults,
    availableProviders,
    availableBrands: filteredAvailableBrands,
    availablePrompts,
    trackedBrands: filteredTrackedBrands,
    allAvailableBrands,
    excludedBrands,
    setExcludedBrands,
    isCategory,
    isIssue,
    isPublicFigure,
    searchType,
    searchTypeConfig,
    brandMentionRate,
    aiSummary,
    isSummaryLoading,
    brandQuotesMap,
    promptCost,
    analysisCost,
    totalBackendCost,
    aiOverviewUnavailableCount,

    // -- Overview metrics --
    filteredBrandMentions,
    llmBreakdownBrands,
    llmBreakdownStats,
    promptBreakdownStats,
    scatterProviderOrder,
    scatterPlotData,
    rangeChartData,
    rangeProviderOrder,
    rangeViewDots,
    overviewMetrics,
    llmBreakdownTakeaway,
    providerVisibilityScores,
    filteredFramingByProvider,
    framingEvidenceGroups,
    positionChartBrandOptions,
    positionByPlatformData,
    overviewFilteredResults,
    overviewSortedResults,

    // -- Overview filter state + setters --
    brandMentionsProviderFilter,
    setBrandMentionsProviderFilter,
    brandMentionsTrackingFilter,
    setBrandMentionsTrackingFilter,
    llmBreakdownBrandFilter,
    setLlmBreakdownBrandFilter,
    promptBreakdownLlmFilter,
    setPromptBreakdownLlmFilter,
    tableSortColumn,
    setTableSortColumn,
    tableSortDirection,
    setTableSortDirection,
    tableBrandFilter,
    setTableBrandFilter,
    positionChartBrandFilter,
    setPositionChartBrandFilter,
    positionChartPromptFilter,
    setPositionChartPromptFilter,
    framingPromptFilter,
    setFramingPromptFilter,
    providerFilter,
    setProviderFilter,

    // -- Competitive metrics --
    brandBreakdownStats,
    unfilteredBrandBreakdownStats,
    brandPositioningStats,
    promptPerformanceMatrix,
    modelPreferenceData,
    brandCooccurrence,
    competitiveInsights,
    competitorComparisonRatio,
    allBrandsAnalysisData,
    brandSourceHeatmap,

    // -- Competitive filter state + setters --
    brandBreakdownLlmFilter,
    setBrandBreakdownLlmFilter,
    brandBreakdownPromptFilter,
    setBrandBreakdownPromptFilter,
    brandPositioningLlmFilter,
    setBrandPositioningLlmFilter,
    brandPositioningPromptFilter,
    setBrandPositioningPromptFilter,
    promptMatrixLlmFilter,
    setPromptMatrixLlmFilter,
    cooccurrenceView,
    setCooccurrenceView,
    compHeatmapProviderFilter,
    setCompHeatmapProviderFilter,
    compHeatmapShowSentiment,
    setCompHeatmapShowSentiment,

    // -- Sentiment metrics --
    sentimentInsights,
    brandSentimentData,
    sentimentProviderBrandOptions,
    citationSourceOptions,
    sentimentByProvider,
    competitorSentimentData,

    // -- Sentiment filter state + setters --
    sentimentProviderBrandFilter,
    setSentimentProviderBrandFilter,
    sentimentProviderCitationFilter,
    setSentimentProviderCitationFilter,
    sentimentProviderModelFilter,
    setSentimentProviderModelFilter,
    competitorSentimentModelFilter,
    setCompetitorSentimentModelFilter,

    // -- Sources metrics --
    topCitedSources,
    hasAnySources,
    keyInfluencers,
    sourcesInsights,
    sourcePositioningData,
    sourcePositioningBrandOptions,
    brandWebsiteCitations,
    brandPresenceData,
    sourceCategoryData,
    domainTableData,
    publisherPromptOptions,
    publisherBrandOptions,
    sortedDomainTableData,
    sourceBrandHeatmapData,
    heatmapMaxValue,

    // -- Sources filter state + setters --
    sourcesProviderFilter,
    setSourcesProviderFilter,
    sourcesBrandFilter,
    setSourcesBrandFilter,
    sourcePositioningBrandFilter,
    setSourcePositioningBrandFilter,
    brandCitationsBrandFilter,
    setBrandCitationsBrandFilter,
    brandCitationsProviderFilter,
    setBrandCitationsProviderFilter,
    publisherPromptFilter,
    setPublisherPromptFilter,
    publisherBrandFilter,
    setPublisherBrandFilter,
    domainSortColumn,
    setDomainSortColumn,
    domainSortDirection,
    setDomainSortDirection,
    sourceBrandHeatmapProviderFilter,
    setSourceBrandHeatmapProviderFilter,
    sourceBrandHeatmapSort,
    setSourceBrandHeatmapSort,
    sourceBrandHeatmapView,
    setSourceBrandHeatmapView,

    // -- Reference metrics --
    sourceGapAnalysis,
    sourceSentimentGapAnalysis,
    referenceFilteredResults,
    referenceAiOverviewUnavailableCount,

    // -- Reference filter state + setters --
    refFilter,
    setRefFilter,
    refProviderFilter,
    setRefProviderFilter,
    sourceGapProviderFilter,
    setSourceGapProviderFilter,
    sourceGapPromptFilter,
    setSourceGapPromptFilter,
    sourceSentimentGapProviderFilter,
    setSourceSentimentGapProviderFilter,
    sourceSentimentGapPromptFilter,
    setSourceSentimentGapPromptFilter,
    sentimentComparisonBrand,
    setSentimentComparisonBrand,

    // -- Recommendation metrics --
    quickWins,
    adOpportunities,
    sourceOpportunities,
    parsedAiRecommendations,
  };
}

/** Convenience type for the return value of useResultsStore. */
export type ResultsStoreValue = ReturnType<typeof useResultsStore>;
