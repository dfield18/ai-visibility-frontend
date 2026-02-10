import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { candidates } = await request.json();

    // candidates: Record<string, { text: string; provider: string; prompt: string }[]>
    if (!candidates || typeof candidates !== 'object') {
      return NextResponse.json({ error: 'candidates object is required' }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }

    const brands = Object.keys(candidates);
    if (brands.length === 0) {
      return NextResponse.json({ quotes: {} }, { status: 200 });
    }

    // Build a prompt that asks GPT to pick the best quotes per brand
    const brandSections = brands.map(brand => {
      const quotes = candidates[brand] as { text: string; provider: string }[];
      if (!quotes || quotes.length === 0) return null;
      const numbered = quotes.map((q, i) => `  ${i + 1}. [${q.provider}] "${q.text}"`).join('\n');
      return `Brand: ${brand}\n${numbered}`;
    }).filter(Boolean).join('\n\n');

    if (!brandSections) {
      return NextResponse.json({ quotes: {} }, { status: 200 });
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are helping curate the best AI-generated quotes about brands for a dashboard.

For each brand, you will be given numbered candidate quotes extracted from AI model responses. Select the best 1-2 quotes per brand that are:
- Actually about that specific brand (not just mentioning it in passing)
- Interesting, insightful, or descriptive (tells you something meaningful about the brand)
- Well-formed natural language sentences (not metadata, lists, tables, or garbled text)
- Diverse (pick quotes that say different things, not the same point twice)

If NONE of the candidates for a brand are good quality (e.g., they're all generic, garbled, or not really about the brand), return an empty array for that brand. Quality over quantity — it's better to show 0-1 great quotes than 2 mediocre ones.

Respond ONLY with a JSON object mapping each brand name to an array of the selected quote numbers (1-indexed). Example:
{"Nike": [1, 3], "Adidas": [2], "Puma": []}`,
        },
        {
          role: 'user',
          content: brandSections,
        },
      ],
      temperature: 0,
      max_tokens: 500,
    });

    const content = response.choices[0]?.message?.content?.trim();

    if (!content) {
      return NextResponse.json({ quotes: {} }, { status: 200 });
    }

    try {
      // Parse the JSON response - extract just the JSON part if there's extra text
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const selections: Record<string, number[]> = JSON.parse(jsonMatch ? jsonMatch[0] : content);

      // Map selections back to actual quote objects
      const result: Record<string, { text: string; provider: string; prompt: string }[]> = {};
      for (const brand of brands) {
        const indices = selections[brand] ?? [];
        const brandCandidates = candidates[brand] ?? [];
        result[brand] = indices
          .filter(i => i >= 1 && i <= brandCandidates.length)
          .map((i: number) => brandCandidates[i - 1]);
      }

      const usage = response.usage;
      const inputCost = (usage?.prompt_tokens ?? 0) * 0.00000015;
      const outputCost = (usage?.completion_tokens ?? 0) * 0.0000006;

      return NextResponse.json({ quotes: result, cost: inputCost + outputCost }, { status: 200 });
    } catch {
      return NextResponse.json({ quotes: {}, cost: 0 }, { status: 200 });
    }
  } catch (error) {
    console.error('Filter quotes error:', error);
    return NextResponse.json({ error: 'Failed to filter quotes' }, { status: 500 });
  }
}
