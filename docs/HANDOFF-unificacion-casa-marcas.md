# HANDOFF — Unificación "casa de marcas" (ia.rest · SIVRA · IALIMP)

> **Estado: PLAN REFINADO, pendiente de OK de Alberto para EJECUTAR.** Este documento
> es el punto de entrada de la iniciativa de unificar los desarrollos de Alberto en una
> sola plataforma (casa de marcas) mediante un monorepo de paquetes `core-*`. Recrea el
> handoff original (se perdió en un contenedor efímero anterior; nunca se commiteó).
> Fecha de esta versión: 2026-06-08.
>
> Lectura asociada: spec `docs/superpowers/specs/2026-06-07-plataforma-verticales-design.md`
> (§15 = resumen de este plan) · `docs/CONTEXTO-SESIONES.md` · skill `ia-rest-maestro`.

---

## 0. Nota sobre el origen del plan

El prompt de arranque pedía leer `docs/HANDOFF-unificacion-casa-marcas.md` y el **§16** de un
spec. **Ninguno existía** en ningún branch ni en el historial: el spec committeado llegaba al §14
y trataba la verticalización *interna* de ia.rest, no el monorepo `core-*` de 3 apps. Casi seguro
se redactaron en una sesión efímera previa y no se commitearon. El plan completo venía inline en el
prompt; este documento lo formaliza tras una **auditoría read-only real** de los 3 repos.

## 1. Las 3 apps (2 clústeres / 2 BBDD)

| | ia.rest | SIVRA | IALIMP |
|---|---|---|---|
| Qué es | Plataforma POS hostelería | Intranet gestión pisos turísticos (Alberto) | SaaS limpieza (spin-off SIVRA) |
| Repo | `ia.rest` | `sivra` | `ialimp` |
| Supabase | `efncqyvhniaxsirhdxaa` | `wswbehlcuxqxyinousql` | `wswbehlcuxqxyinousql` (**misma que SIVRA**) |
| Next / React | ^16.2 / 19 | ^15.3 / 19 | ^15.5 / 19 |
| Tenancy | `local_id` (rename hecho) | **single-tenant** (sin `empresa_id`) | **multi-tenant `empresa_id`** (frontera RGPD) |
| Auth | sesión **HMAC** en cliente (`x-ia-session`) | **NextAuth v5-beta** (credenciales admin) + `limpiadora_token` | **JWT jose+bcrypt + JTI** (`ialimp_session`/`ialimp_prop`/`limpiadora_token`) |
| Estado | sin clientes (ventana libre) | uso propio | **CLIENTE REAL EN PROD (Sique Brilla), main=prod inmediato → INTOCABLE** |

**Fuerte en / le falta:**
- **ia.rest**: fiscal/VeriFactu, cobro (Stripe Connect + SEPA), AI+brain, OCR visión, motor de
  verticales. *Le falta*: reservas STR/PMS, white-label por tenant, RGPD maduro.
- **SIVRA**: PMS Smoobu, **pricing dinámico STR** (PriceLabs), mensajería huésped IA, ROI. *Le
  falta*: fiscal, cobro, CRM, RGPD, multi-tenancy.
- **IALIMP**: **white-label**, app limpiadora `/l`, nóminas, cold-email, portal propietario, iCal
  sync (`lib/ical-sync.ts`), RGPD maduro (`lib/rgpd.ts`). *VeriFactu solo para 2027*.

## 2. Decisiones tomadas (Alberto, 2026-06-08)

1. **Topología: monorepo único (turborepo/pnpm).** Fusionar físicamente los 3 repos en un árbol.
   ⚠️ Es un movimiento estructural que toca el pipeline de IALIMP prod → se hará **seguro**:
   - **Un proyecto Vercel por app** con *builds ignorados por path* (IALIMP solo redespliega si
     cambian sus ficheros o los paquetes `core-*` que consume).
   - **Preservar historial** de cada repo (git subtree, no copia plana).
   - **IALIMP entra el ÚLTIMO**, con su `main`=prod, su auth y su BD/RLS/buckets intactos.
