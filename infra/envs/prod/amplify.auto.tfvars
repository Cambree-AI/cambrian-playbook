# Client-safe values only - Vite bakes these into the public bundle.
# Copy from the Vercel project's environment variables BEFORE merging;
# the Supabase URL/anon key are public by design (RLS is the boundary).
vite_supabase_url      = "https://xtnidawfuaxwwwcnkewu.supabase.co" # Cambrian Playbook project (live production data)
vite_supabase_anon_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0bmlkYXdmdWF4d3d3Y25rZXd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3Njc2NzEsImV4cCI6MjA5MTM0MzY3MX0.JPTyCbsLk9Kr4AHo3ynszOo_SxvLA-XpT_5TzP8M71o"
vite_app_url           = "https://cambree.ai" # the live production site; stays correct through the #85 cutover
vite_api_url           = "https://www.cambree.ai" # Vercel prod /api; MUST switch before the #85 cutover (the vercel.app alias 307s to this domain today, unusable for CORS)
# Per-endpoint AWS overrides (issue #86, strangler): only the endpoints listed
# here hit API Gateway; everything else stays on vite_api_url. Value from the
# env's `api_endpoint` Terraform output. Amplify env-var changes don't rebuild
# on their own - trigger a release after this applies.
vite_api_endpoint_origins = "{\"/api/contact\":\"https://ndrgushglj.execute-api.us-east-2.amazonaws.com\"}"
