"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// "Setting up your site" (2026-11-10): looks again every few seconds until
// the site is ready, for up to two minutes.
const EVERY_MS = 3000;
const TRIES = 40;

export default function SignupWaiting() {
  const router = useRouter();
  const [tries, setTries] = useState(0);

  useEffect(() => {
    if (tries >= TRIES) return;
    const timer = setTimeout(() => {
      router.refresh();
      setTries((t) => t + 1);
    }, EVERY_MS);
    return () => clearTimeout(timer);
  }, [tries, router]);

  return (
    <p className="text-neutral-600">
      {tries < TRIES
        ? "Your payment has gone through. We're setting up your site — this takes a moment…"
        : "Your payment has gone through. Setting up your site is taking longer than usual — we'll email you as soon as it's ready."}
    </p>
  );
}
