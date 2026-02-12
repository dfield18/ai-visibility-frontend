'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SignedIn, SignedOut, UserButton } from '@clerk/nextjs';
import { Check, ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { useBillingStatus } from '@/hooks/useBilling';

const FREE_FEATURES = [
  '1 free visibility report',
  '2 AI providers (ChatGPT & Gemini)',
  'Basic visibility metrics',
  'Site audit tool',
];

const PRO_FEATURES = [
  'Unlimited visibility reports',
  'All 7 AI providers',
  'Full competitive landscape analysis',
  'Sentiment & tone analysis',
  'Source tracking & influencers',
  'AI-powered recommendations',
  'Automated scheduled reports',
  'ChatGPT advertising insights',
  'CSV & PDF exports',
  'Priority support',
];

export default function PricingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const success = searchParams.get('success');
  const canceled = searchParams.get('canceled');
  const reason = searchParams.get('reason');
  const [isLoading, setIsLoading] = useState(false);
  const { data: billing } = useBillingStatus();

  const handleUpgrade = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/billing/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnUrl: '/pricing' }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Checkout error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleManageBilling = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnUrl: '/pricing' }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Portal error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-[#FAFAF8] flex flex-col"
      style={{
        backgroundImage: `
          linear-gradient(to right, rgba(0,0,0,0.03) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(0,0,0,0.03) 1px, transparent 1px)
        `,
        backgroundSize: '48px 48px',
      }}
    >
      {/* Navigation */}
      <header className="sticky top-0 z-50 bg-[#FAFAF8]/95 backdrop-blur-sm border-b border-gray-100">
        <nav className="flex items-center justify-between px-8 py-4 max-w-7xl mx-auto">
          <a href="/" className="text-xl font-medium text-gray-900">Visibility</a>
          <div className="flex items-center gap-4">
            <SignedOut>
              <a href="/sign-in" className="text-gray-600 hover:text-gray-900 text-sm">Sign in</a>
              <a href="/sign-up" className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors">
                Get Started
              </a>
            </SignedOut>
            <SignedIn>
              <UserButton appearance={{ elements: { avatarBox: 'w-9 h-9' } }} />
            </SignedIn>
          </div>
        </nav>
      </header>

      <main className="flex-1 max-w-5xl mx-auto px-8 py-16 w-full">
        {/* Success/Cancel banners */}
        {success && (
          <div className="mb-8 p-4 bg-green-50 border border-green-200 rounded-xl text-center">
            <p className="text-green-800 font-medium">Welcome to Pro! Your subscription is now active.</p>
          </div>
        )}
        {canceled && (
          <div className="mb-8 p-4 bg-gray-50 border border-gray-200 rounded-xl text-center">
            <p className="text-gray-600">Checkout was canceled. No charges were made.</p>
          </div>
        )}
        {reason === 'limit' && (
          <div className="mb-8 p-4 bg-amber-50 border border-amber-200 rounded-xl text-center">
            <p className="text-amber-800 font-medium">You&apos;ve used your free report. Upgrade to Pro for unlimited reports.</p>
          </div>
        )}

        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-normal text-gray-900 tracking-tight mb-3">
            Simple, transparent pricing
          </h1>
          <p className="text-lg text-gray-500 max-w-lg mx-auto">
            Start free and upgrade when you need the full picture.
          </p>
        </div>

        {/* Plans */}
        <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
          {/* Free Plan */}
          <div className="bg-white rounded-2xl border border-gray-200 p-8">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Free</h2>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-semibold text-gray-900">$0</span>
                <span className="text-gray-500">/month</span>
              </div>
              <p className="text-sm text-gray-500 mt-2">Get started with basic AI visibility insights</p>
            </div>
            <ul className="space-y-3 mb-8">
              {FREE_FEATURES.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5 text-sm text-gray-600">
                  <Check className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>
            <button
              disabled
              className="w-full py-2.5 text-sm font-medium text-gray-500 bg-gray-100 rounded-lg cursor-default"
            >
              Current Plan
            </button>
          </div>

          {/* Pro Plan */}
          <div className="bg-white rounded-2xl border-2 border-gray-900 p-8 relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="inline-flex items-center gap-1 px-3 py-1 bg-gray-900 text-white text-xs font-medium rounded-full">
                <Sparkles className="w-3 h-3" />
                Most Popular
              </span>
            </div>
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Pro</h2>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-semibold text-gray-900">$49</span>
                <span className="text-gray-500">/month</span>
              </div>
              <p className="text-sm text-gray-500 mt-2">Full AI visibility suite for serious brands</p>
            </div>
            <ul className="space-y-3 mb-8">
              {PRO_FEATURES.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5 text-sm text-gray-700">
                  <Check className="w-4 h-4 text-gray-900 mt-0.5 flex-shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>
            {billing?.hasSubscription ? (
              <button
                onClick={handleManageBilling}
                disabled={isLoading}
                className="w-full py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Manage Subscription
              </button>
            ) : (
              <button
                onClick={handleUpgrade}
                disabled={isLoading}
                className="w-full py-2.5 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    Upgrade to Pro
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
