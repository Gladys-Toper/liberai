'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Loader2, PenLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';

export function AuthorOnboarding({ defaultName }: { defaultName: string }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(defaultName);
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/authors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, bio }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to create author profile');
        setLoading(false);
        return;
      }

      router.refresh();
    } catch {
      setError('Network error — please try again');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-lg">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-violet-500/10">
            <PenLine className="h-8 w-8 text-violet-400" />
          </div>
          <h1 className="mb-2 text-3xl font-bold text-white">
            Become an Author
          </h1>
          <p className="text-zinc-400">
            Set up your author profile to start publishing books and engaging
            readers with AI-powered conversations.
          </p>
        </div>

        <Card className="border-[#27272a] bg-[#141414] p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="displayName" className="mb-1.5 block text-sm font-medium text-zinc-300">
                Display Name
              </label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your author name"
                required
                className="border-[#27272a] bg-[#0a0a0a] text-white placeholder:text-zinc-600 focus:border-violet-500"
              />
            </div>

            <div>
              <label htmlFor="bio" className="mb-1.5 block text-sm font-medium text-zinc-300">
                Bio <span className="text-zinc-600">(optional)</span>
              </label>
              <textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell readers about yourself..."
                rows={3}
                className="w-full rounded-md border border-[#27272a] bg-[#0a0a0a] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>

            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}

            <Button
              type="submit"
              disabled={loading || !displayName.trim()}
              className="w-full bg-gradient-to-r from-violet-500 to-purple-600 py-5 font-medium text-white hover:from-violet-600 hover:to-purple-700 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating profile...
                </>
              ) : (
                <>
                  <BookOpen className="mr-2 h-4 w-4" />
                  Create Author Profile
                </>
              )}
            </Button>
          </form>
        </Card>

        <p className="mt-6 text-center text-xs text-zinc-600">
          You can update your profile details anytime from the dashboard settings.
        </p>
      </div>
    </div>
  );
}
