/* Public client configuration. The anon key is the same public key as the website (row level security applies);
   no service-role or other server secret is ever shipped in the application. */
const PRODUCTION_URL = "https://oubmftfufwwzwpgvrcag.supabase.co";
const PRODUCTION_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91Ym1mdGZ1Znd3endwZ3ZyY2FnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxOTMyODAsImV4cCI6MjA3OTc2OTI4MH0.sjv09LUsG2ALY7AsJbA-0f8SB6YCDYLIQEiqcQxdfrU";
// End-to-end test builds only (CI emulator against a local replica of the production schema). Release builds never set
// these variables, and the workflow rejects a release APK whose bundle contains a non-production Supabase address.
export const SUPABASE_URL = process.env.EXPO_PUBLIC_TITAN_E2E_SUPABASE_URL || PRODUCTION_URL;
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_TITAN_E2E_SUPABASE_ANON_KEY || PRODUCTION_ANON_KEY;
export const IS_E2E = !!process.env.EXPO_PUBLIC_TITAN_E2E_SUPABASE_URL;
export const SITE_URL = "https://titan-app.fr";
export const SUPPORT_EMAIL = "titanteam.app@gmail.com";
