import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { loadCompanyFromCloud, saveCompanyToCloud, signInWithEmail, signUpWithEmail } from "../../services/cloudSaves";
import { useGameStore } from "../../stores/gameStore";
import { snapshotTaxiPositions, persistTaxiPositions } from "../../services/liveTaxiPositions";

const saveSnapshot = () => {
  const { activeSection, focusedJobId, hasHydrated, jobsLoading, jobsError, ...snapshot } = useGameStore.getState();
  void activeSection; void focusedJobId; void hasHydrated; void jobsLoading; void jobsError;
  persistTaxiPositions();
  return { ...snapshot, vehicles: snapshotTaxiPositions(snapshot.vehicles) };
};

export function CloudSavePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [autoBackup, setAutoBackup] = useState(false);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const backupInProgress = useRef(false);
  const cloudSavedAt = useRef(0);
  const cloudRevision = useRef<number | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => { setUserEmail(session?.user?.email ?? null); if (!session) { setAutoBackup(false); cloudRevision.current = null; } });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!autoBackup || !userEmail) return;
    let cancelled = false;
    let previousSnapshot = "";
    const backup = async () => {
      const game = useGameStore.getState();
      if (cancelled || backupInProgress.current || !game.hasHydrated || !game.company) return;
      const snapshot = saveSnapshot();
      const serialized = JSON.stringify(snapshot);
      if (serialized === previousSnapshot) return;
      backupInProgress.current = true;
      try {
        if (cloudRevision.current === null) throw new Error("Cloud revision unknown. Restart automatic backup.");
        cloudRevision.current = await saveCompanyToCloud(snapshot, cloudRevision.current);
        cloudSavedAt.current = Date.now();
        if (!cancelled) { previousSnapshot = serialized; setLastBackup(new Date().toLocaleTimeString()); }
      } catch (error) {
        if (!cancelled) { setAutoBackup(false); setMessage(error instanceof Error ? error.message : "Cloud backup failed"); }
      } finally { backupInProgress.current = false; }
    };
    void backup();
    const interval = window.setInterval(() => void backup(), 60_000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [autoBackup, userEmail]);
  // Detect other devices writing to the same save; never silently overwrite them.
  useEffect(() => {
    if (!autoBackup || !userEmail) return;
    let disposed = false;
    const checkRemote = async () => {
      try {
        const remote = await loadCompanyFromCloud();
        if (disposed || !remote) return;
        const timestamp = new Date(remote.saved_at).getTime();
        if (remote.revision !== cloudRevision.current || (Number.isFinite(timestamp) && timestamp > cloudSavedAt.current + 2_000)) {
          setAutoBackup(false);
          setMessage("Another device updated this cloud save. Automatic backup paused to prevent overwriting it. Restore or manually save after reviewing your progress.");
        }
      } catch { /* Temporary connectivity failures are handled by backup attempts. */ }
    };
    const timer = window.setInterval(() => void checkRemote(), 90_000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [autoBackup, userEmail]);
  const startAutoBackup = async () => {
    const game = useGameStore.getState();
    if (!game.hasHydrated || !game.company) throw new Error("Load a company before enabling backup.");
    const previous = await loadCompanyFromCloud();
    cloudSavedAt.current = previous ? new Date(previous.saved_at).getTime() : 0;
    cloudRevision.current = previous?.revision ?? 0;
    if (previous && !window.confirm("A cloud save already exists. Replace it with this device's progress and enable automatic backup?")) return;
    setAutoBackup(true);
    setMessage("Automatic Supabase backup enabled for this session.");
  };
  const execute = async (operation: () => Promise<void>) => {
    setBusy(true); setMessage("");
    try { await operation(); } catch (error) { setMessage(error instanceof Error ? error.message : "Cloud operation failed"); }
    finally { setBusy(false); }
  };
  return <div style={{ position: "fixed", inset: 0, zIndex: 2500, display: open ? "flex" : "none", alignItems: "center", justifyContent: "center", background: "#0009", padding: 16, fontSize: 13 }} role="presentation" onClick={onClose}>
    <section role="dialog" aria-modal="true" aria-label="Cloud saves" onClick={(event) => event.stopPropagation()} style={{ width: "min(360px, 92vw)", maxHeight: "80vh", overflowY: "auto", padding: 16, background: "#12232d", color: "white", borderRadius: 12, boxShadow: "0 8px 24px #0008" }}>
      <button type="button" onClick={onClose} aria-label="Close cloud saves" style={{ float: "right", color: "white", background: "transparent", border: 0, fontSize: 20 }}>×</button>
      <strong>WorldFront cloud saves</strong>
      {!supabase ? <p>Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel.</p> : userEmail ? <>
        <p>Signed in: {userEmail}</p>
        <button disabled={busy} onClick={() => void execute(async () => { const current = await loadCompanyFromCloud(); if (current && current.revision !== cloudRevision.current && !window.confirm("Cloud save has changed or has not been loaded in this session. Replace the remote progress?")) return; cloudRevision.current = await saveCompanyToCloud(saveSnapshot(), current?.revision ?? 0); cloudSavedAt.current = Date.now(); setLastBackup(new Date().toLocaleTimeString()); setMessage("Cloud backup saved."); })}>Save to cloud</button>
        <button disabled={busy} onClick={() => void execute(async () => { if (autoBackup) { setAutoBackup(false); setMessage("Automatic backup stopped."); } else await startAutoBackup(); })}>{autoBackup ? "Stop auto backup" : "Start auto backup"}</button>
        {lastBackup && <p>Last cloud backup: {lastBackup}</p>}
        <button disabled={busy} onClick={() => void execute(async () => {
          const saved = await loadCompanyFromCloud();
          if (!saved || !saved.save_data || typeof saved.save_data !== "object" || Array.isArray(saved.save_data)) { setMessage("No valid cloud save found."); return; }
          const state = saved.save_data as Record<string, unknown>;
          if (!("company" in state) || !("vehicles" in state) || !("jobs" in state)) throw new Error("Cloud save has an invalid format.");
          if (!window.confirm("Replace your current local game with the cloud save? Your current local progress will be overwritten. Back it up first.")) return;
          setAutoBackup(false);
          cloudRevision.current = saved.revision;
          cloudSavedAt.current = new Date(saved.saved_at).getTime();
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
      <p style={{ opacity: 0.7 }}>Local progress remains your primary save. Automatic backups require opt-in each session.</p>
    </section>
  </div>;
}
