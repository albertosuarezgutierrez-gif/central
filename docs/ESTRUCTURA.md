# ESTRUCTURA — Mapa completo de la casa de marcas (`central`)

> Inventario **vivo** del monorepo, auditado contra el código real (no contra el mapa
> curado a mano). Sirve para no perder contexto entre sesiones y para alimentar la pestaña
> **Estructura** del god-panel (`apps/plataforma/lib/estructura.ts`).
> Última auditoría: 2026-06-11.

## 0. Resumen de un vistazo
- **Verticales (apps/*):** 4 — `plataforma` (matriz), `ia-rest`, `ialimp`, `sivra`.
- **Núcleos compartidos (`packages/core-*`):** 6.
- **Módulos de dominio (`packages/module-*`):** 9 (¡el mapa del panel solo mostraba 2!).
- **Agentes de IA:** 30+ repartidos por vertical (el mapa mostraba 13).
- **BD:** `plataforma`+`ialimp`+`sivra` comparten Supabase `wswbehlcuxqxyinousql`; `ia-rest`
  vive en su **propio** proyecto Supabase (`efncqyvhniaxsirhdxaa`). La "unificación" de ia-rest
  quedó a medias (schema `iarest` compartido = clon vacío del DDL).

---

## 1. Verticales (`apps/*`)

| App | Sector | Qué es | BD | Estado |
|---|---|---|---|---|
| **plataforma** | Casa de marcas | Cuadro de mando consolidado (Cuenta→Sociedad→Negocio) + **god-panel** de operador. | Compartida | Vivo |
| **ia-rest** | Hostelería | Voice POS / TPV para restaurantes, catering y eventos. ~523 endpoints, ~200 tablas. | Propia | Vivo (`iarest.es`) |
| **ialimp** | Limpieza | SaaS multi-tenant de limpieza de pisos turísticos (white-label). | Compartida | Vivo (`app.ialimp.es`) |
| **sivra** | Inmobiliario | Intranet de gestión de pisos turísticos (instancia propia, Sevilla). | Compartida | Vivo |

---

## 2. Núcleos compartidos (`packages/core-*`)

| Paquete | Qué hace | Dep npm propia |
|---|---|---|
| `core-ai` | Clientes de IA (NVIDIA NIM, Gemini, visión, completion). Identity-agnostic. | — |
| `core-fiscal` | Fiscalidad España: IVA + VeriFactu (huella encadenada AEAT). | — |
| `core-push` | Web Push (notificaciones). | `web-push` |
| `core-storage` | Supabase Storage (signed URLs vía REST). | — |
| `core-email` | Email saliente multi-proveedor (Resend/SMTP/Gmail). | `nodemailer` |
| `core-identity` | Contrato de sesión/inquilino (puertos & adaptadores). | `jose` |

---

## 3. Módulos de dominio (`packages/module-*`)

Lógica **pura TS**, agnóstica de BD y de vertical. Patrón común: el dominio se ancla a un
**Encargo** (`parent`/`parentType`) y cada vertical aporta su **adaptador**. Son el andamiaje
para crecer a verticales nuevas (alquiler de materiales, transporte, clínica/citas, venues…).

| Paquete | Qué hace | ¿Usado hoy? |
|---|---|---|
| `module-contabilidad` | IVA trimestral, PyG, tesorería, rentabilidad, recurrentes. | ✅ ialimp, sivra, ia-rest |
| `module-concursos` | Agente de licitaciones LCSP: lee el pliego (AiRunner) → ficha + checklist por sobre + Go/No-Go + baja temeraria + garantías. | ✅ ialimp (v1) |
| `module-agenda` | Disponibilidad + reserva de un recurso (sala, vehículo, kit, persona) con detección de solapes. | ⏳ para verticales nuevas |
| `module-crm` | Pipeline comercial genérico (oportunidades/leads) anclado a un Encargo. | ⏳ (ia-rest/ialimp tienen el suyo propio) |
| `module-presupuestos` | Líneas, costes, descuentos y cálculo de margen/rentabilidad. | ⏳ |
| `module-proveedores` | Catálogo de proveedores + servicios con comisiones. | ⏳ |
| `module-materiales` | Materiales físicos y consumibles: catálogo, espacios, transferencias, contabilidad de compra y roturas. | ✅ ia-rest, ialimp, sivra |
| `module-asn` | Aviso de envío/recepción de mercancía con líneas (lote, caducidad). | ⏳ (ia-rest tiene ASN propio) |
| `module-feedback` | Reseñas/valoraciones + propinas por Encargo o token público. | ⏳ |

> **Nota:** 7 de estos 9 módulos **no aparecían** en el mapa del panel. Son piezas
> compartidas listas para enchufar; varias duplican (a propósito, como contrato genérico)
> funcionalidad que ia-rest/ialimp ya implementan a medida.

---

## 4. Agentes de IA por vertical

### 4.1 Transversal
- **Agente de concursos públicos** (`module-concursos`) — pliego → ficha + checklist + Go/No-Go.

### 4.2 ia-rest (hostelería) — el más denso
| Agente | Qué hace |
|---|---|
| **BRAIN (voz → comanda)** | ASR (Groq Whisper) + NIM contextual → comanda estructurada, correcciones fuzzy, routeo a cocina. |
| **Asistente / copiloto (owner)** | Chat sobre datos del restaurante (ventas, stock, márgenes). |
| **Asistente de cocina (KDS)** | Chat operacional en pantalla de cocina. |
| **Help chat contextual** | Ayuda según la página/turno/comanda activa. |
| **Recomendación de carta** | Cross-sell/upsell/producto del día (camarero y QR). |
| **Smart Scan (OCR multi-doc)** | Clasifica y extrae: albarán, factura, carta papel, etiqueta producto (GS1/EAN), CV. |
| **Scoring de eventos** | Post-evento: comanda + financiero + APPCC → nota 0-10 + mejoras. |
| **Forecaster** | Predicción 7 días (comandas/ingresos/producto estrella) + eventos del entorno. |
| **Agente CRM (leads)** | Analiza eventos de lead (WhatsApp/IG/email) → estado + siguiente acción. |
| **Lead hunter** | Prospección con Apify + enriquecimiento NIM (especializado Sevilla). |
| **Generador de Instagram** | 6 plantillas, 2×/semana, aprobación por Telegram. |
| **Generador de blog SEO** | Artículos SEO de hostelería. |
| **Traductor de carta** | Traducción automática de la carta a idiomas del QR. |
| **Auto-healer** | Detecta patrones de incidencias (bridge, fichaje, comanda) y propone curas. |
| **QA runner** | Suites de test automatizadas sobre clientes. |
| **Agente arquitecto** (operador) | Analiza la estructura del proyecto y propone refactors/ahorro de tokens. |
| **Agentes de operador** (SEO · ventas · legal · competencia · contenido · onboarding) | 6 agentes especializados de soporte al negocio. |

### 4.3 ialimp (limpieza)
| Agente | Qué hace |
|---|---|
| **Auto-asignación** | Asigna limpiadoras por turnos/carga/ventana de entrada (scoring). |
| **Cotizador IA** | Redacta argumentario + genera propuesta HTML para leads. |
| **Calidad de fotos** | Visión: detecta incidencias en foto post-limpieza. |
| **Comparar fotos (referencia)** | Visión: compara antes/después contra foto de referencia. |
| **Escáner de documentos (OCR)** | Factura/albarán/ticket → clasifica + mapea PGC + propone apunte. |
| **Análisis de kits (visión)** | Estima nivel de productos desde foto del kit. |
| **Clasificador de quejas** | Categoriza, prioriza y genera expediente RRHH si hay patrón. |
| **Detección de patrones** | Anomalías sobre quejas + carga + rendimiento. |
| **Briefing diario** | Resumen operativo (email + push) a la coordinadora. |
| **Análisis RRHH** | Desempeño por limpiadora (rating, quejas, asistencia). |
| **Asistente / copiloto** | Consultas operativas (quién trabaja hoy, sin asignar, por cobrar…). |
| **Mailing en frío** | Captación: recolectores Google Places/Apify/IA + drip de emails. |

### 4.4 sivra (inmobiliario)
| Agente | Qué hace |
|---|---|
| **Pricing automático** | Motor de precios anclado al mercado, con salvaguardas. |
| **Chat financiero** | Consultas en lenguaje natural sobre propiedades/ingresos/gastos. |
| **Análisis de inversión** | Evalúa oportunidades de inversión en pisos. |
| **Escáner de facturas (visión)** | OCR de facturas de gasto → apuntes. |

---

## 5. Funcionalidades por vertical (áreas grandes)

### 5.1 ia-rest
TPV/comanda por voz · KDS (cocina, elaboraciones, pesaje) · mesas/plano de sala · cobros/caja/
arqueos · pagos (Stripe Connect, Cashlogy, CashDro) · facturación VeriFactu · **eventos/catering/
BEO** (presupuestos, menús, APPCC, scoring) · reservas (The Fork, WordPress) · **QR cliente** /
pedidos online / modo edge (sin mesa) · CRM/leads/captación · RRHH (personal, fichajes, candidatos
con OCR de CV) · stock/almacén/recepciones/ASN/proveedores (predicción) · carta/productos/
escandallos · vinos (OCR etiqueta + sommelier) · contabilidad (cierre, IVA, asesor invitado) ·
blog/Instagram/marketing generativo · tienda/storefront · **hardware bridge** (impresoras ESC/POS,
báscula) · QA/salud/auto-healer · portales (proveedor, evento/invitados, feedback) · 20+ crons.

### 5.2 ialimp
Clientes/propiedades + **portal del propietario** (RGPD granular, facturación, archivador de
documentos del piso, escáner OCR, iCal Smoobu) · contabilidad (recurrentes, IVA, tesorería,
rentabilidad, VeriFactu) · facturación al cliente · **equipo/RRHH** (limpiadoras, disponibilidad,
tarifas, nóminas, partes de trabajo, expedientes) · **agenda** + auto-asignación · operaciones
(carga semanal) · materiales/stock/lencería (kits con visión) · usuarios + white-label + planes ·
informes (PDF nocturno) · CRM/leads · cotizador · concursos · **chat** (admin↔limpiadora↔
propietario) · **asistente copiloto** · **app limpiadora** (`/l`, PIN/enlace mágico, checklist,
fotos, fichaje) · landing `ialimp.es` + **mailing en frío global** (superadmin).

### 5.3 sivra
Dashboard financiero · propiedades (multi-tenant) · ingresos (reservas/portales/ADR) · gastos
(con escáner IA) · **pricing dinámico** (motor + market data + recomendaciones + experimentos) ·
mensajería (auto-reply + base de conocimiento) · calendario · **agente IA financiero** · gestión
de limpiadoras (sesiones, asignación, facturación, ausencias) · mercado (ingest Booking/Trivago) ·
SEO · informes · auth (admin + limpiadora por PIN/token).

### 5.4 plataforma
Auth (cuenta, JWT) · registro por UI · dashboard consolidado por negocio · CRUD sociedades/
negocios · **god-panel `/admin`** (auth superadmin; listado unificado de clientes vía adaptadores
ialimp/sivra/ia-rest; bloquear/liberar; vista 360; pestaña Estructura) · resumen financiero por
vertical (ialimp y sivra por BD; **ia-rest por puerto HTTP**).

---

## 6. Gaps detectados (mapa del panel vs. realidad)

1. **Módulos:** el panel mostraba 8 (6 core + 2 module); la realidad son **15** (6 core + 9
   module). Faltaban: `module-agenda`, `module-crm`, `module-presupuestos`, `module-proveedores`,
   `module-inventario`, `module-asn`, `module-feedback`. → **Corregido en `estructura.ts`.**
2. **Agentes:** el panel mostraba 13; la realidad son **30+**. → **Ampliado en `estructura.ts`.**
3. **Catálogo de módulos contratables** (`lib/modulos.ts`, god-panel F2): solo `ialimp` tiene
   módulos; `ia-rest` y `sivra` están **vacíos**. Propuesta en §7. → *pendiente (no implementado).*
4. **Documentación de apps:** `ia-rest` y `sivra` tienen CLAUDE.md muy escueto frente a su tamaño.
5. **Reimplementaciones (lógica duplicada):** la radiografía ahora detecta capacidades presentes
   en una vertical pero **sin usar el módulo compartido** que las respalda. Hoy: `proveedores` y
   `almacen-stock` (ialimp+sivra a mano) y `crm-leads` (ialimp a mano) — solo ia-rest pasa por el
   módulo. Ver `docs/AUDITORIA-proveedores-inventario.md`. → **detector añadido; portado pendiente.**

---

## 7. Propuestas para "más completo" (no implementado — decidir)

- **Catálogo gateable de ia-rest** (para F2 del god-panel): `tpv`, `kds`, `catering/eventos`,
  `crm`, `almacen`, `portal/qr`, `marketing` (blog/IG), `contabilidad`.
- **Catálogo gateable de sivra**: `pricing`, `agente-ia`, `limpiadoras`, `mercado`, `informes`.
- **Chat / módulo RRHH transversal**: hoy RRHH vive a medida en ialimp (`/admin/equipo`) y en
  ia-rest (`/api/rrhh`, candidatos con OCR). Candidato a `module-rrhh` (personal, fichajes,
  ausencias, nóminas, expedientes) + un **chat de RRHH** reutilizable por todas las verticales.
- **Adoptar los `module-*` ya escritos**: ia-rest/ialimp podrían migrar sus implementaciones a
  medida (CRM, presupuestos, proveedores, inventario, feedback) hacia los módulos compartidos
  para no duplicar lógica.
- **Verticales nuevas candidatas** (encajan con el andamiaje existente): alquiler de materiales,
  transporte/porte, clínica/citas, venues — todas reutilizan agenda + presupuestos + proveedores +
  inventario + crm + feedback + concursos.

---

## 8. Dónde vive cada cosa (para editar el mapa del panel)
- **Radiografía automática** (NUEVO): `scripts/auditar-estructura.mjs` audita el repo y
  escribe `apps/plataforma/lib/estructura.generated.json` (qué packages usa cada app +
  matriz de capacidades/áreas + diferencias entre verticales + **reimplementaciones**:
  capacidad presente que no usa su módulo compartido). Se regenera con
  **`npm run auditar`** desde la raíz; un check de CI (`.github/workflows/auditoria.yml`)
  avisa si quedó desfasado. La pestaña **Estructura** del god-panel lo pinta como matrices.
  El catálogo de capacidades (qué áreas detectar y con qué globs) está en el propio script.
- Mapa curado (descripciones legibles): `apps/plataforma/lib/estructura.ts` (arrays
  `VERTICALES`, `MODULOS`, `AGENTES`) — complementa la radiografía con el "qué es" de cada pieza.
- Catálogo gateable: `apps/plataforma/lib/modulos.ts`.
- Este documento: `docs/ESTRUCTURA.md` (la verdad viva es la radiografía; este doc da el relato).
