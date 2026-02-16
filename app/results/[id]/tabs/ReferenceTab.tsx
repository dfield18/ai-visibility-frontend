'use client';

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, ReferenceArea, ReferenceLine, ComposedChart, Bar,
  BarChart, Customized,
} from 'recharts';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  Filter,
  Lightbulb,
  Link2,
  X,
} from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { formatCurrency, formatPercent, truncate } from '@/lib/utils';
import type { Result, RunStatusResponse, AISummaryResponse, Source } from './shared';
import {
  getProviderLabel,
  getProviderIcon,
  getMentionRateColor,
  extractSummaryText,
  formatResponseText,
  highlightCompetitors,
  formatSourceDisplay,
  getSentimentDotColor,
  RANK_BANDS,
  RANGE_X_LABELS,
  getDomain,
  stripMarkdown,
  getProviderShortLabel,
  capitalizeFirst,
} from './shared';
import { useResults, useResultsUI } from './ResultsContext';

export interface ReferenceTabProps {
  totalCost: number;
  promptCost: number;
  analysisCost: number;
  frontendInsightsCost: number;
  chartTab: 'allAnswers' | 'performanceRange' | 'shareOfVoice';
  setChartTab: (tab: 'allAnswers' | 'performanceRange' | 'shareOfVoice') => void;
  showSentimentColors: boolean;
  setShowSentimentColors: (val: boolean) => void;
  aiSummaryExpanded: boolean;
  setAiSummaryExpanded: (val: boolean) => void;
}

