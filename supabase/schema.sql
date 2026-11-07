create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  cpf text not null unique check (cpf ~ '^[0-9]{11}$'),
  profession text not null,
  registration_type text not null check (registration_type in ('CRM', 'CREF', 'CRN', 'COREN', 'CRP', 'CRF')),
  registration_number text not null,
  registration_state text not null check (registration_state in (
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
    'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
  )),
  phone text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create or replace function public.is_valid_cpf(input_cpf text)
returns boolean
language plpgsql
immutable
strict
as $$
declare
  digit_index integer;
  weight integer;
  total integer;
  calculated_digit integer;
begin
  if input_cpf !~ '^[0-9]{11}$' or input_cpf ~ '^([0-9])\1{10}$' then
    return false;
  end if;

  for digit_index in 10..11 loop
    total := 0;
    for weight in 1..(digit_index - 1) loop
      total := total + substring(input_cpf, weight, 1)::integer * (digit_index + 1 - weight);
    end loop;
    calculated_digit := (total * 10) % 11;
    if calculated_digit = 10 then calculated_digit := 0; end if;
    if calculated_digit <> substring(input_cpf, digit_index, 1)::integer then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  metadata jsonb := new.raw_user_meta_data;
  expected_registration_type text;
begin
  expected_registration_type := case metadata ->> 'profession'
    when 'Médico(a) / Endocrinologista' then 'CRM'
    when 'Nutricionista' then 'CRN'
    when 'Educador(a) físico(a) / Personal trainer' then 'CREF'
    when 'Enfermeiro(a)' then 'COREN'
    when 'Psicólogo(a)' then 'CRP'
    when 'Farmacêutico(a)' then 'CRF'
    else null
  end;

  if not public.is_valid_cpf(metadata ->> 'cpf') then
    raise exception 'CPF inválido';
  end if;
  if expected_registration_type is null
    or metadata ->> 'registration_type' is distinct from expected_registration_type
    or coalesce(metadata ->> 'terms_accepted', 'false') <> 'true'
    or nullif(trim(metadata ->> 'full_name'), '') is null
    or nullif(trim(metadata ->> 'registration_number'), '') is null
    or new.phone is null
    or new.phone !~ '^\+[1-9][0-9]{7,14}$'
    or coalesce(metadata ->> 'registration_state', '') not in (
      'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
      'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
    ) then
    raise exception 'Dados profissionais inválidos';
  end if;

  insert into public.profiles (
    id, full_name, cpf, profession, registration_type, registration_number,
    registration_state, phone, status
  ) values (
    new.id,
    trim(metadata ->> 'full_name'),
    metadata ->> 'cpf',
    metadata ->> 'profession',
    expected_registration_type,
    trim(metadata ->> 'registration_number'),
    metadata ->> 'registration_state',
    new.phone,
    'pending'
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute procedure public.create_profile_for_new_user();

alter table public.profiles enable row level security;

drop policy if exists "Professionals can read their own profile" on public.profiles;
create policy "Professionals can read their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

revoke all on function public.is_valid_cpf(text) from public, anon, authenticated;
revoke all on function public.create_profile_for_new_user() from public, anon, authenticated;

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.profiles (id) on delete cascade,
  full_name text not null check (nullif(trim(full_name), '') is not null),
  created_at timestamptz not null default now()
);

create table if not exists public.glucose_readings (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  measured_at timestamptz not null,
  glucose_mg_dl numeric(6, 2) not null check (glucose_mg_dl between 20 and 1000),
  meal_timing text not null check (meal_timing in ('before', 'after', 'unrelated')),
  created_at timestamptz not null default now()
);

create table if not exists public.diet_entries (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  entry_date date not null,
  notes text not null check (nullif(trim(notes), '') is not null),
  created_at timestamptz not null default now()
);

create table if not exists public.medications (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  name text not null check (nullif(trim(name), '') is not null),
  insulin_type text not null check (insulin_type in ('regular', 'rapid', 'intermediate', 'long', 'other')),
  dose text not null check (nullif(trim(dose), '') is not null),
  schedule_period text not null check (schedule_period in ('morning', 'afternoon', 'evening', 'bedtime', 'custom')),
  schedule_label text not null check (nullif(trim(schedule_label), '') is not null),
  instructions text not null check (nullif(trim(instructions), '') is not null),
  risk_warnings text,
  created_at timestamptz not null default now()
);

create index if not exists glucose_readings_patient_measured_at_idx
  on public.glucose_readings (patient_id, measured_at desc);
create index if not exists diet_entries_patient_entry_date_idx
  on public.diet_entries (patient_id, entry_date desc);
create index if not exists medications_patient_created_at_idx
  on public.medications (patient_id, created_at desc);

alter table public.patients enable row level security;
alter table public.glucose_readings enable row level security;
alter table public.diet_entries enable row level security;
alter table public.medications enable row level security;

drop policy if exists "Professionals can read their patients" on public.patients;
create policy "Professionals can read their patients"
  on public.patients for select to authenticated
  using (
    professional_id = (select auth.uid())
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and status = 'approved'
    )
  );

drop policy if exists "Approved professionals can add patients" on public.patients;
create policy "Approved professionals can add patients"
  on public.patients for insert to authenticated
  with check (
    professional_id = (select auth.uid())
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and status = 'approved'
    )
  );

drop policy if exists "Approved professionals can read patient glucose" on public.glucose_readings;
create policy "Approved professionals can read patient glucose"
  on public.glucose_readings for select to authenticated
  using (exists (
    select 1 from public.patients
    where id = patient_id and professional_id = (select auth.uid())
  ) and exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and status = 'approved'
  ));

drop policy if exists "Approved professionals can add patient glucose" on public.glucose_readings;
create policy "Approved professionals can add patient glucose"
  on public.glucose_readings for insert to authenticated
  with check (
    exists (
      select 1 from public.patients
      where id = patient_id and professional_id = (select auth.uid())
    )
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and status = 'approved'
    )
  );

drop policy if exists "Approved professionals can read patient diet" on public.diet_entries;
create policy "Approved professionals can read patient diet"
  on public.diet_entries for select to authenticated
  using (exists (
    select 1 from public.patients
    where id = patient_id and professional_id = (select auth.uid())
  ) and exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and status = 'approved'
  ));

drop policy if exists "Approved professionals can add patient diet" on public.diet_entries;
create policy "Approved professionals can add patient diet"
  on public.diet_entries for insert to authenticated
  with check (
    exists (
      select 1 from public.patients
      where id = patient_id and professional_id = (select auth.uid())
    )
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and status = 'approved'
    )
  );

drop policy if exists "Approved professionals can read patient medications" on public.medications;
create policy "Approved professionals can read patient medications"
  on public.medications for select to authenticated
  using (exists (
    select 1 from public.patients
    where id = patient_id and professional_id = (select auth.uid())
  ) and exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and status = 'approved'
  ));

drop policy if exists "Approved professionals can add patient medications" on public.medications;
create policy "Approved professionals can add patient medications"
  on public.medications for insert to authenticated
  with check (
    exists (
      select 1 from public.patients
      where id = patient_id and professional_id = (select auth.uid())
    )
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and status = 'approved'
    )
  );

revoke all on public.patients, public.glucose_readings, public.diet_entries, public.medications from anon, authenticated;
grant select, insert on public.patients, public.glucose_readings, public.diet_entries, public.medications to authenticated;

-- Aprove manualmente pelo SQL Editor do Supabase:
-- update public.profiles set status = 'approved' where id = '<uuid-do-usuario>';