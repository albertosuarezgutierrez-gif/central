# 🧭 Arquitectura — Casa de marcas (mapa-norte de módulos)

> Mapa **conceptual** del modelo de módulos de la casa de marcas. No es un plan de obra: es la
> referencia para decidir dirección/marca y guiar la futura adopción de módulos. Ver `MATRIZ.md`
> (estructura del repo) y `docs/CONTEXTO-SESIONES.md` (estado vivo).
>
> **Idea en una frase:** las **especialidades** (verticales por sector) **encienden módulos**
> (capacidades de negocio + de plataforma) que se apoyan en **núcleos técnicos** portables.

---

## 0. Principio rector — Adaptabilidad 100%
Todo se diseña para ser **enchufable y sustituible** en cualquier vertical o proyecto externo:
- **Desacoplado:** un módulo/núcleo no importa de ninguna app; contrato TS claro, deps mínimas.
- **Identity-agnostic:** depende de `core-identity` (puerto), nunca del auth concreto (Supabase/jose/NextAuth).
- **Puertos & adaptadores:** cada integración es intercambiable (Stripe/Bizum/SEPA, A3/Sage, AEAT,
  Smoobu, Resend/IONOS, Apify…).
- **Multi-tenant + white-label de fábrica.**
- **Componible:** cada especialidad enciende solo lo que usa; una marca nueva = plantilla base + módulos.
- El **encendido de módulos ya existe** en producción (ialimp por usuario, ia.rest por preset) → es la
  base de la convención.

## 1. Modelo de capas
```
┌────────────────────────────────────────────────────────────────────┐
│ CAPA 3 · ESPECIALIDADES (verticales por sector)                      │
│  ia-rest (hostelería) · ialimp (limpieza) · sivra (alquiler) · …     │
│  = núcleo de sector + módulos ENCENDIDOS + branding, expuestos por   │
│    PANELES POR ROL (RBAC)                                            │
├────────────────────────────────────────────────────────────────────┤
│ CAPA 2 · MÓDULOS (capacidades que se encienden)                      │
│  2a · Capacidades de PLATAFORMA (sirven a todos los módulos):        │
│       agente IA/copiloto · cotizador/presupuestos IA · OCR documental│
│       · recolección leads/scraping · RBAC+paneles · multi-tenant/    │
│       multi-local+white-label · i18n · notificaciones · RGPD/legal · │
│       onboarding/registro · sesión-única/seguridad                   │
│  2b · Módulos de NEGOCIO (dominios):                                 │
│       contabilidad · facturación · cobros · ventas/CRM(+comercial) · │
│       marketing · almacén · RRHH · pricing(+mercado) · mensajería(+KB)│
│       · feedback · portal externo · reportes                         │
│  (UI/rutas/datos en la especialidad; lógica pura ↓)                  │
├────────────────────────────────────────────────────────────────────┤
│ CAPA 1 · NÚCLEOS TÉCNICOS (packages/*, primitivas puras)             │
│  core-ai · core-fiscal · core-identity (+ core-email/push/storage/…) │
└────────────────────────────────────────────────────────────────────┘
```

## 2. Glosario
- **Especialidad / vertical:** producto por sector (`apps/<app>`), con marca y núcleo de sector.
- **Módulo:** capacidad (de negocio o de plataforma) que una especialidad **enciende**. UI/datos en la
  app; lógica pura en un núcleo técnico.
- **Núcleo técnico:** paquete `packages/*` puro (sin UI, sin esquema de BD, sin estado de inquilino).
- **Encender un módulo:** declararlo activo (por preset y/o por usuario/rol). Apagar = no encenderlo.
- **Panel por rol:** la UI de uno o varios módulos para un rol (owner, operador, contable, comercial,
  propietario, operario, proveedor, cliente…). RBAC decide qué ve cada rol.

