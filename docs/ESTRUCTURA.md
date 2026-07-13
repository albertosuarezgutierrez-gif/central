# ESTRUCTURA — Mapa completo de la casa de marcas (`central`)

> Inventario **vivo** del monorepo, auditado contra el código real (no contra el mapa
> curado a mano). Sirve para no perder contexto entre sesiones y para alimentar la pestaña
> **Estructura** del god-panel (`apps/plataforma/lib/estructura.ts`).
> Última auditoría: **2026-06-25** (auditoría completa de capacidades — ver §0).
>
> ⚠️ **FUENTE DE VERDAD = la radiografía automática** `docs/ARQUITECTURA.generated.md`
> (regenerada en cada push por `npm run auditar`; al día: 7 verticales · 34 packages · 1059 APIs).
> Este doc es el RELATO legible; si algo aquí contradice la radiografía, manda la radiografía.
> **Antes de "diseñar" o reconstruir cualquier capacidad, MÍRALA AQUÍ: casi todo está ya hecho.**
>
> **🗺️ Mapa vivo interactivo:** panel `/admin` → pestaña **Estructura** (`apps/plataforma/app/admin/MapaArquitectura.tsx`):
> diagrama apps↔módulos, buscador, drill-down por nodo (tablas, APIs, dependencias, clientes en vivo,
> conectar módulos), chat IA, salud, glosario y novedades. **Para sesiones nuevas de Claude** (sin abrir la app):
> lee **`docs/ARQUITECTURA.generated.md`** — el mismo mapa en markdown, regenerado en cada push.

