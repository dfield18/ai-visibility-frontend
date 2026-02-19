import { describe, it, expect } from 'vitest';
import {
  correctBrandMetricsInText,
  correctIndustryAISummary,
} from '../textCorrections';
import type { BrandBreakdownRow } from '../../types';

// ---------------------------------------------------------------------------
// Helper: build mock BrandBreakdownRow[]
// ---------------------------------------------------------------------------

function mockRow(overrides: Partial<BrandBreakdownRow> & { brand: string }): BrandBreakdownRow {
  return {
    isSearchedBrand: false,
    total: 100,
    mentioned: 50,
    visibilityScore: 50,
    shareOfVoice: 25,
    firstPositionRate: 10,
    avgRank: 2,
    avgSentimentScore: 3,
    promptsWithStats: [],
    ...overrides,
  };
}

/** Default stats: Nike (leader, 60/100 = 60% vis, 35% SoV), Adidas (40/100 = 40% vis, 25% SoV) */
function defaultStats(): BrandBreakdownRow[] {
  return [
    mockRow({ brand: 'Nike', mentioned: 60, total: 100, visibilityScore: 60, shareOfVoice: 35 }),
    mockRow({ brand: 'Adidas', mentioned: 40, total: 100, visibilityScore: 40, shareOfVoice: 25 }),
  ];
}

// ---------------------------------------------------------------------------
// correctBrandMetricsInText
// ---------------------------------------------------------------------------

describe('correctBrandMetricsInText', () => {
  // --- SoV rules (3a, 3b) ---

  it('1. SoV + provider context: does NOT rewrite SoV when provider name is near', () => {
    const text = 'ChatGPT gives Nike a 40% share of voice in this analysis.';
    const result = correctBrandMetricsInText(text, defaultStats());
    // The 40% should remain unchanged because "ChatGPT" is nearby
    expect(result).toContain('40% share of voice');
  });

  it('2. SoV + no brand anchor: does NOT rewrite SoV when no brand found in window', () => {
    const text = 'The market shows 40% share of voice overall.';
    const result = correctBrandMetricsInText(text, defaultStats());
    // No brand in window and no leader fallback → unchanged
    expect(result).toContain('40% share of voice');
  });

  it('3. SoV + explicit brand: rewrites SoV correctly when brand is present', () => {
    const text = 'Nike has 40% share of voice in the sneaker market.';
    const result = correctBrandMetricsInText(text, defaultStats());
    // Nike's correct SoV is 35.0%
    expect(result).toContain('35.0% share of voice');
  });

  it('4. SoV reverse pattern + provider: does NOT rewrite share of voice at XX% near provider', () => {
    const text = 'On Gemini, the brand has a share of voice at 50%.';
    const result = correctBrandMetricsInText(text, defaultStats());
    expect(result).toContain('share of voice at 50%');
  });

  it('5. SoV reverse pattern + no brand: does NOT rewrite when no brand anchor', () => {
    const text = 'The category has a share of voice of 50% for top items.';
    const result = correctBrandMetricsInText(text, defaultStats());
    expect(result).toContain('share of voice of 50%');
  });

  it('6. SoV reverse pattern + brand: rewrites correctly', () => {
    const text = 'Adidas holds a share of voice of 50% in the sneaker market.';
    const result = correctBrandMetricsInText(text, defaultStats());
    // Adidas SoV = 25.0%
    expect(result).toContain('share of voice of 25.0%');
  });

  // --- Brand count rules (6a, 6b, 6c) ---

  it('7. Brand count + provider context: does NOT rewrite "ChatGPT found 5 unique brands"', () => {
    const text = 'Overall, ChatGPT found 5 unique brands in its responses.';
    const result = correctBrandMetricsInText(text, defaultStats());
    expect(result).toContain('5 unique brands');
  });

  it('8. Brand count + global cue: rewrites "Overall, 45 unique brands were found"', () => {
    const text = 'Overall, 45 unique brands were identified across all responses.';
    const result = correctBrandMetricsInText(text, defaultStats());
    expect(result).toContain('2 unique brands');
  });

  it('9. Brand count + no global cue: does NOT rewrite "5 unique brands"', () => {
    const text = 'The top provider recommended 5 unique brands.';
    const result = correctBrandMetricsInText(text, defaultStats());
    expect(result).toContain('5 unique brands');
  });

  it('10. Brand count Total label: always rewrites "Total Brands: 45"', () => {
    const text = 'Total Brands: 45';
    const result = correctBrandMetricsInText(text, defaultStats());
    expect(result).toContain('Total Brands: 2');
  });

  // --- Visibility rules (3c, 4, 5) ---

  it('11. Visibility + provider: does NOT rewrite "Claude shows 80% visibility"', () => {
    const text = 'Claude shows 80% visibility for this brand.';
    const result = correctBrandMetricsInText(text, defaultStats());
    expect(result).toContain('80% visibility');
  });

  it('12. Visibility + brand: rewrites "Nike has 80% visibility"', () => {
    const text = 'Nike has 80% visibility across all platforms.';
    const result = correctBrandMetricsInText(text, defaultStats());
    // Nike = 60/100 = 60.0%
    expect(result).toContain('60.0% visibility');
  });

  it('13. "in XX% of" + provider: does NOT rewrite near provider', () => {
    const text = 'On Perplexity, the brand appears in 90% of responses.';
    const result = correctBrandMetricsInText(text, defaultStats());
    expect(result).toContain('in 90% of');
  });

  it('14. "in XX% of" + brand: rewrites with correct brand visibility', () => {
    const text = 'Adidas appears in 90% of AI responses overall.';
    const result = correctBrandMetricsInText(text, defaultStats());
    // Adidas = 40/100 = 40.0%
    expect(result).toContain('in 40.0% of');
  });

  // --- Rule 7 removal ---

  it('15. "mention rate" terminology is NOT auto-renamed', () => {
    const text = 'The brand has a strong mention rate in AI platforms.';
    const result = correctBrandMetricsInText(text, defaultStats());
    expect(result).toContain('mention rate');
    expect(result).not.toContain('visibility score');
  });
});

// ---------------------------------------------------------------------------
// correctIndustryAISummary
// ---------------------------------------------------------------------------

describe('correctIndustryAISummary', () => {
  it('16. Prepends correct top brands header', () => {
    const stats = defaultStats();
    const text = 'The sneaker market shows strong brand competition.';
    const result = correctIndustryAISummary(text, stats);
    expect(result).toMatch(/^\*\*Top brands\*\*: Nike \(60\.0%\), Adidas \(40\.0%\)/);
    expect(result).toContain('2 brands across 100 responses');
  });

  it('17. Strips stray parenthetical percentages', () => {
    const text = 'Nike (75%) leads the market, followed by Adidas (50%).';
    const result = correctIndustryAISummary(text, defaultStats());
    // "(75%)" and "(50%)" should be stripped
    expect(result).not.toMatch(/\(75%\)/);
    expect(result).not.toMatch(/\(50%\)/);
  });

  it('18. Does NOT rename "mention rate" to "visibility score"', () => {
    const text = 'The mention rate for top brands is strong.';
    const result = correctIndustryAISummary(text, defaultStats());
    expect(result).toContain('mention rate');
    expect(result).not.toContain('visibility score');
  });
});