## 3a. Capacidades de PLATAFORMA (Capa 2a) · presencia hoy
| Capacidad de plataforma | ia.rest | ialimp | sivra | Más madura / nota |
|---|:--:|:--:|:--:|---|
| Agente IA / copiloto conversacional | ✓ (Brain NLU voz) | ✓ (asistente operativo) | ✓ (agente financiero) | usa `core-ai` |
| Cotizador / presupuestos IA | ✓ (briefings con scoring) | ✓ (`agente-cotizador` → PDF) | ~ | ialimp |
| OCR documental (albaranes/facturas) | ✓ (stock/albaranes) | ✓ (escáner contable) | ✓ (parse-invoice) | usa `core-ai` visión |
| Recolección de leads / scraping IA | ✓ (Apify/leads) | ✓ (Google Maps/Apify/web-IA) | ✓ (Idealista/Fotocasa/BOE) | las 3; usa `core-ai` |
| Paneles por rol + RBAC | ✓ (8 roles) | ✓ (módulos por usuario) | ~ (admin) | **encendido de módulos ya real** |
| Multi-tenant / multi-local + white-label | ✓ (`local_id`) | ✓ (`empresa_id` + marca) | ✗ (mono-tenant) | ialimp (white-label) |
| i18n / multi-idioma | ~ | ✗ (es) | ✓ (es/en/fr/de/it) | sivra |
| Notificaciones (email/push) | ✓ | ✓ | ✓ (email) | → `core-email`/`core-push` |
| RGPD / legal / consentimientos | ✓ | ✓ (versionable, audit) | ~ | ialimp |
| Onboarding / registro de tenant | ~ | ✓ (`/registro` crea empresa+owner) | ✗ | ialimp |
| Sesión única / seguridad (jti, rate-limit) | ~ | ✓ (jti + `auth_rate_limit`) | ~ | ialimp; ligado a `core-identity`/`core-security` |

## 3b. Módulos de NEGOCIO (Capa 2b) · presencia hoy
| Módulo de negocio | ia.rest | ialimp | sivra | Más madura |
|---|:--:|:--:|:--:|---|
| Contabilidad (PyG/IVA/tesorería) | ✓ | ✓ | ~ | ialimp (vistas `v_contab_*`, recurrentes) |
| Facturación / VeriFactu | ✓ | ✓ | ✗ | ia.rest (`core-fiscal`) |
| Cobros / pagos (Stripe/Bizum/SEPA) | ✓ | ✓ | ~ | ia.rest |
| Ventas / CRM (+ panel comercial/vendedor) | ✓ | ✓ | ~ | ialimp (pipeline+cotizador) · ia.rest (`/comercial`) |
| Marketing (blog-SEO/social/Instagram) | ✓ | ~ | ~ (SEO pisos) | ia.rest |
| Almacén / inventario / kits | ✓ (FEFO/escandallos/multi-local) | ✓ (kits/lencería) | ✗ | ia.rest |
| RRHH / turnos / nóminas | ✓ (turnos/fichaje) | ✓ (partes-trabajo) | ✓ (limpiadoras) | ialimp/ia.rest |
| Pricing / tarifas (+ análisis de mercado) | ~ | ✓ (catálogo) | ✓ (dinámico + competencia) | sivra |
| Mensajería (+ knowledge base) | ✓ | ✓ (chat interno) | ✓ (huéspedes multicanal + KB) | sivra |
| Feedback / valoraciones | ✓ | ~ (quejas) | ✗ | ia.rest |
| Portal externo (cliente/propietario/proveedor) | ✓ (proveedor) | ✓ (propietario, ver nota) | ✗ | ialimp |
| Reportes / KPIs / briefing | ✓ (forecaster) | ✓ (informes) | ✓ (semanal/ROI) | — |

> **Nota — "Portal externo de cliente" = módulo compuesto MADURO (ialimp).** El portal del propietario:
> auth propia separada (cookie `ialimp_prop`; email+contraseña o **enlace mágico de un solo uso**),
> **gate RGPD granular y versionable** (servicio + marketing, evidencia en `cliente_consentimientos`),
> Turnstile + rate-limit, **archivador de documentos del piso**, **configuración iCal**, **vista de
> facturas** y **white-label**. La lógica pura (tokens un-uso, versionado de consentimiento, signed-URLs
> de fotos) baja a `packages/*`; la UI/datos quedan en la especialidad. ia.rest tiene su análogo
> (`/proveedor/[token]`); **sivra no tiene portal de propietario/inversor → oportunidad de encenderlo ahí.**

> **Nota — "Panel comercial / vendedor".** ia.rest `/comercial` (rol `coordinador_eventos`): briefings
> con scoring IA, agenda de seguimiento y **comisiones por coordinador** (ligero/en desarrollo). ialimp
> `/admin/crm`: pipeline nuevo→ganado + `agente-cotizador`. Es la cara "venta humana" del módulo
> Ventas/CRM → candidato a robustecer y compartir.

## 3c. Núcleos de sector (lo NO transversal — define cada especialidad)
- **ia.rest:** comanda por voz/TPV, carta, mesas/zonas, KDS/cocina, vinos, propinas, menaje,
  **eventos/catering** (BEO/menús/comisiones), hardware bridge (CloudPrnt/Cashdro), QR storefront.
- **ialimp:** sesiones de limpieza, app limpiadora (`/l`, checklist+fotos IA), auto-asignación (scoring),
  sync PMS/iCal, documentos del piso.
