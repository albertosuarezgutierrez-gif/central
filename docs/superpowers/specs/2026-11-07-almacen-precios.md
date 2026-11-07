# Almacén de precios observados (`seguros.observaciones_precio`) — diseño

> **Estado: DISEÑO (07/11/2026). Nada aplicado: ni SQL ni código.** Autor: agente-architect, a petición de Alberto.
> Objetivo dictado: «no perder ningún precio, venga de donde venga, y poder argumentar con cada compañía por qué
> no vendo, con números reales y documentados».
> Cifras medidas el 07/11/2026 con SELECT agregados sobre el schema `seguros` (proyecto central), sin PII.

---

## 0. El problema real (antes de la tabla)

Hoy los precios **no se pierden**, pero están **en siete sitios con siete formas**, y tres de esos sitios son
**copias** de otro. Un cuadro de competitividad que los sume tal cual cuenta el mismo precio dos o tres veces, mezcla
un terceros con un todo riesgo y compara una prima de 2023 declarada por un cliente con una cotización firme de ayer.

| # | Fuente | Dónde vive hoy | Filas hoy | Problema para comparar |
|---|---|---|---|---|
| 1 | Avant2 / Codeoscopic | `tarificaciones` (canal `codeoscopic`, 38 reales + 3 simuladas) + `tarificacion_precios` | **528 precios** (auto 323, moto 199, hogar 6) | Bien guardado. Compañía en texto libre (`Reale`, `Occident`…), sin código DGS. `fallos` (rechazos por compañía): **24 rechazos** en 8 cotizaciones; **31 cotizaciones con `fallos` NULL** (anteriores al 29/09: «no se sabe», nunca «nadie rechazó»). |
| 2 | Bots RPA | `tarificacion_trabajos` → `tarificaciones` (canal `rpa`, 79) + `tarificacion_precios` | **188 precios** (auto 159, moto 18, hogar 10, comunidades 1). Solo **Allianz (86) y Mapfre (102)**: Generali tiene 0 `ok` en `tarificar` (43 `error_definitivo`). | Compañía en minúscula (`allianz`), `modalidad`/`categoria` NULL (el nivel sale de producto + coberturas). `fecha_efecto` NULL en auto/hogar. **El riesgo del trabajo se PURGA al cerrar** (`purgarRiesgoTrabajos`): edad del conductor/tomador ya no está para el histórico. Los 128 `error_definitivo` de tarificar son fallos del BOT (tipos `portal`, `datos`, `emision`, `infra`), **no** rechazos de la compañía. |
| 2b | (copia de 2) | `oportunidad_oferta` con `datos_extra.origen='rpa'` | 148 | **Duplicado** de las filas de `tarificacion_precios` (llevan `tarificacionId`). |
| 2c | (copia de 1 y 2) | `presupuesto_opcion` | 490 | **Duplicado** (`precio_id` → Avant2, `oferta_id` → oferta). Nunca se lee como fuente. |
| 3a | Póliza/oferta subida por el corredor a una oportunidad | `oportunidad_oferta` (rol `actual` = póliza de hoy, `oferta` = PDF de compañía) leída por `leerOferta()` | **0** hoy con origen PDF (las 148 son del bot) | La prima puede corregirla el corredor después (`editarOferta`): hay versiones. |
| 3b | Póliza subida por el corredor a la ficha («📄 Subir póliza») | `documentos.extraccion.datos` (sin PII, `guardarExtraccion`) | **10** (las 10 con `primaAnual`) | Puede ser una póliza NUESTRA (ya en CIMA) o de la competencia. |
| 3c | Póliza declarada por el cliente en el portal | `portal_poliza_declarada` (sin `correduria_id`: se llega por `portal_vinculo`) | 17 (5 identidades); **8 con prima** y no eliminadas (comercio 5, hogar 2, moto 1) | Prima DECLARADA (redondeos, puede ser semestral). La escribe el portal, cuyo rol no debe tocar este almacén. |
| 3d | Competencia del volcado histórico | `polizas.poliza_competencia` (jsonb `{aseguradora, nPoliza, prima}`) | **619 con prima** (prima en texto); 1.221 de 1.224 son del volcado (leads). Vencimientos sobre todo 2023 (326) y 2024 (217) | Sin coberturas ni nivel; antigua; de leads. Sesgo fuerte. |
| 4 | Primas reales de la cartera CIMA (renovaciones) | `poliza_recibos` (clase `CA` renovación / `NP` nueva producción) de pólizas vivas | 168 pólizas vivas por origen; **118 con algún CA/NP**; 405 recibos CA+NP | No hay «prima de la anualidad»: se DERIVA por aniversario (`evolucionPrima()` de `module-seguros/prima-evolucion.ts`; regla 10 de `correduria-crm`). La mayoría dará `sin_datos` en la anualidad anterior. La ingesta es del repo de Manuel (rol `crm_seguros`): **no hay un punto de escritura en central donde enganchar**. |
| 5 | Manual (precio por teléfono) | No existe | 0 | — |

Conclusión: la tabla nueva **no es un respaldo** (los datos ya están): es una **proyección normalizada, idempotente
y append-only** de cada precio a UNA forma, con compañía DGS, nivel, perfil agregado sin PII y grupo de comparación.
Se escribe en caliente donde hay punto de escritura en central y, **siempre**, por un barrido nocturno idempotente que
recoge lo que el enganche en caliente no escribió (fallo, despliegue a medias, fuente sin enganche). El barrido es la
garantía de «no se pierde ninguno»; el enganche en caliente solo adelanta el dato.

---

## 1. La tabla: `seguros.observaciones_precio`

Nombre: `observaciones_precio` (una fila = «la compañía X dio (o no dio) el precio P para el riesgo R en la fecha F,
y lo sabemos por la fuente S»). No `precios` a secas: ya hay `tarificacion_precios` y se confundiría.

