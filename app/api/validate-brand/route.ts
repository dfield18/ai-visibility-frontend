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
          content: `You are a brand name validator. Given a user input, determine if it's a real brand/company name.

Your task:
1. If the input is a real brand but has typos, correct the spelling (e.g., "Toymota" → "Toyota", "Mcdonalds" → "McDonald's")
2. If the input is a real brand but has incorrect capitalization, fix it (e.g., "ford" → "Ford", "NIKE" → "Nike")
3. If the input is gibberish or clearly not a real brand, return null

Respond ONLY with a JSON object in this exact format:
{"valid": true, "correctedName": "Brand Name"} or {"valid": false, "correctedName": null}

Do not include any other text or explanation.`,
        },
        {
          role: 'user',
          content: brand,
        },
      ],
      temperature: 0,
      max_tokens: 100,
    });

    const content = response.choices[0]?.message?.content?.trim();

    if (!content) {
      return NextResponse.json(
        { valid: true, correctedName: brand },
        { status: 200 }
      );
    }

    try {
      const result = JSON.parse(content);
      return NextResponse.json(result, { status: 200 });
    } catch {
      // If parsing fails, assume the brand is valid as-is
      return NextResponse.json(
        { valid: true, correctedName: brand },
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
