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
  - **B tiene dos capturas según peso**: *cita/agenda* (ligera: terapia, peluquería, consulta →
    `reservas` generalizado, vertical Citas §12) y *proyecto* (pesada: catering, reforma →
    motor `eventos`). El bloque eventos+CRM es ya el motor genérico de B (~95 % reutilizable).
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
- **E — Catering + Franquicia + Servicios**: eventos como vertical formal (`proyecto`) + nodo de
  producción central + grupo mixto + familia field-service/comunidades + **vertical Citas** (§12:
  `reservas` generalizado a recurso/profesional; bot de calendario en F).
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

## 12. Vertical Citas/Servicios (Familia B — servicio agendado) 🆕

Origen: caso real (terapeuta / clínica con varios profesionales) que quiere "un bot que le
genere su calendario". Encaja como vertical NUEVO de Familia B **sin reescribir**: el núcleo
(cobro, factura/VeriFactu, CRM, portal cliente, valoración) ya sirve; solo cambia la captura.

### La captura = hueco de agenda (generalizar `reservas`)
Familia B tiene **dos capturas** según el peso del trabajo:
- **Cita/agenda (ligera)** — sesión corta con un profesional (terapia, peluquería, fisio,
  consulta). Captura = `reservas` **generalizado**.
- **Proyecto (pesada)** — trabajo que se construye en el tiempo (catering, reforma,
  instalación). Captura = `eventos` (motor proyecto, §4).

Una clínica usa sobre todo la ligera; puede subir a proyecto si vende paquetes/programas.

`reservas` HOY está atada a `mesa_id` (jerga restaurante) → se **generaliza** (beneficia
también a restaurante, precedente `personal→camareros`):
- `mesa_id` → `recurso_id` (la mesa es UN tipo de recurso; en clínica el profesional/box).
- `+ servicio_id` (qué se reserva: cada servicio con su duración/precio; `duracion_min` ya existe).
- `+ recurso.tipo` (`mesa|profesional|box|sala`). **Multi-terapeuta = varios recursos** (igual
  que varias mesas en un restaurante).
- `canal` ya contempla orígenes externos (`thefork|covermanager|web`) → **el bot de calendario
  entra como un `canal` más** que crea filas en `reservas`. Cero lógica nueva de cobro/ficha.
- La etiqueta "mesa" vive solo en el vertical restaurante (`LABELS`); un Centro ve "Agenda/Profesional".

### El bot de calendario (lo ÚNICO net-new)
- Ofrece huecos libres según disponibilidad del recurso (`reservas` + `duracion_min` + horario
  del profesional), confirma y agenda. Recordatorio/no-show: el cron `reservas-noshow` ya existe.
- Sobre el booking online (el preset incluye `storefront`). Adaptador de canal
  (Telegram/WhatsApp/web) reutilizando la infra de webhooks existente.

### Reutilización del bloque catering/comercial (cross-sector) — análisis del código
El subsistema **eventos + CRM** es de facto el motor genérico de Familia B (~95 % reutilizable).
Mapa (verificado en rutas/tablas reales):

**Reutilizable tal cual (motor proyecto/servicio + captación):**
- *Proyecto*: `eventos`, `evento_briefing` (descubrimiento), `presupuestos_evento` (con
  margen/rentabilidad), `evento_checklist_item` (tareas), `personal_evento_asignacion` (asignar
  profesional + estado de pago), `evento_galeria`, `evento_valoracion` (NPS), `evento_contratos`,
  `plantillas_evento`, `espacios_evento` (consultorios/salas), `comercial_agenda` (seguimiento).
  Rutas `/api/owner/eventos/{presupuesto,briefings,checklist,personal-asignacion,galeria,
  valoraciones,contratos,plantillas,agenda}`.
- *CRM/captación*: `leads` (+`estado_pipeline`, `propuesta_slug`, `mrr_estimado`),
  `leads_contactos` (multi-decisor), `leads_comunicacion` (histórico), propuestas dinámicas
  `/propuesta/[slug]` (sin precio), crons `pipeline-comercial`, `lead-hunter`, `crm-recordatorios`.
  El pipeline kanban + propuesta-vista + recordatorios sirve para captar pacientes/clientes igual
  que eventos.

