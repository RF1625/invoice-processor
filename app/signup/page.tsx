"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [firmName, setFirmName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name, firmName }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Sign up failed");
        return;
      }
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200 px-6 py-12 text-slate-900">
      <div className="mx-auto max-w-md space-y-8 rounded-2xl bg-white p-8 shadow-xl ring-1 ring-slate-100">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-slate-500">Create account</p>
          <h1 className="text-2xl font-semibold">Set up your workspace</h1>
          <p className="text-sm text-slate-600">
            We&apos;ll create a company (firm) for you and make you the owner. Invite teammates later.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block space-y-1 text-sm font-medium text-slate-700">
            <span>Work email</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
            />
          </label>

          <label className="block space-y-1 text-sm font-medium text-slate-700">
            <span>Your name</span>
            <input
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
            />
          </label>

          <label className="block space-y-1 text-sm font-medium text-slate-700">
            <span>Company / firm name</span>
            <input
              type="text"
              required
              value={firmName}
              onChange={(e) => setFirmName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
            />
          </label>

          <label className="block space-y-1 text-sm font-medium text-slate-700">
            <span>Password</span>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
            />
            <span className="text-xs font-normal text-slate-500">At least 8 characters.</span>
          </label>

          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-full items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>

        <div className="flex items-center justify-between text-sm text-slate-700">
          <span>Already have an account?</span>
          <Link className="font-semibold text-slate-900 underline-offset-4 hover:underline" href="/login">
            Login
          </Link>
        </div>
      </div>
    </main>
  );
}
