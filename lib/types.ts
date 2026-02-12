export type SearchType = 'brand' | 'category' | 'local' | 'issue' | 'public_figure';

export interface SuggestRequest {
  brand: string;
  industry?: string;
  search_type?: SearchType;
  location?: string;  // Required for local search type
}

export interface SuggestResponse {
  brand: string;
  prompts: string[];
  competitors: string[];
}

export interface RunConfig {
  session_id: string;
  brand: string;
  search_type?: SearchType;
  location?: string;  // Required for local search type
  prompts: string[];
  competitors: string[];
  providers: string[];
  temperatures: number[];
  repeats: number;
  openai_model?: 'gpt-4o-mini' | 'gpt-4o';
  anthropic_model?: 'claude-haiku-4-5-20251001' | 'claude-sonnet-4-20250514';
  country?: string;
}

export interface RunResponse {
  run_id: string;
  status: RunStatus;
  total_calls: number;
  estimated_cost: number;
  estimated_duration_seconds: number;
}

export type RunStatus = 'queued' | 'running' | 'complete' | 'failed' | 'cancelled';

export interface ProviderStats {
  mentioned: number;
  total: number;
  rate: number;
}

export interface CompetitorStats {
  count: number;
  rate: number;
}

export interface RunSummary {
  brand_mention_rate: number;
  by_provider: Record<string, ProviderStats>;
  competitor_mentions: Record<string, CompetitorStats>;
}

export interface Source {
  url: string;
  title: string;
}

export interface GroundingSupport {
  segment: string;
  chunk_indices: number[];
  confidence_scores: number[];
}

export interface GroundingMetadata {
  supports: GroundingSupport[];
  search_queries: string[];
}

export type BrandSentiment = 'strong_endorsement' | 'positive_endorsement' | 'neutral_mention' | 'conditional' | 'negative_comparison' | 'not_mentioned';

export interface Result {
  id: string;
  prompt: string;
  provider: string;
  model: string;
  temperature: number;
  repeat_index: number;
  response_text: string | null;
  error: string | null;
  brand_mentioned: boolean;
  competitors_mentioned: string[];
  response_type: string | null;
  tokens: number | null;
  cost: number | null;
  sources: Source[] | null;
  grounding_metadata: GroundingMetadata | null;
  brand_sentiment: BrandSentiment | null;
  competitor_sentiments: Record<string, BrandSentiment> | null;
  all_brands_mentioned: string[] | null;
  source_brand_sentiments: Record<string, Record<string, BrandSentiment>> | null;
  created_at: string;
}

export interface ExtensionInfo {
  parent_run_id: string | null;
  child_run_ids: string[];
  has_running_extension: boolean;
}

export interface RunStatusResponse {
  run_id: string;
  status: RunStatus;
  brand: string;
  search_type: SearchType;
  total_calls: number;
  completed_calls: number;
  failed_calls: number;
  progress_percent: number;
  estimated_seconds_remaining: number | null;
  actual_cost: number;
  created_at: string;
  completed_at: string | null;
  summary: RunSummary | null;
  results: Result[];
  config?: RunConfig;
  extension_info?: ExtensionInfo;
}

export interface CancelResponse {
  run_id: string;
  status: RunStatus;
  completed_calls: number;
  cancelled_calls: number;
  actual_cost: number;
}

export interface ApiError {
  detail: string;
}

export interface AISummaryResponse {
  run_id: string;
  summary: string;
  recommendations: string;  // Prose-style strategy brief
  generated_at: string;
}

export interface CategorizeRequest {
  domains: string[];
}

export interface CategorizeResponse {
  categories: Record<string, string>;
}

export interface ScheduledReport {
  id: string;
  user_id: string;
  name: string;
  brand: string;
  search_type: SearchType;
  location?: string;
  prompts: string[];
  competitors: string[];
  providers: string[];
  temperatures: number[];
  repeats: number;
  frequency: 'daily' | 'weekly';
  day_of_week: number | null;
  hour: number;
  timezone: string;
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string;
  created_at: string;
  updated_at: string;
}

