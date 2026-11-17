-- ============================================================
--  TALLERES — Esquema Supabase
--  Pegar en Supabase → SQL Editor → Run
-- ============================================================

-- ---------- Equipo con acceso al panel ----------
-- Agregar los emails de quienes gestionan talleres:
--   insert into public.staff (email) values ('alguien@sancarlos.edu.ar');
create table if not exists public.staff (
  email text primary key,
  created_at timestamptz not null default now()
);
alter table public.staff enable row level security;   -- sin políticas: nadie la lee desde la web

create or replace function public.es_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')))
$$;
grant execute on function public.es_staff() to anon, authenticated;

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

-- ---------- Cambios programados (borrador, rigen al cerrar el mes) ----------
create table if not exists public.cambios_programados (
  id              uuid primary key default gen_random_uuid(),
  nivel           text not null,
  alumno_id       uuid not null references public.alumnos(id) on delete cascade,
  dia             smallint not null check (dia between 0 and 4),
  taller_anterior text,
  taller_nuevo    text,                 -- null = se quita el taller
  mes_aplica      text not null,        -- 'YYYY-MM' desde el que rige
  estado          text not null default 'pendiente' check (estado in ('pendiente','aplicado','cancelado')),
  usuario         text,
  created_at      timestamptz not null default now(),
  aplicado_at     timestamptz
);

-- ---------- Precios por nivel ----------
create table if not exists public.precios (
  ciclo_lectivo int  not null default 2027,
  nivel         text not null,
  precios       jsonb not null,        -- {"t1":0,"t2":0,"t3":0,"aparte":{"Fútbol":{"v1":0,"v2":0}}}
  updated_at    timestamptz not null default now(),
  primary key (ciclo_lectivo, nivel)
);

-- ---------- Liquidaciones mensuales (foto al cerrar el mes) ----------
create table if not exists public.liquidaciones (
  id            uuid primary key default gen_random_uuid(),
  ciclo_lectivo int  not null default 2027,
  nivel         text not null,
  mes           text not null,         -- 'YYYY-MM'
  precios       jsonb not null,
  filas         jsonb not null,
  total         numeric not null,
  usuario       text,
  cerrada_at    timestamptz not null default now(),
  unique (ciclo_lectivo, nivel, mes)
);

create index if not exists idx_cambios_pend on public.cambios_programados (nivel, estado);
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
alter table public.cambios_programados enable row level security;
alter table public.precios       enable row level security;
alter table public.liquidaciones enable row level security;

drop policy if exists "form_inserta"  on public.inscripciones;
create policy "form_inserta" on public.inscripciones
  for insert to anon, authenticated
  with check (estado = 'pendiente');

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

drop policy if exists "staff_cambios" on public.cambios_programados;
create policy "staff_cambios" on public.cambios_programados
  for all to authenticated using (public.es_staff()) with check (public.es_staff());

drop policy if exists "staff_precios" on public.precios;
create policy "staff_precios" on public.precios
  for all to authenticated using (public.es_staff()) with check (public.es_staff());

drop policy if exists "staff_liq" on public.liquidaciones;
create policy "staff_liq" on public.liquidaciones
  for all to authenticated using (public.es_staff()) with check (public.es_staff());

-- ============================================================
--  Búsqueda para el formulario público:
--  exige curso + al menos 3 letras y devuelve hasta 10 coincidencias,
--  así nadie puede bajar la lista completa del curso.
-- ============================================================
create extension if not exists unaccent;
create or replace function public.unaccent_lower(t text)
returns text language sql immutable set search_path = public, extensions as $$
  select lower(unaccent(coalesce(t, '')))
$$;

create or replace function public.buscar_alumnos(p_nivel text, p_curso text, p_texto text)
returns table (id uuid, apellido text, nombre text)
language sql stable security definer set search_path = public as $$
  select a.id, a.apellido, a.nombre
  from public.alumnos a
  where length(trim(p_texto)) >= 3
    and a.ciclo_lectivo = 2027
    and a.nivel = p_nivel
    and a.curso = p_curso
    and (unaccent_lower(a.apellido) like '%' || unaccent_lower(trim(p_texto)) || '%'
      or unaccent_lower(a.nombre || ' ' || a.apellido) like '%' || unaccent_lower(trim(p_texto)) || '%')
  order by a.apellido, a.nombre
  limit 10
$$;
grant execute on function public.buscar_alumnos(text, text, text) to anon, authenticated;
