"use client";

import { useTransition } from "react";
import { deleteMenu } from "@/lib/actions/menus";

export default function DeleteMenuButton({
  siteId,
  menuId,
  menuName,
}: {
  siteId: string;
  menuId: string;
  menuName: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        if (!confirm(`Delete "${menuName}"? This removes all its groups and items.`)) return;
        startTransition(async () => {
          await deleteMenu(siteId, menuId);
        });
      }}
      className="text-red-500 hover:underline disabled:opacity-50"
    >
      Delete
    </button>
  );
}
