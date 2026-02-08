'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { UserButton, useAuth } from '@clerk/nextjs';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, ZAxis, BarChart, Bar, ReferenceArea, ReferenceLine, ComposedChart, Line, ErrorBar, Customized } from 'recharts';
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
  // Category icons
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
import { useRunStatus, useAISummary, useSiteAudits } from '@/hooks/useApi';
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

type FilterType = 'all' | 'mentioned' | 'not_mentioned';
type TabType = 'overview' | 'reference' | 'competitive' | 'sentiment' | 'sources' | 'recommendations' | 'reports' | 'site-audit';

const TABS: { id: TabType; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Visibility', icon: <LayoutGrid className="w-4 h-4" /> },
  { id: 'competitive', label: 'Competitive Landscape', icon: <TrendingUp className="w-4 h-4" /> },
  { id: 'sentiment', label: 'Sentiment & Framing', icon: <MessageSquare className="w-4 h-4" /> },
  { id: 'sources', label: 'Sources', icon: <Globe className="w-4 h-4" /> },
  { id: 'recommendations', label: 'Recommendations', icon: <Lightbulb className="w-4 h-4" /> },
  { id: 'site-audit', label: 'Site Audit', icon: <Search className="w-4 h-4" /> },
  { id: 'reports', label: 'Automated Reports', icon: <FileBarChart className="w-4 h-4" /> },
  { id: 'reference', label: 'Reference', icon: <FileText className="w-4 h-4" /> },
];

// Category colors for source types
const CATEGORY_COLORS: Record<string, string> = {
  'Social Media': '#111827',      // Primary dark
  'Video': '#374151',             // Gray-700
  'Reference': '#1f2937',         // Gray-800
  'News & Media': '#5BA3C0',      // Light blue
  'E-commerce': '#6b7280',        // Gray-500
  'Reviews': '#7FBCD4',           // Sky blue
  'Forums & Q&A': '#4b5563',      // Gray-600
  'Government': '#4A90A4',        // Teal blue
  'Blogs': '#9ca3af',             // Gray-400
  'Travel': '#6BA3A0',            // Teal green
  'Finance': '#5B8FA8',           // Steel blue
  'Other': '#d1d5db'              // Gray-300
};

