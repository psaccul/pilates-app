-- ============================================================
-- PILATES STUDIO — Base de datos completa
-- Ejecutar en: Supabase → SQL Editor → New Query → Run
-- ============================================================

-- INSTRUCTORES
create table if not exists instructores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  apellido text not null,
  telefono text,
  especialidad text,
  activo boolean default true,
  created_at timestamptz default now()
);

-- ALUMNOS
create table if not exists alumnos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  apellido text not null,
  telefono text,
  plan text check (plan in ('mensual','sueltas')) default 'mensual',
  frecuencia text,
  instructor_id uuid references instructores(id),
  activo boolean default true,
  created_at timestamptz default now()
);

-- CLASES (turnos programados)
create table if not exists clases (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo text check (tipo in ('grupal','individual')) default 'grupal',
  fecha date not null,
  hora time not null,
  sala text,
  capacidad integer default 4,
  instructor_id uuid references instructores(id),
  created_at timestamptz default now()
);

-- ASISTENCIAS (qué alumno fue a qué clase)
create table if not exists asistencias (
  id uuid primary key default gen_random_uuid(),
  clase_id uuid references clases(id) on delete cascade,
  alumno_id uuid references alumnos(id) on delete cascade,
  asistio boolean default false,
  created_at timestamptz default now(),
  unique(clase_id, alumno_id)
);

-- PAGOS
create table if not exists pagos (
  id uuid primary key default gen_random_uuid(),
  alumno_id uuid references alumnos(id) on delete cascade,
  concepto text not null,
  monto numeric(10,2),
  medio text check (medio in ('efectivo','mercadopago','transferencia')) default 'efectivo',
  pagado boolean default false,
  fecha_pago date,
  created_at timestamptz default now()
);

-- ============================================================
-- DATOS DE EJEMPLO (opcional — borrá si no los querés)
-- ============================================================

insert into instructores (nombre, apellido, especialidad, telefono) values
  ('Lucía',   'Torres', 'Reformer · Intermedio/Avanzado', '+54 9 3765 000001'),
  ('Ana',     'Gómez',  'Reformer · Principiantes',      '+54 9 3765 000002');

insert into alumnos (nombre, apellido, telefono, plan, frecuencia, instructor_id)
select 'Sofía','Ramírez','+54 9 3765 100001','mensual','3×/semana', id from instructores where apellido='Torres' limit 1;

insert into alumnos (nombre, apellido, telefono, plan, frecuencia, instructor_id)
select 'Marcos','Vidal','+54 9 3765 100002','mensual','1×/semana', id from instructores where apellido='Torres' limit 1;

insert into alumnos (nombre, apellido, telefono, plan, frecuencia, instructor_id)
select 'Camila','López','+54 9 3765 100003','sueltas','Libre', id from instructores where apellido='Gómez' limit 1;

insert into alumnos (nombre, apellido, telefono, plan, frecuencia, instructor_id)
select 'Juliana','Perez','+54 9 3765 100004','mensual','2×/semana', id from instructores where apellido='Gómez' limit 1;

-- ============================================================
-- SEGURIDAD: habilitar RLS (Row Level Security)
-- Para producción: configurar políticas según necesidades
-- ============================================================

alter table instructores enable row level security;
alter table alumnos       enable row level security;
alter table clases        enable row level security;
alter table asistencias   enable row level security;
alter table pagos         enable row level security;

-- Política temporal: acceso completo para usuarios autenticados
create policy "admin_all_instructores" on instructores for all using (auth.role() = 'authenticated');
create policy "admin_all_alumnos"      on alumnos      for all using (auth.role() = 'authenticated');
create policy "admin_all_clases"       on clases       for all using (auth.role() = 'authenticated');
create policy "admin_all_asistencias"  on asistencias  for all using (auth.role() = 'authenticated');
create policy "admin_all_pagos"        on pagos        for all using (auth.role() = 'authenticated');
