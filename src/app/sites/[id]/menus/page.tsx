import Link from "next/link";
import { listMenus, createMenu, setActiveMenu } from "@/lib/actions/menus";
import DeleteMenuButton from "@/components/DeleteMenuButton";

export default async function MenusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const menus = await listMenus(id);

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-neutral-900">Menus</h1>
        <form action={createMenu.bind(null, id)} className="flex items-center gap-2">
          <input
            type="text"
            name="name"
            required
            placeholder="New menu name"
            className="w-48 rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
          >
            + New Menu
          </button>
        </form>
      </div>

      <p className="mb-4 text-sm text-neutral-500">
        Build as many menu arrangements as you like. Only one is active on the live site at a
        time — switch with one click, no rebuilding.
      </p>

      {menus.length === 0 ? (
        <p className="text-sm text-neutral-500">No menus yet — create one above.</p>
      ) : (
        <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
          {menus.map((menu) => (
            <div key={menu.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <Link
                  href={`/sites/${id}/menus/${menu.id}`}
                  className="font-medium text-neutral-900 hover:underline"
                >
                  {menu.name}
                </Link>
                {menu.isActive && (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                    Active
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-sm">
                {!menu.isActive && (
                  <form action={setActiveMenu.bind(null, id, menu.id)}>
                    <button
                      type="submit"
                      className="rounded-md border border-neutral-300 px-3 py-1 hover:bg-neutral-50"
                    >
                      Set Active
                    </button>
                  </form>
                )}
                <DeleteMenuButton siteId={id} menuId={menu.id} menuName={menu.name} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
