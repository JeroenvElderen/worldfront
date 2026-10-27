import { supabase } from "../lib/supabase";

export type CloudSave = {
  id: string;
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

export const saveCompanyToCloud = async (saveData: unknown) => {
  const user = await requireUser();
  const { error } = await supabase!.from("worldfront_saves").upsert({
    user_id: user.id,
    save_data: saveData,
    saved_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) throw error;
};

export const loadCompanyFromCloud = async (): Promise<CloudSave | null> => {
  const user = await requireUser();
  const { data, error } = await supabase!
    .from("worldfront_saves")
    .select("id,saved_at,save_data")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  return data as CloudSave | null;
};
