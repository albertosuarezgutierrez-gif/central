# Módulo Almacén (Joaquín Jaén — catering) — Reunión 14/07/2026 + Auditoría del código

> **Qué es esto.** Alberto tuvo una reunión de ~2 h con **Joaquín** (dueño de un grupo de
> catering/eventos en Sevilla) para arrancar el **primer módulo de su software: el ALMACÉN**.
> La grabación está en Drive (`Jj 1 almacen_original.txt`). Este documento tiene tres partes:
> **(1)** resumen estructurado de lo que se habló, **(2)** auditoría de lo que YA existe en el
> monorepo que sirve para esto, y **(3)** el cruce requisito↔código con los gaps y una propuesta
> de Fase 1. Fecha: 2026-07-14.
>
> ⚠️ **Fiabilidad de la fuente.** La transcripción es automática y de **mala calidad** (audio
> ruidoso, palabras pegadas/mal transcritas, sin acentos). Los primeros ~70 min son charla
> informal; **el diseño del almacén se concentra de 01:10 a 02:05**. Todo lo marcado abajo es
> interpretación de un audio ruidoso; las citas están reconstruidas. Confírmese con Joaquín
> antes de tomarlo como alcance cerrado.

---

## PARTE 1 — Resumen de la reunión

### 1.1 Contexto del negocio de Joaquín

**Negocio principal:** **catering y eventos** en Sevilla — bodas, comuniones, graduaciones,
corporativos, ferias — y **catering para rodajes** de cine/publicidad (menciona ~3 productoras
rodando en Sevilla, ~8.000 €/semana cada una). Alrededor hay un **grupo/holding** con varias ramas
que comparten material e infraestructura:

- **Catering** (el foco de esta reunión).
- **Asador / "el asado"** — restaurante que describe como el negocio "cuadrado y controlado".
- **"El Triunfo"** — hacienda/finca de eventos (venue); en el software lo modela como un **cliente**
  al que se le factura alquiler de material.
- **Transporte** (camiones; quiere diversificar a transporte nacional).
- **Alquiler de material** — empresa que alquila nave + material al resto del grupo (**intercompany**)
  y también a terceros.
- **Inmobiliaria / pisos turísticos**, piscina, correduría de seguros, etc.

**Tamaño (cifras suyas, poco fiables por la transcripción):** facturación del entorno de **4–7 M€/año**;
**~14 personas fijas** en la nave (núcleo, llegó a tener ~30); SS ~30.000 €/mes; nóminas fijas
~70–80.000 €. Organigrama citado: comerciales (María, Lorena, Sandra…), contable (Antonio/Jesús),
tesorera (Cristina), dirección (Raquel/Rebeca), operarios y **metres (maîtres)** que dirigen el evento
in situ, su hermana Carmen en gestión.

### 1.2 Dolores actuales (por qué quiere el módulo)

- **Todo manual, sin sistema.** Hoy **los pedidos los hace él mismo**; control por WhatsApp, fotos,
  papel y boli y su memoria. *[01:55]* *"con un boli y una libreta… ahora incluso con fotografías"*.
- **Cero trazabilidad del material:** no sabe cuánto tiene, cuánto sale, cuánto vuelve, qué se rompe o
  pierde. *[01:47]* *"le hice el vídeo y había 300 sillas, y al llegar había 298"*.
- **Nadie es responsable:** cuando falta/rompe algo no se sabe de quién es la culpa.
- **Estacionalidad = su problema nº1** *(declarado)* *[01:10]* *"el problema es la fluctuación… la
  temporada de trabajo"*. No sabe planificar personal ni compras contra la demanda.
- **Sin datos para decidir:** no puede calcular coste/rentabilidad por evento ni consumo de bebida por
  persona. Operación casi 24 h en picos, personal poco cualificado y con barrera de idioma.

### 1.3 Requisitos funcionales del módulo (estructurado)

> Concepto central *[01:14]*: *"metemos un inventario… una relación de todos nuestros artículos. Y
> cuando tenga una película, un evento o un alquiler a la calle, yo hablo aquí… siempre tengo que
> tener un stock."*

