# CIMA — seguimiento de compañías mudas y «¿guardamos y pintamos todo?» (plan, 20/10/2026)

> Plan, no cambio de código. Sin PII. **[M]** = medido hoy en BD/código; **[I]** = inferido. BD: MCP `Supabase`, solo lectura.
> Contexto: skill `cima-ingesta`, `docs/CIMA-CAMPOS-HUECOS.md` (03/10), `docs/ASEGURA-CIMA-INGESTA-INVENTARIO.md`.
> Regla transversal: **nada sale a CIMA ni a compañías sin OK de Alberto para ESE envío** (todo lo de abajo es lectura o borrador).

## PARTE A — Compañías que enmudecen

### Lo que ya cubre (no se rehace)
- Vigía `correduria_ingesta` (cron 06:45 UTC; `decidirAvisoIngesta` en `ingesta.ts`; recordatorio cada 7 días) +
  `veredictoEntidad` en `packages/module-seguros/src/silencio-entidad.ts` (ritmo roto) + `renovacionesSinLlegar`
  (gracia 15 días). [M: código leído]
- Cifras de hoy por compañía, sobre días distintos con fichero (`descargado_at`) [M]:

| Compañía | Ficheros | Último | Días sin fichero | Mayor hueco | Mediana de huecos | Vivas | Vencen 30 d |
|---|---|---|---|---|---|---|---|
| C0072 Generali | 6 (3 POL, 2 REC, 1 SIN) | 28/09 | **22** | 7 | 3 | 14 | 0 |
| C0613 Reale | 8 (3 POL, 5 REC, 0 SIN) | 29/09 | **21** | 24 | 5 | 2 | 0 |
| C0109 Allianz | 58 | 10/10 | **10** | 23 | 2-3 | 32 | **4** |
| C0468 Occident | 105 | 18/10 | 2 | 9 | 2 | 52 | 0 |
| C0058 Mapfre | 36 | 19/10 | 1 | **94** | 2 | 66 | 1 |

### A2 (primero, porque explica el resto) — el umbral y por qué Reale/Allianz no avisan
**Qué hay [M].** `apps/asegura/lib/ingesta.ts` (~l.360-450) calcula `diasSinFichero = hoy - max(día)` y
`huecoMaximo = max(día - día anterior)` por `codigo_entidad`, con `cima_ficheros.descargado_at`. El helper puro dispara
silencio si `dias >= 14` **y** `dias > 2 × huecoMaximo` **y** hay ≥2 huecos (`SUELO_DIAS`, `FACTOR_SILENCIO`, `MIN_HUECOS`).
El cálculo es correcto y el helper está bien testeado; **el fallo es la elección del baremo (el máximo)**:
- **Generali:** 22 > 14 y 22 > 2×7 → el código la marca `silencio` [I: no hay evento persistido del vigía, 0 filas
  `%ingesta/%silencio/%aviso%` en 30 días en `operational_events`; el estado del aviso vive fuera de esa tabla].
- **Reale:** umbral = 2×24 = **48 días** (avisaría el día 49). Sus dos primeros huecos (23 y 24 d) son el alta, no su ritmo;
  después va a 1-5 d. [M]
- **Allianz:** umbral = 2×23 = **46 días**; hoy 10. [M] Tiene 4 pólizas que vencen en 30 días: el caso de A3.
- **Mapfre:** su hueco de 94 d es el silencio que el propio vigía debió cazar; ahora **sube su umbral a 188 días**
  (el baremo se envenena con las averías pasadas). [M]

**Cómo.** En `silencio-entidad.ts` cambiar el baremo del máximo a un percentil robusto y dejar de contar huecos viejos:
1. `base = mediana de huecos de los últimos 90 d`, ignorando huecos ≥ 30 d (averías/altas); umbral = `max(SUELO_DIAS, 3 × base)`.
   Con los datos: Reale 15 d (avisaría ya), Allianz 14 d (en 4 días), Generali 14 d, Mapfre 14 d, Occident 14 d.
