"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { archiveSite, restoreSite } from "@/lib/actions";

export default function ArchiveButton({
  siteId,
  isArchived,
}: {
  siteId: string;
  isArchived: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleClick = () => {
    if (
      !isArchived &&
      !confirm(
        "Archive this site? It will be hidden from the main list but can be restored later."
      )
    ) {
      return;
    }
    startTransition(async () => {
      if (isArchived) {
        await restoreSite(siteId);
      } else {
        await archiveSite(siteId);
      }
      router.refresh();
    });
  };

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="text-sm text-neutral-500 hover:text-neutral-900 hover:underline disabled:opacity-50"
    >
      {isArchived ? "Restore" : "Archive"}
    </button>
  );
}
