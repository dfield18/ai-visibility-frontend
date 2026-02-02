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
1. A business/brand/company name (including local businesses, restaurants, hotels, etc.)
2. A product category (like "cars", "shoes", "laptops", "restaurants", "software")

IMPORTANT: Be PERMISSIVE with business names. Accept any plausible business name, even if you don't recognize it. Local restaurants, hotels, law firms, dental practices, small businesses - these are ALL valid. Only reject clear gibberish.

Your task:
1. FIRST, determine if the input is a CATEGORY or a BRAND/BUSINESS:
   - Categories are general product/service types: "cars", "shoes", "laptops", "smartphones", "restaurants", "hotels", "software", "headphones", etc.
   - Brands/Businesses are specific names: "Toyota", "Nike", "Joe's Pizza", "The Grand Oak Hotel", "Smith & Associates Law", etc.

2. If it's a CATEGORY, return it normalized (e.g., "car" → "cars", "shoe" → "shoes"):
   {"valid": true, "type": "category", "correctedName": "normalized category", "suggestions": null}

3. If it's a BRAND/BUSINESS NAME:
   - If it's a well-known brand with a typo, correct it: {"valid": true, "type": "brand", "correctedName": "Corrected Name", "suggestions": null}
   - If it's a name you don't recognize but it LOOKS like a business name, accept it as-is: {"valid": true, "type": "brand", "correctedName": "The Input As Provided", "suggestions": null}
   - If it's ambiguous and could refer to MULTIPLE well-known brands: {"valid": true, "type": "brand", "correctedName": null, "suggestions": [{"name": "Brand 1", "description": "Brief description"}, {"name": "Brand 2", "description": "Brief description"}]}

4. ONLY mark as invalid if the input is clearly gibberish (random letters/characters with no meaning):
   {"valid": false, "type": null, "correctedName": null, "suggestions": null}

Examples:
- "cars" → {"valid": true, "type": "category", "correctedName": "cars", "suggestions": null}
- "toymota" → {"valid": true, "type": "brand", "correctedName": "Toyota", "suggestions": null}
- "Joe's Pizza" → {"valid": true, "type": "brand", "correctedName": "Joe's Pizza", "suggestions": null}
- "The Grand Oak Hotel" → {"valid": true, "type": "brand", "correctedName": "The Grand Oak Hotel", "suggestions": null}
- "Riverside Family Dentistry" → {"valid": true, "type": "brand", "correctedName": "Riverside Family Dentistry", "suggestions": null}
- "spirit" → {"valid": true, "type": "brand", "correctedName": null, "suggestions": [{"name": "Spirit Airlines", "description": "..."}, {"name": "Spirit Halloween", "description": "..."}]}
- "asdfghjkl" → {"valid": false, "type": null, "correctedName": null, "suggestions": null}

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
