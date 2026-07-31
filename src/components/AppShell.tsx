import Link from "next/link";

export type AppShellNavItem = {
  label: string;
  href: string;
  active?: boolean;
  disabled?: boolean;
};

export default function AppShell({
  preview,
  content,
  publishEnabled = false,
  navItems,
}: {
  preview: React.ReactNode;
  content: React.ReactNode;
  // Publish is greyed out until there's a specific site open with pending
  // draft changes — neither of which exists at the top-level Sites screen,
  // so callers leave this false until that logic is built.
  publishEnabled?: boolean;
  navItems: AppShellNavItem[];
}) {
  return (
    <div className="grid min-h-screen grid-cols-[340px_1fr_220px]">
      <div className="border-r border-neutral-200 bg-neutral-50 p-6">{preview}</div>
      <div className="p-6">{content}</div>
      <div className="flex flex-col gap-2 border-l border-neutral-200 p-4">
        <button
          type="button"
          disabled={!publishEnabled}
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400 disabled:hover:bg-neutral-200"
        >
          Publish to live site
        </button>

        <nav className="mt-2 flex flex-col gap-1">
          {navItems.map((item) =>
            item.disabled ? (
              <span
                key={item.href}
                className="cursor-not-allowed rounded-md px-3 py-2 text-sm font-medium text-neutral-300"
              >
                {item.label}
              </span>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-3 py-2 text-sm font-medium ${
                  item.active
                    ? "bg-neutral-900 text-white"
                    : "text-neutral-700 hover:bg-neutral-100"
                }`}
              >
                {item.label}
              </Link>
            )
          )}
        </nav>
      </div>
    </div>
  );
}
