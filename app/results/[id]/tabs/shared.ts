import React from 'react';
import {
  AtSign,
  Film,
  Rss,
  Tag,
  Award,
  MessagesSquare,
  Feather,
  MapPin,
  Circle,
  TrendingUp,
  FileText,
  Building2,
} from 'lucide-react';
import { Result, RunStatusResponse, Source } from '@/lib/types';

// Re-export types used across tabs
export type { Result, Source, RunStatusResponse };
export type { AISummaryResponse, SiteAuditResult } from '@/lib/types';
export type { BrandQuote } from '@/hooks/useApi';

export type FilterType = 'all' | 'mentioned' | 'not_mentioned';
export type TabType = 'overview' | 'reference' | 'competitive' | 'sentiment' | 'sources' | 'recommendations' | 'reports' | 'site-audit';

export type InterpretationTone = 'success' | 'neutral' | 'warn';

export interface KPIInterpretation {
  label: string;
  tone: InterpretationTone;
  tooltip?: string;
}

// Canonical provider display order (by popularity)
export const PROVIDER_ORDER = ['openai', 'ai_overviews', 'gemini', 'perplexity', 'anthropic', 'grok', 'llama'];

// Category colors for source types
export const CATEGORY_COLORS: Record<string, string> = {
  'Social Media': '#111827',
  'Video': '#374151',
  'Reference': '#1f2937',
  'News & Media': '#5BA3C0',
  'E-commerce': '#6b7280',
  'Reviews': '#7FBCD4',
  'Forums & Q&A': '#4b5563',
  'Government': '#4A90A4',
  'Blogs': '#9ca3af',
  'Travel': '#6BA3A0',
  'Finance': '#5B8FA8',
  'Other': '#d1d5db'
};

// Centralized rank band constant
export const RANK_BANDS = ['Top result (#1)', 'Shown 2–3', 'Shown 4–5', 'Shown 6–10', 'Shown after top 10', 'Not shown'] as const;

// Range chart X-axis labels
export const RANGE_X_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Shown after top 10', 'Not shown'] as const;

// Position categories for dot plot chart
export const POSITION_CATEGORIES = ['Top', '2-3', '4-5', '6-10', '>10', 'Not Mentioned'];

// Sentiment sort order (best to worst)
export const sentimentOrder: Record<string, number> = {
  'strong_endorsement': 1,
  'positive_endorsement': 2,
  'neutral_mention': 3,
  'conditional': 4,
  'negative_comparison': 5,
  'not_mentioned': 6,
};

// Per-metric card backgrounds
export const metricCardBackgrounds: Record<string, string> = {
  visibility: 'bg-gradient-to-br from-rose-50 to-white border-rose-100',
  shareOfVoice: 'bg-gradient-to-br from-sky-50 to-white border-sky-100',
  top1Rate: 'bg-gradient-to-br from-violet-50 to-white border-violet-100',
  avgPosition: 'bg-gradient-to-br from-orange-50 to-white border-orange-100',
};

// --- Helper functions ---

export const getProviderLabel = (provider: string) => {
  switch (provider) {
    case 'openai': return 'OpenAI GPT-4o';
    case 'anthropic': return 'Anthropic Claude';
    case 'perplexity': return 'Perplexity Sonar';
    case 'ai_overviews': return 'Google AI Overviews';
    case 'gemini': return 'Google Gemini';
    case 'grok': return 'xAI Grok';
    case 'llama': return 'Meta Llama';
    default: return provider;
  }
};

export const getProviderShortLabel = (provider: string) => {
  switch (provider) {
    case 'openai': return 'GPT';
    case 'anthropic': return 'Claude';
    case 'perplexity': return 'Pplx';
    case 'ai_overviews': return 'AIO';
    case 'gemini': return 'Gem';
    case 'grok': return 'Grok';
    case 'llama': return 'Llama';
    default: return provider;
  }
};

export const getProviderBrandColor = (provider: string): string => {
  switch (provider.toLowerCase()) {
    case 'openai': return '#10a37f';
    case 'anthropic': return '#d97706';
    case 'gemini': return '#4285f4';
    case 'perplexity': return '#20b8cd';
    case 'grok': return '#1d9bf0';
    case 'llama': return '#8b5cf6';
    case 'ai_overviews': return '#FBBC04';
    default: return '#6b7280';
  }
};