**Jerga catering — NO se reutiliza (se queda en el vertical catering):** BEO,
menaje (`inventario_menaje`), barra libre/tiers, pases, APPCC, transporte/vehículos. Si otro
vertical necesita inventario de recursos, se **promueve** a una tabla neutra (`inventario_recurso`)
— regla de PROMOCIÓN (§8), no antes.

**A generalizar SOLO al promoverse:** `eventos`→vista `proyectos`, `personal_evento_asignacion`→
`personal_proyecto_asignacion`, métrica `aforo`→neutra (tamaño/usuarios). Mientras viva solo en
catering, su nombre está bien.

### Preset y fase
- `tipo_negocio='citas'` **ya declarado** en `src/lib/negocio.ts` (preset: `reservas` +
  `storefront` + `fichajes`/`rrhh` + cobro/factura/contabilidad/analytics del núcleo; labels
  Centro/Cita/Profesional/Agenda/Servicios).
- Construcción: la generalización de `reservas` (captura ligera) va con la **abstracción de
  captura de Fase A/B**; el motor proyecto se formaliza en **Fase E**; el bot de booking en
  **Fase F** (canal/integración). Esfuerzo real bajo-medio: casi todo ya existe.

## 13. Riesgos y guardarraíles

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
admin. de comunidades con mantenimiento + socorristas estacionales · **clínica/terapeuta con
varios profesionales** (vertical Citas, §12: captura ligera = `reservas` generalizado + bot de
calendario). **Todos encajan**: el núcleo es universal; solo cambia la captura. Probar más casos
confirma, no altera el diseño.

## 16. Unificación "casa de marcas" — ia.rest + SIVRA + IALIMP 🆕

Inventario real de los desarrollos de Alberto (08/06): **no son 3 apps sueltas para fusionar en
una, son DOS clústeres sobre DOS bases de datos**.

- **Clúster POS/Comercio** (Supabase `efncqyvhniaxsirhdxaa`): **ia.rest** — la plataforma de este
  spec. **Sin clientes** (ventana libre para refactors).
- **Clúster Turismo/Limpieza** (Supabase `wswbehlcuxqxyinousql`, compartida):
  - **SIVRA** (`roi-intranet`): intranet interna de gestión de pisos turísticos en Sevilla del
    propio Alberto (ingresos/gastos/ROI, pricing dinámico, mensajería huéspedes+IA, coordinación
    de limpiadoras). Mono-usuario/interno. NextAuth v5 + Prisma (solo 5/90 tablas tipadas).
  - **IALIMP**: SaaS multi-empresa de gestión de limpiezas (spin-off del módulo limpiadoras de
    SIVRA). **Cliente real en producción** (Sique Brilla SL) → `main` = prod inmediato. JWT propio
    (jose+bcrypt), tenancy `empresa_id`, white-label por login.

**Reencuadre clave:** SIVRA + IALIMP **son** el vertical "**gestión de alojamiento turístico**"
ya construido y repartido en dos apps (SIVRA = lado gestor/propietario; IALIMP = lado operativo
limpieza, Familia B servicio agendado). La captura `cleaning_session` valida al milímetro la
"cita/agenda ligera" (§12) y `parte_trabajo` el "parte de trabajo facturable" de field-service (§3).

### Mapa de módulos (qué es cada pieza en la plataforma)
| Pieza | Origen | En la plataforma | Acción |
|---|---|---|---|
| `cleaning_session` + app limpiadora `/l` | IALIMP | Vertical Familia B (servicio agendado) | captura = `reservas` generalizado (recurso=limpiadora) |
| Pricing dinámico (A/B, snapshots) | SIVRA | Módulo: motor de precios | = fundamento #7, ya implementado |
| Intel de mercado (scraping + Serper) | SIVRA | Módulo: market-intel | dedup con lead-hunter/Apify de ia.rest |
| Gastos por visión IA | SIVRA | Módulo: OCR documentos | dedup con Recepción v2 (albarán) de ia.rest |
| Mensajería huésped + auto-reply IA | SIVRA | Módulo: agente conversacional cliente | net-new al núcleo |
| Smoobu / iCal sync | SIVRA+IALIMP | Conector PMS (adaptador) | reutilizable en Citas y alojamiento |
| White-label por login (`--brand-*` en BD) | IALIMP | Núcleo: theming casa de marcas | **resuelve la §6**, ia.rest lo tenía a medias |
| RGPD granular + evidencia (`cliente_consentimientos`) | IALIMP | Núcleo: cumplimiento | resuelve pendiente crítico de ia.rest |
| Auto-asignación con scoring + crons | IALIMP | Módulo: staffing | = "staffing estacional" anotado para comunidades |
| Sesión única (`session_jti`, anti-compartir) | IALIMP | Núcleo: seguridad sesión | mejora transversal |
| VeriFactu | ia.rest + IALIMP | Núcleo: fiscal | **2 implementaciones → consolidar a 1** |

