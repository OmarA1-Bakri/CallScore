import Link from "next/link";
import { requireSessionAccess } from "@/lib/premium";
import { listWebhooks } from "@/lib/webhooks";

export default async function WebhookSettingsPage() {
  const session = await requireSessionAccess("alpha");
  if (session instanceof Response) {
    return (
      <main className="max-w-page mx-auto px-4 tab:px-6 desk:px-8 py-10">
        <h1 className="font-serif text-[35px] text-ink-900 font-medium mb-4">Webhooks</h1>
        <p className="text-ink-700 mb-4">Alpha unlocks signed webhook notifications.</p>
        <Link href="/pricing" className="text-accent font-mono text-[12px] tracking-caps uppercase">Upgrade to Alpha</Link>
      </main>
    );
  }

  const webhooks = await listWebhooks(session.userId);

  return (
    <main className="max-w-page mx-auto px-4 tab:px-6 desk:px-8 py-10">
      <h1 className="font-serif text-[35px] text-ink-900 font-medium mb-6">Webhooks</h1>
      <form action="/api/webhooks" method="post" className="grid gap-3 mb-6 max-w-[640px]">
        <input name="url" placeholder="https://example.com/ctr-webhook" className="border border-ink-250 px-3 py-2 text-sm" />
        <label className="font-mono text-[12px] text-ink-600"><input type="checkbox" name="eventTypes" value="new_call_digest" defaultChecked /> new_call_digest</label>
        <label className="font-mono text-[12px] text-ink-600"><input type="checkbox" name="eventTypes" value="consensus_signal" defaultChecked /> consensus_signal</label>
        <button className="bg-accent text-ink-0 px-4 py-2 font-mono text-[12px] tracking-caps uppercase w-fit">Add webhook</button>
      </form>
      <div className="border-y border-ink-150 divide-y divide-ink-150">
        {webhooks.map((webhook) => (
          <div key={webhook.id} className="py-3 flex items-center justify-between gap-4">
            <div>
              <p className="font-mono text-[13px] text-ink-900">{webhook.url}</p>
              <p className="font-mono text-[12px] text-ink-500">{webhook.event_types.join(", ")} · {webhook.active ? "active" : "inactive"}</p>
            </div>
            {webhook.active && (
              <form action="/api/webhooks" method="post">
                <input type="hidden" name="_action" value="delete" />
                <input type="hidden" name="id" value={webhook.id} />
                <button className="text-ink-600 hover:text-ink-900 font-mono text-[12px]">Disable</button>
              </form>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
