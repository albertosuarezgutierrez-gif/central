# eInforma / Informa D&B — oferta comercial y decisión de contratación

> **Origen:** correo «Informa» de **Borja Piña** (Delegado Comercial Andalucía, Informa D&B, Sevilla),
> reenviado por **Pablo** (`pablo.j.p.c@hotmail.com`) a Alberto el **30/07/2026**.
> Es la primera oferta con precios reales del proveedor que la fase 2 del proyecto **Empresas en dificultad**
> lleva pendiente desde el 17/07/2026 (ver `docs/superpowers/specs/2026-07-17-empresas-problemas-financieros-design.md`).
> Este documento es el **estado de la contratación**; el diseño del sistema NO cambia.

## 1. Qué ofrece, en dos contratos independientes

| | Servicio | Cómo se consume | Precio |
|---|---|---|---|
| **1** | **Informes financieros de empresa** (uno a uno) | (a) por la web de eInforma, o (b) **API «API Empresas»** contra nuestro sistema — informe en tiempo real por nombre/CIF de empresa o de administrador, con los campos que selecciones («informe a medida») | Bonos anuales, ver §2 |
| **2** | **Ficheros de marketing** (lote) | Excel a medida filtrado por **CNAE + zona geográfica** (y por cualquier campo del informe financiero: razón social, socios, administradores, cualquier partida de balance, datos bancarios…) | **1–3€ por empresa**, según volumen |

Extras mencionados, no cotizados: **SABI** (Bureau van Dijk) desde **15.000€/año**; **FAqtum**
(valoración de una sociedad en 7 días); **Leanus** (vuelca N empresas en una herramienta de análisis
financiero/estadístico y comparativas).

## 2. Precios del bono de informes (mismo precio para web y para API)

| Bono | Precio | **Coste unitario** |
|---|---|---|
| 50 informes/año | 1.500€/año | **30,00€/informe** |
| 100 informes/año | 2.400€/año | **24,00€/informe** |
| 200 informes/año | 4.000€/año | **20,00€/informe** |
| 500 informes/año | 7.500€/año | **15,00€/informe** |

Los bonos pueden ser nacionales o internacionales. El comercial propone **empezar por los informes y
ampliar después**.

## 3. Lectura para nuestro embudo (lo que cambia de verdad)

**a) El precio unitario real es 15–30€, no los 12€ que asume el código.** El default
`EMPRESAS_ENRIQUECER_COSTE_EUR=12` de `lib/empresas-enriquecer.ts` se puso a ojo. Al contratar, poner el
env al unitario del bono elegido (30 / 24 / 20 / 15) para que el tope mensual
`EMPRESAS_ENRIQUECER_TOPE_MENSUAL_EUR` cuente bien. Con el default de 50€/mes y un bono de 200, el tope
son ~2 informes al mes: **subir el tope o bajarlo a conciencia, pero decidirlo, no heredarlo**.

**b) Ojo al modelo de gasto: el bono es PREPAGO anual, no metered.** Nuestro ledger
`empresas_enriquecimiento_coste` está pensado como «€ gastados este mes». Con un bono lo que hay que
vigilar es **informes consumidos / informes del bono**, que es un contador anual. El ledger sirve igual
(coste unitario × consumos), pero el tope mensual debe fijarse como *bono ÷ 12* si no queremos
fundirlo en enero.

**c) El fichero de marketing (1–3€/empresa) es el eslabón que le faltaba al embudo.** El diseño
(§9) dejaba abierto el riesgo «el cribado gratis con BORME da *eventos*, pero no fondos propios
negativos sin evento» y ponía **SABI (15.000€/año) como única salida en fase 3**. Ese salto ya no hace
falta: por **1–3€/empresa** se puede pedir un Excel con **partidas de balance** de *todas* las empresas de
un CNAE + provincia. Es exactamente el cribado masivo de la etapa 1, a **1/5 – 1/20 del coste por empresa**
del informe unitario, y sin comprometer 15.000€.

