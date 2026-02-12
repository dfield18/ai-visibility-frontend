import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { brand, industry, search_type } = await request.json();

    if (!brand || typeof brand !== 'string') {
      return NextResponse.json(
        { error: 'Brand name is required' },
        { status: 400 }
      );
    }

    // If frontend explicitly provides a search type, use it directly
    // (skip auto-inference for issue and public_figure)
    if (search_type === 'issue') {
      return NextResponse.json(
        { valid: true, type: 'issue', correctedName: brand.trim(), suggestions: null },
        { status: 200 }
      );
    }
    if (search_type === 'public_figure') {
      return NextResponse.json(
        { valid: true, type: 'public_figure', correctedName: brand.trim(), suggestions: null },
        { status: 200 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    // Build context string if industry is provided
    const industryContext = industry
      ? `\n\nIMPORTANT CONTEXT: The user has indicated this is a "${industry}" business. Use this context to help identify the correct business and avoid confusing it with companies in other industries.`
      : '';

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a brand and category validator. Given a user input, determine if it's:
1. A business/brand/company name (including local businesses, restaurants, hotels, coliving spaces, etc.)
2. A product category (physical goods people buy: "cars", "shoes", "laptops", "smartphones", "headphones")
3. A LOCAL service category (businesses/services people visit or hire locally)
${industryContext}

LOCAL SERVICE CATEGORIES include:
- Food & Drink: restaurants, coffee shops, cafes, bars, bakeries, food trucks
- Fitness & Wellness: gyms, yoga studios, fitness centers, spas, massage
- Personal Care: hair salons, barbershops, nail salons, beauty salons
- Health: dentists, doctors, veterinarians, chiropractors, physical therapists
- Home Services: plumbers, electricians, contractors, landscapers, cleaners
- Hospitality: hotels, motels, bed and breakfasts, Airbnbs
- Auto: auto repair, car wash, mechanics, tire shops
- Other: dry cleaners, laundromats, pet groomers, tutors, photographers

IMPORTANT RULES:
- Be PERMISSIVE with business names. Accept any plausible business name, even if you don't recognize it.
- Local restaurants, hotels, coliving spaces, law firms, dental practices, small businesses - these are ALL valid.
- Only reject clear gibberish (random letters/characters with no meaning).
- Be CONSERVATIVE with auto-corrections. Only auto-correct if you are >95% confident it's a typo of a well-known brand (e.g., 1-2 character difference like "toymota" → "Toyota").
- If there's ANY chance the input is a DIFFERENT business (not a typo), provide suggestions instead of auto-correcting.

Your task:
1. FIRST, determine if the input is a CATEGORY (product or local) or a BRAND/BUSINESS:
   - PRODUCT categories: physical goods people buy - "cars", "shoes", "laptops", "smartphones", "headphones", "software"
   - LOCAL categories: service businesses people visit locally - "restaurants", "coffee shops", "gyms", "dentists", "plumbers", "hotels"
   - Brands/Businesses are specific names: "Toyota", "Nike", "Joe's Pizza", "The Grand Oak Hotel", etc.

2. If it's a PRODUCT CATEGORY (things people buy), return type "category":
   {"valid": true, "type": "category", "correctedName": "normalized category", "suggestions": null}

3. If it's a LOCAL SERVICE CATEGORY (businesses people visit locally), return type "local":
   {"valid": true, "type": "local", "correctedName": "normalized category", "suggestions": null}

4. If it's a BRAND/BUSINESS NAME:

   a) CLEAR TYPO (>95% confidence, 1-2 character difference from well-known brand):
      {"valid": true, "type": "brand", "correctedName": "Corrected Name", "suggestions": null}

   b) AMBIGUOUS (could be a typo OR a different business with similar name):
      ALWAYS include the original input as "Use as entered" option:
      {"valid": true, "type": "brand", "correctedName": null, "suggestions": [
        {"name": "Well-Known Brand", "description": "Brief description of the well-known brand"},
        {"name": "ORIGINAL_INPUT_HERE", "description": "Use as entered (different business)"}
      ]}

   c) UNRECOGNIZED but looks like a business name:
      Accept as-is without correction:
      {"valid": true, "type": "brand", "correctedName": "The Input As Provided", "suggestions": null}

   d) AMBIGUOUS between MULTIPLE well-known brands:
      {"valid": true, "type": "brand", "correctedName": null, "suggestions": [
        {"name": "Brand 1", "description": "Brief description"},
        {"name": "Brand 2", "description": "Brief description"},
        {"name": "ORIGINAL_INPUT_HERE", "description": "Use as entered (different business)"}
      ]}

5. ONLY mark as invalid if the input is clearly gibberish:
   {"valid": false, "type": null, "correctedName": null, "suggestions": null}

Examples:
- "cars" → {"valid": true, "type": "category", "correctedName": "cars", "suggestions": null}
- "laptops" → {"valid": true, "type": "category", "correctedName": "laptops", "suggestions": null}
- "coffee shops" → {"valid": true, "type": "local", "correctedName": "coffee shops", "suggestions": null}
- "restaurants" → {"valid": true, "type": "local", "correctedName": "restaurants", "suggestions": null}
- "gyms" → {"valid": true, "type": "local", "correctedName": "gyms", "suggestions": null}
- "dentists" → {"valid": true, "type": "local", "correctedName": "dentists", "suggestions": null}
- "plumbers" → {"valid": true, "type": "local", "correctedName": "plumbers", "suggestions": null}
- "italian restaurants" → {"valid": true, "type": "local", "correctedName": "italian restaurants", "suggestions": null}
- "toymota" → {"valid": true, "type": "brand", "correctedName": "Toyota", "suggestions": null} (clear 2-char typo)
- "Joe's Pizza" → {"valid": true, "type": "brand", "correctedName": "Joe's Pizza", "suggestions": null}
- "spirit" → {"valid": true, "type": "brand", "correctedName": null, "suggestions": [{"name": "Spirit Airlines", "description": "Budget airline"}, {"name": "Spirit Halloween", "description": "Seasonal costume retailer"}, {"name": "spirit", "description": "Use as entered (different business)"}]}
- "asdfghjkl" → {"valid": false, "type": null, "correctedName": null, "suggestions": null}

Respond ONLY with a JSON object. Do not include any other text or explanation.`,
        },
        {
          role: 'user',
          content: brand,
        },
      ],
      temperature: 0,
      max_tokens: 400,
    });

    const content = response.choices[0]?.message?.content?.trim();

    if (!content) {
      return NextResponse.json(
        { valid: true, type: 'brand', correctedName: brand, suggestions: null },
        { status: 200 }
      );
    }

    try {
      const result = JSON.parse(content);
      return NextResponse.json(result, { status: 200 });
    } catch {
      // If parsing fails, assume the brand is valid as-is
      return NextResponse.json(
        { valid: true, type: 'brand', correctedName: brand, suggestions: null },
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
