'use client';

import React, { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  HelpCircle,
  Lightbulb,
  ChevronUp,
  ChevronDown,
  MessageSquare,
  ExternalLink,
  Download,
  Link2,
} from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { formatPercent, truncate } from '@/lib/utils';
import type { Result } from './shared';
import {
  getProviderLabel,
  getProviderBrandColor,
  getProviderIcon,
  getKPIInterpretation,
  getToneStyles,
  getArcColorByValue,
  getSentimentDotColor,
  removeActionableTakeaway,
  metricCardBackgrounds,
  PROVIDER_ORDER,
  POSITION_CATEGORIES,
  sentimentOrder,
} from './shared';
import { useResults, useResultsUI } from './ResultsContext';

export interface OverviewTabProps {
  aiSummaryExpanded: boolean;
  setAiSummaryExpanded: (val: boolean) => void;
  showSentimentColors: boolean;
  setShowSentimentColors: (val: boolean) => void;
  chartTab: 'allAnswers' | 'performanceRange' | 'shareOfVoice';
  setChartTab: (tab: 'allAnswers' | 'performanceRange' | 'shareOfVoice') => void;
  providerFilter: string;
  setProviderFilter: (val: string) => void;
  brandBlurbs: Record<string, string>;
  setCopied: (val: boolean) => void;
}