- **sivra:** reservas Smoobu, pricing dinámico + análisis de mercado, lead-sourcing inmobiliario
  (inversión), SEO de pisos, mensajería con huéspedes + KB.

## 4. Mapa módulo → núcleos técnicos + heurística
| Módulo (negocio/plataforma) | Núcleos técnicos (Capa 1) |
|---|---|
| Facturación / Contabilidad | `core-fiscal` (+ `core-identity`) |
| Ventas/CRM · Cotizador · Recolección de leads · OCR · Agente IA · Marketing | `core-ai` (+ `core-email`) |
| Mensajería · Notificaciones | `core-email` / `core-push` (+ puerto WhatsApp/Telegram) |
| Cobros | puerto pagos (Stripe/Bizum/SEPA) + `core-identity` |
| Portal externo · Almacén (fotos) | `core-storage` (signed URLs) + `core-identity` |
| RBAC/paneles · Sesión única · Multi-tenant | `core-identity` (+ `core-security`) |

**Heurística — qué baja a `packages/*` vs qué se queda:**
- **Baja** si es puro/determinista, sin UI, sin esquema de BD, sin estado de inquilino: cálculos (IVA,
  huella AEAT, pricing, scoring de asignación), clientes/SDKs (NIM, mailer, push, storage), validadores
  (NIF/IBAN), parsers (iCal, prompts OCR), puertos+adaptadores de integraciones.
- **Se queda en la especialidad:** UI/paneles por rol, rutas API, esquema/queries por inquilino, flujos
  y políticas (fallback, horarios, copy), branding.

## 5. "Encender un módulo" — mecanismo (con dos semillas reales)
- **ialimp (por usuario/rol):** `usuario_empresa` con **módulos granulares** activables
  (`sesiones, rrhh, facturacion, clientes, agenda, stock, lenceria, configuracion, informes`) + accesos
  `solo_app` / `solo_panel` / `hybrid`. RBAC decide qué panel ve cada rol.
- **ia.rest (por preset de negocio):** `moduloActivo`/presets en `lib/negocio.ts` + 8 roles con panel.
- **Convención propuesta** (a partir de ambas): el módulo expone su **contrato** (puerto+tipos en
  `packages/*`); la especialidad lo **enciende** (preset y/o por usuario) y aporta el **adaptador** (su
  auth, su BD, su UI/panel por rol). Una marca nueva enciende solo lo que necesita.

## 6. Núcleos técnicos: hoy y candidatos (justificados por duplicación)
| Núcleo | Estado | Justificación |
|---|---|---|
| `core-ai` | ✅ (lo usa ia.rest) | cliente NIM duplicado en las 3 (+ visión OCR, scraping, agentes) |
| `core-fiscal` | ✅ (lo usa ia.rest) | VeriFactu/validadores en ia.rest + ialimp |
| `core-identity` | ✅ existe, **0 consumidores** | contrato sesión/inquilino → RBAC, multi-tenant, sesión única |
| `core-email` | candidato | mailer multiproveedor (ialimp) + ia.rest |
| `core-push` | candidato | web-push en ia.rest + ialimp |
| `core-storage` | candidato | signed URLs/fotos en las 3 |
| `core-security` | candidato | rate-limit en BD (ialimp) reutilizable en logins |

> **⚠️ Límite conocido del enfoque `file:` deps (sin pnpm) — verificado 08/06/2026.**
> Funciona para núcleos **puros** (sin deps npm propias): `core-ai/core-fiscal/core-identity` (usan
> `fetch`/crypto). **NO funciona** para un núcleo que **importe una dependencia npm** (`web-push`,
> `nodemailer`, `@supabase/supabase-js`…): al compilarse en la app vía `transpilePackages`, webpack
> resuelve desde `packages/core-x/` y **no alcanza** `apps/<app>/node_modules` (son hermanos) →
> `Module not found` en el build de Vercel (`serverExternalPackages` no lo arregla). **Implicación:**
> `core-push/core-email/core-storage` requieren **pnpm workspaces** (que sí hoistea/symlinka deps), un
> cambio de infra mayor acoplado a Vercel. **Decisión actual:** Fase 3 cerrada en `core-ai`; el resto
> aplazado (DRY marginal). Núcleos nuevos: mantenerlos **puros** mientras sigamos con `file:` deps.

## 7. Fronteras (innegociables)
Multi-tenant con scoping por inquilino (`empresa_id` / `local_id`); identity-agnostic; **no compartir BD
entre verticales sin contrato** (hoy SIVRA↔IALIMP comparten Supabase con anon-key en cliente = frontera
sensible); núcleos sin imports de app; RGPD/legal con responsable explícito.