2. Pasar `huecosRecientes: number[]` en `EntidadIngesta` (la SQL de `ingesta.ts` devuelve `array_agg`); mantener `huecoMaximo` solo informativo.
3. Test nuevo en `silencio-entidad.test.ts` con estos cinco perfiles (rojo antes, verde después).
- **Silencio por tipo (SIN):** Occident lleva 25 d sin SIN (último 25/09) y Allianz 23 d (27/09); los SIN son esporádicos,
  así que solo informar, no alarmar, salvo `sinN ≥ 10` y ritmo propio roto (`ultimoSin`/`sinN` ya viajan). [M datos, I criterio]
- **Coste/riesgo:** S; riesgo medio = ruido (más avisos). Mitigación: SUELO 14 d + recordatorio semanal que ya existe. **Recomendado, fase 1.**

### A3 — avisar ANTES del vencimiento (renovación en riesgo)
**Falta [M]:** hoy `vencidasEnSilencio` mira vencidas desde su último fichero y `renovacionesSinLlegar` espera 15 d de gracia;
`vencen90d` solo se imprime cuando ya hay `silencio`. Allianz (4 vencen en 30 d, 10 d muda) no sale en ningún aviso.
**Cómo:** nuevo helper puro `renovacionesEnRiesgo` en `silencio-entidad.ts`: compañía con `diasSinFichero ≥ max(7, 2×base)`
(prealerta, por debajo del umbral de silencio) y ≥1 póliza en vigor con `fecha_vencimiento` en los próximos 30 d → línea
«Allianz: 4 renovaciones en 30 d y 10 d sin ficheros». La consulta SQL va junto a `carteraRaw` en `apps/asegura/lib/ingesta.ts`
(ya calcula `proximas` a 90 d; añadir `FILTER` a 30 d). Pantalla: `apps/plataforma/app/(usuario)/correduria/Ingesta.tsx`.
**Coste/riesgo:** S-M; riesgo bajo (solo informa). **Recomendado, fase 1 (con A2, mismo archivo).**

### A4 — acción sugerida en el aviso
**Falta [I]:** el aviso dice qué pasa, no qué hacer. **Cómo:** campo `accion` por veredicto en `motivosSilencio`
(texto fijo, sin IA): «Baja el export `Ficheros recibidos` del Portal CIMA (emisor X, últimos 30 d) y súbelo en Ingesta →
cruce»; y un borrador de reclamación **solo como texto** (botón «copiar borrador», nunca envío): pide a la compañía confirmar si
ha emitido movimientos desde la fecha del último fichero. Va en `apps/plataforma/lib/correduria/ingesta-cima.ts` +
`Ingesta.tsx`. **Coste:** S; riesgo nulo si no envía. **Recomendado, fase 2** (depende de A1 para que el paso 1 sea un botón).

### A1 — ¿la compañía TIENE movimientos que no nos llegan?
**Hoy [M]:** la única lista independiente es el export manual «Ficheros recibidos» del Portal CIMA (xlsx: emisor, proceso,
código interno, nombre del fichero, «Descargado WS»). El contrato del adaptador solo expone `POST /wse/recibir-ficheros-pendientes`
(**no consume la cola**, pero solo devuelve lo pendiente), `POST /wse/confirmar-descarga` (consume) y `GET /health`.
**No hay método que liste ficheros ya descargados/confirmados** [M: inventario]. Si el estándar TIREA tiene una operación de
consulta histórica no la conocemos [I]: preguntar a Manuel por el WSDL (`https://ws.cimaseg.es/wsEstandar/`); sería lectura
pura, pero el adaptador Java vive en repo privado de Manuel (no se toca desde aquí).

| Opción | Dónde | Coste | Riesgo | Veredicto |
|---|---|---|---|---|
| a) Método WS de listado (si existe) | adaptador Java (repo de Manuel) + `apps/asegura/lib/cima/client.ts` | L (dependencia externa) | medio: toca la cadena viva | Solo si el WSDL lo trae; investigar, no construir |
| b) Importador del xlsx del portal que cruza contra `cima_ficheros` | parser puro `apps/asegura/lib/cima-export-portal.ts` + endpoint interno + subida en `Ingesta.tsx` | M | bajo (solo lectura; sin PII: solo nombres de fichero) | **Recomendado** |
| c) Recordatorio mensual de bajar el export | el propio vigía (`decidirAvisoIngesta`) o tarea programada | S | nulo | Complemento inmediato |

