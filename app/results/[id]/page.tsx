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
  Users,
  Play,
  BookOpen,
  Newspaper,
  ShoppingBag,
  Star,
  HelpCircle,
  Landmark,
  PenLine,
  CircleDot,
  Plane,
  Wallet,
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
  ThumbsDown,
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
} from 'lucide-react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { useRunStatus, useAISummary } from '@/hooks/useApi';
import {
  formatCurrency,
  formatDate,
  formatPercent,
  getRateColor,
  truncate,
} from '@/lib/utils';
import { Result, Source, ScheduledReport, ScheduledReportCreate } from '@/lib/types';

type FilterType = 'all' | 'mentioned' | 'not_mentioned';
type TabType = 'overview' | 'reference' | 'competitive' | 'sentiment' | 'sources' | 'recommendations' | 'reports';

const TABS: { id: TabType; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Visibility', icon: <LayoutGrid className="w-4 h-4" /> },
  { id: 'competitive', label: 'Competitive Landscape', icon: <TrendingUp className="w-4 h-4" /> },
  { id: 'sentiment', label: 'Sentiment & Framing', icon: <MessageSquare className="w-4 h-4" /> },
  { id: 'sources', label: 'Sources', icon: <Globe className="w-4 h-4" /> },
  { id: 'recommendations', label: 'Recommendations', icon: <Lightbulb className="w-4 h-4" /> },
  { id: 'reports', label: 'Automated Reports', icon: <FileBarChart className="w-4 h-4" /> },
  { id: 'reference', label: 'Reference', icon: <FileText className="w-4 h-4" /> },
];

