# Client-safe values only - Vite bakes these into the public bundle.
# Copy from the Vercel project's environment variables BEFORE merging;
# the Supabase URL/anon key are public by design (RLS is the boundary).
vite_supabase_url      = "https://xtnidawfuaxwwwcnkewu.supabase.co" # Cambrian Playbook project (live production data)
vite_supabase_anon_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0bmlkYXdmdWF4d3d3Y25rZXd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3Njc2NzEsImV4cCI6MjA5MTM0MzY3MX0.JPTyCbsLk9Kr4AHo3ynszOo_SxvLA-XpT_5TzP8M71o"
vite_app_url           = "" # keep the Vercel value (https://cambree.ai) - prod links must point at the live site until the #85 cutover