| # | Requisito | Detalle / cita |
|---|-----------|----------------|
| R1 | **Maestro de artículos por FAMILIAS** | mobiliario, cristalería, cubertería, mantelería, maquinaria, aperitivo, banquete, barra libre, bebida. Carga desde portátil/tablet. *[01:41]* "familia por familia". |
| R2 | **Dos clases de artículo** | (a) **Material reutilizable** (mesas, sillas de resina…) controlado por cantidad; (b) **Maquinaria con "matrícula"** (freidoras, hornos, vitrinas, A/A) = activo individual con nº serie, valor, consumo y **mantenimiento**. *[01:16]* "la freidora vale 10.000 € y tiene su matrícula". |
| R3 | **Stock / existencias** | cuántas unidades hay y cuántas quedan tras cada evento. **Umbral ~5 €**: se controla unitariamente lo que supera 5 € (una copa no, una botella sí). *[01:30]* |
| R4 | **Entradas/salidas (movimientos)** — núcleo | cada evento = **SALIDA**; devolución = **ENTRADA**. *[01:46]* "igual que salió, tiene que entrar". Verificación en ambos extremos; devoluciones parciales de bebida se registran. |
| R5 | **Plantillas de material por tipo de evento** | precargan todo el material para que **no se olvide nada**; editables por evento. Selector **boda / corporativo / feria / alquiler**. *[01:22]* |
| R6 | **Ubicaciones físicas** | almacén en **nave**; **muelles de carga numerados** (4 muelles pintados en el suelo); **depósitos/sucursales** con traslados entre ellos (intercompany). *[01:26]*, *[01:38]* |
| R7 | **Proveedores y pedidos de compra** | "almacén de pedidos"; hoy los hace él. Fichas de producto con **foto y CADUCIDAD**; posible **portal donde el proveedor sube su catálogo** ("modelo Mercadona"). *[01:34]*, *[01:57]* → **Fase posterior**. |
| R8 | **Caducidades** | mercancía perecedera (comida/bebida) ligada a la ficha de producto. *[01:58]* |
| R9 | **Inventarios / recuentos** | **inventario inicial "gordo"** (~95%) como primer paso; luego **recuentos semanales por familia** (los jueves, ~6 h una persona); **bajas** a fin de año; **inventario de bebida mensual** para valorar consumo (inicial vs final → €/persona). *[01:41]*, *[01:52]* |
| R10 | **Mantenimiento de maquinaria** | preventivo+correctivo por máquina; fichas de repuestos; **QR** solo en maquinaria de valor. *[01:38]* → **Fase posterior**. |
| R11 | **Trazabilidad con evidencia** | **fotos y vídeo** en salida/entrada como prueba; firma del responsable. *[01:30]*, *[01:47]* |
| R12 | **Doble uso del material** | (a) alquiler a **terceros** (ingreso real) y (b) uso **interno** para eventos propios → **intercompany** (la empresa de alquiler factura al catering/asador). *[01:37]* |

### 1.4 Flujos de trabajo

**Ciclo de un evento** *(el más detallado, 01:23–01:47)*:

1. **Alta del evento** (oficina): fecha, día de montaje, lugar, nº comensales (ej. 160 + 14 niños),
   responsable. Se vuelca al **calendario**.
2. Se aplica la **plantilla de materiales** del tipo de evento; se ajusta (añadir/quitar líneas).
3. Se **asigna responsable de preparación** (ej. Curro); recibe su "carpeta"/pedido.
4. **Picking:** prepara todo en carros con ruedas, marca "preparado" y **firma/verifica**.
5. **Carga** en camión desde el **muelle** correspondiente.
6. **Entrega en destino:** el metre/cliente **verifica por firma** (empleado, transportista o cliente
   externo vía **enlace WhatsApp/Telegram**).
7. Durante el evento el **metre** es el único responsable del material.
8. **Devolución:** **otra persona distinta** verifica la entrada (separación de funciones deliberada);
   se registran faltas/roturas.
9. **Reconciliación:** lo perdido/roto se imputa a la persona/tramo responsable.

**Compra** *(fase posterior)*: pedido a proveedor → confirma precio/ficha → recepción con foto+caducidad → entra a stock.
**Inventario:** inventario "gordo" inicial → recuentos semanales por familia → bajas → valoración mensual de consumibles.

### 1.5 Roles / usuarios / permisos