2. **Primer paquete piloto: `core-ai`** ("el más completo y definitivo"): los 3 ya usan NVIDIA NIM;
   la implementación de ia.rest (multi-proveedor con fallback + `brain`/`router`) es la canónica.

## 3. Árbol `core-*` refinado (auditado contra el código real)

**EXTRAER — solape real, bajo riesgo:**
- **`core-ai`** ✅ — semilla ia.rest (`ai-client.ts` + `brain*`: NIM/Groq/Gemini/Azure + fallback
  Claude); superficie mínima `complete()`/`vision()` que SIVRA e IALIMP ya cubren con `aiComplete`.
  Puro, sin BD/auth.
- **`core-fiscal`** ✅ — fusión `verifactu.ts` de ia.rest (cadena hash serie 'T', QR AEAT, SOAP) +
  `fiscal.ts` de IALIMP (validadores NIF/NIE/CIF/IBAN). **Funciones puras in→out**; la cadena
  VeriFactu (integridad legal) se queda por-tenant en el llamador — el paquete **nunca** tiene BD.
- **`core-ui/brand`** ✅ — semilla white-label de IALIMP (vars `--brand-*`, tipo `Branding`,
  `BrandingStyle.tsx`) + `negocio.ts` de ia.rest (LABELS/presets por vertical). El "moat" de IALIMP
  hecho compartible.
- **`core-rgpd`** ✅ (acotado) — semilla `lib/rgpd.ts` de IALIMP (versionado de consentimiento,
  forma del audit, helpers cookie/fuentes auto-alojadas, validadores). El "responsable" es config.

**EXTRAER — valor alto, acoplamiento medio:**
- **`core-reservas`** ✅ — **net-new para ia.rest, mayor ganancia de producto**. Parser iCal
  SSRF-safe (`lib/ical-sync.ts` de IALIMP) + cliente Smoobu (SIVRA + IALIMP). El bucle de sync y
  las alertas de urgencia se quedan por-app.
- **`core-ocr`** ✅ (acotado) — prompt de visión + `pdf-parse` compartidos; el mapeo a cuenta
  contable / stock se queda por-app.

**DIFERIR:**
- **`core-cobro`** 🟡 — ia.rest ya es el más completo (Stripe Connect + SEPA + comisión); demanda
  cruzada baja hoy. Más adelante: adaptador Stripe + máquina de estados de webhook.
- **`core-crm`** 🟡 — el de IALIMP (`mailing_*`) es herramienta **global de superadmin** (prospección
  propia de IALIMP), no de tenant; el de ia.rest es lead-hunter Sevilla. Converger después.

**DESCARTAR:**
- **`core-auth`** ❌ — tres modelos incompatibles (HMAC-cliente / NextAuth v5 / jose-JWT+JTI),
  confirmado en ambas auditorías. La auth se queda en cada app; **todos los `core-*` son
  identity-agnostic** (reciben `local_id`/`empresa_id`/`cliente` como parámetro).
- **`core-pricing` unificado** ❌ — son tres dominios distintos: escandallos de comida (ia.rest) ≠
  pricing dinámico de alquiler (SIVRA) ≠ catálogo de tarifas/nóminas (IALIMP). En su día se parte
  (`core-pricing-str` desde SIVRA, aparte). No forzar uno solo.

**Base de datos:** **sin convergencia de entrada.** Los paquetes son lógica pura o reciben el
cliente de BD + el `scope_id` que inyecta la app; **nunca** tocan schema/RLS/buckets/GRANTs de
`wswbehlcuxqxyinousql` (compartida SIVRA↔IALIMP, con escrituras desde cliente vía anon key). IALIMP
es el **último** consumidor de cada paquete.

## 4. Las 5 fases (cada una: ia.rest → SIVRA → IALIMP-último, tras preview verde)

