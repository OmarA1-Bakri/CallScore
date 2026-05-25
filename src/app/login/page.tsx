"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    
    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      setError("Invalid password");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink-0">
      <form onSubmit={handleSubmit} className="border border-ink-250 bg-ink-50 p-8 max-w-sm w-full" style={{ borderRadius: 2 }}>
        <h1 className="font-serif text-[24px] text-ink-900 mb-6">Access CallScore</h1>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter access password"
          className="w-full border border-ink-250 bg-ink-0 px-4 py-3 font-mono text-[14px] text-ink-900 mb-4 focus:outline-none focus:border-accent"
          style={{ borderRadius: 2 }}
        />
        {error && <p className="text-neg font-mono text-[12px] mb-4">{error}</p>}
        <button
          type="submit"
          className="w-full bg-accent hover:bg-accent-dim text-ink-0 font-mono text-[13px] tracking-caps uppercase px-7 py-3 transition-colors"
          style={{ borderRadius: 2 }}
        >
          Sign in
        </button>
      </form>
    </div>
  );
}