- **Dueño (Joaquín):** ve todo.
- **2 encargados fijos:** mantenimiento, pedidos y recepción.
- **Responsable por tramo:** distinto para preparación, entrega y devolución; verifica y firma.
- **Metre:** ejecuta el evento y **puede hacer inventario**.
- **Mossos:** carga/descarga.
- **Comerciales:** usan el **calendario** para bloquear zonas/fechas; el sistema **evita doble reserva**
  del mismo material/zona. *[01:59]*
- **Acceso:** usuario+contraseña por persona; además idea de **PIN temporal por persona/día** (útil para
  eventuales) *[01:27]*. Documentos/firmas archivados y recuperables.

### 1.6 Hardware e integraciones

- **Dispositivos:** ~2 tablets en la nave + 1 móvil por metre (~3–5), líneas baratas; portátil para carga
  de inventario. **Los aporta Joaquín.**
- **WiFi en nave**; hay que resolver **operación fuera / offline** cuando salen a eventos.
- **Etiquetas/QR:** ya tiene máquina de etiquetas; QR para maquinaria de valor.
- **Voz:** entrada por notas de voz / resúmenes (tecnología de Alberto, conecta con su Voice POS).
- **WhatsApp / Telegram / email:** notificaciones, enlaces de firma a externos, **cierre diario por
  Telegram**, agente de correo que detecta/archiva facturas.
- **Calendario** central de eventos. Facturación/contabilidad mencionada (contable Antonio) **sin
  integración concreta definida**.

### 1.7 Fases acordadas

- **Reunión de descubrimiento/visión.** No hay alcance ni precio cerrados por escrito.
- **Fase 1 (arrancar ya):** maestro de artículos por familias + **inventario inicial "gordo"** +
  **plantillas de material por tipo de evento** + alta de eventos + **entradas/salidas con
  verificación/firma**. Joaquín: *"vamos a implantar, dame 3 móviles y 2 tablets"*.
- **Fase posterior:** pedidos a proveedores, fichas con foto/caducidad, mantenimiento de maquinaria, y la
  **analítica** (coste por evento, consumo/persona, planificación de personal, cierre por Telegram, ajuste
  de precios de menú).
- **Entrega iterativa:** *"cuando nos encarrilemos… vamos metiendo cosas"*. Alberto sigue con el prototipo;
  Joaquín aporta dispositivos y hará el inventario inicial.

### 1.8 Cuestiones abiertas (pendientes de aclarar con Joaquín)

1. **Entidad legal** del holding que poseerá/usará la app (optimización IVA con su fiscalista).
2. **Alcance exacto y precio/plazo** de la Fase 1 — sin definir.
3. **Lista de proveedores y fichas de producto** reales — por recopilar.
4. **QR individual vs. control por cantidad** en maquinaria — resuelto solo a medias.
5. **Comportamiento offline** fuera de la WiFi.
6. **Granularidad de trazabilidad** (el umbral 5 € es heurística, no regla firme).
7. **Integración con facturación/contabilidad**.
8. **Analítica predictiva de consumo/personal** ("La Tabla") — aspiracional, sin definir.
9. **Modelo de datos del intercompany** (alquiler ↔ catering ↔ asador ↔ transporte).

---

## PARTE 2 — Auditoría del código actual (qué YA tenemos)

**Titular:** el "motor de almacén" **ya existe y está muy completo** en el monorepo. Lo que Joaquín pide
NO exige construir un motor de inventario desde cero — exige poner **superficie (app/UI + tablas)** sobre
piezas que ya están hechas y, en gran parte, **ya en producción**.

### 2.1 Las cuatro capas de "almacén" del monorepo

| Capa | Dónde | Madurez |
|------|-------|---------|
| **Motor de dominio (puro, sin BD)** | `packages/module-materiales`, `module-alquiler`, `module-asn`, `module-proveedores` | ✅ Implementado + tests |
| **Superficie más madura (EN PRODUCCIÓN)** | `apps/ia-rest` (Voice POS de catering — el propio Joaquín Jaén) sobre Supabase | ✅ Producción (`iarest.es`) |
| **Vertical ligera desplegada** | `apps/alquiler` (alquiler de material, BD compartida) | ✅ CRUD completo; sin ubicaciones/lotes/proveedores |
| **Stock reimplementado a mano** | `apps/ialimp`, `apps/sivra` (consumibles de limpieza) | ⚠️ Deuda técnica reconocida |