- **Fase 0 — Andamiaje** (cero runtime): scaffolding turborepo/pnpm + subtree de los 3 repos
  (historial preservado) + CI (`tsc --noEmit` + `next build` por app) + un proyecto Vercel por app
  con builds ignorados por path + red de tests de contrato mínima. **Sin cambios de comportamiento.**
- **Fase 1 — Núcleo puro** (riesgo ~0): `core-ai` (piloto) + `core-fiscal`.
- **Fase 2 — Marca y cumplimiento:** `core-ui/brand` + `core-rgpd`. ia.rest estrena theming
  white-label.
- **Fase 3 — Reservas STR + OCR:** `core-reservas` (da capacidad STR a ia.rest) + `core-ocr`.
- **Fase 4 — Cobro, CRM y entitlements:** `core-cobro` + `core-crm` + alineación de monetización.
  *Planificar* (no ejecutar) convergencia de datos.
- **Fase 5 — Plataforma casa de marcas:** naming de la matriz, identidad/SSO compartido
  (exploración), API pública + servidor MCP, monetización. Convergencia de BBDD solo si se
  justifica, por fases, IALIMP el último.

## 5. Guardarraíles (innegociables)

- **IALIMP prod intocable**: último consumidor de cada paquete; nunca tocar su BD/RLS/buckets/GRANTs;
  bucket `cleaning-photos` público a propósito; `empresa_id` = frontera RGPD.
- **BD compartida `wswbehlcuxqxyinousql`**: ningún `core-*` ejecuta DDL ni cambia RLS/buckets.
- **No big-bang**: cada fase deja el sistema funcionando; verificación antes de seguir.
- **No confundir** `properties` (Prisma, SIVRA) con `propiedades` (limpiadoras, multi-tenant).
- **Pre-push**: `npx tsc --noEmit` 0 errores + `next build` por app afectada.
- **Auth no se comparte**: paquetes identity-agnostic.

## 6. Estado / siguiente paso

- ✅ Auditoría read-only de SIVRA e IALIMP completada (stack, esquema, auth/tenancy, solape, net-new).
- ✅ Árbol `core-*` y 5 fases refinados contra el código real.
- ✅ Decisiones de topología y primer paquete tomadas; **OK de Alberto recibido** (08/06, "lo que veas
  mejor, lo pongo automático").
- 🟡 **Fase 0 + Fase 1 (piloto) EN MARCHA — acotadas a ia.rest** (arranque seguro; `sivra`/`ialimp`
  NO se tocan todavía):
  - **Andamiaje monorepo** dentro de ia.rest: `npm workspaces` (`packages/*`) + `turbo.json` (scaffold).
  - **Paquete piloto `@iarest/core-ai`** (`packages/core-ai/`): cliente NVIDIA NIM **identity-agnostic**
    (`nimText`/`nimVision` reciben config, no leen `process.env`) + `cleanJSON` + tipos `ImageInput`/
    `NimConfig`. Es la implementación **canónica** que luego adoptan SIVRA e IALIMP.
  - **ia.rest lo consume** vía alias de `tsconfig` (`@iarest/core-ai`) + `transpilePackages` en ambos
    `next.config`. `src/lib/ai-client.ts` mantiene su **API pública byte-a-byte** (callAI/callAISearch/
    callAIVision/cleanJSON/ImageInput), su config de entorno y el fallback a Claude; solo **delega** la
    llamada NIM en el paquete. 30+ rutas importadoras intactas.
  - **Verificación:** `tsc` del paquete en aislado = **verde**. El build completo de la app se verifica
    en el **preview de Vercel** del PR draft #85 (no hay `node_modules` en el entorno efímero para
    reproducir `next build` localmente). Si el preview falla, se diagnostica por el webhook del PR.
- ⏭️ **Siguiente** (tras preview verde): extraer al paquete el resto de la superficie NIM/brain y
  empezar `core-fiscal`; luego adoptar `core-ai` en SIVRA. La conversión a **monorepo único real**
  (subtree de los 3 repos + turbo load-bearing + 1 Vercel por app) es un paso deliberado posterior,
  con IALIMP el último.
