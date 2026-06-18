# Auditoría — central (casa de marcas) — 18/06/2026

**Rango:** desde la última auditoría (`AUDITORIA-2026-06-16.md`) hasta `a43fdb1` (PR #372).
**Foco del periodo:** subsistema **cocina central de catering** en ia-rest (PRs #356→#372:
trazabilidad APPCC, `/produccion`, recetas/escandallo, operativa del día, recepción, roles
por partida y gestión de equipo) + migración de 7 crons sivra→plataforma + unificación Stripe
vía `@central/core-payments`.

**Estado final:** ✅ Verde. Sin bugs nuevos. Drift de memoria/skills reconciliado.

---

## Resumen

| Bloque | Estado |
|---|---|
| Lockfile sync (`pnpm install --frozen-lockfile`) | ✅ En sync |
| Radiografía de estructura (`--check`) | ✅ Al día |
| Guardián de scope (`@iarest/`) | ✅ 21/21 pass |
| `transpilePackages` vs deps (5 apps) | ✅ Coherente (incl. 2 módulos nuevos en ia-rest) |
| TypeScript (5 apps) | ✅ 0 errores (ia-rest, ialimp, sivra, plataforma, rrhh) |
| Tests | ✅ Verde (guardián 21 · organizador-trabajo 64 · rrhh 25 · vitest 40 · resto packages) |
| Seguridad multi-tenant (APIs cocina nuevas) | ✅ Scope `local_id` + guards correctos |
| `pnpm audit` | 🟡 6 vulns (2 high xlsx ya documentadas no-explotables; 4 moderate transitivas) |
| Supabase advisors | ✅ Sin regresión nueva del periodo (tablas `cocina_*` en schema `iarest`) |
| Vercel deploys (ia-rest, plataforma) | ✅ Últimos a producción READY |

---

## 🔴 Bugs reales

Ninguno nuevo en este periodo.

---

## 🟡 Hallazgos (no bloqueantes / acción documentada)

### 1. `apps/ia-rest/next.config.js` obsoleto conviviendo con `next.config.ts`
`apps/ia-rest/next.config.js:18` declara solo **3** `transpilePackages`
(`core-ai`, `core-fiscal`, `core-push`) mientras `apps/ia-rest/next.config.ts:~6` declara los **14**
reales (incluidos `module-trazabilidad` y `module-organizador-trabajo`). El build de producción
funciona → Next usa el `.ts`; el `.js` es residuo de antes de la migración a config TS. Es un
**footgun**: si la resolución de config de Next cambiara, el build importaría TS crudo de 11 módulos
y rompería. **Acción aplicada en esta auditoría:** sincronizado el array de `transpilePackages`
del `.js` con el del `.ts` (estrictamente más seguro; no se borra ningún fichero). **Recomendado
(manual):** eliminar el `.js` redundante tras confirmar que Next 16 usa el `.ts`.

### 2. `pnpm audit` — 4 vulns moderate transitivas (build/dev)
- `postcss <8.5.10` (XSS por `</style>` sin escapar) vía `apps/ia-rest>next>postcss`.
- `uuid <11.1.1` (bounds check con `buf`) vía `apps/ialimp>node-ical>uuid` y `apps/sivra>googleapis>…>uuid`.
- `file-type` (loop infinito parser ASF) vía `apps/ialimp>jimp>…>file-type`.
No explotables en la práctica (CSS lo escribe el dev, no entra input de usuario; `buf` no se pasa).
Forzar overrides arriesga romper el build de apps vivas (next/jimp/gaxios pinean versiones). **Documentado,
no se toca** (mismo criterio que `xlsx`).

### 3. `xlsx` high × 2 (ialimp) — ya documentado
Prototype Pollution + ReDoS en `apps/ialimp>xlsx`. ialimp **solo ESCRIBE** xlsx (export), nunca parsea
→ no explotable. Sin parche npm. Ver `AUDITORIA-2026-06.md`. Si algún día se añade parseo → migrar a `exceljs`.

### 4. `rrhh` sin proyecto Vercel en el equipo `pisos-turisticos-projects`
`CLAUDE.md` cita la vertical rrhh en `central-rrhh.vercel.app`, pero el equipo Vercel
`pisos-turisticos-projects` solo lista 6 proyectos (ia-rest, ialimp, sivra, plataforma, ialimp-landing,
house-sevillana-landing) — **no aparece rrhh**. Puede estar en otra cuenta/equipo. **Acción manual de
Alberto:** confirmar dónde está desplegado rrhh (o si aún no lo está).

---

## 🟢 Correcto (sin cambios)

- **Multi-tenant en las APIs nuevas de cocina** (`src/app/api/cocina/*`): todas exigen `getSession`
  (401) y filtran por `local_id = getRestauranteId(req)`; `cocina_registros` hace upsert con
  `onConflict: 'local_id,fecha,receta_id'`. `/api/cocina/personal` añade guard **solo-responsable**
  (`cocina_rol === 'responsable'`, 403). Sin cruce entre tenants.
- **Tablas `cocina_*`** viven en el schema `iarest` (no `public`) → no introducen hallazgos de RLS en
  los advisors. Acceso server con service_role + scope por `local_id` en código.
- **Supabase advisors:** los items son preexistentes (en `iarest`: `security_definer_view`,
  `function_search_path_mutable`; en `public`: `instagram_estilos_usados` con RLS off — anterior a este
  periodo). Sin regresión introducida por el trabajo de cocina central.
- **Sin `.env` commiteados**; sin claves reales hardcodeadas.
- **Tipos y tests** en verde en las 5 apps y los packages.

### Nota menor (no es hallazgo)
`apps/ia-rest/src/app/api/cocina/personal/route.ts:9` — el comentario dice "Solo el/la responsable (o
co-responsable)" pero el código solo admite `cocina_rol === 'responsable'` y `ROLES` no incluye
`co-responsable`. Es **más restrictivo** que el comentario (sin riesgo); alinear comentario/código si se
implementa el rol co-responsable.

---

## Cambios aplicados en esta auditoría

| Archivo | Cambio |
|---|---|
| `apps/ia-rest/next.config.js` | `transpilePackages` sincronizado con el `.ts` (14 paquetes) |
| `docs/CONTEXTO-SESIONES.md` | + entrada #372 (gestión de equipo cocina); estado al día |
| `.claude/skills/ia-rest-maestro/SKILL.md` | APIs cocina: + `personal`, + `validar-pin`; rol `co-responsable`; gestión de equipo |
| `docs/AUDITORIA-2026-06-18.md` | este informe |

---

## Acciones manuales para Alberto (ninguna urgente)

1. **Confirmar despliegue de `rrhh`** (hallazgo #4): ¿en qué cuenta/equipo Vercel vive `central-rrhh`?
   Si no está desplegado, decidir si entra al equipo `pisos-turisticos-projects`.
2. **Opcional** — eliminar `apps/ia-rest/next.config.js` (ya redundante; sincronizado como red de
   seguridad). Rollback: `git revert` del commit de esta auditoría.
3. **Heredado** (de `AUDITORIA-2026-06-16.md`, sin cambios): revisar RLS `portal_rates` y los 4 buckets
   públicos si su contenido es sensible. Coordinar con ialimp (BD compartida).