### 2.2 El motor — `packages/module-materiales`

Lógica pura Ports & Adapters, testeada (`packages/module-materiales/test/materiales.test.ts`, 368 líneas).
Cubre **casi todo lo que pide Joaquín**:

- **`types.ts`** — `Material` (stock total/disponible, `stockMinimo`, `espacioActualId`, `precioCompra`,
  `costeReposicion`, `codigo`=SKU, `proveedor`, `garantiaHasta`, tipo `consumible|activo`, estado
  `operativo|deteriorado|en_reparacion|baja`), `Espacio` (ubicaciones), `Movimiento`/`TipoMovimiento`
  (**ledger append-only**: entrada/salida/devolución/rotura/ajuste/transferencia), `UnidadMaterial`
  (activos serializados con **nº serie + QR** + garantía + depreciación), `Kit`/`KitItem`, `Proveedor`,
  `ClienteMaterial`, `InventarioFisico`/`InventarioFisicoLinea` (recuento con diferencias),
  `Mantenimiento`, `ReservaAnticipada`. Adaptadores (ports) para cada uno.
- **`stock.ts`** — `stockActualDesdeLedger`, `stockPorEspacio`, `disponibilidadEnFecha`, `expandirKit`,
  `calcularDepreciacion`, `alertasVencimiento`, `alertasStockMinimo`, `ajusteInventario`, `valorStock`,
  `resumenContable`, `costeDanos`.

> Nota de nomenclatura: `packages/module-inventario/src` está **vacío**; el motor real es
> `module-materiales`. Algunos docs viejos lo llaman "module-inventario". Verificado en disco.

### 2.3 La superficie madura — `apps/ia-rest` (en producción)

ia-rest es **el Voice POS de hostelería del propio Joaquín Jaén**, ya en producción, y tiene **la
implementación de almacén más completa del monorepo** sobre su Supabase propio (consume
`@central/module-materiales` por adaptador `apps/ia-rest/src/lib/inventario-menaje.ts`). Ya tiene:

- **API real** bajo `apps/ia-rest/src/app/api/materiales/*`: CRUD de materiales, **movimientos** (ledger),
  **espacios** (ubicaciones), categorías, asignación, daños, **unidades** serializadas, **qr/[id]**,
  **kits** (+instanciar), **inventario-físico** (+líneas +cerrar), **mantenimiento**, proveedores,
  clientes, reservas, **alertas** (stock mínimo/garantía), informe, import.
- **Almacén/recepción:** `api/almacen/stock` (vista `v_stock_actual`), `api/almacen/recepcion`, y un
  **portal de almacén central multi-local** (`api/almacen-central/*`) con stock crítico/agotado, valor de
  stock y oportunidades de compra grupal.
- **ASN (recepción de albarán con OCR):** `api/asn/*` incl. **OCR de albarán por IA** y **portal público
  por token para el proveedor** (`app/asn/[token]/page.tsx`).
- **UI:** `apps/ia-rest/src/app/owner/materiales/page.tsx` (pantalla completa) y
  `app/almacen-central/page.tsx` (dashboard multi-local).

Esto importa **muchísimo**: gran parte de lo que Joaquín describe (maestro por categorías, movimientos,
ubicaciones, unidades con QR, inventario físico, mantenimiento, recepción con foto/OCR) **ya está
construido y probado en producción para su propio negocio de hostelería.**

### 2.4 La vertical ligera — `apps/alquiler`

Desplegada (Vercel Root `apps/alquiler`, rol BD `prisma_alquiler`), **CRUD 100%** de materiales + órdenes
multi-línea con ciclo de estados e intercompany. Pero es **deliberadamente ligera**: `schema.prisma` solo
tiene 4 modelos (`AlquilerMaterial` con `stockTotal Int` plano, `Alquiler`, `AlquilerLinea`, `Cuenta`).
**No** tiene ubicaciones, lotes, nº de serie, proveedores, entradas de compra ni valoración. Además, la
lógica del módulo puro **no está del todo cableada**: la máquina de estados no se aplica en el `PATCH`, el
`recargoRetraso()` no se usa en ninguna ruta, y `disponibleEnVentana` solo se explota para "hoy".
Pendiente en `apps/alquiler/CLAUDE.md`: parte de daños con fotos, contrato PDF, calendario visual.