export interface ScheduledReportCreate {
  name: string;
  brand: string;
  search_type?: SearchType;
  location?: string;
  prompts: string[];
  competitors: string[];
  providers: string[];
  temperatures: number[];
  repeats?: number;
  frequency: 'daily' | 'weekly';
  day_of_week?: number | null;
  hour?: number;
  timezone?: string;
}

export interface ScheduledReportUpdate {
  name?: string;
  brand?: string;
  search_type?: SearchType;
  location?: string;
  prompts?: string[];
  competitors?: string[];
  providers?: string[];
  temperatures?: number[];
  repeats?: number;
  frequency?: 'daily' | 'weekly';
  day_of_week?: number | null;
  hour?: number;
  timezone?: string;
}

export interface ScheduledReportListResponse {
  reports: ScheduledReport[];
  total: number;
}

export interface ToggleResponse {
  id: string;
  is_active: boolean;
  next_run_at: string | null;
}

export interface RunNowResponse {
  id: string;
  run_id: string;
  message: string;
}

export interface ExtendRunRequest {
  add_prompts?: string[];
  add_competitors?: string[];
  add_providers?: string[];
}

export interface ExtendRunResponse {
  run_id: string;
  status: RunStatus;
  total_calls: number;
  estimated_cost: number;
  estimated_duration_seconds: number;
}

// Site Audit Types

export type SiteAuditStatus = 'queued' | 'running' | 'complete' | 'failed';

export interface SiteAuditRequest {
  url: string;
  session_id: string;
}

export interface SiteAuditResponse {
  audit_id: string;
  status: SiteAuditStatus;
  url: string;
}

export interface CrawlerStatus {
  name: string;
  user_agent: string;
  allowed: boolean;
  rule: string | null;
}

export interface RobotsTxtResult {
  found: boolean;
  crawlers: CrawlerStatus[];
  raw_content: string | null;
}

export interface MetaDirectivesResult {
  has_noai: boolean;
  has_noimageai: boolean;
  x_robots_tag: string | null;
  meta_robots_content: string | null;
}

export interface LlmsTxtResult {
  found: boolean;
  content: string | null;
  parsed_sections: Record<string, string> | null;
}

export interface StructuredDataItem {
  type: string;
  properties: Record<string, unknown>;
}

export interface StructuredDataResult {
  has_json_ld: boolean;
  has_open_graph: boolean;
  has_twitter_cards: boolean;
  json_ld_types: string[];
  json_ld_items: StructuredDataItem[];
  open_graph_tags: Record<string, string>;
  twitter_card_tags: Record<string, string>;
}

export interface ContentAccessibilityResult {
  initial_html_length: number;
  has_noscript_content: boolean;
  estimated_ssr: boolean;
  content_snippet: string | null;
}

export interface HeadingItem {
  level: number;
  text: string;
}

export interface ContentStructureResult {
  has_valid_heading_hierarchy: boolean;
  headings: HeadingItem[];
  has_header: boolean;
  has_main: boolean;
  has_footer: boolean;
  has_article: boolean;
  has_nav: boolean;
  semantic_elements_count: number;
}

export interface AuditResults {
  robots_txt: RobotsTxtResult;
  meta_directives: MetaDirectivesResult;
  llms_txt: LlmsTxtResult;
  structured_data: StructuredDataResult;
  content_accessibility: ContentAccessibilityResult;
  content_structure: ContentStructureResult;
}

export interface Recommendation {
  category: string;
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
}

export interface SiteAuditResult {
  audit_id: string;
  url: string;
  status: SiteAuditStatus;
  overall_score: number | null;
  results: AuditResults | null;
  recommendations: Recommendation[] | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface SiteAuditListResponse {
  audits: SiteAuditResult[];
  total: number;
}