### 1.1 Columnas

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `correduria_id` | uuid NOT NULL → `corredurias(id)` | Multi-tenant. Toda lectura filtra por ella (`lib/tenant`, cepo de aislamiento). |
| `fuente` | text NOT NULL, CHECK | `avant2` · `rpa` · `oferta_pdf` · `poliza_competencia` · `declarada_portal` · `competencia_volcado` · `cima_renovacion` · `manual` |
| `origen_tabla` | text NOT NULL, CHECK | `tarificacion_precios` · `tarificaciones` (fallos) · `oportunidad_oferta` · `documentos` · `portal_poliza_declarada` · `polizas` · `manual` |
| `origen_id` | uuid NULL | Id de la fila de origen. NULL **solo** tras desvincular (§5.1) o en `manual`. |
| `origen_subclave` | text NOT NULL DEFAULT `''` | Lo que distingue varias observaciones de una misma fila: compañía del fallo, inicio de la anualidad CIMA (`2025-10-01`)… |
| `clave_origen` | text NOT NULL | `fuente|origen_tabla|origen_id|origen_subclave` (o `manual|<uuid de la petición>`). **Idempotencia** (§1.3). |
| `huella_valores` | text NOT NULL | md5 de los campos de valor (compañía, prima, nivel, coberturas, resultado). Un re-proceso con los mismos valores no escribe; con valores distintos escribe versión nueva. |
| `sustituye_a` | uuid NULL → self | Versión anterior de la misma `clave_origen` (corrección del corredor, re-proceso del parser de Avant2). |
| `resultado` | text NOT NULL, CHECK | `precio` · `rechazo_compania` (la compañía AFIRMA que no da precio: `fallos` de Avant2) · `sin_precio_no_concluyente` (no hubo precio y no sabemos por qué: fallo del bot) · `anulada` (la observación era un error de lectura: oferta descartada, declarada eliminada) |
| `motivo_codigo` | text NULL | Solo con `rechazo_compania`/`sin_precio_no_concluyente`: CÓDIGO clasificado (p. ej. `riesgo_no_aceptado`, `sin_precio`, `edad_fuera_norma`). **Nunca el texto del vendor/portal** (puede traer datos personales). |
| `compania_dgs` | text NULL → `companias_dgs(codigo_dgs)` | Por `resolverCompania()` (`module-seguros/defensa-cartera.ts:138`) contra el catálogo. NULL si no resuelve. |
| `compania_texto` | text NOT NULL | El nombre tal como llegó (`allianz`, `Reale`). Nombre de compañía, no PII. |
| `compania_resolucion` | text NOT NULL, CHECK | `resuelta` · `ambigua` · `sin_resolver`. Una no resuelta se GUARDA igual (no se pierde) y no entra en el argumentario por compañía hasta resolverse. |
| `ramo` | text NOT NULL, CHECK | `auto` · `moto` · `patinete` · `hogar` · `comunidades` · `comercio` · `rc` · `vida` · `salud` · `decesos` · `otro` |
| `producto`, `modalidad`, `categoria` | text NULL | Tal cual (vocabulario del vendor/portal). |
| `nivel` | text NOT NULL DEFAULT `'sin clasificar'` | **`nivelDeOferta()` de `apps/asegura/lib/tarificacion-niveles.ts:159`** (los cuatro de vehículo; el compuesto de hogar). Nunca se inventa: sin datos → `sin clasificar` y no compite. |
| `nivel_fuente` | text NULL | `categoria` · `modalidad` · `producto` · `coberturas` · `corredor` (manual) |
| `nivel_version` | smallint NOT NULL DEFAULT 1 | Versión del clasificador. Si cambia la regla, el barrido re-clasifica y escribe versión nueva (no se reescribe la vieja). |
| `prima_anual_cents` | bigint NULL, CHECK > 0 | **Obligatoria si `resultado='precio'`** (CHECK). Prima ANUAL TOTAL (con impuestos/consorcio) en céntimos. Nunca 0 inventado. |
| `prima_tipo` | text NOT NULL DEFAULT `'total'`, CHECK `total`·`neta` | Por si una fuente solo trae neta (no se mezclan en una comparación). |
| `forma_pago` | text NULL, CHECK `anual`·`semestral`·`trimestral`·`mensual` | NULL = no consta. La prima es siempre la anual; esto explica recargos de fraccionamiento. |
| `franquicia_cents` | bigint NULL | NULL = no consta (≠ 0). |
| `coberturas` | jsonb NULL | Resumen por CLAVE de catálogo `{clave: 'si'|'no'|'no_consta'}` (de `clasificarCoberturas`). Nunca textos libres. NULL = no leídas (≠ `{}`). |
| `firmeza` | text NOT NULL, CHECK | `firme` · `estimado` · `condicionado` (los de `firmezaDe`/RPA) · `declarada` (cliente) · `historica` (volcado) · `cobrada` (CIMA: prima de un recibo) · `telefonica` (manual) |
| `coherencia` | text NOT NULL DEFAULT `'no_revisada'`, CHECK `ok`·`incoherente`·`no_revisada` | Avant2: `revisarCoherenciaCotizacion()`. |
| `observada_at` | timestamptz NOT NULL | A qué fecha se refiere el precio. |
| `fecha_tipo` | text NOT NULL, CHECK | `cotizada` (Avant2/RPA/manual) · `leida` (subida del documento) · `efecto_anualidad` (CIMA) · `vencimiento_declarado` (volcado/portal sin otra fecha) |
| `fecha_efecto` | date NULL | Efecto del riesgo cotizado o de la anualidad. NULL = no consta. |
| `grupo_comparacion` | text NULL | HMAC (64 hex) del «mismo encargo»: misma oportunidad (o póliza o ficha si no hay oportunidad) + ramo + `riesgo_huella`. Opaco: no permite volver a la persona. NULL = sin secreto o sin ancla (la observación es «suelta»). |
| `ancla_riesgo` | text NULL | HMAC de la LÍNEA de riesgo (póliza CIMA ↔ oportunidad de renovación ↔ sus tarificaciones). Une «lo que paga hoy en CIMA» con «lo que le cotizamos para renovar». |
| `riesgo_huella` | text NULL | HMAC del riesgo fino SIN PII (código de vehículo o marca+modelo+versión, CP, m², capitales, año). Solo para igualdad dentro del grupo; nunca se muestra. |
| `provincia` | char(2) NULL | Dos primeras cifras del CP (`41`). Columna aparte para indexar. |
| `perfil` | jsonb NOT NULL DEFAULT `'{}'` | **Lista blanca CERRADA por CHECK** (§1.2). Tramos, nunca valores exactos de persona. |
| `evidencia_documento_id` | uuid NULL | PDF de la compañía/proyecto/póliza (`documentos.id`) para «documentado». Se desvincula con la fuente. |
| `creado_por` | text NOT NULL | `sistema:avant2`, `sistema:rpa`, `sistema:barrido`, `corredor:<id de cuenta>` |
| `creado_at` | timestamptz NOT NULL DEFAULT now() | |
| `desvinculada_at` | timestamptz NULL | §5.1 |

