import { logout } from "@/lib/actions/auth";

// A plain Log out button (2026-10-26), for pages without the app's menu.
export default function LogoutButton() {
  return (
    <form action={logout}>
      <button
        type="submit"
        className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
      >
        Log out
      </button>
    </form>
  );
}
