/**
 * Pure computation functions extracted from page.tsx and OverviewTab.tsx useMemo blocks.
 * No hooks, no state, no closures — every dependency is an explicit parameter.
 */

import type { Result, RunStatusResponse } from '../../tabs/shared';
import type {
  OverviewMetrics,
  ScatterPlotPoint,
  RangeChartRow,
  RangeViewDot,
  LlmBreakdownRow,
  PromptBreakdownRow,
  ShareOfVoiceEntry,
  BrandMentionEntry,
  ProviderVisibilityScore,
  FramingEvidenceItem,
  PositionChartOption,
  PositionByPlatformData,
  PositionDot,
} from '../types';

import {
  getProviderLabel,
  getTextForRanking,
  positionToRankBand,
  getSentimentScore,
  isCategoryName,
  getDomain,
  rankToRangeX,
  PROVIDER_ORDER,
  POSITION_CATEGORIES,
  sentimentOrder,
} from '../../tabs/shared';

import { truncate } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Provider label map used by scatter / range / position chart computations
// ---------------------------------------------------------------------------
const providerLabels: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Claude',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
  ai_overviews: 'Google AI Overviews',
  grok: 'Grok',
  llama: 'Llama',
};

// ---------------------------------------------------------------------------
// filteredBrandMentions  (page.tsx line 1066)
// ---------------------------------------------------------------------------

export function computeFilteredBrandMentions(
  runStatus: RunStatusResponse | null,
  globallyFilteredResults: Result[],
  brandMentionsProviderFilter: string,
  brandMentionsTrackingFilter: string,
  trackedBrands: Set<string>,
  extractUntrackedBrands: (text: string, trackedSet: Set<string>, categoryName: string) => string[],
): Record<string, BrandMentionEntry> {
  if (!runStatus) return {};

  const results = globallyFilteredResults.filter((r: Result) => {
    if (r.error) return false;
    if (brandMentionsProviderFilter !== 'all' && r.provider !== brandMentionsProviderFilter) return false;
    return true;
  });

  const mentions: Record<string, { count: number; total: number; isTracked: boolean }> = {};
  const isCategory = runStatus.search_type === 'category';

  if (!isCategory) {
    const searchedBrand = runStatus.brand;
    let brandMentionCount = 0;
    for (const result of results) {
      if (result.brand_mentioned) {
        brandMentionCount += 1;
      }
    }
    if (searchedBrand) {
      mentions[searchedBrand] = { count: brandMentionCount, total: results.length, isTracked: true };
    }
  }

  for (const result of results) {
    const rBrands = result.all_brands_mentioned?.length ? result.all_brands_mentioned : result.competitors_mentioned || [];
    for (const comp of rBrands) {
      if (!mentions[comp]) {
        mentions[comp] = { count: 0, total: 0, isTracked: true };
      }
      mentions[comp].count += 1;
    }
  }

  const untrackedMentions: Record<string, number> = {};
  for (const result of results) {
    if (result.response_text) {
      const untrackedBrands = extractUntrackedBrands(
        result.response_text,
        trackedBrands,
        runStatus.brand || ''
      );
      for (const brand of untrackedBrands) {
        untrackedMentions[brand] = (untrackedMentions[brand] || 0) + 1;
      }
    }
  }

  const minMentions = Math.max(2, Math.floor(results.length * 0.1));
  for (const [brand, count] of Object.entries(untrackedMentions)) {
    if (count >= minMentions && !mentions[brand]) {
      mentions[brand] = { count, total: 0, isTracked: false };
    }
  }

  const totalResults = results.length;
  const mentionsWithRates: Record<string, BrandMentionEntry> = {};

  for (const [comp, data] of Object.entries(mentions)) {
    if (brandMentionsTrackingFilter === 'tracked' && !data.isTracked) continue;

    mentionsWithRates[comp] = {
      count: data.count,
      rate: totalResults > 0 ? data.count / totalResults : 0,
      isTracked: data.isTracked,
    };
  }

  return mentionsWithRates;
}

// ---------------------------------------------------------------------------
// shareOfVoiceData  (page.tsx line 1139)
// ---------------------------------------------------------------------------

export function computeShareOfVoiceData(
  runStatus: RunStatusResponse | null,
  globallyFilteredResults: Result[],
  brandMentionsProviderFilter: string,
  trackedBrands: Set<string>,
  shareOfVoiceFilter: string,
  excludedBrands: Set<string>,
  extractUntrackedBrands: (text: string, trackedSet: Set<string>, categoryName: string) => string[],
): ShareOfVoiceEntry[] {
  if (!runStatus) return [];

  const results = globallyFilteredResults.filter((r: Result) => {
    if (r.error) return false;
    if (brandMentionsProviderFilter !== 'all' && r.provider !== brandMentionsProviderFilter) return false;
    return true;
  });

  const mentions: Record<string, { count: number; isTracked: boolean }> = {};
  const isCategory = runStatus.search_type === 'category';

  if (!isCategory && runStatus.brand) {
    let brandMentionCount = 0;
    for (const result of results) {
      if (result.brand_mentioned) {
        brandMentionCount += 1;
      }
    }
    if (brandMentionCount > 0) {
      mentions[runStatus.brand] = { count: brandMentionCount, isTracked: true };
    }
  }

  for (const result of results) {
    const rBrands = result.all_brands_mentioned?.length ? result.all_brands_mentioned : result.competitors_mentioned || [];
    for (const comp of rBrands) {
      if (!mentions[comp]) {
        mentions[comp] = { count: 0, isTracked: true };
      }
      mentions[comp].count += 1;
    }
  }

  // Remove excluded brands
  for (const eb of excludedBrands) {
    delete mentions[eb];
  }

  let otherCount = 0;
  for (const result of results) {
    if (result.response_text) {
      const untrackedBrands = extractUntrackedBrands(
        result.response_text,
        trackedBrands,
        runStatus.brand || ''
      );
      otherCount += untrackedBrands.length;
    }
  }

  const trackedTotal = Object.values(mentions).reduce((sum, m) => sum + m.count, 0);
  const includeOther = shareOfVoiceFilter === 'all' && otherCount > 0;
  const totalMentions = includeOther ? trackedTotal + otherCount : trackedTotal;
  if (totalMentions === 0) return [];

  // Top-N grouping: show top 6 brands + "All other brands"
  const TOP_N = 6;
  const sortedBrands = Object.entries(mentions)
    .sort((a, b) => b[1].count - a[1].count);

  // Get the selected/searched brand
  const selectedBrand = runStatus.brand;

  // Determine which brands to show
  let topBrands = sortedBrands.slice(0, TOP_N);
  const topBrandNames = topBrands.map(([name]) => name);

  // If searched brand is not in top N, swap it in
  if (selectedBrand && !topBrandNames.includes(selectedBrand)) {
    const selectedBrandEntry = sortedBrands.find(([name]) => name === selectedBrand);
    if (selectedBrandEntry) {
      topBrands = [...topBrands.slice(0, TOP_N - 1), selectedBrandEntry];
    }
  }

  // Calculate "All other brands" from remaining tracked brands + untracked
  const topBrandNamesSet = new Set(topBrands.map(([name]) => name));
  let allOtherCount = otherCount; // Start with untracked brands count
  for (const [brand, data] of sortedBrands) {
    if (!topBrandNamesSet.has(brand)) {
      allOtherCount += data.count;
    }
  }

  // Build chart data
  const chartData: ShareOfVoiceEntry[] = [];
  const accentColor = '#111827'; // Dark accent for selected brand
  const neutralColor = '#94a3b8'; // Slate gray for other named brands
  const otherColor = '#d1d5db'; // Light gray for "All other brands"

  for (const [brand, data] of topBrands) {
    const percentage = (data.count / totalMentions) * 100;
    const isSelectedBrand = brand === selectedBrand;
    chartData.push({
      name: brand,
      value: data.count,
      percentage,
      color: isSelectedBrand ? accentColor : neutralColor,
      isSelected: isSelectedBrand,
      isOther: false,
    });
  }

  // Sort by percentage descending (selected brand stays in its natural position)
  chartData.sort((a, b) => b.percentage - a.percentage);

  // Add "All other brands" at the end only when showing all brands
  if (includeOther && allOtherCount > 0) {
    const percentage = (allOtherCount / totalMentions) * 100;
    chartData.push({
      name: 'All other brands',
      value: allOtherCount,
      percentage,
      color: otherColor,
      isSelected: false,
      isOther: true,
    });
  }

  return chartData;
}

// ---------------------------------------------------------------------------
// llmBreakdownBrands  (page.tsx line 1263)
// ---------------------------------------------------------------------------