export const getProviderIcon = (provider: string) => {
  const color = getProviderBrandColor(provider);
  switch (provider.toLowerCase()) {
    case 'openai':
      return React.createElement('svg', { className: 'w-4 h-4', style: { color }, viewBox: '0 0 24 24', fill: 'currentColor' },
        React.createElement('path', { d: 'M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.896zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08-4.778 2.758a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z' })
      );
    case 'anthropic':
      return React.createElement('svg', { className: 'w-4 h-4', style: { color }, viewBox: '0 0 24 24', fill: 'currentColor' },
        React.createElement('path', { d: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z' })
      );
    case 'gemini':
      return React.createElement('svg', { className: 'w-4 h-4', style: { color }, viewBox: '0 0 24 24', fill: 'currentColor' },
        React.createElement('path', { d: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' })
      );
    case 'perplexity':
      return React.createElement('svg', { className: 'w-4 h-4', style: { color }, viewBox: '0 0 16 16', fill: 'currentColor' },
        React.createElement('path', { d: 'M8 .188a.5.5 0 0 1 .503.5V4.03l3.022-2.92.059-.048a.51.51 0 0 1 .49-.054.5.5 0 0 1 .306.46v3.247h1.117l.1.01a.5.5 0 0 1 .403.49v5.558a.5.5 0 0 1-.503.5H12.38v3.258a.5.5 0 0 1-.312.462.51.51 0 0 1-.55-.11l-3.016-3.018v3.448c0 .275-.225.5-.503.5a.5.5 0 0 1-.503-.5v-3.448l-3.018 3.019a.51.51 0 0 1-.548.11.5.5 0 0 1-.312-.463v-3.258H2.503a.5.5 0 0 1-.503-.5V5.215l.01-.1c.047-.229.25-.4.493-.4H3.62V1.469l.006-.074a.5.5 0 0 1 .302-.387.51.51 0 0 1 .547.102l3.023 2.92V.687c0-.276.225-.5.503-.5M4.626 9.333v3.984l2.87-2.872v-4.01zm3.877 1.113 2.871 2.871V9.333l-2.87-2.897zm3.733-1.668a.5.5 0 0 1 .145.35v1.145h.612V5.715H9.201zm-9.23 1.495h.613V9.13c0-.131.052-.257.145-.35l3.033-3.064h-3.79zm1.62-5.558H6.76L4.626 2.652zm4.613 0h2.134V2.652z' })
      );
    case 'grok':
      return React.createElement('svg', { className: 'w-4 h-4', style: { color }, viewBox: '0 0 24 24', fill: 'currentColor' },
        React.createElement('path', { d: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z' })
      );
    case 'llama':
      return React.createElement('svg', { className: 'w-4 h-4', style: { color }, viewBox: '0 0 24 24', fill: 'currentColor' },
        React.createElement('path', { d: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z' })
      );
    case 'ai_overviews':
      return React.createElement('svg', { className: 'w-4 h-4', style: { color }, viewBox: '0 0 24 24', fill: 'currentColor' },
        React.createElement('path', { d: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z' })
      );
    default:
      return React.createElement('span', { className: 'w-4 h-4 rounded-full', style: { backgroundColor: color } });
  }
};

export const getKPIInterpretation = (
  metricKey: 'visibility' | 'shareOfVoice' | 'top1Rate' | 'avgPosition',
  value: number | null
): KPIInterpretation => {
  if (value === null) {
    return { label: 'No data', tone: 'neutral' };
  }

  switch (metricKey) {
    case 'visibility':
      if (value >= 80) return { label: 'High visibility', tone: 'success', tooltip: 'High: 80%+  |  Moderate: 50-79%  |  Low: under 50%' };
      if (value >= 50) return { label: 'Moderate visibility', tone: 'neutral', tooltip: 'High: 80%+  |  Moderate: 50-79%  |  Low: under 50%' };
      return { label: 'Low visibility', tone: 'warn', tooltip: 'High: 80%+  |  Moderate: 50-79%  |  Low: under 50%' };

    case 'shareOfVoice':
      if (value >= 30) return { label: 'Leading brand', tone: 'success', tooltip: 'Leading: 30%+  |  Competitive: 15-29%  |  Low: under 15%' };
      if (value >= 15) return { label: 'Competitive', tone: 'neutral', tooltip: 'Leading: 30%+  |  Competitive: 15-29%  |  Low: under 15%' };
      return { label: 'Low share of voice', tone: 'warn', tooltip: 'Leading: 30%+  |  Competitive: 15-29%  |  Low: under 15%' };

    case 'top1Rate':
      if (value >= 50) return { label: 'Strong top ranking', tone: 'success', tooltip: 'Strong: 50%+  |  Competitive: 25-49%  |  Room to grow: under 25%' };
      if (value >= 25) return { label: 'Competitive', tone: 'neutral', tooltip: 'Strong: 50%+  |  Competitive: 25-49%  |  Room to grow: under 25%' };
      return { label: 'Room to grow', tone: 'warn', tooltip: 'Strong: 50%+  |  Competitive: 25-49%  |  Room to grow: under 25%' };

    case 'avgPosition':
      if (value <= 1.5) return { label: 'Excellent', tone: 'success', tooltip: 'Excellent: #1-1.5  |  Competitive: #1.5-3  |  Room to grow: #3+' };
      if (value <= 3.0) return { label: 'Competitive', tone: 'neutral', tooltip: 'Excellent: #1-1.5  |  Competitive: #1.5-3  |  Room to grow: #3+' };
      return { label: 'Room to grow', tone: 'warn', tooltip: 'Excellent: #1-1.5  |  Competitive: #1.5-3  |  Room to grow: #3+' };

    default:
      return { label: '', tone: 'neutral' };
  }
};

export const getToneStyles = (tone: InterpretationTone): string => {
  switch (tone) {
    case 'success': return 'bg-gray-100 text-gray-900';
    case 'warn': return 'bg-orange-100 text-orange-700';
    default: return 'bg-gray-100 text-gray-700';
  }
};

export const getArcColorByValue = (value: number): string => {
  if (value >= 80) return '#047857';
  if (value >= 60) return '#10b981';
  if (value >= 40) return '#eab308';
  if (value >= 20) return '#f97316';
  return '#ef4444';
};

export const getMentionRateColor = (rate: number) => {
  if (rate >= 0.7) return 'text-emerald-700';
  if (rate >= 0.4) return 'text-amber-600';
  return 'text-red-500';
};

export const getMentionRateBgColor = (_rate: number, provider?: string) => {
  if (provider) return '';
  return 'bg-gray-400';
};

export const stripMarkdown = (text: string): string => {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^[\s]*[-*+]\s+/gm, '')
    .replace(/^[\s]*\d+\.\s+/gm, '')
    .replace(/^#+\s+/gm, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\(\[([^\]]+)\]\([^)]+\)\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/[^\s)\]]+/g, '')
    .replace(/\(\)/g, '')
    .replace(/\s*\(\s*\)/g, '')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

export const getSentimentScore = (sentiment: string): number => {
  const scoreMap: Record<string, number> = {
    'strong_endorsement': 5,
    'positive_endorsement': 4,
    'neutral_mention': 3,
    'conditional': 2,
    'negative_comparison': 1,
    'not_mentioned': 0,
  };
  return scoreMap[sentiment] ?? 0;
};

export const getSentimentLabel = (score: number): string => {
  if (score >= 4.5) return 'Strong';
  if (score >= 3.5) return 'Positive';
  if (score >= 2.5) return 'Neutral';
  if (score >= 1.5) return 'Conditional';
  return 'Negative';
};

export const getSentimentDotColor = (sentiment: string | null): string => {
  if (!sentiment) return '#9ca3af';
  switch (sentiment) {
    case 'strong_endorsement': return '#047857';
    case 'positive_endorsement': return '#10b981';
    case 'neutral_mention': return '#9ca3af';
    case 'conditional': return '#fbbf24';
    case 'negative_comparison': return '#ef4444';
    case 'not_mentioned': return '#d1d5db';
    default: return '#9ca3af';
  }
};

// Strip question headers and search result titles from AI Overview responses for ranking
export const getTextForRanking = (text: string, provider: string): string => {
  if (provider !== 'ai_overviews') return text;
  // Remove everything before the --- separator (question headers)
  const separatorIdx = text.indexOf('---');
  let cleaned = separatorIdx >= 0 ? text.substring(separatorIdx + 3) : text;
  // Remove [Top Search Results] header
  cleaned = cleaned.replace(/\*?\*?\[Top Search Results\]\*?\*?/g, '');
  // Remove search result title lines (bold text followed by colon at start of snippet)
  cleaned = cleaned.replace(/\*\*[^*]+\*\*\s*:/g, ':');
  return cleaned;
};

export const getResultPosition = (result: Result, runStatus: RunStatusResponse): number | null => {
  if (!result.response_text || result.error || !runStatus) return null;
  const selectedBrand = runStatus.search_type === 'category'
    ? (runStatus.results.find((r: Result) => r.competitors_mentioned?.length)?.competitors_mentioned?.[0] || '')
    : runStatus.brand;
  const brandLower = (selectedBrand || '').toLowerCase();
  // Use all detected brands for ranking, fall back to tracked brands if unavailable
  const allBrands: string[] = result.all_brands_mentioned && result.all_brands_mentioned.length > 0
    ? result.all_brands_mentioned.filter((b): b is string => typeof b === 'string')
    : [runStatus.brand, ...(result.competitors_mentioned || [])].filter((b): b is string => typeof b === 'string');

  let foundIndex = allBrands.findIndex(b => b.toLowerCase() === brandLower);

  if (foundIndex === -1) {
    foundIndex = allBrands.findIndex(b =>
      b.toLowerCase().includes(brandLower) || brandLower.includes(b.toLowerCase())
    );
  }

  if (foundIndex === -1 && result.brand_mentioned && result.response_text) {
    const rankingText = getTextForRanking(result.response_text, result.provider).toLowerCase();
    const brandPos = rankingText.indexOf(brandLower);
    if (brandPos >= 0) {
      let brandsBeforeCount = 0;
      for (const b of allBrands) {
        const bLower = b.toLowerCase();
        if (bLower === brandLower || bLower.includes(brandLower) || brandLower.includes(bLower)) continue;
        const bPos = rankingText.indexOf(bLower);
        if (bPos >= 0 && bPos < brandPos) {
          brandsBeforeCount++;
        }
      }
      return brandsBeforeCount + 1;
    }
    return allBrands.length + 1;
  }

  return foundIndex >= 0 ? foundIndex + 1 : null;
};

export const rankToRangeX = (rank: number): number => {
  if (rank === 0) return 10;
  if (rank >= 10) return 9;
  return rank - 1;
};

export const positionToRankBand = (position: number | null | undefined, brandMentioned: boolean): { label: string; index: number } => {
  if (!brandMentioned || position === null || position === undefined || position === 0) {
    return { label: 'Not shown', index: 5 };
  }
  if (position === 1) return { label: '1 (Top)', index: 0 };
  if (position >= 2 && position <= 3) return { label: '2–3', index: 1 };
  if (position >= 4 && position <= 5) return { label: '4–5', index: 2 };
  if (position >= 6 && position <= 10) return { label: '6–10', index: 3 };
  return { label: 'Shown after top 10', index: 4 };
};

export const extractSummaryText = (summary: string): string => {
  if (!summary) return '';

  const trimmed = summary.trim();

  if (trimmed.startsWith('{') && trimmed.includes('"summary"')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.summary && typeof parsed.summary === 'string') {
        return parsed.summary;
      }
    } catch {
      // continue to fallback
    }

    const summaryKeyIndex = trimmed.indexOf('"summary"');
    if (summaryKeyIndex !== -1) {
      const colonIndex = trimmed.indexOf(':', summaryKeyIndex);
      if (colonIndex !== -1) {
        const valueStartQuote = trimmed.indexOf('"', colonIndex);
        if (valueStartQuote !== -1) {
          let content = trimmed.slice(valueStartQuote + 1);

          const endPatterns = [
            '",\n  "recommendations"',
            '",\n"recommendations"',
            '", "recommendations"',
            '","recommendations"',
            '"\n}',
            '",\n}',
            '"}',
          ];

          let earliestEnd = -1;
          for (const pattern of endPatterns) {
            const idx = content.indexOf(pattern);
            if (idx !== -1 && (earliestEnd === -1 || idx < earliestEnd)) {
              earliestEnd = idx;
            }
          }

          if (earliestEnd !== -1) {
            content = content.slice(0, earliestEnd);
          }

          return content
            .replace(/\\n/g, '\n')
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\')
            .trim();
        }
      }
    }
  }

  return summary;
};

export const extractActionableTakeaway = (summary: string): string => {
  if (!summary) return '';

  const text = extractSummaryText(summary);

  if (text.trim().startsWith('{') || text.trim().startsWith('"recommendations"') || text.trim().startsWith('"title"')) {
    return '';
  }

  const patterns = [
    /\*\*Actionable takeaway[:\s]*\*\*\s*([\s\S]*?)(?=\n\n\*\*|$)/i,
    /Actionable takeaway[:\s]*([\s\S]*?)(?=\n\n\*\*|$)/i,
    /\*\*Actionable[:\s]*\*\*\s*([\s\S]*?)(?=\n\n\*\*|$)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const extracted = match[1].trim();
      if (!extracted.startsWith('{') && !extracted.startsWith('[') && !extracted.includes('"recommendations"')) {
        return extracted;
      }
    }
  }

  const paragraphs = text.split(/\n\n+/).filter(p => {
    const trimmed = p.trim();
    return trimmed &&
           !trimmed.startsWith('{') &&
           !trimmed.startsWith('[') &&
           !trimmed.startsWith('"') &&
           !trimmed.includes('"recommendations"') &&
           !trimmed.includes('"title"') &&
           !trimmed.includes('"tactics"') &&
           !trimmed.includes('"priority"');
  });

  if (paragraphs.length > 0) {
    return paragraphs[paragraphs.length - 1].trim();
  }

  return '';
};

export const removeActionableTakeaway = (summary: string): string => {
  if (!summary) return '';

  const text = extractSummaryText(summary);

  const patterns = [
    /\n\n\*\*Actionable takeaway[:\s]*\*\*[\s\S]*$/i,
    /\n\n\*\*Actionable[:\s]*\*\*[\s\S]*$/i,
    /\n\nActionable takeaway[:\s]*[\s\S]*$/i,
  ];

  let result = text;
  for (const pattern of patterns) {
    result = result.replace(pattern, '');
  }

  return result.trim();
};

export const getDomain = (url: string): string => {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

export const capitalizeFirst = (str: string): string => {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
};

export const getReadableTitleFromUrl = (url: string): string => {
  try {
    const parsedUrl = new URL(url);
    const domain = parsedUrl.hostname.replace(/^www\./, '');
    const pathname = parsedUrl.pathname;

    if (domain === 'reddit.com' || domain.endsWith('.reddit.com') || domain === 'redd.it') {
      const subredditMatch = pathname.match(/\/r\/([^/]+)/);
      if (subredditMatch) {
        const titleMatch = pathname.match(/\/r\/[^/]+\/comments\/[^/]+\/([^/]+)/);
        if (titleMatch && titleMatch[1]) {
          const postTitle = titleMatch[1].replace(/_/g, ' ');
          return `${postTitle} (r/${subredditMatch[1]})`;
        }
        return `r/${subredditMatch[1]}`;
      }
      const userMatch = pathname.match(/\/user\/([^/]+)/);
      if (userMatch) {
        return `u/${userMatch[1]}`;
      }
      const commentsMatch = pathname.match(/\/comments\/([^/]+)(?:\/([^/]+))?/);
      if (commentsMatch && commentsMatch[2]) {
        return commentsMatch[2].replace(/_/g, ' ');
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

export const formatSourceDisplay = (url: string, title?: string): { domain: string; subtitle: string } => {
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

export const formatResponseText = (text: string): string => {
  if (!text) return '';

  let formatted = text;

  // Remove AI Overview "People Also Ask" markers
  formatted = formatted.replace(/\*?\*?\[People Also Ask\]\*?\*?/g, '');

  formatted = formatted.replace(/\r\n/g, '\n');
  formatted = formatted.replace(/\n{3,}/g, '\n\n');
  formatted = formatted.replace(/^[\u2022\u2023\u25E6\u2043\u2219●○◦•]\s*/gm, '- ');
  formatted = formatted.replace(/^(-|\*|\d+\.)\s{2,}/gm, '$1 ');
  formatted = formatted.replace(/([^\n])\n(#{1,6}\s)/g, '$1\n\n$2');
  formatted = formatted.replace(/([^\n-*\d])\n([-*]\s|\d+\.\s)/g, '$1\n\n$2');
  formatted = formatted.replace(/[ \t]+$/gm, '');
  formatted = formatted.replace(/([-*]\s.+)\n([A-Z])/g, '$1\n\n$2');
  formatted = formatted.trim();

  return formatted;
};

export const highlightCompetitors = (text: string, competitors: string[] | null): string => {
  if (!text || !competitors || competitors.length === 0) return text;

  let highlighted = text;

  const sortedCompetitors = [...competitors].sort((a, b) => b.length - a.length);

  for (const competitor of sortedCompetitors) {
    const escaped = competitor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b(${escaped})\\b`, 'i');
    highlighted = highlighted.replace(regex, '**$1**');
  }

  return highlighted;
};

export const getCategoryIcon = (category: string, className: string = "w-3.5 h-3.5") => {
  const color = CATEGORY_COLORS[category] || CATEGORY_COLORS['Other'];
  const props = { className, style: { color } };
  switch (category) {
    case 'Social Media': return React.createElement(AtSign, props);
    case 'Video': return React.createElement(Film, props);
    case 'Reference': return React.createElement(FileText, props);
    case 'News & Media': return React.createElement(Rss, props);
    case 'E-commerce': return React.createElement(Tag, props);
    case 'Reviews': return React.createElement(Award, props);
    case 'Forums & Q&A': return React.createElement(MessagesSquare, props);
    case 'Government': return React.createElement(Building2, props);
    case 'Blogs': return React.createElement(Feather, props);
    case 'Travel': return React.createElement(MapPin, props);
    case 'Finance': return React.createElement(TrendingUp, props);
    default: return React.createElement(Circle, props);
  }
};

export const categorizeDomain = (domain: string): string => {
  const d = domain.toLowerCase();

  const socialMediaSites = [
    'reddit.com', 'twitter.com', 'x.com', 'facebook.com', 'fb.com', 'instagram.com', 'tiktok.com',
    'linkedin.com', 'pinterest.com', 'snapchat.com', 'discord.com', 'discord.gg',
    'whatsapp.com', 'telegram.org', 't.me', 'signal.org',
    'threads.net', 'mastodon.social', 'mastodon.online', 'bsky.app', 'bluesky', 'bereal.com',
    'lemon8-app.com', 'clubhouse.com', 'nextdoor.com',
    'flickr.com', 'imgur.com', 'giphy.com', '500px.com', 'deviantart.com',
    'vk.com', 'weibo.com', 'weixin.qq.com', 'wechat.com', 'line.me', 'kakaotalk',
    'behance.net', 'dribbble.com', 'goodreads.com', 'letterboxd.com', 'untappd.com', 'strava.com'
  ];
  if (socialMediaSites.some(s => d.includes(s))) return 'Social Media';

  const videoSites = [
    'youtube.com', 'youtu.be', 'vimeo.com', 'twitch.tv', 'dailymotion.com',
    'netflix.com', 'hulu.com', 'disneyplus.com', 'hbomax.com', 'max.com', 'peacocktv.com',
    'paramountplus.com', 'appletv.com', 'primevideo.com', 'crunchyroll.com', 'funimation.com',
    'wistia.com', 'brightcove.com', 'vidyard.com', 'loom.com', 'streamable.com',
    'rumble.com', 'bitchute.com', 'odysee.com', 'd.tube',
    'ted.com', 'masterclass.com', 'skillshare.com', 'udemy.com', 'coursera.org', 'edx.org',
    'khanacademy.org', 'lynda.com', 'pluralsight.com'
  ];
  if (videoSites.some(s => d.includes(s))) return 'Video';

  const referenceSites = [
    'wikipedia.org', 'wikimedia.org', 'wiktionary.org', 'wikihow.com', 'fandom.com',
    'britannica.com', 'encyclopedia.com', 'scholarpedia.org', 'citizendium.org',
    'merriam-webster.com', 'dictionary.com', 'thesaurus.com', 'oxforddictionaries.com',
    'cambridge.org', 'collinsdictionary.com', 'wordreference.com', 'linguee.com',
    'scholar.google.com', 'researchgate.net', 'academia.edu', 'jstor.org', 'pubmed.gov',
    'ncbi.nlm.nih.gov', 'arxiv.org', 'ssrn.com', 'sciencedirect.com', 'springer.com',
    'nature.com', 'science.org', 'ieee.org', 'acm.org', 'plos.org',
    '.edu', 'instructables.com', 'howstuffworks.com', 'lifehacker.com', 'makeuseof.com',
    'investopedia.com', 'healthline.com', 'webmd.com', 'mayoclinic.org', 'nih.gov'
  ];
  if (referenceSites.some(s => d.includes(s))) return 'Reference';

  const majorNewsOutlets = [
    'nytimes.com', 'wsj.com', 'washingtonpost.com', 'usatoday.com', 'latimes.com', 'chicagotribune.com',
    'nypost.com', 'nydailynews.com', 'sfchronicle.com', 'bostonglobe.com', 'dallasnews.com',
    'cnn.com', 'foxnews.com', 'msnbc.com', 'nbcnews.com', 'abcnews.go.com', 'cbsnews.com', 'pbs.org', 'npr.org',
    'bbc.com', 'bbc.co.uk', 'theguardian.com', 'telegraph.co.uk', 'dailymail.co.uk', 'independent.co.uk',
    'mirror.co.uk', 'thesun.co.uk', 'express.co.uk', 'metro.co.uk', 'standard.co.uk', 'sky.com',
    'reuters.com', 'apnews.com', 'afp.com', 'aljazeera.com', 'dw.com', 'france24.com', 'rt.com',
    'scmp.com', 'straitstimes.com', 'theaustralian.com.au', 'abc.net.au', 'cbc.ca', 'globalnews.ca',
    'forbes.com', 'bloomberg.com', 'businessinsider.com', 'cnbc.com', 'marketwatch.com', 'ft.com',
    'economist.com', 'fortune.com', 'inc.com', 'entrepreneur.com', 'fastcompany.com', 'qz.com',
    'techcrunch.com', 'wired.com', 'theverge.com', 'engadget.com', 'arstechnica.com', 'mashable.com',
    'gizmodo.com', 'cnet.com', 'zdnet.com', 'venturebeat.com', 'thenextweb.com', 'recode.net',
    'techradar.com', 'tomshardware.com', 'anandtech.com', '9to5mac.com', '9to5google.com', 'macrumors.com',
    'variety.com', 'hollywoodreporter.com', 'deadline.com', 'ew.com', 'people.com', 'tmz.com',
    'rollingstone.com', 'billboard.com', 'pitchfork.com', 'ign.com', 'gamespot.com', 'kotaku.com', 'polygon.com',
    'espn.com', 'sports.yahoo.com', 'bleacherreport.com', 'si.com', 'cbssports.com', 'theathletic.com',
    'huffpost.com', 'buzzfeednews.com', 'vox.com', 'theatlantic.com', 'newyorker.com', 'slate.com',
    'salon.com', 'thedailybeast.com', 'axios.com', 'politico.com', 'thehill.com', 'realclearpolitics.com'
  ];
  const newsPatterns = ['news', 'daily', 'times', 'post', 'herald', 'tribune', 'journal', 'gazette',
    'observer', 'chronicle', 'examiner', 'inquirer', 'dispatch', 'sentinel', 'courier', 'press',
    'register', 'record', 'reporter', 'bulletin', 'beacon', 'argus', 'banner', 'ledger', 'star',
    'sun', 'mirror', 'express', 'mail', 'telegraph', 'monitor', 'insider', 'today'];
  if (majorNewsOutlets.some(s => d.includes(s)) || newsPatterns.some(p => d.includes(p))) return 'News & Media';

  const ecommerceSites = [
    'amazon.com', 'amazon.co.uk', 'amazon.ca', 'amazon.de', 'ebay.com', 'ebay.co.uk',
    'walmart.com', 'target.com', 'costco.com', 'samsclub.com', 'kohls.com', 'macys.com',
    'nordstrom.com', 'jcpenney.com', 'homedepot.com', 'lowes.com', 'menards.com',
    'bestbuy.com', 'newegg.com', 'bhphotovideo.com', 'adorama.com', 'microcenter.com',
    'zappos.com', 'asos.com', 'zara.com', 'hm.com', 'uniqlo.com', 'gap.com', 'nike.com',
    'adidas.com', 'footlocker.com', 'rei.com', 'patagonia.com', 'lululemon.com',
    'etsy.com', 'wayfair.com', 'overstock.com', 'chewy.com', 'petco.com', 'petsmart.com',
    'sephora.com', 'ulta.com', 'bathandbodyworks.com', 'williams-sonoma.com', 'crateandbarrel.com',
    'alibaba.com', 'aliexpress.com', 'wish.com', 'shein.com', 'temu.com', 'rakuten.com',
    'flipkart.com', 'jd.com', 'taobao.com', 'mercadolibre.com',
    'shopify.com', 'bigcommerce.com', 'squarespace.com', 'wix.com', 'woocommerce.com',
    'instacart.com', 'freshdirect.com', 'peapod.com', 'shipt.com', 'doordash.com', 'ubereats.com',
    'shop', 'store', 'buy', 'market', 'outlet', 'deals'
  ];
  if (ecommerceSites.some(s => d.includes(s))) return 'E-commerce';

  const reviewSites = [
    'yelp.com', 'tripadvisor.com', 'trustpilot.com', 'sitejabber.com', 'bbb.org',
    'consumerreports.org', 'consumersearch.com', 'which.co.uk',
    'g2.com', 'capterra.com', 'softwareadvice.com', 'getapp.com', 'trustradius.com',
    'gartner.com', 'forrester.com', 'pcmag.com',
    'glassdoor.com', 'indeed.com', 'comparably.com', 'kununu.com',
    'wirecutter.com', 'rtings.com', 'tomsguide.com', 'digitaltrends.com', 'reviewed.com',
    'thespruce.com', 'foodnetwork.com', 'allrecipes.com', 'epicurious.com',
    'booking.com', 'hotels.com', 'expedia.com', 'kayak.com', 'airbnb.com', 'vrbo.com',
    'edmunds.com', 'kbb.com', 'caranddriver.com', 'motortrend.com', 'autotrader.com',
    'zillow.com', 'realtor.com', 'redfin.com', 'trulia.com', 'apartments.com',
    'reviews', 'review', 'rating', 'rated', 'compare', 'versus', 'vs'
  ];
  if (reviewSites.some(s => d.includes(s))) return 'Reviews';

  const forumSites = [
    'quora.com', 'answers.com', 'ask.com', 'answers.yahoo.com', 'chacha.com',
    'stackoverflow.com', 'stackexchange.com', 'superuser.com', 'serverfault.com',
    'askubuntu.com', 'mathoverflow.net', 'github.com', 'gitlab.com', 'bitbucket.org',
    'reddit.com', 'digg.com', 'slashdot.org', 'hackernews.com', 'news.ycombinator.com',
    'voat.co', 'hubpages.com', 'xda-developers.com', 'androidcentral.com',
    'avsforum.com', 'head-fi.org', 'audiogon.com', 'dpreview.com', 'fredmiranda.com',
    'flyertalk.com', 'fatwalletfinance.com', 'bogleheads.org', 'early-retirement.org',
    'discourse', 'forum', 'forums', 'community', 'communities', 'discuss', 'discussion',
    'board', 'boards', 'bbs', 'phpbb', 'vbulletin', 'xenforo', 'invision'
  ];
  if (forumSites.some(s => d.includes(s))) return 'Forums & Q&A';

  const govSites = [
    '.gov', '.gov.uk', '.gov.au', '.gov.ca', '.govt.nz', '.gob', '.gouv',
    'usa.gov', 'whitehouse.gov', 'congress.gov', 'senate.gov', 'house.gov',
    'supremecourt.gov', 'uscourts.gov', 'state.gov', 'treasury.gov', 'irs.gov',
    'ssa.gov', 'medicare.gov', 'va.gov', 'hud.gov', 'usda.gov', 'epa.gov',
    'fda.gov', 'cdc.gov', 'fbi.gov', 'cia.gov', 'nsa.gov', 'dhs.gov',
    'un.org', 'who.int', 'worldbank.org', 'imf.org', 'wto.org', 'nato.int',
    'europa.eu', 'ec.europa.eu', 'oecd.org', 'unicef.org', 'unesco.org',
    '.org', 'redcross.org', 'salvationarmy.org', 'habitat.org', 'aclu.org',
    'eff.org', 'fsf.org', 'creativecommons.org', 'mozilla.org', 'apache.org'
  ];
  if (govSites.some(s => d.includes(s))) return 'Government';

  const blogSites = [
    'medium.com', 'substack.com', 'blogger.com', 'blogspot.com', 'wordpress.com',
    'wordpress.org', 'tumblr.com', 'ghost.io', 'ghost.org', 'svbtle.com',
    'typepad.com', 'livejournal.com', 'wix.com', 'squarespace.com', 'weebly.com',
    'buttondown.email', 'revue.co', 'mailchimp.com', 'convertkit.com', 'beehiiv.com',
    'blog', 'blogs', 'personal', 'journal', 'diary', 'thoughts', 'musings',
    'dev.to', 'hashnode.com', 'hashnode.dev', 'mirror.xyz'
  ];
  if (blogSites.some(s => d.includes(s))) return 'Blogs';

  return 'Other';
};
