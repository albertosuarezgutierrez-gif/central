# Plan — Arquitectura DEFINITIVA: una sola BD del holding + módulos + consolidación en plataforma

> **Decisión de Alberto (15/07/2026):** todo el holding sobre **UNA sola base de datos** (la compartida
> `wswbehlcuxqxyinousql`), modular y definitivo. Motivos: no pagar dos Supabase, consolidación real
> (intercompany + cuadro de mando), y **no repetir el error** de construir módulos en el silo de ia-rest.
> Este documento fija el principio, el estado real y el roadmap. Se apoya en los runbooks que YA existen
> (no los duplica): `docs/RUNBOOK-migracion-bd-iarest.md`, `docs/DISEÑO-fusion-bd.md`,
> `docs/INFORME-unificacion-central.md`.

## Por qué (el error que cerramos)
El módulo **almacén** se empezó a construir **dentro del silo de ia-rest** en vez de la BD compartida.
Raíz: **documentación contradictoria** — restos históricos en `docs/CONTEXTO-SESIONES.md` (entradas viejas)
afirman "ia-rest ya usa la BD compartida", cuando su **runtime de producción sigue en el proyecto separado
`efncqyvhniaxsirhdxaa`**. Quien lee eso asume "ya está unificado" y construye en el sitio equivocado.

## Principio arquitectónico DEFINITIVO (a codificar en la matriz)
1. **Una sola BD del holding:** `wswbehlcuxqxyinousql`. **Ningún** proyecto Supabase nuevo por vertical.
2. **Módulos, no silos:** cada vertical/módulo = tablas en la BD compartida (schema `public` o schema por
   vertical), **scoped por tenant** (`cuenta_id`/`empresa_id`/`negocio_id`), con rol de BD dedicado. El
   motor de dominio vive en `packages/module-*` (puro, portable).
3. **plataforma consolida:** el cuadro de mando del dueño lee la BD compartida directamente (jerarquía
   `Cuenta → Sociedad → Negocio`, modelo en `apps/plataforma/prisma/schema.prisma`).
4. **ia-rest es un silo TRANSITORIO** (`efncqyvhniaxsirhdxaa`) en migración al schema `iarest` de la
   compartida. **NO se construyen módulos nuevos del holding dentro de ia-rest hasta el flip.**

## Estado real (verificado por MCP, 15/07/2026)
- **6 de 7 apps YA están en la BD compartida:** plataforma, sivra, ialimp (Sique Brilla vivo), rrhh
  (schema `rrhh`), transporte (`prisma_transporte`), alquiler (`prisma_alquiler`).
- **Solo ia-rest sigue en el silo** `efncqyvhniaxsirhdxaa`: **246 tablas, 21.515 filas vivas** = producción
  de Joaquín (iarest.es). **NO está vacía. No se puede borrar hasta migrarla.**
- BD compartida: `public` 203 tablas / 61.075 filas; schema `iarest` (clon) 252 tablas / **1.115 filas**
  (casi vacío — esto es "lo vacío" que se recordaba, NO la de producción); `rrhh` 16 tablas / 75 filas.
- **Migración ia-rest→compartida ~80% hecha:** el corte del 10/06 clonó al schema `iarest` de la compartida
  todo el DDL (215 tablas, 47 vistas, 121 funciones, 428 policies RLS, 448 índices), las 43 Edge Functions,
  y 6 buckets de Storage. Falta solo el **"flip" irreversible** (envs + datos vivos). Decisión ya tomada
  (12/07): **terminar la migración**.

## Roadmap

