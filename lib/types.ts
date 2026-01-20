export interface SuggestRequest {
  brand: string;
  industry?: string;
}

export interface SuggestResponse {
  brand: string;
  prompts: string[];
  competitors: string[];
}

export interface RunConfig {
  session_id: string;
  brand: string;
  prompts: string[];
  competitors: string[];
  providers: string[];
  temperatures: number[];
  repeats: number;
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
  created_at: string;
}

export interface RunStatusResponse {
  run_id: string;
  status: RunStatus;
  brand: string;
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
