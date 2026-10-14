# Technical architecture and operating boundaries

## Current public demo
The root index.html is a static prototype. All branding variations are deterministic and client-side; sample application entries and saved concepts use browser localStorage only. Do not enter real personal information.

## Future production
- Vercel: separate project connected to The_barber_label GitHub repository
- Server: authenticated API for applications and AI design requests
- Supabase: dedicated project with RLS, no anonymous direct access to applications
- OpenAI: server-only API key, rate limits and budget
- Admin: staff-only authentication, permissions, audit trail
- Payments: only after explicit merchant onboarding and fulfillment/compliance review

## Important safeguards
- Never expose OpenAI or Supabase service-role keys in HTML or frontend bundles.
- Never make an application table directly readable by anonymous clients.
- Do not claim generated label concepts are compliant retail product labels.
- Do not launch payments or promise fulfillment before supplier and compliance readiness.
- Treat all wholesale and retail prices as proposals pending confirmation.
