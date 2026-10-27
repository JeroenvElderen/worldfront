import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { loadCompanyFromCloud, saveCompanyToCloud, signInWithEmail, signUpWithEmail } from "../../services/cloudSaves";
import { useGameStore } from "../../stores/gameStore";

const saveSnapshot = () => {
  const { activeSection, focusedJobId, hasHydrated, jobsLoading, jobsError, ...snapshot } = useGameStore.getState();
  void activeSection; void focusedJobId; void hasHydrated; void jobsLoading; void jobsError;
  return snapshot;
};

export function CloudSavePanel() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUserEmail(session?.user?.email ?? null));
    return () => data.subscription.unsubscribe();
  }, []);
  const execute = async (operation: () => Promise<void>) => {
    setBusy(true); setMessage("");
    try { await operation(); } catch (error) { setMessage(error instanceof Error ? error.message : "Cloud operation failed"); }
    finally { setBusy(false); }
  };
  return <div style={{ position: "fixed", top: 150, right: 10, zIndex: 1500, fontSize: 13 }}>
    <button type="button" onClick={() => setOpen(!open)} style={{ padding: "8px 12px", borderRadius: 10, background: "#133c35", color: "white" }}>☁ Cloud</button>
    {open && <section style={{ width: "min(320px, 90vw)", padding: 14, background: "#12232d", color: "white", borderRadius: 12, boxShadow: "0 8px 24px #0008" }}>
      <strong>WorldFront cloud saves</strong>
      {!supabase ? <p>Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel.</p> : userEmail ? <>
        <p>Signed in: {userEmail}</p>
        <button disabled={busy} onClick={() => void execute(async () => { await saveCompanyToCloud(saveSnapshot()); setMessage("Cloud backup saved."); })}>Save to cloud</button>
        <button disabled={busy} onClick={() => void execute(async () => {
          const saved = await loadCompanyFromCloud();
          if (!saved || !saved.save_data || typeof saved.save_data !== "object" || Array.isArray(saved.save_data)) { setMessage("No valid cloud save found."); return; }
          const state = saved.save_data as Record<string, unknown>;
          if (!("company" in state) || !("vehicles" in state) || !("jobs" in state)) throw new Error("Cloud save has an invalid format.");
          if (!window.confirm("Replace your current local game with the cloud save? Your current local progress will be overwritten. Back it up first.")) return;
          useGameStore.setState(state as Partial<ReturnType<typeof useGameStore.getState>>);
          setMessage("Cloud save restored. Refresh the page to reload map layers.");
        })}>Restore cloud save</button>
        <button disabled={busy} onClick={() => void execute(async () => { const client = supabase; if (!client) throw new Error("Supabase is not configured."); const { error } = await client.auth.signOut(); if (error) throw error; setMessage("Signed out."); })}>Sign out</button>
      </> : <>
        <input aria-label="Cloud account email" type="email" placeholder="Email" value={email} onChange={event => setEmail(event.target.value)} style={{ width: "100%", color: "#111", marginTop: 10 }} />
        <input aria-label="Cloud account password" type="password" placeholder="Password" value={password} onChange={event => setPassword(event.target.value)} style={{ width: "100%", color: "#111", marginTop: 8 }} />
        <button disabled={busy} onClick={() => void execute(async () => { await signInWithEmail(email, password); setMessage("Signed in."); })}>Sign in</button>
        <button disabled={busy} onClick={() => void execute(async () => { await signUpWithEmail(email, password); setMessage("Account created. Check your email if confirmation is enabled."); })}>Register</button>
      </>}
      {message && <p role="status">{message}</p>}
      <p style={{ opacity: 0.7 }}>Manual backups only. Local progress remains your primary save.</p>
    </section>}
  </div>;
}