**No hay** `cliente_id`, `poliza_id`, `oportunidad_id`, nombre, NIF, matrícula, bastidor, nº de póliza, dirección,
fechas de nacimiento ni texto libre. El vínculo con la persona, si hace falta (ir a la oportunidad desde el cuadro),
se resuelve **en asegura** por `origen_tabla` + `origen_id`, filtrando por `correduria_id`, y no cruza el puerto.

### 1.2 Perfil de riesgo agregado (`perfil`, lista blanca)

Claves permitidas (el CHECK rechaza cualquier otra; el helper puro `perfilAgregado(ramo, riesgo)` de
`module-seguros` las calcula y lleva test):

- Vehículo (auto/moto/patinete): `conductor_edad_tramo` (`18-24`·`25-29`·`30-39`·`40-49`·`50-59`·`60-69`·`70+`),
  `carne_antiguedad_tramo` (`0-1`·`2-4`·`5-9`·`10+`), `vehiculo_antiguedad_tramo` (`0-2`·`3-5`·`6-10`·`11-15`·`16+`),
  `vehiculo_marca` (normalizada), `vehiculo_segmento` (tramo de cv/cc), `combustible`, `uso`, `garaje` (sí/no),
  `anios_sin_siniestros_tramo`.
- Hogar/comunidades/comercio: `vivienda_tipo` (piso/unifamiliar/adosado…), `vivienda_uso` (habitual/secundaria/alquiler),
  `regimen` (propietario/inquilino), `m2_tramo` (`<60`·`60-89`·`90-119`·`120-179`·`180+`), `anio_construccion_tramo`
  (por décadas), `capital_continente_tramo`, `capital_contenido_tramo` (tramos de 25.000/10.000 €).
- Personas (vida/salud/decesos): `edad_tramo`, `asegurados_n`, `capital_tramo`, `fumador`.

Modelo y versión exactos **no** van al perfil (cuasi-identificadores en una muestra de una provincia): van solo dentro
de `riesgo_huella` (HMAC). Clave ausente = no se sabe (nunca `'otro'`/`'N/A'` de cajón: se omite la clave).

### 1.3 Idempotencia y versiones

- `UNIQUE (correduria_id, clave_origen, huella_valores)`: un re-proceso, el barrido nocturno y el enganche en caliente
  del mismo precio con los mismos valores → `ON CONFLICT DO NOTHING`. Cero duplicados.
- Valores distintos para la misma `clave_origen` (el corredor corrige la prima leída; el parser de Avant2 mejora y se
  re-procesa con `GET /api/operador/codeoscopic/reproceso`; cambia `nivel_version`) → fila NUEVA con `sustituye_a` = la
  vigente. La lectura toma, por `clave_origen`, la última por `creado_at`; si es `anulada`, la observación no cuenta.
- Las copias (2b, 2c y las ofertas de `oportunidad_oferta` cuyo `datos_extra.origen` es `rpa`, `avant2` o de
  renovación) **no se proyectan nunca**: la fuente canónica de un precio de bot o de Avant2 es `tarificacion_precios`.
  Regla pura `esCopiaDePrecio(oferta)` con test.
- Avant2 y bot de la MISMA compañía y nivel en el mismo grupo **no son duplicados**: son dos canales (lo que hoy mide
  `parejasBotAvant2`). Se conservan las dos.

### 1.4 Append-only

Trigger `BEFORE UPDATE OR DELETE` + `BEFORE TRUNCATE`: rechaza DELETE y TRUNCATE; un UPDATE solo se admite si lo único
que cambia es `origen_id`/`evidencia_documento_id` → NULL y `desvinculada_at` → no NULL (§5.1). Mismo patrón que
`consent_logs`/`cliente_merge_log` (triggers `*_reject_modification`).

### 1.5 Índices

- `UNIQUE (correduria_id, clave_origen, huella_valores)` (idempotencia).
- `(correduria_id, ramo, nivel, observada_at DESC) WHERE resultado = 'precio'` — segmentos y el cuadro.
- `(correduria_id, grupo_comparacion) WHERE grupo_comparacion IS NOT NULL` — parejas.
- `(correduria_id, compania_dgs, ramo, observada_at DESC)` — argumentario por compañía.
- `(correduria_id, fuente, origen_tabla, origen_id)` — barrido («¿esta fila ya está proyectada?») y desvinculación.
- `(correduria_id, ancla_riesgo) WHERE ancla_riesgo IS NOT NULL`.

### 1.6 RLS, roles y quién lee

- `ENABLE ROW LEVEL SECURITY`, sin políticas (nadie sin BYPASSRLS lee). `REVOKE ALL … FROM PUBLIC, anon,
  authenticated, crm_seguros` (la ingesta de Manuel recibe DML en `seguros` por privilegios por defecto: se le quita,
  como en `oportunidad_oferta`).
- `GRANT SELECT, INSERT` + `UPDATE (origen_id, evidencia_documento_id, desvinculada_at)` a `prisma_seguros`. Sin DELETE.
- **Escribe solo asegura** (`prisma_seguros`). `prisma_asegura_portal` NO recibe nada: las declaradas las proyecta el
  barrido de asegura (§2.6). `prisma_plataforma` NO recibe nada: plataforma lee por `/api/operador/precios/*` (regla de
  la app: la pantalla vive en plataforma, el dato se sirve por el puerto).