### 2.5 Stock a mano — `apps/ialimp` / `apps/sivra`

Gestionan stock de **consumibles de limpieza** por SQL crudo (`productos_stock`, `stock_consumos`…), con
adaptador a `module-materiales` pero con lógica duplicada inline. Es **deuda técnica reconocida**
(`docs/AUDITORIA-proveedores-inventario.md`), no un bug. Relevante solo como aviso: no reinventar.

---

## PARTE 3 — Cruce requisito ↔ código, gaps y propuesta

### 3.1 Cobertura: lo que pide Joaquín vs. lo que ya existe

| Requisito de Joaquín | ¿Existe ya? | Dónde | Falta |
|----------------------|-------------|-------|-------|
| R1 Maestro por familias | ✅ | `module-materiales` `Material.categoria`; UI en ia-rest | — (mapear familias del catering) |
| R2 Material reutilizable vs. maquinaria con "matrícula" | ✅ | `Material.tipo consumible/activo` + `UnidadMaterial` (serie+QR) | — |
| R3 Stock + umbral 5 € | ✅ (stock) / 🟡 (umbral) | `stockActualDesdeLedger` | el umbral 5 € es política de catálogo, no motor |
| R4 Entradas/salidas con verificación | ✅ motor / 🟡 firma | `Movimiento`/ledger; asignación en ia-rest | **captura de firma** en entrega/devolución |
| R5 Plantillas de material por tipo de evento | 🟡 parcial | `Kit`/`KitItem` + `expandirKit` se le parece | "plantilla de evento" como tal (boda/corporativo/feria) + edición por evento |
| R6 Ubicaciones / muelles / depósitos | ✅ | `Espacio` + `TransferenciaMaterial` + `stockPorEspacio` | **muelles de carga** como tipo de espacio; UI |
| R7 Proveedores + pedidos de compra | ✅ | `module-proveedores`, ASN en ia-rest (OCR albarán) | Fase posterior; portal de proveedor "Mercadona" es nuevo |
| R8 Caducidades | ✅ | `alertasVencimiento` | ligar a ficha de producto |
| R9 Inventarios / recuentos / bajas / valoración | ✅ | `InventarioFisico`, `ajusteInventario`, `valorStock`, `resumenContable` | UI de recuento por familia |
| R10 Mantenimiento de maquinaria | ✅ | tipo `Mantenimiento` + API en ia-rest | Fase posterior; fichas de repuestos |
| R11 Trazabilidad con foto/vídeo | 🟡 | daños en ia-rest; ASN con foto/OCR | **vídeo** y foto en salida/entrada de evento |
| R12 Doble uso (terceros + intercompany) | ✅ | `module-alquiler` (`aTerceros`, `operacionIntercompanyDe`) + `apps/plataforma` consolida | cablear al flujo de eventos |
| Alta de evento + **calendario** + anti-doble-reserva | 🟡 | `ReservaAnticipada`/`disponibilidadEnFecha`; `module-agenda` existe **sin consumo** | **calendario de eventos** como superficie nueva |
| **Ciclo evento→picking→carga→entrega→devolución** | 🟡 | piezas sueltas (asignación, movimientos, alquiler) | **orquestación del flujo** de extremo a extremo — es lo más "nuevo" |
| Roles/PIN temporal, offline, voz | 🟡/❌ | auth por app existe; voz en Voice POS | PIN temporal, modo **offline**, cableado de voz |

**Lectura:** ~70–80% de las capacidades que pide Joaquín **ya están implementadas** en el motor y/o en
ia-rest. Lo genuinamente **nuevo** es la **orquestación del flujo de evento** (plantilla → picking →
carga por muelle → entrega con firma → devolución con verificación por otra persona → reconciliación),
el **calendario de eventos con anti-doble-reserva**, la **captura de firma/foto/vídeo** y el **modo
offline**.

### 3.2 Gaps — lo pendiente de construir (no existe hoy)

1. **Superficie/vertical del almacén de catering.** No hay una `apps/almacen` (o extensión de una app) que
   mapee `Material`/`Espacio`/`Movimiento`/`UnidadMaterial`/`Proveedor` a tablas Prisma en la BD compartida
   con su adaptador. El patrón a copiar es el de ia-rest (`inventario-menaje.ts`).
