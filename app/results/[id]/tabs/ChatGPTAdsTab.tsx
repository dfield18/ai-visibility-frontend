'use client';

import React from 'react';
import { Megaphone } from 'lucide-react';

export function ChatGPTAdsTab() {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-8">
      <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-6">
        <Megaphone className="w-8 h-8 text-gray-400" />
      </div>
      <h2 className="text-xl font-semibold text-gray-900 mb-2">
        ChatGPT Advertising
      </h2>
      <p className="text-gray-500 text-center max-w-md mb-6">
        Coming soon: Manage ChatGPT ad campaigns and track placements across AI platforms.
      </p>
      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
        Coming Soon
      </span>
    </div>
  );
}
