import AppShell from "@/components/AppShell";
import NamecheapImportForm from "@/components/NamecheapImportForm";

export default function NamecheapSyncPage() {
  return (
    <AppShell
      publishEnabled={false}
      navItems={[{ label: "Sites", href: "/" }]}
      preview={
        <div className="text-sm text-neutral-600">
          <h2 className="mb-2 text-sm font-semibold text-neutral-900">Why this is separate</h2>
          <p className="mb-3">
            Namecheap only accepts API calls from a whitelisted IP address, and the Studio app
            (on Netlify) doesn&apos;t have a fixed one. So instead of syncing live from here, a
            small script runs on your own computer — using your own, stable IP — and produces a
            file you import right here.
          </p>
          <p>Your Namecheap API key never touches this app or gets committed anywhere.</p>
        </div>
      }
      content={
        <div>
          <h1 className="mb-1 text-2xl font-semibold text-neutral-900">Namecheap Sync</h1>
          <p className="mb-6 text-sm text-neutral-500">
            Updates each Site&apos;s Domain status and Renewal date from your Namecheap account.
          </p>

          <div className="mb-6 max-w-xl rounded-lg border border-neutral-200 bg-neutral-50 p-5 text-sm text-neutral-600">
            <p className="mb-2 font-medium text-neutral-800">One-time setup, on your computer</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                In Namecheap: Profile → Tools → Namecheap API Access → enable it, generate an API
                key, and whitelist your current IP.
              </li>
              <li>
                In your local copy of this repo, copy <code>.env.namecheap.example</code> to{" "}
                <code>.env.namecheap</code> and fill in your username, API key, and whitelisted
                IP. This file is gitignored — it never gets committed.
              </li>
              <li>
                Run <code>node scripts/fetch-domains.js</code> in Terminal. It writes{" "}
                <code>namecheap-domains.json</code> in the project folder.
              </li>
              <li>Import that file below.</li>
            </ol>
          </div>

          <NamecheapImportForm />
        </div>
      }
    />
  );
}
