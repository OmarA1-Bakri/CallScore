import Link from "next/link";
import { requireSessionAccess } from "@/lib/premium";
import { listApiKeys } from "@/lib/api-keys";

export default async function ApiSettingsPage() {
  const session = await requireSessionAccess("alpha");
  if (session instanceof Response) {
    return (
      <main className="max-w-page mx-auto px-4 tab:px-6 desk:px-8 py-10">
        <h1 className="font-serif text-[34px] text-ink-900 font-medium mb-4">API Access</h1>
        <p className="text-ink-700 mb-4">Alpha unlocks read-only API keys.</p>
        <Link href="/pricing" className="text-accent font-mono text-[11px] tracking-caps uppercase">Upgrade to Alpha</Link>
      </main>
    );
  }

  const keys = await listApiKeys(session.userId);

  return (
    <main className="max-w-page mx-auto px-4 tab:px-6 desk:px-8 py-10">
      <h1 className="font-serif text-[34px] text-ink-900 font-medium mb-6">API Access</h1>
      <Link href="/settings/webhooks" className="inline-block mb-6 text-accent font-mono text-[11px] tracking-caps uppercase">
        Manage webhooks
      </Link>
      <form action="/api/api-keys" method="post" className="flex gap-2 mb-6">
        <input name="name" placeholder="Key name" className="border border-ink-250 px-3 py-2 text-sm" />
        <button className="bg-accent text-ink-0 px-4 py-2 font-mono text-[11px] tracking-caps uppercase">Create key</button>
      </form>
      <div className="border-y border-ink-150 divide-y divide-ink-150">
        {keys.map((key) => (
          <div key={key.id} className="py-3 flex items-center justify-between gap-4">
            <div>
              <p className="font-mono text-[12px] text-ink-900">{key.name}</p>
              <p className="font-mono text-[11px] text-ink-500">{key.prefix}... · {key.revoked_at ? "revoked" : "active"}</p>
            </div>
            {!key.revoked_at && (
              <form action="/api/api-keys" method="post">
                <input type="hidden" name="_action" value="revoke" />
                <input type="hidden" name="id" value={key.id} />
                <button className="text-ink-600 hover:text-ink-900 font-mono text-[11px]">Revoke</button>
              </form>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
