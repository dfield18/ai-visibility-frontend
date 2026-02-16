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
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { Spinner } from '@/components/ui/Spinner';
import { formatPercent, truncate } from '@/lib/utils';
import type { SectionAccess } from '@/lib/billing';
import { PaywallOverlay } from '@/components/PaywallOverlay';
import { PlaceholderChart } from '@/components/PlaceholderChart';
import { PlaceholderTable } from '@/components/PlaceholderTable';
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
  getTextForRanking,
  isCategoryName,
} from './shared';
import { useResults, useResultsUI } from './ResultsContext';

function MarketSpreadDonut({
  donutData,
  totalMentions,
  totalBrands,
  colors,
  cardClassName,
}: {
  donutData: { name: string; value: number }[];
  totalMentions: number;
  totalBrands: number;
  colors: string[];
  cardClassName: string;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  return (
    <div style={{ order: 3 }} className={`rounded-2xl shadow-sm border p-4 flex flex-col h-[270px] ${cardClassName}`}>
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-sm font-semibold text-gray-800 tracking-wide uppercase">Market Spread</p>
          <p className="text-[11px] text-gray-400 leading-tight">% of total mentions across all prompts</p>
        </div>
        <div className="relative group">
          <button
            className="p-1 rounded-full hover:bg-gray-100 transition-colors"
            aria-label="Learn more about Market Spread"
            tabIndex={0}
          >
            <HelpCircle className="w-4 h-4 text-gray-400" />
          </button>
          <div className="absolute right-0 top-full mt-1 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all z-50 shadow-lg leading-relaxed">
            <p className="font-semibold mb-1">Brand mention breakdown</p>
            <p>Shows how often each brand is mentioned across all AI responses. Hover over a brand name or chart slice for details.</p>
          </div>
        </div>
      </div>
      <div className="flex-1 flex items-center gap-3 min-h-0">
        {/* Donut chart */}
        <div className="w-[110px] h-[110px] flex-shrink-0 relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={donutData}
                cx="50%"
                cy="50%"
                innerRadius={27}
                outerRadius={48}
                dataKey="value"
                strokeWidth={2}
                stroke="#fff"
                onMouseEnter={(_, index) => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(null)}
              >
                {donutData.map((_, i) => (
                  <Cell
                    key={i}
                    fill={colors[i % colors.length]}
                    strokeWidth={activeIndex === i ? 2 : 2}
                    stroke={activeIndex === i ? colors[i % colors.length] : '#fff'}
                    style={{
                      filter: activeIndex !== null && activeIndex !== i ? 'opacity(0.4)' : undefined,
                      transition: 'filter 0.2s, transform 0.2s',
                    }}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          {/* Center label on hover */}
          {activeIndex !== null && donutData[activeIndex] && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[11px] font-semibold text-gray-900 leading-tight text-center px-1 truncate max-w-[48px]">
                {donutData[activeIndex].name}
              </span>
              <span className="text-[10px] text-gray-500">
                {donutData[activeIndex].value.toFixed(0)}%
              </span>
            </div>
          )}
        </div>
        {/* Brand legend */}
        <div className="min-w-0 space-y-1">
          {donutData.map((entry, i) => {
            const pct = entry.value.toFixed(0);
            return (
              <div
                key={entry.name}
                className={`flex items-center gap-1.5 px-1 py-0.5 rounded cursor-default transition-colors ${
                  activeIndex === i ? 'bg-gray-100' : 'hover:bg-gray-50'
                }`}
                onMouseEnter={() => setActiveIndex(i)}
                onMouseLeave={() => setActiveIndex(null)}
              >
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: colors[i % colors.length] }}
                />
                <span className="text-xs text-gray-700 truncate">{entry.name}</span>
                <span className="text-xs font-medium text-gray-500 tabular-nums flex-shrink-0">{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-auto pt-1">{totalBrands} total brands{totalBrands > donutData.length ? ` (top ${donutData.length - (donutData[donutData.length - 1]?.name === 'Other' ? 1 : 0)} shown)` : ''}</p>
    </div>
  );
}

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
  accessLevel?: SectionAccess;
  /** When provided, only render sections whose IDs are in this list. */
  visibleSections?: string[];
}

export const OverviewTab = ({
  aiSummaryExpanded,
  setAiSummaryExpanded,
  showSentimentColors,
  setShowSentimentColors,
  providerFilter,
  setProviderFilter,
  setCopied,
  accessLevel = 'visible',
  visibleSections,
}: OverviewTabProps) => {
  // Section visibility helper — if visibleSections is not set, show all
  const showSection = (id: string) => !visibleSections || visibleSections.includes(id);
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
    isIssue,
    isPublicFigure,
    availableProviders,
    availablePrompts,
    globallyFilteredResults,
    availableBrands,
    llmBreakdownBrandFilter,
    setLlmBreakdownBrandFilter,
    promptBreakdownLlmFilter,
    setPromptBreakdownLlmFilter,
    brandBreakdownStats,
    excludedBrands,
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
  const [tableBrandFilter, setTableBrandFilter] = useState<string>('all');
  const [positionChartBrandFilter, setPositionChartBrandFilter] = useState<string>('__all__');
  const [positionChartPromptFilter, setPositionChartPromptFilter] = useState<string>('__all__');
  const [framingPromptFilter, setFramingPromptFilter] = useState<string>('all');
  const [framingEvidenceExpanded, setFramingEvidenceExpanded] = useState<Set<string>>(new Set(['Supportive', 'Balanced']));
  const [framingEvidenceShowAll, setFramingEvidenceShowAll] = useState<Set<string>>(new Set());

  // Framing by provider filtered by prompt (issue search type)
  const FRAMING_MAP: Record<string, string> = {
    strong_endorsement: 'Supportive',
    positive_endorsement: 'Leaning Supportive',
    neutral_mention: 'Balanced',
    conditional: 'Mixed',
    negative_comparison: 'Critical',
  };

  const filteredFramingByProvider = useMemo(() => {
    if (!isIssue) return overviewMetrics?.framingByProvider || {};
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
  }, [isIssue, globallyFilteredResults, framingPromptFilter, overviewMetrics]);

  // Framing evidence: group results by framing bucket with key excerpts
  type FramingEvidenceItem = { provider: string; prompt: string; excerpt: string; framing: string };
  const framingEvidenceGroups = useMemo(() => {
    if (!isIssue || !runStatus) return { Supportive: [], Balanced: [], Critical: [] } as Record<string, FramingEvidenceItem[]>;
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
  }, [isIssue, runStatus, globallyFilteredResults]);

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

  // Brand options for position chart dropdown (industry reports only)
  const positionChartBrandOptions = useMemo(() => {
    if (!isCategory) return [];
    const options: { value: string; label: string }[] = [
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
  }, [isCategory, globallyFilteredResults, excludedBrands, runStatus]);

  // Helper: compute rank for a specific brand within a result
  const computeBrandRank = (result: Result, brand: string): number => {
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
  };

  const positionByPlatformData = useMemo(() => {
    // For industry reports with brand filter, compute locally from results
    if (isCategory && runStatus) {
      const results = globallyFilteredResults.filter((r: Result) => !r.error);
      if (results.length === 0) return [];

      const grouped: Record<string, Record<string, { sentiment: string | null; prompt: string; rank: number; label: string; originalResult: Result }[]>> = {};
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
    const grouped: Record<string, Record<string, { sentiment: string | null; prompt: string; rank: number; label: string; originalResult: Result }[]>> = {};
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
  }, [scatterPlotData, isCategory, runStatus, globallyFilteredResults, positionChartBrandFilter, positionChartPromptFilter, excludedBrands]);

  const filteredResults = useMemo(() => {
    if (!runStatus) return [];
    return globallyFilteredResults.filter((result: Result) => {
      const isAiOverviewError = result.provider === 'ai_overviews' && result.error;
      if (result.error && !isAiOverviewError) return false;
      if (providerFilter !== 'all' && result.provider !== providerFilter) return false;
      if (tableBrandFilter !== 'all' && !(result.all_brands_mentioned?.length ? result.all_brands_mentioned.includes(tableBrandFilter) : result.competitors_mentioned?.includes(tableBrandFilter))) return false;
      return true;
    });
  }, [globallyFilteredResults, providerFilter, tableBrandFilter, runStatus]);

  // Helper to calculate position for a result based on first appearance in response text
  const getResultPosition = (result: Result): number | null => {
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
      {showSection('metrics') && <div id="overview-metrics" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* AI Visibility / Competitive Depth Score / Issue Coverage Card */}
        {(() => {
          if (isIssue) {
            // Discussion Polarity — stacked bar showing all framing categories
            const dist: Record<string, number> = overviewMetrics?.framingDistribution || {};
            const segments = [
              { label: 'Supportive', count: dist['Supportive'] || 0, color: '#047857' },
              { label: 'Leaning Supportive', count: dist['Leaning Supportive'] || 0, color: '#10b981' },
              { label: 'Balanced', count: dist['Balanced'] || 0, color: '#9ca3af' },
              { label: 'Mixed', count: dist['Mixed'] || 0, color: '#f59e0b' },
              { label: 'Critical', count: dist['Critical'] || 0, color: '#ef4444' },
            ];
            const polarTotal = segments.reduce((s, seg) => s + seg.count, 0);
            const supportivePct = polarTotal > 0 ? ((segments[0].count + segments[1].count) / polarTotal) * 100 : 0;
            const criticalPct = polarTotal > 0 ? (segments[4].count / polarTotal) * 100 : 0;
            const polarityLabel = supportivePct > criticalPct + 15 ? 'Leans Supportive'
              : criticalPct > supportivePct + 15 ? 'Leans Critical'
              : supportivePct + criticalPct < 30 ? 'Balanced'
              : 'Polarized';
            const polarityTone: 'success' | 'neutral' | 'warn' =
              polarityLabel === 'Leans Supportive' ? 'success'
              : polarityLabel === 'Balanced' ? 'neutral'
              : 'warn';
            return (
              <div className={`rounded-2xl shadow-sm border p-5 flex flex-col h-[270px] ${metricCardBackgrounds.visibility}`}>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-semibold text-gray-800 tracking-wide uppercase">Discussion Polarity</p>
                  <div className="relative group">
                    <button
                      className="p-1 rounded-full hover:bg-gray-100 transition-colors"
                      aria-label="Learn more about Discussion Polarity"
                      tabIndex={0}
                    >
                      <HelpCircle className="w-4 h-4 text-gray-400" />
                    </button>
                    <div className="absolute right-0 top-full mt-1 w-64 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all z-50 shadow-lg">
                      Shows how AI responses frame {runStatus?.brand || 'this issue'} across {polarTotal} responses.
                    </div>
                  </div>
                </div>
                {/* Stacked bar */}
                <div className="h-[100px] flex flex-col justify-center">
                  <div className="w-full h-5 rounded-full overflow-hidden flex bg-gray-100">
                    {segments.filter(s => s.count > 0).map(seg => (
                      <div key={seg.label} className="h-full transition-all" style={{ width: `${(seg.count / polarTotal) * 100}%`, backgroundColor: seg.color }} />
                    ))}
                  </div>
                  {/* Legend */}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3">
                    {segments.filter(s => s.count > 0).map(seg => (
                      <div key={seg.label} className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: seg.color }} />
                        <span className="text-[10px] text-gray-500">{seg.label} {polarTotal > 0 ? ((seg.count / polarTotal) * 100).toFixed(0) : 0}%</span>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Badge */}
                <div className="h-[28px] flex items-start mt-3">
                  <span className={`inline-block w-fit px-3 py-1 text-xs font-medium rounded-full ${getToneStyles(polarityTone)}`}>
                    {polarityLabel}
                  </span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed mt-auto">How AI responses split on {runStatus?.brand || 'this issue'}</p>
              </div>
            );
          }

          if (isPublicFigure) {
            // AI Portrayal — sentiment ring showing positive/neutral/negative split
            const split = overviewMetrics?.sentimentSplit || { positive: 0, neutral: 0, negative: 0 };
            const score = overviewMetrics?.portrayalScore ?? 0;
            const portrayalLabel = score >= 40 ? 'Very Positive' : score >= 15 ? 'Mostly Positive' : score >= -15 ? 'Mixed / Neutral' : score >= -40 ? 'Mostly Negative' : 'Very Negative';
            const portrayalTone: 'success' | 'neutral' | 'warn' = score >= 15 ? 'success' : score >= -15 ? 'neutral' : 'warn';
            return (
              <div className={`rounded-2xl shadow-sm border p-5 flex flex-col h-[270px] ${metricCardBackgrounds.visibility}`}>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-semibold text-gray-800 tracking-wide uppercase">AI Portrayal</p>
                  <div className="relative group">
                    <button className="p-1 rounded-full hover:bg-gray-100 transition-colors" aria-label="Learn more about AI Portrayal" tabIndex={0}>
                      <HelpCircle className="w-4 h-4 text-gray-400" />
                    </button>
                    <div className="absolute right-0 top-full mt-1 w-64 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all z-50 shadow-lg">
                      Overall portrayal score ({score >= 0 ? '+' : ''}{score}) based on sentiment across {overviewMetrics?.totalResponses || 0} AI responses. Positive: {split.positive}%, Neutral: {split.neutral}%, Negative: {split.negative}%.
                    </div>
                  </div>
                </div>
                <div className="h-[100px] flex flex-col justify-center items-center">
                  <span className="text-4xl font-bold tracking-tight tabular-nums" style={{ color: score >= 15 ? '#047857' : score >= -15 ? '#6b7280' : '#dc2626' }}>
                    {score >= 0 ? '+' : ''}{score}
                  </span>
                  <p className="text-sm text-gray-500 mt-1">{portrayalLabel}</p>
                </div>
                <div className="h-[28px] flex items-start mt-3">
                  <div className="flex items-center gap-3 text-[11px]">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />{split.positive}% Positive</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-400" />{split.neutral}% Neutral</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" />{split.negative}% Negative</span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed mt-auto">How positively or negatively AI portrays {runStatus?.brand || 'this figure'}</p>
              </div>
            );
          }

          if (isCategory) {
            // Competitive Depth Score for industry reports — use brandBreakdownStats for consistency
            const allowedBrands = new Set(brandBreakdownStats.map(s => s.brand));
            let totalBrandsAcrossResults = 0;
            let resultsWithBrands = 0;
            for (const r of globallyFilteredResults) {
              if (r.error) continue;
              const brands = (r.all_brands_mentioned?.length ? r.all_brands_mentioned : r.competitors_mentioned || [])
                .filter(b => allowedBrands.has(b));
              if (brands.length > 0) {
                totalBrandsAcrossResults += brands.length;
                resultsWithBrands++;
              }
            }
            const avgBrands = resultsWithBrands > 0 ? totalBrandsAcrossResults / resultsWithBrands : 0;
            const depthTone: 'success' | 'neutral' | 'warn' = avgBrands >= 5 ? 'success' : avgBrands >= 3 ? 'neutral' : 'warn';
            return (
              <div style={{ order: 2 }} className={`rounded-2xl shadow-sm border p-5 flex flex-col h-[270px] ${metricCardBackgrounds.visibility}`}>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-semibold text-gray-800 tracking-wide uppercase">Competitive Depth</p>
                  <div className="relative group">
                    <button
                      className="p-1 rounded-full hover:bg-gray-100 transition-colors"
                      aria-label="Learn more about Competitive Depth Score"
                      tabIndex={0}
                    >
                      <HelpCircle className="w-4 h-4 text-gray-400" />
                    </button>
                    <div className="absolute right-0 top-full mt-1 w-64 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all z-50 shadow-lg">
                      AI responses mention an average of {avgBrands.toFixed(1)} brands per query across {resultsWithBrands} responses about {runStatus?.brand || 'this category'}.
                    </div>
                  </div>
                </div>
                {/* Large number display */}
                <div className="h-[100px] flex flex-col justify-center items-center text-center">
                  <p className="text-4xl font-bold text-gray-900 tracking-tight tabular-nums">{avgBrands.toFixed(1)}</p>
                  <p className="text-sm text-gray-500 mt-1">brands per response</p>
                </div>
                {/* Badge */}
                <div className="h-[28px] flex items-start mt-3">
                  <span className={`inline-block w-fit px-3 py-1 text-xs font-medium rounded-full ${getToneStyles(depthTone)}`}>
                    {avgBrands >= 5 ? 'Highly competitive' : avgBrands >= 3 ? 'Moderately competitive' : 'Low competition'}
                  </span>
                </div>
                {/* Description */}
                <p className="text-xs text-gray-500 leading-relaxed mt-auto">Average number of brands surfaced per query</p>
              </div>
            );
          }

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

        {/* Share of Voice / Market Leader / Dominant Framing Card */}
        {(() => {
          const sovTone = isCategory && brandBreakdownStats.length > 0
            ? getKPIInterpretation('shareOfVoice', brandBreakdownStats[0].shareOfVoice).tone
            : getKPIInterpretation('shareOfVoice', overviewMetrics?.shareOfVoice ?? null).tone;

          if (isIssue) {
            // Dominant Framing — hero text showing the most common framing label
            const framingLabel = overviewMetrics?.dominantFraming || 'Balanced';
            const distribution: Record<string, number> = overviewMetrics?.framingDistribution || {};
            const total = Object.values(distribution).reduce((a, b) => a + b, 0);
            const dominantCount = distribution[framingLabel] || 0;
            const dominantPct = total > 0 ? ((dominantCount / total) * 100).toFixed(0) : '0';
            const framingTone: 'success' | 'neutral' | 'warn' =
              framingLabel === 'Supportive' || framingLabel === 'Leaning Supportive' ? 'success'
              : framingLabel === 'Balanced' ? 'neutral'
              : 'warn';
            return (
              <div className={`rounded-2xl shadow-sm border p-5 flex flex-col h-[270px] ${metricCardBackgrounds.shareOfVoice}`}>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-semibold text-gray-800 tracking-wide uppercase">Dominant Framing</p>
                  <div className="relative group">
                    <button
                      className="p-1 rounded-full hover:bg-gray-100 transition-colors"
                      aria-label="Learn more about Dominant Framing"
                      tabIndex={0}
                    >
                      <HelpCircle className="w-4 h-4 text-gray-400" />
                    </button>
                    <div className="absolute right-0 top-full mt-1 w-64 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all z-50 shadow-lg">
                      The most common way AI platforms frame {runStatus?.brand || 'this issue'}. &ldquo;{framingLabel}&rdquo; appears in {dominantPct}% of responses.
                    </div>
                  </div>
                </div>
                {/* Framing label as hero element */}
                <div className="h-[100px] flex flex-col justify-center">
                  <p className="text-2xl font-bold text-gray-900 leading-tight">{framingLabel}</p>
                  <p className="text-sm text-gray-500 mt-1">{dominantPct}% of responses</p>
                </div>
                {/* Badge */}
                <div className="h-[28px] flex items-start mt-3">
                  <span className={`inline-block w-fit px-3 py-1 text-xs font-medium rounded-full ${getToneStyles(framingTone)}`}>
                    {framingLabel === 'Balanced' ? 'Neutral framing' : framingLabel === 'Supportive' || framingLabel === 'Leaning Supportive' ? 'Favorable framing' : 'Critical framing'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed mt-auto">How AI platforms most commonly frame {runStatus?.brand || 'this issue'}</p>
              </div>
            );
          }

          if (isPublicFigure) {
            // Sentiment Polarity — stacked bar showing all sentiment categories
            const split = overviewMetrics?.sentimentSplit || { positive: 0, neutral: 0, negative: 0, strong: 0, positiveEndorsement: 0, neutralMention: 0, conditional: 0, negativeComparison: 0 };
            const segments = [
              { label: 'Strong', pct: split.strong || 0, color: '#047857' },
              { label: 'Positive', pct: split.positiveEndorsement || 0, color: '#10b981' },
              { label: 'Neutral', pct: split.neutralMention || 0, color: '#9ca3af' },
              { label: 'Conditional', pct: split.conditional || 0, color: '#f59e0b' },
              { label: 'Negative', pct: split.negativeComparison || 0, color: '#ef4444' },
            ];
            const polarityLabel = split.positive > split.negative + 20 ? 'Largely favorable'
              : split.negative > split.positive + 20 ? 'Largely unfavorable'
              : split.neutral >= 50 ? 'Mostly neutral'
              : 'Polarized';
            const polarityTone: 'success' | 'neutral' | 'warn' =
              polarityLabel === 'Largely favorable' ? 'success'
              : polarityLabel === 'Mostly neutral' ? 'neutral'
              : 'warn';
            return (
              <div className={`rounded-2xl shadow-sm border p-5 flex flex-col h-[270px] ${metricCardBackgrounds.shareOfVoice}`}>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-semibold text-gray-800 tracking-wide uppercase">Sentiment Polarity</p>
                  <div className="relative group">
                    <button className="p-1 rounded-full hover:bg-gray-100 transition-colors" aria-label="Learn more about Sentiment Polarity" tabIndex={0}>
                      <HelpCircle className="w-4 h-4 text-gray-400" />
                    </button>
                    <div className="absolute right-0 top-full mt-1 w-64 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all z-50 shadow-lg">
                      Shows how AI responses split across sentiment categories toward {runStatus?.brand || 'this figure'}.
                    </div>
                  </div>
                </div>
                <div className="h-[100px] flex flex-col justify-center">
                  <div className="w-full h-5 rounded-full overflow-hidden flex bg-gray-100">
                    {segments.filter(s => s.pct > 0).map(seg => (
                      <div key={seg.label} className="h-full transition-all" style={{ width: `${seg.pct}%`, backgroundColor: seg.color }} />
                    ))}
                  </div>
                  {/* Legend */}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3">
                    {segments.filter(s => s.pct > 0).map(seg => (
                      <div key={seg.label} className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: seg.color }} />
                        <span className="text-[10px] text-gray-500">{seg.label} {seg.pct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="h-[28px] flex items-start mt-3">
                  <span className={`inline-block w-fit px-3 py-1 text-xs font-medium rounded-full ${getToneStyles(polarityTone)}`}>
                    {polarityLabel}
                  </span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed mt-auto">How AI responses split on {runStatus?.brand || 'this figure'}</p>
              </div>
            );
          }

          if (isCategory) {
            // Market Leader variant for industry reports — use brandBreakdownStats for consistency
            const leader = brandBreakdownStats[0];
            const leaderName = leader?.brand || overviewMetrics?.selectedBrand || 'N/A';
            const leaderVisibility = leader?.visibilityScore ?? 0;
            const leaderMentioned = leader?.mentioned ?? 0;
            const leaderTotal = leader?.total ?? 0;
            const leaderVisTone = getKPIInterpretation('visibility', leaderVisibility).tone;
            return (
              <div style={{ order: 4 }} className={`rounded-2xl shadow-sm border p-5 flex flex-col h-[270px] ${metricCardBackgrounds.visibility}`}>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-semibold text-gray-800 tracking-wide uppercase">Market Leader</p>
                  <div className="relative group">
                    <button
                      className="p-1 rounded-full hover:bg-gray-100 transition-colors"
                      aria-label="Learn more about Market Leader"
                      tabIndex={0}
                    >
                      <HelpCircle className="w-4 h-4 text-gray-400" />
                    </button>
                    <div className="absolute right-0 top-full mt-1 w-64 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all z-50 shadow-lg">
                      {leaderName} appears in {leaderVisibility.toFixed(1)}% of AI responses ({leaderMentioned} of {leaderTotal} responses).
                    </div>
                  </div>
                </div>
                {/* Brand name as hero element */}
                <div className="h-[100px] flex flex-col justify-center">
                  <p className="text-2xl font-bold text-gray-900 leading-tight truncate" title={leaderName}>{leaderName}</p>
                  <p className="text-sm text-gray-500 mt-1">{leaderVisibility.toFixed(1)}% visibility score</p>
                  <p className="text-xs text-gray-400 mt-0.5">% of AI responses that mention this brand</p>
                </div>
                {/* Badge */}
                <div className="h-[28px] flex items-start mt-3">
                  <span className={`inline-block w-fit px-3 py-1 text-xs font-medium rounded-full cursor-help ${getToneStyles(leaderVisTone)}`} title={getKPIInterpretation('visibility', leaderVisibility).tooltip}>
                    {getKPIInterpretation('visibility', leaderVisibility).label}
                  </span>
                </div>
                {/* Description */}
                <p className="text-xs text-gray-500 leading-relaxed mt-auto">The most recommended brand in the {runStatus?.brand || 'industry'} category</p>
              </div>
            );
          }

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

        {/* Top Result Rate / Competitive Fragmentation Score / Platform Consensus Card */}
        {(() => {
          if (isIssue) {
            // Platform Consensus — score/10 display (reuse Market Spread layout)
            const score = overviewMetrics?.platformConsensus ?? 5;
            const getConsensusLabel = (s: number) => {
              if (s <= 2) return 'Highly divided';
              if (s <= 4) return 'Mostly divided';
              if (s <= 6) return 'Mixed views';
              if (s <= 8) return 'Mostly aligned';
              return 'Strong consensus';
            };
            const getConsensusTone = (s: number): 'success' | 'neutral' | 'warn' => {
              if (s <= 3) return 'warn';
              if (s <= 6) return 'neutral';
              return 'success';
            };
            const getConsensusColor = (s: number) => {
              if (s <= 2) return '#f97316';
              if (s <= 4) return '#eab308';
              if (s <= 6) return '#6b7280';
              if (s <= 8) return '#111827';
              return '#111827';
            };
            return (
              <div className={`rounded-2xl shadow-sm border p-5 flex flex-col h-[270px] ${metricCardBackgrounds.top1Rate}`}>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-semibold text-gray-800 tracking-wide uppercase">Platform Consensus</p>
                  <div className="relative group">
                    <button
                      className="p-1 rounded-full hover:bg-gray-100 transition-colors"
                      aria-label="Learn more about Platform Consensus"
                      tabIndex={0}
                    >
                      <HelpCircle className="w-4 h-4 text-gray-400" />
                    </button>
                    <div className="absolute right-0 top-full mt-1 w-72 p-3 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all z-50 shadow-lg leading-relaxed">
                      <p className="font-semibold mb-1.5">How consistently AI platforms frame this issue</p>
                      <p className="mb-1.5">A high score means most platforms agree on the same framing. A low score means platforms have divergent perspectives.</p>
                      <p className="mb-1"><span className="font-medium">Scale:</span></p>
                      <p>1-2 Divided &bull; 3-4 Mostly divided &bull; 5-6 Mixed &bull; 7-8 Mostly aligned &bull; 9-10 Aligned</p>
                    </div>
                  </div>
                </div>
                {/* Score display */}
                <div className="h-[100px] flex flex-col justify-center items-center">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold tracking-tight tabular-nums" style={{ color: getConsensusColor(score) }}>{score}</span>
                    <span className="text-lg text-gray-400 font-medium">/ 10</span>
                  </div>
                  {/* Scale bar */}
                  <div className="mt-3 w-full">
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${score * 10}%`, backgroundColor: getConsensusColor(score) }} />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-[10px] text-gray-400">Divided</span>
                      <span className="text-[10px] text-gray-400">Aligned</span>
                    </div>
                  </div>
                </div>
                {/* Badge */}
                <div className="h-[28px] flex items-start mt-3">
                  <span className={`inline-block w-fit px-3 py-1 text-xs font-medium rounded-full ${getToneStyles(getConsensusTone(score))}`}>
                    {getConsensusLabel(score)}
                  </span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed mt-auto">Do AI platforms agree on how to frame {runStatus?.brand || 'this issue'}?</p>
              </div>
            );
          }

          if (isPublicFigure) {
            // Figure Prominence — this figure's mention rate vs avg competitor
            const prominence = overviewMetrics?.figureProminence || { figureRate: 0, avgCompetitorRate: 0 };
            const diff = prominence.figureRate - prominence.avgCompetitorRate;
            const prominenceLabel = diff >= 30 ? 'Dominant figure' : diff >= 10 ? 'Above average' : diff >= -10 ? 'On par with peers' : 'Below average';
            const prominenceTone: 'success' | 'neutral' | 'warn' = diff >= 10 ? 'success' : diff >= -10 ? 'neutral' : 'warn';
            return (
              <div className={`rounded-2xl shadow-sm border p-5 flex flex-col h-[270px] ${metricCardBackgrounds.top1Rate}`}>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-semibold text-gray-800 tracking-wide uppercase">Figure Prominence</p>
                  <div className="relative group">
                    <button className="p-1 rounded-full hover:bg-gray-100 transition-colors" aria-label="Learn more about Figure Prominence" tabIndex={0}>
                      <HelpCircle className="w-4 h-4 text-gray-400" />
                    </button>
                    <div className="absolute right-0 top-full mt-1 w-64 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all z-50 shadow-lg">
                      {runStatus?.brand || 'This figure'} is mentioned in {prominence.figureRate.toFixed(1)}% of AI responses, compared to an average of {prominence.avgCompetitorRate.toFixed(1)}% for similar figures.
                    </div>
                  </div>
                </div>
                <div className="h-[100px] flex flex-col justify-center items-center">
                  <span className="text-4xl font-bold tracking-tight tabular-nums text-gray-900">{prominence.figureRate.toFixed(0)}%</span>
                  <p className="text-sm text-gray-500 mt-1">vs {prominence.avgCompetitorRate.toFixed(0)}% avg for peers</p>
                  {/* Comparison bar */}
                  <div className="mt-3 w-full flex items-center gap-2">
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-gray-900 transition-all" style={{ width: `${Math.min(prominence.figureRate, 100)}%` }} />
                    </div>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-gray-300 transition-all" style={{ width: `${Math.min(prominence.avgCompetitorRate, 100)}%` }} />
                    </div>
                  </div>
                  <div className="w-full flex justify-between mt-1">
                    <span className="text-[10px] text-gray-500 font-medium">{runStatus?.brand || 'Figure'}</span>
                    <span className="text-[10px] text-gray-400">Avg peer</span>
                  </div>
                </div>
                <div className="h-[28px] flex items-start mt-3">
                  <span className={`inline-block w-fit px-3 py-1 text-xs font-medium rounded-full ${getToneStyles(prominenceTone)}`}>
                    {prominenceLabel}
                  </span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed mt-auto">Mention rate compared to similar figures</p>
              </div>
            );
          }

          if (isCategory) {
            // Brand mention donut chart for industry reports — use brandBreakdownStats for consistency
            const sorted = [...brandBreakdownStats].sort((a, b) => b.shareOfVoice - a.shareOfVoice);
            const MAX_SLICES = 6;
            const topBrands = sorted.slice(0, MAX_SLICES);
            const otherSov = sorted.slice(MAX_SLICES).reduce((sum, s) => sum + s.shareOfVoice, 0);
            const donutData = [
              ...topBrands.map(s => ({ name: s.brand, value: s.shareOfVoice })),
              ...(otherSov > 0 ? [{ name: 'Other', value: otherSov }] : []),
            ];
            const totalMentions = donutData.reduce((sum, d) => sum + d.value, 0);
            const DONUT_COLORS = ['#4285f4', '#10a37f', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#9ca3af'];

            return (
              <MarketSpreadDonut
                donutData={donutData}
                totalMentions={totalMentions}
                totalBrands={sorted.length}
                colors={DONUT_COLORS}
                cardClassName={metricCardBackgrounds.top1Rate}
              />
            );
          }

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
              <p className="text-xs text-gray-500 leading-relaxed mt-auto">How often {runStatus?.brand || 'your brand'} is the #1 result when mentioned</p>
            </div>
          );
        })()}

        {/* Avg. Position / Total Brands / Related Issues Card */}
        {(() => {
          if (isIssue) {
            // Related Issues — show top 3 most mentioned related issues
            const relatedCount = overviewMetrics?.relatedIssuesCount || 0;
            const topIssues: string[] = overviewMetrics?.topRelatedIssues || [];
            const relatedTone: 'success' | 'neutral' | 'warn' = relatedCount >= 5 ? 'success' : relatedCount >= 2 ? 'neutral' : 'warn';
            return (
              <div className={`rounded-2xl shadow-sm border p-5 flex flex-col h-[270px] ${metricCardBackgrounds.avgPosition}`}>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-semibold text-gray-800 tracking-wide uppercase">Related Issues</p>
                  <div className="relative group">
                    <button
                      className="p-1 rounded-full hover:bg-gray-100 transition-colors"
                      aria-label="Learn more about Related Issues"
                      tabIndex={0}
                    >
                      <HelpCircle className="w-4 h-4 text-gray-400" />
                    </button>
                    <div className="absolute right-0 top-full mt-1 w-64 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all z-50 shadow-lg">
                      {relatedCount} unique related issue{relatedCount !== 1 ? 's' : ''} mentioned across all AI responses about {runStatus?.brand || 'this issue'}.
                    </div>
                  </div>
                </div>
                <div className="h-[100px] flex flex-col justify-center">
                  {topIssues.length > 0 ? (
                    <div className="space-y-2">
                      {topIssues.map((issue, i) => (
                        <div key={issue} className="flex items-start gap-2.5" title={issue}>
                          <span className="w-5 h-5 rounded-full bg-gray-900 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                          <span className="text-sm font-medium text-gray-900 leading-tight line-clamp-2">{issue}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">No related issues found</p>
                  )}
                </div>
                <div className="h-[28px] flex items-start mt-3">
                  <span className={`inline-block w-fit px-3 py-1 text-xs font-medium rounded-full ${getToneStyles(relatedTone)}`}>
                    {relatedCount > 3 ? `+${relatedCount - 3} more` : relatedCount >= 2 ? 'Some context' : relatedCount === 1 ? 'Narrow focus' : 'No related issues'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed mt-auto">{relatedCount} related issue{relatedCount !== 1 ? 's' : ''} mentioned across AI responses</p>
              </div>
            );
          }

          if (isPublicFigure) {
            // Platform Agreement — how consistently AI platforms portray this figure
            const score = overviewMetrics?.platformAgreement ?? 5;
            const getAgreementLabel = (s: number) => {
              if (s <= 2) return 'Highly divided';
              if (s <= 4) return 'Mostly divided';
              if (s <= 6) return 'Mixed views';
              if (s <= 8) return 'Mostly aligned';
              return 'Strong consensus';
            };
            const getAgreementTone = (s: number): 'success' | 'neutral' | 'warn' => {
              if (s <= 3) return 'warn';
              if (s <= 6) return 'neutral';
              return 'success';
            };
            const getAgreementColor = (s: number) => {
              if (s <= 2) return '#f97316';
              if (s <= 4) return '#eab308';
              if (s <= 6) return '#6b7280';
              return '#111827';
            };
            return (
              <div className={`rounded-2xl shadow-sm border p-5 flex flex-col h-[270px] ${metricCardBackgrounds.avgPosition}`}>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-semibold text-gray-800 tracking-wide uppercase">Platform Agreement</p>
                  <div className="relative group">
                    <button className="p-1 rounded-full hover:bg-gray-100 transition-colors" aria-label="Learn more about Platform Agreement" tabIndex={0}>
                      <HelpCircle className="w-4 h-4 text-gray-400" />
                    </button>
                    <div className="absolute right-0 top-full mt-1 w-72 p-3 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all z-50 shadow-lg leading-relaxed">
                      <p className="font-semibold mb-1.5">How consistently AI platforms portray this figure</p>
                      <p className="mb-1.5">A high score means most platforms have similar sentiment. A low score means platforms disagree on how to portray {runStatus?.brand || 'this figure'}.</p>
                      <p><span className="font-medium">Scale:</span> 1-2 Divided &bull; 3-4 Mostly divided &bull; 5-6 Mixed &bull; 7-8 Mostly aligned &bull; 9-10 Aligned</p>
                    </div>
                  </div>
                </div>
                <div className="h-[100px] flex flex-col justify-center items-center">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold tracking-tight tabular-nums" style={{ color: getAgreementColor(score) }}>{score}</span>
                    <span className="text-lg text-gray-400 font-medium">/ 10</span>
                  </div>
                  <div className="mt-3 w-full">
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${score * 10}%`, backgroundColor: getAgreementColor(score) }} />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-[10px] text-gray-400">Divided</span>
                      <span className="text-[10px] text-gray-400">Aligned</span>
                    </div>
                  </div>
                </div>
                <div className="h-[28px] flex items-start mt-3">
                  <span className={`inline-block w-fit px-3 py-1 text-xs font-medium rounded-full ${getToneStyles(getAgreementTone(score))}`}>
                    {getAgreementLabel(score)}
                  </span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed mt-auto">Do AI platforms agree on how to portray {runStatus?.brand || 'this figure'}?</p>
              </div>
            );
          }

          if (isCategory) {
            // Use brandBreakdownStats for consistency (already filters excluded brands)
            const totalBrands = brandBreakdownStats.length;
            const brandsTone: 'success' | 'neutral' | 'warn' = totalBrands >= 8 ? 'success' : totalBrands >= 4 ? 'neutral' : 'warn';
            return (
              <div style={{ order: 1 }} className={`rounded-2xl shadow-sm border p-5 flex flex-col h-[270px] ${metricCardBackgrounds.avgPosition}`}>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-semibold text-gray-800 tracking-wide uppercase">Total Brands</p>
                  <div className="relative group">
                    <button
                      className="p-1 rounded-full hover:bg-gray-100 transition-colors"
                      aria-label="Learn more about Total Brands"
                      tabIndex={0}
                    >
                      <HelpCircle className="w-4 h-4 text-gray-400" />
                    </button>
                    <div className="absolute right-0 top-full mt-1 w-64 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all z-50 shadow-lg">
                      {totalBrands} unique brand{totalBrands !== 1 ? 's' : ''} mentioned across all AI responses for {runStatus?.brand || 'this category'}.
                    </div>
                  </div>
                </div>
                <div className="h-[100px] flex items-center justify-center">
                  <span className="text-5xl font-bold tracking-tight tabular-nums text-gray-900">
                    {totalBrands}
                  </span>
                </div>
                <div className="h-[28px] flex items-start mt-3">
                  <span className={`inline-block w-fit px-3 py-1 text-xs font-medium rounded-full ${getToneStyles(brandsTone)}`}>
                    {totalBrands >= 8 ? 'Highly competitive' : totalBrands >= 4 ? 'Moderately competitive' : 'Low competition'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed mt-auto">Unique brands mentioned across all AI responses</p>
              </div>
            );
          }

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
              <p className="text-xs text-gray-500 leading-relaxed mt-auto">
                {`${runStatus?.brand || 'Your brand'}'s average ranking when mentioned`}
              </p>
            </div>
          );
        })()}
      </div>}

      {/* AI Summary */}
      {showSection('ai-summary') && <div id="overview-ai-analysis" className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl shadow-sm border border-blue-100 p-6">
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
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{(() => {
              let text = removeActionableTakeaway(aiSummary.summary).replace(/\bai_overviews\b/gi, 'Google AI Overviews');
              if (isCategory && brandBreakdownStats.length > 0) {
                const leader = brandBreakdownStats[0];
                const stats = `, with a ${leader.shareOfVoice.toFixed(1)}% share of all mentions (% of total brand mentions captured by this brand) and a ${leader.visibilityScore.toFixed(1)}% visibility score`;
                text = text.replace(/(Market leader\s*[-–—]\s*[^.]+)(\.)/i, `$1${stats}$2`);

                // Replace backend-generated percentages for known brands with frontend values
                const brandStatsMap = new Map(brandBreakdownStats.map(b => [b.brand.toLowerCase(), b]));
                for (const [, bStat] of brandStatsMap) {
                  const brandEscaped = bStat.brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                  // "Brand: X/Y (Z%)" or "Brand X/Y (Z%)"
                  text = text.replace(
                    new RegExp(`(${brandEscaped})([:\\s]+)\\d+/\\d+\\s*\\(\\d+\\.?\\d*%\\)`, 'gi'),
                    `$1$2${bStat.mentioned}/${bStat.total} (${bStat.visibilityScore.toFixed(1)}%)`
                  );
                  // "Brand (Z% ...)" — percentage inside parens right after brand
                  text = text.replace(
                    new RegExp(`(${brandEscaped}\\s*\\()\\d+\\.?\\d*(%)`, 'gi'),
                    `$1${bStat.visibilityScore.toFixed(1)}$2`
                  );
                  // "Brand ...with/at/has a Z%" — percentage near brand in flowing text
                  text = text.replace(
                    new RegExp(`(${brandEscaped}[^.]*?(?:with|at|has|leads?|captures?|achieves?|shows?|reaches?|holds?|commands?)[^.]*?)\\b\\d+\\.?\\d*(%\\s*(?:mention rate|visibility score|of (?:all )?(?:AI )?responses))`, 'gi'),
                    `$1${bStat.visibilityScore.toFixed(1)}$2`
                  );
                }

                // Replace "Total Unique Brands Mentioned: X" or "X unique brands" with frontend count
                text = text.replace(/\b\d+\s+unique\s+brands?\b/gi, `${brandBreakdownStats.length} unique brands`);
                text = text.replace(/(Total\s+Unique\s+Brands?\s*(?:Mentioned)?[:\s]+)\d+/gi, `$1${brandBreakdownStats.length}`);

                // Also replace any "mention rate" from backend-generated text with "visibility score"
                text = text.replace(/mention rates?/gi, 'visibility score');

                // Add definition for only the first "visibility score" not already followed by a parenthetical
                let visibilityScoreDefined = false;
                text = text.replace(/visibility scores?(?!\s*\()/gi, () => {
                  if (!visibilityScoreDefined) {
                    visibilityScoreDefined = true;
                    return 'visibility score (% of AI responses that mention the brand)';
                  }
                  return 'visibility score';
                });
              }
              // Vary repeated "suggest/suggests" usage
              const alternatives = ['indicates', 'points to', 'reflects'];
              let altIdx = 0;
              let count = 0;
              text = text.replace(/\b(suggests?)\b/gi, (match) => {
                count++;
                if (count === 1) return match; // keep the first occurrence
                return alternatives[(altIdx++) % alternatives.length];
              });
              return text;
            })()}</ReactMarkdown>
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
      </div>}

      {/* Remaining sections — paywalled for partial access */}
      <PaywallOverlay locked={accessLevel === 'partial'} message="Upgrade to Pro to see brand quotes, prompt breakdowns, platform analysis, and full results.">
      {accessLevel === 'partial' ? (
        <div className="space-y-6">
          <PlaceholderChart type="bar" height={200} />
          <PlaceholderTable rows={4} columns={5} />
          <PlaceholderChart type="scatter" height={200} />
        </div>
      ) : (
      <>
      {/* Platform Framing Comparison (issue search type) */}
      {showSection('framing-comparison') && isIssue && overviewMetrics?.framingByProvider && Object.keys(overviewMetrics.framingByProvider).length > 0 && (
        <div id="overview-framing-comparison" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-gray-700" />
              <h2 className="text-lg font-semibold text-gray-900">Platform Framing Comparison</h2>
            </div>
            <select
              value={framingPromptFilter}
              onChange={(e) => setFramingPromptFilter(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent max-w-[280px] truncate"
            >
              <option value="all">All Questions</option>
              {availablePrompts.map((prompt) => (
                <option key={prompt} value={prompt}>{truncate(prompt, 50)}</option>
              ))}
            </select>
          </div>
          <p className="text-sm text-gray-500 mb-5">How each AI platform frames {runStatus?.brand || 'this issue'}</p>
          <div className="space-y-3">
            {Object.entries(filteredFramingByProvider as Record<string, Record<string, number>>).map(([provider, framingCounts]) => {
              const total = Object.values(framingCounts).reduce((a, b) => a + b, 0);
              if (total === 0) return null;
              // Collapse into 3 groups: Supportive, Balanced, Critical
              const supportive = (framingCounts['Supportive'] || 0) + (framingCounts['Leaning Supportive'] || 0);
              const balanced = framingCounts['Balanced'] || 0;
              const critical = (framingCounts['Mixed'] || 0) + (framingCounts['Critical'] || 0);
              const segments = [
                { label: 'Supportive', count: supportive, color: '#10b981' },
                { label: 'Balanced', count: balanced, color: '#9ca3af' },
                { label: 'Critical', count: critical, color: '#f87171' },
              ].filter(s => s.count > 0);
              return (
                <div key={provider} className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-700 w-32 truncate flex-shrink-0" title={getProviderLabel(provider)}>{getProviderLabel(provider)}</span>
                  <div className="flex-1 flex h-7 rounded-md overflow-hidden">
                    {segments.map((seg) => {
                      const pct = (seg.count / total) * 100;
                      return (
                        <div
                          key={seg.label}
                          className="flex items-center justify-center text-xs font-medium text-white relative group/seg"
                          style={{ width: `${pct}%`, backgroundColor: seg.color, minWidth: pct > 0 ? '28px' : '0px' }}
                        >
                          {pct >= 20 && <span>{seg.label} {pct.toFixed(0)}%</span>}
                          <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 invisible group-hover/seg:opacity-100 group-hover/seg:visible transition-all z-50 whitespace-nowrap">
                            {seg.label}: {seg.count} response{seg.count !== 1 ? 's' : ''} ({pct.toFixed(0)}%)
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Legend */}
          <div className="flex items-center gap-4 mt-4 text-xs text-gray-500">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#10b981' }} /> Supportive</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#9ca3af' }} /> Balanced</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#f87171' }} /> Critical</span>
          </div>
        </div>
      )}

      {/* Framing Spectrum — beeswarm showing every response as a dot */}
      {showSection('framing-spectrum') && isIssue && (() => {
        const SENTIMENT_SCORE: Record<string, number> = {
          strong_endorsement: 5,
          positive_endorsement: 4,
          neutral_mention: 3,
          conditional: 2,
          negative_comparison: 1,
        };
        const dots = globallyFilteredResults
          .filter((r: Result) => !r.error && r.brand_sentiment && r.brand_sentiment !== 'not_mentioned')
          .map((r: Result) => ({
            score: SENTIMENT_SCORE[r.brand_sentiment || ''] || 3,
            provider: r.provider,
            prompt: r.prompt,
            id: r.id,
          }));
        if (dots.length === 0) return null;

        // Beeswarm layout: bucket by score, stack vertically within each bucket
        const CHART_WIDTH = 800;
        const CHART_HEIGHT = 220;
        const MARGIN = { left: 40, right: 40, top: 20, bottom: 50 };
        const plotW = CHART_WIDTH - MARGIN.left - MARGIN.right;
        const plotH = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;
        const DOT_R = 6;
        const DOT_SPACING = DOT_R * 2 + 2;

        // Map score (1-5) → x position
        const xScale = (score: number) => MARGIN.left + ((score - 1) / 4) * plotW;
        const centerY = MARGIN.top + plotH / 2;

        // Group dots by score, then lay them out vertically
        const buckets: Record<number, typeof dots> = {};
        dots.forEach(d => {
          const bucket = d.score;
          if (!buckets[bucket]) buckets[bucket] = [];
          buckets[bucket].push(d);
        });

        const positioned = Object.entries(buckets).flatMap(([scoreStr, group]) => {
          const score = Number(scoreStr);
          const cx = xScale(score);
          return group.map((d, i) => {
            // Spread from center: 0, -1, 1, -2, 2, ...
            const offset = i % 2 === 0 ? -(Math.floor(i / 2)) : Math.ceil(i / 2);
            const cy = centerY + offset * DOT_SPACING;
            return { ...d, cx, cy };
          });
        });

        const labels = [
          { score: 1, label: 'Critical' },
          { score: 2, label: 'Mixed' },
          { score: 3, label: 'Balanced' },
          { score: 4, label: 'Leaning\nSupportive' },
          { score: 5, label: 'Supportive' },
        ];

        // Provider legend — sorted by popularity
        const providersInData = Array.from(new Set(dots.map(d => d.provider)))
          .sort((a, b) => {
            const ai = PROVIDER_ORDER.indexOf(a);
            const bi = PROVIDER_ORDER.indexOf(b);
            return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
          });

        return (
          <div id="overview-framing-spectrum" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Framing Spectrum</h2>
              <p className="text-sm text-gray-500 mt-1">
                Every AI response as a dot — positioned by how supportively or critically it frames {runStatus?.brand || 'the issue'}. Color indicates the AI platform.
              </p>
            </div>
            {/* Platform legend */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3">
              {providersInData.map(p => (
                <div key={p} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getProviderBrandColor(p) }} />
                  <span className="text-xs text-gray-500">{getProviderLabel(p)}</span>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto">
              <svg width={CHART_WIDTH} height={CHART_HEIGHT} className="mx-auto" style={{ maxWidth: '100%' }}>
                {/* Background zones */}
                <rect x={MARGIN.left} y={MARGIN.top} width={plotW * 0.4} height={plotH} fill="#fef2f2" rx={4} opacity={0.5} />
                <rect x={MARGIN.left + plotW * 0.4} y={MARGIN.top} width={plotW * 0.2} height={plotH} fill="#f9fafb" rx={0} opacity={0.5} />
                <rect x={MARGIN.left + plotW * 0.6} y={MARGIN.top} width={plotW * 0.4} height={plotH} fill="#f0fdf4" rx={4} opacity={0.5} />

                {/* Grid lines at each score */}
                {[1, 2, 3, 4, 5].map(s => (
                  <line key={s} x1={xScale(s)} y1={MARGIN.top} x2={xScale(s)} y2={MARGIN.top + plotH} stroke="#e5e7eb" strokeDasharray="3 3" />
                ))}

                {/* Dots */}
                {positioned.map((d, i) => (
                  <circle
                    key={i}
                    cx={d.cx}
                    cy={d.cy}
                    r={DOT_R}
                    fill={getProviderBrandColor(d.provider)}
                    opacity={0.8}
                    stroke="white"
                    strokeWidth={1}
                    style={{ cursor: 'pointer' }}
                  >
                    <title>{`${getProviderLabel(d.provider)}: ${labels.find(l => l.score === d.score)?.label?.replace('\n', ' ') || ''}\n${d.prompt.length > 60 ? d.prompt.substring(0, 58) + '...' : d.prompt}`}</title>
                  </circle>
                ))}

                {/* X-axis labels */}
                {labels.map(({ score, label }) => (
                  <text
                    key={score}
                    x={xScale(score)}
                    y={CHART_HEIGHT - 12}
                    textAnchor="middle"
                    fill="#6b7280"
                    fontSize={11}
                    fontWeight={500}
                  >
                    {label.includes('\n') ? (
                      <>
                        <tspan x={xScale(score)} dy="0">{label.split('\n')[0]}</tspan>
                        <tspan x={xScale(score)} dy="13">{label.split('\n')[1]}</tspan>
                      </>
                    ) : label}
                  </text>
                ))}

                {/* Axis line */}
                <line x1={MARGIN.left} y1={MARGIN.top + plotH} x2={MARGIN.left + plotW} y2={MARGIN.top + plotH} stroke="#d1d5db" strokeWidth={1} />

                {/* Zone labels */}
                <text x={MARGIN.left + plotW * 0.2} y={MARGIN.top + 14} textAnchor="middle" fill="#ef4444" fontSize={10} fontWeight={500} opacity={0.6}>Critical</text>
                <text x={MARGIN.left + plotW * 0.5} y={MARGIN.top + 14} textAnchor="middle" fill="#6b7280" fontSize={10} fontWeight={500} opacity={0.6}>Neutral</text>
                <text x={MARGIN.left + plotW * 0.8} y={MARGIN.top + 14} textAnchor="middle" fill="#22c55e" fontSize={10} fontWeight={500} opacity={0.6}>Supportive</text>
              </svg>
            </div>
            <p className="text-xs text-gray-400 italic text-center mt-1">Each dot is one AI response {'\u2022'} Hover for details</p>
          </div>
        );
      })()}

      {/* Framing Evidence (issue search type) */}
      {showSection('framing-evidence') && isIssue && (Object.values(framingEvidenceGroups).some(g => g.length > 0)) && (
        <div id="overview-framing-evidence" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-1">
            <HelpCircle className="w-5 h-5 text-gray-700" />
            <h2 className="text-lg font-semibold text-gray-900">Key Perspectives on {runStatus?.brand || 'This Issue'}</h2>
          </div>
          <p className="text-sm text-gray-500 mb-5">How AI platforms frame this issue — grouped by supportive, balanced, and critical perspectives</p>
          <div className="space-y-3">
            {([
              { key: 'Supportive', color: '#10b981', dotClass: 'bg-emerald-500' },
              { key: 'Balanced', color: '#9ca3af', dotClass: 'bg-gray-400' },
              { key: 'Critical', color: '#f87171', dotClass: 'bg-red-400' },
            ] as const).map(({ key, color, dotClass }) => {
              const items = framingEvidenceGroups[key] || [];
              if (items.length === 0) return null;
              const isExpanded = framingEvidenceExpanded.has(key);
              const showAll = framingEvidenceShowAll.has(key);
              const visibleItems = showAll ? items : items.slice(0, 3);
              return (
                <div key={key} className="border border-gray-100 rounded-lg overflow-hidden">
                  {/* Accordion header */}
                  <button
                    onClick={() => {
                      const next = new Set(framingEvidenceExpanded);
                      if (next.has(key)) next.delete(key); else next.add(key);
                      setFramingEvidenceExpanded(next);
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotClass}`} />
                      <span className="text-sm font-semibold text-gray-900">{key}</span>
                      <span className="text-xs text-gray-400 font-normal">{items.length} response{items.length !== 1 ? 's' : ''}</span>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </button>
                  {/* Accordion content */}
                  {isExpanded && (
                    <div className="border-t border-gray-100">
                      <div className="divide-y divide-gray-50">
                        {visibleItems.map((item, idx) => (
                          <div key={idx} className="px-4 py-3">
                            <p className="text-sm text-gray-700 leading-relaxed italic">&ldquo;{item.excerpt}&rdquo;</p>
                            <p className="text-xs text-gray-400 mt-0.5 truncate flex items-center gap-1.5">— {getProviderLabel(item.provider)} <span className="inline-block w-1 h-1 rounded-full bg-gray-400 flex-shrink-0" /> {item.prompt}</p>
                          </div>
                        ))}
                      </div>
                      {items.length > 3 && (
                        <button
                          onClick={() => {
                            const next = new Set(framingEvidenceShowAll);
                            if (next.has(key)) next.delete(key); else next.add(key);
                            setFramingEvidenceShowAll(next);
                          }}
                          className="w-full px-4 py-2.5 text-xs font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors border-t border-gray-100 text-center"
                        >
                          {showAll ? 'Show fewer' : `Show all ${items.length} responses`}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* What AI Says About [Brand] — hidden for issues (replaced by framing-evidence) */}
      {showSection('brand-quotes') && !isIssue && brandQuotes.length > 0 && (
        <div id="overview-brand-quotes" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="w-5 h-5 text-gray-700" />
            <h2 className="text-lg font-semibold text-gray-900">
              {isIssue ? `Key Perspectives on ${runStatus?.brand || 'This Issue'}` : `What AI Says About ${runStatus?.brand}`}
            </h2>
          </div>
          <div className="space-y-2.5">
            {brandQuotes.slice(0, isIssue ? 3 : 2).map((quote, idx) => {
              // Strip citation markers and redundant leading "Brand: " prefix
              const brandName = runStatus?.brand || '';
              const cleanedText = quote.text
                .replace(/\[\d+\]/g, '')
                .replace(/\s{2,}/g, ' ')
                .trim()
                .replace(new RegExp('^' + brandName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*[:–—-]\\s*', 'i'), '');
              const providerLabel = { openai: 'ChatGPT', anthropic: 'Claude', perplexity: 'Perplexity', gemini: 'Gemini', ai_overviews: 'Google AI', grok: 'Grok', llama: 'Llama' }[quote.provider] || quote.provider;
              return (
                <div key={idx}>
                  <p className="text-sm text-gray-700 leading-relaxed italic">&ldquo;{cleanedText}&rdquo;</p>
                  <p className="text-xs text-gray-400 mt-0.5 truncate flex items-center gap-1.5">— {providerLabel} <span className="inline-block w-1 h-1 rounded-full bg-gray-400 flex-shrink-0" /> {quote.prompt}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Prompt Breakdown Table */}
      {showSection('prompt-breakdown') && promptBreakdownStats.length > 0 && (
        <div id="overview-by-question" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{isIssue ? 'Coverage by Question' : 'Results by Question'}</h2>
              <p className="text-sm text-gray-500 mt-1">
                {isPublicFigure
                  ? `How AI platforms portray ${runStatus?.brand || 'this figure'} across each question`
                  : isIssue
                  ? `How AI platforms cover ${runStatus?.brand || 'this issue'} across each question`
                  : isCategory
                  ? `How the market leader performs across each question about ${runStatus?.brand}`
                  : `How ${runStatus?.brand} performs across each question asked to AI`
                }
              </p>
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
          {isPublicFigure ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-3 text-sm font-medium text-gray-600">Question</th>
                  <th className="text-center py-3 px-3 text-sm font-medium text-gray-600">
                    <div className="flex items-center justify-center gap-1">
                      <span className="whitespace-nowrap">AI Portrayal</span>
                      <div className="relative group">
                        <HelpCircle className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-48 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 shadow-lg text-left font-normal">
                          Overall portrayal score (-100 to +100) based on AI sentiment for this question
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-gray-400 font-normal">score</div>
                  </th>
                  <th className="text-center py-3 px-3 text-sm font-medium text-gray-600">
                    <div className="flex items-center justify-center gap-1">
                      <span className="whitespace-nowrap">Sentiment Polarity</span>
                      <div className="relative group">
                        <HelpCircle className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-48 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 shadow-lg text-left font-normal">
                          Split between positive, neutral, and negative AI responses for this question
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-gray-400 font-normal">positive vs negative</div>
                  </th>
                  <th className="text-center py-3 px-3 text-sm font-medium text-gray-600">
                    <div className="flex items-center justify-center gap-1">
                      <span className="whitespace-nowrap">Prominence</span>
                      <div className="relative group">
                        <HelpCircle className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-48 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 shadow-lg text-left font-normal">
                          This figure&apos;s mention rate vs average peer mention rate for this question
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-gray-400 font-normal">vs peers</div>
                  </th>
                  <th className="text-center py-3 px-3 text-sm font-medium text-gray-600">
                    <div className="flex items-center justify-center gap-1">
                      <span className="whitespace-nowrap">Agreement</span>
                      <div className="relative group">
                        <HelpCircle className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-48 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 shadow-lg text-left font-normal">
                          How consistently AI platforms portray this figure for this question (1-10)
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-gray-400 font-normal">platform / 10</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {promptBreakdownStats.map((stat, index) => {
                  const pScore = stat.pfPortrayalScore ?? 0;
                  const pSplit = stat.pfSentimentSplit || { positive: 0, neutral: 0, negative: 0 };
                  const pProm = stat.pfFigureProminence || { figureRate: 0, avgCompetitorRate: 0 };
                  const pAgree = stat.pfPlatformAgreement ?? 5;
                  const scoreColor = pScore >= 15 ? 'text-emerald-600' : pScore >= -15 ? 'text-gray-600' : 'text-red-500';
                  const agreeColor = pAgree >= 7 ? 'text-gray-900' : pAgree >= 4 ? 'text-yellow-600' : 'text-red-500';
                  const promDiff = pProm.figureRate - pProm.avgCompetitorRate;
                  const promColor = promDiff >= 10 ? 'text-emerald-600' : promDiff >= -10 ? 'text-gray-600' : 'text-red-500';

                  return (
                    <tr key={stat.prompt} className={index % 2 === 0 ? 'bg-gray-50' : ''}>
                      <td className="py-3 px-3 max-w-[300px]">
                        <span className="text-gray-900 line-clamp-2" title={stat.prompt}>{stat.prompt}</span>
                      </td>
                      {/* AI Portrayal score */}
                      <td className="text-center py-3 px-3">
                        <span className={`font-semibold ${scoreColor}`}>{pScore >= 0 ? '+' : ''}{pScore}</span>
                      </td>
                      {/* Sentiment Polarity mini bar */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5 justify-center min-w-[100px]">
                          <span className="text-xs font-medium text-emerald-600 w-8 text-right">{pSplit.positive}%</span>
                          <div className="w-16 h-2 rounded-full overflow-hidden flex bg-gray-100">
                            {pSplit.positive > 0 && <div className="h-full" style={{ width: `${pSplit.positive}%`, backgroundColor: '#10b981' }} />}
                            {pSplit.neutral > 0 && <div className="h-full" style={{ width: `${pSplit.neutral}%`, backgroundColor: '#d1d5db' }} />}
                            {pSplit.negative > 0 && <div className="h-full" style={{ width: `${pSplit.negative}%`, backgroundColor: '#f87171' }} />}
                          </div>
                          <span className="text-xs font-medium text-red-400 w-8 text-left">{pSplit.negative}%</span>
                        </div>
                      </td>
                      {/* Figure Prominence */}
                      <td className="text-center py-3 px-3">
                        <span className={`font-medium ${promColor}`}>{pProm.figureRate.toFixed(0)}%</span>
                        <span className="text-xs text-gray-400 ml-1">vs {pProm.avgCompetitorRate.toFixed(0)}%</span>
                      </td>
                      {/* Platform Agreement */}
                      <td className="text-center py-3 px-3">
                        <span className={`font-medium ${agreeColor}`}>{pAgree}/10</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          ) : isIssue ? (
          <div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-3 text-sm font-medium text-gray-600">Question</th>
                  <th className="text-center py-3 px-3 text-sm font-medium text-gray-600">
                    <div className="flex items-center justify-center gap-1">
                      <span className="whitespace-nowrap">Polarity</span>
                      <div className="relative group">
                        <HelpCircle className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-48 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 shadow-lg text-left font-normal">
                          Ratio of supportive vs critical AI responses for this question
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-gray-400 font-normal">supportive vs critical</div>
                  </th>
                  <th className="text-center py-3 px-3 text-sm font-medium text-gray-600">
                    <div className="flex items-center justify-center gap-1">
                      <span className="whitespace-nowrap">Dominant Framing</span>
                      <div className="relative group">
                        <HelpCircle className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-48 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 shadow-lg text-left font-normal">
                          The most common framing of {runStatus?.brand || 'this issue'} in AI responses for this question
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-gray-400 font-normal">most common</div>
                  </th>
                  <th className="text-center py-3 px-3 text-sm font-medium text-gray-600">
                    <div className="flex items-center justify-center gap-1">
                      <span className="whitespace-nowrap">Consensus</span>
                      <div className="relative group">
                        <HelpCircle className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-48 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 shadow-lg text-left font-normal">
                          How consistently AI platforms agree on framing for this question (1-10)
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-gray-400 font-normal">agreement / 10</div>
                  </th>
                  <th className="text-center py-3 px-3 text-sm font-medium text-gray-600">
                    <div className="flex items-center justify-center gap-1">
                      <span className="whitespace-nowrap">Related Issues</span>
                      <div className="relative group">
                        <HelpCircle className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-48 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 shadow-lg text-left font-normal">
                          Number of related issues mentioned in AI responses for this question
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-gray-400 font-normal">count</div>
                  </th>
                  <th className="text-center py-3 px-3 text-sm font-medium text-gray-600">
                    <div className="flex items-center justify-center gap-1">
                      <span className="whitespace-nowrap">Sentiment</span>
                      <div className="relative group">
                        <HelpCircle className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-48 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 shadow-lg text-left font-normal">
                          Average sentiment toward {runStatus?.brand || 'this issue'} in AI responses for this question
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
                  const sPct = stat.issueSupportivePct ?? 0;
                  const cPct = stat.issueCriticalPct ?? 0;
                  const framingLabel = stat.issueDominantFraming ?? 'Balanced';
                  const consensus = stat.issueConsensus ?? 5;
                  const related = stat.issueRelatedCount ?? 0;
                  // Framing color
                  const framingColor = (framingLabel === 'Supportive' || framingLabel === 'Leaning Supportive') ? 'text-emerald-600'
                    : framingLabel === 'Balanced' ? 'text-gray-600'
                    : 'text-red-500';
                  // Consensus color
                  const consensusColor = consensus >= 7 ? 'text-gray-900' : consensus >= 4 ? 'text-yellow-600' : 'text-red-500';

                  return (
                    <tr key={stat.prompt} className={index % 2 === 0 ? 'bg-gray-50' : ''}>
                      <td className="py-3 px-3 max-w-[300px]">
                        <span className="text-gray-900 line-clamp-2" title={stat.prompt}>{stat.prompt}</span>
                      </td>
                      {/* Discussion Polarity — mini bar */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5 justify-center min-w-[100px]">
                          <span className="text-xs font-medium text-emerald-600 w-8 text-right">{sPct.toFixed(0)}%</span>
                          <div className="w-16 h-2 rounded-full overflow-hidden flex bg-gray-100">
                            {sPct > 0 && <div className="h-full" style={{ width: `${sPct}%`, backgroundColor: '#10b981' }} />}
                            {(100 - sPct - cPct) > 0 && <div className="h-full" style={{ width: `${100 - sPct - cPct}%`, backgroundColor: '#d1d5db' }} />}
                            {cPct > 0 && <div className="h-full" style={{ width: `${cPct}%`, backgroundColor: '#f87171' }} />}
                          </div>
                          <span className="text-xs font-medium text-red-400 w-8 text-left">{cPct.toFixed(0)}%</span>
                        </div>
                      </td>
                      {/* Dominant Framing */}
                      <td className="text-center py-3 px-3">
                        <span className={`font-medium ${framingColor}`}>{framingLabel}</span>
                      </td>
                      {/* Platform Consensus */}
                      <td className="text-center py-3 px-3">
                        <span className={`font-medium ${consensusColor}`}>{consensus}/10</span>
                      </td>
                      {/* Related Issues */}
                      <td className="text-center py-3 px-3">
                        <span className={`font-medium ${related >= 3 ? 'text-gray-900' : related >= 1 ? 'text-gray-600' : 'text-gray-400'}`}>{related}</span>
                      </td>
                      {/* Sentiment */}
                      <td className="text-center py-3 px-3">
                        <span className={`font-medium ${getSentimentColor(stat.avgSentimentScore)}`}>{getSentimentLabel(stat.avgSentimentScore)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          ) : (
          <div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-3 text-sm font-medium text-gray-600">Question</th>
                  <th className="text-center py-3 px-3 text-sm font-medium text-gray-600">
                    <div className="flex items-center justify-center gap-1">
                      <span className="whitespace-nowrap">{isCategory ? 'Avg. Brands' : 'AI Visibility'}</span>
                      <div className="relative group">
                        <HelpCircle className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-48 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 shadow-lg text-left font-normal">
                          {isCategory
                            ? `Average number of brands surfaced per AI response for this question`
                            : `% of AI responses that mention ${runStatus?.brand || 'your brand'} for this question`
                          }
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-gray-400 font-normal">% mentioned</div>
                  </th>
                  <th className="text-center py-3 px-3 text-sm font-medium text-gray-600">
                    <div className="flex items-center justify-center gap-1">
                      <span className="whitespace-nowrap">{isCategory ? 'Leader Share' : 'Share of Voice'}</span>
                      <div className="relative group">
                        <HelpCircle className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-48 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 shadow-lg text-left font-normal">
                          {isCategory
                            ? `Market leader's share of all brand mentions for this question`
                            : `${runStatus?.brand || 'Your brand'}'s share of all brand mentions for this question`
                          }
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
                          {isCategory
                            ? `How often the market leader is the #1 recommendation for this question`
                            : `How often ${runStatus?.brand || 'your brand'} is the #1 recommended result for this question`
                          }
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
                          {isCategory
                            ? `Average ranking position of the market leader for this question (lower is better)`
                            : `Average ranking position when ${runStatus?.brand || 'your brand'} appears (lower is better)`
                          }
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
                          {isCategory
                            ? `How positively AI describes the market leader when mentioned (from "Negative" to "Strong")`
                            : `How positively AI describes ${runStatus?.brand || 'your brand'} when mentioned (from "Negative" to "Strong")`
                          }
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
          )}
        </div>
      )}

      {/* AI Brand Position by Platform */}
      {showSection('position-chart') && Object.keys(positionByPlatformData).length > 0 && (
        <div id="overview-by-platform-chart" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-gray-900">{isCategory ? 'Brand Landscape by Platform' : 'AI Brand Position by Platform'}</h2>
                <div className="relative group">
                  <button
                    className="p-1 rounded-full hover:bg-gray-100 transition-colors"
                    aria-label={`Learn more about ${isCategory ? 'Brand Landscape' : 'AI Brand Position'}`}
                    tabIndex={0}
                  >
                    <HelpCircle className="w-4 h-4 text-gray-400" />
                  </button>
                  <div className="absolute left-0 top-full mt-1 w-64 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all z-50 shadow-lg">
                    {isCategory
                      ? `Shows how brands in the ${runStatus?.brand || 'category'} space are positioned across different AI platforms${showSentimentColors ? ', colored by sentiment' : ''}.`
                      : `Shows where your brand appears in AI responses across different platforms${showSentimentColors ? ', colored by sentiment' : ''}.`
                    }
                  </div>
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                {isCategory
                  ? positionChartBrandFilter === '__all__'
                    ? `Average position score across all brands by platform and prompt`
                    : `How AI platforms rank ${positionChartBrandFilter} by platform and prompt`
                  : `How often ${runStatus?.brand} ranks in each position across AI platforms`
                }
              </p>
            </div>
            <div className="flex items-center gap-3">
              {isCategory && positionChartBrandOptions.length > 0 && (
                <select
                  value={positionChartBrandFilter}
                  onChange={(e) => setPositionChartBrandFilter(e.target.value)}
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                >
                  {positionChartBrandOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
              {isPublicFigure && availablePrompts.length > 1 && (
                <select
                  value={positionChartPromptFilter}
                  onChange={(e) => setPositionChartPromptFilter(e.target.value)}
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent max-w-[220px]"
                >
                  <option value="__all__">All Questions</option>
                  {availablePrompts.map((prompt) => (
                    <option key={prompt} value={prompt}>
                      {truncate(prompt, 40)}
                    </option>
                  ))}
                </select>
              )}
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
              <span className="text-xs text-gray-500">
                {isCategory
                  ? positionChartBrandFilter === '__all__'
                    ? 'Each dot represents one AI response. Position is the average rank across all brands mentioned. Filter by brand to see individual positions.'
                    : `Each dot represents one AI response showing ${positionChartBrandFilter}'s position. Toggle sentiment to color by recommendation.`
                  : 'Each dot represents one AI response. Toggle sentiment to color by recommendation.'
                }
              </span>
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
      {showSection('by-platform') && Object.keys(llmBreakdownStats).length > 0 && llmBreakdownBrands.length > 0 && (
        <div id="overview-by-platform" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {isCategory ? 'Brand Visibility by Platform' : 'Results by AI Platform'}
              </h2>
              {isCategory && (
                <p className="text-sm text-gray-500 mt-1">How each AI platform recommends brands in the {runStatus?.brand} space</p>
              )}
            </div>
            <select
              value={llmBreakdownBrandFilter || llmBreakdownBrands[0] || ''}
              onChange={(e) => setLlmBreakdownBrandFilter(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            >
              {llmBreakdownBrands.map((brand, index) => (
                <option key={brand} value={brand}>
                  {brand}{index === 0 && isCategory ? ' (market leader)' : ''}{index === 0 && !isCategory && runStatus?.brand === brand ? ' (searched)' : ''}
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
                            ? (result.all_brands_mentioned?.length ? result.all_brands_mentioned.includes(selectedBrand || '') : result.competitors_mentioned?.includes(selectedBrand || ''))
                            : result.brand_mentioned;

                          // Calculate position for this result
                          let position: number | null = null;
                          if (result.response_text && selectedBrand && isMentioned) {
                            const brandLower = selectedBrand.toLowerCase();
                            const allBrandsRaw: string[] = result.all_brands_mentioned && result.all_brands_mentioned.length > 0
                              ? result.all_brands_mentioned.filter((b): b is string => typeof b === 'string')
                              : [runStatus?.brand, ...(result.competitors_mentioned || [])].filter((b): b is string => typeof b === 'string');
                            const allBrands = isCategory
                              ? allBrandsRaw.filter(b => !isCategoryName(b, runStatus?.brand || '') && !excludedBrands.has(b))
                              : allBrandsRaw.filter(b => !excludedBrands.has(b));

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
                              position = brandsBeforeCount + 1;
                            } else {
                              position = allBrands.length + 1;
                            }
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
      {showSection('all-results') && <div id="overview-all-results" className="bg-white rounded-2xl shadow-sm border border-gray-200">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">All Results</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Showing {filteredResults.length} of {globallyFilteredResults.filter((r: Result) => !r.error || (r.provider === 'ai_overviews' && r.error)).length} results
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isCategory && (
              <select
                value={tableBrandFilter}
                onChange={(e) => setTableBrandFilter(e.target.value)}
                className="px-4 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              >
                <option value="all">All Brands</option>
                {availableBrands.map((brand) => (
                  <option key={brand} value={brand}>{brand}</option>
                ))}
              </select>
            )}
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
        </div>

        {/* Table */}
        <div>
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
                    {isIssue ? 'Depth' : isCategory ? '# Brands' : 'Rank'}
                    <span className="relative group/tip" onClick={(e) => e.stopPropagation()}>
                      <HelpCircle className="w-3 h-3 text-gray-300 hover:text-gray-500 transition-colors" />
                      <span className="absolute left-0 top-full mt-1 w-52 p-2 bg-gray-900 text-white text-xs font-normal normal-case tracking-normal rounded-lg opacity-0 invisible group-hover/tip:opacity-100 group-hover/tip:visible transition-all z-50 shadow-lg">
                        {isIssue
                          ? 'How thoroughly the AI engaged with this issue (based on response length)'
                          : isCategory
                          ? 'Number of brands mentioned in this AI response'
                          : 'Where your brand appears in the AI response (#1 = mentioned first)'
                        }
                      </span>
                    </span>
                    {tableSortColumn === 'position' && (
                      <span className="text-gray-900">{tableSortDirection === 'asc' ? '\u2191' : '\u2193'}</span>
                    )}
                  </span>
                </th>
                {!isCategory && !isIssue && (
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
                {isIssue && (
                  <th
                    className="w-[12%] text-left py-2.5 px-4 cursor-pointer hover:bg-gray-50 select-none"
                    onClick={() => handleTableSort('mentioned')}
                  >
                    <span className="flex items-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Framing
                      <span className="relative group/tip" onClick={(e) => e.stopPropagation()}>
                        <HelpCircle className="w-3 h-3 text-gray-300 hover:text-gray-500 transition-colors" />
                        <span className="absolute left-0 top-full mt-1 w-52 p-2 bg-gray-900 text-white text-xs font-normal normal-case tracking-normal rounded-lg opacity-0 invisible group-hover/tip:opacity-100 group-hover/tip:visible transition-all z-50 shadow-lg">
                          How the AI framed this issue in its response
                        </span>
                      </span>
                      {tableSortColumn === 'mentioned' && (
                        <span className="text-gray-900">{tableSortDirection === 'asc' ? '\u2191' : '\u2193'}</span>
                      )}
                    </span>
                  </th>
                )}
                {isCategory ? (
                <th
                  className="w-[14%] text-left py-2.5 px-4 cursor-pointer hover:bg-gray-50 select-none"
                  onClick={() => handleTableSort('sentiment')}
                >
                  <span className="flex items-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    First Brand
                    <span className="relative group/tip" onClick={(e) => e.stopPropagation()}>
                      <HelpCircle className="w-3 h-3 text-gray-300 hover:text-gray-500 transition-colors" />
                      <span className="absolute left-0 top-full mt-1 w-56 p-2 bg-gray-900 text-white text-xs font-normal normal-case tracking-normal rounded-lg opacity-0 invisible group-hover/tip:opacity-100 group-hover/tip:visible transition-all z-50 shadow-lg">
                        The first brand mentioned in the AI response
                      </span>
                    </span>
                    {tableSortColumn === 'sentiment' && (
                      <span className="text-gray-900">{tableSortDirection === 'asc' ? '\u2191' : '\u2193'}</span>
                    )}
                  </span>
                </th>
                ) : (
                <th
                  className="w-[14%] text-left py-2.5 px-4 cursor-pointer hover:bg-gray-50 select-none"
                  onClick={() => handleTableSort('sentiment')}
                >
                  <span className="flex items-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {isIssue ? 'Framing' : 'Sentiment'}
                    <span className="relative group/tip" onClick={(e) => e.stopPropagation()}>
                      <HelpCircle className="w-3 h-3 text-gray-300 hover:text-gray-500 transition-colors" />
                      <span className="absolute left-0 top-full mt-1 w-56 p-2 bg-gray-900 text-white text-xs font-normal normal-case tracking-normal rounded-lg opacity-0 invisible group-hover/tip:opacity-100 group-hover/tip:visible transition-all z-50 shadow-lg">
                        {isIssue
                          ? 'How the AI framed this issue — Supportive, Balanced, or Critical'
                          : 'How positively the AI described your brand, from Negative to Strong'
                        }
                      </span>
                    </span>
                    {tableSortColumn === 'sentiment' && (
                      <span className="text-gray-900">{tableSortDirection === 'asc' ? '\u2191' : '\u2193'}</span>
                    )}
                  </span>
                </th>
                )}
                <th
                  className="w-[20%] text-left py-2.5 px-4 cursor-pointer hover:bg-gray-50 select-none"
                  onClick={() => handleTableSort('competitors')}
                >
                  <span className="flex items-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {isIssue ? 'Related Issues' : isCategory ? 'All Brands' : 'Competitors'}
                    <span className="relative group/tip" onClick={(e) => e.stopPropagation()}>
                      <HelpCircle className="w-3 h-3 text-gray-300 hover:text-gray-500 transition-colors" />
                      <span className="absolute left-0 top-full mt-1 w-52 p-2 bg-gray-900 text-white text-xs font-normal normal-case tracking-normal rounded-lg opacity-0 invisible group-hover/tip:opacity-100 group-hover/tip:visible transition-all z-50 shadow-lg">
                        {isIssue ? 'Related issues mentioned in this AI response' : isCategory ? 'All brands mentioned in this AI response' : 'Other brands mentioned in the same AI response'}
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
                  const textLower = getTextForRanking(result.response_text, result.provider).toLowerCase();

                  const isMentioned = isCategory
                    ? (result.all_brands_mentioned?.length ? result.all_brands_mentioned.includes(selectedBrand || '') : result.competitors_mentioned?.includes(selectedBrand || ''))
                    : result.brand_mentioned;

                  if (isMentioned && brandLower) {
                    const allBrands: string[] = result.all_brands_mentioned && result.all_brands_mentioned.length > 0
                      ? result.all_brands_mentioned.filter((b): b is string => typeof b === 'string')
                      : [runStatus?.brand, ...(result.competitors_mentioned || [])].filter((b): b is string => typeof b === 'string');

                    const brandTextPos = textLower.indexOf(brandLower);
                    if (brandTextPos >= 0) {
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
                    } else {
                      // Brand not found in cleaned text but marked as mentioned
                      position = allBrands.length + 1;
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

                // Sentiment badge with reason — interprets WHY the sentiment was classified
                const getSentimentReason = (sentiment: string, text: string, brand: string): string => {
                  const brandLower = brand.toLowerCase();
                  const plain = text.replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1');
                  const sentences = plain.split(/(?<=[.!?])\s+/);

                  // Collect sentences mentioning the brand (+ following sentence for context)
                  const contextPairs: string[] = [];
                  for (let i = 0; i < sentences.length; i++) {
                    if (sentences[i].toLowerCase().includes(brandLower)) {
                      const pair = sentences[i] + (sentences[i + 1] ? ' ' + sentences[i + 1] : '');
                      contextPairs.push(pair);
                    }
                  }
                  if (contextPairs.length === 0) return '';
                  const joined = contextPairs.join(' ').toLowerCase();

                  // Map: [keyword regex, interpretive description] — first match wins per sentiment
                  const descMap: Record<string, [RegExp, string][]> = {
                    strong_endorsement: [
                      [/best/, 'Called the best in its category'],
                      [/#1|number one|top.pick/, 'Named the #1 choice'],
                      [/leader|dominat/, 'Recognized as a market leader'],
                      [/go.to|must.have/, 'Called a go-to choice'],
                      [/excellent|exceptional|outstanding/, 'Praised for exceptional quality'],
                      [/superior/, 'Called superior to alternatives'],
                      [/top/, 'Named a top choice'],
                      [/highly/, 'Described as highly recommended'],
                      [/favorite/, 'Called a favorite in the category'],
                    ],
                    positive_endorsement: [
                      [/recommend/, 'Directly recommended by response'],
                      [/quality/, 'Noted for high product quality'],
                      [/reliable|trusted/, 'Praised as reliable and trusted'],
                      [/innovative/, 'Recognized for innovation'],
                      [/durable/, 'Praised for product durability'],
                      [/popular/, 'Recognized as a popular choice'],
                      [/versatile|impressive/, 'Noted for versatility and features'],
                      [/great|good|solid/, 'Described favorably overall'],
                    ],
                    conditional: [
                      [/expensive|pric/, 'Praised but noted as expensive'],
                      [/limited|lacks|missing/, 'Recommended but noted as limited'],
                      [/however|but|although|while|despite/, 'Positive mention followed by limitations'],
                      [/depends|if you/, 'Recommended for specific use cases only'],
                      [/trade.off|caveat|downside/, 'Recommended with notable trade-offs'],
                      [/compared|may not/, 'Mixed when compared to alternatives'],
                    ],
                    negative_comparison: [
                      [/behind|trail|inferior|worse/, 'Said to trail behind competitors'],
                      [/overpriced/, 'Described as overpriced'],
                      [/outdated/, 'Called outdated or behind the times'],
                      [/disappoint|poor|bad/, 'Received a poor overall assessment'],
                      [/avoid/, 'Response suggests avoiding the brand'],
                      [/issue|problem|decline/, 'Has noted product or quality issues'],
                      [/lack|missing/, 'Called out for missing features'],
                    ],
                    neutral_mention: [
                      [/one of|among/, 'Listed as one of several options'],
                      [/also/, 'Mentioned alongside other brands'],
                      [/option|alternative/, 'Listed as an available alternative'],
                      [/offers|provides|features/, 'Referenced for what it offers'],
                      [/known for/, 'Mentioned for brand recognition'],
                    ],
                  };

                  const descriptions = descMap[sentiment];
                  if (!descriptions) return '';
                  for (const [regex, desc] of descriptions) {
                    if (regex.test(joined)) return desc;
                  }

                  const fallbacks: Record<string, string> = {
                    strong_endorsement: 'Strongly endorsed in the response',
                    positive_endorsement: 'Positively mentioned in the response',
                    conditional: 'Mentioned with noted conditions',
                    negative_comparison: 'Compared unfavorably to alternatives',
                    neutral_mention: 'Mentioned without strong opinion',
                  };
                  return fallbacks[sentiment] || '';
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
                  const competitors = (result.all_brands_mentioned?.length ? result.all_brands_mentioned : result.competitors_mentioned || []).filter(b => b.toLowerCase() !== (runStatus?.brand || '').toLowerCase() && !excludedBrands.has(b) && !isCategoryName(b, runStatus?.brand || ''));
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
                        {isCategory
                          ? <span className="text-xs text-gray-600">{result.error ? '\u2014' : ((result.all_brands_mentioned?.length ? result.all_brands_mentioned.filter(b => !isCategoryName(b, runStatus?.brand || '') && !excludedBrands.has(b)).length : (result.competitors_mentioned || []).filter(b => !excludedBrands.has(b)).length) || 0)}</span>
                          : isIssue
                          ? (() => {
                              if (result.error) return <span className="text-xs text-gray-400">{'\u2014'}</span>;
                              const wordCount = (result.response_text || '').split(/\s+/).length;
                              const depth = wordCount > 300 ? 'Detailed' : wordCount > 100 ? 'Moderate' : 'Brief';
                              const depthColor = depth === 'Detailed' ? 'text-emerald-600 bg-emerald-50' : depth === 'Moderate' ? 'text-amber-600 bg-amber-50' : 'text-gray-500 bg-gray-100';
                              return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${depthColor}`}>{depth}</span>;
                            })()
                          : getPositionBadge()
                        }
                      </td>
                      {!isCategory && !isIssue && (
                        <td className="w-[12%] py-3 px-4">
                          {getMentionedBadge()}
                        </td>
                      )}
                      {isIssue && (
                        <td className="w-[12%] py-3 px-4">
                          {(() => {
                            if (result.error) return <span className="text-xs text-gray-400">{'\u2014'}</span>;
                            const sentiment = result.brand_sentiment;
                            const framingLabel = FRAMING_MAP[sentiment || ''] || 'Unknown';
                            const colorMap: Record<string, string> = {
                              'Supportive': 'text-emerald-700 bg-emerald-50',
                              'Leaning Supportive': 'text-emerald-600 bg-emerald-50',
                              'Balanced': 'text-gray-600 bg-gray-100',
                              'Mixed': 'text-amber-600 bg-amber-50',
                              'Critical': 'text-red-600 bg-red-50',
                            };
                            const color = colorMap[framingLabel] || 'text-gray-500 bg-gray-100';
                            return <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${color}`}>{framingLabel}</span>;
                          })()}
                        </td>
                      )}
                      <td className="w-[14%] py-3 px-4">
                        {isCategory
                          ? <span className="text-xs text-gray-600">{result.error ? '\u2014' : (((result.all_brands_mentioned?.length ? result.all_brands_mentioned : result.competitors_mentioned || []).find(b => !isCategoryName(b, runStatus?.brand || '') && !excludedBrands.has(b))) || '\u2014')}</span>
                          : isIssue
                          ? (() => {
                              if (result.error) return <span className="text-xs text-gray-400">{'\u2014'}</span>;
                              const sentiment = result.brand_sentiment;
                              const framingLabel = FRAMING_MAP[sentiment || ''] || '\u2014';
                              const configs: Record<string, { text: string; subtext: string }> = {
                                'Supportive': { text: 'text-emerald-700', subtext: 'text-emerald-600/70' },
                                'Leaning Supportive': { text: 'text-emerald-600', subtext: 'text-emerald-500/70' },
                                'Balanced': { text: 'text-gray-500', subtext: 'text-gray-400/80' },
                                'Mixed': { text: 'text-amber-600', subtext: 'text-amber-500/70' },
                                'Critical': { text: 'text-red-600', subtext: 'text-red-500/70' },
                              };
                              const config = configs[framingLabel];
                              if (!config) return <span className="text-xs text-gray-400">{'\u2014'}</span>;
                              return <span className={`text-xs font-medium ${config.text}`}>{framingLabel}</span>;
                            })()
                          : getSentimentBadge()
                        }
                      </td>
                      <td className="w-[20%] py-3 px-4">
                        {isIssue ? (() => {
                          if (result.error) return <span className="text-xs text-gray-400">{'\u2014'}</span>;
                          const issues = result.competitors_mentioned || [];
                          if (issues.length === 0) return <span className="text-xs text-gray-400">None</span>;
                          return (
                            <div className="flex flex-wrap gap-1">
                              {issues.slice(0, 3).map((issue, i) => (
                                <span key={i} className="inline-flex text-[10px] font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full max-w-[120px] truncate" title={issue}>{issue}</span>
                              ))}
                              {issues.length > 3 && (
                                <span className="text-[10px] text-gray-400">+{issues.length - 3}</span>
                              )}
                            </div>
                          );
                        })() : getCompetitorsList()}
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
              // Generate CSV content — match table column names per search type
              const headers = isCategory
                ? ['Question', 'Model', '# Brands', 'First Brand', 'All Brands', 'Response']
                : isIssue
                ? ['Question', 'Model', 'Depth', 'Framing', 'Related Issues', 'Response']
                : ['Question', 'Model', 'Rank', 'Mentioned', 'Sentiment', 'Competitors', 'Response'];
              const rows = sortedResults.map((result: Result) => {
                // Calculate position based on first text appearance
                let position: number | string = '-';
                if (result.response_text && !result.error) {
                  const selectedBrand = isCategory ? llmBreakdownBrands[0] : runStatus?.brand;
                  const brandLower = (selectedBrand || '').toLowerCase();
                  const textLower = getTextForRanking(result.response_text, result.provider).toLowerCase();
                  const isMentioned = isCategory
                    ? (result.all_brands_mentioned?.length ? result.all_brands_mentioned.includes(selectedBrand || '') : result.competitors_mentioned?.includes(selectedBrand || ''))
                    : result.brand_mentioned;

                  if (isMentioned && brandLower) {
                    const allBrands: string[] = result.all_brands_mentioned && result.all_brands_mentioned.length > 0
                      ? result.all_brands_mentioned.filter((b): b is string => typeof b === 'string')
                      : [runStatus?.brand, ...(result.competitors_mentioned || [])].filter((b): b is string => typeof b === 'string');

                    const brandTextPos = textLower.indexOf(brandLower);
                    if (brandTextPos >= 0) {
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
                    } else {
                      // Brand not found in cleaned text but marked as mentioned
                      position = allBrands.length + 1;
                    }
                  }
                }

                const sentimentLabel = result.brand_sentiment === 'strong_endorsement' ? 'Strong' :
                  result.brand_sentiment === 'positive_endorsement' ? 'Positive' :
                  result.brand_sentiment === 'conditional' ? 'Conditional' :
                  result.brand_sentiment === 'negative_comparison' ? 'Negative' :
                  result.brand_sentiment === 'neutral_mention' ? 'Neutral' : 'Not mentioned';

                const allBrandsList = (result.all_brands_mentioned?.length ? result.all_brands_mentioned : result.competitors_mentioned || []).filter(b => !isCategoryName(b, runStatus?.brand || '') && !excludedBrands.has(b));
                const responseText = `"${(result.response_text || '').replace(/\*?\*?\[People Also Ask\]\*?\*?/g, '').replace(/[\r\n]+/g, ' ').replace(/"/g, '""')}"`;

                if (isCategory) {
                  const brandCount = allBrandsList.length;
                  const firstBrand = allBrandsList[0] || '-';
                  return [
                    `"${result.prompt.replace(/"/g, '""')}"`,
                    getProviderLabel(result.provider),
                    brandCount,
                    `"${firstBrand}"`,
                    `"${allBrandsList.join(', ')}"`,
                    responseText,
                  ].join(',');
                }

                if (isIssue) {
                  const framingLabel = FRAMING_MAP[result.brand_sentiment || ''] || 'Unknown';
                  return [
                    `"${result.prompt.replace(/"/g, '""')}"`,
                    getProviderLabel(result.provider),
                    position,
                    framingLabel,
                    `"${(result.competitors_mentioned || []).join(', ')}"`,
                    responseText,
                  ].join(',');
                }

                return [
                  `"${result.prompt.replace(/"/g, '""')}"`,
                  getProviderLabel(result.provider),
                  position,
                  result.error ? 'Error' : result.brand_mentioned ? 'Yes' : 'No',
                  sentimentLabel,
                  `"${allBrandsList.join(', ')}"`,
                  responseText,
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
      </div>}
      </>
      )}
      </PaywallOverlay>
    </div>
  );
};
