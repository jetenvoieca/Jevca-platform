import LoginForm from "@/components/LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
      <LoginForm next={next && next.startsWith("/") ? next : "/"} />
    </div>
  );
}
