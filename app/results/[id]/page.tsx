'use client';

import { useState, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft,
  Download,
  Link2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Filter,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { useRunStatus } from '@/hooks/useApi';
import {
  formatCurrency,
  formatDate,
  formatPercent,
  getRateColor,
  getRateBgColor,
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

  // Filter results
  const filteredResults = useMemo(() => {
    if (!runStatus) return [];

    return runStatus.results.filter((result: Result) => {
      // Filter out errored results for display
      if (result.error) return false;

      // Brand mention filter
      if (filter === 'mentioned' && !result.brand_mentioned) return false;
      if (filter === 'not_mentioned' && result.brand_mentioned) return false;

      // Provider filter
      if (providerFilter !== 'all' && result.provider !== providerFilter) return false;

      return true;
    });
  }, [runStatus, filter, providerFilter]);

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
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Spinner size="lg" />
          <p className="mt-4 text-gray-600">Loading results...</p>
        </div>
      </main>
    );
  }

  if (error || !runStatus) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center" padding="lg">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            Failed to load results
          </h1>
          <p className="text-gray-600 mb-6">
            {error instanceof Error ? error.message : 'Results not found'}
          </p>
          <Button onClick={() => router.push('/')}>Start New Analysis</Button>
        </Card>
      </main>
    );
  }

  const summary = runStatus.summary;
  const brandMentionRate = summary?.brand_mention_rate ?? 0;

  return (
    <main className="min-h-screen bg-gray-50 pb-8">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Go back"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">
                  Results for{' '}
                  <span className="text-blue-600">{runStatus.brand}</span>
                </h1>
                <p className="text-sm text-gray-500">
                  {runStatus.completed_at
                    ? `Completed ${formatDate(runStatus.completed_at)}`
                    : `Started ${formatDate(runStatus.created_at)}`}
                  {' • '}
                  {formatCurrency(runStatus.actual_cost)}
                </p>
              </div>
            </div>
            <Button variant="primary" onClick={() => router.push('/')}>
              <Sparkles className="w-4 h-4 mr-2" />
              New Analysis
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card padding="md" className="text-center">
            <p className="text-sm text-gray-500 mb-1">Brand Mention Rate</p>
            <p className={`text-4xl font-bold ${getRateColor(brandMentionRate)}`}>
              {formatPercent(brandMentionRate)}
            </p>
          </Card>
          <Card padding="md" className="text-center">
            <p className="text-sm text-gray-500 mb-1">Total Calls</p>
            <p className="text-4xl font-bold text-gray-900">
              {runStatus.total_calls}
            </p>
            {runStatus.failed_calls > 0 && (
              <p className="text-xs text-red-500 mt-1">
                {runStatus.failed_calls} failed
              </p>
            )}
          </Card>
          <Card padding="md" className="text-center">
            <p className="text-sm text-gray-500 mb-1">Total Cost</p>
            <p className="text-4xl font-bold text-gray-900">
              {formatCurrency(runStatus.actual_cost)}
            </p>
          </Card>
        </div>

        {/* Provider Breakdown */}
        {summary && Object.keys(summary.by_provider).length > 0 && (
          <Card padding="md">
            <CardTitle className="mb-4">Provider Breakdown</CardTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Object.entries(summary.by_provider).map(([provider, stats]) => (
                <div
                  key={provider}
                  className="p-4 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">
                      {provider === 'openai' ? '🤖' : '✨'}
                    </span>
                    <span className="font-medium text-gray-900">
                      {provider === 'openai' ? 'OpenAI GPT-4o' : 'Google Gemini'}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${getRateBgColor(stats.rate)}`}
                          style={{ width: `${stats.rate * 100}%` }}
                        />
                      </div>
                    </div>
                    <span className={`text-lg font-semibold ${getRateColor(stats.rate)}`}>
                      {formatPercent(stats.rate)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    {stats.mentioned}/{stats.total} mentions
                  </p>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Competitor Analysis */}
        {summary && Object.keys(summary.competitor_mentions).length > 0 && (
          <Card padding="md">
            <CardTitle className="mb-4">Competitor Mentions</CardTitle>
            <div className="space-y-3">
              {Object.entries(summary.competitor_mentions)
                .sort((a, b) => b[1].rate - a[1].rate)
                .map(([competitor, stats]) => (
                  <div key={competitor} className="flex items-center gap-4">
                    <span className="w-32 text-sm font-medium text-gray-700 truncate">
                      {competitor}
                    </span>
                    <div className="flex-1">
                      <div className="h-6 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all flex items-center justify-end pr-2"
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
          </Card>
        )}

        {/* Detailed Results */}
        <Card padding="md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <CardTitle>Detailed Results</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              {/* Filter by mention */}
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setFilter('all')}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                    filter === 'all'
                      ? 'bg-white shadow text-gray-900'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setFilter('mentioned')}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                    filter === 'mentioned'
                      ? 'bg-white shadow text-gray-900'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Mentioned
                </button>
                <button
                  onClick={() => setFilter('not_mentioned')}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                    filter === 'not_mentioned'
                      ? 'bg-white shadow text-gray-900'
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
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Providers</option>
                <option value="openai">OpenAI</option>
                <option value="gemini">Gemini</option>
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
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">
                    Prompt
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">
                    Provider
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">
                    Brand?
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">
                    Competitors
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">
                    Type
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">
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
                        <span className="inline-flex items-center gap-1 text-sm">
                          {result.provider === 'openai' ? '🤖' : '✨'}
                          {result.provider === 'openai' ? 'GPT-4o' : 'Gemini'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {result.brand_mentioned ? (
                          <Badge variant="success" size="sm">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Yes
                          </Badge>
                        ) : (
                          <Badge variant="default" size="sm">
                            <XCircle className="w-3 h-3 mr-1" />
                            No
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {result.competitors_mentioned.length > 0 ? (
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
                          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
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
                        <td colSpan={6} className="py-4 px-4 bg-gray-50">
                          <div className="max-h-64 overflow-y-auto">
                            <p className="text-xs text-gray-500 mb-2">
                              Full Response:
                            </p>
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">
                              {result.response_text}
                            </p>
                            {result.tokens && (
                              <p className="text-xs text-gray-400 mt-2">
                                {result.tokens} tokens • {formatCurrency(result.cost || 0)}
                              </p>
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
        </Card>

        {/* Export Section */}
        <Card padding="md">
          <CardTitle className="mb-2">Export & Share</CardTitle>
          <CardDescription className="mb-4">
            Download results or share a link to this page
          </CardDescription>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={handleExportCSV}>
              <Download className="w-4 h-4 mr-2" />
              Export to CSV
            </Button>
            <Button variant="secondary" onClick={handleCopyLink}>
              <Link2 className="w-4 h-4 mr-2" />
              {copied ? 'Copied!' : 'Copy Share Link'}
            </Button>
          </div>
        </Card>
      </div>
    </main>
  );
}