- `prisma_seguros` tiene BYPASSRLS: **la garantía de aislamiento es el código** (`correduria_id` en cada sentencia;
  la tabla tiene `correduria_id`, así que entra sola en el cepo `test/regression-asegura-aislamiento.test.ts`, que lee
  el DDL — verificarlo al aplicar).

### 1.7 Retención y tamaño

- Es dato estadístico seudonimizado (sin identificadores directos; el vínculo es un id interno de otra tabla). Mientras
  la fila origen existe, su retención es la del origen; cuando el origen se purga o el cliente ejerce supresión, la
  observación se **desvincula** (§5.1) y queda como dato agregado sin vuelta a la persona. Se conserva sin plazo como
  histórico de mercado (decisión de Alberto; alternativa: 6 años).
- Tamaño: backfill ≈ 528 + 188 precios + 24 rechazos + 8 declaradas + 10 pólizas leídas + ~150-250 anualidades CIMA
  (estimación: se mide con la función pura en ensayo) ≈ **0,9-1,0 mil filas** (+619 si se incluye el volcado).
  Crecimiento al ritmo actual (~40-80 tarificaciones/mes × ~5-7 precios): **300-600 filas/mes**, ~1-2 KB/fila →
  **< 20 MB/año**. Irrelevante para la BD.

---

## 2. Escritores: dónde enganchar cada fuente

Un único módulo en asegura, `apps/asegura/lib/observaciones-precio.ts`, con funciones que **NO lanzan**: devuelven
`{ escritas, omitidas, error: string | null }`, hacen `console.error('[observaciones-precio] …')` con el id de la fila
origen y el mensaje (sin URL: `registrarErrorCartera()`-like) y nunca tocan la transacción del flujo principal (van
DESPUÉS del commit). La transformación es pura (`module-seguros/src/observacion-precio.ts`: `observacionesDeTarificacion`,
`observacionDeOferta`, `observacionDeDeclarada`, `observacionesDeAnualidades`, `perfilAgregado`, `claveOrigen`,
`huellaValores`, `esCopiaDePrecio`) con test. **El enganche en caliente y el barrido llaman a la MISMA función**: lo que
escribe uno lo escribe el otro, byte a byte, y el UNIQUE hace el resto.

### 2.1 Avant2 / Codeoscopic
- **Dónde:** `apps/asegura/lib/codeoscopic/cotizaciones.ts:394-398`, dentro de `guardarSinTumbar()`, tras
  `anotarIncoherencias(e, …)` y solo si `!e.simulado`: `await anotarObservacionesTarificacion(e.correduriaId, cotizacionId)`.
- **Qué:** relee `tarificaciones` + `tarificacion_precios` por id (no usa la entrada en memoria: así caliente y barrido
  son idénticos). Un precio → `resultado='precio'`; cada elemento de `fallos` con `tambienDioPrecio=false` →
  `rechazo_compania` con `motivo_codigo` clasificado (subclave = compañía normalizada). `fallos` NULL → **no se escribe
  ningún rechazo** (no se sabe). Perfil desde `peticion` (formato Avant2: `risk.*`, conductor) → solo tramos.
- **Ojo:** `prima_eur` se toma como anual total; **verificar en 3 respuestas crudas** (`tarificaciones.respuesta`) que es
  la prima total anual y no el primer recibo cuando `forma_pago` no es anual (hoy `meses` es NULL o 12 en todas; formas
  vistas: `Compañía/Anual` y NULL).

### 2.2 Bots RPA
- **Dónde (precio):** `apps/asegura/lib/tarificador.ts`, en `registrarResultado()`, después del commit, junto al bloque
  «APRENDER» (≈ líneas 873-877): si `interno.res.estadoTrabajo === 'ok' && interno.res.tarificacionId`, llamar a
  `anotarObservacionesTarificacion(correduriaId, tarificacionId, { perfil: perfilAgregado(t.ramo, interno.traza.t.riesgo) })`.
- **Por qué ahí y no en el barrido solo:** el riesgo del trabajo se purga en la MISMA transacción
  (`purgarRiesgoTrabajos`, línea 866) y `tarificaciones.peticion` guarda solo la lista blanca (`riesgoSinDatosPersonales`,
  sin conductor). La copia en memoria `interno.traza.t` es la última ocasión de calcular la edad en TRAMO. El barrido,
  para RPA, deja `conductor_edad_tramo` ausente (= no se sabe), nunca la inventa.
- **Dónde (sin precio), fase 2:** tras `marcarFallo` (línea 831) solo si `codigoDeError(...) === 'sin_precio'` →
  `sin_precio_no_concluyente`. **Nunca `rechazo_compania` desde el bot**: `RE_SIN_PRECIO`
  (`tarificador-error-codigo.ts:57`) casa cualquier mensaje con «precio» y no distingue «la compañía no acepta el
  riesgo» de «no encontré el precio en la pantalla». El mensaje del error NO se copia (solo el código).
- **Guard RPA:** este diseño no añade ningún campo de diagnóstico ni de inventario; si en el futuro se guardase texto
  del portal (p. ej. el literal de un rechazo), pasa por `redactarValoresInventario` y revisión de `agente-architect`.

### 2.3 Oferta o póliza actual subida a una oportunidad (PDF)
- **Dónde:** `apps/asegura/lib/oportunidad-ofertas.ts:141` (tras `oportunidadOferta.create` en `subirOferta`, solo si
  `lectura.ok` y hay `primaTotal`) y en `editarOferta()` (`:150`) cuando cambian compañía/prima/garantías (versión nueva)
  o se descarta (versión `anulada`).
- `rol='actual'` → `fuente='poliza_competencia'`; `rol='oferta'` con documento → `oferta_pdf`. Las de
  `datos_extra.origen` ∈ {`rpa`, `avant2`, renovación} se saltan (`esCopiaDePrecio`).
