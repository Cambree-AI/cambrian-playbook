# Client-safe values only - Vite bakes these into the public bundle.
# Copy from the Vercel project's environment variables BEFORE merging;
# the Supabase URL/anon key are public by design (RLS is the boundary).
vite_supabase_url      = "" # TODO: https://<project-ref>.supabase.co
vite_supabase_anon_key = "" # TODO: anon key from Vercel env / Supabase dashboard
vite_app_url           = "" # after first apply: the amplify_branch_url output
