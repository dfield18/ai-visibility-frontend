'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, ZAxis, BarChart, Bar, ReferenceArea, ReferenceLine, ComposedChart, Line, ErrorBar } from 'recharts';
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
  const [shareOfVoiceFilter, setShareOfVoiceFilter] = useState<'all' | 'tracked'>('all');
  const [llmBreakdownBrandFilter, setLlmBreakdownBrandFilter] = useState<string>('');
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [aiSummaryExpanded, setAiSummaryExpanded] = useState(false);
  const [selectedResult, setSelectedResult] = useState<Result | null>(null);
  const [chartTab, setChartTab] = useState<'ranking' | 'firstPosition' | 'avgRank'>('ranking');
  const [rankingViewMode, setRankingViewMode] = useState<'dots' | 'range'>('dots');

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

    const pieData: { name: string; value: number; percentage: number; color: string }[] = [];
    const colors = ['#4A7C59', '#5B8A6A', '#6C987B', '#7DA68C', '#8EB49D', '#9FC2AE', '#B0D0BF', '#C1DED0'];
    let colorIndex = 0;

    const sortedBrands = Object.entries(mentions)
      .sort((a, b) => b[1].count - a[1].count);

    for (const [brand, data] of sortedBrands) {
      const percentage = (data.count / totalMentions) * 100;
      const isSearchedBrand = brand === runStatus.brand;
      pieData.push({
        name: brand,
        value: data.count,
        percentage,
        color: isSearchedBrand ? '#3B82F6' : colors[colorIndex % colors.length],
      });
      colorIndex++;
    }

    if (includeOther) {
      const percentage = (otherCount / totalMentions) * 100;
      pieData.push({
        name: 'Other',
        value: otherCount,
        percentage,
        color: '#F97316',
      });
    }

    return pieData;
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
      topPosition: number;
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
          topPosition: 0,
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
          const responseText = result.response_text.toLowerCase();
          const brandLower = selectedBrand.toLowerCase();

          const allBrands = [runStatus.brand, ...(result.competitors_mentioned || [])].filter(Boolean);
          const brandPositions: { brand: string; position: number }[] = [];

          for (const brand of allBrands) {
            const pos = responseText.indexOf(brand.toLowerCase());
            if (pos !== -1) {
              brandPositions.push({ brand, position: pos });
            }
          }

          brandPositions.sort((a, b) => a.position - b.position);
          const rank = brandPositions.findIndex(bp => bp.brand.toLowerCase() === brandLower) + 1;

          if (rank > 0) {
            providerStats[provider].ranks.push(rank);
            if (rank === 1) {
              providerStats[provider].topPosition += 1;
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
  const RANK_BANDS = ['1 (Top)', '2–3', '4–5', '6–10', '10+', 'Not mentioned'] as const;

  // Helper function to convert position to rank band (Fix 1)
  const positionToRankBand = (position: number | null | undefined, brandMentioned: boolean): { label: string; index: number } => {
    if (!brandMentioned || position === null || position === undefined || position === 0) {
      return { label: 'Not mentioned', index: 5 };
    }
    if (position === 1) return { label: '1 (Top)', index: 0 };
    if (position >= 2 && position <= 3) return { label: '2–3', index: 1 };
    if (position >= 4 && position <= 5) return { label: '4–5', index: 2 };
    if (position >= 6 && position <= 10) return { label: '6–10', index: 3 };
    return { label: '10+', index: 4 };
  };

  const providerLabels: Record<string, string> = {
    openai: 'OpenAI',
    anthropic: 'Claude',
    gemini: 'Gemini',
    perplexity: 'Perplexity',
    ai_overviews: 'Google AI Overviews',
  };

  const scatterPlotData = useMemo(() => {
    if (!runStatus) return [];

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
      isMentioned: boolean;
    }[] = [];

    for (const result of results) {
      const provider = result.provider;
      let rank = 0; // 0 means not mentioned

      if (result.response_text) {
        const responseText = result.response_text.toLowerCase();
        const brandLower = selectedBrand.toLowerCase();

        // Check if brand is mentioned
        const isMentioned = isCategory
          ? result.competitors_mentioned?.includes(selectedBrand)
          : result.brand_mentioned;

        if (isMentioned) {
          // Get all brands and their positions
          const allBrands = [runStatus.brand, ...(result.competitors_mentioned || [])].filter(Boolean);
          const brandPositions: { brand: string; position: number }[] = [];

          for (const brand of allBrands) {
            const pos = responseText.indexOf(brand.toLowerCase());
            if (pos !== -1) {
              brandPositions.push({ brand, position: pos });
            }
          }

          brandPositions.sort((a, b) => a.position - b.position);
          rank = brandPositions.findIndex(bp => bp.brand.toLowerCase() === brandLower) + 1;
        }
      }

      const { label: rankBand, index: rankBandIndex } = positionToRankBand(rank, rank > 0);

      dataPoints.push({
        provider,
        label: providerLabels[provider] || provider,
        prompt: truncate(result.prompt, 30),
        rank,
        rankBand,
        rankBandIndex,
        isMentioned: rank > 0,
      });
    }

    return dataPoints;
  }, [runStatus, globallyFilteredResults, llmBreakdownBrands]);

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

    return Object.values(providerStats).map(stats => {
      const mentionedPoints = stats.dataPoints.filter(p => p.rank > 0);
      const allBandIndices = stats.dataPoints.map(p => p.bandIndex);

      const bestBandIndex = Math.min(...allBandIndices);
      const worstBandIndex = Math.max(...allBandIndices);

      let avgBandIndex = 5; // Default to "Not mentioned"
      let avgPositionNumeric: number | null = null;
      let avgBandLabel = 'Not mentioned';

      if (mentionedPoints.length > 0) {
        avgPositionNumeric = mentionedPoints.reduce((sum, p) => sum + p.rank, 0) / mentionedPoints.length;
        const avgBand = positionToRankBand(Math.round(avgPositionNumeric), true);
        avgBandIndex = avgBand.index;
        avgBandLabel = avgBand.label;
      }

      // For stacked bar: rangeHeight needs +1 to show at least one band width
      const rangeHeight = worstBandIndex - bestBandIndex + 1;

      return {
        provider: stats.provider,
        label: stats.label,
        bestBandIndex,
        worstBandIndex,
        avgBandIndex,
        avgBandLabel,
        avgPositionNumeric,
        promptsAnalyzed: stats.dataPoints.length,
        mentions: mentionedPoints.length,
        // For bar chart rendering - rangeStart positions the invisible spacer
        rangeStart: bestBandIndex,
        rangeHeight,
      };
    });
  }, [scatterPlotData, runStatus]);

  // First Position chart data - count of times brand was listed first per LLM
  const firstPositionChartData = useMemo(() => {
    if (!runStatus) return [];

    const isCategory = runStatus.search_type === 'category';
    const selectedBrand = isCategory ? llmBreakdownBrands[0] : runStatus.brand;
    if (!selectedBrand) return [];

    const results = globallyFilteredResults.filter((r: Result) => !r.error);

    const providerLabels: Record<string, string> = {
      openai: 'OpenAI',
      anthropic: 'Claude',
      gemini: 'Gemini',
      perplexity: 'Perplexity',
      ai_overviews: 'Google AI Overviews',
    };

    const providerColors: Record<string, string> = {
      openai: '#2D5A3D',
      anthropic: '#4A7C59',
      gemini: '#5B8A6A',
      perplexity: '#6C987B',
      ai_overviews: '#7DA68C',
    };

    // Group by provider
    const providerStats: Record<string, { firstCount: number; total: number }> = {};

    for (const result of results) {
      const provider = result.provider;
      if (!providerStats[provider]) {
        providerStats[provider] = { firstCount: 0, total: 0 };
      }
      providerStats[provider].total++;

      if (!result.response_text) continue;
      const responseText = result.response_text.toLowerCase();
      const allBrands = [runStatus.brand, ...(result.competitors_mentioned || [])].filter(Boolean);

      let firstPos = Infinity;
      let firstBrand = '';
      for (const brand of allBrands) {
        const pos = responseText.indexOf(brand.toLowerCase());
        if (pos !== -1 && pos < firstPos) {
          firstPos = pos;
          firstBrand = brand;
        }
      }

      if (firstBrand.toLowerCase() === selectedBrand.toLowerCase()) {
        providerStats[provider].firstCount++;
      }
    }

    return Object.entries(providerStats).map(([provider, stats]) => ({
      provider,
      label: providerLabels[provider] || provider,
      firstCount: stats.firstCount,
      total: stats.total,
      color: providerColors[provider] || '#4A7C59',
    }));
  }, [runStatus, globallyFilteredResults, llmBreakdownBrands]);

  // Average Ranking chart data - average rank per LLM
  const avgRankChartData = useMemo(() => {
    if (!runStatus) return [];

    const isCategory = runStatus.search_type === 'category';
    const selectedBrand = isCategory ? llmBreakdownBrands[0] : runStatus.brand;
    if (!selectedBrand) return [];

    const results = globallyFilteredResults.filter((r: Result) => !r.error);

    const providerLabels: Record<string, string> = {
      openai: 'OpenAI',
      anthropic: 'Claude',
      gemini: 'Gemini',
      perplexity: 'Perplexity',
      ai_overviews: 'Google AI Overviews',
    };

    const providerColors: Record<string, string> = {
      openai: '#2D5A3D',
      anthropic: '#4A7C59',
      gemini: '#5B8A6A',
      perplexity: '#6C987B',
      ai_overviews: '#7DA68C',
    };

    // Group by provider
    const providerRanks: Record<string, number[]> = {};

    for (const result of results) {
      const provider = result.provider;
      if (!providerRanks[provider]) {
        providerRanks[provider] = [];
      }

      if (!result.response_text) continue;
      const responseText = result.response_text.toLowerCase();
      const allBrands = [runStatus.brand, ...(result.competitors_mentioned || [])].filter(Boolean);

      const brandPositions: { brand: string; position: number }[] = [];
      for (const brand of allBrands) {
        const pos = responseText.indexOf(brand.toLowerCase());
        if (pos !== -1) {
          brandPositions.push({ brand, position: pos });
        }
      }
      brandPositions.sort((a, b) => a.position - b.position);

      const rank = brandPositions.findIndex(bp => bp.brand.toLowerCase() === selectedBrand.toLowerCase()) + 1;
      if (rank > 0) {
        providerRanks[provider].push(rank);
      }
    }

    return Object.entries(providerRanks).map(([provider, ranks]) => ({
      provider,
      label: providerLabels[provider] || provider,
      avgRank: ranks.length > 0 ? ranks.reduce((a, b) => a + b, 0) / ranks.length : 0,
      mentionCount: ranks.length,
      color: providerColors[provider] || '#4A7C59',
    })).filter(d => d.mentionCount > 0);
  }, [runStatus, globallyFilteredResults, llmBreakdownBrands]);

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
      const responseText = result.response_text.toLowerCase();
      const allBrands = [runStatus.brand, ...(result.competitors_mentioned || [])].filter(Boolean);

      let firstPos = Infinity;
      let firstBrand = '';
      for (const brand of allBrands) {
        const pos = responseText.indexOf(brand.toLowerCase());
        if (pos !== -1 && pos < firstPos) {
          firstPos = pos;
          firstBrand = brand;
        }
      }

      if (selectedBrand && firstBrand.toLowerCase() === selectedBrand.toLowerCase()) {
        topPositionCount++;
      }
    }

    // Average rank
    const ranks: number[] = [];
    for (const result of results) {
      if (!result.response_text) continue;
      const responseText = result.response_text.toLowerCase();
      const allBrands = [runStatus.brand, ...(result.competitors_mentioned || [])].filter(Boolean);

      const brandPositions: { brand: string; position: number }[] = [];
      for (const brand of allBrands) {
        const pos = responseText.indexOf(brand.toLowerCase());
        if (pos !== -1) {
          brandPositions.push({ brand, position: pos });
        }
      }
      brandPositions.sort((a, b) => a.position - b.position);

      if (selectedBrand) {
        const rank = brandPositions.findIndex(bp => bp.brand.toLowerCase() === selectedBrand.toLowerCase()) + 1;
        if (rank > 0) ranks.push(rank);
      }
    }
    const avgRank = ranks.length > 0 ? ranks.reduce((a, b) => a + b, 0) / ranks.length : null;

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
          const responseText = r.response_text.toLowerCase();
          const allBrands = [runStatus.brand, ...(r.competitors_mentioned || [])].filter(Boolean);
          const brandPositions: { brand: string; position: number }[] = [];
          for (const brand of allBrands) {
            const pos = responseText.indexOf(brand.toLowerCase());
            if (pos !== -1) {
              brandPositions.push({ brand, position: pos });
            }
          }
          brandPositions.sort((a, b) => a.position - b.position);
          const brandRank = brandPositions.findIndex(bp => bp.brand.toLowerCase() === runStatus.brand.toLowerCase()) + 1;
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-sm font-medium text-gray-600 mb-1">Visibility Score</p>
          <p className={`text-2xl font-bold ${getMentionRateColor(overviewMetrics?.overallVisibility ? overviewMetrics.overallVisibility / 100 : 0)}`}>
            {overviewMetrics?.overallVisibility?.toFixed(1) || 0}%
          </p>
          <p className="text-xs text-gray-400 mt-1">Percent of prompts where the brand is mentioned</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-sm font-medium text-gray-600 mb-1">First Position</p>
          <p className="text-2xl font-bold text-gray-900">
            {overviewMetrics?.topPositionCount || 0}
            <span className="text-sm font-normal text-gray-400">/{overviewMetrics?.totalResponses || 0}</span>
          </p>
          <p className="text-xs text-gray-400 mt-1">Responses where the brand is ranked first</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-sm font-medium text-gray-600 mb-1">Avg. Rank</p>
          <p className="text-2xl font-bold text-gray-900">
            {overviewMetrics?.avgRank?.toFixed(1) || 'n/a'}
          </p>
          <p className="text-xs text-gray-400 mt-1">Average position when the brand is mentioned</p>
        </div>
      </div>

      {/* Charts Section with Tabs */}
      {scatterPlotData.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          {/* Chart Tabs */}
          <div className="flex items-center gap-1 mb-4 border-b border-gray-200">
            <button
              onClick={() => setChartTab('ranking')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                chartTab === 'ranking'
                  ? 'border-[#4A7C59] text-[#4A7C59]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Brand Ranking
            </button>
            <button
              onClick={() => setChartTab('firstPosition')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                chartTab === 'firstPosition'
                  ? 'border-[#4A7C59] text-[#4A7C59]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              First Position
            </button>
            <button
              onClick={() => setChartTab('avgRank')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                chartTab === 'avgRank'
                  ? 'border-[#4A7C59] text-[#4A7C59]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Average Ranking
            </button>
          </div>

          {/* Brand Ranking Chart */}
          {chartTab === 'ranking' && (
            <>
              {/* Subtitle and view toggle */}
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-500">
                  How each LLM ranks your brand across all prompts
                </p>
                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => setRankingViewMode('dots')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      rankingViewMode === 'dots'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Dots
                  </button>
                  <button
                    onClick={() => setRankingViewMode('range')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      rankingViewMode === 'range'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Range
                  </button>
                </div>
              </div>

              {/* Dots View */}
              {rankingViewMode === 'dots' && (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 20, right: 20, bottom: 40, left: 100 }}>
                      {/* Horizontal band shading - increased contrast, "1 (Top)" emphasized */}
                      <ReferenceArea y1={-0.5} y2={0.5} fill="#bbf7d0" fillOpacity={0.6} />
                      <ReferenceArea y1={0.5} y2={1.5} fill="#fef08a" fillOpacity={0.4} />
                      <ReferenceArea y1={1.5} y2={2.5} fill="#fef08a" fillOpacity={0.3} />
                      <ReferenceArea y1={2.5} y2={3.5} fill="#fed7aa" fillOpacity={0.35} />
                      <ReferenceArea y1={3.5} y2={4.5} fill="#fecaca" fillOpacity={0.35} />
                      <ReferenceArea y1={4.5} y2={5.5} fill="#e5e7eb" fillOpacity={0.4} />
                      {/* Divider line above "Not mentioned" band */}
                      <ReferenceLine y={4.5} stroke="#9ca3af" strokeWidth={1} strokeDasharray="4 4" />
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={true} horizontal={false} />
                      <XAxis
                        type="category"
                        dataKey="label"
                        allowDuplicatedCategory={false}
                        tick={{ fontSize: 12, fill: '#6b7280' }}
                        axisLine={{ stroke: '#e5e7eb' }}
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
                          const isNotMentioned = label === 'Not mentioned';
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
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg min-w-[180px]">
                                <p className="text-sm font-medium text-gray-900">LLM: {data.label}</p>
                                <p className="text-sm text-gray-700 mt-1">
                                  {data.rank === 0 ? 'Not mentioned' : `Shown as result #${data.rank}`}
                                </p>
                                <p className="text-xs text-gray-500 mt-2 truncate" title={data.prompt}>
                                  Prompt: {data.prompt}
                                </p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Scatter data={scatterPlotData} fill="#6b7280">
                        {scatterPlotData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill="#6b7280" opacity={entry.isMentioned ? 0.7 : 0.3} />
                        ))}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Range View */}
              {rankingViewMode === 'range' && (
                <div>
                  {/* Explanatory subtitle */}
                  <p className="text-xs text-gray-400 mb-3">
                    Range shows best-to-worst rank across prompts; marker shows average rank.
                  </p>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={rangeChartData}
                        layout="vertical"
                        margin={{ top: 10, right: 20, bottom: 40, left: 90 }}
                      >
                        {/* De-emphasized background bands (~50% less opacity than Dots view) */}
                        <ReferenceArea x1={-0.5} x2={0.5} fill="#bbf7d0" fillOpacity={0.25} />
                        <ReferenceArea x1={0.5} x2={1.5} fill="#fef08a" fillOpacity={0.15} />
                        <ReferenceArea x1={1.5} x2={2.5} fill="#fef08a" fillOpacity={0.12} />
                        <ReferenceArea x1={2.5} x2={3.5} fill="#fed7aa" fillOpacity={0.15} />
                        <ReferenceArea x1={3.5} x2={4.5} fill="#fecaca" fillOpacity={0.15} />
                        <ReferenceArea x1={4.5} x2={5.5} fill="#f3f4f6" fillOpacity={0.4} />
                        {/* Divider line before "Not mentioned" band */}
                        <ReferenceLine x={4.5} stroke="#d1d5db" strokeWidth={1} />
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} vertical={true} />
                        <YAxis
                          type="category"
                          dataKey="label"
                          tick={{ fontSize: 12, fill: '#374151' }}
                          axisLine={{ stroke: '#e5e7eb' }}
                          tickLine={false}
                          width={80}
                        />
                        <XAxis
                          type="number"
                          domain={[-0.5, RANK_BANDS.length - 0.5]}
                          tick={(props: any) => {
                            const { x, y, payload } = props;
                            const label = RANK_BANDS[Math.round(payload?.value ?? 0)] || '';
                            const isNotMentioned = label === 'Not mentioned';
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
                          ticks={RANK_BANDS.map((_, i) => i)}
                          interval={0}
                        />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload;
                              return (
                                <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg min-w-[220px]">
                                  <p className="text-sm font-semibold text-gray-900">LLM: {data.label}</p>
                                  <div className="mt-2 space-y-1">
                                    <p className="text-sm text-gray-700">
                                      <span className="text-gray-500">Best rank:</span> {RANK_BANDS[data.bestBandIndex]}
                                    </p>
                                    <p className="text-sm text-gray-700">
                                      <span className="text-gray-500">Worst rank:</span> {RANK_BANDS[data.worstBandIndex]}
                                    </p>
                                    <p className="text-sm text-gray-700">
                                      <span className="text-gray-500">Avg rank:</span> {data.avgBandLabel}
                                      {data.avgPositionNumeric !== null && (
                                        <span className="text-gray-400 ml-1">({data.avgPositionNumeric.toFixed(1)})</span>
                                      )}
                                    </p>
                                  </div>
                                  <div className="mt-2 pt-2 border-t border-gray-100 space-y-0.5">
                                    <p className="text-xs text-gray-500">
                                      Prompts analyzed: {data.promptsAnalyzed}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                      Mentions: {data.mentions}
                                    </p>
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        {/* Range bar: invisible spacer + visible range */}
                        <Bar dataKey="rangeStart" stackId="range" fill="transparent" barSize={10} />
                        <Bar
                          dataKey="rangeHeight"
                          stackId="range"
                          fill="#6b7280"
                          fillOpacity={0.5}
                          radius={[4, 4, 4, 4]}
                          barSize={10}
                        />
                        {/* Average marker - positioned at avgBandIndex */}
                        <Scatter
                          dataKey="avgBandIndex"
                          fill="#374151"
                          shape={(props: any) => {
                            const { cx, cy, payload } = props;
                            // Only show marker if there are mentions
                            if (payload.mentions === 0) return null;
                            return (
                              <g>
                                {/* Outer ring for visibility */}
                                <circle
                                  cx={cx}
                                  cy={cy}
                                  r={7}
                                  fill="white"
                                  stroke="#374151"
                                  strokeWidth={2}
                                />
                                {/* Inner filled circle */}
                                <circle
                                  cx={cx}
                                  cy={cy}
                                  r={4}
                                  fill="#374151"
                                />
                              </g>
                            );
                          }}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                  {/* Legend */}
                  <div className="flex items-center justify-center gap-6 mt-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-2.5 bg-gray-500 opacity-50 rounded-full" />
                      <span className="text-xs text-gray-500">Rank range</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-gray-700 border-2 border-white shadow-sm" />
                      <span className="text-xs text-gray-500">Average rank</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* First Position Bar Chart */}
          {chartTab === 'firstPosition' && (
            <>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={firstPositionChartData} margin={{ top: 20, right: 20, bottom: 40, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 12, fill: '#6b7280' }}
                      axisLine={{ stroke: '#e5e7eb' }}
                    />
                    <YAxis
                      tick={{ fontSize: 12, fill: '#6b7280' }}
                      axisLine={{ stroke: '#e5e7eb' }}
                      allowDecimals={false}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg">
                              <p className="text-sm font-medium text-gray-900">{data.label}</p>
                              <p className="text-sm text-gray-700 mt-1">
                                First Position: {data.firstCount} / {data.total}
                              </p>
                              <p className="text-xs text-gray-500 mt-1">
                                {((data.firstCount / data.total) * 100).toFixed(1)}% of responses
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="firstCount" name="First Position">
                      {firstPositionChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-gray-500 text-center mt-2">
                Number of times brand was listed first in each LLM's responses
              </p>
            </>
          )}

          {/* Average Ranking Bar Chart */}
          {chartTab === 'avgRank' && (
            <>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={avgRankChartData} margin={{ top: 20, right: 20, bottom: 40, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 12, fill: '#6b7280' }}
                      axisLine={{ stroke: '#e5e7eb' }}
                    />
                    <YAxis
                      tick={{ fontSize: 12, fill: '#6b7280' }}
                      axisLine={{ stroke: '#e5e7eb' }}
                      domain={[0, 'auto']}
                      reversed
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg">
                              <p className="text-sm font-medium text-gray-900">{data.label}</p>
                              <p className="text-sm text-gray-700 mt-1">
                                Average Rank: #{data.avgRank.toFixed(1)}
                              </p>
                              <p className="text-xs text-gray-500 mt-1">
                                Based on {data.mentionCount} mentions
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="avgRank" name="Average Rank">
                      {avgRankChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-gray-500 text-center mt-2">
                Average position of brand when mentioned (lower is better)
              </p>
            </>
          )}
        </div>
      )}

      {/* All Results Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <h2 className="text-base font-semibold text-gray-900">All Results</h2>
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
                Mentioned
              </button>
              <button
                onClick={() => setFilter('not_mentioned')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === 'not_mentioned' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
              >
                Not Mentioned
              </button>
            </div>
            <select
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59] focus:border-transparent"
            >
              <option value="all">All LLMs</option>
              {availableProviders.map((provider) => (
                <option key={provider} value={provider}>{getProviderLabel(provider)}</option>
              ))}
            </select>
            <button
              onClick={handleExportCSV}
              className="px-3 py-1.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              CSV
            </button>
          </div>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Showing {filteredResults.length} of {globallyFilteredResults.filter((r: Result) => !r.error || (r.provider === 'ai_overviews' && r.error)).length} results
        </p>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Prompt</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">LLM</th>
                {!isCategory && (
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">{runStatus.brand} Mentioned</th>
                )}
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">{isCategory ? 'Brands' : 'Competitors Mentioned'}</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
              </tr>
            </thead>
            <tbody>
              {filteredResults.map((result: Result) => (
                <tr
                  key={result.id}
                  className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                  onClick={() => setSelectedResult(result)}
                >
                  <td className="py-3 px-4">
                    <p className="text-sm text-[#4A7C59] hover:text-[#3d6649] font-medium">{truncate(result.prompt, 50)}</p>
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
                </tr>
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

      {/* Export to CSV */}
      <div className="flex justify-center pt-4">
        <button
          onClick={handleExportCSV}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Download className="w-4 h-4" />
          Export to CSV
        </button>
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
            {Object.entries(llmBreakdownStats).map(([provider, stats]) => (
              <div key={provider} className="p-4 bg-[#FAFAF8] rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-medium text-gray-900 text-sm">{getProviderLabel(provider)}</span>
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
                      top position: <span className="font-medium text-[#4A7C59]">{stats.mentioned === 0 ? 'n/a' : stats.topPosition}</span>
                    </span>
                    <span className="text-gray-500">
                      avg rank: <span className="font-medium text-gray-700">{stats.mentioned === 0 ? 'n/a' : (stats.avgRank !== null ? stats.avgRank.toFixed(1) : 'n/a')}</span>
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {/* Share of Voice Pie Chart */}
      {shareOfVoiceData.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">Share of Voice</h2>
            <select
              value={shareOfVoiceFilter}
              onChange={(e) => setShareOfVoiceFilter(e.target.value as 'all' | 'tracked')}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59] focus:border-transparent"
            >
              <option value="all">All Brands</option>
              <option value="tracked">Tracked Only</option>
            </select>
          </div>
          <div className="flex flex-col lg:flex-row items-center gap-6">
            <div className="w-full lg:w-1/2 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={shareOfVoiceData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                  >
                    {shareOfVoiceData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name) => {
                      const entry = shareOfVoiceData.find(d => d.name === name);
                      return [`${value} mentions (${entry?.percentage.toFixed(1) ?? 0}%)`, name];
                    }}
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      padding: '8px 12px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-full lg:w-1/2">
              <div className="space-y-2">
                {shareOfVoiceData.map((entry) => (
                  <div key={entry.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                      <span className={`text-sm font-medium ${entry.name === 'Other' ? 'text-orange-600' : 'text-gray-700'}`}>
                        {entry.name}
                        {entry.name === 'Other' && <span className="text-xs ml-1 text-orange-500">(discovered)</span>}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-500">{entry.value} mentions</span>
                      <span className="text-sm font-semibold text-gray-900 w-14 text-right">{entry.percentage.toFixed(1)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
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
                Mentioned
              </button>
              <button
                onClick={() => setFilter('not_mentioned')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === 'not_mentioned' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
              >
                Not Mentioned
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
                                  {formatResponseText(result.response_text || '')}
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
        {activeTab === 'sentiment' && (
          <PlaceholderTab
            title="Sentiment & Framing"
            description="Analyze how LLMs describe and frame your brand in their responses. Coming soon."
          />
        )}
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
                      {formatResponseText(selectedResult.response_text || '')}
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