- `evidencia_documento_id` = `documento_id`. `firmeza='estimado'` (oferta) / `cobrada` NO (es lo que dice el PDF, no un
  cobro): `declarada`.

### 2.4 Póliza subida a la ficha («📄 Subir póliza»)
- **Dónde:** al final de `guardarExtraccion()` (`apps/asegura/lib/oportunidad-documento.ts:803`, después del `update`),
  llamada desde `app/api/operador/leer-documento/route.ts:109` y `oportunidad-documento.ts:176`.
- Solo si `extraccion.datos.primaAnual` > 0 y el documento **no** cuelga de una póliza viva de la cartera (si cuelga,
  ese precio ya lo da CIMA: se omitiría un duplicado). `fuente='poliza_competencia'`, `fecha_tipo='leida'`,
  `fecha_efecto` = `datos.fechaEfecto`. Compañía por `codigoEntidadDgs` leído (si es `C\d{4}`) o por nombre.

### 2.5 Manual (precio por teléfono)
- **Dónde:** endpoint nuevo `POST /api/operador/precios/manual` en asegura, envuelto en `auditado()` y con
  `anotarCambio()` + fila en `historial_interno` si cuelga de una oportunidad.
- Exige: compañía RESUELTA a DGS, ramo, prima > 0, nivel elegido de la lista (`NIVELES_VEHICULO` o los de hogar) —
  `nivel_fuente='corredor'`, nunca adivinado—, fecha. Opcional `oportunidadId` (para el grupo) y una nota que **no** se
  guarda en esta tabla (va al historial). `firmeza='telefonica'`. `clave_origen = manual|<id de petición del cliente>`
  (el doble clic no duplica).

### 2.6 Barrido nocturno (la garantía de «no se pierde ninguno»)
- Cron nuevo en asegura `app/api/cron/observaciones-precio` (Bearer `CRON_SECRET`, como los demás), modo **contar** por
  defecto (`ASEGURA_OBSERVACIONES_ACTIVAS=1` para escribir), tandas de 200, por correduría. Hace, en este orden:
  1. `tarificaciones` reales (no simuladas) cuya `(fuente, origen_tabla, origen_id)` no está → `anotarObservacionesTarificacion`.
  2. `oportunidad_oferta` con documento no proyectadas (y versiones nuevas por `updated_at`).
  3. `documentos` con `extraccion.datos.primaAnual` no proyectados.
  4. `portal_poliza_declarada` (correduría por `portal_vinculo`; `eliminada_en` no NULL → `anulada`). El portal NO
     escribe aquí.
  5. **CIMA:** para cada póliza viva (`sqlCarteraViva()`), `evolucionPrima()` sobre sus recibos CA/NP → una observación
     por anualidad COMPLETA (`origen_subclave` = inicio de la anualidad), `firmeza='cobrada'`, `fecha_tipo='efecto_anualidad'`.
     Las incompletas o `sin_datos` **no se escriben** (no se inventa una anualidad). La de hoy se contrasta con
     `primaConRecibos()` en el test. Nivel por las coberturas de CIMA (`poliza_coberturas`) → muchas `sin clasificar`, y
     así se dice.
  6. Latido: «tarificaciones de > 24 h sin observación» > 0 → señal (el enganche en caliente está fallando).
- El ensayo (`?contar=1`) devuelve recuentos por fuente: es la verificación antes de encender.

---

## 3. Backfill desde lo ya guardado

Es **el mismo barrido** en modo escritura sobre todo el histórico (no un script aparte):

| Fuente | Filas candidatas | Comentario |
|---|---|---|
| Avant2 precios | 528 (de 38 cotizaciones reales; las 3 simuladas fuera) | Con nivel por categoría/modalidad: la mayoría clasifica. |
| Avant2 rechazos | 24 en 8 cotizaciones | 31 cotizaciones con `fallos` NULL → 0 rechazos escritos (no se sabe). |
| RPA precios | 188 (Allianz 86, Mapfre 102) | Sin edad de conductor (purgada). Nivel por producto/coberturas. |
| RPA sin precio | fase 2; de 128 `error_definitivo` en tarificar, solo los de código `sin_precio` | No concluyente. |
| Oferta PDF / póliza actual en oportunidad | 0 hoy | Las 148 de `oportunidad_oferta` son copias del bot. |
| Póliza leída en ficha | 10 (todas con `primaAnual`) | Excluir las que cuelgan de póliza viva. |
| Declaradas del portal | 8 con prima | Sí conservan prima; 6 también coberturas. |
| CIMA anualidades | ~150-250 (118 pólizas con CA/NP) | Medir con el ensayo. |
| Volcado `poliza_competencia` | 619 | **Opcional (decide Alberto)**: `firmeza='historica'`, sin nivel. Útil solo como «precio de mercado declarado 2023-2024 por ramo». |

¿Las pólizas de competencia escaneadas conservan prima? **Sí**: las 10 de `documentos.extraccion` tienen `primaAnual`;
de las 17 declaradas del portal, 8 (no eliminadas) la tienen y 6 además coberturas; `oportunidad_oferta` guarda
`prima_total` y `garantias`. Lo que **no** conservan es el nivel ya calculado: se calcula al proyectar.

---

## 4. Lectura: el cuadro de competitividad

Forma genérica servida por asegura (`GET /api/operador/precios/observaciones?ramo=&desde=&hasta=&compania=&fuente=`),
ya deduplicada (última versión por `clave_origen`, sin `anulada`):

```ts
type ObservacionPrecio = {
  id: string
  fuente: 'avant2' | 'rpa' | 'oferta_pdf' | 'poliza_competencia' | 'declarada_portal' | 'competencia_volcado' | 'cima_renovacion' | 'manual'
  resultado: 'precio' | 'rechazo_compania' | 'sin_precio_no_concluyente'
  companiaCodigo: string | null   // DGS; null = sin resolver (se lista aparte, no entra por compañía)
  companiaNombre: string
  ramo: string
  nivel: string                   // 'sin clasificar' no compite
  primaAnualCents: number | null
  firmeza: string
  fecha: string                   // observada_at (ISO) + fechaTipo
  fechaTipo: string
  grupoComparacion: string | null
  anclaRiesgo: string | null
  provincia: string | null
  perfil: Record<string, string | number | boolean>
  documentado: boolean            // hay evidencia_documento_id
}
```

