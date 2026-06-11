# Renombrado de scope `@iarest/*` → `@central/*` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Renombrar el scope npm de todo el monorepo de `@iarest/*` a `@central/*` sin romper ninguna de las 4 apps, como prerequisito de `@central/module-revenue`.

**Architecture:** Cambio mecánico y **atómico** (un solo commit): se renombra el `name` de los 15 paquetes, sus deps cruzadas, las deps de las 4 apps, todos los `import`, los `transpilePackages` de los `next.config`, y el fallback del script de auditoría; luego se regenera el lockfile y se verifica build. Los **logs históricos** en markdown (`docs/CONTEXTO-SESIONES.md`) se dejan intactos (son registro); solo se actualizan los docs de **arquitectura vigente**.

**Tech Stack:** pnpm workspaces (10.33.0), Next.js 15, TypeScript, Vercel (4 proyectos: ia-rest, ialimp, sivra, plataforma).

---

## Superficie de cambio (mapeada)

- **15 paquetes** en `packages/*` con `name` `@iarest/*`: core-ai, core-email, core-fiscal, core-identity, core-push, core-storage, module-agenda, module-asn, module-concursos, module-contabilidad, module-crm, module-feedback, module-inventario, module-presupuestos, module-proveedores.
- **88 ficheros** referencian `@iarest/` (imports + package.json + configs).
- **Deps en apps:** `apps/ia-rest`, `apps/ialimp`, `apps/plataforma`, `apps/sivra` (todas `workspace:*`).
- **transpilePackages:** `apps/ialimp/next.config.ts`, `apps/sivra/next.config.ts`, `apps/ia-rest/next.config.ts`, `apps/ia-rest/next.config.js`, `apps/plataforma/next.config.ts`.
- **Script:** `scripts/auditar-estructura.mjs:109` (fallback `@iarest/${id}`).
- **Docs de arquitectura vigente a actualizar:** `CLAUDE.md`, `MATRIZ.md`, `.claude/skills/ia-rest-maestro/SKILL.md`.
- **NO tocar:** `docs/CONTEXTO-SESIONES.md` (log histórico), `pnpm-lock.yaml` (se regenera), `node_modules`.

---

## Task 1: Renombrado atómico del scope

**Files:**
- Modify: `packages/*/package.json` (15 ficheros — `name` y deps cruzadas)
- Modify: `apps/{ia-rest,ialimp,plataforma,sivra}/package.json` (deps)
- Modify: ~88 ficheros `*.ts/*.tsx/*.js/*.mjs/*.json` bajo `apps/`, `packages/`, `scripts/` (imports/configs)
- Modify: `CLAUDE.md`, `MATRIZ.md`, `.claude/skills/ia-rest-maestro/SKILL.md` (referencias de arquitectura vigente)
- Regenerate: `pnpm-lock.yaml`

- [ ] **Step 1: Snapshot del estado previo (para verificación)**

Run:
```bash
grep -rl '@iarest/' --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' --include='*.json' apps packages scripts | grep -v node_modules | wc -l
```
Expected: un número > 0 (debe ser 88). Anótalo.

- [ ] **Step 2: Sustituir `@iarest/` → `@central/` en código y configs**

Run:
```bash
grep -rl '@iarest/' --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' --include='*.json' \
  apps packages scripts | grep -v node_modules \
  | xargs sed -i 's#@iarest/#@central/#g'
```
Esto cubre: el `name` de cada paquete, las deps cruzadas entre paquetes, las deps `@central/*` de las 4 apps, todos los `import`/`require`, los `transpilePackages` y el fallback del script de auditoría.

- [ ] **Step 3: Verificar que no queda `@iarest/` en código/config**

Run:
```bash
grep -rn '@iarest/' --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' --include='*.json' apps packages scripts | grep -v node_modules
```
Expected: **sin salida** (0 coincidencias).

- [ ] **Step 4: Actualizar docs de arquitectura vigente (no los logs)**

Run:
```bash
sed -i 's#@iarest/#@central/#g' CLAUDE.md MATRIZ.md .claude/skills/ia-rest-maestro/SKILL.md
```
Luego revisa a mano que el texto sigue teniendo sentido (p.ej. frases como "el scope `@central/*`").

Expected: `grep -n '@iarest/' CLAUDE.md MATRIZ.md .claude/skills/ia-rest-maestro/SKILL.md` → sin salida.

- [ ] **Step 5: Regenerar el lockfile con los nuevos nombres**

Run:
```bash
npx --yes pnpm@10.33.0 install --no-frozen-lockfile
```
Expected: instala sin errores de resolución de workspace; `pnpm-lock.yaml` actualizado (ya sin `@iarest/`).

Verificación adicional:
```bash
grep -c '@iarest/' pnpm-lock.yaml || echo "0 (correcto)"
```
Expected: `0` o "0 (correcto)".

- [ ] **Step 6: Verificar typecheck de los paquetes tocados**

Run (por cada paquete con `tsconfig.json`, ejemplo core-ai):
```bash
for d in packages/*/; do [ -f "$d/tsconfig.json" ] && (cd "$d" && npx --yes tsc --noEmit) && echo "OK $d" || echo "skip/fallo $d"; done
```
Expected: `OK` en los paquetes que tengan build TS; los que no compilan por diseño (sin tsconfig) se saltan.

- [ ] **Step 7: Verificar build de una app que consume varios paquetes (sivra)**

Run:
```bash
cd apps/sivra && npx --yes pnpm@10.33.0 install --no-frozen-lockfile && npx prisma generate && npx next build
```
Expected: `✓ Compiled successfully` (o build completo sin error de módulo `@central/*` no encontrado).

> Nota: el build runtime completo de las 4 apps lo da Vercel en el PR (4 previews). Localmente basta con que resuelva los módulos y compile.

- [ ] **Step 8: Commit atómico**

```bash
git add -A
git commit -m "refactor(monorepo): renombrar scope npm @iarest/* -> @central/*

Cambio mecanico y atomico: name de los 15 paquetes, deps cruzadas,
deps de las 4 apps, todos los imports, transpilePackages de los
next.config y el fallback del script de auditoria. Lockfile regenerado.
Docs de arquitectura vigente actualizados; logs historicos intactos.
Prerequisito de @central/module-revenue."
```

- [ ] **Step 9: Push y PR (borrador)**

```bash
git push -u origin <rama>
```
Crear PR borrador. **Criterio de aceptación:** los 4 previews de Vercel (ia-rest, ialimp, sivra, plataforma) en **Ready**. Si alguno falla por un `@central/*` no resuelto, revisar el `transpilePackages` y la dep en el `package.json` de esa app.

---

## Self-review (hecho)
- **Cobertura:** los 15 paquetes, las 4 apps, los 5 `next.config`, el script y los docs vigentes están cubiertos por los pasos 2–4. ✓
- **Atomicidad:** un solo commit (paso 8) evita builds a medias. ✓
- **Verificación real:** grep == 0 (pasos 3, 4), lockfile limpio (5), tsc/build (6–7), previews Vercel (9). ✓
- **No-placeholders:** todos los comandos son ejecutables y concretos. ✓

## Siguiente
Tras mergear este PR (4 previews verdes), se planifican por separado: **Fase 1** (`@central/module-revenue` analítica + panel `/revenue` solo lectura), luego Fase 2 (auto-ajuste) y Fase 3 (palancas finas). Cada fase, su plan y su PR.
