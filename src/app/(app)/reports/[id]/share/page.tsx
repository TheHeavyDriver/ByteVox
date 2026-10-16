import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { formatDateTime } from "@/lib/format";
import {
  getReportDiffSince,
  getReportForUser,
  shareStatus,
} from "@/lib/reports";
import { getCurrentUser } from "@/lib/session";
import { RevokeLinkForm, ShareLinkCreator } from "../report-controls";

const STATUS_STYLES: Record<string, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-800",
  expired: "border-stone-200 bg-stone-100 text-stone-600",
  revoked: "border-red-200 bg-red-50 text-red-700",
};

export default async function SharePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const report = await getReportForUser(id, user.id);
  if (!report) notFound();

  const links = report.shareLinks.map((link) => ({
    id: link.id,
    createdAt: link.createdAt,
    expiresAt: link.expiresAt,
    versionAtShare: link.versionAtShare,
    status: shareStatus(link),
    versionsSince:
      report.version > link.versionAtShare
        ? report.version - link.versionAtShare
        : 0,
  }));

  // The "what changed" preview uses the newest active link that is behind
  // the current version: exactly what a viewer of that link sees.
  const previewLink = links.find(
    (link) => link.status === "active" && link.versionsSince > 0,
  );
  const previewDiff = previewLink
    ? await getReportDiffSince(report.id, previewLink.versionAtShare)
    : null;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <Link
          href={`/reports/${report.id}`}
          className="text-sm text-stone-500 hover:underline"
        >
          ← {report.title}
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">Share</h1>
        <p className="max-w-3xl text-sm text-stone-600">
          Share links are read-only, token-based, and point at the latest
          version of this report (currently v{report.version}). Anyone with a
          link sees every number&apos;s explanation — and a “what changed”
          panel for edits made after the link was created. The raw uploaded
          file is never exposed.
        </p>
      </header>

      <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-stone-900">
          Create a share link
        </h2>
        <p className="mt-1 text-sm text-stone-600">
          Default 7 days, up to 90. Links can be revoked at any time.
        </p>
        <div className="mt-4">
          <ShareLinkCreator reportId={report.id} />
        </div>
      </section>

      {previewDiff && previewLink && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-sm font-semibold text-amber-900">
            What viewers of the newest active link see
          </h2>
          {previewDiff.items.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
              {previewDiff.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-amber-900">
              The report was re-saved without visible changes to title,
              filters, or blocks.
            </p>
          )}
          <p className="mt-2 text-xs text-amber-800">
            Diffs run between v{previewLink.versionAtShare} (when that link
            was created) and v{previewDiff.currentVersion} (now).
          </p>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-stone-900">Links</h2>
        {links.length === 0 ? (
          <p className="rounded-lg border border-dashed border-stone-300 bg-white p-6 text-center text-sm text-stone-500">
            No share links yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500">
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium">Expires</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Version at share</th>
                  <th className="px-4 py-3 font-medium">Changes since</th>
                  <th className="px-4 py-3 font-medium">Revoke</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {links.map((link) => (
                  <tr key={link.id}>
                    <td className="px-4 py-3 text-stone-600">
                      {formatDateTime(link.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-stone-600">
                      {formatDateTime(link.expiresAt)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${
                          STATUS_STYLES[link.status] ?? STATUS_STYLES.expired
                        }`}
                      >
                        {link.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-stone-600">
                      v{link.versionAtShare}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-stone-600">
                      {link.versionsSince > 0 ? (
                        <span className="text-amber-700">
                          {link.versionsSince} version
                          {link.versionsSince === 1 ? "" : "s"}
                        </span>
                      ) : (
                        <span className="text-stone-400">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {link.status === "active" ? (
                        <RevokeLinkForm reportId={report.id} linkId={link.id} />
                      ) : (
                        <span className="text-xs text-stone-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-stone-500">
          For privacy only the SHA-256 hash of each token is stored, so a link
          is shown once at creation and can never be re-displayed.
        </p>
      </section>
    </div>
  );
}
