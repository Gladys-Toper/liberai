'use client';

import { useRef, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled = false }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    if (message.trim() && !disabled) {
      onSend(message);
      setMessage('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    // Auto-grow textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 128)}px`;
    }
  };

  return (
    <div className="rounded-lg border border-[#27272a] bg-[#141414] p-4">
      <div className="flex gap-3">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything about this book..."
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none bg-transparent text-white placeholder:text-zinc-600 focus:outline-none"
        />
        <Button
          onClick={handleSend}
          disabled={!message.trim() || disabled}
          size="sm"
          className={`shrink-0 ${
            message.trim() && !disabled
              ? 'bg-violet-500 hover:bg-violet-600'
              : 'bg-zinc-700'
          }`}
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
      </div>
      <p className="mt-2 text-xs text-zinc-600">
        Press Enter to send, Shift+Enter for a new line
      </p>
    </div>
  );
}
