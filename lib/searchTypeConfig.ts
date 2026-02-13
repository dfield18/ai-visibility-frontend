import type { SearchType } from './types';

export type TabId = 'overview' | 'competitive' | 'sentiment' | 'sources' | 'recommendations' | 'site-audit' | 'reports' | 'reference' | 'chatgpt-ads' | 'industry-overview';

export interface TabConfig {
  id: TabId;
  label: string;
  enabled: boolean;
}

export interface SearchTypeConfig {
  key: SearchType;
  label: string;
  icon: string; // lucide icon name
  description: string;
  placeholder: string;
  examples: { name: string; label: string }[];

  // Configure page
  subjectLabel: string;
  competitorsLabel: string;
  addCompetitorPlaceholder: string;
  competitorsDescription: string;
  competitorsLoadingText: string;
  requiresLocation: boolean;
  requiresUrl: boolean;

  // Results page
  brandMentionLabel: string;
  competitorColumnLabel: string;
  sentimentLabel: string;
  tabs: TabConfig[];

  // AI context
  recommendationContext: string;
}

const ALL_TABS: TabConfig[] = [
  { id: 'overview', label: 'Visibility', enabled: true },
  { id: 'competitive', label: 'Competitive Landscape', enabled: true },
  { id: 'sentiment', label: 'Sentiment & Tone', enabled: true },
  { id: 'sources', label: 'Sources', enabled: true },
  { id: 'recommendations', label: 'Recommendations', enabled: true },
  { id: 'site-audit', label: 'Site Audit', enabled: true },
  { id: 'reports', label: 'Automated Reports', enabled: true },
  { id: 'chatgpt-ads', label: 'ChatGPT Advertising', enabled: true },
  { id: 'reference', label: 'Raw Data', enabled: true },
];

function makeTabs(overrides: Partial<Record<TabId, { label?: string; enabled?: boolean }>> = {}): TabConfig[] {
  return ALL_TABS.map(tab => ({
    ...tab,
    ...overrides[tab.id],
  }));
}

export const SEARCH_TYPE_CONFIGS: Record<SearchType, SearchTypeConfig> = {
  brand: {
    key: 'brand',
    label: 'Brand',
    icon: 'Building2',
    description: 'Analyze how AI platforms talk about your brand',
    placeholder: 'Enter your brand name...',
    examples: [
      { name: 'Nike', label: 'Brand' },
      { name: 'Tesla', label: 'Brand' },
      { name: 'Spotify', label: 'Brand' },
    ],
    subjectLabel: 'Brand',
    competitorsLabel: 'Competitors to Track',
    addCompetitorPlaceholder: 'Add a competitor...',
    competitorsDescription: 'Select competitors to see how they compare to your brand',
    competitorsLoadingText: 'Finding your competitors...',
    requiresLocation: false,
    requiresUrl: true,
    brandMentionLabel: 'Brand Mention Rate',
    competitorColumnLabel: 'Competitors',
    sentimentLabel: 'Brand Sentiment',
    tabs: makeTabs(),
    recommendationContext: 'brand optimization and AI visibility improvement',
  },

  category: {
    key: 'category',
    label: 'Industry',
    icon: 'Tag',
    description: 'See which brands AI recommends in a product category',
    placeholder: 'Enter a product category...',
    examples: [
      { name: 'Sneakers', label: 'Industry' },
      { name: 'Laptops', label: 'Industry' },
      { name: 'Electric Cars', label: 'Industry' },
    ],
    subjectLabel: 'Category',
    competitorsLabel: 'Brands to Track',
    addCompetitorPlaceholder: 'Add a brand...',
    competitorsDescription: 'Select which brands you want to monitor in AI responses',
    competitorsLoadingText: 'Finding relevant brands...',
    requiresLocation: false,
    requiresUrl: false,
    brandMentionLabel: 'Category Coverage',
    competitorColumnLabel: 'Brands',
    sentimentLabel: 'Category Sentiment',
    tabs: [
      { id: 'industry-overview', label: 'Industry Overview', enabled: true },
      ...makeTabs({ 'site-audit': { enabled: false } }),
    ],
    recommendationContext: 'industry positioning and category leadership',
  },

  local: {
    key: 'local',
    label: 'Local',
    icon: 'MapPin',
    description: 'Find how AI recommends local businesses in your area',
    placeholder: 'Enter a local business category...',
    examples: [
      { name: 'Coffee Shops', label: 'Local' },
      { name: 'Restaurants', label: 'Local' },
      { name: 'Gyms', label: 'Local' },
    ],
    subjectLabel: 'Category',
    competitorsLabel: 'Businesses to Track',
    addCompetitorPlaceholder: 'Add a business...',
    competitorsDescription: 'Select which local businesses you want to monitor in AI responses',
    competitorsLoadingText: 'Finding local businesses...',
    requiresLocation: true,
    requiresUrl: false,
    brandMentionLabel: 'Business Mention Rate',
    competitorColumnLabel: 'Businesses',
    sentimentLabel: 'Business Sentiment',
    tabs: makeTabs({ 'site-audit': { enabled: false } }),
    recommendationContext: 'local business visibility and local SEO',
  },

  issue: {
    key: 'issue',
    label: 'Issue',
    icon: 'Flag',
    description: 'Track how AI discusses a public issue or policy topic',
    placeholder: 'Enter an issue or policy topic...',
    examples: [
      { name: 'Prop 47', label: 'Issue' },
      { name: 'Student Loan Forgiveness', label: 'Issue' },
      { name: 'Remote Work Policy', label: 'Issue' },
    ],
    subjectLabel: 'Issue',
    competitorsLabel: 'Related Issues',
    addCompetitorPlaceholder: 'Add a related issue...',
    competitorsDescription: 'Select related issues to compare how AI discusses them',
    competitorsLoadingText: 'Finding related issues...',
    requiresLocation: false,
    requiresUrl: false,
    brandMentionLabel: 'Issue Mention Rate',
    competitorColumnLabel: 'Related Issues',
    sentimentLabel: 'Issue Framing',
    tabs: makeTabs({
      'competitive': { label: 'Related Issues' },
      'sentiment': { label: 'Framing & Tone' },
      'site-audit': { enabled: false },
      'reports': { enabled: false },
    }),
    recommendationContext: 'issue advocacy and public narrative shaping',
  },

  public_figure: {
    key: 'public_figure',
    label: 'Public Figure',
    icon: 'User',
    description: 'See how AI portrays a public figure across platforms',
    placeholder: 'Enter a public figure name...',
    examples: [
      { name: 'Elon Musk', label: 'Public Figure' },
      { name: 'Taylor Swift', label: 'Public Figure' },
      { name: 'Alexandria Ocasio-Cortez', label: 'Public Figure' },
    ],
    subjectLabel: 'Figure',
    competitorsLabel: 'Similar Figures & Opponents',
    addCompetitorPlaceholder: 'Add a figure...',
    competitorsDescription: 'Select similar figures to compare AI portrayal',
    competitorsLoadingText: 'Finding similar figures...',
    requiresLocation: false,
    requiresUrl: false,
    brandMentionLabel: 'Figure Mention Rate',
    competitorColumnLabel: 'Similar Figures',
    sentimentLabel: 'Figure Sentiment',
    tabs: makeTabs({
      'competitive': { label: 'Figure Comparison' },
      'site-audit': { enabled: false },
    }),
    recommendationContext: 'reputation management and public perception optimization',
  },
};

export function getSearchTypeConfig(searchType: SearchType): SearchTypeConfig {
  return SEARCH_TYPE_CONFIGS[searchType] ?? SEARCH_TYPE_CONFIGS.brand;
}
