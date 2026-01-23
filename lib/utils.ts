/**
 * Generate a unique session ID for the user.
 * Stored in localStorage to persist across page reloads.
 */
export function getSessionId(): string {
  if (typeof window === 'undefined') {
    return generateUUID();
  }

  const stored = localStorage.getItem('session_id');
  if (stored) {
    return stored;
  }

  const newId = generateUUID();
  localStorage.setItem('session_id', newId);
  return newId;
}

/**
 * Generate a UUID v4.
 */
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Format a number as currency.
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(amount);
}

/**
 * Format a percentage value.
 */
export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/**
 * Format seconds into a human-readable duration.
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)} seconds`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  if (remainingSeconds === 0) {
    return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  }
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Format a date string for display.
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

/**
 * Truncate a string to a maximum length.
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Get a color class based on a rate (0-1).
 */
export function getRateColor(rate: number): string {
  if (rate >= 0.7) return 'text-green-600';
  if (rate >= 0.4) return 'text-yellow-600';
  return 'text-red-600';
}

/**
 * Get a background color class based on a rate (0-1).
 */
export function getRateBgColor(rate: number): string {
  if (rate >= 0.7) return 'bg-green-500';
  if (rate >= 0.4) return 'bg-yellow-500';
  return 'bg-red-500';
}

/**
 * Calculate estimated cost based on configuration.
 */
export function calculateEstimatedCost(
  numPrompts: number,
  numProviders: number,
  numTemperatures: number,
  numRepeats: number,
  providers: string[],
  openaiModel: 'gpt-4o-mini' | 'gpt-4o' = 'gpt-4o-mini',
  anthropicModel: 'claude-3-haiku-20240307' | 'claude-sonnet-4-20250514' = 'claude-3-haiku-20240307'
): number {
  // Cost estimates per call based on model
  const costPerCall: Record<string, number> = {
    openai: openaiModel === 'gpt-4o' ? 0.003 : 0.0003,
    gemini: 0.00025,
    anthropic: anthropicModel === 'claude-sonnet-4-20250514' ? 0.003 : 0.0003,
    perplexity: 0.001,
    ai_overviews: 0.005,
  };

  let totalCost = 0;
  for (const provider of providers) {
    const callsPerProvider = numPrompts * numTemperatures * numRepeats;
    totalCost += callsPerProvider * (costPerCall[provider] || 0.002);
  }

  return totalCost;
}

/**
 * Calculate total number of API calls.
 */
export function calculateTotalCalls(
  numPrompts: number,
  numProviders: number,
  numTemperatures: number,
  numRepeats: number
): number {
  return numPrompts * numProviders * numTemperatures * numRepeats;
}

/**
 * Estimate duration in seconds.
 */
export function estimateDuration(totalCalls: number): number {
  // Assume ~0.5 seconds per call with parallelization
  return Math.ceil(totalCalls * 0.5);
}

/**
 * Classnames utility for conditional classes.
 */
export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}