## 0. Resumen de un vistazo  (auditoría 2026-06-25)
- **Verticales (apps/*):** 7 — `plataforma` (matriz), `ia-rest`, `ialimp`, `sivra`, **`rrhh`** (iarrhh), **`transporte`**, **`alquiler`**.
- **Núcleos compartidos (`packages/core-*`):** **10** (antes se listaban 6).
- **Módulos de dominio (`packages/module-*`):** **24** + `legal-templates` (antes se listaban 9).
- **Agentes de IA:** 30+ repartidos por vertical.
- **Estado de los módulos:** **15 de 19 HECHOS y CONSUMIDOS** por ≥1 vertical (con adaptador real).
  `module-flota` YA está cableado en ia-rest (adaptador `flota-adapter.ts` + endpoint aditivo
  `/api/owner/flota/resumen`). Siguen **sin consumo/adaptador**: `module-agenda`, `module-revenue`,
  `module-intercompany` y `module-encargo` (extraídos 25-26/06) — HECHOS como contrato/lógica +
  tests, ése es el cableado pendiente. `module-materiales` ya cubre **alquiler**. `module-encargo`
  es el agregado central que une todos.
- **Pendiente de CABLEADO (el código del núcleo ya existe como módulo):** la **consolidación
  intercompany** en `apps/plataforma` — `@central/module-intercompany` ya implementa la
  eliminación de operaciones entre sociedades; falta la tabla de operaciones + enchufarlo al
  dashboard (hoy el consolidado es **suma simple**). Y la **flota** (`packages/module-flota`):
  falta el adaptador en ia-rest (`vehiculos_grupo`+`evento_transporte`) y la vertical Transporte.
- **BD:** `plataforma`+`ialimp`+`sivra`+`rrhh`+`transporte`+`alquiler` comparten Supabase `wswbehlcuxqxyinousql`
  (schema `public`/`rrhh`); `ia-rest` usa schema `iarest`. (Nota histórica: el proyecto viejo
  `efncqyvhniaxsirhdxaa` es pre-migración; los datos vivos de ia-rest están en `wswbehlcuxqxyinousql`,
  schema `iarest` — confirmado en producción para el tenant Catering JJ.)

---

## 1. Verticales (`apps/*`)

| App | Sector | Qué es | BD | Estado |
|---|---|---|---|---|
| **plataforma** | Casa de marcas | Cuadro de mando consolidado (Cuenta→Sociedad→Negocio) + **god-panel** de operador. | Compartida | Vivo |
| **ia-rest** | Hostelería | Voice POS / TPV para restaurantes, catering y eventos. ~493 endpoints, ~200 tablas. | Propia | Vivo (`iarest.es`) |
| **ialimp** | Limpieza | SaaS multi-tenant de limpieza de pisos turísticos (white-label). | Compartida | Vivo (`app.ialimp.es`) |
| **sivra** | Inmobiliario | Intranet de gestión de pisos turísticos (instancia propia, Sevilla). | Compartida | Vivo |
| **rrhh** | RR.HH. | **iarrhh** — Portal del Empleado multi-tenant (fichas, contratos+firma eIDAS, ausencias, expediente documental). Alta de empresa por operador. | Compartida (schema `rrhh`) | Vivo (`central-rrhh.vercel.app`) |

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
| `core-firma` | Firma electrónica eIDAS Art.26 (puerto + FirmaPropia: hash, evidencia, TSA). | — |
| `core-receipts` | Render de recibos/tickets (HTML/PDF/ESC-POS) con branding + integridad fiscal. | — |
| `core-payments` | Factory Stripe única (versión de API canónica). **ESBOZO** (solo factory). | `stripe` |
| `core-telegram` | Bot Telegram único de la casa (enviar/editar/botones/callbacks/webhook). | — |

---

## 3. Módulos de dominio (`packages/module-*`)

Lógica **pura TS**, agnóstica de BD y de vertical. Patrón común: el dominio se ancla a un
**Encargo** (`parent`/`parentType`) y cada vertical aporta su **adaptador**. Son el andamiaje
para crecer a verticales nuevas (alquiler de materiales, transporte, clínica/citas, venues…).

> **Estado verificado 2026-06-25:** ✅ = HECHO y CONSUMIDO con adaptador real · ⏳ = HECHO
> como contrato/lógica pero SIN consumo todavía (solo cableado pendiente).

| Paquete | Qué hace | ¿Usado hoy? |
|---|---|---|
| `module-contabilidad` | IVA trimestral, PyG, tesorería, rentabilidad, arqueos, recurrentes. | ✅ ia-rest, ialimp, sivra, plataforma |
| `module-concursos` | Agente de licitaciones LCSP: pliego (AiRunner) → ficha + checklist + Go/No-Go + baja temeraria + garantías. | ✅ plataforma |
| `module-crm` | Pipeline comercial genérico (oportunidades/leads) anclado a un Encargo. | ✅ ia-rest (`crm-eventos.ts`), ialimp |
| `module-presupuestos` | Líneas, costes, descuentos y cálculo de margen/rentabilidad. | ✅ ia-rest, ialimp |
| `module-proveedores` | Catálogo de proveedores + servicios subcontratados con comisiones. | ✅ ia-rest, ialimp, sivra |
| `module-materiales` | Materiales/menaje: catálogo, espacios, transferencias, roturas **+ ALQUILER** (tarifa, fianza, daños, reserva anticipada, cliente). | ✅ ia-rest, ialimp, sivra |
| `module-asn` | Aviso de envío/recepción de mercancía con líneas (lote, caducidad). | ✅ ia-rest |
| `module-feedback` | Reseñas/valoraciones + propinas por Encargo o token público. | ✅ ia-rest, ialimp |
| `module-trazabilidad` | APPCC de cocina: puntos de control, 14 alérgenos, muestras testigo, parte automático. | ✅ ia-rest |
| `module-organizador-trabajo` | Orquestación de tareas por carga/caducidad + costeo + predicción de compra. | ✅ ia-rest, ialimp |
| `module-horario` | Control horario legal (RD 8/2019): jornada, descansos, horas extra, cuadrante. | ✅ ia-rest |
| `module-documental` | Expedientes agnósticos (carpetas categorizadas + permisos por actor). | ✅ rrhh, ialimp |
| `module-chat` | Mensajería interna 1-a-1 gestor↔titular (no-leídos, cronológico). | ✅ rrhh |
| `module-rrhh` | Orquestación de firma avanzada OTP (eIDAS) sobre expedientes. | ✅ rrhh, ialimp |
| `module-agenda` | Disponibilidad + reserva de recurso (sala, vehículo, kit, persona) con detección de solapes. | ⏳ HECHO sin consumo → cablear haciendas/flota/kits |
| `module-revenue` | Análisis de demanda (ocupación, estacionalidad, lead time, pickup, pace, KPIs). | ⏳ HECHO sin consumo → falta superficie/BI |
| `module-flota` | Flota/transporte: vehículos, portes, asignación por capacidad/tipo, rentabilidad por porte/vehículo, documental ITV/seguro, intercompany. | ✅ ia-rest (`flota-adapter.ts` + `/api/owner/flota/resumen`) · falta vertical Transporte |
| `module-intercompany` | Consolidación con **eliminación** de operaciones entre sociedades del holding (cocina→tiendas, flota→catering, materiales→eventos) → resultado real del grupo + detalle por sociedad. | ⏳ HECHO+tests sin consumo → cablear dashboard de plataforma |
| `module-encargo` | **Agregado central**: une CRM+presupuestos+agenda+inventario+proveedores+portal+feedback+flota+intercompany bajo una identidad (evento/porte/alquiler/cita) con máquina de estados. | ⏳ HECHO+tests sin consumo → base de las verticales nuevas |
| `module-alquiler` | **Vertical alquiler de materiales/menaje** (interno a eventos del grupo Y a terceros): se compone sobre `module-encargo` + referencia materiales por id. Precio por días, máquina de estados (reservado→entregado→devuelto), recargo por retraso, disponibilidad por solape de fechas, costura intercompany. | ⏳ HECHO+tests sin consumo → base de la vertical Alquiler |
| `legal-templates` | Plantillas legales versionadas (RGPD, confidencialidad, código de conducta) → HTML. | ✅ rrhh |

> **Nota:** 15 de 19 `module-*` están construidos Y consumidos por ≥1 vertical. La modularización
> NO es un diseño pendiente: es realidad. Sin cablear aún: `module-agenda`, `module-revenue`,
> `module-intercompany` y `module-encargo` (`module-flota` ya cableado en ia-rest). Para verticales
> nuevas (alquiler de materiales a terceros, transporte/flota, clínica/citas) ya existe TODO el
> andamiaje, incluido el **agregado central `module-encargo`** que las une; el siguiente paso es
> el cableado (adaptadores + UI) en cada app, que se revisa en preview por tocar runtime vivo.

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
   `module-materiales`, `module-asn`, `module-feedback`. → **Corregido en `estructura.ts`.**
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