// Category colors for source types
const CATEGORY_COLORS: Record<string, string> = {
  'Social Media': '#4A7C59',      // Primary green
  'Video': '#6B9E7A',             // Medium green
  'Reference': '#3D6B4D',         // Dark green
  'News & Media': '#5BA3C0',      // Light blue
  'E-commerce': '#8BB5A2',        // Sage green
  'Reviews': '#7FBCD4',           // Sky blue
  'Forums & Q&A': '#2D5A3D',      // Deep green
  'Government': '#4A90A4',        // Teal blue
  'Blogs': '#A8C5B5',             // Pale green
  'Travel': '#6BA3A0',            // Teal green
  'Finance': '#5B8FA8',           // Steel blue
  'Other': '#B8C9BE'              // Light gray-green
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

// Get icon component for a category
const getCategoryIcon = (category: string, className: string = "w-3.5 h-3.5") => {
  const color = CATEGORY_COLORS[category] || CATEGORY_COLORS['Other'];
  const props = { className, style: { color } };
  switch (category) {
    case 'Social Media': return <Users {...props} />;
    case 'Video': return <Play {...props} />;
    case 'Reference': return <BookOpen {...props} />;
    case 'News & Media': return <Newspaper {...props} />;
    case 'E-commerce': return <ShoppingBag {...props} />;
    case 'Reviews': return <Star {...props} />;
    case 'Forums & Q&A': return <HelpCircle {...props} />;
    case 'Government': return <Landmark {...props} />;
    case 'Blogs': return <PenLine {...props} />;
    case 'Travel': return <Plane {...props} />;
    case 'Finance': return <Wallet {...props} />;
    default: return <CircleDot {...props} />;
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
  const [hoveredSentimentBadge, setHoveredSentimentBadge] = useState<{ provider: string; sentiment: string } | null>(null);
  const [brandCarouselIndex, setBrandCarouselIndex] = useState(0);

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
    const allBrands = result.all_brands_mentioned && result.all_brands_mentioned.length > 0
      ? result.all_brands_mentioned
      : [runStatus.brand, ...(result.competitors_mentioned || [])].filter(Boolean);

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

        const allBrands = r.all_brands_mentioned && r.all_brands_mentioned.length > 0
          ? r.all_brands_mentioned
          : [searchedBrand, ...(r.competitors_mentioned || [])].filter(Boolean);

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

        const allBrandsInResponse = r.all_brands_mentioned && r.all_brands_mentioned.length > 0
          ? r.all_brands_mentioned
          : [searchedBrand, ...(r.competitors_mentioned || [])].filter(Boolean);

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

  // Prompt Performance Matrix - brands vs prompts heatmap data
  const promptPerformanceMatrix = useMemo(() => {
    if (!runStatus) return { brands: [], prompts: [], matrix: [] };

    const results = globallyFilteredResults.filter((r: Result) => !r.error);
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
  }, [runStatus, globallyFilteredResults]);

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
  const [cooccurrenceView, setCooccurrenceView] = useState<'pairs' | 'venn'>('pairs');

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
      const allBrands = result.all_brands_mentioned && result.all_brands_mentioned.length > 0
        ? result.all_brands_mentioned
        : [runStatus.brand, ...(result.competitors_mentioned || [])].filter(Boolean);

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
          const allBrands = r.all_brands_mentioned && r.all_brands_mentioned.length > 0
            ? r.all_brands_mentioned
            : [runStatus.brand, ...(r.competitors_mentioned || [])].filter(Boolean);

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
          const allBrands = r.all_brands_mentioned && r.all_brands_mentioned.length > 0
            ? r.all_brands_mentioned
            : [runStatus.brand, ...(r.competitors_mentioned || [])].filter(Boolean);

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

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[#FAFAF8] flex items-center justify-center">
        <div className="flex flex-col items-center">
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
        return 'bg-green-50 text-green-700 border-green-200';
      case 'warn':
        return 'bg-orange-50 text-orange-700 border-orange-200';
      default:
        return 'bg-gray-50 text-gray-600 border-gray-200';
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

  const OverviewTab = () => {
    const totalCards = allBrandsAnalysisData.length;
    const canNavigate = totalCards > 1;

    const goToPrevious = () => {
      setBrandCarouselIndex(prev => prev === 0 ? totalCards - 1 : prev - 1);
    };

    const goToNext = () => {
      setBrandCarouselIndex(prev => prev === totalCards - 1 ? 0 : prev + 1);
    };

    const getProviderLabel = (provider: string) => {
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
    <div className="space-y-6">
      {/* Brand Analysis Carousel */}
      {allBrandsAnalysisData.length > 0 && (
        <div className="relative">
          {/* Carousel Header */}
          <div className="flex items-center justify-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Brand Analysis</h2>
            <span className="text-sm text-gray-500 ml-3">
              {brandCarouselIndex + 1} of {totalCards}
            </span>
          </div>

          {/* Carousel with Side Navigation */}
          <div className="relative flex items-center justify-center">
            {/* Left Arrow */}
            {canNavigate && (
              <button
                onClick={goToPrevious}
                className="absolute left-0 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full transition-colors hover:bg-gray-100 text-gray-600"
                style={{ left: 'calc(50% - 230px)' }}
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}

            {/* Carousel Cards */}
            <div className="overflow-hidden w-full max-w-md">
            <div
              className="flex transition-transform duration-300 ease-in-out"
              style={{ transform: `translateX(-${brandCarouselIndex * 100}%)` }}
            >
              {allBrandsAnalysisData.map((brandData, cardIndex) => {
                const bgColors = ['bg-[#5B7B5D]', 'bg-[#D9CBBA]', 'bg-[#C8C4A8]', 'bg-[#B8C4B8]', 'bg-[#A8B5C8]'];
                const textColors = ['text-white', 'text-gray-700', 'text-gray-700', 'text-gray-700', 'text-gray-700'];
                const labelColors = ['text-white/70', 'text-gray-500', 'text-gray-500', 'text-gray-500', 'text-gray-500'];
                const providers = brandData.providerScores.slice(0, 5);

                return (
                  <div key={brandData.brand} className="w-full flex-shrink-0">
                    <div className={`rounded-2xl shadow-lg px-6 py-8 ${brandData.isSearchedBrand ? 'bg-white' : 'bg-gray-50'}`}>
                      {/* Card Header */}
                      <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${brandData.isSearchedBrand ? 'bg-[#E8F0E8]' : 'bg-gray-200'}`}>
                            <BarChart3 className={`w-4 h-4 ${brandData.isSearchedBrand ? 'text-[#4A7C59]' : 'text-gray-500'}`} />
                          </div>
                          <div>
                            <span className={`font-semibold ${brandData.isSearchedBrand ? 'text-[#4A7C59]' : 'text-gray-700'}`}>
                              {brandData.brand}
                            </span>
                            {brandData.isSearchedBrand ? (
                              <span className="ml-2 text-xs bg-[#E8F0E8] text-[#4A7C59] px-2 py-0.5 rounded-full">Your Brand</span>
                            ) : (
                              <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Competitor</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Visibility Score Circle */}
                      <div className="flex justify-center mb-5">
                        <div className={`w-28 h-28 rounded-full flex items-center justify-center ${brandData.isSearchedBrand ? 'bg-[#E8F0E8]' : 'bg-gray-200'}`}>
                          <span className={`text-4xl font-bold ${brandData.isSearchedBrand ? 'text-[#4A7C59]' : 'text-gray-600'}`}>
                            {Math.round(brandData.visibilityScore)}
                          </span>
                        </div>
                      </div>
                      <p className="text-center text-gray-400 mb-6">Visibility Score</p>

                      {/* Provider Scores */}
                      {providers.length > 0 && (
                        <div className="mb-5">
                          <div className="flex justify-center gap-1.5">
                            {providers.map((prov, idx) => (
                              <div
                                key={prov.provider}
                                className={`${brandData.isSearchedBrand ? bgColors[idx % bgColors.length] : 'bg-gray-300'} rounded-xl px-2 py-2 text-center flex-1`}
                              >
                                <div className={`text-base font-bold ${brandData.isSearchedBrand ? textColors[idx % textColors.length] : 'text-gray-700'}`}>
                                  {prov.score}
                                </div>
                                <div className={`text-[10px] leading-tight ${brandData.isSearchedBrand ? labelColors[idx % labelColors.length] : 'text-gray-500'}`}>
                                  {getProviderLabel(prov.provider)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Insight */}
                      {brandData.comparisonRatio !== null && brandData.comparisonRatio !== Infinity && (
                        <div className="flex items-center gap-2 text-sm text-gray-500 bg-[#FAFAF8] rounded-lg p-2.5">
                          <Zap className={`w-4 h-4 flex-shrink-0 ${brandData.isSearchedBrand ? 'text-[#4A7C59]' : 'text-gray-400'}`} />
                          <span>
                            {brandData.comparisonRatio >= 1
                              ? `Mentioned ${brandData.comparisonRatio.toFixed(1)}x more than avg`
                              : `Mentioned ${(1 / brandData.comparisonRatio).toFixed(1)}x less than avg`
                            }
                          </span>
                        </div>
                      )}

                      {/* Score Definition */}
                      <p className="text-xs text-gray-400 mt-4 text-left">
                        Visibility Score = % of AI responses mentioning this brand
                      </p>
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
                className="absolute right-0 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full transition-colors hover:bg-gray-100 text-gray-600"
                style={{ right: 'calc(50% - 230px)' }}
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}
          </div>

          {/* Carousel Dots */}
          {totalCards > 1 && (
            <div className="flex justify-center gap-2 mt-4">
              {allBrandsAnalysisData.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setBrandCarouselIndex(idx)}
                  className={`w-2 h-2 rounded-full transition-colors ${idx === brandCarouselIndex ? 'bg-[#4A7C59]' : 'bg-gray-300'}`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* AI Summary */}
      <div className="bg-gradient-to-r from-blue-50 to-green-50 rounded-xl shadow-sm border border-blue-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-blue-600" />
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
              className="text-sm text-[#4A7C59] hover:text-[#3d6649] font-medium"
            >
              Read full analysis →
            </button>
          </div>
        )}
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* AI Visibility Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium text-gray-600">AI Visibility</p>
            <div className="relative group">
              <button
                className="p-1 rounded-full hover:bg-gray-100 transition-colors"
                aria-label="Learn more about AI Visibility"
                tabIndex={0}
              >
                <HelpCircle className="w-3.5 h-3.5 text-gray-400" />
              </button>
              <div className="absolute right-0 top-full mt-1 w-64 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all z-50 shadow-lg">
                Mentioned in {overviewMetrics?.mentionedCount || 0} of {overviewMetrics?.totalResponses || 0} AI answers (across selected models/prompts).
              </div>
            </div>
          </div>
          <p className={`text-2xl font-bold ${getMentionRateColor(overviewMetrics?.overallVisibility ? overviewMetrics.overallVisibility / 100 : 0)}`}>
            {overviewMetrics?.overallVisibility?.toFixed(1) || 0}%
          </p>
          {(() => {
            const interpretation = getKPIInterpretation('visibility', overviewMetrics?.overallVisibility ?? null);
            return (
              <span className={`inline-block mt-1.5 px-2 py-0.5 text-xs font-medium rounded-full border ${getToneStyles(interpretation.tone)}`}>
                {interpretation.label}
              </span>
            );
          })()}
          <p className="text-xs text-gray-400 mt-2">% of AI responses that mention your brand when asked relevant questions</p>
        </div>

        {/* Share of Voice Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium text-gray-600">Share of Voice</p>
            <div className="relative group">
              <button
                className="p-1 rounded-full hover:bg-gray-100 transition-colors"
                aria-label="Learn more about Share of Voice"
                tabIndex={0}
              >
                <HelpCircle className="w-3.5 h-3.5 text-gray-400" />
              </button>
              <div className="absolute right-0 top-full mt-1 w-64 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all z-50 shadow-lg">
                {overviewMetrics?.selectedBrand || 'Your brand'} accounts for {overviewMetrics?.shareOfVoice?.toFixed(1) || 0}% of all brand mentions ({overviewMetrics?.selectedBrandMentions || 0} of {overviewMetrics?.totalBrandMentions || 0} mentions).
              </div>
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {overviewMetrics?.shareOfVoice?.toFixed(1) || 0}%
          </p>
          {(() => {
            const interpretation = getKPIInterpretation('shareOfVoice', overviewMetrics?.shareOfVoice ?? null);
            return (
              <span className={`inline-block mt-1.5 px-2 py-0.5 text-xs font-medium rounded-full border ${getToneStyles(interpretation.tone)}`}>
                {interpretation.label}
              </span>
            );
          })()}
          <p className="text-xs text-gray-400 mt-2">Your brand's share of all brand mentions</p>
        </div>

        {/* Top Result Rate Card (formerly First Position) */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium text-gray-600">Top Result Rate</p>
            <div className="relative group">
              <button
                className="p-1 rounded-full hover:bg-gray-100 transition-colors"
                aria-label="Learn more about Top Result Rate"
                tabIndex={0}
              >
                <HelpCircle className="w-3.5 h-3.5 text-gray-400" />
              </button>
              <div className="absolute right-0 top-full mt-1 w-64 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all z-50 shadow-lg">
                Ranked #1 in {overviewMetrics?.topPositionCount || 0} of {overviewMetrics?.responsesWhereMentioned || 0} AI answers where {overviewMetrics?.selectedBrand || 'your brand'} appears.
              </div>
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {overviewMetrics?.top1Rate?.toFixed(0) || 0}%
          </p>
          {(() => {
            const interpretation = getKPIInterpretation('top1Rate', overviewMetrics?.top1Rate ?? null);
            return (
              <span className={`inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded-full border ${getToneStyles(interpretation.tone)}`}>
                {interpretation.label}
              </span>
            );
          })()}
          <p className="text-xs text-gray-400 mt-2">How often your brand is the #1 result</p>
        </div>

        {/* Avg. Position Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium text-gray-600">Avg. Position</p>
            <div className="relative group">
              <button
                className="p-1 rounded-full hover:bg-gray-100 transition-colors"
                aria-label="Learn more about Average Position"
                tabIndex={0}
              >
                <HelpCircle className="w-3.5 h-3.5 text-gray-400" />
              </button>
              <div className="absolute right-0 top-full mt-1 w-64 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all z-50 shadow-lg">
                Average rank when {overviewMetrics?.selectedBrand || 'your brand'} is shown: {overviewMetrics?.avgRank?.toFixed(1) || 'n/a'} (lower is better). Based on {overviewMetrics?.ranksCount || 0} responses.
              </div>
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {overviewMetrics?.avgRank?.toFixed(1) || 'n/a'}
          </p>
          {(() => {
            const interpretation = getKPIInterpretation('avgPosition', overviewMetrics?.avgRank ?? null);
            return (
              <span className={`inline-block mt-1.5 px-2 py-0.5 text-xs font-medium rounded-full border ${getToneStyles(interpretation.tone)}`}>
                {interpretation.label}
              </span>
            );
          })()}
          <p className="text-xs text-gray-400 mt-2">Your average ranking when mentioned</p>
        </div>
      </div>

      {/* Charts Section with Tabs */}
      {scatterPlotData.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          {/* Chart Title */}
          <h2 className="text-base font-semibold text-gray-900 mb-4">Where your brand appears in AI-generated answers</h2>

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
                  ? 'border-[#4A7C59] text-[#4A7C59]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {runStatus?.brand || 'Brand'}'s Ranking in AI Results
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

              {/* Legend for All Answers view - shows sentiment when toggle is on */}
              {showSentimentColors && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3">
                  <span className="text-xs text-gray-500 font-medium">How AI presents your brand:</span>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500 opacity-80" />
                    <span className="text-xs text-gray-500">Highly Recommended</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-lime-500 opacity-80" />
                    <span className="text-xs text-gray-500">Recommended</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-gray-500 opacity-60" />
                    <span className="text-xs text-gray-500">Neutral</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-orange-400 opacity-80" />
                    <span className="text-xs text-gray-500">With Caveats</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-400 opacity-80" />
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
                                    data.sentiment === 'conditional' ? 'text-orange-500' :
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
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-gray-500">Each row shows how an AI model typically positions your brand. The bar spans from best to worst placement.</p>
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

              {/* Legend for Performance Range view - shows sentiment when toggle is on */}
              {showSentimentColors && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3">
                  <span className="text-xs text-gray-500 font-medium">How AI presents your brand:</span>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500 opacity-80" />
                    <span className="text-xs text-gray-500">Highly Recommended</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-lime-500 opacity-80" />
                    <span className="text-xs text-gray-500">Recommended</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-gray-500 opacity-60" />
                    <span className="text-xs text-gray-500">Neutral</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-orange-400 opacity-80" />
                    <span className="text-xs text-gray-500">With Caveats</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-400 opacity-80" />
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
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} vertical={true} />
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
                                        dot.sentiment === 'conditional' ? 'text-orange-500' :
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

      {/* Prompt Breakdown Table */}
      {promptBreakdownStats.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Prompt Breakdown</h2>
              <p className="text-sm text-gray-500 mt-1">Performance metrics for {runStatus?.brand} across all prompts</p>
            </div>
            <select
              value={promptBreakdownLlmFilter}
              onChange={(e) => setPromptBreakdownLlmFilter(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59] focus:border-transparent"
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
                  <th className="text-left py-3 px-3 font-medium text-gray-600">Prompt</th>
                  <th className="text-center py-3 px-3 font-medium text-gray-600">
                    <div className="whitespace-nowrap">AI Visibility</div>
                    <div className="text-xs text-gray-400 font-normal">% mentioned</div>
                  </th>
                  <th className="text-center py-3 px-3 font-medium text-gray-600">
                    <div className="whitespace-nowrap">Share of Voice</div>
                    <div className="text-xs text-gray-400 font-normal">% of brand mentions</div>
                  </th>
                  <th className="text-center py-3 px-3 font-medium text-gray-600">
                    <div className="whitespace-nowrap">First Position</div>
                    <div className="text-xs text-gray-400 font-normal">% ranked #1</div>
                  </th>
                  <th className="text-center py-3 px-3 font-medium text-gray-600">
                    <div className="whitespace-nowrap">Avg. Position</div>
                    <div className="text-xs text-gray-400 font-normal">position when shown</div>
                  </th>
                  <th className="text-center py-3 px-3 font-medium text-gray-600">Avg. Sentiment</th>
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
                    if (score >= 1.5) return 'text-orange-500';
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

      {/* LLM Model Breakdown */}
      {Object.keys(llmBreakdownStats).length > 0 && llmBreakdownBrands.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">LLM Model Breakdown</h2>
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
                          const isMentioned = isCategory
                            ? result.competitors_mentioned?.includes(selectedBrand || '')
                            : result.brand_mentioned;

                          // Calculate position for this result
                          let position: number | null = null;
                          if (result.response_text && selectedBrand && isMentioned) {
                            const brandLower = selectedBrand.toLowerCase();
                            // Use all_brands_mentioned if available (includes all detected brands)
                            const allBrands = result.all_brands_mentioned && result.all_brands_mentioned.length > 0
                              ? result.all_brands_mentioned
                              : [runStatus?.brand, ...(result.competitors_mentioned || [])].filter(Boolean);

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
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <h2 className="text-base font-semibold text-gray-900">All Results</h2>
          <select
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59] focus:border-transparent"
          >
            <option value="all">All Models</option>
            {availableProviders.map((p) => (
              <option key={p} value={p}>{getProviderLabel(p)}</option>
            ))}
          </select>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Showing {filteredResults.length} of {globallyFilteredResults.filter((r: Result) => !r.error).length} results
        </p>
        <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-white z-10">
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
                  const brandLower = (selectedBrand || '').toLowerCase();

                  // Check if brand is mentioned
                  const isMentioned = isCategory
                    ? result.competitors_mentioned?.includes(selectedBrand || '')
                    : result.brand_mentioned;

                  if (isMentioned && brandLower) {
                    // Use all_brands_mentioned if available (includes all detected brands)
                    const allBrands = result.all_brands_mentioned && result.all_brands_mentioned.length > 0
                      ? result.all_brands_mentioned
                      : [runStatus?.brand, ...(result.competitors_mentioned || [])].filter(Boolean);

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
                            {result.brand_sentiment === 'strong_endorsement' ? 'Highly Recommended' :
                             result.brand_sentiment === 'positive_endorsement' ? 'Recommended' :
                             result.brand_sentiment === 'conditional' ? 'With Caveats' :
                             result.brand_sentiment === 'negative_comparison' ? 'Not Recommended' :
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
                                <span className="absolute right-0 top-full mt-1 hidden group-hover:block bg-gray-900 text-white text-xs rounded-lg py-2 px-3 whitespace-nowrap z-50 shadow-lg">
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

        {/* Export and Share Options */}
        <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-gray-100">
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
                    const allBrands = result.all_brands_mentioned && result.all_brands_mentioned.length > 0
                      ? result.all_brands_mentioned
                      : [runStatus?.brand, ...(result.competitors_mentioned || [])].filter(Boolean);
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
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
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
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
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
      <div className="bg-gradient-to-r from-blue-50 to-green-50 rounded-xl shadow-sm border border-blue-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-blue-600" />
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
              className="text-sm text-[#4A7C59] hover:text-[#3d6649] font-medium"
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

      {/* Source Gap Analysis Chart & Table */}
      {sourceGapAnalysis.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Source Gap Analysis</h2>
              <p className="text-sm text-gray-500 mt-1">
                Sources where competitors are cited more often than {runStatus?.brand || 'your brand'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={sourceGapPromptFilter}
                onChange={(e) => setSourceGapPromptFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59] focus:border-transparent max-w-[200px]"
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
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59] focus:border-transparent"
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
                <div className="w-3 h-3 rounded-full bg-[#4A7C59]"></div>
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
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} stroke="#e5e7eb" />
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
                    content={({ active, payload }) => {
                      if (active && payload && payload.length > 0) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
                            <p className="font-medium text-gray-900 mb-2">{data.fullDomain}</p>
                            <p className="text-[#4A7C59]">
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
                                {/* Brand dot (green) */}
                                <circle
                                  cx={brandX}
                                  cy={yPos}
                                  r={6}
                                  fill="#4A7C59"
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
                  <th className="text-left py-3 px-3 font-medium text-gray-600">Source</th>
                  <th className="text-center py-3 px-3 font-medium text-gray-600">
                    <div>{runStatus?.brand || 'Brand'} Rate</div>
                    <div className="text-xs text-gray-400 font-normal">% when source cited</div>
                  </th>
                  <th className="text-center py-3 px-3 font-medium text-gray-600">
                    <div>Top Competitor</div>
                  </th>
                  <th className="text-center py-3 px-3 font-medium text-gray-600">
                    <div>Competitor Rate</div>
                    <div className="text-xs text-gray-400 font-normal">% when source cited</div>
                  </th>
                  <th className="text-center py-3 px-3 font-medium text-gray-600">
                    <div>Gap</div>
                    <div className="text-xs text-gray-400 font-normal">competitor advantage</div>
                  </th>
                  <th className="text-center py-3 px-3 font-medium text-gray-600">
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
                            <span className="text-[#4A7C59] font-medium">{row.domain}</span>
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
                                          style={{ borderColor: snippetInfo.isBrand ? '#4A7C59' : '#3b82f6' }}
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
                                                <span key={i} className={`font-semibold ${snippetInfo.isBrand ? 'text-[#4A7C59]' : 'text-blue-600'}`}>
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
                                        className="flex items-start gap-2 text-sm text-[#4A7C59] hover:text-[#3d6649] hover:underline group"
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
              <h2 className="text-base font-semibold text-gray-900">Relative Sentiment Advantage</h2>
              <p className="text-sm text-gray-500 mt-1">
                Comparing how sources portray {sentimentComparisonBrand || runStatus?.brand || 'your brand'} vs. other brands
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={sentimentComparisonBrand}
                onChange={(e) => setSentimentComparisonBrand(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59] focus:border-transparent"
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
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59] focus:border-transparent max-w-[200px]"
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
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59] focus:border-transparent"
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
                <div className="w-3 h-3 rounded-full bg-[#4A7C59]"></div>
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
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} stroke="#e5e7eb" />
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
                    content={({ active, payload }) => {
                      if (active && payload && payload.length > 0) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
                            <p className="font-medium text-gray-900 mb-2">{data.fullDomain}</p>
                            <p className="text-gray-600 mb-1">
                              {data.comparisonBrand || 'Brand'}: <span className="font-medium text-[#4A7C59]">{data.brandLabel}</span>
                            </p>
                            <p className="text-gray-600 mb-2">
                              {data.competitor || 'Other'}: <span className="font-medium text-blue-600">{data.competitorLabel}</span>
                            </p>
                            <p className={`font-medium ${data.direction === 'brand' ? 'text-[#4A7C59]' : data.direction === 'competitor' ? 'text-blue-600' : 'text-gray-500'}`}>
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
                    fill="#4A7C59"
                  >
                    {sourceSentimentGapAnalysis.slice(0, 10).map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.direction === 'brand' ? '#4A7C59' : entry.direction === 'competitor' ? '#3b82f6' : '#d1d5db'}
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
                  <th className="text-left py-3 px-3 font-medium text-gray-600">Source</th>
                  <th className="text-center py-3 px-3 font-medium text-gray-600">Models</th>
                  <th className="text-center py-3 px-3 font-medium text-gray-600">{runStatus?.brand || 'Brand'}</th>
                  <th className="text-center py-3 px-3 font-medium text-gray-600">Top Competitor</th>
                  <th className="text-center py-3 px-3 font-medium text-gray-600">Advantage</th>
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
                            <span className="text-[#4A7C59] font-medium">{row.domain}</span>
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
                                    'neutral_mention': 'bg-gray-100 text-gray-600',
                                    'conditional': 'bg-yellow-100 text-yellow-700',
                                    'negative_comparison': 'bg-red-100 text-red-700',
                                  };
                                  return (
                                    <div
                                      key={snippetIdx}
                                      className="text-sm border-l-2 pl-3 py-2 cursor-pointer hover:bg-gray-50 rounded-r transition-colors"
                                      style={{ borderColor: snippetInfo.isBrand ? '#4A7C59' : '#3b82f6' }}
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
                                        <span className="text-xs text-[#4A7C59] ml-auto">Click to view full response →</span>
                                      </div>
                                      <div className="bg-gray-50 rounded px-2 py-1.5 mb-1.5">
                                        <p className="text-xs text-gray-500 mb-0.5">Prompt</p>
                                        <p className="text-sm text-gray-900">{snippetInfo.prompt}</p>
                                      </div>
                                      <p className="text-gray-600 text-sm leading-relaxed">
                                        {parts.map((part, i) =>
                                          part.toLowerCase() === snippetInfo.brand.toLowerCase() ? (
                                            <span key={i} className={`font-semibold ${snippetInfo.isBrand ? 'text-[#4A7C59]' : 'text-blue-600'}`}>
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
              <span className="font-medium text-gray-900">{formatCurrency(runStatus.actual_cost)}</span>
            </div>
          </div>
          <div className="text-gray-400 text-xs">{runStatus.completed_calls} successful calls · {runStatus.failed_calls} failed</div>
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

      const seenDomains = new Set<string>();
      for (const source of result.sources) {
        if (!source.url) continue;
        const domain = getDomain(source.url);

        // Count each domain only once per response
        if (seenDomains.has(domain)) continue;
        seenDomains.add(domain);

        if (!sourceBrandCounts[domain]) {
          sourceBrandCounts[domain] = {};
          sourceBrandSentiments[domain] = {};
        }

        // Associate this source with all brands mentioned in the response
        brandsInResult.forEach(({ brand, sentiment }) => {
          sourceBrandCounts[domain][brand] = (sourceBrandCounts[domain][brand] || 0) + 1;

          // Track sentiment
          if (!sourceBrandSentiments[domain][brand]) {
            sourceBrandSentiments[domain][brand] = { total: 0, sum: 0 };
          }
          if (sentiment && sentimentScores[sentiment] !== undefined) {
            sourceBrandSentiments[domain][brand].total += 1;
            sourceBrandSentiments[domain][brand].sum += sentimentScores[sentiment];
          }
        });
      }
    }

    // Get top 10 sources by total citations
    const topSources = Object.entries(sourceBrandCounts)
      .map(([domain, brands]) => ({
        domain,
        total: Object.values(brands).reduce((sum, count) => sum + count, 0),
        brands,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

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

  // Handler for heatmap cell double-click - find matching results
  const handleHeatmapCellClick = useCallback((domain: string, brand: string) => {
    if (!runStatus) return;

    // Find results that:
    // 1. Have the specified domain in their sources
    // 2. Mention the specified brand
    const matchingResults = globallyFilteredResults.filter((result: Result) => {
      if (result.error || !result.sources || result.sources.length === 0) return false;
      if (heatmapProviderFilter !== 'all' && result.provider !== heatmapProviderFilter) return false;

      // Check if source domain is cited
      const hasDomain = result.sources.some((source: Source) => {
        if (!source.url) return false;
        return getDomain(source.url) === domain;
      });
      if (!hasDomain) return false;

      // Check if brand is mentioned
      if (brand === runStatus.brand) {
        return result.brand_mentioned;
      } else {
        return result.competitors_mentioned?.includes(brand);
      }
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

      // Filter by brand filter
      const filteredCitations = brandCitationsBrandFilter === 'all'
        ? citationsArray
        : citationsArray.filter(c => c.brand === brandCitationsBrandFilter);

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
      'Social Media': '#4A7C59',      // Primary green
      'Video': '#6B9E7A',             // Medium green
      'Reference': '#3D6B4D',         // Dark green
      'News & Media': '#5BA3C0',      // Light blue
      'E-commerce': '#8BB5A2',        // Sage green
      'Reviews': '#7FBCD4',           // Sky blue
      'Forums & Q&A': '#2D5A3D',      // Deep green
      'Government': '#4A90A4',        // Teal blue
      'Blogs': '#A8C5B5',             // Pale green
      'Travel': '#6BA3A0',            // Teal green
      'Finance': '#5B8FA8',           // Steel blue
      'Other': '#B8C9BE'              // Light gray-green
    };

    // Get icon component for a category
    const getCategoryIcon = (category: string, className: string = "w-3.5 h-3.5") => {
      const color = CATEGORY_COLORS[category] || CATEGORY_COLORS['Other'];
      const props = { className, style: { color } };
      switch (category) {
        case 'Social Media': return <Users {...props} />;
        case 'Video': return <Play {...props} />;
        case 'Reference': return <BookOpen {...props} />;
        case 'News & Media': return <Newspaper {...props} />;
        case 'E-commerce': return <ShoppingBag {...props} />;
        case 'Reviews': return <Star {...props} />;
        case 'Forums & Q&A': return <HelpCircle {...props} />;
        case 'Government': return <Landmark {...props} />;
        case 'Blogs': return <PenLine {...props} />;
        case 'Travel': return <Plane {...props} />;
        case 'Finance': return <Wallet {...props} />;
        default: return <CircleDot {...props} />;
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
          <div className="bg-gradient-to-r from-[#E8F0E8] to-[#F0F4F0] rounded-xl border border-[#4A7C59]/20 p-6">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-5 h-5 text-[#4A7C59]" />
              <h2 className="text-base font-semibold text-gray-900">Key Influencers</h2>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Sources cited by multiple Models — these likely have outsized influence on AI recommendations.
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
                    className={`inline-flex items-center gap-2 px-3 py-2 bg-white rounded-lg border hover:border-[#4A7C59] hover:shadow-sm transition-all cursor-pointer group ${isExpanded ? 'border-[#4A7C59] shadow-sm' : 'border-gray-200'}`}
                  >
                    {isExpanded ? (
                      <ChevronUp className="w-3.5 h-3.5 text-[#4A7C59]" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-gray-400 group-hover:text-[#4A7C59]" />
                    )}
                    <span className={`text-sm font-medium ${isExpanded ? 'text-[#4A7C59]' : 'text-gray-700 group-hover:text-[#4A7C59]'}`}>{source.domain}</span>
                    <span className="text-xs text-gray-400">{source.providers.length} Models · {source.count} {source.count === 1 ? 'citation' : 'citations'}</span>
                  </div>
                );
              })}
            </div>
            {/* Expanded content rendered separately below all items */}
            {keyInfluencers.filter(source => expandedInfluencers.has(source.domain)).map((source) => (
              <div key={`expanded-${source.domain}`} className="mt-3 p-3 bg-white rounded-lg border border-[#4A7C59]/30 space-y-1.5">
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
                      className="flex items-center gap-2 text-sm text-[#4A7C59] hover:text-[#3d6649] hover:underline"
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

        {/* Top Cited Sources with Pie Chart */}
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
                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59] focus:border-transparent"
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
                          className="flex items-center gap-2 p-2.5 cursor-pointer hover:bg-gray-100 transition-colors duration-100 rounded-t-lg"
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
                          <div className="flex-1 flex items-center gap-1.5 text-sm font-medium text-[#4A7C59] min-w-0">
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
                                <span className="text-[10px] px-1 py-0.5 bg-gray-200 text-gray-600 rounded">+{source.providers.length - 3}</span>
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
                            <div className="space-y-1">
                              {source.urlDetails.map((urlDetail, idx) => {
                                const { subtitle } = formatSourceDisplay(urlDetail.url, urlDetail.title);
                                const displayTitle = subtitle || getReadableTitleFromUrl(urlDetail.url);
                                return (
                                  <a
                                    key={idx}
                                    href={urlDetail.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1.5 text-xs text-[#4A7C59] hover:text-[#3d6649] hover:underline"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                                    <span className="truncate">
                                      {displayTitle && displayTitle !== source.domain ? displayTitle : source.domain}
                                    </span>
                                    <span className="text-gray-400 flex-shrink-0">({urlDetail.count})</span>
                                  </a>
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
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59] focus:border-transparent"
              >
                <option value="all">All Brands</option>
                {runStatus?.brand && (
                  <option value={runStatus.brand}>{runStatus.brand} (searched)</option>
                )}
                {Array.from(trackedBrands).filter(b => b !== runStatus?.brand).map((brand) => (
                  <option key={brand} value={brand}>{brand}</option>
                ))}
              </select>
              <select
                value={brandCitationsProviderFilter}
                onChange={(e) => setBrandCitationsProviderFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59] focus:border-transparent"
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
                    <div
                      className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={(e) => {
                        e.preventDefault();
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
                      <div className="flex-1 flex items-center gap-2 text-sm font-medium text-[#4A7C59]">
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5 flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />}
                        {citation.brand}'s website
                        {citation.isSearchedBrand && (
                          <span className="text-xs px-1.5 py-0.5 bg-[#4A7C59] text-white rounded">searched</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex gap-1">
                          {citation.providers.map((provider) => (
                            <span key={provider} className="text-xs px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded" title={getProviderLabel(provider)}>
                              {getProviderShortLabel(provider)}
                            </span>
                          ))}
                        </div>
                        <span className="text-sm text-gray-500 w-24 text-right">
                          {citation.count} {citation.count === 1 ? 'citation' : 'citations'}
                          <span className="text-xs text-gray-400 ml-1">({citation.rate.toFixed(0)}%)</span>
                        </span>
                      </div>
                    </div>
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
                                className="flex items-center gap-2 text-sm text-[#4A7C59] hover:text-[#3d6649] hover:underline"
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
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Globe className="w-5 h-5 text-[#4A7C59]" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Domain Breakdown</h3>
                <p className="text-sm text-gray-500">Detailed view of how often each domain is cited across LLM responses</p>
              </div>
            </div>
            <div className="max-h-[500px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white z-10">
                  <tr className="border-b border-gray-200">
                    <th
                      className="text-left py-3 px-3 font-medium text-gray-600 cursor-pointer hover:bg-gray-50 select-none bg-white"
                      onClick={() => handleDomainSort('domain')}
                    >
                      <div className="flex items-center gap-1">
                        Domain
                        {domainSortColumn === 'domain' && (
                          <span className="text-[#4A7C59]">{domainSortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </div>
                    </th>
                    <th
                      className="text-center py-3 px-3 font-medium text-gray-600 cursor-pointer hover:bg-gray-50 select-none bg-white"
                      onClick={() => handleDomainSort('usedPercent')}
                    >
                      <div className="flex items-center justify-center gap-1">
                        <div>
                          <div>Used</div>
                          <div className="text-xs font-normal text-gray-400">% of responses</div>
                        </div>
                        {domainSortColumn === 'usedPercent' && (
                          <span className="text-[#4A7C59]">{domainSortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </div>
                    </th>
                    <th
                      className="text-center py-3 px-3 font-medium text-gray-600 cursor-pointer hover:bg-gray-50 select-none bg-white"
                      onClick={() => handleDomainSort('avgCitation')}
                    >
                      <div className="flex items-center justify-center gap-1">
                        <div>
                          <div>Avg. Citation</div>
                          <div className="text-xs font-normal text-gray-400">per response</div>
                        </div>
                        {domainSortColumn === 'avgCitation' && (
                          <span className="text-[#4A7C59]">{domainSortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </div>
                    </th>
                    <th
                      className="text-center py-3 px-3 font-medium text-gray-600 cursor-pointer hover:bg-gray-50 select-none bg-white"
                      onClick={() => handleDomainSort('category')}
                    >
                      <div className="flex items-center justify-center gap-1">
                        Type
                        {domainSortColumn === 'category' && (
                          <span className="text-[#4A7C59]">{domainSortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </div>
                    </th>
                    <th
                      className="text-center py-3 px-3 font-medium text-gray-600 cursor-pointer hover:bg-gray-50 select-none bg-white"
                      onClick={() => handleDomainSort('avgSentiment')}
                    >
                      <div className="flex items-center justify-center gap-1">
                        Sentiment for {runStatus?.brand || 'Brand'}
                        {domainSortColumn === 'avgSentiment' && (
                          <span className="text-[#4A7C59]">{domainSortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </div>
                    </th>
                    <th className="text-left py-3 px-3 font-medium text-gray-600 bg-white">Models</th>
                    <th className="text-left py-3 px-3 font-medium text-gray-600 bg-white">Brands</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedDomainTableData.map((row, index) => (
                    <tr key={row.domain} className={index % 2 === 0 ? 'bg-gray-50' : ''}>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[#4A7C59] font-medium">{row.domain}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#4A7C59] rounded-full"
                              style={{ width: `${Math.min(row.usedPercent, 100)}%` }}
                            />
                          </div>
                          <span className="text-gray-700 min-w-[40px]">{row.usedPercent.toFixed(1)}%</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center text-gray-700">
                        {row.avgCitation.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {getCategoryIcon(row.category, "w-3.5 h-3.5")}
                          <span className="text-gray-600 text-xs">{row.category}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {row.avgSentiment !== null ? (
                          <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                            row.avgSentiment >= 4.5 ? 'bg-green-100 text-green-700' :
                            row.avgSentiment >= 3.5 ? 'bg-lime-100 text-lime-700' :
                            row.avgSentiment >= 2.5 ? 'bg-gray-100 text-gray-600' :
                            row.avgSentiment >= 1.5 ? 'bg-orange-100 text-orange-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {getSentimentLabel(row.avgSentiment)}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">-</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        {row.providers.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {row.providers.map((provider) => (
                              <span
                                key={provider}
                                className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700"
                              >
                                {getProviderLabel(provider)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs">-</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        {row.brands.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {row.brands.map((brand) => (
                              <span
                                key={brand}
                                className={`text-xs px-2 py-0.5 rounded-full ${
                                  brand === runStatus?.brand
                                    ? 'bg-[#4A7C59] text-white font-medium'
                                    : 'bg-gray-100 text-gray-600'
                                }`}
                              >
                                {brand}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {sortedDomainTableData.length > 10 && (
              <p className="text-sm text-gray-500 text-center mt-3">
                Scroll to see all {sortedDomainTableData.length} domains
              </p>
            )}
            <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-gray-100">
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
      bgColor,
      textColor,
      popupPosition = 'bottom'
    }: {
      provider: string;
      sentiment: string;
      count: number;
      bgColor: string;
      textColor: string;
      popupPosition?: 'top' | 'bottom';
    }) => {
      if (count === 0) return null;

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

      return (
        <div
          className="relative inline-block"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div
            className={`inline-flex items-center justify-center w-8 h-8 ${bgColor} ${textColor} text-sm font-medium rounded-lg cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-gray-300 transition-all`}
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
              className={`absolute z-50 bg-white border border-gray-200 rounded-lg p-3 shadow-lg min-w-[280px] max-w-[350px] text-left ${
                popupPosition === 'top'
                  ? 'bottom-full mb-2 left-0'
                  : 'top-full mt-2 left-0'
              }`}
              onWheel={(e) => e.stopPropagation()}
            >
              <div>
                {matchingResults.map((result, idx) => {
                  const truncatedPrompt = result.prompt.length > 70
                    ? result.prompt.substring(0, 70) + '...'
                    : result.prompt;

                  // Calculate rank using same logic as All Answers chart
                  let rank = 0;
                  const brandLower = (runStatus?.brand || '').toLowerCase();
                  const isMentioned = result.brand_mentioned;

                  if (isMentioned && result.response_text) {
                    const allBrands = result.all_brands_mentioned && result.all_brands_mentioned.length > 0
                      ? result.all_brands_mentioned
                      : [runStatus?.brand, ...(result.competitors_mentioned || [])].filter(Boolean);

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
                      className={`hover:bg-gray-50 transition-colors cursor-pointer ${idx > 0 ? 'pt-3 mt-3 border-t border-gray-100' : ''}`}
                      onClick={() => {
                        setSelectedResult(result);
                        setHoveredSentimentBadge(null);
                      }}
                    >
                      <p className="text-sm font-semibold text-gray-900 mb-1" title={result.prompt}>
                        {truncatedPrompt}
                      </p>
                      <p className="text-sm text-gray-700">
                        {rank === 0
                          ? 'Not shown'
                          : rank === 1
                            ? 'Shown as: #1 (Top result)'
                            : `Shown as: #${rank}`}
                      </p>
                      <p className="text-xs text-gray-400 mt-2">
                        {getProviderLabel(result.provider)}
                      </p>
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
                    <div className="w-44 text-sm text-gray-600 shrink-0">{d.label}</div>
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

        {/* Sentiment by Provider */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-lg font-semibold text-gray-900">Sentiment by AI Provider</h3>
            <div className="flex items-center gap-2">
              <select
                value={sentimentProviderCitationFilter}
                onChange={(e) => setSentimentProviderCitationFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59] focus:border-transparent"
              >
                <option value="all">All Sources</option>
                {citationSourceOptions.map((domain) => (
                  <option key={domain} value={domain}>{domain}</option>
                ))}
              </select>
              <select
                value={sentimentProviderBrandFilter || runStatus?.brand || ''}
                onChange={(e) => setSentimentProviderBrandFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59] focus:border-transparent"
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

          <div className="overflow-x-auto overflow-y-visible">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Provider</th>
                  <th className="text-center py-3 px-2 text-sm font-medium text-green-600">Highly Recommended</th>
                  <th className="text-center py-3 px-2 text-sm font-medium text-lime-600">Recommended</th>
                  <th className="text-center py-3 px-2 text-sm font-medium text-blue-600">Mentioned</th>
                  <th className="text-center py-3 px-2 text-sm font-medium text-yellow-600">With Caveats</th>
                  <th className="text-center py-3 px-2 text-sm font-medium text-red-600">Not Recommended</th>
                  <th className="text-center py-3 px-2 text-sm font-medium text-gray-500">Not Mentioned</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">Endorsement Rate</th>
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
                      <td className="text-right py-3 px-4">
                        <span className={`text-sm font-medium ${row.strongRate >= 50 ? 'text-green-600' : row.strongRate >= 25 ? 'text-blue-600' : 'text-gray-600'}`}>
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
                    <th className="text-center py-3 px-2 text-sm font-medium text-green-600">Highly Recommended</th>
                    <th className="text-center py-3 px-2 text-sm font-medium text-lime-600">Recommended</th>
                    <th className="text-center py-3 px-2 text-sm font-medium text-blue-600">Mentioned</th>
                    <th className="text-center py-3 px-2 text-sm font-medium text-yellow-600">With Caveats</th>
                    <th className="text-center py-3 px-2 text-sm font-medium text-red-600">Not Recommended</th>
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
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Response-Level Sentiment</h3>
            <p className="text-sm text-gray-500">Detailed sentiment for each AI response</p>
          </div>

          {/* Sentiment Legend */}
          <div className="flex flex-wrap items-center gap-3 mb-4 text-xs">
            <span className="text-gray-500">Sentiment:</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded border bg-green-100 text-green-800 border-green-200">Highly Recommended</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded border bg-lime-100 text-lime-800 border-lime-200">Recommended</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded border bg-blue-100 text-blue-800 border-blue-200">Mentioned</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded border bg-yellow-100 text-yellow-800 border-yellow-200">With Caveats</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded border bg-red-100 text-red-800 border-red-200">Not Recommended</span>
          </div>

          <div className="overflow-x-auto max-h-[500px] overflow-y-auto border border-gray-200 rounded-lg">
            <table className="w-full">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 bg-white">Prompt</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 bg-white">Provider</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 bg-white">Position</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 bg-white">{runStatus?.brand || 'Brand'} Sentiment</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 bg-white">Competitor Sentiments</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-500 bg-white">Response</th>
                </tr>
              </thead>
              <tbody>
                {globallyFilteredResults
                  .filter((r: Result) => !r.error && r.brand_sentiment)
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
                        {(() => {
                          let rank = 0;
                          const brandLower = (runStatus?.brand || '').toLowerCase();
                          if (result.brand_mentioned && result.response_text) {
                            const allBrands = result.all_brands_mentioned && result.all_brands_mentioned.length > 0
                              ? result.all_brands_mentioned
                              : [runStatus?.brand, ...(result.competitors_mentioned || [])].filter(Boolean);

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
                          return rank > 0 ? (
                            <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-lg ${
                              rank === 1 ? 'bg-green-100 text-green-700' :
                              rank <= 3 ? 'bg-yellow-100 text-yellow-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              #{rank}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-1 bg-gray-100 text-gray-500 text-xs font-medium rounded-lg">
                              Not shown
                            </span>
                          );
                        })()}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-lg border ${getSentimentColor(result.brand_sentiment)}`}>
                          {getSentimentLabel(result.brand_sentiment)}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {(() => {
                          const mentionedCompetitors = result.competitor_sentiments
                            ? Object.entries(result.competitor_sentiments).filter(([_, sentiment]) => sentiment !== 'not_mentioned')
                            : [];
                          const isExpanded = expandedCompetitorRows.has(result.id);
                          const displayCompetitors = isExpanded ? mentionedCompetitors : mentionedCompetitors.slice(0, 3);
                          const hiddenCount = mentionedCompetitors.length - 3;

                          return (
                            <div className="flex flex-wrap gap-1.5">
                              {displayCompetitors.map(([comp, sentiment]) => (
                                <span
                                  key={comp}
                                  className={`inline-flex items-center px-2 py-0.5 text-xs rounded border ${getSentimentColor(sentiment)}`}
                                  title={`${comp}: ${getSentimentLabel(sentiment)}`}
                                >
                                  {truncate(comp, 12)}
                                </span>
                              ))}
                              {hiddenCount > 0 && !isExpanded && (
                                <button
                                  onClick={() => {
                                    const newExpanded = new Set(expandedCompetitorRows);
                                    newExpanded.add(result.id);
                                    setExpandedCompetitorRows(newExpanded);
                                  }}
                                  className="text-xs text-[#4A7C59] hover:text-[#3d6649] hover:underline font-medium"
                                >
                                  +{hiddenCount} more
                                </button>
                              )}
                              {isExpanded && mentionedCompetitors.length > 3 && (
                                <button
                                  onClick={() => {
                                    const newExpanded = new Set(expandedCompetitorRows);
                                    newExpanded.delete(result.id);
                                    setExpandedCompetitorRows(newExpanded);
                                  }}
                                  className="text-xs text-gray-400 hover:text-gray-600 hover:underline"
                                >
                                  Show less
                                </button>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setSelectedResult(result)}
                          className="inline-flex items-center gap-1 text-sm text-[#4A7C59] hover:text-[#3d6649] font-medium"
                        >
                          View <ChevronDown className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-gray-500">
              {globallyFilteredResults.filter((r: Result) => !r.error && r.brand_sentiment).length} results total
            </p>
            <div className="flex gap-2">
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
      </div>
    );
  };

  // Recommendations Tab Content
  const RecommendationsTab = () => {
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

    // Calculate sentiment issues
    const sentimentIssues = useMemo(() => {
      if (!runStatus) return [];

      return promptBreakdownStats
        .filter(p => p.avgSentimentScore !== null && p.avgSentimentScore < 3)
        .map(p => ({
          prompt: p.prompt,
          sentiment: p.avgSentimentScore!,
          label: p.avgSentimentScore! < 2 ? 'Not Recommended' : 'With Caveats',
        }))
        .sort((a, b) => a.sentiment - b.sentiment)
        .slice(0, 3);
    }, [promptBreakdownStats]);

    // Content recommendations based on analysis
    const contentRecommendations = useMemo(() => {
      const recs: Array<{
        title: string;
        description: string;
        impact: 'high' | 'medium' | 'low';
        effort: 'high' | 'medium' | 'low';
      }> = [];

      const searchedBrandStats = brandBreakdownStats.find(b => b.isSearchedBrand);
      const topCompetitor = brandBreakdownStats.filter(b => !b.isSearchedBrand)[0];

      if (searchedBrandStats && topCompetitor && topCompetitor.visibilityScore > searchedBrandStats.visibilityScore) {
        recs.push({
          title: `Create comparison content vs ${topCompetitor.brand}`,
          description: `${topCompetitor.brand} has ${(topCompetitor.visibilityScore - searchedBrandStats.visibilityScore).toFixed(0)}% higher visibility`,
          impact: 'high',
          effort: 'medium',
        });
      }

      if (sourceOpportunities.length > 0) {
        recs.push({
          title: `Get featured on ${sourceOpportunities[0]?.domain}`,
          description: 'This authoritative source cites your competitors but not you',
          impact: 'high',
          effort: 'high',
        });
      }

      if (searchedBrandStats && searchedBrandStats.firstPositionRate < 30) {
        recs.push({
          title: 'Optimize content for AI featured snippets',
          description: `Your brand ranks #1 in only ${searchedBrandStats.firstPositionRate.toFixed(0)}% of mentions`,
          impact: 'medium',
          effort: 'low',
        });
      }

      if (sentimentIssues.length > 0) {
        recs.push({
          title: 'Address sentiment concerns in content',
          description: `${sentimentIssues.length} prompts show negative or conditional sentiment`,
          impact: 'medium',
          effort: 'medium',
        });
      }

      recs.push({
        title: 'Publish expert thought leadership content',
        description: 'AI models favor authoritative, well-cited content',
        impact: 'medium',
        effort: 'medium',
      });

      return recs.slice(0, 5);
    }, [brandBreakdownStats, sourceOpportunities, sentimentIssues]);

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

    return (
      <div className="space-y-6">
        {/* Actionable Takeaway Section */}
        {(isSummaryLoading || (aiSummary?.summary && extractActionableTakeaway(aiSummary.summary))) && (
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl shadow-sm border border-amber-200 p-5">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Lightbulb className="w-4 h-4 text-amber-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-gray-900 mb-1">Actionable Takeaway</h3>
                {isSummaryLoading ? (
                  <div className="flex items-center gap-2">
                    <Spinner size="sm" />
                    <span className="text-sm text-gray-500">Analyzing results...</span>
                  </div>
                ) : (
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {extractActionableTakeaway(aiSummary?.summary || '').replace(/\bai_overviews\b/gi, 'Google AI Overviews')}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* AI-Generated Recommendations */}
        {aiSummary?.recommendations && aiSummary.recommendations.length > 0 && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl shadow-sm border border-blue-100 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
                <Sparkles className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">AI-Powered Recommendations</h2>
                <p className="text-sm text-gray-600">Personalized insights based on your visibility analysis</p>
              </div>
            </div>

            <div className="space-y-3">
              {aiSummary.recommendations.map((rec, idx) => {
                const priorityColors = {
                  high: 'bg-red-100 text-red-700 border-red-200',
                  medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
                  low: 'bg-green-100 text-green-700 border-green-200',
                };
                const categoryIcons: Record<string, React.ReactNode> = {
                  content: <PenLine className="w-4 h-4" />,
                  seo: <Search className="w-4 h-4" />,
                  pr: <Newspaper className="w-4 h-4" />,
                  product: <Package className="w-4 h-4" />,
                  technical: <Settings className="w-4 h-4" />,
                };
                const categoryColors: Record<string, string> = {
                  content: 'bg-blue-50 text-blue-600',
                  seo: 'bg-green-50 text-green-600',
                  pr: 'bg-purple-50 text-purple-600',
                  product: 'bg-orange-50 text-orange-600',
                  technical: 'bg-gray-100 text-gray-600',
                };

                return (
                  <div key={idx} className="bg-white rounded-lg p-4 border border-gray-200">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <h3 className="font-semibold text-gray-900">{rec.title}</h3>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${categoryColors[rec.category] || categoryColors.technical}`}>
                          {categoryIcons[rec.category] || categoryIcons.technical}
                          {rec.category.charAt(0).toUpperCase() + rec.category.slice(1)}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${priorityColors[rec.priority]}`}>
                          {rec.priority.charAt(0).toUpperCase() + rec.priority.slice(1)} Priority
                        </span>
                      </div>
                    </div>
                    <p className="text-sm text-gray-600">{rec.description}</p>
                    {rec.dataInsight && (
                      <div className="mt-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg">
                        <p className="text-xs text-blue-700">
                          <span className="font-semibold">Data insight:</span> {rec.dataInsight}
                        </p>
                      </div>
                    )}
                    {rec.tactics && rec.tactics.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <p className="text-xs font-semibold text-gray-700 mb-2">Recommended tactics:</p>
                        <ul className="space-y-1.5">
                          {rec.tactics.map((tactic, tacticIdx) => (
                            <li key={tacticIdx} className="flex items-start gap-2 text-sm text-gray-600">
                              <span className="text-[#4A7C59] mt-0.5">→</span>
                              <span>{tactic}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recommended High-Impact Actions */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-[#E8F5E9] rounded-lg flex items-center justify-center">
              <Target className="w-5 h-5 text-[#4A7C59]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Recommended High-Impact Actions</h2>
              <p className="text-sm text-gray-500">Prioritized opportunities to improve your AI visibility</p>
            </div>
          </div>

          {quickWins.length > 0 ? (
            <div className="space-y-3">
              {quickWins.map((win, idx) => {
                const severityColors = {
                  critical: 'bg-red-100 text-red-700 border-red-200',
                  high: 'bg-orange-100 text-orange-700 border-orange-200',
                  medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
                };
                const typeLabels = {
                  prompt_gap: 'Prompt Gap',
                  provider_gap: 'Provider Gap',
                  source_gap: 'Source Gap',
                };
                const typeColors = {
                  prompt_gap: 'bg-blue-50 text-blue-600',
                  provider_gap: 'bg-purple-50 text-purple-600',
                  source_gap: 'bg-teal-50 text-teal-600',
                };

                return (
                  <div key={idx} className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg border border-gray-100">
                    <div className="flex-shrink-0 w-8 h-8 bg-[#4A7C59] text-white rounded-full flex items-center justify-center text-sm font-semibold">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center flex-wrap gap-2 mb-1">
                        <h3 className="font-medium text-gray-900">{win.title}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${severityColors[win.severity]}`}>
                          {win.severity === 'critical' ? 'Critical' : win.severity === 'high' ? 'High Priority' : 'Medium Priority'}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded ${typeColors[win.type]}`}>
                          {typeLabels[win.type]}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">{win.description}</p>
                      <div className="flex items-center flex-wrap gap-4 text-xs text-gray-500">
                        <span>Based on {win.metrics.responseCount} responses</span>
                        {win.competitors && win.competitors.length > 0 && (
                          <div className="flex items-center gap-1.5">
                            <span>Competitors:</span>
                            <div className="flex flex-wrap gap-1">
                              {win.competitors.map(comp => (
                                <span key={comp} className="px-1.5 py-0.5 bg-gray-200 text-gray-700 rounded">
                                  {comp}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-500 text-center py-8">
              Great job! No significant visibility gaps identified based on current data.
            </p>
          )}
        </div>

        {/* Content & SEO Recommendations */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
              <PenLine className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Content & SEO Recommendations</h2>
              <p className="text-sm text-gray-500">Actionable strategies to improve AI visibility</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Recommendation</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-500">Impact</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-500">Effort</th>
                </tr>
              </thead>
              <tbody>
                {contentRecommendations.map((rec, idx) => (
                  <tr key={idx} className="border-b border-gray-100">
                    <td className="py-3 px-4">
                      <p className="font-medium text-gray-900 text-sm">{rec.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{rec.description}</p>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`text-xs px-2.5 py-1 rounded-full border ${getImpactBadge(rec.impact)}`}>
                        {rec.impact.charAt(0).toUpperCase() + rec.impact.slice(1)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`text-xs px-2.5 py-1 rounded-full border ${getEffortBadge(rec.effort)}`}>
                        {rec.effort.charAt(0).toUpperCase() + rec.effort.slice(1)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Source Strategy */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center">
                <Newspaper className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Source Opportunities</h2>
                <p className="text-sm text-gray-500">High-impact sources to target for coverage</p>
              </div>
            </div>
            {sourceOpportunities.length > 0 && (
              <button className="text-sm text-[#4A7C59] hover:text-[#3d6649] font-medium flex items-center gap-1">
                <FileDown className="w-4 h-4" />
                Export PR List
              </button>
            )}
          </div>

          {sourceOpportunities.length > 0 ? (
            <div className="space-y-2">
              {sourceOpportunities.map((source, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Globe className="w-4 h-4 text-gray-400" />
                    <span className="font-medium text-gray-900">{source.domain}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Cites {source.competitorCount} competitors:</span>
                    <div className="flex gap-1">
                      {source.competitors.map(comp => (
                        <span key={comp} className="text-xs px-2 py-0.5 bg-gray-200 text-gray-700 rounded">
                          {truncate(comp, 12)}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 text-center py-6">
              No major source gaps identified. Your brand has good source coverage.
            </p>
          )}
        </div>

        {/* Sentiment Improvement */}
        {sentimentIssues.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
                <ThumbsDown className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Sentiment Gaps</h2>
                <p className="text-sm text-gray-500">Prompts where brand perception needs improvement</p>
              </div>
            </div>

            <div className="space-y-3">
              {sentimentIssues.map((issue, idx) => (
                <div key={idx} className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium text-gray-900 text-sm">"{truncate(issue.prompt, 50)}"</p>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      issue.label === 'Not Recommended'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {issue.label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600">
                    Consider addressing concerns in your content and marketing materials for this topic.
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Export & Reporting */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
              <FileBarChart className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Export & Reporting</h2>
              <p className="text-sm text-gray-500">Download and share your recommendations</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button className="flex flex-col items-center gap-2 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              <FileDown className="w-6 h-6 text-gray-600" />
              <span className="text-sm font-medium text-gray-700">PDF Report</span>
              <span className="text-xs text-gray-500">Executive summary</span>
            </button>
            <button className="flex flex-col items-center gap-2 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              <Download className="w-6 h-6 text-gray-600" />
              <span className="text-sm font-medium text-gray-700">CSV Export</span>
              <span className="text-xs text-gray-500">Raw data</span>
            </button>
            <button className="flex flex-col items-center gap-2 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              <Calendar className="w-6 h-6 text-gray-600" />
              <span className="text-sm font-medium text-gray-700">Schedule</span>
              <span className="text-xs text-gray-500">Weekly reports</span>
            </button>
            <button className="flex flex-col items-center gap-2 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              <Share2 className="w-6 h-6 text-gray-600" />
              <span className="text-sm font-medium text-gray-700">Share</span>
              <span className="text-xs text-gray-500">With team</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Reports Tab Content
  const ReportsTab = () => {
    const { getToken } = useAuth();
    const [reports, setReports] = useState<ScheduledReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [editingReport, setEditingReport] = useState<ScheduledReport | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    // Extract unique values from results
    const uniquePrompts = runStatus?.results ? [...new Set(runStatus.results.map(r => r.prompt))] : [];
    const uniqueProviders = runStatus?.results ? [...new Set(runStatus.results.map(r => r.provider))] : [];
    const allCompetitorsMentioned = runStatus?.results
      ? [...new Set(runStatus.results.flatMap(r => r.competitors_mentioned || []))]
      : [];

    // Form state
    const [formData, setFormData] = useState<Partial<ScheduledReportCreate>>({
      name: '',
      brand: runStatus?.brand || '',
      search_type: runStatus?.search_type || 'brand',
      prompts: uniquePrompts.length > 0 ? uniquePrompts : [''],
      competitors: allCompetitorsMentioned.length > 0 ? allCompetitorsMentioned : [''],
      providers: uniqueProviders.length > 0 ? uniqueProviders : ['openai'],
      temperatures: [0.7],
      repeats: 1,
      frequency: 'weekly',
      day_of_week: 1, // Tuesday
      hour: 9,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });

    const MAX_REPORTS = 3;
    const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const PROVIDER_LABELS: Record<string, string> = {
      openai: 'ChatGPT',
      gemini: 'Google Gemini',
      anthropic: 'Claude',
      perplexity: 'Perplexity',
      ai_overviews: 'Google AI Overviews',
    };

    // Fetch reports on mount
    useEffect(() => {
      fetchReports();
    }, []);

    const fetchReports = async () => {
      try {
        setLoading(true);
        setError(null);
        const token = await getToken();
        if (!token) {
          setError('Please sign in to view reports');
          return;
        }
        const response = await api.listScheduledReports(token);
        setReports(response.reports);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load reports');
      } finally {
        setLoading(false);
      }
    };

    const handleCreate = async () => {
      try {
        setActionLoading('create');
        const token = await getToken();
        if (!token) return;

        // Filter out empty strings and ensure arrays have at least one item
        const prompts = (formData.prompts || []).filter(p => p.trim());
        const competitors = (formData.competitors || []).filter(c => c.trim());
        const providers = (formData.providers || []).filter(p => p.trim());

        if (prompts.length === 0) {
          setError('At least one prompt is required');
          setActionLoading(null);
          return;
        }
        if (competitors.length === 0) {
          setError('At least one competitor is required');
          setActionLoading(null);
          return;
        }
        if (providers.length === 0) {
          setError('At least one provider is required');
          setActionLoading(null);
          return;
        }

        const data: ScheduledReportCreate = {
          name: formData.name || `${runStatus?.brand} Report`,
          brand: formData.brand || runStatus?.brand || '',
          search_type: formData.search_type || 'brand',
          prompts,
          competitors,
          providers,
          temperatures: formData.temperatures || [0.7],
          repeats: formData.repeats || 1,
          frequency: formData.frequency || 'weekly',
          day_of_week: formData.frequency === 'weekly' ? formData.day_of_week : null,
          hour: formData.hour || 9,
          timezone: formData.timezone || 'UTC',
        };

        await api.createScheduledReport(data, token);
        await fetchReports();
        setIsCreating(false);
        resetForm();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create report');
      } finally {
        setActionLoading(null);
      }
    };

    const handleUpdate = async () => {
      if (!editingReport) return;
      try {
        setActionLoading('update');
        const token = await getToken();
        if (!token) return;

        await api.updateScheduledReport(editingReport.id, formData, token);
        await fetchReports();
        setEditingReport(null);
        resetForm();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update report');
      } finally {
        setActionLoading(null);
      }
    };

    const handleDelete = async (reportId: string) => {
      if (!confirm('Are you sure you want to delete this report?')) return;
      try {
        setActionLoading(reportId);
        const token = await getToken();
        if (!token) return;

        await api.deleteScheduledReport(reportId, token);
        await fetchReports();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete report');
      } finally {
        setActionLoading(null);
      }
    };

    const handleToggle = async (reportId: string) => {
      try {
        setActionLoading(reportId);
        const token = await getToken();
        if (!token) return;

        await api.toggleScheduledReport(reportId, token);
        await fetchReports();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to toggle report');
      } finally {
        setActionLoading(null);
      }
    };

    const handleRunNow = async (reportId: string) => {
      try {
        setActionLoading(reportId);
        const token = await getToken();
        if (!token) return;

        const response = await api.runScheduledReportNow(reportId, token);
        alert(`Report started! Run ID: ${response.run_id}`);
        await fetchReports();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to run report');
      } finally {
        setActionLoading(null);
      }
    };

    const resetForm = () => {
      setFormData({
        name: '',
        brand: runStatus?.brand || '',
        search_type: runStatus?.search_type || 'brand',
        prompts: uniquePrompts.length > 0 ? uniquePrompts : [''],
        competitors: allCompetitorsMentioned.length > 0 ? allCompetitorsMentioned : [''],
        providers: uniqueProviders.length > 0 ? uniqueProviders : ['openai'],
        temperatures: [0.7],
        repeats: 1,
        frequency: 'weekly',
        day_of_week: 1,
        hour: 9,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
    };

    const openEditModal = (report: ScheduledReport) => {
      setEditingReport(report);
      setFormData({
        name: report.name,
        brand: report.brand,
        search_type: report.search_type,
        prompts: report.prompts,
        competitors: report.competitors,
        providers: report.providers,
        temperatures: report.temperatures,
        repeats: report.repeats,
        frequency: report.frequency,
        day_of_week: report.day_of_week,
        hour: report.hour,
        timezone: report.timezone,
      });
    };

    const formatNextRun = (dateStr: string) => {
      const date = new Date(dateStr);
      return date.toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    };

    if (loading) {
      return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <Spinner className="w-8 h-8 mx-auto mb-4 text-[#4A7C59]" />
          <p className="text-gray-500">Loading reports...</p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Automated Reports</h2>
            <p className="text-sm text-gray-500 mt-1">
              Schedule recurring visibility analyses and receive results via email
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {reports.length} of {MAX_REPORTS} reports used
            </p>
          </div>
          <button
            onClick={() => {
              resetForm();
              setIsCreating(true);
            }}
            disabled={reports.length >= MAX_REPORTS}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              reports.length >= MAX_REPORTS
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-[#4A7C59] text-white hover:bg-[#3d6649]'
            }`}
            title={reports.length >= MAX_REPORTS ? `Maximum of ${MAX_REPORTS} reports allowed` : undefined}
          >
            <Plus className="w-4 h-4" />
            New Report
          </button>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
            <button
              onClick={() => setError(null)}
              className="ml-auto p-1 hover:bg-red-100 rounded"
            >
              <X className="w-4 h-4 text-red-500" />
            </button>
          </div>
        )}

        {/* Reports List */}
        {reports.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
            <div className="w-16 h-16 bg-[#E8F0E8] rounded-full flex items-center justify-center mx-auto mb-4">
              <FileBarChart className="w-8 h-8 text-[#4A7C59]" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No automated reports yet</h3>
            <p className="text-gray-500 max-w-md mx-auto mb-4">
              Create your first automated report to receive regular visibility updates for {runStatus?.brand || 'your brand'}.
            </p>
            <p className="text-xs text-gray-400 mb-6">
              You can create up to {MAX_REPORTS} automated reports.
            </p>
            <button
              onClick={() => {
                resetForm();
                setIsCreating(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#4A7C59] text-white text-sm font-medium rounded-lg hover:bg-[#3d6649] transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Report
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {reports.map((report) => (
              <div
                key={report.id}
                className={`bg-white rounded-xl shadow-sm border border-gray-100 p-6 ${
                  !report.is_active ? 'opacity-60' : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">{report.name}</h3>
                      <span
                        className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${
                          report.is_active
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {report.is_active ? 'Active' : 'Paused'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mb-3">
                      {report.brand} · {report.frequency === 'weekly' ? `Every ${DAYS_OF_WEEK[report.day_of_week || 0]}` : 'Daily'} at {report.hour}:00
                    </p>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {report.providers.map((p) => (
                        <span
                          key={p}
                          className="inline-flex items-center px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded"
                        >
                          {PROVIDER_LABELS[p] || p}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        Next: {report.is_active ? formatNextRun(report.next_run_at) : 'Paused'}
                      </span>
                      {report.last_run_at && (
                        <span>Last run: {formatNextRun(report.last_run_at)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleRunNow(report.id)}
                      disabled={actionLoading === report.id}
                      className="p-2 text-gray-500 hover:text-[#4A7C59] hover:bg-gray-100 rounded-lg transition-colors"
                      title="Run Now"
                    >
                      {actionLoading === report.id ? (
                        <Spinner className="w-5 h-5" />
                      ) : (
                        <PlayCircle className="w-5 h-5" />
                      )}
                    </button>
                    <button
                      onClick={() => handleToggle(report.id)}
                      disabled={actionLoading === report.id}
                      className="p-2 text-gray-500 hover:text-[#4A7C59] hover:bg-gray-100 rounded-lg transition-colors"
                      title={report.is_active ? 'Pause' : 'Resume'}
                    >
                      {report.is_active ? (
                        <Pause className="w-5 h-5" />
                      ) : (
                        <Power className="w-5 h-5" />
                      )}
                    </button>
                    <button
                      onClick={() => openEditModal(report)}
                      className="p-2 text-gray-500 hover:text-[#4A7C59] hover:bg-gray-100 rounded-lg transition-colors"
                      title="Edit"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleDelete(report.id)}
                      disabled={actionLoading === report.id}
                      className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create/Edit Modal */}
        {(isCreating || editingReport) && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">
                  {editingReport ? 'Edit Report' : 'Create Automated Report'}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  {editingReport
                    ? 'Update your scheduled report settings'
                    : 'Set up a recurring visibility analysis based on the current run'}
                </p>
              </div>
              <div className="p-6 space-y-4">
                {/* Report Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Report Name
                  </label>
                  <input
                    type="text"
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder={`${runStatus?.brand} Weekly Report`}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59] focus:border-transparent"
                  />
                </div>

                {/* Frequency */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Frequency
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, frequency: 'daily' })}
                      className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                        formData.frequency === 'daily'
                          ? 'bg-[#4A7C59] text-white border-[#4A7C59]'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      Daily
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, frequency: 'weekly' })}
                      className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                        formData.frequency === 'weekly'
                          ? 'bg-[#4A7C59] text-white border-[#4A7C59]'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      Weekly
                    </button>
                  </div>
                </div>

                {/* Day of Week (for weekly) */}
                {formData.frequency === 'weekly' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Day of Week
                    </label>
                    <select
                      value={formData.day_of_week ?? 1}
                      onChange={(e) =>
                        setFormData({ ...formData, day_of_week: parseInt(e.target.value) })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59] focus:border-transparent"
                    >
                      {DAYS_OF_WEEK.map((day, idx) => (
                        <option key={day} value={idx}>
                          {day}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Time */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Time (Hour)
                  </label>
                  <select
                    value={formData.hour ?? 9}
                    onChange={(e) => setFormData({ ...formData, hour: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59] focus:border-transparent"
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>
                        {i === 0 ? '12:00 AM' : i < 12 ? `${i}:00 AM` : i === 12 ? '12:00 PM' : `${i - 12}:00 PM`}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Timezone: {formData.timezone}
                  </p>
                </div>

                {/* Summary */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Report Configuration</h4>
                  <div className="text-sm text-gray-600 space-y-1">
                    <p><span className="font-medium">Brand:</span> {formData.brand}</p>
                    <p><span className="font-medium">Prompts:</span> {formData.prompts?.length || 0}</p>
                    <p><span className="font-medium">Competitors:</span> {formData.competitors?.length || 0}</p>
                    <p><span className="font-medium">Providers:</span> {formData.providers?.map(p => PROVIDER_LABELS[p] || p).join(', ')}</p>
                  </div>
                </div>
              </div>
              <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
                <button
                  onClick={() => {
                    setIsCreating(false);
                    setEditingReport(null);
                    resetForm();
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={editingReport ? handleUpdate : handleCreate}
                  disabled={actionLoading === 'create' || actionLoading === 'update'}
                  className="px-4 py-2 text-sm font-medium text-white bg-[#4A7C59] rounded-lg hover:bg-[#3d6649] transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {(actionLoading === 'create' || actionLoading === 'update') && (
                    <Spinner className="w-4 h-4" />
                  )}
                  {editingReport ? 'Save Changes' : 'Create Report'}
                </button>
              </div>
            </div>
          </div>
        )}
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
              <div className="flex items-center gap-4">
                <button
                  onClick={() => router.push('/')}
                  className="px-4 py-2 bg-[#4A7C59] text-white text-sm font-medium rounded-xl hover:bg-[#3d6649] transition-colors flex items-center gap-2"
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
          <div className="space-y-6">
            {/* Competitive Insights Summary */}
            {competitiveInsights.length > 0 && (
              <div className="bg-gradient-to-r from-blue-50 to-green-50 rounded-xl shadow-sm border border-blue-100 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Lightbulb className="w-5 h-5 text-blue-600" />
                  <h2 className="text-base font-semibold text-gray-900">Key Competitive Insights</h2>
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
                    <h2 className="text-base font-semibold text-gray-900">Brand Breakdown</h2>
                    <p className="text-sm text-gray-500 mt-1">Performance comparison across all brands</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <select
                      value={brandBreakdownPromptFilter}
                      onChange={(e) => setBrandBreakdownPromptFilter(e.target.value)}
                      className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59] focus:border-transparent max-w-[200px]"
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
                      className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59] focus:border-transparent"
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
                        <th className="text-left py-3 px-3 font-medium text-gray-600">Brand</th>
                        <th className="text-center py-3 px-3 font-medium text-gray-600">
                          <div className="whitespace-nowrap">AI Visibility</div>
                          <div className="text-xs text-gray-400 font-normal">How often brand appears</div>
                        </th>
                        <th className="text-center py-3 px-3 font-medium text-gray-600">
                          <div className="whitespace-nowrap">Share of Voice</div>
                          <div className="text-xs text-gray-400 font-normal">Brand's share of mentions</div>
                        </th>
                        <th className="text-center py-3 px-3 font-medium text-gray-600">
                          <div className="whitespace-nowrap">Top Result Rate</div>
                          <div className="text-xs text-gray-400 font-normal">How often brand is #1</div>
                        </th>
                        <th className="text-center py-3 px-3 font-medium text-gray-600">
                          <div className="whitespace-nowrap">Avg. Position</div>
                          <div className="text-xs text-gray-400 font-normal">Avg. ranking when mentioned</div>
                        </th>
                        <th className="text-center py-3 px-3 font-medium text-gray-600">
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
                          if (score >= 1.5) return 'text-orange-500';
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
                            'conditional': 'text-orange-500',
                            'negative_comparison': 'text-red-500',
                          };
                          return colors[sentiment] || 'text-gray-400';
                        };

                        const isExpanded = expandedBrandBreakdownRows.has(stat.brand);

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
                                  <span className={`font-medium ${stat.isSearchedBrand ? 'text-[#4A7C59]' : 'text-gray-900'}`}>
                                    {stat.brand}
                                  </span>
                                  {stat.isSearchedBrand && (
                                    <span className="text-xs px-1.5 py-0.5 bg-[#E8F0E8] text-[#4A7C59] rounded">searched</span>
                                  )}
                                </div>
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
            {brandBreakdownStats.length > 0 && (() => {
              // Calculate dynamic x-axis range based on actual sentiment values
              const sentimentData = brandBreakdownStats
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
              const rawData = brandBreakdownStats
                .filter(stat => stat.avgSentimentScore !== null && stat.mentioned > 0)
                .map(stat => ({
                  brand: stat.brand,
                  mentions: stat.mentioned,
                  sentiment: stat.avgSentimentScore || 0,
                  visibility: stat.visibilityScore,
                  isSearchedBrand: stat.isSearchedBrand,
                }));

              // Group points by their position (same mentions and similar sentiment)
              const positionGroups: Record<string, typeof rawData> = {};
              rawData.forEach(point => {
                // Round sentiment to 1 decimal for grouping
                const key = `${point.mentions}-${point.sentiment.toFixed(1)}`;
                if (!positionGroups[key]) {
                  positionGroups[key] = [];
                }
                positionGroups[key].push(point);
              });

              // Add offset information to each point
              const processedData = rawData.map(point => {
                const key = `${point.mentions}-${point.sentiment.toFixed(1)}`;
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
                <div className="mb-4">
                  <h2 className="text-base font-semibold text-gray-900">Brand Positioning</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    How brands compare by mention frequency and sentiment
                  </p>
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
                          value: 'Number of Mentions',
                          angle: -90,
                          position: 'insideLeft',
                          offset: 10,
                          style: { fill: '#374151', fontSize: 14, fontWeight: 500, textAnchor: 'middle' }
                        }}
                      />
                      <Tooltip
                        cursor={false}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length > 0) {
                            const data = payload[0].payload;
                            const sentimentLabels = ['', 'Negative', 'Conditional', 'Neutral', 'Positive', 'Strong'];
                            return (
                              <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
                                <p className="font-medium text-gray-900 mb-1">{data.brand}</p>
                                <p className="text-gray-600">Mentions: {data.mentions}</p>
                                <p className="text-gray-600">
                                  Sentiment: {sentimentLabels[Math.round(data.sentiment)] || 'N/A'}
                                </p>
                                <p className="text-gray-600">Visibility: {data.visibility.toFixed(0)}%</p>
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

                          // Calculate horizontal offset for overlapping points
                          const circleRadius = isSearched ? 10 : 7;
                          const spacing = 20; // Space between circles
                          const totalWidth = (groupSize - 1) * spacing;
                          const xOffset = groupSize > 1 ? (indexInGroup * spacing) - (totalWidth / 2) : 0;

                          // Calculate label offset - spread labels for 3+ items
                          let labelXOffset = 0;
                          let labelYOffset = -(isSearched ? 14 : 11); // Default: above
                          let textAnchor: 'start' | 'middle' | 'end' = 'middle';

                          if (groupSize === 1) {
                            // Single item: label above center
                            labelXOffset = 0;
                            labelYOffset = -(isSearched ? 14 : 11);
                          } else if (groupSize === 2) {
                            // Two items: alternate above/below
                            labelYOffset = indexInGroup === 0
                              ? -(isSearched ? 14 : 11)
                              : (isSearched ? 22 : 18);
                          } else {
                            // 3+ items: spread labels in different directions
                            // Position labels at different angles around the cluster
                            const labelDistance = isSearched ? 18 : 15;
                            const angles = [
                              -90,   // top
                              150,   // bottom-left
                              30,    // bottom-right
                              -45,   // top-right
                              -135,  // top-left
                              90,    // bottom
                            ];
                            const angle = angles[indexInGroup % angles.length];
                            const radians = (angle * Math.PI) / 180;
                            labelXOffset = Math.cos(radians) * labelDistance;
                            labelYOffset = Math.sin(radians) * labelDistance;

                            // Adjust text anchor based on horizontal position
                            if (labelXOffset < -5) textAnchor = 'end';
                            else if (labelXOffset > 5) textAnchor = 'start';
                          }

                          return (
                            <g>
                              <circle
                                cx={cx + xOffset}
                                cy={cy}
                                r={circleRadius}
                                fill={isSearched ? '#4A7C59' : '#3b82f6'}
                                stroke={isSearched ? '#3d6649' : '#2563eb'}
                                strokeWidth={2}
                                opacity={0.8}
                              />
                              <text
                                x={cx + xOffset + labelXOffset}
                                y={cy + labelYOffset}
                                textAnchor={textAnchor}
                                fill={isSearched ? '#4A7C59' : '#3b82f6'}
                                fontSize={isSearched ? 12 : 11}
                                fontWeight={isSearched ? 600 : 500}
                              >
                                {payload.brand.length > 15 ? payload.brand.substring(0, 13) + '...' : payload.brand}
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

            {/* Prompt Performance Matrix (Heatmap) */}
            {promptPerformanceMatrix.brands.length > 0 && promptPerformanceMatrix.prompts.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="mb-4">
                  <h2 className="text-base font-semibold text-gray-900">Prompt Performance Matrix</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Visibility rates for each brand across different prompts
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-2 font-medium text-gray-600 sticky left-0 bg-white min-w-[120px]">Brand</th>
                        {promptPerformanceMatrix.prompts.map((prompt, idx) => (
                          <th
                            key={idx}
                            className="text-center py-3 px-2 font-medium text-gray-600 min-w-[140px] max-w-[180px] relative group"
                          >
                            <span className="text-xs block truncate cursor-help">
                              {prompt.length > 40 ? prompt.substring(0, 38) + '...' : prompt}
                            </span>
                            {prompt.length > 40 && (
                              <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-50 hidden group-hover:block">
                                <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 max-w-[300px] whitespace-normal text-left shadow-lg">
                                  {prompt}
                                </div>
                              </div>
                            )}
                          </th>
                        ))}
                        <th className="text-center py-3 px-2 font-medium text-gray-600 min-w-[80px]">Avg</th>
                      </tr>
                    </thead>
                    <tbody>
                      {promptPerformanceMatrix.brands.map((brand, brandIdx) => {
                        const isSearchedBrand = brand === runStatus?.brand;
                        const rowAvg = promptPerformanceMatrix.matrix[brandIdx].reduce((a, b) => a + b, 0) / promptPerformanceMatrix.matrix[brandIdx].length;
                        return (
                          <tr key={brand} className={brandIdx % 2 === 0 ? 'bg-gray-50' : ''}>
                            <td className={`py-2 px-2 sticky left-0 ${brandIdx % 2 === 0 ? 'bg-gray-50' : 'bg-white'}`}>
                              <span className={`font-medium ${isSearchedBrand ? 'text-[#4A7C59]' : 'text-gray-900'}`}>
                                {brand.length > 15 ? brand.substring(0, 13) + '...' : brand}
                              </span>
                              {isSearchedBrand && (
                                <span className="text-xs px-1 ml-1 bg-[#E8F0E8] text-[#4A7C59] rounded">you</span>
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
                    <h2 className="text-base font-semibold text-gray-900">Brand Co-occurrence Analysis</h2>
                    <p className="text-sm text-gray-500 mt-1">
                      Brands frequently mentioned together in AI responses. Numbers show co-occurrence count.
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

                {cooccurrenceView === 'pairs' && (
                <>
                <div className="space-y-3">
                  {brandCooccurrence.map((pair, idx) => {
                    const maxCount = brandCooccurrence[0]?.count || 1;
                    const widthPercent = (pair.count / maxCount) * 100;
                    const isYourBrand = pair.brand1 === runStatus?.brand || pair.brand2 === runStatus?.brand;
                    return (
                      <div key={idx} className="flex items-center gap-4">
                        <div className="w-48 flex-shrink-0">
                          <div className="flex items-center gap-1 text-sm">
                            <span className={pair.brand1 === runStatus?.brand ? 'font-semibold text-[#4A7C59]' : 'text-gray-700'}>
                              {pair.brand1.length > 12 ? pair.brand1.substring(0, 10) + '...' : pair.brand1}
                            </span>
                            <span className="text-gray-400">+</span>
                            <span className={pair.brand2 === runStatus?.brand ? 'font-semibold text-[#4A7C59]' : 'text-gray-700'}>
                              {pair.brand2.length > 12 ? pair.brand2.substring(0, 10) + '...' : pair.brand2}
                            </span>
                          </div>
                        </div>
                        <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${isYourBrand ? 'bg-[#4A7C59]' : 'bg-blue-400'}`}
                            style={{ width: `${widthPercent}%` }}
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
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-[#4A7C59]"></div>
                    <span>Includes {runStatus?.brand || 'your brand'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-blue-400"></div>
                    <span>Competitors only</span>
                  </div>
                </div>
                </>
                )}

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

                  // Colors for competitor circles - green and blue variants
                  const colors = ['#4A7C59', '#3b82f6', '#6B9B7A', '#60a5fa'];

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

                            return (
                              <g key={idx}>
                                <circle
                                  cx={cx}
                                  cy={cy}
                                  r={radius}
                                  fill={colors[idx % colors.length]}
                                  fillOpacity="0.2"
                                  stroke={colors[idx % colors.length]}
                                  strokeWidth="2"
                                />
                                {/* Brand name - positioned outside the circle */}
                                <text
                                  x={cx + Math.cos(angle) * (radius + 18)}
                                  y={cy + Math.sin(angle) * (radius + 18)}
                                  textAnchor="middle"
                                  dominantBaseline="middle"
                                  fill={colors[idx % colors.length]}
                                  fontSize="13"
                                  fontWeight="500"
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
                        Circle size shows how often brands appear together. Numbers show the total mentions.
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
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">Brand-Source Heatmap</h3>
                    <p className="text-sm text-gray-500">
                      {heatmapShowSentiment ? 'Sentiment of each source toward brand' : 'Sources cited when each brand is mentioned'}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1 border-b border-gray-200">
                      <button
                        onClick={() => setHeatmapShowSentiment(false)}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                          !heatmapShowSentiment
                            ? 'border-[#4A7C59] text-[#4A7C59]'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        Citations
                      </button>
                      <button
                        onClick={() => setHeatmapShowSentiment(true)}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                          heatmapShowSentiment
                            ? 'border-[#4A7C59] text-[#4A7C59]'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        Sentiment
                      </button>
                    </div>
                    <select
                      value={heatmapProviderFilter}
                      onChange={(e) => setHeatmapProviderFilter(e.target.value)}
                      className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59] focus:border-transparent"
                    >
                      <option value="all">All Models</option>
                      {availableProviders.map((provider) => (
                        <option key={provider} value={provider}>{getProviderLabel(provider)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Legend - moved to top */}
                <div className="mb-4 flex items-center gap-3 text-xs text-gray-500">
                  {heatmapShowSentiment ? (
                    <>
                      <span className="text-gray-600 font-medium">Sentiment:</span>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(239, 68, 68, 0.6)' }} />
                        <span>Not Recommended</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(251, 191, 36, 0.6)' }} />
                        <span>With Caveats</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(156, 163, 175, 0.4)' }} />
                        <span>Neutral</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(134, 239, 172, 0.7)' }} />
                        <span>Recommended</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(34, 139, 34, 0.75)' }} />
                        <span>Highly Recommended</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(74, 124, 89, 0.5)' }} />
                        <span>Searched brand</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(91, 163, 192, 0.5)' }} />
                        <span>Competitors</span>
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <span>Fewer</span>
                        <div className="flex">
                          <div className="w-4 h-3 rounded-l" style={{ backgroundColor: 'rgba(91, 163, 192, 0.15)' }} />
                          <div className="w-4 h-3" style={{ backgroundColor: 'rgba(91, 163, 192, 0.4)' }} />
                          <div className="w-4 h-3 rounded-r" style={{ backgroundColor: 'rgba(91, 163, 192, 0.7)' }} />
                        </div>
                        <span>More</span>
                      </div>
                    </>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className="text-left py-2 px-3 font-medium text-gray-600 border-b border-gray-200 sticky left-0 bg-white z-10">Source</th>
                        {brandSourceHeatmap.brands.map(brand => (
                          <th
                            key={brand}
                            className={`text-center py-2 px-3 font-medium border-b border-gray-200 min-w-[100px] ${
                              brand === brandSourceHeatmap.searchedBrand
                                ? 'text-[#4A7C59] bg-green-50'
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
                            <td className="py-2 px-3 font-medium text-[#4A7C59] sticky left-0 bg-inherit z-10" title={row.domain}>
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

                              // In sentiment mode, use distinct colors for each sentiment level
                              let bgColor: string;
                              let textColor: string = 'text-gray-700';
                              if (count === 0) {
                                bgColor = isSearchedBrand ? 'rgba(74, 124, 89, 0.05)' : 'transparent';
                              } else if (heatmapShowSentiment) {
                                // Distinct colors for each sentiment level
                                if (avgSentiment >= 4.5) {
                                  // Highly Recommended - dark green
                                  bgColor = 'rgba(34, 139, 34, 0.75)';
                                  textColor = 'text-white font-medium';
                                } else if (avgSentiment >= 3.5) {
                                  // Recommended - light green
                                  bgColor = 'rgba(134, 239, 172, 0.7)';
                                  textColor = 'text-gray-800';
                                } else if (avgSentiment >= 2.5) {
                                  // Neutral - gray
                                  bgColor = 'rgba(156, 163, 175, 0.4)';
                                  textColor = 'text-gray-800';
                                } else if (avgSentiment >= 1.5) {
                                  // With Caveats - amber/orange
                                  bgColor = 'rgba(251, 191, 36, 0.6)';
                                  textColor = 'text-gray-800';
                                } else {
                                  // Not Recommended - red
                                  bgColor = 'rgba(239, 68, 68, 0.6)';
                                  textColor = 'text-white font-medium';
                                }
                              } else {
                                bgColor = isSearchedBrand
                                  ? `rgba(74, 124, 89, ${0.2 + intensity * 0.6})`
                                  : `rgba(91, 163, 192, ${0.15 + intensity * 0.55})`;
                              }

                              return (
                                <td
                                  key={brand}
                                  className={`text-center py-2 px-2 ${count > 0 ? 'cursor-pointer hover:ring-2 hover:ring-inset hover:ring-gray-400' : ''}`}
                                  style={{ backgroundColor: bgColor, minWidth: '60px' }}
                                  onDoubleClick={() => count > 0 && handleHeatmapCellClick(row.domain as string, brand)}
                                  title={count > 0 ? (heatmapShowSentiment ? `${getSentimentLabelFromScore(avgSentiment)} - Double-click to view` : `${count} citations - Double-click to view`) : undefined}
                                >
                                  {count === 0 && <span className="text-gray-300">-</span>}
                                  {count > 0 && !heatmapShowSentiment && (
                                    <span className={intensity > 0.6 ? 'text-white font-medium' : 'text-gray-700'}>
                                      {count}
                                    </span>
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
              </div>
            )}
          </div>
        )}
        {activeTab === 'sentiment' && <SentimentTab />}
        {activeTab === 'sources' && <SourcesTab />}
        {activeTab === 'recommendations' && <RecommendationsTab />}
        {activeTab === 'reports' && <ReportsTab />}
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
                    <span className="ml-2 text-[#4A7C59]">
                      • Highlighting mentions of {selectedResultHighlight.brand}
                      {selectedResultHighlight.domain && <> from {selectedResultHighlight.domain}</>}
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
                        {selectedResult.brand_sentiment === 'strong_endorsement' ? 'Highly Recommended' :
                         selectedResult.brand_sentiment === 'positive_endorsement' ? 'Recommended' :
                         selectedResult.brand_sentiment === 'neutral_mention' ? 'Neutral' :
                         selectedResult.brand_sentiment === 'conditional' ? 'With Caveats' :
                         selectedResult.brand_sentiment === 'negative_comparison' ? 'Not Recommended' :
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
                        p: ({ children }) => {
                          // Highlight paragraphs containing the highlighted brand
                          if (selectedResultHighlight) {
                            const text = typeof children === 'string' ? children :
                              (Array.isArray(children) ? children.map(c => typeof c === 'string' ? c : '').join('') : '');
                            const containsBrand = text.toLowerCase().includes(selectedResultHighlight.brand.toLowerCase());
                            if (containsBrand) {
                              return <p className="bg-yellow-100 rounded px-2 py-1 -mx-2 border-l-4 border-yellow-400">{children}</p>;
                            }
                          }
                          return <p>{children}</p>;
                        },
                        li: ({ children }) => {
                          // Highlight list items containing the highlighted brand
                          if (selectedResultHighlight) {
                            const text = typeof children === 'string' ? children :
                              (Array.isArray(children) ? children.map(c => typeof c === 'string' ? c : '').join('') : '');
                            const containsBrand = text.toLowerCase().includes(selectedResultHighlight.brand.toLowerCase());
                            if (containsBrand) {
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
                                  : 'text-[#4A7C59] hover:text-[#3d6649]'
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
                  className="p-3 border border-gray-200 rounded-lg hover:border-[#4A7C59] hover:bg-gray-50 cursor-pointer transition-colors"
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
                      <span className="text-xs text-gray-500">T={result.temperature}</span>
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
                    {result.response_text?.substring(0, 200)}...
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
