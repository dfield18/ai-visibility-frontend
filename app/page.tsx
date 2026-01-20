'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useStore } from '@/hooks/useStore';

const EXAMPLE_BRANDS = ['Nike', 'Apple', 'Starbucks', 'Tesla'];

export default function LandingPage() {
  const router = useRouter();
  const { setBrand, resetConfig } = useStore();
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    setIsLoading(true);
    resetConfig();
    setBrand(inputValue.trim());
    router.push('/configure');
  };

  const handleExampleClick = (brand: string) => {
    setInputValue(brand);
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <Card className="w-full max-w-lg" padding="lg">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 mb-4">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            AI Brand Visibility Tracker
          </h1>
          <p className="text-gray-600">
            See how AI recommends your brand across different models
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Enter your brand name (e.g., Nike)"
              className="w-full pl-12 pr-4 py-4 text-lg border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
              autoFocus
            />
          </div>

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={!inputValue.trim()}
            loading={isLoading}
          >
            Get Started
          </Button>
        </form>

        <div className="mt-8 pt-6 border-t border-gray-200">
          <p className="text-sm text-gray-500 text-center mb-3">
            Try an example:
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {EXAMPLE_BRANDS.map((brand) => (
              <button
                key={brand}
                onClick={() => handleExampleClick(brand)}
                className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-full hover:bg-blue-100 transition-colors"
              >
                {brand}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8 text-center">
          <p className="text-xs text-gray-400">
            Powered by OpenAI GPT-4o and Google Gemini
          </p>
        </div>
      </Card>
    </main>
  );
}
