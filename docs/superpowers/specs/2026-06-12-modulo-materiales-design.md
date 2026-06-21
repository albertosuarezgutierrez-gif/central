# Módulo de Materiales (Bloque B) — diseño

> Decisión Alberto (12/06/2026): módulo **independiente de eventos**, 100% configurable por el
> dueño, con acceso granular por empleado (`modulos_gestion`). Sirve para catering/eventos de JJ,
> para cualquier negocio del grupo e incluso para un negocio de **puro alquiler de material**.

## Por qué tablas nuevas (no reutilizar `inventario_menaje_evento`)
La tabla vieja `inventario_menaje_evento` tiene **FK dura a `eventos(id)`** → acopla el material a un
evento. El requisito explícito es lo contrario: material como **módulo autónomo**. Por eso el módulo
vive en tablas genéricas nuevas en el schema `iarest` (mismo patrón que `produccion_*` de la sesión
anterior: `restaurante_id`, RLS service_role). La asignación apunta a un **destino genérico**
(`destino_tipo` = evento | hacienda | cliente | obra | …), no a un FK de eventos.

## Capas (MVP = las 3 juntas)

### Capa 1 — Catálogo (`iarest.materiales`)
Inventario real de activos físicos. El dueño da de alta cada material: nombre, categoría
(mesa/silla/vajilla/cristalería/mantelería/otro), unidades totales, coste de reposición, foto.
`cantidad_disponible` = total − lo que está fuera ahora mismo (se recalcula con asignaciones/roturas).

### Capa 2 — Asignación / salida (`iarest.materiales_asignacion`)
Sacar material hacia un **destino genérico** (evento, hacienda, cliente, obra…). Al asignar descuenta
stock; al devolver lo repone. Estados: `reservado` → `entregado` → `devuelto`. Parte de roturas/faltas
con foto (`iarest.materiales_dano`) → descuento permanente + coste de reposición → liquidación.

### Capa 3 — Pantalla del empleado (`/montaje`) + RBAC
El empleado entra con su PIN; el sistema lee `personal.modulos_gestion`. Si tiene `materiales` ve
**solo** sus asignaciones activas: marca recogido/devuelto y registra roturas con foto. Nada más.
Totalmente configurable por el dueño desde el panel de personal (checkboxes que ya existen).

## Entregables
- **DB:** `apps/ia-rest/supabase/migrations/2026-06-12_materiales.sql` (3 tablas en `iarest`).
- **API:** `/api/materiales` (catálogo CRUD) · `/api/materiales/asignacion` (salida/devolución) ·
  `/api/materiales/dano` (rotura con foto) · `/api/materiales/perfil` (empleado logueado).
- **Gating:** `'materiales'` en `TODOS_MODULOS`.
- **Owner UI:** `/owner/materiales` (catálogo + asignaciones + roturas) + entrada en `GRUPOS`.
- **Empleado UI:** `/montaje` (patrón `/cocinero`).
- **Routing:** `navigateByRol` → empleado con `materiales` aterriza en `/montaje`.

## Stock — regla de cálculo
`cantidad_disponible` se mantiene transaccionalmente en la API (mismo enfoque que el menaje de eventos):
- asignar N → `disponible -= N`
- devolver N (sanas) → `disponible += N`
- rotura N → la pieza no vuelve: `disponible` no se repone por esas N; `cantidad_total -= N` opcional
  (se registra como baja). El parte de rotura guarda coste = N × coste_reposición.

## Fuera de alcance (MVP)
- Previsión IA por aforo/temporada/temperatura (Bloque B avanzado) — va después.
- Códigos de barras / báscula (huecos cocina #7/#8) — otro bloque.
- Multi-almacén por hacienda con reparto — se prepara `destino_*` pero el reparto entre almacenes
  es una iteración posterior.
