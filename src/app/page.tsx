import { db } from "@/lib/db";

export default async function Home() {
  let artistCount = 0;
  let siteCount = 0;
  let error: string | null = null;

  try {
    artistCount = await db.artist.count();
    siteCount = await db.site.count();
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error connecting to the database.";
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">JEVCA Studio — foundation check</h1>
      {error ? (
        <div className="max-w-md rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-medium">Could not connect to the database.</p>
          <p className="mt-1">{error}</p>
        </div>
      ) : (
        <div className="max-w-md rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
          <p className="font-medium">Connected to Neon successfully.</p>
          <p className="mt-1">Artists: {artistCount} · Sites: {siteCount}</p>
        </div>
      )}
    </main>
  );
}