Reglas puras (en `module-seguros`, con test; plataforma solo pinta):

1. **Pareja dentro de grupo** (`parejasEnGrupo`): mismo `grupo_comparacion`, mismo `nivel` (≠ `sin clasificar`), mismo
   `prima_tipo`, |Δ`observada_at`| ≤ 30 días, solo `resultado='precio'`. Por compañía, la más barata de su canal; se
   compara cada compañía con la más barata del grupo. Salida por compañía: grupos en los que cotizó, en cuántos fue la
   más barata, diferencia mediana (€ y %) con la ganadora, y grupos donde **rechazó** (Avant2) o **no hubo precio**
   (bot, no concluyente, contado aparte).
2. **Renovación** (`anclaRiesgo`): la anualidad nueva de CIMA de la compañía X frente a la anterior (subida %) y frente
   a las cotizaciones del mismo ancla en ±60 días. Es el argumento más fuerte («le subisteis un 18 % y la mejor
   alternativa del mismo nivel cuesta un 22 % menos»), porque las dos cifras son reales.
3. **Sueltas por segmento** (`segmentos`): `ramo + nivel + provincia + tramos del perfil + año`; mediana, P25-P75 y `n`.
   **Con `n < 5` el segmento sale como «muestra insuficiente»**, sin cifra.
4. Firmeza: por defecto el cuadro usa `firme`, `estimado`, `condicionado`, `cobrada`, `telefonica`; `declarada` e
   `historica` solo si se piden y siempre etiquetadas.
5. Todo importe con `eur()` (`2.162,49€`); `null` → `—`.

Lo que el cuadro **no** guarda: si el cliente aceptó o no. Eso se lee uniendo por `origen` (oportunidad → estado) en
asegura, si se quiere «perdí esta venta por X €».

---

## 5. Riesgos y cómo se cubren

### 5.1 PII
- Ni nombre, NIF, teléfono, email, matrícula, bastidor, nº de póliza, dirección, fecha de nacimiento ni texto libre:
  el `perfil` tiene lista blanca por CHECK y los HMAC (`grupo_comparacion`, `ancla_riesgo`, `riesgo_huella`) usan un
  secreto del servidor (`requireSecret('ASEGURA_PRECIOS_HUELLA_SECRET')`, **sin fallback**; sin secreto → esas tres
  columnas a NULL, se escribe igual y se avisa en el latido: un precio no se pierde por falta de grupo).
- Desvinculación: cuando `purga-rgpd` (`apps/asegura/app/api/cron/purga-rgpd`) borra documentos o anonimiza un
  prospecto, o el portal registra una supresión, se ejecuta `update … set origen_id = null, evidencia_documento_id = null,
  desvinculada_at = now()` sobre sus observaciones (único UPDATE que admite el trigger). Fase 2, pero el trigger nace ya
  preparado.
- Celdas pequeñas: los segmentos con `n < 5` no dan cifra; para enseñar algo a una compañía solo se sacan agregados.
- `motivo_codigo` es código; el texto del vendor o del portal nunca entra.

### 5.2 Peras con manzanas
- Nivel obligatorio para comparar (`sin clasificar` no compite), `prima_tipo` igual, misma ventana temporal, firmeza
  visible. El nivel lo decide UNA función (`nivelDeOferta`) con `nivel_version`; no se reimplementa en la pantalla.
- Prima anual: hay que verificar que `prima_eur` de Avant2 y la del bot son anuales totales con fraccionamiento
  (pregunta abierta §7). La declarada del portal puede venir semestral (`periodicidad_pago`): se anualiza SOLO si consta
  la periodicidad; si no, `forma_pago` NULL y se etiqueta.
- El bot y Avant2 de la misma compañía pueden dar productos distintos (Mapfre tiene tres «Autos»): la pareja es por nivel,
  no por producto.

### 5.3 Duplicados
- Copias (`oportunidad_oferta` origen bot/Avant2/renovación, `presupuesto_opcion`) no se proyectan: regla pura con test.
- Re-procesos y caliente+barrido: UNIQUE por `clave_origen + huella_valores`.
- Póliza leída que ya es de la cartera CIMA: se omite (lo da CIMA).

### 5.4 Sesgo de muestra (decirlo en la pantalla)
- Riesgos que llegan a la correduría (clientes de Alberto, sobre todo Sevilla): no es «el mercado».
- Bots solo de Allianz y Mapfre; Generali sin un precio de bot; Avant2 solo los productos que publica cada compañía en la
  API. «Mapfre no da precio» puede ser «el bot de Mapfre falla»: por eso el bot nunca escribe `rechazo_compania`.
- Rechazos de Avant2 solo desde el 29/09 (antes, `fallos` NULL).
- Declaradas y volcado: redondeos y precios antiguos; nunca mezclados por defecto.

### 5.5 Fallo del escritor
- El enganche en caliente va fuera de la transacción y no lanza: si falla, el flujo principal (precio guardado, emisión,
  trabajo `ok`) sigue igual. El barrido lo recoge y el latido lo dice. **Qué se rompe si este diseño se equivoca:** nada
  del flujo actual (es una tabla nueva solo de lectura para el resto); el riesgo es un cuadro con cifras infladas por
  duplicados o mal comparadas — por eso las reglas de dedupe y de pareja son puras y con test antes de pintar nada.

---

## 6. Fases

**Fase 0 — empezar a guardar YA (sin pantalla).**
1. Aplicar la migración (§8) en una ventana; ensayo con `BEGIN … ROLLBACK` primero.
2. Módulo puro `module-seguros/src/observacion-precio.ts` + tests (perfil, clave, huella, dedupe de copias, CHECK de
   lista blanca reproducido en TS).
