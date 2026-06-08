# HANDOFF — Unificación "casa de marcas": ia.rest + SIVRA + IALIMP

> Documento de traspaso para una sesión de Claude Code con acceso a los repos
> `ia.rest`, `sivra`, `ialimp` (y opcional `house-sevillana-landing`). El DISEÑO YA
> ESTÁ HECHO: esta sesión LEE, AUDITA el código real y REFINA — no re-delibera.
> Redactado 2026-06-08. Fuente de verdad del plan: `…/specs/2026-06-07-plataforma-
> verticales-design.md` **§16**.

---

## 0. Lee esto primero (en el repo `ia.rest`)
1. `docs/superpowers/specs/2026-06-07-plataforma-verticales-design.md`
   → **§16 = el plan de unificación** (lo más importante). §3 = dos familias de
   verticales. §12 = vertical Citas/Servicios. §4 = abstracciones núcleo.
2. `docs/CONTEXTO-SESIONES.md` → memoria/estado vivo (entrada de unificación arriba).
3. Skill `ia-rest-maestro` (`.claude/skills/ia-rest-maestro/`) → arquitectura, infra,
   secretos (solo nombres), patrones críticos, módulos en producción.
4. `src/lib/negocio.ts` → motor de verticales (tipo_negocio + presets + LABELS).

---

## 1. El universo: 3 apps · 2 clústeres · 2 BBDD

| App | Repo | Supabase | Auth | Tenancy | Clientes |
|---|---|---|---|---|---|
| **ia.rest** | `ia.rest` | `efncqyvhniaxsirhdxaa` | sesión firmada HMAC | `cuenta`→`local_id` | **ninguno** (ventana libre) |
| **SIVRA** | `sivra` | `wswbehlcuxqxyinousql` | NextAuth v5 | mono-usuario (interno) | interno (Alberto) |
| **IALIMP** | `ialimp` | `wswbehlcuxqxyinousql` (**compartida con SIVRA**) | JWT propio (jose+bcrypt) | `empresa_id` | **Sique Brilla SL — PROD, `main`=prod** |

> SIVRA + IALIMP **son** el vertical "gestión de alojamiento turístico" ya construido
> y repartido en dos apps (SIVRA = lado gestor/propietario; IALIMP = lado operativo
> limpieza, Familia B servicio agendado). IALIMP es spin-off del módulo limpiadoras de SIVRA.

