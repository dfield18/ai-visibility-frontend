import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { api } from '@/lib/api';

export async function GET() {
  try {
    const { userId, getToken } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = await getToken();

    // Fetch billing status from backend
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const response = await fetch(`${backendUrl}/api/v1/billing/status`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      // Return default free tier status if backend billing is not available
      return NextResponse.json({
        hasSubscription: false,
        reportsUsed: 0,
        reportsLimit: 1,
        subscriptionStatus: 'none',
        currentPeriodEnd: null,
      });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Billing status error:', error);
    return NextResponse.json({
      hasSubscription: false,
      reportsUsed: 0,
      reportsLimit: 1,
      subscriptionStatus: 'none',
      currentPeriodEnd: null,
    });
  }
}
