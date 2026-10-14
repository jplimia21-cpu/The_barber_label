-- FUTURE production database schema. Not deployed.
-- Run only in a dedicated Barber Label Supabase project after reviewing security.
create extension if not exists pgcrypto;
create table if not exists public.barber_applications (
 id uuid primary key default gen_random_uuid(),
 created_at timestamptz not null default now(),
 applicant_name text not null check (char_length(applicant_name) between 2 and 120),
 shop_name text not null check (char_length(shop_name) between 2 and 120),
 email text not null check (char_length(email) between 5 and 254),
 city text not null check (char_length(city) between 2 and 100),
 brand_name text not null check (char_length(brand_name) between 2 and 100),
 monthly_quantity integer not null check (monthly_quantity in (12,24,48)),
 product_preference text not null,
 consent_to_contact boolean not null check (consent_to_contact = true),
 status text not null default 'new' check (status in ('new','reviewing','approved','declined')),
 internal_notes text,
 constraint application_email_format check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$')
);
create index if not exists barber_applications_created_at_idx on public.barber_applications(created_at desc);
alter table public.barber_applications enable row level security;
-- No client-facing policies: anon and authenticated browser clients have no access.
revoke all on table public.barber_applications from anon, authenticated;
-- Only a server-side trusted application with protected credentials may process submissions.
