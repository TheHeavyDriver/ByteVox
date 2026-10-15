export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-stone-600">
          Datasets and reports will appear here. Next up: CSV upload.
        </p>
      </div>

      <section className="rounded-lg border border-dashed border-stone-300 bg-white p-8 text-center">
        <h2 className="font-medium">No datasets yet</h2>
        <p className="mt-1 text-sm text-stone-600">
          CSV upload and profiling arrives in the next build phase.
        </p>
      </section>
    </div>
  );
}
