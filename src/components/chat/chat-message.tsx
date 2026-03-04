'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { formatRelativeDate } from '@/lib/utils';

interface Citation {
  chapterTitle: string;
  content: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  timestamp: Date;
}

interface ChatMessageProps {
  message: ChatMessage;
  bookId?: string;
}

export function ChatMessage({ message, bookId }: ChatMessageProps) {
  const [citationsExpanded, setCitationsExpanded] = useState(false);
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-xs sm:max-w-md lg:max-w-lg ${isUser ? 'lg:max-w-md' : ''}`}>
        {/* Message Bubble */}
        <div
          className={`rounded-lg px-4 py-3 ${
            isUser
              ? 'bg-violet-500 text-white'
              : 'border border-[#27272a] bg-[#141414] text-zinc-300'
          }`}
        >
          <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
            {message.content}
          </p>
          <p
            className={`mt-2 text-xs ${
              isUser ? 'text-violet-100' : 'text-zinc-500'
            }`}
          >
            {formatRelativeDate(message.timestamp)}
          </p>
        </div>

        {/* Citations */}
        {!isUser && message.citations && message.citations.length > 0 && (
          <div className="mt-3 space-y-2">
            <button
              onClick={() => setCitationsExpanded(!citationsExpanded)}
              className="flex items-center gap-2 text-xs text-violet-400 hover:text-violet-300"
            >
              {citationsExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              {message.citations.length} source{message.citations.length !== 1 ? 's' : ''}
            </button>

            {citationsExpanded && (
              <div className="space-y-2">
                {message.citations.map((citation, i) => (
                  <Card
                    key={i}
                    className="border-[#27272a] bg-[#0a0a0a] p-3 text-xs"
                  >
                    <p className="mb-2 font-semibold text-zinc-300">
                      {citation.chapterTitle}
                    </p>
                    <p className="line-clamp-2 text-zinc-500">
                      {citation.content}
                    </p>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