export function computeLlmBreakdownBrands(
  runStatus: RunStatusResponse | null,
  globallyFilteredResults: Result[],
  excludedBrands: Set<string>,
): string[] {
  if (!runStatus) return [];
  const isCategory = runStatus.search_type === 'category';

  const mentionCounts: Record<string, number> = {};
  globallyFilteredResults.forEach((r: Result) => {
    if (!r.error) {
      const rBrands = r.all_brands_mentioned?.length ? r.all_brands_mentioned : r.competitors_mentioned || [];
      rBrands.forEach((c: string) => {
        mentionCounts[c] = (mentionCounts[c] || 0) + 1;
      });
    }
  });

  if (isCategory) {
    return Object.entries(mentionCounts)
      .filter(([brand]) => !isCategoryName(brand, runStatus.brand))
      .sort((a, b) => b[1] - a[1])
      .map(([brand]) => brand)
      .filter(b => !excludedBrands.has(b));
  } else {
    const brands: string[] = [];
    if (runStatus.brand) {
      brands.push(runStatus.brand);
    }
    Object.entries(mentionCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([brand]) => {
        if (!brands.includes(brand)) brands.push(brand);
      });
    return brands.filter(b => !excludedBrands.has(b));
  }
}

// ---------------------------------------------------------------------------
// llmBreakdownStats  (page.tsx line 1298)
// ---------------------------------------------------------------------------

export function computeLlmBreakdownStats(
  runStatus: RunStatusResponse | null,
  globallyFilteredResults: Result[],
  llmBreakdownBrandFilter: string,
  llmBreakdownBrands: string[],
): Record<string, LlmBreakdownRow> {
  if (!runStatus) return {};

  const isCategory = runStatus.search_type === 'category';
  const defaultBrand = isCategory ? llmBreakdownBrands[0] : runStatus.brand;
  const selectedBrand = llmBreakdownBrandFilter || defaultBrand;
  if (!selectedBrand) return {};

  const results = globallyFilteredResults.filter((r: Result) => !r.error);
  const isSearchedBrand = !isCategory && selectedBrand === runStatus.brand;

  const providerStats: Record<string, LlmBreakdownRow> = {};

  for (const result of results) {
    const provider = result.provider;
    if (!providerStats[provider]) {
      providerStats[provider] = {
        mentioned: 0,
        total: 0,
        rate: 0,
        topPosition: null,
        ranks: [],
        avgRank: null,
      };
    }
    providerStats[provider].total += 1;

    let isMentioned = false;
    if (isSearchedBrand) {
      isMentioned = result.brand_mentioned === true;
    } else {
      isMentioned = (result.all_brands_mentioned?.length ? result.all_brands_mentioned.includes(selectedBrand) : result.competitors_mentioned?.includes(selectedBrand)) || false;
    }

    if (isMentioned) {
      providerStats[provider].mentioned += 1;

      if (result.response_text) {
        const brandLower = selectedBrand.toLowerCase();

        const allBrands: string[] = result.all_brands_mentioned && result.all_brands_mentioned.length > 0
          ? result.all_brands_mentioned.filter((b): b is string => typeof b === 'string')
          : [...(runStatus.search_type === 'category' ? [] : [runStatus.brand]), ...(result.competitors_mentioned || [])].filter((b): b is string => typeof b === 'string');

        // Rank by text position
        const rankingText = getTextForRanking(result.response_text, result.provider).toLowerCase();
        const brandPos = rankingText.indexOf(brandLower);
        let rank = 0;
        if (brandPos >= 0) {
          let brandsBeforeCount = 0;
          for (const b of allBrands) {
            const bLower = b.toLowerCase();
            if (bLower === brandLower || bLower.includes(brandLower) || brandLower.includes(bLower)) continue;
            const bPos = rankingText.indexOf(bLower);
            if (bPos >= 0 && bPos < brandPos) brandsBeforeCount++;
          }
          rank = brandsBeforeCount + 1;
        } else {
          rank = allBrands.length + 1;
        }

        if (rank > 0) {
          providerStats[provider].ranks.push(rank);
          // Track best (lowest) position achieved
          if (providerStats[provider].topPosition === null || rank < providerStats[provider].topPosition) {
            providerStats[provider].topPosition = rank;
          }
        }
      }
    }
  }

  for (const provider of Object.keys(providerStats)) {
    const stats = providerStats[provider];
    stats.rate = stats.total > 0 ? stats.mentioned / stats.total : 0;
    stats.avgRank = stats.ranks.length > 0
      ? stats.ranks.reduce((a, b) => a + b, 0) / stats.ranks.length
      : null;
  }

  return providerStats;
}

// ---------------------------------------------------------------------------
// promptBreakdownStats  (page.tsx line 1392)
// ---------------------------------------------------------------------------

