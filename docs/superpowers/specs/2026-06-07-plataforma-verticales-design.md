# Diseño — ia.rest como plataforma de verticales (arquitectura definitiva)

> Fecha: 2026-06-07 · Rama: `claude/store-module-pos-MQUyV` · Estado: spec aprobado para empezar Fase A.
> Este documento es la fuente de verdad de la arquitectura de plataforma. Mantenerlo al día.

## 1. Contexto y giro

La conversación empezó con "¿añadir un TPV de tienda? ¿es solo cambiar la pantalla del rol
camarero?". Explorando el código derivó en algo mayor: **ia.rest ya es de facto una
plataforma** (35+ pantallas, 5 áreas, ~21 módulos, integraciones externas), no una app de
restaurante. Alberto decide formalizarlo: **estructurar el sistema en verticales y módulos
independientes y vendibles**, con los módulos como **conectores** (puertos y adaptadores,
nativos o externos), y **monetización flexible** (suscripción + comisión por uso + à la
carte/puntual — el caso real de Saboga: catering de congreso puntual al 1 %, ya terminado).

**Decisión estratégica:** NO hay clientes activos aún (Saboga fue un encargo puntual
terminado, confirmado en `docs/CONTEXTO-SESIONES.md`). Es la ventana para hacerlo bien.
**Sin parches. Arquitectura definitiva, ejecutada en secuencia segura** — el estado final
correcto migrando por fases, donde cada pieza queda en su forma definitiva al terminarla
(sin provisionales), manteniendo el sistema funcionando. NO big-bang.

Retail/tienda deja de ser "el objetivo" y pasa a ser **el primer vertical NUEVO que estrena
la arquitectura** (el más barato: no necesita tabla de captura propia, le basta `productos`+EAN).

## 2. North star — los 5 planos

```
PLANO 4 — MONETIZACIÓN: suscripción · comisión por uso (Saboga 1%) · à la carte/puntual
PLANO 3 — CONECTORES (adaptadores externos, ya existen de facto):
   Stripe · A3/Sage/Holded · SEPA · AEAT/VeriFactu · Telegram/WhatsApp/Resend ·
   Open Food Facts · Apify · NIM/Claude/Gemini/Groq/Azure · Drive · Hardware Bridge
   (futuro: MCP como un tipo de adaptador)
PLANO 2 — MÓDULOS TRANSVERSALES (vendibles sueltos, cada uno con su contrato):
   Cobro&Pagos · Fiscal/VeriFactu · Almacén&Compras · Contabilidad · RRHH ·
   CRM&Comercial · Marketing&Web · Analytics/BI&Forecaster · Impresión/Hardware
PLANO 1 — VERTICALES (la CAPTURA = "tipo de negocio"), en 2 familias:
   Familia A (transaccional, captura=ticket): Restaurante · Retail/Tienda 🆕 · cafetería · pescadería
   Familia B (proyecto/servicio, captura=orden de trabajo): Catering/Eventos · Field-service
     (fontanería, electricidad, mantenimiento) · Admin. de comunidades
        └── todas producen ▼
PLANO 0 — NÚCLEO DE PLATAFORMA (invariante):
   Identidad (cuentas→locales→usuarios/roles, multi-tenant) ·
   VENTA genérica (comandas→"venta") + PROYECTO genérico (eventos→"proyecto") = hubs ·
   Motor de módulos + Motor de verticales (tipo_negocio + presets)
```

Hallazgo del inventario: casi todo ya es **85–95 % independiente** por dentro; están
entrelazados en la UI de `/owner` y el flujo de restaurante pero son separables. Por tanto
"segmentar lo que tenemos" es sobre todo **formalizar fronteras**, no reescribir.

## 3. Dos familias de verticales

- **A — Transaccional (venta instantánea)**: captura = TICKET. Restaurante, retail, cafetería,
  pescadería. "Pido/escaneo y cobro ya".
- **B — Proyecto/servicio (venta diferida)**: captura = ORDEN DE TRABAJO / PRESUPUESTO.
  Catering/eventos, field-service (fontanería, electricidad, climatización, reformas),
  admin. de comunidades. "Presupuesto → ejecución → materiales+horas → factura". El módulo
  **eventos ya es el prototipo del ~70 %** de esta familia (presupuestos, costes, personal,
  portal cliente, galería, briefings). Nuevo de field-service: agenda/scheduling, parte de
  trabajo móvil (firma/fotos in situ), horas de mano de obra facturables.
