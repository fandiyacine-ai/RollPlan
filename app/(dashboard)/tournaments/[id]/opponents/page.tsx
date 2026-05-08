export default function OpponentsPage({ params }: { params: { id: string } }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Opponents</h1>
      <p className="text-muted-foreground">Add opponents and upload their match footage.</p>
    </div>
  )
}
