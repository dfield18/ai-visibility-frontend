'use client';

import React, { useState, useMemo, useEffect, useRef, useLayoutEffect } from 'react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
} from 'recharts';
import {
  AtSign,
  Award,
  Building2,
  ChevronDown,
  ChevronUp,
  Circle,
  Download,
  ExternalLink,
  Feather,
  FileText,
  Film,
  Lightbulb,
  Link2,
  MapPin,
  MessagesSquare,
  Rss,
  Sparkles,
  Tag,
  TrendingUp,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { truncate } from '@/lib/utils';
import type { Result, RunStatusResponse, Source } from './shared';
import {
  getProviderLabel,
  getProviderShortLabel,
  getProviderIcon,
  getResultPosition,
  getSentimentScore,
  getSentimentLabel,
  capitalizeFirst,
  getReadableTitleFromUrl,
  formatSourceDisplay,
  getDomain,
  PROVIDER_ORDER,
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
  } = useResults();
  const { copied, handleCopyLink, setSelectedResult, setSelectedResultHighlight } = useResultsUI();

  const [domainSortColumn, setDomainSortColumn] = useState<'domain' | 'usedPercent' | 'avgCitation' | 'category' | 'avgSentiment'>('usedPercent');
  const [domainSortDirection, setDomainSortDirection] = useState<'asc' | 'desc'>('desc');
  const [publisherPromptFilter, setPublisherPromptFilter] = useState<string>('all');
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const [expandedInfluencers, setExpandedInfluencers] = useState<Set<string>>(new Set());
  const [sourcesProviderFilter, setSourcesProviderFilter] = useState<string>('all');
  const [sourcesBrandFilter, setSourcesBrandFilter] = useState<string>('all');
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

    // State for Brand Website Citations filters and expansion
    const [brandCitationsBrandFilter, setBrandCitationsBrandFilter] = useState<string>('all');
    const [brandCitationsProviderFilter, setBrandCitationsProviderFilter] = useState<string>('all');
    const [expandedBrandCitations, setExpandedBrandCitations] = useState<Set<string>>(new Set());

    // State for Source Positioning chart
    const [sourcePositioningBrandFilter, setSourcePositioningBrandFilter] = useState<string>('all');

    // State for Citations by Source & Brand heatmap (industry only)
    const [sourceBrandHeatmapProviderFilter, setSourceBrandHeatmapProviderFilter] = useState<string>('all');
    const [sourceBrandHeatmapSort, setSourceBrandHeatmapSort] = useState<string>('total');

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
          ? ((!isCategory && r.brand_mentioned && runStatus.brand === selectedBrand) ||
            r.competitors_mentioned?.includes(selectedBrand))
          : isCategory
            ? (r.competitors_mentioned && r.competitors_mentioned.length > 0)
            : (r.brand_mentioned || (r.competitors_mentioned && r.competitors_mentioned.length > 0));

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
            const sentimentMap: Record<string, number> = {
              'strong_endorsement': 5,
              'positive_endorsement': 4,
              'neutral_mention': 3,
              'conditional': 2,
              'negative_comparison': 1,
            };
            if (selectedBrand) {
              let sentimentScore = 3;
              if (!isCategory && selectedBrand === runStatus.brand && r.brand_sentiment) {
                sentimentScore = sentimentMap[r.brand_sentiment] || 3;
              } else if (r.competitor_sentiments?.[selectedBrand]) {
                sentimentScore = sentimentMap[r.competitor_sentiments[selectedBrand]] || 3;
              }
              domainStats[domain].sentimentScores.push(sentimentScore);
            } else if (isCategory) {
              // For category "all" filter: aggregate sentiments from all competitor brands
              if (r.competitor_sentiments) {
                const scores = Object.values(r.competitor_sentiments)
                  .map(s => sentimentMap[s] || 0)
                  .filter(s => s > 0);
                if (scores.length > 0) {
                  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
                  domainStats[domain].sentimentScores.push(avg);
                }
              }
            } else if (r.brand_sentiment) {
              domainStats[domain].sentimentScores.push(sentimentMap[r.brand_sentiment] || 3);
            }

            // Get position using the helper function
            const position = getResultPosition(r, runStatus!);
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

      // Add searched brand (skip for category — it's the industry name, not a brand)
      if (runStatus.brand && !isCategory) {
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
      const searchedBrandLower = runStatus?.brand?.toLowerCase() || '';
      // Filter out the searched brand from trackedBrands to avoid duplicates (trackedBrands stores lowercase)
      const competitorsOnly = Array.from(trackedBrands).filter(b => b.toLowerCase() !== searchedBrandLower);
      const allBrandsToTrack = [...(isCategory ? [] : [runStatus?.brand || '']), ...competitorsOnly].filter(Boolean);

      // Structure to hold citation data per brand
      const brandCitationData: Record<string, {
        count: number;
        urls: { url: string; title: string; provider: string; count: number }[];
        providers: Set<string>;
        snippets: { provider: string; prompt: string; text: string }[];
        seenResultIds: Set<string>;
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
                  brandCitationData[brand] = { count: 0, urls: [], providers: new Set(), snippets: [], seenResultIds: new Set() };
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

                // Extract response snippet mentioning the brand (once per result)
                if (r.response_text && !brandCitationData[brand].seenResultIds.has(r.id)) {
                  brandCitationData[brand].seenResultIds.add(r.id);
                  const plain = r.response_text.replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1');
                  const sentences = plain.split(/(?<=[.!?])\s+/);
                  const brandLower = brand.toLowerCase();
                  for (let si = 0; si < sentences.length; si++) {
                    if (sentences[si].toLowerCase().includes(brandLower)) {
                      const snippet = sentences[si] + (sentences[si + 1] ? ' ' + sentences[si + 1] : '');
                      const cleaned = snippet.replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim();
                      if (cleaned.length > 20) {
                        brandCitationData[brand].snippets.push({
                          provider: r.provider,
                          prompt: r.prompt,
                          text: cleaned.length > 200 ? cleaned.substring(0, 200).replace(/\s\S*$/, '') + '...' : cleaned,
                        });
                        break;
                      }
                    }
                  }
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
          snippets: data.snippets,
          rate: totalResultsWithSources > 0 ? (data.count / totalResultsWithSources) * 100 : 0,
          isSearchedBrand: !isCategory && brand === runStatus?.brand
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
        prompts: Set<string>;
      }> = {};

      // Process each result to collect domain stats
      resultsWithSources.forEach((r: Result) => {
        if (!r.sources) return;

        // Collect brands mentioned in this response (skip category name for industry reports)
        const brandsInResponse: string[] = [];
        if (!isCategory && r.brand_mentioned && searchedBrand) {
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
                prompts: new Set(),
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
          // Track which prompt led to this citation
          if (r.prompt) domainStats[domain].prompts.add(r.prompt);
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
            prompts: Array.from(stat.prompts),
          };
        })
        .sort((a, b) => b.usedPercent - a.usedPercent);
    }, [runStatus, globallyFilteredResults, aiCategorizations]);

    // Available prompts for the publisher prompt filter
    const publisherPromptOptions = useMemo(() => {
      const prompts = new Set<string>();
      domainTableData.forEach(row => row.prompts.forEach(p => prompts.add(p)));
      return Array.from(prompts).sort();
    }, [domainTableData]);

    // Sorted domain table data based on user selection
    const sortedDomainTableData = useMemo(() => {
      const filtered = publisherPromptFilter === 'all'
        ? domainTableData
        : domainTableData.filter(row => row.prompts.includes(publisherPromptFilter));
      return [...filtered].sort((a, b) => {
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
    }, [domainTableData, domainSortColumn, domainSortDirection, publisherPromptFilter]);

    // Handle column header click for sorting
    const handleDomainSort = (column: 'domain' | 'usedPercent' | 'avgCitation' | 'category' | 'avgSentiment') => {
      if (domainSortColumn === column) {
        setDomainSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
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

    // Citations by Source & Brand heatmap data (industry reports only)
    const sourceBrandHeatmapData = useMemo(() => {
      if (!isCategory || !runStatus) return { sources: [], brands: [], matrix: {} as Record<string, Record<string, number>>, totals: { bySource: {} as Record<string, number>, byBrand: {} as Record<string, number>, grand: 0 } };

      const filteredResults = globallyFilteredResults.filter((r: Result) => {
        if (r.error || !r.sources || r.sources.length === 0) return false;
        if (sourceBrandHeatmapProviderFilter !== 'all' && r.provider !== sourceBrandHeatmapProviderFilter) return false;
        return true;
      });

      // Build source × brand matrix
      const matrix: Record<string, Record<string, number>> = {};
      const sourceTotals: Record<string, number> = {};
      const brandTotals: Record<string, number> = {};
      const allBrands = new Set<string>();

      filteredResults.forEach((r: Result) => {
        const brands = r.competitors_mentioned || [];
        const domains = new Set<string>();
        r.sources!.forEach(s => {
          if (s.url) {
            try {
              domains.add(new URL(s.url).hostname.replace(/^www\./, ''));
            } catch { /* skip bad urls */ }
          }
        });

        brands.forEach(brand => allBrands.add(brand));

        domains.forEach(domain => {
          if (!matrix[domain]) matrix[domain] = {};
          brands.forEach(brand => {
            matrix[domain][brand] = (matrix[domain][brand] || 0) + 1;
            sourceTotals[domain] = (sourceTotals[domain] || 0) + 1;
            brandTotals[brand] = (brandTotals[brand] || 0) + 1;
          });
        });
      });

      // Sort sources by total citations, take top 20
      const sortedSources = Object.keys(sourceTotals)
        .sort((a, b) => sourceTotals[b] - sourceTotals[a])
        .slice(0, 20);

      // Sort brands by total citations
      const sortedBrands = Array.from(allBrands)
        .sort((a, b) => (brandTotals[b] || 0) - (brandTotals[a] || 0));

      // Re-sort sources if sorting by a specific brand
      let finalSources = sortedSources;
      if (sourceBrandHeatmapSort !== 'total') {
        finalSources = [...sortedSources].sort((a, b) => {
          const aVal = matrix[a]?.[sourceBrandHeatmapSort] || 0;
          const bVal = matrix[b]?.[sourceBrandHeatmapSort] || 0;
          return bVal - aVal;
        });
      }

      const grand = Object.values(sourceTotals).reduce((a, b) => a + b, 0);

      return {
        sources: finalSources,
        brands: sortedBrands,
        matrix,
        totals: { bySource: sourceTotals, byBrand: brandTotals, grand },
      };
    }, [isCategory, runStatus, globallyFilteredResults, sourceBrandHeatmapProviderFilter, sourceBrandHeatmapSort]);

    // Max cell value for heatmap color scaling
    const heatmapMaxValue = useMemo(() => {
      let max = 0;
      for (const domain of sourceBrandHeatmapData.sources) {
        for (const brand of sourceBrandHeatmapData.brands) {
          const val = sourceBrandHeatmapData.matrix[domain]?.[brand] || 0;
          if (val > max) max = val;
        }
      }
      return max;
    }, [sourceBrandHeatmapData]);

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
                    <option value="all">All Brands</option>
                    {!isCategory && runStatus?.brand && availableBrands.includes(runStatus.brand) && (
                      <option value={runStatus.brand}>{runStatus.brand} (searched)</option>
                    )}
                    {availableBrands.filter(brand => isCategory ? true : brand !== runStatus?.brand).map((brand) => (
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
                  <h2 className="text-lg font-semibold text-gray-900">{isCategory ? 'Sources That Shape AI Recommendations' : 'Sources That Help Your Brand'}</h2>
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
              {/* Sentiment Legend */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-5">
                <span className="text-xs text-gray-600 font-medium">Sentiment:</span>
                {[
                  { color: '#047857', label: 'Strong' },
                  { color: '#10b981', label: 'Positive' },
                  { color: '#9ca3af', label: 'Neutral' },
                  { color: '#f59e0b', label: 'Conditional' },
                  { color: '#ef4444', label: 'Negative' },
                ].map(({ color, label }) => (
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
                    <div key={d.domain} className="group flex items-center gap-3" title={`${d.domain} — ${d.citationCount} citations, ${d.providerCount} model${d.providerCount !== 1 ? 's' : ''}, Avg Position: ${d.avgPosition ? '#' + d.avgPosition.toFixed(1) : 'N/A'}, Sentiment: ${getSentimentLabel(d.avgSentiment)}`}>
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
              <p className="mt-4 text-center text-xs text-gray-400 italic">Bar color indicates average sentiment • Position badge shows avg brand rank when this source is cited</p>
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
                  Number of AI responses that cite each source when mentioning a brand
                </p>
              </div>
              <div className="flex items-center gap-2">
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

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 min-w-[160px]">
                      Source
                    </th>
                    {sourceBrandHeatmapData.brands.map(brand => (
                      <th
                        key={brand}
                        className="text-center py-3 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none min-w-[80px]"
                        onClick={() => setSourceBrandHeatmapSort(sourceBrandHeatmapSort === brand ? 'total' : brand)}
                      >
                        <span className="flex items-center justify-center gap-1">
                          {brand.length > 12 ? brand.substring(0, 12) + '…' : brand}
                          {sourceBrandHeatmapSort === brand && <span className="text-gray-900">↓</span>}
                        </span>
                      </th>
                    ))}
                    <th
                      className="text-center py-3 px-3 text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer hover:text-gray-900 select-none min-w-[60px] bg-gray-100"
                      onClick={() => setSourceBrandHeatmapSort('total')}
                    >
                      <span className="flex items-center justify-center gap-1">
                        Total
                        {sourceBrandHeatmapSort === 'total' && <span className="text-gray-900">↓</span>}
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sourceBrandHeatmapData.sources.map((domain, rowIdx) => (
                    <tr key={domain} className={`border-b border-gray-100 ${rowIdx % 2 === 0 ? '' : 'bg-gray-50/30'}`}>
                      <td className="py-2.5 px-4 sticky left-0 bg-white" style={rowIdx % 2 !== 0 ? { background: 'rgba(249,250,251,0.3)' } : undefined}>
                        <a
                          href={`https://${domain}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-gray-700 hover:text-gray-900 hover:underline truncate block max-w-[160px]"
                          title={domain}
                        >
                          {domain}
                        </a>
                      </td>
                      {sourceBrandHeatmapData.brands.map(brand => {
                        const count = sourceBrandHeatmapData.matrix[domain]?.[brand] || 0;
                        const intensity = heatmapMaxValue > 0 ? count / heatmapMaxValue : 0;
                        return (
                          <td key={brand} className="text-center py-2.5 px-3">
                            {count > 0 ? (
                              <span
                                className="inline-flex items-center justify-center w-10 h-7 rounded text-xs font-semibold"
                                style={{
                                  backgroundColor: `rgba(17, 24, 39, ${0.06 + intensity * 0.25})`,
                                  color: intensity > 0.5 ? '#111827' : '#4b5563',
                                }}
                              >
                                {count}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="text-center py-2.5 px-3 bg-gray-50/50">
                        <span className="text-sm font-semibold text-gray-900">
                          {sourceBrandHeatmapData.totals.bySource[domain] || 0}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {/* Totals row */}
                  <tr className="border-t-2 border-gray-200 bg-gray-50">
                    <td className="py-3 px-4 sticky left-0 bg-gray-50">
                      <span className="text-xs font-semibold text-gray-700 uppercase">Total</span>
                    </td>
                    {sourceBrandHeatmapData.brands.map(brand => (
                      <td key={brand} className="text-center py-3 px-3">
                        <span className="text-sm font-semibold text-gray-900">
                          {sourceBrandHeatmapData.totals.byBrand[brand] || 0}
                        </span>
                      </td>
                    ))}
                    <td className="text-center py-3 px-3 bg-gray-100">
                      <span className="text-sm font-bold text-gray-900">
                        {sourceBrandHeatmapData.totals.grand}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="px-6 py-3 text-center text-xs text-gray-400 italic border-t border-gray-100">
              Top {sourceBrandHeatmapData.sources.length} sources shown • Click a brand column header to sort • Darker cells indicate more citations
            </p>
          </div>
        )}

        {/* Brand Website Citations */}
        <div id="sources-brand-website" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Brand Website Citations</h3>
              <p className="text-sm text-gray-500">{isCategory ? 'How often AI models cite brand websites as sources' : 'How often AI models cite your brand\'s and competitors\' own websites as sources'}</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={brandCitationsBrandFilter}
                onChange={(e) => setBrandCitationsBrandFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              >
                <option value="all">All Brands</option>
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
          <div id="sources-publisher" className="bg-white rounded-2xl shadow-sm border border-gray-200">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Publisher Breakdown</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  Showing {sortedDomainTableData.length} publishers cited across AI responses
                </p>
              </div>
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

            {/* Table */}
            <div className="overflow-x-auto min-h-0">
              <table className="w-full table-fixed">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th
                      className={`${isCategory ? 'w-[15%]' : 'w-[18%]'} text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none`}
                      onClick={() => handleDomainSort('domain')}
                    >
                      <span className="flex items-center gap-1">
                        Website
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
                        Type
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
                        {domainSortColumn === 'avgCitation' && (
                          <span className="text-gray-900">{domainSortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </span>
                    </th>
                    <th
                      className={`${isCategory ? 'w-[11%]' : 'w-[15%]'} text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none`}
                      onClick={() => handleDomainSort('avgSentiment')}
                    >
                      <span className="flex items-center justify-center gap-1">
                        Sentiment
                        {domainSortColumn === 'avgSentiment' && (
                          <span className="text-gray-900">{domainSortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </span>
                    </th>
                    <th className={`${isCategory ? 'w-[12%]' : 'w-[15%]'} text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider`}>Models</th>
                    <th className={`${isCategory ? 'w-[12%]' : 'w-[15%]'} text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider`}>Brands</th>
                    {isCategory && (
                      <th className="w-[22%] text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Prompts</th>
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
                      const configs: Record<string, { bg: string; text: string; border: string; label: string }> = {
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
                          <span className="text-sm text-gray-900 font-medium">{row.domain}</span>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {getCategoryIcon(row.category, "w-3.5 h-3.5")}
                            <span className="text-sm text-gray-600">{row.category}</span>
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

