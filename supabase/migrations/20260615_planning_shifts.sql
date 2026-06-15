create table if not exists planning_shifts (
  id uuid primary key default gen_random_uuid(),
  employe_id uuid references rh_employes(id) on delete cascade,
  date date not null,
  heure_debut text not null,
  heure_fin text not null,
  pause_min integer default 0,
  created_at timestamptz default now(),
  unique (employe_id, date)
);
