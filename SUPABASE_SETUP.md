# WorldFront Supabase setup

1. Create a Supabase project and run `supabase/schema.sql` in SQL Editor.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel project environment variables.
3. Run `pnpm install` and deploy.
4. The new `src/services/cloudSaves.ts` module provides email sign-in/sign-up and manual cloud save/load APIs.
5. The current game UI and local persistence are unchanged. Cloud saves are **not automatically connected** to the existing Zustand/IndexedDB game store. Do not replace local saves until migration and restore have been tested.
6. Never put the Supabase service-role key in a Vite environment variable.
