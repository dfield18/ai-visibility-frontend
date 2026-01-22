"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Eye, Sparkles, Zap, Loader2, X, Building2 } from "lucide-react";
import { useStore } from "@/hooks/useStore";

interface BrandSuggestion {
  name: string;
  description: string;
}

export default function Home() {
  const [brandInput, setBrandInput] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<BrandSuggestion[] | null>(null);
  const router = useRouter();
  const { setBrand, setSearchType, resetConfig } = useStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brandInput.trim()) return;

    setIsValidating(true);
    setError(null);
    setSuggestions(null);

    try {
      const response = await fetch("/api/validate-brand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand: brandInput.trim() }),
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
      setBrand(brandName);
      setSearchType(data.type || 'brand');
      resetConfig();
      router.push("/configure");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setIsValidating(false);
    }
  };

  const handleSelectBrand = (brandName: string) => {
    setBrand(brandName);
    setSearchType('brand'); // Suggestions are always brands
    resetConfig();
    setSuggestions(null);
    router.push("/configure");
  };

  const handleCloseSuggestions = () => {
    setSuggestions(null);
  };

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      {/* Navigation */}
      <header className="sticky top-0 z-50 bg-[#FAFAF8]">
        <nav className="flex items-center justify-between px-8 py-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#E8F0E8] flex items-center justify-center">
              <Eye className="w-4 h-4 text-[#4A7C59]" />
            </div>
            <span className="font-semibold text-gray-900">AI Visibility</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#features" className="text-gray-600 hover:text-gray-900 text-sm">
              Features
            </a>
            <a href="#pricing" className="text-gray-600 hover:text-gray-900 text-sm">
              Pricing
            </a>
            <button className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
              Sign In
            </button>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-8 pt-16 pb-24">
        <div className="grid lg:grid-cols-[55%_45%] gap-6 items-center">
          {/* Left Column */}
          <div className="lg:-ml-[10%]">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#E8F0E8] rounded-full mb-8">
              <Sparkles className="w-4 h-4 text-[#4A7C59]" />
              <span className="text-[#4A7C59] text-sm">
                AI-Powered Brand Intelligence
              </span>
            </div>

            {/* Headline */}
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold text-foreground tracking-tight leading-[1.1] mb-6">
              See how AI talks about<br />your brand
            </h1>

            {/* Subtitle */}
            <p className="text-lg text-gray-500 font-light mb-8 max-w-[30rem]">
              Discover your visibility across ChatGPT, Claude, Gemini, and other AI
              platforms. Understand how AI models perceive and recommend your brand.
            </p>

            {/* Search Form */}
            <form onSubmit={handleSubmit} className="mb-6">
              <div className={`flex items-center bg-white border rounded-xl p-1.5 shadow-sm max-w-[27.5rem] ${error ? 'border-red-300' : 'border-gray-200'}`}>
                <Search className="w-5 h-5 text-gray-400 ml-3" />
                <input
                  type="text"
                  placeholder="Enter a brand or category (e.g., Nike, cars, laptops)..."
                  value={brandInput}
                  onChange={(e) => {
                    setBrandInput(e.target.value);
                    if (error) setError(null);
                  }}
                  disabled={isValidating}
                  className="flex-1 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none bg-transparent disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!brandInput.trim() || isValidating}
                  className="px-5 py-2 text-sm bg-[#4A7C59] text-white font-medium rounded-lg hover:bg-[#3d6649] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isValidating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Validating
                    </>
                  ) : (
                    "Research"
                  )}
                </button>
              </div>
              {error && (
                <p className="mt-2 text-sm text-red-600">{error}</p>
              )}
            </form>

            {/* Trust Text */}
            <p className="text-sm text-gray-500">
              Trusted by 2,000+ brands tracking their AI presence
            </p>
          </div>

          {/* Right Column - Demo Card */}
          <div className="flex justify-center lg:justify-end lg:mr-[-8%]">
            <div className="bg-white rounded-2xl shadow-lg px-6 py-8 w-full">
              {/* Card Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[#F5F5F0] flex items-center justify-center">
                    <svg
                      className="w-4 h-4 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                      />
                    </svg>
                  </div>
                  <span className="font-semibold text-gray-700">Brand Analysis</span>
                </div>
                <span className="text-sm text-gray-400">Live</span>
              </div>

              {/* Visibility Score Circle */}
              <div className="flex justify-center mb-5">
                <div className="w-28 h-28 rounded-full bg-[#E8F0E8] flex items-center justify-center">
                  <span className="text-4xl font-bold text-[#4A7C59]">87</span>
                </div>
              </div>
              <p className="text-center text-gray-400 mb-6">Visibility Score</p>

              {/* Platform Scores */}
              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="bg-[#5B7B5D] rounded-xl p-3 text-center">
                  <div className="text-xl font-bold text-white">92</div>
                  <div className="text-xs text-white/70">ChatGPT</div>
                </div>
                <div className="bg-[#D9CBBA] rounded-xl p-3 text-center">
                  <div className="text-xl font-bold text-gray-700">85</div>
                  <div className="text-xs text-gray-500">Claude</div>
                </div>
                <div className="bg-[#C8C4A8] rounded-xl p-3 text-center">
                  <div className="text-xl font-bold text-gray-700">78</div>
                  <div className="text-xs text-gray-500">Gemini</div>
                </div>
              </div>

              {/* Footer Text */}
              <div className="flex items-center gap-2 text-sm text-gray-500 bg-[#FAFAF8] rounded-lg p-2.5">
                <Zap className="w-4 h-4 text-[#4A7C59] flex-shrink-0" />
                <span>Your brand is mentioned 3x more than competitors in AI responses</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Brand Suggestions Modal */}
      {suggestions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={handleCloseSuggestions}
          />

          {/* Modal */}
          <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
            {/* Close button */}
            <button
              onClick={handleCloseSuggestions}
              className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Which brand did you mean?
              </h2>
              <p className="text-sm text-gray-500">
                We found multiple brands matching &quot;{brandInput}&quot;
              </p>
            </div>

            {/* Suggestions List */}
            <div className="space-y-3">
              {suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => handleSelectBrand(suggestion.name)}
                  className="w-full p-4 text-left bg-[#FAFAF8] rounded-xl hover:bg-[#E8F0E8] transition-colors group"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center flex-shrink-0 group-hover:bg-[#E8F0E8]">
                      <Building2 className="w-5 h-5 text-[#4A7C59]" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{suggestion.name}</p>
                      <p className="text-sm text-gray-500">{suggestion.description}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Footer */}
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
    </div>
  );
}