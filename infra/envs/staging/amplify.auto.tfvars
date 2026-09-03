# Client-safe values only - Vite bakes these into the public bundle.
# Copy from the Vercel project's environment variables BEFORE merging;
# the Supabase URL/anon key are public by design (RLS is the boundary).
vite_supabase_url      = "https://akceiidofsiajrjtgone.supabase.co" # cambree-staging project
vite_supabase_anon_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFrY2VpaWRvZnNpYWpyanRnb25lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyODE2OTgsImV4cCI6MjEwMDg1NzY5OH0.IFyk54T-pg1uWCEp3E1BO-kDHTIQXjgH23qImLYBehU"
vite_app_url           = "https://staging.d33ublf97u0bs6.amplifyapp.com" # interim; becomes https://staging.cambree.ai after the #84 domain flip
vite_api_url           = "https://staging.cambree.ai" # Vercel staging serves /api there
# Per-endpoint AWS overrides (issue #86, strangler): only the endpoints listed
# here hit API Gateway; everything else stays on vite_api_url. Value from the
# env's `api_endpoint` Terraform output. Amplify env-var changes don't rebuild
# on their own - trigger a release after this applies.
vite_api_endpoint_origins = "{\"/api/contact\":\"https://mcvaccmuoj.execute-api.us-east-2.amazonaws.com\"}"
