"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"lien" | "mdp">("lien");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    if (mode === "lien") {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false, emailRedirectTo: `${location.origin}/auth/callback` },
      });
      setMsg(error ? { ok: false, t: "Envoi impossible. Vérifiez l'adresse : seuls les associés invités peuvent se connecter." } : { ok: true, t: "Lien envoyé : ouvrez votre boîte mail et cliquez sur le lien." });
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg({ ok: false, t: "E-mail ou mot de passe incorrect." });
      else location.href = "/";
    }
    setBusy(false);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <h1 className="text-xl font-bold">Suivi financier</h1>
      <p className="mb-5 text-sm text-mut">CELAVIV × GROUPE PNC · accès réservé aux associés</p>
      <form onSubmit={submit} className="card">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">E-mail</span>
          <input className="inp" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {mode === "mdp" && (
          <label className="mt-3 block">
            <span className="mb-1 block text-sm font-semibold">Mot de passe</span>
            <input className="inp" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
        )}
        <button type="submit" className="btn btn-p mt-4 w-full" disabled={busy}>
          {mode === "lien" ? "Recevoir un lien de connexion" : "Se connecter"}
        </button>
        <button type="button" className="mt-3 w-full text-sm text-mut underline" onClick={() => setMode(mode === "lien" ? "mdp" : "lien")}>
          {mode === "lien" ? "Se connecter avec un mot de passe" : "Recevoir plutôt un lien par e-mail"}
        </button>
        {msg && (
          <p role="status" className={`mt-3 text-sm font-semibold ${msg.ok ? "text-ok" : "text-bad"}`}>
            {msg.t}
          </p>
        )}
      </form>
    </main>
  );
}
