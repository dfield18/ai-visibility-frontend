'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import {
  Download,
  Link2,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Lightbulb,
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
import { Result, Source } from '@/lib/types';
import { useResults, useResultsUI } from './ResultsContext';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROVIDER_ORDER = ['openai', 'gemini', 'anthropic', 'perplexity', 'grok', 'llama', 'ai_overviews'];

const CATEGORY_COLORS: Record<string, string> = {
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
  'Other': '#d1d5db',
};

// ---------------------------------------------------------------------------
// Helpers (duplicated from page.tsx since they are not yet in a shared module)
// ---------------------------------------------------------------------------

const categorizeDomain = (domain: string): string => {
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

const getDomain = (url: string): string => {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
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

const getProviderBrandColor = (provider: string): string => {
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BrandQuote {
  text: string;
  summary?: string;
  provider: string;
  prompt: string;
}

interface AllBrandsAnalysisEntry {
  brand: string;
  isSearchedBrand: boolean;
  visibilityScore: number;
  providerScores: { provider: string; score: number }[];
  comparisonRatio: number;
  avgSentimentScore: number | null;
}

export interface CompetitiveTabProps {
  setSelectedResultHighlight: (val: { brand: string; domain?: string } | null) => void;
  setHeatmapResultsList: (val: { results: Result[]; domain: string; brand: string } | null) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CompetitiveTab({
  setSelectedResultHighlight,
  setHeatmapResultsList,
}: CompetitiveTabProps) {

  // ---- Context ----
  const { runStatus, globallyFilteredResults, availableProviders, availablePrompts, brandBreakdownStats, allBrandsAnalysisData, brandQuotesMap } = useResults();
  const { copied, handleCopyLink, setSelectedResult } = useResultsUI();

  // ---- Internalized state ----
  const [brandBreakdownLlmFilter, setBrandBreakdownLlmFilter] = useState<string>('all');
  const [brandBreakdownPromptFilter, setBrandBreakdownPromptFilter] = useState<string>('all');
  const [expandedBrandBreakdownRows, setExpandedBrandBreakdownRows] = useState<Set<string>>(new Set());
  const [brandPositioningLlmFilter, setBrandPositioningLlmFilter] = useState<string>('all');
  const [brandPositioningPromptFilter, setBrandPositioningPromptFilter] = useState<string>('all');
  const [promptMatrixLlmFilter, setPromptMatrixLlmFilter] = useState<string>('all');
  const [cooccurrenceView, setCooccurrenceView] = useState<'pairs' | 'venn'>('venn');
  const [heatmapProviderFilter, setHeatmapProviderFilter] = useState<string>('all');
  const [heatmapShowSentiment, setHeatmapShowSentiment] = useState<boolean>(false);
  const [brandCarouselIndex, setBrandCarouselIndex] = useState(0);
  const [providerScrollIndex, setProviderScrollIndex] = useState<Record<string, number>>({});

  // ---- Internalized useMemos ----

  // Brand Positioning Stats
  const brandPositioningStats = useMemo(() => {
    if (!runStatus) return [];
    const results = globallyFilteredResults.filter((r: Result) => {
      if (r.error) return false;
      if (brandPositioningLlmFilter !== 'all' && r.provider !== brandPositioningLlmFilter) return false;
      if (brandPositioningPromptFilter !== 'all' && r.prompt !== brandPositioningPromptFilter) return false;
      return true;
    });
    const searchedBrand = runStatus.brand;
    const allBrands = new Set<string>([searchedBrand]);
    results.forEach(r => { if (r.competitors_mentioned) r.competitors_mentioned.forEach(c => allBrands.add(c)); });
    const sentimentScoreMap: Record<string, number> = {
      'strong_endorsement': 5, 'positive_endorsement': 4, 'neutral_mention': 3, 'conditional': 2, 'negative_comparison': 1, 'not_mentioned': 0,
    };
    const brandStats = Array.from(allBrands).map(brand => {
      const isSearchedBrand = brand === searchedBrand;
      const total = results.length;
      const mentioned = results.filter(r => {
        if (isSearchedBrand) return r.brand_mentioned;
        return r.competitors_mentioned?.includes(brand);
      }).length;
      const visibilityScore = total > 0 ? (mentioned / total) * 100 : 0;
      const sentimentResults = results.filter(r => {
        if (isSearchedBrand) return r.brand_mentioned && r.brand_sentiment && r.brand_sentiment !== 'not_mentioned';
        return r.competitors_mentioned?.includes(brand) && r.competitor_sentiments?.[brand] && r.competitor_sentiments[brand] !== 'not_mentioned';
      });
      let avgSentimentScore: number | null = null;
      if (sentimentResults.length > 0) {
        const sentimentSum = sentimentResults.reduce((sum, r) => {
          if (isSearchedBrand) return sum + (sentimentScoreMap[r.brand_sentiment || ''] || 0);
          return sum + (sentimentScoreMap[r.competitor_sentiments?.[brand] || ''] || 0);
        }, 0);
        avgSentimentScore = sentimentSum / sentimentResults.length;
      }
      return { brand, isSearchedBrand, mentioned, visibilityScore, avgSentimentScore };
    });
    return brandStats.sort((a, b) => b.visibilityScore - a.visibilityScore);
  }, [runStatus, globallyFilteredResults, brandPositioningLlmFilter, brandPositioningPromptFilter]);

  // Prompt Performance Matrix
  const promptPerformanceMatrix = useMemo(() => {
    if (!runStatus) return { brands: [] as string[], prompts: [] as string[], matrix: [] as number[][] };
    const results = globallyFilteredResults.filter((r: Result) => {
      if (r.error) return false;
      if (promptMatrixLlmFilter !== 'all' && r.provider !== promptMatrixLlmFilter) return false;
      return true;
    });
    if (results.length === 0) return { brands: [] as string[], prompts: [] as string[], matrix: [] as number[][] };
    const searchedBrand = runStatus.brand;
    const prompts = Array.from(new Set(results.map(r => r.prompt)));
    const allBrands = new Set<string>([searchedBrand]);
    results.forEach(r => { if (r.competitors_mentioned) r.competitors_mentioned.forEach(c => allBrands.add(c)); });
    const brands = Array.from(allBrands);
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

  // Model Preference Data
  const modelPreferenceData = useMemo(() => {
    if (!runStatus) return [];
    const results = globallyFilteredResults.filter((r: Result) => !r.error);
    if (results.length === 0) return [];
    const searchedBrand = runStatus.brand;
    const providerSet = new Set(results.map(r => r.provider));
    const providers = PROVIDER_ORDER.filter(p => providerSet.has(p)).concat(
      Array.from(providerSet).filter(p => !PROVIDER_ORDER.includes(p))
    );
    const brandCounts: Record<string, number> = { [searchedBrand]: 0 };
    results.forEach(r => {
      if (r.brand_mentioned) brandCounts[searchedBrand]++;
      if (r.competitors_mentioned) r.competitors_mentioned.forEach(c => { brandCounts[c] = (brandCounts[c] || 0) + 1; });
    });
    const topBrands = Object.entries(brandCounts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([brand]) => brand);
    return providers.map(provider => {
      const providerResults = results.filter(r => r.provider === provider);
      const brandRates: Record<string, number> = {};
      topBrands.forEach(brand => {
        const isSearchedBrand = brand === searchedBrand;
        const mentioned = providerResults.filter(r => { if (isSearchedBrand) return r.brand_mentioned; return r.competitors_mentioned?.includes(brand); }).length;
        brandRates[brand] = providerResults.length > 0 ? (mentioned / providerResults.length) * 100 : 0;
      });
      return { provider, ...brandRates };
    });
  }, [runStatus, globallyFilteredResults]);

  // Brand Co-occurrence
  const brandCooccurrence = useMemo(() => {
    if (!runStatus) return [];
    const results = globallyFilteredResults.filter((r: Result) => !r.error);
    if (results.length === 0) return [];
    const searchedBrand = runStatus.brand;
    const cooccurrenceCounts: Record<string, { brand1: string; brand2: string; count: number }> = {};
    results.forEach(r => {
      const brandsInResponse: string[] = [];
      if (r.brand_mentioned) brandsInResponse.push(searchedBrand);
      if (r.competitors_mentioned) r.competitors_mentioned.forEach(c => brandsInResponse.push(c));
      for (let i = 0; i < brandsInResponse.length; i++) {
        for (let j = i + 1; j < brandsInResponse.length; j++) {
          const brand1 = brandsInResponse[i];
          const brand2 = brandsInResponse[j];
          const key = [brand1, brand2].sort().join('|||');
          if (!cooccurrenceCounts[key]) cooccurrenceCounts[key] = { brand1, brand2, count: 0 };
          cooccurrenceCounts[key].count++;
        }
      }
    });
    return Object.values(cooccurrenceCounts)
      .map(item => ({ brand1: item.brand1, brand2: item.brand2, count: item.count, percentage: (item.count / results.length) * 100 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [runStatus, globallyFilteredResults]);

  // Competitive Insights
  const competitiveInsights = useMemo(() => {
    if (!runStatus || brandBreakdownStats.length === 0) return [];
    const insights: string[] = [];
    const searchedBrand = runStatus.brand;
    const searchedBrandStats = brandBreakdownStats.find((s: any) => s.isSearchedBrand);
    const competitors = brandBreakdownStats.filter((s: any) => !s.isSearchedBrand);
    if (!searchedBrandStats) return [];
    const visibilityRank = brandBreakdownStats.findIndex((s: any) => s.isSearchedBrand) + 1;
    if (visibilityRank === 1) {
      insights.push(`${searchedBrand} leads in AI visibility with ${searchedBrandStats.visibilityScore.toFixed(0)}% mention rate`);
    } else if (visibilityRank <= 3) {
      const leader = brandBreakdownStats[0];
      insights.push(`${searchedBrand} ranks #${visibilityRank} in visibility (${searchedBrandStats.visibilityScore.toFixed(0)}%), behind ${leader.brand} (${leader.visibilityScore.toFixed(0)}%)`);
    } else {
      insights.push(`${searchedBrand} has low visibility at ${searchedBrandStats.visibilityScore.toFixed(0)}%, ranking #${visibilityRank} of ${brandBreakdownStats.length} brands`);
    }
    if (searchedBrandStats.avgSentimentScore !== null) {
      const betterSentimentCompetitors = competitors.filter((c: any) => c.avgSentimentScore !== null && c.avgSentimentScore > searchedBrandStats.avgSentimentScore!);
      if (betterSentimentCompetitors.length === 0) {
        insights.push(`${searchedBrand} has the most positive sentiment among all tracked brands`);
      } else if (betterSentimentCompetitors.length <= 2) {
        insights.push(`${betterSentimentCompetitors.map((c: any) => c.brand).join(' and ')} ${betterSentimentCompetitors.length === 1 ? 'has' : 'have'} better sentiment than ${searchedBrand}`);
      }
    }
    if (searchedBrandStats.firstPositionRate > 0) {
      const topPositionLeader = [...brandBreakdownStats].sort((a: any, b: any) => b.firstPositionRate - a.firstPositionRate)[0];
      if (topPositionLeader.isSearchedBrand) {
        insights.push(`${searchedBrand} wins the #1 position ${searchedBrandStats.firstPositionRate.toFixed(0)}% of the time - more than any competitor`);
      } else {
        insights.push(`${topPositionLeader.brand} leads in #1 positions (${topPositionLeader.firstPositionRate.toFixed(0)}%) vs ${searchedBrand} (${searchedBrandStats.firstPositionRate.toFixed(0)}%)`);
      }
    }
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
      modelPreferenceData.forEach((data: any) => {
        const rate = (data as Record<string, string | number>)[searchedBrand] as number || 0;
        if (rate > bestRate) { bestRate = rate; bestModel = data.provider; }
        if (rate < worstRate) { worstRate = rate; worstModel = data.provider; }
      });
      if (bestModel && worstModel && bestModel !== worstModel && (bestRate - worstRate) > 10) {
        insights.push(`${searchedBrand} performs best on ${formatModelName(bestModel)} (${bestRate.toFixed(0)}%) and worst on ${formatModelName(worstModel)} (${worstRate.toFixed(0)}%)`);
      }
    }
    if (brandCooccurrence.length > 0) {
      const topCooccurrence = brandCooccurrence.find((c: any) => c.brand1 === searchedBrand || c.brand2 === searchedBrand);
      if (topCooccurrence) {
        const otherBrand = topCooccurrence.brand1 === searchedBrand ? topCooccurrence.brand2 : topCooccurrence.brand1;
        insights.push(`${searchedBrand} is most often mentioned alongside ${otherBrand} (${topCooccurrence.count} times)`);
      }
    }
    return insights.slice(0, 5);
  }, [runStatus, brandBreakdownStats, modelPreferenceData, brandCooccurrence]);

  // Brand-Source Heatmap
  const brandSourceHeatmap = useMemo(() => {
    if (!runStatus) return { brands: [] as string[], sources: [] as string[], data: [] as Array<{ domain: string; total: number; [key: string]: string | number }>, brandTotals: {} as Record<string, number>, searchedBrand: '', sentimentData: {} as Record<string, Record<string, { total: number; sum: number; avg: number }>> };
    const sourceBrandCounts: Record<string, Record<string, number>> = {};
    const sourceBrandSentiments: Record<string, Record<string, { total: number; sum: number }>> = {};
    const brandTotalMentions: Record<string, number> = {};
    const results = globallyFilteredResults.filter((r: Result) => {
      if (r.error || !r.sources || r.sources.length === 0) return false;
      if (heatmapProviderFilter !== 'all' && r.provider !== heatmapProviderFilter) return false;
      return true;
    });
    for (const result of results) {
      if (!result.sources) continue;
      const brandsInResult: Array<{ brand: string; sentiment: string | null }> = [];
      if (result.brand_mentioned && runStatus.brand) brandsInResult.push({ brand: runStatus.brand, sentiment: result.brand_sentiment });
      if (result.competitors_mentioned) result.competitors_mentioned.forEach(comp => { brandsInResult.push({ brand: comp, sentiment: result.competitor_sentiments?.[comp] || null }); });
      brandsInResult.forEach(({ brand }) => { brandTotalMentions[brand] = (brandTotalMentions[brand] || 0) + 1; });
      if (brandsInResult.length === 0) continue;
      const seenDomainBrandPairs = new Set<string>();
      for (const source of result.sources) {
        if (!source.url) continue;
        const domain = getDomain(source.url);
        if (!sourceBrandCounts[domain]) { sourceBrandCounts[domain] = {}; sourceBrandSentiments[domain] = {}; }
        brandsInResult.forEach(({ brand, sentiment }) => {
          const pairKey = `${domain}:${brand}`;
          if (!seenDomainBrandPairs.has(pairKey)) {
            seenDomainBrandPairs.add(pairKey);
            sourceBrandCounts[domain][brand] = (sourceBrandCounts[domain][brand] || 0) + 1;
            if (!sourceBrandSentiments[domain][brand]) sourceBrandSentiments[domain][brand] = { total: 0, sum: 0 };
            if (sentiment && sentimentScores[sentiment] !== undefined) {
              sourceBrandSentiments[domain][brand].total += 1;
              sourceBrandSentiments[domain][brand].sum += sentimentScores[sentiment];
            }
          }
        });
      }
    }
    const topSources = Object.entries(sourceBrandCounts)
      .map(([domain, brands]) => ({ domain, total: Object.values(brands).reduce((sum, count) => sum + count, 0), brands }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);
    const searchedBrand = runStatus.brand;
    const brandList = Object.keys(brandTotalMentions).sort((a, b) => {
      if (a === searchedBrand) return -1;
      if (b === searchedBrand) return 1;
      return brandTotalMentions[b] - brandTotalMentions[a];
    });
    const heatmapData: Array<{ domain: string; total: number; [key: string]: string | number }> = topSources.map(source => ({
      domain: source.domain, total: source.total,
      ...brandList.reduce((acc, brand) => { acc[brand] = source.brands[brand] || 0; return acc; }, {} as Record<string, number>),
    }));
    const sentimentData: Record<string, Record<string, { total: number; sum: number; avg: number }>> = {};
    topSources.forEach(source => {
      sentimentData[source.domain] = {};
      brandList.forEach(brand => {
        const data = sourceBrandSentiments[source.domain]?.[brand];
        if (data && data.total > 0) { sentimentData[source.domain][brand] = { ...data, avg: data.sum / data.total }; }
        else { sentimentData[source.domain][brand] = { total: 0, sum: 0, avg: 0 }; }
      });
    });
    return { brands: brandList, sources: topSources.map(s => s.domain), data: heatmapData, brandTotals: brandTotalMentions, searchedBrand, sentimentData };
  }, [runStatus, globallyFilteredResults, heatmapProviderFilter]);

  // ---- Internalized callbacks ----

  const handleHeatmapCellClick = useCallback((domain: string, brand: string) => {
    if (!runStatus) return;
    const matchingResults = globallyFilteredResults.filter((result: Result) => {
      if (result.error || !result.sources || result.sources.length === 0) return false;
      if (heatmapProviderFilter !== 'all' && result.provider !== heatmapProviderFilter) return false;
      const brandMentioned = brand === runStatus.brand ? result.brand_mentioned : result.competitors_mentioned?.includes(brand);
      if (!brandMentioned) return false;
      const hasMatchingSource = result.sources.some((source: Source) => { if (!source.url) return false; return getDomain(source.url) === domain; });
      return hasMatchingSource;
    });
    if (matchingResults.length === 1) {
      setSelectedResult(matchingResults[0]);
      setSelectedResultHighlight({ brand, domain });
    } else if (matchingResults.length > 1) {
      setHeatmapResultsList({ results: matchingResults, domain, brand });
    }
  }, [runStatus, globallyFilteredResults, heatmapProviderFilter, setSelectedResult, setSelectedResultHighlight, setHeatmapResultsList]);

  const handleExportHeatmapCSV = useCallback(() => {
    if (!brandSourceHeatmap.sources.length || !runStatus) return;

    // Build headers: Source, then for each brand: count/sentiment + response
    const headers = ['Source'];
    brandSourceHeatmap.brands.forEach(brand => {
      headers.push(heatmapShowSentiment ? `${brand} (Sentiment)` : `${brand} (Citations)`);
      headers.push(`${brand} (Responses)`);
    });

    // Helper to find matching results for a domain+brand pair
    const getResponsesForCell = (domain: string, brand: string): string => {
      const matching = globallyFilteredResults.filter((result: Result) => {
        if (result.error || !result.sources || result.sources.length === 0) return false;
        if (heatmapProviderFilter !== 'all' && result.provider !== heatmapProviderFilter) return false;
        const brandMentioned = brand === runStatus.brand ? result.brand_mentioned : result.competitors_mentioned?.includes(brand);
        if (!brandMentioned) return false;
        return result.sources.some((source: Source) => source.url && getDomain(source.url) === domain);
      });
      return matching
        .map(r => (r.response_text || '').replace(/\*?\*?\[People Also Ask\]\*?\*?/g, '').replace(/[\r\n]+/g, ' ').trim())
        .filter(t => t.length > 0)
        .join(' ||| ');
    };

    const rows = brandSourceHeatmap.data.map(row => {
      const values = [row.domain as string];
      brandSourceHeatmap.brands.forEach(brand => {
        if (heatmapShowSentiment) {
          const sentimentInfo = brandSourceHeatmap.sentimentData[row.domain as string]?.[brand];
          values.push(sentimentInfo?.avg ? sentimentInfo.avg.toFixed(2) : '0');
        } else {
          values.push(String(row[brand] || 0));
        }
        values.push(getResponsesForCell(row.domain as string, brand));
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
  }, [brandSourceHeatmap, heatmapShowSentiment, runStatus, globallyFilteredResults, heatmapProviderFilter]);

  // ---- Render ----

  return (
          <div className="space-y-6">
            {/* Brand Analysis Carousel */}
            {allBrandsAnalysisData.length > 0 && (() => {
              const totalCards = allBrandsAnalysisData.length;
              const canNavigate = totalCards > 3;
              const maxIndex = Math.max(0, totalCards - 3);

              const getCarouselProviderLabel = (provider: string) => {
                switch (provider) {
                  case 'openai': return 'ChatGPT';
                  case 'anthropic': return 'Claude';
                  case 'gemini': return 'Gemini';
                  case 'perplexity': return 'Perplexity';
                  case 'ai_overviews': return 'AI Overviews';
                  case 'grok': return 'Grok';
                  case 'llama': return 'Llama';
                  default: return provider;
                }
              };

              // Popularity order for secondary sort
              const POPULARITY_ORDER = ['openai', 'gemini', 'anthropic', 'perplexity', 'grok', 'llama', 'ai_overviews'];

              return (
                <div id="competitive-cards" className="relative">
                  {/* Section Header */}
                  <div className="mb-4">
                    <h2 className="text-lg font-semibold text-gray-900">Visibility Reports</h2>
                    <p className="text-sm text-gray-500 mt-1">How often and how favorably each brand appears across AI platforms, based on all questions tested.</p>
                  </div>
                  {/* Carousel with Side Navigation */}
                  <div className="relative flex items-center">
                    {/* Left Arrow */}
                    {canNavigate && (
                      <button
                        onClick={() => setBrandCarouselIndex(prev => prev > 0 ? prev - 1 : maxIndex)}
                        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full border border-gray-200 bg-white shadow-sm hover:bg-gray-50 text-gray-400"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                    )}

                    {/* Carousel Cards */}
                    <div className="overflow-hidden w-full px-12">
                      <div
                        className="flex transition-transform duration-300 ease-in-out gap-4"
                        style={{ transform: `translateX(calc(-${brandCarouselIndex} * (33.333% + 0.333rem)))` }}
                      >
                        {allBrandsAnalysisData.map((brandData) => {
                          const allProviders = [...brandData.providerScores].sort((a, b) => {
                            if (b.score !== a.score) return b.score - a.score;
                            const aIdx = POPULARITY_ORDER.indexOf(a.provider);
                            const bIdx = POPULARITY_ORDER.indexOf(b.provider);
                            return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
                          });
                          const quotes = (brandQuotesMap[brandData.brand] ?? []).slice(0, 3);

                          return (
                            <div key={brandData.brand} className="w-[calc(33.333%-0.667rem)] flex-shrink-0 min-w-[260px]">
                              <div className={`bg-white rounded-xl border-2 h-full ${
                                brandData.isSearchedBrand
                                  ? 'border-teal-400 ring-1 ring-teal-100 shadow-lg'
                                  : 'border-gray-200 shadow-sm'
                              }`}>
                                {/* Card Header */}
                                <div className="px-4 pt-3 pb-2 border-b border-gray-100">
                                  <p className="text-[9px] text-gray-400 uppercase tracking-widest mb-0.5">
                                    {brandData.isSearchedBrand ? 'Your Brand' : 'Competitor'}
                                  </p>
                                  <p className="text-base font-bold text-gray-900">{brandData.brand}</p>

                                  {/* Provider Scores - paginated with nav buttons */}
                                  {allProviders.length > 0 && (() => {
                                    const VISIBLE_COUNT = 4;
                                    const pIdx = providerScrollIndex[brandData.brand] || 0;
                                    const visibleProviders = allProviders.slice(pIdx, pIdx + VISIBLE_COUNT);
                                    const canScroll = allProviders.length > VISIBLE_COUNT;
                                    return (
                                      <div className="mt-2 flex items-center gap-1">
                                        {/* Left nav */}
                                        <button
                                          type="button"
                                          onClick={() => setProviderScrollIndex(prev => ({
                                            ...prev,
                                            [brandData.brand]: pIdx > 0 ? pIdx - 1 : allProviders.length - VISIBLE_COUNT
                                          }))}
                                          className={`p-0.5 rounded-full transition-colors flex-shrink-0 ${
                                            canScroll ? 'text-gray-400 hover:text-gray-600 hover:bg-gray-100' : 'text-transparent pointer-events-none'
                                          }`}
                                          aria-label="Previous providers"
                                        >
                                          <ChevronLeft className="w-3.5 h-3.5" />
                                        </button>

                                        {/* Provider items */}
                                        <div className="flex gap-3 flex-1 justify-center">
                                          {visibleProviders.map((prov) => {
                                            const isZero = prov.score === 0;
                                            const scoreColor = isZero ? 'text-gray-300' : prov.score >= 80 ? 'text-emerald-600' : prov.score >= 40 ? 'text-amber-500' : 'text-red-400';
                                            return (
                                              <div key={prov.provider} className={`flex flex-col items-center gap-0.5 flex-shrink-0 ${isZero ? 'opacity-30' : ''}`}>
                                                {getProviderIcon(prov.provider)}
                                                <span className="text-[9px] text-gray-500 whitespace-nowrap">{getCarouselProviderLabel(prov.provider)}</span>
                                                <span className={`text-xs font-bold tabular-nums ${scoreColor}`}>
                                                  {prov.score}
                                                </span>
                                              </div>
                                            );
                                          })}
                                        </div>

                                        {/* Right nav */}
                                        <button
                                          type="button"
                                          onClick={() => setProviderScrollIndex(prev => ({
                                            ...prev,
                                            [brandData.brand]: pIdx < allProviders.length - VISIBLE_COUNT ? pIdx + 1 : 0
                                          }))}
                                          className={`p-0.5 rounded-full transition-colors flex-shrink-0 ${
                                            canScroll ? 'text-gray-400 hover:text-gray-600 hover:bg-gray-100' : 'text-transparent pointer-events-none'
                                          }`}
                                          aria-label="Next providers"
                                        >
                                          <ChevronRight className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    );
                                  })()}
                                </div>

                                {/* Overall Visibility with donut ring */}
                                <div className="px-4 py-2 border-b border-gray-100 text-center">
                                  <p className="text-[9px] text-gray-400 uppercase tracking-widest mb-0.5">Overall Visibility</p>
                                  <p className="text-[9px] text-gray-400 mb-1">Based on mention rate across all questions</p>
                                  <div className="inline-flex items-center justify-center relative">
                                    <svg width="82" height="82" viewBox="0 0 82 82" className="transform -rotate-90">
                                      <circle cx="41" cy="41" r="35" fill="none" stroke="#f3f4f6" strokeWidth="5" />
                                      <circle
                                        cx="41" cy="41" r="35" fill="none"
                                        strokeWidth="5"
                                        strokeLinecap="round"
                                        stroke={Math.round(brandData.visibilityScore) >= 80 ? '#10b981' : Math.round(brandData.visibilityScore) >= 40 ? '#f59e0b' : '#f87171'}
                                        strokeDasharray={`${(Math.round(brandData.visibilityScore) / 100) * 219.9} 219.9`}
                                      />
                                    </svg>
                                    <div className="absolute inset-0 flex items-center justify-center">
                                      <p className="text-lg font-bold text-gray-900">
                                        {Math.round(brandData.visibilityScore)}<span className="text-[9px] text-gray-400 font-normal">/100</span>
                                      </p>
                                    </div>
                                  </div>
                                </div>

                                {/* Recent Mentions - short summaries with source */}
                                {quotes.length > 0 && (
                                  <div className="px-4 py-2">
                                    <p className="text-[9px] text-gray-400 uppercase tracking-widest mb-1">What AI Says</p>
                                    <div className="space-y-1">
                                      {quotes.map((q, qi) => {
                                        const blurb = q.summary || q.text.replace(/^https?:\/\/\S+\s*/i, '').replace(/^[^a-zA-Z"]*/, '').split(/[.!?]/)[0].split(' ').slice(0, 7).join(' ');
                                        const shortPrompt = q.prompt.length > 30 ? q.prompt.substring(0, 28) + '...' : q.prompt;
                                        return (
                                          <div key={qi} className="bg-white border border-gray-100 rounded-lg px-2 py-1">
                                            <p className="text-xs text-gray-700 italic">&ldquo;{blurb}&rdquo;</p>
                                            <p className="text-[9px] text-gray-400 mt-0.5">
                                              {getCarouselProviderLabel(q.provider)} · {shortPrompt}
                                            </p>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Right Arrow */}
                    {canNavigate && (
                      <button
                        onClick={() => setBrandCarouselIndex(prev => prev < maxIndex ? prev + 1 : 0)}
                        className="absolute right-0 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full border border-gray-200 bg-white shadow-sm hover:bg-gray-50 text-gray-400"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    )}
                  </div>

                  {/* Carousel Dots */}
                  {canNavigate && (
                    <div className="flex justify-center gap-2 mt-6">
                      {Array.from({ length: maxIndex + 1 }).map((_, idx) => (
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
              <div id="competitive-insights" className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl shadow-sm border border-amber-100 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Lightbulb className="w-5 h-5 text-amber-600" />
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
              <div id="competitive-breakdown" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
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
                          if (score >= 4.5) return 'Strong';
                          if (score >= 3.5) return 'Positive';
                          if (score >= 2.5) return 'Neutral';
                          if (score >= 1.5) return 'Conditional';
                          if (score >= 0.5) return 'Negative';
                          return '-';
                        };

                        const getSentimentColor = (score: number | null): string => {
                          if (score === null) return 'text-gray-400';
                          if (score >= 4.5) return 'text-gray-900';
                          if (score >= 3.5) return 'text-gray-700';
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
                            'strong_endorsement': 'text-emerald-700',
                            'positive_endorsement': 'text-emerald-600',
                            'neutral_mention': 'text-gray-600',
                            'conditional': 'text-amber-500',
                            'negative_comparison': 'text-red-500',
                          };
                          return colors[sentiment] || 'text-gray-400';
                        };

                        const isExpanded = expandedBrandBreakdownRows.has(stat.brand);

                        // Get score text color matching the card color scheme
                        const getScoreTextColor = (score: number): string => {
                          if (score >= 75) return '#111827';
                          if (score >= 60) return '#65a30d';
                          if (score >= 45) return '#a3a065';
                          if (score >= 30) return '#a39580';
                          return '#6b7280';
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
                                  <span className="font-medium" style={{ color: stat.avgRank <= 1.5 ? '#111827' : stat.avgRank <= 2.5 ? '#65a30d' : stat.avgRank <= 3.5 ? '#a3a065' : '#6b7280' }}>
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
                                      {stat.promptsWithStats.map((promptStat: any, promptIdx: number) => (
                                        <div
                                          key={promptIdx}
                                          className="flex items-start justify-between gap-4 py-2 border-b border-gray-100 last:border-0"
                                        >
                                          <p className="text-sm text-gray-700 flex-1">
                                            {promptStat.prompt}
                                          </p>
                                          <div className="flex items-center gap-4 flex-shrink-0">
                                            <div className="text-center">
                                              <span className={`text-sm font-medium ${promptStat.rate >= 50 ? 'text-gray-900' : promptStat.rate >= 25 ? 'text-yellow-600' : 'text-gray-600'}`}>
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
              const xMin = Math.max(0, Math.floor(minSentiment) - 0.5);
              const xMax = Math.min(5.5, Math.ceil(maxSentiment) + 0.5);
              const xTicks = [1, 2, 3, 4, 5].filter(t => t >= xMin && t <= xMax);

              const rawData = brandPositioningStats
                .filter(stat => stat.avgSentimentScore !== null && stat.mentioned > 0)
                .map(stat => ({
                  brand: stat.brand,
                  mentions: stat.mentioned,
                  sentiment: stat.avgSentimentScore || 0,
                  visibility: stat.visibilityScore,
                  isSearchedBrand: stat.isSearchedBrand,
                }));

              const getClusterKey = (mentions: number, sentiment: number) => {
                const mentionBucket = Math.round(mentions);
                const sentimentBucket = Math.round(sentiment * 2) / 2;
                return `${mentionBucket}-${sentimentBucket}`;
              };

              const positionGroups: Record<string, typeof rawData> = {};
              rawData.forEach(point => {
                const key = getClusterKey(point.mentions, point.sentiment);
                if (!positionGroups[key]) positionGroups[key] = [];
                positionGroups[key].push(point);
              });

              Object.values(positionGroups).forEach(group => {
                group.sort((a, b) => a.sentiment - b.sentiment);
              });

              const processedData = rawData.map(point => {
                const key = getClusterKey(point.mentions, point.sentiment);
                const group = positionGroups[key];
                const indexInGroup = group.findIndex(p => p.brand === point.brand);
                const groupSize = group.length;
                return { ...point, groupSize, indexInGroup };
              });

              const maxMentions = rawData.length > 0 ? Math.max(...rawData.map(d => d.mentions)) : 10;
              const yMax = maxMentions + Math.max(1, Math.ceil(maxMentions * 0.15));

              return (
              <div id="competitive-positioning" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
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
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#f59e0b' }} />
                    <span className="text-xs text-gray-500">Conditional</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#ef4444' }} />
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
                        label={{ value: 'Mention Count', angle: -90, position: 'insideLeft', offset: -10, style: { fill: '#374151', fontSize: 14, fontWeight: 500, textAnchor: 'middle' } }}
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

                          const sentiment = payload.sentiment || 3;
                          const getColor = () => {
                            if (sentiment >= 4.5) return '#047857';
                            if (sentiment >= 3.5) return '#10b981';
                            if (sentiment >= 2.5) return '#9ca3af';
                            if (sentiment >= 1.5) return '#f59e0b';
                            return '#ef4444';
                          };
                          const getStroke = () => {
                            if (sentiment >= 4.5) return '#065f46';
                            if (sentiment >= 3.5) return '#059669';
                            if (sentiment >= 2.5) return '#6b7280';
                            if (sentiment >= 1.5) return '#d97706';
                            return '#dc2626';
                          };

                          const circleRadius = isSearched ? 11 : 9;
                          const spacing = 22;
                          const totalWidth = (groupSize - 1) * spacing;
                          const xOffset = groupSize > 1 ? (indexInGroup * spacing) - (totalWidth / 2) : 0;

                          const shortBrand = payload.brand.length > 15
                            ? payload.brand.substring(0, 13) + '...'
                            : payload.brand;

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
              <div id="competitive-heatmap" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
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
                              const bgColor = rate === 0
                                ? 'bg-gray-100 text-gray-400'
                                : rate >= 70
                                  ? 'bg-emerald-600 text-white'
                                  : rate >= 40
                                    ? 'bg-amber-50 text-amber-700'
                                    : 'bg-red-50 text-red-600';
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
                              <span className={`font-semibold ${rowAvg >= 70 ? 'text-emerald-700' : rowAvg >= 40 ? 'text-amber-600' : 'text-red-500'}`}>
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
              <div id="competitive-cooccurrence" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
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

                  const getBarColor = (count: number) => {
                    const range = maxCount - minCount || 1;
                    const normalized = (count - minCount) / range;
                    if (normalized < 0.25) return '#d1d5db';
                    if (normalized < 0.5) return '#9ca3af';
                    if (normalized < 0.75) return '#4ade80';
                    return '#22c55e';
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
                          <div className="w-32 text-right flex-shrink-0">
                            <span className="text-sm font-medium text-gray-900">{pair.count} times</span>
                            <span className="text-xs text-gray-500 ml-1">({pair.percentage.toFixed(1)}%)</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
                    <span>Bar shade shows how often brands appear together:</span>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#d1d5db' }}></div>
                      <span>Less often</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#22c55e' }}></div>
                      <span>More often</span>
                    </div>
                  </div>
                  </>
                  );
                })()}

                {/* Venn Diagram Visualization */}
                {cooccurrenceView === 'venn' && (() => {
                  const searchedBrand = runStatus?.brand || '';
                  const brandPairs = brandCooccurrence.filter(
                    pair => pair.brand1 === searchedBrand || pair.brand2 === searchedBrand
                  ).slice(0, 4);

                  if (brandPairs.length === 0) return null;

                  const cooccurringBrands = brandPairs.map(pair => ({
                    brand: pair.brand1 === searchedBrand ? pair.brand2 : pair.brand1,
                    count: pair.count,
                    percentage: pair.percentage,
                  }));

                  const maxCount = Math.max(...cooccurringBrands.map(b => b.count));
                  const minCount = Math.min(...cooccurringBrands.map(b => b.count));

                  const getColorForCount = (count: number) => {
                    const range = maxCount - minCount || 1;
                    const normalized = (count - minCount) / range;
                    if (normalized < 0.25) return '#bbf7d0';
                    if (normalized < 0.5) return '#86efac';
                    if (normalized < 0.75) return '#4ade80';
                    return '#22c55e';
                  };

                  const getLabelColorForCount = (count: number) => {
                    const range = maxCount - minCount || 1;
                    const normalized = (count - minCount) / range;
                    if (normalized < 0.25) return '#166534';
                    if (normalized < 0.5) return '#15803d';
                    if (normalized < 0.75) return '#166534';
                    return '#14532d';
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
                            const angle = (idx * (360 / cooccurringBrands.length) - 90) * (Math.PI / 180);
                            const distance = 110;
                            const cx = 300 + Math.cos(angle) * distance;
                            const cy = 240 + Math.sin(angle) * distance;
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
                                <text
                                  x={300 + Math.cos(angle) * 55}
                                  y={240 + Math.sin(angle) * 55}
                                  textAnchor="middle"
                                  dominantBaseline="middle"
                                  fill="#374151"
                                  fontSize="12"
                                  fontWeight="600"
                                >
                                  {item.count}
                                </text>
                              </g>
                            );
                          })}
                          {/* Center brand name */}
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
              <div id="competitive-publishers" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
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
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#047857' }} />
                        <span>Strong</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#10b981' }} />
                        <span>Positive</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#9ca3af' }} />
                        <span>Neutral</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#fbbf24' }} />
                        <span>Conditional</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#ef4444' }} />
                        <span>Negative</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(34, 197, 94, 0.6)' }} />
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
                                ? 'text-gray-900 bg-gray-50'
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

                              const intensity = heatmapShowSentiment
                                ? avgSentiment > 0 ? (avgSentiment - 1) / 4 : 0
                                : globalMax > 0 ? count / globalMax : 0;

                              const isSearchedBrand = brand === brandSourceHeatmap.searchedBrand;

                              let barColor: string = '#9ca3af';
                              if (heatmapShowSentiment && count > 0) {
                                if (avgSentiment >= 4.5) {
                                  barColor = '#047857';
                                } else if (avgSentiment >= 3.5) {
                                  barColor = '#10b981';
                                } else if (avgSentiment >= 2.5) {
                                  barColor = '#9ca3af';
                                } else if (avgSentiment >= 1.5) {
                                  barColor = '#fbbf24';
                                } else {
                                  barColor = '#ef4444';
                                }
                              } else if (!heatmapShowSentiment && count > 0) {
                                barColor = isSearchedBrand ? '#22c55e' : '#5ba3c0';
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
                                    <span className="text-gray-300">{'\u2013'}</span>
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
  );
}
