export default function GameplanPage({ params }: { params: { id: string } }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Gameplan</h1>
      <p className="text-muted-foreground">Generate a gameplan once you have your opponent scouted.</p>
    </div>
  )
}
