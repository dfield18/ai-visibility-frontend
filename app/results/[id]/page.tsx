'use client';

import { useState, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
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
import { useRunStatus } from '@/hooks/useApi';
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
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  const { data: runStatus, isLoading, error } = useRunStatus(runId, true);

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
      'Provider',
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 text-center">
            <p className="text-sm text-gray-500 mb-1">Brand Mention Rate</p>
            <p className={`text-4xl font-bold ${getMentionRateColor(brandMentionRate)}`}>
              {formatPercent(brandMentionRate)}
            </p>
          </div>
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

        {/* Provider Breakdown */}
        {summary && Object.keys(summary.by_provider).length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Provider Breakdown</h2>
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

        {/* Competitor Analysis */}
        {summary && Object.keys(summary.competitor_mentions).length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Competitor Mentions</h2>
            <div className="space-y-3">
              {Object.entries(summary.competitor_mentions)
                .sort((a, b) => b[1].rate - a[1].rate)
                .map(([competitor, stats]) => (
                  <div key={competitor} className="flex items-center gap-4">
                    <span className="w-32 text-sm font-medium text-gray-700 truncate">
                      {competitor}
                    </span>
                    <div className="flex-1">
                      <div className="h-5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#5B7B5D] rounded-full transition-all flex items-center justify-end pr-2"
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
                ))}
            </div>
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
                <option value="all">All Providers</option>
                <option value="openai">OpenAI</option>
                <option value="gemini">Gemini</option>
                <option value="anthropic">Claude</option>
                <option value="perplexity">Perplexity</option>
                <option value="ai_overviews">AI Overviews</option>
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
                    Provider
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
                          {result.provider === 'openai' ? 'GPT-4o' : result.provider === 'anthropic' ? 'Claude' : result.provider === 'perplexity' ? 'Perplexity' : result.provider === 'ai_overviews' ? 'AI Overviews' : 'Gemini'}
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
                                <p className="text-sm text-gray-700 whitespace-pre-wrap">
                                  {result.response_text}
                                </p>
                                {result.sources && result.sources.length > 0 && (
                                  <div className="mt-4 pt-3 border-t border-gray-200">
                                    <p className="text-xs text-gray-500 mb-2">
                                      Sources ({result.sources.length}):
                                    </p>
                                    <div className="space-y-1.5">
                                      {result.sources.map((source, idx) => (
                                        <a
                                          key={idx}
                                          href={source.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="flex items-center gap-2 text-sm text-[#4A7C59] hover:text-[#3d6649] hover:underline"
                                        >
                                          <ExternalLink className="w-3 h-3 flex-shrink-0" />
                                          <span className="truncate">
                                            {source.title || source.url}
                                          </span>
                                        </a>
                                      ))}
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
      </div>
    </main>
  );
}