- Ambas familias **convergen en el mismo núcleo** (venta/proyecto→cobro→factura→stock→CRM→RRHH).

## 4. Abstracciones núcleo (estado final)

### Venta genérica (hub Familia A)
- Entidad canónica **"venta"** (no "comanda", jerga hostelera). **No se renombra físicamente
  `comandas`** (refactor masivo y peligroso: KDS, courier, factura, caja, RLS, triggers,
  realtime). Patrón propio del proyecto **tabla real + vista** (precedente `personal→camareros`):
  tabla física `comandas` intacta; **vista `ventas`** para código nuevo y UI.
- `comandas.tipo` (`'sala'|'evento'|'tienda'|…`) discrimina la captura.
- El núcleo fiscal cuelga de `comanda_id` (verificado en `src/app/api/factura/cerrar/route.ts`):
  cierre, VeriFactu (hash encadenado serie 'T'), `pagos`, `registrar_cobro_caja`, ticket
  (`crearPrintJobCuenta`). Reutilizable tal cual → no se duplica lógica fiscal (clave legal:
  cadena de huellas única por local).

### Proyecto genérico (hub Familia B)
- Entidad canónica **"proyecto"** con `proyecto.tipo` (`evento|instalacion|mantenimiento|reforma`).
  Tabla física `eventos` intacta, expuesta como vista `proyectos` cuando se promueva a uso
  compartido. `personal_evento_asignacion` → `personal_proyecto_asignacion` al promoverse.

### Motor de verticales (tipo de negocio)
- `locales.tipo_negocio` (`'restaurante'|'catering'|'salon'|'retail'|'mixto'|…`), default
  `'restaurante'`. NO se usa en auth/RLS — solo preset y adaptación de UI.
- `src/lib/negocio.ts` (nuevo): `PRESETS_NEGOCIO` (bundle de `modulos_activos` por vertical)
  + `LABELS` (terminología por vertical). Cambiar `tipo_negocio` aplica el preset sin pisar
  ajustes manuales. Navegación condicional por `useModulo(...)`.

### Contrato de conexión — las 4 costuras
| Costura | Qué expone el núcleo | Quién consume |
|---|---|---|
| Identidad | `cuenta_id` · `local_id` · `rol` | todos |
| Venta/Proyecto | eventos `venta.creada`/`venta.cerrada` (bus) | cobro, fiscal, almacén, BI |
| Catálogo | `productos` (+EAN, formatos) | verticales, almacén, web |
| Dominio | `cobro.hecho` · `stock.movido` · `factura.emitida` | contabilidad, BI, conectores |

### Patrón módulo-conector (puertos & adaptadores)
Cada capacidad transversal define un **puerto** (interfaz TS). Implementaciones = **adaptadores**
nativos o externos. Ya existe de facto: contabilidad exporta A3/Sage/Holded; cobros usan Stripe
Connect. MCP = un tipo de adaptador.

## 5. Fundamentos (diseñar ahora = barato; retrofitear = caro)

1. **Bus de eventos de dominio (outbox)** — INNEGOCIABLE. El núcleo emite eventos; los módulos
   reaccionan en vez de llamarse entre sí. Esqueleto real del desacople.
2. **Integración externa**: API pública versionada (#12) + **ia.rest como servidor MCP** (operar
   la plataforma en lenguaje natural).
3. **Entitlements (contratación)** — separa "qué ha contratado/pagado" de "qué puede
   técnicamente" (hoy mezclado en `modulos_activos`). Cimiento del Plano 4 (à la carte/comisión).
4. **Tests de contrato** entre módulos.
5. **Resiliencia offline (afecta al núcleo)** — el TPV debe vender sin internet (mercado,
   pico de Navidad). Captura de venta persistida local + sincronización. Se diseña desde Fase A.
6. **RBAC con ámbito** — roles con alcance por nodo/local (grupo ≠ franquiciado ≠ producción).
7. **Motor de precios/promociones** — precio por peso, precio del día, packs, ofertas.
8. **Fiscal como conector por jurisdicción** — VeriFactu = adaptador España.

## 6. Multi-marca (casa de marcas)

