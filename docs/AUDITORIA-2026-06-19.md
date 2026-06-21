# Auditoría ligera — central (casa de marcas) — 19/06/2026

**Rango:** desde la última auditoría (`AUDITORIA-2026-06-18.md`, deep audit `f9998d5`) hasta HEAD (`33df3db`, PR #385).
**Commits nuevos (post-deep-audit del 18/06):**
- `f9cd276` Merge PR #364 (fix formulario leads — ya en memoria)
- `c42abec` Merge PR #351 (plan adaptador ia-rest organizador — ya en memoria)
- `d879b19` chore: regenerar radiografía [skip ci]
- `c4db1df` fix(ia-rest/blog-seo): modelo 8B para caber en ~60s Vercel
- `ca972b8` fix(plataforma/banca): ingresos correduría no cuadraban (PR #384)
- `33df3db` feat(plataforma): panel Control de Facturas + alerta de faltantes (PR #385)

**Cadencia:** ligera (sin typecheck de apps ni tests pesados).

**Estado final:** ✅ Verde. Drift de memoria/docs reconciliado.

---

## Resumen de checks

| Bloque | Estado |
|---|---|
| Radiografía de estructura (`--check`) | ✅ Al día (regenerada en `d879b19` + `33df3db`) |
| Guardian de scope (`@iarest/`) | ✅ 0 referencias |
| SKILLS.md vs `.claude/skills/` | ✅ Exacto (16 skills + 2 comandos, todos documentados) |
| Skill `ia-rest-maestro` | ✅ Actualizada por `c4db1df` (blog-seo modelo 8B) |
| Skill `plataforma-maestro` | 🟡 Drift: facturas-control y destino.ts ausentes → **corregido en esta auditoría** |
| `apps/plataforma/CLAUDE.md` | 🟡 Drift: PR #384 y #385 sin documentar → **corregido en esta auditoría** |
| `docs/CONTEXTO-SESIONES.md` | 🟡 3 commits post-deep-audit sin anotar → **corregido en esta auditoría** |

---

## 🔴 Bugs reales

Ninguno nuevo en este rango.

---

## 🟡 Hallazgos (reconciliados en esta auditoría)

### 1. `docs/CONTEXTO-SESIONES.md` — 3 commits sin anotar
Los commits `c4db1df`, `ca972b8` y `33df3db` ocurrieron después de la deep audit del 18/06
y no quedaron registrados en la memoria. **Corregido:** entrada nueva añadida arriba del todo.

### 2. `apps/plataforma/CLAUDE.md` — PR #384 y #385 ausentes
El Estado del CLAUDE.md llega hasta el 17/06 y no refleja:
- PR #384: nuevo `lib/destino.ts` (lógica de clasificación de abonos, 7 tests)
- PR #385: `/sivra/facturas-control` + API + alerta dashboard
**Corregido:** entradas añadidas al final del bloque "Estado".

### 3. `plataforma-maestro` skill — sin mención de `lib/destino.ts` ni facturas-control
El skill no sabía que `lib/categorizar.ts` depende ahora de `lib/destino.ts` para los abonos,
ni que existe `/sivra/facturas-control`. **Corregido:** añadidas notas en la sección relevante.

---

## 🟢 Correcto (sin cambios)

- **Radiografía** (`ARQUITECTURA.generated.md`): 5 apps · 24 packages · 23 capacidades · 909 rutas API. Al día.
- **Guardian @iarest/**: 0 referencias en packages/ y apps/.
- **SKILLS.md**: concuerda con `.claude/skills/` (16 skills) y `.claude/commands/` (2 comandos).
- **Skill ia-rest-maestro**: blog-seo actualizado en `c4db1df` (modelo 8B, pauta para generaciones largas).
- **Carry-forward heredados** (de AUDITORIA-2026-06.md / AUDITORIA-2026-06-18.md): no urgentes, sin cambios:
  - Bucket `documentos-contables` con listing público — revisar si el índice es sensible.
  - PRs draft stale (#302 recreado ✅, #307, #312, #322 recreado ✅, #331 recreado ✅, #351 ✅, #364 ✅, #375 pendiente de merge por Alberto).
  - Migración `concursos_radar` en Supabase (hallazgo A3 de jun-12) — pendiente.
  - `apps/ia-rest/next.config.js` redundante — opcional borrar tras confirmar que Next 16 usa el `.ts`.
  - Bucket `documentos-contables` listing público → revisar.

---

## Cambios aplicados en esta auditoría

| Archivo | Cambio |
|---|---|
| `docs/AUDITORIA-2026-06-19.md` | este informe |
| `docs/CONTEXTO-SESIONES.md` | + 2 entradas: banca+facturas-control (PR #384/#385) + blog-seo fix (`c4db1df`) |
| `apps/plataforma/CLAUDE.md` | + PR #384 (banca fix) y #385 (facturas-control) en bloque Estado |
| `.claude/skills/plataforma-maestro/SKILL.md` | + nota sobre `lib/destino.ts` y `/sivra/facturas-control` |

---

## Acciones manuales para Alberto (sin cambios respecto al heredado)

1. **PR #375** (rutinas-programadas.md): pendiente de merge. Lo creó Claude, Alberto no lo ha mergeado.
2. **Bucket `documentos-contables`** en Supabase: verificar si el listing público expone índice sensible y revocar si procede.
3. **`apps/ia-rest/next.config.js`** (redundante, ya sincronizado): borrar cuando convenga (`git rm apps/ia-rest/next.config.js`).
4. **Migración `concursos_radar`** (hallazgo A3 jun-12): pendiente de aplicar en Supabase.
