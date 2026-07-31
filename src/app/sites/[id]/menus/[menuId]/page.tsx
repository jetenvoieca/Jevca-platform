import { notFound } from "next/navigation";
import { getMenu, getSitePages } from "@/lib/actions/menus";
import MenuBuilder from "@/components/MenuBuilder";

export default async function MenuBuilderPage({
  params,
}: {
  params: Promise<{ id: string; menuId: string }>;
}) {
  const { id, menuId } = await params;

  const menu = await getMenu(menuId);
  if (!menu || menu.siteId !== id) notFound();

  const sitePages = await getSitePages(id);

  return <MenuBuilder siteId={id} menu={menu} sitePages={sitePages} />;
}