### Ficha ia.rest
Voice POS para hostelería española (Next.js App Router + Supabase + Vercel), ya
formalizado como **plataforma de verticales** (POS con verticales enchufables). Sin
clientes activos. Rama de trabajo actual: `claude/store-module-pos-MQUyV` (PR #84).
Rename físico `restaurante_id → local_id` COMPLETO. Módulos en prod: voz/KDS/QR/
storefront, almacén/compras, contabilidad+VeriFactu, CRM/comercial, eventos/catering,
analytics/BI, marketing (Instagram/Blog/MiWeb), agentes (Auto-Healer/QA). IA vía
NVIDIA NIM (`lib/ai-client.ts`, fallback Claude Haiku).

### Ficha SIVRA (repo `sivra`, "roi-intranet")
- **Qué**: intranet privada (todo tras login) de gestión de pisos turísticos en Sevilla.
  Ingresos/gastos por propiedad (ROI), pricing dinámico, mensajería huéspedes + agente
  IA, coordinación de limpiadoras. Usuario = Alberto/gestor (no huésped ni limpiadora).
- **Captura dominante**: registrar un GASTO a partir de factura vía **visión IA**
  (`/api/expenses/parse-invoice`, `parse-booking`). Reservas entran solas por sync
  Smoobu (`/api/updates/sync`). Sesiones de limpieza en módulo limpiadoras.
- **Cobro/fiscal**: NO cobra a clientes finales (sin Stripe). Genera facturas SOLO de
  limpiadoras (`facturas_limpiadoras`, liquidación a proveedoras). **SIN VeriFactu/AEAT**:
  es contabilidad de gestión (ROI), no fiscal-legal.
- **Stack**: Next 15 (App Router) · React 19 · TS 5.6 · Tailwind · **NextAuth v5** ·
  Supabase/Postgres + **Prisma** · IA NVIDIA NIM · next-intl · Vercel + 10 crons.
- **Estado**: prod, con **deuda técnica**: Prisma modela ~5 de 90+ tablas; todo
  limpiadoras va en SQL crudo sin tipar. Sitio público vestigial.
- **Net-new (lo que ia.rest no tiene)**: pricing dinámico (A/B, snapshots de tarifas,
  detección de oportunidades, alertas — `/pricing`, `/api/rates`, `/api/pricing/*`) ·
  inteligencia de mercado (`/mercado`, cron + Serper, scraping competencia) · agente IA
  + auto-reply de mensajería con huéspedes · visión IA parse facturas de gasto ·
  integración Smoobu (PMS) + sync calendario · SEO (propuestas, refresh, sitemap).

### Ficha IALIMP (repo `ialimp`)
- **Qué**: SaaS multi-tenant de gestión de limpiezas de pisos turísticos, para empresas
  de limpieza que sirven a propietarios. Spin-off del módulo limpieza de SIVRA. Flujo:
  salida de huésped (Smoobu/iCal) → sesión de limpieza → asignación a limpiadora → app
  móvil limpiadora (checklist + fotos) → facturación al propietario.
- **Captura**: la `cleaning_session` (cada salida de huésped genera una sesión que se
  asigna, se ejecuta vía app `/l`, se cierra). Captura económica = `parte_trabajo` (qué
  hizo cada limpiadora → base de nómina). *Restaurante=comanda · IALIMP=sesión de
  limpieza agendada.* (Valida la "cita ligera" §12 y el "parte de trabajo" field-service §3.)
- **Cobro/fiscal**: SÍ, doble dirección. Factura al propietario (`facturas_clientes`,
  destinatario congelado `dest_*`) y paga a limpiadora (`nominas` = agregación de
  `partes_trabajo`; `facturas_limpiadoras`). **VeriFactu OBLIGATORIO** (`lib/verifactu.ts`,
  SHA-256 + XML SOAP AEAT, campos `vf_*`); Sique Brilla obligada desde ene-2027.
  Contabilidad de empresa (PyG, IVA trimestral, tesorería) vía vistas SQL.
- **Stack**: Next 15.5 · React 19 · **Prisma + SQL crudo** sobre Supabase · **JWT propio
  (jose + bcryptjs, SIN NextAuth)** · next-intl · zod · IA solo NVIDIA NIM.
- **Estado**: **PRODUCCIÓN en vivo**. `app.ialimp.es` = rama `main`. Cliente real en
  directo → cualquier merge a `main` se ve al instante.
- **Net-new (lo que ia.rest no tiene)**:
  - **White-label por empresa según login** (no por host): marca/colores/logo en BD, una
    URL sirve a todas las empresas con su marca (vars CSS `--brand-*`). → resuelve la §6.
  - Sesión única por usuario (un asiento = un dispositivo, anti-compartir) vía `session_jti`.
  - Tres portales: panel admin · portal propietario (`/propietario`, cookie separada) ·
    app limpiadora (`/l`, login por PIN o enlace mágico, sin email/contraseña).
  - Auto-asignación de limpiezas con scoring (turnos, jornada, equidad semanal) + crons.
  - Sync iCal/Smoobu con aviso urgente (push+email) en reservas de última hora.
  - Gate RGPD granular del propietario (servicio obligatorio vs marketing opcional) con
    evidencia (`cliente_consentimientos`).
  - Mailing en frío / captación (panel superadmin, GLOBAL no multi-tenant): recolectores
    de leads (Google Places, Apify, IA), drip campaigns, tracking.

---

## 2. El plan de unificación (DECIDIDO — §16 del spec)

**TARGET: NO fusionar apps ni converger BBDD de entrada. Extraer el núcleo a una capa
compartida (monorepo de paquetes `core-*`)** que las 3 apps consuman; cada app mantiene
su BD/auth/runtime; la convergencia de datos/tenancy/auth se hace **después, por fases,
sin tocar lo que factura (IALIMP prod intocable)**. 80% del valor (dejar de mantener
fiscal/OCR/precios/white-label por triplicado) con 20% del riesgo.

### Árbol de paquetes propuesto (a refinar contra el código)
`core-fiscal` (VeriFactu; hoy ×2 en ia.rest+IALIMP → 1) · `core-cobro` (Stripe Connect) ·
`core-reservas` (captura agendada generalizada `recurso_id`/`servicio_id`) · `core-crm`
(leads+pipeline+propuestas) · `core-ai` (cliente NIM) · `core-ocr` (visión facturas/
albaranes; hoy ×2) · `core-pricing` (de SIVRA) · `core-ui`/`core-brand` (white-label por
login, de IALIMP) · `core-rgpd` (de IALIMP). Cada app = capa fina (su captura + su auth
+ su BD) sobre esos paquetes.

### Mapa de módulos
| Pieza | Origen | En la plataforma |
|---|---|---|
| `cleaning_session` + app `/l` | IALIMP | Vertical Familia B (servicio agendado) = `core-reservas` generalizado |
| `parte_trabajo` → nómina | IALIMP/SIVRA | Módulo RRHH/nóminas |
| Pricing dinámico (A/B, snapshots) | SIVRA | `core-pricing` (= fundamento #7 del spec) |
| Intel de mercado (scraping + Serper) | SIVRA | Módulo market-intel (dedup con lead-hunter/Apify de ia.rest) |
| Gastos por visión IA | SIVRA | `core-ocr` (dedup con Recepción v2 albarán de ia.rest) |
| Mensajería huésped + auto-reply IA | SIVRA | Módulo agente conversacional cliente (net-new) |
| Smoobu / iCal sync | SIVRA+IALIMP | Conector PMS (adaptador) |
| White-label por login `--brand-*` | IALIMP | `core-brand` (resuelve §6 casa de marcas) |
| RGPD granular + evidencia | IALIMP | `core-rgpd` (resuelve pendiente crítico de ia.rest) |
| Auto-asignación con scoring + crons | IALIMP | Módulo staffing (= staffing estacional del spec) |
| Sesión única `session_jti` | IALIMP | `core` seguridad sesión |
| VeriFactu | ia.rest + IALIMP | `core-fiscal` (2 implementaciones → 1) |
| Mailing frío / captación | IALIMP + ia.rest | Módulo CRM/captación (dedup) |

> **Hallazgo bidireccional**: NO es "los otros reusan ia.rest". IALIMP/SIVRA ya
> RESUELVEN pendientes de ia.rest (white-label, RGPD con evidencia, staffing scoring,
> pricing dinámico) → suben al núcleo. Los 3 usan NVIDIA NIM (IA ya alineada).

### Costuras (el coste real de unificar)
3 sistemas de auth distintos (HMAC / NextAuth v5 / JWT jose) · 2 BBDD · tenancy
`local` vs `empresa` · Prisma parcial en SIVRA/IALIMP · **cliente vivo en BD compartida**.
Ese es el trabajo, no la lógica de negocio.

### Fases (secuencia segura, IALIMP prod protegido)
1. **Monorepo + extracción no-disruptiva**: mover a `core-*` lo que NO toca runtime/BD de
   IALIMP (UI/brand, AI/NIM, utilidades). Cada app sigue desplegando igual. Riesgo casi nulo.
2. **Consolidar duplicados** de lógica pura: 1 VeriFactu, 1 OCR, 1 motor de precios, 1
   intel/scraping. Verificar contra prod IALIMP antes de cada corte.
3. **Promover net-new al núcleo**: white-label por login (→ §6), RGPD con evidencia,
   staffing scoring, conector Smoobu/PMS.
4. **Reconciliar auth y tenancy** (lo más caro): un modelo (`cuenta`→`local`/`empresa`
   como el mismo concepto) + un auth. Solo cuando 1-3 estén estables.
5. **Convergencia de BBDD** (opcional, lo último): solo si compensa.

### Decisiones abiertas
- Nombre de la matriz (§6, pospuesto; candidato `ia.OS`). Sub-marcas: ia.rest · ia.limp ·
  (turismo: ¿ia.stay?).
- ¿El `core` nace de ia.rest o extracción neutra? Recom.: **neutra**, sembrada con el más
  maduro por área (ia.rest para fiscal/cobro/almacén; IALIMP para brand/RGPD).
- Momento de converger BBDD/auth (fases 4-5): no urge.

---

## 3. 🚨 GUARDARRAÍLES DE SEGURIDAD (leer antes de tocar NADA)

- **IALIMP `main` = PRODUCCIÓN inmediata** con cliente real (Sique Brilla). NADA que toque
  su runtime/BD sin OK explícito de Alberto. Trabajo en rama + PR draft SIEMPRE.
- **BD `wswbehlcuxqxyinousql` COMPARTIDA** por SIVRA e IALIMP. IALIMP escribe con **anon
  key desde cliente**. → **NO tocar RLS, `security_invoker`, buckets ni GRANTs** asumiendo
  que solo la usa SIVRA: romperías IALIMP en silencio.
- **Bucket `cleaning-photos` es público a propósito** — no "arreglarlo".
- **Dos tablas de propiedades que NO hay que confundir**: `properties` (~5 filas, Prisma,
  SIVRA) vs `propiedades` (~106 filas, multi-tenant de limpiadoras/IALIMP).
- **`empresa_id` scoping = RGPD crítico**: una fuga entre empresas es fallo grave.
- **No romper** en IALIMP: flujo sesión→asignación→app limpiadora; facturación al
  propietario; contabilidad; cadena VeriFactu (nunca borrar facturas).
- Auditoría = **solo lectura**. Cualquier cambio se propone y espera OK.

---

## 4. Qué hacer en esta sesión (en orden)
1. Lee §16 del spec + esta hoja.
2. **Auditoría real (read-only)** de `sivra` e `ialimp`: stack, esquema BD, auth/tenancy,
   crons, qué solapa con el núcleo de ia.rest, qué es net-new. Empieza por `sivra` (origen,
   comparte BD) o `ialimp` (cliente) — da igual, leer no rompe.
3. **Refina el árbol `core-*` y las 5 fases** contra el código real; corrige lo que el
   diseño asumió mal (nombres de tabla, solapes, dependencias).
4. Entrega el **plan refinado** y ESPERA OK de Alberto antes de ejecutar nada.
5. Persiste: amplía §16 del spec de ia.rest + actualiza `docs/CONTEXTO-SESIONES.md`.

## 5. Reglas de trabajo
- Entorno efímero: solo persiste lo commiteado; actualiza memoria al cerrar.
- Rama propia + PR en **draft**. `npx tsc --noEmit` 0 errores + `next build` antes de push
  (no solo tsc — reproduce el build real).
- Nada de secretos al repo (van en Vercel env / Supabase secrets).
- Usa el skill `ia-rest-maestro` para cualquier cosa de ia.rest.
- Pendiente de seguridad heredado: **revocar el token de Supabase** que Alberto pegó en un
  chat antiguo → https://supabase.com/dashboard/account/tokens

**Arranca confirmando qué repos ves en el workspace y un resumen de 2 líneas (esquema +
auth) de cada uno, antes de la auditoría a fondo.**