2. **Flujo de evento de extremo a extremo** (R4+R5+R11): plantilla de evento, picking con firma, carga por
   muelle, entrega con firma (incl. enlace a externos), devolución verificada por **persona distinta**,
   reconciliación con imputación de responsable. Hoy solo hay piezas.
3. **Plantillas de material por tipo de evento** (R5): `Kit` se parece pero falta el concepto "plantilla de
   evento" (boda/corporativo/feria/alquiler) editable por evento.
4. **Calendario de eventos + anti-doble-reserva** (usar `module-agenda`, hoy **sin consumo**).
5. **Captura de evidencia** (firma digital, foto/**vídeo**) atada a cada movimiento.
6. **Muelles de carga** como tipo de `Espacio` + su UI.
7. **Modo offline** para operar fuera de la WiFi de la nave.
8. **PIN temporal** por persona/día para eventuales.
9. **Fase posterior:** portal de proveedor tipo "Mercadona", analítica de consumo/coste por evento y
   planificación de personal, cierre diario por Telegram.

### 3.3 Recomendación de arquitectura

- **Reutilizar `packages/module-materiales` como motor** (NO ampliar `module-alquiler` ni empezar de cero).
- **Partir del patrón de ia-rest**, que ya resuelve el 70–80% para un negocio hermano (hostelería de
  Joaquín Jaén): valorar **extender ia-rest** vs. **nueva `apps/almacen`** sobre la BD compartida. La
  decisión depende de si el almacén es del mismo tenant que el Voice POS o una entidad legal distinta
  (cuestión abierta 1.8.1).
- **Componer** con `module-alquiler` (doble uso terceros/intercompany), `module-asn` (recepción/albarán) y
  `module-agenda` (calendario) — todos ya presentes.
- Respetar reglas del monorepo: `transpilePackages` para cada `@central/*`, scope por `empresa_id`/`cuenta_id`
  en la BD compartida, formato dinero español (`eur()`), y las reglas globales de **responsive** y
  **rendimiento de listas largas** (el inventario tendrá cientos/miles de líneas → montaje perezoso +
  paginación).

### 3.4 Propuesta de Fase 1 (alineada con lo acordado)

1. **Maestro de artículos por familias** — mapear categorías del catering; reutiliza `Material`.
2. **Inventario inicial "gordo"** — carga masiva (import) + recuento; reutiliza `InventarioFisico`/`import`.
3. **Plantillas de material por tipo de evento** — nuevo concepto sobre `Kit`.
4. **Alta de evento + calendario** — nueva superficie + `module-agenda`.
5. **Salida/entrada con verificación y firma** — orquestar sobre `Movimiento`/ledger + captura de firma.

Todo lo demás (proveedores/compras, mantenimiento, analítica, portal de proveedor) queda **Fase 2+**, tal
como se acordó.

### 3.5 Decisiones que hay que cerrar con Joaquín antes de picar código

- **¿Extender ia-rest o nueva `apps/almacen`?** → depende de la entidad legal/tenant (1.8.1).
- **Alcance y precio de Fase 1** (1.8.2).
- **Granularidad de trazabilidad** (umbral 5 € firme o configurable) (1.8.6).
- **Requisito offline sí/no en Fase 1** (condiciona mucho la arquitectura) (1.8.5).
- **Lista real de familias/artículos y de tipos de evento** para las plantillas.

---

## Anexo — Fuentes

- **Reunión:** Google Drive `Jj 1 almacen_original.txt` (transcripción automática, 14/07/2026).
- **Código:** `packages/module-materiales` (`types.ts`, `stock.ts`), `module-alquiler`, `module-asn`,
  `module-proveedores`; `apps/ia-rest/src/{lib,app/api/materiales,app/api/almacen-central,app/api/asn}`;
  `apps/alquiler` (`prisma/schema.prisma`, `lib/alquiler-repo.ts`); `apps/ialimp`, `apps/sivra` (adaptadores).
- **Docs de diseño previos:** `docs/DISENO-modulos-materiales-flota.md`,
  `docs/AUDITORIA-proveedores-inventario.md`, `apps/alquiler/CLAUDE.md`, skill `alquiler-maestro`.
