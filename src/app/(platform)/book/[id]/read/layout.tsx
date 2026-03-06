import { redirect } from 'next/navigation'
import { getCurrentUser, getBookAccessStatus } from '@/lib/db/queries'

export default async function ReadLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id: bookId } = await params

  const user = await getCurrentUser()

  // If no user, check if book is free
  if (!user) {
    const status = await getBookAccessStatus('', bookId)
    if (status !== 'free') {
      redirect(`/book/${bookId}?purchase=true`)
    }
    return <>{children}</>
  }

  const status = await getBookAccessStatus(user.id, bookId)

  if (status === 'requires_purchase') {
    redirect(`/book/${bookId}?purchase=true`)
  }

  return <>{children}</>
}
