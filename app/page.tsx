"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Eye, Sparkles, Zap } from "lucide-react";

export default function Home() {
  const [brand, setBrand] = useState("");
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (brand.trim()) {
      localStorage.setItem("brand", brand.trim());
      router.push("/configure");
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      {/* Navigation */}
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

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-8 pt-16 pb-24">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left Column */}
          <div>
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#E8F0E8] rounded-full mb-8">
              <Sparkles className="w-4 h-4 text-[#4A7C59]" />
              <span className="text-[#4A7C59] text-sm font-medium">
                AI-Powered Brand Intelligence
              </span>
            </div>

            {/* Headline */}
            <h1 className="text-5xl lg:text-6xl font-bold text-gray-900 leading-tight mb-6">
              See how AI talks about your brand
            </h1>

            {/* Subtitle */}
            <p className="text-lg text-gray-600 mb-8 max-w-lg">
              Discover your visibility across ChatGPT, Claude, Gemini, and other AI
              platforms. Understand how AI models perceive and recommend your brand.
            </p>

            {/* Search Form */}
            <form onSubmit={handleSubmit} className="mb-6">
              <div className="flex items-center bg-white border border-gray-200 rounded-xl p-2 shadow-sm max-w-md">
                <Search className="w-5 h-5 text-gray-400 ml-3" />
                <input
                  type="text"
                  placeholder="Enter your brand name..."
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  className="flex-1 px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none bg-transparent"
                />
                <button
                  type="submit"
                  disabled={!brand.trim()}
                  className="px-6 py-3 bg-[#4A7C59] text-white font-medium rounded-lg hover:bg-[#3d6649] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Research
                </button>
              </div>
            </form>

            {/* Trust Text */}
            <p className="text-sm text-gray-500">
              Trusted by 2,000+ brands tracking their AI presence
            </p>
          </div>

          {/* Right Column - Demo Card */}
          <div className="flex justify-center lg:justify-end">
            <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
              {/* Card Header */}
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#F5F5F0] flex items-center justify-center">
                    <svg
                      className="w-5 h-5 text-gray-600"
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
                  <span className="font-semibold text-gray-900">Brand Analysis</span>
                </div>
                <span className="text-sm text-gray-400">Live</span>
              </div>

              {/* Visibility Score Circle */}
              <div className="flex justify-center mb-8">
                <div className="w-32 h-32 rounded-full bg-[#E8F0E8] flex items-center justify-center">
                  <span className="text-4xl font-bold text-[#4A7C59]">87</span>
                </div>
              </div>
              <p className="text-center text-gray-500 mb-8">Visibility Score</p>

              {/* Platform Scores */}
              <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="bg-[#E8F0E8] rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-gray-900">92</div>
                  <div className="text-sm text-gray-500">ChatGPT</div>
                </div>
                <div className="bg-[#F5F5E8] rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-gray-900">85</div>
                  <div className="text-sm text-gray-500">Claude</div>
                </div>
                <div className="bg-[#F0EBE5] rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-gray-900">78</div>
                  <div className="text-sm text-gray-500">Gemini</div>
                </div>
              </div>

              {/* Footer Text */}
              <div className="flex items-center gap-2 text-sm text-gray-600 bg-[#FAFAF8] rounded-lg p-3">
                <Zap className="w-4 h-4 text-[#4A7C59]" />
                <span>Your brand is mentioned 3x more than competitors in AI responses</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}