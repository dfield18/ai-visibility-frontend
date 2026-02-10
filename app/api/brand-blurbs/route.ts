import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { brands, context } = await request.json();

    if (!Array.isArray(brands) || brands.length === 0) {
      return NextResponse.json(
        { error: 'Brands array is required' },
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
          content: `You are a brand analyst. Given a list of brands and a context about what they're being compared for, provide a short characterization blurb for each brand. Each blurb should be 6-10 words describing what the brand is best known for or its key positioning (e.g., "Excellent choice for serious athletes", "Known for premium running shoes", "Budget-friendly option with wide selection").

Rules:
- Each blurb must be 6-10 words
- Be specific and insightful, not generic
- If you don't have enough knowledge about a brand to write a meaningful blurb, omit it entirely
- Do not include the brand name in the blurb

Respond ONLY with a JSON object mapping brand names to their blurbs. Omit brands you cannot characterize. Example:
{"Nike": "Premium athletic gear for serious competitors", "Adidas": "Iconic sportswear blending performance and street style"}`,
        },
        {
          role: 'user',
          content: `Context: ${context}\n\nBrands: ${brands.join(', ')}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 1000,
    });

    const content = response.choices[0]?.message?.content?.trim();

    if (!content) {
      return NextResponse.json({ blurbs: {} }, { status: 200 });
    }

    try {
      const blurbs = JSON.parse(content);
      return NextResponse.json({ blurbs }, { status: 200 });
    } catch {
      return NextResponse.json({ blurbs: {} }, { status: 200 });
    }
  } catch (error) {
    console.error('Brand blurbs error:', error);
    return NextResponse.json(
      { error: 'Failed to generate brand blurbs' },
      { status: 500 }
    );
  }
}