3. `apps/asegura/lib/observaciones-precio.ts` con `anotarObservacionesTarificacion` (no lanza) y enganches §2.1 y §2.2
   (precio). Con esto, **todo precio nuevo de Avant2 y de los bots queda en el almacén desde el día 1**.
4. Barrido nocturno con pasos 1-4 en modo contar → comparar recuentos con §3 → encender. Backfill = el barrido.
- Verificación: tras una tarificación real, `select fuente, count(*) … group by fuente` sube; re-ejecutar el barrido no
  cambia el recuento (idempotencia); un `update` de prima sobre una fila falla (append-only); el cepo de aislamiento
  pasa con la tabla nueva en el DDL.

**Fase 1 — fuentes que faltan.** CIMA (paso 5 del barrido, con ensayo que cuente anualidades), enganches §2.3 y §2.4,
endpoint manual §2.5, RPA `sin_precio_no_concluyente`.

**Fase 2 — lectura.** `GET /api/operador/precios/observaciones` y `/competitividad` (reglas §4 puras), bloque en
plataforma `/correduria` (sección «Datos»), desvinculación en `purga-rgpd` y supresión del portal.

**Fase 3 — opcional.** Volcado `poliza_competencia` (619), si Alberto lo quiere, etiquetado `historica`.

---

## 7. Preguntas abiertas (para Alberto)

1. ¿Retención sin plazo de las observaciones desvinculadas, o 6 años?
2. ¿Incluir el volcado de competencia (619 primas de 2023-2024, sin coberturas)?
3. Tramos del perfil (edad, m², capitales): ¿valen los propuestos?
4. Confirmar con 3 respuestas crudas que `prima_eur` (Avant2 y bot) es la prima anual total también con pago fraccionado.

---

## 8. Migración propuesta — **NO APLICADA**

Fichero previsto: `apps/asegura/prisma/sql/2026-11-07b_observaciones_precio.sql`. Código ANTES que el SQL no hace falta
(tabla nueva): sin la tabla, el escritor detecta `relation does not exist` (estado `sin_migracion`), no escribe y lo dice
en el log/latido; el flujo principal no se entera.

