'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, ZAxis, BarChart, Bar, ReferenceArea, ReferenceLine, ComposedChart, Line, ErrorBar, Customized } from 'recharts';
import {
  ArrowLeft,
  Download,
  Link2,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Filter,
  Sparkles,
  AlertTriangle,
  ExternalLink,
  LayoutGrid,
  FileText,
  TrendingUp,
  MessageSquare,
  Globe,
  Lightbulb,
  FileBarChart,
} from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { useRunStatus, useAISummary } from '@/hooks/useApi';
import {
  formatCurrency,
  formatDate,
  formatPercent,
  getRateColor,
  truncate,
} from '@/lib/utils';
import { Result } from '@/lib/types';

type FilterType = 'all' | 'mentioned' | 'not_mentioned';
type TabType = 'overview' | 'reference' | 'competitive' | 'sentiment' | 'sources' | 'recommendations' | 'reports';

const TABS: { id: TabType; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <LayoutGrid className="w-4 h-4" /> },
  { id: 'reference', label: 'Reference', icon: <FileText className="w-4 h-4" /> },
  { id: 'competitive', label: 'Competitive Landscape', icon: <TrendingUp className="w-4 h-4" /> },
  { id: 'sentiment', label: 'Sentiment & Framing', icon: <MessageSquare className="w-4 h-4" /> },
  { id: 'sources', label: 'Sources', icon: <Globe className="w-4 h-4" /> },
  { id: 'recommendations', label: 'Recommendations', icon: <Lightbulb className="w-4 h-4" /> },
  { id: 'reports', label: 'Automated Reports', icon: <FileBarChart className="w-4 h-4" /> },
];

