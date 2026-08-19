# Rotación de la `service_role` expuesta — inventario y plan

> Credencial: `service_role` (legacy, JWT) del proyecto Supabase **`wswbehlcuxqxyinousql`** («central»),
> emitida el 15/04/2026, **vigente hasta 2036**, publicada en el repo PÚBLICO `house-sevillana-landing`
> (commit `7c53e19`, 06/05/2026) y detectada por gitleaks el 12/08/2026 al unificar la landing.
> Salta RLS → lectura/escritura total sobre la BD compartida de TODAS las verticales.
>
> **Borrar el repo NO invalida la clave.** Estuvo pública ~3 meses: hay que asumirla comprometida
> y revocarla. Este documento es el inventario previo a la rotación (rotar antes de inventariar
> tumba producción).

## Estado del proyecto Supabase (verificado 19/08/2026 por MCP)

El proyecto **ya tiene el sistema nuevo de claves activado**: junto a la `anon` legacy convive una
`sb_publishable_…`. Eso permite el camino limpio — crear una **secret key** `sb_secret_…`, migrar los
consumidores y **desactivar las legacy** — en vez de rotar el JWT secret (que invalidaría también la
`anon` y todas las sesiones de usuario).

## Inventario de consumidores (grep sobre el monorepo, 19/08/2026)

| Dónde | Qué usa | Cuántos | Nota |
|---|---|---|---|
| **Vercel env `SUPABASE_SERVICE_ROLE_KEY`** | valor pegado a mano | **3 proyectos**: `ia-rest`, `ialimp`, `central-rrhh` | son los únicos que la leen en código (`apps/ia-rest/**`, `apps/ialimp/lib/storage-limpiadora.ts`, `apps/rrhh/lib/storage.ts` + `app/api/operador/logos/route.ts`) |
| **Edge Functions de ia-rest** | `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` | **43 de 45** | la **inyecta Supabase**, no está pegada a mano: siguen vivas mientras las legacy estén activas |
| **Crons `pg_net`** (`20260819_crons_bd_compartida.sql`) | **ANON** legacy como `Bearer` (`monitor-health`) | 1 | NO llevan service_role (se quitó a propósito el 19/08); pero morirían si se desactiva también la `anon` legacy |
| **GitHub Actions** | `ci.yml` usa `ci_dummy_service_role_key` | 0 reales | nada que rotar |
| Resto de apps (`plataforma`, `sivra`, `transporte`, `alquiler`, `almacen`, `mariscos`) | — | 0 | van por Prisma con su rol `prisma_*`, no por service_role |

## Plan de rotación (orden obligatorio, sin downtime)

1. **Crear** la secret key `sb_secret_…` en Settings → API Keys (no rompe nada: conviven).
2. **Vercel**: sustituir `SUPABASE_SERVICE_ROLE_KEY` por la nueva en los 3 proyectos → redesplegar → verificar.
3. **Edge Functions** (requiere PR): `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` →
   `JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')!)['default']`. ⚠️ Las claves nuevas **no son JWT**:
   van en la cabecera `apikey`, NUNCA en `Authorization: Bearer` (el gateway intenta parsearlas como JWT
   y devuelve `Invalid JWT`), y las funciones afectadas necesitan `verify_jwt = false` autorizando en código.
4. **Cron `monitor-health`**: hoy manda la `anon` legacy como Bearer. Si se van a desactivar TAMBIÉN las
   legacy publicables, pasarlo a `apikey` con la publishable.
5. **Desactivar las legacy** en Settings → API Keys (reversible). **Esto es la rotación**: hasta aquí, la
   clave filtrada sigue siendo válida.
6. **Revisar los logs de Supabase** por uso ajeno entre el 06/05 y la desactivación.

## Pendiente de comprobar en el panel (no visible por MCP)

- Si la `service_role` legacy se puede desactivar **por separado** de la `anon` legacy (decide si el paso 4
  es obligatorio o se puede diferir).
- Confirmar que `SUPABASE_SECRET_KEYS` ya aparece en Edge Functions → Secrets antes de tocar las 43 funciones.
