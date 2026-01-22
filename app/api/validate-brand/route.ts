import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { brand } = await request.json();

    if (!brand || typeof brand !== 'string') {
      return NextResponse.json(
        { error: 'Brand name is required' },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a brand name validator and suggester. Given a user input, determine if it's a real brand/company name.

Your task:
1. If the input clearly matches ONE specific well-known brand (even with typos or wrong capitalization), return that brand with corrected spelling.
   Examples: "toymota" → Toyota, "mcdonalds" → McDonald's, "nike" → Nike

2. If the input is partial or ambiguous and could refer to MULTIPLE different brands/companies, return all matching options (up to 5).
   Examples:
   - "spirit" → Spirit Airlines, Spirit Halloween
   - "apple" → Apple (the one tech company, so just return Apple)
   - "delta" → Delta Air Lines, Delta Faucet
   - "amazon" → Amazon (the one company, so just return Amazon)
   - "united" → United Airlines, United Healthcare, United Rentals

3. If the input is gibberish or clearly not a real brand, return as invalid.

Respond ONLY with a JSON object in one of these formats:

For a clear single match:
{"valid": true, "correctedName": "Brand Name", "suggestions": null}

For ambiguous input with multiple possible brands:
{"valid": true, "correctedName": null, "suggestions": [{"name": "Brand Name 1", "description": "Brief description"}, {"name": "Brand Name 2", "description": "Brief description"}]}

For invalid input:
{"valid": false, "correctedName": null, "suggestions": null}

Do not include any other text or explanation.`,
        },
        {
          role: 'user',
          content: brand,
        },
      ],
      temperature: 0,
      max_tokens: 300,
    });

    const content = response.choices[0]?.message?.content?.trim();

    if (!content) {
      return NextResponse.json(
        { valid: true, correctedName: brand, suggestions: null },
        { status: 200 }
      );
    }

    try {
      const result = JSON.parse(content);
      return NextResponse.json(result, { status: 200 });
    } catch {
      // If parsing fails, assume the brand is valid as-is
      return NextResponse.json(
        { valid: true, correctedName: brand, suggestions: null },
        { status: 200 }
      );
    }
  } catch (error) {
    console.error('Brand validation error:', error);
    return NextResponse.json(
      { error: 'Failed to validate brand' },
      { status: 500 }
    );
  }
}
