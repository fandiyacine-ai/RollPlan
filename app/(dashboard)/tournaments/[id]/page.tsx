import { redirect } from 'next/navigation'

export default async function TournamentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/tournaments/${id}/opponents`)
}
