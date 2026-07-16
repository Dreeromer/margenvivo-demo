-- ============================================================
-- MargenVivo · Fix tornillos (se venden por CAJA de 500 u · costo S/26)
-- Correr UNA vez en Supabase → SQL Editor → Run. Seguro de re-correr.
-- ============================================================

-- 1) Corregir TORNILLO 4*50 → costo real 26, quitar marca "estimado"
update public.catalogo set costo = 26, est = false where sku = 'SKU162';

-- 2) Agregar 4*35 y 4*30 (solo si no existen ya)
insert into public.catalogo (sku,nombre,cat,costo,tipo,est,stock,stock_min,track)
select 'SKU164','TORNILLO 4*35','ACCESORIOS',26,'plancha',false,0,0,false
where not exists (select 1 from public.catalogo where upper(nombre)='TORNILLO 4*35');

insert into public.catalogo (sku,nombre,cat,costo,tipo,est,stock,stock_min,track)
select 'SKU165','TORNILLO 4*30','ACCESORIOS',26,'plancha',false,0,0,false
where not exists (select 1 from public.catalogo where upper(nombre)='TORNILLO 4*30');

-- verificar
select sku,nombre,cat,costo,est from public.catalogo where upper(nombre) like 'TORNILLO%' order by nombre;
