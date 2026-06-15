create table if not exists planning_absences (
  id uuid primary key default gen_random_uuid(),
  employe_id uuid references rh_employes(id) on delete cascade,
  date date not null,
  type text not null check (type in ('off', 'conge', 'recup', 'maladie', 'autre')),
  note text,
  created_at timestamptz default now(),
  unique (employe_id, date)
);