export const ReferenceTab = ({
  totalCost,
  promptCost,
  analysisCost,
  frontendInsightsCost,
  chartTab,
  setChartTab,
  showSentimentColors,
  setShowSentimentColors,
  aiSummaryExpanded,
  setAiSummaryExpanded,
}: ReferenceTabProps) => {
  // --- Context ---
  const {
    runStatus,
    isCategory,
    isPublicFigure,
    brandMentionRate,
    scatterPlotData,
    rangeChartData,
    rangeViewDots,
    scatterProviderOrder,
    aiSummary,
    isSummaryLoading,
    globallyFilteredResults,
    availablePrompts,
    availableProviders,
    availableBrands,
    trackedBrands,
    // Reference metrics from context
    referenceFilteredResults: filteredResults,
    referenceAiOverviewUnavailableCount: aiOverviewUnavailableCount,
    sourceGapAnalysis,
    sourceSentimentGapAnalysis,
    // Reference filters from context (aliased to local names for JSX compatibility)
    refFilter: filter,
    setRefFilter: setFilter,
    refProviderFilter: providerFilter,
    setRefProviderFilter: setProviderFilter,
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
  } = useResults();

  const {
    selectedResult,
    setSelectedResult,
    handleExportCSV,
    handleCopyLink,
    copied,
    setSnippetDetailModal,
  } = useResultsUI();

  // --- UI-only state ---
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  const [expandedGapSources, setExpandedGapSources] = useState<Set<string>>(new Set());
  const [expandedSentimentGapSources, setExpandedSentimentGapSources] = useState<Set<string>>(new Set());

  // --- Internalized handlers ---
  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedResults);
    if (newExpanded.has(id)) { newExpanded.delete(id); }
    else { newExpanded.add(id); }
    setExpandedResults(newExpanded);
  };

  // --- Internalized constants ---
  const providerLabels: Record<string, string> = {
    openai: 'OpenAI', anthropic: 'Claude', gemini: 'Gemini',
    perplexity: 'Perplexity', ai_overviews: 'Google AI Overviews',
    grok: 'Grok', llama: 'Llama',
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div id="reference-summary" className={`grid grid-cols-1 ${isCategory ? 'sm:grid-cols-2' : 'sm:grid-cols-3'} gap-4`}>
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
          <p className="text-4xl font-bold text-gray-900">{runStatus?.total_calls}</p>
          {(runStatus?.failed_calls ?? 0) > 0 && (
            <p className="text-xs text-red-500 mt-1">{runStatus?.failed_calls} failed</p>
          )}
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 text-center">
          <p className="text-sm text-gray-500 mb-1">Total Cost</p>
          <p className="text-4xl font-bold text-gray-900">{formatCurrency(totalCost)}</p>
          <div className="flex items-center justify-center gap-3 mt-2 text-xs text-gray-500 flex-wrap">
            <span>Queries <span className="font-medium text-gray-700">{formatCurrency(promptCost)}</span></span>
            <span className="text-gray-300">|</span>
            <span>Analysis <span className="font-medium text-gray-700">{formatCurrency(analysisCost)}</span></span>
            {frontendInsightsCost > 0 && (
              <>
                <span className="text-gray-300">|</span>
                <span>Insights <span className="font-medium text-gray-700">{formatCurrency(frontendInsightsCost)}</span></span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Charts Section with Tabs */}
      {scatterPlotData.length > 0 && (
        <div id="reference-chart" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          {/* Chart Title */}
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Where your brand appears in AI-generated answers</h2>

          {/* Key takeaway - shown above tabs for Ranking in AI Results and Performance Range */}
          {(chartTab === 'allAnswers' || chartTab === 'performanceRange') && (() => {
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
              <div className="inline-block bg-[#FAFAF8] rounded-lg px-3 py-2 mb-4">
                <p className="text-sm text-gray-600">
                  <span className="font-medium text-gray-700">Key takeaway:</span> {takeaway}
                </p>
              </div>
            );
          })()}

          {/* Chart Tabs */}
          <div className="flex items-center gap-1 mb-4 border-b border-gray-200">
            <button
              onClick={() => setChartTab('allAnswers')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                chartTab === 'allAnswers'
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {runStatus?.brand || 'Brand'}'s Ranking in AI Results
            </button>
            <button
              onClick={() => setChartTab('performanceRange')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                chartTab === 'performanceRange'
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Performance Range
            </button>
                      </div>

          {/* All Answers Chart */}
          {chartTab === 'allAnswers' && (
            <>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-gray-400">Each dot is one AI response. Higher dots mean earlier mentions of {runStatus?.brand || 'your brand'}.</p>
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

              {/* Legend for All Answers view - shows sentiment when toggle is on */}
              {showSentimentColors && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3">
                  <span className="text-xs text-gray-600 font-medium">Sentiment:</span>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#047857' }} />
                    <span className="text-xs text-gray-500">Strong</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#10b981' }} />
                    <span className="text-xs text-gray-500">Positive</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#9ca3af' }} />
                    <span className="text-xs text-gray-500">Neutral</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#fbbf24' }} />
                    <span className="text-xs text-gray-500">Conditional</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#ef4444' }} />
                    <span className="text-xs text-gray-500">Negative</span>
                  </div>
                </div>
              )}

              <div>
                  <div className="h-[450px] [&_.recharts-surface]:outline-none [&_.recharts-wrapper]:outline-none [&_svg]:outline-none [&_svg]:focus:outline-none [&_*]:focus:outline-none [&_*]:focus-visible:outline-none">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 50 }}>
                      {/* Horizontal band shading - green gradient (darker = better ranking) */}
                      <ReferenceArea y1={-0.5} y2={0.5} fill="#9ca3af" fillOpacity={0.5} />
                      <ReferenceArea y1={0.5} y2={1.5} fill="#bbf7d0" fillOpacity={0.5} />
                      <ReferenceArea y1={1.5} y2={2.5} fill="#dcfce7" fillOpacity={0.5} />
                      <ReferenceArea y1={2.5} y2={3.5} fill="#ecfdf5" fillOpacity={0.5} />
                      <ReferenceArea y1={3.5} y2={4.5} fill="#f0fdf4" fillOpacity={0.5} />
                      <ReferenceArea y1={4.5} y2={5.5} fill="#e5e7eb" fillOpacity={0.3} />
                      {/* Divider line above "Not mentioned" band */}
                      <ReferenceLine y={4.5} stroke="#9ca3af" strokeWidth={1} strokeDasharray="4 4" />
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" vertical={true} horizontal={false} />
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
                          const isAfterTop10 = label === 'Shown after top 10';

                          // Split "Shown after top 10" into two lines
                          if (isAfterTop10) {
                            return (
                              <text
                                x={x}
                                y={y}
                                textAnchor="end"
                                fill="#6b7280"
                                fontSize={12}
                              >
                                <tspan x={x} dy="-2">Shown after</tspan>
                                <tspan x={x} dy="12">top 10</tspan>
                              </text>
                            );
                          }

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
                        tickLine={false}
                        ticks={RANK_BANDS.map((_, i) => i)}
                        interval={0}
                        width={80}
                      />
                      <Tooltip
                        cursor={false}
                        isAnimationActive={false}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            const truncatedPrompt = data.prompt.length > 70
                              ? data.prompt.substring(0, 70) + '...'
                              : data.prompt;
                            return (
                              <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg min-w-[280px] max-w-[320px]">
                                <p className="text-sm font-semibold text-gray-900 mb-1" title={data.prompt}>
                                  {truncatedPrompt}
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
                                    data.sentiment === 'strong_endorsement' ? 'text-emerald-700' :
                                    data.sentiment === 'positive_endorsement' ? 'text-emerald-600' :
                                    data.sentiment === 'neutral_mention' ? 'text-gray-600' :
                                    data.sentiment === 'conditional' ? 'text-amber-500' :
                                    data.sentiment === 'negative_comparison' ? 'text-red-500' : ''
                                  }`}>
                                    {data.sentiment === 'strong_endorsement' ? 'Strong' :
                                     data.sentiment === 'positive_endorsement' ? 'Positive' :
                                     data.sentiment === 'neutral_mention' ? 'Neutral' :
                                     data.sentiment === 'conditional' ? 'Conditional' :
                                     data.sentiment === 'negative_comparison' ? 'Negative' : ''}
                                  </p>
                                )}
                                <p className="text-xs text-gray-400 mt-2">
                                  {data.label}
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
                          let fillColor = '#9ca3af'; // default gray
                          let opacity = 0.6;

                          if (showSentimentColors && payload.sentiment) {
                            switch (payload.sentiment) {
                              case 'strong_endorsement':
                                fillColor = '#047857'; // emerald-700
                                opacity = 0.8;
                                break;
                              case 'positive_endorsement':
                                fillColor = '#10b981'; // emerald-500
                                opacity = 0.8;
                                break;
                              case 'neutral_mention':
                                fillColor = '#6b7280'; // gray-500
                                opacity = 0.6;
                                break;
                              case 'conditional':
                                fillColor = '#fcd34d'; // amber-300
                                opacity = 1;
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
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-gray-500">Each row shows how an AI model typically positions your brand. The bar spans from best to worst placement.</p>
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

              {/* Legend for Performance Range view - shows sentiment when toggle is on */}
              {showSentimentColors && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3">
                  <span className="text-xs text-gray-600 font-medium">Sentiment:</span>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#047857' }} />
                    <span className="text-xs text-gray-500">Strong</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#10b981' }} />
                    <span className="text-xs text-gray-500">Positive</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#9ca3af' }} />
                    <span className="text-xs text-gray-500">Neutral</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#fbbf24' }} />
                    <span className="text-xs text-gray-500">Conditional</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#ef4444' }} />
                    <span className="text-xs text-gray-500">Negative</span>
                  </div>
                </div>
              )}

              <div>
                  <div className="h-[450px] relative [&_.recharts-surface]:outline-none [&_.recharts-wrapper]:outline-none [&_svg]:outline-none [&_svg]:focus:outline-none [&_*]:focus:outline-none [&_*]:focus-visible:outline-none">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={rangeChartData}
                        layout="vertical"
                        margin={{ top: 20, right: 20, bottom: 20, left: 50 }}
                      >
                        {/* Background color bands - green gradient (darker = better ranking) */}
                        <ReferenceArea x1={-0.5} x2={0.5} fill="#9ca3af" fillOpacity={0.5} /> {/* 1 */}
                        <ReferenceArea x1={0.5} x2={1.5} fill="#bbf7d0" fillOpacity={0.5} /> {/* 2 */}
                        <ReferenceArea x1={1.5} x2={2.5} fill="#bbf7d0" fillOpacity={0.4} /> {/* 3 */}
                        <ReferenceArea x1={2.5} x2={3.5} fill="#dcfce7" fillOpacity={0.5} /> {/* 4 */}
                        <ReferenceArea x1={3.5} x2={4.5} fill="#dcfce7" fillOpacity={0.4} /> {/* 5 */}
                        <ReferenceArea x1={4.5} x2={5.5} fill="#ecfdf5" fillOpacity={0.5} /> {/* 6 */}
                        <ReferenceArea x1={5.5} x2={6.5} fill="#ecfdf5" fillOpacity={0.4} /> {/* 7 */}
                        <ReferenceArea x1={6.5} x2={7.5} fill="#f0fdf4" fillOpacity={0.5} /> {/* 8 */}
                        <ReferenceArea x1={7.5} x2={8.5} fill="#f0fdf4" fillOpacity={0.4} /> {/* 9 */}
                        <ReferenceArea x1={8.5} x2={9.5} fill="#f0fdf4" fillOpacity={0.3} /> {/* 10+ */}
                        <ReferenceArea x1={9.5} x2={10.5} fill="#e5e7eb" fillOpacity={0.3} /> {/* Not mentioned */}
                        {/* Divider line before "Not mentioned" */}
                        <ReferenceLine x={9.5} stroke="#d1d5db" strokeWidth={1} />
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" horizontal={false} vertical={true} />
                        <YAxis
                          type="category"
                          dataKey="label"
                          tick={(props: any) => {
                            const { x, y, payload } = props;
                            const label = payload?.value || '';
                            const isGoogleAI = label === 'Google AI Overviews';

                            if (isGoogleAI) {
                              return (
                                <text
                                  x={x - 8}
                                  y={y}
                                  textAnchor="end"
                                  fill="#6b7280"
                                  fontSize={12}
                                >
                                  <tspan x={x - 8} dy="-2">Google AI</tspan>
                                  <tspan x={x - 8} dy="14">Overviews</tspan>
                                </text>
                              );
                            }

                            return (
                              <text
                                x={x - 8}
                                y={y}
                                dy={4}
                                textAnchor="end"
                                fill="#6b7280"
                                fontSize={12}
                              >
                                {label}
                              </text>
                            );
                          }}
                          axisLine={{ stroke: '#e5e7eb' }}
                          tickLine={false}
                          width={80}
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
                                                  />
                        <Tooltip
                          cursor={false}
                          isAnimationActive={false}
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
                      const margin = { top: 20, right: 20, bottom: 20, left: 50 };
                      const yAxisWidth = 80; // Matches YAxis width prop
                      const xAxisHeight = 25; // Estimated height of X-axis with labels
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

                            // Check for overlap with average/median markers for this provider
                            const providerData = rangeChartData[dot.yIndex];
                            const hasMultipleResponses = providerData && providerData.promptsAnalyzed > 1;
                            const overlapThreshold = 0.3;
                            const overlapsAvg = hasMultipleResponses && Math.abs(dot.x - providerData.avgRankingX) < overlapThreshold;
                            const overlapsMedian = hasMultipleResponses && Math.abs(dot.x - providerData.medianRankingX) < overlapThreshold;
                            const avgMedianSame = hasMultipleResponses && Math.abs(providerData.avgRankingX - providerData.medianRankingX) < 0.5;

                            // Calculate dot Y offset based on overlaps
                            // When overlapping: dot on top, avg in middle-top, median in middle-bottom
                            let dotYOffset = 0;
                            if (overlapsAvg && overlapsMedian && avgMedianSame) {
                              // All three at same position: dot at top
                              dotYOffset = -12;
                            } else if (overlapsAvg) {
                              // Overlaps just avg: dot above avg
                              dotYOffset = -10;
                            } else if (overlapsMedian) {
                              // Overlaps just median: dot above median
                              dotYOffset = -10;
                            }

                            return (
                              <div
                                key={`range-dot-${idx}`}
                                className="absolute pointer-events-auto group"
                                style={{
                                  left: `${xPercent}%`,
                                  top: `calc(${yPercent}% + ${dotYOffset}px)`,
                                  transform: 'translate(-50%, -50%)',
                                }}
                              >
                                {/* Dot - styled to match Dots chart */}
                                <div
                                  className="w-3 h-3 rounded-full cursor-pointer hover:scale-125 transition-transform"
                                  style={{
                                    backgroundColor: showSentimentColors && dot.sentiment
                                      ? dot.sentiment === 'strong_endorsement' ? '#047857'
                                        : dot.sentiment === 'positive_endorsement' ? '#10b981'
                                        : dot.sentiment === 'neutral_mention' ? '#6b7280'
                                        : dot.sentiment === 'conditional' ? '#fcd34d'
                                        : dot.sentiment === 'negative_comparison' ? '#f87171'
                                        : '#d1d5db'
                                      : '#9ca3af',
                                    opacity: showSentimentColors && dot.sentiment
                                      ? (dot.sentiment === 'not_mentioned' ? 0.4 : 0.8)
                                      : 0.6,
                                  }}
                                  onDoubleClick={() => setSelectedResult(dot.originalResult)}
                                />
                                {/* Tooltip on hover */}
                                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block z-50">
                                  <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg min-w-[280px] max-w-[320px] text-left">
                                    <p className="text-sm font-semibold text-gray-900 mb-1">{dot.prompt.length > 70 ? dot.prompt.substring(0, 70) + '...' : dot.prompt}</p>
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

                            // Check if any dots overlap with avg or median for this provider
                            const overlapThreshold = 0.3;
                            const dotsForProvider = rangeViewDots.filter(d => d.yIndex === idx);
                            const dotOverlapsAvg = dotsForProvider.some(d => Math.abs(d.x - data.avgRankingX) < overlapThreshold);
                            const dotOverlapsMedian = dotsForProvider.some(d => Math.abs(d.x - data.medianRankingX) < overlapThreshold);

                            // Check if average and median are at same position (within 0.5)
                            const avgMedianSame = Math.abs(data.avgRankingX - data.medianRankingX) < 0.5;

                            // Calculate offsets based on all overlaps
                            // Stack order from top: dot (-12), avg (0 or -4), median (8 or 4)
                            let avgYOffset = 0;
                            let medianYOffset = 0;

                            if (avgMedianSame && dotOverlapsAvg) {
                              // All three overlap: dot at -12, avg at 0, median at 8
                              avgYOffset = 0;
                              medianYOffset = 8;
                            } else if (avgMedianSame) {
                              // Just avg and median overlap (no dot): avg at -4, median at 4
                              avgYOffset = -4;
                              medianYOffset = 4;
                            } else {
                              // Avg and median are separate, check dot overlaps individually
                              if (dotOverlapsAvg) {
                                avgYOffset = 6; // Push avg down, dot is above
                              }
                              if (dotOverlapsMedian) {
                                medianYOffset = 6; // Push median down, dot is above
                              }
                            }

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
                </div>

            </>
          )}
        </div>
      )}
      {/* AI Summary */}
      <div id="reference-ai-analysis" className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl shadow-sm border border-blue-100 p-6">
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
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{extractSummaryText(aiSummary.summary).replace(/\bai_overviews\b/gi, 'Google AI Overviews')}</ReactMarkdown>
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
      <div id="reference-detailed" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Detailed Results</h2>
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
                {runStatus?.brand} Mentioned
              </button>
              <button
                onClick={() => setFilter('not_mentioned')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === 'not_mentioned' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
              >
                {runStatus?.brand} Not Mentioned
              </button>
            </div>
            <select
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            >
              <option value="all">All Models</option>
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
        <div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Question</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">AI Model</th>
                {!isCategory && (
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Brand?</th>
                )}
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">{isCategory ? 'Brands' : isPublicFigure ? 'Other Figures' : 'Competitors'}</th>
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
                      <span className="inline-flex items-center gap-1.5 text-sm text-gray-700">
                        <span className="flex-shrink-0">{getProviderIcon(result.provider)}</span>
                        {getProviderLabel(result.provider)}
                      </span>
                    </td>
                    {!isCategory && (
                      <td className="py-3 px-4">
                        {result.error ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 text-xs font-medium rounded-lg">
                            <AlertTriangle className="w-3 h-3" />Not Available
                          </span>
                        ) : result.brand_mentioned ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-900 text-xs font-medium rounded-lg">
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
                      ) : (() => {
                        const displayBrands = result.all_brands_mentioned?.length ? result.all_brands_mentioned.filter(b => b.toLowerCase() !== (runStatus?.brand || '').toLowerCase()) : result.competitors_mentioned || [];
                        return displayBrands.length > 0 ? (
                          <span className="text-sm text-gray-700">
                            {isCategory ? displayBrands.join(', ') : (
                              <>
                                {displayBrands.slice(0, 2).join(', ')}
                                {displayBrands.length > 2 && (
                                  <span className="text-gray-400"> +{displayBrands.length - 2}</span>
                                )}
                              </>
                            )}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400">None</span>
                        );
                      })()}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-gray-600 capitalize">{result.response_type || '-'}</span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => toggleExpanded(result.id)}
                        className="inline-flex items-center gap-1 text-sm text-gray-900 hover:text-gray-700 font-medium"
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
                              <div className="text-sm text-gray-700 [&_a]:text-gray-900 [&_a]:underline [&_a]:hover:text-gray-700 [&_p]:mb-3 [&_p]:leading-relaxed [&_ul]:mb-3 [&_ul]:pl-5 [&_ul]:list-disc [&_ol]:mb-3 [&_ol]:pl-5 [&_ol]:list-decimal [&_li]:mb-1 [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mb-2 [&_h3]:font-semibold [&_h3]:mb-2 [&_strong]:font-semibold [&_table]:w-full [&_table]:mb-3 [&_table]:border-collapse [&_table]:text-xs [&_th]:border [&_th]:border-gray-300 [&_th]:bg-gray-100 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold [&_td]:border [&_td]:border-gray-300 [&_td]:px-2 [&_td]:py-1 overflow-x-auto">
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
                                          className="flex items-center gap-2 text-sm text-gray-900 hover:text-gray-700 hover:underline"
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
                                  <p className="text-xs text-gray-500 mb-2">Google&apos;s Confidence Score:</p>
                                  <div className="space-y-2">
                                    {result.grounding_metadata.supports.slice(0, 5).map((support, idx) => (
                                      <div key={idx} className="bg-white p-2 rounded-lg border border-gray-100">
                                        <p className="text-xs text-gray-600 mb-1 line-clamp-2">&quot;{support.segment}&quot;</p>
                                        <div className="flex items-center gap-2">
                                          <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                            <div className="h-full bg-gray-700 rounded-full" style={{ width: `${(support.confidence_scores[0] || 0) * 100}%` }} />
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

        {/* Export buttons at bottom of table */}
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100">
          <button
            onClick={handleExportCSV}
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

      {/* Export Section */}
      <div id="reference-export" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Export & Share</h2>
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

      {/* Source Gap Analysis Chart & Table */}
      {sourceGapAnalysis.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Competitor Source Advantage</h2>
              <p className="text-sm text-gray-500 mt-1">
                Websites that cite your competitors more than {runStatus?.brand || 'your brand'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={sourceGapPromptFilter}
                onChange={(e) => setSourceGapPromptFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent max-w-[200px]"
              >
                <option value="all">All Prompts</option>
                {availablePrompts.map((prompt) => (
                  <option key={prompt} value={prompt} title={prompt}>
                    {prompt.length > 30 ? prompt.substring(0, 30) + '...' : prompt}
                  </option>
                ))}
              </select>
              <select
                value={sourceGapProviderFilter}
                onChange={(e) => setSourceGapProviderFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              >
                <option value="all">All Models</option>
                {availableProviders.map((provider) => (
                  <option key={provider} value={provider}>{getProviderLabel(provider)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Visual Chart - Dumbbell Chart */}
          {sourceGapAnalysis.length > 0 ? (
          <>
          <div className="mb-6">
            <div className="flex items-center justify-center gap-6 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-gray-900"></div>
                <span className="text-sm text-gray-600">{runStatus?.brand || 'Your Brand'}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                <span className="text-sm text-gray-600">Top Competitor</span>
              </div>
            </div>
            <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={sourceGapAnalysis.slice(0, 10).map(row => ({
                    domain: row.domain.length > 25 ? row.domain.substring(0, 23) + '...' : row.domain,
                    fullDomain: row.domain,
                    brandRate: row.brandRate,
                    competitorRate: row.topCompetitorRate,
                    competitor: row.topCompetitor,
                    gap: row.gap,
                    citations: row.totalCitations,
                  }))}
                  layout="vertical"
                  margin={{ top: 10, right: 50, bottom: 10, left: 140 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} stroke="hsl(var(--muted))" />
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    ticks={[0, 25, 50, 75, 100]}
                    tickFormatter={(value) => `${value}%`}
                    tick={{ fill: '#6b7280', fontSize: 11 }}
                    axisLine={{ stroke: '#d1d5db' }}
                  />
                  <YAxis
                    type="category"
                    dataKey="domain"
                    tick={{ fill: '#374151', fontSize: 11 }}
                    width={135}
                    axisLine={false}
                    tickLine={false}
                  />
                  <ReferenceLine x={50} stroke="#d1d5db" strokeDasharray="3 3" />
                  <Tooltip
                    isAnimationActive={false}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length > 0) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
                            <p className="font-medium text-gray-900 mb-2">{data.fullDomain}</p>
                            <p className="text-gray-900">
                              {runStatus?.brand || 'Brand'}: {data.brandRate.toFixed(1)}%
                            </p>
                            <p className="text-blue-500">
                              {data.competitor || 'Top Competitor'}: {data.competitorRate.toFixed(1)}%
                            </p>
                            <p className="text-gray-500 mt-1">
                              Gap: {data.gap >= 0 ? '+' : ''}{data.gap.toFixed(1)} pts ({data.citations} citations)
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                    cursor={{ fill: 'transparent' }}
                  />
                  {/* Custom dumbbell rendering */}
                  <Customized
                    component={(props: { xAxisMap?: Record<string, { scale: (value: number) => number }>; yAxisMap?: Record<string, { scale: (value: string) => number; bandwidth?: () => number }>; offset?: { left: number; top: number; width: number; height: number } }) => {
                      const { xAxisMap, yAxisMap } = props;
                      if (!xAxisMap || !yAxisMap) return null;

                      const xAxis = Object.values(xAxisMap)[0];
                      const yAxis = Object.values(yAxisMap)[0];
                      if (!xAxis || !yAxis) return null;

                      const chartData = sourceGapAnalysis.slice(0, 10).map(row => ({
                        domain: row.domain.length > 25 ? row.domain.substring(0, 23) + '...' : row.domain,
                        fullDomain: row.domain,
                        brandRate: row.brandRate,
                        competitorRate: row.topCompetitorRate,
                      }));

                      // Get bandwidth for category spacing
                      const bandwidth = yAxis.bandwidth ? yAxis.bandwidth() : 30;
                      const yOffset = bandwidth / 2;

                      return (
                        <g>
                          {chartData.map((item, index) => {
                            const yPos = yAxis.scale(item.domain) + yOffset;
                            const brandX = xAxis.scale(item.brandRate);
                            const compX = xAxis.scale(item.competitorRate);
                            const minX = Math.min(brandX, compX);
                            const maxX = Math.max(brandX, compX);

                            if (isNaN(yPos) || isNaN(brandX) || isNaN(compX)) return null;

                            return (
                              <g
                                key={index}
                                style={{ cursor: 'pointer' }}
                                onClick={() => {
                                  const domain = item.fullDomain;
                                  const newExpanded = new Set(expandedGapSources);
                                  if (expandedGapSources.has(domain)) {
                                    newExpanded.delete(domain);
                                  } else {
                                    newExpanded.add(domain);
                                  }
                                  setExpandedGapSources(newExpanded);
                                }}
                              >
                                {/* Connector line */}
                                <line
                                  x1={minX}
                                  y1={yPos}
                                  x2={maxX}
                                  y2={yPos}
                                  stroke="#9ca3af"
                                  strokeWidth={2}
                                />
                                {/* Brand dot (dark) */}
                                <circle
                                  cx={brandX}
                                  cy={yPos}
                                  r={6}
                                  fill="#111827"
                                  stroke="#fff"
                                  strokeWidth={1.5}
                                />
                                {/* Competitor dot (blue) */}
                                <circle
                                  cx={compX}
                                  cy={yPos}
                                  r={6}
                                  fill="#3b82f6"
                                  stroke="#fff"
                                  strokeWidth={1.5}
                                />
                              </g>
                            );
                          })}
                        </g>
                      );
                    }}
                  />
                  {/* Invisible bar for tooltip triggering */}
                  <Bar dataKey="brandRate" fill="transparent" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="overflow-x-auto">
            <p className="text-xs text-gray-400 mb-2">Click on a row to see specific mentions from AI responses</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-3 text-sm font-medium text-gray-600">Source</th>
                  <th className="text-center py-3 px-3 text-sm font-medium text-gray-600">
                    <div>{runStatus?.brand || 'Brand'} Rate</div>
                    <div className="text-xs text-gray-400 font-normal">% when source cited</div>
                  </th>
                  <th className="text-center py-3 px-3 text-sm font-medium text-gray-600">
                    <div>Top Competitor</div>
                  </th>
                  <th className="text-center py-3 px-3 text-sm font-medium text-gray-600">
                    <div>Competitor Rate</div>
                    <div className="text-xs text-gray-400 font-normal">% when source cited</div>
                  </th>
                  <th className="text-center py-3 px-3 text-sm font-medium text-gray-600">
                    <div>Gap</div>
                    <div className="text-xs text-gray-400 font-normal">competitor advantage</div>
                  </th>
                  <th className="text-center py-3 px-3 text-sm font-medium text-gray-600">
                    <div>Priority</div>
                    <div className="text-xs text-gray-400 font-normal">higher = more important</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sourceGapAnalysis.slice(0, 20).map((row, index) => {
                  const isExpanded = expandedGapSources.has(row.domain);
                  return (
                    <React.Fragment key={row.domain}>
                      <tr
                        className={`${index % 2 === 0 ? 'bg-gray-50' : ''} cursor-pointer hover:bg-gray-100 transition-colors`}
                        onClick={() => {
                          const newExpanded = new Set(expandedGapSources);
                          if (isExpanded) {
                            newExpanded.delete(row.domain);
                          } else {
                            newExpanded.add(row.domain);
                          }
                          setExpandedGapSources(newExpanded);
                        }}
                      >
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            )}
                            <span className="text-gray-900 font-medium">{row.domain}</span>
                            <span className="text-xs text-gray-400">({row.totalCitations} citations)</span>
                          </div>
                        </td>
                        <td className="text-center py-3 px-3">
                          <span className={`font-medium ${row.brandRate >= 50 ? 'text-gray-900' : row.brandRate >= 25 ? 'text-yellow-600' : 'text-red-500'}`}>
                            {row.brandRate.toFixed(0)}%
                          </span>
                        </td>
                        <td className="text-center py-3 px-3">
                          <span className="text-gray-700 font-medium">{row.topCompetitor || '-'}</span>
                        </td>
                        <td className="text-center py-3 px-3">
                          <span className="font-medium text-gray-700">
                            {row.topCompetitorRate.toFixed(0)}%
                          </span>
                        </td>
                        <td className="text-center py-3 px-3">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-400 rounded-full"
                                style={{ width: `${Math.min(row.gap, 100)}%` }}
                              />
                            </div>
                            <span className="text-blue-600 font-medium min-w-[40px]">+{row.gap.toFixed(0)}%</span>
                          </div>
                        </td>
                        <td className="text-center py-3 px-3">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            row.opportunityScore >= 30 ? 'bg-blue-100 text-blue-700' :
                            row.opportunityScore >= 15 ? 'bg-blue-50 text-blue-600' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {row.opportunityScore >= 30 ? 'High' :
                             row.opportunityScore >= 15 ? 'Medium' : 'Low'}
                          </span>
                        </td>
                      </tr>
                      {isExpanded && (row.urls.length > 0 || row.snippets.length > 0) && (
                        <tr className={index % 2 === 0 ? 'bg-gray-50' : ''}>
                          <td colSpan={6} className="py-2 px-3 pl-10">
                            <div className="space-y-3">
                              {/* Response Snippets */}
                              {row.snippets.length > 0 && (
                                <div className="bg-white border border-gray-200 rounded-lg p-3">
                                  <p className="text-xs font-medium text-gray-500 mb-2">
                                    How brands appear when this source is cited ({row.snippets.length} mentions)
                                  </p>
                                  <div className="space-y-2 max-h-64 overflow-y-auto">
                                    {row.snippets.slice(0, 10).map((snippetInfo, snippetIdx) => {
                                      // Strip markdown and highlight the brand name in the snippet
                                      const cleanSnippet = stripMarkdown(snippetInfo.snippet);
                                      const parts = cleanSnippet.split(new RegExp(`(${snippetInfo.brand})`, 'gi'));
                                      return (
                                        <div
                                          key={snippetIdx}
                                          className="text-sm border-l-2 pl-3 py-1 cursor-pointer hover:bg-gray-50 rounded-r transition-colors"
                                          style={{ borderColor: snippetInfo.isBrand ? '#111827' : '#3b82f6' }}
                                          onClick={() => setSnippetDetailModal({
                                            brand: snippetInfo.brand,
                                            responseText: snippetInfo.responseText,
                                            provider: snippetInfo.provider,
                                            prompt: snippetInfo.prompt,
                                          })}
                                        >
                                          <div className="flex items-center gap-2 mb-1">
                                            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${snippetInfo.isBrand ? 'bg-gray-100 text-gray-900' : 'bg-blue-100 text-blue-700'}`}>
                                              {snippetInfo.brand}
                                            </span>
                                            <span className="text-xs text-gray-400">
                                              via {getProviderLabel(snippetInfo.provider)}
                                            </span>
                                            <span className="text-xs text-blue-500 ml-auto">Click to view full response</span>
                                          </div>
                                          <p className="text-gray-600 text-sm leading-relaxed">
                                            {parts.map((part, i) =>
                                              part.toLowerCase() === snippetInfo.brand.toLowerCase() ? (
                                                <span key={i} className={`font-semibold ${snippetInfo.isBrand ? 'text-gray-900' : 'text-blue-600'}`}>
                                                  {part}
                                                </span>
                                              ) : (
                                                <span key={i}>{part}</span>
                                              )
                                            )}
                                          </p>
                                        </div>
                                      );
                                    })}
                                    {row.snippets.length > 10 && (
                                      <p className="text-xs text-gray-400 mt-2">
                                        Showing 10 of {row.snippets.length} mentions
                                      </p>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Individual URLs */}
                              {row.urls.length > 0 && (
                                <div className="bg-white border border-gray-200 rounded-lg p-3">
                                  <p className="text-xs font-medium text-gray-500 mb-2">Individual URLs ({row.urls.length})</p>
                                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                    {row.urls.map((urlInfo, urlIdx) => (
                                      <a
                                        key={urlIdx}
                                        href={urlInfo.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="flex items-start gap-2 text-sm text-gray-900 hover:text-gray-700 hover:underline group"
                                      >
                                        <ExternalLink className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                                        <span className="break-all">
                                          {urlInfo.title || urlInfo.url}
                                          <span className="text-gray-400 ml-1">({urlInfo.count} {urlInfo.count === 1 ? 'citation' : 'citations'})</span>
                                        </span>
                                      </a>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
            {sourceGapAnalysis.length > 20 && (
              <p className="text-sm text-gray-500 text-center mt-3">
                Showing top 20 of {sourceGapAnalysis.length} sources with competitor advantage
              </p>
            )}
          </div>
          </>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p>No source gap data available for the selected model.</p>
            </div>
          )}
        </div>
      )}

      {/* Source Sentiment Gap Analysis Chart & Table */}
      {sourceSentimentGapAnalysis.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">How Sources Talk About You vs. Competitors</h2>
              <p className="text-sm text-gray-500 mt-1">
                Which websites describe {sentimentComparisonBrand || runStatus?.brand || 'your brand'} more positively
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={sentimentComparisonBrand}
                onChange={(e) => setSentimentComparisonBrand(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              >
                <option value="">{runStatus?.brand || 'Your Brand'}</option>
                {availableBrands.filter(b => b !== runStatus?.brand).map((brand) => (
                  <option key={brand} value={brand}>
                    {brand.length > 20 ? brand.substring(0, 18) + '...' : brand}
                  </option>
                ))}
              </select>
              <select
                value={sourceSentimentGapPromptFilter}
                onChange={(e) => setSourceSentimentGapPromptFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent max-w-[200px]"
              >
                <option value="all">All Prompts</option>
                {availablePrompts.map((prompt) => (
                  <option key={prompt} value={prompt} title={prompt}>
                    {prompt.length > 30 ? prompt.substring(0, 30) + '...' : prompt}
                  </option>
                ))}
              </select>
              <select
                value={sourceSentimentGapProviderFilter}
                onChange={(e) => setSourceSentimentGapProviderFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              >
                <option value="all">All Models</option>
                {availableProviders.map((provider) => (
                  <option key={provider} value={provider}>{getProviderLabel(provider)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Visual Chart */}
          {sourceSentimentGapAnalysis.length > 0 ? (
          <>
          <div className="mb-6">
            <div className="flex items-center justify-center gap-6 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-gray-900"></div>
                <span className="text-sm text-gray-600">Presented more positively</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                <span className="text-sm text-gray-600">{sourceSentimentGapAnalysis[0]?.topCompetitor || 'Top Competitor'} Presented more positively</span>
              </div>
            </div>
            <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={sourceSentimentGapAnalysis.slice(0, 10).map(row => ({
                    domain: row.domain.length > 20 ? row.domain.substring(0, 18) + '...' : row.domain,
                    fullDomain: row.domain,
                    signedValue: row.signedValue,
                    avgDifference: Math.abs(row.delta),
                    brandSentiment: row.brandSentimentIndex,
                    competitorSentiment: row.topCompetitorIndex,
                    competitor: row.topCompetitor,
                    direction: row.direction,
                    labelText: row.labelText,
                    brandLabel: row.brandSentimentLabel,
                    competitorLabel: row.competitorSentimentLabel,
                    comparisonBrand: row.comparisonBrand,
                  }))}
                  layout="vertical"
                  margin={{ top: 10, right: 50, bottom: 10, left: 140 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} stroke="hsl(var(--muted))" />
                  <XAxis
                    type="number"
                    domain={[-4, 4]}
                    ticks={[-4, -2, 0, 2, 4]}
                    tickFormatter={(value) => value === 0 ? '0' : value > 0 ? `+${value}` : `${value}`}
                    tick={{ fill: '#6b7280', fontSize: 11 }}
                    axisLine={{ stroke: '#d1d5db' }}
                  />
                  <YAxis
                    type="category"
                    dataKey="domain"
                    tick={{ fill: '#374151', fontSize: 11 }}
                    width={135}
                    axisLine={false}
                    tickLine={false}
                  />
                  <ReferenceLine x={0} stroke="#374151" strokeWidth={1} />
                  <Tooltip
                    isAnimationActive={false}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length > 0) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
                            <p className="font-medium text-gray-900 mb-2">{data.fullDomain}</p>
                            <p className="text-gray-600 mb-1">
                              {data.comparisonBrand || 'Brand'}: <span className="font-medium text-gray-900">{data.brandLabel}</span>
                            </p>
                            <p className="text-gray-600 mb-2">
                              {data.competitor || 'Other'}: <span className="font-medium text-blue-600">{data.competitorLabel}</span>
                            </p>
                            <p className={`font-medium ${data.direction === 'brand' ? 'text-gray-900' : data.direction === 'competitor' ? 'text-blue-600' : 'text-gray-500'}`}>
                              {data.labelText}
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar
                    dataKey="signedValue"
                    radius={[4, 4, 4, 4]}
                    fill="#111827"
                  >
                    {sourceSentimentGapAnalysis.slice(0, 10).map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.direction === 'brand' ? '#111827' : entry.direction === 'competitor' ? '#3b82f6' : '#d1d5db'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-3 text-sm font-medium text-gray-600">Source</th>
                  <th className="text-center py-3 px-3 text-sm font-medium text-gray-600">Models</th>
                  <th className="text-center py-3 px-3 text-sm font-medium text-gray-600">{runStatus?.brand || 'Brand'}</th>
                  <th className="text-center py-3 px-3 text-sm font-medium text-gray-600">Top Competitor</th>
                  <th className="text-center py-3 px-3 text-sm font-medium text-gray-600">
                    <div>Advantage</div>
                    <div className="text-xs text-gray-400 font-normal">how much more competitors are cited</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sourceSentimentGapAnalysis.slice(0, 20).map((row, index) => {
                  const isExpanded = expandedSentimentGapSources.has(row.domain);
                  return (
                    <React.Fragment key={row.domain}>
                      <tr
                        className={`${index % 2 === 0 ? 'bg-gray-50' : ''} cursor-pointer hover:bg-gray-100 transition-colors`}
                        onClick={() => {
                          const newExpanded = new Set(expandedSentimentGapSources);
                          if (isExpanded) {
                            newExpanded.delete(row.domain);
                          } else {
                            newExpanded.add(row.domain);
                          }
                          setExpandedSentimentGapSources(newExpanded);
                        }}
                      >
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            )}
                            <span className="text-gray-900 font-medium">{row.domain}</span>
                            <span className="text-xs text-gray-400">({row.totalMentions} mentions)</span>
                          </div>
                        </td>
                        <td className="text-center py-3 px-3">
                          <div className="flex flex-wrap justify-center gap-1">
                            {row.providers.map((provider: string) => (
                              <span key={provider} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs font-medium rounded">
                                <span className="flex-shrink-0">{getProviderIcon(provider)}</span>
                                {getProviderLabel(provider).split(' ')[0]}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="text-center py-3 px-3">
                          <div className="flex flex-col items-center">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              row.brandSentimentIndex >= 4 ? 'bg-gray-100 text-gray-900' :
                              row.brandSentimentIndex >= 3 ? 'bg-gray-50 text-gray-700' :
                              row.brandSentimentIndex >= 2 ? 'bg-yellow-100 text-yellow-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {row.brandSentimentLabel}
                            </span>
                            <span className="text-[10px] text-gray-400 mt-0.5">{row.brandSentimentIndex}/5</span>
                          </div>
                        </td>
                        <td className="text-center py-3 px-3">
                          <div className="flex flex-col items-center">
                            <span className="text-gray-700 font-medium text-xs">{row.topCompetitor || '-'}</span>
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium mt-0.5 ${
                              row.topCompetitorIndex >= 4 ? 'bg-blue-100 text-blue-700' :
                              row.topCompetitorIndex >= 3 ? 'bg-blue-50 text-blue-600' :
                              row.topCompetitorIndex >= 2 ? 'bg-yellow-100 text-yellow-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {row.competitorSentimentLabel}
                            </span>
                            <span className="text-[10px] text-gray-400 mt-0.5">{row.topCompetitorIndex}/5</span>
                          </div>
                        </td>
                        <td className="text-center py-3 px-3">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            row.direction === 'brand' ? 'bg-gray-100 text-gray-900' :
                            row.direction === 'competitor' ? 'bg-blue-100 text-blue-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {row.direction === 'brand' ? `+${Math.abs(row.delta)} pts` :
                             row.direction === 'competitor' ? `-${Math.abs(row.delta)} pts` :
                             'Equal'}
                          </span>
                        </td>
                      </tr>
                      {isExpanded && row.snippets.length > 0 && (
                        <tr className={index % 2 === 0 ? 'bg-gray-50' : ''}>
                          <td colSpan={5} className="py-2 px-3 pl-10">
                            <div className="bg-white border border-gray-200 rounded-lg p-3">
                              <p className="text-xs font-medium text-gray-500 mb-2">
                                How brands are described when this source is cited ({row.snippets.length} mentions)
                              </p>
                              <div className="space-y-2 max-h-64 overflow-y-auto">
                                {row.snippets.slice(0, 10).map((snippetInfo, snippetIdx) => {
                                  // Strip markdown and highlight the brand name in the snippet
                                  const cleanSnippet = stripMarkdown(snippetInfo.snippet);
                                  const parts = cleanSnippet.split(new RegExp(`(${snippetInfo.brand})`, 'gi'));
                                  const sentimentColors: Record<string, string> = {
                                    'strong_endorsement': 'bg-emerald-50 text-emerald-700',
                                    'positive_endorsement': 'bg-green-50 text-green-700',
                                    'neutral_mention': 'bg-blue-100 text-blue-700',
                                    'conditional': 'bg-yellow-100 text-yellow-700',
                                    'negative_comparison': 'bg-red-100 text-red-700',
                                  };
                                  return (
                                    <div
                                      key={snippetIdx}
                                      className="text-sm border-l-2 pl-3 py-2 cursor-pointer hover:bg-gray-50 rounded-r transition-colors"
                                      style={{ borderColor: snippetInfo.isBrand ? '#111827' : '#3b82f6' }}
                                      onClick={() => setSnippetDetailModal({
                                        brand: snippetInfo.brand,
                                        responseText: snippetInfo.responseText,
                                        provider: snippetInfo.provider,
                                        prompt: snippetInfo.prompt,
                                      })}
                                    >
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${snippetInfo.isBrand ? 'bg-gray-100 text-gray-900' : 'bg-blue-100 text-blue-700'}`}>
                                          {snippetInfo.brand}
                                        </span>
                                        <span className={`text-xs px-1.5 py-0.5 rounded ${sentimentColors[snippetInfo.sentiment] || 'bg-gray-100 text-gray-600'}`}>
                                          {snippetInfo.sentiment.replace(/_/g, ' ')}
                                        </span>
                                        <span className="text-xs text-gray-400">
                                          via {getProviderLabel(snippetInfo.provider)}
                                        </span>
                                        <span className="text-xs text-gray-900 ml-auto">Click to view full response →</span>
                                      </div>
                                      <div className="bg-gray-50 rounded px-2 py-1.5 mb-1.5">
                                        <p className="text-xs text-gray-500 mb-0.5">Prompt</p>
                                        <p className="text-sm text-gray-900">{snippetInfo.prompt}</p>
                                      </div>
                                      <p className="text-gray-600 text-sm leading-relaxed">
                                        {parts.map((part, i) =>
                                          part.toLowerCase() === snippetInfo.brand.toLowerCase() ? (
                                            <span key={i} className={`font-semibold ${snippetInfo.isBrand ? 'text-gray-900' : 'text-blue-600'}`}>
                                              {part}
                                            </span>
                                          ) : (
                                            <span key={i}>{part}</span>
                                          )
                                        )}
                                      </p>
                                    </div>
                                  );
                                })}
                                {row.snippets.length > 10 && (
                                  <p className="text-xs text-gray-400 mt-2">
                                    Showing 10 of {row.snippets.length} mentions
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
            {sourceSentimentGapAnalysis.length > 20 && (
              <p className="text-sm text-gray-500 text-center mt-3">
                Showing top 20 of {sourceSentimentGapAnalysis.length} sources with competitor sentiment advantage
              </p>
            )}
          </div>
          </>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p>No sentiment gap data available for the selected filters.</p>
            </div>
          )}
        </div>
      )}

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
              <span className="text-gray-500">Queries: </span>
              <span className="font-medium text-gray-900">{formatCurrency(promptCost)}</span>
            </div>
            <div>
              <span className="text-gray-500">Analysis: </span>
              <span className="font-medium text-gray-900">{formatCurrency(analysisCost)}</span>
            </div>
            {frontendInsightsCost > 0 && (
              <div>
                <span className="text-gray-500">Insights: </span>
                <span className="font-medium text-gray-900">{formatCurrency(frontendInsightsCost)}</span>
              </div>
            )}
            <div>
              <span className="text-gray-500">Total: </span>
              <span className="font-medium text-gray-900">{formatCurrency(totalCost)}</span>
            </div>
          </div>
          <div className="text-gray-400 text-xs">{runStatus?.completed_calls ?? 0} successful calls · {runStatus?.failed_calls ?? 0} failed</div>
        </div>
      </div>
    </div>
  );
};

