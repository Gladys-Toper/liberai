'use client';

import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ChatSuggestionsProps {
  bookTitle: string;
  suggestions?: string[];
  onSelectSuggestion: (suggestion: string) => void;
}

export function ChatSuggestions({
  bookTitle,
  suggestions,
  onSelectSuggestion,
}: ChatSuggestionsProps) {
  const defaultSuggestions = [
    'What is this book about?',
    'Summarize the main themes',
    'What are the key arguments?',
  ];

  // Roman history specific suggestions for Gibbon's book
  const gibbonSpecificSuggestions = [
    'What were the main causes of Rome\'s decline?',
    'How did Christianity affect the Roman Empire?',
    'What role did the barbarians play?',
    'Explain the political structure of Rome',
  ];

  const isGibbonBook = bookTitle.toLowerCase().includes('gibbon') ||
    bookTitle.toLowerCase().includes('decline and fall');

  const finalSuggestions = isGibbonBook
    ? gibbonSpecificSuggestions
    : suggestions || defaultSuggestions;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-violet-400" />
        <p className="text-sm text-zinc-400">Suggested questions:</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {finalSuggestions.map((suggestion, i) => (
          <button
            key={i}
            onClick={() => onSelectSuggestion(suggestion)}
            className="rounded-lg border border-[#27272a] bg-[#141414] px-3 py-2 text-sm text-zinc-300 transition-all hover:border-violet-500/50 hover:bg-[#1a1a1a] hover:text-white"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}
