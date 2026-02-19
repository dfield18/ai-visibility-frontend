'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { UserButton, useAuth } from '@clerk/nextjs';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ArrowLeft,
  Download,
  Link2,
  Check,
  CheckCircle2,
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
  AtSign,
  Film,
  Rss,
  Tag,
  Award,
  MessagesSquare,
  Feather,
  MapPin,
  Circle,
  Zap,
  BarChart3,
  Target,
  Megaphone,
  ArrowRight,
  FileDown,
  Calendar,
  Mail,
  Share2,
  Building2,
  CircleDollarSign,
  Search,
  ThumbsUp,
  Package,
  Settings,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Clock,
  Edit2,
  Power,
  PlayCircle,
  Pause,
  HelpCircle,
  PenLine,
  Newspaper,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { useRunStatus, useAISummary, useSiteAudits, useBrandBlurbs, useFilteredQuotes } from '@/hooks/useApi';
import type { BrandQuote } from '@/hooks/useApi';
import {
  formatCurrency,
  formatDate,
  formatPercent,
  getRateColor,
  truncate,
  getSessionId,
} from '@/lib/utils';
import { Result, Source, SiteAuditResult } from '@/lib/types';
import { ReportsTab } from './ReportsTab';
import { ModifyQueryModal } from './ModifyQueryModal';
import { SiteAuditTab } from './SiteAuditTab';
import { OverviewTab } from './tabs/OverviewTab';
import CompetitiveTab from './tabs/CompetitiveTab';
import { SentimentTab } from './tabs/SentimentTab';
import { SourcesTab } from './tabs/SourcesTab';
import { RecommendationsTab } from './tabs/RecommendationsTab';
import { ReferenceTab } from './tabs/ReferenceTab';
import { ChatGPTAdsTab } from './tabs/ChatGPTAdsTab';
import { ResultsProvider } from './tabs/ResultsContext';
import { BrandFilterPanel } from './BrandFilterPanel';
import { getBrandRank, isCategoryName } from './tabs/shared';
import { getSearchTypeConfig, type TabId } from '@/lib/searchTypeConfig';
import { PaywallOverlay } from '@/components/PaywallOverlay';
import { PlaceholderChart } from '@/components/PlaceholderChart';
import { PlaceholderTable } from '@/components/PlaceholderTable';
import { useSectionAccess } from '@/hooks/useBilling';
import { useResultsStore, type UseResultsStoreParams } from './metrics/useResultsStore';
import {
  computeCorrectedResults,
  computeGloballyFilteredResults,
} from './metrics/compute/base';
import {
  buildBrandNormalizationMap,
  applyBrandNormalization,
} from './metrics/compute/normalization';
import { computeBrandBreakdownStats } from './metrics/compute/competitive';

type FilterType = 'all' | 'mentioned' | 'not_mentioned';
type TabType = 'overview' | 'reference' | 'competitive' | 'sentiment' | 'sources' | 'recommendations' | 'reports' | 'site-audit' | 'chatgpt-ads' | 'industry-overview';

const TAB_ICONS: Record<string, React.ReactNode> = {
  'overview': <LayoutGrid className="w-4 h-4" />,
  'competitive': <TrendingUp className="w-4 h-4" />,
  'sentiment': <MessageSquare className="w-4 h-4" />,
  'sources': <Globe className="w-4 h-4" />,
  'recommendations': <Lightbulb className="w-4 h-4" />,
  'site-audit': <Search className="w-4 h-4" />,
  'reports': <FileBarChart className="w-4 h-4" />,
  'chatgpt-ads': <Megaphone className="w-4 h-4" />,
  'reference': <FileText className="w-4 h-4" />,
  'industry-overview': <LayoutGrid className="w-4 h-4" />,
};

function buildTabs(searchType: string): { id: TabType; label: string; icon: React.ReactNode }[] {
  const config = getSearchTypeConfig(searchType as any);
  let tabs = config.tabs.filter(t => t.enabled);
  // For issues, move the sentiment (Framing & Tone) tab to the far right
  if (searchType === 'issue') {
    const sentimentTab = tabs.find(t => t.id === 'sentiment');
    if (sentimentTab) {
      tabs = [...tabs.filter(t => t.id !== 'sentiment'), sentimentTab];
    }
  }
  return tabs.map(t => ({
      id: t.id as TabType,
      label: t.label,
      icon: TAB_ICONS[t.id] || <FileText className="w-4 h-4" />,
    }));
}

// Section definitions for each tab (used by the sidebar guide)
const TAB_SECTIONS: Partial<Record<TabType, { id: string; label: string }[]>> = {
  overview: [
    { id: 'overview-metrics', label: 'Metrics Overview' },
    { id: 'overview-ai-analysis', label: 'AI Analysis' },
    { id: 'overview-brand-quotes', label: 'Brand Quotes' },
    { id: 'overview-by-question', label: 'Results by Question' },
    { id: 'overview-by-platform-chart', label: 'Position by Platform' },
    { id: 'overview-by-platform', label: 'Results by Platform' },
    { id: 'overview-all-results', label: 'All Results' },
  ],
  competitive: [
    { id: 'competitive-cards', label: 'Visibility Cards' },
    { id: 'competitive-insights', label: 'Key Insights' },
    { id: 'competitive-breakdown', label: 'Brand Breakdown' },
    { id: 'competitive-positioning', label: 'Brand Positioning' },
    { id: 'competitive-heatmap', label: 'Performance Matrix' },
    { id: 'competitive-cooccurrence', label: 'Mentioned Together' },
    { id: 'competitive-publishers', label: 'Publisher Heatmap' },
  ],
  sentiment: [
    { id: 'sentiment-distribution', label: 'Sentiment Overview' },
    { id: 'sentiment-insights', label: 'Key Insights' },
    { id: 'sentiment-by-question', label: 'By Question' },
    { id: 'sentiment-by-platform', label: 'By AI Platform' },
    { id: 'sentiment-competitor', label: 'Competitor Comparison' },
    { id: 'sentiment-details', label: 'Sentiment Details' },
  ],
  sources: [
    { id: 'sources-influencers', label: 'Key Influencers' },
    { id: 'sources-insights', label: 'Key Insights' },
    { id: 'sources-top-cited', label: 'Top Cited Sources' },
    { id: 'sources-helpful', label: 'Sources That Help' },
    { id: 'sources-brand-website', label: 'Website Citations' },
    { id: 'sources-publisher', label: 'Publisher Breakdown' },
  ],
  recommendations: [
    { id: 'recommendations-ai', label: 'AI Recommendations' },
    { id: 'recommendations-llm', label: 'Website Optimization' },
  ],
  reference: [
    { id: 'reference-summary', label: 'Summary' },
    { id: 'reference-chart', label: 'Brand Position Chart' },
    { id: 'reference-ai-analysis', label: 'AI Analysis' },
    { id: 'reference-detailed', label: 'Detailed Results' },
    { id: 'reference-export', label: 'Export & Share' },
  ],
  'industry-overview': [
    { id: 'overview-metrics', label: 'Metrics Overview' },
    { id: 'overview-ai-analysis', label: 'AI Analysis' },
    { id: 'competitive-cards', label: 'Visibility Reports' },
    { id: 'competitive-breakdown', label: 'Market Share Breakdown' },
    { id: 'competitive-positioning', label: 'Market Positioning' },
    { id: 'competitive-heatmap', label: 'Performance Matrix' },
    { id: 'competitive-cooccurrence', label: 'Mentioned Together' },
    { id: 'overview-by-platform', label: 'Brand Visibility by Platform' },
    { id: 'overview-all-results', label: 'All Results' },
  ],
};

