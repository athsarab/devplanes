"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { bootstrapSupabaseSession } from "@/lib/devscope-auth";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function complete() {
      try {
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        const supabase = createSupabaseBrowserClient();
        if (!code) {
          const { data } = await supabase.auth.getSession();
          if (!data.session) throw new Error("OAuth sign-in did not create a session");
          await bootstrapSupabaseSession(data.session.access_token);
        } else {
          const { data, error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
          if (!data.session) throw new Error("OAuth sign-in did not create a session");
          await bootstrapSupabaseSession(data.session.access_token);
        }
        router.replace("/dashboard");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to complete sign-in");
      }
    }
    void complete();
  }, [router]);

  return (
    <main className="grid min-h-screen place-items-center bg-[rgb(var(--canvas))] px-4 text-[rgb(var(--ink))]">
      <div className="text-center">
        {error ? (
          <>
            <p role="alert" className="text-sm text-rose-600">{error}</p>
            <button type="button" onClick={() => router.push("/signin")} className="mt-4 h-9 rounded-lg border border-[rgb(var(--line))] px-4 text-xs">Return to sign in</button>
          </>
        ) : (
          <p className="text-sm text-[rgb(var(--muted))]">Completing secure sign-in…</p>
        )}
      </div>
    </main>
  );
}
