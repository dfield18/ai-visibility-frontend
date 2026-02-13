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
import { getTextForRanking } from './tabs/shared';
import { getSearchTypeConfig, type TabId } from '@/lib/searchTypeConfig';
import { PaywallOverlay } from '@/components/PaywallOverlay';
import { PlaceholderChart } from '@/components/PlaceholderChart';
import { PlaceholderTable } from '@/components/PlaceholderTable';
import { useSectionAccess } from '@/hooks/useBilling';

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
  return config.tabs
    .filter(t => t.enabled)
    .map(t => ({
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
function SectionGuide({ activeTab }: { activeTab: TabType }) {
  const [activeSection, setActiveSection] = useState('');
  const sections = TAB_SECTIONS[activeTab];

  useEffect(() => {
    if (!sections || sections.length === 0) return;

    let rafId: number;

    const updateActiveSection = () => {
      // Walk through sections in order; the last one whose top is above
      // the threshold (120px from viewport top) is the "current" section
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

    // Initial check after DOM elements mount
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
      <div className="sticky top-36">
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
      </div>
    </div>
  );
}

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

  // Section access for paywall enforcement
  const sectionAccess = useSectionAccess();

  // Canonical provider display order (by popularity)
  const PROVIDER_ORDER = ['openai', 'gemini', 'anthropic', 'perplexity', 'grok', 'llama', 'ai_overviews'];

  // Tab state - persisted in URL
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    const tab = searchParams.get('tab') as TabType;
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
  const [providerScrollIndex, setProviderScrollIndex] = useState<Record<string, number>>({});
  const [showModifyModal, setShowModifyModal] = useState(false);

  const { data: runStatus, isLoading, error } = useRunStatus(runId, true);

  // Dynamic tabs based on search type (must be after runStatus declaration)
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

  // Get unique providers from results for the filter dropdown, sorted by popularity
  const availableProviders = useMemo(() => {
    if (!runStatus) return [];
    const providers = new Set<string>();
    runStatus.results.forEach((r: Result) => {
      if (!r.error) providers.add(r.provider);
    });
    return PROVIDER_ORDER.filter(p => providers.has(p)).concat(
      Array.from(providers).filter(p => !PROVIDER_ORDER.includes(p))
    );
  }, [runStatus]);

  // Get all brands for filters (searched brand + competitors)
  const availableBrands = useMemo(() => {
    if (!runStatus) return [];
    const isCategory = runStatus.search_type === 'category';
    const brands = new Set<string>();
    if (runStatus.brand && !isCategory) {
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
  // Fix brand_mentioned for results where the backend missed a mention
  // (e.g., AI Overviews responses where the brand appears in supplemental sections)
  const correctedResults = useMemo(() => {
    if (!runStatus) return [];
    const brandLower = runStatus.brand.toLowerCase();
    return runStatus.results.map((result: Result) => {
      if (!result.brand_mentioned && result.response_text && !result.error) {
        if (result.response_text.toLowerCase().includes(brandLower)) {
          return { ...result, brand_mentioned: true };
        }
      }
      return result;
    });
  }, [runStatus]);

  const globallyFilteredResults = useMemo(() => {
    if (!runStatus) return [];

    return correctedResults.filter((result: Result) => {
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

  // Cost breakdown: prompt costs (per-result LLM calls) vs analysis costs (AI summary/recommendations) vs frontend insights costs
  const promptCost = useMemo(() => {
    if (!runStatus) return 0;
    return runStatus.results
      .filter((r: Result) => !r.error && r.cost)
      .reduce((sum: number, r: Result) => sum + (r.cost || 0), 0);
  }, [runStatus]);

  const totalBackendCost = runStatus?.actual_cost ?? 0;
  const analysisCost = Math.max(0, totalBackendCost - promptCost);

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

  // Helper to calculate position for a result — always uses text position
  const getResultPosition = (result: Result): number | null => {
    if (!result.response_text || result.error || !runStatus) return null;
    const selectedBrand = runStatus.search_type === 'category'
      ? (runStatus.results.find((r: Result) => r.competitors_mentioned?.length)?.competitors_mentioned?.[0] || '')
      : runStatus.brand;
    const brandLower = (selectedBrand || '').toLowerCase();
    if (!brandLower) return null;
    const allBrands: string[] = result.all_brands_mentioned && result.all_brands_mentioned.length > 0
      ? result.all_brands_mentioned.filter((b): b is string => typeof b === 'string')
      : [...(runStatus.search_type === 'category' ? [] : [runStatus.brand]), ...(result.competitors_mentioned || [])].filter((b): b is string => typeof b === 'string');

    const rankingText = getTextForRanking(result.response_text, result.provider).toLowerCase();
    const brandPos = rankingText.indexOf(brandLower);
    if (brandPos >= 0) {
      let brandsBeforeCount = 0;
      for (const b of allBrands) {
        const bLower = b.toLowerCase();
        if (bLower === brandLower || bLower.includes(brandLower) || brandLower.includes(bLower)) continue;
        const bPos = rankingText.indexOf(bLower);
        if (bPos >= 0 && bPos < brandPos) brandsBeforeCount++;
      }
      return brandsBeforeCount + 1;
    }
    if (result.brand_mentioned) return allBrands.length + 1;
    return null;
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

          const allBrands: string[] = result.all_brands_mentioned && result.all_brands_mentioned.length > 0
            ? result.all_brands_mentioned.filter((b): b is string => typeof b === 'string')
            : [...(runStatus.search_type === 'category' ? [] : [runStatus.brand]), ...(result.competitors_mentioned || [])].filter((b): b is string => typeof b === 'string');

          // Rank by text position
          const rankingText = getTextForRanking(result.response_text, result.provider).toLowerCase();
          const brandPos = rankingText.indexOf(brandLower);
          let rank = 0;
          if (brandPos >= 0) {
            let brandsBeforeCount = 0;
            for (const b of allBrands) {
              const bLower = b.toLowerCase();
              if (bLower === brandLower || bLower.includes(brandLower) || brandLower.includes(bLower)) continue;
              const bPos = rankingText.indexOf(bLower);
              if (bPos >= 0 && bPos < brandPos) brandsBeforeCount++;
            }
            rank = brandsBeforeCount + 1;
          } else {
            rank = allBrands.length + 1;
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
        const rankingText = r.response_text ? getTextForRanking(r.response_text, r.provider).toLowerCase() : '';
        const brandPos = rankingText.indexOf(brandLower);
        let rank = allBrands.length + 1;
        if (brandPos >= 0) {
          let brandsBeforeCount = 0;
          for (const b of allBrands) {
            const bLower = b.toLowerCase();
            if (bLower === brandLower || bLower.includes(brandLower) || brandLower.includes(bLower)) continue;
            const bPos = rankingText.indexOf(bLower);
            if (bPos >= 0 && bPos < brandPos) brandsBeforeCount++;
          }
          rank = brandsBeforeCount + 1;
        }
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

      // Issue-specific per-prompt metrics
      const isIssueType = runStatus.search_type === 'issue';
      const issueFramingMap: Record<string, string> = {
        strong_endorsement: 'Supportive', positive_endorsement: 'Leaning Supportive',
        neutral_mention: 'Balanced', conditional: 'Mixed', negative_comparison: 'Critical',
      };

      // Discussion polarity: supportive% vs critical%
      let issueSupportiveCount = 0;
      let issueCriticalCount = 0;
      let issueNeutralCount = 0;
      // Dominant framing per prompt
      const issueFramingCounts: Record<string, number> = {};
      // Platform consensus per prompt
      const issueProviderDominant: Record<string, string> = {};
      const issueProviderFramings: Record<string, Record<string, number>> = {};
      // Related issues per prompt
      const issueRelated = new Set<string>();

      if (isIssueType) {
        for (const r of promptResults) {
          const raw = r.brand_sentiment || 'neutral_mention';
          const label = issueFramingMap[raw] || 'Balanced';
          issueFramingCounts[label] = (issueFramingCounts[label] || 0) + 1;
          if (label === 'Supportive' || label === 'Leaning Supportive') issueSupportiveCount++;
          else if (label === 'Balanced') issueNeutralCount++;
          else issueCriticalCount++;

          // Per-provider framing
          if (!issueProviderFramings[r.provider]) issueProviderFramings[r.provider] = {};
          issueProviderFramings[r.provider][label] = (issueProviderFramings[r.provider][label] || 0) + 1;

          if (r.competitors_mentioned) {
            for (const c of r.competitors_mentioned) issueRelated.add(c);
          }
        }
        // Find each provider's dominant framing
        for (const [prov, counts] of Object.entries(issueProviderFramings)) {
          let best = ''; let bestC = 0;
          for (const [l, c] of Object.entries(counts)) { if (c > bestC) { bestC = c; best = l; } }
          issueProviderDominant[prov] = best;
        }
      }

      const issuePolarTotal = issueSupportiveCount + issueCriticalCount + issueNeutralCount;
      const issueSupportivePct = issuePolarTotal > 0 ? (issueSupportiveCount / issuePolarTotal) * 100 : 0;
      const issueCriticalPct = issuePolarTotal > 0 ? (issueCriticalCount / issuePolarTotal) * 100 : 0;

      // Dominant framing for this prompt
      let issueDominantFraming = 'Balanced';
      let maxFramingCount = 0;
      for (const [label, count] of Object.entries(issueFramingCounts)) {
        if (count > maxFramingCount) { maxFramingCount = count; issueDominantFraming = label; }
      }

      // Platform consensus for this prompt
      let issueConsensus = 5;
      const provCount = Object.keys(issueProviderDominant).length;
      if (provCount > 0) {
        const agreementCounts: Record<string, number> = {};
        for (const f of Object.values(issueProviderDominant)) agreementCounts[f] = (agreementCounts[f] || 0) + 1;
        const maxAgree = Math.max(...Object.values(agreementCounts));
        issueConsensus = Math.max(1, Math.min(10, Math.round((maxAgree / provCount) * 10)));
      }

      return {
        prompt,
        total,
        mentioned,
        visibilityScore,
        shareOfVoice,
        firstPositionRate,
        avgRank,
        avgSentimentScore,
        // Issue-specific
        issueSupportivePct,
        issueCriticalPct,
        issueDominantFraming,
        issueConsensus,
        issueRelatedCount: issueRelated.size,
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
    const isCategory = runStatus.search_type === 'category';

    const results = globallyFilteredResults.filter((r: Result) => {
      if (r.error) return false;
      if (brandBreakdownLlmFilter !== 'all' && r.provider !== brandBreakdownLlmFilter) return false;
      if (brandBreakdownPromptFilter !== 'all' && r.prompt !== brandBreakdownPromptFilter) return false;
      return true;
    });

    const searchedBrand = runStatus.brand;

    // Get all brands: searched brand + competitors (exclude category name for industry searches)
    const allBrands = new Set<string>(isCategory ? [] : [searchedBrand]);
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
        const rankingText = r.response_text ? getTextForRanking(r.response_text, r.provider).toLowerCase() : '';
        const brandPos = rankingText.indexOf(brandLower);
        let rank = allBrandsInResponse.length + 1;
        if (brandPos >= 0) {
          let brandsBeforeCount = 0;
          for (const b of allBrandsInResponse) {
            const bLower = b.toLowerCase();
            if (bLower === brandLower || bLower.includes(brandLower) || brandLower.includes(bLower)) continue;
            const bPos = rankingText.indexOf(bLower);
            if (bPos >= 0 && bPos < brandPos) brandsBeforeCount++;
          }
          rank = brandsBeforeCount + 1;
        }
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
    const isCategory = runStatus.search_type === 'category';

    const results = globallyFilteredResults.filter((r: Result) => {
      if (r.error) return false;
      if (brandPositioningLlmFilter !== 'all' && r.provider !== brandPositioningLlmFilter) return false;
      if (brandPositioningPromptFilter !== 'all' && r.prompt !== brandPositioningPromptFilter) return false;
      return true;
    });

    const searchedBrand = runStatus.brand;

    // Get all brands: searched brand + competitors (exclude category name for industry searches)
    const allBrands = new Set<string>(isCategory ? [] : [searchedBrand]);
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
    const isCategory = runStatus.search_type === 'category';

    const results = globallyFilteredResults.filter((r: Result) => {
      if (r.error) return false;
      if (promptMatrixLlmFilter !== 'all' && r.provider !== promptMatrixLlmFilter) return false;
      return true;
    });
    if (results.length === 0) return { brands: [], prompts: [], matrix: [] };

    const searchedBrand = runStatus.brand;
    const prompts = Array.from(new Set(results.map(r => r.prompt)));

    // Get all brands mentioned (exclude category name for industry searches)
    const allBrands = new Set<string>(isCategory ? [] : [searchedBrand]);
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
    const providerSet = new Set(results.map(r => r.provider));
    const providers = PROVIDER_ORDER.filter(p => providerSet.has(p)).concat(
      Array.from(providerSet).filter(p => !PROVIDER_ORDER.includes(p))
    );

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
    const isCategory = runStatus.search_type === 'category';

    const results = globallyFilteredResults.filter((r: Result) => !r.error);
    if (results.length === 0) return [];

    const searchedBrand = runStatus.brand;
    const cooccurrenceCounts: Record<string, { brand1: string; brand2: string; count: number }> = {};

    results.forEach(r => {
      // Get all brands mentioned in this response (exclude category name for industry searches)
      const brandsInResponse: string[] = [];
      if (!isCategory && r.brand_mentioned) brandsInResponse.push(searchedBrand);
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
          case 'grok': return 'Grok';
          case 'llama': return 'Llama';
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

    const formatDomainName = (domain: string) => {
      const names: Record<string, string> = {
        'youtube.com': 'YouTube',
        'youtu.be': 'YouTube',
        'reddit.com': 'Reddit',
        'wikipedia.org': 'Wikipedia',
        'en.wikipedia.org': 'Wikipedia',
        'linkedin.com': 'LinkedIn',
        'twitter.com': 'X (Twitter)',
        'x.com': 'X',
        'github.com': 'GitHub',
        'amazon.com': 'Amazon',
        'yelp.com': 'Yelp',
        'facebook.com': 'Facebook',
        'instagram.com': 'Instagram',
        'tiktok.com': 'TikTok',
        'pinterest.com': 'Pinterest',
      };
      return names[domain] || domain;
    };

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
      insights.push(`${formatDomainName(topSource.domain)} is the most frequently cited source (${topSource.count} citations across ${topSource.providers.length} ${topSource.providers.length === 1 ? 'model' : 'models'})`);
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
          case 'grok': return 'Grok';
          case 'llama': return 'Llama';
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
        strong_endorsement: 'Strong',
        positive_endorsement: 'Positive',
        neutral_mention: 'Neutral',
        conditional: 'Conditional',
        negative_comparison: 'Negative',
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
    grok: 'Grok',
    llama: 'Llama',
  };

  // Get unique providers in popularity order for X-axis
  const scatterProviderOrder = useMemo(() => {
    if (!runStatus) return [];
    const providers = new Set<string>();
    globallyFilteredResults.forEach((r: Result) => {
      if (!r.error) providers.add(r.provider);
    });
    return PROVIDER_ORDER.filter(p => providers.has(p));
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
          const textLower = getTextForRanking(result.response_text, result.provider).toLowerCase();
          const brandTextPos = textLower.indexOf(brandLower);
          const allBrands: string[] = result.all_brands_mentioned && result.all_brands_mentioned.length > 0
            ? result.all_brands_mentioned.filter((b): b is string => typeof b === 'string')
            : [...(runStatus.search_type === 'category' ? [] : [runStatus.brand]), ...(result.competitors_mentioned || [])].filter((b): b is string => typeof b === 'string');

          if (brandTextPos >= 0) {
            // Count how many other brands appear before the searched brand in the text
            let brandsBeforeCount = 0;
            for (const b of allBrands) {
              const bLower = b.toLowerCase();
              if (bLower === brandLower || bLower.includes(brandLower) || brandLower.includes(bLower)) continue;
              const bPos = textLower.indexOf(bLower);
              if (bPos >= 0 && bPos < brandTextPos) {
                brandsBeforeCount++;
              }
            }
            rank = brandsBeforeCount + 1;
          } else {
            // Brand is mentioned but we can't find its exact position in text
            rank = allBrands.length + 1;
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

    // Sort providers by popularity order, then map to chart data
    const sortedProviders = Object.values(providerStats).sort((a, b) => {
      const aIdx = PROVIDER_ORDER.indexOf(a.provider);
      const bIdx = PROVIDER_ORDER.indexOf(b.provider);
      return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
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

    // Average rank and top position count — only for results where brand is actually mentioned
    const ranks: number[] = [];
    let topPositionCount = 0;
    for (const result of results) {
      if (!result.response_text || !result.brand_mentioned) continue;

      const allBrands: string[] = result.all_brands_mentioned && result.all_brands_mentioned.length > 0
        ? result.all_brands_mentioned.filter((b): b is string => typeof b === 'string')
        : [...(runStatus.search_type === 'category' ? [] : [runStatus.brand]), ...(result.competitors_mentioned || [])].filter((b): b is string => typeof b === 'string');

      if (selectedBrand) {
        const brandLower = selectedBrand.toLowerCase();
        const rankingText = getTextForRanking(result.response_text, result.provider).toLowerCase();
        const brandPos = rankingText.indexOf(brandLower);
        if (brandPos >= 0) {
          let brandsBeforeCount = 0;
          for (const b of allBrands) {
            const bLower = b.toLowerCase();
            if (bLower === brandLower || bLower.includes(brandLower) || brandLower.includes(bLower)) continue;
            const bPos = rankingText.indexOf(bLower);
            if (bPos >= 0 && bPos < brandPos) brandsBeforeCount++;
          }
          const rank = brandsBeforeCount + 1;
          ranks.push(rank);
          if (rank === 1) topPositionCount++;
        } else {
          ranks.push(allBrands.length + 1);
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

    // Average brands surfaced per query (for industry reports)
    let totalBrandsAcrossResults = 0;
    let resultsWithBrands = 0;
    for (const result of results) {
      const brandCount = result.competitors_mentioned?.length || 0;
      if (brandCount > 0) {
        totalBrandsAcrossResults += brandCount;
        resultsWithBrands++;
      }
    }
    const avgBrandsPerQuery = resultsWithBrands > 0 ? totalBrandsAcrossResults / resultsWithBrands : 0;

    // Competitive Fragmentation Score (for industry reports)
    // Measures how evenly AI brand mentions are distributed.
    // Calibrated so typical AI category responses center around 5-6 on a 1-10 scale.
    let fragmentationScore = 5; // default mid-range
    const brandMentionCounts: Record<string, number> = {};
    for (const result of results) {
      if (result.competitors_mentioned) {
        for (const comp of result.competitors_mentioned) {
          brandMentionCounts[comp] = (brandMentionCounts[comp] || 0) + 1;
        }
      }
    }
    const mentionBrands = Object.keys(brandMentionCounts);
    const N = mentionBrands.length;
    if (N >= 2) {
      const totalMentionCount = Object.values(brandMentionCounts).reduce((a, b) => a + b, 0);
      const shares = mentionBrands.map(b => brandMentionCounts[b] / totalMentionCount);

      // Gini coefficient: measures inequality (0 = perfectly equal, 1 = max inequality)
      let diffSum = 0;
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          diffSum += Math.abs(shares[i] - shares[j]);
        }
      }
      const giniIndex = diffSum / (2 * N); // ranges 0 to ~(1 - 1/N)
      const maxGini = 1 - 1 / N;
      const normalizedGini = maxGini > 0 ? giniIndex / maxGini : 0; // 0 = equal, 1 = concentrated

      // Convert to spread score: 1 (concentrated) to 10 (spread out)
      // Use square root to expand the middle range and compress extremes
      const spread = 1 - normalizedGini; // 0 = concentrated, 1 = equal
      const calibrated = Math.pow(spread, 1.1); // exponent > 1 compresses upper end slightly

      fragmentationScore = Math.max(1, Math.min(10, Math.round(1 + 9 * calibrated)));
    } else if (N === 1) {
      fragmentationScore = 1;
    }

    // Issue-specific metrics
    const FRAMING_MAP: Record<string, string> = {
      strong_endorsement: 'Supportive',
      positive_endorsement: 'Leaning Supportive',
      neutral_mention: 'Balanced',
      conditional: 'Mixed',
      negative_comparison: 'Critical',
    };

    let dominantFraming = 'Balanced';
    let framingDistribution: Record<string, number> = {};
    let platformConsensus = 5;
    let relatedIssuesCount = 0;
    let topRelatedIssues: string[] = [];
    let framingByProvider: Record<string, Record<string, number>> = {};

    if (runStatus.search_type === 'issue') {
      // Build framing distribution from brand_sentiment
      const framingCounts: Record<string, number> = {};
      for (const result of results) {
        const raw = result.brand_sentiment || 'neutral_mention';
        const label = FRAMING_MAP[raw] || 'Balanced';
        framingCounts[label] = (framingCounts[label] || 0) + 1;
      }
      framingDistribution = framingCounts;

      // Dominant framing = most common label
      let maxCount = 0;
      for (const [label, count] of Object.entries(framingCounts)) {
        if (count > maxCount) {
          maxCount = count;
          dominantFraming = label;
        }
      }

      // Platform consensus: find each provider's dominant framing, check agreement
      const providerFramings: Record<string, Record<string, number>> = {};
      for (const result of results) {
        const provider = result.provider;
        if (!providerFramings[provider]) providerFramings[provider] = {};
        const raw = result.brand_sentiment || 'neutral_mention';
        const label = FRAMING_MAP[raw] || 'Balanced';
        providerFramings[provider][label] = (providerFramings[provider][label] || 0) + 1;
      }

      // framingByProvider for the stacked bar chart
      framingByProvider = providerFramings;

      // Find each provider's dominant framing
      const providerDominant: Record<string, string> = {};
      for (const [provider, counts] of Object.entries(providerFramings)) {
        let best = '';
        let bestCount = 0;
        for (const [label, count] of Object.entries(counts)) {
          if (count > bestCount) { bestCount = count; best = label; }
        }
        providerDominant[provider] = best;
      }

      // Count providers that agree on the same framing
      const providerCount = Object.keys(providerDominant).length;
      if (providerCount > 0) {
        const framingAgreement: Record<string, number> = {};
        for (const framing of Object.values(providerDominant)) {
          framingAgreement[framing] = (framingAgreement[framing] || 0) + 1;
        }
        const maxAgreement = Math.max(...Object.values(framingAgreement));
        platformConsensus = Math.max(1, Math.min(10, Math.round((maxAgreement / providerCount) * 10)));
      }

      // Related issues from competitors_mentioned, ranked by mention frequency
      const relatedIssueCounts: Record<string, number> = {};
      for (const result of results) {
        if (result.competitors_mentioned) {
          for (const comp of result.competitors_mentioned) {
            relatedIssueCounts[comp] = (relatedIssueCounts[comp] || 0) + 1;
          }
        }
      }
      relatedIssuesCount = Object.keys(relatedIssueCounts).length;
      topRelatedIssues = Object.entries(relatedIssueCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name]) => name);

    }

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
      avgBrandsPerQuery,
      resultsWithBrands,
      fragmentationScore,
      fragmentationBrandCount: N,
      // Issue-specific fields
      dominantFraming,
      framingDistribution,
      platformConsensus,
      relatedIssuesCount,
      topRelatedIssues,
      framingByProvider,
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
      .filter((r: Result) => !r.error || r.provider === 'ai_overviews')
      .map((r: Result) => {
        // Calculate rank based on first text appearance
        let rank = '';
        if (r.response_text && r.brand_mentioned) {
          const brandLower = runStatus.brand.toLowerCase();
          const textLower = getTextForRanking(r.response_text, r.provider).toLowerCase();
          const brandTextPos = textLower.indexOf(brandLower);
          const allBrands: string[] = r.all_brands_mentioned && r.all_brands_mentioned.length > 0
            ? r.all_brands_mentioned.filter((b): b is string => typeof b === 'string')
            : [runStatus.brand, ...(r.competitors_mentioned || [])].filter((b): b is string => typeof b === 'string');

          if (brandTextPos >= 0) {
            let brandsBeforeCount = 0;
            for (const b of allBrands) {
              const bLower = b.toLowerCase();
              if (bLower === brandLower || bLower.includes(brandLower) || brandLower.includes(bLower)) continue;
              const bPos = textLower.indexOf(bLower);
              if (bPos >= 0 && bPos < brandTextPos) {
                brandsBeforeCount++;
              }
            }
            rank = String(brandsBeforeCount + 1);
          } else {
            rank = String(allBrands.length + 1);
          }
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

          const rankingText = getTextForRanking(r.response_text, r.provider).toLowerCase();
          const brandPos = rankingText.indexOf(brandLower);
          if (brandPos >= 0) {
            let brandsBeforeCount = 0;
            for (const b of allBrands) {
              const bLower = b.toLowerCase();
              if (bLower === brandLower || bLower.includes(brandLower) || brandLower.includes(bLower)) continue;
              const bPos = rankingText.indexOf(bLower);
              if (bPos >= 0 && bPos < brandPos) brandsBeforeCount++;
            }
            rank = brandsBeforeCount + 1;
          } else {
            rank = allBrands.length + 1;
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
          `"${(r.response_text || '').replace(/\*?\*?\[People Also Ask\]\*?\*?/g, '').replace(/[\r\n]+/g, ' ').replace(/"/g, '""')}"`,
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
      if (impact === 'low' && effort === 'low') return 'Low Priority';
      if (impact === 'low' && effort === 'high') return 'Avoid';
      return 'Consider';
    };

    // Build PDF directly with jsPDF (no html2canvas dependency)
    import('jspdf').then((jsPDFModule) => {
      const jsPDF = jsPDFModule.default;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 20;
      const contentWidth = pageWidth - margin * 2;
      let y = margin;

      const checkPageBreak = (needed: number) => {
        if (y + needed > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }
      };

      // Title
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(17, 24, 39);
      doc.text('AI Visibility Recommendations', margin, y);
      y += 8;

      // Subtitle
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(107, 114, 128);
      doc.text(`${runStatus.brand} — Generated ${new Date().toLocaleDateString()}`, margin, y);
      y += 12;

      // Recommendations
      recommendations.forEach((rec, idx) => {
        checkPageBreak(40);

        // Rec title
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(17, 24, 39);
        const titleLines = doc.splitTextToSize(`${idx + 1}. ${rec.title}`, contentWidth);
        doc.text(titleLines, margin, y);
        y += titleLines.length * 6 + 2;

        // Description
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(75, 85, 99);
        const descLines = doc.splitTextToSize(rec.description, contentWidth);
        checkPageBreak(descLines.length * 5);
        doc.text(descLines, margin, y);
        y += descLines.length * 5 + 3;

        // Meta badges
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        const quadrant = getQuadrantName(rec.impact, rec.effort);
        doc.setTextColor(107, 114, 128);
        doc.text(`Impact: ${rec.impact}  •  Effort: ${rec.effort}  •  ${quadrant}`, margin, y);
        y += 6;

        // Tactics
        if (rec.tactics.length > 0) {
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(107, 114, 128);
          doc.text('Tactics:', margin, y);
          y += 5;

          doc.setFont('helvetica', 'normal');
          doc.setTextColor(75, 85, 99);
          rec.tactics.forEach((t) => {
            checkPageBreak(6);
            const tacticLines = doc.splitTextToSize(`•  ${t}`, contentWidth - 5);
            doc.text(tacticLines, margin + 3, y);
            y += tacticLines.length * 4.5 + 1;
          });
        }

        // Separator line
        y += 3;
        checkPageBreak(4);
        doc.setDrawColor(229, 231, 235);
        doc.setLineWidth(0.3);
        doc.line(margin, y, pageWidth - margin, y);
        y += 8;
      });

      // Footer
      checkPageBreak(10);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(156, 163, 175);
      doc.text('Generated by AI Visibility Tracker', margin, y);

      doc.save(`recommendations-${runStatus.brand}-${new Date().toISOString().split('T')[0]}.pdf`);
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
        rec.impact === 'low' && rec.effort === 'low' ? 'Low Priority' :
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
  const isIssue = runStatus?.search_type === 'issue';

  const getMentionRateColor = (rate: number) => {
    if (rate >= 0.7) return 'text-emerald-700';
    if (rate >= 0.4) return 'text-amber-600';
    return 'text-red-500';
  };

  const getMentionRateBgColor = (_rate: number, provider?: string) => {
    // Use platform brand color if provider is specified
    if (provider) return '';
    return 'bg-gray-400';
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
    if (score >= 4.5) return 'Strong';
    if (score >= 3.5) return 'Positive';
    if (score >= 2.5) return 'Neutral';
    if (score >= 1.5) return 'Conditional';
    return 'Negative';
  };

  // KPI Interpretation types and helper
  type InterpretationTone = 'success' | 'neutral' | 'warn';

  interface KPIInterpretation {
    label: string;
    tone: InterpretationTone;
    tooltip?: string;
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

  const getToneStyles = (tone: InterpretationTone): string => {
    switch (tone) {
      case 'success':
        return 'bg-gray-100 text-gray-900';
      case 'warn':
        return 'bg-orange-100 text-orange-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  // Get donut arc color based on percentage value
  const getArcColorByValue = (value: number): string => {
    if (value >= 80) return '#047857'; // emerald-700
    if (value >= 60) return '#10b981'; // emerald-500
    if (value >= 40) return '#eab308'; // yellow-500
    if (value >= 20) return '#f97316'; // orange-500
    return '#ef4444'; // red-500
  };

  // Get card background tint based on performance tone
  const getCardBackground = (_tone: InterpretationTone): string => {
    return 'bg-gradient-to-br from-orange-50 to-white';
  };

  // Per-metric card backgrounds — distinct from insight box colors
  // (insight boxes use: blue, purple, teal, amber)
  const metricCardBackgrounds: Record<string, string> = {
    visibility: 'bg-gradient-to-br from-rose-50 to-white border-rose-100',
    shareOfVoice: 'bg-gradient-to-br from-sky-50 to-white border-sky-100',
    top1Rate: 'bg-gradient-to-br from-violet-50 to-white border-violet-100',
    avgPosition: 'bg-gradient-to-br from-orange-50 to-white border-orange-100',
  };

  const getProviderShortLabel = (provider: string) => {
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
        .sort((a, b) => {
          const aIdx = PROVIDER_ORDER.indexOf(a.provider);
          const bIdx = PROVIDER_ORDER.indexOf(b.provider);
          return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
        });

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

  // Fetch AI-generated brand characterization blurbs
  const brandBlurbsContext = runStatus
    ? `${runStatus.search_type === 'category' ? 'category' : 'brand'} analysis for ${runStatus.brand}`
    : '';
  const { data: brandBlurbsData } = useBrandBlurbs(
    allBrandsAnalysisData.map(b => b.brand),
    brandBlurbsContext,
    allBrandsAnalysisData.length > 0 && runStatus?.status === 'complete'
  );
  const brandBlurbs = brandBlurbsData?.blurbs ?? {};

  // Extract candidate quotes mentioning each brand from LLM responses (up to 6 per brand for GPT filtering)
  const candidateQuotesMap = useMemo(() => {
    if (!runStatus) return {} as Record<string, BrandQuote[]>;
    const results = globallyFilteredResults.filter(r => r.response_text && !r.error);
    const searchedBrand = runStatus.brand;
    const allBrands = brandBreakdownStats.map(b => b.brand);

    const map: Record<string, BrandQuote[]> = {};

    for (const brand of allBrands) {
      const isSearched = brand === searchedBrand;
      const relevant = results.filter(r =>
        isSearched ? r.brand_mentioned : r.competitors_mentioned?.includes(brand)
      );

      const allQuotes: BrandQuote[] = [];
      relevant.forEach(r => {
        const text = stripMarkdown(r.response_text!);
        const sentences = text.split(/(?<=[.!?])\s+/);
        for (const sentence of sentences) {
          const trimmed = sentence.trim();
          if (
            trimmed.toLowerCase().includes(brand.toLowerCase()) &&
            trimmed.length >= 40 &&
            trimmed.length <= 300 &&
            // Basic filters for obviously broken content
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

      // Deduplicate by text similarity, keep up to 6 diverse candidates for GPT to pick from
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
      // First pass: one per provider
      for (const q of allQuotes) {
        if (selected.length >= 6) break;
        if (usedProviders.has(q.provider)) continue;
        if (isTooSimilar(q)) continue;
        selected.push(q);
        usedProviders.add(q.provider);
      }
      // Second pass: fill remaining
      for (const q of allQuotes) {
        if (selected.length >= 6) break;
        if (selected.some(s => s.text === q.text)) continue;
        if (isTooSimilar(q)) continue;
        selected.push(q);
      }

      map[brand] = selected;
    }

    return map;
  }, [runStatus, globallyFilteredResults, brandBreakdownStats]);

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
  const totalCost = totalBackendCost + frontendInsightsCost;

  // Visibility tab uses quotes for the searched brand
  const brandQuotes = brandQuotesMap[runStatus?.brand ?? ''] ?? [];

  // Position categories for the dot plot chart
  const POSITION_CATEGORIES = ['Top', '2-3', '4-5', '6-10', '>10', 'Not Mentioned'];

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
        category = 'Not Mentioned';
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
        return '#047857'; // emerald-700 - Strong
      case 'positive_endorsement':
        return '#10b981'; // emerald-500 - Positive
      case 'neutral_mention':
        return '#9ca3af'; // gray-400 - Neutral
      case 'conditional':
        return '#fbbf24'; // amber-400 - Conditional
      case 'negative_comparison':
        return '#ef4444'; // red-500 - Negative
      case 'not_mentioned':
        return '#d1d5db'; // gray-300 - Not mentioned
      default:
        return '#9ca3af'; // gray for unknown
    }
  };

  // Get platform brand color
  const getProviderBrandColor = (provider: string): string => {
    switch (provider.toLowerCase()) {
      case 'openai':
        return '#10a37f'; // ChatGPT teal
      case 'anthropic':
        return '#d97706'; // Claude orange
      case 'gemini':
        return '#4285f4'; // Google blue
      case 'perplexity':
        return '#20b8cd'; // Perplexity teal
      case 'grok':
        return '#1d9bf0'; // xAI blue
      case 'llama':
        return '#8b5cf6'; // Meta purple
      case 'ai_overviews':
        return '#FBBC04'; // Google yellow
      default:
        return '#6b7280'; // gray fallback
    }
  };

  const getProviderIcon = (provider: string) => {
    const color = getProviderBrandColor(provider);
    switch (provider.toLowerCase()) {
      case 'openai':
        return (
          <svg className="w-4 h-4" style={{ color }} viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.896zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08-4.778 2.758a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/>
          </svg>
        );
      case 'anthropic':
        return (
          <svg className="w-4 h-4" style={{ color }} viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
          </svg>
        );
      case 'gemini':
        return (
          <svg className="w-4 h-4" style={{ color }} viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
        );
      case 'perplexity':
        return (
          <svg className="w-4 h-4" style={{ color }} viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 15h-2v-2h2zm0-4h-2V7h2z"/>
          </svg>
        );
      case 'grok':
        return (
          <svg className="w-4 h-4" style={{ color }} viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
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
                        <span className="flex justify-between mb-1"><span>AI queries</span><span className="font-medium">{formatCurrency(promptCost)}</span></span>
                        <span className="flex justify-between mb-1"><span>Analysis & sentiment</span><span className="font-medium">{formatCurrency(analysisCost)}</span></span>
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
          <SectionGuide activeTab={activeTab} />
          <div className="flex-1 min-w-0">
        <ResultsProvider
          data={{
            runStatus: runStatus ?? null,
            globallyFilteredResults,
            availableProviders,
            availableBrands,
            availablePrompts,
            trackedBrands,
            isCategory,
            isIssue,
            searchType: (runStatus?.search_type || 'brand') as any,
            searchTypeConfig: getSearchTypeConfig((runStatus?.search_type || 'brand') as any),
            brandMentionRate,
            aiSummary,
            isSummaryLoading,
            brandBreakdownStats,
            llmBreakdownStats,
            llmBreakdownBrands,
            promptBreakdownStats,
            shareOfVoiceData,
            allBrandsAnalysisData,
            brandQuotesMap,
            overviewMetrics,
            scatterPlotData,
            rangeChartData,
            rangeViewDots,
            scatterProviderOrder,
            topCitedSources,
            keyInfluencers,
            sourcesInsights,
            sentimentInsights,
            hasAnySources,
            llmBreakdownBrandFilter,
            setLlmBreakdownBrandFilter,
            promptBreakdownLlmFilter,
            setPromptBreakdownLlmFilter,
          }}
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
            <OverviewTab
              aiSummaryExpanded={aiSummaryExpanded}
              setAiSummaryExpanded={setAiSummaryExpanded}
              showSentimentColors={showSentimentColors}
              setShowSentimentColors={setShowSentimentColors}
              chartTab={chartTab}
              setChartTab={setChartTab}
              providerFilter={providerFilter}
              setProviderFilter={setProviderFilter}
              brandBlurbs={brandBlurbs}
              setCopied={setCopied}
              accessLevel={sectionAccess['overview']}
              visibleSections={['metrics', 'ai-summary', 'framing-comparison', 'framing-spectrum', 'framing-evidence', 'prompt-breakdown', 'all-results']}
            />
          ) : (
            <OverviewTab
              aiSummaryExpanded={aiSummaryExpanded}
              setAiSummaryExpanded={setAiSummaryExpanded}
              showSentimentColors={showSentimentColors}
              setShowSentimentColors={setShowSentimentColors}
              chartTab={chartTab}
              setChartTab={setChartTab}
              providerFilter={providerFilter}
              setProviderFilter={setProviderFilter}
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
                promptCost={promptCost}
                analysisCost={analysisCost}
                frontendInsightsCost={frontendInsightsCost}
                chartTab={chartTab}
                setChartTab={setChartTab}
                showSentimentColors={showSentimentColors}
                setShowSentimentColors={setShowSentimentColors}
                aiSummaryExpanded={aiSummaryExpanded}
                setAiSummaryExpanded={setAiSummaryExpanded}
                providerFilter={providerFilter}
                setProviderFilter={setProviderFilter}
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
              providerFilter={providerFilter}
              setProviderFilter={setProviderFilter}
              brandBlurbs={brandBlurbs}
              setCopied={setCopied}
              accessLevel={sectionAccess['overview']}
              visibleSections={['metrics', 'ai-summary']}
            />
            {/* Competitive sections: cards, insights, breakdown, positioning, matrix, co-occurrence (pairs only) */}
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
              providerFilter={providerFilter}
              setProviderFilter={setProviderFilter}
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
              providerFilter={providerFilter}
              setProviderFilter={setProviderFilter}
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
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <span className="flex-shrink-0">{getProviderIcon(selectedResult.provider)}</span>
                  {getProviderLabel(selectedResult.provider)}
                </h2>
                <p className="text-sm text-gray-500">
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