**Cruce de (b):** `nombre_fichero` del xlsx vs `cima_ficheros.nombre_fichero`. Tres resultados: (1) en portal y en BD → ok;
(2) en portal «Descargado WS = No» y no en BD → la compañía manda y **nosotros no lo tiramos** (error de pull/paginación);
(3) en portal «Descargado WS = Sí» y no en BD → perdido tras confirmar (rescate con `ingerir-manual`, ya documentado).
Salida por emisor: «C0072: portal 14, BD 6, faltan 8». Es justo la evidencia que hoy falta para el caso Generali (¿no manda, o
manda y no llega?). **Fase 2** (tras A2/A3, que ya reducen el ruido). El recordatorio (c) entra en fase 1 por coste S.

## PARTE B — ¿Guardamos y pintamos TODO lo que llega de CIMA?

### B0. Medición de `cima_cobertura_campos` [M, 20/10/2026]
Hojas agregadas por ruta y tipo, sumando compañías. **Filas con prefijo `ProcesosEIAC.` hoy: 0** (ya limpiadas; el §7 de
`CIMA-CAMPOS-HUECOS.md` está desfasado). `excluido_motivo` ≠ NULL = descarte por privacidad, no cuenta como «sin leer».

| Tipo | Rutas vistas | Leídas (guardadas por el mapper) | Sin leer | Excluidas (privacidad/técnicas) | % leídas |
|---|---|---|---|---|---|
| POL | 469 | 341 | 56 | 72 | 73 % |
| REC | 90 | 57 | 22 | 11 | 63 % |
| SIN | 272 | 113 | **146** | 13 | 42 % |
| CEF | 103 | 57 | 46 | 0 | 55 % (**medido un solo día, 03/10**) |
| **Total** | **934** | **568** | **270** | **96** | 61 % |

Motivos de exclusión [M]: cabecera, orden de lista, persona, banco, dirección, consentimientos, estado civil, idioma, sexo. **Top grupos sin leer** (nº de rutas):
- SIN: `Asegurado.ImplicadoAutos` 33 (vehículo del siniestro) · `FigurasSiniestro.Figura` 26 · `Asegurado.Asistencias` 24 ·
  `Asegurado.PersonaContacto` 13 · `Contrarios.Contrario` 10 · `AccionesSiniestro.Accion` 9.
- POL: `GestionCobro.DatosFormaPago.DatosCuentaCorriente` 15 (bancario) · `Riesgo.OtrasFiguras` 10 · `RiesgoVida` 7 · `RiesgoAutos` 4 ·
  `Tomador.PersonaJuridica.DatosContacto` 4 · `RiesgoDecesos` 2.
- REC: `GestionCobro.DatosFormaPago` 19 · `DatosImportes.Importes` 1 · `MovimientosRecibo.Movimiento` 1.
- CEF: `Liquidaciones.Liquidacion.DatosLiquidacion` 33 · cabecera 9.
Dinero y fechas de póliza/recibo/siniestro **sí** se leen; lo sin leer es contexto, personas y banco (ver `CIMA-CAMPOS-HUECOS.md` §3).

### B0b. Dónde se guarda lo leído y lo no leído [M]
| Objeto | Columnas del mapper | «Resto» genérico | Cobertura medida |
|---|---|---|---|
| POL | columnas de `polizas` + `datos_especificos` (≈95 claves: riesgos, figuras, gestionCobro, suplementos…) | `datos_especificos.cimaExtra` (`[{ruta, valor}]`, sin PII) | **60 de 166** pólizas CIMA lo tienen; el resto, «aún no leído» |
| REC | `poliza_recibos` + `datos_extra` (cargos, importesDec, movimientos, otrosDatos, comisionesExtra) | `datos_extra.cimaExtra` | 466 de 466 con `datos_extra` |
| SIN | `siniestros` | `cima_extra.cimaExtra` | **45 de 107** siniestros; 62 NULL |
| Cobertura | `poliza_coberturas` | `datos_extra` (franquicias, importes, límites) | 89 de 2.807 |
| CEF | `liquidaciones`, `liquidacion_movimientos` (rico), `cuenta_efectivo` | `datos_extra` de liquidación: solo `claseFormaPago`, `mediador`; **sin `cimaExtra`** | 14 liquidaciones |
Lectura clave [I]: «sin leer» ≠ «no guardado» para POL/REC/SIN (lo no mapeado y sin PII va a `cimaExtra`); lo realmente
descartado son las 96 rutas excluidas y, **en CEF, lo que no tiene columna**.

