-- Ejecutar en Supabase → SQL Editor → New Query → Run
-- Agrega soporte para clases de recuperación

alter table asistencias add column if not exists recuperacion boolean default false;