Marca paraguas (plataforma) + cada vertical con su sub-marca (nombre, logo, dominio, landing,
pricing). **Una sola base de código con theming por marca** (no despliegues separados). Cabalga
sobre el motor de verticales. Infra reutilizable: plantillas `/r/[slug]`, MiWeb, slugs `/propuesta`.
**Naming de la matriz: POSPUESTO.** Candidatos: `ia.OS` (recom., "sistema operativo del
negocio"), `Vendia`, `Comercia`. `ia.rest` pasará a ser la sub-marca del vertical restaurante;
sub-marcas: ia.rest, ia.shop, ia.fresh, ia.cater, ia.pro (field-service)…

## 7. Tenancy de grupo y nodos (franquicia / multi-local)

Jerarquía: **Organización (grupo/franquicia = `cuenta`) → [marca] → Nodos → vertical por local**.
Tipos de nodo: **punto de venta** (cada uno con su `tipo_negocio`), **almacén central** (ya
existe: `stock_central`, `/almacen-central`, `transferencias_stock`) y **nodo de producción/
fábrica** (NUEVO: obrador que transforma ingredientes→producto y reparte). Un grupo puede
mezclar verticales. Consolidado de grupo ya existe (`v_*_grupo`). Movimiento de stock
**transformación** (A→B: harina→pan, merluza→lomos) común a despiece (retail fresco) y a
producción central.

## 8. Gobernanza de nomenclatura (CRÍTICO)

Regla de oro: **nombre canónico interno (neutro, estable) ≠ etiqueta que ve el usuario (por
vertical)**. La jerga vive solo en `LABELS` (`src/lib/negocio.ts`); un único glosario canónico
manda.

**Principio (tras auditoría completa): neutralizar SOLO el núcleo compartido; la jerga es
legítima DENTRO de su vertical.** `mesa`, `camarero`, `cocina`, `kds`, `comanda`(label),
`/edge`, `running` → correctos en *restaurante*. `evento`, `BEO`, `pase`, `menaje` → correctos
en *catering*. NO se renombran. Esto evita el refactor de ~250 archivos que sugerían las
auditorías; el alcance real es un núcleo pequeño y acotado.

**Regla de PROMOCIÓN:** un nombre con jerga se neutraliza SOLO cuando se promueve de un vertical
a uso compartido (ej. `personal_evento_asignacion` → `personal_proyecto_asignacion` al reusarse
para staffing de comunidades/field-service).

| Canónico (núcleo) | Tabla física (no romper) | Vista neutra | Etiquetas por vertical |
|---|---|---|---|
| `venta` (+items) | `comandas`/`comanda_items` | `ventas` | ticket·comanda·pedido |
| `proyecto` (+tareas) | `eventos`/`evento_*` | `proyectos` | evento·instalación·parte·obra |
| tenant | `locales` (rename de `restaurantes`) | — | restaurante·tienda·obrador |

### Decisión — `restaurante_id → local_id` (rename físico definitivo)
Aprovechando que NO hay clientes. Canónico **`local_id`** (el establecimiento), distinto de
**`cuenta_id`** (negocio/grupo). Migración: DO-block que renombra la columna en TODAS las tablas
+ constraints/índices/FKs; RLS `app.restaurante_id`→`app.local_id` (~40 políticas) + función
`get_tenant_id()`; TS `getRestauranteId()`→`getLocalId()`, `ApiSession.restaurante_id`→`local_id`,
header `x-ia-restaurante-id`→`x-ia-local-id` (~176 refs). Es el refactor más grande → su propia
sub-fase con verificación exhaustiva (`tsc`, `next build`, RLS multi-tenant con 2 locales). Va en
Fase A. (También se renombra la tabla `restaurantes`→`locales` con vista compat `restaurantes`.)

## 9. Cimientos transversales (disciplina, no features)

1. **Red de seguridad de tests ANTES de los refactors grandes** (4 costuras + flujo
   venta→cobro→factura→stock). Hoy solo `tsc`+`next build`+manual.
2. **Actualizar memoria/docs en cada fase** (`ia-rest-maestro` skill + `CONTEXTO-SESIONES.md`):
   entorno efímero, si no se commitea se pierde.
3. **Scaffolding de vertical** (Fase D/E): plantilla "nuevo vertical" (captura+preset+labels).
Anotado (futuro, no fundamento): i18n, importación de datos al onboarding, RGPD/DPIA + rotación claves.

## 10. Fases (secuencia segura, cada una aterriza definitiva)

- **A — Núcleo**: red de tests mínima → **rename `restaurante_id→local_id`** → vista `ventas` +
  `comandas.tipo` → motor de módulos+verticales (`negocio.ts`) → **bus de eventos (outbox)** →
  **captura offline-tolerante** → contratos de las 4 costuras.
- **B — Restaurante + organización**: trazar la línea captura↔venta; tenancy `cuenta→nodo→local`
  + **RBAC con ámbito**.
- **C — Retail + Mariscos (cliente inminente)**: vertical retail (EAN, `/tienda`, stock) + peso
  en línea de venta + etiquetado en venta + transformación/despiece + trazabilidad + storefront
  online/recogida. (Detalle en §11.)
- **D — Módulos como conectores**: puertos+adaptadores (empezar Contabilidad/Cobro) + entitlements
  + motor de precios/promos + fiscal por país + scaffolding de vertical.
- **E — Catering + Franquicia**: eventos como vertical formal (`proyecto`) + nodo de producción
  central + grupo mixto + familia field-service/comunidades.
- **F — Plataforma**: multi-marca + API pública + servidor MCP + monetización.

> Tras cada fase: `npx tsc --noEmit` limpio + `next build` OK + verificación funcional +
> actualizar maestro/CONTEXTO-SESIONES.

## 11. Detalle Fase C — Vertical Retail (TPV tienda)

La venta de tienda es una `venta`/comanda con `tipo='tienda'`, `mesa_id=null`, nace `'nueva'` y
cierra `'cerrada'` en el mismo acto (no pasa por KDS). Reutiliza cobro/VeriFactu/caja/ticket sin
tocarlos (precedente sin mesa: `storefront/pedido-operador`; `cerrar` ya hace `if (comanda.mesa_id)`).

**CORRECCIÓN tras leer el esquema REAL del remoto (07/06):** `productos` YA tiene
`ean_codigo` (código de barras), `venta_por_peso`, `precio_por_kg` y stock directo
(`stock_actual`, `stock_minimo`, `unidad_stock`, `modo_reposicion`). Y `comandas` YA tiene
columna `tipo` (texto libre, SIN CHECK). Las exploraciones previas (basadas en migraciones
del repo) no las vieron porque viven solo en el remoto. → Retail necesita MUCHO menos.

Migración `supabase/migrations/20260607_modulo_tienda.sql` (idempotente, español) — APLICADA:
- `productos.es_tienda BOOLEAN default false` (para `modo_catalogo='separado'`).
- Índice `idx_productos_ean` sobre `(restaurante_id, ean_codigo)` (NO único: puede haber EAN
  repetidos hoy). Se reutiliza `ean_codigo` existente como código de barras.
- `config_tienda` (1/local, RLS): `modo_catalogo`(`mismo|separado`), `barcode_activo`,
  `barcode_modo`(`usb|camara|ambos`), `bascula_activa`, `solo_tactil`, `descontar_stock`.
- **SIN trigger**: el descuento de stock en venta se hace en CÓDIGO (`/api/tienda/venta`,
  decrementa `productos.stock_actual`), NO en trigger sobre `comanda_items` (hot-path de TODO
  el sistema → riesgo alto). La venta de tienda usa `comandas.tipo='tienda'` (ya existe).

Rol+pantalla: rol `tienda` en `useAuth.ts`, `login/page.tsx`, `RRHHTab.tsx`, `help-prompts.ts`.
`src/app/tienda/page.tsx` (`useAuth(['tienda'])`): buscador+grid+carrito; input enfocado capta
lector USB; cámara opcional (`BarcodeDetector`, ya en `SmartScanModal.tsx`); báscula si
`bascula_activa`; cobro reutiliza `CobrarSheet`; ticket vía `crearPrintJobCuenta`.

Backend nuevo: `POST /api/tienda/venta`, `GET /api/tienda/buscar?ean=|q=`, `GET/PUT /api/tienda/config`.
Reutilizar `POST /api/factura/cerrar`, `CobrarSheet`, `GET /api/owner/ean-lookup`. Config en
`/owner`: `TiendaTab.tsx` + extender `carta/route.ts`. `'tienda'` en `TODOS_MODULOS`.

Caso **Mariscos González** (pescadería con manipulación): composición = Retail + Peso v1.0 +
Etiquetado + Transformación(despiece) + Trazabilidad GS1/pesquera + Storefront(online+recogida) +
Cobro/VeriFactu. Casi todo ya existe; delta: peso en línea de venta, movimiento de transformación,
campos de trazabilidad pesquera.

## 12. Riesgos y guardarraíles

- **No big-bang**: sistema funcionando siempre; cada fase verificada antes de seguir.
- **No renombrar `comandas`/`eventos` físicamente**: usar vistas `ventas`/`proyectos`.
- **No romper la cadena VeriFactu**: una sola numeración encadenada por local; todas las ventas en serie 'T'.
- **Aislamiento**: `comandas.tipo` + filtros para que tienda no aparezca en plano de sala ni KDS.
- **Multi-tenant**: todo filtra `local_id`; tablas nuevas con RLS.
- **Pre-push**: `npx tsc --noEmit` 0 errores + `next build`.

## 13. Verificación end-to-end

- Cada fase: `tsc` + `next build` + flujo funcional sin regresiones + tests de costuras.
- Rename `local_id`: RLS multi-tenant con 2 locales, sin fugas entre inquilinos.
- Fase C: login rol `tienda` → escanear/buscar → carrito → `CobrarSheet` → factura VeriFactu
  serie 'T' (cadena íntegra mezclando sala+tienda) → ticket → stock descontado (`stock_articulos`
  + `stock_movimientos`, sin doble descuento) → caja efectivo en `movimientos_caja`.

## 14. Casos reales validados (la tesis)

Restaurante · catering · retail · pescadería con manipulación (Mariscos) · franquicia de
panadería con obrador central · grupo mixto cafeterías+panaderías · fontanería · electricista ·
admin. de comunidades con mantenimiento + socorristas estacionales. **Todos encajan**: el núcleo
es universal; solo cambia la captura. Probar más casos confirma, no altera el diseño.

## 15. Unificación "casa de marcas" (ia.rest · SIVRA · IALIMP) — plan refinado

> Añadido 2026-06-08. Doc de entrada: `docs/HANDOFF-unificacion-casa-marcas.md` (detalle completo,
> auditoría y guardarraíles). **Estado: PLAN REFINADO, pendiente de OK para ejecutar.** Nota: el
> prompt de arranque hablaba de "§16"; ese número venía de un draft perdido (efímero, nunca
> commiteado) — esta es la sección real (§15).

**Alcance:** no es la verticalización *interna* de ia.rest (§1–14), sino **unir 3 apps de Alberto
en 2 clústeres / 2 BBDD** en una plataforma común vía **monorepo de paquetes `core-*`**, sin fusionar
apps ni converger BBDD de entrada. ia.rest (`efncqyvhniaxsirhdxaa`, POS, sin clientes) · SIVRA
(`wswbehlcuxqxyinousql`, intranet pisos, NextAuth v5, single-tenant) · IALIMP (misma BD que SIVRA,
SaaS limpieza, JWT propio, `empresa_id`, **prod con cliente real → intocable**).

**Decisiones (Alberto):** (1) **monorepo único turborepo/pnpm** — pero con un proyecto Vercel por
app + builds ignorados por path + subtree con historial + **IALIMP migrado el último**, su `main`=prod
y BD intactos; (2) primer paquete piloto **`core-ai`** (el más completo/canónico).

**Árbol `core-*` (auditado):**
- EXTRAER bajo riesgo: `core-ai` (semilla ia.rest), `core-fiscal` (verifactu ia.rest + validadores
  IALIMP, puro sin BD), `core-ui/brand` (white-label IALIMP + labels `negocio.ts`), `core-rgpd`
  (consent IALIMP, responsable configurable).
- EXTRAER valor alto: `core-reservas` (iCal SSRF-safe + Smoobu; **net-new para ia.rest**), `core-ocr`.
- DIFERIR: `core-cobro` (ia.rest ya completo), `core-crm` (el de IALIMP es global de superadmin).
- DESCARTAR: `core-auth` (3 modelos incompatibles → paquetes **identity-agnostic**), `core-pricing`
  unificado (3 dominios distintos; en su día `core-pricing-str` aparte).
- **BD**: ningún `core-*` ejecuta DDL ni toca RLS/buckets/GRANTs de la BD compartida.

**5 fases** (cada una ia.rest → SIVRA → IALIMP-último, tras preview verde): **0** andamiaje
(turborepo+subtree+CI+Vercel-por-app, cero runtime) · **1** núcleo puro (`core-ai`+`core-fiscal`) ·
**2** marca+cumplimiento (`core-ui/brand`+`core-rgpd`) · **3** reservas STR + OCR · **4** cobro+CRM+
entitlements (planificar, no ejecutar, convergencia de datos) · **5** plataforma (naming matriz,
identidad/SSO, API+MCP, monetización; convergencia BBDD solo si se justifica).

**Guardarraíles:** IALIMP prod intocable (BD/RLS/buckets/`empresa_id`=frontera RGPD); no big-bang;
`properties`≠`propiedades`; pre-push `tsc`+`next build`; auth no se comparte.
