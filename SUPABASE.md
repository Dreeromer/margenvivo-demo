# MargenVivo — cómo volverlo multiusuario real (Supabase)

El prototipo hoy guarda los datos en **el navegador de cada quien** (perfecto para demos).
Para que **todas las vendedoras y el administrador compartan la misma base** en la nube,
se conecta a **Supabase** (base de datos + login gratis). Estos son los pasos.

## 1. Crear el proyecto (5 min, gratis)
1. Entra a **supabase.com** → crea una cuenta → **New project**.
2. Anota dos datos que te da (Settings → API): **Project URL** y **anon key**.

## 2. Crear las tablas
En Supabase → **SQL Editor** → pega y ejecuta:

```sql
create table productos (
  sku text primary key,
  nombre text not null,
  cat text,
  costo numeric not null
);

create table ventas (
  id bigint generated always as identity primary key,
  ts timestamptz default now(),
  vendedora text not null,
  cliente text,
  sku text references productos(sku),
  producto text, cat text,
  cant numeric, precio numeric, costo numeric,
  venta numeric, costo_t numeric, util numeric, margen numeric
);

-- Seguridad (RLS). Para el prototipo, permitir a usuarios logueados:
alter table ventas enable row level security;
alter table productos enable row level security;
create policy "leer ventas"  on ventas   for select using (true);
create policy "crear ventas" on ventas   for insert with check (true);
create policy "leer productos" on productos for select using (true);
```

(El catálogo de 135 productos se carga una vez con un INSERT — te lo genero cuando llegues aquí.)

## 3. Cambiar la "capa de datos" en la app
El código ya está preparado para esto: solo se reemplaza el objeto `Store`.
En GitHub Pages **sí** se puede cargar Supabase desde CDN (no como en los Artifacts).

```html
<script type="module">
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const supabase = createClient('TU_PROJECT_URL', 'TU_ANON_KEY')

const Store = {
  async all(){ const {data} = await supabase.from('ventas').select('*'); return data || [] },
  async add(v){ await supabase.from('ventas').insert(v) },
}
</script>
```

> Nota: al pasar a la nube, las lecturas son **asíncronas**, así que las funciones
> `renderVend()` / `renderAdmin()` pasan a usar `await`. Es un ajuste chico —
> **yo te lo dejo hecho** cuando tengas tu URL y tu anon key.

## 4. Login de verdad
Cambiar la contraseña demo por **Supabase Auth**: cada vendedora y el admin tienen su
usuario/clave real, y el ranking se arma solo con el usuario que registró cada venta.

## 5. Para venderlo a varias empresas (multi-tenant)
Agregar una columna `empresa_id` a cada tabla y filtrar por ella → cada empresa ve solo
sus datos, todo sobre la misma app. Ese es el paso que lo convierte en un **SaaS**.

---
**Costo:** el plan gratuito de Supabase (500 MB, hasta 50k usuarios) + GitHub Pages
alcanza de sobra para arrancar y demostrar. Solo pagas cuando crezca de verdad.
