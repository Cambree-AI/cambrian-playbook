# Client-safe values only - Vite bakes these into the public bundle.
# Copy from the Vercel project's environment variables BEFORE merging;
# the Supabase URL/anon key are public by design (RLS is the boundary).
vite_supabase_url      = "https://akceiidofsiajrjtgone.supabase.co" # cambree-staging project
vite_supabase_anon_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFrY2VpaWRvZnNpYWpyanRnb25lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyODE2OTgsImV4cCI6MjEwMDg1NzY5OH0.IFyk54T-pg1uWCEp3E1BO-kDHTIQXjgH23qImLYBehU"
vite_app_url           = "" # end-state https://staging.cambree.ai (live on Vercel today; set after the #84 domain flip). Until then: amplify_branch_url output