// Helper to extract summary from potentially JSON-formatted text
// This handles cases where the backend fallback returns raw JSON as the summary
const extractSummaryText = (summary: string): string => {
  if (!summary) return '';

  const trimmed = summary.trim();

  // Check if the summary looks like JSON (starts with { and contains "summary":)
  if (trimmed.startsWith('{') && trimmed.includes('"summary"')) {
    // First try standard JSON parse
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.summary && typeof parsed.summary === 'string') {
        return parsed.summary;
      }
    } catch {
      // JSON parsing failed - continue to fallback extraction
    }

    // Fallback: Extract content after "summary": " using string manipulation
    // This handles malformed/truncated JSON
    const summaryKeyIndex = trimmed.indexOf('"summary"');
    if (summaryKeyIndex !== -1) {
      // Find the opening quote of the value
      const colonIndex = trimmed.indexOf(':', summaryKeyIndex);
      if (colonIndex !== -1) {
        // Find the first quote after the colon
        const valueStartQuote = trimmed.indexOf('"', colonIndex);
        if (valueStartQuote !== -1) {
          // Extract everything after the opening quote
          let content = trimmed.slice(valueStartQuote + 1);

          // Try to find the end of the summary value
          // Look for various patterns that indicate the end
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

          // Clean up: unescape JSON string escapes
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

  // If text still looks like raw JSON, return empty
  if (text.trim().startsWith('{') || text.trim().startsWith('"recommendations"') || text.trim().startsWith('"title"')) {
    return '';
  }

  // Look for "Actionable takeaway" section (case insensitive)
  // It's typically the last paragraph, starting with **Actionable takeaway**
  const patterns = [
    /\*\*Actionable takeaway[:\s]*\*\*\s*([\s\S]*?)(?=\n\n\*\*|$)/i,
    /Actionable takeaway[:\s]*([\s\S]*?)(?=\n\n\*\*|$)/i,
    /\*\*Actionable[:\s]*\*\*\s*([\s\S]*?)(?=\n\n\*\*|$)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const extracted = match[1].trim();
      // Make sure we didn't extract JSON
      if (!extracted.startsWith('{') && !extracted.startsWith('[') && !extracted.includes('"recommendations"')) {
        return extracted;
      }
    }
  }

  // Fallback: return the last non-JSON paragraph if no explicit actionable takeaway found
  const paragraphs = text.split(/\n\n+/).filter(p => {
    const trimmed = p.trim();
    // Skip JSON-like content
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

  // Remove "Actionable takeaway" section (case insensitive)
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

// Categorize a domain into a source type
const categorizeDomain = (domain: string): string => {
  const d = domain.toLowerCase();

  // Social Media
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

  // Video
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

  // Reference
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

  // News & Media
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

  // E-commerce
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

  // Reviews
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

  // Forums & Q&A
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

  // Government
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

  // Blogs
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

// Get icon component for a category - sleek, minimal icons
const getCategoryIcon = (category: string, className: string = "w-3.5 h-3.5") => {
  const color = CATEGORY_COLORS[category] || CATEGORY_COLORS['Other'];
  const props = { className, style: { color } };
  switch (category) {
    case 'Social Media': return <AtSign {...props} />;
    case 'Video': return <Film {...props} />;
    case 'Reference': return <FileText {...props} />;
    case 'News & Media': return <Rss {...props} />;
    case 'E-commerce': return <Tag {...props} />;
    case 'Reviews': return <Award {...props} />;
    case 'Forums & Q&A': return <MessagesSquare {...props} />;
    case 'Government': return <Building2 {...props} />;
    case 'Blogs': return <Feather {...props} />;
    case 'Travel': return <MapPin {...props} />;
    case 'Finance': return <TrendingUp {...props} />;
    default: return <Circle {...props} />;
  }
};

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
  const [expandedCompetitorRows, setExpandedCompetitorRows] = useState<Set<string>>(new Set());
  const [expandedLLMCards, setExpandedLLMCards] = useState<Set<string>>(new Set());
  // Response-Level Sentiment filters
  const [responseSentimentFilter, setResponseSentimentFilter] = useState<string>('all');
  const [responseLlmFilter, setResponseLlmFilter] = useState<string>('all');
  const [expandedResponseRows, setExpandedResponseRows] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [aiSummaryExpanded, setAiSummaryExpanded] = useState(false);
  const [selectedResult, setSelectedResult] = useState<Result | null>(null);
  const [selectedResultHighlight, setSelectedResultHighlight] = useState<{ brand: string; domain?: string } | null>(null);
  const [heatmapResultsList, setHeatmapResultsList] = useState<{ results: Result[]; domain: string; brand: string } | null>(null);
  const [chartTab, setChartTab] = useState<'allAnswers' | 'performanceRange' | 'shareOfVoice'>('allAnswers');
  const [showSentimentColors, setShowSentimentColors] = useState(true);
  const [tableSortColumn, setTableSortColumn] = useState<'prompt' | 'llm' | 'position' | 'mentioned' | 'sentiment' | 'competitors'>('prompt');
  const [tableSortDirection, setTableSortDirection] = useState<'asc' | 'desc'>('asc');
  const [sentimentProviderBrandFilter, setSentimentProviderBrandFilter] = useState<string>('');
  const [sentimentProviderCitationFilter, setSentimentProviderCitationFilter] = useState<string>('all');
  const [sentimentByPromptBrandFilter, setSentimentByPromptBrandFilter] = useState<string>('');
  const [sentimentByPromptSourceFilter, setSentimentByPromptSourceFilter] = useState<string>('all');
  const [hoveredSentimentBadge, setHoveredSentimentBadge] = useState<{ provider: string; sentiment: string } | null>(null);
  const [expandedResultRows, setExpandedResultRows] = useState<Set<string>>(new Set());
  const [brandCarouselIndex, setBrandCarouselIndex] = useState(0);
  const [showModifyModal, setShowModifyModal] = useState(false);

  const { data: runStatus, isLoading, error } = useRunStatus(runId, true);
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

  // Close sentiment badge hover popup on scroll/wheel - track scroll position
  const lastScrollY = React.useRef(0);
  const lastScrollX = React.useRef(0);
  const isPopupOpen = hoveredSentimentBadge !== null;
  const popupKey = hoveredSentimentBadge ? `${hoveredSentimentBadge.provider}-${hoveredSentimentBadge.sentiment}` : null;

  useEffect(() => {
    if (!isPopupOpen) {
      return;
    }

    // Store initial scroll position
    lastScrollY.current = window.scrollY;
    lastScrollX.current = window.scrollX;

    const handleClose = () => {
      setHoveredSentimentBadge(null);
    };

    // Check scroll position change (works for all scroll methods)
    const checkScrollPosition = () => {
      const currentY = window.scrollY;
      const currentX = window.scrollX;
      if (currentY !== lastScrollY.current || currentX !== lastScrollX.current) {
        handleClose();
      }
    };

    // Use requestAnimationFrame to check scroll position
    let rafId: number;
    let isRunning = true;
    const checkLoop = () => {
      if (!isRunning) return;
      checkScrollPosition();
      rafId = requestAnimationFrame(checkLoop);
    };
    rafId = requestAnimationFrame(checkLoop);

    // Also listen for wheel as backup (for when scroll hasn't happened yet)
    const handleWheel = (e: WheelEvent) => {
      // Check if the wheel event is outside the popup
      const popup = document.querySelector('[data-sentiment-popup]');
      if (popup && !popup.contains(e.target as Node)) {
        handleClose();
      }
    };
    document.addEventListener('wheel', handleWheel, { passive: true });

    return () => {
      isRunning = false;
      cancelAnimationFrame(rafId);
      document.removeEventListener('wheel', handleWheel);
    };
  }, [isPopupOpen, popupKey]);

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
    const brandLower = (selectedBrand || '').toLowerCase();
    const allBrands: string[] = result.all_brands_mentioned && result.all_brands_mentioned.length > 0
      ? result.all_brands_mentioned.filter((b): b is string => typeof b === 'string')
      : [runStatus.brand, ...(result.competitors_mentioned || [])].filter((b): b is string => typeof b === 'string');

    // First try exact match
    let foundIndex = allBrands.findIndex(b => b.toLowerCase() === brandLower);

    // If not found, try partial match (brand contains item or item contains brand)
    if (foundIndex === -1) {
      foundIndex = allBrands.findIndex(b =>
        b.toLowerCase().includes(brandLower) || brandLower.includes(b.toLowerCase())
      );
    }

    // If still not found but brand_mentioned is true, find position by text search
    if (foundIndex === -1 && result.brand_mentioned && result.response_text) {
      const brandPos = result.response_text.toLowerCase().indexOf(brandLower);
      if (brandPos >= 0) {
        let brandsBeforeCount = 0;
        for (const b of allBrands) {
          const bPos = result.response_text.toLowerCase().indexOf(b.toLowerCase());
          if (bPos >= 0 && bPos < brandPos) {
            brandsBeforeCount++;
          }
        }
        return brandsBeforeCount + 1;
      }
      // Brand is mentioned but we can't find its position - place it after all known brands
      return allBrands.length + 1;
    }

    return foundIndex >= 0 ? foundIndex + 1 : null;
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
    const accentColor = '#111827'; // Dark accent for selected brand
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
          const allBrands: string[] = result.all_brands_mentioned && result.all_brands_mentioned.length > 0
            ? result.all_brands_mentioned.filter((b): b is string => typeof b === 'string')
            : [runStatus.brand, ...(result.competitors_mentioned || [])].filter((b): b is string => typeof b === 'string');

          // Find position of selected brand in the ordered list
          // First try exact match
          let foundIndex = allBrands.findIndex(b => b.toLowerCase() === brandLower);

          // If not found, try partial match
          if (foundIndex === -1) {
            foundIndex = allBrands.findIndex(b =>
              b.toLowerCase().includes(brandLower) || brandLower.includes(b.toLowerCase())
            );
          }

          // If still not found, find position by text search
          let rank = foundIndex + 1;
          if (foundIndex === -1) {
            const brandPos = result.response_text.toLowerCase().indexOf(brandLower);
            if (brandPos >= 0) {
              let brandsBeforeCount = 0;
              for (const b of allBrands) {
                const bPos = result.response_text.toLowerCase().indexOf(b.toLowerCase());
                if (bPos >= 0 && bPos < brandPos) {
                  brandsBeforeCount++;
                }
              }
              rank = brandsBeforeCount + 1;
            } else {
              rank = allBrands.length + 1;
            }
          }

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

  // State for prompt breakdown LLM filter
  const [promptBreakdownLlmFilter, setPromptBreakdownLlmFilter] = useState<string>('all');

  // Calculate prompt breakdown stats for the searched brand
  const promptBreakdownStats = useMemo(() => {
    if (!runStatus) return [];

    const results = globallyFilteredResults.filter((r: Result) => {
      if (r.error) return false;
      if (promptBreakdownLlmFilter !== 'all' && r.provider !== promptBreakdownLlmFilter) return false;
      return true;
    });
    const searchedBrand = runStatus.brand;

    // Group results by prompt
    const promptGroups: Record<string, Result[]> = {};
    for (const result of results) {
      if (!promptGroups[result.prompt]) {
        promptGroups[result.prompt] = [];
      }
      promptGroups[result.prompt].push(result);
    }

    const sentimentScoreMap: Record<string, number> = {
      'strong_endorsement': 5,
      'positive_endorsement': 4,
      'neutral_mention': 3,
      'conditional': 2,
      'negative_comparison': 1,
      'not_mentioned': 0,
    };

    const promptStats = Object.entries(promptGroups).map(([prompt, promptResults]) => {
      const total = promptResults.length;
      const mentioned = promptResults.filter(r => r.brand_mentioned).length;
      const visibilityScore = total > 0 ? (mentioned / total) * 100 : 0;

      // Share of Voice: brand mentions / total brand mentions (including competitors)
      let totalBrandMentions = 0;
      let searchedBrandMentions = 0;
      promptResults.forEach(r => {
        if (r.brand_mentioned) {
          searchedBrandMentions++;
          totalBrandMentions++;
        }
        if (r.competitors_mentioned) {
          totalBrandMentions += r.competitors_mentioned.length;
        }
      });
      const shareOfVoice = totalBrandMentions > 0 ? (searchedBrandMentions / totalBrandMentions) * 100 : 0;

      // First Position: how often brand appears first
      let firstPositionCount = 0;
      const ranks: number[] = [];

      promptResults.forEach(r => {
        if (!r.brand_mentioned) return;

        const allBrands: string[] = r.all_brands_mentioned && r.all_brands_mentioned.length > 0
          ? r.all_brands_mentioned.filter((b): b is string => typeof b === 'string')
          : [searchedBrand, ...(r.competitors_mentioned || [])].filter((b): b is string => typeof b === 'string');

        const brandLower = searchedBrand.toLowerCase();
        let foundIndex = allBrands.findIndex(b => b.toLowerCase() === brandLower);

        if (foundIndex === -1) {
          foundIndex = allBrands.findIndex(b =>
            b.toLowerCase().includes(brandLower) || brandLower.includes(b.toLowerCase())
          );
        }

        const rank = foundIndex >= 0 ? foundIndex + 1 : allBrands.length + 1;
        ranks.push(rank);

        if (rank === 1) {
          firstPositionCount++;
        }
      });

      const firstPositionRate = mentioned > 0 ? (firstPositionCount / mentioned) * 100 : 0;
      const avgRank = ranks.length > 0 ? ranks.reduce((a, b) => a + b, 0) / ranks.length : null;

      // Average sentiment
      const sentimentResults = promptResults.filter(r => r.brand_mentioned && r.brand_sentiment && r.brand_sentiment !== 'not_mentioned');
      const avgSentimentScore = sentimentResults.length > 0
        ? sentimentResults.reduce((sum, r) => sum + (sentimentScoreMap[r.brand_sentiment || ''] || 0), 0) / sentimentResults.length
        : null;

      return {
        prompt,
        total,
        mentioned,
        visibilityScore,
        shareOfVoice,
        firstPositionRate,
        avgRank,
        avgSentimentScore,
      };
    });

    // Sort by visibility score descending
    return promptStats.sort((a, b) => b.visibilityScore - a.visibilityScore);
  }, [runStatus, globallyFilteredResults, promptBreakdownLlmFilter]);

  // State for competitive landscape filters
  const [brandBreakdownLlmFilter, setBrandBreakdownLlmFilter] = useState<string>('all');
  const [brandBreakdownPromptFilter, setBrandBreakdownPromptFilter] = useState<string>('all');
  const [expandedBrandBreakdownRows, setExpandedBrandBreakdownRows] = useState<Set<string>>(new Set());

  // State for Brand Positioning chart filters
  const [brandPositioningLlmFilter, setBrandPositioningLlmFilter] = useState<string>('all');
  const [brandPositioningPromptFilter, setBrandPositioningPromptFilter] = useState<string>('all');

  // State for Prompt Performance Matrix filter
  const [promptMatrixLlmFilter, setPromptMatrixLlmFilter] = useState<string>('all');

  // Calculate brand breakdown stats for competitive landscape
  const brandBreakdownStats = useMemo(() => {
    if (!runStatus) return [];

    const results = globallyFilteredResults.filter((r: Result) => {
      if (r.error) return false;
      if (brandBreakdownLlmFilter !== 'all' && r.provider !== brandBreakdownLlmFilter) return false;
      if (brandBreakdownPromptFilter !== 'all' && r.prompt !== brandBreakdownPromptFilter) return false;
      return true;
    });

    const searchedBrand = runStatus.brand;

    // Get all brands: searched brand + competitors
    const allBrands = new Set<string>([searchedBrand]);
    results.forEach(r => {
      if (r.competitors_mentioned) {
        r.competitors_mentioned.forEach(c => allBrands.add(c));
      }
    });

    const sentimentScoreMap: Record<string, number> = {
      'strong_endorsement': 5,
      'positive_endorsement': 4,
      'neutral_mention': 3,
      'conditional': 2,
      'negative_comparison': 1,
      'not_mentioned': 0,
    };

    const brandStats = Array.from(allBrands).map(brand => {
      const isSearchedBrand = brand === searchedBrand;
      const total = results.length;

      // Count mentions for this brand
      const mentioned = results.filter(r => {
        if (isSearchedBrand) {
          return r.brand_mentioned;
        } else {
          return r.competitors_mentioned?.includes(brand);
        }
      }).length;

      const visibilityScore = total > 0 ? (mentioned / total) * 100 : 0;

      // Share of Voice: this brand's mentions / total brand mentions across all results
      let totalBrandMentions = 0;
      let thisBrandMentions = 0;
      results.forEach(r => {
        if (r.brand_mentioned) totalBrandMentions++;
        if (r.competitors_mentioned) totalBrandMentions += r.competitors_mentioned.length;

        if (isSearchedBrand && r.brand_mentioned) {
          thisBrandMentions++;
        } else if (!isSearchedBrand && r.competitors_mentioned?.includes(brand)) {
          thisBrandMentions++;
        }
      });
      const shareOfVoice = totalBrandMentions > 0 ? (thisBrandMentions / totalBrandMentions) * 100 : 0;

      // First Position and Avg Rank
      let firstPositionCount = 0;
      const ranks: number[] = [];

      results.forEach(r => {
        const isMentioned = isSearchedBrand ? r.brand_mentioned : r.competitors_mentioned?.includes(brand);
        if (!isMentioned) return;

        const allBrandsInResponse: string[] = r.all_brands_mentioned && r.all_brands_mentioned.length > 0
          ? r.all_brands_mentioned.filter((b): b is string => typeof b === 'string')
          : [searchedBrand, ...(r.competitors_mentioned || [])].filter((b): b is string => typeof b === 'string');

        const brandLower = brand.toLowerCase();
        let foundIndex = allBrandsInResponse.findIndex(b => b.toLowerCase() === brandLower);

        if (foundIndex === -1) {
          foundIndex = allBrandsInResponse.findIndex(b =>
            b.toLowerCase().includes(brandLower) || brandLower.includes(b.toLowerCase())
          );
        }

        const rank = foundIndex >= 0 ? foundIndex + 1 : allBrandsInResponse.length + 1;
        ranks.push(rank);

        if (rank === 1) {
          firstPositionCount++;
        }
      });

      const firstPositionRate = mentioned > 0 ? (firstPositionCount / mentioned) * 100 : 0;
      const avgRank = ranks.length > 0 ? ranks.reduce((a, b) => a + b, 0) / ranks.length : null;

      // Average sentiment
      const sentimentResults = results.filter(r => {
        if (isSearchedBrand) {
          return r.brand_mentioned && r.brand_sentiment && r.brand_sentiment !== 'not_mentioned';
        } else {
          return r.competitors_mentioned?.includes(brand) && r.competitor_sentiments?.[brand] && r.competitor_sentiments[brand] !== 'not_mentioned';
        }
      });

      let avgSentimentScore: number | null = null;
      if (sentimentResults.length > 0) {
        const sentimentSum = sentimentResults.reduce((sum, r) => {
          if (isSearchedBrand) {
            return sum + (sentimentScoreMap[r.brand_sentiment || ''] || 0);
          } else {
            return sum + (sentimentScoreMap[r.competitor_sentiments?.[brand] || ''] || 0);
          }
        }, 0);
        avgSentimentScore = sentimentSum / sentimentResults.length;
      }

      // Track per-prompt stats for this brand
      const promptStats: Record<string, { mentioned: number; total: number; sentiment: string | null }> = {};
      results.forEach(r => {
        if (!promptStats[r.prompt]) {
          promptStats[r.prompt] = { mentioned: 0, total: 0, sentiment: null };
        }
        promptStats[r.prompt].total++;

        const isMentioned = isSearchedBrand ? r.brand_mentioned : r.competitors_mentioned?.includes(brand);
        if (isMentioned) {
          promptStats[r.prompt].mentioned++;
          // Get sentiment for this prompt
          if (isSearchedBrand && r.brand_sentiment && r.brand_sentiment !== 'not_mentioned') {
            promptStats[r.prompt].sentiment = r.brand_sentiment;
          } else if (!isSearchedBrand && r.competitor_sentiments?.[brand] && r.competitor_sentiments[brand] !== 'not_mentioned') {
            promptStats[r.prompt].sentiment = r.competitor_sentiments[brand];
          }
        }
      });

      // Convert to array of prompts with stats
      const promptsWithStats = Object.entries(promptStats)
        .map(([prompt, stats]) => ({
          prompt,
          mentioned: stats.mentioned,
          total: stats.total,
          rate: stats.total > 0 ? (stats.mentioned / stats.total) * 100 : 0,
          sentiment: stats.sentiment,
        }))
        .filter(p => p.mentioned > 0) // Only include prompts where brand is mentioned
        .sort((a, b) => b.rate - a.rate);

      return {
        brand,
        isSearchedBrand,
        total,
        mentioned,
        visibilityScore,
        shareOfVoice,
        firstPositionRate,
        avgRank,
        avgSentimentScore,
        promptsWithStats,
      };
    });

    // Sort by visibility score descending
    return brandStats.sort((a, b) => b.visibilityScore - a.visibilityScore);
  }, [runStatus, globallyFilteredResults, brandBreakdownLlmFilter, brandBreakdownPromptFilter]);

  // Calculate brand positioning stats with separate filters
  const brandPositioningStats = useMemo(() => {
    if (!runStatus) return [];

    const results = globallyFilteredResults.filter((r: Result) => {
      if (r.error) return false;
      if (brandPositioningLlmFilter !== 'all' && r.provider !== brandPositioningLlmFilter) return false;
      if (brandPositioningPromptFilter !== 'all' && r.prompt !== brandPositioningPromptFilter) return false;
      return true;
    });

    const searchedBrand = runStatus.brand;

    // Get all brands: searched brand + competitors
    const allBrands = new Set<string>([searchedBrand]);
    results.forEach(r => {
      if (r.competitors_mentioned) {
        r.competitors_mentioned.forEach(c => allBrands.add(c));
      }
    });

    const sentimentScoreMap: Record<string, number> = {
      'strong_endorsement': 5,
      'positive_endorsement': 4,
      'neutral_mention': 3,
      'conditional': 2,
      'negative_comparison': 1,
      'not_mentioned': 0,
    };

    const brandStats = Array.from(allBrands).map(brand => {
      const isSearchedBrand = brand === searchedBrand;
      const total = results.length;

      // Count mentions for this brand
      const mentioned = results.filter(r => {
        if (isSearchedBrand) {
          return r.brand_mentioned;
        } else {
          return r.competitors_mentioned?.includes(brand);
        }
      }).length;

      const visibilityScore = total > 0 ? (mentioned / total) * 100 : 0;

      // Average sentiment
      const sentimentResults = results.filter(r => {
        if (isSearchedBrand) {
          return r.brand_mentioned && r.brand_sentiment && r.brand_sentiment !== 'not_mentioned';
        } else {
          return r.competitors_mentioned?.includes(brand) && r.competitor_sentiments?.[brand] && r.competitor_sentiments[brand] !== 'not_mentioned';
        }
      });

      let avgSentimentScore: number | null = null;
      if (sentimentResults.length > 0) {
        const sentimentSum = sentimentResults.reduce((sum, r) => {
          if (isSearchedBrand) {
            return sum + (sentimentScoreMap[r.brand_sentiment || ''] || 0);
          } else {
            return sum + (sentimentScoreMap[r.competitor_sentiments?.[brand] || ''] || 0);
          }
        }, 0);
        avgSentimentScore = sentimentSum / sentimentResults.length;
      }

      return {
        brand,
        isSearchedBrand,
        mentioned,
        visibilityScore,
        avgSentimentScore,
      };
    });

    // Sort by visibility score descending
    return brandStats.sort((a, b) => b.visibilityScore - a.visibilityScore);
  }, [runStatus, globallyFilteredResults, brandPositioningLlmFilter, brandPositioningPromptFilter]);

  // Prompt Performance Matrix - brands vs prompts heatmap data
  const promptPerformanceMatrix = useMemo(() => {
    if (!runStatus) return { brands: [], prompts: [], matrix: [] };

    const results = globallyFilteredResults.filter((r: Result) => {
      if (r.error) return false;
      if (promptMatrixLlmFilter !== 'all' && r.provider !== promptMatrixLlmFilter) return false;
      return true;
    });
    if (results.length === 0) return { brands: [], prompts: [], matrix: [] };

    const searchedBrand = runStatus.brand;
    const prompts = Array.from(new Set(results.map(r => r.prompt)));

    // Get all brands mentioned
    const allBrands = new Set<string>([searchedBrand]);
    results.forEach(r => {
      if (r.competitors_mentioned) {
        r.competitors_mentioned.forEach(c => allBrands.add(c));
      }
    });
    const brands = Array.from(allBrands);

    // Build matrix: for each brand and prompt, calculate visibility rate
    const matrix = brands.map(brand => {
      const isSearchedBrand = brand === searchedBrand;
      return prompts.map(prompt => {
        const promptResults = results.filter(r => r.prompt === prompt);
        const mentioned = promptResults.filter(r => {
          if (isSearchedBrand) return r.brand_mentioned;
          return r.competitors_mentioned?.includes(brand);
        }).length;
        return promptResults.length > 0 ? (mentioned / promptResults.length) * 100 : 0;
      });
    });

    return { brands, prompts, matrix };
  }, [runStatus, globallyFilteredResults, promptMatrixLlmFilter]);

  // Model Preference Analysis - which LLMs favor which brands
  const modelPreferenceData = useMemo(() => {
    if (!runStatus) return [];

    const results = globallyFilteredResults.filter((r: Result) => !r.error);
    if (results.length === 0) return [];

    const searchedBrand = runStatus.brand;
    const providers = Array.from(new Set(results.map(r => r.provider)));

    // Get top brands (searched + top competitors by mention count)
    const brandCounts: Record<string, number> = { [searchedBrand]: 0 };
    results.forEach(r => {
      if (r.brand_mentioned) brandCounts[searchedBrand]++;
      if (r.competitors_mentioned) {
        r.competitors_mentioned.forEach(c => {
          brandCounts[c] = (brandCounts[c] || 0) + 1;
        });
      }
    });
    const topBrands = Object.entries(brandCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([brand]) => brand);

    // For each provider, calculate visibility rate for each brand
    return providers.map(provider => {
      const providerResults = results.filter(r => r.provider === provider);
      const brandRates: Record<string, number> = {};

      topBrands.forEach(brand => {
        const isSearchedBrand = brand === searchedBrand;
        const mentioned = providerResults.filter(r => {
          if (isSearchedBrand) return r.brand_mentioned;
          return r.competitors_mentioned?.includes(brand);
        }).length;
        brandRates[brand] = providerResults.length > 0 ? (mentioned / providerResults.length) * 100 : 0;
      });

      return { provider, ...brandRates };
    });
  }, [runStatus, globallyFilteredResults]);

  // Brand Co-occurrence Analysis - which brands are mentioned together
  const brandCooccurrence = useMemo(() => {
    if (!runStatus) return [];

    const results = globallyFilteredResults.filter((r: Result) => !r.error);
    if (results.length === 0) return [];

    const searchedBrand = runStatus.brand;
    const cooccurrenceCounts: Record<string, { brand1: string; brand2: string; count: number }> = {};

    results.forEach(r => {
      // Get all brands mentioned in this response
      const brandsInResponse: string[] = [];
      if (r.brand_mentioned) brandsInResponse.push(searchedBrand);
      if (r.competitors_mentioned) {
        r.competitors_mentioned.forEach(c => brandsInResponse.push(c));
      }

      // Count co-occurrences
      for (let i = 0; i < brandsInResponse.length; i++) {
        for (let j = i + 1; j < brandsInResponse.length; j++) {
          const brand1 = brandsInResponse[i];
          const brand2 = brandsInResponse[j];
          const key = [brand1, brand2].sort().join('|||');

          if (!cooccurrenceCounts[key]) {
            cooccurrenceCounts[key] = { brand1, brand2, count: 0 };
          }
          cooccurrenceCounts[key].count++;
        }
      }
    });

    // Convert to array and sort by count
    return Object.values(cooccurrenceCounts)
      .map(item => ({
        brand1: item.brand1,
        brand2: item.brand2,
        count: item.count,
        percentage: (item.count / results.length) * 100,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [runStatus, globallyFilteredResults]);

  // Competitive Insights Summary - auto-generated key findings
  const competitiveInsights = useMemo(() => {
    if (!runStatus || brandBreakdownStats.length === 0) return [];

    const insights: string[] = [];
    const searchedBrand = runStatus.brand;
    const searchedBrandStats = brandBreakdownStats.find(s => s.isSearchedBrand);
    const competitors = brandBreakdownStats.filter(s => !s.isSearchedBrand);

    if (!searchedBrandStats) return [];

    // 1. Overall visibility ranking
    const visibilityRank = brandBreakdownStats.findIndex(s => s.isSearchedBrand) + 1;
    if (visibilityRank === 1) {
      insights.push(`${searchedBrand} leads in AI visibility with ${searchedBrandStats.visibilityScore.toFixed(0)}% mention rate`);
    } else if (visibilityRank <= 3) {
      const leader = brandBreakdownStats[0];
      insights.push(`${searchedBrand} ranks #${visibilityRank} in visibility (${searchedBrandStats.visibilityScore.toFixed(0)}%), behind ${leader.brand} (${leader.visibilityScore.toFixed(0)}%)`);
    } else {
      insights.push(`${searchedBrand} has low visibility at ${searchedBrandStats.visibilityScore.toFixed(0)}%, ranking #${visibilityRank} of ${brandBreakdownStats.length} brands`);
    }

    // 2. Sentiment comparison
    if (searchedBrandStats.avgSentimentScore !== null) {
      const betterSentimentCompetitors = competitors.filter(c =>
        c.avgSentimentScore !== null && c.avgSentimentScore > searchedBrandStats.avgSentimentScore!
      );
      if (betterSentimentCompetitors.length === 0) {
        insights.push(`${searchedBrand} has the most positive sentiment among all tracked brands`);
      } else if (betterSentimentCompetitors.length <= 2) {
        insights.push(`${betterSentimentCompetitors.map(c => c.brand).join(' and ')} ${betterSentimentCompetitors.length === 1 ? 'has' : 'have'} better sentiment than ${searchedBrand}`);
      }
    }

    // 3. First position analysis
    if (searchedBrandStats.firstPositionRate > 0) {
      const topPositionLeader = [...brandBreakdownStats].sort((a, b) => b.firstPositionRate - a.firstPositionRate)[0];
      if (topPositionLeader.isSearchedBrand) {
        insights.push(`${searchedBrand} wins the #1 position ${searchedBrandStats.firstPositionRate.toFixed(0)}% of the time - more than any competitor`);
      } else {
        insights.push(`${topPositionLeader.brand} leads in #1 positions (${topPositionLeader.firstPositionRate.toFixed(0)}%) vs ${searchedBrand} (${searchedBrandStats.firstPositionRate.toFixed(0)}%)`);
      }
    }

    // 4. Model preference insight
    if (modelPreferenceData.length > 0) {
      const formatModelName = (provider: string): string => {
        switch (provider) {
          case 'openai': return 'GPT-4o';
          case 'anthropic': return 'Claude';
          case 'perplexity': return 'Perplexity';
          case 'ai_overviews': return 'Google AI Overviews';
          case 'gemini': return 'Gemini';
          case 'google': return 'Gemini';
          default: return provider;
        }
      };

      let bestModel = '';
      let bestRate = 0;
      let worstModel = '';
      let worstRate = 100;

      modelPreferenceData.forEach(data => {
        const rate = (data as Record<string, string | number>)[searchedBrand] as number || 0;
        if (rate > bestRate) {
          bestRate = rate;
          bestModel = data.provider;
        }
        if (rate < worstRate) {
          worstRate = rate;
          worstModel = data.provider;
        }
      });

      if (bestModel && worstModel && bestModel !== worstModel && (bestRate - worstRate) > 10) {
        insights.push(`${searchedBrand} performs best on ${formatModelName(bestModel)} (${bestRate.toFixed(0)}%) and worst on ${formatModelName(worstModel)} (${worstRate.toFixed(0)}%)`);
      }
    }

    // 5. Co-occurrence insight
    if (brandCooccurrence.length > 0) {
      const topCooccurrence = brandCooccurrence.find(c =>
        c.brand1 === searchedBrand || c.brand2 === searchedBrand
      );
      if (topCooccurrence) {
        const otherBrand = topCooccurrence.brand1 === searchedBrand ? topCooccurrence.brand2 : topCooccurrence.brand1;
        insights.push(`${searchedBrand} is most often mentioned alongside ${otherBrand} (${topCooccurrence.count} times)`);
      }
    }

    return insights.slice(0, 5);
  }, [runStatus, brandBreakdownStats, modelPreferenceData, brandCooccurrence]);

  // State for Brand Co-occurrence view
  const [cooccurrenceView, setCooccurrenceView] = useState<'pairs' | 'venn'>('venn');

  // State for Source Gap Analysis filters
  const [sourceGapProviderFilter, setSourceGapProviderFilter] = useState<string>('all');
  const [sourceGapPromptFilter, setSourceGapPromptFilter] = useState<string>('all');

  // Source Gap Analysis - comparing brand vs competitor citation rates per source
  const sourceGapAnalysis = useMemo(() => {
    if (!runStatus) return [];

    const searchedBrand = runStatus.brand;

    // Get results with sources, optionally filtered by provider and prompt
    const resultsWithSources = globallyFilteredResults.filter(
      (r: Result) => !r.error && r.sources && r.sources.length > 0 &&
        (sourceGapProviderFilter === 'all' || r.provider === sourceGapProviderFilter) &&
        (sourceGapPromptFilter === 'all' || r.prompt === sourceGapPromptFilter)
    );

    if (resultsWithSources.length === 0) return [];

    // Helper function to extract snippet around a brand mention
    const extractSnippet = (text: string, brandName: string, contextChars: number = 80): string | null => {
      const lowerText = text.toLowerCase();
      const lowerBrand = brandName.toLowerCase();
      const index = lowerText.indexOf(lowerBrand);
      if (index === -1) return null;

      const start = Math.max(0, index - contextChars);
      const end = Math.min(text.length, index + brandName.length + contextChars);

      let snippet = text.substring(start, end);
      if (start > 0) snippet = '...' + snippet;
      if (end < text.length) snippet = snippet + '...';

      return snippet;
    };

    // Track per-source stats
    const sourceStats: Record<string, {
      domain: string;
      totalCitations: number; // Number of responses citing this source
      brandCitations: number; // Number of responses where brand is mentioned AND this source is cited
      competitorCitations: Record<string, number>; // Per-competitor citation counts
      urls: Map<string, { url: string; title: string; count: number }>; // Individual URLs
      snippets: Array<{ brand: string; snippet: string; isBrand: boolean; provider: string; prompt: string; responseText: string; resultId: string }>; // Response snippets
    }> = {};

    // Process each result
    resultsWithSources.forEach((r: Result) => {
      if (!r.sources) return;

      // Get unique domains in this response and track URLs
      const domainsInResponse = new Set<string>();
      const urlsInResponse: { domain: string; url: string; title: string }[] = [];

      r.sources.forEach((source: Source) => {
        if (!source.url) return;
        try {
          const hostname = new URL(source.url).hostname.replace(/^www\./, '');
          domainsInResponse.add(hostname);
          urlsInResponse.push({ domain: hostname, url: source.url, title: source.title || '' });
        } catch {
          // Skip invalid URLs
        }
      });

      // For each domain, track brand and competitor mentions
      domainsInResponse.forEach(domain => {
        if (!sourceStats[domain]) {
          sourceStats[domain] = {
            domain,
            totalCitations: 0,
            brandCitations: 0,
            competitorCitations: {},
            urls: new Map(),
            snippets: [],
          };
        }

        sourceStats[domain].totalCitations += 1;

        // Track URLs for this domain
        urlsInResponse
          .filter(u => u.domain === domain)
          .forEach(u => {
            const existing = sourceStats[domain].urls.get(u.url);
            if (existing) {
              existing.count += 1;
            } else {
              sourceStats[domain].urls.set(u.url, { url: u.url, title: u.title, count: 1 });
            }
          });

        // Check if searched brand is mentioned and extract snippet
        if (r.brand_mentioned && r.response_text) {
          sourceStats[domain].brandCitations += 1;
          const snippet = extractSnippet(r.response_text, searchedBrand);
          if (snippet) {
            sourceStats[domain].snippets.push({
              brand: searchedBrand,
              snippet,
              isBrand: true,
              provider: r.provider,
              prompt: r.prompt,
              responseText: r.response_text,
              resultId: r.id,
            });
          }
        }

        // Check competitors mentioned and extract snippets
        if (r.competitors_mentioned && r.response_text) {
          const responseText = r.response_text; // Capture for TypeScript narrowing
          r.competitors_mentioned.forEach(competitor => {
            if (!sourceStats[domain].competitorCitations[competitor]) {
              sourceStats[domain].competitorCitations[competitor] = 0;
            }
            sourceStats[domain].competitorCitations[competitor] += 1;

            const snippet = extractSnippet(responseText, competitor);
            if (snippet) {
              sourceStats[domain].snippets.push({
                brand: competitor,
                snippet,
                isBrand: false,
                provider: r.provider,
                prompt: r.prompt,
                responseText,
                resultId: r.id,
              });
            }
          });
        }
      });
    });

    // Convert to array with calculated metrics
    return Object.values(sourceStats)
      .filter(stat => stat.totalCitations >= 2) // Only include sources with at least 2 citations
      .map(stat => {
        const brandRate = (stat.brandCitations / stat.totalCitations) * 100;

        // Find top competitor for this source
        let topCompetitor = '';
        let topCompetitorCount = 0;
        Object.entries(stat.competitorCitations).forEach(([competitor, count]) => {
          if (count > topCompetitorCount) {
            topCompetitor = competitor;
            topCompetitorCount = count;
          }
        });

        const topCompetitorRate = stat.totalCitations > 0
          ? (topCompetitorCount / stat.totalCitations) * 100
          : 0;

        // Gap: positive means competitor is cited more, negative means brand is cited more
        const gap = topCompetitorRate - brandRate;

        // Opportunity Score: Higher when gap is large AND source is frequently cited
        // Normalize by total citations to weight more important sources higher
        const opportunityScore = gap > 0
          ? (gap / 100) * Math.log10(stat.totalCitations + 1) * 100
          : 0;

        // Convert URLs map to sorted array
        const urlDetails = Array.from(stat.urls.values())
          .sort((a, b) => b.count - a.count);

        return {
          domain: stat.domain,
          totalCitations: stat.totalCitations,
          brandRate,
          topCompetitor,
          topCompetitorRate,
          gap,
          opportunityScore,
          urls: urlDetails,
          snippets: stat.snippets,
        };
      })
      .filter(stat => stat.gap > 0) // Only show sources where competitors have an advantage
      .sort((a, b) => b.opportunityScore - a.opportunityScore);
  }, [runStatus, globallyFilteredResults, sourceGapProviderFilter, sourceGapPromptFilter]);

  // State for Source Sentiment Gap Analysis filters
  const [sourceSentimentGapProviderFilter, setSourceSentimentGapProviderFilter] = useState<string>('all');
  const [sourceSentimentGapPromptFilter, setSourceSentimentGapPromptFilter] = useState<string>('all');
  const [expandedSentimentGapSources, setExpandedSentimentGapSources] = useState<Set<string>>(new Set());
  const [sentimentComparisonBrand, setSentimentComparisonBrand] = useState<string>(''); // Empty means use searched brand

  // Source Sentiment Gap Analysis - comparing brand vs competitor sentiment per source
  const sourceSentimentGapAnalysis = useMemo(() => {
    if (!runStatus) return [];

    // Use selected brand or default to searched brand
    const comparisonBrand = sentimentComparisonBrand || runStatus.brand;
    const searchedBrand = runStatus.brand;

    // Ordinal sentiment scale (1-5, higher = more positive)
    const sentimentScoreMap: Record<string, number> = {
      'strong_endorsement': 5,
      'positive_endorsement': 4,
      'neutral_mention': 3,
      'conditional': 2,
      'negative_comparison': 1,
      'not_mentioned': 0,
    };

    const sentimentLabelMap: Record<number, string> = {
      5: 'Strong',
      4: 'Positive',
      3: 'Neutral',
      2: 'Conditional',
      1: 'Negative',
      0: 'Not Mentioned',
    };

    // Helper to get magnitude label from absolute delta
    const getMagnitudeLabel = (absDelta: number): string => {
      if (absDelta === 0) return 'No advantage';
      if (absDelta === 1) return 'Slight';
      if (absDelta === 2) return 'Moderate';
      return 'Strong';
    };

    // Helper function to extract snippet around a brand mention
    const extractSnippet = (text: string, brandName: string, contextChars: number = 80): string | null => {
      const lowerText = text.toLowerCase();
      const lowerBrand = brandName.toLowerCase();
      const index = lowerText.indexOf(lowerBrand);
      if (index === -1) return null;

      const start = Math.max(0, index - contextChars);
      const end = Math.min(text.length, index + brandName.length + contextChars);

      let snippet = text.substring(start, end);
      if (start > 0) snippet = '...' + snippet;
      if (end < text.length) snippet = snippet + '...';

      return snippet;
    };

    // Get results with sources and sentiment data, optionally filtered
    const resultsWithSources = globallyFilteredResults.filter(
      (r: Result) => !r.error && r.sources && r.sources.length > 0 &&
        (sourceSentimentGapProviderFilter === 'all' || r.provider === sourceSentimentGapProviderFilter) &&
        (sourceSentimentGapPromptFilter === 'all' || r.prompt === sourceSentimentGapPromptFilter)
    );

    if (resultsWithSources.length === 0) return [];

    // Track per-source sentiment stats for ALL brands (not just searched brand vs competitors)
    const sourceStats: Record<string, {
      domain: string;
      allBrandSentiments: Record<string, number[]>; // Sentiment scores for each brand
      snippets: Array<{ brand: string; snippet: string; sentiment: string; sentimentScore: number; isBrand: boolean; provider: string; prompt: string; responseText: string; resultId: string }>;
      providers: Set<string>; // Track which providers cite this source
    }> = {};

    // Process each result
    resultsWithSources.forEach((r: Result) => {
      if (!r.sources) return;

      // Get unique domains in this response
      const domainsInResponse = new Set<string>();
      r.sources.forEach((source: Source) => {
        if (!source.url) return;
        try {
          const hostname = new URL(source.url).hostname.replace(/^www\./, '');
          domainsInResponse.add(hostname);
        } catch {
          // Skip invalid URLs
        }
      });

      // For each domain, track sentiment for ALL brands
      domainsInResponse.forEach(domain => {
        if (!sourceStats[domain]) {
          sourceStats[domain] = {
            domain,
            allBrandSentiments: {},
            snippets: [],
            providers: new Set(),
          };
        }
        // Track provider for this source
        sourceStats[domain].providers.add(r.provider);

        // Track searched brand sentiment
        if (r.brand_mentioned && r.brand_sentiment && r.brand_sentiment !== 'not_mentioned') {
          const score = sentimentScoreMap[r.brand_sentiment] || 0;
          if (!sourceStats[domain].allBrandSentiments[searchedBrand]) {
            sourceStats[domain].allBrandSentiments[searchedBrand] = [];
          }
          sourceStats[domain].allBrandSentiments[searchedBrand].push(score);

          if (r.response_text) {
            const snippet = extractSnippet(r.response_text, searchedBrand);
            if (snippet) {
              sourceStats[domain].snippets.push({
                brand: searchedBrand,
                snippet,
                sentiment: r.brand_sentiment,
                sentimentScore: score,
                isBrand: true,
                provider: r.provider,
                prompt: r.prompt,
                responseText: r.response_text,
                resultId: r.id,
              });
            }
          }
        }

        // Track all competitor sentiments
        if (r.competitors_mentioned && r.competitor_sentiments) {
          const responseText = r.response_text;
          r.competitors_mentioned.forEach(competitor => {
            const sentiment = r.competitor_sentiments?.[competitor];
            if (sentiment && sentiment !== 'not_mentioned') {
              const score = sentimentScoreMap[sentiment] || 0;
              if (!sourceStats[domain].allBrandSentiments[competitor]) {
                sourceStats[domain].allBrandSentiments[competitor] = [];
              }
              sourceStats[domain].allBrandSentiments[competitor].push(score);

              if (responseText) {
                const snippet = extractSnippet(responseText, competitor);
                if (snippet) {
                  sourceStats[domain].snippets.push({
                    brand: competitor,
                    snippet,
                    sentiment,
                    sentimentScore: score,
                    isBrand: false,
                    provider: r.provider,
                    prompt: r.prompt,
                    responseText,
                    resultId: r.id,
                  });
                }
              }
            }
          });
        }
      });
    });

    // Convert to array with calculated metrics based on selected comparison brand
    return Object.values(sourceStats)
      .filter(stat => {
        // Only include sources where the comparison brand has sentiment data
        const brandScores = stat.allBrandSentiments[comparisonBrand];
        return brandScores && brandScores.length >= 1;
      })
      .map(stat => {
        // Get sentiment for the comparison brand
        const brandScores = stat.allBrandSentiments[comparisonBrand] || [];
        const avgBrandScore = brandScores.length > 0
          ? brandScores.reduce((a, b) => a + b, 0) / brandScores.length
          : 0;
        const brandSentimentIndex = Math.round(avgBrandScore);

        // Find the other brand with best sentiment for this source (excluding comparison brand)
        let topCompetitor = '';
        let topCompetitorIndex = 0;
        let topCompetitorAvgScore = 0;
        Object.entries(stat.allBrandSentiments).forEach(([brand, scores]) => {
          if (brand !== comparisonBrand && scores.length > 0) {
            const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
            if (avg > topCompetitorAvgScore) {
              topCompetitor = brand;
              topCompetitorAvgScore = avg;
              topCompetitorIndex = Math.round(avg);
            }
          }
        });

        // Compute categorical gap (ordinal difference)
        const delta = topCompetitorIndex - brandSentimentIndex;
        const absDelta = Math.abs(delta);

        // Direction: who has the advantage
        const direction: 'competitor' | 'brand' | 'tie' =
          delta > 0 ? 'competitor' : delta < 0 ? 'brand' : 'tie';

        // Magnitude label
        const magnitudeLabel = getMagnitudeLabel(absDelta);

        // Human-readable label
        let labelText: string;
        if (direction === 'competitor') {
          labelText = `${magnitudeLabel} competitor advantage`;
        } else if (direction === 'brand') {
          labelText = `${magnitudeLabel} ${comparisonBrand} advantage`;
        } else {
          labelText = 'Even';
        }

        // Shift summary for tooltip (categorical, no numbers)
        const brandLabel = sentimentLabelMap[brandSentimentIndex] || 'Unknown';
        const competitorLabel = sentimentLabelMap[topCompetitorIndex] || 'Unknown';
        const shiftSummary = `${comparisonBrand}: ${brandLabel} → ${topCompetitor || 'Competitor'}: ${competitorLabel}`;

        // Bar value for rendering (-3 to +3 scale, capped)
        const clampedDelta = Math.min(Math.max(absDelta, 0), 3);
        const signedValue = direction === 'competitor' ? clampedDelta : direction === 'brand' ? -clampedDelta : 0;

        return {
          domain: stat.domain,
          totalMentions: Object.values(stat.allBrandSentiments).flat().length,
          brandSentimentIndex,
          brandSentimentLabel: brandLabel,
          topCompetitor,
          topCompetitorIndex,
          competitorSentimentLabel: competitorLabel,
          delta,
          direction,
          magnitudeLabel,
          labelText,
          shiftSummary,
          signedValue,
          snippets: stat.snippets,
          providers: Array.from(stat.providers),
          comparisonBrand, // Include which brand was used for comparison
        };
      })
      .filter(stat => stat.delta !== 0) // Show sources where there's any difference
      .sort((a, b) => b.signedValue - a.signedValue); // Sort by strongest competitor advantage first
  }, [runStatus, globallyFilteredResults, sourceSentimentGapProviderFilter, sourceSentimentGapPromptFilter, sentimentComparisonBrand]);

  // State for sources filters
  const [sourcesProviderFilter, setSourcesProviderFilter] = useState<string>('all');
  const [sourcesBrandFilter, setSourcesBrandFilter] = useState<string>('all');
  const [heatmapProviderFilter, setHeatmapProviderFilter] = useState<string>('all');
  const [heatmapShowSentiment, setHeatmapShowSentiment] = useState<boolean>(false);

  // State for Domain Breakdown table sorting
  const [domainSortColumn, setDomainSortColumn] = useState<'domain' | 'usedPercent' | 'avgCitation' | 'category' | 'avgSentiment'>('usedPercent');
  const [domainSortDirection, setDomainSortDirection] = useState<'asc' | 'desc'>('desc');
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const [expandedGapSources, setExpandedGapSources] = useState<Set<string>>(new Set());
  const [snippetDetailModal, setSnippetDetailModal] = useState<{ brand: string; responseText: string; provider: string; prompt: string } | null>(null);
  const snippetDetailRef = useRef<HTMLSpanElement>(null);
  const [aiCategorizations, setAiCategorizations] = useState<Record<string, string>>({});
  const [categorizationLoading, setCategorizationLoading] = useState(false);
  const sourcesListRef = useRef<HTMLDivElement>(null);
  const pendingScrollRestore = useRef<{ container: number; window: number } | null>(null);

  // Scroll to highlighted brand in snippet detail modal
  useEffect(() => {
    if (snippetDetailModal && snippetDetailRef.current) {
      // Small delay to ensure modal is rendered
      setTimeout(() => {
        snippetDetailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [snippetDetailModal]);

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

      // Enhanced Reddit URL handling
      if (domain === 'reddit.com' || domain.endsWith('.reddit.com') || domain === 'redd.it') {
        // Try to extract subreddit from various URL patterns
        const subredditMatch = pathname.match(/\/r\/([^/]+)/);
        if (subredditMatch) {
          // Try to also get post title from URL if available
          // Pattern: /r/subreddit/comments/id/post_title_here/
          const titleMatch = pathname.match(/\/r\/[^/]+\/comments\/[^/]+\/([^/]+)/);
          if (titleMatch && titleMatch[1]) {
            const postTitle = titleMatch[1].replace(/_/g, ' ');
            return `${postTitle} (r/${subredditMatch[1]})`;
          }
          return `r/${subredditMatch[1]}`;
        }
        // Handle user profile URLs
        const userMatch = pathname.match(/\/user\/([^/]+)/);
        if (userMatch) {
          return `u/${userMatch[1]}`;
        }
        // Handle direct comment URLs: /comments/id/
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

  // Sources Insights Summary - auto-generated key findings for Sources tab
  const sourcesInsights = useMemo(() => {
    if (!runStatus) return [];

    const insights: string[] = [];
    const searchedBrand = runStatus.brand;

    // Get all results with sources
    const resultsWithSources = globallyFilteredResults.filter(
      (r: Result) => !r.error && r.sources && r.sources.length > 0
    );

    if (resultsWithSources.length === 0) return [];

    // 1. Top cited source insight
    if (topCitedSources.length > 0) {
      const topSource = topCitedSources[0];
      insights.push(`${topSource.domain} is the most frequently cited source (${topSource.count} citations across ${topSource.providers.length} ${topSource.providers.length === 1 ? 'model' : 'models'})`);
    }

    // 2. Key influencer insight (sources cited by multiple providers)
    if (keyInfluencers.length > 0) {
      insights.push(`${keyInfluencers.length} source${keyInfluencers.length === 1 ? '' : 's'} ${keyInfluencers.length === 1 ? 'is' : 'are'} cited by multiple AI models, indicating high authority`);
    }

    // 3. Brand website citation rate
    const brandDomain = searchedBrand.toLowerCase().replace(/\s+/g, '');
    const brandCitations = topCitedSources.filter(s =>
      s.domain.toLowerCase().includes(brandDomain) || brandDomain.includes(s.domain.toLowerCase().replace('.com', '').replace('.org', ''))
    );
    if (brandCitations.length > 0) {
      const totalBrandCitations = brandCitations.reduce((sum, s) => sum + s.count, 0);
      insights.push(`${searchedBrand}'s website is cited ${totalBrandCitations} time${totalBrandCitations === 1 ? '' : 's'} as a source`);
    } else {
      insights.push(`${searchedBrand}'s website is not currently cited as a source by AI models — an opportunity for improvement`);
    }

    // 4. Source diversity
    const uniqueDomains = new Set(topCitedSources.map(s => s.domain));
    if (uniqueDomains.size > 5) {
      insights.push(`AI models cite ${uniqueDomains.size} different sources, showing diverse information gathering`);
    }

    // 5. Provider with most sources
    const providerSourceCounts: Record<string, number> = {};
    resultsWithSources.forEach((r: Result) => {
      providerSourceCounts[r.provider] = (providerSourceCounts[r.provider] || 0) + (r.sources?.length || 0);
    });
    const topProvider = Object.entries(providerSourceCounts).sort((a, b) => b[1] - a[1])[0];
    if (topProvider) {
      const formatProviderName = (p: string) => {
        switch (p) {
          case 'openai': return 'GPT-4o';
          case 'anthropic': return 'Claude';
          case 'perplexity': return 'Perplexity';
          case 'ai_overviews': return 'Google AI Overviews';
          case 'gemini': return 'Gemini';
          default: return p;
        }
      };
      insights.push(`${formatProviderName(topProvider[0])} provides the most source citations (${topProvider[1]} total)`);
    }

    return insights.slice(0, 5);
  }, [runStatus, globallyFilteredResults, topCitedSources, keyInfluencers]);

  // Sentiment Insights Summary - auto-generated key findings for Sentiment tab
  const sentimentInsights = useMemo(() => {
    if (!runStatus) return [];

    const insights: string[] = [];
    const searchedBrand = runStatus.brand;

    // Get sentiment data
    const resultsWithSentiment = globallyFilteredResults.filter(
      (r: Result) => !r.error && r.brand_sentiment
    );

    if (resultsWithSentiment.length === 0) return [];

    // Count sentiments
    const sentimentCounts: Record<string, number> = {
      strong_endorsement: 0,
      positive_endorsement: 0,
      neutral_mention: 0,
      conditional: 0,
      negative_comparison: 0,
    };

    resultsWithSentiment.forEach((r: Result) => {
      const sentiment = r.brand_sentiment || '';
      if (sentimentCounts[sentiment] !== undefined) {
        sentimentCounts[sentiment]++;
      }
    });

    const total = Object.values(sentimentCounts).reduce((a, b) => a + b, 0);
    const positiveCount = sentimentCounts.strong_endorsement + sentimentCounts.positive_endorsement;
    const positiveRate = total > 0 ? (positiveCount / total) * 100 : 0;

    // 1. Overall sentiment insight
    if (positiveRate >= 70) {
      insights.push(`${searchedBrand} receives highly positive framing — ${positiveRate.toFixed(0)}% of mentions are endorsements`);
    } else if (positiveRate >= 50) {
      insights.push(`${searchedBrand} has generally positive sentiment with ${positiveRate.toFixed(0)}% endorsement rate`);
    } else if (positiveRate >= 30) {
      insights.push(`${searchedBrand} has mixed sentiment — only ${positiveRate.toFixed(0)}% of mentions are positive endorsements`);
    } else {
      insights.push(`${searchedBrand} has challenging sentiment positioning — ${positiveRate.toFixed(0)}% positive endorsements`);
    }

    // 2. Strongest sentiment category
    const topSentiment = Object.entries(sentimentCounts).sort((a, b) => b[1] - a[1])[0];
    if (topSentiment && topSentiment[1] > 0) {
      const labelMap: Record<string, string> = {
        strong_endorsement: 'Highly Recommended',
        positive_endorsement: 'Recommended',
        neutral_mention: 'Neutral Mention',
        conditional: 'Mentioned with Caveats',
        negative_comparison: 'Not Recommended',
      };
      const percentage = total > 0 ? (topSentiment[1] / total * 100).toFixed(0) : 0;
      insights.push(`Most common framing: "${labelMap[topSentiment[0]]}" (${percentage}% of responses)`);
    }

    // 3. Caveat/negative analysis
    const negativeCount = sentimentCounts.conditional + sentimentCounts.negative_comparison;
    if (negativeCount > 0) {
      const negativeRate = (negativeCount / total) * 100;
      if (negativeRate > 20) {
        insights.push(`${negativeRate.toFixed(0)}% of mentions include caveats or negative comparisons — room for improvement`);
      }
    }

    // 4. Provider-specific sentiment patterns
    const providerSentiments: Record<string, { positive: number; total: number }> = {};
    resultsWithSentiment.forEach((r: Result) => {
      if (!providerSentiments[r.provider]) {
        providerSentiments[r.provider] = { positive: 0, total: 0 };
      }
      providerSentiments[r.provider].total++;
      if (r.brand_sentiment === 'strong_endorsement' || r.brand_sentiment === 'positive_endorsement') {
        providerSentiments[r.provider].positive++;
      }
    });

    const formatProviderName = (p: string) => {
      switch (p) {
        case 'openai': return 'GPT-4o';
        case 'anthropic': return 'Claude';
        case 'perplexity': return 'Perplexity';
        case 'ai_overviews': return 'Google AI Overviews';
        case 'gemini': return 'Gemini';
        default: return p;
      }
    };

    // Find best and worst providers
    const providerRates = Object.entries(providerSentiments)
      .filter(([, data]) => data.total >= 2)
      .map(([provider, data]) => ({
        provider,
        rate: (data.positive / data.total) * 100,
        total: data.total,
      }))
      .sort((a, b) => b.rate - a.rate);

    if (providerRates.length >= 2) {
      const best = providerRates[0];
      const worst = providerRates[providerRates.length - 1];
      if (best.rate - worst.rate > 20) {
        insights.push(`${formatProviderName(best.provider)} is most positive (${best.rate.toFixed(0)}% endorsements) vs ${formatProviderName(worst.provider)} (${worst.rate.toFixed(0)}%)`);
      }
    }

    // 5. Competitor comparison (if available)
    const competitorSentiments: Record<string, { positive: number; total: number }> = {};
    globallyFilteredResults
      .filter((r: Result) => !r.error && r.competitor_sentiments)
      .forEach((r: Result) => {
        if (r.competitor_sentiments) {
          Object.entries(r.competitor_sentiments).forEach(([comp, sentiment]) => {
            if (!competitorSentiments[comp]) {
              competitorSentiments[comp] = { positive: 0, total: 0 };
            }
            competitorSentiments[comp].total++;
            if (sentiment === 'strong_endorsement' || sentiment === 'positive_endorsement') {
              competitorSentiments[comp].positive++;
            }
          });
        }
      });

    const competitorsWithBetterSentiment = Object.entries(competitorSentiments)
      .filter(([, data]) => data.total >= 2)
      .filter(([, data]) => {
        const compRate = (data.positive / data.total) * 100;
        return compRate > positiveRate + 10;
      });

    if (competitorsWithBetterSentiment.length > 0) {
      const topComp = competitorsWithBetterSentiment[0];
      const compRate = (topComp[1].positive / topComp[1].total) * 100;
      insights.push(`${topComp[0]} has stronger sentiment (${compRate.toFixed(0)}% positive) than ${searchedBrand} (${positiveRate.toFixed(0)}%)`);
    } else if (Object.keys(competitorSentiments).length > 0) {
      insights.push(`${searchedBrand} has equal or better sentiment than tracked competitors`);
    }

    return insights.slice(0, 5);
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
          const allBrands: string[] = result.all_brands_mentioned && result.all_brands_mentioned.length > 0
            ? result.all_brands_mentioned.filter((b): b is string => typeof b === 'string')
            : [runStatus.brand, ...(result.competitors_mentioned || [])].filter((b): b is string => typeof b === 'string');

          // Find position of selected brand in the ordered list
          // First try exact match
          let foundIndex = allBrands.findIndex(b => b.toLowerCase() === brandLower);

          // If not found, try partial match (brand contains item or item contains brand)
          if (foundIndex === -1) {
            foundIndex = allBrands.findIndex(b =>
              b.toLowerCase().includes(brandLower) || brandLower.includes(b.toLowerCase())
            );
          }

          // If still not found but brand_mentioned is true, find position by text search
          if (foundIndex === -1 && result.response_text) {
            // Find the brand's position in the raw text and count how many other brands appear before it
            const brandPos = result.response_text.toLowerCase().indexOf(brandLower);
            if (brandPos >= 0) {
              let brandsBeforeCount = 0;
              for (const b of allBrands) {
                const bPos = result.response_text.toLowerCase().indexOf(b.toLowerCase());
                if (bPos >= 0 && bPos < brandPos) {
                  brandsBeforeCount++;
                }
              }
              rank = brandsBeforeCount + 1;
            } else {
              // Brand is mentioned but we can't find its position - place it after all known brands
              rank = allBrands.length + 1;
            }
          } else {
            rank = foundIndex + 1;
          }
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
      // rank 1-9 -> position 0-8, rank 10+ -> position 9 ("Shown after top 10"), rank exactly 11 -> position 10 ("Not shown")
      const rankToXPosition = (rank: number): number => {
        if (rank <= 9) return rank - 1;
        if (rank === 11) return 10; // Only exactly 11 (all not mentioned) goes to "Not shown"
        return 9; // Everything else (10, 10.5, 12, etc.) goes to "Shown after top 10"
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

    // Average rank and top position count
    const ranks: number[] = [];
    let topPositionCount = 0;
    for (const result of results) {
      if (!result.response_text) continue;

      // Use all_brands_mentioned if available (includes all detected brands)
      const allBrands: string[] = result.all_brands_mentioned && result.all_brands_mentioned.length > 0
        ? result.all_brands_mentioned.filter((b): b is string => typeof b === 'string')
        : [runStatus.brand, ...(result.competitors_mentioned || [])].filter((b): b is string => typeof b === 'string');

      if (selectedBrand) {
        const brandLower = selectedBrand.toLowerCase();
        // First try exact match
        let foundIndex = allBrands.findIndex(b => b.toLowerCase() === brandLower);

        // If not found, try partial match
        if (foundIndex === -1) {
          foundIndex = allBrands.findIndex(b =>
            b.toLowerCase().includes(brandLower) || brandLower.includes(b.toLowerCase())
          );
        }

        // If still not found but brand appears in text, find position by text search
        let rank = foundIndex + 1;
        if (foundIndex === -1 && result.response_text.toLowerCase().includes(brandLower)) {
          const brandPos = result.response_text.toLowerCase().indexOf(brandLower);
          let brandsBeforeCount = 0;
          for (const b of allBrands) {
            const bPos = result.response_text.toLowerCase().indexOf(b.toLowerCase());
            if (bPos >= 0 && bPos < brandPos) {
              brandsBeforeCount++;
            }
          }
          rank = brandsBeforeCount + 1;
        }

        if (rank > 0) {
          ranks.push(rank);
          if (rank === 1) topPositionCount++;
        }
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

    // Calculate #1 rate
    const responsesWhereMentioned = mentionedCount;
    const top1Rate = responsesWhereMentioned > 0 ? (topPositionCount / responsesWhereMentioned) * 100 : 0;

    return {
      overallVisibility,
      shareOfVoice,
      topPositionCount,
      totalResponses: results.length,
      avgRank,
      uniqueSourcesCount: uniqueSources.size,
      totalCost: runStatus.actual_cost,
      selectedBrand,
      // Additional fields for KPI tooltips
      mentionedCount,
      selectedBrandMentions,
      totalBrandMentions,
      responsesWhereMentioned,
      top1Rate,
      ranksCount: ranks.length,
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
          const allBrands: string[] = r.all_brands_mentioned && r.all_brands_mentioned.length > 0
            ? r.all_brands_mentioned.filter((b): b is string => typeof b === 'string')
            : [runStatus.brand, ...(r.competitors_mentioned || [])].filter((b): b is string => typeof b === 'string');

          const brandLower = runStatus.brand.toLowerCase();
          // First try exact match
          let foundIndex = allBrands.findIndex(b => b.toLowerCase() === brandLower);

          // If not found, try partial match
          if (foundIndex === -1) {
            foundIndex = allBrands.findIndex(b =>
              b.toLowerCase().includes(brandLower) || brandLower.includes(b.toLowerCase())
            );
          }

          // If still not found, find position by text search
          let brandRank = foundIndex + 1;
          if (foundIndex === -1) {
            const brandPos = r.response_text.toLowerCase().indexOf(brandLower);
            if (brandPos >= 0) {
              let brandsBeforeCount = 0;
              for (const b of allBrands) {
                const bPos = r.response_text.toLowerCase().indexOf(b.toLowerCase());
                if (bPos >= 0 && bPos < brandPos) {
                  brandsBeforeCount++;
                }
              }
              brandRank = brandsBeforeCount + 1;
            } else {
              brandRank = allBrands.length + 1;
            }
          }

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

  const handleExportHeatmapCSV = () => {
    if (!brandSourceHeatmap.sources.length) return;

    const headers = ['Source', ...brandSourceHeatmap.brands];
    const rows = brandSourceHeatmap.data.map(row => {
      const values = [row.domain as string];
      brandSourceHeatmap.brands.forEach(brand => {
        if (heatmapShowSentiment) {
          const sentimentInfo = brandSourceHeatmap.sentimentData[row.domain as string]?.[brand];
          values.push(sentimentInfo?.avg ? sentimentInfo.avg.toFixed(2) : '0');
        } else {
          values.push(String(row[brand] || 0));
        }
      });
      return values;
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${runStatus?.brand || 'brand'}-source-heatmap-${heatmapShowSentiment ? 'sentiment' : 'citations'}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportSentimentCSV = () => {
    if (!runStatus) return;

    const headers = [
      'Prompt',
      'Provider',
      'Model',
      'Position',
      `${runStatus.brand} Sentiment`,
      'Competitor Sentiments',
      'All Brands Mentioned',
      'Response',
    ];

    const rows = globallyFilteredResults
      .filter((r: Result) => !r.error && r.brand_sentiment)
      .map((r: Result) => {
        const competitorSentiments = r.competitor_sentiments
          ? Object.entries(r.competitor_sentiments)
              .filter(([_, sentiment]) => sentiment !== 'not_mentioned')
              .map(([comp, sentiment]) => `${comp}: ${sentiment}`)
              .join('; ')
          : '';

        // Calculate position/rank
        let rank = 0;
        const brandLower = runStatus.brand.toLowerCase();
        if (r.brand_mentioned && r.response_text) {
          const allBrands: string[] = r.all_brands_mentioned && r.all_brands_mentioned.length > 0
            ? r.all_brands_mentioned.filter((b): b is string => typeof b === 'string')
            : [runStatus.brand, ...(r.competitors_mentioned || [])].filter((b): b is string => typeof b === 'string');

          let foundIndex = allBrands.findIndex(b => b.toLowerCase() === brandLower);
          if (foundIndex === -1) {
            foundIndex = allBrands.findIndex(b =>
              b.toLowerCase().includes(brandLower) || brandLower.includes(b.toLowerCase())
            );
          }
          if (foundIndex === -1) {
            const brandPos = r.response_text.toLowerCase().indexOf(brandLower);
            if (brandPos >= 0) {
              let brandsBeforeCount = 0;
              for (const b of allBrands) {
                const bPos = r.response_text.toLowerCase().indexOf(b.toLowerCase());
                if (bPos >= 0 && bPos < brandPos) brandsBeforeCount++;
              }
              rank = brandsBeforeCount + 1;
            } else {
              rank = allBrands.length + 1;
            }
          } else {
            rank = foundIndex + 1;
          }
        }

        return [
          `"${r.prompt.replace(/"/g, '""')}"`,
          r.provider,
          r.model,
          rank > 0 ? rank : '',
          r.brand_sentiment || '',
          `"${competitorSentiments}"`,
          `"${(r.all_brands_mentioned || []).join(', ')}"`,
          `"${(r.response_text || '').replace(/"/g, '""')}"`,
        ];
      });

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sentiment-results-${runStatus.brand}-${runId.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportRecommendationsPDF = (recommendations: Array<{
    title: string;
    description: string;
    impact: string;
    effort: string;
    tactics: string[];
  }>) => {
    if (!runStatus || recommendations.length === 0) return;

    const getQuadrantName = (impact: string, effort: string) => {
      if (impact === 'high' && effort === 'low') return 'Quick Win';
      if (impact === 'high' && effort === 'high') return 'Major Project';
      if (impact === 'low' && effort === 'low') return 'Fill-in';
      if (impact === 'low' && effort === 'high') return 'Avoid';
      return 'Consider';
    };

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>AI Visibility Recommendations - ${runStatus.brand}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
          h1 { color: #111827; margin-bottom: 8px; }
          .subtitle { color: #6b7280; margin-bottom: 32px; }
          .recommendation { border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 16px; }
          .rec-title { font-size: 18px; font-weight: 600; color: #111827; margin-bottom: 8px; }
          .rec-description { color: #4b5563; margin-bottom: 12px; }
          .rec-meta { display: flex; gap: 16px; margin-bottom: 12px; }
          .badge { padding: 4px 12px; border-radius: 16px; font-size: 12px; font-weight: 500; }
          .impact-high { background: #dcfce7; color: #166534; }
          .impact-medium { background: #fef9c3; color: #854d0e; }
          .impact-low { background: #f3f4f6; color: #4b5563; }
          .effort-high { background: #fee2e2; color: #991b1b; }
          .effort-medium { background: #ffedd5; color: #c2410c; }
          .effort-low { background: #dbeafe; color: #1e40af; }
          .category { background: #f3f4f6; color: #374151; }
          .tactics { margin-top: 12px; }
          .tactics-title { font-size: 12px; font-weight: 600; color: #6b7280; margin-bottom: 8px; }
          .tactics-list { margin: 0; padding-left: 20px; }
          .tactics-list li { color: #4b5563; font-size: 14px; margin-bottom: 4px; }
          .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px; }
        </style>
      </head>
      <body>
        <h1>AI Visibility Recommendations</h1>
        <p class="subtitle">${runStatus.brand} - Generated ${new Date().toLocaleDateString()}</p>

        ${recommendations.map((rec, idx) => `
          <div class="recommendation">
            <div class="rec-title">${idx + 1}. ${rec.title}</div>
            <div class="rec-description">${rec.description}</div>
            <div class="rec-meta">
              <span class="badge impact-${rec.impact}">Impact: ${rec.impact}</span>
              <span class="badge effort-${rec.effort}">Effort: ${rec.effort}</span>
              <span class="badge category">${getQuadrantName(rec.impact, rec.effort)}</span>
            </div>
            ${rec.tactics.length > 0 ? `
              <div class="tactics">
                <div class="tactics-title">Tactics:</div>
                <ul class="tactics-list">
                  ${rec.tactics.map(t => `<li>${t}</li>`).join('')}
                </ul>
              </div>
            ` : ''}
          </div>
        `).join('')}

        <div class="footer">
          Generated by AI Visibility Tracker
        </div>
      </body>
      </html>
    `;

    // Create a temporary container for the HTML content
    const container = document.createElement('div');
    container.innerHTML = htmlContent;
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0';
    document.body.appendChild(container);

    // Use dynamic import for html2pdf (client-side only)
    import('html2pdf.js').then((html2pdfModule) => {
      const html2pdf = html2pdfModule.default;
      const opt = {
        margin: 10,
        filename: `recommendations-${runStatus.brand}-${new Date().toISOString().split('T')[0]}.pdf`,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const }
      };

      html2pdf().set(opt).from(container).save().then(() => {
        document.body.removeChild(container);
      });
    });
  };

  const handleExportRecommendationsCSV = (recommendations: Array<{
    title: string;
    description: string;
    impact: string;
    effort: string;
    tactics: string[];
  }>) => {
    if (!runStatus || recommendations.length === 0) return;

    const headers = [
      'Recommendation',
      'Description',
      'Impact',
      'Effort',
      'Category',
      'Tactics',
    ];

    const rows = recommendations.map(rec => {
      const quadrantName =
        rec.impact === 'high' && rec.effort === 'low' ? 'Quick Win' :
        rec.impact === 'high' && rec.effort === 'high' ? 'Major Project' :
        rec.impact === 'low' && rec.effort === 'low' ? 'Fill-in' :
        rec.impact === 'low' && rec.effort === 'high' ? 'Avoid' : 'Consider';

      return [
        `"${rec.title.replace(/"/g, '""')}"`,
        `"${rec.description.replace(/"/g, '""')}"`,
        rec.impact,
        rec.effort,
        quadrantName,
        `"${rec.tactics.join('; ').replace(/"/g, '""')}"`,
      ];
    });

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recommendations-${runStatus.brand}-${runId.slice(0, 8)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Note: Don't use early returns here - there are useMemo calls below that must always run
  const showLoading = isLoading;
  const showError = !isLoading && (error || !runStatus);

  const summary = runStatus?.summary ?? null;
  const brandMentionRate = summary?.brand_mention_rate ?? 0;
  const isCategory = runStatus?.search_type === 'category';

  const getMentionRateColor = (rate: number) => {
    if (rate >= 0.7) return 'text-gray-900';
    if (rate >= 0.4) return 'text-yellow-600';
    return 'text-red-500';
  };

  const getMentionRateBgColor = (rate: number) => {
    if (rate >= 0.7) return 'bg-gray-700';
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
      case 'grok': return 'xAI Grok';
      case 'llama': return 'Meta Llama';
      default: return provider;
    }
  };

  // Strip markdown formatting from text for preview display
  const stripMarkdown = (text: string): string => {
    return text
      .replace(/\*\*([^*]+)\*\*/g, '$1')  // Remove bold **text**
      .replace(/\*([^*]+)\*/g, '$1')       // Remove italic *text*
      .replace(/^[\s]*[-*+]\s+/gm, '')     // Remove bullet points
      .replace(/^[\s]*\d+\.\s+/gm, '')     // Remove numbered lists
      .replace(/^#+\s+/gm, '')             // Remove headings
      .replace(/`([^`]+)`/g, '$1')         // Remove inline code
      .replace(/\(\[([^\]]+)\]\([^)]+\)\)/g, '$1')  // Remove links with extra parens: ([text](url))
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // Remove links, keep text: [text](url)
      .replace(/https?:\/\/[^\s)\]]+/g, '')  // Remove raw URLs
      .replace(/\(\)/g, '')                // Remove empty parentheses
      .replace(/\s*\(\s*\)/g, '')          // Remove empty parentheses with spaces
      .replace(/\n+/g, ' ')                // Replace newlines with spaces
      .replace(/\s+/g, ' ')                // Normalize whitespace
      .trim();
  };

  // Generate LLM breakdown key takeaway
  const llmBreakdownTakeaway = useMemo(() => {
    const entries = Object.entries(llmBreakdownStats);
    if (entries.length === 0) return null;

    const selectedBrand = llmBreakdownBrandFilter || llmBreakdownBrands[0] || runStatus?.brand || 'your brand';

    // Sort by mention rate to find best and worst
    const sorted = [...entries].sort((a, b) => b[1].rate - a[1].rate);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];

    // Check if all rates are similar (within 10%)
    const allSimilar = sorted.length > 1 && (best[1].rate - worst[1].rate) < 0.10;

    if (allSimilar) {
      const avgRate = entries.reduce((sum, [, stats]) => sum + stats.rate, 0) / entries.length;
      return `${selectedBrand} is mentioned consistently across all Models at around ${Math.round(avgRate * 100)}%.`;
    }

    if (sorted.length === 1) {
      return `${getProviderLabel(best[0])} mentions ${selectedBrand} ${Math.round(best[1].rate * 100)}% of the time.`;
    }

    // Find any Models with 0% mentions
    const zeroMentions = sorted.filter(([, stats]) => stats.rate === 0);
    if (zeroMentions.length > 0 && zeroMentions.length < sorted.length) {
      const zeroNames = zeroMentions.map(([p]) => getProviderLabel(p)).join(' and ');
      return `${getProviderLabel(best[0])} mentions ${selectedBrand} most often (${Math.round(best[1].rate * 100)}%), while ${zeroNames} ${zeroMentions.length === 1 ? 'does' : 'do'} not mention it at all.`;
    }

    // Standard comparison between best and worst
    const diff = Math.round((best[1].rate - worst[1].rate) * 100);
    if (diff >= 20) {
      return `${getProviderLabel(best[0])} mentions ${selectedBrand} most often (${Math.round(best[1].rate * 100)}%), ${diff} percentage points higher than ${getProviderLabel(worst[0])} (${Math.round(worst[1].rate * 100)}%).`;
    }

    return `${getProviderLabel(best[0])} leads with ${Math.round(best[1].rate * 100)}% mentions of ${selectedBrand}, compared to ${Math.round(worst[1].rate * 100)}% from ${getProviderLabel(worst[0])}.`;
  }, [llmBreakdownStats, llmBreakdownBrandFilter, llmBreakdownBrands, runStatus]);

  const getSentimentScore = (sentiment: string): number => {
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

  const getSentimentLabel = (score: number): string => {
    if (score >= 4.5) return 'Highly Recommended';
    if (score >= 3.5) return 'Recommended';
    if (score >= 2.5) return 'Neutral';
    if (score >= 1.5) return 'With Caveats';
    return 'Not Recommended';
  };

  // KPI Interpretation types and helper
  type InterpretationTone = 'success' | 'neutral' | 'warn';

  interface KPIInterpretation {
    label: string;
    tone: InterpretationTone;
  }

  const getKPIInterpretation = (
    metricKey: 'visibility' | 'shareOfVoice' | 'top1Rate' | 'avgPosition',
    value: number | null
  ): KPIInterpretation => {
    if (value === null) {
      return { label: 'No data', tone: 'neutral' };
    }

    switch (metricKey) {
      case 'visibility':
        if (value >= 80) return { label: 'High visibility', tone: 'success' };
        if (value >= 50) return { label: 'Moderate visibility', tone: 'neutral' };
        return { label: 'Low visibility', tone: 'warn' };

      case 'shareOfVoice':
        if (value >= 30) return { label: 'Leading brand', tone: 'success' };
        if (value >= 15) return { label: 'Competitive', tone: 'neutral' };
        return { label: 'Low share of voice', tone: 'warn' };

      case 'top1Rate':
        if (value >= 50) return { label: 'Strong top ranking', tone: 'success' };
        if (value >= 25) return { label: 'Competitive', tone: 'neutral' };
        return { label: 'Room to grow', tone: 'warn' };

      case 'avgPosition':
        if (value <= 1.5) return { label: 'Excellent', tone: 'success' };
        if (value <= 3.0) return { label: 'Competitive', tone: 'neutral' };
        return { label: 'Room to grow', tone: 'warn' };

      default:
        return { label: '', tone: 'neutral' };
    }
  };

  const getToneStyles = (tone: InterpretationTone): string => {
    switch (tone) {
      case 'success':
        return 'bg-green-100 text-green-700';
      case 'warn':
        return 'bg-orange-100 text-orange-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  // Get donut arc color based on percentage value
  const getArcColorByValue = (value: number): string => {
    if (value >= 80) return '#16a34a'; // green-600
    if (value >= 60) return '#22c55e'; // green-500
    if (value >= 40) return '#eab308'; // yellow-500
    if (value >= 20) return '#f97316'; // orange-500
    return '#ef4444'; // red-500
  };

  // Get card background tint based on performance tone
  const getCardBackground = (tone: InterpretationTone): string => {
    switch (tone) {
      case 'success':
        return 'bg-gradient-to-br from-gray-50/50 to-white';
      case 'warn':
        return 'bg-gradient-to-br from-orange-50/50 to-white';
      default:
        return 'bg-gradient-to-br from-gray-50/50 to-white';
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
  // Calculate provider visibility scores for Brand Analysis card
  const providerVisibilityScores = useMemo(() => {
    if (!runStatus) return [];

    const results = globallyFilteredResults.filter((r: Result) => !r.error);
    const providerStats: Record<string, { mentioned: number; total: number }> = {};

    results.forEach(r => {
      if (!providerStats[r.provider]) {
        providerStats[r.provider] = { mentioned: 0, total: 0 };
      }
      providerStats[r.provider].total++;
      if (r.brand_mentioned) {
        providerStats[r.provider].mentioned++;
      }
    });

    return Object.entries(providerStats)
      .map(([provider, stats]) => ({
        provider,
        score: stats.total > 0 ? Math.round((stats.mentioned / stats.total) * 100) : 0,
      }))
      .sort((a, b) => b.score - a.score);
  }, [runStatus, globallyFilteredResults]);

  // Calculate competitor comparison ratio
  const competitorComparisonRatio = useMemo(() => {
    if (!runStatus || brandBreakdownStats.length === 0) return null;

    const searchedBrandStats = brandBreakdownStats.find(s => s.isSearchedBrand);
    const competitors = brandBreakdownStats.filter(s => !s.isSearchedBrand);

    if (!searchedBrandStats || competitors.length === 0) return null;

    const avgCompetitorVisibility = competitors.reduce((sum, c) => sum + c.visibilityScore, 0) / competitors.length;

    if (avgCompetitorVisibility === 0) return searchedBrandStats.visibilityScore > 0 ? Infinity : 1;

    return searchedBrandStats.visibilityScore / avgCompetitorVisibility;
  }, [runStatus, brandBreakdownStats]);

  // Calculate provider visibility scores for ALL brands (main brand + competitors)
  const allBrandsAnalysisData = useMemo(() => {
    if (!runStatus) return [];

    const results = globallyFilteredResults.filter((r: Result) => !r.error);
    const searchedBrand = runStatus.brand;

    // Get all brands from brandBreakdownStats (already sorted by visibility)
    const allBrands = brandBreakdownStats.map(b => b.brand);

    return allBrands.map(brand => {
      const isSearchedBrand = brand === searchedBrand;
      const brandStats = brandBreakdownStats.find(b => b.brand === brand);

      // Calculate per-provider stats for this brand
      const providerStats: Record<string, { mentioned: number; total: number }> = {};

      results.forEach(r => {
        if (!providerStats[r.provider]) {
          providerStats[r.provider] = { mentioned: 0, total: 0 };
        }
        providerStats[r.provider].total++;

        const isMentioned = isSearchedBrand
          ? r.brand_mentioned
          : r.competitors_mentioned?.includes(brand);

        if (isMentioned) {
          providerStats[r.provider].mentioned++;
        }
      });

      const providerScores = Object.entries(providerStats)
        .map(([provider, stats]) => ({
          provider,
          score: stats.total > 0 ? Math.round((stats.mentioned / stats.total) * 100) : 0,
        }))
        .sort((a, b) => b.score - a.score);

      // Calculate comparison to avg of other brands
      const otherBrands = brandBreakdownStats.filter(b => b.brand !== brand);
      const avgOtherVisibility = otherBrands.length > 0
        ? otherBrands.reduce((sum, b) => sum + b.visibilityScore, 0) / otherBrands.length
        : 0;
      const comparisonRatio = avgOtherVisibility > 0
        ? (brandStats?.visibilityScore || 0) / avgOtherVisibility
        : brandStats?.visibilityScore && brandStats.visibilityScore > 0 ? Infinity : 1;

      return {
        brand,
        isSearchedBrand,
        visibilityScore: brandStats?.visibilityScore || 0,
        providerScores,
        comparisonRatio,
        avgSentimentScore: brandStats?.avgSentimentScore || null,
      };
    });
  }, [runStatus, globallyFilteredResults, brandBreakdownStats]);

  // Position categories for the dot plot chart
  const POSITION_CATEGORIES = ['Top', '2-3', '4-5', '6-10', '>10', 'N/A'];

  // Compute data for position by platform dot plot
  const positionByPlatformData = useMemo(() => {
    if (!scatterPlotData.length) return [];

    // Group data by provider and position category
    const grouped: Record<string, Record<string, { sentiment: string | null; prompt: string; rank: number; label: string; originalResult: Result }[]>> = {};

    scatterPlotData.forEach((dp) => {
      const provider = dp.label; // Use display label
      if (!grouped[provider]) {
        grouped[provider] = {};
        POSITION_CATEGORIES.forEach(cat => {
          grouped[provider][cat] = [];
        });
      }

      // Determine position category
      let category: string;
      if (!dp.isMentioned || dp.rank === 0) {
        category = 'N/A';
      } else if (dp.rank === 1) {
        category = 'Top';
      } else if (dp.rank >= 2 && dp.rank <= 3) {
        category = '2-3';
      } else if (dp.rank >= 4 && dp.rank <= 5) {
        category = '4-5';
      } else if (dp.rank >= 6 && dp.rank <= 10) {
        category = '6-10';
      } else {
        category = '>10';
      }

      grouped[provider][category].push({
        sentiment: dp.sentiment,
        prompt: dp.prompt,
        rank: dp.rank,
        label: dp.label,
        originalResult: dp.originalResult,
      });
    });

    return grouped;
  }, [scatterPlotData]);

  // Get sentiment color for dot - matches the legend colors consistently
  const getSentimentDotColor = (sentiment: string | null): string => {
    if (!sentiment) return '#9ca3af'; // gray for no sentiment
    switch (sentiment) {
      case 'strong_endorsement':
        return '#16a34a'; // green-600 - Highly Recommended
      case 'positive_endorsement':
        return '#4ade80'; // green-400 - Recommended
      case 'neutral_mention':
        return '#9ca3af'; // gray-400 - Neutral
      case 'conditional':
        return '#fbbf24'; // amber-400 - With Caveats
      case 'negative_comparison':
        return '#ef4444'; // red-500 - Not Recommended
      case 'not_mentioned':
        return '#d1d5db'; // gray-300 - Not mentioned
      default:
        return '#9ca3af'; // gray for unknown
    }
  };

  const OverviewTab = () => {
    return (
    <div className="space-y-6">
      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* AI Visibility Card */}
        {(() => {
          const visibilityTone = getKPIInterpretation('visibility', overviewMetrics?.overallVisibility ?? null).tone;
          return (
            <div className={`rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col h-[270px] ${getCardBackground(visibilityTone)}`}>
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
                <span className={`inline-block w-fit px-3 py-1 text-xs font-medium rounded-full ${getToneStyles(visibilityTone)}`}>
                  {getKPIInterpretation('visibility', overviewMetrics?.overallVisibility ?? null).label}
                </span>
              </div>
              {/* Description - pushed to bottom */}
              <p className="text-xs text-gray-500 leading-relaxed mt-auto">% of relevant AI responses that mention {runStatus?.brand || 'your brand'}</p>
            </div>
          );
        })()}

        {/* Share of Voice Card */}
        {(() => {
          const sovTone = getKPIInterpretation('shareOfVoice', overviewMetrics?.shareOfVoice ?? null).tone;
          return (
            <div className={`rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col h-[270px] ${getCardBackground(sovTone)}`}>
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
                <span className={`inline-block w-fit px-3 py-1 text-xs font-medium rounded-full ${getToneStyles(sovTone)}`}>
                  {getKPIInterpretation('shareOfVoice', overviewMetrics?.shareOfVoice ?? null).label}
                </span>
              </div>
              {/* Description - pushed to bottom */}
              <p className="text-xs text-gray-500 leading-relaxed mt-auto">{runStatus?.brand || 'Your brand'}'s share of all brand mentions</p>
            </div>
          );
        })()}

        {/* Top Result Rate Card */}
        {(() => {
          const topRateTone = getKPIInterpretation('top1Rate', overviewMetrics?.top1Rate ?? null).tone;
          return (
            <div className={`rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col h-[270px] ${getCardBackground(topRateTone)}`}>
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
                <span className={`inline-block w-fit px-3 py-1 text-xs font-medium rounded-full ${getToneStyles(topRateTone)}`}>
                  {getKPIInterpretation('top1Rate', overviewMetrics?.top1Rate ?? null).label}
                </span>
              </div>
              {/* Description - pushed to bottom */}
              <p className="text-xs text-gray-500 leading-relaxed mt-auto">How often {runStatus?.brand || 'your brand'} is the #1 result</p>
            </div>
          );
        })()}

        {/* Avg. Position Card */}
        {(() => {
          const avgPosTone = getKPIInterpretation('avgPosition', overviewMetrics?.avgRank ?? null).tone;
          const avgRank = overviewMetrics?.avgRank || 0;
          return (
            <div className={`rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col h-[270px] ${getCardBackground(avgPosTone)}`}>
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
                    <span className="text-3xl font-bold tracking-tight tabular-nums" style={{ color: avgRank <= 1.5 ? '#16a34a' : avgRank <= 3 ? '#eab308' : '#f97316' }}>
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
                          if (pos <= 1) return 'bg-green-600 text-white';
                          if (pos <= 2) return 'bg-green-500 text-white';
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
                <span className={`inline-block w-fit px-3 py-1 text-xs font-medium rounded-full ${getToneStyles(avgPosTone)}`}>
                  {getKPIInterpretation('avgPosition', overviewMetrics?.avgRank ?? null).label}
                </span>
              </div>
              {/* Description - pushed to bottom */}
              <p className="text-xs text-gray-500 leading-relaxed mt-auto">{runStatus?.brand || 'Your brand'}'s average ranking when mentioned</p>
            </div>
          );
        })()}
      </div>

      {/* AI Summary */}
      <div className="bg-gradient-to-r from-gray-50 to-white rounded-xl shadow-sm border border-gray-200 p-6">
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
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{removeActionableTakeaway(aiSummary.summary).replace(/\bai_overviews\b/gi, 'Google AI Overviews')}</ReactMarkdown>
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

      {/* Prompt Breakdown Table */}
      {promptBreakdownStats.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Results by Question</h2>
              <p className="text-sm text-gray-500 mt-1">How {runStatus?.brand} performs across each question asked to AI</p>
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-3 text-sm font-medium text-gray-600">Prompt</th>
                  <th className="text-center py-3 px-3 text-sm font-medium text-gray-600">
                    <div className="flex items-center justify-center gap-1">
                      <span className="whitespace-nowrap">AI Visibility</span>
                      <div className="relative group">
                        <HelpCircle className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-48 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 shadow-lg text-left font-normal">
                          % of AI responses that mention {runStatus?.brand || 'your brand'} for this question
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-gray-400 font-normal">% mentioned</div>
                  </th>
                  <th className="text-center py-3 px-3 text-sm font-medium text-gray-600">
                    <div className="flex items-center justify-center gap-1">
                      <span className="whitespace-nowrap">Share of Voice</span>
                      <div className="relative group">
                        <HelpCircle className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-48 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 shadow-lg text-left font-normal">
                          {runStatus?.brand || 'Your brand'}'s share of all brand mentions for this question
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
                          How often {runStatus?.brand || 'your brand'} is the #1 recommended result for this question
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
                          Average ranking position when {runStatus?.brand || 'your brand'} appears (lower is better)
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
                          How positively AI describes {runStatus?.brand || 'your brand'} when mentioned (from "Not Recommended" to "Highly Recommended")
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
                    if (score >= 4.5) return 'Highly Recommended';
                    if (score >= 3.5) return 'Recommended';
                    if (score >= 2.5) return 'Neutral';
                    if (score >= 1.5) return 'With Caveats';
                    if (score >= 0.5) return 'Not Recommended';
                    return '-';
                  };

                  const getSentimentColor = (score: number | null): string => {
                    if (score === null) return 'text-gray-400';
                    if (score >= 4.5) return 'text-green-600';
                    if (score >= 3.5) return 'text-lime-600';
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
                        <span className={`font-medium ${stat.visibilityScore >= 50 ? 'text-green-600' : stat.visibilityScore >= 25 ? 'text-yellow-600' : 'text-gray-600'}`}>
                          {stat.visibilityScore.toFixed(0)}%
                        </span>
                      </td>
                      <td className="text-center py-3 px-3">
                        <span className={`font-medium ${stat.shareOfVoice >= 50 ? 'text-green-600' : stat.shareOfVoice >= 25 ? 'text-yellow-600' : 'text-gray-600'}`}>
                          {stat.shareOfVoice.toFixed(0)}%
                        </span>
                      </td>
                      <td className="text-center py-3 px-3">
                        <span className={`font-medium ${stat.firstPositionRate >= 50 ? 'text-green-600' : stat.firstPositionRate >= 25 ? 'text-yellow-600' : 'text-gray-600'}`}>
                          {stat.firstPositionRate.toFixed(0)}%
                        </span>
                      </td>
                      <td className="text-center py-3 px-3">
                        {stat.avgRank !== null ? (
                          <span className={`font-medium ${stat.avgRank <= 1.5 ? 'text-green-600' : stat.avgRank <= 3 ? 'text-yellow-600' : 'text-gray-600'}`}>
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
        </div>
      )}

      {/* AI Brand Position by Platform */}
      {Object.keys(positionByPlatformData).length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-gray-900">AI Brand Position by Platform</h2>
                <div className="relative group">
                  <button
                    className="p-1 rounded-full hover:bg-gray-100 transition-colors"
                    aria-label="Learn more about AI Brand Position"
                    tabIndex={0}
                  >
                    <HelpCircle className="w-4 h-4 text-gray-400" />
                  </button>
                  <div className="absolute left-0 top-full mt-1 w-64 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all z-50 shadow-lg">
                    Shows where your brand appears in AI responses across different platforms{showSentimentColors ? ', colored by sentiment' : ''}.
                  </div>
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-1">How often {runStatus?.brand} ranks in each position across AI platforms</p>
            </div>
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

          {/* Legend - only show when sentiment colors are enabled */}
          {showSentimentColors && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-4">
              <span className="text-xs text-gray-600 font-medium">Sentiment:</span>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#16a34a' }} />
                <span className="text-xs text-gray-500">Highly Recommended</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#4ade80' }} />
                <span className="text-xs text-gray-500">Recommended</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#9ca3af' }} />
                <span className="text-xs text-gray-500">Neutral</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#fbbf24' }} />
                <span className="text-xs text-gray-500">With Caveats</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#ef4444' }} />
                <span className="text-xs text-gray-500">Not Recommended</span>
              </div>
            </div>
          )}

          {/* Dot Plot Grid */}
          <div className="space-y-4">
            {Object.entries(positionByPlatformData).map(([provider, categories]) => (
              <div key={provider} className="flex items-center">
                <div className="w-24 flex-shrink-0">
                  <span className="text-sm font-medium text-gray-900">{provider}</span>
                </div>
                <div className="flex-1 grid grid-cols-6 gap-2">
                  {POSITION_CATEGORIES.map((category) => {
                    const dots = categories[category] || [];
                    return (
                      <div key={category} className="flex items-center justify-center min-h-[24px] gap-0.5 flex-wrap">
                        {dots.map((dot, idx) => (
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
                                    dot.sentiment === 'strong_endorsement' ? 'text-green-600' :
                                    dot.sentiment === 'positive_endorsement' ? 'text-lime-600' :
                                    dot.sentiment === 'neutral_mention' ? 'text-gray-600' :
                                    dot.sentiment === 'conditional' ? 'text-amber-500' :
                                    dot.sentiment === 'negative_comparison' ? 'text-red-500' : ''
                                  }`}>
                                    {dot.sentiment === 'strong_endorsement' ? 'Highly Recommended' :
                                     dot.sentiment === 'positive_endorsement' ? 'Recommended' :
                                     dot.sentiment === 'neutral_mention' ? 'Neutral' :
                                     dot.sentiment === 'conditional' ? 'With Caveats' :
                                     dot.sentiment === 'negative_comparison' ? 'Not Recommended' : ''}
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
            ))}
          </div>

          {/* X-axis labels */}
          <div className="flex items-center mt-4 pt-2 border-t border-gray-100">
            <div className="w-24 flex-shrink-0" />
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
      {Object.keys(llmBreakdownStats).length > 0 && llmBreakdownBrands.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Results by AI Platform</h2>
            <select
              value={llmBreakdownBrandFilter || llmBreakdownBrands[0] || ''}
              onChange={(e) => setLlmBreakdownBrandFilter(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            >
              {llmBreakdownBrands.map((brand, index) => (
                <option key={brand} value={brand}>
                  {brand}{index === 0 && !isCategory && runStatus?.brand === brand ? ' (searched)' : ''}
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
                            ? result.competitors_mentioned?.includes(selectedBrand || '')
                            : result.brand_mentioned;

                          // Calculate position for this result
                          let position: number | null = null;
                          if (result.response_text && selectedBrand && isMentioned) {
                            const brandLower = selectedBrand.toLowerCase();
                            // Use all_brands_mentioned if available (includes all detected brands)
                            const allBrands: string[] = result.all_brands_mentioned && result.all_brands_mentioned.length > 0
                              ? result.all_brands_mentioned.filter((b): b is string => typeof b === 'string')
                              : [runStatus?.brand, ...(result.competitors_mentioned || [])].filter((b): b is string => typeof b === 'string');

                            // First try exact match
                            let foundIndex = allBrands.findIndex(b => b.toLowerCase() === brandLower);

                            // If not found, try partial match
                            if (foundIndex === -1) {
                              foundIndex = allBrands.findIndex(b =>
                                b.toLowerCase().includes(brandLower) || brandLower.includes(b.toLowerCase())
                              );
                            }

                            // If still not found, find position by text search
                            let rank = foundIndex + 1;
                            if (foundIndex === -1) {
                              const brandPos = result.response_text.toLowerCase().indexOf(brandLower);
                              if (brandPos >= 0) {
                                let brandsBeforeCount = 0;
                                for (const b of allBrands) {
                                  const bPos = result.response_text.toLowerCase().indexOf(b.toLowerCase());
                                  if (bPos >= 0 && bPos < brandPos) {
                                    brandsBeforeCount++;
                                  }
                                }
                                rank = brandsBeforeCount + 1;
                              } else {
                                rank = allBrands.length + 1;
                              }
                            }

                            if (rank > 0) position = rank;
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
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">All Results</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Showing {filteredResults.length} of {globallyFilteredResults.filter((r: Result) => !r.error).length} results
            </p>
          </div>
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

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th
                  className="text-left py-3 px-4 cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleTableSort('prompt')}
                >
                  <div className="flex items-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Prompt
                    {tableSortColumn === 'prompt' && (
                      <span className="text-gray-900">{tableSortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                  <div className="text-[10px] font-normal text-gray-400 normal-case tracking-normal mt-0.5">Question sent to AI</div>
                </th>
                <th
                  className="text-left py-3 px-4 cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleTableSort('llm')}
                >
                  <div className="flex items-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    LLM Model
                    {tableSortColumn === 'llm' && (
                      <span className="text-gray-900">{tableSortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                  <div className="text-[10px] font-normal text-gray-400 normal-case tracking-normal mt-0.5">AI model used</div>
                </th>
                <th
                  className="text-center py-3 px-4 cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleTableSort('position')}
                >
                  <div className="flex items-center justify-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Position
                    {tableSortColumn === 'position' && (
                      <span className="text-gray-900">{tableSortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                  <div className="text-[10px] font-normal text-gray-400 normal-case tracking-normal mt-0.5">Rank in response</div>
                </th>
                {!isCategory && (
                  <th
                    className="text-center py-3 px-4 cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleTableSort('mentioned')}
                  >
                    <div className="flex items-center justify-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Mentioned
                      {tableSortColumn === 'mentioned' && (
                        <span className="text-gray-900">{tableSortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                    <div className="text-[10px] font-normal text-gray-400 normal-case tracking-normal mt-0.5">Brand included</div>
                  </th>
                )}
                <th
                  className="text-center py-3 px-4 cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleTableSort('sentiment')}
                >
                  <div className="flex items-center justify-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Sentiment
                    {tableSortColumn === 'sentiment' && (
                      <span className="text-gray-900">{tableSortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                  <div className="text-[10px] font-normal text-gray-400 normal-case tracking-normal mt-0.5">How AI framed brand</div>
                </th>
                <th
                  className="text-left py-3 px-4 cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleTableSort('competitors')}
                >
                  <div className="flex items-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {isCategory ? 'Brands' : 'Competitors'}
                    {tableSortColumn === 'competitors' && (
                      <span className="text-gray-900">{tableSortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                  <div className="text-[10px] font-normal text-gray-400 normal-case tracking-normal mt-0.5">Other brands shown</div>
                </th>
                <th className="text-right py-3 px-4">
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</div>
                  <div className="text-[10px] font-normal text-gray-400 normal-case tracking-normal mt-0.5">View details</div>
                </th>
              </tr>
            </thead>
          </table>
          {/* Scrollable tbody wrapper */}
          <div className="max-h-[600px] overflow-y-auto">
            <table className="w-full">
              <tbody>
              {sortedResults.map((result: Result) => {
                // Calculate position for this result
                let position: number | null = null;
                if (result.response_text && !result.error) {
                  const selectedBrand = isCategory ? llmBreakdownBrands[0] : runStatus?.brand;
                  const brandLower = (selectedBrand || '').toLowerCase();

                  const isMentioned = isCategory
                    ? result.competitors_mentioned?.includes(selectedBrand || '')
                    : result.brand_mentioned;

                  if (isMentioned && brandLower) {
                    const allBrands: string[] = result.all_brands_mentioned && result.all_brands_mentioned.length > 0
                      ? result.all_brands_mentioned.filter((b): b is string => typeof b === 'string')
                      : [runStatus?.brand, ...(result.competitors_mentioned || [])].filter((b): b is string => typeof b === 'string');

                    let foundIndex = allBrands.findIndex(b => b.toLowerCase() === brandLower);
                    if (foundIndex === -1) {
                      foundIndex = allBrands.findIndex(b =>
                        b.toLowerCase().includes(brandLower) || brandLower.includes(b.toLowerCase())
                      );
                    }

                    let rank = foundIndex + 1;
                    if (foundIndex === -1) {
                      const brandPos = result.response_text.toLowerCase().indexOf(brandLower);
                      if (brandPos >= 0) {
                        let brandsBeforeCount = 0;
                        for (const b of allBrands) {
                          const bPos = result.response_text.toLowerCase().indexOf(b.toLowerCase());
                          if (bPos >= 0 && bPos < brandPos) {
                            brandsBeforeCount++;
                          }
                        }
                        rank = brandsBeforeCount + 1;
                      } else {
                        rank = allBrands.length + 1;
                      }
                    }

                    if (rank > 0) position = rank;
                  }
                }

                // Position badge styling
                const getPositionBadge = () => {
                  if (result.error) return <span className="text-sm text-gray-400">-</span>;
                  if (!position) {
                    return (
                      <span className="inline-flex items-center justify-center px-3 py-1 text-xs font-medium text-gray-500 border border-gray-200 rounded-lg bg-white">
                        Not shown
                      </span>
                    );
                  }
                  const colors = position === 1
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : position === 2
                    ? 'bg-gray-50 text-gray-600 border-gray-200'
                    : position === 3
                    ? 'bg-orange-50 text-orange-700 border-orange-200'
                    : 'bg-gray-50 text-gray-500 border-gray-200';
                  return (
                    <span className={`inline-flex items-center justify-center w-10 h-10 text-sm font-semibold rounded-full border-2 ${colors}`}>
                      #{position}
                    </span>
                  );
                };

                // Mentioned badge
                const getMentionedBadge = () => {
                  if (result.error) {
                    return (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-orange-50 text-orange-600 text-xs font-medium rounded-full">
                        <AlertTriangle className="w-3 h-3" />Error
                      </span>
                    );
                  }
                  if (result.brand_mentioned) {
                    return (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-600 text-xs font-medium rounded-full">
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                        Yes
                      </span>
                    );
                  }
                  return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-100 text-gray-500 text-xs font-medium rounded-full">
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>
                      No
                    </span>
                  );
                };

                // Sentiment badge
                const getSentimentBadge = () => {
                  if (result.error) return <span className="text-sm text-gray-400">-</span>;
                  const sentiment = result.brand_sentiment;
                  if (!sentiment || sentiment === 'not_mentioned') {
                    return (
                      <span className="inline-flex items-center px-3 py-1 text-xs font-medium text-gray-500 border border-gray-200 rounded-full bg-white">
                        Not mentioned
                      </span>
                    );
                  }
                  const configs: Record<string, { bg: string; text: string; border: string; label: string }> = {
                    'strong_endorsement': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', label: 'Highly Recommended' },
                    'positive_endorsement': { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', label: 'Recommended' },
                    'neutral_mention': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', label: 'Neutral' },
                    'conditional': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', label: 'With Caveats' },
                    'negative_comparison': { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', label: 'Not Recommended' },
                  };
                  const config = configs[sentiment] || { bg: 'bg-gray-50', text: 'text-gray-500', border: 'border-gray-200', label: 'Unknown' };
                  return (
                    <span className={`inline-flex items-center px-3 py-1 text-xs font-medium rounded-full border ${config.bg} ${config.text} ${config.border}`}>
                      {config.label}
                    </span>
                  );
                };

                // Competitors list
                const getCompetitorsList = () => {
                  if (result.error) return <span className="text-sm text-gray-400">-</span>;
                  const competitors = result.competitors_mentioned || [];
                  if (competitors.length === 0) {
                    return <span className="text-sm text-gray-400">None</span>;
                  }
                  const displayed = competitors.slice(0, 2);
                  const remaining = competitors.length - 2;
                  return (
                    <span className="text-sm text-gray-700">
                      {displayed.join(', ')}
                      {remaining > 0 && (
                        <span className="text-gray-400 ml-1">+{remaining}</span>
                      )}
                    </span>
                  );
                };

                return (
                  <tr
                    key={result.id}
                    className="border-b border-gray-100 cursor-pointer transition-colors hover:bg-gray-50/40"
                    onClick={() => setSelectedResult(result)}
                  >
                    <td className="py-4 px-4">
                        <p className="text-sm text-gray-900 font-medium">{truncate(result.prompt, 40)}</p>
                      </td>
                      <td className="py-4 px-4">
                        <span className="text-sm text-gray-600">{getProviderLabel(result.provider)}</span>
                      </td>
                      <td className="py-4 px-4 text-center">
                        {getPositionBadge()}
                      </td>
                      {!isCategory && (
                        <td className="py-4 px-4 text-center">
                          {getMentionedBadge()}
                        </td>
                      )}
                      <td className="py-4 px-4 text-center">
                        {getSentimentBadge()}
                      </td>
                      <td className="py-4 px-4">
                        {getCompetitorsList()}
                      </td>
                      <td className="py-4 px-4 text-right">
                        <span className="inline-flex items-center gap-1 text-sm text-gray-900 font-medium">
                          View <ExternalLink className="w-3 h-3" />
                        </span>
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
              // Generate CSV content
              const headers = ['Prompt', 'LLM', 'Position', 'Brand Mentioned', 'Sentiment', 'Competitors'];
              const rows = sortedResults.map((result: Result) => {
                // Calculate position
                let position: number | string = '-';
                if (result.response_text && !result.error) {
                  const selectedBrand = isCategory ? llmBreakdownBrands[0] : runStatus?.brand;
                  const brandLower = (selectedBrand || '').toLowerCase();
                  const isMentioned = isCategory
                    ? result.competitors_mentioned?.includes(selectedBrand || '')
                    : result.brand_mentioned;

                  if (isMentioned && brandLower) {
                    const allBrands: string[] = result.all_brands_mentioned && result.all_brands_mentioned.length > 0
                      ? result.all_brands_mentioned.filter((b): b is string => typeof b === 'string')
                      : [runStatus?.brand, ...(result.competitors_mentioned || [])].filter((b): b is string => typeof b === 'string');
                    let foundIndex = allBrands.findIndex(b => b.toLowerCase() === brandLower);
                    if (foundIndex === -1) {
                      foundIndex = allBrands.findIndex(b =>
                        b.toLowerCase().includes(brandLower) || brandLower.includes(b.toLowerCase())
                      );
                    }
                    if (foundIndex >= 0) position = foundIndex + 1;
                  }
                }

                const sentimentLabel = result.brand_sentiment === 'strong_endorsement' ? 'Highly Recommended' :
                  result.brand_sentiment === 'positive_endorsement' ? 'Recommended' :
                  result.brand_sentiment === 'conditional' ? 'With Caveats' :
                  result.brand_sentiment === 'negative_comparison' ? 'Not Recommended' :
                  result.brand_sentiment === 'neutral_mention' ? 'Neutral' : 'Not mentioned';

                return [
                  `"${result.prompt.replace(/"/g, '""')}"`,
                  getProviderLabel(result.provider),
                  position,
                  result.error ? 'Error' : result.brand_mentioned ? 'Yes' : 'No',
                  sentimentLabel,
                  `"${(result.competitors_mentioned || []).join(', ')}"`
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
      </div>
    </div>
  );
  };

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
          <p className="text-4xl font-bold text-gray-900">{runStatus?.total_calls}</p>
          {(runStatus?.failed_calls ?? 0) > 0 && (
            <p className="text-xs text-red-500 mt-1">{runStatus?.failed_calls} failed</p>
          )}
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 text-center">
          <p className="text-sm text-gray-500 mb-1">Total Cost</p>
          <p className="text-4xl font-bold text-gray-900">{formatCurrency(runStatus?.actual_cost ?? 0)}</p>
        </div>
      </div>

      {/* Charts Section with Tabs */}
      {scatterPlotData.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
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
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#16a34a' }} />
                    <span className="text-xs text-gray-500">Highly Recommended</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#4ade80' }} />
                    <span className="text-xs text-gray-500">Recommended</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#9ca3af' }} />
                    <span className="text-xs text-gray-500">Neutral</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#fbbf24' }} />
                    <span className="text-xs text-gray-500">With Caveats</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#ef4444' }} />
                    <span className="text-xs text-gray-500">Not Recommended</span>
                  </div>
                </div>
              )}

              <div>
                  <div className="h-[450px] [&_.recharts-surface]:outline-none [&_.recharts-wrapper]:outline-none [&_svg]:outline-none [&_svg]:focus:outline-none [&_*]:focus:outline-none [&_*]:focus-visible:outline-none">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 50 }}>
                      {/* Horizontal band shading - green gradient (darker = better ranking) */}
                      <ReferenceArea y1={-0.5} y2={0.5} fill="#86efac" fillOpacity={0.5} />
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
                                    data.sentiment === 'strong_endorsement' ? 'text-green-600' :
                                    data.sentiment === 'positive_endorsement' ? 'text-lime-600' :
                                    data.sentiment === 'neutral_mention' ? 'text-gray-600' :
                                    data.sentiment === 'conditional' ? 'text-amber-500' :
                                    data.sentiment === 'negative_comparison' ? 'text-red-500' : ''
                                  }`}>
                                    {data.sentiment === 'strong_endorsement' ? 'Highly Recommended' :
                                     data.sentiment === 'positive_endorsement' ? 'Recommended' :
                                     data.sentiment === 'neutral_mention' ? 'Neutral' :
                                     data.sentiment === 'conditional' ? 'With Caveats' :
                                     data.sentiment === 'negative_comparison' ? 'Not Recommended' : ''}
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
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#16a34a' }} />
                    <span className="text-xs text-gray-500">Highly Recommended</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#4ade80' }} />
                    <span className="text-xs text-gray-500">Recommended</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#9ca3af' }} />
                    <span className="text-xs text-gray-500">Neutral</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#fbbf24' }} />
                    <span className="text-xs text-gray-500">With Caveats</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#ef4444' }} />
                    <span className="text-xs text-gray-500">Not Recommended</span>
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
                        <ReferenceArea x1={-0.5} x2={0.5} fill="#86efac" fillOpacity={0.5} /> {/* 1 */}
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
                                      ? dot.sentiment === 'strong_endorsement' ? '#22c55e'
                                        : dot.sentiment === 'positive_endorsement' ? '#84cc16'
                                        : dot.sentiment === 'neutral_mention' ? '#6b7280'
                                        : dot.sentiment === 'conditional' ? '#fcd34d'
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
                                  <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg min-w-[280px] max-w-[320px] text-left">
                                    <p className="text-sm font-semibold text-gray-900 mb-1">{dot.prompt.length > 70 ? dot.prompt.substring(0, 70) + '...' : dot.prompt}</p>
                                    <p className="text-sm text-gray-700">
                                      {dot.rank === 0 ? 'Not shown' : dot.rank === 1 ? 'Shown as: #1 (Top result)' : `Shown as: #${dot.rank}`}
                                    </p>
                                    {showSentimentColors && dot.sentiment && dot.sentiment !== 'not_mentioned' && (
                                      <p className={`text-xs mt-1 ${
                                        dot.sentiment === 'strong_endorsement' ? 'text-green-600' :
                                        dot.sentiment === 'positive_endorsement' ? 'text-lime-600' :
                                        dot.sentiment === 'neutral_mention' ? 'text-gray-600' :
                                        dot.sentiment === 'conditional' ? 'text-amber-500' :
                                        dot.sentiment === 'negative_comparison' ? 'text-red-500' : ''
                                      }`}>
                                        {dot.sentiment === 'strong_endorsement' ? 'Highly Recommended' :
                                         dot.sentiment === 'positive_endorsement' ? 'Recommended' :
                                         dot.sentiment === 'neutral_mention' ? 'Neutral' :
                                         dot.sentiment === 'conditional' ? 'With Caveats' :
                                         dot.sentiment === 'negative_comparison' ? 'Not Recommended' : ''}
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
      <div className="bg-gradient-to-r from-gray-50 to-white rounded-xl shadow-sm border border-gray-200 p-6">
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
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
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
                                  <p className="text-xs text-gray-500 mb-2">Grounding Confidence:</p>
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
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
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
                    <div>Opportunity</div>
                    <div className="text-xs text-gray-400 font-normal">priority score</div>
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
                          <span className={`font-medium ${row.brandRate >= 50 ? 'text-green-600' : row.brandRate >= 25 ? 'text-yellow-600' : 'text-red-500'}`}>
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
                                            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${snippetInfo.isBrand ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
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
                  <th className="text-center py-3 px-3 text-sm font-medium text-gray-600">Advantage</th>
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
                              <span key={provider} className="inline-flex items-center px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs font-medium rounded">
                                {getProviderLabel(provider).split(' ')[0]}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="text-center py-3 px-3">
                          <div className="flex flex-col items-center">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              row.brandSentimentIndex >= 4 ? 'bg-green-100 text-green-700' :
                              row.brandSentimentIndex >= 3 ? 'bg-green-50 text-green-600' :
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
                            row.direction === 'brand' ? 'bg-green-100 text-green-700' :
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
                                    'strong_endorsement': 'bg-green-100 text-green-700',
                                    'positive_endorsement': 'bg-green-50 text-green-600',
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
                                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${snippetInfo.isBrand ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
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
              <span className="text-gray-500">Total Cost: </span>
              <span className="font-medium text-gray-900">{formatCurrency(runStatus?.actual_cost ?? 0)}</span>
            </div>
          </div>
          <div className="text-gray-400 text-xs">{runStatus?.completed_calls ?? 0} successful calls · {runStatus?.failed_calls ?? 0} failed</div>
        </div>
      </div>
    </div>
  );

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
    if (score >= 4.5) return 'Highly Recommended';
    if (score >= 3.5) return 'Recommended';
    if (score >= 2.5) return 'Neutral';
    if (score >= 1.5) return 'With Caveats';
    if (score >= 0.5) return 'Not Recommended';
    return 'N/A';
  };

  // Brand-Source Heatmap data (main scope for modal access)
  const brandSourceHeatmap = useMemo(() => {
    if (!runStatus) return { brands: [], sources: [], data: [], brandTotals: {} as Record<string, number>, searchedBrand: '', sentimentData: {} as Record<string, Record<string, { total: number; sum: number; avg: number }>> };

    const sourceBrandCounts: Record<string, Record<string, number>> = {};
    const sourceBrandSentiments: Record<string, Record<string, { total: number; sum: number }>> = {};
    const brandTotalMentions: Record<string, number> = {};

    // Process all results to get per-brand citation counts per source
    const results = globallyFilteredResults.filter((r: Result) => {
      if (r.error || !r.sources || r.sources.length === 0) return false;
      if (heatmapProviderFilter !== 'all' && r.provider !== heatmapProviderFilter) return false;
      return true;
    });

    for (const result of results) {
      if (!result.sources) continue;

      // Get all brands mentioned in this result with their sentiments
      const brandsInResult: Array<{ brand: string; sentiment: string | null }> = [];
      if (result.brand_mentioned && runStatus.brand) {
        brandsInResult.push({ brand: runStatus.brand, sentiment: result.brand_sentiment });
      }
      if (result.competitors_mentioned) {
        result.competitors_mentioned.forEach(comp => {
          brandsInResult.push({ brand: comp, sentiment: result.competitor_sentiments?.[comp] || null });
        });
      }

      // Count brand mentions for sorting
      brandsInResult.forEach(({ brand }) => {
        brandTotalMentions[brand] = (brandTotalMentions[brand] || 0) + 1;
      });

      if (brandsInResult.length === 0) continue;

      // Track which domains have been counted for each brand in this response
      const seenDomainBrandPairs = new Set<string>();

      for (const source of result.sources) {
        if (!source.url) continue;
        const domain = getDomain(source.url);
        const sourceText = `${source.title || ''} ${source.url}`.toLowerCase();

        if (!sourceBrandCounts[domain]) {
          sourceBrandCounts[domain] = {};
          sourceBrandSentiments[domain] = {};
        }

        // Associate this source with all brands mentioned in the same response
        // This shows which sources are cited when each brand is discussed
        brandsInResult.forEach(({ brand, sentiment }) => {
          const pairKey = `${domain}:${brand}`;

          if (!seenDomainBrandPairs.has(pairKey)) {
            seenDomainBrandPairs.add(pairKey);
            sourceBrandCounts[domain][brand] = (sourceBrandCounts[domain][brand] || 0) + 1;

            // Track sentiment
            if (!sourceBrandSentiments[domain][brand]) {
              sourceBrandSentiments[domain][brand] = { total: 0, sum: 0 };
            }
            if (sentiment && sentimentScores[sentiment] !== undefined) {
              sourceBrandSentiments[domain][brand].total += 1;
              sourceBrandSentiments[domain][brand].sum += sentimentScores[sentiment];
            }
          }
        });
      }
    }

    // Get top 15 sources by total citations (increased from 10 to show more coverage)
    const topSources = Object.entries(sourceBrandCounts)
      .map(([domain, brands]) => ({
        domain,
        total: Object.values(brands).reduce((sum, count) => sum + count, 0),
        brands,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);

    // Sort brands: searched brand first, then by total mentions
    const searchedBrand = runStatus.brand;
    const brandList = Object.keys(brandTotalMentions)
      .sort((a, b) => {
        if (a === searchedBrand) return -1;
        if (b === searchedBrand) return 1;
        return brandTotalMentions[b] - brandTotalMentions[a];
      });

    // Build heatmap data with counts
    const heatmapData: Array<{ domain: string; total: number; [key: string]: string | number }> = topSources.map(source => ({
      domain: source.domain,
      total: source.total,
      ...brandList.reduce((acc, brand) => {
        acc[brand] = source.brands[brand] || 0;
        return acc;
      }, {} as Record<string, number>),
    }));

    // Build sentiment data
    const sentimentData: Record<string, Record<string, { total: number; sum: number; avg: number }>> = {};
    topSources.forEach(source => {
      sentimentData[source.domain] = {};
      brandList.forEach(brand => {
        const data = sourceBrandSentiments[source.domain]?.[brand];
        if (data && data.total > 0) {
          sentimentData[source.domain][brand] = {
            ...data,
            avg: data.sum / data.total,
          };
        } else {
          sentimentData[source.domain][brand] = { total: 0, sum: 0, avg: 0 };
        }
      });
    });

    return {
      brands: brandList,
      sources: topSources.map(s => s.domain),
      data: heatmapData,
      brandTotals: brandTotalMentions,
      searchedBrand,
      sentimentData,
    };
  }, [runStatus, globallyFilteredResults, heatmapProviderFilter]);

  // Handler for heatmap cell click - find matching results
  const handleHeatmapCellClick = useCallback((domain: string, brand: string) => {
    if (!runStatus) return;

    // Find results that:
    // 1. Have a source from the specified domain
    // 2. Mention the specified brand in the response
    // This matches the heatmap display logic (sources cited when brand is mentioned)
    const matchingResults = globallyFilteredResults.filter((result: Result) => {
      if (result.error || !result.sources || result.sources.length === 0) return false;
      if (heatmapProviderFilter !== 'all' && result.provider !== heatmapProviderFilter) return false;

      // Check if brand is mentioned in the response
      const brandMentioned = brand === runStatus.brand
        ? result.brand_mentioned
        : result.competitors_mentioned?.includes(brand);
      if (!brandMentioned) return false;

      // Check if source domain is cited in the same response
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

  // Sources Tab Content
  const SourcesTab = () => {
    // Helper to extract domain from URL
    const extractDomain = (url: string): string => {
      try {
        const hostname = new URL(url).hostname;
        return hostname.replace(/^www\./, '');
      } catch {
        return url;
      }
    };

    // State for Brand Website Citations filters and expansion
    const [brandCitationsBrandFilter, setBrandCitationsBrandFilter] = useState<string>('all');
    const [brandCitationsProviderFilter, setBrandCitationsProviderFilter] = useState<string>('all');
    const [expandedBrandCitations, setExpandedBrandCitations] = useState<Set<string>>(new Set());

    // State for Source Positioning chart
    const [sourcePositioningBrandFilter, setSourcePositioningBrandFilter] = useState<string>('all');

    // Calculate Source Positioning data - sources plotted by importance vs sentiment
    const sourcePositioningData = useMemo(() => {
      if (!runStatus) return [];

      const selectedBrand = sourcePositioningBrandFilter === 'all' ? null : sourcePositioningBrandFilter;

      // Get results with sources
      const resultsWithSources = globallyFilteredResults.filter(
        (r: Result) => !r.error && r.sources && r.sources.length > 0
      );

      if (resultsWithSources.length === 0) return [];

      // Aggregate data per domain
      const domainStats: Record<string, {
        domain: string;
        citationCount: number;
        providers: Set<string>;
        sentimentScores: number[];
        positions: number[];
        brandMentioned: number; // times cited when selected brand was mentioned
        totalCitations: number;
      }> = {};

      resultsWithSources.forEach((r: Result) => {
        // Check if this result mentions the selected brand (or any brand if all)
        const brandMentioned = selectedBrand
          ? (r.brand_mentioned && runStatus.brand === selectedBrand) ||
            r.competitors_mentioned?.includes(selectedBrand)
          : r.brand_mentioned || (r.competitors_mentioned && r.competitors_mentioned.length > 0);

        r.sources?.forEach((source) => {
          if (!source.url) return;
          const domain = extractDomain(source.url);

          if (!domainStats[domain]) {
            domainStats[domain] = {
              domain,
              citationCount: 0,
              providers: new Set(),
              sentimentScores: [],
              positions: [],
              brandMentioned: 0,
              totalCitations: 0,
            };
          }

          domainStats[domain].citationCount++;
          domainStats[domain].totalCitations++;
          domainStats[domain].providers.add(r.provider);

          // Track sentiment when brand is mentioned
          if (brandMentioned) {
            domainStats[domain].brandMentioned++;

            // Get sentiment score for the selected brand
            let sentimentScore = 3; // Default neutral
            if (selectedBrand) {
              if (selectedBrand === runStatus.brand && r.brand_sentiment) {
                const sentimentMap: Record<string, number> = {
                  'strong_endorsement': 5,
                  'positive_endorsement': 4,
                  'neutral_mention': 3,
                  'conditional': 2,
                  'negative_comparison': 1,
                };
                sentimentScore = sentimentMap[r.brand_sentiment] || 3;
              } else if (r.competitor_sentiments?.[selectedBrand]) {
                const sentimentMap: Record<string, number> = {
                  'strong_endorsement': 5,
                  'positive_endorsement': 4,
                  'neutral_mention': 3,
                  'conditional': 2,
                  'negative_comparison': 1,
                };
                sentimentScore = sentimentMap[r.competitor_sentiments[selectedBrand]] || 3;
              }
            } else if (r.brand_sentiment) {
              const sentimentMap: Record<string, number> = {
                'strong_endorsement': 5,
                'positive_endorsement': 4,
                'neutral_mention': 3,
                'conditional': 2,
                'negative_comparison': 1,
              };
              sentimentScore = sentimentMap[r.brand_sentiment] || 3;
            }
            domainStats[domain].sentimentScores.push(sentimentScore);

            // Get position using the helper function
            const position = getResultPosition(r);
            if (position && position > 0) {
              domainStats[domain].positions.push(position);
            }
          }
        });
      });

      // Calculate importance score and average sentiment for each domain
      const maxCitations = Math.max(...Object.values(domainStats).map(d => d.citationCount), 1);

      return Object.values(domainStats)
        .filter(d => d.citationCount >= 2) // Only show sources with at least 2 citations
        .map(d => {
          // Source Importance Score (0-100):
          // - 40% based on citation count (normalized)
          // - 30% based on provider diversity (cited by multiple models = more important)
          // - 30% based on brand mention rate when cited
          const citationScore = (d.citationCount / maxCitations) * 40;
          const providerDiversityScore = Math.min(d.providers.size / 4, 1) * 30; // Max out at 4 providers
          const brandMentionRate = d.totalCitations > 0 ? (d.brandMentioned / d.totalCitations) : 0;
          const brandMentionScore = brandMentionRate * 30;

          const importanceScore = citationScore + providerDiversityScore + brandMentionScore;

          // Average sentiment (default to 3/neutral if no sentiment data)
          const avgSentiment = d.sentimentScores.length > 0
            ? d.sentimentScores.reduce((a, b) => a + b, 0) / d.sentimentScores.length
            : 3;

          // Average position
          const avgPosition = d.positions.length > 0
            ? d.positions.reduce((a, b) => a + b, 0) / d.positions.length
            : null;

          return {
            domain: d.domain,
            citationCount: d.citationCount,
            providerCount: d.providers.size,
            providers: Array.from(d.providers),
            importanceScore: Math.round(importanceScore),
            avgSentiment: Math.round(avgSentiment * 10) / 10,
            avgPosition,
            brandMentionRate: Math.round(brandMentionRate * 100),
          };
        })
        .sort((a, b) => b.importanceScore - a.importanceScore)
        .slice(0, 20); // Top 20 sources
    }, [runStatus, globallyFilteredResults, sourcePositioningBrandFilter]);

    // Get list of brands for the source positioning filter
    const sourcePositioningBrandOptions = useMemo(() => {
      if (!runStatus) return [];
      const options: { value: string; label: string }[] = [
        { value: 'all', label: 'All Brands' }
      ];

      // Add searched brand
      if (runStatus.brand) {
        options.push({ value: runStatus.brand, label: `${runStatus.brand} (searched)` });
      }

      // Add competitors
      const competitors = new Set<string>();
      globallyFilteredResults.forEach((r: Result) => {
        r.competitors_mentioned?.forEach(comp => competitors.add(comp));
      });
      Array.from(competitors).sort().forEach(comp => {
        options.push({ value: comp, label: comp });
      });

      return options;
    }, [runStatus, globallyFilteredResults]);

    // Calculate brand website citations with URL details
    const brandWebsiteCitations = useMemo(() => {
      const brandDomain = runStatus?.brand?.toLowerCase().replace(/\s+/g, '') || '';
      const searchedBrandLower = runStatus?.brand?.toLowerCase() || '';
      // Filter out the searched brand from trackedBrands to avoid duplicates (trackedBrands stores lowercase)
      const competitorsOnly = Array.from(trackedBrands).filter(b => b.toLowerCase() !== searchedBrandLower);
      const allBrandsToTrack = [runStatus?.brand || '', ...competitorsOnly].filter(Boolean);

      // Structure to hold citation data per brand
      const brandCitationData: Record<string, {
        count: number;
        urls: { url: string; title: string; provider: string; count: number }[];
        providers: Set<string>;
      }> = {};

      let totalResultsWithSources = 0;

      // Filter results by selected filters
      const filteredResults = globallyFilteredResults
        .filter((r: Result) => !r.error && r.sources && r.sources.length > 0)
        .filter((r: Result) => {
          if (brandCitationsProviderFilter !== 'all' && r.provider !== brandCitationsProviderFilter) return false;
          return true;
        });

      filteredResults.forEach((r: Result) => {
        totalResultsWithSources++;
        r.sources?.forEach((source) => {
          if (source.url) {
            const domain = extractDomain(source.url).toLowerCase();

            // Check each brand (including searched brand and competitors)
            allBrandsToTrack.forEach((brand) => {
              const brandDomainCheck = brand.toLowerCase().replace(/\s+/g, '');
              if (domain.includes(brandDomainCheck) || brandDomainCheck.includes(domain.replace('.com', '').replace('.org', '').replace('.net', ''))) {
                if (!brandCitationData[brand]) {
                  brandCitationData[brand] = { count: 0, urls: [], providers: new Set() };
                }
                brandCitationData[brand].count++;
                brandCitationData[brand].providers.add(r.provider);

                // Track individual URLs
                const existingUrl = brandCitationData[brand].urls.find(u => u.url === source.url);
                if (existingUrl) {
                  existingUrl.count++;
                } else {
                  brandCitationData[brand].urls.push({
                    url: source.url,
                    title: source.title || '',
                    provider: r.provider,
                    count: 1
                  });
                }
              }
            });
          }
        });
      });

      // Convert to array and sort
      const citationsArray = Object.entries(brandCitationData)
        .map(([brand, data]) => ({
          brand,
          count: data.count,
          urls: data.urls.sort((a, b) => b.count - a.count),
          providers: Array.from(data.providers),
          rate: totalResultsWithSources > 0 ? (data.count / totalResultsWithSources) * 100 : 0,
          isSearchedBrand: brand === runStatus?.brand
        }))
        .sort((a, b) => {
          // Searched brand first, then by count
          if (a.isSearchedBrand) return -1;
          if (b.isSearchedBrand) return 1;
          return b.count - a.count;
        });

      // Filter by brand filter (case-insensitive)
      const filteredCitations = brandCitationsBrandFilter === 'all'
        ? citationsArray
        : citationsArray.filter(c => c.brand.toLowerCase() === brandCitationsBrandFilter.toLowerCase());

      return {
        citations: filteredCitations,
        totalResultsWithSources,
        totalBrandsWithCitations: citationsArray.length
      };
    }, [globallyFilteredResults, runStatus?.brand, trackedBrands, brandCitationsBrandFilter, brandCitationsProviderFilter]);

    // Legacy brandPresenceData for summary stats (keeping for backwards compat)
    const brandPresenceData = useMemo(() => {
      const searchedBrandData = brandWebsiteCitations.citations.find(c => c.isSearchedBrand);
      return {
        brandCitations: searchedBrandData?.count || 0,
        brandCitationRate: searchedBrandData?.rate || 0,
        totalResultsWithSources: brandWebsiteCitations.totalResultsWithSources,
        competitorCitations: brandWebsiteCitations.citations
          .filter(c => !c.isSearchedBrand)
          .map(c => ({ name: c.brand, count: c.count, rate: c.rate }))
      };
    }, [brandWebsiteCitations]);

    // Categorize a domain into a source type
    const categorizeDomain = (domain: string): string => {
      const d = domain.toLowerCase();

      // Social Media
      const socialMediaSites = [
        // Major platforms
        'reddit.com', 'twitter.com', 'x.com', 'facebook.com', 'fb.com', 'instagram.com', 'tiktok.com',
        'linkedin.com', 'pinterest.com', 'snapchat.com', 'discord.com', 'discord.gg',
        // Messaging (with public content)
        'whatsapp.com', 'telegram.org', 't.me', 'signal.org',
        // Newer/Alternative platforms
        'threads.net', 'mastodon.social', 'mastodon.online', 'bsky.app', 'bluesky', 'bereal.com',
        'lemon8-app.com', 'clubhouse.com', 'nextdoor.com',
        // Media sharing
        'flickr.com', 'imgur.com', 'giphy.com', '500px.com', 'deviantart.com',
        // International
        'vk.com', 'weibo.com', 'weixin.qq.com', 'wechat.com', 'line.me', 'kakaotalk',
        // Professional/Niche
        'behance.net', 'dribbble.com', 'goodreads.com', 'letterboxd.com', 'untappd.com', 'strava.com'
      ];
      if (socialMediaSites.some(s => d.includes(s))) {
        return 'Social Media';
      }

      // Video Platforms
      const videoSites = [
        // Major platforms
        'youtube.com', 'youtu.be', 'vimeo.com', 'twitch.tv', 'dailymotion.com',
        // Streaming services
        'netflix.com', 'hulu.com', 'disneyplus.com', 'hbomax.com', 'max.com', 'peacocktv.com',
        'paramountplus.com', 'appletv.com', 'primevideo.com', 'crunchyroll.com', 'funimation.com',
        // Video hosting/sharing
        'wistia.com', 'brightcove.com', 'vidyard.com', 'loom.com', 'streamable.com',
        'rumble.com', 'bitchute.com', 'odysee.com', 'd.tube',
        // Educational video
        'ted.com', 'masterclass.com', 'skillshare.com', 'udemy.com', 'coursera.org', 'edx.org',
        'khanacademy.org', 'lynda.com', 'pluralsight.com'
      ];
      if (videoSites.some(s => d.includes(s))) {
        return 'Video';
      }

      // Reference/Educational
      const referenceSites = [
        // Encyclopedias & Wikis
        'wikipedia.org', 'wikimedia.org', 'wiktionary.org', 'wikihow.com', 'fandom.com',
        'britannica.com', 'encyclopedia.com', 'scholarpedia.org', 'citizendium.org',
        // Dictionaries & Language
        'merriam-webster.com', 'dictionary.com', 'thesaurus.com', 'oxforddictionaries.com',
        'cambridge.org', 'collinsdictionary.com', 'wordreference.com', 'linguee.com',
        // Academic & Research
        'scholar.google.com', 'researchgate.net', 'academia.edu', 'jstor.org', 'pubmed.gov',
        'ncbi.nlm.nih.gov', 'arxiv.org', 'ssrn.com', 'sciencedirect.com', 'springer.com',
        'nature.com', 'science.org', 'ieee.org', 'acm.org', 'plos.org',
        // Universities (.edu will catch most)
        '.edu', 'stanford.edu', 'mit.edu', 'harvard.edu', 'berkeley.edu', 'yale.edu',
        'princeton.edu', 'columbia.edu', 'cornell.edu', 'ox.ac.uk', 'cam.ac.uk',
        // How-to & Learning
        'instructables.com', 'howstuffworks.com', 'lifehacker.com', 'makeuseof.com',
        'investopedia.com', 'healthline.com', 'webmd.com', 'mayoclinic.org', 'nih.gov'
      ];
      if (referenceSites.some(s => d.includes(s))) {
        return 'Reference';
      }

      // News & Media - Major outlets
      const majorNewsOutlets = [
        // US National
        'nytimes.com', 'wsj.com', 'washingtonpost.com', 'usatoday.com', 'latimes.com', 'chicagotribune.com',
        'nypost.com', 'nydailynews.com', 'sfchronicle.com', 'bostonglobe.com', 'dallasnews.com',
        // US Cable/Network
        'cnn.com', 'foxnews.com', 'msnbc.com', 'nbcnews.com', 'abcnews.go.com', 'cbsnews.com', 'pbs.org', 'npr.org',
        // UK
        'bbc.com', 'bbc.co.uk', 'theguardian.com', 'telegraph.co.uk', 'dailymail.co.uk', 'independent.co.uk',
        'mirror.co.uk', 'thesun.co.uk', 'express.co.uk', 'metro.co.uk', 'standard.co.uk', 'sky.com',
        // International
        'reuters.com', 'apnews.com', 'afp.com', 'aljazeera.com', 'dw.com', 'france24.com', 'rt.com',
        'scmp.com', 'straitstimes.com', 'theaustralian.com.au', 'abc.net.au', 'cbc.ca', 'globalnews.ca',
        // Business/Finance
        'forbes.com', 'bloomberg.com', 'businessinsider.com', 'cnbc.com', 'marketwatch.com', 'ft.com',
        'economist.com', 'fortune.com', 'inc.com', 'entrepreneur.com', 'fastcompany.com', 'qz.com',
        // Tech
        'techcrunch.com', 'wired.com', 'theverge.com', 'engadget.com', 'arstechnica.com', 'mashable.com',
        'gizmodo.com', 'cnet.com', 'zdnet.com', 'venturebeat.com', 'thenextweb.com', 'recode.net',
        'techradar.com', 'tomshardware.com', 'anandtech.com', '9to5mac.com', '9to5google.com', 'macrumors.com',
        // Entertainment
        'variety.com', 'hollywoodreporter.com', 'deadline.com', 'ew.com', 'people.com', 'tmz.com',
        'rollingstone.com', 'billboard.com', 'pitchfork.com', 'ign.com', 'gamespot.com', 'kotaku.com', 'polygon.com',
        // Sports
        'espn.com', 'sports.yahoo.com', 'bleacherreport.com', 'si.com', 'cbssports.com', 'theathletic.com',
        // Other news
        'huffpost.com', 'buzzfeednews.com', 'vox.com', 'theatlantic.com', 'newyorker.com', 'slate.com',
        'salon.com', 'thedailybeast.com', 'axios.com', 'politico.com', 'thehill.com', 'realclearpolitics.com'
      ];
      // News & Media - Pattern matching for generic news sites
      const newsPatterns = ['news', 'daily', 'times', 'post', 'herald', 'tribune', 'journal', 'gazette',
        'observer', 'chronicle', 'examiner', 'inquirer', 'dispatch', 'sentinel', 'courier', 'press',
        'register', 'record', 'reporter', 'bulletin', 'beacon', 'argus', 'banner', 'ledger', 'star',
        'sun', 'mirror', 'express', 'mail', 'telegraph', 'monitor', 'insider', 'today'];

      if (majorNewsOutlets.some(s => d.includes(s)) || newsPatterns.some(p => d.includes(p))) {
        return 'News & Media';
      }

      // E-commerce
      const ecommerceSites = [
        // Major marketplaces
        'amazon.com', 'amazon.co.uk', 'amazon.ca', 'amazon.de', 'ebay.com', 'ebay.co.uk',
        'walmart.com', 'target.com', 'costco.com', 'samsclub.com', 'kohls.com', 'macys.com',
        'nordstrom.com', 'jcpenney.com', 'homedepot.com', 'lowes.com', 'menards.com',
        // Electronics
        'bestbuy.com', 'newegg.com', 'bhphotovideo.com', 'adorama.com', 'microcenter.com',
        // Fashion
        'zappos.com', 'asos.com', 'zara.com', 'hm.com', 'uniqlo.com', 'gap.com', 'nike.com',
        'adidas.com', 'footlocker.com', 'rei.com', 'patagonia.com', 'lululemon.com',
        // Specialty
        'etsy.com', 'wayfair.com', 'overstock.com', 'chewy.com', 'petco.com', 'petsmart.com',
        'sephora.com', 'ulta.com', 'bathandbodyworks.com', 'williams-sonoma.com', 'crateandbarrel.com',
        // International
        'alibaba.com', 'aliexpress.com', 'wish.com', 'shein.com', 'temu.com', 'rakuten.com',
        'flipkart.com', 'jd.com', 'taobao.com', 'mercadolibre.com',
        // Platforms
        'shopify.com', 'bigcommerce.com', 'squarespace.com', 'wix.com', 'woocommerce.com',
        // Grocery
        'instacart.com', 'freshdirect.com', 'peapod.com', 'shipt.com', 'doordash.com', 'ubereats.com',
        // Pattern matching
        'shop', 'store', 'buy', 'market', 'outlet', 'deals'
      ];
      if (ecommerceSites.some(s => d.includes(s))) {
        return 'E-commerce';
      }

      // Review Sites
      const reviewSites = [
        // General reviews
        'yelp.com', 'tripadvisor.com', 'trustpilot.com', 'sitejabber.com', 'bbb.org',
        'consumerreports.org', 'consumersearch.com', 'which.co.uk',
        // Software/Business reviews
        'g2.com', 'capterra.com', 'softwareadvice.com', 'getapp.com', 'trustradius.com',
        'gartner.com', 'forrester.com', 'pcmag.com',
        // Employment
        'glassdoor.com', 'indeed.com', 'comparably.com', 'kununu.com',
        // Product reviews
        'wirecutter.com', 'rtings.com', 'tomsguide.com', 'digitaltrends.com', 'reviewed.com',
        'thespruce.com', 'foodnetwork.com', 'allrecipes.com', 'epicurious.com',
        // Travel
        'booking.com', 'hotels.com', 'expedia.com', 'kayak.com', 'airbnb.com', 'vrbo.com',
        // Auto
        'edmunds.com', 'kbb.com', 'caranddriver.com', 'motortrend.com', 'autotrader.com',
        // Real estate
        'zillow.com', 'realtor.com', 'redfin.com', 'trulia.com', 'apartments.com',
        // Pattern matching
        'reviews', 'review', 'rating', 'rated', 'compare', 'versus', 'vs'
      ];
      if (reviewSites.some(s => d.includes(s))) {
        return 'Reviews';
      }

      // Forums & Q&A
      const forumSites = [
        // Major Q&A
        'quora.com', 'answers.com', 'ask.com', 'answers.yahoo.com', 'chacha.com',
        // Tech forums
        'stackoverflow.com', 'stackexchange.com', 'superuser.com', 'serverfault.com',
        'askubuntu.com', 'mathoverflow.net', 'github.com', 'gitlab.com', 'bitbucket.org',
        // General forums
        'reddit.com', 'digg.com', 'slashdot.org', 'hackernews.com', 'news.ycombinator.com',
        'voat.co', 'hubpages.com', 'xda-developers.com', 'androidcentral.com',
        // Hobby/Interest forums
        'avsforum.com', 'head-fi.org', 'audiogon.com', 'dpreview.com', 'fredmiranda.com',
        'flyertalk.com', 'fatwalletfinance.com', 'bogleheads.org', 'early-retirement.org',
        // Platform indicators
        'discourse', 'forum', 'forums', 'community', 'communities', 'discuss', 'discussion',
        'board', 'boards', 'bbs', 'phpbb', 'vbulletin', 'xenforo', 'invision'
      ];
      if (forumSites.some(s => d.includes(s))) {
        return 'Forums & Q&A';
      }

      // Government & Organizations
      const govSites = [
        // Government TLDs
        '.gov', '.gov.uk', '.gov.au', '.gov.ca', '.govt.nz', '.gob', '.gouv',
        // US Government
        'usa.gov', 'whitehouse.gov', 'congress.gov', 'senate.gov', 'house.gov',
        'supremecourt.gov', 'uscourts.gov', 'state.gov', 'treasury.gov', 'irs.gov',
        'ssa.gov', 'medicare.gov', 'va.gov', 'hud.gov', 'usda.gov', 'epa.gov',
        'fda.gov', 'cdc.gov', 'fbi.gov', 'cia.gov', 'nsa.gov', 'dhs.gov',
        // International organizations
        'un.org', 'who.int', 'worldbank.org', 'imf.org', 'wto.org', 'nato.int',
        'europa.eu', 'ec.europa.eu', 'oecd.org', 'unicef.org', 'unesco.org',
        // Non-profits & NGOs
        '.org', 'redcross.org', 'salvationarmy.org', 'habitat.org', 'aclu.org',
        'eff.org', 'fsf.org', 'creativecommons.org', 'mozilla.org', 'apache.org'
      ];
      if (govSites.some(s => d.includes(s))) {
        return 'Government';
      }

      // Blogs & Personal
      const blogSites = [
        // Blogging platforms
        'medium.com', 'substack.com', 'blogger.com', 'blogspot.com', 'wordpress.com',
        'wordpress.org', 'tumblr.com', 'ghost.io', 'ghost.org', 'svbtle.com',
        'typepad.com', 'livejournal.com', 'wix.com', 'squarespace.com', 'weebly.com',
        // Newsletter platforms
        'buttondown.email', 'revue.co', 'mailchimp.com', 'convertkit.com', 'beehiiv.com',
        // Personal site indicators
        'blog', 'blogs', 'personal', 'journal', 'diary', 'thoughts', 'musings',
        // Developer blogs
        'dev.to', 'hashnode.com', 'hashnode.dev', 'mirror.xyz'
      ];
      if (blogSites.some(s => d.includes(s))) {
        return 'Blogs';
      }

      // Check AI categorization for domains that would be "Other"
      if (aiCategorizations[domain]) {
        return aiCategorizations[domain];
      }

      return 'Other';
    };

    // Helper to get base category (without AI lookup) - for finding domains to categorize
    const getBaseCategory = (domain: string): string => {
      const d = domain.toLowerCase();

      // Social Media
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

      // Video
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

      // Reference
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

      // News & Media
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

      // E-commerce
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

      // Reviews
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

      // Forums & Q&A
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

      // Government
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

      // Blogs
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

    // Fetch AI categorizations for domains that are "Other"
    useEffect(() => {
      const domainsToFetch = topCitedSources
        .filter(source => getBaseCategory(source.domain) === 'Other')
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

    // Calculate source category breakdown
    const sourceCategoryData = useMemo(() => {
      const categoryCounts: Record<string, number> = {};

      topCitedSources.forEach((source) => {
        const category = categorizeDomain(source.domain);
        categoryCounts[category] = (categoryCounts[category] || 0) + source.count;
      });

      const total = Object.values(categoryCounts).reduce((sum, count) => sum + count, 0);

      const rawData = Object.entries(categoryCounts)
        .map(([category, count]) => ({
          name: category,
          value: count,
          percentage: total > 0 ? (count / total) * 100 : 0
        }))
        .sort((a, b) => b.value - a.value);

      // Show top 4 categories, group the rest as "Other"
      const top4 = rawData.slice(0, 4);
      const otherItems = rawData.slice(4);

      if (otherItems.length > 0) {
        const otherValue = otherItems.reduce((sum, item) => sum + item.value, 0);
        const otherPercentage = otherItems.reduce((sum, item) => sum + item.percentage, 0);
        top4.push({
          name: 'Other',
          value: otherValue,
          percentage: otherPercentage
        });
      }

      return top4;
    }, [topCitedSources, aiCategorizations]);

    // Calculate domain table data with additional metrics
    const domainTableData = useMemo(() => {
      if (!runStatus) return [];

      const searchedBrand = runStatus.brand || '';

      // Get all results with sources for calculating percentages
      const resultsWithSources = globallyFilteredResults.filter(
        (r: Result) => !r.error && r.sources && r.sources.length > 0
      );
      const totalResponsesWithSources = resultsWithSources.length;

      // Track per-domain stats
      const domainStats: Record<string, {
        domain: string;
        responsesWithDomain: number;
        totalCitations: number;
        sentimentScores: number[];
        brands: Set<string>;
        providers: Set<string>;
      }> = {};

      // Process each result to collect domain stats
      resultsWithSources.forEach((r: Result) => {
        if (!r.sources) return;

        // Collect brands mentioned in this response
        const brandsInResponse: string[] = [];
        if (r.brand_mentioned && searchedBrand) {
          brandsInResponse.push(searchedBrand);
        }
        if (r.competitors_mentioned) {
          brandsInResponse.push(...r.competitors_mentioned);
        }

        // Track unique domains per response
        const domainsInResponse = new Set<string>();

        r.sources.forEach((source: Source) => {
          if (!source.url) return;
          try {
            const hostname = new URL(source.url).hostname.replace(/^www\./, '');
            domainsInResponse.add(hostname);

            if (!domainStats[hostname]) {
              domainStats[hostname] = {
                domain: hostname,
                responsesWithDomain: 0,
                totalCitations: 0,
                sentimentScores: [],
                brands: new Set(),
                providers: new Set(),
              };
            }
            domainStats[hostname].totalCitations += 1;
          } catch {
            // Skip invalid URLs
          }
        });

        // Count unique responses per domain, capture sentiment, track brands and providers
        domainsInResponse.forEach(domain => {
          domainStats[domain].responsesWithDomain += 1;
          // Add brands mentioned in this response to the domain's brand set
          brandsInResponse.forEach(brand => domainStats[domain].brands.add(brand));
          // Track which provider cited this domain
          domainStats[domain].providers.add(r.provider);
          // Use brand sentiment if available (convert to numeric)
          if (r.brand_sentiment) {
            const sentimentScore = getSentimentScore(r.brand_sentiment);
            if (sentimentScore > 0) {
              domainStats[domain].sentimentScores.push(sentimentScore);
            }
          }
        });
      });

      // Convert to array with calculated metrics
      return Object.values(domainStats)
        .map(stat => {
          const usedPercent = totalResponsesWithSources > 0
            ? (stat.responsesWithDomain / totalResponsesWithSources) * 100
            : 0;
          const avgCitation = stat.responsesWithDomain > 0
            ? stat.totalCitations / stat.responsesWithDomain
            : 0;
          const avgSentiment = stat.sentimentScores.length > 0
            ? stat.sentimentScores.reduce((a, b) => a + b, 0) / stat.sentimentScores.length
            : null;

          // Sort brands: searched brand first, then others alphabetically
          const brandsArray = Array.from(stat.brands);
          const sortedBrands = brandsArray.sort((a, b) => {
            if (a === searchedBrand) return -1;
            if (b === searchedBrand) return 1;
            return a.localeCompare(b);
          });

          return {
            domain: stat.domain,
            usedPercent,
            avgCitation,
            category: categorizeDomain(stat.domain),
            avgSentiment,
            totalCitations: stat.totalCitations,
            responsesWithDomain: stat.responsesWithDomain,
            brands: sortedBrands,
            providers: Array.from(stat.providers),
          };
        })
        .sort((a, b) => b.usedPercent - a.usedPercent);
    }, [runStatus, globallyFilteredResults, aiCategorizations]);

    // Sorted domain table data based on user selection
    const sortedDomainTableData = useMemo(() => {
      return [...domainTableData].sort((a, b) => {
        let aVal: string | number | null;
        let bVal: string | number | null;

        switch (domainSortColumn) {
          case 'domain':
            aVal = a.domain.toLowerCase();
            bVal = b.domain.toLowerCase();
            break;
          case 'usedPercent':
            aVal = a.usedPercent;
            bVal = b.usedPercent;
            break;
          case 'avgCitation':
            aVal = a.avgCitation;
            bVal = b.avgCitation;
            break;
          case 'category':
            aVal = a.category.toLowerCase();
            bVal = b.category.toLowerCase();
            break;
          case 'avgSentiment':
            aVal = a.avgSentiment ?? -1;
            bVal = b.avgSentiment ?? -1;
            break;
          default:
            return 0;
        }

        if (aVal < bVal) return domainSortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return domainSortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }, [domainTableData, domainSortColumn, domainSortDirection]);

    // Handle column header click for sorting
    const handleDomainSort = (column: 'domain' | 'usedPercent' | 'avgCitation' | 'category' | 'avgSentiment') => {
      if (domainSortColumn === column) {
        setDomainSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
      } else {
        setDomainSortColumn(column);
        setDomainSortDirection('desc');
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
        'Sentiment',
        'Models',
        'Brands',
      ];

      const rows = domainTableData.map(row => [
        row.domain,
        row.usedPercent.toFixed(1),
        row.avgCitation.toFixed(2),
        row.category,
        row.avgSentiment !== null ? getSentimentLabel(row.avgSentiment) : '',
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

    const CATEGORY_COLORS: Record<string, string> = {
      'Social Media': '#111827',      // Primary dark
      'Video': '#374151',             // Gray-700
      'Reference': '#1f2937',         // Gray-800
      'News & Media': '#5BA3C0',      // Light blue
      'E-commerce': '#6b7280',        // Gray-500
      'Reviews': '#7FBCD4',           // Sky blue
      'Forums & Q&A': '#4b5563',      // Gray-600
      'Government': '#4A90A4',        // Teal blue
      'Blogs': '#9ca3af',             // Gray-400
      'Travel': '#6BA3A0',            // Teal green
      'Finance': '#5B8FA8',           // Steel blue
      'Other': '#d1d5db'              // Gray-300
    };

    // Get icon component for a category
    const getCategoryIcon = (category: string, className: string = "w-3.5 h-3.5") => {
      const color = CATEGORY_COLORS[category] || CATEGORY_COLORS['Other'];
      const props = { className, style: { color } };
      switch (category) {
        case 'Social Media': return <AtSign {...props} />;
        case 'Video': return <Film {...props} />;
        case 'Reference': return <FileText {...props} />;
        case 'News & Media': return <Rss {...props} />;
        case 'E-commerce': return <Tag {...props} />;
        case 'Reviews': return <Award {...props} />;
        case 'Forums & Q&A': return <MessagesSquare {...props} />;
        case 'Government': return <Building2 {...props} />;
        case 'Blogs': return <Feather {...props} />;
        case 'Travel': return <MapPin {...props} />;
        case 'Finance': return <TrendingUp {...props} />;
        default: return <Circle {...props} />;
      }
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
          <div className="bg-gradient-to-r from-gray-100 to-gray-50 rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-5 h-5 text-gray-900" />
              <h2 className="text-lg font-semibold text-gray-900">Key Influencers</h2>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Sources cited by multiple AI platforms — these have a big impact on what AI recommends.
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
                {source.urlDetails.map((urlDetail, idx) => {
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
          <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl shadow-sm border border-purple-100 p-6">
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
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
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
                    <option value="all">All Brands</option>
                    {runStatus?.brand && availableBrands.includes(runStatus.brand) && (
                      <option value={runStatus.brand}>{runStatus.brand} (searched)</option>
                    )}
                    {availableBrands.filter(brand => brand !== runStatus?.brand).map((brand) => (
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
                          className={`flex items-center gap-2 p-2.5 cursor-pointer hover:bg-gray-100 transition-colors duration-100 ${isExpanded ? 'rounded-t-lg' : 'rounded-lg'}`}
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
                              {source.providers.slice(0, 3).map((provider) => (
                                <span key={provider} className="text-[10px] px-1 py-0.5 bg-gray-200 text-gray-600 rounded" title={getProviderLabel(provider)}>
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
                              {source.urlDetails.map((urlDetail, idx) => {
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
                                        {urlDetail.providers.slice(0, 3).map((provider) => (
                                          <span key={provider} className="text-[9px] px-1 py-0.5 bg-gray-200 text-gray-600 rounded" title={getProviderLabel(provider)}>
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
          // Filter to only sources with position data
          const dataWithPosition = sourcePositioningData.filter(d => d.avgPosition !== null && d.avgPosition > 0);

          if (dataWithPosition.length === 0) {
            return null; // No data to display
          }

          // Calculate dynamic axis ranges
          const maxProviders = Math.max(...dataWithPosition.map(d => d.providerCount), 1);
          const maxPosition = Math.max(...dataWithPosition.map(d => d.avgPosition || 1), 5);

          // Group points by proximity for label positioning
          const getClusterKey = (providerCount: number, avgPosition: number) => {
            const providerBucket = providerCount;
            const positionBucket = Math.round((avgPosition || 0) * 2) / 2;
            return `${providerBucket}-${positionBucket}`;
          };

          const positionGroups: Record<string, typeof dataWithPosition> = {};
          dataWithPosition.forEach(point => {
            const key = getClusterKey(point.providerCount, point.avgPosition || 0);
            if (!positionGroups[key]) {
              positionGroups[key] = [];
            }
            positionGroups[key].push(point);
          });

          Object.values(positionGroups).forEach(group => {
            group.sort((a, b) => (a.avgPosition || 0) - (b.avgPosition || 0));
          });

          const processedData = dataWithPosition.map(point => {
            const key = getClusterKey(point.providerCount, point.avgPosition || 0);
            const group = positionGroups[key];
            const indexInGroup = group.findIndex(p => p.domain === point.domain);
            return {
              ...point,
              groupSize: group.length,
              indexInGroup,
            };
          });

          return (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Sources That Help Your Brand</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Websites linked to higher visibility and better sentiment in AI responses
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
              {/* Sentiment Legend - above chart */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-4">
                <span className="text-xs text-gray-600 font-medium">Sentiment:</span>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#15803d' }} />
                  <span className="text-xs text-gray-500">Strong</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#22c55e' }} />
                  <span className="text-xs text-gray-500">Positive</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#eab308' }} />
                  <span className="text-xs text-gray-500">Neutral</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#f97316' }} />
                  <span className="text-xs text-gray-500">Conditional</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#dc2626' }} />
                  <span className="text-xs text-gray-500">Negative</span>
                </div>
              </div>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 30, right: 40, bottom: 60, left: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      dataKey="providerCount"
                      name="Provider Diversity"
                      domain={[0.5, Math.max(maxProviders, 4) + 0.5]}
                      ticks={[1, 2, 3, 4].filter(t => t <= Math.max(maxProviders, 4))}
                      tickFormatter={(value) => `${value} model${value !== 1 ? 's' : ''}`}
                      tick={{ fill: '#6b7280', fontSize: 12 }}
                      label={{ value: 'Provider Diversity (# of AI Models)', position: 'bottom', offset: 25, style: { fill: '#374151', fontSize: 14, fontWeight: 500 } }}
                    />
                    <YAxis
                      type="number"
                      dataKey="avgPosition"
                      name="Avg. Brand Position"
                      domain={[0.5, Math.ceil(maxPosition) + 0.5]}
                      reversed={true}
                      ticks={Array.from({ length: Math.ceil(maxPosition) }, (_, i) => i + 1)}
                      tickFormatter={(value) => `#${value}`}
                      tick={{ fill: '#6b7280', fontSize: 12 }}
                      label={{
                        content: (props: any) => {
                          const { viewBox } = props;
                          if (!viewBox) return null;
                          return (
                            <text x={viewBox.x + 5} y={viewBox.y - 8} fill="#374151" fontSize={11} fontWeight={500}>
                              <tspan x={viewBox.x + 5} dy="0">Avg</tspan>
                              <tspan x={viewBox.x + 5} dy="12">Position</tspan>
                            </text>
                          );
                        }
                      }}
                    />
                    <Tooltip
                      cursor={false}
                      isAnimationActive={false}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length > 0) {
                          const data = payload[0].payload;
                          const sentimentLabels = ['', 'Negative', 'Conditional', 'Neutral', 'Positive', 'Strong'];
                          return (
                            <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm max-w-[280px]">
                              <p className="font-medium text-gray-900 mb-2">{data.domain}</p>
                              <div className="space-y-1 text-gray-600">
                                <p>Avg. Position: <span className="font-medium">#{data.avgPosition?.toFixed(1)}</span></p>
                                <p>AI Models: <span className="font-medium">{data.providerCount}</span></p>
                                <p>Citations: <span className="font-medium">{data.citationCount}</span></p>
                                <p>Sentiment: <span className="font-medium">{sentimentLabels[Math.round(data.avgSentiment)] || 'N/A'}</span></p>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Scatter
                      data={processedData}
                      shape={(props: any) => {
                        const { cx, cy, payload, index } = props;
                        const groupSize = payload.groupSize || 1;
                        const indexInGroup = payload.indexInGroup || 0;

                        // Circle size based on citation count for visual hierarchy
                        const circleRadius = Math.min(Math.max(6, 4 + payload.citationCount * 0.5), 14);

                        // Color based on sentiment (1-5 scale)
                        const sentiment = payload.avgSentiment;
                        const getColor = () => {
                          if (sentiment >= 4.5) return '#15803d';
                          if (sentiment >= 3.5) return '#22c55e';
                          if (sentiment >= 2.5) return '#eab308';
                          if (sentiment >= 1.5) return '#f97316';
                          return '#dc2626';
                        };
                        const getStroke = () => {
                          if (sentiment >= 4.5) return '#166534';
                          if (sentiment >= 3.5) return '#166534';
                          if (sentiment >= 2.5) return '#a16207';
                          if (sentiment >= 1.5) return '#c2410c';
                          return '#991b1b';
                        };

                        // Offset for overlapping points - spread horizontally
                        const spacing = circleRadius * 2 + 4;
                        const totalWidth = (groupSize - 1) * spacing;
                        const xOffset = groupSize > 1 ? (indexInGroup * spacing) - (totalWidth / 2) : 0;

                        // Truncate domain for display
                        const displayDomain = payload.domain.length > 15
                          ? payload.domain.substring(0, 13) + '...'
                          : payload.domain;

                        // Calculate label position to avoid overlaps
                        // Use alternating positions: top, bottom, top-right, top-left based on index and group
                        const labelOffsetY = circleRadius + 12;
                        const labelOffsetX = 0;

                        // Alternate label positions based on index to reduce overlap
                        const positionIndex = (index || 0) + indexInGroup;
                        const positions = [
                          { dy: -labelOffsetY, dx: 0, anchor: 'middle' },      // top
                          { dy: labelOffsetY + 8, dx: 0, anchor: 'middle' },   // bottom
                          { dy: -labelOffsetY + 4, dx: 20, anchor: 'start' },  // top-right
                          { dy: -labelOffsetY + 4, dx: -20, anchor: 'end' },   // top-left
                          { dy: 4, dx: circleRadius + 8, anchor: 'start' },    // right
                          { dy: 4, dx: -(circleRadius + 8), anchor: 'end' },   // left
                        ];

                        // Use position based on group index and overall index for variety
                        const posIdx = groupSize > 1 ? (indexInGroup % 4) + 1 : (positionIndex % 6);
                        const labelPos = positions[posIdx] || positions[0];

                        return (
                          <g>
                            <circle
                              cx={cx + xOffset}
                              cy={cy}
                              r={circleRadius}
                              fill={getColor()}
                              stroke={getStroke()}
                              strokeWidth={1.5}
                              opacity={0.9}
                              style={{ cursor: 'pointer' }}
                            />
                            {/* Leader line for offset labels */}
                            {(Math.abs(labelPos.dx) > 10 || labelPos.dy > 0) && (
                              <line
                                x1={cx + xOffset}
                                y1={cy}
                                x2={cx + xOffset + labelPos.dx * 0.6}
                                y2={cy + labelPos.dy * 0.5}
                                stroke="#9ca3af"
                                strokeWidth={0.5}
                                strokeDasharray="2,2"
                              />
                            )}
                            <text
                              x={cx + xOffset + labelPos.dx}
                              y={cy + labelPos.dy}
                              textAnchor={labelPos.anchor as 'middle' | 'start' | 'end'}
                              fill="#374151"
                              fontSize={9}
                              fontWeight={500}
                              style={{ pointerEvents: 'none' }}
                            >
                              {displayDomain}
                            </text>
                          </g>
                        );
                      }}
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-3 text-center text-xs text-gray-400 italic">Dot size indicates citation frequency • Hover for details</p>
            </div>
          );
        })()}

        {/* Brand Website Citations */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Brand Website Citations</h3>
              <p className="text-sm text-gray-500">How often AI models cite your brand's and competitors' own websites as sources</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={brandCitationsBrandFilter}
                onChange={(e) => setBrandCitationsBrandFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              >
                <option value="all">All Brands</option>
                {runStatus?.brand && (
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
                      <div className="flex items-center gap-3">
                        <div className="flex gap-1">
                          {citation.providers.map((provider) => (
                            <span key={provider} className="text-xs px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded">
                              {getProviderShortLabel(provider)}
                            </span>
                          ))}
                        </div>
                        <span className="text-sm text-gray-500 w-24 text-right">
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
                          {citation.urls.map((urlDetail, idx) => {
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
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-gray-500">No brand or competitor websites were cited as sources.</p>
              <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg inline-block">
                <p className="text-xs text-yellow-800">
                  <strong>Opportunity:</strong> Consider improving your website's SEO and creating authoritative content that Models might cite.
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
                <span className="text-gray-500">Brands with citations: </span>
                <span className="font-medium text-gray-900">{brandWebsiteCitations.totalBrandsWithCitations}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Domain Breakdown Table */}
        {domainTableData.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Publisher Breakdown</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  Showing {sortedDomainTableData.length} publishers cited across AI responses
                </p>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto min-h-0">
              <table className="w-full table-fixed">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th
                      className="w-[18%] text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none"
                      onClick={() => handleDomainSort('domain')}
                    >
                      <span className="flex items-center gap-1">
                        Domain
                        {domainSortColumn === 'domain' && (
                          <span className="text-gray-900">{domainSortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </span>
                    </th>
                    <th
                      className="w-[13%] text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none"
                      onClick={() => handleDomainSort('usedPercent')}
                    >
                      <span className="flex items-center justify-center gap-1">
                        Used %
                        {domainSortColumn === 'usedPercent' && (
                          <span className="text-gray-900">{domainSortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </span>
                    </th>
                    <th
                      className="w-[12%] text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none"
                      onClick={() => handleDomainSort('avgCitation')}
                    >
                      <span className="flex items-center justify-center gap-1">
                        Avg Citations
                        {domainSortColumn === 'avgCitation' && (
                          <span className="text-gray-900">{domainSortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </span>
                    </th>
                    <th
                      className="w-[12%] text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none"
                      onClick={() => handleDomainSort('category')}
                    >
                      <span className="flex items-center justify-center gap-1">
                        Type
                        {domainSortColumn === 'category' && (
                          <span className="text-gray-900">{domainSortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </span>
                    </th>
                    <th
                      className="w-[15%] text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none"
                      onClick={() => handleDomainSort('avgSentiment')}
                    >
                      <span className="flex items-center justify-center gap-1">
                        Sentiment
                        {domainSortColumn === 'avgSentiment' && (
                          <span className="text-gray-900">{domainSortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </span>
                    </th>
                    <th className="w-[15%] text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Models</th>
                    <th className="w-[15%] text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Brands</th>
                  </tr>
                </thead>
              </table>
              {/* Scrollable tbody wrapper */}
              <div className="max-h-[540px] overflow-y-auto overscroll-contain">
                <table className="w-full table-fixed">
                  <colgroup>
                    <col className="w-[18%]" />
                    <col className="w-[13%]" />
                    <col className="w-[12%]" />
                    <col className="w-[12%]" />
                    <col className="w-[15%]" />
                    <col className="w-[15%]" />
                    <col className="w-[15%]" />
                  </colgroup>
                  <tbody>
                  {sortedDomainTableData.map((row) => {
                    // Sentiment badge styling
                    const getSentimentBadge = () => {
                      if (row.avgSentiment === null) {
                        return <span className="text-sm text-gray-400">-</span>;
                      }
                      const configs: Record<string, { bg: string; text: string; border: string; label: string }> = {
                        'strong': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', label: 'Highly Recommended' },
                        'positive': { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', label: 'Recommended' },
                        'neutral': { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200', label: 'Neutral' },
                        'conditional': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', label: 'With Caveats' },
                        'negative': { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', label: 'Not Recommended' },
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
                      <tr key={row.domain} className="border-b border-gray-100 hover:bg-gray-50/40 transition-colors">
                        <td className="py-4 px-4">
                          <span className="text-sm text-gray-900 font-medium">{row.domain}</span>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gray-900 rounded-full"
                                style={{ width: `${Math.min(row.usedPercent, 100)}%` }}
                              />
                            </div>
                            <span className="text-sm text-gray-600 min-w-[40px]">{row.usedPercent.toFixed(1)}%</span>
                          </div>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <span className="text-sm text-gray-600">{row.avgCitation.toFixed(2)}</span>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {getCategoryIcon(row.category, "w-3.5 h-3.5")}
                            <span className="text-sm text-gray-600">{row.category}</span>
                          </div>
                        </td>
                        <td className="py-4 px-4 text-center">
                          {getSentimentBadge()}
                        </td>
                        <td className="py-4 px-4">
                          {row.providers.length > 0 ? (
                            <span className="text-sm text-gray-700">
                              {row.providers.slice(0, 2).map(p => getProviderLabel(p)).join(', ')}
                              {row.providers.length > 2 && (
                                <span
                                  className="text-gray-400 ml-1 cursor-help"
                                  title={row.providers.map(p => getProviderLabel(p)).join(', ')}
                                >
                                  +{row.providers.length - 2}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400">-</span>
                          )}
                        </td>
                        <td className="py-4 px-4">
                          {row.brands.length > 0 ? (
                            <span className="text-sm text-gray-700">
                              {row.brands.slice(0, 2).join(', ')}
                              {row.brands.length > 2 && (
                                <span
                                  className="text-gray-400 ml-1 cursor-help"
                                  title={row.brands.join(', ')}
                                >
                                  +{row.brands.length - 2}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400">None</span>
                          )}
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

  // Sentiment Tab Content
  const SentimentTab = () => {
    // Helper function to get sentiment label
    const getSentimentLabel = (sentiment: string | null | undefined) => {
      switch (sentiment) {
        case 'strong_endorsement': return 'Highly Recommended';
        case 'positive_endorsement': return 'Recommended';
        case 'neutral_mention': return 'Neutral';
        case 'conditional': return 'With Caveats';
        case 'negative_comparison': return 'Not Recommended';
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
        case 'strong_endorsement': return '#15803d'; // Darker green (green-700)
        case 'positive_endorsement': return '#84cc16';
        case 'neutral_mention': return '#3b82f6';
        case 'conditional': return '#fde68a'; // amber-200 (very light)
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
    // Get list of brands for the sentiment provider filter dropdown
    const sentimentProviderBrandOptions = useMemo(() => {
      if (!runStatus) return [];
      const options: { value: string; label: string; isSearched: boolean }[] = [];

      // Add searched brand first
      if (runStatus.brand) {
        options.push({ value: runStatus.brand, label: `${runStatus.brand} (searched)`, isSearched: true });
      }

      // Collect all competitors from competitor_sentiments
      const competitors = new Set<string>();
      globallyFilteredResults.forEach((r: Result) => {
        if (!r.error && r.competitor_sentiments) {
          Object.keys(r.competitor_sentiments).forEach(comp => competitors.add(comp));
        }
      });

      // Add competitors sorted alphabetically
      Array.from(competitors).sort().forEach(comp => {
        options.push({ value: comp, label: comp, isSearched: false });
      });

      return options;
    }, [runStatus, globallyFilteredResults]);

    // Get the effective brand filter (default to searched brand)
    const effectiveSentimentBrand = sentimentProviderBrandFilter || runStatus?.brand || '';

    // Helper to extract domain from URL
    const extractDomain = (url: string): string => {
      try {
        const hostname = new URL(url).hostname;
        // Remove www. prefix
        return hostname.replace(/^www\./, '');
      } catch {
        return url;
      }
    };

    // Get list of unique citation source domains for the filter dropdown
    const citationSourceOptions = useMemo(() => {
      const domains = new Set<string>();
      globallyFilteredResults.forEach((r: Result) => {
        if (!r.error && r.sources) {
          r.sources.forEach((source) => {
            if (source.url) {
              domains.add(extractDomain(source.url));
            }
          });
        }
      });
      return Array.from(domains).sort();
    }, [globallyFilteredResults]);

    const sentimentByProvider = useMemo(() => {
      const providerData: Record<string, {
        strong_endorsement: number;
        positive_endorsement: number;
        neutral_mention: number;
        conditional: number;
        negative_comparison: number;
        not_mentioned: number;
      }> = {};

      const isSearchedBrand = effectiveSentimentBrand === runStatus?.brand;

      globallyFilteredResults
        .filter((r: Result) => {
          if (r.error) return false;
          // Filter by citation source domain if not "all"
          if (sentimentProviderCitationFilter !== 'all') {
            if (!r.sources || r.sources.length === 0) return false;
            const hasCitationFromDomain = r.sources.some(
              (source) => source.url && extractDomain(source.url) === sentimentProviderCitationFilter
            );
            if (!hasCitationFromDomain) return false;
          }
          return true;
        })
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

          let sentiment: string;
          if (isSearchedBrand) {
            // Use brand_sentiment for the searched brand
            sentiment = r.brand_sentiment || 'not_mentioned';
          } else {
            // Use competitor_sentiments for competitors
            sentiment = r.competitor_sentiments?.[effectiveSentimentBrand] || 'not_mentioned';
          }

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
    }, [globallyFilteredResults, effectiveSentimentBrand, runStatus?.brand, sentimentProviderCitationFilter]);

    // Helper to get results for a specific provider and sentiment
    const getResultsForProviderSentiment = (provider: string, sentiment: string): Result[] => {
      const isSearchedBrand = effectiveSentimentBrand === runStatus?.brand;
      return globallyFilteredResults.filter((r: Result) => {
        if (r.error) return false;
        if (r.provider !== provider) return false;

        // Apply citation filter if set
        if (sentimentProviderCitationFilter !== 'all') {
          if (!r.sources || r.sources.length === 0) return false;
          const hasCitationFromDomain = r.sources.some(
            (source) => source.url && extractDomain(source.url) === sentimentProviderCitationFilter
          );
          if (!hasCitationFromDomain) return false;
        }

        // Check sentiment match
        let resultSentiment: string;
        if (isSearchedBrand) {
          resultSentiment = r.brand_sentiment || 'not_mentioned';
        } else {
          resultSentiment = r.competitor_sentiments?.[effectiveSentimentBrand] || 'not_mentioned';
        }
        return resultSentiment === sentiment;
      });
    };

    // Sentiment badge with hover preview component
    const SentimentBadgeWithPreview = ({
      provider,
      sentiment,
      count,
      popupPosition = 'bottom'
    }: {
      provider: string;
      sentiment: string;
      count: number;
      bgColor?: string;
      textColor?: string;
      popupPosition?: 'top' | 'bottom';
    }) => {
      // Show dash for zero count
      if (count === 0) {
        return <span className="text-gray-400">-</span>;
      }

      const isHovered = hoveredSentimentBadge?.provider === provider && hoveredSentimentBadge?.sentiment === sentiment;
      const matchingResults = isHovered ? getResultsForProviderSentiment(provider, sentiment) : [];

      const handleMouseEnter = useCallback(() => {
        // Only update if the value is actually different to prevent re-renders
        setHoveredSentimentBadge(prev => {
          if (prev?.provider === provider && prev?.sentiment === sentiment) {
            return prev; // Return same reference to prevent re-render
          }
          return { provider, sentiment };
        });
      }, [provider, sentiment]);

      const handleMouseLeave = useCallback(() => {
        setHoveredSentimentBadge(null);
      }, []);

      // Get results for click handling
      const resultsForClick = getResultsForProviderSentiment(provider, sentiment);

      const handleClick = useCallback(() => {
        // If single result, open modal directly (same as clicking dots on All Answers)
        if (resultsForClick.length === 1) {
          setSelectedResult(resultsForClick[0]);
          setHoveredSentimentBadge(null);
        }
        // For multiple results, the hover popup is already showing
      }, [resultsForClick]);

      const hasMultipleResults = resultsForClick.length > 1;

      // Get badge style based on sentiment type
      const getBadgeStyle = () => {
        switch (sentiment) {
          case 'strong_endorsement':
            return 'bg-green-500 text-white'; // Filled green
          case 'positive_endorsement':
            return 'bg-white border-2 border-green-500 text-green-600'; // Outline green
          case 'neutral_mention':
            return 'bg-white border-2 border-gray-300 text-gray-600'; // Outline gray
          case 'conditional':
            return 'bg-amber-100 border-2 border-amber-300 text-amber-700'; // Filled amber/yellow
          case 'negative_comparison':
            return 'bg-white border-2 border-red-400 text-red-500'; // Outline red
          case 'not_mentioned':
            return 'bg-white border-2 border-gray-300 text-gray-500'; // Outline gray
          default:
            return 'bg-gray-100 text-gray-600';
        }
      };

      return (
        <div
          className="relative inline-block"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div
            className={`inline-flex items-center justify-center w-9 h-9 text-sm font-semibold rounded-full cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-gray-300 transition-all ${getBadgeStyle()}`}
            onClick={handleClick}
          >
            {count}
          </div>
          {hasMultipleResults && (
            <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-gray-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center shadow-sm">
              +
            </div>
          )}

          {isHovered && matchingResults.length > 0 && (
            <div
              data-sentiment-popup
              className={`absolute z-50 bg-white border border-gray-200 rounded-lg p-3 shadow-xl min-w-[300px] max-w-[380px] text-left ${
                popupPosition === 'top'
                  ? 'bottom-full mb-2 left-1/2 -translate-x-1/2'
                  : 'top-full mt-2 left-1/2 -translate-x-1/2'
              }`}
              style={{ maxHeight: '280px' }}
              onWheel={(e) => e.stopPropagation()}
            >
                <p className="text-xs font-medium text-gray-500 mb-2 pb-2 border-b border-gray-100">
                {matchingResults.length} {matchingResults.length === 1 ? 'response' : 'responses'} - Click to view details
              </p>
              <div className="overflow-y-auto space-y-0" style={{ maxHeight: '220px' }}>
                {matchingResults.map((result, idx) => {
                  const truncatedPrompt = result.prompt.length > 60
                    ? result.prompt.substring(0, 60) + '...'
                    : result.prompt;

                  // Calculate rank using same logic as All Answers chart
                  let rank = 0;
                  const brandLower = (runStatus?.brand || '').toLowerCase();
                  const isMentioned = result.brand_mentioned;

                  if (isMentioned && result.response_text) {
                    const allBrands: string[] = result.all_brands_mentioned && result.all_brands_mentioned.length > 0
                      ? result.all_brands_mentioned.filter((b): b is string => typeof b === 'string')
                      : [runStatus?.brand, ...(result.competitors_mentioned || [])].filter((b): b is string => typeof b === 'string');

                    // Try exact match first
                    let foundIndex = allBrands.findIndex(b => b.toLowerCase() === brandLower);

                    // If not found, try partial match
                    if (foundIndex === -1) {
                      foundIndex = allBrands.findIndex(b =>
                        b.toLowerCase().includes(brandLower) || brandLower.includes(b.toLowerCase())
                      );
                    }

                    // If still not found, use text search fallback
                    if (foundIndex === -1) {
                      const brandPos = result.response_text.toLowerCase().indexOf(brandLower);
                      if (brandPos >= 0) {
                        let brandsBeforeCount = 0;
                        for (const b of allBrands) {
                          const bPos = result.response_text.toLowerCase().indexOf(b.toLowerCase());
                          if (bPos >= 0 && bPos < brandPos) {
                            brandsBeforeCount++;
                          }
                        }
                        rank = brandsBeforeCount + 1;
                      } else {
                        // Brand mentioned but can't find position - place after known brands
                        rank = allBrands.length + 1;
                      }
                    } else {
                      rank = foundIndex + 1;
                    }
                  }

                  return (
                    <div
                      key={result.id}
                      className={`p-2 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer ${idx > 0 ? 'mt-2' : ''}`}
                      onClick={() => {
                        setSelectedResult(result);
                        setHoveredSentimentBadge(null);
                      }}
                    >
                      <p className="text-sm font-medium text-gray-900 mb-1 leading-snug" title={result.prompt}>
                        {truncatedPrompt}
                      </p>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-gray-600">
                          {rank === 0
                            ? 'Not shown'
                            : rank === 1
                              ? 'Shown as: #1 (Top result)'
                              : `Shown as: #${rank}`}
                        </p>
                        <p className="text-xs text-gray-400">
                          {getProviderLabel(result.provider)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      );
    };

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

          <div className="grid grid-cols-1 lg:grid-cols-[1fr,320px] gap-6 items-start">
            {/* Sentiment Distribution */}
            <div>
              <div className="flex items-baseline justify-between mb-4">
                <h4 className="text-sm font-medium text-gray-700">Overall Sentiment Distribution</h4>
                <span className="text-xs text-gray-400">Bar length = number of citations</span>
              </div>
              <div className="space-y-3">
                {brandSentimentData.map((d) => (
                  <div key={d.sentiment} className="flex items-center gap-3">
                    <div className="w-36 text-sm text-gray-600 shrink-0">{d.label}</div>
                    <div className="flex-1 bg-gray-100 rounded-lg h-7 overflow-hidden relative">
                      <div
                        className="h-full rounded-lg transition-all duration-500 flex items-center"
                        style={{
                          width: `${Math.max(d.percentage, d.percentage > 0 ? 15 : 0)}%`,
                          backgroundColor: d.color,
                          minWidth: d.percentage > 0 ? '48px' : '0',
                        }}
                      >
                        {d.percentage > 0 && (
                          <span className="text-xs font-semibold text-white ml-2 whitespace-nowrap">
                            {d.percentage.toFixed(0)}%
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="w-20 text-right shrink-0">
                      <span className="text-sm font-semibold text-gray-900">{d.count}</span>
                      <span className="text-xs text-gray-500 ml-1">({d.percentage.toFixed(0)}%)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Key Insights */}
            <div className="bg-[#FAFAF8] rounded-lg p-4 self-start">
              <h4 className="text-sm font-semibold text-gray-800 mb-2">Key Insight</h4>
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

        {/* Key Sentiment & Framing Insights */}
        {sentimentInsights.length > 0 && (
          <div className="bg-gradient-to-r from-teal-50 to-emerald-50 rounded-xl shadow-sm border border-teal-100 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Lightbulb className="w-5 h-5 text-teal-600" />
              <h2 className="text-lg font-semibold text-gray-900">Key Sentiment & Framing Insights</h2>
            </div>
            <ul className="space-y-3">
              {sentimentInsights.map((insight, idx) => (
                <li key={idx} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-gray-100 text-gray-900 flex items-center justify-center text-sm font-medium flex-shrink-0 mt-0.5">
                    {idx + 1}
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">{insight}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Sentiment by Prompt Chart */}
        {globallyFilteredResults.filter((r: Result) => !r.error && r.brand_sentiment).length > 0 && (() => {
          // Get effective brand filter (default to searched brand)
          const effectiveBrand = sentimentByPromptBrandFilter || runStatus?.brand || '';

          // Build brand options for dropdown
          const brandOptions: { value: string; label: string }[] = [];
          if (runStatus?.brand) {
            brandOptions.push({ value: runStatus.brand, label: `${runStatus.brand} (searched)` });
          }
          const competitors = new Set<string>();
          globallyFilteredResults.forEach((r: Result) => {
            r.competitors_mentioned?.forEach(c => competitors.add(c));
          });
          competitors.forEach(c => {
            if (c !== runStatus?.brand) {
              brandOptions.push({ value: c, label: c });
            }
          });

          // Build source options for dropdown
          const sourceOptions: string[] = [];
          const sourceDomains = new Set<string>();
          globallyFilteredResults.forEach((r: Result) => {
            r.sources?.forEach(s => {
              if (s.url) {
                const domain = extractDomain(s.url);
                sourceDomains.add(domain);
              }
            });
          });
          sourceDomains.forEach(d => sourceOptions.push(d));
          sourceOptions.sort();

          // Calculate sentiment by prompt with filters
          const sentimentScoreMap: Record<string, number> = {
            'strong_endorsement': 5,
            'positive_endorsement': 4,
            'neutral_mention': 3,
            'conditional': 2,
            'negative_comparison': 1,
          };

          // Filter results by source if selected
          let filteredResults = globallyFilteredResults.filter((r: Result) => !r.error);
          if (sentimentByPromptSourceFilter !== 'all') {
            filteredResults = filteredResults.filter((r: Result) =>
              r.sources?.some(s => s.url && extractDomain(s.url) === sentimentByPromptSourceFilter)
            );
          }

          // Group by prompt and calculate sentiment for selected brand
          const promptGroups: Record<string, Result[]> = {};
          filteredResults.forEach((r: Result) => {
            if (!promptGroups[r.prompt]) {
              promptGroups[r.prompt] = [];
            }
            promptGroups[r.prompt].push(r);
          });

          const promptsWithSentiment = Object.entries(promptGroups).map(([prompt, results]) => {
            let mentioned = 0;
            const sentimentScores: number[] = [];

            results.forEach(r => {
              // Check if the selected brand is mentioned
              const isBrandMentioned = effectiveBrand === runStatus?.brand
                ? r.brand_mentioned
                : r.competitors_mentioned?.includes(effectiveBrand);

              if (isBrandMentioned) {
                mentioned++;

                // Get sentiment for the selected brand
                let sentiment: string | null | undefined;
                if (effectiveBrand === runStatus?.brand) {
                  sentiment = r.brand_sentiment;
                } else {
                  sentiment = r.competitor_sentiments?.[effectiveBrand];
                }

                if (sentiment && sentiment !== 'not_mentioned' && sentimentScoreMap[sentiment]) {
                  sentimentScores.push(sentimentScoreMap[sentiment]);
                }
              }
            });

            const avgSentimentScore = sentimentScores.length > 0
              ? sentimentScores.reduce((a, b) => a + b, 0) / sentimentScores.length
              : null;

            return {
              prompt,
              total: results.length,
              mentioned,
              avgSentimentScore,
              visibilityScore: results.length > 0 ? (mentioned / results.length) * 100 : 0,
            };
          }).filter(p => p.avgSentimentScore !== null && p.mentioned > 0);

          if (promptsWithSentiment.length === 0) {
            return (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Sentiment by Question</h2>
                    <p className="text-sm text-gray-500 mt-1">
                      Which questions lead to positive vs negative descriptions
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={sentimentByPromptSourceFilter}
                      onChange={(e) => setSentimentByPromptSourceFilter(e.target.value)}
                      className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    >
                      <option value="all">All Sources</option>
                      {sourceOptions.map((domain) => (
                        <option key={domain} value={domain}>{domain}</option>
                      ))}
                    </select>
                    <select
                      value={sentimentByPromptBrandFilter || runStatus?.brand || ''}
                      onChange={(e) => setSentimentByPromptBrandFilter(e.target.value)}
                      className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    >
                      {brandOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="text-center py-12 text-gray-500">
                  No sentiment data available for the selected filters.
                </div>
              </div>
            );
          }

          // Calculate dynamic axis ranges
          const sentimentValues = promptsWithSentiment.map(p => p.avgSentimentScore || 0);
          const minSentiment = Math.min(...sentimentValues);
          const maxSentiment = Math.max(...sentimentValues);
          const xMin = Math.max(0.5, Math.floor(minSentiment) - 0.5);
          const xMax = Math.min(5.5, Math.ceil(maxSentiment) + 0.5);
          const xTicks = [1, 2, 3, 4, 5].filter(t => t >= xMin && t <= xMax);

          const maxMentions = Math.max(...promptsWithSentiment.map(p => p.mentioned));
          const yMax = maxMentions + Math.max(1, Math.ceil(maxMentions * 0.15));

          // Process data for overlapping points
          const positionGroups: Record<string, typeof promptsWithSentiment> = {};
          promptsWithSentiment.forEach(point => {
            const key = `${point.mentioned}-${(point.avgSentimentScore || 0).toFixed(1)}`;
            if (!positionGroups[key]) {
              positionGroups[key] = [];
            }
            positionGroups[key].push(point);
          });

          const processedData = promptsWithSentiment.map(point => {
            const key = `${point.mentioned}-${(point.avgSentimentScore || 0).toFixed(1)}`;
            const group = positionGroups[key];
            const indexInGroup = group.findIndex(p => p.prompt === point.prompt);
            return {
              ...point,
              groupSize: group.length,
              indexInGroup,
            };
          });

          return (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Sentiment by Question</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Which questions lead to positive vs negative descriptions of {effectiveBrand}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={sentimentByPromptSourceFilter}
                    onChange={(e) => setSentimentByPromptSourceFilter(e.target.value)}
                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  >
                    <option value="all">All Sources</option>
                    {sourceOptions.map((domain) => (
                      <option key={domain} value={domain}>{domain}</option>
                    ))}
                  </select>
                  <select
                    value={sentimentByPromptBrandFilter || runStatus?.brand || ''}
                    onChange={(e) => setSentimentByPromptBrandFilter(e.target.value)}
                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  >
                    {brandOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              {/* Sentiment Legend */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-4">
                <span className="text-xs text-gray-600 font-medium">Sentiment:</span>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#15803d' }} />
                  <span className="text-xs text-gray-500">Strong</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#22c55e' }} />
                  <span className="text-xs text-gray-500">Positive</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#eab308' }} />
                  <span className="text-xs text-gray-500">Neutral</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#f97316' }} />
                  <span className="text-xs text-gray-500">Conditional</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#dc2626' }} />
                  <span className="text-xs text-gray-500">Negative</span>
                </div>
              </div>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 30, right: 40, bottom: 60, left: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      dataKey="avgSentimentScore"
                      name="Avg. Sentiment"
                      domain={[xMin, xMax]}
                      ticks={xTicks}
                      tickFormatter={(value) => ['', 'Negative', 'Conditional', 'Neutral', 'Positive', 'Strong'][Math.round(value)] || ''}
                      tick={{ fill: '#6b7280', fontSize: 12 }}
                      label={{ value: 'Average Sentiment', position: 'bottom', offset: 25, style: { fill: '#374151', fontSize: 14, fontWeight: 500 } }}
                    />
                    <YAxis
                      type="number"
                      dataKey="mentioned"
                      name="Mentions"
                      domain={[0, yMax]}
                      tick={{ fill: '#6b7280', fontSize: 12 }}
                      label={{
                        value: 'Number of Mentions',
                        angle: -90,
                        position: 'insideLeft',
                        offset: 10,
                        style: { fill: '#374151', fontSize: 14, fontWeight: 500, textAnchor: 'middle' }
                      }}
                    />
                    <Tooltip
                      cursor={false}
                      isAnimationActive={false}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length > 0) {
                          const data = payload[0].payload;
                          const sentimentLabels = ['', 'Negative', 'Conditional', 'Neutral', 'Positive', 'Strong'];
                          return (
                            <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm max-w-[300px]">
                              <p className="font-medium text-gray-900 mb-2 line-clamp-2">{data.prompt}</p>
                              <div className="space-y-1 text-gray-600">
                                <p>Sentiment: <span className="font-medium">{sentimentLabels[Math.round(data.avgSentimentScore)] || 'N/A'}</span></p>
                                <p>Mentions: <span className="font-medium">{data.mentioned}</span> of {data.total} responses</p>
                                <p>Visibility: <span className="font-medium">{data.visibilityScore.toFixed(0)}%</span></p>
                                {data.avgRank && (
                                  <p>Avg. Position: <span className="font-medium">#{data.avgRank.toFixed(1)}</span></p>
                                )}
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Scatter
                      data={processedData}
                      shape={(props: any) => {
                        const { cx, cy, payload } = props;
                        const groupSize = payload.groupSize || 1;
                        const indexInGroup = payload.indexInGroup || 0;

                        // Color based on sentiment (green = good, red = bad)
                        const sentiment = payload.avgSentimentScore || 3;
                        const getColor = () => {
                          if (sentiment >= 4.5) return '#15803d'; // Strong - dark green
                          if (sentiment >= 3.5) return '#22c55e'; // Positive - green
                          if (sentiment >= 2.5) return '#eab308'; // Neutral - yellow
                          if (sentiment >= 1.5) return '#f97316'; // Conditional - orange
                          return '#dc2626'; // Negative - red
                        };
                        const getStroke = () => {
                          if (sentiment >= 4.5) return '#166534';
                          if (sentiment >= 3.5) return '#166534';
                          if (sentiment >= 2.5) return '#a16207';
                          if (sentiment >= 1.5) return '#c2410c';
                          return '#991b1b';
                        };

                        const circleRadius = 10;
                        const spacing = 22;
                        const totalWidth = (groupSize - 1) * spacing;
                        const xOffset = groupSize > 1 ? (indexInGroup * spacing) - (totalWidth / 2) : 0;

                        // Truncate prompt for label
                        const shortPrompt = payload.prompt.length > 20
                          ? payload.prompt.substring(0, 18) + '...'
                          : payload.prompt;

                        // Label positioning
                        let labelXOffset = 0;
                        let labelYOffset = -14;
                        let textAnchor: 'start' | 'middle' | 'end' = 'middle';

                        if (groupSize === 2) {
                          labelYOffset = indexInGroup === 0 ? -14 : 22;
                        } else if (groupSize >= 3) {
                          const angles = [-90, 150, 30, -45, -135, 90];
                          const angle = angles[indexInGroup % angles.length];
                          const radians = (angle * Math.PI) / 180;
                          labelXOffset = Math.cos(radians) * 18;
                          labelYOffset = Math.sin(radians) * 18;
                          if (labelXOffset < -5) textAnchor = 'end';
                          else if (labelXOffset > 5) textAnchor = 'start';
                        }

                        return (
                          <g>
                            <circle
                              cx={cx + xOffset}
                              cy={cy}
                              r={circleRadius}
                              fill={getColor()}
                              stroke={getStroke()}
                              strokeWidth={2}
                              opacity={0.85}
                              style={{ cursor: 'pointer' }}
                            />
                            <text
                              x={cx + xOffset + labelXOffset}
                              y={cy + labelYOffset}
                              textAnchor={textAnchor}
                              fill="#374151"
                              fontSize={10}
                              fontWeight={500}
                            >
                              {shortPrompt}
                            </text>
                          </g>
                        );
                      }}
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        })()}

        {/* Sentiment by Provider */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 overflow-visible">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Sentiment by AI Platform</h3>
              <p className="text-sm text-gray-500 mt-0.5">How each AI platform describes your brand</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={sentimentProviderCitationFilter}
                onChange={(e) => setSentimentProviderCitationFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              >
                <option value="all">All Sources</option>
                {citationSourceOptions.map((domain) => (
                  <option key={domain} value={domain}>{domain}</option>
                ))}
              </select>
              <select
                value={sentimentProviderBrandFilter || runStatus?.brand || ''}
                onChange={(e) => setSentimentProviderBrandFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              >
                {sentimentProviderBrandOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-sm text-gray-500 mb-6">How different AI models describe {effectiveSentimentBrand || 'your brand'}</p>

          <div className="overflow-visible pb-4">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Provider</th>
                  <th className="text-center py-3 px-2 text-sm font-medium text-green-600">
                    <div>Highly</div>
                    <div>Recommended</div>
                  </th>
                  <th className="text-center py-3 px-2 text-sm font-medium text-green-500">Recommended</th>
                  <th className="text-center py-3 px-2 text-sm font-medium text-gray-500">Mentioned</th>
                  <th className="text-center py-3 px-2 text-sm font-medium text-amber-500">
                    <div>With</div>
                    <div>Caveats</div>
                  </th>
                  <th className="text-center py-3 px-2 text-sm font-medium text-red-500">
                    <div>Not</div>
                    <div>Recommended</div>
                  </th>
                  <th className="text-center py-3 px-2 text-sm font-medium text-gray-400">
                    <div>Not</div>
                    <div>Mentioned</div>
                  </th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-500">
                    <div>Endorsement</div>
                    <div>Rate</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sentimentByProvider.map((row, rowIndex) => {
                  // Show popup above for bottom 2 rows, below for top 2 rows to prevent cutoff
                  // Show popup above (top-right) for bottom 2 rows, below (bottom-right) for all others
                  const isBottomRow = rowIndex >= sentimentByProvider.length - 2;
                  const popupPos = isBottomRow ? 'top' : 'bottom';

                  return (
                    <tr key={row.provider} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <span className="text-sm font-medium text-gray-900">{row.label}</span>
                      </td>
                      <td className="text-center py-3 px-2">
                        <SentimentBadgeWithPreview
                          provider={row.provider}
                          sentiment="strong_endorsement"
                          count={row.strong_endorsement}
                          bgColor="bg-green-100"
                          textColor="text-green-800"
                          popupPosition={popupPos}
                        />
                      </td>
                      <td className="text-center py-3 px-2">
                        <SentimentBadgeWithPreview
                          provider={row.provider}
                          sentiment="positive_endorsement"
                          count={row.positive_endorsement}
                          bgColor="bg-lime-100"
                          textColor="text-lime-800"
                          popupPosition={popupPos}
                        />
                      </td>
                      <td className="text-center py-3 px-2">
                        <SentimentBadgeWithPreview
                          provider={row.provider}
                          sentiment="neutral_mention"
                          count={row.neutral_mention}
                          bgColor="bg-blue-100"
                          textColor="text-blue-800"
                          popupPosition={popupPos}
                        />
                      </td>
                      <td className="text-center py-3 px-2">
                        <SentimentBadgeWithPreview
                          provider={row.provider}
                          sentiment="conditional"
                          count={row.conditional}
                          bgColor="bg-yellow-100"
                          textColor="text-yellow-800"
                          popupPosition={popupPos}
                        />
                      </td>
                      <td className="text-center py-3 px-2">
                        <SentimentBadgeWithPreview
                          provider={row.provider}
                          sentiment="negative_comparison"
                          count={row.negative_comparison}
                          bgColor="bg-red-100"
                          textColor="text-red-800"
                          popupPosition={popupPos}
                        />
                      </td>
                      <td className="text-center py-3 px-2">
                        <SentimentBadgeWithPreview
                          provider={row.provider}
                          sentiment="not_mentioned"
                          count={row.not_mentioned}
                          bgColor="bg-gray-100"
                          textColor="text-gray-600"
                          popupPosition={popupPos}
                        />
                      </td>
                      <td className="text-center py-3 px-4">
                        <span className={`text-sm font-semibold ${row.strongRate >= 50 ? 'text-green-500' : row.strongRate >= 25 ? 'text-green-400' : 'text-gray-500'}`}>
                          {row.strongRate.toFixed(0)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
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
                    <th className="text-center py-3 px-2 text-sm font-medium text-green-600">
                      <div>Highly</div>
                      <div>Recommended</div>
                    </th>
                    <th className="text-center py-3 px-2 text-sm font-medium text-green-500">Recommended</th>
                    <th className="text-center py-3 px-2 text-sm font-medium text-gray-500">Mentioned</th>
                    <th className="text-center py-3 px-2 text-sm font-medium text-amber-500">
                      <div>With</div>
                      <div>Caveats</div>
                    </th>
                    <th className="text-center py-3 px-2 text-sm font-medium text-red-500">
                      <div>Not</div>
                      <div>Recommended</div>
                    </th>
                    <th className="text-center py-3 px-4 text-sm font-medium text-gray-500">
                      <div>Endorsement</div>
                      <div>Rate</div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {/* Add the brand first for comparison */}
                  <tr className="border-b border-gray-200 bg-gray-100/30">
                    <td className="py-3 px-4">
                      <span className="text-sm font-medium text-gray-900">{runStatus?.brand} (Your Brand)</span>
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
                      <span className="text-sm font-medium text-gray-900">
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
                      <td className="text-center py-3 px-4">
                        <span className={`text-sm font-semibold ${row.strongRate >= 50 ? 'text-green-500' : row.strongRate >= 25 ? 'text-green-400' : 'text-gray-500'}`}>
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
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 border-b border-gray-100">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Sentiment Details</h3>
              <p className="text-sm text-gray-500 mt-0.5">How each AI response describes your brand</p>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={responseSentimentFilter}
                onChange={(e) => setResponseSentimentFilter(e.target.value)}
                className="px-4 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              >
                <option value="all">All Sentiments</option>
                <option value="strong_endorsement">Highly Recommended</option>
                <option value="positive_endorsement">Recommended</option>
                <option value="neutral_mention">Mentioned</option>
                <option value="conditional">With Caveats</option>
                <option value="negative_comparison">Not Recommended</option>
              </select>
              <select
                value={responseLlmFilter}
                onChange={(e) => setResponseLlmFilter(e.target.value)}
                className="px-4 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              >
                <option value="all">All Models</option>
                {availableProviders.map((provider) => (
                  <option key={provider} value={provider}>{getProviderLabel(provider)}</option>
                ))}
              </select>
            </div>
          </div>

          {(() => {
            const filteredSentimentResults = globallyFilteredResults
              .filter((r: Result) => !r.error && r.brand_sentiment)
              .filter((r: Result) => responseSentimentFilter === 'all' || r.brand_sentiment === responseSentimentFilter)
              .filter((r: Result) => responseLlmFilter === 'all' || r.provider === responseLlmFilter);

            return (
              <>
                <div className="px-6 py-3 border-b border-gray-100">
                  <p className="text-sm text-gray-500">
                    Showing {filteredSentimentResults.length} of {globallyFilteredResults.filter((r: Result) => !r.error && r.brand_sentiment).length} results
                  </p>
                </div>

                {/* Table */}
                <div className="overflow-x-auto min-h-0">
                  <table className="w-full table-fixed">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50/50">
                        <th className="w-[30%] text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Prompt</th>
                        <th className="w-[12%] text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">LLM</th>
                        <th className="w-[10%] text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Position</th>
                        <th className="w-[18%] text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Sentiment</th>
                        <th className="w-[20%] text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Competitors</th>
                        <th className="w-[10%] text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                  </table>
                  {/* Scrollable tbody wrapper */}
                  <div className="max-h-[540px] overflow-y-auto overscroll-contain">
                    <table className="w-full table-fixed">
                      <colgroup>
                        <col className="w-[30%]" />
                        <col className="w-[12%]" />
                        <col className="w-[10%]" />
                        <col className="w-[18%]" />
                        <col className="w-[20%]" />
                        <col className="w-[10%]" />
                      </colgroup>
                      <tbody>
                        {filteredSentimentResults.map((result: Result) => {
                        // Calculate rank
                        let rank = 0;
                        const brandLower = (runStatus?.brand || '').toLowerCase();
                        if (result.brand_mentioned && result.response_text) {
                          const allBrands: string[] = result.all_brands_mentioned && result.all_brands_mentioned.length > 0
                            ? result.all_brands_mentioned.filter((b): b is string => typeof b === 'string')
                            : [runStatus?.brand, ...(result.competitors_mentioned || [])].filter((b): b is string => typeof b === 'string');

                          let foundIndex = allBrands.findIndex(b => b.toLowerCase() === brandLower);
                          if (foundIndex === -1) {
                            foundIndex = allBrands.findIndex(b =>
                              b.toLowerCase().includes(brandLower) || brandLower.includes(b.toLowerCase())
                            );
                          }
                          if (foundIndex === -1) {
                            const brandPos = result.response_text.toLowerCase().indexOf(brandLower);
                            if (brandPos >= 0) {
                              let brandsBeforeCount = 0;
                              for (const b of allBrands) {
                                const bPos = result.response_text.toLowerCase().indexOf(b.toLowerCase());
                                if (bPos >= 0 && bPos < brandPos) brandsBeforeCount++;
                              }
                              rank = brandsBeforeCount + 1;
                            } else {
                              rank = allBrands.length + 1;
                            }
                          } else {
                            rank = foundIndex + 1;
                          }
                        }

                        // Position badge styling
                        const getPositionBadge = () => {
                          if (rank === 0) {
                            return (
                              <span className="inline-flex items-center justify-center px-3 py-1 text-xs font-medium text-gray-500 border border-gray-200 rounded-lg bg-white">
                                Not shown
                              </span>
                            );
                          }
                          const colors = rank === 1
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : rank === 2
                            ? 'bg-gray-50 text-gray-600 border-gray-200'
                            : rank === 3
                            ? 'bg-orange-50 text-orange-700 border-orange-200'
                            : 'bg-gray-50 text-gray-500 border-gray-200';
                          return (
                            <span className={`inline-flex items-center justify-center w-10 h-10 text-sm font-semibold rounded-full border-2 ${colors}`}>
                              #{rank}
                            </span>
                          );
                        };

                        // Sentiment badge
                        const getSentimentBadge = () => {
                          const sentiment = result.brand_sentiment;
                          if (!sentiment || sentiment === 'not_mentioned') {
                            return (
                              <span className="inline-flex items-center px-3 py-1 text-xs font-medium text-gray-500 border border-gray-200 rounded-full bg-white">
                                Not mentioned
                              </span>
                            );
                          }
                          const configs: Record<string, { bg: string; text: string; border: string; label: string }> = {
                            'strong_endorsement': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', label: 'Highly Recommended' },
                            'positive_endorsement': { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', label: 'Recommended' },
                            'neutral_mention': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', label: 'Neutral' },
                            'conditional': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', label: 'With Caveats' },
                            'negative_comparison': { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', label: 'Not Recommended' },
                          };
                          const config = configs[sentiment] || { bg: 'bg-gray-50', text: 'text-gray-500', border: 'border-gray-200', label: 'Unknown' };
                          return (
                            <span className={`inline-flex items-center px-3 py-1 text-xs font-medium rounded-full border ${config.bg} ${config.text} ${config.border}`}>
                              {config.label}
                            </span>
                          );
                        };

                        // Get competitor info
                        const competitors = result.competitors_mentioned || [];
                        const getCompetitorsList = () => {
                          if (competitors.length === 0) {
                            return <span className="text-sm text-gray-400">None</span>;
                          }
                          const displayed = competitors.slice(0, 2);
                          const remaining = competitors.length - 2;
                          return (
                            <span className="text-sm text-gray-700">
                              {displayed.join(', ')}
                              {remaining > 0 && (
                                <span className="text-gray-400 ml-1">+{remaining}</span>
                              )}
                            </span>
                          );
                        };

                        return (
                          <tr
                            key={result.id}
                            className="border-b border-gray-100 cursor-pointer transition-colors hover:bg-gray-50/40"
                            onClick={() => setSelectedResult(result)}
                          >
                            <td className="py-4 px-4">
                              <p className="text-sm text-gray-900 font-medium">{truncate(result.prompt, 40)}</p>
                            </td>
                            <td className="py-4 px-4">
                              <span className="text-sm text-gray-600">{getProviderLabel(result.provider)}</span>
                            </td>
                            <td className="py-4 px-4 text-center">
                              {getPositionBadge()}
                            </td>
                            <td className="py-4 px-4 text-center">
                              {getSentimentBadge()}
                            </td>
                            <td className="py-4 px-4">
                              {getCompetitorsList()}
                            </td>
                            <td className="py-4 px-4 text-right">
                              <span className="inline-flex items-center gap-1 text-sm text-gray-900 font-medium">
                                View <ExternalLink className="w-3 h-3" />
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            );
          })()}

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-4 bg-gray-50/50 border-t border-gray-100 rounded-b-2xl">
            <button
              onClick={handleExportSentimentCSV}
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
      </div>
    );
  };

  // Recommendations Tab Content
  const RecommendationsTab = () => {
    // Fetch site audits for this session
    const sessionId = getSessionId();
    const { data: siteAuditsData } = useSiteAudits(sessionId);
    const siteAudits = siteAuditsData?.audits || [];

    // Find the most recent completed audit (preferably for the brand's domain)
    const latestAudit = useMemo(() => {
      const completed = siteAudits.filter(a => a.status === 'complete' && a.overall_score != null);
      if (completed.length === 0) return null;
      // Sort by created_at descending
      return completed.sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0];
    }, [siteAudits]);

    // Calculate high-impact actions with unified scoring system
    const quickWins = useMemo(() => {
      if (!runStatus) return [];

      interface QuickWin {
        type: 'prompt_gap' | 'provider_gap' | 'source_gap';
        severity: 'critical' | 'high' | 'medium';
        title: string;
        description: string;
        competitors?: string[];
        score: number;
        metrics: {
          brandVisibility: number;
          competitorVisibility: number;
          responseCount: number;
        };
      }

      const allWins: QuickWin[] = [];

      // Calculate global brand average visibility for relative comparisons
      const brandGlobalAvgRate = brandBreakdownStats.find(b => b.isSearchedBrand)?.visibilityScore || 0;

      // --- PROMPT GAPS ---
      // Eligibility: total responses >= 5, competitor avg >= 40%, brand visibility < 25%
      promptBreakdownStats.forEach(prompt => {
        const totalResponses = prompt.total;
        const brandVisibility = prompt.visibilityScore;

        // Calculate competitor average visibility for this prompt
        const competitorStats = brandBreakdownStats
          .filter(b => !b.isSearchedBrand)
          .map(b => {
            const promptStat = b.promptsWithStats.find(ps => ps.prompt === prompt.prompt);
            return { brand: b.brand, rate: promptStat?.rate || 0 };
          })
          .filter(c => c.rate > 0);

        const competitorAvgVisibility = competitorStats.length > 0
          ? competitorStats.reduce((sum, c) => sum + c.rate, 0) / competitorStats.length
          : 0;

        const topCompetitors = competitorStats
          .sort((a, b) => b.rate - a.rate)
          .slice(0, 3)
          .map(c => c.brand);

        // Eligibility filters
        if (totalResponses < 5) return;
        if (competitorAvgVisibility < 40) return;
        if (brandVisibility >= 25) return;

        // Severity classification
        const severity: 'critical' | 'high' | 'medium' =
          brandVisibility < 10 && competitorAvgVisibility > 60 ? 'critical' : 'high';

        // Scoring components (normalized to 0-1)
        const visibilityGapScore = (competitorAvgVisibility - brandVisibility) / 100;
        const competitorStrengthScore = competitorAvgVisibility / 100;
        const responseVolumeScore = Math.min(1, Math.log(totalResponses + 1) / Math.log(50));
        const confidenceScore = Math.min(1, totalResponses / 10);

        const quickWinScore = visibilityGapScore + competitorStrengthScore + responseVolumeScore + confidenceScore;

        allWins.push({
          type: 'prompt_gap',
          severity,
          title: `Expand visibility for "${truncate(prompt.prompt, 45)}"`,
          description: `Your brand appears in ${brandVisibility.toFixed(0)}% of responses vs competitors at ${competitorAvgVisibility.toFixed(0)}%`,
          competitors: topCompetitors,
          score: quickWinScore,
          metrics: {
            brandVisibility,
            competitorVisibility: competitorAvgVisibility,
            responseCount: totalResponses,
          },
        });
      });

      // --- PROVIDER GAPS ---
      // Calculate competitor averages per provider
      const providerCompetitorRates: Record<string, number[]> = {};
      globallyFilteredResults.forEach((r: Result) => {
        if (r.error) return;
        if (!providerCompetitorRates[r.provider]) {
          providerCompetitorRates[r.provider] = [];
        }
        const competitorMentionCount = r.competitors_mentioned?.length || 0;
        if (competitorMentionCount > 0) {
          providerCompetitorRates[r.provider].push(1);
        } else {
          providerCompetitorRates[r.provider].push(0);
        }
      });

      Object.entries(llmBreakdownStats).forEach(([provider, stats]) => {
        const brandProviderRate = stats.rate * 100;
        const responseCount = stats.total;

        // Calculate competitor average rate for this provider
        const competitorRates = providerCompetitorRates[provider] || [];
        const competitorProviderAvgRate = competitorRates.length > 0
          ? (competitorRates.reduce((a, b) => a + b, 0) / competitorRates.length) * 100
          : 0;

        // Eligibility filters
        if (responseCount < 3) return;
        if (competitorProviderAvgRate < brandProviderRate + 15) return;

        // Severity classification
        const severity: 'critical' | 'high' | 'medium' = brandProviderRate < 15 ? 'high' : 'medium';

        // Scoring components
        const visibilityGapScore = (competitorProviderAvgRate - brandProviderRate) / 100;
        const competitorStrengthScore = competitorProviderAvgRate / 100;
        const responseVolumeScore = Math.min(1, Math.log(responseCount + 1) / Math.log(30));
        const confidenceScore = Math.min(1, responseCount / 8);

        const quickWinScore = visibilityGapScore + competitorStrengthScore + responseVolumeScore + confidenceScore;

        allWins.push({
          type: 'provider_gap',
          severity,
          title: `Improve visibility on ${getProviderLabel(provider)}`,
          description: `Your brand appears in ${brandProviderRate.toFixed(0)}% of responses vs competitors at ${competitorProviderAvgRate.toFixed(0)}% across ${responseCount} answers`,
          score: quickWinScore,
          metrics: {
            brandVisibility: brandProviderRate,
            competitorVisibility: competitorProviderAvgRate,
            responseCount,
          },
        });
      });

      // --- SOURCE GAPS ---
      const sourceData: Record<string, {
        brandMentions: number;
        competitors: string[];
        appearanceCount: number;
      }> = {};

      globallyFilteredResults.forEach((r: Result) => {
        if (!r.sources) return;
        r.sources.forEach(s => {
          try {
            const domain = s.url ? new URL(s.url).hostname.replace('www.', '') : '';
            if (!domain) return;

            if (!sourceData[domain]) {
              sourceData[domain] = { brandMentions: 0, competitors: [], appearanceCount: 0 };
            }

            sourceData[domain].appearanceCount++;

            if (r.brand_mentioned) {
              sourceData[domain].brandMentions++;
            }
            if (r.competitors_mentioned) {
              r.competitors_mentioned.forEach(comp => {
                if (!sourceData[domain].competitors.includes(comp)) {
                  sourceData[domain].competitors.push(comp);
                }
              });
            }
          } catch {}
        });
      });

      Object.entries(sourceData).forEach(([domain, data]) => {
        // Eligibility filters: appears in >= 3 responses, cites >= 2 competitors, never cites brand
        if (data.appearanceCount < 3) return;
        if (data.competitors.length < 2) return;
        if (data.brandMentions > 0) return;

        // Scoring components
        const authorityScore = Math.min(1, Math.log(data.appearanceCount + 1) / Math.log(20));
        const competitorStrengthScore = Math.min(1, data.competitors.length / 5);
        const confidenceScore = Math.min(1, data.appearanceCount / 6);
        const visibilityGapScore = 0.5; // Fixed since brand has 0% on this source

        const quickWinScore = visibilityGapScore + competitorStrengthScore + authorityScore + confidenceScore;

        allWins.push({
          type: 'source_gap',
          severity: data.competitors.length >= 4 ? 'high' : 'medium',
          title: `Target coverage from ${domain}`,
          description: `This source frequently cites ${data.competitors.length} competitors but has never mentioned your brand`,
          competitors: data.competitors.slice(0, 4),
          score: quickWinScore,
          metrics: {
            brandVisibility: 0,
            competitorVisibility: (data.competitors.length / 5) * 100,
            responseCount: data.appearanceCount,
          },
        });
      });

      // Sort all wins by score and return top 5
      return allWins
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
    }, [runStatus, promptBreakdownStats, brandBreakdownStats, llmBreakdownStats, globallyFilteredResults]);

    // Calculate ChatGPT ad opportunities - prompts with low visibility but high competitor presence
    const adOpportunities = useMemo(() => {
      if (!runStatus) return [];

      return promptBreakdownStats
        .filter(p => p.visibilityScore < 40)
        .map(prompt => {
          const competitorVisibility = brandBreakdownStats
            .filter(b => !b.isSearchedBrand)
            .reduce((sum, b) => {
              const promptStat = b.promptsWithStats.find(ps => ps.prompt === prompt.prompt);
              return sum + (promptStat?.rate || 0);
            }, 0) / Math.max(brandBreakdownStats.filter(b => !b.isSearchedBrand).length, 1);

          return {
            prompt: prompt.prompt,
            yourVisibility: prompt.visibilityScore,
            competitorAvg: competitorVisibility,
            gap: competitorVisibility - prompt.visibilityScore,
          };
        })
        .filter(p => p.gap > 20)
        .sort((a, b) => b.gap - a.gap)
        .slice(0, 3);
    }, [runStatus, promptBreakdownStats, brandBreakdownStats]);

    // Calculate source opportunities
    const sourceOpportunities = useMemo(() => {
      if (!runStatus) return [];

      const sourceMentions: Record<string, { brand: number; competitors: string[] }> = {};

      globallyFilteredResults.forEach((r: Result) => {
        if (!r.sources) return;
        r.sources.forEach(s => {
          try {
            const domain = s.url ? new URL(s.url).hostname.replace('www.', '') : '';
            if (!domain) return;

            if (!sourceMentions[domain]) {
              sourceMentions[domain] = { brand: 0, competitors: [] };
            }

            if (r.brand_mentioned) {
              sourceMentions[domain].brand++;
            }
            if (r.competitors_mentioned) {
              r.competitors_mentioned.forEach(comp => {
                if (!sourceMentions[domain].competitors.includes(comp)) {
                  sourceMentions[domain].competitors.push(comp);
                }
              });
            }
          } catch {}
        });
      });

      return Object.entries(sourceMentions)
        .filter(([_, data]) => data.brand === 0 && data.competitors.length >= 2)
        .map(([domain, data]) => ({
          domain,
          competitorCount: data.competitors.length,
          competitors: data.competitors.slice(0, 4),
        }))
        .sort((a, b) => b.competitorCount - a.competitorCount)
        .slice(0, 5);
    }, [runStatus, globallyFilteredResults]);

    // Parse AI recommendations and assign effort/impact based on keywords
    const parsedAiRecommendations = useMemo(() => {
      if (!aiSummary?.recommendations) return [];

      const recs: Array<{
        title: string;
        description: string;
        impact: 'high' | 'medium' | 'low';
        effort: 'high' | 'medium' | 'low';
        impactReason: string;
        effortReason: string;
        tactics: string[];
      }> = [];

      // Helper to estimate effort based on keywords - returns level and reason
      const estimateEffort = (text: string): { level: 'high' | 'medium' | 'low'; reason: string } => {
        const lowText = text.toLowerCase();
        // High effort indicators
        if (lowText.includes('partnership') || lowText.includes('outreach') || lowText.includes('pr campaign') ||
            lowText.includes('media coverage') || lowText.includes('influencer') || lowText.includes('backlink') ||
            lowText.includes('get featured') || lowText.includes('earn coverage') || lowText.includes('build relationship')) {
          return { level: 'high', reason: 'Requires partnerships, outreach, or external relationships' };
        }
        // Low effort indicators
        if (lowText.includes('update') || lowText.includes('add') || lowText.includes('include') ||
            lowText.includes('optimize') || lowText.includes('improve') || lowText.includes('tweak') ||
            lowText.includes('ensure') || lowText.includes('check') || lowText.includes('review')) {
          return { level: 'low', reason: 'Simple content updates or optimizations' };
        }
        return { level: 'medium', reason: 'Moderate implementation effort required' };
      };

      // Helper to estimate impact based on keywords - returns level and reason
      const estimateImpact = (text: string): { level: 'high' | 'medium' | 'low'; reason: string } => {
        const lowText = text.toLowerCase();
        // High impact indicators
        if (lowText.includes('significantly') || lowText.includes('major') || lowText.includes('critical') ||
            lowText.includes('key') || lowText.includes('primary') || lowText.includes('essential') ||
            lowText.includes('visibility') || lowText.includes('ranking') || lowText.includes('authority') ||
            lowText.includes('competitor') || lowText.includes('differentiate')) {
          return { level: 'high', reason: 'Directly affects visibility, rankings, or competitive positioning' };
        }
        // Low impact indicators
        if (lowText.includes('minor') || lowText.includes('small') || lowText.includes('slight') ||
            lowText.includes('optional') || lowText.includes('consider')) {
          return { level: 'low', reason: 'Minor or optional improvement' };
        }
        return { level: 'medium', reason: 'Moderate impact on AI visibility' };
      };

      // Helper to extract tactics from recommendation text
      const extractTactics = (text: string, title: string): string[] => {
        const tactics: string[] = [];

        // Remove the title from the text to avoid duplication
        let content = text.replace(title, '').trim();

        // Look for bullet points (-, *, •) or numbered sub-items
        const bulletMatches = content.match(/(?:^|\n)\s*[-*•]\s*([^\n]+)/g);
        if (bulletMatches && bulletMatches.length > 0) {
          bulletMatches.forEach(match => {
            const tactic = match.replace(/^\s*[-*•]\s*/, '').trim();
            if (tactic.length > 10 && tactic.length < 150) {
              tactics.push(tactic.replace(/[*_]/g, ''));
            }
          });
        }

        // If no bullets found, try to extract actionable sentences
        if (tactics.length === 0) {
          const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 15);
          sentences.slice(0, 3).forEach(sentence => {
            const cleaned = sentence.trim().replace(/[*_]/g, '');
            if (cleaned.length > 10 && cleaned.length < 150) {
              tactics.push(cleaned);
            }
          });
        }

        return tactics.slice(0, 4); // Limit to 4 tactics per recommendation
      };

      const recsContent = aiSummary.recommendations;

      if (typeof recsContent === 'string') {
        // Parse markdown text - split by numbered items, bullet points, or double newlines
        const paragraphs = recsContent
          .split(/(?:\n\n|\n(?=\d+\.|\*|\-))/)
          .map(p => p.trim())
          .filter(p => p.length > 20); // Filter out very short fragments

        paragraphs.forEach(para => {
          // Extract title (first sentence or bolded text)
          const boldMatch = para.match(/\*\*([^*]+)\*\*/);
          const numberMatch = para.match(/^\d+\.\s*\*?\*?([^*\n.!?]+)/);

          let title = '';
          let description = para;

          if (boldMatch) {
            title = boldMatch[1].replace(/[.:]/g, '').trim();
            description = para.replace(/\*\*[^*]+\*\*:?\s*/, '').trim();
          } else if (numberMatch) {
            title = numberMatch[1].trim();
            description = para.replace(/^\d+\.\s*/, '').trim();
          } else {
            // Use first sentence as title
            const firstSentence = para.match(/^[^.!?]+[.!?]/);
            if (firstSentence) {
              title = firstSentence[0].replace(/[.!?]$/, '').trim();
              description = para.substring(firstSentence[0].length).trim();
            } else {
              title = para.substring(0, 50) + (para.length > 50 ? '...' : '');
              description = para;
            }
          }

          // Clean up markdown formatting
          title = title.replace(/[*_#]/g, '').trim();
          description = description.replace(/[*_#]/g, '').substring(0, 150);
          if (description.length === 150) description += '...';

          if (title && title.length > 5) {
            const impactResult = estimateImpact(para);
            const effortResult = estimateEffort(para);
            const tactics = extractTactics(para, title);
            recs.push({
              title,
              description,
              impact: impactResult.level,
              effort: effortResult.level,
              impactReason: impactResult.reason,
              effortReason: effortResult.reason,
              tactics,
            });
          }
        });
      } else if (Array.isArray(recsContent)) {
        // Handle array format
        (recsContent as Array<{title: string; description: string; tactics?: string[]}>).forEach(rec => {
          const fullText = `${rec.title} ${rec.description} ${rec.tactics?.join(' ') || ''}`;
          const impactResult = estimateImpact(fullText);
          const effortResult = estimateEffort(fullText);
          recs.push({
            title: rec.title,
            description: rec.description,
            impact: impactResult.level,
            effort: effortResult.level,
            impactReason: impactResult.reason,
            effortReason: effortResult.reason,
            tactics: rec.tactics || [],
          });
        });
      }

      return recs.slice(0, 6); // Limit to 6 items for the chart
    }, [aiSummary?.recommendations]);

    const getImpactBadge = (impact: 'high' | 'medium' | 'low') => {
      const colors = {
        high: 'bg-green-100 text-green-700 border-green-200',
        medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
        low: 'bg-gray-100 text-gray-600 border-gray-200',
      };
      return colors[impact];
    };

    const getEffortBadge = (effort: 'high' | 'medium' | 'low') => {
      const colors = {
        high: 'bg-red-50 text-red-600 border-red-200',
        medium: 'bg-orange-50 text-orange-600 border-orange-200',
        low: 'bg-blue-50 text-blue-600 border-blue-200',
      };
      return colors[effort];
    };

    // Show loading state while AI summary is being generated
    if (isSummaryLoading) {
      return (
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl shadow-sm border border-blue-100 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
                <Sparkles className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">AI-Powered Recommendations</h2>
                <p className="text-sm text-gray-600">Generating personalized strategy brief...</p>
              </div>
            </div>
            <div className="bg-white rounded-lg p-8 border border-gray-200">
              <div className="flex flex-col items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mb-4"></div>
                <p className="text-sm text-gray-500">Analyzing your visibility data and generating recommendations...</p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* AI-Generated Recommendations */}
        {aiSummary?.recommendations && (() => {
          const recs = aiSummary.recommendations as unknown;
          if (typeof recs === 'string') return recs.length > 0;
          if (Array.isArray(recs)) return recs.length > 0;
          return false;
        })() && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl shadow-sm border border-blue-100 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
                <Sparkles className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">AI-Powered Recommendations</h2>
                <p className="text-sm text-gray-600">Personalized strategy brief based on your visibility analysis</p>
              </div>
            </div>

            <div className="bg-white rounded-lg p-5 border border-gray-200">
              <div className="text-sm text-gray-700 leading-relaxed space-y-4 [&_strong]:font-semibold [&_strong]:text-gray-900 [&_p]:my-0">
                {typeof (aiSummary.recommendations as unknown) === 'string' ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiSummary.recommendations as string}</ReactMarkdown>
                ) : (
                  // Fallback for old array format during transition
                  <div className="space-y-4">
                    {(aiSummary.recommendations as unknown as Array<{title: string; description: string; tactics?: string[]}>).map((rec, idx) => (
                      <div key={idx}>
                        <p><strong>{rec.title}.</strong> {rec.description}</p>
                        {rec.tactics && rec.tactics.length > 0 && (
                          <p className="mt-1 text-gray-600">{rec.tactics.join(' ')}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Recommended High-Impact Actions - only show after AI recommendations have loaded */}
        {aiSummary?.recommendations && parsedAiRecommendations.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-[#E8F5E9] rounded-lg flex items-center justify-center">
              <Target className="w-5 h-5 text-gray-900" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Recommended High-Impact Actions</h2>
              <p className="text-sm text-gray-500">Prioritized opportunities to improve your AI visibility</p>
            </div>
          </div>

          {/* Effort vs Impact Matrix Chart */}
          {parsedAiRecommendations.length > 0 && (() => {
            // Calculate positions and handle overlapping circles
            const effortMap = { low: 16.67, medium: 50, high: 83.33 };
            const impactMap = { low: 83.33, medium: 50, high: 16.67 };

            // Group items by position to detect overlaps
            const positionGroups: Record<string, number[]> = {};
            parsedAiRecommendations.forEach((rec, idx) => {
              const key = `${rec.effort}-${rec.impact}`;
              if (!positionGroups[key]) positionGroups[key] = [];
              positionGroups[key].push(idx);
            });

            // Calculate offset for each item - stack vertically when overlapping
            const getOffset = (idx: number, rec: typeof parsedAiRecommendations[0]) => {
              const key = `${rec.effort}-${rec.impact}`;
              const group = positionGroups[key];
              const posInGroup = group.indexOf(idx);
              const total = group.length;
              if (total === 1) return { x: 0, y: 0 };
              // Stack items vertically with 28px spacing to prevent label overlap
              const verticalSpacing = 28;
              const totalHeight = (total - 1) * verticalSpacing;
              const startY = -totalHeight / 2;
              return { x: 0, y: startY + posInGroup * verticalSpacing };
            };

            return (
            <div className="mb-6">
              <div className="relative bg-white rounded-lg p-4">
                {/* Chart container */}
                <div className="ml-8">
                  {/* Y-axis labels */}
                  <div className="flex">
                    {/* Y-axis label (rotated) - positioned to align with grid center */}
                    <div className="relative w-6 flex items-center justify-center" style={{ height: '315px' }}>
                      <span className="-rotate-90 text-sm font-semibold text-gray-600 whitespace-nowrap">
                        Impact
                      </span>
                    </div>
                    <div className="w-10 flex flex-col justify-between text-right pr-2 text-xs text-gray-400" style={{ height: '315px' }}>
                      <span>High</span>
                      <span>Med</span>
                      <span>Low</span>
                    </div>

                    {/* Grid */}
                    <div className="flex-1 relative" style={{ height: '315px' }}>
                      {/* Background grid - simplified */}
                      <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
                        {/* Quick Wins quadrant (top-left) - label in top-left corner */}
                        <div className="bg-[#E8F5E9] border border-gray-100 relative">
                          <span className="absolute top-1 left-1 text-[9px] text-gray-900 font-medium opacity-70">Quick Wins</span>
                        </div>
                        <div className="bg-[#E8F5E9]/50 border border-gray-100" />
                        {/* Major Projects quadrant (top-right) - label in top-right corner */}
                        <div className="bg-amber-50/70 border border-gray-100 relative">
                          <span className="absolute top-1 right-1 text-[9px] text-amber-600 font-medium opacity-70">Major Projects</span>
                        </div>
                        <div className="bg-gray-50 border border-gray-100" />
                        <div className="bg-gray-50 border border-gray-100" />
                        <div className="bg-gray-50 border border-gray-100" />
                        {/* Fill-ins quadrant (bottom-left) - label in bottom-left corner */}
                        <div className="bg-blue-50/50 border border-gray-100 relative">
                          <span className="absolute bottom-1 left-1 text-[9px] text-blue-500 font-medium opacity-70">Fill-ins</span>
                        </div>
                        <div className="bg-gray-50/50 border border-gray-100" />
                        {/* Avoid quadrant (bottom-right) - label in bottom-right corner */}
                        <div className="bg-red-50/50 border border-gray-100 relative">
                          <span className="absolute bottom-1 right-1 text-[9px] text-red-400 font-medium opacity-70">Avoid</span>
                        </div>
                      </div>

                      {/* Plot points with labels */}
                      {parsedAiRecommendations.map((rec, idx) => {
                        const x = effortMap[rec.effort];
                        const y = impactMap[rec.impact];
                        const offset = getOffset(idx, rec);

                        // Build detailed tooltip
                        const quadrantName =
                          rec.impact === 'high' && rec.effort === 'low' ? 'Quick Win' :
                          rec.impact === 'high' && rec.effort === 'high' ? 'Major Project' :
                          rec.impact === 'low' && rec.effort === 'low' ? 'Fill-in' :
                          rec.impact === 'low' && rec.effort === 'high' ? 'Avoid' : 'Consider';

                        const tooltip = `${rec.title}

${quadrantName.toUpperCase()}

Impact: ${rec.impact.charAt(0).toUpperCase() + rec.impact.slice(1)}
↳ ${rec.impactReason}

Effort: ${rec.effort.charAt(0).toUpperCase() + rec.effort.slice(1)}
↳ ${rec.effortReason}`;

                        // Truncate title for label
                        const shortTitle = rec.title.length > 20
                          ? rec.title.substring(0, 18) + '...'
                          : rec.title;
                        const isTruncated = rec.title.length > 20;

                        return (
                          <div
                            key={idx}
                            className="absolute cursor-default group"
                            style={{
                              left: `${x}%`,
                              top: `${y}%`,
                              transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                              zIndex: 10 + idx
                            }}
                            title={tooltip}
                          >
                            {/* Dot with label */}
                            <div className="flex items-center gap-1.5 relative">
                              <div className="w-3 h-3 bg-gray-900 rounded-full shadow-sm border border-white flex-shrink-0 group-hover:scale-125 transition-transform duration-150" />
                              <span className="text-[11px] font-medium text-gray-700 bg-white/90 px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap group-hover:bg-gray-900 group-hover:text-white transition-colors duration-150">
                                <span className="group-hover:hidden">{shortTitle}</span>
                                <span className="hidden group-hover:inline">{isTruncated ? rec.title : shortTitle}</span>
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* X-axis labels */}
                  <div className="flex mt-2">
                    <div className="w-16" /> {/* Spacer to align with grid (w-6 Impact label + w-10 Y-axis values) */}
                    <div className="flex-1 grid grid-cols-3 text-center text-xs text-gray-400">
                      <span>Low</span>
                      <span>Medium</span>
                      <span>High</span>
                    </div>
                  </div>

                  {/* X-axis label */}
                  <div className="flex mt-1">
                    <div className="w-16" />
                    <div className="flex-1 text-center text-sm font-semibold text-gray-600">
                      Effort
                    </div>
                  </div>
                </div>

              </div>
            </div>
            );
          })()}

          {/* Recommendations Table */}
          {parsedAiRecommendations.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 mt-8">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 border-b border-gray-100">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Detailed Recommendations</h3>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {parsedAiRecommendations.length} actionable recommendations based on your visibility analysis
                  </p>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto min-h-0">
                <table className="w-full table-fixed">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="w-[30%] text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Recommendation
                      </th>
                      <th className="w-[30%] text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Tactics
                      </th>
                      <th className="w-[12%] text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Impact
                      </th>
                      <th className="w-[12%] text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Effort
                      </th>
                      <th className="w-[16%] text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Category
                      </th>
                    </tr>
                  </thead>
                </table>
                {/* Scrollable tbody wrapper */}
                <div className="max-h-[540px] overflow-y-auto overscroll-contain">
                  <table className="w-full table-fixed">
                    <colgroup>
                      <col className="w-[30%]" />
                      <col className="w-[30%]" />
                      <col className="w-[12%]" />
                      <col className="w-[12%]" />
                      <col className="w-[16%]" />
                    </colgroup>
                    <tbody>
                      {parsedAiRecommendations.map((rec, idx) => {
                        const quadrantName =
                          rec.impact === 'high' && rec.effort === 'low' ? 'Quick Win' :
                          rec.impact === 'high' && rec.effort === 'high' ? 'Major Project' :
                          rec.impact === 'low' && rec.effort === 'low' ? 'Fill-in' :
                          rec.impact === 'low' && rec.effort === 'high' ? 'Avoid' : 'Consider';

                        const quadrantColors: Record<string, { bg: string; text: string; border: string }> = {
                          'Quick Win': { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
                          'Major Project': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
                          'Fill-in': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
                          'Avoid': { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
                          'Consider': { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' },
                        };

                        const impactBadge: Record<string, { bg: string; text: string; border: string }> = {
                          high: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
                          medium: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
                          low: { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200' },
                        };

                        const effortBadge: Record<string, { bg: string; text: string; border: string }> = {
                          low: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
                          medium: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
                          high: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
                        };

                        const quadrantStyle = quadrantColors[quadrantName] || quadrantColors['Consider'];
                        const impactStyle = impactBadge[rec.impact] || impactBadge['medium'];
                        const effortStyle = effortBadge[rec.effort] || effortBadge['medium'];

                        return (
                          <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                            <td className="py-4 px-4">
                              <div className="font-medium text-gray-900 text-sm">{rec.title}</div>
                              <div className="text-xs text-gray-500 mt-1.5 space-y-0.5">
                                <span className="block"><span className="font-medium text-gray-600">Impact:</span> {rec.impactReason}</span>
                                <span className="block"><span className="font-medium text-gray-600">Effort:</span> {rec.effortReason}</span>
                              </div>
                            </td>
                            <td className="py-4 px-4">
                              {rec.tactics && rec.tactics.length > 0 ? (
                                <ul className="text-xs text-gray-600 space-y-1.5">
                                  {rec.tactics.map((tactic, tidx) => (
                                    <li key={tidx} className="flex items-start gap-1.5">
                                      <span className="text-gray-900 mt-0.5 flex-shrink-0">•</span>
                                      <span>{tactic}</span>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <span className="text-xs text-gray-400 italic">No specific tactics</span>
                              )}
                            </td>
                            <td className="text-center py-4 px-4">
                              <span className={`inline-flex items-center px-3 py-1 text-xs font-medium rounded-full border ${impactStyle.bg} ${impactStyle.text} ${impactStyle.border}`}>
                                {rec.impact.charAt(0).toUpperCase() + rec.impact.slice(1)}
                              </span>
                            </td>
                            <td className="text-center py-4 px-4">
                              <span className={`inline-flex items-center px-3 py-1 text-xs font-medium rounded-full border ${effortStyle.bg} ${effortStyle.text} ${effortStyle.border}`}>
                                {rec.effort.charAt(0).toUpperCase() + rec.effort.slice(1)}
                              </span>
                            </td>
                            <td className="text-center py-4 px-4">
                              <span className={`inline-flex items-center px-3 py-1 text-xs font-medium rounded-full border ${quadrantStyle.bg} ${quadrantStyle.text} ${quadrantStyle.border}`}>
                                {quadrantName}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
        )}

        {/* Site Audit Insights */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
              <Globe className="w-5 h-5 text-gray-900" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Website LLM Optimization</h2>
              <p className="text-sm text-gray-500">Technical factors affecting your AI visibility</p>
            </div>
          </div>

          {latestAudit ? (
            <div className="space-y-4">
              {/* Audit Summary */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm text-gray-500">Latest audit for</p>
                    <p className="font-medium text-gray-900">{latestAudit.url}</p>
                  </div>
                  <div className={`px-4 py-2 rounded-lg ${
                    (latestAudit.overall_score ?? 0) >= 90 ? 'bg-green-100' :
                    (latestAudit.overall_score ?? 0) >= 70 ? 'bg-lime-100' :
                    (latestAudit.overall_score ?? 0) >= 50 ? 'bg-yellow-100' : 'bg-red-100'
                  }`}>
                    <span className={`text-2xl font-bold ${
                      (latestAudit.overall_score ?? 0) >= 90 ? 'text-green-600' :
                      (latestAudit.overall_score ?? 0) >= 70 ? 'text-lime-600' :
                      (latestAudit.overall_score ?? 0) >= 50 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {latestAudit.overall_score}
                    </span>
                    <span className="text-gray-500 text-sm ml-1">/100</span>
                  </div>
                </div>

                {/* Key findings from the audit */}
                {latestAudit.results && (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
                    {/* AI Crawler Access */}
                    {latestAudit.results.robots_txt && (
                      <div className="bg-white rounded-lg p-3 border border-gray-200">
                        <p className="text-xs text-gray-500 mb-1">AI Crawler Access</p>
                        <div className="flex items-center gap-2">
                          {latestAudit.results.robots_txt.crawlers.every(c => c.allowed) ? (
                            <>
                              <CheckCircle2 className="w-4 h-4 text-green-500" />
                              <span className="text-sm font-medium text-green-700">All allowed</span>
                            </>
                          ) : (
                            <>
                              <AlertTriangle className="w-4 h-4 text-yellow-500" />
                              <span className="text-sm font-medium text-yellow-700">
                                {latestAudit.results.robots_txt.crawlers.filter(c => !c.allowed).length} blocked
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Structured Data */}
                    {latestAudit.results.structured_data && (
                      <div className="bg-white rounded-lg p-3 border border-gray-200">
                        <p className="text-xs text-gray-500 mb-1">Structured Data</p>
                        <div className="flex items-center gap-2">
                          {latestAudit.results.structured_data.has_json_ld ? (
                            <>
                              <CheckCircle2 className="w-4 h-4 text-green-500" />
                              <span className="text-sm font-medium text-green-700">
                                {latestAudit.results.structured_data.json_ld_types.slice(0, 2).join(', ')}
                              </span>
                            </>
                          ) : (
                            <>
                              <X className="w-4 h-4 text-red-500" />
                              <span className="text-sm font-medium text-red-700">Missing JSON-LD</span>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Content Accessibility */}
                    {latestAudit.results.content_accessibility && (
                      <div className="bg-white rounded-lg p-3 border border-gray-200">
                        <p className="text-xs text-gray-500 mb-1">Content Accessibility</p>
                        <div className="flex items-center gap-2">
                          {latestAudit.results.content_accessibility.estimated_ssr ? (
                            <>
                              <CheckCircle2 className="w-4 h-4 text-green-500" />
                              <span className="text-sm font-medium text-green-700">Server-rendered</span>
                            </>
                          ) : (
                            <>
                              <AlertTriangle className="w-4 h-4 text-yellow-500" />
                              <span className="text-sm font-medium text-yellow-700">JavaScript required</span>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Audit recommendations */}
                {latestAudit.recommendations && latestAudit.recommendations.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <p className="text-sm font-medium text-gray-700 mb-2">Top Technical Recommendations</p>
                    <ul className="space-y-2">
                      {latestAudit.recommendations.slice(0, 3).map((rec, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                            rec.priority === 'high' ? 'bg-red-100 text-red-700' :
                            rec.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {rec.priority === 'high' ? 'High' : rec.priority === 'medium' ? 'Med' : 'Low'}
                          </span>
                          <span className="text-gray-700">{rec.title}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <button
                onClick={() => setActiveTab('site-audit')}
                className="text-sm text-gray-900 hover:underline flex items-center gap-1"
              >
                View full site audit details
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-lg p-6 text-center">
              <Globe className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-700 font-medium mb-2">No site audit yet</p>
              <p className="text-sm text-gray-500 mb-4">
                Run a site audit to check if {runStatus?.brand}'s website is optimized for AI search engines like ChatGPT, Claude, and Perplexity.
              </p>
              <button
                onClick={() => setActiveTab('site-audit')}
                className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors inline-flex items-center gap-2"
              >
                <Globe className="w-4 h-4" />
                Run Site Audit
              </button>
            </div>
          )}
        </div>

        {/* Export & Share Footer */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-end gap-3 p-4 bg-gray-50/50 border-t border-gray-100">
            <button
              onClick={() => handleExportRecommendationsPDF(parsedAiRecommendations)}
              disabled={parsedAiRecommendations.length === 0}
              className="px-3 py-1.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileText className="w-4 h-4" />
              Export PDF
            </button>
            <button
              onClick={() => handleExportRecommendationsCSV(parsedAiRecommendations)}
              disabled={parsedAiRecommendations.length === 0}
              className="px-3 py-1.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
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

  // Loading state
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

  // Error state
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
                  <h1 className="text-lg font-semibold text-gray-900">
                    Results for <span className="text-gray-900">{validRunStatus.brand}</span>
                    {isCategory && <span className="text-gray-500 text-sm font-normal ml-1">(category)</span>}
                  </h1>
                  <p className="text-sm text-gray-500">
                    {validRunStatus.completed_at
                      ? `Completed ${formatDate(validRunStatus.completed_at)}`
                      : `Started ${formatDate(validRunStatus.created_at)}`}
                    {' · '}
                    {formatCurrency(validRunStatus.actual_cost)}
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
      <div className="max-w-6xl mx-auto px-6 pt-6">
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'reference' && <ReferenceTab />}
        {activeTab === 'competitive' && (
          <div className="space-y-6">
            {/* Brand Analysis Carousel */}
            {allBrandsAnalysisData.length > 0 && (() => {
              const totalCards = allBrandsAnalysisData.length;
              const canNavigate = totalCards > 1;

              const goToPrevious = () => {
                setBrandCarouselIndex(prev => prev === 0 ? totalCards - 1 : prev - 1);
              };

              const goToNext = () => {
                setBrandCarouselIndex(prev => prev === totalCards - 1 ? 0 : prev + 1);
              };

              const getCarouselProviderLabel = (provider: string) => {
                switch (provider) {
                  case 'openai': return 'ChatGPT';
                  case 'anthropic': return 'Claude';
                  case 'gemini': return 'Gemini';
                  case 'perplexity': return 'Perplexity';
                  case 'ai_overviews': return 'AI Overviews';
                  default: return provider;
                }
              };

              return (
                <div className="relative">
                  {/* Carousel with Side Navigation */}
                  <div className="relative flex items-center">
                    {/* Left Arrow */}
                    {canNavigate && (
                      <button
                        onClick={goToPrevious}
                        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full border border-gray-200 bg-white shadow-sm hover:bg-gray-50 text-gray-400"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                    )}

                    {/* Carousel Cards - Show 3 at a time */}
                    <div className="overflow-hidden w-full px-12">
                      <div
                        className="flex transition-transform duration-300 ease-in-out gap-4"
                        style={{ transform: `translateX(-${brandCarouselIndex * (100 / 3 + 1.33)}%)` }}
                      >
                        {allBrandsAnalysisData.map((brandData) => {
                          const providers = brandData.providerScores.slice(0, 5);

                          // Get provider pill color based on score
                          const getProviderPillStyle = (score: number) => {
                            if (score >= 90) return { bg: 'bg-[#16a34a]', text: 'text-white' }; // Dark green
                            if (score >= 70) return { bg: 'bg-[#4ade80]', text: 'text-gray-800' }; // Light green
                            if (score >= 50) return { bg: 'bg-[#a3a095]', text: 'text-white' }; // Brown/tan
                            return { bg: 'bg-gray-200', text: 'text-gray-600' }; // Gray
                          };

                          // Get visibility score color based on value
                          // Gradient: light green (75+) -> light brown (50) -> light gray (0)
                          const getScoreColor = (score: number) => {
                            if (score >= 75) return '#86efac'; // Light green (green-300)
                            if (score >= 65) return '#a7f3d0'; // Lighter green (green-200)
                            if (score >= 55) return '#c4d4a5'; // Green-tan transition
                            if (score >= 45) return '#d4c9a5'; // Light tan/brown
                            if (score >= 35) return '#c9bfa0'; // Tan
                            if (score >= 25) return '#bfb8a8'; // Gray-tan
                            if (score >= 15) return '#b8b8b8'; // Light gray
                            return '#d1d5db'; // Lighter gray (gray-300)
                          };

                          return (
                            <div key={brandData.brand} className="w-1/3 flex-shrink-0 min-w-[220px]">
                              <div className={`bg-white rounded-xl shadow-sm px-4 py-4 h-full hover:shadow-md transition-shadow ${
                                brandData.isSearchedBrand
                                  ? 'border-2 border-gray-900 ring-2 ring-gray-900/20'
                                  : 'border border-gray-200'
                              }`}>
                                {/* Brand Name */}
                                <div className="flex items-center justify-center gap-2 mb-3">
                                  <span className="font-semibold text-gray-900 text-sm">{brandData.brand}</span>
                                  {brandData.isSearchedBrand && (
                                    <span className="text-[10px] bg-gray-100 text-gray-900 px-1.5 py-0.5 rounded-full">Your Brand</span>
                                  )}
                                </div>

                                {/* Large Visibility Score */}
                                <div className="text-center mb-0.5">
                                  <span
                                    className="text-4xl font-bold"
                                    style={{ color: getScoreColor(brandData.visibilityScore) }}
                                  >
                                    {Math.round(brandData.visibilityScore)}
                                  </span>
                                </div>
                                <p className="text-center text-xs text-gray-500 mb-3">Visibility Score</p>

                                {/* Provider Score Pills */}
                                {providers.length > 0 && (
                                  <div className="flex justify-center gap-1.5 mb-3">
                                    {providers.map((prov) => {
                                      const pillStyle = getProviderPillStyle(prov.score);
                                      return (
                                        <div key={prov.provider} className="flex flex-col items-center">
                                          <div className={`w-9 h-9 rounded-full ${pillStyle.bg} flex items-center justify-center`}>
                                            <span className={`text-xs font-semibold ${pillStyle.text}`}>{prov.score}</span>
                                          </div>
                                          <span className="text-[9px] text-gray-500 mt-0.5">{getCarouselProviderLabel(prov.provider)}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                {/* Comparison Text */}
                                {brandData.comparisonRatio !== null && brandData.comparisonRatio !== Infinity && (
                                  <p className="text-center text-xs text-gray-600 mb-2">
                                    Mentioned <span className="font-semibold">
                                      {brandData.comparisonRatio >= 1
                                        ? `${brandData.comparisonRatio.toFixed(1)}x more`
                                        : `${(1 / brandData.comparisonRatio).toFixed(1)}x less`
                                      }
                                    </span> than avg
                                  </p>
                                )}

                                {/* Score Definition */}
                                <div className="flex justify-center mt-auto">
                                  <p className="text-[10px] text-gray-400 text-center">
                                    Visibility Score = % of AI responses mentioning this brand
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Right Arrow */}
                    {canNavigate && (
                      <button
                        onClick={goToNext}
                        className="absolute right-0 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full border border-gray-200 bg-white shadow-sm hover:bg-gray-50 text-gray-400"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    )}
                  </div>

                  {/* Carousel Dots */}
                  {totalCards > 1 && (
                    <div className="flex justify-center gap-2 mt-6">
                      {allBrandsAnalysisData.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => setBrandCarouselIndex(idx)}
                          className={`w-2.5 h-2.5 rounded-full transition-colors ${idx === brandCarouselIndex ? 'bg-gray-800' : 'bg-gray-300'}`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Competitive Insights Summary */}
            {competitiveInsights.length > 0 && (
              <div className="bg-gradient-to-r from-gray-50 to-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Lightbulb className="w-5 h-5 text-blue-600" />
                  <h2 className="text-lg font-semibold text-gray-900">Key Competitive Insights</h2>
                </div>
                <ul className="space-y-3">
                  {competitiveInsights.map((insight, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-medium flex-shrink-0 mt-0.5">
                        {idx + 1}
                      </div>
                      <p className="text-sm text-gray-700 leading-relaxed">{insight}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Brand Breakdown Table */}
            {brandBreakdownStats.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Brand Breakdown</h2>
                    <p className="text-sm text-gray-500 mt-1">Performance comparison across all brands</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <select
                      value={brandBreakdownPromptFilter}
                      onChange={(e) => setBrandBreakdownPromptFilter(e.target.value)}
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
                      value={brandBreakdownLlmFilter}
                      onChange={(e) => setBrandBreakdownLlmFilter(e.target.value)}
                      className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    >
                      <option value="all">All Models</option>
                      {availableProviders.map((provider) => (
                        <option key={provider} value={provider}>{getProviderLabel(provider)}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-3 text-sm font-medium text-gray-600">Brand</th>
                        <th className="text-center py-3 px-3 text-sm font-medium text-gray-600">
                          <div className="whitespace-nowrap">AI Visibility</div>
                          <div className="text-xs text-gray-400 font-normal">How often brand appears</div>
                        </th>
                        <th className="text-center py-3 px-3 text-sm font-medium text-gray-600">
                          <div className="whitespace-nowrap">Share of Voice</div>
                          <div className="text-xs text-gray-400 font-normal">Brand's share of mentions</div>
                        </th>
                        <th className="text-center py-3 px-3 text-sm font-medium text-gray-600">
                          <div className="whitespace-nowrap">Top Result Rate</div>
                          <div className="text-xs text-gray-400 font-normal">How often brand is #1</div>
                        </th>
                        <th className="text-center py-3 px-3 text-sm font-medium text-gray-600">
                          <div className="whitespace-nowrap">Avg. Position</div>
                          <div className="text-xs text-gray-400 font-normal">Avg. ranking when mentioned</div>
                        </th>
                        <th className="text-center py-3 px-3 text-sm font-medium text-gray-600">
                          <div className="whitespace-nowrap">Avg. Sentiment</div>
                          <div className="text-xs text-gray-400 font-normal">How AI presents brand</div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {brandBreakdownStats.map((stat, index) => {
                        const getSentimentLabel = (score: number | null): string => {
                          if (score === null) return '-';
                          if (score >= 4.5) return 'Highly Recommended';
                          if (score >= 3.5) return 'Recommended';
                          if (score >= 2.5) return 'Neutral';
                          if (score >= 1.5) return 'With Caveats';
                          if (score >= 0.5) return 'Not Recommended';
                          return '-';
                        };

                        const getSentimentColor = (score: number | null): string => {
                          if (score === null) return 'text-gray-400';
                          if (score >= 4.5) return 'text-green-600';
                          if (score >= 3.5) return 'text-lime-600';
                          if (score >= 2.5) return 'text-gray-600';
                          if (score >= 1.5) return 'text-amber-500';
                          if (score >= 0.5) return 'text-red-500';
                          return 'text-gray-400';
                        };

                        const getPromptSentimentLabel = (sentiment: string | null): string => {
                          if (!sentiment) return '-';
                          const labels: Record<string, string> = {
                            'strong_endorsement': 'Strong',
                            'positive_endorsement': 'Positive',
                            'neutral_mention': 'Neutral',
                            'conditional': 'Conditional',
                            'negative_comparison': 'Negative',
                          };
                          return labels[sentiment] || sentiment;
                        };

                        const getPromptSentimentColor = (sentiment: string | null): string => {
                          if (!sentiment) return 'text-gray-400';
                          const colors: Record<string, string> = {
                            'strong_endorsement': 'text-green-600',
                            'positive_endorsement': 'text-lime-600',
                            'neutral_mention': 'text-gray-600',
                            'conditional': 'text-amber-500',
                            'negative_comparison': 'text-red-500',
                          };
                          return colors[sentiment] || 'text-gray-400';
                        };

                        const isExpanded = expandedBrandBreakdownRows.has(stat.brand);

                        // Get score text color matching the card color scheme
                        // Gradient: light green (75+) -> tan/brown (50) -> gray (0)
                        const getScoreTextColor = (score: number): string => {
                          if (score >= 75) return '#16a34a'; // Green
                          if (score >= 60) return '#65a30d'; // Lime-green
                          if (score >= 45) return '#a3a065'; // Tan/olive
                          if (score >= 30) return '#a39580'; // Brown/tan
                          return '#6b7280'; // Gray
                        };

                        return (
                          <React.Fragment key={stat.brand}>
                            <tr
                              className={`${index % 2 === 0 ? 'bg-gray-50' : ''} cursor-pointer hover:bg-gray-100 transition-colors`}
                              onClick={() => {
                                const newExpanded = new Set(expandedBrandBreakdownRows);
                                if (isExpanded) {
                                  newExpanded.delete(stat.brand);
                                } else {
                                  newExpanded.add(stat.brand);
                                }
                                setExpandedBrandBreakdownRows(newExpanded);
                              }}
                            >
                              <td className="py-3 px-3">
                                <div className="flex items-center gap-2">
                                  {isExpanded ? (
                                    <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                  ) : (
                                    <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                  )}
                                  <span className={`font-medium ${stat.isSearchedBrand ? 'text-gray-900' : 'text-gray-900'}`}>
                                    {stat.brand}
                                  </span>
                                  {stat.isSearchedBrand && (
                                    <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-900 rounded">searched</span>
                                  )}
                                </div>
                              </td>
                              <td className="text-center py-3 px-3">
                                <span className="font-medium" style={{ color: getScoreTextColor(stat.visibilityScore) }}>
                                  {stat.visibilityScore.toFixed(0)}%
                                </span>
                              </td>
                              <td className="text-center py-3 px-3">
                                <span className="font-medium" style={{ color: getScoreTextColor(stat.shareOfVoice) }}>
                                  {stat.shareOfVoice.toFixed(0)}%
                                </span>
                              </td>
                              <td className="text-center py-3 px-3">
                                <span className="font-medium" style={{ color: getScoreTextColor(stat.firstPositionRate) }}>
                                  {stat.firstPositionRate.toFixed(0)}%
                                </span>
                              </td>
                              <td className="text-center py-3 px-3">
                                {stat.avgRank !== null ? (
                                  <span className="font-medium" style={{ color: stat.avgRank <= 1.5 ? '#16a34a' : stat.avgRank <= 2.5 ? '#65a30d' : stat.avgRank <= 3.5 ? '#a3a065' : '#6b7280' }}>
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
                            {isExpanded && stat.promptsWithStats.length > 0 && (
                              <tr className={index % 2 === 0 ? 'bg-gray-50' : ''}>
                                <td colSpan={6} className="py-2 px-3 pl-10">
                                  <div className="bg-white border border-gray-200 rounded-lg p-3">
                                    <p className="text-xs font-medium text-gray-500 mb-2">
                                      Prompts mentioning {stat.brand} ({stat.promptsWithStats.length})
                                    </p>
                                    <div className="space-y-2 max-h-64 overflow-y-auto">
                                      {stat.promptsWithStats.map((promptStat, promptIdx) => (
                                        <div
                                          key={promptIdx}
                                          className="flex items-start justify-between gap-4 py-2 border-b border-gray-100 last:border-0"
                                        >
                                          <p className="text-sm text-gray-700 flex-1">
                                            {promptStat.prompt}
                                          </p>
                                          <div className="flex items-center gap-4 flex-shrink-0">
                                            <div className="text-center">
                                              <span className={`text-sm font-medium ${promptStat.rate >= 50 ? 'text-green-600' : promptStat.rate >= 25 ? 'text-yellow-600' : 'text-gray-600'}`}>
                                                {promptStat.rate.toFixed(0)}%
                                              </span>
                                              <p className="text-xs text-gray-400">visibility</p>
                                            </div>
                                            {promptStat.sentiment && (
                                              <div className="text-center min-w-[70px]">
                                                <span className={`text-sm font-medium ${getPromptSentimentColor(promptStat.sentiment)}`}>
                                                  {getPromptSentimentLabel(promptStat.sentiment)}
                                                </span>
                                                <p className="text-xs text-gray-400">sentiment</p>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      ))}
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
                </div>
              </div>
            )}

            {/* Brand Positioning Chart - Mentions vs Sentiment */}
            {brandPositioningStats.length > 0 && (() => {
              // Calculate dynamic x-axis range based on actual sentiment values
              const sentimentData = brandPositioningStats
                .filter(stat => stat.avgSentimentScore !== null && stat.mentioned > 0)
                .map(stat => stat.avgSentimentScore || 0);
              const minSentiment = sentimentData.length > 0 ? Math.min(...sentimentData) : 1;
              const maxSentiment = sentimentData.length > 0 ? Math.max(...sentimentData) : 5;
              // Floor min to nearest integer, add 0.5 padding
              const xMin = Math.max(0, Math.floor(minSentiment) - 0.5);
              const xMax = Math.min(5.5, Math.ceil(maxSentiment) + 0.5);
              // Generate ticks for values within range
              const xTicks = [1, 2, 3, 4, 5].filter(t => t >= xMin && t <= xMax);

              // Pre-process data to handle overlapping points
              const rawData = brandPositioningStats
                .filter(stat => stat.avgSentimentScore !== null && stat.mentioned > 0)
                .map(stat => ({
                  brand: stat.brand,
                  mentions: stat.mentioned,
                  sentiment: stat.avgSentimentScore || 0,
                  visibility: stat.visibilityScore,
                  isSearchedBrand: stat.isSearchedBrand,
                }));

              // Group points by proximity (within 1 mention and 0.5 sentiment)
              // This catches labels that would visually overlap even if not at exact same position
              const getClusterKey = (mentions: number, sentiment: number) => {
                // Round to nearest integer for mentions, round to 0.5 for sentiment
                const mentionBucket = Math.round(mentions);
                const sentimentBucket = Math.round(sentiment * 2) / 2;
                return `${mentionBucket}-${sentimentBucket}`;
              };

              const positionGroups: Record<string, typeof rawData> = {};
              rawData.forEach(point => {
                const key = getClusterKey(point.mentions, point.sentiment);
                if (!positionGroups[key]) {
                  positionGroups[key] = [];
                }
                positionGroups[key].push(point);
              });

              // Sort each group by sentiment for consistent ordering
              Object.values(positionGroups).forEach(group => {
                group.sort((a, b) => a.sentiment - b.sentiment);
              });

              // Add offset information to each point
              const processedData = rawData.map(point => {
                const key = getClusterKey(point.mentions, point.sentiment);
                const group = positionGroups[key];
                const indexInGroup = group.findIndex(p => p.brand === point.brand);
                const groupSize = group.length;
                return {
                  ...point,
                  groupSize,
                  indexInGroup,
                };
              });

              // Calculate Y-axis domain with padding for labels at top
              const maxMentions = rawData.length > 0 ? Math.max(...rawData.map(d => d.mentions)) : 10;
              const yMax = maxMentions + Math.max(1, Math.ceil(maxMentions * 0.15)); // Add ~15% padding at top

              return (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Brand Positioning</h2>
                    <p className="text-sm text-gray-500 mt-1">
                      How often AI mentions each brand vs. how favorably it describes them. Top-right = best position.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <select
                      value={brandPositioningPromptFilter}
                      onChange={(e) => setBrandPositioningPromptFilter(e.target.value)}
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
                      value={brandPositioningLlmFilter}
                      onChange={(e) => setBrandPositioningLlmFilter(e.target.value)}
                      className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    >
                      <option value="all">All Models</option>
                      {availableProviders.map((provider) => (
                        <option key={provider} value={provider}>{getProviderLabel(provider)}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {/* Sentiment Legend */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-4">
                  <span className="text-xs text-gray-600 font-medium">Sentiment:</span>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#15803d' }} />
                    <span className="text-xs text-gray-500">Strong</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#22c55e' }} />
                    <span className="text-xs text-gray-500">Positive</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#eab308' }} />
                    <span className="text-xs text-gray-500">Neutral</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#f97316' }} />
                    <span className="text-xs text-gray-500">Conditional</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#dc2626' }} />
                    <span className="text-xs text-gray-500">Negative</span>
                  </div>
                </div>
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 30, right: 40, bottom: 60, left: 60 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        type="number"
                        dataKey="sentiment"
                        name="Avg. Sentiment"
                        domain={[xMin, xMax]}
                        ticks={xTicks}
                        tickFormatter={(value) => ['', 'Negative', 'Conditional', 'Neutral', 'Positive', 'Strong'][value] || ''}
                        tick={{ fill: '#6b7280', fontSize: 12 }}
                        label={{ value: 'Average Sentiment', position: 'bottom', offset: 25, style: { fill: '#374151', fontSize: 14, fontWeight: 500 } }}
                      />
                      <YAxis
                        type="number"
                        dataKey="mentions"
                        name="Mentions"
                        domain={[0, yMax]}
                        tick={{ fill: '#6b7280', fontSize: 12 }}
                        label={{
                          content: (props: any) => {
                            const { viewBox } = props;
                            if (!viewBox) return null;
                            return (
                              <text x={viewBox.x + 5} y={viewBox.y - 8} fill="#374151" fontSize={11} fontWeight={500}>
                                <tspan x={viewBox.x + 5} dy="0">Mention</tspan>
                                <tspan x={viewBox.x + 5} dy="12">Count</tspan>
                              </text>
                            );
                          }
                        }}
                      />
                      <Tooltip
                        cursor={false}
                        isAnimationActive={false}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length > 0) {
                            const data = payload[0].payload;
                            const sentimentLabels = ['', 'Negative', 'Conditional', 'Neutral', 'Positive', 'Strong'];
                            return (
                              <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm max-w-[300px]">
                                <p className="font-medium text-gray-900 mb-2">{data.brand}{data.isSearchedBrand ? ' (searched)' : ''}</p>
                                <div className="space-y-1 text-gray-600">
                                  <p>Sentiment: <span className="font-medium">{sentimentLabels[Math.round(data.sentiment)] || 'N/A'}</span></p>
                                  <p>Mentions: <span className="font-medium">{data.mentions}</span></p>
                                  <p>Visibility: <span className="font-medium">{data.visibility.toFixed(0)}%</span></p>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Scatter
                        data={processedData}
                        shape={(props: any) => {
                          const { cx, cy, payload } = props;
                          const isSearched = payload.isSearchedBrand;
                          const groupSize = payload.groupSize || 1;
                          const indexInGroup = payload.indexInGroup || 0;

                          // Color based on sentiment (green = good, red = bad)
                          const sentiment = payload.sentiment || 3;
                          const getColor = () => {
                            if (sentiment >= 4.5) return '#15803d'; // Strong - dark green
                            if (sentiment >= 3.5) return '#22c55e'; // Positive - green
                            if (sentiment >= 2.5) return '#eab308'; // Neutral - yellow
                            if (sentiment >= 1.5) return '#f97316'; // Conditional - orange
                            return '#dc2626'; // Negative - red
                          };
                          const getStroke = () => {
                            if (sentiment >= 4.5) return '#166534';
                            if (sentiment >= 3.5) return '#166534';
                            if (sentiment >= 2.5) return '#a16207';
                            if (sentiment >= 1.5) return '#c2410c';
                            return '#991b1b';
                          };

                          // Calculate horizontal offset for overlapping points
                          const circleRadius = isSearched ? 10 : 8;
                          const spacing = 22; // Space between circles
                          const totalWidth = (groupSize - 1) * spacing;
                          const xOffset = groupSize > 1 ? (indexInGroup * spacing) - (totalWidth / 2) : 0;

                          // Truncate brand name for label
                          const shortBrand = payload.brand.length > 15
                            ? payload.brand.substring(0, 13) + '...'
                            : payload.brand;

                          // Calculate label offset - spread labels to avoid overlaps
                          let labelXOffset = 0;
                          let labelYOffset = -14; // Default: above
                          let textAnchor: 'start' | 'middle' | 'end' = 'middle';

                          if (groupSize === 2) {
                            labelYOffset = indexInGroup === 0 ? -14 : 22;
                          } else if (groupSize >= 3) {
                            const angles = [-90, 150, 30, -45, -135, 90];
                            const angle = angles[indexInGroup % angles.length];
                            const radians = (angle * Math.PI) / 180;
                            labelXOffset = Math.cos(radians) * 18;
                            labelYOffset = Math.sin(radians) * 18;
                            if (labelXOffset < -5) textAnchor = 'end';
                            else if (labelXOffset > 5) textAnchor = 'start';
                          }

                          return (
                            <g>
                              <circle
                                cx={cx + xOffset}
                                cy={cy}
                                r={circleRadius}
                                fill={getColor()}
                                stroke={isSearched ? '#1f2937' : getStroke()}
                                strokeWidth={isSearched ? 3 : 2}
                                opacity={0.85}
                                style={{ cursor: 'pointer' }}
                              />
                              <text
                                x={cx + xOffset + labelXOffset}
                                y={cy + labelYOffset}
                                textAnchor={textAnchor}
                                fill="#374151"
                                fontSize={isSearched ? 11 : 10}
                                fontWeight={isSearched ? 600 : 500}
                              >
                                {shortBrand}
                              </text>
                            </g>
                          );
                        }}
                      />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-gray-400 italic text-center mt-2">Hover over dots for details • Searched brand has thicker border</p>
              </div>
              );
            })()}

            {/* Prompt Performance Matrix (Heatmap) */}
            {promptPerformanceMatrix.brands.length > 0 && promptPerformanceMatrix.prompts.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Prompt Performance Matrix</h2>
                    <p className="text-sm text-gray-500 mt-1">
                      How often each brand appears in answers to each question
                    </p>
                  </div>
                  <select
                    value={promptMatrixLlmFilter}
                    onChange={(e) => setPromptMatrixLlmFilter(e.target.value)}
                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  >
                    <option value="all">All Models</option>
                    {availableProviders.map((provider) => (
                      <option key={provider} value={provider}>{getProviderLabel(provider)}</option>
                    ))}
                  </select>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-2 text-sm font-medium text-gray-600 sticky left-0 bg-white min-w-[120px]">Brand</th>
                        {promptPerformanceMatrix.prompts.map((prompt, idx) => (
                          <th
                            key={idx}
                            className="text-center py-3 px-2 font-medium text-gray-600 min-w-[160px] max-w-[200px] cursor-help"
                            title={prompt}
                          >
                            <span className="text-sm block truncate" title={prompt}>
                              {prompt.length > 40 ? prompt.substring(0, 38) + '...' : prompt}
                            </span>
                          </th>
                        ))}
                        <th className="text-center py-3 px-2 text-sm font-medium text-gray-600 min-w-[80px]">Avg</th>
                      </tr>
                    </thead>
                    <tbody>
                      {promptPerformanceMatrix.brands.map((brand, brandIdx) => {
                        const isSearchedBrand = brand === runStatus?.brand;
                        const rowAvg = promptPerformanceMatrix.matrix[brandIdx].reduce((a, b) => a + b, 0) / promptPerformanceMatrix.matrix[brandIdx].length;
                        return (
                          <tr key={brand} className={brandIdx % 2 === 0 ? 'bg-gray-50' : ''}>
                            <td className={`py-2 px-2 sticky left-0 ${brandIdx % 2 === 0 ? 'bg-gray-50' : 'bg-white'}`}>
                              <span className={`font-medium ${isSearchedBrand ? 'text-gray-900' : 'text-gray-900'}`}>
                                {brand.length > 15 ? brand.substring(0, 13) + '...' : brand}
                              </span>
                              {isSearchedBrand && (
                                <span className="text-xs px-1 ml-1 bg-gray-100 text-gray-900 rounded">you</span>
                              )}
                            </td>
                            {promptPerformanceMatrix.matrix[brandIdx].map((rate, promptIdx) => {
                              // Color intensity based on rate
                              const intensity = rate / 100;
                              const bgColor = rate === 0
                                ? 'bg-gray-100'
                                : intensity >= 0.7
                                  ? 'bg-green-500 text-white'
                                  : intensity >= 0.4
                                    ? 'bg-green-300'
                                    : intensity >= 0.1
                                      ? 'bg-green-100'
                                      : 'bg-gray-100';
                              return (
                                <td key={promptIdx} className="text-center py-2 px-2">
                                  <div
                                    className={`inline-flex items-center justify-center w-12 h-8 rounded text-xs font-medium ${bgColor}`}
                                    title={`${brand} - ${promptPerformanceMatrix.prompts[promptIdx]}: ${rate.toFixed(0)}%`}
                                  >
                                    {rate.toFixed(0)}%
                                  </div>
                                </td>
                              );
                            })}
                            <td className="text-center py-2 px-2">
                              <span className={`font-semibold ${rowAvg >= 50 ? 'text-green-600' : rowAvg >= 25 ? 'text-yellow-600' : 'text-gray-600'}`}>
                                {rowAvg.toFixed(0)}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Brand Co-occurrence Analysis */}
            {brandCooccurrence.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Brands Mentioned Together</h2>
                    <p className="text-sm text-gray-500 mt-1">
                      Which brands AI tends to recommend alongside each other
                    </p>
                  </div>
                  <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                    <button
                      onClick={() => setCooccurrenceView('pairs')}
                      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                        cooccurrenceView === 'pairs'
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Pairs
                    </button>
                    <button
                      onClick={() => setCooccurrenceView('venn')}
                      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                        cooccurrenceView === 'venn'
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Venn Diagram
                    </button>
                  </div>
                </div>

                {cooccurrenceView === 'pairs' && (() => {
                  const maxCount = brandCooccurrence[0]?.count || 1;
                  const minCount = brandCooccurrence[brandCooccurrence.length - 1]?.count || 1;

                  // Get bar color based on count - lighter for smaller, darker for larger
                  const getBarColor = (count: number) => {
                    const range = maxCount - minCount || 1;
                    const normalized = (count - minCount) / range;
                    if (normalized < 0.25) return '#bbf7d0'; // Very light green
                    if (normalized < 0.5) return '#86efac';  // Light green
                    if (normalized < 0.75) return '#4ade80'; // Medium green
                    return '#22c55e'; // Darker green
                  };

                  return (
                  <>
                  <div className="space-y-3">
                    {brandCooccurrence.map((pair, idx) => {
                      const widthPercent = (pair.count / maxCount) * 100;
                      const barColor = getBarColor(pair.count);
                      return (
                        <div key={idx} className="flex items-center gap-4">
                          <div className="w-48 flex-shrink-0">
                            <div className="flex items-center gap-1 text-sm">
                              <span className={pair.brand1 === runStatus?.brand ? 'font-semibold text-gray-900' : 'text-gray-700'}>
                                {pair.brand1.length > 12 ? pair.brand1.substring(0, 10) + '...' : pair.brand1}
                              </span>
                              <span className="text-gray-400">+</span>
                              <span className={pair.brand2 === runStatus?.brand ? 'font-semibold text-gray-900' : 'text-gray-700'}>
                                {pair.brand2.length > 12 ? pair.brand2.substring(0, 10) + '...' : pair.brand2}
                              </span>
                            </div>
                          </div>
                          <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${widthPercent}%`, backgroundColor: barColor }}
                            />
                          </div>
                          <div className="w-24 text-right">
                            <span className="text-sm font-medium text-gray-900">{pair.count}x</span>
                            <span className="text-xs text-gray-500 ml-1">({pair.percentage.toFixed(1)}%)</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
                    <span>Bar shade indicates co-occurrence frequency:</span>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#bbf7d0' }}></div>
                      <span>Lower</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#22c55e' }}></div>
                      <span>Higher</span>
                    </div>
                  </div>
                  </>
                  );
                })()}

                {/* Venn Diagram Visualization */}
                {cooccurrenceView === 'venn' && (() => {
                  // Get pairs involving the searched brand
                  const searchedBrand = runStatus?.brand || '';
                  const brandPairs = brandCooccurrence.filter(
                    pair => pair.brand1 === searchedBrand || pair.brand2 === searchedBrand
                  ).slice(0, 4); // Top 4 co-occurring brands

                  if (brandPairs.length === 0) return null;

                  // Extract the other brands and their co-occurrence counts
                  const cooccurringBrands = brandPairs.map(pair => ({
                    brand: pair.brand1 === searchedBrand ? pair.brand2 : pair.brand1,
                    count: pair.count,
                    percentage: pair.percentage,
                  }));

                  const maxCount = Math.max(...cooccurringBrands.map(b => b.count));
                  const minCount = Math.min(...cooccurringBrands.map(b => b.count));

                  // Function to get color based on count - lighter for smaller, darker for larger
                  const getColorForCount = (count: number) => {
                    const range = maxCount - minCount || 1;
                    const normalized = (count - minCount) / range; // 0 to 1
                    // Light green (#bbf7d0) to darker green (#22c55e)
                    // Interpolate between these colors
                    if (normalized < 0.25) return '#bbf7d0'; // Very light green
                    if (normalized < 0.5) return '#86efac';  // Light green
                    if (normalized < 0.75) return '#4ade80'; // Medium green
                    return '#22c55e'; // Darker green
                  };

                  // Function to get label color based on count
                  const getLabelColorForCount = (count: number) => {
                    const range = maxCount - minCount || 1;
                    const normalized = (count - minCount) / range;
                    if (normalized < 0.25) return '#166534'; // Dark green for light bg
                    if (normalized < 0.5) return '#15803d';
                    if (normalized < 0.75) return '#14532d';
                    return '#14532d'; // Darkest for contrast
                  };

                  return (
                    <div>
                      <div className="flex justify-center">
                        <svg width="600" height="480" viewBox="0 0 600 480">
                          {/* Central brand circle */}
                          <circle
                            cx="300"
                            cy="240"
                            r="70"
                            fill="#7C6992"
                            fillOpacity="0.25"
                            stroke="#7C6992"
                            strokeWidth="2"
                          />

                          {/* Overlapping competitor circles */}
                          {cooccurringBrands.map((item, idx) => {
                            // Position circles around the center - more spread out
                            const angle = (idx * (360 / cooccurringBrands.length) - 90) * (Math.PI / 180);
                            const distance = 110; // Increased distance from center
                            const cx = 300 + Math.cos(angle) * distance;
                            const cy = 240 + Math.sin(angle) * distance;
                            // Size based on co-occurrence count - more pronounced range
                            const minRadius = 35;
                            const maxRadius = 80;
                            const radius = minRadius + ((item.count / maxCount) * (maxRadius - minRadius));

                            const circleColor = getColorForCount(item.count);
                            const labelColor = getLabelColorForCount(item.count);

                            return (
                              <g key={idx}>
                                <circle
                                  cx={cx}
                                  cy={cy}
                                  r={radius}
                                  fill={circleColor}
                                  fillOpacity="0.25"
                                  stroke={circleColor}
                                  strokeWidth="2"
                                />
                                {/* Brand name - positioned outside the circle */}
                                <text
                                  x={cx + Math.cos(angle) * (radius + 18)}
                                  y={cy + Math.sin(angle) * (radius + 18)}
                                  textAnchor="middle"
                                  dominantBaseline="middle"
                                  fill={labelColor}
                                  fontSize="13"
                                  fontWeight="600"
                                >
                                  {item.brand.length > 14 ? item.brand.substring(0, 12) + '...' : item.brand}
                                </text>
                                {/* Count in overlap area */}
                                <text
                                  x={300 + Math.cos(angle) * 55}
                                  y={240 + Math.sin(angle) * 55}
                                  textAnchor="middle"
                                  dominantBaseline="middle"
                                  fill="#374151"
                                  fontSize="12"
                                  fontWeight="600"
                                >
                                  {item.count}x
                                </text>
                              </g>
                            );
                          })}
                          {/* Center brand name - rendered last to appear on top */}
                          <text
                            x="300"
                            y="240"
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fill="#1f2937"
                            fontSize="16"
                            fontWeight="700"
                            style={{ textShadow: '0 0 8px white, 0 0 8px white, 0 0 8px white' }}
                          >
                            {searchedBrand.length > 12 ? searchedBrand.substring(0, 10) + '...' : searchedBrand}
                          </text>
                        </svg>
                      </div>
                      <p className="text-sm text-gray-500 text-center mt-1">
                        Bubble size reflects how often brands appear together; values denote total mention volume.
                      </p>
                    </div>
                  );
                })()}
              </div>
            )}


            {/* Brand-Source Heatmap */}
            {brandSourceHeatmap.sources.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">Which Publishers Mention Which Brands</h3>
                    <p className="text-sm text-gray-500">
                      {heatmapShowSentiment ? 'How positively each publisher describes each brand' : 'See citation patterns across publishers and brands'}
                      <span className="ml-2 text-gray-400">Click any cell to view responses</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1 border-b border-gray-200">
                      <button
                        onClick={() => setHeatmapShowSentiment(false)}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                          !heatmapShowSentiment
                            ? 'border-gray-900 text-gray-900'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        Citations
                      </button>
                      <button
                        onClick={() => setHeatmapShowSentiment(true)}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                          heatmapShowSentiment
                            ? 'border-gray-900 text-gray-900'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        Sentiment
                      </button>
                    </div>
                    <select
                      value={heatmapProviderFilter}
                      onChange={(e) => setHeatmapProviderFilter(e.target.value)}
                      className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    >
                      <option value="all">All Models</option>
                      {availableProviders.map((provider) => (
                        <option key={provider} value={provider}>{getProviderLabel(provider)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Legend - moved to top */}
                <div className="mb-4 flex items-center gap-4 text-xs text-gray-500">
                  {heatmapShowSentiment ? (
                    <>
                      <span className="text-gray-600 font-medium">Sentiment:</span>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#16a34a' }} />
                        <span>Highly Recommended</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#4ade80' }} />
                        <span>Recommended</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#9ca3af' }} />
                        <span>Neutral</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#fbbf24' }} />
                        <span>With Caveats</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#ef4444' }} />
                        <span>Not Recommended</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(74, 124, 89, 0.5)' }} />
                        <span>{runStatus?.brand || 'Searched brand'}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(91, 163, 192, 0.5)' }} />
                        <span>Competitors</span>
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <span>More</span>
                        <div className="flex">
                          <div className="w-4 h-3 rounded-l" style={{ backgroundColor: 'rgba(91, 163, 192, 0.7)' }} />
                          <div className="w-4 h-3" style={{ backgroundColor: 'rgba(91, 163, 192, 0.4)' }} />
                          <div className="w-4 h-3 rounded-r" style={{ backgroundColor: 'rgba(91, 163, 192, 0.15)' }} />
                        </div>
                        <span>Fewer</span>
                      </div>
                    </>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className="text-left py-2 px-3 text-sm font-medium text-gray-600 border-b border-gray-200 sticky left-0 bg-white z-10">Source</th>
                        {brandSourceHeatmap.brands.map(brand => (
                          <th
                            key={brand}
                            className={`text-center py-2 px-3 font-medium border-b border-gray-200 min-w-[100px] ${
                              brand === brandSourceHeatmap.searchedBrand
                                ? 'text-gray-900 bg-green-50'
                                : 'text-gray-600'
                            }`}
                            title={`${brandSourceHeatmap.brandTotals[brand] || 0} total ${(brandSourceHeatmap.brandTotals[brand] || 0) === 1 ? 'mention' : 'mentions'}`}
                          >
                            <div className="truncate max-w-[100px]">{brand}</div>
                            <div className="text-[10px] font-normal text-gray-400">
                              {brandSourceHeatmap.brandTotals[brand] || 0} {(brandSourceHeatmap.brandTotals[brand] || 0) === 1 ? 'mention' : 'mentions'}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        // Calculate global max across all cells for consistent color intensity
                        const globalMax = Math.max(
                          ...brandSourceHeatmap.data.flatMap(row =>
                            brandSourceHeatmap.brands.map(b => row[b] as number || 0)
                          )
                        );
                        return brandSourceHeatmap.data.map((row, index) => (
                          <tr key={row.domain} className={index % 2 === 0 ? 'bg-gray-50' : ''}>
                            <td className="py-2 px-3 font-medium text-gray-900 sticky left-0 bg-inherit z-10" title={row.domain}>
                              <div className="flex items-center gap-2 max-w-[180px]">
                                <span className="flex-shrink-0 relative group/heatmapicon">
                                  {getCategoryIcon(categorizeDomain(row.domain), "w-3.5 h-3.5")}
                                  <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs text-gray-700 bg-white border border-gray-200 rounded shadow-sm whitespace-nowrap opacity-0 group-hover/heatmapicon:opacity-100 pointer-events-none transition-opacity z-50">
                                    {categorizeDomain(row.domain)}
                                  </span>
                                </span>
                                <span className="truncate">{row.domain}</span>
                              </div>
                            </td>
                            {brandSourceHeatmap.brands.map(brand => {
                              const count = row[brand] as number || 0;
                              const sentimentInfo = brandSourceHeatmap.sentimentData[row.domain as string]?.[brand];
                              const avgSentiment = sentimentInfo?.avg || 0;

                              // Calculate intensity based on mode
                              const intensity = heatmapShowSentiment
                                ? avgSentiment > 0 ? (avgSentiment - 1) / 4 : 0  // Scale 1-5 to 0-1
                                : globalMax > 0 ? count / globalMax : 0;

                              const isSearchedBrand = brand === brandSourceHeatmap.searchedBrand;

                              // Get bar color for sentiment mode
                              let barColor: string = '#9ca3af';
                              if (heatmapShowSentiment && count > 0) {
                                if (avgSentiment >= 4.5) {
                                  barColor = '#16a34a'; // Highly Recommended - dark green
                                } else if (avgSentiment >= 3.5) {
                                  barColor = '#4ade80'; // Recommended - light green
                                } else if (avgSentiment >= 2.5) {
                                  barColor = '#9ca3af'; // Neutral - gray
                                } else if (avgSentiment >= 1.5) {
                                  barColor = '#fbbf24'; // With Caveats - amber
                                } else {
                                  barColor = '#ef4444'; // Not Recommended - red
                                }
                              } else if (!heatmapShowSentiment && count > 0) {
                                barColor = isSearchedBrand ? '#111827' : '#5ba3c0';
                              }

                              return (
                                <td
                                  key={brand}
                                  className={`text-center py-2 px-2 ${count > 0 ? 'cursor-pointer hover:bg-gray-100' : ''}`}
                                  style={{ minWidth: '100px' }}
                                  onClick={() => count > 0 && handleHeatmapCellClick(row.domain as string, brand)}
                                  title={count > 0 ? (heatmapShowSentiment ? `${getSentimentLabelFromScore(avgSentiment)} - Click to view` : `${count} citations - Click to view`) : undefined}
                                >
                                  {count === 0 ? (
                                    <span className="text-gray-300">–</span>
                                  ) : heatmapShowSentiment ? (
                                    <div
                                      className="h-7 rounded-md mx-auto hover:opacity-80 transition-opacity"
                                      style={{
                                        backgroundColor: barColor,
                                        width: '80%',
                                        maxWidth: '80px',
                                      }}
                                    />
                                  ) : (
                                    <div
                                      className="h-7 rounded-md mx-auto flex items-center justify-center hover:opacity-80 transition-opacity"
                                      style={{
                                        backgroundColor: barColor,
                                        opacity: 0.3 + intensity * 0.7,
                                        width: '80%',
                                        maxWidth: '80px',
                                      }}
                                    >
                                      <span className="text-white text-xs font-medium">{count}</span>
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>

                {/* Export buttons - bottom right */}
                <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-gray-100">
                  <button
                    onClick={handleExportHeatmapCSV}
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
        )}
        {activeTab === 'sentiment' && <SentimentTab />}
        {activeTab === 'sources' && <SourcesTab />}
        {activeTab === 'recommendations' && <RecommendationsTab />}
        {activeTab === 'reports' && <ReportsTab runStatus={runStatus ?? null} />}
        {activeTab === 'site-audit' && <SiteAuditTab brand={runStatus?.brand || ''} />}
      </div>

      {/* Snippet Detail Modal */}
      {snippetDetailModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSnippetDetailModal(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{getProviderLabel(snippetDetailModal.provider)}</h2>
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
              <p className="text-xs text-gray-500 mb-1">Prompt</p>
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
                      // Check if this paragraph contains the brand name and highlight if so
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
                <h2 className="text-lg font-semibold text-gray-900">{getProviderLabel(selectedResult.provider)}</h2>
                <p className="text-sm text-gray-500">
                  Temperature: {selectedResult.temperature}
                  {selectedResultHighlight && (
                    <span className="ml-2 text-gray-900">
                      • Highlighting {selectedResultHighlight.domain
                        ? <>references to <span className="font-medium">{selectedResultHighlight.domain}</span></>
                        : <>mentions of <span className="font-medium">{selectedResultHighlight.brand}</span></>
                      }
                    </span>
                  )}
                </p>
              </div>
              <button
                onClick={() => { setSelectedResult(null); setSelectedResultHighlight(null); }}
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
                      <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg ${selectedResult.brand_mentioned ? 'bg-gray-100 text-gray-900' : 'bg-gray-100 text-gray-600'}`}>
                        {selectedResult.brand_mentioned ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                        {runStatus?.brand} {selectedResult.brand_mentioned ? 'Mentioned' : 'Not Mentioned'}
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
                        {selectedResult.brand_sentiment === 'strong_endorsement' ? 'Highly Recommended' :
                         selectedResult.brand_sentiment === 'positive_endorsement' ? 'Recommended' :
                         selectedResult.brand_sentiment === 'neutral_mention' ? 'Neutral' :
                         selectedResult.brand_sentiment === 'conditional' ? 'With Caveats' :
                         selectedResult.brand_sentiment === 'negative_comparison' ? 'Not Recommended' :
                         'Unknown'}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-700 [&_a]:text-gray-900 [&_a]:underline [&_a]:hover:text-gray-700 [&_p]:mb-3 [&_p]:leading-relaxed [&_ul]:mb-3 [&_ul]:pl-5 [&_ul]:list-disc [&_ol]:mb-3 [&_ol]:pl-5 [&_ol]:list-decimal [&_li]:mb-1 [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mb-2 [&_h3]:font-semibold [&_h3]:mb-2 [&_strong]:font-semibold [&_table]:w-full [&_table]:mb-3 [&_table]:border-collapse [&_table]:text-xs [&_th]:border [&_th]:border-gray-300 [&_th]:bg-gray-100 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold [&_td]:border [&_td]:border-gray-300 [&_td]:px-2 [&_td]:py-1">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        a: ({ href, children }) => {
                          // Highlight inline source links that match the highlighted domain
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
                          // Highlight paragraphs containing the highlighted domain (from heatmap) or brand
                          if (selectedResultHighlight) {
                            const domainBase = selectedResultHighlight.domain?.toLowerCase().replace('.com', '').replace('.org', '').replace('.net', '');

                            // Extract all text and hrefs from the node
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

                            // Also check if paragraph contains keywords from the source titles
                            let containsSourceKeywords = false;
                            if (selectedResultHighlight.domain && selectedResult?.sources) {
                              const matchingSources = selectedResult.sources.filter((s: { url: string; title?: string }) => {
                                const sourceDomain = getDomain(s.url).toLowerCase();
                                return sourceDomain.includes(domainBase || '') || (domainBase && domainBase.includes(sourceDomain.replace('.com', '').replace('.org', '').replace('.net', '')));
                              });
                              // Extract significant keywords from source titles (3+ chars, not common words)
                              const commonWords = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'has', 'her', 'was', 'one', 'our', 'out', 'with', 'from', 'this', 'that', 'what', 'how', 'why', 'best', 'top', 'new']);
                              const keywords: string[] = [];
                              matchingSources.forEach((s: { url: string; title?: string }) => {
                                if (s.title) {
                                  const words = s.title.toLowerCase().split(/[\s\-–—:,.|()[\]]+/).filter(w => w.length >= 4 && !commonWords.has(w));
                                  keywords.push(...words);
                                }
                              });
                              // Check if paragraph contains at least 2 significant keywords from source titles
                              if (keywords.length > 0) {
                                const matchCount = keywords.filter(kw => fullText.includes(kw)).length;
                                containsSourceKeywords = matchCount >= 2 || (keywords.length === 1 && matchCount === 1);
                              }
                            }

                            if (containsDomain || containsSourceKeywords) {
                              return <p className="bg-yellow-100 rounded px-2 py-1 -mx-2 border-l-4 border-yellow-400">{children}</p>;
                            } else if (containsBrand && !selectedResultHighlight.domain) {
                              return <p className="bg-yellow-100 rounded px-2 py-1 -mx-2 border-l-4 border-yellow-400">{children}</p>;
                            }
                          }
                          return <p>{children}</p>;
                        },
                        li: ({ children, node }) => {
                          // Highlight list items containing the highlighted domain (from heatmap) or brand
                          if (selectedResultHighlight) {
                            const domainBase = selectedResultHighlight.domain?.toLowerCase().replace('.com', '').replace('.org', '').replace('.net', '');

                            // Extract all text and hrefs from the node
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

                            // Also check if list item contains keywords from the source titles
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
                                  const words = s.title.toLowerCase().split(/[\s\-–—:,.|()[\]]+/).filter(w => w.length >= 4 && !commonWords.has(w));
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
                            } else if (containsBrand && !selectedResultHighlight.domain) {
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
                      <span className="text-sm font-medium text-gray-900">{getProviderLabel(result.provider)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {result.brand_sentiment && result.brand_sentiment !== 'not_mentioned' && (
                        <span className={`px-2 py-0.5 text-xs rounded ${
                          result.brand_sentiment === 'strong_endorsement' ? 'bg-green-100 text-green-700' :
                          result.brand_sentiment === 'positive_endorsement' ? 'bg-lime-100 text-lime-700' :
                          result.brand_sentiment === 'neutral_mention' ? 'bg-blue-100 text-blue-700' :
                          result.brand_sentiment === 'conditional' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {result.brand_sentiment === 'strong_endorsement' ? 'Highly Recommended' :
                           result.brand_sentiment === 'positive_endorsement' ? 'Recommended' :
                           result.brand_sentiment === 'neutral_mention' ? 'Neutral' :
                           result.brand_sentiment === 'conditional' ? 'With Caveats' : 'Not Recommended'}
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
