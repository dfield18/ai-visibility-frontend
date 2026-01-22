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
          content: `You are a brand and category validator. Given a user input, determine if it's:
1. A real brand/company name
2. A product category (like "cars", "shoes", "laptops", "restaurants", "software")

Your task:
1. FIRST, determine if the input is a CATEGORY or a BRAND:
   - Categories are general product/service types: "cars", "shoes", "laptops", "smartphones", "restaurants", "hotels", "software", "headphones", etc.
   - Brands are specific company/product names: "Toyota", "Nike", "Apple", "McDonald's", etc.

2. If it's a CATEGORY, return it normalized (e.g., "car" → "cars", "shoe" → "shoes"):
   {"valid": true, "type": "category", "correctedName": "normalized category", "suggestions": null}

3. If it's a BRAND that clearly matches ONE specific well-known brand (even with typos):
   {"valid": true, "type": "brand", "correctedName": "Brand Name", "suggestions": null}

4. If it's a BRAND that's ambiguous and could refer to MULTIPLE different brands/companies:
   {"valid": true, "type": "brand", "correctedName": null, "suggestions": [{"name": "Brand Name 1", "description": "Brief description"}, {"name": "Brand Name 2", "description": "Brief description"}]}

5. If the input is gibberish or invalid:
   {"valid": false, "type": null, "correctedName": null, "suggestions": null}

Examples:
- "cars" → {"valid": true, "type": "category", "correctedName": "cars", "suggestions": null}
- "shoe" → {"valid": true, "type": "category", "correctedName": "shoes", "suggestions": null}
- "toymota" → {"valid": true, "type": "brand", "correctedName": "Toyota", "suggestions": null}
- "spirit" → {"valid": true, "type": "brand", "correctedName": null, "suggestions": [{"name": "Spirit Airlines", "description": "..."}, {"name": "Spirit Halloween", "description": "..."}]}

Respond ONLY with a JSON object. Do not include any other text or explanation.`,
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