**Crudo [M].** `cima_cuarentena_crudo` guarda `raw_xml_cifrado` + `datos_cifrado` de TODO fichero desde el 17/09: 227 filas,
**9,1 MB** en 33 días (~100 MB/año [I]). **`purgar_en` = 2032** (≈6 años), no 30 días: la skill `cima-ingesta` y
`CIMA-CAMPOS-HUECOS`/inventario dicen «30 días» y están desfasados (corregir la doc; comprobar en código antes si el default es 6 años).
Ficheros anteriores al 17/09 (≈143 de 213 en `cima_ficheros` [I, por `created_at`]) **no tienen crudo en BD**: solo la carpeta
Drive `asegura/CIMA` (descargas manuales del portal, sin garantía de completitud).

### B-pintado — qué ve el operador (`apps/plataforma`, /correduria)
- **Póliza** [M]: `poliza/[id]/page.tsx` l.331 «Más datos de CIMA» plegable (`lib/cima-extra-vista.ts`, `MasDatosCima`). Con 60/166 pólizas rellenas.
- **Recibo** [M]: l.747 «Más datos de CIMA» por recibo, plegado.
- **Siniestro** [M por grep]: **no hay consumidor** de `siniestros.cima_extra.cimaExtra` en plataforma; el único uso es
  `cima_extra->'terceros'` en `apps/asegura/lib/cartera-siniestros.ts`. La skill dice «se pinta solo para el operador»: **no es cierto aún** → guardado y no visto (45 siniestros).
- **Coberturas** [I]: se pinta el detalle estructurado (límites/franquicia); `datos_extra` de cobertura sin evidencia de pantalla propia.
- **CEF / liquidaciones** [I]: sin bloque de detalle en la ficha; el cron `cima-liq` existe, no hay «más datos».
- **Portal del cliente**: nunca recibe `cimaExtra` (guardián `regression-portal-sin-cimaextra`). Mantener.

### Propuestas

**B1 — Conservar el crudo para siempre.**
La retención ya es ~6 años en BD [M]. Opciones: (a) dejar BD y subir `purgar_en` a «sin purga» (S; 100 MB/año cifrados es irrelevante);
(b) Storage cifrado (`core-storage`, bucket privado + clave de `PII_ENCRYPTION_KEY`) con un job diario que vuelque lo nuevo (M; sirve
si la BD crece); (c) Drive manual (hoy; frágil, depende de que alguien baje el zip). RGPD: el crudo contiene PII de terceros (perjudicados,
testigos); es base legítima mientras dure la relación + plazos de prescripción, y debe constar en el registro de tratamientos [I, validar
con Alberto/DPO]; mantener cifrado, acceso solo operador, y borrado por póliza si hay supresión (`ExportRgpd.tsx` es el sitio).
**Recomendación:** (a) ya, y corregir docs; (b) solo si el crudo pasa de ~1 GB. Para lo anterior al 17/09: re-ingerir los zips de Drive
por `ingerir-manual` (M, bajo riesgo, una vez).

**B2 — Guardar el resto.** POL/REC/SIN ya tienen el patrón [M]; lo que falta es (i) **rellenar `cimaExtra` en las 106 pólizas CIMA y 62
siniestros sin él** (reproceso desde crudo con `cima-reprocesar-cuarentena.yml`, M, bajo) y (ii) **CEF**: `datos_extra.cimaExtra` en
`liquidaciones`/`cuenta_efectivo`/`liquidacion_movimientos` (46 rutas sin leer, 33 en `DatosLiquidacion`), con la misma lista de denegación de PII
(IBAN/BIC ya son «dato bancario»). Va en el mapper `eiac-cef-mapper.ts` / `persist-cef.ts` de `apps/asegura` (alto riesgo: dinero → `agente-architect`).
**Recomendación:** (i) fase 1-2, (ii) fase 3 (valor bajo hasta que alguien use las liquidaciones).

