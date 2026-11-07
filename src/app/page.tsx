import { Suspense } from "react";
import Dashboard from "@/components/Dashboard";

export default function Home() {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-6xl px-4 py-6"><p>Loading PadelBoard…</p></main>}>
      <Dashboard />
    </Suspense>
  );
}
