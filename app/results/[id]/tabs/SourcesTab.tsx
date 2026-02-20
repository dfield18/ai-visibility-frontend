'use client';

import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import {
  PieChart, Pie, Cell, Tooltip,
} from 'recharts';
import {
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  Lightbulb,
  Link2,
  Sparkles,
  HelpCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import type { Result, Source } from './shared';
import {
  getProviderLabel,
  getProviderShortLabel,
  getProviderIcon,
  getSentimentLabel,
  capitalizeFirst,
  getReadableTitleFromUrl,
  formatSourceDisplay,
  getDomain,
  categorizeDomain as baseCategorizeDomain,
  CATEGORY_COLORS,
  getCategoryIcon,
} from './shared';
import { useResults, useResultsUI } from './ResultsContext';

export const SourcesTab = () => {
  const {
    runStatus,
    globallyFilteredResults,
    trackedBrands,
    topCitedSources,
    keyInfluencers,
    availableProviders,
    availableBrands,
    sourcesInsights,
    hasAnySources,
    isCategory,
    isIssue,
    isPublicFigure,
    relatedIssues,
    // Computed metrics from context
    sourcePositioningData,
    sourcePositioningBrandOptions,
    brandWebsiteCitations,
    sourceCategoryData,
    domainTableData,
    publisherPromptOptions,
    publisherBrandOptions,
    sortedDomainTableData,
    sourceBrandHeatmapData,
    heatmapMaxValue,
    // Filter state from context
    sourcesProviderFilter, setSourcesProviderFilter,
    sourcesBrandFilter, setSourcesBrandFilter,
    sourcePositioningBrandFilter, setSourcePositioningBrandFilter,
    brandCitationsBrandFilter, setBrandCitationsBrandFilter,
    brandCitationsProviderFilter, setBrandCitationsProviderFilter,
    publisherPromptFilter, setPublisherPromptFilter,
    publisherBrandFilter, setPublisherBrandFilter,
    domainSortColumn, setDomainSortColumn,
    domainSortDirection, setDomainSortDirection,
    sourceBrandHeatmapProviderFilter, setSourceBrandHeatmapProviderFilter,
    sourceBrandHeatmapSort, setSourceBrandHeatmapSort,
    sourceBrandHeatmapView, setSourceBrandHeatmapView,
  } = useResults();
  const { copied, handleCopyLink, setSelectedResult, setSelectedResultHighlight } = useResultsUI();

  // UI-only state (not in context)
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const [expandedInfluencers, setExpandedInfluencers] = useState<Set<string>>(new Set());
  const [expandedBrandCitations, setExpandedBrandCitations] = useState<Set<string>>(new Set());
  const [aiCategorizations, setAiCategorizations] = useState<Record<string, string>>({});
  const [categorizationLoading, setCategorizationLoading] = useState(false);
  const sourcesListRef = useRef<HTMLDivElement>(null);
  const pendingScrollRestore = useRef<{ container: number; window: number } | null>(null);

  // Restore scroll position after expandedSources changes
  useLayoutEffect(() => {
    if (pendingScrollRestore.current) {
      const { container, window: windowY } = pendingScrollRestore.current;
      if (sourcesListRef.current) {
        sourcesListRef.current.scrollTop = container;
      }
      window.scrollTo(window.scrollX, windowY);
      pendingScrollRestore.current = null;
    }
  }, [expandedSources]);

    // Helper to extract domain from URL
    const extractDomain = (url: string): string => {
      try {
        const hostname = new URL(url).hostname;
        return hostname.replace(/^www\./, '');
      } catch {
        return url;
      }
    };

    // Categorize a domain, with AI categorization fallback for "Other" domains
    const categorizeDomain = (domain: string): string => {
      const base = baseCategorizeDomain(domain);
      if (base === 'Other' && aiCategorizations[domain]) {
        return aiCategorizations[domain];
      }
      return base;
    };

    // Fetch AI categorizations for domains that are "Other"
    useEffect(() => {
      const domainsToFetch = topCitedSources
        .filter(source => baseCategorizeDomain(source.domain) === 'Other')
        .map(source => source.domain)
        .filter(domain => !aiCategorizations[domain]); // Don't re-fetch already categorized

      if (domainsToFetch.length === 0 || categorizationLoading) return;

      const fetchCategories = async () => {
        setCategorizationLoading(true);
        try {
          const response = await api.categorizeDomains(domainsToFetch);
          setAiCategorizations(prev => ({ ...prev, ...response.categories }));
        } catch (error) {
          console.error('Failed to fetch AI categorizations:', error);
        } finally {
          setCategorizationLoading(false);
        }
      };

      fetchCategories();
    }, [topCitedSources, aiCategorizations, categorizationLoading]);

    // Handle column header click for sorting
    const handleDomainSort = (column: 'domain' | 'usedPercent' | 'avgCitation' | 'category' | 'avgSentiment') => {
      if (domainSortColumn === column) {
        setDomainSortDirection(domainSortDirection === 'asc' ? 'desc' : 'asc');
      } else {
        setDomainSortColumn(column);
        setDomainSortDirection('desc');
      }
    };

    // Open result detail modal for a specific prompt + domain combination
    const handlePromptClick = (prompt: string, domain: string) => {
      const matchingResult = globallyFilteredResults.find((r: Result) =>
        r.prompt === prompt &&
        !r.error &&
        r.sources?.some((s: Source) => {
          try {
            return new URL(s.url).hostname.replace(/^www\./, '') === domain;
          } catch { return false; }
        })
      );
      if (matchingResult) {
        setSelectedResult(matchingResult);
        setSelectedResultHighlight({ brand: runStatus?.brand || '', domain });
      }
    };

    // Export Domain Breakdown to CSV
    const handleExportDomainBreakdownCSV = () => {
      if (!runStatus || domainTableData.length === 0) return;

      const headers = [
        'Domain',
        'Used (%)',
        'Avg. Citation',
        'Type',
        isIssue ? 'Framing' : 'Sentiment',
        'Models',
        isIssue ? 'Issues' : isPublicFigure ? 'Figures' : 'Brands',
      ];

      const rows = domainTableData.map(row => [
        row.domain,
        row.usedPercent.toFixed(1),
        row.avgCitation.toFixed(2),
        row.category,
        row.avgSentiment !== null ? (isIssue
          ? (row.avgSentiment >= 4.5 ? 'Supportive' : row.avgSentiment >= 3.5 ? 'Leaning Supportive' : row.avgSentiment >= 2.5 ? 'Balanced' : row.avgSentiment >= 1.5 ? 'Mixed' : 'Critical')
          : getSentimentLabel(row.avgSentiment)) : '',
        row.providers.map(p => getProviderLabel(p)).join('; '),
        row.brands.join('; '),
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${runStatus.brand}-domain-breakdown-${runStatus.run_id}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
    };

    // Check if we have any sources data
    const hasSourcesData = globallyFilteredResults.some(
      (r: Result) => !r.error && r.sources && r.sources.length > 0
    );

    if (!hasSourcesData) {
      return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <ExternalLink className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Source Data Available</h3>
          <p className="text-gray-500 max-w-md mx-auto">
            Source citations are only available for providers that include them (like Google Gemini with grounding).
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Key Influencers */}
        {keyInfluencers.length > 0 && (
          <div id="sources-influencers" className="bg-gradient-to-r from-gray-100 to-gray-50 rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-5 h-5 text-gray-900" />
              <h2 className="text-lg font-semibold text-gray-900">Key Influencers</h2>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              {isIssue
                ? 'Sources cited by multiple AI platforms — these shape how AI frames this issue.'
                : isPublicFigure
                ? 'Sources cited by multiple AI platforms — these shape how AI portrays this figure.'
                : 'Sources cited by multiple AI platforms — these have a big impact on what AI recommends.'}
            </p>
            <div className="flex flex-wrap gap-2">
              {keyInfluencers.map((source) => {
                const isExpanded = expandedInfluencers.has(source.domain);
                return (
                  <div
                    key={source.domain}
                    onClick={() => {
                      const newExpanded = new Set(expandedInfluencers);
                      if (isExpanded) {
                        newExpanded.delete(source.domain);
                      } else {
                        // Close all others and open this one
                        newExpanded.clear();
                        newExpanded.add(source.domain);
                      }
                      setExpandedInfluencers(newExpanded);
                    }}
                    className={`inline-flex items-center gap-2 px-3 py-2 bg-white rounded-lg border hover:border-gray-900 hover:shadow-sm transition-all cursor-pointer group ${isExpanded ? 'border-gray-900 shadow-sm' : 'border-gray-200'}`}
                  >
                    {isExpanded ? (
                      <ChevronUp className="w-3.5 h-3.5 text-gray-900" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-900" />
                    )}
                    <span className={`text-sm font-medium ${isExpanded ? 'text-gray-900' : 'text-gray-700 group-hover:text-gray-900'}`}>{source.domain}</span>
                    <span className="text-xs text-gray-400">{source.providers.length} Models · {source.count} {source.count === 1 ? 'citation' : 'citations'}</span>
                  </div>
                );
              })}
            </div>
            {/* Expanded content rendered separately below all items */}
            {keyInfluencers.filter(source => expandedInfluencers.has(source.domain)).map((source) => (
              <div key={`expanded-${source.domain}`} className="mt-3 p-3 bg-white rounded-lg border border-gray-900/30 space-y-1.5">
                <p className="text-xs font-medium text-gray-500 mb-2">{source.domain} — {source.urlDetails.length} {source.urlDetails.length === 1 ? 'page' : 'pages'} cited:</p>
                {source.urlDetails.map((urlDetail: any, idx: number) => {
                  const { subtitle } = formatSourceDisplay(urlDetail.url, urlDetail.title);
                  const displayTitle = subtitle || getReadableTitleFromUrl(urlDetail.url);
                  return (
                    <a
                      key={idx}
                      href={urlDetail.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-gray-900 hover:text-gray-700 hover:underline"
                      onClick={(e) => e.stopPropagation()}
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
            ))}
          </div>
        )}

        {/* Key Sources Insights */}
        {sourcesInsights.length > 0 && (
          <div id="sources-insights" className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl shadow-sm border border-purple-100 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Lightbulb className="w-5 h-5 text-purple-600" />
              <h2 className="text-lg font-semibold text-gray-900">Key Sources Insights</h2>
            </div>
            <ul className="space-y-3">
              {sourcesInsights.map((insight, idx) => (
                <li key={idx} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-sm font-medium flex-shrink-0 mt-0.5">
                    {idx + 1}
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">{insight}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Top Cited Sources with Pie Chart */}
        {hasAnySources && (
          <div id="sources-top-cited" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Link2 className="w-5 h-5 text-gray-900" />
                  <h2 className="text-lg font-semibold text-gray-900">Top Cited Sources</h2>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={sourcesBrandFilter}
                    onChange={(e) => setSourcesBrandFilter(e.target.value)}
                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  >
                    <option value="all">{isIssue ? 'All Issues' : isPublicFigure ? 'All Figures' : 'All Brands'}</option>
                    {!isCategory && !isIssue && runStatus?.brand && availableBrands.includes(runStatus.brand) && (
                      <option value={runStatus.brand}>{runStatus.brand} (searched)</option>
                    )}
                    {(isIssue ? relatedIssues : availableBrands.filter(brand => isCategory ? true : brand !== runStatus?.brand)).map((brand) => (
                      <option key={brand} value={brand}>{brand}</option>
                    ))}
                  </select>
                  <select
                    value={sourcesProviderFilter}
                    onChange={(e) => setSourcesProviderFilter(e.target.value)}
                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  >
                    <option value="all">All Models</option>
                    {availableProviders.map((provider) => (
                      <option key={provider} value={provider}>{getProviderLabel(provider)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top Cited Sources List */}
                <div
                  ref={sourcesListRef}
                  className={`space-y-2 ${topCitedSources.length > 8 ? 'max-h-[400px] overflow-y-auto pr-2' : ''}`}
                  style={{ overflowAnchor: 'none' }}
                >
                  {topCitedSources.map((source, index) => {
                    const isExpanded = expandedSources.has(source.domain);
                    return (
                      <div key={source.domain} className="bg-[#FAFAF8] rounded-lg">
                        <div
                          className={`flex items-center gap-2 p-2.5 cursor-pointer hover:bg-gray-100 ${isExpanded ? 'rounded-t-lg' : 'rounded-lg'}`}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();

                            // Store scroll positions to restore after render
                            pendingScrollRestore.current = {
                              container: sourcesListRef.current?.scrollTop || 0,
                              window: window.scrollY
                            };

                            const newExpanded = new Set(expandedSources);
                            if (isExpanded) {
                              newExpanded.delete(source.domain);
                            } else {
                              newExpanded.add(source.domain);
                            }
                            setExpandedSources(newExpanded);
                          }}
                        >
                          <span className="text-xs font-medium text-gray-400 w-5">{index + 1}.</span>
                          <span className="flex-shrink-0 relative group/icon" title={categorizeDomain(source.domain)}>
                            {getCategoryIcon(categorizeDomain(source.domain))}
                          </span>
                          <div className="flex-1 flex items-center gap-1.5 text-sm font-medium text-gray-900 min-w-0">
                            {isExpanded ? <ChevronUp className="w-3 h-3 flex-shrink-0" /> : <ChevronDown className="w-3 h-3 flex-shrink-0" />}
                            <span className="truncate">{source.domain}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <div className="flex gap-0.5">
                              {source.providers.slice(0, 3).map((provider: string) => (
                                <span key={provider} className="inline-flex items-center gap-0.5 text-[10px] px-1 py-0.5 bg-gray-200 text-gray-600 rounded" title={getProviderLabel(provider)}>
                                  <span className="flex-shrink-0">{getProviderIcon(provider)}</span>
                                  {getProviderShortLabel(provider)}
                                </span>
                              ))}
                              {source.providers.length > 3 && (
                                <span
                                  className="text-[10px] px-1 py-0.5 bg-gray-200 text-gray-600 rounded cursor-help"
                                  title={source.providers.map((p: string) => getProviderLabel(p)).join(', ')}
                                >
                                  +{source.providers.length - 3}
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-gray-500 w-16 text-right">{source.count} cit.</span>
                          </div>
                        </div>
                        {isExpanded && (
                          <div className="px-2.5 pb-2.5 pt-1 border-t border-gray-200 ml-7">
                            <p className="text-xs text-gray-500 mb-1.5">
                              {source.urlDetails.length > 1 ? `${source.urlDetails.length} unique pages:` : `${source.count} citation from this page:`}
                            </p>
                            <div className="space-y-1.5">
                              {source.urlDetails.map((urlDetail: any, idx: number) => {
                                const { subtitle } = formatSourceDisplay(urlDetail.url, urlDetail.title);
                                const displayTitle = subtitle || getReadableTitleFromUrl(urlDetail.url);
                                return (
                                  <div key={idx} className="flex items-center justify-between gap-2">
                                    <a
                                      href={urlDetail.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-1.5 text-xs text-gray-900 hover:text-gray-700 hover:underline min-w-0 flex-1"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                                      <span className="truncate">
                                        {displayTitle && displayTitle !== source.domain ? displayTitle : source.domain}
                                      </span>
                                    </a>
                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                      <div className="flex gap-0.5">
                                        {urlDetail.providers.slice(0, 3).map((provider: string) => (
                                          <span key={provider} className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 bg-gray-200 text-gray-600 rounded" title={getProviderLabel(provider)}>
                                            <span className="flex-shrink-0">{getProviderIcon(provider)}</span>
                                            {getProviderShortLabel(provider)}
                                          </span>
                                        ))}
                                        {urlDetail.providers.length > 3 && (
                                          <span
                                            className="text-[9px] px-1 py-0.5 bg-gray-200 text-gray-600 rounded cursor-help"
                                            title={urlDetail.providers.map((p: string) => getProviderLabel(p)).join(', ')}
                                          >
                                            +{urlDetail.providers.length - 3}
                                          </span>
                                        )}
                                      </div>
                                      <span className="text-[10px] text-gray-400">({urlDetail.count})</span>
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
                  {topCitedSources.length === 0 && (
                    <p className="text-sm text-gray-500 text-center py-4">No sources found for the selected filters</p>
                  )}
                </div>

                {/* Source Category Breakdown */}
                <div className="flex flex-col h-full">
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-gray-700">Source Types</h3>
                  </div>
                  {runStatus?.status !== 'complete' ? (
                    <div className="flex flex-col items-center justify-center flex-1 py-8">
                      <Spinner size="md" />
                      <p className="text-sm text-gray-500 mt-3">Loading source data...</p>
                    </div>
                  ) : sourceCategoryData.length > 0 ? (
                    <div className="flex flex-col items-center flex-1 pt-2">
                      <div className="h-[320px] w-[320px]">
                        <PieChart width={320} height={320}>
                            <Pie
                              data={sourceCategoryData}
                              cx="50%"
                              cy="50%"
                              innerRadius={75}
                              outerRadius={130}
                              paddingAngle={2}
                              dataKey="value"
                              nameKey="name"
                              isAnimationActive={false}
                              label={({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }) => {
                                // Only show label for items 8% and above
                                const pct = (percent || 0) * 100;
                                if (pct < 8) return null;
                                const RADIAN = Math.PI / 180;
                                const angle = midAngle || 0;
                                const inner = innerRadius || 0;
                                const outer = outerRadius || 0;
                                const radius = inner + (outer - inner) * 0.5;
                                const x = (cx || 0) + radius * Math.cos(-angle * RADIAN);
                                const y = (cy || 0) + radius * Math.sin(-angle * RADIAN);
                                // Truncate long names
                                const displayName = String(name).length > 8 ? String(name).substring(0, 7) + '…' : String(name);
                                return (
                                  <g>
                                    <text
                                      x={x}
                                      y={y - 6}
                                      fill="white"
                                      textAnchor="middle"
                                      dominantBaseline="central"
                                      fontSize={9}
                                      fontWeight={500}
                                    >
                                      {displayName}
                                    </text>
                                    <text
                                      x={x}
                                      y={y + 6}
                                      fill="white"
                                      textAnchor="middle"
                                      dominantBaseline="central"
                                      fontSize={11}
                                      fontWeight={600}
                                    >
                                      {`${pct.toFixed(0)}%`}
                                    </text>
                                  </g>
                                );
                              }}
                              labelLine={false}
                            >
                              {sourceCategoryData.map((entry) => (
                                <Cell
                                  key={`cell-${entry.name}`}
                                  fill={CATEGORY_COLORS[entry.name] || CATEGORY_COLORS['Other']}
                                />
                              ))}
                            </Pie>
                            <Tooltip
                              isAnimationActive={false}
                              formatter={(value, name) => {
                                const numValue = typeof value === 'number' ? value : 0;
                                const data = sourceCategoryData;
                                const itemData = data.find(s => s.name === name);
                                return [`${numValue} citations (${itemData?.percentage.toFixed(0) || 0}%)`, String(name)];
                              }}
                            />
                          </PieChart>
                      </div>
                      <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 mt-4 text-xs px-2 max-h-[100px] overflow-y-auto">
                        {sourceCategoryData.map((item) => (
                          <div key={item.name} className="flex items-center gap-1.5">
                            <div
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{
                                backgroundColor: CATEGORY_COLORS[item.name] || CATEGORY_COLORS['Other']
                              }}
                            />
                            <span className="text-gray-700 truncate max-w-[100px]" title={item.name}>{item.name}</span>
                            <span className="text-gray-400">{item.percentage.toFixed(0)}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 text-center py-4">No data available</p>
                  )}
                </div>
              </div>
            </div>
        )}

        {/* Source Influence Map */}
        {sourcePositioningData.length > 0 && (() => {
          // Sort by citation count descending, take top 15
          const sortedData = [...sourcePositioningData]
            .sort((a, b) => b.citationCount - a.citationCount)
            .slice(0, 15);

          if (sortedData.length === 0) return null;

          const maxCitations = Math.max(...sortedData.map(d => d.citationCount), 1);

          const getSentimentColor = (sentiment: number) => {
            if (sentiment >= 4.5) return '#047857'; // Strong - emerald-700
            if (sentiment >= 3.5) return '#10b981'; // Positive - emerald-500
            if (sentiment >= 2.5) return '#9ca3af'; // Neutral - gray
            if (sentiment >= 1.5) return '#f59e0b'; // Conditional - amber
            return '#ef4444'; // Negative - red
          };

          const getSentimentLabel = (sentiment: number) => {
            if (isIssue) {
              if (sentiment >= 4.5) return 'Supportive';
              if (sentiment >= 3.5) return 'Leaning Supportive';
              if (sentiment >= 2.5) return 'Balanced';
              if (sentiment >= 1.5) return 'Mixed';
              if (sentiment >= 0.5) return 'Critical';
              return 'N/A';
            }
            if (sentiment >= 4.5) return 'Strong';
            if (sentiment >= 3.5) return 'Positive';
            if (sentiment >= 2.5) return 'Neutral';
            if (sentiment >= 1.5) return 'Conditional';
            if (sentiment >= 0.5) return 'Negative';
            return 'N/A';
          };

          return (
            <div id="sources-helpful" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{isIssue ? 'Sources That Shape Issue Coverage' : isPublicFigure ? 'Sources That Shape Public Perception' : isCategory ? 'Sources That Shape AI Recommendations' : 'Sources That Help Your Brand'}</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    {isIssue
                      ? 'Websites frequently cited when AI discusses this issue, colored by average framing'
                      : isPublicFigure
                      ? 'Websites frequently cited when AI discusses this figure, colored by average sentiment'
                      : 'Websites linked to higher visibility and better sentiment in AI responses'}
                  </p>
                </div>
                <select
                  value={sourcePositioningBrandFilter}
                  onChange={(e) => setSourcePositioningBrandFilter(e.target.value)}
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                >
                  {sourcePositioningBrandOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              {/* Sentiment Legend */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-5">
                <span className="text-xs text-gray-600 font-medium">{isIssue ? 'Framing:' : 'Sentiment:'}</span>
                {(isIssue ? [
                  { color: '#047857', label: 'Supportive' },
                  { color: '#10b981', label: 'Leaning Supportive' },
                  { color: '#9ca3af', label: 'Balanced' },
                  { color: '#f59e0b', label: 'Mixed' },
                  { color: '#ef4444', label: 'Critical' },
                ] : [
                  { color: '#047857', label: 'Strong' },
                  { color: '#10b981', label: 'Positive' },
                  { color: '#9ca3af', label: 'Neutral' },
                  { color: '#f59e0b', label: 'Conditional' },
                  { color: '#ef4444', label: 'Negative' },
                ]).map(({ color, label }) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-xs text-gray-500">{label}</span>
                  </div>
                ))}
              </div>
              {/* Horizontal bar chart */}
              <div className="space-y-2">
                {sortedData.map((d) => {
                  const barWidth = (d.citationCount / maxCitations) * 100;
                  const color = getSentimentColor(d.avgSentiment);
                  return (
                    <div key={d.domain} className="group flex items-center gap-3" title={`${d.domain} — ${d.citationCount} citations, ${d.providerCount} model${d.providerCount !== 1 ? 's' : ''}, Avg Position: ${d.avgPosition ? '#' + d.avgPosition.toFixed(1) : 'N/A'}, ${isIssue ? 'Framing' : 'Sentiment'}: ${getSentimentLabel(d.avgSentiment)}`}>
                      {/* Domain label */}
                      <div className="w-[160px] shrink-0 text-right">
                        <a
                          href={`https://${d.domain}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-gray-700 hover:text-gray-900 hover:underline truncate block"
                          title={d.domain}
                        >
                          {d.domain}
                        </a>
                      </div>
                      {/* Bar */}
                      <div className="flex-1 flex items-center gap-2">
                        <div className="flex-1 h-8 bg-gray-50 rounded-md overflow-hidden relative">
                          <div
                            className="h-full rounded-md flex items-center transition-all duration-300"
                            style={{
                              width: `${Math.max(barWidth, 4)}%`,
                              backgroundColor: color,
                            }}
                          >
                            <span className="text-white text-xs font-medium pl-2.5 whitespace-nowrap">
                              {d.citationCount} citation{d.citationCount !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </div>
                        {/* Model count pill */}
                        <div className="shrink-0 w-[72px] text-center">
                          <span className="inline-block px-2 py-0.5 bg-gray-100 rounded text-[11px] text-gray-600 font-medium">
                            {d.providerCount} model{d.providerCount !== 1 ? 's' : ''}
                          </span>
                        </div>
                        {/* Position badge */}
                        <div className="shrink-0 w-[40px] text-center">
                          {d.avgPosition ? (
                            <span className="text-xs font-semibold text-gray-700">#{d.avgPosition.toFixed(0)}</span>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 text-center text-xs text-gray-400 italic">{isIssue ? 'Bar color indicates average framing • Position badge shows avg rank when this source is cited' : isPublicFigure ? 'Bar color indicates average sentiment • Position badge shows avg rank when this source is cited' : 'Bar color indicates average sentiment • Position badge shows avg brand rank when this source is cited'}</p>
            </div>
          );
        })()}

        {/* Citations by Source & Brand Heatmap (industry reports only) */}
        {isCategory && sourceBrandHeatmapData.sources.length > 0 && (
          <div id="sources-brand-heatmap" className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Citations by Source & Brand</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  {sourceBrandHeatmapView === 'citations'
                    ? 'Number of AI responses that cite each source when mentioning a brand'
                    : 'Average sentiment when a source describes each brand'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
                  <button
                    onClick={() => setSourceBrandHeatmapView('citations')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      sourceBrandHeatmapView === 'citations'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Citations
                  </button>
                  <button
                    onClick={() => setSourceBrandHeatmapView('sentiment')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      sourceBrandHeatmapView === 'sentiment'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Avg Sentiment
                  </button>
                </div>
                <select
                  value={sourceBrandHeatmapProviderFilter}
                  onChange={(e) => setSourceBrandHeatmapProviderFilter(e.target.value)}
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                >
                  <option value="all">All Models</option>
                  {availableProviders.map((provider) => (
                    <option key={provider} value={provider}>{getProviderLabel(provider)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
              <table className="text-sm" style={{ minWidth: `${180 + sourceBrandHeatmapData.brands.length * 90 + 70}px` }}>
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-20 w-[180px] min-w-[180px]">
                      Source
                    </th>
                    {sourceBrandHeatmapData.brands.map(brand => (
                      <th
                        key={brand}
                        className="text-center py-3 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none w-[90px] min-w-[90px]"
                        onClick={() => setSourceBrandHeatmapSort(sourceBrandHeatmapSort === brand ? 'total' : brand)}
                      >
                        <span className="flex items-center justify-center gap-1 whitespace-nowrap overflow-hidden text-ellipsis" title={brand}>
                          {brand.length > 10 ? brand.substring(0, 10) + '…' : brand}
                          {sourceBrandHeatmapSort === brand && <span className="text-gray-900">↓</span>}
                        </span>
                      </th>
                    ))}
                    <th
                      className="text-center py-3 px-3 text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer hover:text-gray-900 select-none w-[70px] min-w-[70px] bg-gray-100"
                      onClick={() => setSourceBrandHeatmapSort('total')}
                    >
                      <span className="flex items-center justify-center gap-1">
                        {sourceBrandHeatmapView === 'sentiment' ? 'Avg' : 'Total'}
                        {sourceBrandHeatmapSort === 'total' && <span className="text-gray-900">↓</span>}
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sourceBrandHeatmapData.sources.map((domain, rowIdx) => (
                    <tr key={domain} className={`border-b border-gray-100 ${rowIdx % 2 === 0 ? '' : 'bg-gray-50/30'}`}>
                      <td className="py-2.5 px-4 sticky left-0 z-10 bg-white w-[180px] min-w-[180px]" style={rowIdx % 2 !== 0 ? { background: 'rgba(249,250,251,0.3)' } : undefined}>
                        <a
                          href={`https://${domain}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-gray-700 hover:text-gray-900 hover:underline truncate block max-w-[170px]"
                          title={domain}
                        >
                          {domain}
                        </a>
                      </td>
                      {sourceBrandHeatmapData.brands.map(brand => {
                        const count = sourceBrandHeatmapData.matrix[domain]?.[brand] || 0;

                        const handleCellClick = () => {
                          const matchingResult = globallyFilteredResults.find((r: Result) =>
                            !r.error &&
                            r.sources?.some((s: Source) => getDomain(s.url) === domain) &&
                            (r.all_brands_mentioned?.some(b => b.toLowerCase() === brand.toLowerCase()) ||
                             r.competitors_mentioned?.some(b => b.toLowerCase() === brand.toLowerCase()))
                          );
                          if (matchingResult) {
                            setSelectedResult(matchingResult);
                            setSelectedResultHighlight({ brand, domain });
                          }
                        };

                        if (sourceBrandHeatmapView === 'sentiment') {
                          const sentData = sourceBrandHeatmapData.sentimentMatrix[domain]?.[brand];
                          const avg = sentData && sentData.count > 0 ? sentData.sum / sentData.count : null;
                          const getSentimentColor = (score: number) => {
                            if (score >= 4.5) return { bg: '#059669', text: 'white' }; // Strong endorsement
                            if (score >= 3.5) return { bg: '#16a34a', text: 'white' }; // Positive
                            if (score >= 2.5) return { bg: '#6b7280', text: 'white' }; // Neutral
                            if (score >= 1.5) return { bg: '#d97706', text: 'white' }; // Conditional
                            return { bg: '#dc2626', text: 'white' }; // Negative
                          };
                          const getSentimentText = (score: number) => {
                            if (score >= 4.5) return 'Strong';
                            if (score >= 3.5) return 'Positive';
                            if (score >= 2.5) return 'Neutral';
                            if (score >= 1.5) return 'Conditional';
                            return 'Negative';
                          };
                          return (
                            <td key={brand} className="text-center py-2.5 px-2 w-[90px] min-w-[90px]">
                              {avg !== null ? (
                                <div
                                  className="h-7 rounded-md mx-auto flex items-center justify-center hover:opacity-80 transition-opacity cursor-pointer"
                                  style={{
                                    backgroundColor: getSentimentColor(avg).bg,
                                    width: '80%',
                                    maxWidth: '80px',
                                  }}
                                  title={`Avg: ${avg.toFixed(1)}/5 (${sentData!.count} samples) — Click to view response`}
                                  onClick={handleCellClick}
                                >
                                  <span className="text-white text-xs font-medium">{getSentimentText(avg)}</span>
                                </div>
                              ) : (
                                <span className="text-xs text-gray-300">—</span>
                              )}
                            </td>
                          );
                        }

                        const intensity = heatmapMaxValue > 0 ? count / heatmapMaxValue : 0;
                        return (
                          <td key={brand} className="text-center py-2.5 px-2 w-[90px] min-w-[90px]">
                            {count > 0 ? (
                              <div
                                className="h-7 rounded-md mx-auto flex items-center justify-center hover:opacity-80 transition-opacity cursor-pointer"
                                style={{
                                  backgroundColor: '#5ba3c0',
                                  opacity: 0.3 + intensity * 0.7,
                                  width: '80%',
                                  maxWidth: '80px',
                                }}
                                title={`${count} citations — Click to view response`}
                                onClick={handleCellClick}
                              >
                                <span className="text-white text-xs font-medium">{count}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="text-center py-2.5 px-3 bg-gray-50/50">
                        <span className="text-sm font-semibold text-gray-900">
                          {sourceBrandHeatmapView === 'sentiment' ? (() => {
                            let totalSum = 0;
                            let totalCount = 0;
                            sourceBrandHeatmapData.brands.forEach(brand => {
                              const sentData = sourceBrandHeatmapData.sentimentMatrix[domain]?.[brand];
                              if (sentData && sentData.count > 0) {
                                totalSum += sentData.sum;
                                totalCount += sentData.count;
                              }
                            });
                            return totalCount > 0 ? (totalSum / totalCount).toFixed(1) : '—';
                          })() : (sourceBrandHeatmapData.totals.bySource[domain] || 0)}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {/* Totals / Averages row */}
                  <tr className="border-t-2 border-gray-200 bg-gray-50">
                    <td className="py-3 px-4 sticky left-0 z-10 bg-gray-50 w-[180px] min-w-[180px]">
                      <span className="text-xs font-semibold text-gray-700 uppercase">
                        {sourceBrandHeatmapView === 'sentiment' ? 'Avg' : 'Total Citations'}
                      </span>
                    </td>
                    {sourceBrandHeatmapData.brands.map(brand => {
                      if (sourceBrandHeatmapView === 'sentiment') {
                        // Calculate overall average sentiment for this brand across all sources
                        let totalSum = 0;
                        let totalCount = 0;
                        sourceBrandHeatmapData.sources.forEach(domain => {
                          const sentData = sourceBrandHeatmapData.sentimentMatrix[domain]?.[brand];
                          if (sentData && sentData.count > 0) {
                            totalSum += sentData.sum;
                            totalCount += sentData.count;
                          }
                        });
                        const avg = totalCount > 0 ? totalSum / totalCount : null;
                        return (
                          <td key={brand} className="text-center py-3 px-3">
                            <span className="text-sm font-semibold text-gray-900">
                              {avg !== null ? avg.toFixed(1) : '—'}
                            </span>
                          </td>
                        );
                      }
                      return (
                        <td key={brand} className="text-center py-3 px-3">
                          <span className="text-sm font-semibold text-gray-900">
                            {sourceBrandHeatmapData.totals.byBrand[brand] || 0}
                          </span>
                        </td>
                      );
                    })}
                    <td className="text-center py-3 px-3 bg-gray-100">
                      <span className="text-sm font-bold text-gray-900">
                        {sourceBrandHeatmapView === 'sentiment' ? '' : sourceBrandHeatmapData.totals.grand}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="px-6 py-3 text-center text-xs text-gray-400 italic border-t border-gray-100">
              Top {sourceBrandHeatmapData.sources.length} sources shown • Click a cell to view the full response • Click a brand column header to sort • {sourceBrandHeatmapView === 'sentiment' ? 'Colors indicate sentiment: green = positive, gray = neutral, amber/red = negative' : 'Darker cells indicate more citations'}
            </p>
          </div>
        )}

        {/* Brand Website Citations */}
        {!isIssue && <div id="sources-brand-website" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">{isPublicFigure ? 'Figure Website Citations' : 'Brand Website Citations'}</h3>
              <p className="text-sm text-gray-500">{isCategory ? 'How often AI models cite brand websites as sources' : isPublicFigure ? 'How often AI models cite websites associated with this figure and similar figures as sources' : 'How often AI models cite your brand\'s and competitors\' own websites as sources'}</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={brandCitationsBrandFilter}
                onChange={(e) => setBrandCitationsBrandFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              >
                <option value="all">{isPublicFigure ? 'All Figures' : 'All Brands'}</option>
                {!isCategory && runStatus?.brand && (
                  <option value={runStatus.brand}>{runStatus.brand} (searched)</option>
                )}
                {Array.from(trackedBrands).filter(b => b.toLowerCase() !== runStatus?.brand?.toLowerCase()).map((brand) => (
                  <option key={brand} value={brand}>{capitalizeFirst(brand)}</option>
                ))}
              </select>
              <select
                value={brandCitationsProviderFilter}
                onChange={(e) => setBrandCitationsProviderFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              >
                <option value="all">All Models</option>
                {availableProviders.map((provider) => (
                  <option key={provider} value={provider}>{getProviderLabel(provider)}</option>
                ))}
              </select>
            </div>
          </div>

          {brandWebsiteCitations.citations.length > 0 ? (
            <div className="space-y-2" style={{ overflowAnchor: 'none' }}>
              {brandWebsiteCitations.citations.map((citation, index) => {
                const isExpanded = expandedBrandCitations.has(citation.brand);
                return (
                  <div key={citation.brand} className="bg-[#FAFAF8] rounded-lg overflow-hidden">
                    <button
                      type="button"
                      className="w-full flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-100 text-left"
                      onClick={() => {
                        const newExpanded = new Set(expandedBrandCitations);
                        if (isExpanded) {
                          newExpanded.delete(citation.brand);
                        } else {
                          newExpanded.add(citation.brand);
                        }
                        setExpandedBrandCitations(newExpanded);
                      }}
                    >
                      <span className="text-sm font-medium text-gray-400 w-6">{index + 1}.</span>
                      <div className="flex-1 flex items-center gap-2 text-sm font-medium text-gray-900">
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5 flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />}
                        <span>{capitalizeFirst(citation.brand)}&apos;s website</span>
                        {citation.isSearchedBrand && (
                          <span className="text-xs px-1.5 py-0.5 bg-gray-900 text-white rounded">searched</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="flex gap-1 w-[160px] justify-end flex-wrap">
                          {citation.providers.map((provider) => (
                            <span key={provider} className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded">
                              <span className="flex-shrink-0">{getProviderIcon(provider)}</span>
                              {getProviderShortLabel(provider)}
                            </span>
                          ))}
                        </div>
                        <span className="text-sm text-gray-500 w-[110px] text-right shrink-0">
                          {citation.count} {citation.count === 1 ? 'citation' : 'citations'}
                          <span className="text-xs text-gray-400 ml-1">({citation.rate.toFixed(0)}%)</span>
                        </span>
                      </div>
                    </button>
                    {isExpanded && citation.urls.length > 0 && (
                      <div className="px-3 pb-3 pt-1 border-t border-gray-200 ml-9">
                        <p className="text-xs text-gray-500 mb-2">
                          {citation.urls.length} unique {citation.urls.length === 1 ? 'page' : 'pages'} cited:
                        </p>
                        <div className="space-y-1.5">
                          {citation.urls.map((urlDetail: any, idx: number) => {
                            const { subtitle } = formatSourceDisplay(urlDetail.url, urlDetail.title);
                            const displayTitle = subtitle || getReadableTitleFromUrl(urlDetail.url);
                            return (
                              <a
                                key={idx}
                                href={urlDetail.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 text-sm text-gray-900 hover:text-gray-700 hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink className="w-3 h-3 flex-shrink-0" />
                                <span className="truncate">
                                  <span className="font-medium">{extractDomain(urlDetail.url)}</span>
                                  {displayTitle && displayTitle !== extractDomain(urlDetail.url) && (
                                    <span className="text-gray-600"> · {displayTitle}</span>
                                  )}
                                </span>
                                <span className="text-gray-400 text-xs flex-shrink-0">({urlDetail.count} {urlDetail.count === 1 ? 'citation' : 'citations'})</span>
                              </a>
                            );
                          })}
                        </div>
                        {citation.snippets && citation.snippets.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                            <p className="text-xs text-gray-500">What AI said:</p>
                            {citation.snippets.slice(0, 3).map((snip: { provider: string; prompt: string; text: string }, sIdx: number) => (
                              <div key={sIdx} className="bg-white rounded-lg border border-gray-100 p-2.5">
                                <p className="text-xs text-gray-600 leading-relaxed italic">&ldquo;{snip.text}&rdquo;</p>
                                <p className="text-[10px] text-gray-400 mt-1">— {getProviderShortLabel(snip.provider)}</p>
                                <p className="text-[10px] text-gray-400 truncate">{snip.prompt}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-gray-500">{isPublicFigure ? 'No figure-associated websites were cited as sources.' : 'No brand or competitor websites were cited as sources.'}</p>
              <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg inline-block">
                <p className="text-xs text-yellow-800">
                  <strong>Opportunity:</strong> {isPublicFigure ? 'Consider creating authoritative online profiles and content that AI models might cite when discussing this figure.' : 'Consider improving your website\'s SEO and creating authoritative content that Models might cite.'}
                </p>
              </div>
            </div>
          )}

          {/* Summary Stats */}
          <div className="mt-6 pt-4 border-t border-gray-200">
            <div className="flex flex-wrap gap-6 text-sm">
              <div>
                <span className="text-gray-500">Total responses with sources: </span>
                <span className="font-medium text-gray-900">{brandWebsiteCitations.totalResultsWithSources}</span>
              </div>
              <div>
                <span className="text-gray-500">{isPublicFigure ? 'Figures with citations: ' : 'Brands with citations: '}</span>
                <span className="font-medium text-gray-900">{brandWebsiteCitations.totalBrandsWithCitations}</span>
              </div>
            </div>
          </div>
        </div>}

        {/* Domain Breakdown Table */}
        {domainTableData.length > 0 && (
          <div id="sources-publisher" className="bg-white rounded-2xl shadow-sm border border-gray-200">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Publisher Breakdown</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  Showing {sortedDomainTableData.length} publishers cited across AI responses
                </p>
              </div>
              <div className="flex items-center gap-2">
                {(isCategory || isIssue) && publisherBrandOptions.length > 1 && (
                  <select
                    value={publisherBrandFilter}
                    onChange={(e) => setPublisherBrandFilter(e.target.value)}
                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent max-w-[200px]"
                  >
                    <option value="all">{isIssue ? 'All Issues' : 'All Brands'}</option>
                    {publisherBrandOptions.map((brand) => (
                      <option key={brand} value={brand}>{brand}</option>
                    ))}
                  </select>
                )}
                {publisherPromptOptions.length > 1 && (
                  <select
                    value={publisherPromptFilter}
                    onChange={(e) => setPublisherPromptFilter(e.target.value)}
                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent max-w-[280px]"
                  >
                    <option value="all">All Prompts</option>
                    {publisherPromptOptions.map((prompt) => (
                      <option key={prompt} value={prompt}>{prompt.length > 50 ? prompt.substring(0, 50) + '...' : prompt}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* Table */}
            <div className={`overflow-x-auto min-h-0 ${sortedDomainTableData.length > 10 ? 'max-h-[480px] overflow-y-auto' : ''}`}>
              <table className="w-full table-fixed">
                <thead className={sortedDomainTableData.length > 10 ? 'sticky top-0 z-10' : ''}>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th
                      className={`${isCategory ? 'w-[15%]' : 'w-[18%]'} text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none`}
                      onClick={() => handleDomainSort('domain')}
                    >
                      <span className="flex items-center gap-1">
                        Website
                        <span className="relative group/tip">
                          <HelpCircle className="w-3 h-3 text-gray-300 hover:text-gray-500 cursor-help" />
                          <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-48 p-2 bg-gray-900 text-white text-[11px] rounded-lg opacity-0 invisible group-hover/tip:opacity-100 group-hover/tip:visible transition-all z-50 shadow-lg leading-relaxed normal-case tracking-normal font-normal pointer-events-none">The source domain cited by AI models in their responses</span>
                        </span>
                        {domainSortColumn === 'domain' && (
                          <span className="text-gray-900">{domainSortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </span>
                    </th>
                    <th
                      className={`${isCategory ? 'w-[9%]' : 'w-[12%]'} text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none`}
                      onClick={() => handleDomainSort('category')}
                    >
                      <span className="flex items-center justify-center gap-1">
                        Publisher Type
                        <span className="relative group/tip">
                          <HelpCircle className="w-3 h-3 text-gray-300 hover:text-gray-500 cursor-help" />
                          <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-48 p-2 bg-gray-900 text-white text-[11px] rounded-lg opacity-0 invisible group-hover/tip:opacity-100 group-hover/tip:visible transition-all z-50 shadow-lg leading-relaxed normal-case tracking-normal font-normal pointer-events-none">Category of the publisher (e.g., News, Blog, Review Site, E-Commerce)</span>
                        </span>
                        {domainSortColumn === 'category' && (
                          <span className="text-gray-900">{domainSortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </span>
                    </th>
                    <th
                      className={`${isCategory ? 'w-[10%]' : 'w-[13%]'} text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none`}
                      onClick={() => handleDomainSort('usedPercent')}
                    >
                      <span className="flex flex-col items-center">
                        <span className="flex items-center gap-1">
                          Cited In
                          <span className="relative group/tip">
                            <HelpCircle className="w-3 h-3 text-gray-300 hover:text-gray-500 cursor-help" />
                            <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-48 p-2 bg-gray-900 text-white text-[11px] rounded-lg opacity-0 invisible group-hover/tip:opacity-100 group-hover/tip:visible transition-all z-50 shadow-lg leading-relaxed normal-case tracking-normal font-normal pointer-events-none">Percentage of all AI responses that reference this source as a citation</span>
                          </span>
                          {domainSortColumn === 'usedPercent' && (
                            <span className="text-gray-900">{domainSortDirection === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </span>
                        <span className="text-[10px] text-gray-400 font-normal normal-case tracking-normal">% of AI responses</span>
                      </span>
                    </th>
                    <th
                      className={`${isCategory ? 'w-[9%]' : 'w-[12%]'} text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none`}
                      onClick={() => handleDomainSort('avgCitation')}
                    >
                      <span className="flex items-center justify-center gap-1">
                        Avg Citations
                        <span className="relative group/tip">
                          <HelpCircle className="w-3 h-3 text-gray-300 hover:text-gray-500 cursor-help" />
                          <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-48 p-2 bg-gray-900 text-white text-[11px] rounded-lg opacity-0 invisible group-hover/tip:opacity-100 group-hover/tip:visible transition-all z-50 shadow-lg leading-relaxed normal-case tracking-normal font-normal pointer-events-none">Average number of times this source is cited per AI response when it appears</span>
                        </span>
                        {domainSortColumn === 'avgCitation' && (
                          <span className="text-gray-900">{domainSortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </span>
                    </th>
                    <th
                      className={`${isCategory ? 'w-[11%]' : 'w-[15%]'} text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none`}
                      onClick={() => handleDomainSort('avgSentiment')}
                    >
                      <span className="flex flex-col items-center">
                        <span className="flex items-center gap-1">
                          {isIssue ? 'Framing' : 'Sentiment'}
                          <span className="relative group/tip">
                            <HelpCircle className="w-3 h-3 text-gray-300 hover:text-gray-500 cursor-help" />
                            <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-48 p-2 bg-gray-900 text-white text-[11px] rounded-lg opacity-0 invisible group-hover/tip:opacity-100 group-hover/tip:visible transition-all z-50 shadow-lg leading-relaxed normal-case tracking-normal font-normal pointer-events-none">{isCategory ? 'Average sentiment of AI responses that cite this source, measured across all brands' : 'Average sentiment of AI responses that cite this source'}</span>
                          </span>
                          {domainSortColumn === 'avgSentiment' && (
                            <span className="text-gray-900">{domainSortDirection === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </span>
                        {isCategory && <span className="text-[10px] text-gray-400 font-normal normal-case tracking-normal">avg across brands</span>}
                      </span>
                    </th>
                    <th className={`${isCategory ? 'w-[12%]' : 'w-[15%]'} text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider`}>
                      <span className="flex items-center gap-1">
                        Models
                        <span className="relative group/tip">
                          <HelpCircle className="w-3 h-3 text-gray-300 hover:text-gray-500 cursor-help" />
                          <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-48 p-2 bg-gray-900 text-white text-[11px] rounded-lg opacity-0 invisible group-hover/tip:opacity-100 group-hover/tip:visible transition-all z-50 shadow-lg leading-relaxed normal-case tracking-normal font-normal pointer-events-none">Which AI models cite this publisher in their responses</span>
                        </span>
                      </span>
                    </th>
                    <th className={`${isCategory ? 'w-[12%]' : 'w-[15%]'} text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider`}>
                      <span className="flex items-center gap-1">
                        {isIssue ? 'Issues' : isPublicFigure ? 'Figures' : 'Brands'}
                        <span className="relative group/tip">
                          <HelpCircle className="w-3 h-3 text-gray-300 hover:text-gray-500 cursor-help" />
                          <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-48 p-2 bg-gray-900 text-white text-[11px] rounded-lg opacity-0 invisible group-hover/tip:opacity-100 group-hover/tip:visible transition-all z-50 shadow-lg leading-relaxed normal-case tracking-normal font-normal pointer-events-none">{isIssue ? 'Related issues mentioned alongside this source' : isPublicFigure ? 'Public figures mentioned alongside this source' : 'Brands mentioned in AI responses that cite this source'}</span>
                        </span>
                      </span>
                    </th>
                    {isCategory && (
                      <th className="w-[22%] text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <span className="flex items-center gap-1">
                          Prompts
                          <span className="relative group/tip">
                            <HelpCircle className="w-3 h-3 text-gray-300 hover:text-gray-500 cursor-help" />
                            <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-48 p-2 bg-gray-900 text-white text-[11px] rounded-lg opacity-0 invisible group-hover/tip:opacity-100 group-hover/tip:visible transition-all z-50 shadow-lg leading-relaxed normal-case tracking-normal font-normal pointer-events-none">Which prompts generated AI responses that cite this source</span>
                          </span>
                        </span>
                      </th>
                    )}
                  </tr>
                </thead>
              </table>
              {/* Scrollable tbody wrapper */}
              <div className="max-h-[540px] overflow-y-auto overscroll-contain">
                <table className="w-full table-fixed">
                  <colgroup>
                    <col className={isCategory ? 'w-[15%]' : 'w-[18%]'} />
                    <col className={isCategory ? 'w-[9%]' : 'w-[12%]'} />
                    <col className={isCategory ? 'w-[10%]' : 'w-[13%]'} />
                    <col className={isCategory ? 'w-[9%]' : 'w-[12%]'} />
                    <col className={isCategory ? 'w-[11%]' : 'w-[15%]'} />
                    <col className={isCategory ? 'w-[12%]' : 'w-[15%]'} />
                    <col className={isCategory ? 'w-[12%]' : 'w-[15%]'} />
                    {isCategory && <col className="w-[22%]" />}
                  </colgroup>
                  <tbody>
                  {sortedDomainTableData.map((row) => {
                    // Sentiment badge styling
                    const getSentimentBadge = () => {
                      if (row.avgSentiment === null) {
                        return <span className="text-sm text-gray-400">-</span>;
                      }
                      const configs: Record<string, { bg: string; text: string; border: string; label: string }> = isIssue ? {
                        'strong': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', label: 'Supportive' },
                        'positive': { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', label: 'Leaning Supportive' },
                        'neutral': { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200', label: 'Balanced' },
                        'conditional': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', label: 'Mixed' },
                        'negative': { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', label: 'Critical' },
                      } : {
                        'strong': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', label: 'Strong' },
                        'positive': { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', label: 'Positive' },
                        'neutral': { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200', label: 'Neutral' },
                        'conditional': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', label: 'Conditional' },
                        'negative': { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', label: 'Negative' },
                      };
                      const key = row.avgSentiment >= 4.5 ? 'strong' :
                                  row.avgSentiment >= 3.5 ? 'positive' :
                                  row.avgSentiment >= 2.5 ? 'neutral' :
                                  row.avgSentiment >= 1.5 ? 'conditional' : 'negative';
                      const config = configs[key];
                      return (
                        <span className={`inline-flex items-center px-3 py-1 text-xs font-medium rounded-full border ${config.bg} ${config.text} ${config.border}`}>
                          {config.label}
                        </span>
                      );
                    };

                    return (
                      <tr key={row.domain} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-4 px-4">
                          <span className="text-sm text-gray-900 font-medium" style={{ wordBreak: 'break-all' }}>
                            {(() => {
                              const lastDot = row.domain.lastIndexOf('.');
                              if (lastDot > 0) {
                                return <>{row.domain.substring(0, lastDot)}<wbr />{row.domain.substring(lastDot)}</>;
                              }
                              return row.domain;
                            })()}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                            {getCategoryIcon(row.category, "w-3 h-3")}
                            <span className="text-xs text-gray-600">{row.category}</span>
                          </div>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${Math.min(row.usedPercent, 100)}%`,
                                  backgroundColor: row.usedPercent >= 20 ? '#10b981' : row.usedPercent >= 10 ? '#f59e0b' : '#f87171',
                                }}
                              />
                            </div>
                            <span className="text-sm text-gray-600 min-w-[40px]">{row.usedPercent.toFixed(1)}%</span>
                          </div>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <span className="text-sm text-gray-600">{row.avgCitation.toFixed(2)}</span>
                        </td>
                        <td className="py-4 px-4 text-center">
                          {getSentimentBadge()}
                        </td>
                        <td className="py-4 px-4">
                          {row.providers.length > 0 ? (
                            <div className="flex flex-wrap items-center gap-1">
                              {row.providers.slice(0, 2).map((p: string) => (
                                <span key={p} className="inline-flex items-center gap-1 text-sm text-gray-700">
                                  <span className="flex-shrink-0">{getProviderIcon(p)}</span>
                                  {getProviderLabel(p)}
                                </span>
                              ))}
                              {row.providers.length > 2 && (
                                <span className="relative group">
                                  <span className="text-gray-400 ml-0.5 cursor-pointer hover:text-gray-600 text-sm">
                                    +{row.providers.length - 2}
                                  </span>
                                  <span className="absolute right-0 bottom-full mb-1 hidden group-hover:block bg-gray-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap z-20 shadow-lg">
                                    {row.providers.slice(2).map((p: string) => getProviderLabel(p)).join(', ')}
                                  </span>
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-sm text-gray-400">-</span>
                          )}
                        </td>
                        <td className="py-4 px-4">
                          {row.brands.length > 0 ? (
                            <span className="text-sm text-gray-700">
                              {row.brands.slice(0, 2).join(', ')}
                              {row.brands.length > 2 && (
                                <span className="relative group">
                                  <span className="text-gray-400 ml-1 cursor-pointer hover:text-gray-600">
                                    +{row.brands.length - 2}
                                  </span>
                                  <span className="absolute right-0 bottom-full mb-1 hidden group-hover:block bg-gray-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap z-20 shadow-lg">
                                    {row.brands.slice(2).join(', ')}
                                  </span>
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400">None</span>
                          )}
                        </td>
                        {isCategory && (
                          <td className="py-4 px-4">
                            {row.prompts.length > 0 ? (
                              <div className="space-y-1">
                                {row.prompts.slice(0, 2).map((prompt: string, pi: number) => (
                                  <button
                                    key={pi}
                                    type="button"
                                    onClick={() => handlePromptClick(prompt, row.domain)}
                                    className="block w-full text-left text-xs text-blue-600 hover:text-blue-800 hover:underline leading-snug truncate cursor-pointer"
                                    title={`Click to view full response — ${prompt}`}
                                  >
                                    {prompt}
                                  </button>
                                ))}
                                {row.prompts.length > 2 && (
                                  <span className="relative group">
                                    <span className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">
                                      +{row.prompts.length - 2} more
                                    </span>
                                    <span className="absolute left-0 bottom-full mb-1 hidden group-hover:block bg-gray-900 text-white text-xs rounded-lg px-3 py-2 z-20 shadow-lg max-w-[300px]">
                                      {row.prompts.slice(2).map((p: string, i: number) => (
                                        <button
                                          key={i}
                                          type="button"
                                          onClick={() => handlePromptClick(p, row.domain)}
                                          className="block w-full text-left py-0.5 hover:underline cursor-pointer"
                                        >
                                          {p}
                                        </button>
                                      ))}
                                    </span>
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-sm text-gray-400">-</span>
                            )}
                          </td>
                        )}
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
                onClick={handleExportDomainBreakdownCSV}
                className="px-3 py-1.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>
              <button
                onClick={handleCopyLink}
                className="px-3 py-1.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1.5"
              >
                <Link2 className="w-4 h-4" />
                {copied ? 'Copied!' : 'Share'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

