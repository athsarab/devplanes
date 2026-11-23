"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Github } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { bootstrapSupabaseSession } from "@/lib/devscope-auth";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (authError) throw new Error(authError.message);
      if (!data.session) throw new Error("Sign-in did not create an authentication session");
      await bootstrapSupabaseSession(data.session.access_token);
      router.push("/dashboard");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to sign in");
    } finally {
      setLoading(false);
    }
  }

  async function oauth(provider: "github" | "google") {
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (authError) setError(authError.message);
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[rgb(var(--canvas))] px-4 text-[rgb(var(--ink))]">
      <section className="w-full max-w-[420px] rounded-2xl border border-[rgb(var(--line))] bg-[rgb(var(--surface))] p-6 shadow-xl shadow-black/5">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[rgb(var(--accent))] font-mono text-xs font-bold text-white">d.</span>
          <span className="text-sm font-semibold">DevScope</span>
        </Link>
        <h1 className="mt-8 text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-2 text-xs text-[rgb(var(--muted))]">Use your DevScope account or a connected provider.</p>
        <div className="mt-6 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => void oauth("github")} className="flex h-10 items-center justify-center gap-2 rounded-lg border border-[rgb(var(--line))] text-xs font-medium hover:bg-[rgb(var(--surface-raised))]"><Github className="h-4 w-4" />GitHub</button>
          <button type="button" onClick={() => void oauth("google")} className="flex h-10 items-center justify-center gap-2 rounded-lg border border-[rgb(var(--line))] text-xs font-medium hover:bg-[rgb(var(--surface-raised))]"><span className="font-semibold">G</span>Google</button>
        </div>
        <div className="my-5 flex items-center gap-3"><span className="h-px flex-1 bg-[rgb(var(--line))]" /><span className="text-[10px] text-[rgb(var(--muted))]">or continue with email</span><span className="h-px flex-1 bg-[rgb(var(--line))]" /></div>
        <form onSubmit={signIn} className="space-y-3">
          <label className="block text-xs font-medium">Email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-[rgb(var(--line))] bg-[rgb(var(--canvas))] px-3 text-sm outline-none focus:border-[rgb(var(--accent))]" /></label>
          <label className="block text-xs font-medium">Password<input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-[rgb(var(--line))] bg-[rgb(var(--canvas))] px-3 text-sm outline-none focus:border-[rgb(var(--accent))]" /></label>
          {error ? <p role="alert" className="text-xs text-rose-600">{error}</p> : null}
          <button type="submit" disabled={loading} className="h-10 w-full rounded-lg bg-[rgb(var(--accent))] text-xs font-semibold text-white disabled:opacity-60">{loading ? "Signing in…" : "Sign in"}</button>
        </form>
        <p className="mt-5 text-center text-xs text-[rgb(var(--muted))]">New to DevScope? <Link href="/signup" className="font-medium text-[rgb(var(--accent))]">Create an account</Link></p>
      </section>
    </main>
  );
}
