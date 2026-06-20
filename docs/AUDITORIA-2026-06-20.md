# Auditoría diaria ligera — central (casa de marcas) — 20/06/2026

**Rango:** desde `docs/AUDITORIA-2026-06-18.md` (commit `a43fdb1`, PR #372) hasta `faea367` (PR #401 — memoria concursos F3+4).  
**Commits en rango:** 26 commits · PRs mergeados a `main`: #393–#401 (agente concursos ialimp F1→F4), #391 (dietas), #389/#388 (facturas-control + spine eventos), #386 (Materiales Fase B), #385/#384 (Control Facturas + banca, recreaciones de stale drafts), blog-seo fix.  
**Cadencia:** ligera (sin typecheck de apps ni tests pesados).

**Estado final:** 🟢 Sano. Sin bugs nuevos. 3 commits del 18/06 no anotados en memoria → reconciliados. MATRIZ.md incompleta → corregida.

---

## Resumen de checks

| Bloque | Estado |
|---|---|
| Radiografía de estructura (`ARQUITECTURA.generated.md`) | ✅ Al día (2026-06-19T20:04:29Z · 5 apps · 24 packages · 918 rutas) |
| `transpilePackages` vs `@central/` deps (ia-rest) | ✅ 14/14 coherentes |
| Skills (`.claude/skills/`) vs `docs/SKILLS.md` | ✅ 16/16 documentadas |
| Commits sin anotar en `CONTEXTO-SESIONES.md` | 🟡 3 commits del 18/06 — **reconciliados en esta auditoría** |
| MATRIZ.md incompleta (faltaban plataforma y rrhh) | 🟡 **Corregida en esta auditoría** |
| Skills orphaned (`.claude/ia-rest-project.skill.md`, `docs/SKILL-proyecto-claude.md`) | 🟡 Ver hallazgo #3 |
| `apps/ia-rest/next.config.js` residual | 🟡 Sin cambios (acción opcional de Alberto, documentada desde 18/06) |

---

## 🔴 Bugs reales

Ninguno en este rango.

---

## 🟡 Hallazgos (no bloqueantes)

### 1. 3 commits del 18/06 no anotados en memoria → reconciliados ✅

El hook `persist-memoria.sh` no los capturó (probablemente una sesión corta sin bloque de memoria). Añadidos en esta auditoría a `docs/CONTEXTO-SESIONES.md`:

- **`c4db1df` fix(ia-rest/blog-seo):** `callAI` gana 6º arg `model` opcional; cron `blog-seo` usa `meta/llama-3.1-8b-instruct` con timeout <60 s para evitar 504 de Vercel. Añadida spec `docs/superpowers/specs/2026-06-16-core-receipts-design.md` (161 líneas). Skill `ia-rest-maestro` actualizada.
- **`ca972b8` fix(plataforma/banca) — PR #384:** Ingresos de la correduría mal clasificados. Nuevo `lib/destino.ts` + `lib/destino.test.ts` (44 tests). Migración `2026-06-16_reclasificar_abonos_correduria.sql` (aplicar en Supabase si no hecho). Recrea PR #331 (stale draft).
- **`33df3db` feat(plataforma): Control de Facturas — PR #385:** Panel `/sivra/facturas-control` en plataforma, API `GET /api/sivra/facturas-control`, alerta `facturasFaltantes` del mes anterior en dashboard, entrada `🗂️ Facturas` en sidebar. Spec `docs/superpowers/plans/2026-06-16-facturas-control.md` (741 líneas). Recrea PR #322 (stale draft).

### 2. MATRIZ.md incompleta → corregida ✅

Tabla de verticales listaba solo 3 apps (ia-rest, sivra, ialimp); existen 5 en `apps/`. Añadidas `plataforma` (cuadro de mando consolidado) y `rrhh` (Portal del Empleado). Árbol de estructura actualizado.

### 3. Skills orphaned en `.claude/` y `docs/` (footgun)

Dos archivos de skill del sistema antiguo (mayo 2026), ahora reemplazados por `.claude/skills/ia-rest-maestro/SKILL.md`:
- `.claude/ia-rest-project.skill.md` — describe ia-rest en su ubicación antigua (raíz del repo, antes de `apps/ia-rest`). No aparece en el índice de skills ni en el sistema activo.
- `docs/SKILL-proyecto-claude.md` — copia del mismo contenido en `docs/`.

**Riesgo:** una sesión nueva que lea `.claude/` podría encontrar el archivo y usarlo (contexto desactualizado + rutas incorrectas).  
**Acción manual (Alberto):** eliminar ambos (`git rm .claude/ia-rest-project.skill.md docs/SKILL-proyecto-claude.md`). No es urgente pero sí recomendable antes de que cause confusión.

### 4. `apps/ia-rest/next.config.js` residual (carry-forward desde 18/06)

Sigue presente. Sincronizado con el `.ts` en la auditoría del 18/06. No es urgente (Next usa el `.ts`).  
**Acción manual (Alberto, opcional):** `git rm apps/ia-rest/next.config.js`.

---

## 🟢 Confirmados OK

- **PRs stale recreados:** #302 (blog-seo fix), #322 → #385, #331 → #384 ya mergeados a `main`. Los 3 drafts originales pueden cerrarse en GitHub si siguen abiertos.
- **Carry-forward Supabase (de auditorías anteriores):** migraciones `concursos_radar` + jubilar proyecto viejo `efncqyvhniaxsirhdxaa`. Sin cambio de estado (verificación manual pendiente de Alberto).
- **Bucket `documentos-contables` listing público** — carry-forward desde auditoría profunda 18/06.

---

## Acciones manuales para Alberto (orden seguro)

| Prioridad | Acción | Rollback |
|---|---|---|
| 🟡 Media | Cerrar en GitHub los stale drafts originales #302, #322, #331 (ya recreados y mergeados) | Sin rollback necesario (PR cerrado no borra código) |
| 🟡 Media | Verificar/aplicar migración `2026-06-16_reclasificar_abonos_correduria.sql` en Supabase si no se hizo | No aplica (migration idempotente) |
| 🟡 Baja | Eliminar `.claude/ia-rest-project.skill.md` y `docs/SKILL-proyecto-claude.md` (skills orphaned) | `git revert` |
| 🟡 Baja | `git rm apps/ia-rest/next.config.js` (residuo sincronizado) | `git revert` |
| 🟡 Baja | Revisar bucket `documentos-contables` listing público (exposición de índice de ficheros) | Vercel/Supabase storage → desactivar listing |
| 🔵 Info | Verificar/cerrar carry-forward: migraciones `concursos_radar` + jubilar `efncqyvhniaxsirhdxaa` | — |
