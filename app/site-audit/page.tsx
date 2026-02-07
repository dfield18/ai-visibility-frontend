"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { Eye, Globe, Loader2, ArrowLeft, Search, Shield, FileText, Code2 } from "lucide-react";
import { useCreateSiteAudit } from "@/hooks/useApi";
import { getSessionId } from "@/lib/utils";

export default function SiteAuditPage() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const createAudit = useCreateSiteAudit();

  const validateUrl = (input: string): boolean => {
    try {
      const urlToTest = input.startsWith("http") ? input : `https://${input}`;
      new URL(urlToTest);
      return true;
    } catch {
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUrl = url.trim();

    if (!trimmedUrl) {
      setError("Please enter a URL");
      return;
    }

    if (!validateUrl(trimmedUrl)) {
      setError("Please enter a valid URL");
      return;
    }

    setError(null);

    try {
      const result = await createAudit.mutateAsync({
        url: trimmedUrl,
        session_id: getSessionId(),
      });
      router.push(`/site-audit/${result.audit_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start audit");
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      {/* Navigation */}
      <header className="sticky top-0 z-50 bg-[#FAFAF8] border-b border-gray-100">
        <nav className="flex items-center justify-between px-8 py-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <Link href="/" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-[#E8F0E8] flex items-center justify-center">
                <Eye className="w-4 h-4 text-[#4A7C59]" />
              </div>
              <span className="font-semibold text-gray-900">Site Audit</span>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/" className="text-gray-600 hover:text-gray-900 text-sm">
              Brand Analysis
            </Link>
            <SignedOut>
              <a
                href="/sign-in"
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Sign In
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

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-8 pt-16 pb-24">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#E8F0E8] rounded-full mb-6">
            <Globe className="w-4 h-4 text-[#4A7C59]" />
            <span className="text-[#4A7C59] text-sm">
              LLM Optimization Audit
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-semibold text-gray-900 mb-4">
            Check if your site is ready for AI search
          </h1>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto">
            Analyze your website for LLM/AI search optimization compatibility.
            See if AI crawlers can access your content and how well your site is structured for AI indexing.
          </p>
        </div>

        {/* Search Form */}
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto mb-16">
          <div className={`flex items-center bg-white border rounded-xl p-1.5 shadow-sm ${error ? 'border-red-300' : 'border-gray-200'}`}>
            <Search className="w-5 h-5 text-gray-400 ml-3" />
            <input
              type="text"
              placeholder="Enter your website URL (e.g., example.com)"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (error) setError(null);
              }}
              disabled={createAudit.isPending}
              className="flex-1 px-3 py-3 text-gray-900 placeholder-gray-400 focus:outline-none bg-transparent disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!url.trim() || createAudit.isPending}
              className="px-6 py-3 text-sm bg-[#4A7C59] text-white font-medium rounded-lg hover:bg-[#3d6649] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {createAudit.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Starting...
                </>
              ) : (
                "Audit Site"
              )}
            </button>
          </div>
          {error && (
            <p className="mt-2 text-sm text-red-600">{error}</p>
          )}
        </form>

        {/* What We Check */}
        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl p-6 border border-gray-100">
            <div className="w-10 h-10 rounded-lg bg-[#E8F0E8] flex items-center justify-center mb-4">
              <Shield className="w-5 h-5 text-[#4A7C59]" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">AI Crawler Access</h3>
            <p className="text-sm text-gray-500">
              Check if GPTBot, ClaudeBot, PerplexityBot, and other AI crawlers are allowed in your robots.txt
            </p>
          </div>

          <div className="bg-white rounded-xl p-6 border border-gray-100">
            <div className="w-10 h-10 rounded-lg bg-[#E8F0E8] flex items-center justify-center mb-4">
              <FileText className="w-5 h-5 text-[#4A7C59]" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">llms.txt & Meta Tags</h3>
            <p className="text-sm text-gray-500">
              Detect llms.txt file presence and check for noai/noimageai meta directives that block AI indexing
            </p>
          </div>

          <div className="bg-white rounded-xl p-6 border border-gray-100">
            <div className="w-10 h-10 rounded-lg bg-[#E8F0E8] flex items-center justify-center mb-4">
              <Code2 className="w-5 h-5 text-[#4A7C59]" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Structure & Data</h3>
            <p className="text-sm text-gray-500">
              Analyze JSON-LD structured data, semantic HTML, and content accessibility for AI understanding
            </p>
          </div>
        </div>

        {/* Score Legend */}
        <div className="mt-16 bg-white rounded-xl p-6 border border-gray-100">
          <h3 className="font-semibold text-gray-900 mb-4">Understanding Your Score</h3>
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <div>
                <span className="font-medium text-gray-900">90-100</span>
                <span className="text-gray-500 text-sm ml-2">Excellent</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-lime-500"></div>
              <div>
                <span className="font-medium text-gray-900">70-89</span>
                <span className="text-gray-500 text-sm ml-2">Good</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
              <div>
                <span className="font-medium text-gray-900">50-69</span>
                <span className="text-gray-500 text-sm ml-2">Fair</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <div>
                <span className="font-medium text-gray-900">0-49</span>
                <span className="text-gray-500 text-sm ml-2">Poor</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
