"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { Loader2, X, Building2, PenLine, MapPin, ArrowRight } from "lucide-react";
import { useStore } from "@/hooks/useStore";
import { LocationInput } from "@/components/LocationInput";

// Version identifier for debugging deployments
const HOMEPAGE_VERSION = "3.1.0-views-headline";

interface BrandSuggestion {
  name: string;
  description: string;
}

export default function Home() {
  // Debug logging on mount
  useEffect(() => {
    console.log("===========================================");
    console.log("🏠 AI Visibility Homepage Loaded");
    console.log(`📦 Version: ${HOMEPAGE_VERSION}`);
    console.log(`🕐 Loaded at: ${new Date().toISOString()}`);
    console.log("🎨 Design: Screenshot design with blue 'views' headline, Analyze button");
    console.log("===========================================");
  }, []);

  const [brandInput, setBrandInput] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<BrandSuggestion[] | null>(null);
  const [showLocationPrompt, setShowLocationPrompt] = useState(false);
  const [pendingBrandName, setPendingBrandName] = useState("");
  const router = useRouter();
  const { setBrand, setSearchType, setLocation, setLocationCoords, resetConfig } = useStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brandInput.trim()) return;

    console.log(`🔍 Submitting brand search: "${brandInput}"`);

    setIsValidating(true);
    setError(null);
    setSuggestions(null);

    try {
      const response = await fetch("/api/validate-brand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand: brandInput.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to validate brand");
      }

      if (!data.valid) {
        setError("Please enter a valid brand name");
        setIsValidating(false);
        return;
      }

      // Check if there are multiple suggestions
      if (data.suggestions && data.suggestions.length > 1) {
        setSuggestions(data.suggestions);
        setIsValidating(false);
        return;
      }

      // Use the corrected brand name or first suggestion
      const brandName = data.correctedName ||
        (data.suggestions && data.suggestions[0]?.name) ||
        brandInput.trim();

      const searchType = data.type || 'brand';
      console.log(`✅ Validated: "${brandName}" (type: ${searchType})`);

      // For local search type, show location prompt first
      if (searchType === 'local') {
        console.log("📍 Local search detected, showing location prompt");
        setPendingBrandName(brandName);
        setShowLocationPrompt(true);
        setIsValidating(false);
        return;
      }

      setBrand(brandName);
      setSearchType(searchType);
      resetConfig();
      router.push("/configure");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setIsValidating(false);
    }
  };

  const handleExampleClick = (value: string) => {
    setBrandInput(value);
  };

  const handleSelectBrand = (brandName: string) => {
    setBrand(brandName);
    setSearchType('brand');
    resetConfig();
    setSuggestions(null);
    router.push("/configure");
  };

  const handleCloseSuggestions = () => {
    setSuggestions(null);
  };

  const handleLocationChange = (location: string, coords?: { lat: number; lng: number }) => {
    setLocation(location);
    if (coords) {
      setLocationCoords(coords);
    }
  };

  const handleLocationContinue = () => {
    setBrand(pendingBrandName);
    setSearchType('local');
    resetConfig();
    setShowLocationPrompt(false);
    router.push("/configure");
  };

  const handleCloseLocationPrompt = () => {
    setShowLocationPrompt(false);
    setPendingBrandName("");
    setLocation("");
    setLocationCoords(null);
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
          <span className="text-xl font-medium text-gray-900">Visibility</span>
          <div className="flex items-center gap-8">
            <a href="#features" className="text-gray-500 hover:text-gray-900 text-sm">
              Features
            </a>
            <a href="#pricing" className="text-gray-500 hover:text-gray-900 text-sm">
              Pricing
            </a>
            <a href="#about" className="text-gray-500 hover:text-gray-900 text-sm">
              About
            </a>
          </div>
          <div className="flex items-center gap-4">
            <SignedOut>
              <a
                href="/sign-in"
                className="text-gray-600 hover:text-gray-900 text-sm"
              >
                Sign in
              </a>
              <a
                href="/sign-up"
                className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
              >
                Get Started
              </a>
            </SignedOut>
            <SignedIn>
              <UserButton
                appearance={{
                  elements: {
                    avatarBox: "w-9 h-9",
                  },
                }}
              />
            </SignedIn>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <main className="flex-1 max-w-7xl mx-auto px-8 pt-20 pb-16 w-full">
        <div className="grid lg:grid-cols-2 gap-16 items-start">
          {/* Left Column */}
          <div className="pt-8">
            {/* Headline */}
            <h1 className="text-5xl md:text-6xl font-normal text-gray-900 tracking-tight leading-[1.1] mb-4">
              See how AI<br />
              <span className="italic font-serif" style={{ color: '#4285f4' }}>views</span> your<br />
              brand
            </h1>

            {/* Subheadline */}
            <p className="text-lg text-gray-500 mb-10 max-w-md">
              Discover how ChatGPT, Claude, and Gemini recommend your brand vs competitors. Get actionable insights to improve your AI visibility.
            </p>

            {/* Search Form */}
            <form onSubmit={handleSubmit} className="mb-6">
              <div className={`flex items-center bg-white border rounded-lg overflow-hidden ${error ? 'border-red-300' : 'border-gray-200'}`}>
                <input
                  type="text"
                  placeholder="brand, industry or comparison"
                  value={brandInput}
                  onChange={(e) => {
                    setBrandInput(e.target.value);
                    if (error) setError(null);
                  }}
                  disabled={isValidating}
                  className="flex-1 px-4 py-3.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none bg-transparent disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!brandInput.trim() || isValidating}
                  className="px-6 py-3.5 text-sm bg-gray-900 text-white font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isValidating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Analyzing
                    </>
                  ) : (
                    <>
                      Analyze
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>

              {error && (
                <p className="mt-2 text-sm text-red-600">{error}</p>
              )}
            </form>

            {/* TRY Examples */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-gray-400">TRY:</span>
              <button
                type="button"
                onClick={() => handleExampleClick("Nike")}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-colors"
              >
                Nike <span className="text-gray-400">(Brand)</span>
              </button>
              <button
                type="button"
                onClick={() => handleExampleClick("Sneakers")}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-colors"
              >
                Sneakers <span className="text-gray-400">(Industry)</span>
              </button>
              <button
                type="button"
                onClick={() => handleExampleClick("Nike vs Reebok")}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-colors"
              >
                Nike vs Reebok <span className="text-gray-400">(Compare)</span>
              </button>
            </div>
          </div>

          {/* Right Column - Dashboard Preview Card */}
          <div className="flex justify-center lg:justify-end">
            <div className="bg-white rounded-xl border border-gray-200 w-full max-w-sm">
              {/* Card Header */}
              <div className="px-5 py-4 border-b border-gray-100">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Visibility Report</p>
                <p className="text-xl font-medium text-gray-900">Nike</p>
              </div>

              {/* Platform Scores */}
              <div className="px-5 py-4 border-b border-gray-100">
                <div className="grid grid-cols-3 gap-4">
                  {/* ChatGPT - Green */}
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <svg className="w-4 h-4" style={{ color: '#10a37f' }} viewBox="0 0 24 24" fill="currentColor">
                        <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.896zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08-4.778 2.758a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/>
                      </svg>
                      <span className="text-xs" style={{ color: '#10a37f' }}>ChatGPT</span>
                    </div>
                    <p className="text-2xl font-semibold" style={{ color: '#10a37f' }}>87</p>
                  </div>
                  {/* Claude - Orange/Tan */}
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <svg className="w-4 h-4" style={{ color: '#d97706' }} viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                      </svg>
                      <span className="text-xs" style={{ color: '#d97706' }}>Claude</span>
                    </div>
                    <p className="text-2xl font-semibold" style={{ color: '#d97706' }}>72</p>
                  </div>
                  {/* Gemini - Blue */}
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <svg className="w-4 h-4" style={{ color: '#4285f4' }} viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                      </svg>
                      <span className="text-xs" style={{ color: '#4285f4' }}>Gemini</span>
                    </div>
                    <p className="text-2xl font-semibold" style={{ color: '#4285f4' }}>65</p>
                  </div>
                </div>
              </div>

              {/* Overall Visibility */}
              <div className="px-5 py-6 border-b border-gray-100 text-center">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Overall Visibility</p>
                <p className="text-5xl font-semibold text-gray-900">
                  75<span className="text-2xl text-gray-400 font-normal">/100</span>
                </p>
              </div>

              {/* Recent Mentions */}
              <div className="px-5 py-4">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Recent Mentions</p>
                <div className="space-y-2">
                  <p className="text-sm text-gray-600">&quot;Best running shoes for beginners&quot;</p>
                  <p className="text-sm text-gray-600">&quot;Top athletic brands in 2024&quot;</p>
                  <p className="text-sm text-gray-600">&quot;Sneakers for marathon training&quot;</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Industry Report Footer */}
      <footer className="bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-8 py-4 flex items-center justify-between">
          <span className="font-medium">Industry Report</span>
          <a href="#" className="text-sm text-gray-300 hover:text-white flex items-center gap-1">
            View report
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </footer>

      {/* Brand Suggestions Modal */}
      {suggestions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={handleCloseSuggestions}
          />
          <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
            <button
              onClick={handleCloseSuggestions}
              className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Which brand did you mean?
              </h2>
              <p className="text-sm text-gray-500">
                We found multiple brands matching &quot;{brandInput}&quot;
              </p>
            </div>
            <div className="space-y-3">
              {suggestions.map((suggestion, index) => {
                const isUseAsEntered = suggestion.description.toLowerCase().includes('use as entered');
                return (
                  <button
                    key={index}
                    onClick={() => handleSelectBrand(suggestion.name)}
                    className={`w-full p-4 text-left rounded-xl transition-colors group ${
                      isUseAsEntered
                        ? 'bg-white border-2 border-dashed border-gray-300 hover:border-gray-900 hover:bg-gray-50'
                        : 'bg-gray-50 hover:bg-gray-100'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isUseAsEntered
                          ? 'bg-gray-100 group-hover:bg-gray-200'
                          : 'bg-white group-hover:bg-gray-100'
                      }`}>
                        {isUseAsEntered ? (
                          <PenLine className="w-5 h-5 text-gray-500" />
                        ) : (
                          <Building2 className="w-5 h-5 text-gray-700" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{suggestion.name}</p>
                        <p className="text-sm text-gray-500">
                          {isUseAsEntered ? 'Different business - use my exact input' : suggestion.description}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="mt-6 pt-4 border-t border-gray-100">
              <button
                onClick={handleCloseSuggestions}
                className="w-full py-2.5 text-sm text-gray-600 hover:text-gray-900 font-medium"
              >
                Cancel and try a different search
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Location Prompt Modal */}
      {showLocationPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={handleCloseLocationPrompt}
          />
          <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
            <button
              onClick={handleCloseLocationPrompt}
              className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="mb-6 text-center">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <MapPin className="w-6 h-6 text-gray-700" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Where are you searching?
              </h2>
              <p className="text-sm text-gray-500">
                We&apos;ll find the best <span className="font-medium">{pendingBrandName}</span> in your area
              </p>
            </div>
            <LocationInput
              value=""
              onChange={handleLocationChange}
              onContinue={handleLocationContinue}
              showContinueButton
            />
            <div className="mt-6 pt-4 border-t border-gray-100">
              <button
                onClick={handleCloseLocationPrompt}
                className="w-full py-2.5 text-sm text-gray-600 hover:text-gray-900 font-medium"
              >
                Cancel and try a different search
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