**Hallazgo importante (bidireccional):** no es "los otros reusan ia.rest". IALIMP/SIVRA ya
**resuelven piezas pendientes de ia.rest** (white-label por login, RGPD con evidencia, staffing
con scoring, pricing dinámico). Al unificar, esas suben al núcleo. Los tres usan **NVIDIA NIM**
(IA ya alineada).

### Las costuras (el coste real de unificar)
| | ia.rest | SIVRA | IALIMP |
|---|---|---|---|
| Auth | sesión HMAC | NextAuth v5 | JWT propio (jose) |
| BD | `efncqyvhniaxsirhdxaa` | `wswbehlcuxqxyinousql` | misma que SIVRA |
| Tenancy | `cuenta`→`local` | mono-usuario | `empresa_id` |
| ORM | SQL directo | Prisma (5/90) + SQL crudo | Prisma + SQL crudo |
| Cliente prod | ninguno | interno | **Sique Brilla (main=prod)** |

Tres sistemas de auth y una BD compartida con un cliente vivo = ese es el trabajo, no la lógica.

### TARGET (decisión de arquitectura)
**No fusionar apps ni converger BBDD de entrada.** Extraer el **núcleo a una capa compartida
(monorepo de paquetes `core`)** que las 3 apps consuman; cada app mantiene su BD/runtime/auth;
la convergencia de datos/tenancy/auth se hace **después, por fases, sin tocar lo que factura**
(IALIMP prod intocable). 80% del valor (dejar de mantener fiscal/OCR/precios/white-label por
triplicado) con 20% del riesgo.

Árbol de paquetes propuesto: `core-fiscal` (VeriFactu) · `core-cobro` (Stripe Connect) ·
`core-reservas` (captura agendada generalizada recurso/servicio) · `core-crm` (leads+pipeline+
propuestas) · `core-ai` (cliente NIM) · `core-ocr` (visión facturas/albaranes) · `core-pricing` ·
`core-ui`/`core-brand` (white-label por login) · `core-rgpd`. Cada app = capa fina (su captura +
su auth + su BD) sobre esos paquetes.

### Fases (secuencia segura, IALIMP prod protegido)
1. **Monorepo + extracción no-disruptiva**: mover a `core-*` lo que NO toca runtime/BD de IALIMP
   (UI/brand, AI/NIM, utilidades). Cada app sigue desplegando igual. Riesgo casi nulo.
2. **Consolidar duplicados** de lógica pura: 1 sola VeriFactu, 1 OCR, 1 motor de precios, 1
   intel/scraping. Verificar contra prod de IALIMP antes de cada corte.
3. **Promover net-new al núcleo**: white-label por login (→ §6), RGPD con evidencia, staffing
   scoring, conector Smoobu/PMS.
4. **Reconciliar auth y tenancy** (lo más caro): unificar a un modelo (`cuenta`→`local`/`empresa`
   como el mismo concepto) y un auth. Solo cuando 1-3 estén estables.
5. **Convergencia de BBDD** (opcional, lo último): solo si compensa; mientras, dos instancias.

### Decisiones abiertas
- Nombre de la matriz (§6, pospuesto). Sub-marcas: ia.rest · ia.limp · (turismo: ¿ia.stay?).
- ¿El `core` nace de ia.rest, o extracción neutra de los tres? (recomendado: neutra, pero
  sembrada con el núcleo más maduro = ia.rest para fiscal/cobro/almacén, IALIMP para brand/RGPD).
- Momento de converger BBDD/auth (fase 4-5): no urge.
