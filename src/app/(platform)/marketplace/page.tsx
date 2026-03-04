import { getBooks, getCategories } from '@/lib/db/queries';
import { MarketplaceClient } from './marketplace-client';

export default async function MarketplacePage() {
  const [booksRaw, categories] = await Promise.all([
    getBooks({ limit: 50 }),
    getCategories(),
  ]);

  // Map DB shape to the flat shape the client component expects
  const books = booksRaw.map((b) => ({
    id: b.id,
    title: b.title,
    description: b.description || undefined,
    cover: b.cover_url || undefined,
    author: {
      id: b.authors.id,
      name: b.authors.display_name,
      avatar: b.authors.avatar_url,
    },
    category: b.category,
    price: Number(b.price),
    reads: b.total_reads,
    chats: b.total_chats,
  }));

  return <MarketplaceClient books={books} categories={categories} />;
}
