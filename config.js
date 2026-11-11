/* ============================================================================
   Khelaghor — site configuration
   ----------------------------------------------------------------------------
   Supabase (free tier) connects the game + admin panel to ONE shared
   settings store, so the admin's changes apply to EVERY visitor.

   HOW TO FILL THIS IN (only after the Supabase project exists):
   1. Create a free project at https://supabase.com (sign in with GitHub/Google)
   2. In Supabase: SQL Editor -> paste supabase.sql -> Run
   3. In Supabase: Settings -> API -> copy "Project URL" and "anon public" key
   4. Paste them below (or send them to the assistant, who will fill them in
      and redeploy). Until then the site works fully on built-in defaults.
   ========================================================================== */
window.KHELAGHOR_CONFIG = {
  supabaseUrl: "",     // e.g. "https://abcdefghijklm.supabase.co"
  supabaseAnonKey: "", // the "anon public" key (safe to embed; RLS + RPC gate writes)
  siteName: "Khelaghor"
};
