# Auditoría ligera — 22 junio 2026

**Fecha:** 22/06/2026  
**Alcance:** monorepo `central` — integridad lockfile, estructura, guardia tests, reconciliación memoria/skills  
**Ejecutada por:** Claude Code (rutina programada, sesión autónoma)

---

## Resumen ejecutivo

Una incidencia 🟡: el `pnpm-lock.yaml` quedó desincronizado tras la auditoría profunda del 21/06
que eliminó `@central/module-concursos` de `apps/ialimp/package.json` sin regenerar el lockfile.
**Corregido en esta sesión.** Todo lo demás: verde.

---

## 🟡 Corregido en esta sesión

### 1. `pnpm-lock.yaml` desincronizado — `@central/module-concursos` huérfano en ialimp

**Causa:** El commit `4c801ab` (auditoría profunda 21/06, PR #406) eliminó correctamente
`@central/module-concursos@workspace:*` de `apps/ialimp/package.json` (dep huérfana sin uso
en ialimp), pero **no regeneró el lockfile**. `pnpm install --frozen-lockfile` fallaba en CI.

**Fix:** `pnpm install` → 3 líneas eliminadas del lockfile (referencia ialimp + entrada raíz).

**Verificación post-fix:** `pnpm install --frozen-lockfile` ✅ en sync.

---

## 🟢 OK — sin acción

| Área | Resultado |
|---|---|
| `node scripts/auditar-estructura.mjs --check` | ✅ radiografía al día, sin scopes `@iarest/` huérfanos |
| `pnpm test:guardia` | ✅ 21/21 |
| Skills en disco vs `docs/SKILLS.md` | ✅ en sync (17 skills + 2 commands todos listados) |
| `docs/CONTEXTO-SESIONES.md` | ✅ al día; merges del 21/06 (sivra Fase 1, blog-seo, perfil-fiscal, merge masivo) todos anotados |
| Commits post-auditoría sin anotar | ✅ ninguno; `cca57ec` (bitácora blog-seo) fue el último y ya está en memoria |
| `apps/plataforma/lib/sivra/pricing-calendar.ts` eliminado | ✅ sin imports huérfanos en ningún app |
| Manuales usuario ia-rest | ✅ sin features de UI nuevas en el rango (el blog-seo ya existía; el botón `BlogSuperTab` es solo para `/super`, panel interno, no usuario final) |

---

## Acciones manuales de Alberto

*(Heredadas de la auditoría profunda del 21/06, sin cambios)*

| Prioridad | Acción | Nota |
|---|---|---|
| 🔴 | Crear tabla `concursos_radar_criterios` en BD (Supabase → SQL editor) | Cron `plataforma` roto hasta que exista |
| 🟡 | Revisar buckets Supabase con listing público (Storage → Policies) | 3 buckets nuevos del 21/06 |
| 🟡 | Añadir `SMTP_*` a Vercel env de `plataforma` | Emails de concursos no envían |
| 🟡 | Adjuntar certificado de titularidad BBVA a los 3 borradores Gmail (Allianz/Helvetia/AXA) y enviar | Borradores ya creados |
| 🟡 | Confirmar credenciales de login por email de roles owner/camarero/cocina (probablemente entran por PIN) | Verificar antes de migrar BD |
