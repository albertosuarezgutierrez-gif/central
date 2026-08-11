# CLAUDE.md — apps/mariscos (Mariscos González)

Vertical de **trazabilidad pesquera + etiquetado por peso** para **Mariscos González** (mayorista/pescadería
de marisco). Origen: reunión de Alberto con **Maricarmen** (transcrita en Drive `Mariscos gonzales 1_original.txt`).
Spec: `docs/superpowers/specs/2026-07-21-mariscos-gonzalez-trazabilidad-design.md`.
Mariscos González ya es cliente de la casa de marcas (usan `apps/rrhh` / iarrhh, responsable RR.HH. Pilar Piña).

## Qué resuelve (Fase 1)
- **Recepción de partidas** con los datos del albarán (marea, barco, captura, caducidad, **lote de origen**,
  calibre, precio) → sustituye el "apuntar a mano".
- **Envasado que CONSERVA el lote de origen** (el dolor de Maricarmen: hoy al re-envasar les cambia el lote).
- **Etiqueta por canal**: **con** nº de lote para catering/bares/hotel (va en factura); **sin** lote para
  mostrador (ticket). Imprimible desde el navegador (`/etiqueta/[id]`).
- **Pesaje MANUAL** (se teclea el peso). La sincronización real con báscula/etiquetadora es **Fase 2**.

## Arquitectura
- Next.js 15 (App Router). Compone el módulo puro **`@central/module-pesca`** (lógica de trazabilidad, sin BD).
- **BD compartida** del holding (scope `cuenta_id`), tablas `mariscos_partidas` y `mariscos_envasados`
  (SQL en `prisma/sql/2026-07-21_mariscos_schema.sql`, se ejecuta a mano preview→prod).
- Auth propio: cookie `mariscos_session`, secreto `MARISCOS_SESSION_SECRET` (NUNCA fallback a literal en
  prod — guardián `regression-secrets`). Sesión STATELESS contra `cuentas`, igual que alquiler/transporte.
- Branding Mariscos: azul marino `#1B3461` + logo en `public/logos/mariscos-gonzalez.png`.
- `vercel.json` con `ignoreCommand` (obligatorio: evita reconstruir todas las apps en cada push).

## Estructura
- `app/(usuario)/dashboard` — KPIs (partidas en cámara, kg y valor en stock, envasados hoy).
- `app/(usuario)/partidas` — lista + alta de recepción (`_forms.tsx` → `NuevaPartidaForm`).
- `app/(usuario)/partidas/[id]` — detalle del albarán + stock + envasar (`EnvasarForm`) + envasados.
- `app/(usuario)/etiquetas` — reimpresión.
- `app/etiqueta/[id]` — vista imprimible de la etiqueta (CSS de impresión, ~72mm).
- `app/api/partidas`, `app/api/envasados` — alta (validan con los helpers del módulo puro).

## Reglas del monorepo aplicadas
- Dinero en formato español `1.234,50€` (helper `eur()` en `lib/format.ts`).
- Responsive: tablas con `.table-wrap` (scroll horizontal), nav scrollable, formularios en grid fluido.

## Pendiente / Fase 2+
- Integración con báscula (auto-peso) y etiquetadora física (marca/modelo por confirmar con Maricarmen:
  Dibal / Bizerba / Epelsa / …).
- Despiece/transformación multi-nivel (un lote → sub-lotes con merma), tienda online y factura a catering.
- Sembrar el tenant real (cuenta) de Mariscos González y su usuario.
