export default function ThreeColumnShell({
  preview,
  edit,
  menu,
}: {
  preview: React.ReactNode;
  edit: React.ReactNode;
  menu: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[1fr_1.3fr_260px] gap-0">
      <div className="border-r border-neutral-200 bg-neutral-50 p-6">{preview}</div>
      <div className="p-6">{edit}</div>
      <div className="border-l border-neutral-200 p-4">{menu}</div>
    </div>
  );
}
