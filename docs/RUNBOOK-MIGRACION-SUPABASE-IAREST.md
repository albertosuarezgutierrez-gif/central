# Runbook — Migración ia-rest: proyecto Supabase VIEJO → COMPARTIDO

> Origen: auditoría 12/07 (PR #832) → se descubre que el "corte de BD" del 10/06 **nunca conmutó el
> runtime**. Producción (POS + crons) sigue en el proyecto **viejo `efncqyvhniaxsirhdxaa`** (schema `public`);
> el compartido `wswbehlcuxqxyinousql`/schema `iarest` solo recibía Instagram/Reels + la demo Catering JJ.
> **Decisión (Alberto, 12/07): terminar la migración al compartido.** Contexto completo: skill
> `ia-rest-maestro` §2 y `docs/CONTEXTO-SESIONES.md`.

## Identificadores fijos
| Recurso | Valor |
|---|---|
| Vercel proyecto app | `prj_A0xZtqWcH6dtNEmlRiOwgj52GTRo` · team `team_f4gPpt6dPuNcd5YyMt3q27uf` (slug `pisos-turisticos-projects`) |
| Supabase VIEJO (vivo hoy) | `efncqyvhniaxsirhdxaa` · schema `public` |
| Supabase DESTINO (compartido) | `wswbehlcuxqxyinousql` · schema `iarest` |
| Envs a conmutar (Etapa D) | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_SCHEMA=iarest` |

## Inputs humanos pendientes
1. **`service_role` del DESTINO** (Supabase → wswbehlcuxqxyinousql → Settings → API). La `anon` ya se obtuvo por MCP.
2. **¿Las 6 `facturas_verifactu` del viejo son reales o demo?** Decide si se replican (cadena de hash) o basta con conservar el viejo pausado.
3. **Secretos de Edge Functions del destino** presentes (SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET, fal.ai/Cloudinary/Stripe).

---

## Etapa A — Docs + limpieza ✅ HECHO (PR #835, mergeado)
- Corregidos skill `ia-rest-maestro` (§2 + INFRAESTRUCTURA) y `apps/ia-rest/CLAUDE.md` al estado real.
- `apps/ia-rest/scripts/setup-vercel-env.sh`: fuera el ANON key placeholder y `ANTHROPIC_API_KEY`; URL sigue en el viejo hasta el flip.

## Etapa C — Reconciliación de esquema BD ✅ HECHO (aditivo, verificado)
Aplicado al `iarest` del compartido (migraciones en el ledger de Supabase del destino):
- `iarest_reconcile_arqueos_config_contab_columns` — +2 cols `arqueos_caja`, +4 `config_contabilidad`.
- `iarest_reconcile_missing_tables_seo_horario_tesoreria` — crea 8 tablas viejo-only con RLS espejo.
- `iarest_config_horario_costes_empleado` — +col `costes_empleado`.

Verificado: tablas/columnas cuadran; **vistas 47=47**; **funciones de negocio 100% presentes** (las 35 "faltantes"
son de extensión pg_trgm/unaccent en schema `extensions` compartido); extensiones todas instaladas.

## Etapa C (resto) — Edge Functions ⏳ PENDIENTE
- Redesplegar las ~40 Edge Functions del repo (`apps/ia-rest/supabase/functions/**`) al DESTINO (están congeladas
  en v4 desde el corte). Vía `supabase link` al destino + `functions deploy`, o MCP `deploy_edge_function`.
- Unificar `ig-video-gen` (dejar la del repo; hay copia v1 en viejo y v7 en destino).
- Verificar que los triggers del repo estén ATTACHED a las tablas `iarest` (las funciones trigger ya existen).

## Etapa D — Flip del runtime ⛔ PUNTO DE NO RETORNO ⏳ PENDIENTE
1. En Vercel (`prj_A0xZtqWcH6dtNEmlRiOwgj52GTRo`) poner a valores del DESTINO: `NEXT_PUBLIC_SUPABASE_URL` y
   `SUPABASE_URL` = `https://wswbehlcuxqxyinousql.supabase.co`; `NEXT_PUBLIC_SUPABASE_ANON_KEY` = anon destino;
   `SUPABASE_SERVICE_ROLE_KEY` = service_role destino; `NEXT_PUBLIC_SUPABASE_SCHEMA` = `iarest`.
   **Apuntar los valores viejos antes** (rollback). Mecanismo: dashboard Vercel o Claude-en-Chrome (prompt abajo).
2. Redeploy producción. Smoke tests: login por rol, 1 comanda, 1 factura (cadena VeriFactu nueva), `/api/health`,
   1 Reel, y **búsqueda de mesa por voz** (verifica pg_trgm/unaccent con search_path hardened).
3. Mover el `pg_cron` (alerta-ritmo y cualquiera que invoque EFs) al destino.
- **Rollback:** revertir las 5 envs al viejo + redeploy (el viejo NO se borra aún).

## Etapa E — Jubilar el viejo (tras 24-48h estables) ⏳ PENDIENTE
- **Pausar** `efncqyvhniaxsirhdxaa` (`pause_project`), NO borrar (backup + rollback + cadena fiscal intacta).
- Arreglar/retirar crons `infra-monitor-cron` (500) y `monitor-health` (401).
- Actualizar docs a "migración COMPLETADA". Con esto se cierra el 🔴 2 de seguridad del PR #832
  (113 search_path/47 SECURITY DEFINER views del viejo dejan de ser producción; el destino ya está auditado).

---

## Prompt Claude-en-Chrome para el flip (Etapa D — no ejecutar hasta green light)
```
Tarea en 2 partes, mismo navegador. NO pegues secretos fuera del formulario de Vercel.
1) Supabase: https://supabase.com/dashboard/project/wswbehlcuxqxyinousql/settings/api
   → copia Project URL, anon public y service_role secret.
2) Vercel: https://vercel.com/pisos-turisticos-projects/ia-rest/settings/environment-variables
   → apunta los valores actuales de NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_SCHEMA (rollback),
   luego fija (Production+Preview):
   NEXT_PUBLIC_SUPABASE_URL = https://wswbehlcuxqxyinousql.supabase.co
   SUPABASE_URL             = https://wswbehlcuxqxyinousql.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY = (anon del destino)
   SUPABASE_SERVICE_ROLE_KEY     = (service_role del destino)
   NEXT_PUBLIC_SUPABASE_SCHEMA   = iarest
   → guarda y redeploy de producción. Confirma cuando esté READY.
```

## Reversibilidad
| Etapa | Reversible | Cómo |
|---|---|---|
| A, C (esquema) | sí | `git revert` / `DROP` de tablas-columnas añadidas en iarest |
| Edge Functions | sí | redeploy versión anterior |
| D flip | sí, hasta 1ª escritura real en el destino | revertir 5 envs + redeploy |
| E pausar viejo | sí | despausar |