export function computePromptBreakdownStats(
  runStatus: RunStatusResponse | null,
  globallyFilteredResults: Result[],
  promptBreakdownLlmFilter: string,
  excludedBrands: Set<string>,
): PromptBreakdownRow[] {
  if (!runStatus) return [];

  const results = globallyFilteredResults.filter((r: Result) => {
    if (r.error) return false;
    if (promptBreakdownLlmFilter !== 'all' && r.provider !== promptBreakdownLlmFilter) return false;
    return true;
  });
  const searchedBrand = runStatus.brand;

  // Group results by prompt
  const promptGroups: Record<string, Result[]> = {};
  for (const result of results) {
    if (!promptGroups[result.prompt]) {
      promptGroups[result.prompt] = [];
    }
    promptGroups[result.prompt].push(result);
  }

  const sentimentScoreMap: Record<string, number> = {
    'strong_endorsement': 5,
    'positive_endorsement': 4,
    'neutral_mention': 3,
    'conditional': 2,
    'negative_comparison': 1,
    'not_mentioned': 0,
  };

  const promptStats = Object.entries(promptGroups).map(([prompt, promptResults]) => {
    const total = promptResults.length;
    const mentioned = promptResults.filter(r => r.brand_mentioned).length;
    const visibilityScore = total > 0 ? (mentioned / total) * 100 : 0;

    // Share of Voice: brand mentions / total brand mentions (including competitors)
    let totalBrandMentions = 0;
    let searchedBrandMentions = 0;
    promptResults.forEach(r => {
      if (r.brand_mentioned) {
        searchedBrandMentions++;
        totalBrandMentions++;
      }
      const rBrands = r.all_brands_mentioned?.length ? r.all_brands_mentioned : r.competitors_mentioned || [];
      totalBrandMentions += rBrands.length;
    });
    const shareOfVoice = totalBrandMentions > 0 ? (searchedBrandMentions / totalBrandMentions) * 100 : 0;

    // First Position: how often brand appears first
    let firstPositionCount = 0;
    const ranks: number[] = [];

    promptResults.forEach(r => {
      if (!r.brand_mentioned) return;

      const allBrands: string[] = r.all_brands_mentioned && r.all_brands_mentioned.length > 0
        ? r.all_brands_mentioned.filter((b): b is string => typeof b === 'string')
        : [searchedBrand, ...(r.competitors_mentioned || [])].filter((b): b is string => typeof b === 'string');

      const brandLower = searchedBrand.toLowerCase();
      const rankingText = r.response_text ? getTextForRanking(r.response_text, r.provider).toLowerCase() : '';
      const brandPos = rankingText.indexOf(brandLower);
      let rank = allBrands.length + 1;
      if (brandPos >= 0) {
        let brandsBeforeCount = 0;
        for (const b of allBrands) {
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

    const firstPositionRate = total > 0 ? (firstPositionCount / total) * 100 : 0;
    const avgRank = ranks.length > 0 ? ranks.reduce((a, b) => a + b, 0) / ranks.length : null;

    // Average sentiment
    const isCategory = runStatus.search_type === 'category';
    let avgSentimentScore: number | null = null;
    if (isCategory) {
      // For industry reports, average competitor_sentiments across all brands (excluding category name and excluded brands)
      const scores: number[] = [];
      promptResults.forEach(r => {
        if (!r.competitor_sentiments) return;
        Object.entries(r.competitor_sentiments).forEach(([brand, sentiment]) => {
          if (!sentiment || sentiment === 'not_mentioned') return;
          if (isCategoryName(brand, searchedBrand)) return;
          if (excludedBrands.has(brand)) return;
          const score = sentimentScoreMap[sentiment] || 0;
          if (score > 0) scores.push(score);
        });
      });
      avgSentimentScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    } else {
      const sentimentResults = promptResults.filter(r => r.brand_mentioned && r.brand_sentiment && r.brand_sentiment !== 'not_mentioned');
      avgSentimentScore = sentimentResults.length > 0
        ? sentimentResults.reduce((sum, r) => sum + (sentimentScoreMap[r.brand_sentiment || ''] || 0), 0) / sentimentResults.length
        : null;
    }

    // Issue-specific per-prompt metrics
    const isIssueType = runStatus.search_type === 'issue';
    const issueFramingMap: Record<string, string> = {
      strong_endorsement: 'Supportive', positive_endorsement: 'Leaning Supportive',
      neutral_mention: 'Balanced', conditional: 'Mixed', negative_comparison: 'Critical',
    };

    // Discussion polarity: supportive% vs critical%
    let issueSupportiveCount = 0;
    let issueCriticalCount = 0;
    let issueNeutralCount = 0;
    // Dominant framing per prompt
    const issueFramingCounts: Record<string, number> = {};
    // Platform consensus per prompt
    const issueProviderDominant: Record<string, string> = {};
    const issueProviderFramings: Record<string, Record<string, number>> = {};
    // Related issues per prompt
    const issueRelated = new Set<string>();

    if (isIssueType) {
      for (const r of promptResults) {
        const raw = r.brand_sentiment;
        if (!raw || raw === 'not_mentioned') {
          // Still collect related issues from unmentioned results
          if (r.competitors_mentioned) {
            for (const c of r.competitors_mentioned) issueRelated.add(c);
          }
          continue;
        }
        const label = issueFramingMap[raw] || 'Balanced';
        issueFramingCounts[label] = (issueFramingCounts[label] || 0) + 1;
        if (label === 'Supportive' || label === 'Leaning Supportive') issueSupportiveCount++;
        else if (label === 'Critical') issueCriticalCount++;
        else issueNeutralCount++;

        // Per-provider framing
        if (!issueProviderFramings[r.provider]) issueProviderFramings[r.provider] = {};
        issueProviderFramings[r.provider][label] = (issueProviderFramings[r.provider][label] || 0) + 1;

        if (r.competitors_mentioned) {
          for (const c of r.competitors_mentioned) issueRelated.add(c);
        }
      }
      // Find each provider's dominant framing
      for (const [prov, counts] of Object.entries(issueProviderFramings)) {
        let best = ''; let bestC = 0;
        for (const [l, c] of Object.entries(counts)) { if (c > bestC) { bestC = c; best = l; } }
        issueProviderDominant[prov] = best;
      }
    }

    const issuePolarTotal = issueSupportiveCount + issueCriticalCount + issueNeutralCount;
    const issueSupportivePct = issuePolarTotal > 0 ? (issueSupportiveCount / issuePolarTotal) * 100 : 0;
    const issueCriticalPct = issuePolarTotal > 0 ? (issueCriticalCount / issuePolarTotal) * 100 : 0;

    // Dominant framing for this prompt
    let issueDominantFraming = 'Balanced';
    let maxFramingCount = 0;
    for (const [label, count] of Object.entries(issueFramingCounts)) {
      if (count > maxFramingCount) { maxFramingCount = count; issueDominantFraming = label; }
    }

    // Platform consensus for this prompt
    let issueConsensus = 5;
    const provCount = Object.keys(issueProviderDominant).length;
    if (provCount > 0) {
      const agreementCounts: Record<string, number> = {};
      for (const f of Object.values(issueProviderDominant)) agreementCounts[f] = (agreementCounts[f] || 0) + 1;
      const maxAgree = Math.max(...Object.values(agreementCounts));
      issueConsensus = Math.max(1, Math.min(10, Math.round((maxAgree / provCount) * 10)));
    }

    // Public figure per-prompt metrics
    const PFIG_SCORE: Record<string, number> = {
      strong_endorsement: 2, positive_endorsement: 1, neutral_mention: 0, conditional: -1, negative_comparison: -2,
    };
    let pfPortrayalScore = 0;
    let pfSentimentSplit = { positive: 0, neutral: 0, negative: 0 };
    let pfFigureProminence = { figureRate: 0, avgCompetitorRate: 0 };
    let pfPlatformAgreement = 5;

    if (runStatus.search_type === 'public_figure') {
      let pfSum = 0; let pfCount = 0;
      let pfPos = 0; let pfNeu = 0; let pfNeg = 0;
      const pfProvScores: Record<string, number[]> = {};

      for (const r of promptResults) {
        const raw = r.brand_sentiment;
        if (!raw || raw === 'not_mentioned') continue;
        pfSum += PFIG_SCORE[raw] ?? 0;
        pfCount++;
        if (raw === 'strong_endorsement' || raw === 'positive_endorsement') pfPos++;
        else if (raw === 'negative_comparison') pfNeg++;
        else pfNeu++; // neutral_mention + conditional both count as neutral
        if (!pfProvScores[r.provider]) pfProvScores[r.provider] = [];
        pfProvScores[r.provider].push(PFIG_SCORE[raw] ?? 0);
      }
      pfPortrayalScore = pfCount > 0 ? Math.round((pfSum / pfCount) * 50) : 0;
      const pfTotal = pfPos + pfNeu + pfNeg;
      pfSentimentSplit = {
        positive: pfTotal > 0 ? Math.round((pfPos / pfTotal) * 100) : 0,
        neutral: pfTotal > 0 ? Math.round((pfNeu / pfTotal) * 100) : 0,
        negative: pfTotal > 0 ? Math.round((pfNeg / pfTotal) * 100) : 0,
      };

      // Figure prominence per prompt
      const pfFigRate = visibilityScore;
      const pfCompCounts: Record<string, number> = {};
      for (const r of promptResults) {
        const pfBrands = r.all_brands_mentioned?.length ? r.all_brands_mentioned : r.competitors_mentioned || [];
        for (const c of pfBrands) { if (!isCategoryName(c, searchedBrand)) pfCompCounts[c] = (pfCompCounts[c] || 0) + 1; }
      }
      const pfCompRates = Object.values(pfCompCounts).map(c => total > 0 ? (c / total) * 100 : 0);
      const pfAvgComp = pfCompRates.length > 0 ? pfCompRates.reduce((a, b) => a + b, 0) / pfCompRates.length : 0;
      pfFigureProminence = { figureRate: pfFigRate, avgCompetitorRate: pfAvgComp };

      // Platform agreement per prompt
      const pfProvAvgs: number[] = [];
      for (const scores of Object.values(pfProvScores)) {
        pfProvAvgs.push(scores.reduce((a, b) => a + b, 0) / scores.length);
      }
      if (pfProvAvgs.length > 1) {
        const mean = pfProvAvgs.reduce((a, b) => a + b, 0) / pfProvAvgs.length;
        const variance = pfProvAvgs.reduce((s, v) => s + (v - mean) ** 2, 0) / pfProvAvgs.length;
        pfPlatformAgreement = Math.max(1, Math.min(10, Math.round(10 - Math.sqrt(variance) * 4.5)));
      } else {
        pfPlatformAgreement = 10;
      }
    }

    return {
      prompt,
      total,
      mentioned,
      visibilityScore,
      shareOfVoice,
      firstPositionRate,
      avgRank,
      avgSentimentScore,
      // Issue-specific
      issueSupportivePct,
      issueCriticalPct,
      issueDominantFraming,
      issueConsensus,
      issueRelatedCount: issueRelated.size,
      // Public figure-specific
      pfPortrayalScore,
      pfSentimentSplit,
      pfFigureProminence,
      pfPlatformAgreement,
    };
  });

  // Sort by visibility score descending
  return promptStats.sort((a, b) => b.visibilityScore - a.visibilityScore);
}

// ---------------------------------------------------------------------------
// scatterProviderOrder  (page.tsx line 3282)
// ---------------------------------------------------------------------------

export function computeScatterProviderOrder(
  runStatus: RunStatusResponse | null,
  globallyFilteredResults: Result[],
): string[] {
  if (!runStatus) return [];
  const providers = new Set<string>();
  globallyFilteredResults.forEach((r: Result) => {
    if (!r.error) providers.add(r.provider);
  });
  return PROVIDER_ORDER.filter(p => providers.has(p));
}

// ---------------------------------------------------------------------------
// scatterPlotData  (page.tsx line 3291)
// ---------------------------------------------------------------------------

export function computeScatterPlotData(
  runStatus: RunStatusResponse | null,
  globallyFilteredResults: Result[],
  llmBreakdownBrands: string[],
  scatterProviderOrder: string[],
): ScatterPlotPoint[] {
  if (!runStatus || scatterProviderOrder.length === 0) return [];

  const isCategory = runStatus.search_type === 'category';
  const selectedBrand = isCategory ? llmBreakdownBrands[0] : runStatus.brand;
  if (!selectedBrand) return [];

  const results = globallyFilteredResults.filter((r: Result) => !r.error);

  // Create one data point per result
  const dataPoints: ScatterPlotPoint[] = [];

  for (const result of results) {
    const provider = result.provider;
    let rank = 0; // 0 means not mentioned

    if (result.response_text) {
      const brandLower = selectedBrand.toLowerCase();

      // Check if brand is mentioned
      const isMentioned = isCategory
        ? (result.all_brands_mentioned?.length ? result.all_brands_mentioned.includes(selectedBrand) : result.competitors_mentioned?.includes(selectedBrand))
        : result.brand_mentioned;

      if (isMentioned) {
        const textLower = getTextForRanking(result.response_text, result.provider).toLowerCase();
        const brandTextPos = textLower.indexOf(brandLower);
        const allBrands: string[] = result.all_brands_mentioned && result.all_brands_mentioned.length > 0
          ? result.all_brands_mentioned.filter((b): b is string => typeof b === 'string')
          : [...(runStatus.search_type === 'category' ? [] : [runStatus.brand]), ...(result.competitors_mentioned || [])].filter((b): b is string => typeof b === 'string');

        if (brandTextPos >= 0) {
          // Count how many other brands appear before the searched brand in the text
          let brandsBeforeCount = 0;
          for (const b of allBrands) {
            const bLower = b.toLowerCase();
            if (bLower === brandLower || bLower.includes(brandLower) || brandLower.includes(bLower)) continue;
            const bPos = textLower.indexOf(bLower);
            if (bPos >= 0 && bPos < brandTextPos) {
              brandsBeforeCount++;
            }
          }
          rank = brandsBeforeCount + 1;
        } else {
          // Brand is mentioned but we can't find its exact position in text
          rank = allBrands.length + 1;
        }
      }
    }

    const { label: rankBand, index: rankBandIndex } = positionToRankBand(rank, rank > 0);
    const xIndex = scatterProviderOrder.indexOf(provider);

    dataPoints.push({
      provider,
      label: providerLabels[provider] || provider,
      prompt: truncate(result.prompt, 30),
      rank,
      rankBand,
      rankBandIndex,
      xIndex,
      xIndexWithOffset: xIndex, // Will be adjusted below
      isMentioned: rank > 0,
      sentiment: isCategory
        ? (result.competitor_sentiments?.[selectedBrand] || null)
        : (result.brand_sentiment || null),
      originalResult: result,
    });
  }

  // Add horizontal offset for dots at the same position (same LLM + same rank band)
  // Group by provider and rankBandIndex
  const positionGroups: Record<string, number[]> = {};
  dataPoints.forEach((dp, idx) => {
    const key = `${dp.provider}-${dp.rankBandIndex}`;
    if (!positionGroups[key]) {
      positionGroups[key] = [];
    }
    positionGroups[key].push(idx);
  });

  // Apply horizontal offset to dots in groups with multiple items
  const offsetStep = 0.08; // Horizontal offset between dots
  Object.values(positionGroups).forEach(indices => {
    if (indices.length > 1) {
      const totalOffset = (indices.length - 1) * offsetStep;
      indices.forEach((idx, i) => {
        // Center the group around the original position
        dataPoints[idx].xIndexWithOffset =
          dataPoints[idx].xIndex - totalOffset / 2 + i * offsetStep;
      });
    }
  });

  return dataPoints;
}

// ---------------------------------------------------------------------------
// rangeChartData  (page.tsx line 3401)
// ---------------------------------------------------------------------------

export function computeRangeChartData(
  runStatus: RunStatusResponse | null,
  scatterPlotData: ScatterPlotPoint[],
): RangeChartRow[] {
  if (!runStatus || scatterPlotData.length === 0) return [];

  // Group by provider
  const providerStats: Record<string, {
    provider: string;
    label: string;
    dataPoints: { rank: number; bandIndex: number }[];
  }> = {};

  for (const dp of scatterPlotData) {
    if (!providerStats[dp.provider]) {
      providerStats[dp.provider] = {
        provider: dp.provider,
        label: dp.label,
        dataPoints: [],
      };
    }
    providerStats[dp.provider].dataPoints.push({
      rank: dp.rank,
      bandIndex: dp.rankBandIndex,
    });
  }

  // Sort providers by popularity order, then map to chart data
  const sortedProviders = Object.values(providerStats).sort((a, b) => {
    const aIdx = PROVIDER_ORDER.indexOf(a.provider);
    const bIdx = PROVIDER_ORDER.indexOf(b.provider);
    return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
  });

  return sortedProviders.map((stats, index) => {
    const mentionedPoints = stats.dataPoints.filter(p => p.rank > 0);
    const allBandIndices = stats.dataPoints.map(p => p.bandIndex);
    const allRangeX = stats.dataPoints.map(p => rankToRangeX(p.rank));

    const bestBandIndex = Math.min(...allBandIndices);
    const worstBandIndex = Math.max(...allBandIndices);

    // For Range chart: use actual positions
    const bestRangeX = Math.min(...allRangeX);
    const worstRangeX = Math.max(...allRangeX);

    let avgBandIndex = 5; // Default to "Not shown"
    let avgPositionNumeric: number | null = null;
    let avgBandLabel = 'Not shown';

    if (mentionedPoints.length > 0) {
      avgPositionNumeric = mentionedPoints.reduce((sum, p) => sum + p.rank, 0) / mentionedPoints.length;
      const avgBand = positionToRankBand(Math.round(avgPositionNumeric), true);
      avgBandIndex = avgBand.index;
      avgBandLabel = avgBand.label;
    }

    // Calculate average ranking (not mentioned = 11)
    const ranksWithNotMentionedAs11 = stats.dataPoints.map(p => p.rank === 0 ? 11 : p.rank);
    const avgRanking = ranksWithNotMentionedAs11.reduce((sum, r) => sum + r, 0) / ranksWithNotMentionedAs11.length;

    // Calculate median ranking (not mentioned = 11)
    const sortedRanks = [...ranksWithNotMentionedAs11].sort((a, b) => a - b);
    const mid = Math.floor(sortedRanks.length / 2);
    const medianRanking = sortedRanks.length % 2 !== 0
      ? sortedRanks[mid]
      : (sortedRanks[mid - 1] + sortedRanks[mid]) / 2;

    // Convert average/median ranking to X position
    // rank 1-9 -> position 0-8, rank 10+ -> position 9 ("Shown after top 10"), rank exactly 11 -> position 10 ("Not shown")
    const rankToXPosition = (rank: number): number => {
      if (rank <= 9) return rank - 1;
      if (rank === 11) return 10; // Only exactly 11 (all not mentioned) goes to "Not shown"
      return 9; // Everything else (10, 10.5, 12, etc.) goes to "Shown after top 10"
    };
    const avgRankingX = rankToXPosition(avgRanking);
    const medianRankingX = rankToXPosition(medianRanking);

    // For Range chart stacked bar: rangeHeight spans from best to worst
    // Use small minimum (0.2) for visibility when all dots are at the same position
    // Hide range bar entirely when there's only 1 response (no meaningful range)
    const rangeHeight = stats.dataPoints.length === 1 ? 0 : Math.max(0.2, worstRangeX - bestRangeX);

    return {
      provider: stats.provider,
      label: stats.label,
      yIndex: index, // Numeric Y position for alignment
      bestBandIndex,
      worstBandIndex,
      bestRangeX,
      worstRangeX,
      avgBandIndex,
      avgBandLabel,
      avgPositionNumeric,
      avgRanking,
      avgRankingX,
      medianRanking,
      medianRankingX,
      promptsAnalyzed: stats.dataPoints.length,
      mentions: mentionedPoints.length,
      // For Range bar chart rendering - rangeStart positions the invisible spacer
      rangeStart: bestRangeX,
      rangeHeight,
    };
  });
}

// ---------------------------------------------------------------------------
// rangeProviderOrder  (page.tsx line 3506)
// ---------------------------------------------------------------------------

export function computeRangeProviderOrder(
  rangeChartData: RangeChartRow[],
): string[] {
  return rangeChartData.map(d => d.provider);
}

// ---------------------------------------------------------------------------
// rangeViewDots  (page.tsx line 3511)
// ---------------------------------------------------------------------------

export function computeRangeViewDots(
  scatterPlotData: ScatterPlotPoint[],
  rangeProviderOrder: string[],
): RangeViewDot[] {
  if (!scatterPlotData.length || !rangeProviderOrder.length) return [];

  // Group by provider and actual rank position for horizontal offset
  const positionGroups: Record<string, number[]> = {};
  scatterPlotData.forEach((dp, idx) => {
    const rangeX = rankToRangeX(dp.rank);
    const key = `${dp.provider}-${rangeX}`;
    if (!positionGroups[key]) {
      positionGroups[key] = [];
    }
    positionGroups[key].push(idx);
  });

  // Create dots with horizontal offset and provider label for Y positioning
  const offsetStep = 0.08;
  return scatterPlotData.map((dp, idx) => {
    const rangeX = rankToRangeX(dp.rank);
    const key = `${dp.provider}-${rangeX}`;
    const group = positionGroups[key];
    let xOffset = 0;

    if (group.length > 1) {
      const indexInGroup = group.indexOf(idx);
      const totalOffset = (group.length - 1) * offsetStep;
      xOffset = -totalOffset / 2 + indexInGroup * offsetStep;
    }

    // Get numeric Y position based on provider order
    const yIndex = rangeProviderOrder.indexOf(dp.provider);

    return {
      label: dp.label,
      provider: dp.provider,
      yIndex, // Numeric Y index for positioning
      x: rangeX + xOffset, // X position using actual rank with offset
      prompt: dp.prompt,
      rank: dp.rank,
      isMentioned: dp.isMentioned,
      sentiment: dp.sentiment,
      originalResult: dp.originalResult,
    };
  });
}

// ---------------------------------------------------------------------------
// overviewMetrics  (page.tsx line 3557)
// ---------------------------------------------------------------------------

export function computeOverviewMetrics(
  runStatus: RunStatusResponse | null,
  globallyFilteredResults: Result[],
  llmBreakdownBrands: string[],
): OverviewMetrics | null {
  if (!runStatus) return null;

  const isCategory = runStatus.search_type === 'category';
  const results = globallyFilteredResults.filter((r: Result) => !r.error);
  const selectedBrand = isCategory ? llmBreakdownBrands[0] : runStatus.brand;

  // Overall visibility score
  let mentionedCount = 0;
  for (const result of results) {
    const isMentioned = isCategory
      ? (result.all_brands_mentioned?.length ? result.all_brands_mentioned.includes(selectedBrand || '') : result.competitors_mentioned?.includes(selectedBrand || ''))
      : result.brand_mentioned;
    if (isMentioned) mentionedCount++;
  }
  const overallVisibility = results.length > 0 ? (mentionedCount / results.length) * 100 : 0;

  // Average rank and top position count — only for results where brand is actually mentioned
  const ranks: number[] = [];
  let topPositionCount = 0;
  for (const result of results) {
    if (!result.response_text || !result.brand_mentioned) continue;

    const allBrands: string[] = result.all_brands_mentioned && result.all_brands_mentioned.length > 0
      ? result.all_brands_mentioned.filter((b): b is string => typeof b === 'string')
      : [...(runStatus.search_type === 'category' ? [] : [runStatus.brand]), ...(result.competitors_mentioned || [])].filter((b): b is string => typeof b === 'string');

    if (selectedBrand) {
      const brandLower = selectedBrand.toLowerCase();
      const rankingText = getTextForRanking(result.response_text, result.provider).toLowerCase();
      const brandPos = rankingText.indexOf(brandLower);
      if (brandPos >= 0) {
        let brandsBeforeCount = 0;
        for (const b of allBrands) {
          const bLower = b.toLowerCase();
          if (bLower === brandLower || bLower.includes(brandLower) || brandLower.includes(bLower)) continue;
          const bPos = rankingText.indexOf(bLower);
          if (bPos >= 0 && bPos < brandPos) brandsBeforeCount++;
        }
        const rank = brandsBeforeCount + 1;
        ranks.push(rank);
        if (rank === 1) topPositionCount++;
      } else {
        ranks.push(allBrands.length + 1);
      }
    }
  }
  const avgRank = ranks.length > 0 ? ranks.reduce((a, b) => a + b, 0) / ranks.length : null;

  // Share of voice - what percent of all brand mentions are for this brand
  let totalBrandMentions = 0;
  let selectedBrandMentions = 0;
  for (const result of results) {
    if (!result.response_text) continue;
    const responseText = result.response_text.toLowerCase();

    // Check if selected brand is mentioned
    if (selectedBrand && responseText.includes(selectedBrand.toLowerCase())) {
      selectedBrandMentions++;
      totalBrandMentions++;
    }

    // Count competitor mentions
    const competitors = result.all_brands_mentioned?.length ? result.all_brands_mentioned : result.competitors_mentioned || [];
    for (const competitor of competitors) {
      if (competitor && competitor.toLowerCase() !== selectedBrand?.toLowerCase()) {
        if (responseText.includes(competitor.toLowerCase())) {
          totalBrandMentions++;
        }
      }
    }
  }
  const shareOfVoice = totalBrandMentions > 0 ? (selectedBrandMentions / totalBrandMentions) * 100 : 0;

  // Unique sources count
  const uniqueSources = new Set<string>();
  for (const result of results) {
    if (result.sources) {
      for (const source of result.sources) {
        if (source.url) uniqueSources.add(getDomain(source.url));
      }
    }
  }

  // Calculate #1 rate (out of ALL responses, not just ones where brand is mentioned)
  const top1Rate = results.length > 0 ? (topPositionCount / results.length) * 100 : 0;

  // Average brands surfaced per query (for industry reports)
  let totalBrandsAcrossResults = 0;
  let resultsWithBrands = 0;
  for (const result of results) {
    const brandCount = result.all_brands_mentioned?.length || result.competitors_mentioned?.length || 0;
    if (brandCount > 0) {
      totalBrandsAcrossResults += brandCount;
      resultsWithBrands++;
    }
  }
  const avgBrandsPerQuery = resultsWithBrands > 0 ? totalBrandsAcrossResults / resultsWithBrands : 0;

  // Competitive Fragmentation Score (for industry reports)
  // Measures how evenly AI brand mentions are distributed.
  // Calibrated so typical AI category responses center around 5-6 on a 1-10 scale.
  let fragmentationScore = 5; // default mid-range
  const brandMentionCounts: Record<string, number> = {};
  for (const result of results) {
    const fragBrands = result.all_brands_mentioned?.length ? result.all_brands_mentioned.filter(b => b.toLowerCase() !== (runStatus?.brand || '').toLowerCase()) : result.competitors_mentioned || [];
    for (const comp of fragBrands) {
      brandMentionCounts[comp] = (brandMentionCounts[comp] || 0) + 1;
    }
  }
  const mentionBrands = Object.keys(brandMentionCounts);
  const N = mentionBrands.length;
  if (N >= 2) {
    const totalMentionCount = Object.values(brandMentionCounts).reduce((a, b) => a + b, 0);
    const shares = mentionBrands.map(b => brandMentionCounts[b] / totalMentionCount);

    // Gini coefficient: measures inequality (0 = perfectly equal, 1 = max inequality)
    let diffSum = 0;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        diffSum += Math.abs(shares[i] - shares[j]);
      }
    }
    const giniIndex = diffSum / (2 * N); // ranges 0 to ~(1 - 1/N)
    const maxGini = 1 - 1 / N;
    const normalizedGini = maxGini > 0 ? giniIndex / maxGini : 0; // 0 = equal, 1 = concentrated

    // Convert to spread score: 1 (concentrated) to 10 (spread out)
    // Use square root to expand the middle range and compress extremes
    const spread = 1 - normalizedGini; // 0 = concentrated, 1 = equal
    const calibrated = Math.pow(spread, 1.1); // exponent > 1 compresses upper end slightly

    fragmentationScore = Math.max(1, Math.min(10, Math.round(1 + 9 * calibrated)));
  } else if (N === 1) {
    fragmentationScore = 1;
  }

  // Issue-specific metrics
  const FRAMING_MAP: Record<string, string> = {
    strong_endorsement: 'Supportive',
    positive_endorsement: 'Leaning Supportive',
    neutral_mention: 'Balanced',
    conditional: 'Mixed',
    negative_comparison: 'Critical',
  };

  let dominantFraming = 'Balanced';
  let framingDistribution: Record<string, number> = {};
  let platformConsensus = 5;
  let relatedIssuesCount = 0;
  let topRelatedIssues: string[] = [];
  let framingByProvider: Record<string, Record<string, number>> = {};

  // Public figure metrics
  let portrayalScore = 0; // -100 to +100
  let sentimentSplit: Record<string, number> = { positive: 0, neutral: 0, negative: 0, strong: 0, positiveEndorsement: 0, neutralMention: 0, conditional: 0, negativeComparison: 0 };
  let figureProminence: Record<string, number> = { figureRate: 0, avgCompetitorRate: 0 };
  let platformAgreement = 5; // 1-10

  if (runStatus.search_type === 'issue') {
    // Build framing distribution from brand_sentiment
    const framingCounts: Record<string, number> = {};
    for (const result of results) {
      const raw = result.brand_sentiment;
      if (!raw || raw === 'not_mentioned') continue; // Skip unmentioned results
      const label = FRAMING_MAP[raw] || 'Balanced';
      framingCounts[label] = (framingCounts[label] || 0) + 1;
    }
    framingDistribution = framingCounts;

    // Dominant framing = most common label
    let maxCount = 0;
    for (const [label, count] of Object.entries(framingCounts)) {
      if (count > maxCount) {
        maxCount = count;
        dominantFraming = label;
      }
    }

    // Platform consensus: find each provider's dominant framing, check agreement
    const providerFramings: Record<string, Record<string, number>> = {};
    for (const result of results) {
      const provider = result.provider;
      if (!providerFramings[provider]) providerFramings[provider] = {};
      const raw = result.brand_sentiment || 'neutral_mention';
      const label = FRAMING_MAP[raw] || 'Balanced';
      providerFramings[provider][label] = (providerFramings[provider][label] || 0) + 1;
    }

    // framingByProvider for the stacked bar chart
    framingByProvider = providerFramings;

    // Find each provider's dominant framing
    const providerDominant: Record<string, string> = {};
    for (const [provider, counts] of Object.entries(providerFramings)) {
      let best = '';
      let bestCount = 0;
      for (const [label, count] of Object.entries(counts)) {
        if (count > bestCount) { bestCount = count; best = label; }
      }
      providerDominant[provider] = best;
    }

    // Count providers that agree on the same framing
    const providerCount = Object.keys(providerDominant).length;
    if (providerCount > 0) {
      const framingAgreement: Record<string, number> = {};
      for (const framing of Object.values(providerDominant)) {
        framingAgreement[framing] = (framingAgreement[framing] || 0) + 1;
      }
      const maxAgreement = Math.max(...Object.values(framingAgreement));
      platformConsensus = Math.max(1, Math.min(10, Math.round((maxAgreement / providerCount) * 10)));
    }

    // Related issues from competitors_mentioned, ranked by mention frequency
    const relatedIssueCounts: Record<string, number> = {};
    for (const result of results) {
      if (result.competitors_mentioned) {
        for (const comp of result.competitors_mentioned) {
          relatedIssueCounts[comp] = (relatedIssueCounts[comp] || 0) + 1;
        }
      }
    }
    relatedIssuesCount = Object.keys(relatedIssueCounts).length;
    topRelatedIssues = Object.entries(relatedIssueCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name);
  }

  if (runStatus.search_type === 'public_figure') {
    const SENTIMENT_SCORE: Record<string, number> = {
      strong_endorsement: 2,
      positive_endorsement: 1,
      neutral_mention: 0,
      conditional: -1,
      negative_comparison: -2,
    };

    // Portrayal score: average of sentiment scores scaled to -100..+100
    let sentimentSum = 0;
    let sentimentCount = 0;
    let posCount = 0;
    let neuCount = 0;
    let negCount = 0;
    const perCategory = { strong: 0, positiveEndorsement: 0, neutralMention: 0, conditional: 0, negativeComparison: 0 };

    for (const r of results) {
      const raw = r.brand_sentiment;
      if (!raw || raw === 'not_mentioned') continue;
      const score = SENTIMENT_SCORE[raw] ?? 0;
      sentimentSum += score;
      sentimentCount++;
      if (raw === 'strong_endorsement') { posCount++; perCategory.strong++; }
      else if (raw === 'positive_endorsement') { posCount++; perCategory.positiveEndorsement++; }
      else if (raw === 'neutral_mention') { neuCount++; perCategory.neutralMention++; }
      else if (raw === 'conditional') { neuCount++; perCategory.conditional++; }
      else if (raw === 'negative_comparison') { negCount++; perCategory.negativeComparison++; }
    }

    portrayalScore = sentimentCount > 0 ? Math.round((sentimentSum / sentimentCount) * 50) : 0; // scale +/-2 -> +/-100
    const totalSplit = posCount + neuCount + negCount;
    sentimentSplit = {
      positive: totalSplit > 0 ? Math.round((posCount / totalSplit) * 100) : 0,
      neutral: totalSplit > 0 ? Math.round((neuCount / totalSplit) * 100) : 0,
      negative: totalSplit > 0 ? Math.round((negCount / totalSplit) * 100) : 0,
      strong: totalSplit > 0 ? Math.round((perCategory.strong / totalSplit) * 100) : 0,
      positiveEndorsement: totalSplit > 0 ? Math.round((perCategory.positiveEndorsement / totalSplit) * 100) : 0,
      neutralMention: totalSplit > 0 ? Math.round((perCategory.neutralMention / totalSplit) * 100) : 0,
      conditional: totalSplit > 0 ? Math.round((perCategory.conditional / totalSplit) * 100) : 0,
      negativeComparison: totalSplit > 0 ? Math.round((perCategory.negativeComparison / totalSplit) * 100) : 0,
    };

    // Figure prominence: this figure's mention rate vs average competitor mention rate
    const figureRate = overallVisibility; // already computed above
    const competitorMentionRates: number[] = [];
    const competitorCounts: Record<string, number> = {};
    for (const r of results) {
      if (r.competitors_mentioned) {
        for (const comp of r.competitors_mentioned) {
          competitorCounts[comp] = (competitorCounts[comp] || 0) + 1;
        }
      }
    }
    for (const count of Object.values(competitorCounts)) {
      competitorMentionRates.push(results.length > 0 ? (count / results.length) * 100 : 0);
    }
    const avgCompRate = competitorMentionRates.length > 0
      ? competitorMentionRates.reduce((a, b) => a + b, 0) / competitorMentionRates.length
      : 0;
    figureProminence = { figureRate, avgCompetitorRate: avgCompRate };

    // Platform agreement: how consistently platforms portray sentiment
    const providerSentiments: Record<string, number[]> = {};
    for (const r of results) {
      const raw = r.brand_sentiment;
      if (!raw || raw === 'not_mentioned') continue;
      if (!providerSentiments[r.provider]) providerSentiments[r.provider] = [];
      providerSentiments[r.provider].push(SENTIMENT_SCORE[raw] ?? 0);
    }
    // Find each provider's average sentiment, then check how close they are
    const providerAvgs: number[] = [];
    for (const scores of Object.values(providerSentiments)) {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      providerAvgs.push(avg);
    }
    if (providerAvgs.length > 1) {
      // Standard deviation of provider averages — lower = more agreement
      const mean = providerAvgs.reduce((a, b) => a + b, 0) / providerAvgs.length;
      const variance = providerAvgs.reduce((sum, v) => sum + (v - mean) ** 2, 0) / providerAvgs.length;
      const stdDev = Math.sqrt(variance); // range ~0 (perfect agreement) to ~2 (max disagreement)
      platformAgreement = Math.max(1, Math.min(10, Math.round(10 - stdDev * 4.5)));
    } else {
      platformAgreement = 10; // only 1 provider = perfect agreement
    }
  }

  return {
    overallVisibility,
    shareOfVoice,
    topPositionCount,
    totalResponses: results.length,
    avgRank,
    uniqueSourcesCount: uniqueSources.size,
    totalCost: runStatus.actual_cost,
    selectedBrand,
    // Additional fields for KPI tooltips
    mentionedCount,
    selectedBrandMentions,
    totalBrandMentions,
    responsesWhereMentioned: mentionedCount,
    top1Rate,
    ranksCount: ranks.length,
    avgBrandsPerQuery,
    resultsWithBrands,
    fragmentationScore,
    fragmentationBrandCount: N,
    brandMentionCounts,
    // Issue-specific fields
    dominantFraming,
    framingDistribution,
    platformConsensus,
    relatedIssuesCount,
    topRelatedIssues,
    framingByProvider,
    // Public figure fields
    portrayalScore,
    sentimentSplit,
    figureProminence,
    platformAgreement,
  };
}

// ---------------------------------------------------------------------------
// llmBreakdownTakeaway  (page.tsx line 4320 / OverviewTab.tsx line 347)
// ---------------------------------------------------------------------------

export function computeLlmBreakdownTakeaway(
  llmBreakdownStats: Record<string, LlmBreakdownRow>,
  llmBreakdownBrandFilter: string,
  llmBreakdownBrands: string[],
  runStatus: RunStatusResponse | null,
): string | null {
  const entries = Object.entries(llmBreakdownStats);
  if (entries.length === 0) return null;

  const selectedBrand = llmBreakdownBrandFilter || llmBreakdownBrands[0] || runStatus?.brand || 'your brand';

  // Sort by mention rate to find best and worst
  const sorted = [...entries].sort((a, b) => b[1].rate - a[1].rate);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  // Check if all rates are similar (within 10%)
  const allSimilar = sorted.length > 1 && (best[1].rate - worst[1].rate) < 0.10;

  if (allSimilar) {
    const avgRate = entries.reduce((sum, [, stats]) => sum + stats.rate, 0) / entries.length;
    return `${selectedBrand} is mentioned consistently across all Models at around ${Math.round(avgRate * 100)}%.`;
  }

  if (sorted.length === 1) {
    return `${getProviderLabel(best[0])} mentions ${selectedBrand} ${Math.round(best[1].rate * 100)}% of the time.`;
  }

  // Find any Models with 0% mentions
  const zeroMentions = sorted.filter(([, stats]) => stats.rate === 0);
  if (zeroMentions.length > 0 && zeroMentions.length < sorted.length) {
    const zeroNames = zeroMentions.map(([p]) => getProviderLabel(p)).join(' and ');
    return `${getProviderLabel(best[0])} mentions ${selectedBrand} most often (${Math.round(best[1].rate * 100)}%), while ${zeroNames} ${zeroMentions.length === 1 ? 'does' : 'do'} not mention it at all.`;
  }

  // Standard comparison between best and worst
  const diff = Math.round((best[1].rate - worst[1].rate) * 100);
  if (diff >= 20) {
    return `${getProviderLabel(best[0])} mentions ${selectedBrand} most often (${Math.round(best[1].rate * 100)}%), ${diff} percentage points higher than ${getProviderLabel(worst[0])} (${Math.round(worst[1].rate * 100)}%).`;
  }

  return `${getProviderLabel(best[0])} leads with ${Math.round(best[1].rate * 100)}% mentions of ${selectedBrand}, compared to ${Math.round(worst[1].rate * 100)}% from ${getProviderLabel(worst[0])}.`;
}

// ---------------------------------------------------------------------------
// providerVisibilityScores  (page.tsx line 4471)
// ---------------------------------------------------------------------------

export function computeProviderVisibilityScores(
  runStatus: RunStatusResponse | null,
  globallyFilteredResults: Result[],
): ProviderVisibilityScore[] {
  if (!runStatus) return [];

  const results = globallyFilteredResults.filter((r: Result) => !r.error);
  const providerStats: Record<string, { mentioned: number; total: number }> = {};

  results.forEach(r => {
    if (!providerStats[r.provider]) {
      providerStats[r.provider] = { mentioned: 0, total: 0 };
    }
    providerStats[r.provider].total++;
    if (r.brand_mentioned) {
      providerStats[r.provider].mentioned++;
    }
  });

  return Object.entries(providerStats)
    .map(([provider, stats]) => ({
      provider,
      score: stats.total > 0 ? Math.round((stats.mentioned / stats.total) * 100) : 0,
    }))
    .sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// filteredFramingByProvider  (OverviewTab.tsx line 235)
// ---------------------------------------------------------------------------

const FRAMING_MAP: Record<string, string> = {
  strong_endorsement: 'Supportive',
  positive_endorsement: 'Leaning Supportive',
  neutral_mention: 'Balanced',
  conditional: 'Mixed',
  negative_comparison: 'Critical',
};

export function computeFilteredFramingByProvider(
  isIssue: boolean,
  globallyFilteredResults: Result[],
  framingPromptFilter: string,
  overviewMetricsFramingByProvider: Record<string, Record<string, number>> | undefined,
): Record<string, Record<string, number>> {
  if (!isIssue) return overviewMetricsFramingByProvider || {};
  const results = globallyFilteredResults.filter((r: Result) => !r.error);
  const filtered = framingPromptFilter === 'all' ? results : results.filter(r => r.prompt === framingPromptFilter);
  const providerFramings: Record<string, Record<string, number>> = {};
  for (const result of filtered) {
    const provider = result.provider;
    if (!providerFramings[provider]) providerFramings[provider] = {};
    const raw = result.brand_sentiment || 'neutral_mention';
    const label = FRAMING_MAP[raw] || 'Balanced';
    providerFramings[provider][label] = (providerFramings[provider][label] || 0) + 1;
  }
  return providerFramings;
}

// ---------------------------------------------------------------------------
// framingEvidenceGroups  (OverviewTab.tsx line 252)
// ---------------------------------------------------------------------------

export function computeFramingEvidenceGroups(
  isIssue: boolean,
  runStatus: RunStatusResponse | null,
  globallyFilteredResults: Result[],
): Record<string, FramingEvidenceItem[]> {
  if (!isIssue || !runStatus) return { Supportive: [], Balanced: [], Critical: [] };
  const results = globallyFilteredResults.filter((r: Result) => !r.error && r.response_text);
  const issueName = (runStatus.brand || '').toLowerCase();
  const groups: Record<string, FramingEvidenceItem[]> = { Supportive: [], Balanced: [], Critical: [] };

  // Strip markdown to plain text
  const stripMd = (text: string) => text
    .replace(/#{1,6}\s+/g, '')           // headings
    .replace(/\*\*([^*]+)\*\*/g, '$1')   // bold
    .replace(/\*([^*]+)\*/g, '$1')       // italic
    .replace(/__([^_]+)__/g, '$1')       // bold alt
    .replace(/_([^_]+)_/g, '$1')         // italic alt
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '') // images
    .replace(/`{1,3}[^`]*`{1,3}/g, '')  // code
    .replace(/\[\d+\]/g, '')            // citation markers
    .replace(/https?:\/\/\S+/g, '')     // URLs
    .replace(/\|/g, '')                 // table pipes
    .replace(/---+/g, '')              // horizontal rules
    .replace(/[•\u2022]/g, '')          // bullets
    .replace(/\s{2,}/g, ' ')           // collapse whitespace
    .trim();

  for (const result of results) {
    const raw = result.brand_sentiment || 'neutral_mention';
    const label = FRAMING_MAP[raw] || 'Balanced';
    const bucket = (label === 'Supportive' || label === 'Leaning Supportive') ? 'Supportive'
      : label === 'Balanced' ? 'Balanced'
      : 'Critical';

    // Clean the response text first, then split into sentences
    const cleanText = stripMd(result.response_text!);
    // Split on sentence boundaries (period/exclamation/question followed by space+capital or end)
    const sentences = cleanText.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);

    let bestSentence = '';
    let bestScore = -1;
    for (const s of sentences) {
      const trimmed = s.trim();
      if (trimmed.length < 30 || trimmed.length > 300) continue;
      if (/^\s*[-*>]/.test(trimmed)) continue;
      const mentionsIssue = issueName && trimmed.toLowerCase().includes(issueName);
      // Prefer sentences mentioning the issue, with moderate length (80-200 chars)
      const idealLength = trimmed.length >= 80 && trimmed.length <= 200 ? 1 : 0;
      const score = (mentionsIssue ? 3 : 0) + idealLength + (trimmed.length >= 40 ? 0.5 : 0);
      if (score > bestScore) {
        bestScore = score;
        bestSentence = trimmed;
      }
    }

    if (!bestSentence && sentences.length > 0) {
      bestSentence = sentences.find(s => s.trim().length >= 30 && s.trim().length <= 300)?.trim() || '';
    }

    // Cap at 250 chars with ellipsis
    if (bestSentence.length > 250) {
      bestSentence = bestSentence.slice(0, 247).replace(/\s+\S*$/, '') + '...';
    }

    if (bestSentence) {
      groups[bucket].push({
        provider: result.provider,
        prompt: result.prompt,
        excerpt: bestSentence,
        framing: label,
      });
    }
  }

  return groups;
}

// ---------------------------------------------------------------------------
// positionChartBrandOptions  (OverviewTab.tsx line 375)
// ---------------------------------------------------------------------------

export function computePositionChartBrandOptions(
  isCategory: boolean,
  globallyFilteredResults: Result[],
  excludedBrands: Set<string>,
  runStatus: RunStatusResponse | null,
): PositionChartOption[] {
  if (!isCategory) return [];
  const options: PositionChartOption[] = [
    { value: '__all__', label: 'All Brands (average position)' },
  ];
  const brands = new Set<string>();
  globallyFilteredResults.forEach((r: Result) => {
    if (!r.error) {
      const rBrands = r.all_brands_mentioned?.length ? r.all_brands_mentioned : r.competitors_mentioned || [];
      rBrands.forEach(comp => {
        if (!excludedBrands.has(comp) && !isCategoryName(comp, runStatus?.brand || '')) {
          brands.add(comp);
        }
      });
    }
  });
  Array.from(brands).sort().forEach(b => {
    options.push({ value: b, label: b });
  });
  return options;
}

// ---------------------------------------------------------------------------
// Helper: compute rank for a specific brand within a result (used by positionByPlatformData)
// ---------------------------------------------------------------------------

function computeBrandRank(result: Result, brand: string): number {
  if (!result.response_text) return 0;
  const isMentioned = result.all_brands_mentioned?.length ? result.all_brands_mentioned.includes(brand) : result.competitors_mentioned?.includes(brand);
  if (!isMentioned) return 0;
  const brandLower = brand.toLowerCase();
  const textLower = getTextForRanking(result.response_text, result.provider).toLowerCase();
  const brandTextPos = textLower.indexOf(brandLower);
  const allBrands: string[] = result.all_brands_mentioned && result.all_brands_mentioned.length > 0
    ? result.all_brands_mentioned.filter((b): b is string => typeof b === 'string')
    : [...(result.competitors_mentioned || [])].filter((b): b is string => typeof b === 'string');
  if (brandTextPos >= 0) {
    let brandsBeforeCount = 0;
    for (const b of allBrands) {
      const bLower = b.toLowerCase();
      if (bLower === brandLower || bLower.includes(brandLower) || brandLower.includes(bLower)) continue;
      const bPos = textLower.indexOf(bLower);
      if (bPos >= 0 && bPos < brandTextPos) brandsBeforeCount++;
    }
    return brandsBeforeCount + 1;
  }
  return allBrands.length + 1;
}

// ---------------------------------------------------------------------------
// positionByPlatformData  (OverviewTab.tsx line 421)
// ---------------------------------------------------------------------------

export function computePositionByPlatformData(
  scatterPlotData: ScatterPlotPoint[],
  isCategory: boolean,
  runStatus: RunStatusResponse | null,
  globallyFilteredResults: Result[],
  positionChartBrandFilter: string,
  positionChartPromptFilter: string,
  excludedBrands: Set<string>,
): Record<string, Record<string, PositionDot[]>> | [] {
  // For industry reports with brand filter, compute locally from results
  if (isCategory && runStatus) {
    const results = globallyFilteredResults.filter((r: Result) => !r.error);
    if (results.length === 0) return [];

    const grouped: Record<string, Record<string, PositionDot[]>> = {};
    const effectiveBrand = positionChartBrandFilter || '__all__';

    // Get all tracked brands for averaging
    const allTrackedBrands = new Set<string>();
    results.forEach(r => {
      const rBrands = r.all_brands_mentioned?.length ? r.all_brands_mentioned : r.competitors_mentioned || [];
      rBrands.forEach(c => { if (!isCategoryName(c, runStatus.brand) && !excludedBrands.has(c)) allTrackedBrands.add(c); });
    });
    const trackedBrandsList = Array.from(allTrackedBrands);

    results.forEach(result => {
      const provider = providerLabels[result.provider] || result.provider;
      if (!grouped[provider]) {
        grouped[provider] = {};
        POSITION_CATEGORIES.forEach(cat => { grouped[provider][cat] = []; });
      }

      let rank: number;
      if (effectiveBrand === '__all__') {
        // Average rank across all mentioned brands
        const brandRanks = trackedBrandsList
          .map(b => computeBrandRank(result, b))
          .filter(r => r > 0);
        rank = brandRanks.length > 0 ? Math.round(brandRanks.reduce((a, b) => a + b, 0) / brandRanks.length) : 0;
      } else {
        rank = computeBrandRank(result, effectiveBrand);
      }

      let category: string;
      if (rank === 0) { category = 'Not Mentioned'; }
      else if (rank === 1) { category = 'Top'; }
      else if (rank >= 2 && rank <= 3) { category = '2-3'; }
      else if (rank >= 4 && rank <= 5) { category = '4-5'; }
      else if (rank >= 6 && rank <= 10) { category = '6-10'; }
      else { category = '>10'; }

      // Determine sentiment for this dot
      let dotSentiment: string | null;
      if (rank === 0) {
        // Brand not mentioned in this response — always show as not_mentioned
        dotSentiment = 'not_mentioned';
      } else if (effectiveBrand !== '__all__' && result.competitor_sentiments?.[effectiveBrand]) {
        // Use brand-specific sentiment when filtering by a specific brand
        dotSentiment = result.competitor_sentiments[effectiveBrand];
      } else {
        dotSentiment = result.brand_sentiment || null;
      }

      grouped[provider][category].push({
        sentiment: dotSentiment,
        prompt: truncate(result.prompt, 30),
        rank,
        label: provider,
        originalResult: result,
      });
    });

    return grouped;
  }

  // Default behavior for non-industry reports
  if (!scatterPlotData.length) return [];
  const filtered = positionChartPromptFilter === '__all__'
    ? scatterPlotData
    : scatterPlotData.filter((dp) => dp.originalResult?.prompt === positionChartPromptFilter);
  const grouped: Record<string, Record<string, PositionDot[]>> = {};
  filtered.forEach((dp) => {
    const provider = dp.label;
    if (!grouped[provider]) {
      grouped[provider] = {};
      POSITION_CATEGORIES.forEach(cat => { grouped[provider][cat] = []; });
    }
    let category: string;
    if (!dp.isMentioned || dp.rank === 0) { category = 'Not Mentioned'; }
    else if (dp.rank === 1) { category = 'Top'; }
    else if (dp.rank >= 2 && dp.rank <= 3) { category = '2-3'; }
    else if (dp.rank >= 4 && dp.rank <= 5) { category = '4-5'; }
    else if (dp.rank >= 6 && dp.rank <= 10) { category = '6-10'; }
    else { category = '>10'; }
    grouped[provider][category].push({ sentiment: dp.sentiment, prompt: dp.prompt, rank: dp.rank, label: dp.label, originalResult: dp.originalResult });
  });
  return grouped;
}

// ---------------------------------------------------------------------------
// filteredResults (OverviewTab.tsx line 512) — computeOverviewFilteredResults
// ---------------------------------------------------------------------------

export function computeOverviewFilteredResults(
  runStatus: RunStatusResponse | null,
  globallyFilteredResults: Result[],
  providerFilter: string,
  tableBrandFilter: string,
): Result[] {
  if (!runStatus) return [];
  return globallyFilteredResults.filter((result: Result) => {
    const isAiOverviewError = result.provider === 'ai_overviews' && result.error;
    if (result.error && !isAiOverviewError) return false;
    if (providerFilter !== 'all' && result.provider !== providerFilter) return false;
    if (tableBrandFilter !== 'all' && !(result.all_brands_mentioned?.length ? result.all_brands_mentioned.includes(tableBrandFilter) : result.competitors_mentioned?.includes(tableBrandFilter))) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// sortedResults (OverviewTab.tsx line 570) — computeOverviewSortedResults
// ---------------------------------------------------------------------------

// Provider popularity order for sorting (ChatGPT first)
const PROVIDER_SORT_ORDER: Record<string, number> = {
  'openai': 1,
  'ai_overviews': 2,
  'gemini': 3,
  'perplexity': 4,
  'anthropic': 5,
  'grok': 6,
  'llama': 7,
};

export function computeOverviewSortedResults(
  filteredResults: Result[],
  tableSortColumn: 'default' | 'prompt' | 'llm' | 'position' | 'mentioned' | 'sentiment' | 'competitors',
  tableSortDirection: 'asc' | 'desc',
  runStatus: RunStatusResponse | null,
): Result[] {
  const sorted = [...filteredResults];

  // Local getResultPosition that takes runStatus as parameter
  const getResultPositionLocal = (result: Result): number | null => {
    if (!result.response_text || result.error || !runStatus) return null;
    const selectedBrand = runStatus.search_type === 'category'
      ? (runStatus.results.find((r: Result) => r.all_brands_mentioned?.length || r.competitors_mentioned?.length)?.all_brands_mentioned?.[0] || runStatus.results.find((r: Result) => r.competitors_mentioned?.length)?.competitors_mentioned?.[0] || '')
      : runStatus.brand;
    const brandLower = (selectedBrand || '').toLowerCase();
    const textLower = getTextForRanking(result.response_text, result.provider).toLowerCase();

    // Use all detected brands for ranking, fall back to tracked brands if unavailable
    const allBrands: string[] = result.all_brands_mentioned && result.all_brands_mentioned.length > 0
      ? result.all_brands_mentioned.filter((b): b is string => typeof b === 'string')
      : [runStatus.brand, ...(result.competitors_mentioned || [])].filter((b): b is string => typeof b === 'string');

    // Find the searched brand's position in the actual text
    const brandTextPos = textLower.indexOf(brandLower);
    if (brandTextPos >= 0) {
      // Count how many OTHER brands appear before the searched brand in the text
      let brandsBeforeCount = 0;
      for (const b of allBrands) {
        const bLower = b.toLowerCase();
        if (bLower === brandLower || bLower.includes(brandLower) || brandLower.includes(bLower)) continue;
        const bPos = textLower.indexOf(bLower);
        if (bPos >= 0 && bPos < brandTextPos) {
          brandsBeforeCount++;
        }
      }
      return brandsBeforeCount + 1;
    }

    // Brand not found in cleaned text but marked as mentioned — place after known brands
    if (result.brand_mentioned) return allBrands.length + 1;
    return null;
  };

  sorted.sort((a, b) => {
    let comparison = 0;

    switch (tableSortColumn) {
      case 'prompt':
        comparison = a.prompt.localeCompare(b.prompt);
        break;
      case 'llm':
        comparison = (PROVIDER_SORT_ORDER[a.provider] ?? 99) - (PROVIDER_SORT_ORDER[b.provider] ?? 99);
        break;
      case 'position': {
        const posA = getResultPositionLocal(a) ?? 999;
        const posB = getResultPositionLocal(b) ?? 999;
        comparison = posA - posB;
        break;
      }
      case 'mentioned': {
        const mentionedA = a.brand_mentioned ? 1 : 0;
        const mentionedB = b.brand_mentioned ? 1 : 0;
        comparison = mentionedB - mentionedA; // Yes first
        break;
      }
      case 'sentiment': {
        const sentA = sentimentOrder[a.brand_sentiment || 'not_mentioned'] || 6;
        const sentB = sentimentOrder[b.brand_sentiment || 'not_mentioned'] || 6;
        comparison = sentA - sentB;
        break;
      }
      case 'competitors': {
        const compA = a.competitors_mentioned?.length || 0;
        const compB = b.competitors_mentioned?.length || 0;
        comparison = compB - compA; // More competitors first
        break;
      }
      default: {
        // Default sort: rank -> sentiment -> provider popularity
        const posA = getResultPositionLocal(a) ?? 999;
        const posB = getResultPositionLocal(b) ?? 999;
        if (posA !== posB) return posA - posB;

        const sentA = sentimentOrder[a.brand_sentiment || 'not_mentioned'] || 6;
        const sentB = sentimentOrder[b.brand_sentiment || 'not_mentioned'] || 6;
        if (sentA !== sentB) return sentA - sentB;

        return (PROVIDER_SORT_ORDER[a.provider] ?? 99) - (PROVIDER_SORT_ORDER[b.provider] ?? 99);
      }
    }

    return tableSortDirection === 'asc' ? comparison : -comparison;
  });

  return sorted;
}
