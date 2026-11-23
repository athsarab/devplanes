"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Github } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { bootstrapSupabaseSession } from "@/lib/devscope-auth";

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setConfirmation(false);
    try {
      if (password.length < 8) throw new Error("Password must be at least 8 characters");
      const supabase = createSupabaseBrowserClient();
      const { data, error: authError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { data: { name: name.trim() } },
      });
      if (authError) throw new Error(authError.message);
      if (!data.session) {
        setConfirmation(true);
        return;
      }
      await bootstrapSupabaseSession(data.session.access_token);
      router.push("/dashboard");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create account");
    } finally {
      setLoading(false);
    }
  }

  async function oauth(provider: "github" | "google") {
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (authError) setError(authError.message);
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[rgb(var(--canvas))] px-4 text-[rgb(var(--ink))]">
      <section className="w-full max-w-[420px] rounded-2xl border border-[rgb(var(--line))] bg-[rgb(var(--surface))] p-6 shadow-xl shadow-black/5">
        <Link href="/" className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[rgb(var(--accent))] font-mono text-xs font-bold text-white">d.</span><span className="text-sm font-semibold">DevScope</span></Link>
        <h1 className="mt-8 text-2xl font-semibold tracking-tight">Create account</h1>
        <p className="mt-2 text-xs text-[rgb(var(--muted))]">Start an individual workspace or join an existing team.</p>
        <div className="mt-6 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => void oauth("github")} className="flex h-10 items-center justify-center gap-2 rounded-lg border border-[rgb(var(--line))] text-xs font-medium hover:bg-[rgb(var(--surface-raised))]"><Github className="h-4 w-4" />GitHub</button>
          <button type="button" onClick={() => void oauth("google")} className="flex h-10 items-center justify-center gap-2 rounded-lg border border-[rgb(var(--line))] text-xs font-medium hover:bg-[rgb(var(--surface-raised))]"><span className="font-semibold">G</span>Google</button>
        </div>
        <div className="my-5 flex items-center gap-3"><span className="h-px flex-1 bg-[rgb(var(--line))]" /><span className="text-[10px] text-[rgb(var(--muted))]">or use email</span><span className="h-px flex-1 bg-[rgb(var(--line))]" /></div>
        {confirmation ? <div className="mb-4 rounded-lg border border-[rgb(var(--cyan))]/30 bg-[rgb(var(--cyan))]/5 p-3 text-xs">Check your email to confirm your account, then sign in.</div> : null}
        <form onSubmit={submit} className="space-y-3">
          <label className="block text-xs font-medium">Name<input required value={name} onChange={(event) => setName(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-[rgb(var(--line))] bg-[rgb(var(--canvas))] px-3 text-sm outline-none focus:border-[rgb(var(--accent))]" /></label>
          <label className="block text-xs font-medium">Email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-[rgb(var(--line))] bg-[rgb(var(--canvas))] px-3 text-sm outline-none focus:border-[rgb(var(--accent))]" /></label>
          <label className="block text-xs font-medium">Password<input type="password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-[rgb(var(--line))] bg-[rgb(var(--canvas))] px-3 text-sm outline-none focus:border-[rgb(var(--accent))]" /></label>
          {error ? <p role="alert" className="text-xs text-rose-600">{error}</p> : null}
          <button type="submit" disabled={loading} className="h-10 w-full rounded-lg bg-[rgb(var(--accent))] text-xs font-semibold text-white disabled:opacity-60">{loading ? "Creating account…" : "Create account"}</button>
        </form>
        <p className="mt-5 text-center text-xs text-[rgb(var(--muted))]">Already have an account? <Link href="/signin" className="font-medium text-[rgb(var(--accent))]">Sign in</Link></p>
      </section>
    </main>
  );
}
