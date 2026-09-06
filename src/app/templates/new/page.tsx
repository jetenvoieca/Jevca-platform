import Link from "next/link";
import NewTemplateForm from "./NewTemplateForm";

export default function NewTemplatePage() {
  return (
    <main className="mx-auto max-w-lg px-6 py-10">
      <Link href="/templates" className="text-sm text-neutral-500 hover:underline">
        ← Back to Templates
      </Link>
      <h1 className="mt-4 mb-6 text-2xl font-semibold text-neutral-900">
        Add New Template
      </h1>
      <NewTemplateForm />
    </main>
  );
}