```sql
-- NO APLICADA (diseño 07/11/2026). Almacén append-only de precios observados.
BEGIN;

CREATE TABLE seguros.observaciones_precio (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id          uuid NOT NULL REFERENCES seguros.corredurias(id),
  fuente                 text NOT NULL CHECK (fuente IN ('avant2','rpa','oferta_pdf','poliza_competencia','declarada_portal','competencia_volcado','cima_renovacion','manual')),
  origen_tabla           text NOT NULL CHECK (origen_tabla IN ('tarificacion_precios','tarificaciones','oportunidad_oferta','documentos','portal_poliza_declarada','polizas','manual')),
  origen_id              uuid,
  origen_subclave        text NOT NULL DEFAULT '',
  clave_origen           text NOT NULL CHECK (length(clave_origen) BETWEEN 3 AND 300),
  huella_valores         text NOT NULL CHECK (huella_valores ~ '^[0-9a-f]{32}$'),
  sustituye_a            uuid REFERENCES seguros.observaciones_precio(id),
  resultado              text NOT NULL CHECK (resultado IN ('precio','rechazo_compania','sin_precio_no_concluyente','anulada')),
  motivo_codigo          text CHECK (motivo_codigo IS NULL OR motivo_codigo ~ '^[a-z0-9_]{1,60}$'),
  compania_dgs           text REFERENCES seguros.companias_dgs(codigo_dgs),
  compania_texto         text NOT NULL CHECK (length(compania_texto) BETWEEN 1 AND 120),
  compania_resolucion    text NOT NULL CHECK (compania_resolucion IN ('resuelta','ambigua','sin_resolver')),
  ramo                   text NOT NULL CHECK (ramo IN ('auto','moto','patinete','hogar','comunidades','comercio','rc','vida','salud','decesos','otro')),
  producto               text,
  modalidad              text,
  categoria              text,
  nivel                  text NOT NULL DEFAULT 'sin clasificar',
  nivel_fuente           text CHECK (nivel_fuente IS NULL OR nivel_fuente IN ('categoria','modalidad','producto','coberturas','corredor')),
  nivel_version          smallint NOT NULL DEFAULT 1,
  prima_anual_cents      bigint CHECK (prima_anual_cents IS NULL OR prima_anual_cents > 0),
  prima_tipo             text NOT NULL DEFAULT 'total' CHECK (prima_tipo IN ('total','neta')),
  forma_pago             text CHECK (forma_pago IS NULL OR forma_pago IN ('anual','semestral','trimestral','mensual')),
  franquicia_cents       bigint CHECK (franquicia_cents IS NULL OR franquicia_cents >= 0),
  coberturas             jsonb CHECK (coberturas IS NULL OR jsonb_typeof(coberturas) = 'object'),
  firmeza                text NOT NULL CHECK (firmeza IN ('firme','estimado','condicionado','declarada','historica','cobrada','telefonica')),
  coherencia             text NOT NULL DEFAULT 'no_revisada' CHECK (coherencia IN ('ok','incoherente','no_revisada')),
  observada_at           timestamptz NOT NULL,
  fecha_tipo             text NOT NULL CHECK (fecha_tipo IN ('cotizada','leida','efecto_anualidad','vencimiento_declarado')),
  fecha_efecto           date,
  grupo_comparacion      text CHECK (grupo_comparacion IS NULL OR grupo_comparacion ~ '^[0-9a-f]{64}$'),
  ancla_riesgo           text CHECK (ancla_riesgo IS NULL OR ancla_riesgo ~ '^[0-9a-f]{64}$'),
  riesgo_huella          text CHECK (riesgo_huella IS NULL OR riesgo_huella ~ '^[0-9a-f]{64}$'),
  provincia              char(2) CHECK (provincia IS NULL OR provincia ~ '^(0[1-9]|[1-4][0-9]|5[0-2])$'),
  perfil                 jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
                           jsonb_typeof(perfil) = 'object'
                           AND (perfil - ARRAY[
                             'conductor_edad_tramo','carne_antiguedad_tramo','vehiculo_antiguedad_tramo','vehiculo_marca',
                             'vehiculo_segmento','combustible','uso','garaje','anios_sin_siniestros_tramo',
                             'vivienda_tipo','vivienda_uso','regimen','m2_tramo','anio_construccion_tramo',
                             'capital_continente_tramo','capital_contenido_tramo',
                             'edad_tramo','asegurados_n','capital_tramo','fumador'
                           ]::text[]) = '{}'::jsonb),
  evidencia_documento_id uuid,
  creado_por             text NOT NULL CHECK (length(creado_por) BETWEEN 1 AND 120),
  creado_at              timestamptz NOT NULL DEFAULT now(),
  desvinculada_at        timestamptz,
  CONSTRAINT observacion_precio_con_prima CHECK (resultado <> 'precio' OR prima_anual_cents IS NOT NULL),
  CONSTRAINT observacion_precio_motivo CHECK (motivo_codigo IS NULL OR resultado IN ('rechazo_compania','sin_precio_no_concluyente')),
  CONSTRAINT observacion_precio_origen CHECK (origen_id IS NOT NULL OR desvinculada_at IS NOT NULL OR origen_tabla = 'manual')
);

COMMENT ON TABLE seguros.observaciones_precio IS
  'Append-only. Un precio (o la falta de él) de una compañía para un riesgo, normalizado: DGS, nivel (tarificacion-niveles.ts), '
  'prima anual en céntimos, perfil agregado SIN PII (lista blanca por CHECK). Spec docs/superpowers/specs/2026-11-07-almacen-precios.md';

CREATE UNIQUE INDEX observaciones_precio_idem   ON seguros.observaciones_precio (correduria_id, clave_origen, huella_valores);
CREATE INDEX observaciones_precio_segmento      ON seguros.observaciones_precio (correduria_id, ramo, nivel, observada_at DESC) WHERE resultado = 'precio';
CREATE INDEX observaciones_precio_grupo         ON seguros.observaciones_precio (correduria_id, grupo_comparacion) WHERE grupo_comparacion IS NOT NULL;
CREATE INDEX observaciones_precio_compania      ON seguros.observaciones_precio (correduria_id, compania_dgs, ramo, observada_at DESC);
CREATE INDEX observaciones_precio_origen        ON seguros.observaciones_precio (correduria_id, fuente, origen_tabla, origen_id);
CREATE INDEX observaciones_precio_ancla         ON seguros.observaciones_precio (correduria_id, ancla_riesgo) WHERE ancla_riesgo IS NOT NULL;

-- Append-only: sin DELETE ni TRUNCATE; el único UPDATE es la desvinculación (origen/evidencia a NULL + sello).
CREATE FUNCTION seguros.observaciones_precio_solo_desvincular() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'observaciones_precio es append-only (% no permitido)', TG_OP;
  END IF;
  IF NEW.origen_id IS NOT NULL AND NEW.origen_id IS DISTINCT FROM OLD.origen_id
     OR NEW.evidencia_documento_id IS NOT NULL AND NEW.evidencia_documento_id IS DISTINCT FROM OLD.evidencia_documento_id
     OR NEW.desvinculada_at IS NULL
     OR (to_jsonb(NEW) - ARRAY['origen_id','evidencia_documento_id','desvinculada_at'])
        IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['origen_id','evidencia_documento_id','desvinculada_at']) THEN
    RAISE EXCEPTION 'observaciones_precio: solo se admite desvincular (origen y evidencia a NULL con desvinculada_at)';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER observaciones_precio_no_update   BEFORE UPDATE ON seguros.observaciones_precio FOR EACH ROW EXECUTE FUNCTION seguros.observaciones_precio_solo_desvincular();
CREATE TRIGGER observaciones_precio_no_delete   BEFORE DELETE ON seguros.observaciones_precio FOR EACH ROW EXECUTE FUNCTION seguros.observaciones_precio_solo_desvincular();
CREATE TRIGGER observaciones_precio_no_truncate BEFORE TRUNCATE ON seguros.observaciones_precio FOR EACH STATEMENT EXECUTE FUNCTION seguros.observaciones_precio_solo_desvincular();

ALTER TABLE seguros.observaciones_precio ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON seguros.observaciones_precio FROM PUBLIC, anon, authenticated, crm_seguros;
GRANT SELECT, INSERT ON seguros.observaciones_precio TO prisma_seguros;
GRANT UPDATE (origen_id, evidencia_documento_id, desvinculada_at) ON seguros.observaciones_precio TO prisma_seguros;

COMMIT;

-- ── Ensayo (dentro de BEGIN … ROLLBACK, con la correduría real) ─────────────
-- BEGIN;
--   INSERT … (fila de prueba resultado='precio', prima 30000)              → ok
--   INSERT … misma clave_origen + huella_valores ON CONFLICT DO NOTHING    → 0 filas
--   UPDATE … SET prima_anual_cents = 1                                      → ERROR (append-only)
--   DELETE …                                                                → ERROR
--   INSERT … perfil '{"nif":"x"}'                                           → ERROR (lista blanca)
--   INSERT … resultado='precio', prima NULL                                 → ERROR
--   UPDATE … SET origen_id = NULL, desvinculada_at = now()                  → ok
-- ROLLBACK;

-- ── Rollback (si hay que retirarla; sin datos de nadie más que dependan de ella) ──
-- BEGIN;
--   DROP TABLE seguros.observaciones_precio;
--   DROP FUNCTION seguros.observaciones_precio_solo_desvincular();
-- COMMIT;
```

Notas de la migración:
- El mensaje del `RAISE` no escribe `seguros.` (el cepo de aislamiento marca esa forma en texto de mensajes).
- `to_jsonb(NEW) - …` compara todas las columnas salvo las tres desvinculables: una columna nueva en el futuro queda
  protegida sin tocar el trigger.
- Antes de aplicar: comprobar que `regression-asegura-aislamiento` ve la tabla (tiene `correduria_id`) y que no hay
  plantilla SQL que la toque sin filtrarla.
