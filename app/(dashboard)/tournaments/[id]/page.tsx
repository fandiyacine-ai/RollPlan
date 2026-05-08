export default function TournamentDetailPage({ params }: { params: { id: string } }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Tournament</h1>
      <p className="text-muted-foreground">Tournament ID: {params.id}</p>
    </div>
  )
}
