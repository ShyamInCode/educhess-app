import { createClient } from "@supabase/supabase-js";

/* ============================================================
   Where to put your Supabase credentials
   ------------------------------------------------------------
   1. Create a file named `.env` in the project root (same folder
      as package.json) — copy `.env.example` to `.env`.
   2. Fill in:
        VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
        VITE_SUPABASE_ANON_KEY=YOUR-ANON-PUBLIC-KEY
      Both values are on your Supabase dashboard under:
        Project Settings → API → Project URL / Project API keys (anon public)
   3. Restart `npm run dev` after adding/changing the .env file —
      Vite only reads env vars at startup.
   Never put the `service_role` key here — only the `anon` key,
   since this code ships to the browser.
   ============================================================ */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "[EduChess] Missing Supabase credentials. Copy .env.example to .env and fill in " +
    "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart the dev server."
  );
}

export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-anon-key"
);