## 8. Convención de nombres / scope · adopción
- Núcleos: `core-*`. Scope npm hoy `@iarest/*` (legacy de cuando ia.rest era la raíz) → **renombrar a
  `@<marca-matriz>/*`** al elegir nombre.
- Adopción real: solo **ia.rest** consume `packages/*` (`core-ai`, `core-fiscal`); `sivra`/`ialimp` con
  código propio; `core-identity` sin adoptar.

## 9. Cómo nace una marca nueva (la fábrica) + portabilidad
- **Nueva vertical = plantilla base + módulos encendidos:** esqueleto común (estructura, slots de auth y
  branding, registro de módulos, paneles por rol) y se encienden las capacidades necesarias. Futuro
  generador `create-vertical`.
- **Portabilidad externa:** los núcleos podrían **publicarse a un registry privado** (`@<matriz>/*`) para
  proyectos fuera del monorepo. Dentro, se consumen con `file:` deps (patrón probado, sin pnpm/turbo).

## 10. Dirección futura (anotada, no decidida aquí)
Modelo elegido = "capacidades que se encienden" (no ERP único ni librerías-UI). Si algún día se converge
a plataforma única/ERP modular, este mapa es la base; queda como opción futura sin comprometerla.

## 11. Anatomía de cada especialidad (composición concreta)
- **ia.rest = núcleo hostelería** (comanda voz/TPV, carta, mesas/zonas, KDS, vinos, propinas, menaje,
  eventos/catering, hardware bridge, QR storefront) **+ negocio** (contabilidad, facturación, cobros,
  ventas/CRM+`/comercial`, marketing/Instagram, almacén multi-local, RRHH/turnos, feedback, portal
  proveedor, reportes/forecaster) **+ plataforma** (agente Brain, OCR albaranes, scraping leads, RBAC 8
  roles, multi-local, notificaciones).
- **ialimp = núcleo limpieza** (sesiones, app limpiadora `/l`, checklist+fotos IA, auto-asignación,
  PMS/iCal, documentos del piso) **+ negocio** (contabilidad PyG/IVA/tesorería, facturación, cobros,
  ventas/CRM+cotizador, almacén/kits/lencería, RRHH/nóminas/partes, pricing/tarifas, mensajería/chat,
  portal propietario, informes) **+ plataforma** (asistente IA, cotizador IA, OCR escáner,
  mailing/scraping, RBAC módulos-por-usuario, multi-tenant+white-label, onboarding/registro, RGPD
  versionable, sesión única).
- **sivra = núcleo alquiler** (reservas Smoobu, pricing dinámico + mercado/competencia, lead-sourcing
  inmobiliario, SEO de pisos, mensajería huéspedes + KB) **+ negocio** (ingresos/gastos, pricing,
  mensajería+KB, reportes/ROI) **+ plataforma** (agente IA financiero, scraping inversión, i18n 5
  idiomas). **No enciende (hoy):** facturación, portal externo, almacén, white-label (es mono-tenant).

## 12. Oportunidades de reutilización cruzada (futuro, conceptual)
- **Portal del propietario** (ialimp) → encender en **sivra** (portal inversor/propietario).
- **Análisis de mercado/competencia** (sivra) → **pricing competitivo en ialimp** (y dato para ia.rest).
- **Knowledge base + auto-responder** (sivra) → **mensajería de ialimp** (chat propietario/limpiadora).
- **Patrón "copiloto"** (Brain de ia.rest / asistente de ialimp / agente financiero de sivra) → unificar
  sobre `core-ai` y reutilizar en las 3.
- **Contabilidad madura** (vistas SQL de ialimp) → base para ia.rest/sivra.
- **CRM/mailing en frío** (ialimp) → captación de ia.rest. **i18n** (sivra) → internacionalizar ialimp.
- **Forecaster** (ia.rest) → previsión de cargas/demanda en ialimp/sivra.

## 13. Reglas de dependencia (guardarraíl de portabilidad)
- `app → packages/*`: **SÍ** (vía `file:` deps).
- `packages/* → app`: **NUNCA** (núcleos puros, sin imports de ninguna app).
- `app → app`: **NUNCA** (las verticales no se importan entre sí; comparten solo a través de `packages/*`).
- módulo (Capa 2, dentro de una app) → núcleo (`packages/*`): **SÍ**.
- núcleo → núcleo: solo contrato base (cualquiera → `core-identity`); **sin ciclos**.
- En `packages/*` **nada** de UI, esquema de BD, estado de inquilino ni lógica de un producto concreto.
