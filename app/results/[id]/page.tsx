'use client';

import { useState, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
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

export default function ResultsPage() {
  const router = useRouter();
  const params = useParams();
  const runId = params.id as string;

  const [filter, setFilter] = useState<FilterType>('all');
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [brandMentionsProviderFilter, setBrandMentionsProviderFilter] = useState<string>('all');
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [aiSummaryExpanded, setAiSummaryExpanded] = useState(false);

  const { data: runStatus, isLoading, error } = useRunStatus(runId, true);
  const { data: aiSummary, isLoading: isSummaryLoading } = useAISummary(
    runId,
    runStatus?.status === 'complete'
  );

  // Filter results - include AI Overview errors to show "Not Available"
  const filteredResults = useMemo(() => {
    if (!runStatus) return [];

    return runStatus.results.filter((result: Result) => {
      // Include AI Overview errors to show "Not Available" status
      const isAiOverviewError = result.provider === 'ai_overviews' && result.error;

      // Filter out other errored results for display
      if (result.error && !isAiOverviewError) return false;

      // Brand mention filter - skip for errored results
      if (!result.error) {
        if (filter === 'mentioned' && !result.brand_mentioned) return false;
        if (filter === 'not_mentioned' && result.brand_mentioned) return false;
      }

      // Provider filter
      if (providerFilter !== 'all' && result.provider !== providerFilter) return false;

      return true;
    });
  }, [runStatus, filter, providerFilter]);

  // Count AI Overview unavailable results
  const aiOverviewUnavailableCount = useMemo(() => {
    if (!runStatus) return 0;
    return runStatus.results.filter(
      (r: Result) => r.provider === 'ai_overviews' && r.error
    ).length;
  }, [runStatus]);

  // Calculate brand/competitor mentions filtered by provider
  const filteredBrandMentions = useMemo(() => {
    if (!runStatus) return {};

    // Filter results by provider if selected
    const results = runStatus.results.filter((r: Result) => {
      if (r.error) return false;
      if (brandMentionsProviderFilter !== 'all' && r.provider !== brandMentionsProviderFilter) return false;
      return true;
    });

    // Count mentions for each competitor/brand
    const mentions: Record<string, { count: number; total: number }> = {};

    // Add the searched brand based on brand_mentioned field (only for brand searches, not category searches)
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
        mentions[searchedBrand] = { count: brandMentionCount, total: results.length };
      }
    }

    // Count competitor mentions
    for (const result of results) {
      if (result.competitors_mentioned) {
        for (const comp of result.competitors_mentioned) {
          if (!mentions[comp]) {
            mentions[comp] = { count: 0, total: 0 };
          }
          mentions[comp].count += 1;
        }
      }
    }

    // Calculate rates
    const totalResults = results.length;
    const mentionsWithRates: Record<string, { count: number; rate: number }> = {};

    for (const [comp, data] of Object.entries(mentions)) {
      mentionsWithRates[comp] = {
        count: data.count,
        rate: totalResults > 0 ? data.count / totalResults : 0,
      };
    }

    return mentionsWithRates;
  }, [runStatus, brandMentionsProviderFilter]);

  // Get unique providers from results for the filter dropdown
  const availableProviders = useMemo(() => {
    if (!runStatus) return [];
    const providers = new Set<string>();
    runStatus.results.forEach((r: Result) => {
      if (!r.error) providers.add(r.provider);
    });
    return Array.from(providers);
  }, [runStatus]);

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

  // Extract a readable title from URL path when no title is available
  const getReadableTitleFromUrl = (url: string): string => {
    try {
      const parsedUrl = new URL(url);
      const domain = parsedUrl.hostname.replace(/^www\./, '');
      const pathname = parsedUrl.pathname;

      // Special handling for Reddit URLs - extract subreddit name
      if (domain === 'reddit.com' || domain.endsWith('.reddit.com')) {
        const redditMatch = pathname.match(/^\/r\/([^/]+)/);
        if (redditMatch) {
          return `r/${redditMatch[1]}`;
        }
      }

      // Get the last meaningful segment(s) from the path
      const segments = pathname.split('/').filter(Boolean);
      if (segments.length === 0) return domain;

      // Take the last 1-2 segments, skip common patterns
      const meaningfulSegments = segments
        .filter(seg => {
          // Skip pure numeric IDs or hex strings
          if (/^[a-f0-9]{8,}$/i.test(seg)) return false;
          if (/^[0-9]+$/.test(seg)) return false;
          // Skip common non-descriptive segments
          if (['index', 'article', 'post', 'page', 'amp'].includes(seg.toLowerCase())) return false;
          return true;
        })
        .slice(-2); // Take last 2 meaningful segments

      if (meaningfulSegments.length === 0) return domain;

      // Clean up and format the segments
      const title = meaningfulSegments
        .map(seg => {
          // Remove file extensions
          seg = seg.replace(/\.(html?|php|aspx?)$/i, '');
          // Remove ID prefixes like "a69546581-"
          seg = seg.replace(/^[a-z]?\d{6,}-?/i, '');
          // Convert dashes/underscores to spaces
          seg = seg.replace(/[-_]+/g, ' ');
          // Clean up extra spaces
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

  // Format source display: domain + readable path title
  const formatSourceDisplay = (url: string, title?: string): { domain: string; subtitle: string } => {
    const domain = getDomain(url);

    // If we have a good title that's not just the URL, use it
    if (title && title !== url && !title.startsWith('http')) {
      return { domain, subtitle: title };
    }

    // Otherwise extract from URL
    const readableTitle = getReadableTitleFromUrl(url);
    if (readableTitle !== domain) {
      return { domain, subtitle: readableTitle };
    }

    return { domain, subtitle: '' };
  };

  // Get all unique brands mentioned (searched brand + competitors)
  const availableBrands = useMemo(() => {
    if (!runStatus) return [];
    const brands = new Set<string>();
    // Add searched brand
    if (runStatus.brand) {
      brands.add(runStatus.brand);
    }
    // Add all competitors mentioned
    runStatus.results.forEach((r: Result) => {
      if (!r.error && r.competitors_mentioned) {
        r.competitors_mentioned.forEach((comp: string) => brands.add(comp));
      }
    });
    return Array.from(brands).sort();
  }, [runStatus]);

  // Calculate top cited sources
  const topCitedSources = useMemo(() => {
    if (!runStatus) return [];

    // Filter results by provider if selected
    const results = runStatus.results.filter((r: Result) => {
      if (r.error) return false;
      if (sourcesProviderFilter !== 'all' && r.provider !== sourcesProviderFilter) return false;
      return true;
    });

    // Aggregate sources by domain, tracking per-URL citation counts
    const sourceData: Record<string, {
      domain: string;
      urlCounts: Map<string, { url: string; title: string; count: number }>;
      count: number;
      providers: Set<string>;
      brands: Set<string>;
    }> = {};

    for (const result of results) {
      if (result.sources && result.sources.length > 0) {
        // Get brands mentioned in this result
        const resultBrands: string[] = [];
        if (result.brand_mentioned && runStatus.brand) {
          resultBrands.push(runStatus.brand);
        }
        if (result.competitors_mentioned) {
          resultBrands.push(...result.competitors_mentioned);
        }

        // Deduplicate sources within this response by URL
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
          // Track per-URL citation count
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
          // Track which brands were mentioned in responses citing this source
          resultBrands.forEach(brand => sourceData[domain].brands.add(brand));
        }
      }
    }

    // Convert to array, filter by brand if selected, and sort by count
    return Object.values(sourceData)
      .filter(s => {
        if (sourcesBrandFilter === 'all') return true;
        return s.brands.has(sourcesBrandFilter);
      })
      .map(s => {
        // Convert urlCounts map to array sorted by citation count
        const urlDetails = Array.from(s.urlCounts.values())
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
      .sort((a, b) => b.count - a.count)
      .slice(0, 10); // Top 10
  }, [runStatus, sourcesProviderFilter, sourcesBrandFilter]);

  // Check if there are any sources at all (before filtering)
  const hasAnySources = useMemo(() => {
    if (!runStatus) return false;
    return runStatus.results.some((r: Result) => !r.error && r.sources && r.sources.length > 0);
  }, [runStatus]);

  // Key influencers - sources cited by multiple providers
  const [expandedInfluencers, setExpandedInfluencers] = useState<Set<string>>(new Set());

  const keyInfluencers = useMemo(() => {
    if (!runStatus) return [];

    // Use all results (not filtered by provider) to find cross-provider sources
    const results = runStatus.results.filter((r: Result) => !r.error);

    // Aggregate sources by domain, tracking per-URL citation counts
    const sourceData: Record<string, {
      domain: string;
      urlCounts: Map<string, { url: string; title: string; count: number }>;
      count: number;
      providers: Set<string>;
    }> = {};

    for (const result of results) {
      if (result.sources && result.sources.length > 0) {
        // Deduplicate sources within this response by URL
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
          // Track per-URL citation count
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

    // Filter to sources cited by 2+ providers and sort by provider count then citation count
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
      .slice(0, 5); // Top 5
  }, [runStatus]);

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
      'Response Type',
      'Tokens',
      'Cost',
      'Sources',
      'Response',
    ];

    const rows = runStatus.results
      .filter((r: Result) => !r.error)
      .map((r: Result) => [
        `"${r.prompt.replace(/"/g, '""')}"`,
        r.provider,
        r.model,
        r.temperature,
        r.brand_mentioned ? 'Yes' : 'No',
        `"${r.competitors_mentioned.join(', ')}"`,
        r.response_type || '',
        r.tokens || '',
        r.cost || '',
        `"${(r.sources || []).map(s => s.url).join(', ')}"`,
        `"${(r.response_text || '').replace(/"/g, '""')}"`,
      ]);

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

  // Custom rate color using green theme
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

  return (
    <main className="min-h-screen bg-[#FAFAF8] pb-8">
      {/* Header */}
      <header className="pt-6 pb-4">
        <div className="max-w-5xl mx-auto px-6">
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
                  Results for{' '}
                  <span className="text-[#4A7C59]">{runStatus.brand}</span>
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

      <div className="max-w-5xl mx-auto px-6 space-y-6">
        {/* Summary Cards */}
        <div className={`grid grid-cols-1 ${isCategory ? 'sm:grid-cols-2' : 'sm:grid-cols-3'} gap-4`}>
          {/* Brand Mention Rate - only show for brand searches */}
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
            <p className="text-4xl font-bold text-gray-900">
              {runStatus.total_calls}
            </p>
            {runStatus.failed_calls > 0 && (
              <p className="text-xs text-red-500 mt-1">
                {runStatus.failed_calls} failed
              </p>
            )}
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 text-center">
            <p className="text-sm text-gray-500 mb-1">Total Cost</p>
            <p className="text-4xl font-bold text-gray-900">
              {formatCurrency(runStatus.actual_cost)}
            </p>
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
                  <>
                    Show less <ChevronUp className="w-4 h-4" />
                  </>
                ) : (
                  <>
                    Show more <ChevronDown className="w-4 h-4" />
                  </>
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
              <ReactMarkdown>{aiSummary.summary}</ReactMarkdown>
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

        {/* LLM Breakdown - only show for brand searches */}
        {!isCategory && summary && Object.keys(summary.by_provider).length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">LLM Breakdown</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Object.entries(summary.by_provider).map(([provider, stats]) => (
                <div
                  key={provider}
                  className="p-4 bg-[#FAFAF8] rounded-xl"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-medium text-gray-900 text-sm">
                      {provider === 'openai' ? 'OpenAI GPT-4o' : provider === 'anthropic' ? 'Anthropic Claude' : provider === 'perplexity' ? 'Perplexity Sonar' : provider === 'ai_overviews' ? 'Google AI Overviews' : 'Google Gemini'}
                    </span>
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
                  <p className="text-xs text-gray-500 mt-2">
                    {stats.mentioned}/{stats.total} mentions
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Brand Mentions */}
        {Object.keys(filteredBrandMentions).length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900">
                Brand Mentions
              </h2>
              <select
                value={brandMentionsProviderFilter}
                onChange={(e) => setBrandMentionsProviderFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59] focus:border-transparent"
              >
                <option value="all">All LLMs</option>
                {availableProviders.map((provider) => (
                  <option key={provider} value={provider}>
                    {provider === 'openai' ? 'OpenAI GPT-4o' : provider === 'anthropic' ? 'Claude' : provider === 'perplexity' ? 'Perplexity' : provider === 'ai_overviews' ? 'Google AI Overviews' : 'Gemini'}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-3">
              {Object.entries(filteredBrandMentions)
                .sort((a, b) => b[1].rate - a[1].rate)
                .map(([brandName, stats]) => {
                  const isSearchedBrand = brandName === runStatus.brand;
                  return (
                    <div key={brandName} className="flex items-center gap-4">
                      <span className={`w-32 text-sm font-medium truncate ${isSearchedBrand ? 'text-blue-600' : 'text-gray-700'}`}>
                        {brandName}
                        {isSearchedBrand && <span className="text-xs ml-1">(searched)</span>}
                      </span>
                      <div className="flex-1">
                        <div className="h-5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all flex items-center justify-end pr-2 ${isSearchedBrand ? 'bg-blue-500' : 'bg-[#5B7B5D]'}`}
                            style={{ width: `${Math.max(stats.rate * 100, 10)}%` }}
                          >
                            {stats.rate > 0.15 && (
                              <span className="text-xs font-medium text-white">
                                {formatPercent(stats.rate)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {stats.rate <= 0.15 && (
                        <span className="text-sm text-gray-600 w-12 text-right">
                          {formatPercent(stats.rate)}
                        </span>
                      )}
                      <span className="text-xs text-gray-400 w-16 text-right">
                        ({stats.count} times)
                      </span>
                    </div>
                  );
                })}
              {Object.keys(filteredBrandMentions).length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">
                  No brand mentions found for this LLM
                </p>
              )}
            </div>
          </div>
        )}

        {/* Key Influencers - sources cited by multiple providers */}
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
                const hasMultipleUrls = source.urlDetails.length > 1;
                const isExpanded = expandedInfluencers.has(source.domain);

                if (hasMultipleUrls) {
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
                        <span className="text-sm font-medium text-gray-700 group-hover:text-[#4A7C59]">
                          {source.domain}
                        </span>
                        <span className="text-xs text-gray-400">
                          {source.providers.length} LLMs · {source.count} citations
                        </span>
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
                }

                const singleUrlDetail = source.urlDetails[0];
                const { subtitle } = formatSourceDisplay(singleUrlDetail?.url || source.url, singleUrlDetail?.title);
                const displayTitle = subtitle || getReadableTitleFromUrl(singleUrlDetail?.url || source.url);

                return (
                  <a
                    key={source.domain}
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-gray-200 hover:border-[#4A7C59] hover:shadow-sm transition-all group"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-gray-400 group-hover:text-[#4A7C59]" />
                    <span className="text-sm text-gray-700 group-hover:text-[#4A7C59]">
                      <span className="font-medium">{source.domain}</span>
                      {displayTitle && displayTitle !== source.domain && (
                        <span className="text-gray-500 font-normal"> · {displayTitle}</span>
                      )}
                    </span>
                    <span className="text-xs text-gray-400">
                      {source.providers.length} LLMs · {source.count} citations
                    </span>
                  </a>
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
                    <option key={brand} value={brand}>
                      {brand}{brand === runStatus?.brand ? ' (searched)' : ''}
                    </option>
                  ))}
                </select>
                <select
                  value={sourcesProviderFilter}
                  onChange={(e) => setSourcesProviderFilter(e.target.value)}
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59] focus:border-transparent"
                >
                  <option value="all">All LLMs</option>
                  {availableProviders.map((provider) => (
                    <option key={provider} value={provider}>
                      {provider === 'openai' ? 'OpenAI GPT-4o' : provider === 'anthropic' ? 'Claude' : provider === 'perplexity' ? 'Perplexity' : provider === 'ai_overviews' ? 'Google AI Overviews' : 'Gemini'}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              {topCitedSources.map((source, index) => {
                const hasMultipleUrls = source.urlDetails.length > 1;
                const isExpanded = expandedSources.has(source.domain);

                return (
                  <div key={source.domain} className="bg-[#FAFAF8] rounded-lg overflow-hidden">
                    <div
                      className={`flex items-center gap-3 p-3 ${hasMultipleUrls ? 'cursor-pointer hover:bg-gray-100' : ''} transition-colors`}
                      onClick={() => {
                        if (hasMultipleUrls) {
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
                      <span className="text-sm font-medium text-gray-400 w-6">
                        {index + 1}.
                      </span>
                      {hasMultipleUrls ? (
                        <div className="flex-1 flex items-center gap-2 text-sm font-medium text-[#4A7C59]">
                          {isExpanded ? (
                            <ChevronUp className="w-3.5 h-3.5 flex-shrink-0" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
                          )}
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
                            <span
                              key={provider}
                              className="text-xs px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded"
                              title={provider === 'openai' ? 'OpenAI' : provider === 'anthropic' ? 'Claude' : provider === 'perplexity' ? 'Perplexity' : provider === 'ai_overviews' ? 'AI Overviews' : 'Gemini'}
                            >
                              {provider === 'openai' ? 'GPT' : provider === 'anthropic' ? 'Claude' : provider === 'perplexity' ? 'Pplx' : provider === 'ai_overviews' ? 'AIO' : 'Gem'}
                            </span>
                          ))}
                        </div>
                        <span className="text-sm text-gray-500 w-20 text-right">
                          {source.count} {source.count === 1 ? 'citation' : 'citations'}
                        </span>
                      </div>
                    </div>
                    {hasMultipleUrls && isExpanded && (
                      <div className="px-3 pb-3 pt-1 border-t border-gray-200 ml-9">
                        <p className="text-xs text-gray-500 mb-2">{source.urlDetails.length} unique pages:</p>
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
                                  {urlDetail.count > 1 && (
                                    <span className="text-gray-400"> ({urlDetail.count})</span>
                                  )}
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
              <p className="text-sm text-gray-500 text-center py-4">
                No sources found for the selected filters
              </p>
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
              {/* Filter by mention */}
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    filter === 'all'
                      ? 'bg-white shadow-sm text-gray-900'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setFilter('mentioned')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    filter === 'mentioned'
                      ? 'bg-white shadow-sm text-gray-900'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Mentioned
                </button>
                <button
                  onClick={() => setFilter('not_mentioned')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    filter === 'not_mentioned'
                      ? 'bg-white shadow-sm text-gray-900'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Not Mentioned
                </button>
              </div>

              {/* Provider filter */}
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
            Showing {filteredResults.length} of{' '}
            {runStatus.results.filter((r: Result) => !r.error).length} results
          </p>

          {/* Results Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Prompt
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    LLM
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Brand?
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Competitors
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredResults.map((result: Result) => (
                  <>
                    <tr
                      key={result.id}
                      className="border-b border-gray-100 hover:bg-gray-50"
                    >
                      <td className="py-3 px-4">
                        <p className="text-sm text-gray-900">
                          {truncate(result.prompt, 40)}
                        </p>
                        <p className="text-xs text-gray-500">
                          Temp: {result.temperature}
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-gray-700">
                          {result.provider === 'openai' ? 'GPT-4o' : result.provider === 'anthropic' ? 'Claude' : result.provider === 'perplexity' ? 'Perplexity' : result.provider === 'ai_overviews' ? 'Google AI Overviews' : 'Gemini'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {result.error ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 text-xs font-medium rounded-lg">
                            <AlertTriangle className="w-3 h-3" />
                            Not Available
                          </span>
                        ) : result.brand_mentioned ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-[#E8F0E8] text-[#4A7C59] text-xs font-medium rounded-lg">
                            <Check className="w-3 h-3" />
                            Yes
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg">
                            <X className="w-3 h-3" />
                            No
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
                              <span className="text-gray-400">
                                {' '}+{result.competitors_mentioned.length - 2}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400">None</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-gray-600 capitalize">
                          {result.response_type || '-'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => toggleExpanded(result.id)}
                          className="inline-flex items-center gap-1 text-sm text-[#4A7C59] hover:text-[#3d6649] font-medium"
                        >
                          {expandedResults.has(result.id) ? (
                            <>
                              Hide <ChevronUp className="w-4 h-4" />
                            </>
                          ) : (
                            <>
                              View <ChevronDown className="w-4 h-4" />
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                    {expandedResults.has(result.id) && (
                      <tr key={`${result.id}-expanded`}>
                        <td colSpan={6} className="py-4 px-4 bg-[#FAFAF8]">
                          <div className="max-h-64 overflow-y-auto">
                            {result.error ? (
                              <>
                                <p className="text-xs text-orange-600 mb-2">
                                  AI Overview Not Available:
                                </p>
                                <p className="text-sm text-orange-700 bg-orange-50 p-3 rounded-lg">
                                  Google did not return an AI Overview for this query. This typically happens when the query doesn&apos;t trigger an AI-generated summary in search results.
                                </p>
                              </>
                            ) : (
                              <>
                                <p className="text-xs text-gray-500 mb-2">
                                  Full Response:
                                </p>
                                <div className="text-sm text-gray-700 whitespace-pre-wrap [&_a]:text-[#4A7C59] [&_a]:underline [&_a]:hover:text-[#3d6649]">
                                  <ReactMarkdown
                                    components={{
                                      a: ({ href, children }) => (
                                        <a href={href} target="_blank" rel="noopener noreferrer">
                                          {children}
                                        </a>
                                      ),
                                    }}
                                  >
                                    {result.response_text || ''}
                                  </ReactMarkdown>
                                </div>
                                {result.sources && result.sources.length > 0 && (
                                  <div className="mt-4 pt-3 border-t border-gray-200">
                                    <p className="text-xs text-gray-500 mb-2">
                                      Sources ({result.sources.length}):
                                    </p>
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
                                    <p className="text-xs text-gray-500 mb-2">
                                      Grounding Confidence:
                                    </p>
                                    <div className="space-y-2">
                                      {result.grounding_metadata.supports.slice(0, 5).map((support, idx) => (
                                        <div key={idx} className="bg-white p-2 rounded-lg border border-gray-100">
                                          <p className="text-xs text-gray-600 mb-1 line-clamp-2">
                                            &quot;{support.segment}&quot;
                                          </p>
                                          <div className="flex items-center gap-2">
                                            <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                              <div
                                                className="h-full bg-[#5B7B5D] rounded-full"
                                                style={{ width: `${(support.confidence_scores[0] || 0) * 100}%` }}
                                              />
                                            </div>
                                            <span className="text-xs text-gray-500 w-12 text-right">
                                              {Math.round((support.confidence_scores[0] || 0) * 100)}%
                                            </span>
                                          </div>
                                        </div>
                                      ))}
                                      {result.grounding_metadata.supports.length > 5 && (
                                        <p className="text-xs text-gray-400">
                                          +{result.grounding_metadata.supports.length - 5} more
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                )}
                                {result.tokens && (
                                  <p className="text-xs text-gray-400 mt-2">
                                    {result.tokens} tokens · {formatCurrency(result.cost || 0)}
                                  </p>
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
          <p className="text-sm text-gray-500 mb-4">
            Download results or share a link to this page
          </p>
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
                  {runStatus.results
                    .filter((r: Result) => !r.error && r.tokens)
                    .reduce((sum: number, r: Result) => sum + (r.tokens || 0), 0)
                    .toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Total Cost: </span>
                <span className="font-medium text-gray-900">
                  {formatCurrency(runStatus.actual_cost)}
                </span>
              </div>
            </div>
            <div className="text-gray-400 text-xs">
              {runStatus.completed_calls} successful calls · {runStatus.failed_calls} failed
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
