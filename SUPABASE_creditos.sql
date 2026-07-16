-- ============================================================
-- MargenVivo · Módulo Créditos / Fiado (cuentas por cobrar)
-- Correr UNA sola vez en Supabase → SQL Editor → New query → Run
-- Es seguro re-correrlo (usa IF NOT EXISTS).
-- ============================================================

-- 1) Marca de pago en cada venta: 'contado' (default) | 'credito'
--    Las ventas históricas quedan como 'contado' automáticamente.
alter table public.ventas add column if not exists pago text not null default 'contado';

-- 2) Tabla de abonos (pagos que el cliente hace a su cuenta fiada)
create table if not exists public.abonos (
  id      bigint generated always as identity primary key,
  ts      bigint  not null,        -- fecha/hora (epoch ms, igual que ventas)
  cliente text    not null,
  monto   numeric not null,
  metodo  text,                     -- Efectivo / Yape-Plin / Transferencia
  nota    text,
  usuario text
);
alter table public.abonos enable row level security;
drop policy if exists staff_all on public.abonos;
create policy staff_all on public.abonos
  for all to authenticated using (true) with check (true);

-- listo ✓