Contraste crudo, para el mismo dinero:
- **4.000€** = 200 informes API (200 empresas, profundidad máxima), o
- **4.000€** = ~1.300–4.000 empresas en fichero (amplitud, con balance para filtrar).

El embudo del diseño quiere **primero amplitud barata, luego profundidad cara**. Luego el orden natural
es: **fichero primero** (define la lista corta con datos reales, no con eventos BORME) y **bono de
informes pequeño después**, solo para las supervivientes y para el refresco en vivo desde la app.

**d) El precio del fichero no se puede cerrar todavía y eso es gratis de averiguar.** Borja dice
explícitamente que su departamento de marketing tiene que hacer el estudio para saber **cuántas empresas
salen**. Pedir ese recuento con nuestros filtros no cuesta nada y convierte «1–3€/empresa» en una cifra
concreta antes de firmar.

**e) La restricción de redistribución sigue en pie.** Confirma el §1 y §8 del diseño: uso **interno**,
nada de reexponer estos datos a terceros como SaaS.

## 4. Recomendación

1. **Pedir a Borja el recuento (gratis) del fichero** con el filtro del diseño: provincia(s) objetivo
   + 2–3 CNAE del radar de sectores + facturación 0,5–2 M€ + forma jurídica SL. Con el nº de empresas
   sale el precio cerrado del fichero.
2. **Pedir la doc técnica de la API en formato usable** (ver §5) y el **acceso de sandbox**, que es lo que
   desbloquea el adapter ya construido.
3. **NO contratar el bono grande de entrada.** Si hay que firmar algo ya, el bono de **50 (1.500€)**
   basta para validar la tubería en vivo; el salto a 200/500 se decide cuando el embudo demuestre que
   genera candidatas que merezcan informe.
4. **SABI: descartado por ahora** (15.000€/año). El fichero a medida cubre el mismo hueco de cribado.

## 5. Hallazgos técnicos (adjuntos analizados el 30/07/2026)

Los adjuntos del correo están en la carpeta de Drive **`Einforma`**. Analizados: el JSON de ejemplo, el
diccionario de datos y el informe financiero de muestra (46 páginas, SEVILLA CONTROL SAU).

### 5.1 🚨 El producto es CONFIGURABLE y la configuración de la demo NO nos vale

El JSON de ejemplo responde a `"productoSolicitado":"informe_personalizado"`. **Los bloques y campos que
devuelve la API son los que se pactan al contratar**, no un informe fijo. Y la configuración de la demo
trae MUCHO menos de lo que necesita nuestro scoring:

De la cuenta de pérdidas y ganancias devuelve **exactamente dos partidas** — `40100` (importe neto de la
cifra de negocios) y `49500` (resultado del ejercicio). Nada más. **No trae patrimonio neto, ni EBITDA, ni
fondo de maniobra, ni deuda financiera, ni CNAE, ni incidencias de pago.** El diccionario lo confirma: no
existe un bloque de balance de situación en esta configuración.

**Acción obligatoria antes de firmar:** entregar a Borja la lista EXACTA de partidas y bloques a activar.
Si no, contrataremos un informe que no puede alimentar el bloque A del scoring. Como mínimo:
patrimonio neto, EBITDA (o las partidas para calcularlo), activo y pasivo corriente (fondo de maniobra),
deudas con entidades de crédito a corto y largo plazo, CNAE, y el bloque de morosidad (§5.4).

### 5.2 Forma real de la respuesta — el mapeo actual está mal a nivel de estructura

`lib/empresas-einforma.ts::mapearFinanciero` supone campos con nombre (`balance.patrimonioNeto`,
`ratios.deudaEbitda`). La realidad:

- Todo cuelga de **`datosProducto`**, no de la raíz. La raíz lleva el sobre:
  `productoSolicitado`, `campoCodificadoRespuesta` (`valor:0` = «Operación efectuada correctamente» →
  **es el código de error que hay que comprobar**) y `datosPeticion`.
