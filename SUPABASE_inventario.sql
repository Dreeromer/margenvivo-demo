-- ============================================================
-- MargenVivo · Módulo Inventario / Kardex
-- Correr UNA sola vez en Supabase → SQL Editor → New query → Run
-- Es seguro re-correrlo (usa IF NOT EXISTS / OR REPLACE).
-- ============================================================

-- 1) Columnas de stock en el catálogo
alter table public.catalogo add column if not exists stock     numeric not null default 0;
alter table public.catalogo add column if not exists stock_min numeric not null default 0;
alter table public.catalogo add column if not exists track     boolean not null default false;  -- arranca dormido: se activa por producto

-- 2) Tabla de recepciones (entradas de mercadería · Kardex)
create table if not exists public.recepciones (
  id       bigint generated always as identity primary key,
  ts       bigint  not null,      -- fecha/hora (epoch ms, igual que ventas)
  sku      text,
  producto text,
  cant     numeric not null,
  costo    numeric,
  nota     text,
  usuario  text
);
alter table public.recepciones enable row level security;
drop policy if exists staff_all on public.recepciones;
create policy staff_all on public.recepciones
  for all to authenticated using (true) with check (true);

-- 3) Movimiento de stock ATÓMICO
--    (evita descuadres cuando dos vendedoras venden el mismo producto a la vez)
--    delta negativo = venta · delta positivo = recepción
create or replace function public.mover_stock(p_sku text, p_delta numeric)
returns numeric
language sql
as $$
  update public.catalogo
     set stock = coalesce(stock,0) + p_delta
   where sku = p_sku
  returning stock;
$$;

-- listo ✓
