-- ============================================================
--  TALLERES — Esquema Supabase
--  Pegar en Supabase → SQL Editor → Run
-- ============================================================

-- Dominio con acceso al panel (cambiar si hace falta)
create or replace function public.es_staff()
returns boolean language sql stable as $$
  select coalesce(auth.jwt() ->> 'email', '') ilike '%@sancarlos.edu.ar'
$$;

-- ---------- Alumnos (listas oficiales del año) ----------
create table if not exists public.alumnos (
  id            uuid primary key default gen_random_uuid(),
  ciclo_lectivo int  not null default 2027,
  nivel         text not null check (nivel in ('inicial','primaria','secundaria')),
  curso         text not null,
  apellido      text not null,
  nombre        text not null,
  created_at    timestamptz not null default now(),
  unique (ciclo_lectivo, nivel, curso, apellido, nombre)
);

-- ---------- Inscripciones (lo que llega del formulario) ----------
create table if not exists public.inscripciones (
  id             uuid primary key default gen_random_uuid(),
  ciclo_lectivo  int  not null default 2027,
  nivel          text not null check (nivel in ('inicial','primaria','secundaria')),
  curso          text not null,
  apellido       text not null,
  nombre         text not null,
  talleres       jsonb not null default '{}'::jsonb,  -- {"0":"Arte","3":"Fútbol"}  (0=Lunes)
  responsable    text,
  email          text,
  telefono       text,
  observaciones  text,
  estado         text not null default 'pendiente' check (estado in ('pendiente','vinculada','descartada')),
  alumno_id      uuid references public.alumnos(id) on delete set null,
  created_at     timestamptz not null default now()
);

-- ---------- Asignaciones (un taller por alumno por día) ----------
create table if not exists public.asignaciones (
  id             uuid primary key default gen_random_uuid(),
  alumno_id      uuid not null references public.alumnos(id) on delete cascade,
  dia            smallint not null check (dia between 0 and 4),
  taller         text not null,
  origen         text not null default 'panel' check (origen in ('formulario','panel')),
  inscripcion_id uuid references public.inscripciones(id) on delete set null,
  updated_at     timestamptz not null default now(),
  unique (alumno_id, dia)
);

-- ---------- Historial de cambios ----------
create table if not exists public.historial (
  id              uuid primary key default gen_random_uuid(),
  alumno_id       uuid references public.alumnos(id) on delete set null,
  nivel           text,
  alumno          text,
  accion          text not null,   -- asignar | cambiar | eliminar | vincular | alta_alumno | baja_alumno
  dia             smallint,
  taller_anterior text,
  taller_nuevo    text,
  usuario         text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_alumnos_nivel      on public.alumnos (ciclo_lectivo, nivel);
create index if not exists idx_inscr_nivel_estado on public.inscripciones (ciclo_lectivo, nivel, estado);
create index if not exists idx_hist_fecha         on public.historial (created_at desc);

-- ============================================================
--  Seguridad (RLS)
--  · El público (formularios) SOLO puede insertar inscripciones.
--  · El panel requiere login con cuenta @sancarlos.edu.ar.
-- ============================================================
alter table public.alumnos       enable row level security;
alter table public.inscripciones enable row level security;
alter table public.asignaciones  enable row level security;
alter table public.historial     enable row level security;

drop policy if exists "form_inserta"  on public.inscripciones;
create policy "form_inserta" on public.inscripciones
  for insert to anon, authenticated
  with check (estado = 'pendiente' and alumno_id is null);

drop policy if exists "staff_inscr"   on public.inscripciones;
create policy "staff_inscr" on public.inscripciones
  for all to authenticated using (public.es_staff()) with check (public.es_staff());

drop policy if exists "staff_alumnos" on public.alumnos;
create policy "staff_alumnos" on public.alumnos
  for all to authenticated using (public.es_staff()) with check (public.es_staff());

drop policy if exists "staff_asig"    on public.asignaciones;
create policy "staff_asig" on public.asignaciones
  for all to authenticated using (public.es_staff()) with check (public.es_staff());

drop policy if exists "staff_hist"    on public.historial;
create policy "staff_hist" on public.historial
  for all to authenticated using (public.es_staff()) with check (public.es_staff());