### Fase 0 — Codificar el principio + limpiar el error (solo docs/limpieza, bajo riesgo) — AHORA
- **Codificar el principio** en la matriz para que no se repita: `MATRIZ.md` (nueva sección "Arquitectura
  de datos del holding" + reemplazar "BD **propia** de ia-rest" por "silo **transitorio** en migración"),
  `CLAUDE.md` raíz (corregir la línea que presenta la BD de ia-rest como principio de diseño),
  `apps/ia-rest/CLAUDE.md`/`AGENTS.md` (aviso de cabecera: "silo transitorio; no construir módulos nuevos
  aquí"), `docs/FUENTES-DE-VERDAD.md` (filas para los runbooks de migración).
- **Cerrar la decisión del almacén** en `docs/ALMACEN-JJ-reunion-y-auditoria.md`: va sobre la **compartida**
  (nueva `apps/almacen`), NO "extender ia-rest" mientras esté en el silo.
- **Limpiar el error introducido esta sesión:** DROP de las 7 tablas `almacen_*` aplicadas por error al
  **silo** `efncqyvhniaxsirhdxaa`; descartar el stash de la pantalla `owner/almacen` de ia-rest; quitar el
  fichero de migración `apps/ia-rest/supabase/migrations/2026-07-15_almacen_catering.sql` (iba al sitio malo).

### Fase 1 — Consolidar ia-rest en la compartida + apagar la Supabase de más (ventana dedicada) — ALBERTO
Ejecutar el runbook YA existente `docs/RUNBOOK-migracion-bd-iarest.md`. Pasos (resumen):
1. Re-introducir los **secrets de las Edge Functions** en el proyecto compartido (Stripe, MONEI, VeriFactu,
   IA, Telegram… lista maestra en el runbook). *No legibles por API → mano de Alberto.*
2. **Repointar 3 envs de Vercel** del proyecto ia-rest (`NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY`/
   `SERVICE_ROLE_KEY`) al compartido **+ añadir `NEXT_PUBLIC_SUPABASE_SCHEMA=iarest`** → Redeploy.
   *Único bloqueante real; no hay API para cambiar envs de Vercel → mano de Alberto.*
3. **Reconciliar el delta de datos** viejo→compartido **preservando las 6 `facturas_verifactu`** (cadena
   fiscal encadenada, no se puede romper) + smoke test. *Lo hace el agente.*
4. **Reapuntar webhooks Stripe/MONEI** (están en LIVE cobrando) al compartido + migrar objetos de Storage.
5. **Jubilar el proyecto viejo** `efncqyvhniaxsirhdxaa` + resetear password → **fin del segundo cobro Supabase.**
- **Reversible** hasta el último paso (revertir los 3 envs + redeploy = rollback instantáneo; el proyecto
  viejo queda intacto unos días).

### Fase 2 — Construir el almacén sobre la BD unificada
- **Motor:** `packages/module-materiales` (puro, con tests). **Superficie:** nueva **`apps/almacen`** (patrón
  transporte/alquiler: su proyecto Vercel + rol de BD dedicado) sobre la **compartida**, scoped por negocio.
  **Consolidación** en plataforma. Reutilizar como plantilla el código de ia-rest (`inventario-menaje.ts`,
  `api/materiales/*`) — su know-how, no su BD. Componer con `module-alquiler`/`module-asn`/`module-agenda`.
- Puede ir **en paralelo** a la Fase 1 (nace directamente en la compartida), o **después** del flip si se
  prefiere reutilizar el schema `iarest` ya migrado. → decisión de secuencia (abajo).

### Fases 3+ — Contabilidad, RRHH, catering/restaurante
Ya en la compartida en su mayoría (finanzas en plataforma, RRHH en schema `rrhh`). Se siguen sumando como
módulos sobre la misma BD con el mismo patrón.

## Decisiones a cerrar con Alberto
1. **Secuencia almacén vs flip:** ¿(A) flip de ia-rest PRIMERO (Fase 1) y luego el almacén sobre la BD ya
   unificada, o (B) `apps/almacen` sobre la compartida YA (en paralelo) mientras se agenda el flip?
2. **Ventana del flip de ia-rest:** necesita tu mano (envs Vercel + pegar secrets) → cuándo.

## Verificación
- Tras Fase 0: `grep` de afirmaciones falsas ("ia-rest… usa `wswbehlcuxqxyinousql`" en contexto histórico
  queda marcado como obsoleto); tablas `almacen_*` fuera del silo; árbol de git limpio.
- Tras Fase 1: smoke test de ia-rest ya en la compartida (login, leer/escribir, cobro QR, **VeriFactu**,
  push); plataforma leyendo ia-rest de forma nativa; proyecto viejo apagado.

## Fuentes
`docs/RUNBOOK-migracion-bd-iarest.md`, `docs/DISEÑO-fusion-bd.md`, `docs/INFORME-unificacion-central.md`,
`docs/ALMACEN-JJ-reunion-y-auditoria.md`, `apps/plataforma/prisma/schema.prisma`,
`apps/ia-rest/src/lib/supabase.ts`, `packages/module-materiales`.
