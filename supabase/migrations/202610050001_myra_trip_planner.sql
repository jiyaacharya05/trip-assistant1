-- Myra Trip Planner schema. Apply in Supabase SQL Editor or with `supabase db push`.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null default '',
  mobile text not null default '',
  preferred_country text,
  preferred_currency text not null default 'INR',
  created_at timestamptz not null default now()
);
create table if not exists public.trip_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  destination text not null,
  start_date date,
  end_date date check (end_date is null or start_date is null or end_date >= start_date),
  budget_inr integer check (budget_inr is null or budget_inr >= 0),
  travellers_type text check (travellers_type is null or travellers_type in ('solo','couple','family','friends')),
  interests text not null default '',
  pace text check (pace is null or pace in ('relaxed','normal','packed')),
  status text not null default 'in_progress' check (status in ('in_progress','complete')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.itineraries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_request_id uuid not null references public.trip_requests(id) on delete cascade,
  persona text not null check (persona in ('Amit Verma','Riya Sharma')),
  itinerary_json jsonb not null,
  itinerary_summary text not null,
  ai_explanation text,
  review_status text not null default 'Pending review' check (review_status in ('Pending review','Approved','Rejected')),
  created_at timestamptz not null default now()
);
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  itinerary_id uuid references public.itineraries(id) on delete set null,
  booking_ref text not null unique,
  details_json jsonb not null default '{}'::jsonb,
  total_inr integer not null check (total_inr >= 0),
  created_at timestamptz not null default now()
);
create table if not exists public.wishlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_key text not null,
  listing_json jsonb not null,
  created_at timestamptz not null default now(),
  unique(user_id, listing_key)
);
create table if not exists public.catalogue_hotels (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  name text not null,
  price_per_night_inr integer not null check (price_per_night_inr > 0),
  area text not null,
  tags text[] not null default '{}',
  unique(city, name),
  check (tags <@ array['offbeat','popular','family-friendly','budget']::text[])
);
create index if not exists trip_requests_user_created on public.trip_requests(user_id, created_at desc);
create index if not exists itineraries_user_created on public.itineraries(user_id, created_at desc);
create index if not exists bookings_user_created on public.bookings(user_id, created_at desc);
create index if not exists catalogue_hotels_city on public.catalogue_hotels(lower(city));