**B3 — Pintar «todo lo de CIMA» en la ficha del operador.** Reutilizar `vistaCimaExtra` + `MasDatosCima` + `Plegable`: añadir el bloque
a **siniestro** (el hueco real hoy), a **cobertura** (`datos_extra`) y, tras B2, a liquidación. Siempre plegado, rendimiento: lista ≤50 + «Ver más»
(regla de la raíz), móvil ≥320 px, **nunca** en `asegura-portal` (el guardián se amplía a cada nuevo `cimaExtra`). Dato `null` = «aún no leído», `[]` = «CIMA no trae más».
**Coste:** S-M, riesgo bajo. **Recomendación:** fase 1 para siniestro (visible y barato), resto con B2.

**B4 — Priorizar qué campos sin leer valen negocio** (de `CIMA-CAMPOS-HUECOS.md` §3, cruzado con las cifras de arriba) [I]:
1. Dinero/identidad del movimiento: `NumeroSuplemento` (sin él no se ordena el historial), fechas del suplemento, `Anulacion.ReferenciaAnulacion`, prima por cobertura del SIN.
2. Riesgo del siniestro: `ImplicadoAutos.Vehiculo` (33 rutas; matrícula/clase/uso), `Asistencias` (24) — útiles para reclamación y estadística.
3. CEF: desglose del recibo dentro de la liquidación y fechas de movimiento (cuadre de comisiones).
4. Vida/decesos (`RiesgoVida` 7, `RiesgoDecesos` 2) cuando haya cartera real de ese ramo.
5. Ruido o PII sin uso: cabeceras, `NumeroOrden`, perjudicados/testigos/contrarios, sexo/idioma: **no** desarrollar.
**Cómo:** un script (agente) que liste las rutas sin leer por **veces_visto** y por compañía, y el operador marque «promover a columna» solo las de 1-3.
**Recomendación:** fase 3; que B3 ya los muestre hace que la decisión salga de uso real y no de intuición.

**Respuesta corta: ¿guardamos y pintamos todo?** Guardamos casi todo lo que no es PII (POL/REC/SIN en `cimaExtra`) y el crudo cifrado
desde el 17/09 (retención ~6 años, no 30 días); **no** guardamos las 96 rutas excluidas ni el resto de CEF; y **no pintamos** el resto del
siniestro, ni de cobertura ni de liquidación. Faltan: rellenar `cimaExtra` retroactivamente, CEF, y el bloque de siniestro.

## Orden propuesto

| Fase | Qué | Esfuerzo | Riesgo |
|---|---|---|---|
| 1 | A2 baremo por mediana + huecos recientes (test con 5 perfiles reales) | S | Medio (más avisos) |
| 1 | A3 «renovaciones en riesgo» a 30 d con prealerta | S-M | Bajo |
| 1 | A1(c) recordatorio mensual del export del portal | S | Nulo |
| 1 | B1(a) crudo sin purga + corregir docs «30 días» | S | Bajo |
| 1 | B3 bloque «Más datos de CIMA» en siniestro (+ guardián portal) | S-M | Bajo |
| 2 | A1(b) importador del xlsx del portal + cruce por emisor | M | Bajo |
| 2 | A4 acción sugerida + borrador de reclamación (solo copiar) | S | Nulo |
| 2 | B2(i) reproceso desde crudo: `cimaExtra` en 106 POL y 62 SIN | M | Bajo |
| 2 | B1 re-ingesta de los zips de Drive anteriores al 17/09 | M | Bajo |
| 3 | B2(ii) `cimaExtra` en CEF + B3 de cobertura/liquidación | M-L | Alto (dinero; `agente-architect`) |
| 3 | B4 promover a columna los campos de negocio elegidos | M por campo | Medio |
| 3 | A1(a) método WS de listado, solo si el WSDL lo ofrece | L | Medio (cadena viva) |
