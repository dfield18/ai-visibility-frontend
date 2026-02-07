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
          content: `You are a brand website lookup assistant. Given a brand or company name, return their official main website URL.

RULES:
- Return ONLY the main/official website domain (e.g., "nike.com", "apple.com", "coca-cola.com")
- Do NOT include "https://" or "www." prefix - just the domain
- If the brand has multiple regional sites, return the main global or .com domain
- If you're not confident about the website, return null
- For lesser-known or local businesses, make a reasonable guess based on the brand name (e.g., "Joe's Pizza NYC" → "joespizzanyc.com")

Respond ONLY with a JSON object in this format:
{"website": "example.com"} or {"website": null}

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
      return NextResponse.json({ website: null }, { status: 200 });
    }

    try {
      const result = JSON.parse(content);
      return NextResponse.json(result, { status: 200 });
    } catch {
      return NextResponse.json({ website: null }, { status: 200 });
    }
  } catch (error) {
    console.error('Brand website lookup error:', error);
    return NextResponse.json(
      { error: 'Failed to lookup brand website' },
      { status: 500 }
    );
  }
}