-- Create a profile automatically for Google and email OTP sign-ups.
create or replace function public.create_profile_for_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, email, name)
  values (new.id, coalesce(new.email,''), coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name',''))
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile after insert on auth.users
for each row execute function public.create_profile_for_auth_user();

-- RLS: user-owned rows are scoped to auth.uid(). Itineraries are written by the
-- Edge Function (service role); users can read their rows but cannot self-approve.
alter table public.profiles enable row level security;
alter table public.trip_requests enable row level security;
alter table public.itineraries enable row level security;
alter table public.bookings enable row level security;
alter table public.catalogue_hotels enable row level security;
alter table public.wishlists enable row level security;
drop policy if exists "profiles read own" on public.profiles;
create policy "profiles read own" on public.profiles for select to authenticated using (id = auth.uid());
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own" on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists "trip requests own rows" on public.trip_requests;
create policy "trip requests own rows" on public.trip_requests for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "itineraries read own" on public.itineraries;
create policy "itineraries read own" on public.itineraries for select to authenticated using (user_id = auth.uid());
drop policy if exists "bookings own rows" on public.bookings;
create policy "bookings own rows" on public.bookings for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "wishlists own rows" on public.wishlists;
create policy "wishlists own rows" on public.wishlists for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "catalogue visible" on public.catalogue_hotels;
create policy "catalogue visible" on public.catalogue_hotels for select to anon, authenticated using (true);
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.trip_requests, public.bookings, public.wishlists to authenticated;
revoke all on public.itineraries from anon, authenticated;
grant select (id, user_id, trip_request_id, itinerary_json, itinerary_summary, ai_explanation, review_status, created_at) on public.itineraries to authenticated;
grant select on public.catalogue_hotels to authenticated;
grant select on public.catalogue_hotels to anon;

-- Existing 12 sample properties plus 20 additional Indian-city sample properties.
-- These are demo catalogue entries; the planner will only choose names present here.
insert into public.catalogue_hotels(city,name,price_per_night_inr,area,tags) values
('Pune','The Oaktree Residency',2350,'Koregaon Park',array['popular','budget']),
('Mumbai','Harbour View Residency',4200,'Colaba',array['popular']),
('Goa','Candolim Coast Resort',3650,'Candolim',array['popular','family-friendly']),
('Bengaluru','Indiranagar Social House',3300,'Indiranagar',array['popular']),
('Delhi','Aerocity Gateway Hotel',3450,'Aerocity',array['popular']),
('Jaipur','Bani Park Haveli',2750,'Bani Park',array['popular','family-friendly']),
('Hyderabad','Banjara Hills Retreat',3000,'Banjara Hills',array['popular']),
('Chennai','T Nagar Residency',2950,'T Nagar',array['popular','budget']),
('Kolkata','Park Street Residency',2850,'Park Street',array['popular']),
('Ahmedabad','Navrangpura Court',2600,'Navrangpura',array['popular','budget']),
('Coorg','Madikeri Coffee Estate Homestay',3200,'Madikeri',array['offbeat','family-friendly']),
('Ooty','Fern Hill Garden Stay',2900,'Fern Hill',array['offbeat','budget']),
('Goa','Agonda Grove Stay',2400,'Agonda',array['offbeat','budget']),
('Goa','Palolem Palm Retreat',4100,'Palolem',array['popular']),
('Pune','Bavdhan Hills Retreat',2600,'Bavdhan',array['offbeat','family-friendly']),
('Pune','Deccan Heritage Hotel',3100,'Deccan Gymkhana',array['popular']),
('Mumbai','Fort Heritage Stay',3700,'Fort',array['offbeat','budget']),
('Mumbai','Juhu Sands Retreat',5200,'Juhu',array['popular','family-friendly']),
('Bengaluru','Jayanagar Heritage House',2800,'Jayanagar',array['offbeat','budget']),
('Bengaluru','UB City Boutique Hotel',7100,'UB City',array['popular']),
('Delhi','Hauz Khas House',3900,'Hauz Khas',array['offbeat']),
('Delhi','Connaught Grand',6100,'Connaught Place',array['popular']),
('Jaipur','Amer Road Palace Stay',3300,'Amer Road',array['offbeat','family-friendly']),
('Jaipur','C-Scheme Court',4600,'C-Scheme',array['popular']),
('Hyderabad','Abids Heritage Stay',2200,'Abids',array['offbeat','budget']),
('Hyderabad','Jubilee Grand',5600,'Jubilee Hills',array['popular']),
('Chennai','Mylapore Temple View',2600,'Mylapore',array['offbeat','family-friendly']),
('Chennai','ECR Coastal Retreat',4800,'East Coast Road',array['popular']),
('Kolkata','Gariahat Court',2300,'Gariahat',array['offbeat','budget']),
('Kolkata','Ballygunge House',4300,'Ballygunge',array['popular']),
('Ahmedabad','Vastrapur Lakeview',2800,'Vastrapur',array['offbeat','family-friendly']),
('Ahmedabad','SG Highway Grand',5100,'SG Highway',array['popular']),
('Coorg','Kakkabe Forest Lodge',3800,'Kakkabe',array['offbeat']),
('Coorg','Kushalnagar Riverside Inn',2500,'Kushalnagar',array['budget','family-friendly']),
('Ooty','Lovedale Tea Garden Cottage',3600,'Lovedale',array['offbeat']),
('Ooty','Charing Cross Retreat',4400,'Charing Cross',array['popular','family-friendly'])
on conflict(city,name) do update set price_per_night_inr=excluded.price_per_night_inr, area=excluded.area, tags=excluded.tags;

-- Realtime review updates for the customer's Why this plan card.
alter publication supabase_realtime add table public.itineraries;
