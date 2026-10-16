import Link from "next/link";
import { redirect } from "next/navigation";
import { listDatasets } from "@/lib/datasets";
import { formatBytes, formatDateTimeUTC } from "@/lib/format";
import { listReports } from "@/lib/reports";
import { getCurrentUser } from "@/lib/session";
import { UploadForm } from "../upload-form";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [datasets, reports] = await Promise.all([
    listDatasets(user.id),
    listReports(user.id),
  ]);

  return (
    <div className="space-y-10">
      <section className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-medium">Upload a CSV</h1>
        <p className="mt-1 text-sm text-stone-600">
          Your file is profiled on import: column types are guessed with a
          written reason, and anything the importer had to work around is
          listed.
        </p>
        <div className="mt-4">
          <UploadForm />
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-medium">Datasets</h2>
          {datasets.length > 0 && (
            <span className="text-sm text-stone-500">
              {datasets.length} dataset{datasets.length === 1 ? "" : "s"}
            </span>
          )}
        </div>

        {datasets.length === 0 ? (
          <div className="rounded-lg border border-dashed border-stone-300 bg-white p-8 text-center">
            <h3 className="font-medium">No datasets yet</h3>
            <p className="mx-auto mt-1 max-w-xl text-sm text-stone-600">
              Upload a CSV above. To see the messy cases handled, run{" "}
              <code className="rounded bg-stone-100 px-1 py-0.5 text-xs">
                npm run demo:data
              </code>{" "}
              and upload{" "}
              <code className="rounded bg-stone-100 px-1 py-0.5 text-xs">
                sample-data/messy_orders.csv
              </code>
              .
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Usable rows</th>
                  <th className="px-4 py-3 font-medium">Unreadable</th>
                  <th className="px-4 py-3 font-medium">Size</th>
                  <th className="px-4 py-3 font-medium">Uploaded</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {datasets.map((dataset) => (
                  <tr key={dataset.id} className="hover:bg-stone-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/datasets/${dataset.id}`}
                        className="font-medium text-stone-900 underline-offset-2 hover:underline"
                      >
                        {dataset.name}
                      </Link>
                      <p className="text-xs text-stone-500">
                        {dataset.originalFilename}
                      </p>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {dataset.rowCount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {dataset.rejectedCount > 0 ? (
                        <span className="text-amber-700">
                          {dataset.rejectedCount.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-stone-400">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-stone-600">
                      {formatBytes(dataset.byteSize)}
                    </td>
                    <td className="px-4 py-3 text-stone-600">
                      {formatDateTimeUTC(dataset.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-medium">Reports</h2>
          {reports.length > 0 && (
            <span className="text-sm text-stone-500">
              {reports.length} report{reports.length === 1 ? "" : "s"}
            </span>
          )}
        </div>

        {reports.length === 0 ? (
          <div className="rounded-lg border border-dashed border-stone-300 bg-white p-8 text-center">
            <h3 className="font-medium">No reports yet</h3>
            <p className="mx-auto mt-1 max-w-xl text-sm text-stone-600">
              Open a dataset and create one — every report starts with a row
              count block whose arithmetic is spelled out.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500">
                  <th className="px-4 py-3 font-medium">Report</th>
                  <th className="px-4 py-3 font-medium">Dataset</th>
                  <th className="px-4 py-3 font-medium">Version</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {reports.map((report) => (
                  <tr key={report.id} className="hover:bg-stone-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/reports/${report.id}`}
                        className="font-medium text-stone-900 underline-offset-2 hover:underline"
                      >
                        {report.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-stone-600">
                      {report.dataset ? (
                        <Link
                          href={`/datasets/${report.dataset.id}`}
                          className="underline-offset-2 hover:underline"
                        >
                          {report.dataset.name}
                        </Link>
                      ) : (
                        <span className="text-stone-400">
                          (deleted dataset)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-stone-600">
                      v{report.version}
                    </td>
                    <td className="px-4 py-3 text-stone-600">
                      {formatDateTimeUTC(report.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
