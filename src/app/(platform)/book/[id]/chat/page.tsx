'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ChatMessage } from '@/components/chat/chat-message';
import { ChatInput } from '@/components/chat/chat-input';
import { ChatSuggestions } from '@/components/chat/chat-suggestions';
import { formatDate, getInitials } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Array<{ chapterTitle: string; content: string }>;
  timestamp: Date;
}

const MOCK_BOOK = {
  id: '1',
  title: 'The Decline and Fall of the Roman Empire',
  author: { id: 'a1', name: 'Edward Gibbon', avatar: null },
  cover: null,
};

export default function ChatPage({ params }: { params: { id: string } }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (content: string) => {
    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    // Simulate API call with streaming response
    // In production, this would call the /api/chat endpoint
    setTimeout(() => {
      const mockResponses: Record<string, string> = {
        'What is this book about?':
          'The Decline and Fall of the Roman Empire is a monumental historical work examining the collapse of the Western Roman Empire. Gibbon traces the political, social, and religious factors that contributed to Rome\'s fall, spanning from the height of the empire under the Antonines to the fall of Constantinople. The work is known for its scholarly analysis and its examination of Christianity\'s role in the empire\'s fate.',
        'Summarize the main themes':
          'The main themes include: 1) The inevitable decline of great empires, 2) The role of political instability and internal strife, 3) The impact of barbarian invasions, 4) The complex relationship between religion and governance, 5) The preservation of Roman culture and law in successor states.',
        'What are the key arguments?':
          'Gibbon argues that Rome\'s fall was not a sudden collapse but a gradual process. He emphasizes multiple contributing factors: economic exhaustion, military pressure, political instability, and the transformative role of Christianity. He challenges the idea that a single cause led to Rome\'s downfall, instead presenting a complex interplay of forces.',
        'What were the main causes of Rome\'s decline?':
          'According to Gibbon, the primary causes include: economic and fiscal crises, constant military pressure from barbarian peoples, political fragmentation and civil wars, the shift of power eastward, and the rise of Christianity which altered the empire\'s values and military traditions.',
        'How did Christianity affect the Roman Empire?':
          'Gibbon analyzes how Christianity transformed Roman society by shifting values from martial virtue to spiritual concerns. He argues the religion redirected resources from military defense and contributed to a shift in imperial priorities. This remains one of the most debated aspects of his work.',
        'What role did the barbarians play?':
          'The barbarian peoples, including the Goths, Visigoths, and later the Huns, pressed against Roman frontiers throughout the empire\'s decline. Rather than being inherently destructive, Gibbon shows how they were often driven by their own pressures and eventually established successor kingdoms that preserved Roman legal and cultural traditions.',
        'Explain the political structure of Rome':
          'The Roman political system featured the Senate, which appeared to hold sovereign authority while the Emperor held executive powers. This constitutional fiction masked the reality of imperial rule. Governors administered provinces, magistrates handled justice, and military commanders controlled armies, all ultimately answerable to the emperor in Rome.',
      };

      const responseContent =
        mockResponses[content] ||
        'That\'s an interesting question about the Decline and Fall of the Roman Empire. Based on Gibbon\'s comprehensive analysis, ' +
          content.toLowerCase() +
          ' is a complex topic that Gibbon explores through multiple perspectives and historical sources.';

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: responseContent,
        citations: [
          {
            chapterTitle: 'Chapter 1: The Extent and Military Force of the Roman Empire',
            content: 'In the second century of the Christian era, the empire of Rome comprehended the fairest part of the earth, and the most civilized portion of mankind...',
          },
          {
            chapterTitle: 'Chapter 3: The Systems of the Barbarians',
            content: 'Beyond the frontiers of the Roman Empire existed various nations of barbarians, whose customs and systems of government differed greatly from those of Rome...',
          },
        ],
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setIsLoading(false);
    }, 800);
  };

  const handleSelectSuggestion = (suggestion: string) => {
    handleSendMessage(suggestion);
  };

  return (
    <div className="flex min-h-[calc(100vh-64px)] bg-[#0a0a0a]">
      {/* Book Info Sidebar - Desktop */}
      <aside className="hidden w-80 border-r border-[#27272a] bg-[#0a0a0a] p-6 lg:flex lg:flex-col">
        <Link href={`/book/${params.id}`}>
          <Button
            variant="ghost"
            size="sm"
            className="mb-4 text-zinc-400 hover:text-white"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Book
          </Button>
        </Link>

        <Card className="border-[#27272a] bg-[#141414] p-4">
          <div className="mb-4 h-40 rounded-lg bg-gradient-to-br from-violet-600 to-purple-600" />
          <h3 className="mb-2 font-semibold text-white">
            {MOCK_BOOK.title}
          </h3>
          <p className="mb-4 text-sm text-zinc-400">{MOCK_BOOK.author.name}</p>

          <div className="space-y-3 border-t border-[#27272a] pt-4">
            <div>
              <p className="text-xs text-zinc-500">About this feature</p>
              <p className="mt-1 text-sm text-zinc-300">
                Ask any questions about the content. The AI will provide answers
                with citations from the book.
              </p>
            </div>
          </div>
        </Card>
      </aside>

      {/* Chat Area */}
      <main className="flex flex-1 flex-col">
        {/* Mobile Book Info */}
        <div className="border-b border-[#27272a] bg-[#0a0a0a] p-4 lg:hidden">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white">
                {MOCK_BOOK.title}
              </p>
              <p className="text-xs text-zinc-500">{MOCK_BOOK.author.name}</p>
            </div>
            <Link href={`/book/${params.id}`}>
              <Button
                variant="ghost"
                size="sm"
                className="text-zinc-400 hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {messages.length === 0 ? (
            <div className="mx-auto max-w-2xl space-y-8 pt-12">
              <div className="text-center">
                <h2 className="mb-2 text-2xl font-bold text-white">
                  Talk to {MOCK_BOOK.title}
                </h2>
                <p className="text-zinc-400">
                  Ask questions about the content. The AI will provide answers
                  with citations.
                </p>
              </div>

              <ChatSuggestions
                bookTitle={MOCK_BOOK.title}
                onSelectSuggestion={handleSelectSuggestion}
              />
            </div>
          ) : (
            <div className="mx-auto max-w-2xl space-y-6">
              {messages.map((message) => (
                <ChatMessage key={message.id} message={message} bookId={params.id} />
              ))}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-lg bg-[#141414] px-4 py-3 text-zinc-300">
                    <Loader className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Thinking...</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="border-t border-[#27272a] bg-[#0a0a0a] p-4 sm:p-6">
          <div className="mx-auto max-w-2xl">
            <ChatInput onSend={handleSendMessage} disabled={isLoading} />
          </div>
        </div>
      </main>
    </div>
  );
}
