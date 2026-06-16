# Auditoría — central (casa de marcas) — 16/06/2026

**Estado final:** ✅ Todo verde tras fixes aplicados

---

## Resumen

| Bloque | Estado |
|---|---|
| Lockfile sync | ✅ Resuelto |
| Guard test (@iarest/ scope) | ✅ 21/21 pass |
| transpilePackages vs deps | ✅ Resuelto (3 apps faltaban entradas) |
| TypeScript (5 apps) | ✅ 0 errores tras fix rrhh core-identity |
| Tests (61 total) | ✅ 61/61 pass |
| Vulns críticas (vitest) | ✅ Resuelta (→ 3.2.6) |
| Supabase security advisors | ✅ Sin nuevos problemas en public schema |
| Estructura generada | ✅ Al día (846 APIs) |

---

## 🔴 Bugs reales — resueltos en esta sesión

### 1. rrhh: `@central/core-identity` importado sin declarar
`apps/rrhh/app/api/admin/empleados/route.ts:6` importa `nuevaPersonaId` de `@central/core-identity`
pero el paquete no estaba en `dependencies` ni en `transpilePackages`.  
TypeScript confirmaba: `Cannot find module '@central/core-identity'`.  
**Fix:** añadido a `apps/rrhh/package.json` deps y a `apps/rrhh/next.config.ts` transpilePackages.

### 2. vitest critical vuln GHSA-5xrq-8626-4rwp
Raíz + rrhh tenían `vitest ^2.1.0` → instalaba 2.1.9. Vuln: arbitrary file read con UI server.  
**Fix:** bump a `^3.2.6 <4.0.0` (vitest 4.x necesita vite 6+, tenemos 5).  
Override en root package.json: `"vitest": ">=3.2.6 <4.0.0"`.

### 3. ia-rest: 7 módulos en deps sin transpilePackages
`module-crm`, `module-materiales`, `module-horario`, `module-asn`, `module-presupuestos`,
`module-proveedores`, `module-feedback` — importados en `apps/ia-rest/src/` pero ausentes de
`apps/ia-rest/next.config.ts` transpilePackages. Riesgo: build roto si Next intenta importar TS crudo.  
**Fix:** añadidos todos a transpilePackages.

### 4. sivra: 3 paquetes en deps sin transpilePackages
`core-push` (usado en `lib/push.ts`), `module-materiales` (`lib/adapters/inventario.ts`),
`module-proveedores` (`lib/adapters/proveedores.ts`) — sin declarar en transpilePackages.  
**Fix:** añadidos a `apps/sivra/next.config.ts`.

### 5. form-data high vuln GHSA-hmw2-7cc7-3qxx
`ia-rest > msedge-tts > axios > form-data <4.0.6`. CRLF injection.  
**Fix:** override `"form-data": ">=4.0.6"` en root.

---

## 🟡 Documentados — no explotables o acción manual

### 6. xlsx high vulns (ialimp)
ialimp **solo escribe** xlsx, nunca parsea. Prototype Pollution + ReDoS no explotables.
Sin parche npm disponible. Documentar si se añade parseo en el futuro → migrar a `exceljs`.

### 7. vite/esbuild dev-only (vitest transitivo)
Windows-only y Deno-specific. Vercel es Linux, sin devserver en prod. No aplica.

### 8. Supabase: `portal_rates` RLS always-true (public schema)
Ya documentado en `apps/sivra/docs/auditoria-seguridad.md` — se revirtió previamente porque
ialimp puede leer esta tabla con anon key. Mantener hasta confirmar que ialimp no la usa.

### 9. Supabase: 4 buckets públicos con broad SELECT listing
`documentos-contables`, `documentos-propiedad`, `property-access-files`, `propuestas-leads`.
Enumeración de URLs posible. Si el contenido es sensible, migrar a signed URLs vía `core-storage`.
Coordinar con ialimp antes de cambiar (BD compartida).

---

## 🟢 Todo correcto (sin cambios necesarios)

- Scope guard 21/21 — sin `@iarest/` en ningún archivo
- TypeScript: plataforma ✅ sivra ✅ ialimp ✅ ia-rest ✅ rrhh ✅
- Estructura: 5 verticales, 22 packages, 846 APIs, 0 reimplementaciones
- Supabase performance advisors: 0 items
- `iarest.*` schema: 166 tablas vacías (DDL clone), datos reales en proyecto propio de ia-rest

---

## Cambios aplicados

| Archivo | Cambio |
|---|---|
| `apps/rrhh/package.json` | + core-identity dep; vitest → ^3.2.6 <4.0.0 |
| `apps/rrhh/next.config.ts` | + core-identity en transpilePackages |
| `apps/ia-rest/next.config.ts` | + 7 module-* en transpilePackages |
| `apps/sivra/next.config.ts` | + core-push, module-materiales, module-proveedores |
| `package.json` (raíz) | vitest ^3.2.6 <4.0.0; overrides: + vitest, + form-data |
| `pnpm-lock.yaml` | vitest 3.2.6, form-data 4.0.6 |

---

## Acciones manuales para Alberto (ninguna urgente)

1. **Opcional** — Confirmar si ialimp lee `portal_rates` con anon en cliente. Si no, restringir la política RLS.
2. **Opcional** — Evaluar restricción de listing en los 4 buckets públicos mencionados. Coordinar con ialimp.