- Tres bloques: `informacionComercial` (`identificacion.cif`, `identificacion.denominacionActual`,
  `datosGenerales`, `direcciones.direccionActual` con coordenadas, `empleados.numeroTotalEmpleados`),
  `estructuraCorporativa` e `informacionFinanciera`.
- **Las cifras NO son campos: son una lista de partidas con código de PGC.**
  `informacionFinanciera.listaBalances[]` → `listaPartidasCuentaPerdidasGanancias[]` →
  `{codigoPartida, campoCodificadoPartidaConPlantilla:{literal}, valor}`. Hay que **indexar por
  `codigoPartida`**, no leer rutas fijas.
- Los enumerados vienen como `campoCodificado*` = `{valor, tablaDecodificacion, literal}`. El `literal`
  ya viene resuelto, así que no hace falta bajarse las tablas de decodificación.
- `datosPeticion.parametrosCliente` acepta **`referencia`** (texto libre; en el ejemplo `"ALTA SOPORTE"`)
  → úsala para etiquetar cada consulta y cuadrar el ledger `empresas_enriquecimiento_coste` contra la
  factura de Informa.

### 5.3 🚨 LANDMINE — los balances mezclan individual y consolidado

`listaBalances` trae **3 ejercicios**, cada uno con `cabeceraBalance`. En el ejemplo real:

| Ejercicio | `indicadorBalanceIndividual` | `campoCodificadoOrigen` |
|---|---|---|
| 2025 | **false** (consolidado) | Fuentes Propias |
| 2024 | true (individual) | Registro Mercantil |
| 2023 | true (individual) | Registro Mercantil |

Comparar el EBITDA de 2025 contra el de 2024 sin mirar ese flag es comparar el grupo contra la sociedad:
saldría una «caída» inventada y dispararía la señal «EBITDA negativo 2 ejercicios». **Filtrar siempre por
`indicadorBalanceIndividual` antes de encadenar ejercicios.** Ojo también con `duracionMeses` (un
ejercicio corto no es comparable) y con `campoCodificadoUnidadDivisa`.

Lo bueno: `cabeceraBalance` trae `fechaCierre`, `fechaRecepcion`, `annoBalance` y **`annoDeposito`**, así
que la señal «depósito de cuentas con más de 12 meses de retraso» sale directa y sin cálculo raro. Y tener
3 ejercicios de serie cubre la señal de «EBITDA negativo 2 ejercicios consecutivos», que el diseño daba
por difícil.

### 5.4 🚨 RAI/ASNEF NO vienen incluidos — son un add-on de pago

Resuelve la duda abierta del diseño §5-A. En el informe de muestra, los cinco ficheros de morosidad salen
literalmente como **`No consultado`**: `RAI`, `ASNEF EMPRESAS`, `EBE MOROSIDAD`, `ICIRED`, `RIJ`. La
sección «Ficheros de morosidad» es un formulario de venta cruzada con casillas para añadirlos (y avisa de
que al incluirlos se recalcula la Nota Informa).

**Hay que pedirle el precio a Borja aparte.** Lo que sí viene sin coste extra y cubre parte del hueco:

- **Paydex** — comportamiento de pago real declarado por proveedores: `MEDIA DE DÍAS DE DEMORA` 16,
  `D&B PAYDEX` 69, `NÚMERO DE EXPERIENCIAS DE PAGO (ÚLTIMOS 12 MESES)` 17, `% IMPORTE TOTAL EN DEMORA` 26%,
  con desglose por tramos de importe. Mide «paga tarde», no «está fichado como impagador».
- **Información Judicial y Concursal** — tres contadores: `PROCEDIMIENTOS CONCURSALES Y ESPECIALES`,
  `INCIDENCIAS JUDICIALES`, `RECLAMACIONES ADMINISTRATIVAS`.

Para un ranking interno de «quién va mal», Paydex + judicial/concursal probablemente basta. El add-on solo
se justifica si el sistema llega a decidir exposición o crédito real.

### 5.5 Lo que el informe trae de regalo y el diseño no contemplaba