export const OverviewTab = ({
  aiSummaryExpanded,
  setAiSummaryExpanded,
  showSentimentColors,
  setShowSentimentColors,
  providerFilter,
  setProviderFilter,
  setCopied,
}: OverviewTabProps) => {
  // ---------------------------------------------------------------------------
  // Context
  // ---------------------------------------------------------------------------
  const {
    runStatus,
    overviewMetrics,
    aiSummary,
    isSummaryLoading,
    llmBreakdownStats,
    llmBreakdownBrands,
    promptBreakdownStats,
    scatterPlotData,
    brandQuotesMap,
    isCategory,
    availableProviders,
    globallyFilteredResults,
    llmBreakdownBrandFilter,
    setLlmBreakdownBrandFilter,
    promptBreakdownLlmFilter,
    setPromptBreakdownLlmFilter,
  } = useResults();

  const {
    copied,
    setSelectedResult,
  } = useResultsUI();

  // ---------------------------------------------------------------------------
  // Internalized state
  // ---------------------------------------------------------------------------
  const [expandedLLMCards, setExpandedLLMCards] = useState<Set<string>>(new Set());
  const [tableSortColumn, setTableSortColumn] = useState<'default' | 'prompt' | 'llm' | 'position' | 'mentioned' | 'sentiment' | 'competitors'>('default');
  const [tableSortDirection, setTableSortDirection] = useState<'asc' | 'desc'>('asc');

  // ---------------------------------------------------------------------------
  // Moved computations
  // ---------------------------------------------------------------------------

  const providerLabels: Record<string, string> = {
    openai: 'OpenAI', anthropic: 'Claude', gemini: 'Gemini',
    perplexity: 'Perplexity', ai_overviews: 'Google AI Overviews',
    grok: 'Grok', llama: 'Llama',
  };

  const handleTableSort = (column: typeof tableSortColumn) => {
    if (tableSortColumn === column) {
      setTableSortDirection(tableSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setTableSortColumn(column);
      setTableSortDirection('asc');
    }
  };

  const brandQuotes = brandQuotesMap[runStatus?.brand ?? ''] ?? [];

  const llmBreakdownTakeaway = useMemo(() => {
    const entries = Object.entries(llmBreakdownStats);
    if (entries.length === 0) return null;
    const selectedBrand = llmBreakdownBrandFilter || llmBreakdownBrands[0] || runStatus?.brand || 'your brand';
    const sorted = [...entries].sort((a, b) => b[1].rate - a[1].rate);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    const allSimilar = sorted.length > 1 && (best[1].rate - worst[1].rate) < 0.10;
    if (allSimilar) {
      const avgRate = entries.reduce((sum, [, stats]) => sum + stats.rate, 0) / entries.length;
      return `${selectedBrand} is mentioned consistently across all Models at around ${Math.round(avgRate * 100)}%.`;
    }
    if (sorted.length === 1) {
      return `${getProviderLabel(best[0])} mentions ${selectedBrand} ${Math.round(best[1].rate * 100)}% of the time.`;
    }
    const zeroMentions = sorted.filter(([, stats]) => stats.rate === 0);
    if (zeroMentions.length > 0 && zeroMentions.length < sorted.length) {
      const zeroNames = zeroMentions.map(([p]) => getProviderLabel(p)).join(' and ');
      return `${getProviderLabel(best[0])} mentions ${selectedBrand} most often (${Math.round(best[1].rate * 100)}%), while ${zeroNames} ${zeroMentions.length === 1 ? 'does' : 'do'} not mention it at all.`;
    }
    const diff = Math.round((best[1].rate - worst[1].rate) * 100);
    if (diff >= 20) {
      return `${getProviderLabel(best[0])} mentions ${selectedBrand} most often (${Math.round(best[1].rate * 100)}%), ${diff} percentage points higher than ${getProviderLabel(worst[0])} (${Math.round(worst[1].rate * 100)}%).`;
    }
    return `${getProviderLabel(best[0])} leads with ${Math.round(best[1].rate * 100)}% mentions of ${selectedBrand}, compared to ${Math.round(worst[1].rate * 100)}% from ${getProviderLabel(worst[0])}.`;
  }, [llmBreakdownStats, llmBreakdownBrandFilter, llmBreakdownBrands, runStatus]);

  const positionByPlatformData = useMemo(() => {
    if (!scatterPlotData.length) return [];
    const grouped: Record<string, Record<string, { sentiment: string | null; prompt: string; rank: number; label: string; originalResult: Result }[]>> = {};
    scatterPlotData.forEach((dp) => {
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
  }, [scatterPlotData]);

  const filteredResults = useMemo(() => {
    if (!runStatus) return [];
    return globallyFilteredResults.filter((result: Result) => {
      const isAiOverviewError = result.provider === 'ai_overviews' && result.error;
      if (result.error && !isAiOverviewError) return false;
      if (providerFilter !== 'all' && result.provider !== providerFilter) return false;
      return true;
    });
  }, [globallyFilteredResults, providerFilter, runStatus]);

  // Helper to calculate position for a result based on first appearance in response text
  const getResultPosition = (result: Result): number | null => {
    if (!result.response_text || result.error || !runStatus) return null;
    const selectedBrand = runStatus.search_type === 'category'
      ? (runStatus.results.find((r: Result) => r.competitors_mentioned?.length)?.competitors_mentioned?.[0] || '')
      : runStatus.brand;
    const brandLower = (selectedBrand || '').toLowerCase();
    const textLower = result.response_text.toLowerCase();

    // Find the searched brand's position in the actual text
    const brandTextPos = textLower.indexOf(brandLower);
    if (brandTextPos === -1) return null;

    // Use all detected brands for ranking, fall back to tracked brands if unavailable
    const allBrands: string[] = result.all_brands_mentioned && result.all_brands_mentioned.length > 0
      ? result.all_brands_mentioned.filter((b): b is string => typeof b === 'string')
      : [runStatus.brand, ...(result.competitors_mentioned || [])].filter((b): b is string => typeof b === 'string');

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
  };

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

  // Sort filtered results — default: rank, then sentiment, then provider popularity
  const sortedResults = useMemo(() => {
    const sorted = [...filteredResults];

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
          const posA = getResultPosition(a) ?? 999;
          const posB = getResultPosition(b) ?? 999;
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
          // Default sort: rank → sentiment → provider popularity
          const posA = getResultPosition(a) ?? 999;
          const posB = getResultPosition(b) ?? 999;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredResults, tableSortColumn, tableSortDirection, runStatus]);

  return (
    <div className="space-y-6">
      {/* Metrics Cards */}
      <div id="overview-metrics" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* AI Visibility Card */}
        {(() => {
          const visibilityTone = getKPIInterpretation('visibility', overviewMetrics?.overallVisibility ?? null).tone;
          return (
            <div className={`rounded-2xl shadow-sm border p-5 flex flex-col h-[270px] ${metricCardBackgrounds.visibility}`}>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold text-gray-800 tracking-wide uppercase">AI Visibility</p>
                <div className="relative group">
                  <button
                    className="p-1 rounded-full hover:bg-gray-100 transition-colors"
                    aria-label="Learn more about AI Visibility"
                    tabIndex={0}
                  >
                    <HelpCircle className="w-4 h-4 text-gray-400" />
                  </button>
                  <div className="absolute right-0 top-full mt-1 w-64 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all z-50 shadow-lg">
                    Mentioned in {overviewMetrics?.mentionedCount || 0} of {overviewMetrics?.totalResponses || 0} AI answers (across selected models/prompts).
                  </div>
                </div>
              </div>
              {/* Circular Progress Ring */}
              <div className="h-[100px] flex items-start">
                <div className="relative w-[80px] h-[80px]">
                  <svg className="w-[80px] h-[80px] transform -rotate-90" viewBox="0 0 80 80">
                    <circle
                      cx="40"
                      cy="40"
                      r="32"
                      stroke="hsl(var(--muted))"
                      strokeWidth="7"
                      fill="none"
                    />
                    <circle
                      cx="40"
                      cy="40"
                      r="32"
                      stroke={getArcColorByValue(overviewMetrics?.overallVisibility || 0)}
                      strokeWidth="7"
                      fill="none"
                      strokeLinecap="round"
                      strokeDasharray={`${(overviewMetrics?.overallVisibility || 0) * 2.01} 201`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-sm font-bold text-gray-900 tracking-tight tabular-nums">{overviewMetrics?.overallVisibility?.toFixed(1) || 0}%</span>
                  </div>
                </div>
              </div>
              {/* Badge - fixed height container */}
              <div className="h-[28px] flex items-start mt-3">
                <span className={`inline-block w-fit px-3 py-1 text-xs font-medium rounded-full cursor-help ${getToneStyles(visibilityTone)}`} title={getKPIInterpretation('visibility', overviewMetrics?.overallVisibility ?? null).tooltip}>
                  {getKPIInterpretation('visibility', overviewMetrics?.overallVisibility ?? null).label}
                </span>
              </div>
              {/* Description - pushed to bottom */}
              <p className="text-xs text-gray-500 leading-relaxed mt-auto">% of relevant AI responses that mention {runStatus?.brand || 'your brand'}</p>
            </div>
          );
        })()}

        {/* Share of Voice Card */}
        {(() => {
          const sovTone = getKPIInterpretation('shareOfVoice', overviewMetrics?.shareOfVoice ?? null).tone;
          return (
            <div className={`rounded-2xl shadow-sm border p-5 flex flex-col h-[270px] ${metricCardBackgrounds.shareOfVoice}`}>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold text-gray-800 tracking-wide uppercase">Share of Voice</p>
                <div className="relative group">
                  <button
                    className="p-1 rounded-full hover:bg-gray-100 transition-colors"
                    aria-label="Learn more about Share of Voice"
                    tabIndex={0}
                  >
                    <HelpCircle className="w-4 h-4 text-gray-400" />
                  </button>
                  <div className="absolute right-0 top-full mt-1 w-64 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all z-50 shadow-lg">
                    {overviewMetrics?.selectedBrand || 'Your brand'} accounts for {overviewMetrics?.shareOfVoice?.toFixed(1) || 0}% of all brand mentions ({overviewMetrics?.selectedBrandMentions || 0} of {overviewMetrics?.totalBrandMentions || 0} mentions).
                  </div>
                </div>
              </div>
              {/* Circular Progress Ring */}
              <div className="h-[100px] flex items-start">
                <div className="relative w-[80px] h-[80px]">
                  <svg className="w-[80px] h-[80px] transform -rotate-90" viewBox="0 0 80 80">
                    <circle
                      cx="40"
                      cy="40"
                      r="32"
                      stroke="hsl(var(--muted))"
                      strokeWidth="7"
                      fill="none"
                    />
                    <circle
                      cx="40"
                      cy="40"
                      r="32"
                      stroke={getArcColorByValue(overviewMetrics?.shareOfVoice || 0)}
                      strokeWidth="7"
                      fill="none"
                      strokeLinecap="round"
                      strokeDasharray={`${(overviewMetrics?.shareOfVoice || 0) * 2.01} 201`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-sm font-bold text-gray-900 tracking-tight tabular-nums">{overviewMetrics?.shareOfVoice?.toFixed(1) || 0}%</span>
                  </div>
                </div>
              </div>
              {/* Badge - fixed height container */}
              <div className="h-[28px] flex items-start mt-3">
                <span className={`inline-block w-fit px-3 py-1 text-xs font-medium rounded-full cursor-help ${getToneStyles(sovTone)}`} title={getKPIInterpretation('shareOfVoice', overviewMetrics?.shareOfVoice ?? null).tooltip}>
                  {getKPIInterpretation('shareOfVoice', overviewMetrics?.shareOfVoice ?? null).label}
                </span>
              </div>
              {/* Description - pushed to bottom */}
              <p className="text-xs text-gray-500 leading-relaxed mt-auto">{runStatus?.brand || 'Your brand'}'s share of all brand mentions</p>
            </div>
          );
        })()}

        {/* Top Result Rate Card */}
        {(() => {
          const topRateTone = getKPIInterpretation('top1Rate', overviewMetrics?.top1Rate ?? null).tone;
          return (
            <div className={`rounded-2xl shadow-sm border p-5 flex flex-col h-[270px] ${metricCardBackgrounds.top1Rate}`}>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold text-gray-800 tracking-wide uppercase">Top Result Rate</p>
                <div className="relative group">
                  <button
                    className="p-1 rounded-full hover:bg-gray-100 transition-colors"
                    aria-label="Learn more about Top Result Rate"
                    tabIndex={0}
                  >
                    <HelpCircle className="w-4 h-4 text-gray-400" />
                  </button>
                  <div className="absolute right-0 top-full mt-1 w-64 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all z-50 shadow-lg">
                    Ranked #1 in {overviewMetrics?.topPositionCount || 0} of {overviewMetrics?.responsesWhereMentioned || 0} AI answers where {overviewMetrics?.selectedBrand || 'your brand'} appears.
                  </div>
                </div>
              </div>
              {/* Circular Progress Ring */}
              <div className="h-[100px] flex items-start">
                <div className="relative w-[80px] h-[80px]">
                  <svg className="w-[80px] h-[80px] transform -rotate-90" viewBox="0 0 80 80">
                    <circle
                      cx="40"
                      cy="40"
                      r="32"
                      stroke="hsl(var(--muted))"
                      strokeWidth="7"
                      fill="none"
                    />
                    <circle
                      cx="40"
                      cy="40"
                      r="32"
                      stroke={getArcColorByValue(overviewMetrics?.top1Rate || 0)}
                      strokeWidth="7"
                      fill="none"
                      strokeLinecap="round"
                      strokeDasharray={`${(overviewMetrics?.top1Rate || 0) * 2.01} 201`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-sm font-bold text-gray-900 tracking-tight tabular-nums">{overviewMetrics?.top1Rate?.toFixed(0) || 0}%</span>
                  </div>
                </div>
              </div>
              {/* Badge - fixed height container */}
              <div className="h-[28px] flex items-start mt-3">
                <span className={`inline-block w-fit px-3 py-1 text-xs font-medium rounded-full cursor-help ${getToneStyles(topRateTone)}`} title={getKPIInterpretation('top1Rate', overviewMetrics?.top1Rate ?? null).tooltip}>
                  {getKPIInterpretation('top1Rate', overviewMetrics?.top1Rate ?? null).label}
                </span>
              </div>
              {/* Description - pushed to bottom */}
              <p className="text-xs text-gray-500 leading-relaxed mt-auto">How often {runStatus?.brand || 'your brand'} is the #1 result</p>
            </div>
          );
        })()}

        {/* Avg. Position Card */}
        {(() => {
          const avgPosTone = getKPIInterpretation('avgPosition', overviewMetrics?.avgRank ?? null).tone;
          const avgRank = overviewMetrics?.avgRank || 0;
          return (
            <div className={`rounded-2xl shadow-sm border p-5 flex flex-col h-[270px] ${metricCardBackgrounds.avgPosition}`}>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold text-gray-800 tracking-wide uppercase">Avg. Position</p>
                <div className="relative group">
                  <button
                    className="p-1 rounded-full hover:bg-gray-100 transition-colors"
                    aria-label="Learn more about Average Position"
                    tabIndex={0}
                  >
                    <HelpCircle className="w-4 h-4 text-gray-400" />
                  </button>
                  <div className="absolute right-0 top-full mt-1 w-64 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all z-50 shadow-lg">
                    Average rank when {overviewMetrics?.selectedBrand || 'your brand'} is shown: {overviewMetrics?.avgRank?.toFixed(1) || 'n/a'} (lower is better). Based on {overviewMetrics?.ranksCount || 0} responses.
                  </div>
                </div>
              </div>
              {/* Position Visual Container - matches donut chart container */}
              <div className="h-[100px] flex items-start">
                <div className="w-full">
                  {/* Large Position Number */}
                  <div className="text-center mb-2">
                    <span className="text-3xl font-bold tracking-tight tabular-nums" style={{ color: avgRank <= 1.5 ? '#111827' : avgRank <= 3 ? '#eab308' : '#f97316' }}>
                      {overviewMetrics?.avgRank?.toFixed(1) || 'n/a'}
                    </span>
                  </div>
                  {/* Position Scale */}
                  <div className="px-4">
                    <div className="flex justify-between mb-1">
                      <span className="text-[10px] text-gray-400">Best</span>
                      <span className="text-[10px] text-gray-400">Worst</span>
                    </div>
                    <div className="flex justify-center gap-1.5">
                      {[1, 2, 3, 4, 5].map((pos) => {
                        const isHighlighted = avgRank > 0 && Math.round(avgRank) === pos;
                        // Color based on position value
                        const getPositionColor = () => {
                          if (!isHighlighted) return 'bg-gray-100 text-gray-400';
                          if (pos <= 1) return 'bg-gray-900 text-white';
                          if (pos <= 2) return 'bg-gray-700 text-white';
                          if (pos <= 3) return 'bg-yellow-500 text-white';
                          if (pos <= 4) return 'bg-orange-500 text-white';
                          return 'bg-orange-600 text-white';
                        };
                        return (
                          <div
                            key={pos}
                            className={`w-7 h-7 rounded flex items-center justify-center text-xs font-semibold ${getPositionColor()}`}
                          >
                            {pos}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
              {/* Badge - fixed height container */}
              <div className="h-[28px] flex items-start mt-3">
                <span className={`inline-block w-fit px-3 py-1 text-xs font-medium rounded-full cursor-help ${getToneStyles(avgPosTone)}`} title={getKPIInterpretation('avgPosition', overviewMetrics?.avgRank ?? null).tooltip}>
                  {getKPIInterpretation('avgPosition', overviewMetrics?.avgRank ?? null).label}
                </span>
              </div>
              {/* Description - pushed to bottom */}
              <p className="text-xs text-gray-500 leading-relaxed mt-auto">{runStatus?.brand || 'Your brand'}'s average ranking when mentioned</p>
            </div>
          );
        })()}
      </div>

      {/* AI Summary */}
      <div id="overview-ai-analysis" className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl shadow-sm border border-blue-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">AI Analysis</h2>
          </div>
          {aiSummary?.summary && (
            <button
              onClick={() => setAiSummaryExpanded(!aiSummaryExpanded)}
              className="inline-flex items-center gap-1 text-sm text-gray-900 hover:text-gray-700 font-medium"
            >
              {aiSummaryExpanded ? (
                <>Show less <ChevronUp className="w-4 h-4" /></>
              ) : (
                <>Show more <ChevronDown className="w-4 h-4" /></>
              )}
            </button>
          )}
        </div>
        {isSummaryLoading ? (
          <div className="flex items-center gap-3 py-4">
            <Spinner size="sm" />
            <span className="text-sm text-gray-500">Generating AI summary...</span>
          </div>
        ) : aiSummary?.summary ? (
          <div className={`text-sm text-gray-700 leading-relaxed space-y-3 [&_strong]:font-semibold [&_strong]:text-gray-900 [&_p]:my-0 overflow-hidden transition-all ${aiSummaryExpanded ? '' : 'max-h-24'}`}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{removeActionableTakeaway(aiSummary.summary).replace(/\bai_overviews\b/gi, 'Google AI Overviews')}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-sm text-gray-500 italic">
            AI summary will be available once the analysis is complete.
          </p>
        )}
        {aiSummary?.summary && !aiSummaryExpanded && (
          <div className="mt-2 pt-2 border-t border-gray-100">
            <button
              onClick={() => setAiSummaryExpanded(true)}
              className="text-sm text-gray-900 hover:text-gray-700 font-medium"
            >
              Read full analysis →
            </button>
          </div>
        )}
      </div>

      {/* What AI Says About [Brand] */}
      {brandQuotes.length > 0 && (
        <div id="overview-brand-quotes" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="w-5 h-5 text-gray-700" />
            <h2 className="text-lg font-semibold text-gray-900">
              What AI Says About {runStatus?.brand}
            </h2>
          </div>
          <div className="space-y-2.5">
            {brandQuotes.slice(0, 2).map((quote, idx) => {
              const shortPrompt = quote.prompt.length > 35 ? quote.prompt.substring(0, 33) + '...' : quote.prompt;
              return (
                <div key={idx}>
                  <p className="text-sm text-gray-700 leading-relaxed italic">&ldquo;{quote.text}&rdquo;</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    — {getProviderLabel(quote.provider)} · {shortPrompt}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Prompt Breakdown Table */}
      {promptBreakdownStats.length > 0 && (
        <div id="overview-by-question" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Results by Question</h2>
              <p className="text-sm text-gray-500 mt-1">How {runStatus?.brand} performs across each question asked to AI</p>
            </div>
            <select
              value={promptBreakdownLlmFilter}
              onChange={(e) => setPromptBreakdownLlmFilter(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            >
              <option value="all">All Models</option>
              {availableProviders.map((provider) => (
                <option key={provider} value={provider}>{getProviderLabel(provider)}</option>
              ))}
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-3 text-sm font-medium text-gray-600">Question</th>
                  <th className="text-center py-3 px-3 text-sm font-medium text-gray-600">
                    <div className="flex items-center justify-center gap-1">
                      <span className="whitespace-nowrap">AI Visibility</span>
                      <div className="relative group">
                        <HelpCircle className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-48 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 shadow-lg text-left font-normal">
                          % of AI responses that mention {runStatus?.brand || 'your brand'} for this question
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-gray-400 font-normal">% mentioned</div>
                  </th>
                  <th className="text-center py-3 px-3 text-sm font-medium text-gray-600">
                    <div className="flex items-center justify-center gap-1">
                      <span className="whitespace-nowrap">Share of Voice</span>
                      <div className="relative group">
                        <HelpCircle className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-48 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 shadow-lg text-left font-normal">
                          {runStatus?.brand || 'Your brand'}'s share of all brand mentions for this question
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-gray-400 font-normal">% of brand mentions</div>
                  </th>
                  <th className="text-center py-3 px-3 text-sm font-medium text-gray-600">
                    <div className="flex items-center justify-center gap-1">
                      <span className="whitespace-nowrap">First Position</span>
                      <div className="relative group">
                        <HelpCircle className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-48 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 shadow-lg text-left font-normal">
                          How often {runStatus?.brand || 'your brand'} is the #1 recommended result for this question
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-gray-400 font-normal">% ranked #1</div>
                  </th>
                  <th className="text-center py-3 px-3 text-sm font-medium text-gray-600">
                    <div className="flex items-center justify-center gap-1">
                      <span className="whitespace-nowrap">Avg. Position</span>
                      <div className="relative group">
                        <HelpCircle className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-48 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 shadow-lg text-left font-normal">
                          Average ranking position when {runStatus?.brand || 'your brand'} appears (lower is better)
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-gray-400 font-normal">position when shown</div>
                  </th>
                  <th className="text-center py-3 px-3 text-sm font-medium text-gray-600">
                    <div className="flex items-center justify-center gap-1">
                      <span className="whitespace-nowrap">Avg. Sentiment</span>
                      <div className="relative group">
                        <HelpCircle className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-48 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 shadow-lg text-left font-normal">
                          How positively AI describes {runStatus?.brand || 'your brand'} when mentioned (from "Negative" to "Strong")
                        </div>
                      </div>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {promptBreakdownStats.map((stat, index) => {
                  const getSentimentLabel = (score: number | null): string => {
                    if (score === null) return '-';
                    if (score >= 4.5) return 'Strong';
                    if (score >= 3.5) return 'Positive';
                    if (score >= 2.5) return 'Neutral';
                    if (score >= 1.5) return 'Conditional';
                    if (score >= 0.5) return 'Negative';
                    return '-';
                  };

                  const getSentimentColor = (score: number | null): string => {
                    if (score === null) return 'text-gray-400';
                    if (score >= 4.5) return 'text-gray-900';
                    if (score >= 3.5) return 'text-gray-700';
                    if (score >= 2.5) return 'text-gray-600';
                    if (score >= 1.5) return 'text-amber-500';
                    if (score >= 0.5) return 'text-red-500';
                    return 'text-gray-400';
                  };

                  return (
                    <tr key={stat.prompt} className={index % 2 === 0 ? 'bg-gray-50' : ''}>
                      <td className="py-3 px-3 max-w-[300px]">
                        <span className="text-gray-900 line-clamp-2" title={stat.prompt}>
                          {stat.prompt}
                        </span>
                      </td>
                      <td className="text-center py-3 px-3">
                        <span className={`font-medium ${stat.visibilityScore >= 50 ? 'text-gray-900' : stat.visibilityScore >= 25 ? 'text-yellow-600' : 'text-gray-600'}`}>
                          {stat.visibilityScore.toFixed(0)}%
                        </span>
                      </td>
                      <td className="text-center py-3 px-3">
                        <span className={`font-medium ${stat.shareOfVoice >= 50 ? 'text-gray-900' : stat.shareOfVoice >= 25 ? 'text-yellow-600' : 'text-gray-600'}`}>
                          {stat.shareOfVoice.toFixed(0)}%
                        </span>
                      </td>
                      <td className="text-center py-3 px-3">
                        <span className={`font-medium ${stat.firstPositionRate >= 50 ? 'text-gray-900' : stat.firstPositionRate >= 25 ? 'text-yellow-600' : 'text-gray-600'}`}>
                          {stat.firstPositionRate.toFixed(0)}%
                        </span>
                      </td>
                      <td className="text-center py-3 px-3">
                        {stat.avgRank !== null ? (
                          <span className={`font-medium ${stat.avgRank <= 1.5 ? 'text-gray-900' : stat.avgRank <= 3 ? 'text-yellow-600' : 'text-gray-600'}`}>
                            #{stat.avgRank.toFixed(1)}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="text-center py-3 px-3">
                        <span className={`font-medium ${getSentimentColor(stat.avgSentimentScore)}`}>
                          {getSentimentLabel(stat.avgSentimentScore)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* AI Brand Position by Platform */}
      {Object.keys(positionByPlatformData).length > 0 && (
        <div id="overview-by-platform-chart" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-gray-900">AI Brand Position by Platform</h2>
                <div className="relative group">
                  <button
                    className="p-1 rounded-full hover:bg-gray-100 transition-colors"
                    aria-label="Learn more about AI Brand Position"
                    tabIndex={0}
                  >
                    <HelpCircle className="w-4 h-4 text-gray-400" />
                  </button>
                  <div className="absolute left-0 top-full mt-1 w-64 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all z-50 shadow-lg">
                    Shows where your brand appears in AI responses across different platforms{showSentimentColors ? ', colored by sentiment' : ''}.
                  </div>
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-1">How often {runStatus?.brand} ranks in each position across AI platforms</p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-xs text-gray-500">Show sentiment</span>
              <button
                onClick={() => setShowSentimentColors(!showSentimentColors)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  showSentimentColors ? 'bg-gray-900' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    showSentimentColors ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>
          </div>

          {/* Legend - show platform colors or sentiment colors */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-6 pb-4 border-b border-gray-100">
            {showSentimentColors ? (
              <>
                <span className="text-xs text-gray-600 font-medium mr-1">Sentiment:</span>
                {[
                  { color: '#047857', label: 'Strong' },
                  { color: '#10b981', label: 'Positive' },
                  { color: '#9ca3af', label: 'Neutral' },
                  { color: '#fbbf24', label: 'Conditional' },
                  { color: '#ef4444', label: 'Negative' },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-xs text-gray-600">{item.label}</span>
                  </div>
                ))}
              </>
            ) : (
              <span className="text-xs text-gray-500">Each dot represents one AI response. Toggle sentiment to color by recommendation.</span>
            )}
          </div>

          {/* Dot Plot Grid */}
          <div className="space-y-0">
            {(() => {
              const PROVIDER_POPULARITY_ORDER = [
                'OpenAI',
                'Google AI Overviews',
                'Gemini',
                'Perplexity',
                'Claude',
                'Grok',
                'Llama',
              ];
              return Object.entries(positionByPlatformData)
                .sort(([a], [b]) => {
                  const aIdx = PROVIDER_POPULARITY_ORDER.indexOf(a);
                  const bIdx = PROVIDER_POPULARITY_ORDER.indexOf(b);
                  // Providers not in the list go to the end, preserving their original order
                  return (aIdx === -1 ? Infinity : aIdx) - (bIdx === -1 ? Infinity : bIdx);
                })
                .map(([provider, categories], rowIdx) => {
              const allDots = Object.values(categories).flat() as any[];
              const providerId = allDots.length > 0 ? allDots[0].originalResult?.provider : '';
              return (
              <div key={provider} className={`flex items-center py-3 ${rowIdx > 0 ? 'border-t border-gray-50' : ''}`}>
                <div className="w-28 flex-shrink-0">
                  <div className="flex items-center gap-1.5">
                    {getProviderIcon(providerId)}
                    <span className="text-sm font-medium text-gray-900">{provider}</span>
                  </div>
                </div>
                <div className="flex-1 grid grid-cols-6 gap-2">
                  {POSITION_CATEGORIES.map((category) => {
                    const dots = (categories as any)[category] || [];
                    return (
                      <div key={category} className="flex items-center justify-center min-h-[24px] gap-0.5 flex-wrap">
                        {dots.map((dot: any, idx: number) => (
                          <div key={idx} className="relative group">
                            <div
                              className="w-3 h-3 rounded-full cursor-pointer hover:scale-125 transition-transform"
                              style={{ backgroundColor: showSentimentColors ? getSentimentDotColor(dot.sentiment) : '#9ca3af' }}
                              onClick={() => setSelectedResult(dot.originalResult)}
                            />
                            {/* Tooltip on hover */}
                            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block z-50 pointer-events-none">
                              <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg min-w-[250px] max-w-[300px] text-left">
                                <p className="text-sm font-semibold text-gray-900 mb-1">
                                  {dot.prompt.length > 60 ? dot.prompt.substring(0, 60) + '...' : dot.prompt}
                                </p>
                                <p className="text-sm text-gray-700">
                                  {dot.rank === 0 ? 'Not shown' : dot.rank === 1 ? 'Shown as: #1 (Top result)' : `Shown as: #${dot.rank}`}
                                </p>
                                {showSentimentColors && dot.sentiment && dot.sentiment !== 'not_mentioned' && (
                                  <p className={`text-xs mt-1 ${
                                    dot.sentiment === 'strong_endorsement' ? 'text-emerald-700' :
                                    dot.sentiment === 'positive_endorsement' ? 'text-emerald-600' :
                                    dot.sentiment === 'neutral_mention' ? 'text-gray-600' :
                                    dot.sentiment === 'conditional' ? 'text-amber-500' :
                                    dot.sentiment === 'negative_comparison' ? 'text-red-500' : ''
                                  }`}>
                                    {dot.sentiment === 'strong_endorsement' ? 'Strong' :
                                     dot.sentiment === 'positive_endorsement' ? 'Positive' :
                                     dot.sentiment === 'neutral_mention' ? 'Neutral' :
                                     dot.sentiment === 'conditional' ? 'Conditional' :
                                     dot.sentiment === 'negative_comparison' ? 'Negative' : ''}
                                  </p>
                                )}
                                <p className="text-xs text-gray-400 mt-2">{dot.label}</p>
                                <p className="text-[10px] text-gray-400 mt-1 italic">Click to view full response</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
            });
            })()}
          </div>

          {/* X-axis labels */}
          <div className="flex items-center mt-4 pt-2 border-t border-gray-100">
            <div className="w-28 flex-shrink-0" />
            <div className="flex-1 grid grid-cols-6 gap-2">
              {POSITION_CATEGORIES.map((category) => (
                <div key={category} className="text-center">
                  <span className="text-xs text-gray-500">{category}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="text-center mt-2">
            <span className="text-xs text-gray-400">Order of appearance in AI Response</span>
          </div>
        </div>
      )}

      {/* Results by AI Platform */}
      {Object.keys(llmBreakdownStats).length > 0 && llmBreakdownBrands.length > 0 && (
        <div id="overview-by-platform" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Results by AI Platform</h2>
            <select
              value={llmBreakdownBrandFilter || llmBreakdownBrands[0] || ''}
              onChange={(e) => setLlmBreakdownBrandFilter(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            >
              {llmBreakdownBrands.map((brand, index) => (
                <option key={brand} value={brand}>
                  {brand}{index === 0 && !isCategory && runStatus?.brand === brand ? ' (searched)' : ''}
                </option>
              ))}
            </select>
          </div>
          {llmBreakdownTakeaway && (
            <div className="inline-block text-sm text-gray-600 mb-6 bg-[#FAFAF8] rounded-lg px-3 py-2">
              <span className="font-medium text-gray-700">Key takeaway:</span> {llmBreakdownTakeaway}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Object.entries(llmBreakdownStats).sort(([a], [b]) => {
              const aIdx = PROVIDER_ORDER.indexOf(a);
              const bIdx = PROVIDER_ORDER.indexOf(b);
              return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
            }).map(([provider, stats]) => {
              const isExpanded = expandedLLMCards.has(provider);
              const providerResults = globallyFilteredResults.filter(
                (r: Result) => r.provider === provider && !r.error
              );
              const selectedBrand = llmBreakdownBrandFilter || llmBreakdownBrands[0] || runStatus?.brand;

              return (
                <div key={provider} className="bg-white rounded-xl overflow-hidden border border-gray-100">
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="shrink-0">{getProviderIcon(provider)}</span>
                        <span className="font-medium text-gray-900 text-sm">{getProviderLabel(provider)}</span>
                      </div>
                      <button
                        onClick={() => {
                          const newExpanded = new Set(expandedLLMCards);
                          if (isExpanded) {
                            newExpanded.delete(provider);
                          } else {
                            newExpanded.add(provider);
                          }
                          setExpandedLLMCards(newExpanded);
                        }}
                        className="text-xs text-gray-900 hover:text-gray-700 font-medium flex items-center gap-1"
                      >
                        {isExpanded ? (
                          <>Hide responses <ChevronUp className="w-3 h-3" /></>
                        ) : (
                          <>View responses <ChevronDown className="w-3 h-3" /></>
                        )}
                      </button>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${stats.rate * 100}%`, backgroundColor: getProviderBrandColor(provider) }}
                          />
                        </div>
                      </div>
                      <span className="text-sm font-semibold" style={{ color: getProviderBrandColor(provider) }}>
                        {formatPercent(stats.rate)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-xs text-gray-500">{stats.mentioned}/{stats.total} mentions</p>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-gray-500">
                          top position: <span className="font-medium text-gray-900">{stats.mentioned === 0 || stats.topPosition === null ? 'n/a' : `#${stats.topPosition}`}</span>
                        </span>
                        <span className="text-gray-500">
                          avg rank: <span className="font-medium text-gray-700">{stats.mentioned === 0 ? 'n/a' : (stats.avgRank !== null ? `#${stats.avgRank.toFixed(1)}` : 'n/a')}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Expanded responses section */}
                  {isExpanded && (
                    <div className="border-t border-gray-200 bg-white p-4 max-h-64 overflow-y-auto">
                      <p className="text-xs text-gray-500 mb-3">{providerResults.length} responses from {getProviderLabel(provider)}</p>
                      <div className="space-y-2">
                        {providerResults.map((result: Result) => {
                          const isMentioned = isCategory
                            ? result.competitors_mentioned?.includes(selectedBrand || '')
                            : result.brand_mentioned;

                          // Calculate position for this result
                          let position: number | null = null;
                          if (result.response_text && selectedBrand && isMentioned) {
                            const brandLower = selectedBrand.toLowerCase();
                            const allBrands: string[] = result.all_brands_mentioned && result.all_brands_mentioned.length > 0
                              ? result.all_brands_mentioned.filter((b): b is string => typeof b === 'string')
                              : [runStatus?.brand, ...(result.competitors_mentioned || [])].filter((b): b is string => typeof b === 'string');

                            // First try exact match
                            let foundIndex = allBrands.findIndex(b => b.toLowerCase() === brandLower);

                            // If not found, try partial match
                            if (foundIndex === -1) {
                              foundIndex = allBrands.findIndex(b =>
                                b.toLowerCase().includes(brandLower) || brandLower.includes(b.toLowerCase())
                              );
                            }

                            // If still not found, find position by text search
                            let rank = foundIndex + 1;
                            if (foundIndex === -1) {
                              const brandPos = result.response_text.toLowerCase().indexOf(brandLower);
                              if (brandPos >= 0) {
                                let brandsBeforeCount = 0;
                                for (const b of allBrands) {
                                  const bPos = result.response_text.toLowerCase().indexOf(b.toLowerCase());
                                  if (bPos >= 0 && bPos < brandPos) {
                                    brandsBeforeCount++;
                                  }
                                }
                                rank = brandsBeforeCount + 1;
                              } else {
                                rank = allBrands.length + 1;
                              }
                            }

                            if (rank > 0) position = rank;
                          }

                          return (
                            <div
                              key={result.id}
                              className="flex items-center justify-between p-2 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer"
                              onClick={() => setSelectedResult(result)}
                            >
                              <div className="flex-1 min-w-0 mr-3">
                                <p className="text-xs text-gray-700 truncate">{result.prompt}</p>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {position ? (
                                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                                    position === 1 ? 'bg-gray-100 text-gray-900' :
                                    position <= 3 ? 'bg-yellow-100 text-yellow-700' :
                                    'bg-gray-100 text-gray-600'
                                  }`}>
                                    #{position}
                                  </span>
                                ) : isMentioned ? (
                                  <span className="text-xs text-gray-500">Mentioned</span>
                                ) : (
                                  <span className="text-xs text-gray-400">Not shown</span>
                                )}
                                <ExternalLink className="w-3 h-3 text-gray-400" />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* All Results Table */}
      <div id="overview-all-results" className="bg-white rounded-2xl shadow-sm border border-gray-200">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">All Results</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Showing {filteredResults.length} of {globallyFilteredResults.filter((r: Result) => !r.error || (r.provider === 'ai_overviews' && r.error)).length} results
            </p>
          </div>
          <select
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          >
            <option value="all">All Models</option>
            {availableProviders.map((p) => (
              <option key={p} value={p}>{getProviderLabel(p)}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full table-fixed">
            <thead>
              <tr className="border-b border-gray-200">
                <th
                  className="w-[20%] text-left py-2.5 px-4 cursor-pointer hover:bg-gray-50 select-none"
                  onClick={() => handleTableSort('prompt')}
                >
                  <span className="flex items-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Question
                    <span className="relative group/tip" onClick={(e) => e.stopPropagation()}>
                      <HelpCircle className="w-3 h-3 text-gray-300 hover:text-gray-500 transition-colors" />
                      <span className="absolute left-0 top-full mt-1 w-48 p-2 bg-gray-900 text-white text-xs font-normal normal-case tracking-normal rounded-lg opacity-0 invisible group-hover/tip:opacity-100 group-hover/tip:visible transition-all z-50 shadow-lg">
                        The question sent to each AI model
                      </span>
                    </span>
                    {tableSortColumn === 'prompt' && (
                      <span className="text-gray-900">{tableSortDirection === 'asc' ? '\u2191' : '\u2193'}</span>
                    )}
                  </span>
                </th>
                <th
                  className="w-[13%] text-left py-2.5 px-4 cursor-pointer hover:bg-gray-50 select-none"
                  onClick={() => handleTableSort('llm')}
                >
                  <span className="flex items-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Model
                    <span className="relative group/tip" onClick={(e) => e.stopPropagation()}>
                      <HelpCircle className="w-3 h-3 text-gray-300 hover:text-gray-500 transition-colors" />
                      <span className="absolute left-0 top-full mt-1 w-48 p-2 bg-gray-900 text-white text-xs font-normal normal-case tracking-normal rounded-lg opacity-0 invisible group-hover/tip:opacity-100 group-hover/tip:visible transition-all z-50 shadow-lg">
                        The AI platform that generated this response
                      </span>
                    </span>
                    {tableSortColumn === 'llm' && (
                      <span className="text-gray-900">{tableSortDirection === 'asc' ? '\u2191' : '\u2193'}</span>
                    )}
                  </span>
                </th>
                <th
                  className="w-[7%] text-left py-2.5 px-4 cursor-pointer hover:bg-gray-50 select-none"
                  onClick={() => handleTableSort('position')}
                >
                  <span className="flex items-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rank
                    <span className="relative group/tip" onClick={(e) => e.stopPropagation()}>
                      <HelpCircle className="w-3 h-3 text-gray-300 hover:text-gray-500 transition-colors" />
                      <span className="absolute left-0 top-full mt-1 w-52 p-2 bg-gray-900 text-white text-xs font-normal normal-case tracking-normal rounded-lg opacity-0 invisible group-hover/tip:opacity-100 group-hover/tip:visible transition-all z-50 shadow-lg">
                        Where your brand appears in the AI response (#1 = mentioned first)
                      </span>
                    </span>
                    {tableSortColumn === 'position' && (
                      <span className="text-gray-900">{tableSortDirection === 'asc' ? '\u2191' : '\u2193'}</span>
                    )}
                  </span>
                </th>
                {!isCategory && (
                  <th
                    className="w-[12%] text-left py-2.5 px-4 cursor-pointer hover:bg-gray-50 select-none"
                    onClick={() => handleTableSort('mentioned')}
                  >
                    <span className="flex items-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Mentioned
                      <span className="relative group/tip" onClick={(e) => e.stopPropagation()}>
                        <HelpCircle className="w-3 h-3 text-gray-300 hover:text-gray-500 transition-colors" />
                        <span className="absolute left-0 top-full mt-1 w-52 p-2 bg-gray-900 text-white text-xs font-normal normal-case tracking-normal rounded-lg opacity-0 invisible group-hover/tip:opacity-100 group-hover/tip:visible transition-all z-50 shadow-lg">
                          Whether the AI included your brand in its response
                        </span>
                      </span>
                      {tableSortColumn === 'mentioned' && (
                        <span className="text-gray-900">{tableSortDirection === 'asc' ? '\u2191' : '\u2193'}</span>
                      )}
                    </span>
                  </th>
                )}
                <th
                  className="w-[14%] text-left py-2.5 px-4 cursor-pointer hover:bg-gray-50 select-none"
                  onClick={() => handleTableSort('sentiment')}
                >
                  <span className="flex items-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Sentiment
                    <span className="relative group/tip" onClick={(e) => e.stopPropagation()}>
                      <HelpCircle className="w-3 h-3 text-gray-300 hover:text-gray-500 transition-colors" />
                      <span className="absolute left-0 top-full mt-1 w-56 p-2 bg-gray-900 text-white text-xs font-normal normal-case tracking-normal rounded-lg opacity-0 invisible group-hover/tip:opacity-100 group-hover/tip:visible transition-all z-50 shadow-lg">
                        How positively the AI described your brand, from Negative to Strong
                      </span>
                    </span>
                    {tableSortColumn === 'sentiment' && (
                      <span className="text-gray-900">{tableSortDirection === 'asc' ? '\u2191' : '\u2193'}</span>
                    )}
                  </span>
                </th>
                <th
                  className="w-[20%] text-left py-2.5 px-4 cursor-pointer hover:bg-gray-50 select-none"
                  onClick={() => handleTableSort('competitors')}
                >
                  <span className="flex items-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {isCategory ? 'Brands' : 'Competitors'}
                    <span className="relative group/tip" onClick={(e) => e.stopPropagation()}>
                      <HelpCircle className="w-3 h-3 text-gray-300 hover:text-gray-500 transition-colors" />
                      <span className="absolute left-0 top-full mt-1 w-52 p-2 bg-gray-900 text-white text-xs font-normal normal-case tracking-normal rounded-lg opacity-0 invisible group-hover/tip:opacity-100 group-hover/tip:visible transition-all z-50 shadow-lg">
                        Other brands mentioned in the same AI response
                      </span>
                    </span>
                    {tableSortColumn === 'competitors' && (
                      <span className="text-gray-900">{tableSortDirection === 'asc' ? '\u2191' : '\u2193'}</span>
                    )}
                  </span>
                </th>
                <th className="w-[10%] text-left py-2.5 px-4">
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wider"></span>
                </th>
              </tr>
            </thead>
          </table>
          {/* Scrollable tbody wrapper */}
          <div className="max-h-[600px] overflow-y-auto">
            <table className="w-full table-fixed">
              <tbody>
              {sortedResults.map((result: Result, resultIdx: number) => {
                // Calculate position for this result based on first text appearance
                let position: number | null = null;
                if (result.response_text && !result.error) {
                  const selectedBrand = isCategory ? llmBreakdownBrands[0] : runStatus?.brand;
                  const brandLower = (selectedBrand || '').toLowerCase();
                  const textLower = result.response_text.toLowerCase();

                  const isMentioned = isCategory
                    ? result.competitors_mentioned?.includes(selectedBrand || '')
                    : result.brand_mentioned;

                  if (isMentioned && brandLower) {
                    const brandTextPos = textLower.indexOf(brandLower);
                    if (brandTextPos >= 0) {
                      const allBrands: string[] = result.all_brands_mentioned && result.all_brands_mentioned.length > 0
                        ? result.all_brands_mentioned.filter((b): b is string => typeof b === 'string')
                        : [runStatus?.brand, ...(result.competitors_mentioned || [])].filter((b): b is string => typeof b === 'string');

                      let brandsBeforeCount = 0;
                      for (const b of allBrands) {
                        const bLower = b.toLowerCase();
                        if (bLower === brandLower || bLower.includes(brandLower) || brandLower.includes(bLower)) continue;
                        const bPos = textLower.indexOf(bLower);
                        if (bPos >= 0 && bPos < brandTextPos) {
                          brandsBeforeCount++;
                        }
                      }
                      const rank = brandsBeforeCount + 1;
                      if (rank > 0) position = rank;
                    }
                  }
                }

                // Position badge styling
                const getPositionBadge = () => {
                  if (result.error) return <span className="text-xs text-gray-400">{'\u2014'}</span>;
                  if (!position) {
                    return <span className="text-xs text-gray-400">{'\u2014'}</span>;
                  }
                  const color = position === 1
                    ? 'text-emerald-700 font-semibold'
                    : position <= 3
                    ? 'text-teal-700 font-medium'
                    : position <= 5
                    ? 'text-amber-600 font-medium'
                    : 'text-gray-500';
                  return (
                    <span className={`text-xs ${color}`}>#{position}</span>
                  );
                };

                // Mentioned badge
                const getMentionedBadge = () => {
                  if (result.error) return <span className="text-xs text-gray-400">{'\u2014'}</span>;
                  if (result.brand_mentioned) {
                    return <span className="text-xs font-medium text-emerald-600">Yes</span>;
                  }
                  return <span className="text-xs text-gray-400">No</span>;
                };

                // Sentiment badge with reason — extracts context from the sentence containing the brand
                const getSentimentReason = (sentiment: string, text: string, brand: string): string => {
                  const brandLower = brand.toLowerCase();
                  // Find the sentence containing the brand name
                  const sentences = text.split(/(?<=[.!?])\s+/);
                  const brandSentences = sentences.filter(s => s.toLowerCase().includes(brandLower));
                  const context = brandSentences.join(' ').toLowerCase();
                  // If no brand sentences found, use full text
                  const searchText = context || text.toLowerCase();

                  if (sentiment === 'strong_endorsement') {
                    if (/\b(top pick|top choice|best overall|#\s?1|number one|first choice)\b/.test(searchText)) return `Called a top pick or #1 choice`;
                    if (/\bhighly recommend/.test(searchText)) return `Highly recommended by name`;
                    if (/\b(strongly recommend|must.have|essential)\b/.test(searchText)) return `Described as a must-have`;
                    if (/\b(industry leader|market leader|leads the)\b/.test(searchText)) return `Called an industry or market leader`;
                    if (/\b(stands out|sets .* apart|unmatched)\b/.test(searchText)) return `Said to stand out from competitors`;
                    if (/\b(best.in.class|gold standard|benchmark)\b/.test(searchText)) return `Called best-in-class or gold standard`;
                    if (/\b(go.to|favorite|preferred)\b/.test(searchText)) return `Named as the go-to or preferred option`;
                    if (/\b(excellent|exceptional|outstanding|superb|stellar)\b/.test(searchText)) return `Described with strong praise (excellent, exceptional)`;
                    if (/\b(dominat|unrivaled|unbeatable)\b/.test(searchText)) return `Positioned as dominant in its category`;
                    if (/\bbest\b/.test(searchText)) return `Called "best" in context`;
                    if (/\b(superior|excels|ahead of)\b/.test(searchText)) return `Said to be superior to alternatives`;
                    return `Endorsed as a top recommendation`;
                  }
                  if (sentiment === 'positive_endorsement') {
                    if (/\b(reliable|dependable)\b/.test(searchText)) return `Described as reliable or dependable`;
                    if (/\b(well.known|well.established|reputable|trusted)\b/.test(searchText)) return `Recognized as a trusted, reputable brand`;
                    if (/\b(popular|widely used|widely adopted)\b/.test(searchText)) return `Noted as popular and widely used`;
                    if (/\b(innovative|cutting.edge|advanced technology)\b/.test(searchText)) return `Highlighted for innovation or technology`;
                    if (/\b(high.quality|well.made|premium|durable)\b/.test(searchText)) return `Praised for quality or durability`;
                    if (/\b(great value|good value|affordable)\b/.test(searchText)) return `Noted for good value or affordability`;
                    if (/\b(recommend|worth considering|worth a look)\b/.test(searchText)) return `Recommended or said to be worth considering`;
                    if (/\b(impressive|strong performance|performs well)\b/.test(searchText)) return `Praised for strong performance`;
                    if (/\b(good|great|solid)\b/.test(searchText)) return `Described as a good or solid option`;
                    if (/\b(versatile|flexible|user.friendly|easy to use)\b/.test(searchText)) return `Noted for ease of use or versatility`;
                    return `Mentioned in a positive light`;
                  }
                  if (sentiment === 'conditional') {
                    if (/\b(budget|price|cost|expensive|pric)\b/.test(searchText)) return `Recommendation depends on price or budget`;
                    if (/\b(depends on|depending on) (your |what |how )/.test(searchText)) return `Suitability depends on specific needs`;
                    if (/\b(beginner|advanced|experienced|skill level)\b/.test(searchText)) return `Fit depends on user experience level`;
                    if (/\b(not for everyone|some users|some people|niche)\b/.test(searchText)) return `Noted as good for some users, not all`;
                    if (/\b(limited|lacks|missing|doesn.t have)\b/.test(searchText)) return `Praised but noted for missing features`;
                    if (/\b(however|but|although|while|despite|caveat)\b/.test(searchText)) return `Positive mention followed by caveats`;
                    if (/\b(if you|for those who|for people who)\b/.test(searchText)) return `Recommended only for certain use cases`;
                    if (/\b(trade.off|compromise|downside)\b/.test(searchText)) return `Mentioned with trade-offs or downsides`;
                    if (/\b(compared to|alternative|better than|worse than)\b/.test(searchText)) return `Mixed when compared to alternatives`;
                    if (/\b(may not|might not|not always|sometimes)\b/.test(searchText)) return `Said to not always meet expectations`;
                    return `Endorsed with qualifications or conditions`;
                  }
                  if (sentiment === 'negative_comparison') {
                    if (/\b(behind|trails|lags|falling behind)\b/.test(searchText)) return `Said to lag behind or trail competitors`;
                    if (/\b(avoid|stay away|not recommend|wouldn.t recommend)\b/.test(searchText)) return `Explicitly not recommended or warned against`;
                    if (/\b(worse|inferior|weaker) than\b/.test(searchText)) return `Directly compared as worse than rivals`;
                    if (/\b(issue|problem|complaint|frustrat)\b/.test(searchText)) return `Cited for specific problems or complaints`;
                    if (/\b(decline|struggling|losing|lost)\b/.test(searchText)) return `Described as declining or losing ground`;
                    if (/\b(overpriced|too expensive|not worth)\b/.test(searchText)) return `Called overpriced or not worth the cost`;
                    if (/\b(outdated|behind the times|hasn.t kept up)\b/.test(searchText)) return `Described as outdated vs. competitors`;
                    if (/\b(disappoint|underwhelm|fall.short)\b/.test(searchText)) return `Said to disappoint or fall short`;
                    if (/\b(poor|bad|terrible|worst)\b/.test(searchText)) return `Described negatively (poor, bad)`;
                    if (/\b(lack|missing|absent|no )\b/.test(searchText)) return `Criticized for lacking key features`;
                    return `Framed negatively vs. competitors`;
                  }
                  if (sentiment === 'neutral_mention') {
                    if (/\b(one of (many|several|the)|among (the|several|many))\b/.test(searchText)) return `Listed as one of several options`;
                    if (/\b(also|available|option|alternative)\b/.test(searchText)) return `Mentioned as an available option`;
                    if (/\b(compare|comparison|versus|vs)\b/.test(searchText)) return `Included in a factual comparison`;
                    if (/\b(offers|provides|features|includes)\b/.test(searchText)) return `Features described without opinion`;
                    if (/\b(known for|specializes)\b/.test(searchText)) return `Described for what it's known for`;
                    return `Referenced without positive or negative framing`;
                  }
                  return '';
                };

                const getSentimentBadge = () => {
                  if (result.error) return <span className="text-xs text-gray-400">{'\u2014'}</span>;
                  const sentiment = result.brand_sentiment;
                  if (!sentiment || sentiment === 'not_mentioned') {
                    return <span className="text-xs text-gray-400">{'\u2014'}</span>;
                  }
                  const configs: Record<string, { text: string; subtext: string; label: string }> = {
                    'strong_endorsement': { text: 'text-emerald-700', subtext: 'text-emerald-600/70', label: 'Strong' },
                    'positive_endorsement': { text: 'text-green-600', subtext: 'text-green-500/70', label: 'Positive' },
                    'neutral_mention': { text: 'text-gray-500', subtext: 'text-gray-400/80', label: 'Neutral' },
                    'conditional': { text: 'text-amber-600', subtext: 'text-amber-500/70', label: 'Conditional' },
                    'negative_comparison': { text: 'text-red-600', subtext: 'text-red-500/70', label: 'Negative' },
                  };
                  const config = configs[sentiment] || { text: 'text-gray-500', subtext: 'text-gray-400/80', label: 'Unknown' };
                  const reason = result.response_text ? getSentimentReason(sentiment, result.response_text, runStatus?.brand || '') : '';
                  if (reason) {
                    return (
                      <div>
                        <span className={`text-xs font-medium ${config.text}`}>{config.label}</span>
                        <p className={`text-[10px] ${config.subtext} leading-tight mt-0.5`}>{reason}</p>
                      </div>
                    );
                  }
                  return (
                    <span className={`text-xs font-medium ${config.text}`}>
                      {config.label}
                    </span>
                  );
                };

                // Competitors list
                const getCompetitorsList = () => {
                  if (result.error) return <span className="text-xs text-gray-400">{'\u2014'}</span>;
                  const competitors = result.competitors_mentioned || [];
                  if (competitors.length === 0) {
                    return <span className="text-xs text-gray-400">None</span>;
                  }
                  return (
                    <span className="text-xs text-gray-600">
                      {competitors.join(', ')}
                    </span>
                  );
                };

                return (
                  <tr
                    key={result.id}
                    className={`border-b border-gray-100 cursor-pointer transition-colors hover:bg-gray-50 ${resultIdx % 2 === 1 ? 'bg-gray-50/30' : ''}`}
                    onClick={() => setSelectedResult(result)}
                  >
                    <td className="w-[20%] py-3 px-4" title={result.prompt}>
                        <p className="text-xs text-gray-900 truncate">{truncate(result.prompt, 50)}</p>
                      </td>
                      <td className="w-[13%] py-3 px-4">
                        <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                          {getProviderIcon(result.provider)}
                          {getProviderLabel(result.provider)}
                        </span>
                      </td>
                      <td className="w-[7%] py-3 px-4">
                        {getPositionBadge()}
                      </td>
                      {!isCategory && (
                        <td className="w-[12%] py-3 px-4">
                          {getMentionedBadge()}
                        </td>
                      )}
                      <td className="w-[14%] py-3 px-4">
                        {getSentimentBadge()}
                      </td>
                      <td className="w-[20%] py-3 px-4">
                        {getCompetitorsList()}
                      </td>
                      <td className="w-[10%] py-3 px-4">
                        <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
                      </td>
                  </tr>
                );
              })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 bg-gray-50/50 border-t border-gray-100 rounded-b-2xl">
          <button
            onClick={() => {
              // Generate CSV content
              const headers = ['Question', 'AI Model', 'Position', 'Brand Mentioned', 'Sentiment', 'Competitors', 'Response'];
              const rows = sortedResults.map((result: Result) => {
                // Calculate position based on first text appearance
                let position: number | string = '-';
                if (result.response_text && !result.error) {
                  const selectedBrand = isCategory ? llmBreakdownBrands[0] : runStatus?.brand;
                  const brandLower = (selectedBrand || '').toLowerCase();
                  const textLower = result.response_text.toLowerCase();
                  const isMentioned = isCategory
                    ? result.competitors_mentioned?.includes(selectedBrand || '')
                    : result.brand_mentioned;

                  if (isMentioned && brandLower) {
                    const brandTextPos = textLower.indexOf(brandLower);
                    if (brandTextPos >= 0) {
                      const allBrands: string[] = result.all_brands_mentioned && result.all_brands_mentioned.length > 0
                        ? result.all_brands_mentioned.filter((b): b is string => typeof b === 'string')
                        : [runStatus?.brand, ...(result.competitors_mentioned || [])].filter((b): b is string => typeof b === 'string');
                      let brandsBeforeCount = 0;
                      for (const b of allBrands) {
                        const bLower = b.toLowerCase();
                        if (bLower === brandLower || bLower.includes(brandLower) || brandLower.includes(bLower)) continue;
                        const bPos = textLower.indexOf(bLower);
                        if (bPos >= 0 && bPos < brandTextPos) {
                          brandsBeforeCount++;
                        }
                      }
                      position = brandsBeforeCount + 1;
                    }
                  }
                }

                const sentimentLabel = result.brand_sentiment === 'strong_endorsement' ? 'Strong' :
                  result.brand_sentiment === 'positive_endorsement' ? 'Positive' :
                  result.brand_sentiment === 'conditional' ? 'Conditional' :
                  result.brand_sentiment === 'negative_comparison' ? 'Negative' :
                  result.brand_sentiment === 'neutral_mention' ? 'Neutral' : 'Not mentioned';

                return [
                  `"${result.prompt.replace(/"/g, '""')}"`,
                  getProviderLabel(result.provider),
                  position,
                  result.error ? 'Error' : result.brand_mentioned ? 'Yes' : 'No',
                  sentimentLabel,
                  `"${(result.competitors_mentioned || []).join(', ')}"`,
                  `"${(result.response_text || '').replace(/\*?\*?\[People Also Ask\]\*?\*?/g, '').replace(/[\r\n]+/g, ' ').replace(/"/g, '""')}"`
                ].join(',');
              });

              const csv = [headers.join(','), ...rows].join('\n');
              const blob = new Blob([csv], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${runStatus?.brand || 'results'}-all-results.csv`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <button
            onClick={() => {
              const url = window.location.href;
              navigator.clipboard.writeText(url).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              });
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors"
          >
            <Link2 className="w-4 h-4" />
            {copied ? 'Link Copied!' : 'Share Link'}
          </button>
        </div>
      </div>
    </div>
  );
};
