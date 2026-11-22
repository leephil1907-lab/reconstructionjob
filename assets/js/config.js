/* Runtime configuration. Public, browser-safe values only — the anon key is
   guarded by row-level security (public may insert form leads and chat with
   the company via RPC; everything else requires the admin login). */
window.RC_CONFIG = {
  supabaseUrl: 'https://rvwirpfclysapqtnrlvx.supabase.co',
  publishableKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2d2lycGZjbHlzYXBxdG5ybHZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0ODQ4OTIsImV4cCI6MjEwNTA2MDg5Mn0.ypy92Je_wrb8yC9WbNL0t1PP06UA6N1-8Kb0996lt10',
  contactEmail: 'reconstructionusa@proton.me'
};