El informe completo (no necesariamente la API — hay que pedir que se incluyan) tiene señales mejores que
varias de las que teníamos previstas construir a mano:

- **Scoring propio ya calculado:** `NOTA INFORMA` (0–20), `OPINIÓN DE CRÉDITO` (€), `SCORE LIQUIDEZ`
  (0–100 + probabilidad de retraso), `PROBABILIDAD DE CESE` (%), `RESILIENCIA` (0–100),
  `Riesgo del Sector` a 1 y a 2-3 años, y `ASEGURABLE POR CESCE` (Sí/No — un booleano de un tercero
  independiente que, si pasa a No, es señal de primer orden).
- **`Últimos Cambios en la Empresa`** — feed de eventos **con signo**: `Nota Informa (Disminución)`,
  `Comportamiento de Pagos-Paydex (Empeora)`, con fecha. Es la señal más barata de monitorizar y encaja
  directamente con nuestro modelo de vigilancia continua.
- **`Motivos de los Últimos Cálculos Relevantes en la Nota INFORMA`** — por qué cambió la nota, en texto
  («Se ha producido una variación por no disponibilidad de cuentas»).
- **Ratios con percentiles del sector** (`PTILE25/50/75`) — normaliza cualquier ratio contra su sector.
  **Puede ahorrarnos buena parte del trabajo de benchmark con la Central de Balances del Banco de España**
  que el diseño §4 daba por necesario.
- **Nº de consultas del informe** (`97 veces en el último trimestre`) — un pico suele significar que
  varios proveedores están comprobando solvencia. Señal adelantada y gratis.
- **BORME estructurado por tipo de acto** con contadores y fechas, incluida la detección de **escisiones**
  (en la muestra, una escisión parcial que se llevó la rama inmobiliaria: vaciado de activos).
- **Periodo medio de cobro vs de pago** (47 vs 80 días en la muestra) — la tijera clásica de tensión de caja.
- **Comentarios narrativos autogenerados** por sección, ya redactados y bastante duros.

### 5.6 Lo que NO hay, y hay que dejar de buscarlo

- **Edad o fecha de nacimiento de los administradores: no existe** en el informe (el aviso legal lo acota
  a la actividad empresarial). Sí hay `fechaNombramiento`, cargo, cargos no vigentes y el patrón de
  apellidos, que sirven de heurística de relevo generacional pero no de dato. El bloque E del diseño
  sigue siendo **manual**, como estaba previsto.
- **Ratio deuda/EBITDA: no viene calculado.** Hay que componerlo desde las partidas de deuda
  (`Deudas con entidades de crédito` a largo y corto plazo, arrendamiento financiero, otros pasivos
  financieros) — no hay un rótulo agregado de «deuda financiera».

### 5.7 ⏳ Lo único que sigue pendiente

Las **rutas exactas de la API** (endpoint de token y de informe). Están en `API CONFIGURABLE v2.zip`, que
no se puede leer desde las sesiones de Claude: los ficheros de Drive llegan codificados en base64 y un ZIP
de 2,65 MB no cabe en la ventana de contexto. Su contenido descomprimido (`API Documentation_v2.mhtml`,
695 KB) tampoco: el conector de Drive no sabe extraer texto de un archivo web MHTML.

**Vía que sí funciona:** abrir el MHTML en Chrome, imprimirlo a PDF y subir el PDF a la carpeta `Einforma`.
De un PDF el conector extrae texto en el servidor y se lee sin problema de tamaño. Alternativa: pedirle a
Borja la documentación en PDF directamente.

Mientras tanto, `RUTAS` en `lib/empresas-einforma.ts` (`/api/v1/oauth/token`,
`/api/v1/companies/{cif}/report`) sigue siendo **una suposición mía sin verificar**.

## 6. Contacto

**Borja Piña Sánchez** — Delegado Comercial Andalucía, Informa D&B.
Avda. de la Constitución 24, 5ºA, 41004 Sevilla · 95 451 16 69 / 600 589 108 · <https://www.informa.es/>
