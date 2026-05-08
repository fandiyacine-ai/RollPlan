export default function PlanExecutionReviewPage({ params }: { params: { id: string } }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Plan Execution Review</h1>
      <p className="text-muted-foreground">Upload your actual match to compare against the gameplan.</p>
    </div>
  )
}