export default function ResultsPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const runId = params.id as string;

  // Tab state - persisted in URL
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    const tab = searchParams.get('tab') as TabType;
    return TABS.some(t => t.id === tab) ? tab : 'overview';
  });

  // Global filters - persisted in URL
  const [globalBrandFilter, setGlobalBrandFilter] = useState<string>(() =>
    searchParams.get('brand') || 'all'
  );
  const [globalLlmFilter, setGlobalLlmFilter] = useState<string>(() =>
    searchParams.get('llm') || 'all'
  );
  const [globalPromptFilter, setGlobalPromptFilter] = useState<string>(() =>
    searchParams.get('prompt') || 'all'
  );

  // Local filters for specific components
  const [filter, setFilter] = useState<FilterType>('all');
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [brandMentionsProviderFilter, setBrandMentionsProviderFilter] = useState<string>('all');
  const [brandMentionsTrackingFilter, setBrandMentionsTrackingFilter] = useState<'all' | 'tracked'>('all');
  const [shareOfVoiceFilter, setShareOfVoiceFilter] = useState<'all' | 'tracked'>('tracked');
  const [llmBreakdownBrandFilter, setLlmBreakdownBrandFilter] = useState<string>('');
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  const [expandedLLMCards, setExpandedLLMCards] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [aiSummaryExpanded, setAiSummaryExpanded] = useState(false);
  const [selectedResult, setSelectedResult] = useState<Result | null>(null);
  const [chartTab, setChartTab] = useState<'allAnswers' | 'performanceRange' | 'shareOfVoice'>('allAnswers');
  const [showSentimentColors, setShowSentimentColors] = useState(false);
  const [tableSortColumn, setTableSortColumn] = useState<'prompt' | 'llm' | 'position' | 'mentioned' | 'sentiment' | 'competitors'>('prompt');
  const [tableSortDirection, setTableSortDirection] = useState<'asc' | 'desc'>('asc');

  const { data: runStatus, isLoading, error } = useRunStatus(runId, true);
  const { data: aiSummary, isLoading: isSummaryLoading } = useAISummary(
    runId,
    runStatus?.status === 'complete'
  );

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (activeTab !== 'overview') params.set('tab', activeTab);
    if (globalBrandFilter !== 'all') params.set('brand', globalBrandFilter);
    if (globalLlmFilter !== 'all') params.set('llm', globalLlmFilter);
    if (globalPromptFilter !== 'all') params.set('prompt', globalPromptFilter);

    const queryString = params.toString();
    const newUrl = queryString ? `?${queryString}` : window.location.pathname;
    window.history.replaceState(null, '', newUrl);
  }, [activeTab, globalBrandFilter, globalLlmFilter, globalPromptFilter]);

  // Get unique prompts from results
  const availablePrompts = useMemo(() => {
    if (!runStatus) return [];
    const prompts = new Set<string>();
    runStatus.results.forEach((r: Result) => {
      prompts.add(r.prompt);
    });
    return Array.from(prompts);
  }, [runStatus]);

  // Get unique providers from results for the filter dropdown
  const availableProviders = useMemo(() => {
    if (!runStatus) return [];
    const providers = new Set<string>();
    runStatus.results.forEach((r: Result) => {
      if (!r.error) providers.add(r.provider);
    });
    return Array.from(providers);
  }, [runStatus]);

  // Get all brands for filters (searched brand + competitors)
  const availableBrands = useMemo(() => {
    if (!runStatus) return [];
    const brands = new Set<string>();
    if (runStatus.brand) {
      brands.add(runStatus.brand);
    }
    runStatus.results.forEach((r: Result) => {
      if (!r.error && r.competitors_mentioned) {
        r.competitors_mentioned.forEach((comp: string) => brands.add(comp));
      }
    });
    return Array.from(brands).sort();
  }, [runStatus]);

  // Apply global filters to results
  const globallyFilteredResults = useMemo(() => {
    if (!runStatus) return [];

    return runStatus.results.filter((result: Result) => {
      // LLM filter
      if (globalLlmFilter !== 'all' && result.provider !== globalLlmFilter) return false;

      // Prompt filter
      if (globalPromptFilter !== 'all' && result.prompt !== globalPromptFilter) return false;

      // Brand filter - check if brand is mentioned in this result
      if (globalBrandFilter !== 'all') {
        const isBrandMentioned = result.brand_mentioned && globalBrandFilter === runStatus.brand;
        const isCompetitorMentioned = result.competitors_mentioned?.includes(globalBrandFilter);
        if (!isBrandMentioned && !isCompetitorMentioned) return false;
      }

      return true;
    });
  }, [runStatus, globalBrandFilter, globalLlmFilter, globalPromptFilter]);

  // Filter results - include AI Overview errors to show "Not Available"
  const filteredResults = useMemo(() => {
    if (!runStatus) return [];

    return globallyFilteredResults.filter((result: Result) => {
      // Include AI Overview errors to show "Not Available" status
      const isAiOverviewError = result.provider === 'ai_overviews' && result.error;

      // Filter out other errored results for display
      if (result.error && !isAiOverviewError) return false;

      // Brand mention filter - skip for errored results
      if (!result.error) {
        if (filter === 'mentioned' && !result.brand_mentioned) return false;
        if (filter === 'not_mentioned' && result.brand_mentioned) return false;
      }

      // Provider filter (local)
      if (providerFilter !== 'all' && result.provider !== providerFilter) return false;

      return true;
    });
  }, [globallyFilteredResults, filter, providerFilter, runStatus]);

  // Helper to calculate position for a result
  const getResultPosition = (result: Result): number | null => {
    if (!result.response_text || result.error || !runStatus) return null;
    const selectedBrand = runStatus.search_type === 'category'
      ? (runStatus.results.find((r: Result) => r.competitors_mentioned?.length)?.competitors_mentioned?.[0] || '')
      : runStatus.brand;
    const allBrands = result.all_brands_mentioned && result.all_brands_mentioned.length > 0
      ? result.all_brands_mentioned
      : [runStatus.brand, ...(result.competitors_mentioned || [])].filter(Boolean);
    const rank = allBrands.findIndex(b => b.toLowerCase() === (selectedBrand || '').toLowerCase()) + 1;
    return rank > 0 ? rank : null;
  };

  // Sentiment sort order (best to worst)
  const sentimentOrder: Record<string, number> = {
    'strong_endorsement': 1,
    'positive_endorsement': 2,
    'neutral_mention': 3,
    'conditional': 4,
    'negative_comparison': 5,
    'not_mentioned': 6,
  };

  // Sort filtered results
  const sortedResults = useMemo(() => {
    const sorted = [...filteredResults];

    sorted.sort((a, b) => {
      let comparison = 0;

      switch (tableSortColumn) {
        case 'prompt':
          comparison = a.prompt.localeCompare(b.prompt);
          break;
        case 'llm':
          comparison = a.provider.localeCompare(b.provider);
          break;
        case 'position':
          const posA = getResultPosition(a) ?? 999;
          const posB = getResultPosition(b) ?? 999;
          comparison = posA - posB;
          break;
        case 'mentioned':
          const mentionedA = a.brand_mentioned ? 1 : 0;
          const mentionedB = b.brand_mentioned ? 1 : 0;
          comparison = mentionedB - mentionedA; // Yes first
          break;
        case 'sentiment':
          const sentA = sentimentOrder[a.brand_sentiment || 'not_mentioned'] || 6;
          const sentB = sentimentOrder[b.brand_sentiment || 'not_mentioned'] || 6;
          comparison = sentA - sentB;
          break;
        case 'competitors':
          const compA = a.competitors_mentioned?.length || 0;
          const compB = b.competitors_mentioned?.length || 0;
          comparison = compB - compA; // More competitors first
          break;
      }

      return tableSortDirection === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }, [filteredResults, tableSortColumn, tableSortDirection, runStatus]);

  // Handle table header click for sorting
  const handleTableSort = (column: typeof tableSortColumn) => {
    if (tableSortColumn === column) {
      setTableSortDirection(tableSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setTableSortColumn(column);
      setTableSortDirection('asc');
    }
  };

  // Count AI Overview unavailable results
  const aiOverviewUnavailableCount = useMemo(() => {
    if (!runStatus) return 0;
    return globallyFilteredResults.filter(
      (r: Result) => r.provider === 'ai_overviews' && r.error
    ).length;
  }, [globallyFilteredResults, runStatus]);

  // Get the set of tracked competitors (ones that were configured for tracking)
  const trackedBrands = useMemo(() => {
    if (!runStatus) return new Set<string>();
    const tracked = new Set<string>();
    if (runStatus.brand) {
      tracked.add(runStatus.brand.toLowerCase());
    }
    runStatus.results.forEach((r: Result) => {
      if (!r.error && r.competitors_mentioned) {
        r.competitors_mentioned.forEach((c: string) => tracked.add(c.toLowerCase()));
      }
    });
    return tracked;
  }, [runStatus]);

  // Extract potential brand names from response text that weren't tracked
  const extractUntrackedBrands = (text: string, trackedSet: Set<string>, categoryName: string): string[] => {
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
  };

  // Calculate brand/competitor mentions filtered by provider
  const filteredBrandMentions = useMemo(() => {
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
      if (result.competitors_mentioned) {
        for (const comp of result.competitors_mentioned) {
          if (!mentions[comp]) {
            mentions[comp] = { count: 0, total: 0, isTracked: true };
          }
          mentions[comp].count += 1;
        }
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
    const mentionsWithRates: Record<string, { count: number; rate: number; isTracked: boolean }> = {};

    for (const [comp, data] of Object.entries(mentions)) {
      if (brandMentionsTrackingFilter === 'tracked' && !data.isTracked) continue;

      mentionsWithRates[comp] = {
        count: data.count,
        rate: totalResults > 0 ? data.count / totalResults : 0,
        isTracked: data.isTracked,
      };
    }

    return mentionsWithRates;
  }, [runStatus, globallyFilteredResults, brandMentionsProviderFilter, brandMentionsTrackingFilter, trackedBrands]);

  // Calculate Share of Voice data for pie chart
  const shareOfVoiceData = useMemo(() => {
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
      if (result.competitors_mentioned) {
        for (const comp of result.competitors_mentioned) {
          if (!mentions[comp]) {
            mentions[comp] = { count: 0, isTracked: true };
          }
          mentions[comp].count += 1;
        }
      }
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
    const chartData: { name: string; value: number; percentage: number; color: string; isSelected: boolean; isOther: boolean }[] = [];
    const accentColor = '#4A7C59'; // Green accent for selected brand
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
  }, [runStatus, globallyFilteredResults, brandMentionsProviderFilter, trackedBrands, shareOfVoiceFilter]);

  // Get all brands for LLM breakdown dropdown
  const llmBreakdownBrands = useMemo(() => {
    if (!runStatus) return [];
    const isCategory = runStatus.search_type === 'category';

    const mentionCounts: Record<string, number> = {};
    globallyFilteredResults.forEach((r: Result) => {
      if (!r.error && r.competitors_mentioned) {
        r.competitors_mentioned.forEach((c: string) => {
          mentionCounts[c] = (mentionCounts[c] || 0) + 1;
        });
      }
    });

    if (isCategory) {
      return Object.entries(mentionCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([brand]) => brand);
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
      return brands;
    }
  }, [runStatus, globallyFilteredResults]);

  // Calculate LLM breakdown stats for selected brand
  const llmBreakdownStats = useMemo(() => {
    if (!runStatus) return {};

    const isCategory = runStatus.search_type === 'category';
    const defaultBrand = isCategory ? llmBreakdownBrands[0] : runStatus.brand;
    const selectedBrand = llmBreakdownBrandFilter || defaultBrand;
    if (!selectedBrand) return {};

    const results = globallyFilteredResults.filter((r: Result) => !r.error);
    const isSearchedBrand = !isCategory && selectedBrand === runStatus.brand;

    const providerStats: Record<string, {
      mentioned: number;
      total: number;
      rate: number;
      topPosition: number | null;
      ranks: number[];
      avgRank: number | null;
    }> = {};

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
        isMentioned = result.competitors_mentioned?.includes(selectedBrand) || false;
      }

      if (isMentioned) {
        providerStats[provider].mentioned += 1;

        if (result.response_text) {
          const brandLower = selectedBrand.toLowerCase();

          // Use all_brands_mentioned if available (includes all detected brands),
          // otherwise fall back to tracked brands only
          const allBrands = result.all_brands_mentioned && result.all_brands_mentioned.length > 0
            ? result.all_brands_mentioned
            : [runStatus.brand, ...(result.competitors_mentioned || [])].filter(Boolean);

          // Find position of selected brand in the ordered list
          const rank = allBrands.findIndex(b => b.toLowerCase() === brandLower) + 1;

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
  }, [runStatus, globallyFilteredResults, llmBreakdownBrandFilter, llmBreakdownBrands]);

  // State for sources filters
  const [sourcesProviderFilter, setSourcesProviderFilter] = useState<string>('all');
  const [sourcesBrandFilter, setSourcesBrandFilter] = useState<string>('all');
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());

  // Extract domain from URL
  const getDomain = (url: string): string => {
    try {
      const hostname = new URL(url).hostname;
      return hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  };

  // Extract a readable title from URL path
  const getReadableTitleFromUrl = (url: string): string => {
    try {
      const parsedUrl = new URL(url);
      const domain = parsedUrl.hostname.replace(/^www\./, '');
      const pathname = parsedUrl.pathname;

      if (domain === 'reddit.com' || domain.endsWith('.reddit.com')) {
        const redditMatch = pathname.match(/^\/r\/([^/]+)/);
        if (redditMatch) {
          return `r/${redditMatch[1]}`;
        }
      }

      const segments = pathname.split('/').filter(Boolean);
      if (segments.length === 0) return domain;

      const meaningfulSegments = segments
        .filter(seg => {
          if (/^[a-f0-9]{8,}$/i.test(seg)) return false;
          if (/^[0-9]+$/.test(seg)) return false;
          if (['index', 'article', 'post', 'page', 'amp'].includes(seg.toLowerCase())) return false;
          return true;
        })
        .slice(-2);

      if (meaningfulSegments.length === 0) return domain;

      const title = meaningfulSegments
        .map(seg => {
          seg = seg.replace(/\.(html?|php|aspx?)$/i, '');
          seg = seg.replace(/^[a-z]?\d{6,}-?/i, '');
          seg = seg.replace(/[-_]+/g, ' ');
          seg = seg.replace(/\s+/g, ' ').trim();
          return seg;
        })
        .filter(Boolean)
        .join(' - ');

      return title || domain;
    } catch {
      return url;
    }
  };

  // Format source display
  const formatSourceDisplay = (url: string, title?: string): { domain: string; subtitle: string } => {
    const domain = getDomain(url);

    if (title && title !== url && !title.startsWith('http')) {
      return { domain, subtitle: title };
    }

    const readableTitle = getReadableTitleFromUrl(url);
    if (readableTitle !== domain) {
      return { domain, subtitle: readableTitle };
    }

    return { domain, subtitle: '' };
  };

  // Format response text for consistent display across LLMs
  const formatResponseText = (text: string): string => {
    if (!text) return '';

    let formatted = text;

    // Normalize line endings
    formatted = formatted.replace(/\r\n/g, '\n');

    // Remove excessive blank lines (3+ newlines become 2)
    formatted = formatted.replace(/\n{3,}/g, '\n\n');

    // Normalize list markers to consistent format
    // Convert various bullet styles to standard dash
    formatted = formatted.replace(/^[\u2022\u2023\u25E6\u2043\u2219●○◦•]\s*/gm, '- ');

    // Ensure single space after list markers
    formatted = formatted.replace(/^(-|\*|\d+\.)\s{2,}/gm, '$1 ');

    // Add consistent spacing before headers (lines starting with #)
    formatted = formatted.replace(/([^\n])\n(#{1,6}\s)/g, '$1\n\n$2');

    // Ensure blank line before lists that follow prose
    formatted = formatted.replace(/([^\n-*\d])\n([-*]\s|\d+\.\s)/g, '$1\n\n$2');

    // Remove trailing whitespace from lines
    formatted = formatted.replace(/[ \t]+$/gm, '');

    // Ensure consistent spacing after list items that are followed by prose
    formatted = formatted.replace(/([-*]\s.+)\n([A-Z])/g, '$1\n\n$2');

    // Trim leading/trailing whitespace
    formatted = formatted.trim();

    return formatted;
  };

  // Bold competitor names in response text (only first occurrence of each)
  const highlightCompetitors = (text: string, competitors: string[] | null): string => {
    if (!text || !competitors || competitors.length === 0) return text;

    let highlighted = text;

    // Sort competitors by length (longest first) to avoid partial replacements
    const sortedCompetitors = [...competitors].sort((a, b) => b.length - a.length);

    for (const competitor of sortedCompetitors) {
      // Escape special regex characters in competitor name
      const escaped = competitor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Match whole words only, case-insensitive
      const regex = new RegExp(`\\b(${escaped})\\b`, 'i');
      // Only replace the first occurrence
      highlighted = highlighted.replace(regex, '**$1**');
    }

    return highlighted;
  };

  // Calculate top cited sources
  const topCitedSources = useMemo(() => {
    if (!runStatus) return [];

    const results = globallyFilteredResults.filter((r: Result) => {
      if (r.error) return false;
      if (sourcesProviderFilter !== 'all' && r.provider !== sourcesProviderFilter) return false;
      return true;
    });

    const sourceData: Record<string, {
      domain: string;
      urlCounts: Map<string, { url: string; title: string; count: number; providers: Set<string> }>;
      count: number;
      providers: Set<string>;
      brands: Set<string>;
    }> = {};

    for (const result of results) {
      if (result.sources && result.sources.length > 0) {
        const resultBrands: string[] = [];
        if (result.brand_mentioned && runStatus.brand) {
          resultBrands.push(runStatus.brand);
        }
        if (result.competitors_mentioned) {
          resultBrands.push(...result.competitors_mentioned);
        }

        const seenUrlsInResponse = new Set<string>();
        const uniqueSourcesInResponse = result.sources.filter((source: { url?: string }) => {
          if (!source.url || seenUrlsInResponse.has(source.url)) return false;
          seenUrlsInResponse.add(source.url);
          return true;
        });

        for (const source of uniqueSourcesInResponse) {
          if (!source.url) continue;
          const domain = getDomain(source.url);
          if (!sourceData[domain]) {
            sourceData[domain] = {
              domain,
              urlCounts: new Map(),
              count: 0,
              providers: new Set(),
              brands: new Set(),
            };
          }
          const existingUrl = sourceData[domain].urlCounts.get(source.url);
          if (existingUrl) {
            existingUrl.count += 1;
            existingUrl.providers.add(result.provider);
          } else {
            sourceData[domain].urlCounts.set(source.url, {
              url: source.url,
              title: source.title || source.url,
              count: 1,
              providers: new Set([result.provider]),
            });
          }
          sourceData[domain].count += 1;
          sourceData[domain].providers.add(result.provider);
          resultBrands.forEach(brand => sourceData[domain].brands.add(brand));
        }
      }
    }

    return Object.values(sourceData)
      .filter(s => {
        if (sourcesBrandFilter === 'all') return true;
        return s.brands.has(sourcesBrandFilter);
      })
      .map(s => {
        const urlDetails = Array.from(s.urlCounts.values())
          .map(u => ({
            url: u.url,
            title: u.title,
            count: u.count,
            providers: Array.from(u.providers),
          }))
          .sort((a, b) => b.count - a.count);
        return {
          domain: s.domain,
          url: urlDetails[0]?.url || '',
          urlDetails,
          count: s.count,
          providers: Array.from(s.providers),
          title: urlDetails[0]?.title || s.domain,
          brands: Array.from(s.brands),
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [runStatus, globallyFilteredResults, sourcesProviderFilter, sourcesBrandFilter]);

  // Check if there are any sources at all
  const hasAnySources = useMemo(() => {
    if (!runStatus) return false;
    return globallyFilteredResults.some((r: Result) => !r.error && r.sources && r.sources.length > 0);
  }, [runStatus, globallyFilteredResults]);

  // Key influencers - sources cited by multiple providers
  const [expandedInfluencers, setExpandedInfluencers] = useState<Set<string>>(new Set());

  const keyInfluencers = useMemo(() => {
    if (!runStatus) return [];

    const results = globallyFilteredResults.filter((r: Result) => !r.error);

    const sourceData: Record<string, {
      domain: string;
      urlCounts: Map<string, { url: string; title: string; count: number }>;
      count: number;
      providers: Set<string>;
    }> = {};

    for (const result of results) {
      if (result.sources && result.sources.length > 0) {
        const seenUrlsInResponse = new Set<string>();
        const uniqueSourcesInResponse = result.sources.filter((source: { url?: string }) => {
          if (!source.url || seenUrlsInResponse.has(source.url)) return false;
          seenUrlsInResponse.add(source.url);
          return true;
        });

        for (const source of uniqueSourcesInResponse) {
          if (!source.url) continue;
          const domain = getDomain(source.url);
          if (!sourceData[domain]) {
            sourceData[domain] = {
              domain,
              urlCounts: new Map(),
              count: 0,
              providers: new Set(),
            };
          }
          const existingUrl = sourceData[domain].urlCounts.get(source.url);
          if (existingUrl) {
            existingUrl.count += 1;
          } else {
            sourceData[domain].urlCounts.set(source.url, {
              url: source.url,
              title: source.title || source.url,
              count: 1,
            });
          }
          sourceData[domain].count += 1;
          sourceData[domain].providers.add(result.provider);
        }
      }
    }

    return Object.values(sourceData)
      .filter(s => s.providers.size >= 2)
      .map(s => {
        const urlDetails = Array.from(s.urlCounts.values())
          .sort((a, b) => b.count - a.count);
        return {
          domain: s.domain,
          url: urlDetails[0]?.url || '',
          urlDetails,
          count: s.count,
          providers: Array.from(s.providers),
          title: urlDetails[0]?.title || s.domain,
        };
      })
      .sort((a, b) => {
        if (b.providers.length !== a.providers.length) {
          return b.providers.length - a.providers.length;
        }
        return b.count - a.count;
      })
      .slice(0, 5);
  }, [runStatus, globallyFilteredResults]);

  // Calculate ranking data for scatter plot - one dot per prompt per LLM
  // Centralized rank band constant - used for Y-axis, band rendering, tooltip mapping
  // Order: index 0 = best rank, index 5 = not mentioned (renders top to bottom with reversed axis)
  const RANK_BANDS = ['Top result (#1)', 'Shown 2–3', 'Shown 4–5', 'Shown 6–10', 'Shown after top 10', 'Not shown'] as const;

  // Range chart X-axis labels - individual positions 1-9, then Shown after top 10, then Not shown
  const RANGE_X_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Shown after top 10', 'Not shown'] as const;

  // Helper to convert rank to Range chart X position (0-10)
  const rankToRangeX = (rank: number): number => {
    if (rank === 0) return 10; // Not shown
    if (rank >= 10) return 9; // Shown after 10
    return rank - 1; // 1-9 map to indices 0-8
  };

  // Helper function to convert position to rank band (Fix 1)
  const positionToRankBand = (position: number | null | undefined, brandMentioned: boolean): { label: string; index: number } => {
    if (!brandMentioned || position === null || position === undefined || position === 0) {
      return { label: 'Not shown', index: 5 };
    }
    if (position === 1) return { label: '1 (Top)', index: 0 };
    if (position >= 2 && position <= 3) return { label: '2–3', index: 1 };
    if (position >= 4 && position <= 5) return { label: '4–5', index: 2 };
    if (position >= 6 && position <= 10) return { label: '6–10', index: 3 };
    return { label: 'Shown after top 10', index: 4 };
  };

  const providerLabels: Record<string, string> = {
    openai: 'OpenAI',
    anthropic: 'Claude',
    gemini: 'Gemini',
    perplexity: 'Perplexity',
    ai_overviews: 'Google AI Overviews',
  };

  // Get unique providers in alphabetical order by display name for X-axis
  const scatterProviderOrder = useMemo(() => {
    if (!runStatus) return [];
    const providers = new Set<string>();
    globallyFilteredResults.forEach((r: Result) => {
      if (!r.error) providers.add(r.provider);
    });
    // Alphabetical order by display name: Claude, Gemini, Google AI Overviews, OpenAI, Perplexity
    const order = ['anthropic', 'gemini', 'ai_overviews', 'openai', 'perplexity'];
    return order.filter(p => providers.has(p));
  }, [runStatus, globallyFilteredResults]);

  const scatterPlotData = useMemo(() => {
    if (!runStatus || scatterProviderOrder.length === 0) return [];

    const isCategory = runStatus.search_type === 'category';
    const selectedBrand = isCategory ? llmBreakdownBrands[0] : runStatus.brand;
    if (!selectedBrand) return [];

    const results = globallyFilteredResults.filter((r: Result) => !r.error);

    // Create one data point per result
    const dataPoints: {
      provider: string;
      label: string;
      prompt: string;
      rank: number;
      rankBand: string;
      rankBandIndex: number;
      xIndex: number;
      xIndexWithOffset: number;
      isMentioned: boolean;
      sentiment: string | null;
      originalResult: Result;
    }[] = [];

    for (const result of results) {
      const provider = result.provider;
      let rank = 0; // 0 means not mentioned

      if (result.response_text) {
        const brandLower = selectedBrand.toLowerCase();

        // Check if brand is mentioned
        const isMentioned = isCategory
          ? result.competitors_mentioned?.includes(selectedBrand)
          : result.brand_mentioned;

        if (isMentioned) {
          // Use all_brands_mentioned if available (includes all detected brands),
          // otherwise fall back to tracked brands only
          const allBrands = result.all_brands_mentioned && result.all_brands_mentioned.length > 0
            ? result.all_brands_mentioned
            : [runStatus.brand, ...(result.competitors_mentioned || [])].filter(Boolean);

          // Find position of selected brand in the ordered list
          rank = allBrands.findIndex(b => b.toLowerCase() === brandLower) + 1;
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
        sentiment: result.brand_sentiment || null,
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
  }, [runStatus, globallyFilteredResults, llmBreakdownBrands, scatterProviderOrder]);

  // Compute range stats for each LLM
  const rangeChartData = useMemo(() => {
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

    // Sort providers alphabetically by display label, then map to chart data
    const alphabeticalOrder = ['anthropic', 'gemini', 'ai_overviews', 'openai', 'perplexity'];
    const sortedProviders = Object.values(providerStats).sort((a, b) => {
      return alphabeticalOrder.indexOf(a.provider) - alphabeticalOrder.indexOf(b.provider);
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
      // rank 1-9 -> position 0-8, rank 10-10.99 -> position 9 ("Shown after top 10"), rank 11 -> position 10 ("Not shown")
      const rankToXPosition = (rank: number): number => {
        if (rank <= 9) return rank - 1;
        if (rank < 11) return 9; // Anything between 10 and 11 stays in "Shown after top 10"
        return 10;
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
  }, [scatterPlotData, runStatus]);

  // Get unique providers for Range view Y-axis (in consistent order)
  const rangeProviderOrder = useMemo(() => {
    return rangeChartData.map(d => d.provider);
  }, [rangeChartData]);

  // Dots data for Range view - uses actual rank positions (1-9, 10+, Not mentioned)
  const rangeViewDots = useMemo(() => {
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
  }, [scatterPlotData, rangeProviderOrder]);

  // Overview metrics
  const overviewMetrics = useMemo(() => {
    if (!runStatus) return null;

    const isCategory = runStatus.search_type === 'category';
    const results = globallyFilteredResults.filter((r: Result) => !r.error);
    const selectedBrand = isCategory ? llmBreakdownBrands[0] : runStatus.brand;

    // Overall visibility score
    let mentionedCount = 0;
    for (const result of results) {
      const isMentioned = isCategory
        ? result.competitors_mentioned?.includes(selectedBrand || '')
        : result.brand_mentioned;
      if (isMentioned) mentionedCount++;
    }
    const overallVisibility = results.length > 0 ? (mentionedCount / results.length) * 100 : 0;

    // Top position count (brand mentioned first)
    let topPositionCount = 0;
    for (const result of results) {
      if (!result.response_text) continue;

      // Use all_brands_mentioned if available (includes all detected brands)
      const allBrands = result.all_brands_mentioned && result.all_brands_mentioned.length > 0
        ? result.all_brands_mentioned
        : [runStatus.brand, ...(result.competitors_mentioned || [])].filter(Boolean);

      // First brand in the ordered list is the top position
      if (allBrands.length > 0 && selectedBrand && allBrands[0].toLowerCase() === selectedBrand.toLowerCase()) {
        topPositionCount++;
      }
    }

    // Average rank
    const ranks: number[] = [];
    for (const result of results) {
      if (!result.response_text) continue;

      // Use all_brands_mentioned if available (includes all detected brands)
      const allBrands = result.all_brands_mentioned && result.all_brands_mentioned.length > 0
        ? result.all_brands_mentioned
        : [runStatus.brand, ...(result.competitors_mentioned || [])].filter(Boolean);

      if (selectedBrand) {
        const rank = allBrands.findIndex(b => b.toLowerCase() === selectedBrand.toLowerCase()) + 1;
        if (rank > 0) ranks.push(rank);
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
      const competitors = result.competitors_mentioned || [];
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

    return {
      overallVisibility,
      shareOfVoice,
      topPositionCount,
      totalResponses: results.length,
      avgRank,
      uniqueSourcesCount: uniqueSources.size,
      totalCost: runStatus.actual_cost,
      selectedBrand,
    };
  }, [runStatus, globallyFilteredResults, llmBreakdownBrands]);

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedResults);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedResults(newExpanded);
  };

  const handleExportCSV = () => {
    if (!runStatus) return;

    const headers = [
      'Prompt',
      'LLM',
      'Model',
      'Temperature',
      'Brand Mentioned',
      'Competitors Mentioned',
      'Rank',
      'Response Type',
      'Tokens',
      'Cost',
      'Sources',
      'Response',
    ];

    const rows = globallyFilteredResults
      .filter((r: Result) => !r.error)
      .map((r: Result) => {
        // Calculate rank for this result
        let rank = '';
        if (r.response_text && r.brand_mentioned) {
          // Use all_brands_mentioned if available (includes all detected brands)
          const allBrands = r.all_brands_mentioned && r.all_brands_mentioned.length > 0
            ? r.all_brands_mentioned
            : [runStatus.brand, ...(r.competitors_mentioned || [])].filter(Boolean);

          const brandRank = allBrands.findIndex(b => b.toLowerCase() === runStatus.brand.toLowerCase()) + 1;
          if (brandRank > 0) rank = String(brandRank);
        }

        return [
          `"${r.prompt.replace(/"/g, '""')}"`,
          r.provider,
          r.model,
          r.temperature,
          r.brand_mentioned ? 'Yes' : 'No',
          `"${r.competitors_mentioned.join(', ')}"`,
          rank,
          r.response_type || '',
          r.tokens || '',
          r.cost || '',
          `"${(r.sources || []).map(s => s.url).join(', ')}"`,
          `"${(r.response_text || '').replace(/"/g, '""')}"`,
        ];
      });

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `visibility-results-${runStatus.brand}-${runId.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[#FAFAF8] flex items-center justify-center">
        <div className="text-center">
          <Spinner size="lg" />
          <p className="mt-4 text-gray-500">Loading results...</p>
        </div>
      </main>
    );
  }

  if (error || !runStatus) {
    return (
      <main className="min-h-screen bg-[#FAFAF8] flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 max-w-md w-full text-center p-8">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            Failed to load results
          </h1>
          <p className="text-gray-500 mb-6">
            {error instanceof Error ? error.message : 'Results not found'}
          </p>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-3 bg-[#4A7C59] text-white font-medium rounded-xl hover:bg-[#3d6649] transition-colors"
          >
            Start New Analysis
          </button>
        </div>
      </main>
    );
  }

  const summary = runStatus.summary;
  const brandMentionRate = summary?.brand_mention_rate ?? 0;
  const isCategory = runStatus.search_type === 'category';

  const getMentionRateColor = (rate: number) => {
    if (rate >= 0.7) return 'text-[#4A7C59]';
    if (rate >= 0.4) return 'text-yellow-600';
    return 'text-red-500';
  };

  const getMentionRateBgColor = (rate: number) => {
    if (rate >= 0.7) return 'bg-[#5B7B5D]';
    if (rate >= 0.4) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getProviderLabel = (provider: string) => {
    switch (provider) {
      case 'openai': return 'OpenAI GPT-4o';
      case 'anthropic': return 'Anthropic Claude';
      case 'perplexity': return 'Perplexity Sonar';
      case 'ai_overviews': return 'Google AI Overviews';
      case 'gemini': return 'Google Gemini';
      default: return provider;
    }
  };

  const getProviderShortLabel = (provider: string) => {
    switch (provider) {
      case 'openai': return 'GPT';
      case 'anthropic': return 'Claude';
      case 'perplexity': return 'Pplx';
      case 'ai_overviews': return 'AIO';
      case 'gemini': return 'Gem';
      default: return provider;
    }
  };

  // Overview Tab Content
  const OverviewTab = () => (
    <div className="space-y-6">
      {/* AI Summary */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#4A7C59]" />
            <h2 className="text-base font-semibold text-gray-900">AI Analysis</h2>
          </div>
          {aiSummary?.summary && (
            <button
              onClick={() => setAiSummaryExpanded(!aiSummaryExpanded)}
              className="inline-flex items-center gap-1 text-sm text-[#4A7C59] hover:text-[#3d6649] font-medium"
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
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiSummary.summary.replace(/\bai_overviews\b/gi, 'Google AI Overviews')}</ReactMarkdown>
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
              className="text-sm text-[#4A7C59] hover:text-[#3d6649] font-medium"
            >
              Read full analysis →
            </button>
          </div>
        )}
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3">
          <p className="text-sm font-medium text-gray-600 mb-1">Visibility Score</p>
          <p className={`text-2xl font-bold ${getMentionRateColor(overviewMetrics?.overallVisibility ? overviewMetrics.overallVisibility / 100 : 0)}`}>
            {overviewMetrics?.overallVisibility?.toFixed(1) || 0}%
          </p>
          <p className="text-xs text-gray-400 mt-1">Percent of prompts where brand is mentioned</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3">
          <p className="text-sm font-medium text-gray-600 mb-1">Share of Voice</p>
          <p className="text-2xl font-bold text-gray-900">
            {overviewMetrics?.shareOfVoice?.toFixed(1) || 0}%
          </p>
          <p className="text-xs text-gray-400 mt-1">Percent of brand mentions that are yours</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3">
          <p className="text-sm font-medium text-gray-600 mb-1">First Position</p>
          <p className="text-2xl font-bold text-gray-900">
            {overviewMetrics?.topPositionCount || 0}
            <span className="text-sm font-normal text-gray-400">/{overviewMetrics?.totalResponses || 0}</span>
          </p>
          <p className="text-xs text-gray-400 mt-1">Responses where brand is ranked first</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3">
          <p className="text-sm font-medium text-gray-600 mb-1">Avg. Rank</p>
          <p className="text-2xl font-bold text-gray-900">
            {overviewMetrics?.avgRank?.toFixed(1) || 'n/a'}
          </p>
          <p className="text-xs text-gray-400 mt-1">Average position when brand is mentioned</p>
        </div>
      </div>

      {/* Charts Section with Tabs */}
      {scatterPlotData.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          {/* Chart Tabs */}
          <div className="flex items-center gap-1 mb-4 border-b border-gray-200">
            <button
              onClick={() => setChartTab('allAnswers')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                chartTab === 'allAnswers'
                  ? 'border-[#4A7C59] text-[#4A7C59]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              All Answers
            </button>
            <button
              onClick={() => setChartTab('performanceRange')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                chartTab === 'performanceRange'
                  ? 'border-[#4A7C59] text-[#4A7C59]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Performance Range
            </button>
            <button
              onClick={() => setChartTab('shareOfVoice')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                chartTab === 'shareOfVoice'
                  ? 'border-[#4A7C59] text-[#4A7C59]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Share of Voice
            </button>
          </div>

          {/* All Answers Chart */}
          {chartTab === 'allAnswers' && (
            <>
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm text-gray-500">Where your brand shows up in individual AI answers</p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-xs text-gray-500">Show sentiment</span>
                  <button
                    onClick={() => setShowSentimentColors(!showSentimentColors)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      showSentimentColors ? 'bg-[#4A7C59]' : 'bg-gray-300'
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
              <p className="text-xs text-gray-400 mb-3">
                Each dot is one answer to one prompt. Lower numbers mean your brand is shown earlier.
              </p>

              {/* Key takeaway */}
              {(() => {
                const totalAnswers = scatterPlotData.length;
                const mentionedCount = scatterPlotData.filter(d => d.isMentioned).length;
                const notMentionedCount = totalAnswers - mentionedCount;
                const topPositionCount = scatterPlotData.filter(d => d.rank === 1).length;
                const top3Count = scatterPlotData.filter(d => d.rank >= 1 && d.rank <= 3).length;
                const mentionRate = totalAnswers > 0 ? (mentionedCount / totalAnswers) * 100 : 0;
                const topPositionRate = mentionedCount > 0 ? (topPositionCount / mentionedCount) * 100 : 0;

                let takeaway = '';
                if (mentionRate < 30) {
                  takeaway = `Your brand appears in only ${mentionRate.toFixed(0)}% of AI answers—there's room to improve visibility.`;
                } else if (topPositionRate > 50 && mentionRate > 50) {
                  takeaway = `Strong performance: your brand is the top result in ${topPositionRate.toFixed(0)}% of answers where it appears.`;
                } else if (topPositionCount > 0 && top3Count > mentionedCount * 0.6) {
                  takeaway = `Your brand typically appears in the top 3 positions when mentioned.`;
                } else if (notMentionedCount > mentionedCount) {
                  takeaway = `Your brand is not shown in ${notMentionedCount} of ${totalAnswers} answers—consider optimizing for AI visibility.`;
                } else if (mentionRate > 70) {
                  takeaway = `Good visibility: your brand appears in ${mentionRate.toFixed(0)}% of AI answers.`;
                } else {
                  takeaway = `Your brand appears in ${mentionedCount} of ${totalAnswers} AI answers across all platforms.`;
                }

                return (
                  <div className="bg-[#FAFAF8] rounded-lg px-3 py-2 mb-4">
                    <p className="text-xs text-gray-600">
                      <span className="font-medium text-gray-700">Key takeaway:</span> {takeaway}
                    </p>
                  </div>
                );
              })()}

              <div>
                  {/* Legend for All Answers view - shows sentiment when toggle is on */}
                  <div className="flex items-center justify-center gap-4 pl-[140px] mb-[-14px]">
                    {showSentimentColors ? (
                      <>
                        <div className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-full bg-green-500 opacity-80" />
                          <span className="text-xs text-gray-500">Very Favorable</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-full bg-lime-500 opacity-80" />
                          <span className="text-xs text-gray-500">Favorable</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-full bg-gray-500 opacity-60" />
                          <span className="text-xs text-gray-500">Neutral</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-full bg-orange-400 opacity-80" />
                          <span className="text-xs text-gray-500">Conditional</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-full bg-red-400 opacity-80" />
                          <span className="text-xs text-gray-500">Negative</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-2 h-2 rounded-full bg-gray-500 opacity-60" />
                        <span className="text-xs text-gray-400">Each dot = one answer</span>
                      </>
                    )}
                  </div>
                  <div className="h-72 [&_.recharts-surface]:outline-none [&_.recharts-wrapper]:outline-none [&_svg]:outline-none [&_svg]:focus:outline-none [&_*]:focus:outline-none [&_*]:focus-visible:outline-none">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 20, right: 20, bottom: 40, left: 100 }}>
                      {/* Horizontal band shading - lighter than Range view for detail scatter feel */}
                      <ReferenceArea y1={-0.5} y2={0.5} fill="#bbf7d0" fillOpacity={0.45} />
                      <ReferenceArea y1={0.5} y2={1.5} fill="#fef08a" fillOpacity={0.3} />
                      <ReferenceArea y1={1.5} y2={2.5} fill="#fef08a" fillOpacity={0.2} />
                      <ReferenceArea y1={2.5} y2={3.5} fill="#fed7aa" fillOpacity={0.25} />
                      <ReferenceArea y1={3.5} y2={4.5} fill="#fecaca" fillOpacity={0.25} />
                      <ReferenceArea y1={4.5} y2={5.5} fill="#e5e7eb" fillOpacity={0.3} />
                      {/* Divider line above "Not mentioned" band */}
                      <ReferenceLine y={4.5} stroke="#9ca3af" strokeWidth={1} strokeDasharray="4 4" />
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={true} horizontal={false} />
                      <XAxis
                        type="number"
                        dataKey="xIndexWithOffset"
                        domain={[-0.5, scatterProviderOrder.length - 0.5]}
                        tick={(props: any) => {
                          const { x, y, payload } = props;
                          const provider = scatterProviderOrder[Math.round(payload?.value ?? 0)];
                          const label = provider ? (providerLabels[provider] || provider) : '';
                          return (
                            <text
                              x={x}
                              y={y + 12}
                              textAnchor="middle"
                              fill="#6b7280"
                              fontSize={12}
                            >
                              {label}
                            </text>
                          );
                        }}
                        ticks={scatterProviderOrder.map((_, i) => i)}
                        axisLine={{ stroke: '#e5e7eb' }}
                        tickLine={false}
                        interval={0}
                      />
                      <YAxis
                        type="number"
                        dataKey="rankBandIndex"
                        name="Rank"
                        domain={[-0.5, RANK_BANDS.length - 0.5]}
                        reversed
                        tick={(props: any) => {
                          const { x, y, payload } = props;
                          const label = RANK_BANDS[Math.round(payload?.value ?? 0)] || '';
                          const isNotMentioned = label === 'Not shown';
                          return (
                            <text
                              x={x}
                              y={y}
                              dy={4}
                              textAnchor="end"
                              fill={isNotMentioned ? '#9ca3af' : '#6b7280'}
                              fontSize={12}
                              fontStyle={isNotMentioned ? 'italic' : 'normal'}
                            >
                              {label}
                            </text>
                          );
                        }}
                        axisLine={{ stroke: '#e5e7eb' }}
                        ticks={RANK_BANDS.map((_, i) => i)}
                        interval={0}
                      />
                      <Tooltip
                        cursor={false}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            const truncatedPrompt = data.prompt.length > 70
                              ? data.prompt.substring(0, 70) + '...'
                              : data.prompt;
                            return (
                              <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg min-w-[180px] max-w-[280px]">
                                <p className="text-sm font-semibold text-gray-900 mb-1">
                                  {data.label}
                                </p>
                                <p className="text-sm text-gray-700">
                                  {data.rank === 0
                                    ? 'Not shown'
                                    : data.rank === 1
                                      ? 'Shown as: #1 (Top result)'
                                      : `Shown as: #${data.rank}`}
                                </p>
                                {showSentimentColors && data.sentiment && data.sentiment !== 'not_mentioned' && (
                                  <p className={`text-xs mt-1 ${
                                    data.sentiment === 'strong_endorsement' ? 'text-green-600' :
                                    data.sentiment === 'positive_endorsement' ? 'text-lime-600' :
                                    data.sentiment === 'neutral_mention' ? 'text-gray-600' :
                                    data.sentiment === 'conditional' ? 'text-orange-500' :
                                    data.sentiment === 'negative_comparison' ? 'text-red-500' : ''
                                  }`}>
                                    {data.sentiment === 'strong_endorsement' ? 'Very Favorable' :
                                     data.sentiment === 'positive_endorsement' ? 'Favorable' :
                                     data.sentiment === 'neutral_mention' ? 'Neutral Mention' :
                                     data.sentiment === 'conditional' ? 'Conditional/Caveated' :
                                     data.sentiment === 'negative_comparison' ? 'Negative Comparison' : ''}
                                  </p>
                                )}
                                <p className="text-xs text-gray-500 mt-2" title={data.prompt}>
                                  {truncatedPrompt}
                                </p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Scatter
                        data={scatterPlotData}
                        fill="#6b7280"
                        shape={(props: any) => {
                          const { cx, cy, payload } = props;
                          // Sentiment colors: green=strong, gray=neutral, orange=conditional, red=negative
                          let fillColor = '#6b7280'; // default gray
                          let opacity = payload.isMentioned ? 0.6 : 0.25;

                          if (showSentimentColors && payload.sentiment) {
                            switch (payload.sentiment) {
                              case 'strong_endorsement':
                                fillColor = '#22c55e'; // green-500
                                opacity = 0.8;
                                break;
                              case 'positive_endorsement':
                                fillColor = '#84cc16'; // lime-500
                                opacity = 0.8;
                                break;
                              case 'neutral_mention':
                                fillColor = '#6b7280'; // gray-500
                                opacity = 0.6;
                                break;
                              case 'conditional':
                                fillColor = '#fb923c'; // orange-400
                                opacity = 0.8;
                                break;
                              case 'negative_comparison':
                                fillColor = '#f87171'; // red-400
                                opacity = 0.8;
                                break;
                              case 'not_mentioned':
                                fillColor = '#d1d5db'; // gray-300
                                opacity = 0.4;
                                break;
                            }
                          }

                          return (
                            <circle
                              cx={cx}
                              cy={cy}
                              r={5}
                              fill={fillColor}
                              opacity={opacity}
                              style={{ cursor: 'pointer' }}
                              onDoubleClick={() => setSelectedResult(payload.originalResult)}
                            />
                          );
                        }}
                      />
                    </ScatterChart>
                  </ResponsiveContainer>
                  </div>
                </div>
            </>
          )}

          {/* Performance Range Chart */}
          {chartTab === 'performanceRange' && rangeChartData.length > 0 && (
            <>
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm text-gray-500">Where your brand appears in AI-generated answers</p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-xs text-gray-500">Show sentiment</span>
                  <button
                    onClick={() => setShowSentimentColors(!showSentimentColors)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      showSentimentColors ? 'bg-[#4A7C59]' : 'bg-gray-300'
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
              <p className="text-xs text-gray-400 mb-3">
                Each row shows how an AI typically positions your brand. The bar spans from best to worst placement.
              </p>

              {/* Key takeaway */}
              {(() => {
                // Find best and worst performing LLMs (lower avgRanking = better)
                const sortedByAvg = [...rangeChartData].sort((a, b) => a.avgRanking - b.avgRanking);
                const bestLLM = sortedByAvg[0];
                const worstLLM = sortedByAvg[sortedByAvg.length - 1];

                // Check for consistency (small range = consistent)
                // bestBandIndex 0 = #1, worstBandIndex 5 = Not shown
                const avgRanges = rangeChartData.map(d => d.worstBandIndex - d.bestBandIndex);
                const overallAvgRange = avgRanges.reduce((a, b) => a + b, 0) / avgRanges.length;

                // Check if any LLM has top position as best (bestBandIndex 0 = #1)
                const hasTopPosition = rangeChartData.some(d => d.bestBandIndex === 0);
                const allHaveTopPosition = rangeChartData.every(d => d.bestBandIndex === 0);

                // Calculate overall average
                const overallAvg = rangeChartData.reduce((sum, d) => sum + d.avgRanking, 0) / rangeChartData.length;

                let takeaway = '';
                if (sortedByAvg.length === 1) {
                  takeaway = `${bestLLM.label} positions your brand at #${bestLLM.avgRanking.toFixed(1)} on average.`;
                } else if (bestLLM.avgRanking <= 2 && worstLLM.avgRanking <= 3) {
                  takeaway = `Excellent: all AI platforms rank your brand in the top 3 on average.`;
                } else if (bestLLM.avgRanking <= 2) {
                  takeaway = `${bestLLM.label} ranks your brand highest (avg #${bestLLM.avgRanking.toFixed(1)}), while ${worstLLM.label} ranks lowest.`;
                } else if (overallAvgRange < 2 && overallAvg < 5) {
                  takeaway = `Your brand's position is fairly consistent across platforms (avg #${overallAvg.toFixed(1)}).`;
                } else if (allHaveTopPosition) {
                  takeaway = `Your brand reaches the #1 position on all platforms at least once.`;
                } else if (hasTopPosition) {
                  const topPlatforms = rangeChartData.filter(d => d.bestBandIndex === 0).map(d => d.label);
                  takeaway = `Your brand reaches #1 on ${topPlatforms.slice(0, 2).join(' and ')}${topPlatforms.length > 2 ? ` and ${topPlatforms.length - 2} more` : ''}.`;
                } else {
                  takeaway = `${bestLLM.label} gives your brand the best visibility with an average position of #${bestLLM.avgRanking.toFixed(1)}.`;
                }

                return (
                  <div className="bg-[#FAFAF8] rounded-lg px-3 py-2 mb-4">
                    <p className="text-xs text-gray-600">
                      <span className="font-medium text-gray-700">Key takeaway:</span> {takeaway}
                    </p>
                  </div>
                );
              })()}

                <div>
                  {/* Chart elements legend - above chart */}
                  <div className="flex items-center justify-center flex-wrap gap-4 pl-[60px] mb-2">
                    {!showSentimentColors && (
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-gray-500 opacity-70" />
                        <span className="text-xs text-gray-500">Individual answer</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-3 bg-gray-500 opacity-30 rounded" />
                      <span className="text-xs text-gray-500">Best–worst range</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        style={{
                          width: 0,
                          height: 0,
                          borderLeft: '3px solid transparent',
                          borderRight: '3px solid transparent',
                          borderBottom: '5px solid rgba(96, 165, 250, 0.7)',
                        }}
                      />
                      <span className="text-xs text-gray-500">Average</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        style={{
                          width: '5px',
                          height: '5px',
                          backgroundColor: 'rgba(251, 146, 60, 0.7)',
                          transform: 'rotate(45deg)',
                        }}
                      />
                      <span className="text-xs text-gray-500">Median</span>
                    </div>
                  </div>

                  {/* Chart with sentiment legend on right */}
                  <div className="flex gap-4">
                    <div
                      className="relative flex-1 [&_.recharts-surface]:outline-none [&_.recharts-wrapper]:outline-none [&_svg]:outline-none [&_svg]:focus:outline-none [&_*]:focus:outline-none [&_*]:focus-visible:outline-none"
                      style={{ height: Math.max(250, rangeChartData.length * 60 + 80) }}
                    >
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={rangeChartData}
                        layout="vertical"
                        margin={{ top: 20, right: 30, bottom: 50, left: 100 }}
                      >
                        {/* Background color bands - green for top ranks, yellow for mid, red for low, gray for not mentioned */}
                        <ReferenceArea x1={-0.5} x2={0.5} fill="#bbf7d0" fillOpacity={0.4} /> {/* 1 */}
                        <ReferenceArea x1={0.5} x2={1.5} fill="#bbf7d0" fillOpacity={0.3} /> {/* 2 */}
                        <ReferenceArea x1={1.5} x2={2.5} fill="#bbf7d0" fillOpacity={0.2} /> {/* 3 */}
                        <ReferenceArea x1={2.5} x2={3.5} fill="#fef08a" fillOpacity={0.2} /> {/* 4 */}
                        <ReferenceArea x1={3.5} x2={4.5} fill="#fef08a" fillOpacity={0.15} /> {/* 5 */}
                        <ReferenceArea x1={4.5} x2={5.5} fill="#fed7aa" fillOpacity={0.2} /> {/* 6 */}
                        <ReferenceArea x1={5.5} x2={6.5} fill="#fed7aa" fillOpacity={0.15} /> {/* 7 */}
                        <ReferenceArea x1={6.5} x2={7.5} fill="#fecaca" fillOpacity={0.15} /> {/* 8 */}
                        <ReferenceArea x1={7.5} x2={8.5} fill="#fecaca" fillOpacity={0.2} /> {/* 9 */}
                        <ReferenceArea x1={8.5} x2={9.5} fill="#fecaca" fillOpacity={0.25} /> {/* 10+ */}
                        <ReferenceArea x1={9.5} x2={10.5} fill="#f3f4f6" fillOpacity={0.5} /> {/* Not mentioned */}
                        {/* Divider line before "Not mentioned" */}
                        <ReferenceLine x={9.5} stroke="#d1d5db" strokeWidth={1} />
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} vertical={true} />
                        <YAxis
                          type="category"
                          dataKey="label"
                          tick={{ fontSize: 12, fill: '#374151' }}
                          axisLine={{ stroke: '#e5e7eb' }}
                          tickLine={false}
                        />
                        <XAxis
                          type="number"
                          domain={[-0.5, RANGE_X_LABELS.length - 0.5]}
                          tick={(props: any) => {
                            const { x, y, payload } = props;
                            const label = RANGE_X_LABELS[Math.round(payload?.value ?? 0)] || '';
                            const isNotMentioned = label === 'Not shown';
                            const isAfterTop10 = label === 'Shown after top 10';

                            // Split "Shown after top 10" into two lines
                            if (isAfterTop10) {
                              return (
                                <text
                                  x={x}
                                  y={y + 8}
                                  textAnchor="middle"
                                  fill="#6b7280"
                                  fontSize={11}
                                >
                                  <tspan x={x} dy="0">Shown after</tspan>
                                  <tspan x={x} dy="12">top 10</tspan>
                                </text>
                              );
                            }

                            return (
                              <text
                                x={x}
                                y={y + 12}
                                textAnchor="middle"
                                fill={isNotMentioned ? '#9ca3af' : '#6b7280'}
                                fontSize={11}
                                fontStyle={isNotMentioned ? 'italic' : 'normal'}
                              >
                                {label}
                              </text>
                            );
                          }}
                          axisLine={{ stroke: '#e5e7eb' }}
                          tickLine={false}
                          ticks={RANGE_X_LABELS.map((_, i) => i)}
                          interval={0}
                          label={{
                            value: 'Position in the AI answer (lower = shown earlier)',
                            position: 'bottom',
                            offset: 5,
                            style: { fontSize: 11, fill: '#9ca3af' }
                          }}
                        />
                        <Tooltip
                          cursor={false}
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload;

                              // Format position for display
                              const formatPosition = (rangeX: number): string => {
                                if (rangeX === 10) return 'Not shown';
                                if (rangeX === 9) return '#10+';
                                return `#${rangeX + 1}`;
                              };

                              // Format average as absolute number
                              const formatAverage = (avg: number): string => {
                                return avg.toFixed(1);
                              };

                              const bestPos = formatPosition(data.bestRangeX);
                              const worstPos = formatPosition(data.worstRangeX);
                              const avgPos = formatAverage(data.avgRanking);

                              // Add "(some prompts)" if worst is "Not shown"
                              const worstDisplay = data.worstRangeX === 10
                                ? 'Not shown (some prompts)'
                                : worstPos;

                              return (
                                <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg min-w-[220px]">
                                  <p className="text-sm font-semibold text-gray-900 mb-2">{data.label}</p>
                                  <div className="space-y-1">
                                    <p className="text-sm text-gray-700">
                                      Best position shown: {bestPos}
                                    </p>
                                    <p className="text-sm text-gray-700">
                                      Average position: {avgPos}
                                    </p>
                                    <p className="text-sm text-gray-700">
                                      Worst position shown: {worstDisplay}
                                    </p>
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        {/* Range bar: invisible spacer + visible range */}
                        <Bar dataKey="rangeStart" stackId="range" fill="transparent" barSize={20} />
                        <Bar
                          dataKey="rangeHeight"
                          stackId="range"
                          fill="#6b7280"
                          fillOpacity={0.3}
                          radius={[4, 4, 4, 4]}
                          barSize={20}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                    {/* Dots overlay - positioned absolutely over the chart plotting area */}
                    {rangeViewDots.length > 0 && (() => {
                      // Chart margins matching ComposedChart margin prop
                      const margin = { top: 20, right: 30, bottom: 50, left: 100 };
                      const yAxisWidth = 60; // Recharts default YAxis width when not specified
                      const xAxisHeight = 30; // Estimated height of X-axis with labels
                      const numProviders = rangeChartData.length;

                      // Domain is [-0.5, 10.5] - total range of 11 units
                      const domainMin = -0.5;
                      const domainMax = RANGE_X_LABELS.length - 0.5; // 10.5
                      const domainRange = domainMax - domainMin; // 11

                      // Calculate plotting area bounds
                      // Left edge: margin.left + yAxisWidth (Y-axis is inside the chart area)
                      const plotLeft = margin.left + yAxisWidth;
                      // Width: container width - plotLeft - margin.right
                      const plotWidth = `calc(100% - ${plotLeft + margin.right}px)`;
                      // Height: container height - margin.top - margin.bottom - xAxisHeight
                      // The X-axis is inside the chart area, so we need to subtract its height
                      const plotHeight = `calc(100% - ${margin.top + margin.bottom + xAxisHeight}px)`;

                      return (
                        <div
                          className="absolute pointer-events-none"
                          style={{
                            top: `${margin.top}px`,
                            left: `${plotLeft}px`,
                            width: plotWidth,
                            height: plotHeight,
                          }}
                        >
                          {/* Render dots for each prompt result */}
                          {rangeViewDots.map((dot, idx) => {
                            if (dot.yIndex < 0) return null;

                            // X position: convert domain value to percentage within plotting area
                            // dot.x is in range [0, 10] with small offsets
                            // Map to percentage: (value - domainMin) / domainRange * 100
                            const xPercent = ((dot.x - domainMin) / domainRange) * 100;

                            // Y position: center dot within provider's band
                            const yPercent = ((dot.yIndex + 0.5) / numProviders) * 100;

                            return (
                              <div
                                key={`range-dot-${idx}`}
                                className="absolute pointer-events-auto group"
                                style={{
                                  left: `${xPercent}%`,
                                  top: `${yPercent}%`,
                                  transform: 'translate(-50%, -50%)',
                                }}
                              >
                                {/* Dot - styled to match Dots chart */}
                                <div
                                  className="w-3 h-3 rounded-full cursor-pointer hover:scale-125 transition-transform"
                                  style={{
                                    backgroundColor: showSentimentColors && dot.sentiment
                                      ? dot.sentiment === 'strong_endorsement' ? '#22c55e'
                                        : dot.sentiment === 'positive_endorsement' ? '#84cc16'
                                        : dot.sentiment === 'neutral_mention' ? '#6b7280'
                                        : dot.sentiment === 'conditional' ? '#fb923c'
                                        : dot.sentiment === 'negative_comparison' ? '#f87171'
                                        : '#d1d5db'
                                      : '#6b7280',
                                    opacity: showSentimentColors && dot.sentiment
                                      ? (dot.sentiment === 'not_mentioned' ? 0.4 : 0.8)
                                      : (dot.isMentioned ? 0.7 : 0.3),
                                  }}
                                  onDoubleClick={() => setSelectedResult(dot.originalResult)}
                                />
                                {/* Tooltip on hover */}
                                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block z-50">
                                  <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg min-w-[200px] text-left">
                                    <p className="text-sm font-semibold text-gray-900 mb-1">{dot.prompt}</p>
                                    <p className="text-xs text-gray-500">({dot.label})</p>
                                    <div className="mt-2 pt-2 border-t border-gray-100">
                                      <p className="text-sm text-gray-700">
                                        {dot.rank === 0 ? 'Not shown' : `Shown as result #${dot.rank}`}
                                      </p>
                                      {showSentimentColors && dot.sentiment && dot.sentiment !== 'not_mentioned' && (
                                        <p className={`text-xs mt-1 ${
                                          dot.sentiment === 'strong_endorsement' ? 'text-green-600' :
                                          dot.sentiment === 'positive_endorsement' ? 'text-lime-600' :
                                          dot.sentiment === 'neutral_mention' ? 'text-gray-600' :
                                          dot.sentiment === 'conditional' ? 'text-orange-500' :
                                          dot.sentiment === 'negative_comparison' ? 'text-red-500' : ''
                                        }`}>
                                          {dot.sentiment === 'strong_endorsement' ? 'Very Favorable' :
                                           dot.sentiment === 'positive_endorsement' ? 'Favorable' :
                                           dot.sentiment === 'neutral_mention' ? 'Neutral Mention' :
                                           dot.sentiment === 'conditional' ? 'Conditional/Caveated' :
                                           dot.sentiment === 'negative_comparison' ? 'Negative Comparison' : ''}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}

                          {/* Render average and median markers for each provider */}
                          {rangeChartData.map((data, idx) => {
                            // Skip average/median markers when there's only 1 response (no meaningful stats)
                            if (data.promptsAnalyzed === 1) return null;

                            const yPercent = ((idx + 0.5) / numProviders) * 100;
                            const avgXPercent = ((data.avgRankingX - domainMin) / domainRange) * 100;
                            const medianXPercent = ((data.medianRankingX - domainMin) / domainRange) * 100;

                            // Check if average and median are at same position (within 0.5)
                            const samePosition = Math.abs(data.avgRankingX - data.medianRankingX) < 0.5;
                            // Offset in pixels when overlapping: average higher, median lower
                            const avgYOffset = samePosition ? -6 : 0;
                            const medianYOffset = samePosition ? 6 : 0;

                            return (
                              <React.Fragment key={`markers-${idx}`}>
                                {/* Average marker - subtle blue triangle */}
                                <div
                                  className="absolute pointer-events-auto group"
                                  style={{
                                    left: `${avgXPercent}%`,
                                    top: `calc(${yPercent}% + ${avgYOffset}px)`,
                                    transform: 'translate(-50%, -50%)',
                                  }}
                                >
                                  <div
                                    className="cursor-pointer hover:scale-125 transition-transform"
                                    style={{
                                      width: 0,
                                      height: 0,
                                      borderLeft: '4px solid transparent',
                                      borderRight: '4px solid transparent',
                                      borderBottom: '6px solid rgba(96, 165, 250, 0.7)',
                                    }}
                                  />
                                  {/* Tooltip */}
                                  <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block z-50">
                                    <div className="bg-white border border-gray-200 rounded-lg p-2 shadow-lg whitespace-nowrap">
                                      <p className="text-xs text-gray-600">
                                        Avg: {data.avgRanking.toFixed(1)}
                                      </p>
                                    </div>
                                  </div>
                                </div>

                                {/* Median marker - subtle orange diamond */}
                                <div
                                  className="absolute pointer-events-auto group"
                                  style={{
                                    left: `${medianXPercent}%`,
                                    top: `calc(${yPercent}% + ${medianYOffset}px)`,
                                    transform: 'translate(-50%, -50%)',
                                  }}
                                >
                                  <div
                                    className="cursor-pointer hover:scale-125 transition-transform"
                                    style={{
                                      width: '6px',
                                      height: '6px',
                                      backgroundColor: 'rgba(251, 146, 60, 0.7)',
                                      transform: 'rotate(45deg)',
                                    }}
                                  />
                                  {/* Tooltip */}
                                  <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block z-50">
                                    <div className="bg-white border border-gray-200 rounded-lg p-2 shadow-lg whitespace-nowrap">
                                      <p className="text-xs text-gray-600">
                                        Median: {data.medianRanking.toFixed(1)}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              </React.Fragment>
                            );
                          })}
                        </div>
                      );
                    })()}
                    </div>
                    {/* Sentiment legend - right side, only when sentiment is on */}
                    {showSentimentColors && (
                      <div className="flex flex-col justify-center gap-2 pl-2 pr-4">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-full bg-green-500 opacity-80 flex-shrink-0" />
                          <span className="text-xs text-gray-500 whitespace-nowrap">Very Favorable</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-full bg-lime-500 opacity-80 flex-shrink-0" />
                          <span className="text-xs text-gray-500 whitespace-nowrap">Favorable</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-full bg-gray-500 opacity-60 flex-shrink-0" />
                          <span className="text-xs text-gray-500 whitespace-nowrap">Neutral</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-full bg-orange-400 opacity-80 flex-shrink-0" />
                          <span className="text-xs text-gray-500 whitespace-nowrap">Conditional</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-full bg-red-400 opacity-80 flex-shrink-0" />
                          <span className="text-xs text-gray-500 whitespace-nowrap">Negative</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
            </>
          )}

          {/* Share of Voice Chart */}
          {chartTab === 'shareOfVoice' && shareOfVoiceData.length > 0 && (
            <>
              {/* Title and subtitle */}
              <div className="mb-4">
                <p className="text-sm text-gray-500 mb-0.5">Share of voice across AI answers</p>
                <p className="text-xs text-gray-400">Percent of all brand mentions by brand</p>
              </div>

              {/* Key takeaway */}
              {(() => {
                const topBrand = shareOfVoiceData.find(d => !d.isOther);
                const otherData = shareOfVoiceData.find(d => d.isOther);
                const topBrandsTotal = shareOfVoiceData.filter(d => !d.isOther).reduce((sum, d) => sum + d.percentage, 0);
                const selectedBrand = runStatus?.brand;
                const selectedData = shareOfVoiceData.find(d => d.name === selectedBrand);

                let takeaway = '';
                if (otherData && otherData.percentage > 50) {
                  takeaway = 'Mentions are spread across many brands—no single brand dominates.';
                } else if (topBrand && topBrand.percentage > 30) {
                  takeaway = `${topBrand.name} leads with ${topBrand.percentage.toFixed(0)}% of all mentions.`;
                } else if (selectedData && selectedData.percentage > 0) {
                  const rank = shareOfVoiceData.filter(d => !d.isOther && d.percentage > selectedData.percentage).length + 1;
                  takeaway = `${selectedBrand} has ${selectedData.percentage.toFixed(1)}% share of voice (ranked #${rank}).`;
                } else if (topBrandsTotal > 70) {
                  takeaway = 'The top brands capture most of the mentions.';
                } else {
                  takeaway = 'Brand mentions are relatively evenly distributed.';
                }

                return (
                  <div className="bg-[#FAFAF8] rounded-lg px-3 py-2 mb-4">
                    <p className="text-xs text-gray-600">
                      <span className="font-medium text-gray-700">Key takeaway:</span> {takeaway}
                    </p>
                  </div>
                );
              })()}

              {/* Filter */}
              <div className="flex items-center justify-end mb-4">
                <select
                  value={shareOfVoiceFilter}
                  onChange={(e) => setShareOfVoiceFilter(e.target.value as 'all' | 'tracked')}
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59] focus:border-transparent"
                >
                  <option value="tracked">Tracked Brands Only</option>
                  <option value="all">All Brands</option>
                </select>
              </div>

              {/* Horizontal Bar Chart */}
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={shareOfVoiceData}
                    layout="vertical"
                    margin={{ top: 5, right: 50, bottom: 5, left: 100 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={true} vertical={false} />
                    <XAxis
                      type="number"
                      domain={[0, 'auto']}
                      tickFormatter={(value) => `${value}%`}
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                      axisLine={{ stroke: '#e5e7eb' }}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 12, fill: '#374151' }}
                      axisLine={{ stroke: '#e5e7eb' }}
                      width={95}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(0, 0, 0, 0.04)' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg">
                              <p className="text-sm font-medium text-gray-900 mb-1">{data.name}</p>
                              <p className="text-sm text-gray-700">
                                Share of voice: {data.percentage.toFixed(1)}%
                              </p>
                              <p className="text-xs text-gray-500 mt-1">
                                {data.value} mentions
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar
                      dataKey="percentage"
                      radius={[0, 4, 4, 0]}
                      label={{
                        position: 'right',
                        formatter: (value) => typeof value === 'number' ? `${value.toFixed(1)}%` : '',
                        fontSize: 11,
                        fill: '#6b7280',
                      }}
                    >
                      {shareOfVoiceData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Helper text */}
              <p className="text-xs text-gray-400 text-center mt-2">Higher % = mentioned more often</p>
            </>
          )}
        </div>
      )}


      {/* LLM Breakdown */}
      {Object.keys(llmBreakdownStats).length > 0 && llmBreakdownBrands.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">LLM Breakdown</h2>
            <select
              value={llmBreakdownBrandFilter || llmBreakdownBrands[0] || ''}
              onChange={(e) => setLlmBreakdownBrandFilter(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59] focus:border-transparent"
            >
              {llmBreakdownBrands.map((brand, index) => (
                <option key={brand} value={brand}>
                  {brand}{index === 0 && !isCategory && runStatus?.brand === brand ? ' (searched)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Object.entries(llmBreakdownStats).map(([provider, stats]) => {
              const isExpanded = expandedLLMCards.has(provider);
              const providerResults = globallyFilteredResults.filter(
                (r: Result) => r.provider === provider && !r.error
              );
              const selectedBrand = llmBreakdownBrandFilter || llmBreakdownBrands[0] || runStatus?.brand;

              return (
                <div key={provider} className="bg-[#FAFAF8] rounded-xl overflow-hidden">
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-gray-900 text-sm">{getProviderLabel(provider)}</span>
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
                        className="text-xs text-[#4A7C59] hover:text-[#3d6649] font-medium flex items-center gap-1"
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
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${getMentionRateBgColor(stats.rate)}`}
                            style={{ width: `${stats.rate * 100}%` }}
                          />
                        </div>
                      </div>
                      <span className={`text-sm font-semibold ${getMentionRateColor(stats.rate)}`}>
                        {formatPercent(stats.rate)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-xs text-gray-500">{stats.mentioned}/{stats.total} mentions</p>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-gray-500">
                          top position: <span className="font-medium text-[#4A7C59]">{stats.mentioned === 0 || stats.topPosition === null ? 'n/a' : `#${stats.topPosition}`}</span>
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
                          // Calculate position for this result
                          let position: number | null = null;
                          if (result.response_text && selectedBrand) {
                            // Use all_brands_mentioned if available (includes all detected brands)
                            const allBrands = result.all_brands_mentioned && result.all_brands_mentioned.length > 0
                              ? result.all_brands_mentioned
                              : [runStatus?.brand, ...(result.competitors_mentioned || [])].filter(Boolean);

                            const rank = allBrands.findIndex(b => b.toLowerCase() === selectedBrand.toLowerCase()) + 1;
                            if (rank > 0) position = rank;
                          }

                          const isMentioned = isCategory
                            ? result.competitors_mentioned?.includes(selectedBrand || '')
                            : result.brand_mentioned;

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
                                    position === 1 ? 'bg-green-100 text-green-700' :
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
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <h2 className="text-base font-semibold text-gray-900">All Results</h2>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59] focus:border-transparent"
            >
              <option value="all">All LLMs</option>
              {availableProviders.map((p) => (
                <option key={p} value={p}>{getProviderLabel(p)}</option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Showing {filteredResults.length} of {globallyFilteredResults.filter((r: Result) => !r.error).length} results
        </p>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th
                  className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none"
                  onClick={() => handleTableSort('prompt')}
                >
                  <span className="flex items-center gap-1">
                    Prompt
                    {tableSortColumn === 'prompt' && (
                      <span className="text-[#4A7C59]">{tableSortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </span>
                </th>
                <th
                  className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none"
                  onClick={() => handleTableSort('llm')}
                >
                  <span className="flex items-center gap-1">
                    LLM
                    {tableSortColumn === 'llm' && (
                      <span className="text-[#4A7C59]">{tableSortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </span>
                </th>
                <th
                  className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none"
                  onClick={() => handleTableSort('position')}
                >
                  <span className="flex items-center gap-1">
                    Position
                    {tableSortColumn === 'position' && (
                      <span className="text-[#4A7C59]">{tableSortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </span>
                </th>
                {!isCategory && (
                  <th
                    className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none"
                    onClick={() => handleTableSort('mentioned')}
                  >
                    <span className="flex items-center gap-1">
                      {runStatus?.brand} Mentioned
                      {tableSortColumn === 'mentioned' && (
                        <span className="text-[#4A7C59]">{tableSortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </span>
                  </th>
                )}
                <th
                  className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none"
                  onClick={() => handleTableSort('sentiment')}
                >
                  <span className="flex items-center gap-1">
                    Sentiment
                    {tableSortColumn === 'sentiment' && (
                      <span className="text-[#4A7C59]">{tableSortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </span>
                </th>
                <th
                  className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none"
                  onClick={() => handleTableSort('competitors')}
                >
                  <span className="flex items-center gap-1">
                    {isCategory ? 'Brands' : 'Competitors'}
                    {tableSortColumn === 'competitors' && (
                      <span className="text-[#4A7C59]">{tableSortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </span>
                </th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedResults.map((result: Result) => {
                // Calculate position for this result
                let position: number | null = null;
                if (result.response_text && !result.error) {
                  const selectedBrand = isCategory ? llmBreakdownBrands[0] : runStatus?.brand;

                  // Use all_brands_mentioned if available (includes all detected brands)
                  const allBrands = result.all_brands_mentioned && result.all_brands_mentioned.length > 0
                    ? result.all_brands_mentioned
                    : [runStatus?.brand, ...(result.competitors_mentioned || [])].filter(Boolean);

                  const rank = allBrands.findIndex(b => b.toLowerCase() === (selectedBrand || '').toLowerCase()) + 1;
                  if (rank > 0) position = rank;
                }

                return (
                  <React.Fragment key={result.id}>
                    <tr className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <p className="text-sm text-gray-900">{truncate(result.prompt, 50)}</p>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-gray-700">{getProviderLabel(result.provider)}</span>
                      </td>
                      <td className="py-3 px-4">
                        {result.error ? (
                          <span className="text-sm text-gray-400">-</span>
                        ) : position ? (
                          <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-lg ${
                            position === 1 ? 'bg-green-100 text-green-700' :
                            position <= 3 ? 'bg-yellow-100 text-yellow-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            #{position}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 bg-gray-100 text-gray-500 text-xs font-medium rounded-lg">
                            Not shown
                          </span>
                        )}
                      </td>
                      {!isCategory && (
                        <td className="py-3 px-4">
                          {result.error ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 text-xs font-medium rounded-lg">
                              <AlertTriangle className="w-3 h-3" />Error
                            </span>
                          ) : result.brand_mentioned ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-[#E8F0E8] text-[#4A7C59] text-xs font-medium rounded-lg">
                              <Check className="w-3 h-3" />Yes
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg">
                              <X className="w-3 h-3" />No
                            </span>
                          )}
                        </td>
                      )}
                      <td className="py-3 px-4">
                        {result.error ? (
                          <span className="text-sm text-gray-400">-</span>
                        ) : result.brand_sentiment ? (
                          <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-lg ${
                            result.brand_sentiment === 'strong_endorsement' ? 'bg-green-100 text-green-700' :
                            result.brand_sentiment === 'positive_endorsement' ? 'bg-lime-100 text-lime-700' :
                            result.brand_sentiment === 'conditional' ? 'bg-orange-100 text-orange-700' :
                            result.brand_sentiment === 'negative_comparison' ? 'bg-red-100 text-red-700' :
                            result.brand_sentiment === 'neutral_mention' ? 'bg-gray-100 text-gray-600' :
                            'bg-gray-100 text-gray-500'
                          }`}>
                            {result.brand_sentiment === 'strong_endorsement' ? 'Very Favorable' :
                             result.brand_sentiment === 'positive_endorsement' ? 'Favorable' :
                             result.brand_sentiment === 'conditional' ? 'Conditional' :
                             result.brand_sentiment === 'negative_comparison' ? 'Negative' :
                             result.brand_sentiment === 'neutral_mention' ? 'Neutral' :
                             'Not mentioned'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 bg-gray-100 text-gray-500 text-xs font-medium rounded-lg">
                            Not mentioned
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {result.error ? (
                          <span className="text-sm text-gray-400">-</span>
                        ) : result.competitors_mentioned && result.competitors_mentioned.length > 0 ? (
                          <span className="text-sm text-gray-700">
                            {result.competitors_mentioned.slice(0, 2).join(', ')}
                            {result.competitors_mentioned.length > 2 && (
                              <span className="relative group">
                                <span className="text-[#4A7C59] cursor-pointer hover:underline"> +{result.competitors_mentioned.length - 2}</span>
                                <span className="absolute left-0 bottom-full mb-1 hidden group-hover:block bg-gray-900 text-white text-xs rounded-lg py-2 px-3 whitespace-nowrap z-10 shadow-lg">
                                  {result.competitors_mentioned.slice(2).join(', ')}
                                </span>
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400">None</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setSelectedResult(result)}
                          className="inline-flex items-center gap-1 text-sm text-[#4A7C59] hover:text-[#3d6649] font-medium"
                        >
                          View <ExternalLink className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // Reference Tab Content (existing detailed results)
  const ReferenceTab = () => (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className={`grid grid-cols-1 ${isCategory ? 'sm:grid-cols-2' : 'sm:grid-cols-3'} gap-4`}>
        {!isCategory && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 text-center">
            <p className="text-sm text-gray-500 mb-1">Brand Mention Rate</p>
            <p className={`text-4xl font-bold ${getMentionRateColor(brandMentionRate)}`}>
              {formatPercent(brandMentionRate)}
            </p>
          </div>
        )}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 text-center">
          <p className="text-sm text-gray-500 mb-1">Total Calls</p>
          <p className="text-4xl font-bold text-gray-900">{runStatus.total_calls}</p>
          {runStatus.failed_calls > 0 && (
            <p className="text-xs text-red-500 mt-1">{runStatus.failed_calls} failed</p>
          )}
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 text-center">
          <p className="text-sm text-gray-500 mb-1">Total Cost</p>
          <p className="text-4xl font-bold text-gray-900">{formatCurrency(runStatus.actual_cost)}</p>
        </div>
      </div>

      {/* AI Summary */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#4A7C59]" />
            <h2 className="text-base font-semibold text-gray-900">AI Analysis</h2>
          </div>
          {aiSummary?.summary && (
            <button
              onClick={() => setAiSummaryExpanded(!aiSummaryExpanded)}
              className="inline-flex items-center gap-1 text-sm text-[#4A7C59] hover:text-[#3d6649] font-medium"
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
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiSummary.summary.replace(/\bai_overviews\b/gi, 'Google AI Overviews')}</ReactMarkdown>
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
              className="text-sm text-[#4A7C59] hover:text-[#3d6649] font-medium"
            >
              Read full analysis →
            </button>
          </div>
        )}
      </div>

      {/* Brand Mentions */}
      {Object.keys(filteredBrandMentions).length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">Brand Mentions</h2>
            <div className="flex items-center gap-2">
              <select
                value={brandMentionsTrackingFilter}
                onChange={(e) => setBrandMentionsTrackingFilter(e.target.value as 'all' | 'tracked')}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59] focus:border-transparent"
              >
                <option value="all">All Brands</option>
                <option value="tracked">Tracked Only</option>
              </select>
              <select
                value={brandMentionsProviderFilter}
                onChange={(e) => setBrandMentionsProviderFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59] focus:border-transparent"
              >
                <option value="all">All LLMs</option>
                {availableProviders.map((provider) => (
                  <option key={provider} value={provider}>{getProviderLabel(provider)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className={`space-y-3 ${Object.keys(filteredBrandMentions).length > 10 ? 'max-h-[400px] overflow-y-auto pr-2' : ''}`}>
            {Object.entries(filteredBrandMentions)
              .sort((a, b) => b[1].rate - a[1].rate)
              .map(([brandName, stats]) => {
                const isSearchedBrand = brandName === runStatus.brand;
                const isUntracked = !stats.isTracked;
                return (
                  <div key={brandName} className="flex items-center gap-4">
                    <span className={`w-40 text-sm font-medium truncate ${isSearchedBrand ? 'text-blue-600' : isUntracked ? 'text-orange-600' : 'text-gray-700'}`}>
                      {brandName}
                      {isSearchedBrand && <span className="text-xs ml-1">(searched)</span>}
                      {isUntracked && <span className="text-xs ml-1 text-orange-500">(discovered)</span>}
                    </span>
                    <div className="flex-1">
                      <div className="h-5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all flex items-center justify-end pr-2 ${isSearchedBrand ? 'bg-blue-500' : isUntracked ? 'bg-orange-400' : 'bg-[#5B7B5D]'}`}
                          style={{ width: `${Math.max(stats.rate * 100, 10)}%` }}
                        >
                          {stats.rate > 0.15 && (
                            <span className="text-xs font-medium text-white">{formatPercent(stats.rate)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    {stats.rate <= 0.15 && (
                      <span className="text-sm text-gray-600 w-12 text-right">{formatPercent(stats.rate)}</span>
                    )}
                    <span className="text-xs text-gray-400 w-16 text-right">({stats.count} times)</span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Key Influencers */}
      {keyInfluencers.length > 0 && (
        <div className="bg-gradient-to-r from-[#E8F0E8] to-[#F0F4F0] rounded-xl border border-[#4A7C59]/20 p-6">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-5 h-5 text-[#4A7C59]" />
            <h2 className="text-base font-semibold text-gray-900">Key Influencers</h2>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Sources cited by multiple LLMs — these likely have outsized influence on AI recommendations.
          </p>
          <div className="flex flex-wrap gap-2">
            {keyInfluencers.map((source) => {
              const isExpanded = expandedInfluencers.has(source.domain);
              return (
                <div key={source.domain} className="flex flex-col">
                  <div
                    onClick={() => {
                      const newExpanded = new Set(expandedInfluencers);
                      if (isExpanded) {
                        newExpanded.delete(source.domain);
                      } else {
                        newExpanded.add(source.domain);
                      }
                      setExpandedInfluencers(newExpanded);
                    }}
                    className="inline-flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-gray-200 hover:border-[#4A7C59] hover:shadow-sm transition-all cursor-pointer group"
                  >
                    {isExpanded ? (
                      <ChevronUp className="w-3.5 h-3.5 text-gray-400 group-hover:text-[#4A7C59]" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-gray-400 group-hover:text-[#4A7C59]" />
                    )}
                    <span className="text-sm font-medium text-gray-700 group-hover:text-[#4A7C59]">{source.domain}</span>
                    <span className="text-xs text-gray-400">{source.providers.length} LLMs · {source.count} {source.count === 1 ? 'citation' : 'citations'}</span>
                  </div>
                  {isExpanded && (
                    <div className="mt-1 ml-2 p-2 bg-white rounded-lg border border-gray-200 space-y-1">
                      {source.urlDetails.map((urlDetail, idx) => {
                        const { subtitle } = formatSourceDisplay(urlDetail.url, urlDetail.title);
                        const displayTitle = subtitle || getReadableTitleFromUrl(urlDetail.url);
                        return (
                          <a
                            key={idx}
                            href={urlDetail.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-sm text-[#4A7C59] hover:text-[#3d6649] hover:underline"
                          >
                            <ExternalLink className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">
                              <span className="font-medium">{source.domain}</span>
                              {displayTitle && displayTitle !== source.domain && (
                                <span className="text-gray-600"> · {displayTitle}</span>
                              )}
                              <span className="text-gray-400"> ({urlDetail.count} {urlDetail.count === 1 ? 'citation' : 'citations'})</span>
                            </span>
                          </a>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top Cited Sources */}
      {hasAnySources && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Link2 className="w-5 h-5 text-[#4A7C59]" />
              <h2 className="text-base font-semibold text-gray-900">Top Cited Sources</h2>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={sourcesBrandFilter}
                onChange={(e) => setSourcesBrandFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59] focus:border-transparent"
              >
                <option value="all">All Brands</option>
                {availableBrands.map((brand) => (
                  <option key={brand} value={brand}>{brand}{brand === runStatus?.brand ? ' (searched)' : ''}</option>
                ))}
              </select>
              <select
                value={sourcesProviderFilter}
                onChange={(e) => setSourcesProviderFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59] focus:border-transparent"
              >
                <option value="all">All LLMs</option>
                {availableProviders.map((provider) => (
                  <option key={provider} value={provider}>{getProviderLabel(provider)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className={`space-y-2 ${topCitedSources.length > 10 ? 'max-h-[600px] overflow-y-auto pr-2' : ''}`}>
            {topCitedSources.map((source, index) => {
              const hasMultipleCitations = source.count > 1;
              const isExpanded = expandedSources.has(source.domain);
              return (
                <div key={source.domain} className="bg-[#FAFAF8] rounded-lg overflow-hidden">
                  <div
                    className={`flex items-center gap-3 p-3 ${hasMultipleCitations ? 'cursor-pointer hover:bg-gray-100' : ''} transition-colors`}
                    onClick={() => {
                      if (hasMultipleCitations) {
                        const newExpanded = new Set(expandedSources);
                        if (isExpanded) {
                          newExpanded.delete(source.domain);
                        } else {
                          newExpanded.add(source.domain);
                        }
                        setExpandedSources(newExpanded);
                      }
                    }}
                  >
                    <span className="text-sm font-medium text-gray-400 w-6">{index + 1}.</span>
                    {hasMultipleCitations ? (
                      <div className="flex-1 flex items-center gap-2 text-sm font-medium text-[#4A7C59]">
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5 flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />}
                        {source.domain}
                      </div>
                    ) : (
                      (() => {
                        const singleUrlDetail = source.urlDetails[0];
                        const { subtitle } = formatSourceDisplay(singleUrlDetail?.url || source.url, singleUrlDetail?.title);
                        const displayTitle = subtitle || getReadableTitleFromUrl(singleUrlDetail?.url || source.url);
                        return (
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 flex items-center gap-2 text-sm font-medium text-[#4A7C59] hover:text-[#3d6649] hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="truncate">
                              <span>{source.domain}</span>
                              {displayTitle && displayTitle !== source.domain && (
                                <span className="text-gray-500 font-normal"> · {displayTitle}</span>
                              )}
                            </span>
                          </a>
                        );
                      })()
                    )}
                    <div className="flex items-center gap-3">
                      <div className="flex gap-1">
                        {source.providers.map((provider) => (
                          <span key={provider} className="text-xs px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded" title={getProviderLabel(provider)}>
                            {getProviderShortLabel(provider)}
                          </span>
                        ))}
                      </div>
                      <span className="text-sm text-gray-500 w-20 text-right">{source.count} {source.count === 1 ? 'citation' : 'citations'}</span>
                    </div>
                  </div>
                  {hasMultipleCitations && isExpanded && (
                    <div className="px-3 pb-3 pt-1 border-t border-gray-200 ml-9">
                      <p className="text-xs text-gray-500 mb-2">
                        {source.urlDetails.length > 1 ? `${source.urlDetails.length} unique pages:` : `${source.count} citations from this page:`}
                      </p>
                      <div className="space-y-1.5">
                        {source.urlDetails.map((urlDetail, idx) => {
                          const { subtitle } = formatSourceDisplay(urlDetail.url, urlDetail.title);
                          const displayTitle = subtitle || getReadableTitleFromUrl(urlDetail.url);
                          return (
                            <a
                              key={idx}
                              href={urlDetail.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 text-sm text-[#4A7C59] hover:text-[#3d6649] hover:underline"
                            >
                              <ExternalLink className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate">
                                <span className="font-medium">{source.domain}</span>
                                {displayTitle && displayTitle !== source.domain && (
                                  <span className="text-gray-600"> · {displayTitle}</span>
                                )}
                              </span>
                              <span className="flex items-center gap-2 flex-shrink-0 ml-auto">
                                <span className="flex gap-1">
                                  {urlDetail.providers.map((provider: string) => (
                                    <span key={provider} className="text-xs px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded" title={getProviderLabel(provider)}>
                                      {getProviderShortLabel(provider)}
                                    </span>
                                  ))}
                                </span>
                                <span className="text-gray-400 text-xs">({urlDetail.count} {urlDetail.count === 1 ? 'citation' : 'citations'})</span>
                              </span>
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {topCitedSources.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">No sources found for the selected filters</p>
          )}
        </div>
      )}

      {/* AI Overview Unavailable Notice */}
      {aiOverviewUnavailableCount > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-orange-800">
              AI Overviews Not Available for {aiOverviewUnavailableCount} {aiOverviewUnavailableCount === 1 ? 'Query' : 'Queries'}
            </p>
            <p className="text-sm text-orange-700 mt-1">
              Google doesn&apos;t show AI Overviews for all search queries. These results are marked as &quot;Not Available&quot; in the table below.
            </p>
          </div>
        </div>
      )}

      {/* Detailed Results */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <h2 className="text-base font-semibold text-gray-900">Detailed Results</h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === 'all' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
              >
                All
              </button>
              <button
                onClick={() => setFilter('mentioned')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === 'mentioned' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
              >
                {runStatus.brand} Mentioned
              </button>
              <button
                onClick={() => setFilter('not_mentioned')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === 'not_mentioned' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
              >
                {runStatus.brand} Not Mentioned
              </button>
            </div>
            <select
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59] focus:border-transparent"
            >
              <option value="all">All LLMs</option>
              <option value="openai">OpenAI</option>
              <option value="gemini">Gemini</option>
              <option value="anthropic">Claude</option>
              <option value="perplexity">Perplexity</option>
              <option value="ai_overviews">Google AI Overviews</option>
            </select>
          </div>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Showing {filteredResults.length} of {globallyFilteredResults.filter((r: Result) => !r.error).length} results
        </p>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Prompt</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">LLM</th>
                {!isCategory && (
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Brand?</th>
                )}
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">{isCategory ? 'Brands' : 'Competitors'}</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredResults.map((result: Result) => (
                <>
                  <tr key={result.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <p className="text-sm text-gray-900">{truncate(result.prompt, 40)}</p>
                      <p className="text-xs text-gray-500">Temp: {result.temperature}</p>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-gray-700">{getProviderLabel(result.provider)}</span>
                    </td>
                    {!isCategory && (
                      <td className="py-3 px-4">
                        {result.error ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 text-xs font-medium rounded-lg">
                            <AlertTriangle className="w-3 h-3" />Not Available
                          </span>
                        ) : result.brand_mentioned ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-[#E8F0E8] text-[#4A7C59] text-xs font-medium rounded-lg">
                            <Check className="w-3 h-3" />Yes
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg">
                            <X className="w-3 h-3" />No
                          </span>
                        )}
                      </td>
                    )}
                    <td className="py-3 px-4">
                      {result.error ? (
                        <span className="text-sm text-gray-400">-</span>
                      ) : result.competitors_mentioned && result.competitors_mentioned.length > 0 ? (
                        <span className="text-sm text-gray-700">
                          {isCategory ? result.competitors_mentioned.join(', ') : (
                            <>
                              {result.competitors_mentioned.slice(0, 2).join(', ')}
                              {result.competitors_mentioned.length > 2 && (
                                <span className="text-gray-400"> +{result.competitors_mentioned.length - 2}</span>
                              )}
                            </>
                          )}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">None</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-gray-600 capitalize">{result.response_type || '-'}</span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => toggleExpanded(result.id)}
                        className="inline-flex items-center gap-1 text-sm text-[#4A7C59] hover:text-[#3d6649] font-medium"
                      >
                        {expandedResults.has(result.id) ? (
                          <>Hide <ChevronUp className="w-4 h-4" /></>
                        ) : (
                          <>View <ChevronDown className="w-4 h-4" /></>
                        )}
                      </button>
                    </td>
                  </tr>
                  {expandedResults.has(result.id) && (
                    <tr key={`${result.id}-expanded`}>
                      <td colSpan={isCategory ? 5 : 6} className="py-4 px-4 bg-[#FAFAF8]">
                        <div className="max-h-64 overflow-y-auto">
                          {result.error ? (
                            <>
                              <p className="text-xs text-orange-600 mb-2">AI Overview Not Available:</p>
                              <p className="text-sm text-orange-700 bg-orange-50 p-3 rounded-lg">
                                Google did not return an AI Overview for this query. This typically happens when the query doesn&apos;t trigger an AI-generated summary in search results.
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="text-xs text-gray-500 mb-2">Full Response:</p>
                              <div className="text-sm text-gray-700 [&_a]:text-[#4A7C59] [&_a]:underline [&_a]:hover:text-[#3d6649] [&_p]:mb-3 [&_p]:leading-relaxed [&_ul]:mb-3 [&_ul]:pl-5 [&_ul]:list-disc [&_ol]:mb-3 [&_ol]:pl-5 [&_ol]:list-decimal [&_li]:mb-1 [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mb-2 [&_h3]:font-semibold [&_h3]:mb-2 [&_strong]:font-semibold [&_table]:w-full [&_table]:mb-3 [&_table]:border-collapse [&_table]:text-xs [&_th]:border [&_th]:border-gray-300 [&_th]:bg-gray-100 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold [&_td]:border [&_td]:border-gray-300 [&_td]:px-2 [&_td]:py-1 overflow-x-auto">
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm]}
                                  components={{
                                    a: ({ href, children }) => (
                                      <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
                                    ),
                                    table: ({ children }) => (
                                      <div className="overflow-x-auto mb-3">
                                        <table className="min-w-full">{children}</table>
                                      </div>
                                    ),
                                  }}
                                >
                                  {highlightCompetitors(formatResponseText(result.response_text || ''), result.all_brands_mentioned)}
                                </ReactMarkdown>
                              </div>
                              {result.sources && result.sources.length > 0 && (
                                <div className="mt-4 pt-3 border-t border-gray-200">
                                  <p className="text-xs text-gray-500 mb-2">Sources ({result.sources.length}):</p>
                                  <div className="space-y-1.5">
                                    {result.sources.map((source, idx) => {
                                      const { domain, subtitle } = formatSourceDisplay(source.url, source.title);
                                      return (
                                        <a
                                          key={idx}
                                          href={source.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="flex items-center gap-2 text-sm text-[#4A7C59] hover:text-[#3d6649] hover:underline"
                                        >
                                          <ExternalLink className="w-3 h-3 flex-shrink-0" />
                                          <span className="truncate">
                                            <span className="font-medium">{domain}</span>
                                            {subtitle && <span className="text-gray-500"> · {subtitle}</span>}
                                          </span>
                                        </a>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                              {result.grounding_metadata && result.grounding_metadata.supports && result.grounding_metadata.supports.length > 0 && (
                                <div className="mt-4 pt-3 border-t border-gray-200">
                                  <p className="text-xs text-gray-500 mb-2">Grounding Confidence:</p>
                                  <div className="space-y-2">
                                    {result.grounding_metadata.supports.slice(0, 5).map((support, idx) => (
                                      <div key={idx} className="bg-white p-2 rounded-lg border border-gray-100">
                                        <p className="text-xs text-gray-600 mb-1 line-clamp-2">&quot;{support.segment}&quot;</p>
                                        <div className="flex items-center gap-2">
                                          <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                            <div className="h-full bg-[#5B7B5D] rounded-full" style={{ width: `${(support.confidence_scores[0] || 0) * 100}%` }} />
                                          </div>
                                          <span className="text-xs text-gray-500 w-12 text-right">{Math.round((support.confidence_scores[0] || 0) * 100)}%</span>
                                        </div>
                                      </div>
                                    ))}
                                    {result.grounding_metadata.supports.length > 5 && (
                                      <p className="text-xs text-gray-400">+{result.grounding_metadata.supports.length - 5} more</p>
                                    )}
                                  </div>
                                </div>
                              )}
                              {result.tokens && (
                                <p className="text-xs text-gray-400 mt-2">{result.tokens} tokens · {formatCurrency(result.cost || 0)}</p>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
        {filteredResults.length === 0 && (
          <div className="text-center py-8">
            <Filter className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-gray-500">No results match your filters</p>
          </div>
        )}
      </div>

      {/* Export Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-1">Export & Share</h2>
        <p className="text-sm text-gray-500 mb-4">Download results or share a link to this page</p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleExportCSV}
            className="px-4 py-2.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Export to CSV
          </button>
          <button
            onClick={handleCopyLink}
            className="px-4 py-2.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors flex items-center gap-2"
          >
            <Link2 className="w-4 h-4" />
            {copied ? 'Copied!' : 'Copy Share Link'}
          </button>
        </div>
      </div>

      {/* Cost Summary Footer */}
      <div className="bg-[#FAFAF8] rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
          <div className="flex items-center gap-6">
            <div>
              <span className="text-gray-500">Total Tokens: </span>
              <span className="font-medium text-gray-900">
                {globallyFilteredResults
                  .filter((r: Result) => !r.error && r.tokens)
                  .reduce((sum: number, r: Result) => sum + (r.tokens || 0), 0)
                  .toLocaleString()}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Total Cost: </span>
              <span className="font-medium text-gray-900">{formatCurrency(runStatus.actual_cost)}</span>
            </div>
          </div>
          <div className="text-gray-400 text-xs">{runStatus.completed_calls} successful calls · {runStatus.failed_calls} failed</div>
        </div>
      </div>
    </div>
  );

  // Sentiment Tab Content
  const SentimentTab = () => {
    // Helper function to get sentiment label
    const getSentimentLabel = (sentiment: string | null | undefined) => {
      switch (sentiment) {
        case 'strong_endorsement': return 'Very Favorable';
        case 'positive_endorsement': return 'Favorable';
        case 'neutral_mention': return 'Neutral Mention';
        case 'conditional': return 'Conditional/Caveated';
        case 'negative_comparison': return 'Negative Comparison';
        case 'not_mentioned': return 'Not Mentioned';
        default: return 'Unknown';
      }
    };

    // Helper function to get sentiment color
    const getSentimentColor = (sentiment: string | null | undefined) => {
      switch (sentiment) {
        case 'strong_endorsement': return 'bg-green-100 text-green-800 border-green-200';
        case 'positive_endorsement': return 'bg-lime-100 text-lime-800 border-lime-200';
        case 'neutral_mention': return 'bg-blue-100 text-blue-800 border-blue-200';
        case 'conditional': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
        case 'negative_comparison': return 'bg-red-100 text-red-800 border-red-200';
        case 'not_mentioned': return 'bg-gray-100 text-gray-600 border-gray-200';
        default: return 'bg-gray-100 text-gray-600 border-gray-200';
      }
    };

    // Helper function to get sentiment bar color
    const getSentimentBarColor = (sentiment: string) => {
      switch (sentiment) {
        case 'strong_endorsement': return '#22c55e';
        case 'positive_endorsement': return '#84cc16';
        case 'neutral_mention': return '#3b82f6';
        case 'conditional': return '#eab308';
        case 'negative_comparison': return '#ef4444';
        case 'not_mentioned': return '#9ca3af';
        default: return '#9ca3af';
      }
    };

    // Calculate brand sentiment distribution
    const brandSentimentData = useMemo(() => {
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
          const sentiment = r.brand_sentiment || 'not_mentioned';
          if (sentimentCounts[sentiment] !== undefined) {
            sentimentCounts[sentiment]++;
          }
        });

      const total = Object.values(sentimentCounts).reduce((a, b) => a + b, 0);

      return Object.entries(sentimentCounts)
        .map(([sentiment, count]) => ({
          sentiment,
          label: getSentimentLabel(sentiment),
          count,
          percentage: total > 0 ? (count / total) * 100 : 0,
          color: getSentimentBarColor(sentiment),
        }))
        .filter(d => d.count > 0);
    }, [globallyFilteredResults]);

    // Calculate sentiment by provider
    const sentimentByProvider = useMemo(() => {
      const providerData: Record<string, {
        strong_endorsement: number;
        positive_endorsement: number;
        neutral_mention: number;
        conditional: number;
        negative_comparison: number;
        not_mentioned: number;
      }> = {};

      globallyFilteredResults
        .filter((r: Result) => !r.error)
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
          const sentiment = r.brand_sentiment || 'not_mentioned';
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
      }).sort((a, b) => b.strongRate - a.strongRate);
    }, [globallyFilteredResults]);

    // Calculate competitor sentiment comparison
    const competitorSentimentData = useMemo(() => {
      const competitorData: Record<string, {
        strong_endorsement: number;
        positive_endorsement: number;
        neutral_mention: number;
        conditional: number;
        negative_comparison: number;
        not_mentioned: number;
      }> = {};
      const trackedComps = trackedBrands;

      globallyFilteredResults
        .filter((r: Result) => !r.error && r.competitor_sentiments)
        .forEach((r: Result) => {
          if (r.competitor_sentiments) {
            Object.entries(r.competitor_sentiments).forEach(([comp, sentiment]) => {
              if (!trackedComps.has(comp)) return;
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
    }, [globallyFilteredResults, trackedBrands]);

    // Check if we have any sentiment data
    const hasSentimentData = globallyFilteredResults.some(
      (r: Result) => !r.error && r.brand_sentiment
    );

    if (!hasSentimentData) {
      return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <MessageSquare className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Sentiment Data Available</h3>
          <p className="text-gray-500 max-w-md mx-auto">
            Sentiment classification will be available for new runs. Run a new visibility check to see how AI models describe and frame your brand.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Brand Sentiment Overview */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-1">How AI Describes {runStatus?.brand}</h3>
          <p className="text-sm text-gray-500 mb-6">Sentiment classification of how AI models mention your brand</p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Sentiment Distribution */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-4">Overall Sentiment Distribution</h4>
              <div className="space-y-3">
                {brandSentimentData.map((d) => (
                  <div key={d.sentiment} className="flex items-center gap-3">
                    <div className="w-32 text-sm text-gray-600">{d.label}</div>
                    <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${d.percentage}%`,
                          backgroundColor: d.color,
                        }}
                      />
                    </div>
                    <div className="w-20 text-right">
                      <span className="text-sm font-medium text-gray-900">{d.count}</span>
                      <span className="text-xs text-gray-500 ml-1">({d.percentage.toFixed(0)}%)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Key Insights */}
            <div className="bg-[#FAFAF8] rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-700 mb-3">Key Insight</h4>
              {(() => {
                const total = brandSentimentData.reduce((sum, d) => sum + d.count, 0);
                const strongCount = brandSentimentData.find(d => d.sentiment === 'strong_endorsement')?.count || 0;
                const neutralCount = brandSentimentData.find(d => d.sentiment === 'neutral_mention')?.count || 0;
                const conditionalCount = brandSentimentData.find(d => d.sentiment === 'conditional')?.count || 0;
                const negativeCount = brandSentimentData.find(d => d.sentiment === 'negative_comparison')?.count || 0;
                const notMentionedCount = brandSentimentData.find(d => d.sentiment === 'not_mentioned')?.count || 0;

                const strongRate = total > 0 ? (strongCount / total) * 100 : 0;
                const positiveRate = total > 0 ? ((strongCount + neutralCount) / total) * 100 : 0;
                const mentionRate = total > 0 ? ((total - notMentionedCount) / total) * 100 : 0;

                let insight = '';
                if (strongRate >= 50) {
                  insight = `${runStatus?.brand} receives strong endorsements in ${strongRate.toFixed(0)}% of AI responses, indicating excellent brand positioning in AI recommendations.`;
                } else if (positiveRate >= 70) {
                  insight = `${runStatus?.brand} is mentioned positively or neutrally in ${positiveRate.toFixed(0)}% of responses where it appears, suggesting solid brand perception.`;
                } else if (conditionalCount > strongCount) {
                  insight = `AI models often mention ${runStatus?.brand} with caveats or conditions. Consider strengthening your unique value proposition to earn stronger endorsements.`;
                } else if (negativeCount > 0 && negativeCount >= strongCount) {
                  insight = `${runStatus?.brand} appears in negative comparisons ${negativeCount} time${negativeCount !== 1 ? 's' : ''}. Review competitor positioning and brand messaging.`;
                } else if (notMentionedCount > total * 0.5) {
                  insight = `${runStatus?.brand} is not mentioned in ${((notMentionedCount / total) * 100).toFixed(0)}% of responses. Focus on increasing AI visibility through content optimization.`;
                } else {
                  insight = `${runStatus?.brand} has mixed sentiment across AI responses. Positive sentiment rate is ${strongRate.toFixed(0)}% with ${mentionRate.toFixed(0)}% overall mention rate.`;
                }

                return <p className="text-sm text-gray-600">{insight}</p>;
              })()}
            </div>
          </div>
        </div>

        {/* Sentiment by Provider */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Sentiment by AI Provider</h3>
          <p className="text-sm text-gray-500 mb-6">How different AI models describe your brand</p>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Provider</th>
                  <th className="text-center py-3 px-2 text-sm font-medium text-green-600">Very Favorable</th>
                  <th className="text-center py-3 px-2 text-sm font-medium text-lime-600">Favorable</th>
                  <th className="text-center py-3 px-2 text-sm font-medium text-blue-600">Neutral</th>
                  <th className="text-center py-3 px-2 text-sm font-medium text-yellow-600">Conditional</th>
                  <th className="text-center py-3 px-2 text-sm font-medium text-red-600">Negative</th>
                  <th className="text-center py-3 px-2 text-sm font-medium text-gray-500">Not Mentioned</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">Endorsement Rate</th>
                </tr>
              </thead>
              <tbody>
                {sentimentByProvider.map((row) => (
                  <tr key={row.provider} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <span className="text-sm font-medium text-gray-900">{row.label}</span>
                    </td>
                    <td className="text-center py-3 px-2">
                      {row.strong_endorsement > 0 && (
                        <span className="inline-flex items-center justify-center w-8 h-8 bg-green-100 text-green-800 text-sm font-medium rounded-lg">
                          {row.strong_endorsement}
                        </span>
                      )}
                    </td>
                    <td className="text-center py-3 px-2">
                      {row.positive_endorsement > 0 && (
                        <span className="inline-flex items-center justify-center w-8 h-8 bg-lime-100 text-lime-800 text-sm font-medium rounded-lg">
                          {row.positive_endorsement}
                        </span>
                      )}
                    </td>
                    <td className="text-center py-3 px-2">
                      {row.neutral_mention > 0 && (
                        <span className="inline-flex items-center justify-center w-8 h-8 bg-blue-100 text-blue-800 text-sm font-medium rounded-lg">
                          {row.neutral_mention}
                        </span>
                      )}
                    </td>
                    <td className="text-center py-3 px-2">
                      {row.conditional > 0 && (
                        <span className="inline-flex items-center justify-center w-8 h-8 bg-yellow-100 text-yellow-800 text-sm font-medium rounded-lg">
                          {row.conditional}
                        </span>
                      )}
                    </td>
                    <td className="text-center py-3 px-2">
                      {row.negative_comparison > 0 && (
                        <span className="inline-flex items-center justify-center w-8 h-8 bg-red-100 text-red-800 text-sm font-medium rounded-lg">
                          {row.negative_comparison}
                        </span>
                      )}
                    </td>
                    <td className="text-center py-3 px-2">
                      {row.not_mentioned > 0 && (
                        <span className="inline-flex items-center justify-center w-8 h-8 bg-gray-100 text-gray-600 text-sm font-medium rounded-lg">
                          {row.not_mentioned}
                        </span>
                      )}
                    </td>
                    <td className="text-right py-3 px-4">
                      <span className={`text-sm font-medium ${row.strongRate >= 50 ? 'text-green-600' : row.strongRate >= 25 ? 'text-blue-600' : 'text-gray-600'}`}>
                        {row.strongRate.toFixed(0)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Competitor Sentiment Comparison */}
        {competitorSentimentData.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Competitor Sentiment Comparison</h3>
            <p className="text-sm text-gray-500 mb-6">How AI models describe competitors in the same responses</p>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Competitor</th>
                    <th className="text-center py-3 px-2 text-sm font-medium text-green-600">Very Favorable</th>
                    <th className="text-center py-3 px-2 text-sm font-medium text-lime-600">Favorable</th>
                    <th className="text-center py-3 px-2 text-sm font-medium text-blue-600">Neutral</th>
                    <th className="text-center py-3 px-2 text-sm font-medium text-yellow-600">Conditional</th>
                    <th className="text-center py-3 px-2 text-sm font-medium text-red-600">Negative</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">Endorsement Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Add the brand first for comparison */}
                  <tr className="border-b border-gray-200 bg-[#E8F0E8]/30">
                    <td className="py-3 px-4">
                      <span className="text-sm font-medium text-[#4A7C59]">{runStatus?.brand} (Your Brand)</span>
                    </td>
                    <td className="text-center py-3 px-2">
                      {brandSentimentData.find(d => d.sentiment === 'strong_endorsement')?.count || 0 > 0 && (
                        <span className="inline-flex items-center justify-center w-8 h-8 bg-green-100 text-green-800 text-sm font-medium rounded-lg">
                          {brandSentimentData.find(d => d.sentiment === 'strong_endorsement')?.count || 0}
                        </span>
                      )}
                    </td>
                    <td className="text-center py-3 px-2">
                      {brandSentimentData.find(d => d.sentiment === 'positive_endorsement')?.count || 0 > 0 && (
                        <span className="inline-flex items-center justify-center w-8 h-8 bg-lime-100 text-lime-800 text-sm font-medium rounded-lg">
                          {brandSentimentData.find(d => d.sentiment === 'positive_endorsement')?.count || 0}
                        </span>
                      )}
                    </td>
                    <td className="text-center py-3 px-2">
                      {brandSentimentData.find(d => d.sentiment === 'neutral_mention')?.count || 0 > 0 && (
                        <span className="inline-flex items-center justify-center w-8 h-8 bg-blue-100 text-blue-800 text-sm font-medium rounded-lg">
                          {brandSentimentData.find(d => d.sentiment === 'neutral_mention')?.count || 0}
                        </span>
                      )}
                    </td>
                    <td className="text-center py-3 px-2">
                      {brandSentimentData.find(d => d.sentiment === 'conditional')?.count || 0 > 0 && (
                        <span className="inline-flex items-center justify-center w-8 h-8 bg-yellow-100 text-yellow-800 text-sm font-medium rounded-lg">
                          {brandSentimentData.find(d => d.sentiment === 'conditional')?.count || 0}
                        </span>
                      )}
                    </td>
                    <td className="text-center py-3 px-2">
                      {brandSentimentData.find(d => d.sentiment === 'negative_comparison')?.count || 0 > 0 && (
                        <span className="inline-flex items-center justify-center w-8 h-8 bg-red-100 text-red-800 text-sm font-medium rounded-lg">
                          {brandSentimentData.find(d => d.sentiment === 'negative_comparison')?.count || 0}
                        </span>
                      )}
                    </td>
                    <td className="text-right py-3 px-4">
                      <span className="text-sm font-medium text-[#4A7C59]">
                        {brandSentimentData.find(d => d.sentiment === 'strong_endorsement')?.percentage.toFixed(0) || 0}%
                      </span>
                    </td>
                  </tr>
                  {competitorSentimentData.map((row) => (
                    <tr key={row.competitor} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <span className="text-sm font-medium text-gray-900">{row.competitor}</span>
                      </td>
                      <td className="text-center py-3 px-2">
                        {row.strong_endorsement > 0 && (
                          <span className="inline-flex items-center justify-center w-8 h-8 bg-green-100 text-green-800 text-sm font-medium rounded-lg">
                            {row.strong_endorsement}
                          </span>
                        )}
                      </td>
                      <td className="text-center py-3 px-2">
                        {row.positive_endorsement > 0 && (
                          <span className="inline-flex items-center justify-center w-8 h-8 bg-lime-100 text-lime-800 text-sm font-medium rounded-lg">
                            {row.positive_endorsement}
                          </span>
                        )}
                      </td>
                      <td className="text-center py-3 px-2">
                        {row.neutral_mention > 0 && (
                          <span className="inline-flex items-center justify-center w-8 h-8 bg-blue-100 text-blue-800 text-sm font-medium rounded-lg">
                            {row.neutral_mention}
                          </span>
                        )}
                      </td>
                      <td className="text-center py-3 px-2">
                        {row.conditional > 0 && (
                          <span className="inline-flex items-center justify-center w-8 h-8 bg-yellow-100 text-yellow-800 text-sm font-medium rounded-lg">
                            {row.conditional}
                          </span>
                        )}
                      </td>
                      <td className="text-center py-3 px-2">
                        {row.negative_comparison > 0 && (
                          <span className="inline-flex items-center justify-center w-8 h-8 bg-red-100 text-red-800 text-sm font-medium rounded-lg">
                            {row.negative_comparison}
                          </span>
                        )}
                      </td>
                      <td className="text-right py-3 px-4">
                        <span className={`text-sm font-medium ${row.strongRate >= 50 ? 'text-green-600' : row.strongRate >= 25 ? 'text-blue-600' : 'text-gray-600'}`}>
                          {row.strongRate.toFixed(0)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Individual Results with Sentiment */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Response-Level Sentiment</h3>
          <p className="text-sm text-gray-500 mb-6">Detailed sentiment for each AI response</p>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Prompt</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Provider</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Brand Sentiment</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Competitor Sentiments</th>
                </tr>
              </thead>
              <tbody>
                {globallyFilteredResults
                  .filter((r: Result) => !r.error && r.brand_sentiment)
                  .slice(0, 20)
                  .map((result: Result) => (
                    <tr key={result.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <p className="text-sm text-gray-900 max-w-xs truncate" title={result.prompt}>
                          {truncate(result.prompt, 50)}
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-gray-700">{getProviderLabel(result.provider)}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-lg border ${getSentimentColor(result.brand_sentiment)}`}>
                          {getSentimentLabel(result.brand_sentiment)}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1.5">
                          {result.competitor_sentiments && Object.entries(result.competitor_sentiments)
                            .filter(([_, sentiment]) => sentiment !== 'not_mentioned')
                            .slice(0, 3)
                            .map(([comp, sentiment]) => (
                              <span
                                key={comp}
                                className={`inline-flex items-center px-2 py-0.5 text-xs rounded border ${getSentimentColor(sentiment)}`}
                                title={`${comp}: ${getSentimentLabel(sentiment)}`}
                              >
                                {truncate(comp, 12)}
                              </span>
                            ))}
                          {result.competitor_sentiments &&
                            Object.values(result.competitor_sentiments).filter(s => s !== 'not_mentioned').length > 3 && (
                            <span className="text-xs text-gray-400">
                              +{Object.values(result.competitor_sentiments).filter(s => s !== 'not_mentioned').length - 3} more
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {globallyFilteredResults.filter((r: Result) => !r.error && r.brand_sentiment).length > 20 && (
            <p className="text-sm text-gray-500 mt-4 text-center">
              Showing 20 of {globallyFilteredResults.filter((r: Result) => !r.error && r.brand_sentiment).length} results
            </p>
          )}
        </div>
      </div>
    );
  };

  // Placeholder Tab Content
  const PlaceholderTab = ({ title, description }: { title: string; description: string }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <Sparkles className="w-8 h-8 text-gray-400" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-500 max-w-md mx-auto">{description}</p>
    </div>
  );

  return (
    <main className="min-h-screen bg-[#FAFAF8] pb-8">
      {/* Sticky Header Section */}
      <div className="sticky top-0 z-20 bg-[#FAFAF8] shadow-sm">
        {/* Header */}
        <header className="pt-6 pb-4">
          <div className="max-w-6xl mx-auto px-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => router.push('/')}
                  className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                  aria-label="Go back"
                >
                  <ArrowLeft className="w-5 h-5 text-gray-500" />
                </button>
                <div>
                  <h1 className="text-lg font-semibold text-gray-900">
                    Results for <span className="text-[#4A7C59]">{runStatus.brand}</span>
                    {isCategory && <span className="text-gray-500 text-sm font-normal ml-1">(category)</span>}
                  </h1>
                  <p className="text-sm text-gray-500">
                    {runStatus.completed_at
                      ? `Completed ${formatDate(runStatus.completed_at)}`
                      : `Started ${formatDate(runStatus.created_at)}`}
                    {' · '}
                    {formatCurrency(runStatus.actual_cost)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => router.push('/')}
                className="px-4 py-2 bg-[#4A7C59] text-white text-sm font-medium rounded-xl hover:bg-[#3d6649] transition-colors flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                New Analysis
              </button>
            </div>
          </div>
        </header>

        <div className="max-w-6xl mx-auto px-6 pb-4">
          {/* Global Filter Bar */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-700">Filters:</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={globalBrandFilter}
                onChange={(e) => setGlobalBrandFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59] focus:border-transparent"
              >
                <option value="all">All Brands</option>
                {availableBrands.map((brand) => (
                  <option key={brand} value={brand}>
                    {brand}{brand === runStatus?.brand ? ' (searched)' : ''}
                  </option>
                ))}
              </select>
              <select
                value={globalLlmFilter}
                onChange={(e) => setGlobalLlmFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59] focus:border-transparent"
              >
                <option value="all">All LLMs</option>
                {availableProviders.map((provider) => (
                  <option key={provider} value={provider}>{getProviderLabel(provider)}</option>
                ))}
              </select>
              <select
                value={globalPromptFilter}
                onChange={(e) => setGlobalPromptFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59] focus:border-transparent max-w-[200px]"
              >
                <option value="all">All Prompts</option>
                {availablePrompts.map((prompt) => (
                  <option key={prompt} value={prompt}>{truncate(prompt, 30)}</option>
                ))}
              </select>
            </div>
            {(globalBrandFilter !== 'all' || globalLlmFilter !== 'all' || globalPromptFilter !== 'all') && (
              <button
                onClick={() => {
                  setGlobalBrandFilter('all');
                  setGlobalLlmFilter('all');
                  setGlobalPromptFilter('all');
                }}
                className="text-sm text-[#4A7C59] hover:text-[#3d6649] font-medium"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

          {/* Tab Bar */}
          <div className="border-b border-gray-200 bg-[#FAFAF8]">
            <nav className="flex gap-1 overflow-x-auto pb-px">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-[#4A7C59] text-[#4A7C59]'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-6xl mx-auto px-6 pt-6">
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'reference' && <ReferenceTab />}
        {activeTab === 'competitive' && (
          <PlaceholderTab
            title="Competitive Landscape"
            description="Compare your brand's visibility against competitors across different LLMs. Coming soon."
          />
        )}
        {activeTab === 'sentiment' && <SentimentTab />}
        {activeTab === 'sources' && (
          <PlaceholderTab
            title="Sources Deep Dive"
            description="Explore the sources that LLMs cite when mentioning your brand. Coming soon."
          />
        )}
        {activeTab === 'recommendations' && (
          <PlaceholderTab
            title="Recommendations"
            description="Get actionable recommendations to improve your AI visibility. Coming soon."
          />
        )}
        {activeTab === 'reports' && (
          <PlaceholderTab
            title="Automated Reports"
            description="Schedule and generate automated visibility reports. Coming soon."
          />
        )}
      </div>

      {/* Result Detail Modal */}
      {selectedResult && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedResult(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{getProviderLabel(selectedResult.provider)}</h2>
                <p className="text-sm text-gray-500">Temperature: {selectedResult.temperature}</p>
              </div>
              <button
                onClick={() => setSelectedResult(null)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-4 border-b border-gray-100 bg-gray-50">
              <p className="text-xs text-gray-500 mb-1">Prompt</p>
              <p className="text-sm text-gray-900">{selectedResult.prompt}</p>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {selectedResult.error ? (
                <div className="text-center py-8">
                  <AlertTriangle className="w-12 h-12 text-orange-400 mx-auto mb-3" />
                  <p className="text-sm font-medium text-orange-800 mb-1">AI Overview Not Available</p>
                  <p className="text-sm text-orange-700">
                    Google did not return an AI Overview for this query.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {!isCategory && (
                      <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg ${selectedResult.brand_mentioned ? 'bg-[#E8F0E8] text-[#4A7C59]' : 'bg-gray-100 text-gray-600'}`}>
                        {selectedResult.brand_mentioned ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                        {runStatus.brand} {selectedResult.brand_mentioned ? 'Mentioned' : 'Not Mentioned'}
                      </span>
                    )}
                    {selectedResult.competitors_mentioned && selectedResult.competitors_mentioned.length > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-lg">
                        {selectedResult.competitors_mentioned.length} competitor{selectedResult.competitors_mentioned.length !== 1 ? 's' : ''} mentioned
                      </span>
                    )}
                    {selectedResult.response_type && (
                      <span className="inline-flex items-center px-2 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg capitalize">
                        {selectedResult.response_type}
                      </span>
                    )}
                    {selectedResult.brand_sentiment && selectedResult.brand_sentiment !== 'not_mentioned' && (
                      <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-lg ${
                        selectedResult.brand_sentiment === 'strong_endorsement' ? 'bg-green-100 text-green-800' :
                        selectedResult.brand_sentiment === 'positive_endorsement' ? 'bg-lime-100 text-lime-800' :
                        selectedResult.brand_sentiment === 'neutral_mention' ? 'bg-blue-100 text-blue-800' :
                        selectedResult.brand_sentiment === 'conditional' ? 'bg-yellow-100 text-yellow-800' :
                        selectedResult.brand_sentiment === 'negative_comparison' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {selectedResult.brand_sentiment === 'strong_endorsement' ? 'Very Favorable' :
                         selectedResult.brand_sentiment === 'positive_endorsement' ? 'Favorable' :
                         selectedResult.brand_sentiment === 'neutral_mention' ? 'Neutral Mention' :
                         selectedResult.brand_sentiment === 'conditional' ? 'Conditional' :
                         selectedResult.brand_sentiment === 'negative_comparison' ? 'Negative Comparison' :
                         'Unknown'}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-700 [&_a]:text-[#4A7C59] [&_a]:underline [&_a]:hover:text-[#3d6649] [&_p]:mb-3 [&_p]:leading-relaxed [&_ul]:mb-3 [&_ul]:pl-5 [&_ul]:list-disc [&_ol]:mb-3 [&_ol]:pl-5 [&_ol]:list-decimal [&_li]:mb-1 [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mb-2 [&_h3]:font-semibold [&_h3]:mb-2 [&_strong]:font-semibold [&_table]:w-full [&_table]:mb-3 [&_table]:border-collapse [&_table]:text-xs [&_th]:border [&_th]:border-gray-300 [&_th]:bg-gray-100 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold [&_td]:border [&_td]:border-gray-300 [&_td]:px-2 [&_td]:py-1">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        a: ({ href, children }) => (
                          <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
                        ),
                        table: ({ children }) => (
                          <div className="overflow-x-auto mb-3">
                            <table className="min-w-full">{children}</table>
                          </div>
                        ),
                      }}
                    >
                      {highlightCompetitors(formatResponseText(selectedResult.response_text || ''), selectedResult.all_brands_mentioned)}
                    </ReactMarkdown>
                  </div>
                  {selectedResult.sources && selectedResult.sources.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <p className="text-xs text-gray-500 mb-2">Sources ({selectedResult.sources.length})</p>
                      <div className="space-y-1.5">
                        {selectedResult.sources.map((source, idx) => {
                          const { domain, subtitle } = formatSourceDisplay(source.url, source.title);
                          return (
                            <a
                              key={idx}
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 text-sm text-[#4A7C59] hover:text-[#3d6649] hover:underline"
                            >
                              <ExternalLink className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate">
                                <span className="font-medium">{domain}</span>
                                {subtitle && <span className="text-gray-500"> · {subtitle}</span>}
                              </span>
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {selectedResult.tokens && (
                    <p className="text-xs text-gray-400 mt-4 pt-4 border-t border-gray-100">
                      {selectedResult.tokens} tokens · {formatCurrency(selectedResult.cost || 0)}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
