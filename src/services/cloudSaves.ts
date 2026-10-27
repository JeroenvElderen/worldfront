import { supabase } from "../lib/supabase";

export type CloudSave = {
  user_id: string;
  revision: number;
  saved_at: string;
  save_data: unknown;
};

const requireUser = async () => {
  if (!supabase) throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Sign in before accessing cloud saves.");
  return data.user;
};

export const signInWithEmail = async (email: string, password: string) => {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
};

export const signUpWithEmail = async (email: string, password: string) => {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
};

// Caller must retain the revision from the last load or successful write.
export const saveCompanyToCloud = async (saveData: unknown, expectedRevision: number): Promise<number> => {
  await requireUser();
  const { data, error } = await supabase!.rpc("worldfront_save_if_current", {
    expected_revision: expectedRevision,
    payload: saveData,
  });
  if (error) throw error;
  if (typeof data !== "number") throw new Error("Supabase did not return a save revision.");
  return data;
};

export const loadCompanyFromCloud = async (): Promise<CloudSave | null> => {
  const user = await requireUser();
  const { data, error } = await supabase!
    .from("worldfront_saves")
    .select("user_id,revision,updated_at,payload")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  let saveData: unknown;
  try { saveData = JSON.parse(data.payload as string); }
  catch { throw new Error("Cloud save contains invalid JSON."); }
  return { user_id: data.user_id as string, revision: data.revision as number, saved_at: data.updated_at as string, save_data: saveData };
};

/** Read-only map projection of the authoritative, revisioned company save.
 * Run supabase/map-state-view.sql before using this optional endpoint.
 * Never stream animation frames into Supabase: Mapbox renders them locally.
 */
export type CloudMapState = {
  user_id: string;
  revision: number;
  saved_at: string;
  vehicles: unknown[];
  missions: unknown[];
  explored_territory: unknown;
  territory_expansions: unknown[];
  branches: unknown[];
  harbours: unknown[];
  transport_routes: unknown[];
};

export const loadCloudMapState = async (): Promise<CloudMapState | null> => {
  const user = await requireUser();
  const { data, error } = await supabase!
    .from("worldfront_map_state")
    .select("user_id,revision,saved_at,vehicles,missions,explored_territory,territory_expansions,branches,harbours,transport_routes")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  return data as CloudMapState | null;
};