// Section Guide sidebar component
function SectionGuide({ activeTab, children }: { activeTab: TabType; children?: React.ReactNode }) {
  const [activeSection, setActiveSection] = useState('');
  const sections = TAB_SECTIONS[activeTab];

  useEffect(() => {
    if (!sections || sections.length === 0) return;

    let rafId: number;

    const updateActiveSection = () => {
      let current = sections[0].id;

      for (const { id } of sections) {
        const el = document.getElementById(id);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= 130) {
            current = id;
          }
        }
      }

      setActiveSection(current);
    };

    const handleScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(updateActiveSection);
    };

    const timer = setTimeout(updateActiveSection, 150);

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [sections, activeTab]);

  if (!sections || sections.length === 0) return null;

  return (
    <div className="hidden xl:block w-44 flex-shrink-0">
      <div className="sticky top-36 max-h-[calc(100vh-10rem)] overflow-y-auto">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">On this page</p>
        <nav className="space-y-0.5">
          {sections.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => {
                const el = document.getElementById(id);
                if (el) {
                  const y = el.getBoundingClientRect().top + window.scrollY - 90;
                  window.scrollTo({ top: y, behavior: 'smooth' });
                }
              }}
              className={`block w-full text-left text-sm py-1.5 pl-3 border-l-2 transition-colors ${
                activeSection === id
                  ? 'border-gray-900 text-gray-900 font-medium'
                  : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
        {children}
      </div>
    </div>
  );
}

// Helper to extract summary from potentially JSON-formatted text
const extractSummaryText = (summary: string): string => {
  if (!summary) return '';

  const trimmed = summary.trim();

  if (trimmed.startsWith('{') && trimmed.includes('"summary"')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.summary && typeof parsed.summary === 'string') {
        return parsed.summary;
      }
    } catch {
      // JSON parsing failed - continue to fallback extraction
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

// Helper to extract just the actionable takeaway section from the AI summary
const extractActionableTakeaway = (summary: string): string => {
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

// Helper to remove the actionable takeaway section from the AI summary
const removeActionableTakeaway = (summary: string): string => {
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

export default function ResultsPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const runId = params.id as string;

  // Section access for paywall enforcement
  const sectionAccess = useSectionAccess();

  // Canonical provider display order (by popularity)
  const PROVIDER_ORDER = ['openai', 'gemini', 'anthropic', 'perplexity', 'grok', 'llama', 'ai_overviews'];

  // Tab state - persisted in URL
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    const tab = searchParams.get('tab') as TabType;
    if (tab === 'industry-overview') return tab;
    const defaultTabs = buildTabs('brand');
    return defaultTabs.some(t => t.id === tab) ? tab : 'overview';
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

  // UI-only state
  const [copied, setCopied] = useState(false);
  const [aiSummaryExpanded, setAiSummaryExpanded] = useState(false);
  const [selectedResult, setSelectedResult] = useState<Result | null>(null);
  const [selectedResultHighlight, setSelectedResultHighlight] = useState<{ brand: string; domain?: string } | null>(null);
  const [heatmapResultsList, setHeatmapResultsList] = useState<{ results: Result[]; domain: string; brand: string } | null>(null);
  const [chartTab, setChartTab] = useState<'allAnswers' | 'performanceRange' | 'shareOfVoice'>('allAnswers');
  const [showSentimentColors, setShowSentimentColors] = useState(true);
  const [showModifyModal, setShowModifyModal] = useState(false);
  const [excludedBrands, setExcludedBrands] = useState<Set<string>>(new Set());
  const [snippetDetailModal, setSnippetDetailModal] = useState<{ brand: string; responseText: string; provider: string; prompt: string } | null>(null);
  const snippetDetailRef = useRef<HTMLSpanElement>(null);

  // -------------------------------------------------------------------------
  // External data hooks
  // -------------------------------------------------------------------------
  const { data: runStatus, isLoading, error } = useRunStatus(runId, true);

  // Dynamic tabs based on search type
  const TABS = useMemo(() => buildTabs(runStatus?.search_type || 'brand'), [runStatus?.search_type]);

  const { data: aiSummary, isLoading: isSummaryLoading } = useAISummary(
    runId,
    runStatus?.status === 'complete'
  );

  // Debug logging for AI Summary response
  useEffect(() => {
    if (aiSummary) {
      console.log('[AI Summary] Full response:', aiSummary);
      console.log('[AI Summary] Summary field:', aiSummary.summary);
      console.log('[AI Summary] Recommendations (prose):', aiSummary.recommendations);
      console.log('[AI Summary] Recommendations length:', aiSummary.recommendations?.length);
      console.log('[AI Summary] Extracted summary text:', extractSummaryText(aiSummary.summary || ''));
      console.log('[AI Summary] Extracted actionable takeaway:', extractActionableTakeaway(aiSummary.summary || ''));
    }
  }, [aiSummary]);

  // Default to industry-overview tab for category reports
  useEffect(() => {
    if (runStatus?.search_type === 'category' && !searchParams.get('tab')) {
      setActiveTab('industry-overview');
    }
  }, [runStatus?.search_type]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Scroll to top when switching tabs
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [activeTab]);

  // Scroll to highlighted brand in snippet detail modal
  useEffect(() => {
    if (snippetDetailModal && snippetDetailRef.current) {
      setTimeout(() => {
        snippetDetailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [snippetDetailModal]);

  // -------------------------------------------------------------------------
  // Lightweight pre-computations for brand blurbs & quotes hooks
  // -------------------------------------------------------------------------
  // These hooks need brand names and globallyFilteredResults, but the full store
  // also needs brandQuotesMap from the hooks. To avoid calling useResultsStore
  // twice, we compute only the minimal data needed by hooks here.

  const preFilteredResults = useMemo(() => {
    if (!runStatus) return [];
    const corrected = computeCorrectedResults(runStatus);
    const normMap = buildBrandNormalizationMap(corrected);
    const normalized = normMap.size > 0 ? applyBrandNormalization(corrected, normMap) : corrected;
    return computeGloballyFilteredResults(runStatus, normalized, globalLlmFilter, globalPromptFilter, globalBrandFilter);
  }, [runStatus, globalLlmFilter, globalPromptFilter, globalBrandFilter]);

  const preBrandBreakdownStats = useMemo(
    () => computeBrandBreakdownStats(runStatus ?? null, preFilteredResults, 'all', 'all', excludedBrands),
    [runStatus, preFilteredResults, excludedBrands],
  );

  const brandNamesForHooks = useMemo(
    () => preBrandBreakdownStats.map(b => b.brand),
    [preBrandBreakdownStats],
  );

  // Fetch AI-generated brand characterization blurbs
  const brandBlurbsContext = runStatus
    ? `${runStatus.search_type === 'category' ? 'category' : 'brand'} analysis for ${runStatus.brand}`
    : '';
  const { data: brandBlurbsData } = useBrandBlurbs(
    brandNamesForHooks,
    brandBlurbsContext,
    brandNamesForHooks.length > 0 && runStatus?.status === 'complete'
  );
  const brandBlurbs = brandBlurbsData?.blurbs ?? {};

  // Strip markdown formatting from text (declared before candidateQuotesMap which uses it)
  const stripMarkdown = (text: string): string => {
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

  // Extract candidate quotes mentioning each brand from LLM responses
  const candidateQuotesMap = useMemo(() => {
    if (!runStatus) return {} as Record<string, BrandQuote[]>;
    const results = preFilteredResults.filter((r: Result) => r.response_text && !r.error);
    const searchedBrand = runStatus.brand;

    const map: Record<string, BrandQuote[]> = {};

    for (const brand of brandNamesForHooks) {
      const isSearched = brand === searchedBrand;
      const relevant = results.filter((r: Result) =>
        isSearched ? r.brand_mentioned : (r.all_brands_mentioned?.length ? r.all_brands_mentioned.includes(brand) : r.competitors_mentioned?.includes(brand))
      );

      const allQuotes: BrandQuote[] = [];
      relevant.forEach((r: Result) => {
        const text = stripMarkdown(r.response_text!);
        const sentences = text.split(/(?<=[.!?])\s+/);
        for (const sentence of sentences) {
          const trimmed = sentence.trim();
          if (
            trimmed.toLowerCase().includes(brand.toLowerCase()) &&
            trimmed.length >= 40 &&
            trimmed.length <= 300 &&
            !/\|/.test(trimmed) &&
            !/---/.test(trimmed) &&
            !/https?:\/\//.test(trimmed) &&
            !/^\[/.test(trimmed) &&
            !/\u2022|•/.test(trimmed)
          ) {
            allQuotes.push({ text: trimmed, provider: r.provider, prompt: r.prompt });
          }
        }
      });

      // Deduplicate by text similarity, keep up to 6 diverse candidates for GPT filtering
      const selected: BrandQuote[] = [];
      const usedProviders = new Set<string>();
      const isTooSimilar = (q: BrandQuote) => {
        const words = new Set(q.text.toLowerCase().split(/\s+/));
        return selected.some(s => {
          const sWords = new Set(s.text.toLowerCase().split(/\s+/));
          const overlap = [...words].filter(w => sWords.has(w)).length;
          return overlap / Math.max(words.size, sWords.size) > 0.6;
        });
      };
      for (const q of allQuotes) {
        if (selected.length >= 6) break;
        if (usedProviders.has(q.provider)) continue;
        if (isTooSimilar(q)) continue;
        selected.push(q);
        usedProviders.add(q.provider);
      }
      for (const q of allQuotes) {
        if (selected.length >= 6) break;
        if (selected.some(s => s.text === q.text)) continue;
        if (isTooSimilar(q)) continue;
        selected.push(q);
      }

      map[brand] = selected;
    }

    return map;
  }, [runStatus, preFilteredResults, brandNamesForHooks]);

  // Use GPT to filter candidates down to the best 1-2 quotes per brand
  const hasCandidates = Object.values(candidateQuotesMap).some(q => q.length > 0);
  const { data: filteredQuotesData } = useFilteredQuotes(
    candidateQuotesMap,
    hasCandidates && runStatus?.status === 'complete'
  );
  // Use GPT-filtered quotes when available, fall back to candidates (first 2, or 3 for issues)
  const fallbackQuoteLimit = runStatus?.search_type === 'issue' ? 3 : 2;
  const brandQuotesMap: Record<string, BrandQuote[]> = filteredQuotesData?.quotes
    ?? Object.fromEntries(
      Object.entries(candidateQuotesMap).map(([brand, quotes]) => [brand, quotes.slice(0, fallbackQuoteLimit)])
    );

  // Frontend insights costs (brand blurbs + quote filtering via gpt-4o-mini)
  const frontendInsightsCost = (brandBlurbsData?.cost ?? 0) + (filteredQuotesData?.cost ?? 0);
  const totalCost = (runStatus?.actual_cost ?? 0) + frontendInsightsCost;

  // -------------------------------------------------------------------------
  // Single store call with the real brandQuotesMap
  // -------------------------------------------------------------------------
  const storeDataFinal = useResultsStore({
    runStatus: runStatus ?? null,
    aiSummary,
    isSummaryLoading,
    excludedBrands,
    setExcludedBrands,
    brandQuotesMap,
    globalLlmFilter,
    globalPromptFilter,
    globalBrandFilter,
  });

  // Convenience destructures for use in JSX
  const {
    isCategory,
    isIssue,
    isPublicFigure,
    globallyFilteredResults,
    allAvailableBrands,
    brandSourceHeatmap,
    compHeatmapShowSentiment: heatmapShowSentiment,
    compHeatmapProviderFilter: heatmapProviderFilter,
  } = storeDataFinal;

  // -------------------------------------------------------------------------
  // Helper functions used in JSX rendering
  // -------------------------------------------------------------------------

  // Extract domain from URL
  const getDomain = (url: string): string => {
    try {
      const hostname = new URL(url).hostname;
      return hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  };

  // Capitalize first letter of a string
  const capitalizeFirst = (str: string): string => {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  // Extract a readable title from URL path
  const getReadableTitleFromUrl = (url: string): string => {
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

  // Format response text for consistent display across Models
  const formatResponseText = (text: string): string => {
    if (!text) return '';

    let formatted = text;
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

  // Bold competitor names in response text (only first occurrence of each)
  const highlightCompetitors = (text: string, competitors: string[] | null): string => {
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

  const getProviderLabel = (provider: string) => {
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

  // Get platform brand color
  const getProviderBrandColor = (provider: string): string => {
    switch (provider.toLowerCase()) {
      case 'openai':
        return '#10a37f';
      case 'anthropic':
        return '#d97706';
      case 'gemini':
        return '#4285f4';
      case 'perplexity':
        return '#20b8cd';
      case 'grok':
        return '#1d9bf0';
      case 'llama':
        return '#8b5cf6';
      case 'ai_overviews':
        return '#FBBC04';
      default:
        return '#6b7280';
    }
  };

  const getProviderIcon = (provider: string) => {
    const color = getProviderBrandColor(provider);
    switch (provider.toLowerCase()) {
      case 'openai':
        return (
          <svg className="w-4 h-4" style={{ color }} viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/>
          </svg>
        );
      case 'anthropic':
        return (
          <svg className="w-4 h-4" style={{ color }} viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.304 3h-3.613L20 21h3.613L17.304 3zM7.304 3 .387 21h3.716l1.418-3.687h7.044L13.983 21h3.716L10.781 3H7.304zm-.124 11.187L9.042 8.58l1.862 5.607H7.18z"/>
          </svg>
        );
      case 'perplexity':
        return (
          <svg className="w-4 h-4" style={{ color }} viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
        );
      case 'gemini':
        return (
          <svg className="w-4 h-4" style={{ color }} viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
        );
      case 'grok':
        return (
          <svg className="w-4 h-4" style={{ color }} viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
        );
      case 'llama':
        return (
          <svg className="w-4 h-4" style={{ color }} viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
        );
      case 'ai_overviews':
        return (
          <svg className="w-4 h-4" style={{ color }} viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
        );
      default:
        return <span className="w-4 h-4 rounded-full" style={{ backgroundColor: color }} />;
    }
  };

  // Sentiment score mapping for heatmap calculations (main scope for modal access)
  const sentimentScores: Record<string, number> = {
    'strong_endorsement': 5,
    'positive_endorsement': 4,
    'neutral_mention': 3,
    'conditional': 2,
    'negative_comparison': 1,
    'not_mentioned': 0,
  };

  const getSentimentLabelFromScore = (score: number): string => {
    if (score >= 4.5) return 'Strong';
    if (score >= 3.5) return 'Positive';
    if (score >= 2.5) return 'Neutral';
    if (score >= 1.5) return 'Conditional';
    if (score >= 0.5) return 'Negative';
    return 'N/A';
  };

  // -------------------------------------------------------------------------
  // CSV export handlers
  // -------------------------------------------------------------------------

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
      .filter((r: Result) => !r.error || r.provider === 'ai_overviews')
      .map((r: Result) => {
        const rankNum = getBrandRank(r, runStatus.brand);
        const rank = rankNum !== null ? String(rankNum) : '';

        return [
          `"${r.prompt.replace(/"/g, '""')}"`,
          r.provider,
          r.model,
          r.temperature,
          r.brand_mentioned ? 'Yes' : 'No',
          `"${(r.all_brands_mentioned?.length ? r.all_brands_mentioned.filter(b => b.toLowerCase() !== (runStatus?.brand || '').toLowerCase()) : r.competitors_mentioned || []).join(', ')}"`,
          rank,
          r.response_type || '',
          r.tokens || '',
          r.cost || '',
          `"${(r.sources || []).map(s => s.url).join(', ')}"`,
          `"${(r.response_text || '').replace(/\*?\*?\[People Also Ask\]\*?\*?/g, '').replace(/[\r\n]+/g, ' ').replace(/"/g, '""')}"`,
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

  // Handler for heatmap cell click - find matching results
  const handleHeatmapCellClick = useCallback((domain: string, brand: string) => {
    if (!runStatus) return;

    const matchingResults = globallyFilteredResults.filter((result: Result) => {
      if (result.error || !result.sources || result.sources.length === 0) return false;
      if (heatmapProviderFilter !== 'all' && result.provider !== heatmapProviderFilter) return false;

      const brandMentioned = brand === runStatus.brand
        ? result.brand_mentioned
        : (result.all_brands_mentioned?.length ? result.all_brands_mentioned.includes(brand) : result.competitors_mentioned?.includes(brand));
      if (!brandMentioned) return false;

      const hasMatchingSource = result.sources.some((source: Source) => {
        if (!source.url) return false;
        return getDomain(source.url) === domain;
      });

      return hasMatchingSource;
    });

    if (matchingResults.length === 1) {
      setSelectedResult(matchingResults[0]);
      setSelectedResultHighlight({ brand, domain });
    } else if (matchingResults.length > 1) {
      setHeatmapResultsList({ results: matchingResults, domain, brand });
    }
  }, [runStatus, globallyFilteredResults, heatmapProviderFilter]);

  // -------------------------------------------------------------------------
  // Loading / Error states
  // -------------------------------------------------------------------------
  const showLoading = isLoading;
  const showError = !isLoading && (error || !runStatus);

  if (showLoading) {
    return (
      <main
        className="min-h-screen bg-[#FAFAF8] flex items-center justify-center"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(0,0,0,0.03) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(0,0,0,0.03) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
        }}
      >
        <div className="flex flex-col items-center">
          <Spinner size="lg" />
          <p className="mt-4 text-gray-500">Loading results...</p>
        </div>
      </main>
    );
  }

  if (showError) {
    return (
      <main
        className="min-h-screen bg-[#FAFAF8] flex items-center justify-center p-4"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(0,0,0,0.03) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(0,0,0,0.03) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
        }}
      >
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
            className="px-6 py-3 bg-gray-900 text-white font-medium rounded-xl hover:bg-gray-800 transition-colors"
          >
            Start New Analysis
          </button>
        </div>
      </main>
    );
  }

  // At this point runStatus is guaranteed to exist
  const validRunStatus = runStatus!;

  return (
    <main
      className="min-h-screen bg-[#FAFAF8] pb-8"
      style={{
        backgroundImage: `
          linear-gradient(to right, rgba(0,0,0,0.03) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(0,0,0,0.03) 1px, transparent 1px)
        `,
        backgroundSize: '48px 48px',
      }}
    >
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
                  <h1 className="text-lg font-normal text-gray-900">
                    Results for <span className="font-semibold text-gray-900">{validRunStatus.brand}</span>
                    {isCategory && <span className="text-gray-500 text-sm font-normal ml-1">(category)</span>}
                  </h1>
                  <p className="text-sm text-gray-500">
                    {validRunStatus.completed_at
                      ? `Completed ${formatDate(validRunStatus.completed_at)}`
                      : `Started ${formatDate(validRunStatus.created_at)}`}
                    {' · '}
                    <span className="relative group/cost inline-flex items-center cursor-default">
                      {formatCurrency(totalCost)}
                      <span className="absolute left-0 top-full mt-1 w-56 p-3 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover/cost:opacity-100 group-hover/cost:visible transition-all z-50 shadow-lg">
                        <span className="flex justify-between mb-1"><span>AI queries</span><span className="font-medium">{formatCurrency(storeDataFinal.promptCost)}</span></span>
                        <span className="flex justify-between mb-1"><span>Analysis & sentiment</span><span className="font-medium">{formatCurrency(storeDataFinal.analysisCost)}</span></span>
                        <span className="flex justify-between mb-1"><span>Insights & curation</span><span className="font-medium">{formatCurrency(frontendInsightsCost)}</span></span>
                        <span className="flex justify-between pt-1 border-t border-gray-700"><span>Total</span><span className="font-medium">{formatCurrency(totalCost)}</span></span>
                      </span>
                    </span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                {validRunStatus.status === 'complete' && !validRunStatus.extension_info?.has_running_extension && (
                  <button
                    onClick={() => setShowModifyModal(true)}
                    className="px-4 py-2 bg-white text-gray-900 text-sm font-medium rounded-xl border border-gray-900 hover:bg-gray-900/5 transition-colors flex items-center gap-2"
                  >
                    <Edit2 className="w-4 h-4" />
                    Modify Query
                  </button>
                )}
                {validRunStatus.extension_info?.has_running_extension && (
                  <span className="px-3 py-1.5 bg-amber-50 text-amber-700 text-sm font-medium rounded-lg flex items-center gap-2">
                    <Spinner size="sm" />
                    Extension in progress...
                  </span>
                )}
                <button
                  onClick={() => router.push('/')}
                  className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition-colors flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  New Analysis
                </button>
                <UserButton
                  appearance={{
                    elements: {
                      avatarBox: "w-9 h-9",
                    },
                  }}
                />
              </div>
            </div>
          </div>
        </header>

        <div className="max-w-6xl mx-auto px-6 pb-4">
          {/* Tab Bar */}
          <div className="border-b border-gray-200 bg-[#FAFAF8]">
            <nav className="flex gap-1 overflow-x-auto pb-px">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-gray-900 text-gray-900'
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
      <div className="max-w-7xl mx-auto px-6 pt-6">
        <div className="flex gap-6">
          <SectionGuide activeTab={activeTab}>
            {isCategory && allAvailableBrands.length > 0 && (
              <BrandFilterPanel allBrands={allAvailableBrands} excludedBrands={excludedBrands} setExcludedBrands={setExcludedBrands} />
            )}
          </SectionGuide>
          <div className="flex-1 min-w-0">
        <ResultsProvider
          data={storeDataFinal}
          ui={{
            activeTab,
            setActiveTab,
            copied,
            handleCopyLink,
            handleExportCSV,
            selectedResult,
            setSelectedResult,
            setSelectedResultHighlight,
            setSnippetDetailModal,
          }}
        >
        {activeTab === 'overview' && (
          runStatus?.search_type === 'issue' ? (
            <div className="space-y-6">
              <OverviewTab
                aiSummaryExpanded={aiSummaryExpanded}
                setAiSummaryExpanded={setAiSummaryExpanded}
                showSentimentColors={showSentimentColors}
                setShowSentimentColors={setShowSentimentColors}
                chartTab={chartTab}
                setChartTab={setChartTab}

                brandBlurbs={brandBlurbs}
                setCopied={setCopied}
                accessLevel={sectionAccess['overview']}
                visibleSections={['metrics', 'ai-summary']}
              />
              <SentimentTab visibleSections={['sentiment-distribution']} />
              <SentimentTab visibleSections={['sentiment-by-platform']} />
              <OverviewTab
                aiSummaryExpanded={aiSummaryExpanded}
                setAiSummaryExpanded={setAiSummaryExpanded}
                showSentimentColors={showSentimentColors}
                setShowSentimentColors={setShowSentimentColors}
                chartTab={chartTab}
                setChartTab={setChartTab}

                brandBlurbs={brandBlurbs}
                setCopied={setCopied}
                accessLevel={sectionAccess['overview']}
                visibleSections={['framing-evidence', 'prompt-breakdown']}
              />
              <SentimentTab visibleSections={['sentiment-by-question']} />
              <OverviewTab
                aiSummaryExpanded={aiSummaryExpanded}
                setAiSummaryExpanded={setAiSummaryExpanded}
                showSentimentColors={showSentimentColors}
                setShowSentimentColors={setShowSentimentColors}
                chartTab={chartTab}
                setChartTab={setChartTab}

                brandBlurbs={brandBlurbs}
                setCopied={setCopied}
                accessLevel={sectionAccess['overview']}
                visibleSections={['all-results']}
              />
            </div>
          ) : (
            <OverviewTab
              aiSummaryExpanded={aiSummaryExpanded}
              setAiSummaryExpanded={setAiSummaryExpanded}
              showSentimentColors={showSentimentColors}
              setShowSentimentColors={setShowSentimentColors}
              chartTab={chartTab}
              setChartTab={setChartTab}

              brandBlurbs={brandBlurbs}
              setCopied={setCopied}
              accessLevel={sectionAccess['overview']}
            />
          )
        )}
        {activeTab === 'reference' && (
          <PaywallOverlay locked={sectionAccess['reference'] === 'locked'}>
            {sectionAccess['reference'] === 'locked' ? (
              <PlaceholderTable rows={5} columns={6} />
            ) : (
              <ReferenceTab
                totalCost={totalCost}
                promptCost={storeDataFinal.promptCost}
                analysisCost={storeDataFinal.analysisCost}
                frontendInsightsCost={frontendInsightsCost}
                chartTab={chartTab}
                setChartTab={setChartTab}
                showSentimentColors={showSentimentColors}
                setShowSentimentColors={setShowSentimentColors}
                aiSummaryExpanded={aiSummaryExpanded}
                setAiSummaryExpanded={setAiSummaryExpanded}
              />
            )}
          </PaywallOverlay>
        )}
        {activeTab === 'competitive' && (
          <PaywallOverlay locked={sectionAccess['competitive'] === 'locked'}>
            {sectionAccess['competitive'] === 'locked' ? (
              <PlaceholderChart type="heatmap" height={300} />
            ) : (
              <CompetitiveTab
                setSelectedResultHighlight={setSelectedResultHighlight}
                setHeatmapResultsList={setHeatmapResultsList}
              />
            )}
          </PaywallOverlay>
        )}
        {activeTab === 'industry-overview' && (
          <div className="space-y-8">
            {/* Metrics + AI Summary from Overview tab */}
            <OverviewTab
              aiSummaryExpanded={aiSummaryExpanded}
              setAiSummaryExpanded={setAiSummaryExpanded}
              showSentimentColors={showSentimentColors}
              setShowSentimentColors={setShowSentimentColors}
              chartTab={chartTab}
              setChartTab={setChartTab}

              brandBlurbs={brandBlurbs}
              setCopied={setCopied}
              accessLevel={sectionAccess['overview']}
              visibleSections={['metrics', 'ai-summary']}
            />
            {/* Competitive sections */}
            <CompetitiveTab
              setSelectedResultHighlight={setSelectedResultHighlight}
              setHeatmapResultsList={setHeatmapResultsList}
              visibleSections={['visibility-reports', 'breakdown', 'positioning', 'matrix', 'cooccurrence']}
              forceCooccurrenceView="pairs"
            />
            {/* Brand Visibility by Platform from Overview tab */}
            <OverviewTab
              aiSummaryExpanded={aiSummaryExpanded}
              setAiSummaryExpanded={setAiSummaryExpanded}
              showSentimentColors={showSentimentColors}
              setShowSentimentColors={setShowSentimentColors}
              chartTab={chartTab}
              setChartTab={setChartTab}

              brandBlurbs={brandBlurbs}
              setCopied={setCopied}
              accessLevel={sectionAccess['overview']}
              visibleSections={['by-platform']}
            />
            {/* All Results from Overview tab */}
            <OverviewTab
              aiSummaryExpanded={aiSummaryExpanded}
              setAiSummaryExpanded={setAiSummaryExpanded}
              showSentimentColors={showSentimentColors}
              setShowSentimentColors={setShowSentimentColors}
              chartTab={chartTab}
              setChartTab={setChartTab}

              brandBlurbs={brandBlurbs}
              setCopied={setCopied}
              accessLevel={sectionAccess['overview']}
              visibleSections={['all-results']}
            />
          </div>
        )}
        {activeTab === 'sentiment' && (
          <PaywallOverlay locked={sectionAccess['sentiment'] === 'locked'}>
            {sectionAccess['sentiment'] === 'locked' ? (
              <PlaceholderChart type="bar" height={300} />
            ) : (
              <SentimentTab />
            )}
          </PaywallOverlay>
        )}
        {activeTab === 'sources' && (
          <PaywallOverlay locked={sectionAccess['sources'] === 'locked'}>
            {sectionAccess['sources'] === 'locked' ? (
              <PlaceholderTable rows={4} columns={3} />
            ) : (
              <SourcesTab />
            )}
          </PaywallOverlay>
        )}
        {activeTab === 'recommendations' && (
          <PaywallOverlay locked={sectionAccess['recommendations'] === 'locked'}>
            {sectionAccess['recommendations'] === 'locked' ? (
              <PlaceholderChart type="bar" height={250} />
            ) : (
              <RecommendationsTab />
            )}
          </PaywallOverlay>
        )}
        {activeTab === 'reports' && (
          <PaywallOverlay locked={sectionAccess['reports'] === 'locked'}>
            {sectionAccess['reports'] === 'locked' ? (
              <PlaceholderTable rows={3} columns={4} />
            ) : (
              <ReportsTab runStatus={runStatus ?? null} />
            )}
          </PaywallOverlay>
        )}
        {activeTab === 'site-audit' && <SiteAuditTab brand={runStatus?.brand || ''} />}
        {activeTab === 'chatgpt-ads' && (
          <PaywallOverlay locked={sectionAccess['chatgpt-ads'] === 'locked'}>
            <ChatGPTAdsTab />
          </PaywallOverlay>
        )}
        </ResultsProvider>
          </div>{/* End flex-1 content */}
        </div>{/* End flex container */}
      </div>

      {/* Snippet Detail Modal */}
      {snippetDetailModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSnippetDetailModal(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <span className="flex-shrink-0">{getProviderIcon(snippetDetailModal.provider)}</span>
                  {getProviderLabel(snippetDetailModal.provider)}
                </h2>
                <p className="text-sm text-gray-500">Full Response</p>
              </div>
              <button
                onClick={() => setSnippetDetailModal(null)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-4 border-b border-gray-100 bg-gray-50">
              <p className="text-xs text-gray-500 mb-1">Question</p>
              <p className="text-sm text-gray-900">{snippetDetailModal.prompt}</p>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="flex flex-wrap gap-2 mb-4">
                <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg bg-blue-50 text-blue-700">
                  Highlighting: {snippetDetailModal.brand}
                </span>
              </div>
              <div className="text-sm text-gray-700 [&_a]:text-gray-900 [&_a]:underline [&_a]:hover:text-gray-700 [&_p]:mb-3 [&_p]:leading-relaxed [&_ul]:mb-3 [&_ul]:pl-5 [&_ul]:list-disc [&_ol]:mb-3 [&_ol]:pl-5 [&_ol]:list-decimal [&_li]:mb-1 [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mb-2 [&_h3]:font-semibold [&_h3]:mb-2 [&_strong]:font-semibold [&_table]:w-full [&_table]:mb-3 [&_table]:border-collapse [&_table]:text-xs [&_th]:border [&_th]:border-gray-300 [&_th]:bg-gray-100 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold [&_td]:border [&_td]:border-gray-300 [&_td]:px-2 [&_td]:py-1">
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
                    p: ({ children }) => {
                      const text = String(children);
                      const brand = snippetDetailModal.brand;
                      const brandRegex = new RegExp(brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
                      if (brandRegex.test(text)) {
                        return (
                          <p className="mb-3 leading-relaxed bg-yellow-50 border-l-4 border-yellow-400 pl-3 py-1 -ml-3">
                            {children}
                          </p>
                        );
                      }
                      return <p className="mb-3 leading-relaxed">{children}</p>;
                    },
                    li: ({ children }) => {
                      const text = String(children);
                      const brand = snippetDetailModal.brand;
                      const brandRegex = new RegExp(brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
                      if (brandRegex.test(text)) {
                        return (
                          <li className="mb-1 bg-yellow-50 border-l-4 border-yellow-400 pl-2 -ml-2 py-0.5">
                            {children}
                          </li>
                        );
                      }
                      return <li className="mb-1">{children}</li>;
                    },
                  }}
                >
                  {formatResponseText(snippetDetailModal.responseText)}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Result Detail Modal */}
      {selectedResult && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { setSelectedResult(null); setSelectedResultHighlight(null); }}>
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <span className="flex-shrink-0">{getProviderIcon(selectedResult.provider)}</span>
                  {getProviderLabel(selectedResult.provider)}
                </h2>
                {selectedResultHighlight && (
                  <p className="text-sm font-medium text-gray-900 mt-1 flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-yellow-400 flex-shrink-0"></span>
                    Highlighting {selectedResultHighlight.domain && selectedResultHighlight.brand
                      ? <>references to <span className="font-semibold">{selectedResultHighlight.domain}</span> + <span className="font-semibold">{selectedResultHighlight.brand}</span></>
                      : selectedResultHighlight.domain
                      ? <>references to <span className="font-semibold">{selectedResultHighlight.domain}</span></>
                      : <>mentions of <span className="font-semibold">{selectedResultHighlight.brand}</span></>
                    }
                  </p>
                )}
              </div>
              <button
                onClick={() => { setSelectedResult(null); setSelectedResultHighlight(null); }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-4 border-b border-gray-100 bg-gray-50">
              <p className="text-xs text-gray-500 mb-1">Question</p>
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
                      <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg ${selectedResult.brand_mentioned ? 'bg-gray-100 text-gray-900' : 'bg-gray-100 text-gray-600'}`}>
                        {selectedResult.brand_mentioned ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                        {runStatus?.brand} {selectedResult.brand_mentioned ? 'Mentioned' : 'Not Mentioned'}
                      </span>
                    )}
                    {(() => {
                      const detectedBrands = selectedResult.all_brands_mentioned?.length ? selectedResult.all_brands_mentioned.filter(b => b.toLowerCase() !== (runStatus?.brand || '').toLowerCase()) : selectedResult.competitors_mentioned || [];
                      return detectedBrands.length > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-lg">
                        {detectedBrands.length} competitor{detectedBrands.length !== 1 ? 's' : ''} mentioned
                      </span>
                      ) : null;
                    })()}
                    {selectedResult.response_type && (
                      <span className="inline-flex items-center px-2 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg capitalize">
                        {selectedResult.response_type}
                      </span>
                    )}
                    {selectedResult.brand_sentiment && selectedResult.brand_sentiment !== 'not_mentioned' && (
                      <span
                        title={`Sentiment: how this AI response characterizes ${runStatus?.brand || 'the brand'} (based on this individual response, not an average)`}
                        className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-lg cursor-help ${
                        selectedResult.brand_sentiment === 'strong_endorsement' ? 'bg-emerald-50 text-emerald-700' :
                        selectedResult.brand_sentiment === 'positive_endorsement' ? 'bg-green-50 text-green-700' :
                        selectedResult.brand_sentiment === 'neutral_mention' ? 'bg-blue-100 text-blue-800' :
                        selectedResult.brand_sentiment === 'conditional' ? 'bg-yellow-100 text-yellow-800' :
                        selectedResult.brand_sentiment === 'negative_comparison' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {selectedResult.brand_sentiment === 'strong_endorsement' ? 'Strong' :
                         selectedResult.brand_sentiment === 'positive_endorsement' ? 'Positive' :
                         selectedResult.brand_sentiment === 'neutral_mention' ? 'Neutral' :
                         selectedResult.brand_sentiment === 'conditional' ? 'Conditional' :
                         selectedResult.brand_sentiment === 'negative_comparison' ? 'Negative' :
                         'Unknown'} Sentiment
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-700 [&_a]:text-gray-900 [&_a]:underline [&_a]:hover:text-gray-700 [&_p]:mb-3 [&_p]:leading-relaxed [&_ul]:mb-3 [&_ul]:pl-5 [&_ul]:list-disc [&_ol]:mb-3 [&_ol]:pl-5 [&_ol]:list-decimal [&_li]:mb-1 [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mb-2 [&_h3]:font-semibold [&_h3]:mb-2 [&_strong]:font-semibold [&_table]:w-full [&_table]:mb-3 [&_table]:border-collapse [&_table]:text-xs [&_th]:border [&_th]:border-gray-300 [&_th]:bg-gray-100 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold [&_td]:border [&_td]:border-gray-300 [&_td]:px-2 [&_td]:py-1">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        a: ({ href, children }) => {
                          if (selectedResultHighlight?.domain) {
                            const text = typeof children === 'string' ? children :
                              (Array.isArray(children) ? children.map(c => typeof c === 'string' ? c : '').join('') : '');
                            const linkText = (text + ' ' + (href || '')).toLowerCase();
                            const domainBase = selectedResultHighlight.domain.toLowerCase().replace('.com', '').replace('.org', '').replace('.net', '');
                            if (linkText.includes(domainBase)) {
                              return (
                                <a
                                  href={href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="bg-yellow-200 text-yellow-800 px-1 rounded font-medium hover:bg-yellow-300"
                                >
                                  {children}
                                </a>
                              );
                            }
                          }
                          return (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-gray-900 hover:underline"
                            >
                              {children}
                            </a>
                          );
                        },
                        table: ({ children }) => (
                          <div className="overflow-x-auto mb-3">
                            <table className="min-w-full">{children}</table>
                          </div>
                        ),
                        p: ({ children, node }) => {
                          if (selectedResultHighlight) {
                            const domainBase = selectedResultHighlight.domain?.toLowerCase().replace('.com', '').replace('.org', '').replace('.net', '');

                            const extractTextAndHrefs = (n: any): string => {
                              if (!n) return '';
                              if (typeof n === 'string') return n;
                              if (n.type === 'text') return n.value || '';
                              if (n.type === 'link' || n.type === 'element' && n.tagName === 'a') {
                                const href = n.properties?.href || n.url || '';
                                const childText = n.children?.map(extractTextAndHrefs).join('') || '';
                                return childText + ' ' + href;
                              }
                              if (n.children) return n.children.map(extractTextAndHrefs).join('');
                              return '';
                            };

                            const fullText = extractTextAndHrefs(node).toLowerCase();
                            const containsDomain = domainBase && fullText.includes(domainBase);
                            const containsBrand = fullText.includes(selectedResultHighlight.brand.toLowerCase());

                            let containsSourceKeywords = false;
                            if (selectedResultHighlight.domain && selectedResult?.sources) {
                              const matchingSources = selectedResult.sources.filter((s: { url: string; title?: string }) => {
                                const sourceDomain = getDomain(s.url).toLowerCase();
                                return sourceDomain.includes(domainBase || '') || (domainBase && domainBase.includes(sourceDomain.replace('.com', '').replace('.org', '').replace('.net', '')));
                              });
                              const commonWords = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'has', 'her', 'was', 'one', 'our', 'out', 'with', 'from', 'this', 'that', 'what', 'how', 'why', 'best', 'top', 'new']);
                              const keywords: string[] = [];
                              matchingSources.forEach((s: { url: string; title?: string }) => {
                                if (s.title) {
                                  const words = s.title.toLowerCase().split(/[\s\-\u2013\u2014:,.|()[\]]+/).filter(w => w.length >= 4 && !commonWords.has(w));
                                  keywords.push(...words);
                                }
                              });
                              if (keywords.length > 0) {
                                const matchCount = keywords.filter(kw => fullText.includes(kw)).length;
                                containsSourceKeywords = matchCount >= 2 || (keywords.length === 1 && matchCount === 1);
                              }
                            }

                            if (containsDomain || containsSourceKeywords) {
                              return <p className="bg-yellow-100 rounded px-2 py-1 -mx-2 border-l-4 border-yellow-400">{children}</p>;
                            } else if (containsBrand) {
                              return <p className="bg-yellow-100 rounded px-2 py-1 -mx-2 border-l-4 border-yellow-400">{children}</p>;
                            }
                          }
                          return <p>{children}</p>;
                        },
                        li: ({ children, node }) => {
                          if (selectedResultHighlight) {
                            const domainBase = selectedResultHighlight.domain?.toLowerCase().replace('.com', '').replace('.org', '').replace('.net', '');

                            const extractTextAndHrefs = (n: any): string => {
                              if (!n) return '';
                              if (typeof n === 'string') return n;
                              if (n.type === 'text') return n.value || '';
                              if (n.type === 'link' || n.type === 'element' && n.tagName === 'a') {
                                const href = n.properties?.href || n.url || '';
                                const childText = n.children?.map(extractTextAndHrefs).join('') || '';
                                return childText + ' ' + href;
                              }
                              if (n.children) return n.children.map(extractTextAndHrefs).join('');
                              return '';
                            };

                            const fullText = extractTextAndHrefs(node).toLowerCase();
                            const containsDomain = domainBase && fullText.includes(domainBase);
                            const containsBrand = fullText.includes(selectedResultHighlight.brand.toLowerCase());

                            let containsSourceKeywords = false;
                            if (selectedResultHighlight.domain && selectedResult?.sources) {
                              const matchingSources = selectedResult.sources.filter((s: { url: string; title?: string }) => {
                                const sourceDomain = getDomain(s.url).toLowerCase();
                                return sourceDomain.includes(domainBase || '') || (domainBase && domainBase.includes(sourceDomain.replace('.com', '').replace('.org', '').replace('.net', '')));
                              });
                              const commonWords = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'has', 'her', 'was', 'one', 'our', 'out', 'with', 'from', 'this', 'that', 'what', 'how', 'why', 'best', 'top', 'new']);
                              const keywords: string[] = [];
                              matchingSources.forEach((s: { url: string; title?: string }) => {
                                if (s.title) {
                                  const words = s.title.toLowerCase().split(/[\s\-\u2013\u2014:,.|()[\]]+/).filter(w => w.length >= 4 && !commonWords.has(w));
                                  keywords.push(...words);
                                }
                              });
                              if (keywords.length > 0) {
                                const matchCount = keywords.filter(kw => fullText.includes(kw)).length;
                                containsSourceKeywords = matchCount >= 2 || (keywords.length === 1 && matchCount === 1);
                              }
                            }

                            if (containsDomain || containsSourceKeywords) {
                              return <li className="bg-yellow-100 rounded px-2 py-0.5 -mx-2 border-l-4 border-yellow-400">{children}</li>;
                            } else if (containsBrand) {
                              return <li className="bg-yellow-100 rounded px-2 py-0.5 -mx-2 border-l-4 border-yellow-400">{children}</li>;
                            }
                          }
                          return <li>{children}</li>;
                        },
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
                          const isHighlightedDomain = selectedResultHighlight?.domain &&
                            domain.toLowerCase().includes(selectedResultHighlight.domain.toLowerCase());
                          return (
                            <a
                              key={idx}
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`flex items-center gap-2 text-sm hover:underline ${
                                isHighlightedDomain
                                  ? 'text-yellow-700 bg-yellow-100 px-2 py-1 rounded -mx-2 border-l-4 border-yellow-400'
                                  : 'text-gray-900 hover:text-gray-700'
                              }`}
                            >
                              <ExternalLink className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate">
                                <span className="font-medium">{domain}</span>
                                {subtitle && <span className={isHighlightedDomain ? 'text-yellow-600' : 'text-gray-500'}> · {subtitle}</span>}
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

      {/* Heatmap Results List Modal */}
      {heatmapResultsList && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setHeatmapResultsList(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Responses citing {heatmapResultsList.domain}
                </h2>
                <p className="text-sm text-gray-500">
                  {heatmapResultsList.results.length} response{heatmapResultsList.results.length !== 1 ? 's' : ''} mentioning {heatmapResultsList.brand}
                  {heatmapShowSentiment && (() => {
                    const sentimentInfo = brandSourceHeatmap.sentimentData[heatmapResultsList.domain]?.[heatmapResultsList.brand];
                    if (sentimentInfo && sentimentInfo.total > 0) {
                      const avgSentiment = sentimentInfo.avg;
                      return (
                        <span className="ml-2">
                          — {getSentimentLabelFromScore(avgSentiment)} ({heatmapResultsList.results.length} citation{heatmapResultsList.results.length !== 1 ? 's' : ''})
                        </span>
                      );
                    }
                    return null;
                  })()}
                </p>
              </div>
              <button
                onClick={() => setHeatmapResultsList(null)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {heatmapResultsList.results.map((result, idx) => (
                <div
                  key={result.id}
                  className="p-3 border border-gray-200 rounded-lg hover:border-gray-900 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => {
                    setSelectedResult(result);
                    setSelectedResultHighlight({ brand: heatmapResultsList.brand, domain: heatmapResultsList.domain });
                    setHeatmapResultsList(null);
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-400">#{idx + 1}</span>
                      <span className="flex-shrink-0">{getProviderIcon(result.provider)}</span>
                      <span className="text-sm font-medium text-gray-900">{getProviderLabel(result.provider)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {result.brand_sentiment && result.brand_sentiment !== 'not_mentioned' && (
                        <span className={`px-2 py-0.5 text-xs rounded ${
                          result.brand_sentiment === 'strong_endorsement' ? 'bg-emerald-50 text-emerald-700' :
                          result.brand_sentiment === 'positive_endorsement' ? 'bg-green-50 text-green-700' :
                          result.brand_sentiment === 'neutral_mention' ? 'bg-blue-100 text-blue-700' :
                          result.brand_sentiment === 'conditional' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {result.brand_sentiment === 'strong_endorsement' ? 'Strong' :
                           result.brand_sentiment === 'positive_endorsement' ? 'Positive' :
                           result.brand_sentiment === 'neutral_mention' ? 'Neutral' :
                           result.brand_sentiment === 'conditional' ? 'Conditional' : 'Negative'}
                        </span>
                      )}
                      <ExternalLink className="w-4 h-4 text-gray-400" />
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 mb-2 line-clamp-1">{result.prompt}</p>
                  <p className="text-xs text-gray-500 line-clamp-2">
                    {stripMarkdown(result.response_text || '').substring(0, 200)}...
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modify Query Modal */}
      {showModifyModal && runStatus && (
        <ModifyQueryModal
          runStatus={runStatus}
          onClose={() => setShowModifyModal(false)}
          onSuccess={(childRunId) => {
            setShowModifyModal(false);
            router.push(`/run/${childRunId}`);
          }}
        />
      )}
    </main>
  );
}
