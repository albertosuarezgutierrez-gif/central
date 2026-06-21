# Auditoría de seguridad — Base de datos SIVRA

DB: Supabase **"Ingresos Y gastos Smoobu"** (`wswbehlcuxqxyinousql`, Postgres 17).
Fecha auditoría: 2026-06-02. Fuente: Supabase advisors + inspección manual.

## ⚠️ Contexto crítico: DOS apps comparten esta misma base de datos

Esta DB **no la usa solo este repo (`sivra`)**. Al menos dos aplicaciones distintas la comparten:

| App / repo | Dominios | Cómo accede a la DB |
|---|---|---|
| **`sivra`** (este repo) | `sivra-app.vercel.app`, `housesevillana.vercel.app` | Prisma con rol privilegiado (bypassa RLS). Las rutas de servidor usan la anon key **solo server-side** (no en cliente). |
| **`ialimp`** (repo `albertosuarezgutierrez-gif/ialimp`) | `ialimp.com`, `ialimp.vercel.app`, `siquebrilla.vercel.app` | **App real de las limpiadoras** y SaaS multi-empresa. Probablemente usa la **anon/authenticated key en cliente** (patrón Supabase). **No auditado aquí.** |

**Implicación (clave):** cualquier cambio que altere lo que `anon`/`authenticated` pueden **leer o
escribir** (políticas RLS, `security_invoker` en vistas, privacidad de buckets, GRANTs) **puede
romper `ialimp`** aunque no afecte a `sivra`. **No se puede validar solo con `sivra`.** Antes de
aplicar cualquier endurecimiento de RLS/Storage/vistas, hay que auditar el repo `ialimp`.

## ✅ Aplicado y mantenido (seguro para ambas apps)

Estos cambios reducen superficie de ataque sin alterar ninguna ruta legítima de cliente:

| Migración | Qué hizo | Por qué es seguro |
|---|---|---|
| `revoke_anon_execute_sql_security_fix` | 🔴 **Crítico.** `_execute_sql(text)` ejecuta SQL arbitrario como `postgres` y estaba concedida a `anon`/`authenticated` → cualquiera con la anon key podía tomar control total de la DB vía `POST /rest/v1/rpc/_execute_sql`. Revocado de anon/authenticated/public (también `rls_auto_enable`). | Ninguna app legítima llama a estas funciones de mantenimiento; `service_role` conserva el acceso. |
| `..._function_search_path` | 11 funciones → `search_path` fijado. | Endurecimiento estándar; no cambia el resultado de las funciones. |
| `fix_calcular_material_sesion_columnas_renombradas` | La función referenciaba columnas inexistentes de `propiedades` (`num_camas_dobles`→`num_camas_135`, etc.) y **lanzaba error**. Corregido. | Antes estaba 100% rota; el fix solo puede mejorar. |

## 🔁 Intentado este 2026-06-02 y REVERTIDO (NO aplicar sin auditar `ialimp`)

Se aplicaron y luego se **revirtieron al estado original** porque cambian la visibilidad para
`anon`/`authenticated` y `ialimp` podría depender de ella:

| Cambio | Estado actual | Riesgo que motivó el revert |
|---|---|---|
| `security_invoker = on` en **15 vistas** (`agenda_dia`, `sesiones_limpiadora`, `carga_limpiadora`, `rendimiento_limpiadoras`, `v_contab_*`…) | **Revertido a `off`** | `anon`/`authenticated` tienen SELECT sobre las 15. Con `invoker`, sus lecturas quedan filtradas por el RLS deny-all de las tablas base → **datos vacíos** en `ialimp`. |
| Buckets `cleaning-photos`, `documentos-contables`, `propuestas-leads`, `property-access-files` → **privados** | **Revertido a públicos** (políticas recreadas) | Las fotos/PDFs se sirven hoy con **URLs públicas**. La app de limpiadoras es `ialimp`, no `sivra` → privatizar rompía sus imágenes. |
| `DROP POLICY portal_rates_all` | **Restaurada** | Si `ialimp` lee `portal_rates` con la anon key, dejar la tabla sin política (deny-all) la rompía. |

### Caso `cleaning-photos` (signed URLs)
Se implementó un proxy de signed URLs en **este repo `sivra`** (PR #3:
`app/api/limpiadoras/photo/route.ts` + helper `photoSrc()` en `app/limpiadoras/page.tsx`), pero
**sirve a `sivra`, no a `ialimp`**, que es la app que usan las limpiadoras. Por eso el bucket
**sigue público**. Para cerrarlo de verdad hay que **portar el proxy al repo `ialimp`** y desplegarlo
ahí antes de poner el bucket en privado. Kit de portado: ver más abajo.

## 🎯 Plan correcto para cerrar el Tier 2 (en el repo `ialimp`)

1. **Auditar `ialimp`**: ¿qué tablas/vistas lee con la anon/authenticated key en cliente?, ¿a qué
   buckets sube y cómo muestra las fotos/PDFs (URL pública vs API)?
2. **Portar el proxy de fotos** (el endpoint `route.ts` es autocontenido; copiar tal cual) y envolver
   cada `<img>` de fotos con `photoSrc()`. Verificar que el middleware de `ialimp` deja pasar
   `/api/limpiadoras/photo` con la cookie (debe devolver imagen/redirect, no HTML de login).
3. **Solo con el código ya en producción de `ialimp`**, aplicar por bucket:
   `UPDATE storage.buckets SET public = false WHERE id = '<bucket>';` (rollback: `= true`).
4. Para vistas/`portal_rates`: re-aplicar el endurecimiento **solo** tras confirmar que `ialimp`
   no depende de esas lecturas vía anon (o tras migrar esas lecturas a `service_role`/políticas RLS
   explícitas).

> El firmado server-side funciona con la **anon key** (tiene policy SELECT sobre `cleaning-photos`),
> así que **no hace falta `service_role` key** para el proxy.

## 🟡 Otros pendientes (no aplicados)

- **`pg_net` en `public`**: `ALTER EXTENSION pg_net SET SCHEMA extensions;` ⚠️ gestionada por
  Supabase; moverla puede romper triggers/webhooks. Baja prioridad, tratar con cautela.
- **Funciones SECURITY DEFINER ejecutables por roles públicos**: revisar que `EXECUTE` quede solo
  para `service_role` donde aplique (mismo cuidado: comprobar que `ialimp` no las invoque vía anon).

## 🔵 Rendimiento (informativo, no seguridad)
- 50 foreign keys sin índice · 49 índices sin uso · 5 índices duplicados · 4 tablas sin PK.
- 2 políticas RLS con `auth.<fn>()` sin envolver en subconsulta (re-evaluación por fila).

## Cómo auditar de nuevo
Con el MCP de Supabase: `get_advisors(security)` y `get_advisors(performance)` sobre
`wswbehlcuxqxyinousql`. Los outputs son grandes; resumir con `jq '.result.lints[] | "\(.level) \(.title)"'`.
