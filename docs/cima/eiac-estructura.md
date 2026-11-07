# EIAC V07.1 — estructura de mensajes (tipos complejos y campos)

> Fuente: **`TiposEIAC-V07-1_V06.xsd`** (cabecera del XSD: `TIREA V07-1_V06 2026-09-04T09:07`, namespace `http://www.tirea.es/EIAC/ProcesosEIAC`), el esquema oficial publicado por TIREA/CIMA;
> cruzado con `209_IAC_ESP_DOC_DOCS-ESTANDAR-EIAC-V07-1_V05` (03/06/2026, ver `README.md`). Los § son los del PDF (su numeración interna `13.x` no coincide con el índice; se cita tal cual figura en el PDF).
> Generado literalmente del XSD: nombre exacto, tipo, longitud/formato, ocurrencias y descripción. **Obligatoriedad = `minOccurs`** (1 = obligatorio, 0 = opcional). Las obligatoriedades *condicionadas* no están en el esquema: figuran en la Descripción (y en Normas de uso).
> `n_tipo_X` = lista de `tipo_X` (1..unbounded). Los tipos `claves_*` son listas cerradas: ver `eiac-claves*.md` por el mismo nombre (`grep -n 'claves_claseinmueble' docs/cima/`).
> Cómo buscar un campo: `grep -n '^| tipo_riesgohogar\.' docs/cima/eiac-estructura.md`  ·  un tipo: `grep -n '^### tipo_vehiculo' docs/cima/eiac-estructura.md`.

## Índice por objeto

- Fichero raíz y cabecera: `tipo_cabecera`, `tipo_objeto`, `tipo_proceso`, `tipo_detalleproceso`, `tipo_lote`, `tipo_codigosid`.
- **Póliza** (§8.1): `tipo_poliza` → `tipo_datospoliza`, `tipo_ramo`, `tipo_mediador`, `tipo_fechas`, `tipo_importespoliza`, `tipo_importes`, `tipo_importesdec`, `tipo_comision`, `tipo_gestioncobro`, `tipo_formapago`, `tipo_cuentacorriente`, `tipo_persona`, `tipo_personafisica`, `tipo_personajuridica`, `tipo_domicilio`, `tipo_contacto`, `tipo_suplementopoliza`, `tipo_anulacionpoliza`, `tipo_suspensionpoliza`, `tipo_coaseguro`, `tipo_polizacolectiva`, `tipo_regularizacion`, `tipo_pb`, `tipo_cobertura`, `tipo_capital`, `tipo_limite`, `tipo_franquicia`.
- **Riesgos** (`tipo_riesgo` elige uno): `tipo_riesgoautos` (+`tipo_vehiculo`, `tipo_conductor`, `tipo_accesoriovehiculo`), `tipo_riesgohogar` / `tipo_riesgocomunidades` / `tipo_riesgocomercios` / `tipo_riesgoindustriales` / `tipo_otrosmultirriesgos` (extienden `tipo_riesgomultirriesgo`), `tipo_riesgoaccidentes`, `tipo_riesgoasistenciasanitaria`, `tipo_riesgoasistenciaviaje`, `tipo_riesgocaucion`, `tipo_riesgoconstruccion`, `tipo_riesgocredito`, `tipo_riesgodecesos`, `tipo_riesgodefensajuridica`, `tipo_riesgoembarcaciones`, `tipo_riesgoincendios`, `tipo_riesgoperdidasdiversas`, `tipo_riesgoRC`, `tipo_riesgosalud`, `tipo_riesgotransportes`, `tipo_riesgovida`, `tipo_otrosdanos`, `tipo_otrosriesgos`.
- **Recibo** (§8.2): `tipo_recibo` → `tipo_datosrecibo`, `tipo_fechasrecibo`, `tipo_importesrecibo`, `tipo_movimientorecibo`, `tipo_anulacionrecibo`, `tipo_reciborelacionado`, `tipo_riesgorecsin`, `tipo_errordevolucion`.
- **Siniestro** (§8.3): `tipo_siniestro` → `tipo_datossiniestro`, `tipo_asegurado`, `tipo_contrario`, `tipo_situacionsiniestro`, `tipo_accionsiniestro`, `tipo_pagosiniestro`, `tipo_expediente`, `tipo_convenio`, `tipo_autoridad`, `tipo_figura`.
- **Liquidación** / **Cuenta de efectivo** (§8.4-8.5): `tipo_liquidacion`, `tipo_datosliquidacion`, `tipo_movimientoliquidacion`, `tipo_importeliquidacion`, `tipo_movimientocontable`, `tipo_cuentaefectivo`, `tipo_saldos`, `tipo_conceptos`, `tipo_periodo`.
- **Mensaje** (§8.6): `tipo_mensaje`, `tipo_datosmensaje`, `tipo_mensajesiniestro`, `tipo_adjunto`.

## Tipos simples con formato (§10.1)

| Tipo | Base | Restricción (XSD) |
|---|---|---|
| _char_20 | xs:string | max 20 |
| _char_40 | xs:string | max 40 |
| _char_50 | xs:string | max 50 |
| _char_80 | xs:string | max 80 |
| _char_120 | xs:string | max 120 |
| _char_150 | xs:string | max 150 |
| _t_bic | xs:string | pattern [A-Z\d]{8}\|[A-Z\d]{11} |
| _t_codigoDGS | xs:string | pattern [A-Z/\-\d\s]{5,22} |
| _t_edad | xs:unsignedInt | rango 1..99 |
| _t_email | xs:token | long 1-80, pattern ([0-9a-zA-Z\^{}~+\-_]+\.{0,1})*[0-9a-zA-Z\^{}~+\-_]+@\w+((\.\|-\|_)\w+)* |
| _t_idioma | xs:string | pattern [a-z]{2} |
| _t_iban | xs:string | pattern [A-Z\d]{15,32} |
| _t_matricula | xs:string | pattern [A-Z\-\d]{4,12} |
| _t_moneda | xs:string | pattern [A-Z]{3} |
| _t_pais | xs:string | pattern [A-Z]{3} |
| _t_provincia | xs:unsignedInt | rango 0..52 |
| _t_telefono | xs:token | pattern [0-9]{9} |
| _t_CnoCnae | xs:string | pattern \d{2,4} |
| _t_num2dec | xs:decimal | pattern -?[0-9]+(\.[0-9]{1,2})? |
| _t_num2dou | xs:double | pattern -?[0-9]+(\.[0-9]{1,2})?\|INF |
| _t_usovehiculo | xs:string | pattern [A\|B]([0-1][0-9]\|2[0-1]) |
| _t_codigoDGSea | xs:string | pattern [A-Z](\d{4}) |

## Tipos complejos

### tipo_cabecera  (PDF §6.1)
_Datos de la cabecera del fichero._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_cabecera.FechaCreacion | xs:dateTime |  | 1 | 1 | sequence |  | Fecha de creación del documento XML. |
| tipo_cabecera.Emisor | tipo_codigosid |  | 1 | 1 | sequence |  | Emisor del documento. |
| tipo_cabecera.Receptor | tipo_codigosid |  | 1 | 1 | sequence |  | Destinatario del documento |
| tipo_cabecera.DatosProcesos | tipo_proceso |  | 1 | 1 | sequence |  | Datos de los procesos cuya información se incluye. |
| tipo_cabecera.DatosLote | tipo_lote |  | 0 | 1 | sequence |  | Información sobre el lote. |
| tipo_cabecera.Version | claves_version | clave | 1 | 1 | sequence | claves_version (§13.3.57) | Versión del estándar que valida el documento. |

### tipo_proceso  (PDF §7.1)
_Procesos cuya información se incluye._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_proceso.DetalleProcesos | n_tipo_detalleproceso |  | 1 | 1 | choice#1 |  | Lista de detalle de procesos. |
| tipo_proceso.CodigoProceso | claves_codigoproceso | clave | 1 | 1 | choice#1 | claves_codigoproceso (§13.1.1) | Identificador del proceso |

### tipo_detalleproceso  (PDF §7.2)
_Detalle de proceso._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_detalleproceso.ClasePoliza | claves_clasepoliza | clave | 1 | 1 | sequence > choice#1 | claves_clasepoliza (§13.3.11) | Clase de póliza incluidas en el proceso |
| tipo_detalleproceso.ClaseRecibo | claves_claserecibo | clave | 1 | 1 | sequence > choice#1 | claves_claserecibo (§13.3.12) | Clase de recibo incluidos en el proceso |
| tipo_detalleproceso.ClaseSiniestro | claves_clasesiniestro | clave | 1 | 1 | sequence > choice#1 | claves_clasesiniestro (§13.3.45) | Clase de siniestros incluidos en el proceso |
| tipo_detalleproceso.ClaseLiquidacion | claves_claseliquidacion | clave | 1 | 1 | sequence > choice#1 | claves_claseliquidacion (§13.3.49) | Clase de liquidación incluida en el proceso |
| tipo_detalleproceso.ClaseMensaje | claves_clasemensaje | clave | 1 | 1 | sequence > choice#1 | claves_clasemensaje (§13.3.136) | Clase de mensaje incluida en el proceso. |
| tipo_detalleproceso.Transaccion | claves_transaccion | clave | 1 | 1 | sequence | claves_transaccion (§13.3.36) | Tipo de transacción |
| tipo_detalleproceso.Periodo | claves_periodo | clave | 1 | 1 | sequence | claves_periodo (§13.3.29) | Información del periodo de envío |
| tipo_detalleproceso.FechaDesde | xs:dateTime |  | 0 | 1 | sequence |  | Fecha desde la cual se envía información |
| tipo_detalleproceso.FechaHasta | xs:dateTime |  | 0 | 1 | sequence |  | Fecha hasta la cual se envía información |

### n_tipo_detalleproceso  (PDF §7.2.n)
_Lista de detalle de procesos._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_detalleproceso.DetalleProceso | tipo_detalleproceso |  | 1 | unbounded | sequence |  | Detalle de proceso. |

### tipo_poliza  (PDF §8.1)
_Información de la póliza._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_poliza.DetalleProceso | tipo_detalleproceso |  | 0 | 1 | sequence |  | Detalle de proceso. Informar si en cabecera de fichero el proceso se identificar por detalle de proceso. |
| tipo_poliza.DatosPoliza | tipo_datospoliza |  | 1 | 1 | sequence |  | Datos generales de la póliza |
| tipo_poliza.SituacionPoliza | claves_situacionpoliza | clave | 1 | 1 | sequence | claves_situacionpoliza (§13.3.32) | Situación actual de la póliza |
| tipo_poliza.ClasePoliza | claves_clasepoliza | clave | 1 | 1 | sequence | claves_clasepoliza (§13.3.11) | Clase de póliza |
| tipo_poliza.DatosAnulacion | tipo_anulacionpoliza |  | 0 | 1 | sequence |  | Datos de anulación de la póliza. Informar si la póliza está Anulada. |
| tipo_poliza.DatosSuspensiones | n_tipo_suspensionpoliza |  | 0 | 1 | sequence |  | Datos de las suspensiones de póliza. Informar si la póliza está suspendida. |
| tipo_poliza.DatosPolizaReemplazada | tipo_datospoliza |  | 0 | 1 | sequence |  | Datos de la póliza reemplazada. (Obligatorio si existe póliza reemplazada) |
| tipo_poliza.Suplementos | n_tipo_suplementopoliza |  | 0 | 1 | sequence |  | Datos de la póliza reemplazada. Informar si existe póliza reemplazada. |
| tipo_poliza.Fechas | tipo_fechas |  | 1 | 1 | sequence |  | Fecha de la póliza |
| tipo_poliza.DuracionPoliza | claves_duracionpoliza | clave | 1 | 1 | sequence | claves_duracionpoliza (§13.3.20) | Duración de la póliza |
| tipo_poliza.DatosRiesgos | n_tipo_riesgo |  | 1 | 1 | sequence |  | Datos del riesgo |
| tipo_poliza.DatosImportes | tipo_importespoliza |  | 1 | 1 | sequence |  | Datos de importes |
| tipo_poliza.DatosComisiones | n_tipo_comision |  | 0 | 1 | sequence |  | Datos de comisiones |
| tipo_poliza.FraccionPago | claves_fraccionpago | clave | 1 | 1 | sequence | claves_fraccionpago (§13.3.24) | Clase de fraccionamiento de pago en recibos de la póliza |
| tipo_poliza.GestionCobro | tipo_gestioncobro |  | 1 | 1 | sequence |  | Datos de gestión de cobro de la póliza |
| tipo_poliza.Tomador | tipo_persona |  | 1 | 1 | sequence |  | Datos del tomador de la póliza |
| tipo_poliza.Asegurado | tipo_persona |  | 0 | 1 | sequence |  | Datos del asegurado de la póliza |
| tipo_poliza.OrigenesContratacion | n_tipo_origencontratacion |  | 0 | 1 | sequence |  | Datos del origen de contratación de la póliza |
| tipo_poliza.DatosRegularizacion | tipo_regularizacion |  | 0 | 1 | sequence |  | Datos de regularización de la póliza |
| tipo_poliza.DatosComercializacion | n_tipo_comercializacion |  | 0 | 1 | sequence |  | Datos de campañas o acuerdos de comercialización de la póliza. |
| tipo_poliza.Coaseguro | tipo_coaseguro |  | 0 | 1 | sequence |  | Datos de las condiciones del contrato de coaseguro que aplican a la Póliza. Se han de informar sólo en los contratos de póliza única y lo ha de hacer la entidad abridora. |
| tipo_poliza.ParticipacionBeneficios | tipo_pb |  | 0 | 1 | sequence |  | Datos sobre la participación en beneficios que aplica a la póliza. |
| tipo_poliza.DatosPolizaColectiva | tipo_polizacolectiva |  | 0 | 1 | sequence |  | Condiciones propias de póliza colectiva. |
| tipo_poliza.OtrosDatos | n_tipo_otrodato |  | 0 | 1 | sequence |  | Otros datos de la póliza |
| tipo_poliza.DatosRecibos | n_tipo_datosrecibo |  | 0 | 1 | sequence |  | Recibos de la póliza |

### tipo_datospoliza  (PDF §8.2)
_Datos generales de la póliza._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_datospoliza.IdPoliza | _char_40 | xs:string, max 40 | 1 | 1 | sequence |  | Número de póliza |
| tipo_datospoliza.IdPolizaUnico | _char_40 | xs:string, max 40 | 0 | 1 | sequence |  | Identificador único de póliza. Obligatorio informar si Id Póliza no es clave única de póliza en entidad aseguradora. |
| tipo_datospoliza.IdAplicacion | _char_20 | xs:string, max 20 | 0 | 1 | sequence |  | Número de aplicación o certificado en pólizas colectivas |
| tipo_datospoliza.NumeroSuplemento | _char_20 | xs:string, max 20 | 0 | 1 | sequence |  | Número de suplemento. Informar si es suplemento. |
| tipo_datospoliza.DatosMediador | tipo_mediador |  | 1 | 1 | sequence |  | Datos del mediador |
| tipo_datospoliza.CodigoEntidad | _t_codigoDGSea | xs:string, pattern [A-Z](\d{4}) | 1 | 1 | sequence |  | Código DGS de entidad aseguradora. |
| tipo_datospoliza.DatosRamo | tipo_ramo |  | 1 | 1 | sequence |  | Información sobre el ramo |
| tipo_datospoliza.IdSolicitudMediador | _char_40 | xs:string, max 40 | 0 | 1 | sequence |  | Identificador de solicitud de emisión de póliza asignado por el Mediador. Informar siempre que exista. |

### tipo_recibo  (PDF §9.1)
_Información del recibo._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_recibo.DetalleProceso | tipo_detalleproceso |  | 0 | 1 | sequence |  | Detalle de proceso. Informar si en cabecera de fichero el proceso se identificar por detalle de proceso. |
| tipo_recibo.DatosPoliza | tipo_datospoliza |  | 1 | 1 | sequence |  | Datos generales de la póliza |
| tipo_recibo.DatosRecibo | tipo_datosrecibo |  | 1 | 1 | sequence |  | Datos generales del recibo |
| tipo_recibo.ErrorDevolucion | tipo_errordevolucion |  | 0 | 1 | sequence |  | Información de error y motivo de devolución |

### tipo_datosrecibo  (PDF §9.2)
_Datos generales del recibo._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_datosrecibo.IdRecibo | _char_40 | xs:string, max 40 | 1 | 1 | sequence |  | Número de recibo |
| tipo_datosrecibo.IdReciboUnico | _char_40 | xs:string, max 40 | 0 | 1 | sequence |  | Identificador único de recibo. Obligatorio informar si Id Recibo no es clave única de recibo en entidad aseguradora. |
| tipo_datosrecibo.SituacionRecibo | claves_situacionrecibo | clave | 1 | 1 | sequence | claves_situacionrecibo (§13.3.33) | Situación actual del recibo |
| tipo_datosrecibo.ClaseRecibo | claves_claserecibo | clave | 1 | 1 | sequence | claves_claserecibo (§13.3.12) | Clase de recibo |
| tipo_datosrecibo.Fechas | tipo_fechasrecibo |  | 1 | 1 | sequence |  | Fechas del recibo |
| tipo_datosrecibo.GestionCobro | tipo_gestioncobro |  | 1 | 1 | sequence |  | Datos de la gestión de cobro del recibo |
| tipo_datosrecibo.DatosImportes | tipo_importesrecibo |  | 1 | 1 | sequence |  | Datos de importes. Los de clase de recibo EX: Extorno se han de informar con signo negativo. |
| tipo_datosrecibo.DatosComisiones | n_tipo_comision |  | 1 | 1 | sequence |  | Datos de las comisiones |
| tipo_datosrecibo.MovimientosRecibo | n_tipo_movimientorecibo |  | 1 | 1 | sequence |  | Datos de movimientos del recibo |
| tipo_datosrecibo.Modificable | xs:boolean |  | 0 | 1 | sequence |  | Indicador de si los datos del recibo son modificables. Obligatorio informar si el recibo es o ha sido modificable. Utilizar movimiento de recibo con valor NM: No modificable para informar de cambio en esta condición. |
| tipo_datosrecibo.DatosMediador | tipo_mediador |  | 0 | 1 | sequence |  | Datos del mediador del recibo. Informar cuando el mediador del recibo sea diferente del de la póliza. |
| tipo_datosrecibo.RecibosRelacionados | n_tipo_reciborelacionado |  | 0 | 1 | sequence |  | Recibos relacionados con el recibo identificado por Id recibo |
| tipo_datosrecibo.IdRemesa | _char_20 | xs:string, max 20 | 0 | 1 | sequence |  | Referencia remesa (si se ha remesado) |
| tipo_datosrecibo.RiesgosRecibo | n_tipo_riesgorecsin |  | 0 | 1 | sequence |  | Riesgos del recibo |
| tipo_datosrecibo.OtrosDatos | n_tipo_otrodato |  | 0 | 1 | sequence |  | Otros datos del recibo |

### n_tipo_datosrecibo
_Lista de recibos._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_datosrecibo.DatosRecibo | tipo_datosrecibo |  | 1 | unbounded | sequence |  |  |

### tipo_siniestro  (PDF §10.1)
_Información del siniestro._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_siniestro.DetalleProceso | tipo_detalleproceso |  | 0 | 1 | sequence |  | Detalle de proceso. Informar si en cabecera de fichero el proceso se identificar por detalle de proceso. |
| tipo_siniestro.DatosPoliza | tipo_datospoliza |  | 1 | 1 | sequence |  | Datos generales de la póliza |
| tipo_siniestro.DatosSiniestro | tipo_datossiniestro |  | 1 | 1 | sequence |  | Datos generales del siniestro. |
| tipo_siniestro.ErrorDevolucion | tipo_errordevolucion |  | 0 | 1 | sequence |  | Información de error y motivo de devolución |

### tipo_datossiniestro  (PDF §10.2)
_Datos generales del siniestro._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_datossiniestro.IdSiniestroEntidad | _char_40 | xs:string, max 40 | 0 | 1 | sequence |  | Número o identificador de siniestro asignado por la compañía. (Obligatorio excepto en proceso 841- Soliciitud de alta de nuevos siniestros) |
| tipo_datossiniestro.IdSiniestroUnico | _char_40 | xs:string, max 40 | 0 | 1 | sequence |  | Identificador único de siniestro. Obligatorio informar si Id Siniestro Entidad no es clave única de siniestro en entidad aseguradora. |
| tipo_datossiniestro.IdSiniestroMediador | _char_40 | xs:string, max 40 | 0 | 1 | sequence |  | Número de referencia del siniestro para el mediador. Informar siempre si ha sido previamente informado por el Mediador |
| tipo_datossiniestro.FechaDeclaracion | xs:dateTime |  | 1 | 1 | sequence |  | Fecha de declaración/comunicación del siniestro a la compañía |
| tipo_datossiniestro.FechaOcurrencia | xs:dateTime |  | 1 | 1 | sequence |  | Fecha de ocurrencia del siniestro |
| tipo_datossiniestro.PosicionSiniestro | claves_posicionsiniestro | clave | 1 | 1 | sequence | claves_posicionsiniestro (§13.3.47) | Posición de la entidad en el siniestro |
| tipo_datossiniestro.SituacionesSiniestro | n_tipo_situacionsiniestro |  | 1 | 1 | sequence |  | Situación/es del siniestro |
| tipo_datossiniestro.DescripcionSiniestro | xs:string |  | 1 | 1 | sequence |  | Descripción del siniestro |
| tipo_datossiniestro.TipologiaSiniestro | claves_tipologiasiniestro | clave | 1 | 1 | sequence | claves_tipologiasiniestro (§13.3.86) | Tipología de siniestro |
| tipo_datossiniestro.Asegurado | tipo_asegurado |  | 1 | 1 | sequence |  | Datos del asegurado implicado en el siniestro. |
| tipo_datossiniestro.Contrarios | n_tipo_contrario |  | 0 | 1 | sequence |  | Datos del contrario implicado en el siniestro. |
| tipo_datossiniestro.DAA | xs:boolean |  | 0 | 1 | sequence |  | Indicador de si existe Declaración Amistosa de Accidente (en siniestro de autos) |
| tipo_datossiniestro.Autoridades | n_tipo_autoridad |  | 0 | 1 | sequence |  | Autoridades que han intervenido en el siniestro. |
| tipo_datossiniestro.AccionesSiniestro | n_tipo_accionsiniestro |  | 0 | 1 | sequence |  | Acción/es del siniestro |
| tipo_datossiniestro.Convenios | n_tipo_convenio |  | 0 | 1 | sequence |  | Convenios que aplican al siniestro |
| tipo_datossiniestro.DatosMoneda | tipo_moneda |  | 0 | 1 | sequence |  | Datos de la moneda en la que se expresan las unidades monetarias (si no viene informado es Euro) |
| tipo_datossiniestro.ImporteIndemnizacion | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 0 | 1 | sequence |  | Importe de la indemnización del siniestro |
| tipo_datossiniestro.ImporteReserva | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 0 | 1 | sequence |  | Importe de la reserva/previsión del coste del siniestro |
| tipo_datossiniestro.DescripcionReserva | xs:string |  | 0 | 1 | sequence |  | Descripción de la reserva/previsión del coste del siniestro |
| tipo_datossiniestro.TotalPagos | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 0 | 1 | sequence |  | Total de pagos |
| tipo_datossiniestro.TotalRecobros | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 0 | 1 | sequence |  | Total de recobros |
| tipo_datossiniestro.PagosSiniestro | n_tipo_pagosiniestro |  | 0 | 1 | sequence |  | Pagos del siniestro |
| tipo_datossiniestro.FigurasSiniestro | n_tipo_figura |  | 0 | 1 | sequence |  | Figuras del siniestro |
| tipo_datossiniestro.LugarSiniestro | tipo_domicilio |  | 0 | 1 | sequence |  | Lugar de ocurrencia del siniestro |
| tipo_datossiniestro.RiesgosSiniestro | n_tipo_riesgorecsin |  | 0 | 1 | sequence |  | Riesgos afectados por el siniestro |
| tipo_datossiniestro.PorExpediente | xs:boolean |  | 1 | 1 | sequence |  | Indicador de si se proporciona información por expediente. |
| tipo_datossiniestro.Expedientes | n_tipo_expediente |  | 0 | 1 | sequence |  | Datos de los expedientes del siniestro |
| tipo_datossiniestro.OtrosDatos | n_tipo_otrodato |  | 0 | 1 | sequence |  | Otros datos particulares no estandarizados del objeto. |

### tipo_liquidacion  (PDF §11.1)
_Información de liquidación._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_liquidacion.DetalleProceso | tipo_detalleproceso |  | 0 | 1 | sequence |  | Detalle de proceso. Informar si en cabecera de fichero el proceso se identificar por detalle de proceso. |
| tipo_liquidacion.DatosLiquidacion | tipo_datosliquidacion |  | 1 | 1 | sequence |  | Datos de liquidación. |
| tipo_liquidacion.ErrorDevolucion | tipo_errordevolucion |  | 0 | 1 | sequence |  | Información de error y motivo de devolución |

### tipo_datosliquidacion  (PDF §11.2)
_Datos de liquidación_

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_datosliquidacion.IdLiquidacionEntidad | _char_40 | xs:string, max 40 | 0 | 1 | sequence |  | Identificador de liquidación para la compañía. Informar si liquidación con origen Entidad |
| tipo_datosliquidacion.IdLiquidacionMediador | _char_40 | xs:string, max 40 | 0 | 1 | sequence |  | Identificador de liquidación para el mediador. Informar si liquidación con origen Mediador. |
| tipo_datosliquidacion.DatosMediador | tipo_mediador |  | 1 | 1 | sequence |  | Datos del mediador |
| tipo_datosliquidacion.CodigoEntidad | _t_codigoDGSea | xs:string, pattern [A-Z](\d{4}) | 1 | 1 | sequence |  | Código DGS de entidad aseguradora. |
| tipo_datosliquidacion.EstadoLiquidacion | claves_estadoliquidacion | clave | 1 | 1 | sequence | claves_estadoliquidacion (§13.3.51) | Estado de la liquidación |
| tipo_datosliquidacion.FechaLiquidacion | xs:dateTime |  | 1 | 1 | sequence |  | Fecha de la liquidación |
| tipo_datosliquidacion.FechaPago | xs:dateTime |  | 0 | 1 | sequence |  | Fecha de pago de la liquidación |
| tipo_datosliquidacion.DatosMoneda | tipo_moneda |  | 0 | 1 | sequence |  | Datos de la moneda en la que se expresan las unidades monetarias (si no viene informado es Euro) |
| tipo_datosliquidacion.ImporteRemesa | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 1 | 1 | sequence |  | Importe total de la liquidación. Suma del importe de liquidación de cada movimiento que forma parte de la liquidación. |
| tipo_datosliquidacion.MovimientosLiquidacion | n_tipo_movimientoliquidacion |  | 1 | 1 | sequence |  | Lista de movimientos que componen la liquidación |
| tipo_datosliquidacion.FormaPago | tipo_formapago |  | 0 | 1 | sequence |  | Datos de la forma de pago |
| tipo_datosliquidacion.OtrosDatos | n_tipo_otrodato |  | 0 | 1 | sequence |  | Otros datos particulares no estandarizados del objeto |

### tipo_accesoriovehiculo  (PDF §13.1)
_Accesorio de vehículo._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_accesoriovehiculo.NumeroOrden | xs:unsignedInt |  | 0 | 1 | sequence |  | Número de orden o contador de unidades de tipo |
| tipo_accesoriovehiculo.DescripcionAccesorio | xs:string |  | 1 | 1 | sequence |  | Descripción del accesorio |
| tipo_accesoriovehiculo.Valor | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 1 | 1 | sequence |  | Valor del accesorio |

### n_tipo_accesoriovehiculo  (PDF §13.1.n)
_Lista de accesorios de vehículo._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_accesoriovehiculo.AccesorioVehiculo | tipo_accesoriovehiculo |  | 1 | unbounded | sequence |  | Datos de accesorio de vehículo |

### tipo_actividad  (PDF §13.2)
_Información de actividad económica._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_actividad.IdActividad | _t_CnoCnae | xs:string, pattern \d{2,4} | 0 | 1 | sequence |  | Código de actividad CNAE 2009. |
| tipo_actividad.DescripcionActividad | xs:string |  | 0 | 1 | sequence |  | Descripcion de actividad. |

### tipo_anulacionpoliza  (PDF §13.3)
_Datos de anulación de póliza._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_anulacionpoliza.FechaAnulacion | xs:dateTime |  | 1 | 1 | sequence |  | Fecha de efecto de la anulación. |
| tipo_anulacionpoliza.MotivoAnulacion | claves_anulacionpoliza | clave | 1 | 1 | sequence | claves_anulacionpoliza (§13.3.1) | Motivo de anulación de la póliza |
| tipo_anulacionpoliza.DetalleAnulacion | xs:string |  | 0 | 1 | sequence |  | Descripción motivos de anulación |

### tipo_anulacionrecibo  (PDF §13.4)
_Detalle de anulacion de recibo._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_anulacionrecibo.MotivoAnulacion | claves_anulacionrecibo | clave | 1 | 1 | sequence | claves_anulacionrecibo (§13.3.2) | Motivo de anulación del recibo |
| tipo_anulacionrecibo.DescripcionMotivo | xs:string |  | 0 | 1 | sequence |  | Descripción del motivo de anulación |
| tipo_anulacionrecibo.ReferenciaAnulacion | _char_20 | xs:string, max 20 | 0 | 1 | sequence |  | Referencia de la anulación |

### tipo_beneficiario  (PDF §13.5)
_Datos de beneficiario._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_beneficiario.NumeroOrden | xs:unsignedInt |  | 0 | 1 | sequence |  | Número de orden o contador de unidades de tipo |
| tipo_beneficiario.Persona | tipo_persona |  | 0 | 1 | sequence |  | Persona beneficiaria |
| tipo_beneficiario.Orden | xs:unsignedInt |  | 1 | 1 | sequence |  | Orden de prelación del beneficiario |
| tipo_beneficiario.DescripcionBeneficiario | xs:string |  | 0 | 1 | sequence |  | Descripción del beneficiario |
| tipo_beneficiario.PorcentajeParticipacion | xs:decimal |  | 0 | 1 | sequence |  | Porcentaje de participación del beneficiario |
| tipo_beneficiario.Prestamo | tipo_prestamo |  | 0 | 1 | sequence |  | Préstamo vinculado a la poliza de seguro mediante cláusula donde se establece el beneficiario. |

### n_tipo_beneficiario  (PDF §13.5.n)
_Lista de beneficiarios._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_beneficiario.Beneficiario | tipo_beneficiario |  | 1 | unbounded | sequence |  | Datos de beneficiario. |

### tipo_cargo  (PDF §13.6)
_Datos del cargo (recargo, tasa o impuesto)._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_cargo.NumeroOrden | xs:unsignedInt |  | 0 | 1 | sequence |  | Número de orden o contador de unidades de tipo |
| tipo_cargo.ClaseCargo | claves_cargo | clave | 1 | 1 | sequence | claves_cargo (§13.3.3) | Clase de cargo |
| tipo_cargo.Importe | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 1 | 1 | sequence |  | Importe del cargo |
| tipo_cargo.DescripcionCargo | xs:string |  | 0 | 1 | sequence |  | Descripción del cargo |

### n_tipo_cargo  (PDF §13.6.n)
_Lista de cargos._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_cargo.Cargo | tipo_cargo |  | 1 | unbounded | sequence |  | Datos del cargo (recargo, tasa o impuesto) |

### tipo_cobertura  (PDF §13.7)
_Datos de cobertura._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_cobertura.NumeroOrden | xs:unsignedInt |  | 0 | 1 | sequence |  | Número de orden o contador de unidades de tipo |
| tipo_cobertura.IdCobertura | _char_20 | xs:string, max 20 | 1 | 1 | sequence |  | Código interno de cobertura |
| tipo_cobertura.DescripcionCobertura | xs:string |  | 1 | 1 | sequence |  | Descripción de la cobertura |
| tipo_cobertura.FechaInicio | xs:dateTime |  | 0 | 1 | sequence |  | Fecha inicio de la cobertura |
| tipo_cobertura.FechaFin | xs:dateTime |  | 0 | 1 | sequence |  | Fecha fin de la cobertura |
| tipo_cobertura.CapitalAsegurado | _t_num2dou | xs:double, pattern -?[0-9]+(\.[0-9]{1,2})?\|INF | 0 | 1 | sequence |  | Capital asegurado para la cobertura |
| tipo_cobertura.DescripcionCapitalAsegurado | xs:string |  | 0 | 1 | sequence |  | Descripción del capital asegurado |
| tipo_cobertura.ModalidadValoracion | claves_modalidadvaloracion | clave | 0 | 1 | sequence | claves_modalidadvaloracion (§13.3.60) | Modalidad de valoración del bien asegurado. |
| tipo_cobertura.DatosLimitesAsegurados | n_tipo_limite |  | 0 | 1 | sequence |  | Límites de la cobertura |
| tipo_cobertura.DatosFranquicias | n_tipo_franquicia |  | 0 | 1 | sequence |  | Franquicias de la cobertura |
| tipo_cobertura.DatosImportes | tipo_importes |  | 0 | 1 | sequence |  | Importes vinculados a la cobertura |
| tipo_cobertura.DatosComisiones | n_tipo_comision |  | 0 | 1 | sequence |  | Comisiones vinculadas a la cobertura |

### n_tipo_cobertura  (PDF §13.7.n)
_Lista de coberturas._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_cobertura.Cobertura | tipo_cobertura |  | 1 | unbounded | sequence |  | Datos de cobertura. |

### tipo_codigosid  (PDF §13.8)
_Códigos identificativos de entidad aseguradora o mediador._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_codigosid.CodigoInterno | _char_20 | xs:string, max 20 | 1 | 1 | sequence |  | Código interno de entidad aseguradora o mediador. |
| tipo_codigosid.CodigoDGS | _t_codigoDGS | xs:string, pattern [A-Z/\-\d\s]{5,22} | 1 | 1 | sequence |  | Código DGS de entidad aseguradora o mediador. |

### tipo_comision  (PDF §13.9)
_Datos de comisión._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_comision.NumeroOrden | xs:unsignedInt |  | 0 | 1 | sequence |  | Número de orden o contador de unidades de tipo |
| tipo_comision.ClaseComision | claves_clasecomision | clave | 1 | 1 | sequence | claves_clasecomision (§13.3.5) | Clase de comisión |
| tipo_comision.ComisionBruta | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 0 | 1 | sequence |  | Importe bruto de la comisión. (Obligatorio si no informado el campo Comisión líquida) |
| tipo_comision.ComisionLiquida | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 0 | 1 | sequence |  | Importe líquido de la comisión. (Obligatorio si no informado el campo Comisión bruta) |
| tipo_comision.Base | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 0 | 1 | sequence |  | Importe base de cálculo de la comisión |
| tipo_comision.RetencionIRPF | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 0 | 1 | sequence |  | Porcentaje de retención por IRPF |

### n_tipo_comision  (PDF §13.9.n)
_Lista de comisiones._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_comision.Comision | tipo_comision |  | 1 | unbounded | sequence |  |  |

### tipo_conductor  (PDF §13.10)
_Datos de conductor._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_conductor.NumeroOrden | xs:unsignedInt |  | 0 | 1 | sequence |  | Número de orden o contador de unidades de tipo |
| tipo_conductor.DatosConductor | tipo_personafisica |  | 1 | 1 | sequence |  | Datos personales |
| tipo_conductor.ClaseConductor | claves_conductor | clave | 1 | 1 | sequence | claves_conductor (§13.3.19) | Clase de conductor |
| tipo_conductor.FechaPermiso | xs:dateTime |  | 1 | 1 | sequence |  | Fecha de permiso |
| tipo_conductor.TipoPermiso | claves_permiso | clave | 0 | 1 | sequence | claves_permiso (§13.3.53) | Clase de permiso de conducción |

### n_tipo_conductor  (PDF §13.10.n)
_Lista de conductores._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_conductor.Conductor | tipo_conductor |  | 1 | unbounded | sequence |  |  |

### tipo_cuentacorriente  (PDF §13.11)
_Datos de cuenta bancaria._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_cuentacorriente.IBAN | _t_iban | xs:string, pattern [A-Z\d]{15,32} | 1 | 1 | sequence |  | International Bank Account Number |
| tipo_cuentacorriente.BIC | _t_bic | xs:string, pattern [A-Z\d]{8}\|[A-Z\d]{11} | 0 | 1 | sequence |  | Código de identificación del banco. |
| tipo_cuentacorriente.Titular | tipo_persona |  | 0 | 1 | sequence |  | Titular de la cuenta |

### tipo_domicilio  (PDF §13.13)
_Datos de domicilio._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_domicilio.NombreVia | _char_120 | xs:string, max 120 | 1 | 1 | sequence |  | Nombre de la vía |
| tipo_domicilio.CodigoPostal | _char_20 | xs:string, max 20 | 1 | 1 | sequence |  | Código postal |
| tipo_domicilio.Poblacion | _char_80 | xs:string, max 80 | 1 | 1 | sequence |  | Población o localidad |
| tipo_domicilio.Provincia | _t_provincia | xs:unsignedInt, rango 0..52 | 1 | 1 | sequence |  | Código según tabla Provincias (12.1) |
| tipo_domicilio.ClaseVia | _char_20 | xs:string, max 20 | 0 | 1 | sequence |  | Clase de vía (Calle, Plaza, etc.) |
| tipo_domicilio.OtrosDatosVia | _char_120 | xs:string, max 120 | 0 | 1 | sequence |  | Información complementaria de la vía (número, piso, puerta) |
| tipo_domicilio.Pais | _t_pais | xs:string, pattern [A-Z]{3} | 0 | 1 | sequence |  | Código de país (según ISO 3166-1 alpha-3) |

### tipo_fechas  (PDF §13.13)
_Fechas de póliza, suplemento o recibo._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_fechas.FechaSituacion | xs:dateTime |  | 1 | 1 | sequence |  | Fecha de la situación actual. En Suplemento se refiere a la fecha de situación del suplemento. En Recibo es la Fecha de situación del recibo. |
| tipo_fechas.FechaEfectoInicial | xs:dateTime |  | 1 | 1 | sequence |  | Fecha de primer efecto. En Suplemento y Recibo se refiere a Póliza. |
| tipo_fechas.FechaEfectoActual | xs:dateTime |  | 1 | 1 | sequence |  | Fecha de último efecto o actual. En Suplemento es la Fecha de efecto del suplemento. En Recibo es la Fecha de efecto del recibo. |
| tipo_fechas.FechaVencimiento | xs:dateTime |  | 1 | 1 | sequence |  | Fecha de vencimiento. En Suplemento es la Fecha de vencimiento del suplemento. En Recibo es la Fecha de vencimiento del recibo. Si póliza vitalicia, valor 31/12/9999T00:00:00 |
| tipo_fechas.FechaFinSeguro | xs:dateTime |  | 0 | 1 | sequence |  | Fecha de fin de seguro. En Suplemento y Recibo se refiere a Póliza. |
| tipo_fechas.FechaSolicitud | xs:dateTime |  | 0 | 1 | sequence |  | Fecha de la solicitud. En Suplemento es la Fecha de solicitud del suplemento. |
| tipo_fechas.FechaEmision | xs:dateTime |  | 1 | 1 | sequence |  | Fecha de emisión. En Suplemento es la Fecha de emisión del suplemento. En Recibo es la Fecha de emisión del recibo. |
| tipo_fechas.FechaPrimerVencimiento | xs:dateTime |  | 0 | 1 | sequence |  | Fecha de primer vencimiento. Informar si se realiza ajuste de vencimiento el primer año. |

### tipo_figura  (PDF §13.14)
_Datos de figura._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_figura.NumeroOrden | xs:unsignedInt |  | 0 | 1 | sequence |  | Número de orden o contador de unidades de tipo |
| tipo_figura.DatosFigura | tipo_persona |  | 1 | 1 | sequence |  | Datos de la persona |
| tipo_figura.ClaseFigura | claves_figura | clave | 1 | 1 | sequence | claves_figura (§13.3.22) | Clase de figura |

### n_tipo_figura  (PDF §13.14.n)
_Lista de figuras._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_figura.Figura | tipo_figura |  | 1 | unbounded | sequence |  |  |

### tipo_formapago  (PDF §13.15)
_Datos de la forma de pago._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_formapago.ClaseFormaPago | claves_formapago | clave | 1 | 1 | sequence | claves_formapago (§13.3.23) | Clase de forma de pago |
| tipo_formapago.DatosCuentaCorriente | tipo_cuentacorriente |  | 0 | 1 | sequence |  | Datos de la cuenta bancaria. Obligatorio cuando la forma de pago sea por cuenta bancaria. |

### tipo_franquicia  (PDF §13.16)
_Datos de franquicia._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_franquicia.NumeroOrden | xs:unsignedInt |  | 0 | 1 | sequence |  | Número de orden o contador de unidades de tipo |
| tipo_franquicia.ClaseFranquicia | claves_franquicia | clave | 1 | 1 | sequence | claves_franquicia (§13.3.25) | Clase de franquicia |
| tipo_franquicia.DescripcionFranquicia | xs:string |  | 0 | 1 | sequence |  | Descripción de la franquicia |
| tipo_franquicia.ValorExacto | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 0 | 1 | sequence > choice#4 |  | Valor exacto de franquicia |
| tipo_franquicia.ValorMinimo | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 0 | 1 | sequence > choice#4 > sequence |  | Valor mínimo de franquicia |
| tipo_franquicia.ValorMaximo | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 0 | 1 | sequence > choice#4 > sequence |  | Valor máximo de franquicia |
| tipo_franquicia.Periodo | claves_periodo | clave | 0 | 1 | sequence | claves_periodo (§13.3.29) | Define unidad de tiempo |
| tipo_franquicia.PeriodoFranquiciaUds | xs:unsignedInt |  | 0 | 1 | sequence |  | Unidades del periodo de franquicia |
| tipo_franquicia.Porcentaje | xs:decimal |  | 0 | 1 | sequence |  | Define unidad cómo porcentaje |
| tipo_franquicia.PeriodoCarencia | claves_periodo | clave | 0 | 1 | sequence | claves_periodo (§13.3.29) | Periodo de carencia |
| tipo_franquicia.PeriodoCarenciaUds | xs:unsignedInt |  | 0 | 1 | sequence |  | Unidades del periodo de carencia |

### n_tipo_franquicia  (PDF §13.16.n)
_Lista de franquicias._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_franquicia.Franquicia | tipo_franquicia |  | 1 | unbounded | sequence |  |  |

### tipo_gestioncobro  (PDF §13.17)
_Datos de gestión de cobro._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_gestioncobro.ClaseGestion | claves_clasegestion | clave | 1 | 1 | sequence | claves_clasegestion (§13.3.7) | Indica quien gestiona el cobro del recibo |
| tipo_gestioncobro.DatosFormaPago | tipo_formapago |  | 0 | 1 | sequence |  | Datos de la forma de pago. Obligatorio informar si Clase de gestión es CO: Compañía. |
| tipo_gestioncobro.SoporteDocumental | claves_soporte | clave | 0 | 1 | sequence | claves_soporte (§13.3.58) | Documento comercial que soporta la transacción |

### tipo_importes  (PDF §13.18)
_Importes de póliza, suplemento o recibo._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_importes.PrimaTotal | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 1 | 1 | sequence |  | Prima total pagada. |
| tipo_importes.PrimaNeta | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 0 | 1 | sequence |  | Prima neta (sin cargos). (Obligatorio en Recibo) |
| tipo_importes.DatosMoneda | tipo_moneda |  | 0 | 1 | sequence |  | Datos de la moneda en la que se expresan las unidades monetarias (si no viene informado es Euro) |
| tipo_importes.DatosCargos | n_tipo_cargo |  | 0 | 1 | sequence |  | Cargos sobre la prima neta (Cargos = Prima Total - Prima Neta) |
| tipo_importes.OtrosImportes | n_tipo_otroimporte |  | 0 | 1 | sequence |  | Descuentos o recargos sólo informativos |

### tipo_importesdec  (PDF §13.19)
_Importes de Declaración económico-contable (DEC)_

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_importesdec.PrimaTotalAnualizada | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 1 | 1 | sequence |  | Importe de la prima total anualizada. |
| tipo_importesdec.PrimaNetaAnualizada | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 1 | 1 | sequence |  | Importe de la prima neta anualizada. |
| tipo_importesdec.ComisionAnualizada | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 0 | 1 | sequence |  | Importe de comisión anualizada. |
| tipo_importesdec.CapitalAseguradoAgregado | _t_num2dou | xs:double, pattern -?[0-9]+(\.[0-9]{1,2})?\|INF | 1 | 1 | sequence |  | Importe del capital asegurado agregado. |

### tipo_importespoliza  (PDF §13.20)
_Importes de póliza._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_importespoliza.Importes | tipo_importes |  | 1 | 1 | sequence |  | Importes |
| tipo_importespoliza.ImportesDEC | tipo_importesdec |  | 0 | 1 | sequence |  | Importes DEC |

### tipo_importesrecibo  (PDF §13.21)
_Importes de recibo._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_importesrecibo.Importes | tipo_importes |  | 1 | 1 | sequence |  | Importes |
| tipo_importesrecibo.ImportesDEC | tipo_importesdec |  | 0 | 1 | sequence |  | Importes DEC |

### tipo_limite  (PDF §13.22)
_Datos de límite._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_limite.NumeroOrden | xs:unsignedInt |  | 0 | 1 | sequence |  | Número de orden o contador de unidades de tipo |
| tipo_limite.ClaseLimite | claves_claselimite | clave | 1 | 1 | sequence | claves_claselimite (§13.3.9) | Clase de límite asegurado |
| tipo_limite.DescripcionLimite | xs:string |  | 0 | 1 | sequence |  | Descripción del límite |
| tipo_limite.LimiteMaximo | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 0 | 1 | sequence |  | Límite máximo |
| tipo_limite.LimiteMinimo | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 0 | 1 | sequence |  | Límite mínimo |

### n_tipo_limite  (PDF §13.22.n)
_Lista de límites._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_limite.Limite | tipo_limite |  | 1 | unbounded | sequence |  |  |

### tipo_lote  (PDF §13.23)
_Datos del lote._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_lote.IdLote | _char_50 | xs:string, max 50 | 1 | 1 | sequence |  | Identificador del lote |
| tipo_lote.NumeroFicheros | xs:unsignedInt |  | 0 | 1 | sequence |  | Número de ficheros que componen el lote |
| tipo_lote.SecuenciaFichero | xs:unsignedInt |  | 0 | 1 | sequence |  | Posición del fichero en la secuencia de fichero que componen el lote |

### tipo_mediador  (PDF §13.24)
_Información del mediador_

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_mediador.IdMediador | tipo_codigosid |  | 1 | 1 | sequence |  | Código identificativo del mediador |
| tipo_mediador.ClaseMediador | claves_mediador | clave | 0 | 1 | sequence | claves_mediador (§13.3.26) | Tipo de mediador |
| tipo_mediador.NombreMediador | _char_80 | xs:string, max 80 | 0 | 1 | sequence |  | Nombre del mediador |

### tipo_moneda  (PDF §13.25)
_Información de la moneda_

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_moneda.Moneda | _t_moneda | xs:string, pattern [A-Z]{3} | 1 | 1 | sequence |  | Datos de la moneda en la que se expresan las unidades monetarias (ISO 4217) |
| tipo_moneda.FechaCambio | xs:dateTime |  | 1 | 1 | sequence |  | Fecha del tipo de cambio |
| tipo_moneda.TipoCambio | xs:decimal |  | 1 | 1 | sequence |  | Tipo de cambio |

### tipo_movimientorecibo  (PDF §13.26)
_Datos de movimiento de recibo._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_movimientorecibo.NumeroOrden | xs:unsignedInt |  | 1 | 1 | sequence |  | Número de orden o contador de unidades de tipo |
| tipo_movimientorecibo.ClaseMovimiento | claves_clasemovimientorecibo | clave | 1 | 1 | sequence | claves_clasemovimientorecibo (§13.3.10) | Clase movimiento |
| tipo_movimientorecibo.FechaMovimiento | xs:dateTime |  | 1 | 1 | sequence |  | Fecha del movimiento de recibo |
| tipo_movimientorecibo.Anulacion | tipo_anulacionrecibo |  | 0 | 1 | sequence |  | Datos de anulación del recibo. (Obligatorio si el campo Clase movimiento es Anulación de recibo o Anulación de extorno) |

### n_tipo_movimientorecibo  (PDF §13.26.n)
_Lista de movimientos de recibo._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_movimientorecibo.Movimiento | tipo_movimientorecibo |  | 1 | unbounded | sequence |  |  |

### tipo_origencontratacion  (PDF §13.27)
_Datos de origen de contratación._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_origencontratacion.NumeroOrden | xs:unsignedInt |  | 0 | 1 | sequence |  | Numérico (entero positivo) |
| tipo_origencontratacion.ClaseContratacion | claves_clasecontratacion | clave | 1 | 1 | sequence | claves_clasecontratacion (§13.3.6) | Clase de centro de contratación |
| tipo_origencontratacion.DescripcionClase | xs:string |  | 0 | 1 | sequence |  | Descripción de clase de centro contratación. (Obligatorio si el campo Clase de Contratación es Otros) |
| tipo_origencontratacion.CodigoCentro | _char_20 | xs:string, max 20 | 1 | 1 | sequence |  | Código de centro de contratación |
| tipo_origencontratacion.DescripcionCentro | xs:string |  | 0 | 1 | sequence |  | Descripción del centro de contratación |
| tipo_origencontratacion.Canal | claves_canalcontratacion | clave | 0 | 1 | sequence | claves_canalcontratacion (§13.3.71) | Canal de contratación: Web, plataforma tecnológica, teléfono. |

### n_tipo_origencontratacion  (PDF §13.27.n)
_Lista de orígenes de contratación._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_origencontratacion.OrigenContratacion | tipo_origencontratacion |  | 1 | unbounded | sequence |  |  |

### tipo_otrodato  (PDF §13.28)
_Otros datos particulares no estandarizados del objeto_

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_otrodato.NumeroOrden | xs:unsignedInt |  | 0 | 1 | sequence |  | Número de orden o contador de unidades de tipo |
| tipo_otrodato.IdDato | _char_20 | xs:string, max 20 | 1 | 1 | sequence |  | Código o referencia del dato |
| tipo_otrodato.DescripcionDato | xs:string |  | 1 | 1 | sequence |  | Descripción del dato |
| tipo_otrodato.IdSubdato | _char_40 | xs:string, max 40 | 1 | 1 | sequence |  | Código o referencia del subdato |
| tipo_otrodato.ValorSubdato | xs:string |  | 1 | 1 | sequence |  | Valor del subdato |

### n_tipo_otrodato  (PDF §13.28.n)
_Lista de otros datos_

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_otrodato.Dato | tipo_otrodato |  | 1 | unbounded | sequence |  | Otros datos particulares no estandarizados del objeto |

### tipo_otroimporte  (PDF §13.29)
_Importe correspondiente a descuentos, bonificaciones o recargos._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_otroimporte.NumeroOrden | xs:unsignedInt |  | 0 | 1 | sequence |  | Número de orden o contador de unidades de tipo |
| tipo_otroimporte.ClaseOtroImporte | claves_otroimporte | clave | 1 | 1 | sequence | claves_otroimporte (§13.3.28) | Clase de importe |
| tipo_otroimporte.Importe | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 1 | 1 | sequence |  | Importe |
| tipo_otroimporte.DescripcionOtroImporte | xs:string |  | 0 | 1 | sequence |  | Descripción de otro importe |

### n_tipo_otroimporte  (PDF §13.29.n)
_Lista de otros importes._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_otroimporte.Importe | tipo_otroimporte |  | 1 | unbounded | sequence |  | Importe correspondiente a descuentos, bonificaciones o recargos. |

### tipo_otrosriesgos  (PDF §13.30)
_Otros riesgos_

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_otrosriesgos.IdAplicacion | _char_20 | xs:string, max 20 | 0 | 1 | sequence |  | Número de aplicación o certificado en pólizas colectivas. |
| tipo_otrosriesgos.NombreRiesgo | _char_20 | xs:string, max 20 | 1 | 1 | sequence |  | Nombre del Riesgo |
| tipo_otrosriesgos.DescripcionRiesgo | xs:string |  | 1 | 1 | sequence |  | Descripción de datos del Riesgo |

### tipo_persona  (PDF §13.31)
_Tipo persona genérico._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_persona.PersonaFisica | tipo_personafisica |  | 1 | 1 | choice#1 |  |  |
| tipo_persona.PersonaJuridica | tipo_personajuridica |  | 1 | 1 | choice#1 |  |  |

### tipo_personafisica  (PDF §13.32)
_Datos de persona física._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_personafisica.TipoIdentificacion | claves_tipoidentificacion | clave | 1 | 1 | sequence | claves_tipoidentificacion (§13.3.35) | Tipo de identificación |
| tipo_personafisica.IdPersona | _char_20 | xs:string, max 20 | 1 | 1 | sequence |  | Identificación (NIF, NIE, Pasaporte). Valor ""No identificado"" si la persona no dispone de documento identificativo. (TipoIdentificacion = NO) |
| tipo_personafisica.IdCliente | _char_20 | xs:string, max 20 | 0 | 1 | sequence |  | Id o Código de cliente de compañía |
| tipo_personafisica.Nombre | _char_80 | xs:string, max 80 | 1 | 1 | sequence |  | Nombre de la persona |
| tipo_personafisica.Apellido1 | _char_80 | xs:string, max 80 | 1 | 1 | sequence |  | Primer apellido |
| tipo_personafisica.Apellido2 | _char_80 | xs:string, max 80 | 0 | 1 | sequence |  | Segundo apellido |
| tipo_personafisica.Sexo | claves_sexo | clave | 1 | 1 | sequence | claves_sexo (§13.3.31) | Sexo de la persona |
| tipo_personafisica.Domicilio | tipo_domicilio |  | 0 | 1 | sequence |  | Datos del domicilio de la persona. (Obligatorio si la persona es el Tomador de la póliza) |
| tipo_personafisica.FechaNacimiento | xs:dateTime |  | 0 | 1 | sequence |  | Fecha de nacimiento |
| tipo_personafisica.Idioma | _t_idioma | xs:string, pattern [a-z]{2} | 0 | 1 | sequence |  | Idioma de preferencia (ISO 639-1) |
| tipo_personafisica.Profesion | tipo_profesion |  | 0 | 1 | sequence |  | Según Clasificación Nacional de ocupaciones (CNO-11) del INE. Si no se dispone de código, informar en descripción. |
| tipo_personafisica.EstadoCivil | claves_estadocivil | clave | 0 | 1 | sequence | claves_estadocivil (§13.3.21) | Estado civil |
| tipo_personafisica.DatosContacto | tipo_contacto |  | 0 | 1 | sequence |  | Datos de contacto de la persona. |

### tipo_personajuridica  (PDF §13.33)
_Datos de persona juridica._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_personajuridica.TipoIdentificacion | claves_tipoidentificacion | clave | 1 | 1 | sequence | claves_tipoidentificacion (§13.3.35) | Tipo de identificación |
| tipo_personajuridica.IdPersona | _char_20 | xs:string, max 20 | 1 | 1 | sequence |  | Identificación |
| tipo_personajuridica.RazonSocial | _char_80 | xs:string, max 80 | 1 | 1 | sequence |  | Razón social o nombre de la persona jurídica |
| tipo_personajuridica.IdCliente | _char_20 | xs:string, max 20 | 0 | 1 | sequence |  | Id o Código de cliente de compañía |
| tipo_personajuridica.Domicilio | tipo_domicilio |  | 0 | 1 | sequence |  | Datos del domicilio de la persona. (Obligatorio si la persona es el Tomador de la póliza) |
| tipo_personajuridica.Idioma | _t_idioma | xs:string, pattern [a-z]{2} | 0 | 1 | sequence |  | Idioma de preferencia (ISO 639-1) |
| tipo_personajuridica.Actividad | tipo_actividad |  | 0 | 1 | sequence |  | Datos de actividad |
| tipo_personajuridica.DatosContacto | tipo_contacto |  | 0 | 1 | sequence |  | Datos de contacto de la empresa. |

### tipo_proteccion  (PDF §13.35)
_Medida de protección._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_proteccion.NumeroOrden | xs:unsignedInt |  | 0 | 1 | sequence |  | Número de orden o contador de unidades de tipo |
| tipo_proteccion.IdMedida | _char_20 | xs:string, max 20 | 0 | 1 | sequence |  | Referencia medida de protección |
| tipo_proteccion.DescripcionMedida | xs:string |  | 0 | 1 | sequence |  | Descripción de la medida |
| tipo_proteccion.IdSubmedida | _char_40 | xs:string, max 40 | 0 | 1 | sequence |  | Número de orden o de submedida |
| tipo_proteccion.ValorSubmedida | _char_150 | xs:string, max 150 | 0 | 1 | sequence |  | Valor submedida |

### n_tipo_proteccion  (PDF §13.35.n)
_Lista de medidas de protección_

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_proteccion.Proteccion | tipo_proteccion |  | 1 | unbounded | sequence |  | Medida de protección. |

### tipo_ramo  (PDF §13.36)
_Datos del ramo._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_ramo.RamoDGS | claves_ramo | clave | 1 | 1 | sequence | claves_ramo (§13.2) | Código DGS del ramo. |
| tipo_ramo.RamoEntidad | _char_20 | xs:string, max 20 | 1 | 1 | sequence |  | Código interno del ramo para la Entidad. |
| tipo_ramo.DescripcionRamo | xs:string |  | 1 | 1 | sequence |  | Descripción del ramo. |
| tipo_ramo.ModalidadRamo | claves_modalidadramo | clave | 0 | 1 | sequence | claves_modalidadramo (§13.3.89) | Código de modalidad. |
| tipo_ramo.DescripcionModalidad | xs:string |  | 0 | 1 | sequence |  | Descripción de la modalidad. Obligatorio si se informa el campo Modalidad Ramo. |
| tipo_ramo.PackComercial | _char_40 | xs:string, max 40 | 0 | 1 | sequence |  | Código de producto o paquete. |
| tipo_ramo.DescripcionPackComercial | xs:string |  | 0 | 1 | sequence |  | Descripción de producto o paquete. |

### tipo_regularizacion  (PDF §13.37)
_Datos de regularización_

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_regularizacion.PolizaRegularizable | xs:boolean |  | 1 | 1 | sequence |  | Indicador de si la póliza es regularizable |
| tipo_regularizacion.FechaEfecto | xs:dateTime |  | 0 | 1 | sequence |  | Fecha de efecto de la regularización |
| tipo_regularizacion.FechaVencimiento | xs:dateTime |  | 0 | 1 | sequence |  | Fecha de vencimiento de la regularización |
| tipo_regularizacion.Periodo | claves_periodo | clave | 0 | 1 | sequence | claves_periodo (§13.3.29) | Periodo de regularización |
| tipo_regularizacion.ClaseRegularizacion | claves_claseregularizacion | clave | 0 | 1 | sequence | claves_claseregularizacion (§13.3.13) | Tipo de regularización |
| tipo_regularizacion.ConceptosRegularizacion | n_tipo_conceptoregularizacion |  | 0 | 1 | sequence |  | Conceptos regularizados |

### tipo_riesgo  (PDF §13.38)
_Datos de riesgo asegurado._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_riesgo.NumeroOrden | xs:unsignedInt |  | 0 | 1 | sequence |  | Número de orden o contador de unidades de tipo. |
| tipo_riesgo.DescripcionRiesgo | xs:string |  | 1 | 1 | sequence |  | Descripción del riesgo. |
| tipo_riesgo.FechaInicio | xs:dateTime |  | 1 | 1 | sequence |  | Fecha inicio del riesgo. |
| tipo_riesgo.IdRiesgo | _char_20 | xs:string, max 20 | 0 | 1 | sequence |  | Identificador de riesgo |
| tipo_riesgo.IdAgrupacion | _char_40 | xs:string, max 40 | 0 | 1 | sequence |  | Identificador de agrupación o grupo en póliza colectiva. |
| tipo_riesgo.IdCentroFacturacion | _char_40 | xs:string, max 40 | 0 | 1 | sequence |  | Identificador del centro de facturación |
| tipo_riesgo.RiesgoAccidentes | tipo_riesgoaccidentes |  | 1 | 1 | sequence > choice#7 |  | Datos del ramo Accidentes. |
| tipo_riesgo.RiesgoAutos | tipo_riesgoautos |  | 1 | 1 | sequence > choice#7 |  | Datos del ramo Automóviles. |
| tipo_riesgo.RiesgoComercios | tipo_riesgocomercios |  | 1 | 1 | sequence > choice#7 |  | Datos del ramo Multirriesgo comercios. |
| tipo_riesgo.RiesgoComunidades | tipo_riesgocomunidades |  | 1 | 1 | sequence > choice#7 |  | Datos del ramo Multirriesgo comunidades. |
| tipo_riesgo.RiesgoHogar | tipo_riesgohogar |  | 1 | 1 | sequence > choice#7 |  | Datos del ramo Multirriesgo hogar. |
| tipo_riesgo.RiesgoAsistenciaSanitaria | tipo_riesgoasistenciasanitaria |  | 1 | 1 | sequence > choice#7 |  | Datos del ramo Asistencia sanitaria. |
| tipo_riesgo.RiesgoAsistenciaViaje | tipo_riesgoasistenciaviaje |  | 1 | 1 | sequence > choice#7 |  | Datos del ramo Asistencia en viaje. |
| tipo_riesgo.RiesgoCaucion | tipo_riesgocaucion |  | 1 | 1 | sequence > choice#7 |  | Datos del ramo Caución. |
| tipo_riesgo.RiesgoConstruccion | tipo_riesgoconstruccion |  | 1 | 1 | sequence > choice#7 |  | Datos del riesgo Construcción. |
| tipo_riesgo.RiesgoCredito | tipo_riesgocredito |  | 1 | 1 | sequence > choice#7 |  | Datos del ramo Crédito. |
| tipo_riesgo.RiesgoDecesos | tipo_riesgodecesos |  | 1 | 1 | sequence > choice#7 |  | Datos del ramo Decesos. |
| tipo_riesgo.RiesgoDefensaJuridica | tipo_riesgodefensajuridica |  | 1 | 1 | sequence > choice#7 |  | Datos del ramo Defensa jurídica. |
| tipo_riesgo.RiesgoEmbarcaciones | tipo_riesgoembarcaciones |  | 1 | 1 | sequence > choice#7 |  | Datos del seguro de embarcaciones de recreo. |
| tipo_riesgo.RiesgoIncendios | tipo_riesgoincendios |  | 1 | 1 | sequence > choice#7 |  | Datos del ramo Incendios. |
| tipo_riesgo.RiesgoIndustriales | tipo_riesgoindustriales |  | 1 | 1 | sequence > choice#7 |  | Datos del ramo Multirriesgos industriales. |
| tipo_riesgo.RiesgoPerdidasDiversas | tipo_riesgoperdidasdiversas |  | 1 | 1 | sequence > choice#7 |  | Datos del ramo Pérdidas diversas. |
| tipo_riesgo.RiesgoRC | tipo_riesgoRC |  | 1 | 1 | sequence > choice#7 |  | Datos del ramo Responsabilidad civil. |
| tipo_riesgo.RiesgoSalud | tipo_riesgosalud |  | 1 | 1 | sequence > choice#7 |  | Datos del ramo Salud. |
| tipo_riesgo.RiesgoTransportes | tipo_riesgotransportes |  | 1 | 1 | sequence > choice#7 |  | Datos del ramo Transportes. |
| tipo_riesgo.RiesgoVida | tipo_riesgovida |  | 1 | 1 | sequence > choice#7 |  | Datos del ramo Vida. |
| tipo_riesgo.OtrosDanos | tipo_otrosdanos |  | 1 | 1 | sequence > choice#7 |  | Datos del ramo Otros daños a los bienes. |
| tipo_riesgo.OtrosMultirriesgos | tipo_otrosmultirriesgos |  | 1 | 1 | sequence > choice#7 |  | Datos del ramo Otros multirriesgos. |
| tipo_riesgo.OtrosRiesgos | tipo_otrosriesgos |  | 1 | 1 | sequence > choice#7 |  | Datos de otros riesgos. |
| tipo_riesgo.FechaFin | xs:dateTime |  | 0 | 1 | sequence |  | Fecha vencimiento del riesgo |
| tipo_riesgo.DatosImportes | tipo_importes |  | 0 | 1 | sequence |  | Datos de importes. De aplicación en póliza colectiva para informar los importes de cada riesgo. |
| tipo_riesgo.DatosCoberturas | n_tipo_cobertura |  | 1 | 1 | sequence |  | Datos de las coberturas |
| tipo_riesgo.Beneficiarios | n_tipo_beneficiario |  | 0 | 1 | sequence |  | Beneficiarios riesgo |
| tipo_riesgo.OtrasFiguras | n_tipo_figura |  | 0 | 1 | sequence |  | Otras figuras del riesgo |
| tipo_riesgo.OtrosDatos | n_tipo_otrodato |  | 0 | 1 | sequence |  | Otros datos del Riesgo |

### n_tipo_riesgo  (PDF §13.38.n)
_Lista de riesgos asegurados._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_riesgo.Riesgo | tipo_riesgo |  | 1 | unbounded | sequence |  | Datos de riesgo asegurado. |

### tipo_riesgoaccidentes  (PDF §13.39)
_Riesgo asegurado de ramo accidentes_

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_riesgoaccidentes.Persona | tipo_personafisica |  | 0 | 1 | sequence |  | Persona física asegurada. |
| tipo_riesgoaccidentes.IdAplicacion | _char_20 | xs:string, max 20 | 0 | 1 | sequence |  | Número de aplicación o certificado en pólizas colectivas. |
| tipo_riesgoaccidentes.IdEmpleado | _char_40 | xs:string, max 40 | 0 | 1 | sequence |  | Identificador del empleado en la empresa (Número de matrícula o similar) |
| tipo_riesgoaccidentes.Convenio | _char_120 | xs:string, max 120 | 0 | 1 | sequence |  | Convenio colectivo. |

### tipo_riesgoautos  (PDF §13.40)
_Riesgo asegurado de ramo automóvil_

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_riesgoautos.Vehiculo | tipo_vehiculo |  | 1 | 1 | sequence |  | Datos del vehículo asegurado |
| tipo_riesgoautos.IdAplicacion | _char_20 | xs:string, max 20 | 0 | 1 | sequence |  | Número de aplicación o certificado en Pólizas colectivas |
| tipo_riesgoautos.IdEmpleado | _char_40 | xs:string, max 40 | 0 | 1 | sequence |  | Identificador del empleado en la empresa (Número de matrícula o similar) |
| tipo_riesgoautos.Propietario | tipo_persona |  | 0 | 1 | sequence |  | Datos del propietario |
| tipo_riesgoautos.Conductores | n_tipo_conductor |  | 0 | 1 | sequence |  | Datos conductores |

### tipo_riesgomultirriesgo
_Riesgo asegurado de ramo multirriesgo_

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_riesgomultirriesgo.SituacionRiesgo | tipo_domicilio |  | 1 | 1 | sequence |  | Situación del riesgo. |
| tipo_riesgomultirriesgo.IdAplicacion | _char_20 | xs:string, max 20 | 0 | 1 | sequence |  | Número de aplicación o certificado en pólizas colectivas. |
| tipo_riesgomultirriesgo.Antiguedad | xs:gYear |  | 0 | 1 | sequence |  | Año de construcción. |
| tipo_riesgomultirriesgo.SuperficieConstruida | xs:decimal |  | 0 | 1 | sequence |  | Metros cuadrados construidos |
| tipo_riesgomultirriesgo.SuperficieTotal | xs:decimal |  | 0 | 1 | sequence |  | Metros cuadrados totales (incluído solar) |
| tipo_riesgomultirriesgo.Zona | claves_zona | clave | 0 | 1 | sequence | claves_zona (§13.3.39) | Zona del inmueble. |
| tipo_riesgomultirriesgo.MedidasProteccion | n_tipo_proteccion |  | 0 | 1 | sequence |  | Medidas de protección. |

### tipo_riesgocomercios  (PDF §13.41)
_Riesgo asegurado de ramo multirriesgo comercios._

Extiende: `tipo_riesgomultirriesgo`

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_riesgocomercios.Capitales | n_tipo_capital |  | 1 | 1 | sequence |  | Capitales asegurados |
| tipo_riesgocomercios.Actividad | tipo_actividad |  | 0 | 1 | sequence |  | Datos de actividad |

### tipo_riesgocomunidades  (PDF §13.42)
_Riesgo asegurado de ramo multirriesgo comunidades_

Extiende: `tipo_riesgomultirriesgo`

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_riesgocomunidades.Capitales | n_tipo_capital |  | 1 | 1 | sequence |  | Capitales asegurados |
| tipo_riesgocomunidades.ClaseComunidad | claves_comunidad | clave | 1 | 1 | sequence | claves_comunidad (§13.3.18) | Clase Comunidad |
| tipo_riesgocomunidades.NumeroViviendas | xs:unsignedInt |  | 0 | 1 | sequence |  | Número viviendas |
| tipo_riesgocomunidades.NumeroLocales | xs:unsignedInt |  | 0 | 1 | sequence |  | Número locales |
| tipo_riesgocomunidades.NumeroPlazas | xs:unsignedInt |  | 0 | 1 | sequence |  | Número plazas |

### tipo_riesgohogar  (PDF §13.43)
_Riesgo asegurado de ramo multirriesgo hogar_

Extiende: `tipo_riesgomultirriesgo`

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_riesgohogar.Capitales | n_tipo_capital |  | 1 | 1 | sequence |  | Capitales asegurados |
| tipo_riesgohogar.ClaseInmueble | claves_claseinmueble | clave | 1 | 1 | sequence | claves_claseinmueble (§13.3.8) | Clase inmueble |
| tipo_riesgohogar.UsoInmueble | claves_usoinmueble | clave | 1 | 1 | sequence | claves_usoinmueble (§13.3.37) | Clase de uso |

### tipo_suplementopoliza  (PDF §13.44)
_Datos de suplemento._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_suplementopoliza.NumeroOrden | xs:unsignedInt |  | 0 | 1 | sequence |  | Número de orden o contador de unidades de tipo |
| tipo_suplementopoliza.IdSuplemento | _char_20 | xs:string, max 20 | 1 | 1 | sequence |  | Número de suplemento |
| tipo_suplementopoliza.Detalle | _char_80 | xs:string, max 80 | 1 | 1 | sequence |  | Detalle del suplemento |
| tipo_suplementopoliza.Fechas | tipo_fechas |  | 1 | 1 | sequence |  | Fechas del suplemento |
| tipo_suplementopoliza.Situacion | claves_situacionsuplemento | clave | 1 | 1 | sequence | claves_situacionsuplemento (§13.3.34) | Situación del suplemento |
| tipo_suplementopoliza.ClaseSuplemento | claves_clasesuplemento | clave | 1 | 1 | sequence | claves_clasesuplemento (§13.3.14) | Clase de suplemento |
| tipo_suplementopoliza.DescripcionClaseSuplemento | xs:string |  | 0 | 1 | sequence |  | Descripción de la clase de suplemento |

### n_tipo_suplementopoliza  (PDF §13.44.n)
_Lista de suplementos de la póliza._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_suplementopoliza.Suplemento | tipo_suplementopoliza |  | 1 | unbounded | sequence |  | Datos de suplemento. |

### tipo_suspensionpoliza  (PDF §13.45)
_Datos de suspensión de póliza._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_suspensionpoliza.NumeroOrden | xs:unsignedInt |  | 0 | 1 | sequence |  | Número de orden o contador de unidades de tipo. |
| tipo_suspensionpoliza.FechaSuspension | xs:dateTime |  | 1 | 1 | sequence |  | Fecha de suspensión de la póliza. |
| tipo_suspensionpoliza.FechaReactivacion | xs:dateTime |  | 0 | 1 | sequence |  | Fecha de reactivación de la póliza. |
| tipo_suspensionpoliza.Motivo | claves_reactivacion | clave | 0 | 1 | sequence | claves_reactivacion (§13.3.30) | Motivo de la reactivación. |

### n_tipo_suspensionpoliza  (PDF §13.45.n)
_Historial de suspensiones de la póliza_

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_suspensionpoliza.Suspension | tipo_suspensionpoliza |  | 1 | unbounded | sequence |  | Datos de suspensión de póliza. |

### tipo_vehiculo  (PDF §13.47)
_Información del vehículo_

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_vehiculo.Matricula | _t_matricula | xs:string, pattern [A-Z\-\d]{4,12} | 1 | 1 | sequence |  | Matrícula del vehículo |
| tipo_vehiculo.ClaseVehiculo | claves_clasevehiculo | clave | 1 | 1 | sequence | claves_clasevehiculo (§13.3.16) | Clase de vehículo |
| tipo_vehiculo.Marca | _char_40 | xs:string, max 40 | 1 | 1 | sequence |  | Marca del vehículo |
| tipo_vehiculo.Modelo | _char_40 | xs:string, max 40 | 1 | 1 | sequence |  | Modelo del vehículo |
| tipo_vehiculo.Version | _char_50 | xs:string, max 50 | 0 | 1 | sequence |  | Versión del modelo del vehículo |
| tipo_vehiculo.BaseSIETe | _char_20 | xs:string, max 20 | 0 | 1 | sequence |  | Referencia Base SIETe |
| tipo_vehiculo.UsoVehiculo | _t_usovehiculo | xs:string, pattern [A\|B]([0-1][0-9]\|2[0-1]) | 0 | 1 | sequence |  | Uso del vehículo |
| tipo_vehiculo.Antiguedad | xs:dateTime |  | 0 | 1 | sequence |  | Fecha de fabricación o de primera matriculación. |
| tipo_vehiculo.FechaMatriculacion | xs:dateTime |  | 0 | 1 | sequence |  | Fecha de matriculación. |
| tipo_vehiculo.Bastidor | _char_40 | xs:string, max 40 | 0 | 1 | sequence |  | Número de bastidor |
| tipo_vehiculo.Combustible | claves_combustible | clave | 0 | 1 | sequence | claves_combustible (§13.3.17) | Clase de combustible utilizado por el vehículo. |
| tipo_vehiculo.CategoriaVehiculo | claves_categoriavehiculo | clave | 0 | 1 | sequence | claves_categoriavehiculo (§13.3.4) | Categoría del vehículo |
| tipo_vehiculo.Cilindrada | xs:decimal |  | 0 | 1 | sequence |  | Cilindrada del vehículo (en cm3) |
| tipo_vehiculo.Potencia | xs:decimal |  | 0 | 1 | sequence |  | Potencia del vehículo (en CV) |
| tipo_vehiculo.Plazas | xs:unsignedInt |  | 0 | 1 | sequence |  | Número de plazas |
| tipo_vehiculo.Valor | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 0 | 1 | sequence |  | Valor del vehículo |
| tipo_vehiculo.Accesorios | n_tipo_accesoriovehiculo |  | 0 | 1 | sequence |  | Accesorios del vehículo |
| tipo_vehiculo.Color | _char_40 | xs:string, max 40 | 0 | 1 | sequence |  | Color del vehículo |
| tipo_vehiculo.PMA | xs:decimal |  | 0 | 1 | sequence |  | Peso máximo autorizado |
| tipo_vehiculo.Remolque | xs:boolean |  | 0 | 1 | sequence |  | Indicador de si tiene remolque |

### n_tipo_vehiculo  (PDF §13.47.n)
_Tipos de vehículo_

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_vehiculo.Vehiculo | tipo_vehiculo |  | 1 | unbounded | sequence |  |  |

### tipo_riesgoasistenciasanitaria  (PDF §13.48)
_Riesgo asegurado de asistencia sanitaria_

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_riesgoasistenciasanitaria.Persona | tipo_personafisica |  | 1 | 1 | sequence |  | Persona física asegurada. |
| tipo_riesgoasistenciasanitaria.IdAplicacion | _char_20 | xs:string, max 20 | 0 | 1 | sequence |  | Número de aplicación o certificado en pólizas colectivas. |
| tipo_riesgoasistenciasanitaria.IdEmpleado | _char_40 | xs:string, max 40 | 0 | 1 | sequence |  | Identificador del empleado en la empresa (Número de matrícula o similar) |
| tipo_riesgoasistenciasanitaria.Modalidad | xs:string |  | 0 | 1 | sequence |  | Descripción de la modalidad de seguro. |

### tipo_riesgoasistenciaviaje  (PDF §13.49)
_Riesgo asegurado de asistencia viaje_

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_riesgoasistenciaviaje.Persona | tipo_personafisica |  | 0 | 1 | sequence |  | Persona física asegurada. |
| tipo_riesgoasistenciaviaje.IdAplicacion | _char_20 | xs:string, max 20 | 0 | 1 | sequence |  | Número de aplicación o certificado en pólizas colectivas. |
| tipo_riesgoasistenciaviaje.IdEmpleado | _char_40 | xs:string, max 40 | 0 | 1 | sequence |  | Identificador del empleado en la empresa (Número de matrícula o similar) |
| tipo_riesgoasistenciaviaje.Viaje | tipo_viaje |  | 0 | 1 | sequence |  | Información del viaje. |
| tipo_riesgoasistenciaviaje.Vehiculo | tipo_vehiculo |  | 0 | 1 | sequence |  | Datos del vehículo asegurado |

### tipo_riesgocaucion  (PDF §13.50)
_Riesgo asegurado de caución_

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_riesgocaucion.IdAplicacion | _char_20 | xs:string, max 20 | 0 | 1 | sequence |  | Número de aplicación o certificado en pólizas colectivas. |
| tipo_riesgocaucion.Actividad | tipo_actividad |  | 0 | 1 | sequence |  | Actividad económica asegurada. |
| tipo_riesgocaucion.Empresa | tipo_empresa |  | 0 | 1 | sequence |  | Datos de la empresa asegurada. |
| tipo_riesgocaucion.Modalidad | xs:string |  | 0 | 1 | sequence |  | Descripción de la modalidad seguro de caución. |

### tipo_riesgoconstruccion  (PDF §13.51)
_Riesgo asegurado de construcción_

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_riesgoconstruccion.IdAplicacion | _char_20 | xs:string, max 20 | 0 | 1 | sequence |  | Número de aplicación o certificado en pólizas colectivas. |
| tipo_riesgoconstruccion.DomicilioObra | tipo_domicilio |  | 0 | 1 | sequence |  | Domicilio de la obra. |
| tipo_riesgoconstruccion.ClaseObra | claves_obra | clave | 0 | 1 | sequence | claves_obra (§13.3.43) | Tipo de la obra. |
| tipo_riesgoconstruccion.Ubicacion | claves_zona | clave | 0 | 1 | sequence | claves_zona (§13.3.39) | Ubicación de la obra. |
| tipo_riesgoconstruccion.DescripcionUbicacion | xs:string |  | 0 | 1 | sequence |  | Descripción de la ubicación. |
| tipo_riesgoconstruccion.Licencia | _char_40 | xs:string, max 40 | 0 | 1 | sequence |  | Numero de licencia de obra. |
| tipo_riesgoconstruccion.OCT | _char_40 | xs:string, max 40 | 0 | 1 | sequence |  | Organismo de Control Técnico. |
| tipo_riesgoconstruccion.FechaInicioObra | xs:dateTime |  | 0 | 1 | sequence |  | Fecha de inicio de la obra. |
| tipo_riesgoconstruccion.FechaFinObra | xs:dateTime |  | 0 | 1 | sequence |  | Fecha fin de la obra. |
| tipo_riesgoconstruccion.NumeroViviendas | xs:unsignedInt |  | 0 | 1 | sequence |  | Número de viviendas. |
| tipo_riesgoconstruccion.NumeroLocales | xs:unsignedInt |  | 0 | 1 | sequence |  | Número de locales. |
| tipo_riesgoconstruccion.NumeroPlazas | xs:unsignedInt |  | 0 | 1 | sequence |  | Número de plazas. |
| tipo_riesgoconstruccion.PlantasSobreRasante | xs:unsignedInt |  | 0 | 1 | sequence |  | Número de plantas sobre rasante. |
| tipo_riesgoconstruccion.PlantasBajoRasante | xs:unsignedInt |  | 0 | 1 | sequence |  | Número de plantas bajo rasante. |
| tipo_riesgoconstruccion.SuperficieTotal | xs:decimal |  | 0 | 1 | sequence |  | Metros cuadrados del terreno. |
| tipo_riesgoconstruccion.SuperficieSobreRasante | xs:decimal |  | 0 | 1 | sequence |  | Superficie de las plantas sobre rasantes (en metros2) |
| tipo_riesgoconstruccion.SuperficieBajoRasante | xs:decimal |  | 0 | 1 | sequence |  | Superficie de las plantas bajo rasantes (en metros2) |
| tipo_riesgoconstruccion.PorcentajePrimerPago | xs:decimal |  | 0 | 1 | sequence |  | Porcentaje del primer pago de la póliza. |

### tipo_riesgocredito  (PDF §13.52)
_Riesgo asegurado de crédito_

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_riesgocredito.IdAplicacion | _char_20 | xs:string, max 20 | 0 | 1 | sequence |  | Número de aplicación o certificado en pólizas colectivas. |
| tipo_riesgocredito.Actividad | tipo_actividad |  | 0 | 1 | sequence |  | Actividad económica asegurada. |
| tipo_riesgocredito.Empresa | tipo_empresa |  | 0 | 1 | sequence |  | Datos de la empresa asegurada. |
| tipo_riesgocredito.Modalidad | xs:string |  | 0 | 1 | sequence |  | Descripción de la modalidad seguro de crédito. |

### tipo_riesgodecesos  (PDF §13.53)
_Riesgo asegurado decesos._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_riesgodecesos.Persona | tipo_personafisica |  | 1 | 1 | sequence |  | Persona física asegurada. |
| tipo_riesgodecesos.IdAplicacion | _char_20 | xs:string, max 20 | 0 | 1 | sequence |  | Número de aplicación o certificado en pólizas colectivas. |
| tipo_riesgodecesos.IdEmpleado | _char_40 | xs:string, max 40 | 0 | 1 | sequence |  | Identificador del empleado en la empresa (Número de matrícula o similar) |
| tipo_riesgodecesos.Modalidad | xs:string |  | 0 | 1 | sequence |  | Descripción de la modalidad seguro de decesos. |

### tipo_riesgodefensajuridica  (PDF §13.54)
_Riesgo asegurado de defensa jurídica_

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_riesgodefensajuridica.IdAplicacion | _char_20 | xs:string, max 20 | 0 | 1 | sequence |  | Número de aplicación o certificado en pólizas colectivas. |
| tipo_riesgodefensajuridica.Vehiculo | tipo_vehiculo |  | 0 | 1 | sequence |  | Datos del vehículo asegurado. |
| tipo_riesgodefensajuridica.Persona | tipo_persona |  | 0 | 1 | sequence |  | Datos de la persona asegurada. |
| tipo_riesgodefensajuridica.Domicilio | tipo_domicilio |  | 0 | 1 | sequence |  | Datos del domicilio asegurado. |

### tipo_riesgoincendios  (PDF §13.55)
_Riesgo asegurado de incendios_

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_riesgoincendios.IdAplicacion | _char_20 | xs:string, max 20 | 0 | 1 | sequence |  | Número de aplicación o certificado en pólizas colectivas. |
| tipo_riesgoincendios.Capitales | n_tipo_capital |  | 1 | 1 | sequence |  | Capitales asegurados |
| tipo_riesgoincendios.Domicilio | tipo_domicilio |  | 1 | 1 | sequence |  | Domicilio del riesgo asegurado |
| tipo_riesgoincendios.ClaseRiesgo | _char_80 | xs:string, max 80 | 0 | 1 | sequence |  | Tipo de riesgo asegurado. |
| tipo_riesgoincendios.Actividad | tipo_actividad |  | 0 | 1 | sequence |  | Datos de la actividad económica. |

### tipo_riesgoindustriales  (PDF §13.56)
_Riesgo asegurado de industriales_

Extiende: `tipo_riesgomultirriesgo`

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_riesgoindustriales.Capitales | n_tipo_capital |  | 1 | 1 | sequence |  | Capitales asegurados |
| tipo_riesgoindustriales.ClaseInmueble | claves_claseinmueble | clave | 0 | 1 | sequence | claves_claseinmueble (§13.3.8) | Tipo de inmueble. |
| tipo_riesgoindustriales.Actividad | tipo_actividad |  | 0 | 1 | sequence |  | Datos de actividad. |

### tipo_riesgoperdidasdiversas  (PDF §13.57)
_Riesgo asegurado de pérdidas diversas_

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_riesgoperdidasdiversas.IdAplicacion | _char_20 | xs:string, max 20 | 0 | 1 | sequence |  | Número de aplicación o certificado en pólizas colectivas. |
| tipo_riesgoperdidasdiversas.Actividad | tipo_actividad |  | 0 | 1 | sequence |  | Datos de la actividad asegurada. |
| tipo_riesgoperdidasdiversas.Prestamo | tipo_prestamo |  | 0 | 1 | sequence |  | Datos del préstamo vinculado al riesgo. |
| tipo_riesgoperdidasdiversas.Vehiculo | tipo_vehiculo |  | 0 | 1 | sequence |  | Datos del vehículo asegurado |
| tipo_riesgoperdidasdiversas.Persona | tipo_persona |  | 0 | 1 | sequence |  | Datos de la persona asegurada |

### tipo_riesgoRC  (PDF §13.58)
_Riesgo asegurado de RC_

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_riesgoRC.IdAplicacion | _char_20 | xs:string, max 20 | 0 | 1 | sequence |  | Número de aplicación o certificado en pólizas colectivas. |
| tipo_riesgoRC.Capitales | n_tipo_capital |  | 0 | 1 | sequence |  | Capitales asegurados |
| tipo_riesgoRC.Actividad | tipo_actividad |  | 1 | 1 | sequence |  | Datos de la actividad asegurada. |
| tipo_riesgoRC.Empresa | tipo_empresa |  | 0 | 1 | sequence |  | Información de la empresa asegurada. |
| tipo_riesgoRC.Animal | tipo_animal |  | 0 | 1 | sequence |  | Información del animal asegurado. |
| tipo_riesgoRC.Maquina | tipo_maquina |  | 0 | 1 | sequence |  | Información de la máquina asegurada. |
| tipo_riesgoRC.Licencia | tipo_licencia |  | 0 | 1 | sequence |  | Datos de la licencia de caza/pesca. |

### tipo_riesgosalud  (PDF §13.59)
_Riesgo asegurado salud_

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_riesgosalud.Persona | tipo_personafisica |  | 1 | 1 | sequence |  | Persona física asegurada. |
| tipo_riesgosalud.IdAplicacion | _char_20 | xs:string, max 20 | 0 | 1 | sequence |  | Número de aplicación o certificado en pólizas colectivas. |
| tipo_riesgosalud.IdEmpleado | _char_40 | xs:string, max 40 | 0 | 1 | sequence |  | Identificador del empleado en la empresa (Número de matrícula o similar) |
| tipo_riesgosalud.Modalidad | xs:string |  | 0 | 1 | sequence |  | Descripción de la modalidad seguro de salud. |

### tipo_riesgotransportes  (PDF §13.60)
_Riesgo asegurado de transportes_

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_riesgotransportes.IdAplicacion | _char_20 | xs:string, max 20 | 0 | 1 | sequence |  | Número de aplicación o certificado en pólizas colectivas. |
| tipo_riesgotransportes.Origen | tipo_domicilio |  | 0 | 1 | sequence |  | Origen del transporte. |
| tipo_riesgotransportes.Destino | tipo_domicilio |  | 0 | 1 | sequence |  | Destino del transporte. |
| tipo_riesgotransportes.Mercancia | xs:string |  | 0 | 1 | sequence |  | Descripción de la mercancía transportada. |
| tipo_riesgotransportes.MedioTransporte | claves_mediotransporte | clave | 0 | 1 | sequence | claves_mediotransporte (§13.3.42) | Medio de transporte de la mercancía. |
| tipo_riesgotransportes.AmbitoTransporte | _char_150 | xs:string, max 150 | 0 | 1 | sequence |  | Ámbito del transporte (nacional, internacional, parcial nacional/internacional expresado en porcentajes) |
| tipo_riesgotransportes.Embarcacion | tipo_embarcacion |  | 0 | 1 | sequence |  | Embarcación asegurada. |
| tipo_riesgotransportes.Aeronave | tipo_aeronave |  | 0 | 1 | sequence |  | Aeronave asegurada. |

### tipo_riesgovida  (PDF §13.61)
_Riesgo asegurado vida_

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_riesgovida.Persona | tipo_personafisica |  | 0 | 1 | sequence |  | Persona física asegurada. Informar siempre excepto en riesgos de colectivos innominados. |
| tipo_riesgovida.IdAplicacion | _char_20 | xs:string, max 20 | 0 | 1 | sequence |  | Número de aplicación o certificado en pólizas colectivas. |
| tipo_riesgovida.IdEmpleado | _char_40 | xs:string, max 40 | 0 | 1 | sequence |  | Identificador del empleado en la empresa (Número de matrícula o similar) |
| tipo_riesgovida.Convenio | _char_120 | xs:string, max 120 | 0 | 1 | sequence |  | Convenio colectivo. |
| tipo_riesgovida.Prestamo | tipo_prestamo |  | 0 | 1 | sequence |  | Datos de préstamo vinculado al riesgo |
| tipo_riesgovida.ClaseSeguro | claves_claseseguro | clave | 0 | 1 | sequence | claves_claseseguro (§13.3.40) | Clase de seguro. |
| tipo_riesgovida.EdadJubilacion | _t_edad | xs:unsignedInt, rango 1..99 | 0 | 1 | sequence |  | Edad prevista de jubilación. |
| tipo_riesgovida.ActividadesRiesgo | xs:boolean |  | 0 | 1 | sequence |  | Indica si el asegurado practica alguna actividad de riesgo. |
| tipo_riesgovida.UsoMaquinaria | xs:boolean |  | 0 | 1 | sequence |  | Indica si el asegurado utiliza máquinas. |
| tipo_riesgovida.Maquinas | n_tipo_maquina |  | 0 | 1 | sequence |  | Máquinas que utiliza. |
| tipo_riesgovida.UsoVehiculo | xs:boolean |  | 0 | 1 | sequence |  | Indica si el asegurado utiliza el vehículo habitualmente. |
| tipo_riesgovida.UsoVehiculoPesado | xs:boolean |  | 0 | 1 | sequence |  | Indica si el asegurado utiliza vehículos pesados. |
| tipo_riesgovida.Vehiculos | n_tipo_vehiculo |  | 0 | 1 | sequence |  | Vehículos que utiliza el asegurado. |
| tipo_riesgovida.UsoHerramientasCorte | xs:boolean |  | 0 | 1 | sequence |  | Indica si el asegurado utiliza herramientas de corte. |
| tipo_riesgovida.UsoArmas | xs:boolean |  | 0 | 1 | sequence |  | Indica si el asegurado lleva o utiliza armas. |
| tipo_riesgovida.ContactoQuimicos | xs:boolean |  | 0 | 1 | sequence |  | Indica si el asegurado está en contacto con sustancias químicas. |
| tipo_riesgovida.TrabajoAltura | xs:boolean |  | 0 | 1 | sequence |  | Indica si el asegurado trabaja a una altura que supone riesgo. |

### tipo_otrosdanos  (PDF §13.62)
_Riesgo asegurado de otros daños_

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_otrosdanos.Domicilio | tipo_domicilio |  | 1 | 1 | sequence |  | Domicilio del riesgo asegurado. |
| tipo_otrosdanos.IdAplicacion | _char_20 | xs:string, max 20 | 0 | 1 | sequence |  | Número de aplicación o certificado en pólizas colectivas. |
| tipo_otrosdanos.Agrario | tipo_agrario |  | 0 | 1 | sequence |  | Datos del riesgo agrario asegurado. |
| tipo_otrosdanos.Pecuario | tipo_pecuario |  | 0 | 1 | sequence |  | Datos del riesgo pecuario asegurado. |

### tipo_otrosmultirriesgos  (PDF §13.63)
_Riesgo asegurado de ramo otros multirriesgo_

Extiende: `tipo_riesgomultirriesgo`

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_otrosmultirriesgos.Capitales | n_tipo_capital |  | 0 | 1 | sequence |  | Capitales asegurados |
| tipo_otrosmultirriesgos.Actividad | tipo_actividad |  | 0 | 1 | sequence |  | Datos de actividad. |
| tipo_otrosmultirriesgos.ClaseInmueble | claves_claseinmueble | clave | 0 | 1 | sequence | claves_claseinmueble (§13.3.8) | Clase de inmueble. |
| tipo_otrosmultirriesgos.UsoInmueble | claves_usoinmueble | clave | 0 | 1 | sequence | claves_usoinmueble (§13.3.37) | Clase de uso dado al inmueble. |
| tipo_otrosmultirriesgos.Rehabilitaciones | n_tipo_rehabilitacion |  | 0 | 1 | sequence |  | Rehabilitaciones realizadas en el inmueble. |

### tipo_agrario  (PDF §13.64)
_Datos de riesgo agrario._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_agrario.Termino | _char_150 | xs:string, max 150 | 0 | 1 | sequence |  | Término donde está ubicada la explotación. |
| tipo_agrario.Poligono | _char_150 | xs:string, max 150 | 0 | 1 | sequence |  | Polígono donde está ubicada la explotación. |
| tipo_agrario.Parcela | _char_150 | xs:string, max 150 | 0 | 1 | sequence |  | Parcela donde está ubicada la explotación. |
| tipo_agrario.CodigoCultivo | _char_20 | xs:string, max 20 | 0 | 1 | sequence |  | Código de cultivo de la explotación. |
| tipo_agrario.Cultivo | xs:string |  | 0 | 1 | sequence |  | Descripción del cultivo de la explotación. |
| tipo_agrario.CodigoVariedad | _char_20 | xs:string, max 20 | 0 | 1 | sequence |  | Código de variedad de la explotación. |
| tipo_agrario.Variedad | xs:string |  | 0 | 1 | sequence |  | Descripción de la variedad de la explotación. |
| tipo_agrario.Superficie | xs:decimal |  | 0 | 1 | sequence |  | Superficie de la explotación (expresado en hectáreas) |
| tipo_agrario.Produccion | xs:decimal |  | 0 | 1 | sequence |  | Producción de la explotación (expresado en kg.) |

### tipo_animal  (PDF §13.65)
_Datos de animal._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_animal.IdAnimal | _char_50 | xs:string, max 50 | 0 | 1 | sequence |  | Identificación del animal (chip) |
| tipo_animal.ClaseAnimal | _char_80 | xs:string, max 80 | 0 | 1 | sequence |  | Clase genérica del animal (perro, gato, etc.) |
| tipo_animal.RazaAnimal | _char_80 | xs:string, max 80 | 0 | 1 | sequence |  | Raza del animal |
| tipo_animal.Peligroso | xs:boolean |  | 0 | 1 | sequence |  | Indicador de si el animal es peligroso. |
| tipo_animal.UsoAnimal | _char_80 | xs:string, max 80 | 0 | 1 | sequence |  | Uso del animal (caza, compañía, etc.) |
| tipo_animal.FechaNacimiento | xs:dateTime |  | 0 | 1 | sequence |  | Fecha de nacimiento del animal. |
| tipo_animal.Alquiler | xs:boolean |  | 0 | 1 | sequence |  | Indicador de si el animal es alquilado. |

### tipo_licencia  (PDF §13.66)
_Datos de licencia._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_licencia.IdLicencia | _char_40 | xs:string, max 40 | 0 | 1 | sequence |  | Número de licencia. |
| tipo_licencia.DescripcionLicencia | xs:string |  | 0 | 1 | sequence |  | Descripción de Licencia. |

### tipo_empresa  (PDF §13.67)
_Datos de empresa._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_empresa.Facturacion | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 0 | 1 | sequence |  | Facturación anual de la empresa. |
| tipo_empresa.NumeroClientes | xs:unsignedInt |  | 0 | 1 | sequence |  | Número de clientes de la empresa. |
| tipo_empresa.NumeroEmpleados | xs:unsignedInt |  | 0 | 1 | sequence |  | Número de empleados de la empresa. |
| tipo_empresa.Ambito | _char_150 | xs:string, max 150 | 0 | 1 | sequence |  | Ámbito de las actividades de la empresa (nacional, extranjero, etc.) |
| tipo_empresa.Actividad | tipo_actividad |  | 0 | 1 | sequence |  | Actividad de la empresa. |

### tipo_maquina  (PDF §13.68)
_Datos de máquina._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_maquina.Descripcion | xs:string |  | 0 | 1 | sequence |  | Descripción de la maquina. |
| tipo_maquina.Matricula | _char_20 | xs:string, max 20 | 0 | 1 | sequence |  | Matrícula de la máquina. |
| tipo_maquina.Bastidor | _char_40 | xs:string, max 40 | 0 | 1 | sequence |  | Número de bastidor. |
| tipo_maquina.Marca | _char_40 | xs:string, max 40 | 0 | 1 | sequence |  | Marca de la máquina. |
| tipo_maquina.Modelo | _char_40 | xs:string, max 40 | 0 | 1 | sequence |  | Modelo de la máquina. |
| tipo_maquina.PMA | xs:decimal |  | 0 | 1 | sequence |  | Peso máximo autorizado. |

### n_tipo_maquina  (PDF §13.69)
_Tipos de maquina_

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_maquina.Maquina | tipo_maquina |  | 1 | unbounded | sequence |  |  |

### tipo_pecuario  (PDF §13.70)
_Datos de explotación pecuaria para riesgo._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_pecuario.CodigoRegimen | _char_20 | xs:string, max 20 | 0 | 1 | sequence |  | Código del sistema/régimen de manejo de la explotación. |
| tipo_pecuario.DescripcionRegimen | xs:string |  | 0 | 1 | sequence |  | Descripción del sistema/régimen de manejo de la explotación. |
| tipo_pecuario.CodigoClaseAnimal | _char_20 | xs:string, max 20 | 0 | 1 | sequence |  | Código de la clase de animal. |
| tipo_pecuario.DescripcionClaseAnimal | xs:string |  | 0 | 1 | sequence |  | Descripción de la clase de animal. |
| tipo_pecuario.NumeroAnimales | xs:unsignedInt |  | 0 | 1 | sequence |  | Número de animales. |

### tipo_prestamo  (PDF §13.71)
_Tipo prestamo_

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_prestamo.NumeroPrestamo | _char_80 | xs:string, max 80 | 0 | 1 | sequence |  | Número de préstamo. |
| tipo_prestamo.DescripcionPrestamo | xs:string |  | 0 | 1 | sequence |  | Descripción del préstamo. |
| tipo_prestamo.TitularPrestamo | tipo_persona |  | 0 | 1 | sequence |  | Titular del préstamo. |
| tipo_prestamo.Contratacion | xs:decimal |  | 0 | 1 | sequence |  | Porcentaje de contratación del préstamo. |
| tipo_prestamo.ImporteInicial | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 0 | 1 | sequence |  | Importe nominal inicial del préstamo. |
| tipo_prestamo.ImporteNominal | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 0 | 1 | sequence |  | Importe nominal del préstamo. |
| tipo_prestamo.CuotaInicial | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 0 | 1 | sequence |  | Cuota inicial del préstamo. |
| tipo_prestamo.UnidadDuracion | claves_duracionprestamo | clave | 0 | 1 | sequence | claves_duracionprestamo (§13.3.41) | Unidad en la que se expresa la duración del préstamo. |
| tipo_prestamo.DuracionPrestamo | xs:unsignedInt |  | 0 | 1 | sequence |  | Duración del préstamo (en la unidad indicada en el campo anterior) |
| tipo_prestamo.ClasePrestamo | _char_120 | xs:string, max 120 | 0 | 1 | sequence |  | Clase de préstamo. |
| tipo_prestamo.EntidadBancaria | _char_80 | xs:string, max 80 | 0 | 1 | sequence |  | Nombre de la entidad bancaria. |
| tipo_prestamo.BIC | _t_bic | xs:string, pattern [A-Z\d]{8}\|[A-Z\d]{11} | 0 | 1 | sequence |  | Código de identificación del banco. |

### tipo_rehabilitacion  (PDF §13.72)
_Tipo rehabilitación_

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_rehabilitacion.NumeroOrden | xs:unsignedInt |  | 0 | 1 | sequence |  | Número de orden o contador de unidades de tipo. |
| tipo_rehabilitacion.Antiguedad | xs:gYear |  | 0 | 1 | sequence |  | Año de la rehabilitación. |
| tipo_rehabilitacion.Descripcion | xs:string |  | 0 | 1 | sequence |  | Descripción de la rehabilitación. |

### n_tipo_rehabilitacion  (PDF §13.72.n)
_Lista de rehabilitaciones._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_rehabilitacion.Rehabilitacion | tipo_rehabilitacion |  | 1 | unbounded | sequence |  | Datos de rehabilitación. |

### tipo_viaje  (PDF §13.74)
_Tipo viaje_

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_viaje.Origen | _char_150 | xs:string, max 150 | 0 | 1 | sequence |  | Origen del viaje |
| tipo_viaje.Destino | _char_150 | xs:string, max 150 | 0 | 1 | sequence |  | Destino del viaje |
| tipo_viaje.Duracion | xs:unsignedInt |  | 0 | 1 | sequence |  | Días de duración |
| tipo_viaje.NumeroPasajeros | xs:unsignedInt |  | 0 | 1 | sequence |  | Número de pasajeros |

### tipo_accionsiniestro  (PDF §13.75)
_Datos de la accion del siniestro._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_accionsiniestro.NumeroOrden | xs:unsignedInt |  | 0 | 1 | sequence |  | Código de la acción del siniestro |
| tipo_accionsiniestro.AccionSiniestro | claves_accionsiniestro | clave | 1 | 1 | sequence | claves_accionsiniestro (§13.3.44) | Código de la acción del siniestro |
| tipo_accionsiniestro.FechaAccion | xs:dateTime |  | 1 | 1 | sequence |  | Fecha en la que se realiza la acción del siniestro |
| tipo_accionsiniestro.DescripcionAccion | xs:string |  | 0 | 1 | sequence |  | Descripción de la acción del siniestro |
| tipo_accionsiniestro.SituacionAccion | claves_situacionaccion | clave | 1 | 1 | sequence | claves_situacionaccion (§13.3.81) | Situación de la acción, resultado de la actuaciones llevadas a a cabo.. (Pendiente de inicio, en curso, finalizado) |
| tipo_accionsiniestro.ClaseIdAccion | _char_150 | xs:string, max 150 | 0 | 1 | sequence |  | Clase de identificador vinculado a la acción. |
| tipo_accionsiniestro.IdAccion | _char_40 | xs:string, max 40 | 0 | 1 | sequence |  | Identificador de la acción (Identificador o número de referencia de asistencia, encargo de reparador, proceso juicial). |
| tipo_accionsiniestro.FigurasAccion | n_tipo_figuraaccion |  | 0 | 1 | sequence |  | Figuras que intervienen en la acción: Asistencia, reparador, taller, perito, abogado. |

### n_tipo_accionsiniestro  (PDF §13.75.n)
_Lista de acciones del siniestro._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_accionsiniestro.Accion | tipo_accionsiniestro |  | 1 | unbounded | sequence |  | Datos de la accion del siniestro. |

### tipo_convenio  (PDF §13.76)
_Datos de convenio._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_convenio.NumeroOrden | xs:unsignedInt |  | 0 | 1 | sequence |  | Número de orden o contador de unidades de tipo |
| tipo_convenio.ConvenioSiniestro | claves_convenio | clave | 1 | 1 | sequence | claves_convenio (§13.3.46) | Convenio que aplica al siniestro |

### n_tipo_convenio  (PDF §13.76.n)
_Lista de convenios._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_convenio.Convenio | tipo_convenio |  | 1 | unbounded | sequence |  | Datos del convenio. |

### tipo_danosiniestro  (PDF §13.77)
_Datos de daños de siniestro._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_danosiniestro.NumeroOrden | xs:unsignedInt |  | 0 | 1 | sequence |  | Número de orden o contador de unidades de tipo |
| tipo_danosiniestro.DescripcionDano | xs:string |  | 1 | 1 | sequence |  | Descripción del daño |
| tipo_danosiniestro.ValorDano | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 1 | 1 | sequence |  | Valor del daño. |
| tipo_danosiniestro.EstadoDano | _char_40 | xs:string, max 40 | 0 | 1 | sequence |  | Estado del daño (grave, leve) |

### n_tipo_danosiniestro  (PDF §13.77.n)
_Lista de daños de siniestro._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_danosiniestro.DanoSiniestro | tipo_danosiniestro |  | 1 | unbounded | sequence |  | Datos de los daños del siniestro. |

### tipo_pagosiniestro  (PDF §13.78)
_Datos de pago de siniestro._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_pagosiniestro.NumeroOrden | xs:unsignedInt |  | 0 | 1 | sequence |  | Número de orden o contador de unidades de tipo |
| tipo_pagosiniestro.FechaPago | xs:dateTime |  | 1 | 1 | sequence |  | Fecha de aceptación del pago de siniestro |
| tipo_pagosiniestro.FechaLiquidacion | xs:dateTime |  | 1 | 1 | sequence |  | Fecha de liquidación del pago de siniestro |
| tipo_pagosiniestro.ImportePago | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 1 | 1 | sequence |  | Importe del pago |
| tipo_pagosiniestro.DescripcionPago | xs:string |  | 0 | 1 | sequence |  | Descripción del pago |
| tipo_pagosiniestro.FormaPago | tipo_formapago |  | 0 | 1 | sequence |  | Datos del medio de pago |
| tipo_pagosiniestro.ReceptoresPago | n_tipo_figura |  | 0 | 1 | sequence |  | Información del receptor del pago |
| tipo_pagosiniestro.CoberturasIndemnizadas | n_tipo_cobertura |  | 0 | 1 | sequence |  | Coberturas indemnizadas en el pago |

### n_tipo_pagosiniestro  (PDF §13.78.n)
_Datos de pago de siniestro._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_pagosiniestro.PagoSiniestro | tipo_pagosiniestro |  | 1 | unbounded | sequence |  | Datos de pago de siniestro. |

### tipo_situacionsiniestro  (PDF §13.79)
_Datos de situación de siniestro._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_situacionsiniestro.NumeroOrden | xs:unsignedInt |  | 0 | 1 | sequence |  | Número de orden o contador de unidades de tipo |
| tipo_situacionsiniestro.SituacionSiniestro | claves_situacionsiniestro | clave | 1 | 1 | sequence | claves_situacionsiniestro (§13.3.48) | Código de la situación |
| tipo_situacionsiniestro.FechaSituacion | xs:dateTime |  | 1 | 1 | sequence |  | Fecha de la situación |
| tipo_situacionsiniestro.DescripcionSituacion | xs:string |  | 0 | 1 | sequence |  | Descripción de la situación |

### n_tipo_situacionsiniestro  (PDF §13.79.n)
_Lista de situaciones de siniestro._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_situacionsiniestro.Situacion | tipo_situacionsiniestro |  | 1 | unbounded | sequence |  | Datos de la situación de siniestro. |

### tipo_errordevolucion  (PDF §13.80)
_Datos de error._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_errordevolucion.FechaError | xs:dateTime |  | 1 | 1 | sequence |  | Fecha de notificación de error o devolución |
| tipo_errordevolucion.MotivoDevolucion | claves_devolucion | clave | 1 | 1 | sequence | claves_devolucion (§13.3.50) | Motivo de devolución |
| tipo_errordevolucion.ImporteDevolucion | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 0 | 1 | sequence |  | Diferencia de importe motivo de devolución. Prima o importe correcto, en caso de error en importe o prima.Informar sólo en caso de error en importe. |
| tipo_errordevolucion.ValorFecha | xs:dateTime |  | 0 | 1 | sequence |  | Valor correcto de la fecha indicada en Motivo de devolución. Informar sólo en caso de error en fecha. |
| tipo_errordevolucion.DescripcionMotivo | xs:string |  | 0 | 1 | sequence |  | Descripción del motivo de devolución. Informar siempre si motivo de devolución es Otros motivos. |

### tipo_importeliquidacion  (PDF §13.179)
_Importe de liquidación_

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_importeliquidacion.ClaseImporte | claves_importeliquidacion | clave | 1 | 1 | sequence | claves_importeliquidacion (§13.3.52) | Clase de importe de la remesa o movimiento de liquidación (bruto, líquido, pago) |
| tipo_importeliquidacion.Importe | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 1 | 1 | sequence |  | Importe de la remesa o movimiento de liquidación |

### tipo_movimientoliquidacion  (PDF §13.82)
_Datos de movimiento de liquidación._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_movimientoliquidacion.NumeroOrden | xs:unsignedInt |  | 0 | 1 | sequence |  | Número de orden o contador de unidades de tipo. |
| tipo_movimientoliquidacion.FechaMovimiento | xs:dateTime |  | 1 | 1 | sequence |  | Fecha del movimiento de liquidación. |
| tipo_movimientoliquidacion.ImporteMovimiento | tipo_importeliquidacion |  | 1 | 1 | sequence |  | Importe del movimiento de liquidación. |
| tipo_movimientoliquidacion.MovimientoRecibo | tipo_recibo |  | 1 | 1 | sequence > choice#4 |  | Datos del recibo afectado por el movimiento de liquidación |
| tipo_movimientoliquidacion.MovimientoSiniestro | tipo_siniestro |  | 1 | 1 | sequence > choice#4 |  | Datos del siniestro afectado por el movimiento de liquidación. |
| tipo_movimientoliquidacion.MovimientoContable | tipo_movimientocontable |  | 1 | 1 | sequence > choice#4 |  | Movimiento contable incluido en la liqudación que ajusta o complementa el importe originado por cobro de recibos y pagos de siniestros. |

### n_tipo_movimientoliquidacion  (PDF §13.82.n)
_Lista de movimientos de liquidación._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_movimientoliquidacion.MovimientoLiquidacion | tipo_movimientoliquidacion |  | 1 | unbounded | sequence |  | Datos de movimiento de liquidación. |

### tipo_conceptoregularizacion  (PDF §13.83)
_Datos de concepto de regularización._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_conceptoregularizacion.ConceptoRegularizacion | _char_80 | xs:string, max 80 | 1 | 1 | sequence |  | Concepto de regularización |
| tipo_conceptoregularizacion.ValorDeclarado | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 0 | 1 | sequence |  | Valor declarado |
| tipo_conceptoregularizacion.Tasa | xs:decimal |  | 0 | 1 | sequence |  | Tasa de regularización |
| tipo_conceptoregularizacion.ClaseTasa | claves_clasetasa | clave | 0 | 1 | sequence | claves_clasetasa (§13.3.15) | Clase de tasa de regularización |
| tipo_conceptoregularizacion.PrimaCalculada | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 0 | 1 | sequence |  | Importe de la prima calculada |
| tipo_conceptoregularizacion.PrimaMinima | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 0 | 1 | sequence |  | Importe de la prima mínima |
| tipo_conceptoregularizacion.PrimaMaxima | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 0 | 1 | sequence |  | Importe de la prima máxima |
| tipo_conceptoregularizacion.PrimaDeposito | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 0 | 1 | sequence |  | Importe de la prima depósito |

### n_tipo_conceptoregularizacion  (PDF §13.83.n)
_Lista de conceptos de regularización._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_conceptoregularizacion.Concepto | tipo_conceptoregularizacion |  | 1 | unbounded | sequence |  | Datos de concepto de regularización. |

### tipo_expediente  (PDF §13.84)
_Datos de expediente._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_expediente.NumeroOrden | xs:unsignedInt |  | 0 | 1 | sequence |  | Número de orden o contador de unidades de tipo |
| tipo_expediente.NumeroExpediente | _char_40 | xs:string, max 40 | 1 | 1 | sequence |  | Número de referencia del expediente |
| tipo_expediente.ClaseExpediente | claves_claseexpediente | clave | 1 | 1 | sequence | claves_claseexpediente (§13.3.54) | Clase de expediente |
| tipo_expediente.EstadoExpediente | claves_estadoexpediente | clave | 1 | 1 | sequence | claves_estadoexpediente (§13.3.55) | Estado en que se encuentra el expediente |
| tipo_expediente.Coberturas | n_tipo_cobertura |  | 1 | 1 | sequence |  | Coberturas del expediente afectadas. |
| tipo_expediente.ImporteReserva | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 0 | 1 | sequence |  | Importe de la reserva del expediente |
| tipo_expediente.TotalPagos | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 0 | 1 | sequence |  | Total de pagos |
| tipo_expediente.TotalRecobros | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 0 | 1 | sequence |  | Total de recobros |
| tipo_expediente.FechaInicio | xs:dateTime |  | 0 | 1 | sequence |  | Fecha de inicio del expediente |
| tipo_expediente.FechaFin | xs:dateTime |  | 0 | 1 | sequence |  | Fecha de fin del expediente |
| tipo_expediente.AccionesExpediente | n_tipo_accionsiniestro |  | 0 | 1 | sequence |  | Acciones del expediente. |
| tipo_expediente.PagosExpediente | n_tipo_pagosiniestro |  | 0 | 1 | sequence |  | Pagos del expediente. |

### n_tipo_expediente  (PDF §13.84.n)
_Lista de expedientes._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_expediente.Expediente | tipo_expediente |  | 1 | unbounded | sequence |  | Datos de expediente. |

### tipo_riesgorecsin  (PDF §13.85)
_Datos de riesgo de recibo o siniestro._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_riesgorecsin.NumeroOrden | xs:unsignedInt |  | 0 | 1 | sequence |  | Número de orden o contador de unidades de tipo |
| tipo_riesgorecsin.DescripcionRiesgo | xs:string |  | 1 | 1 | sequence |  | Descripción del riesgo |
| tipo_riesgorecsin.IdRiesgo | _char_20 | xs:string, max 20 | 0 | 1 | sequence |  | Identificador del riesgo |
| tipo_riesgorecsin.IdAgrupacion | _char_40 | xs:string, max 40 | 0 | 1 | sequence |  | Identificador de agrupación o grupo en póliza colectiva. |
| tipo_riesgorecsin.IdCentroFacturacion | _char_40 | xs:string, max 40 | 0 | 1 | sequence |  | Identificador de centro de facturación en póliza colectiva. |
| tipo_riesgorecsin.DatosCoberturas | n_tipo_cobertura |  | 0 | 1 | sequence |  | Coberturas incluidas en recibo o afectadas en siniestro. Obligatorio en siniestro. |

### n_tipo_riesgorecsin  (PDF §13.85.n)
_Lista de riesgos de recibo o siniestro._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_riesgorecsin.RiesgoRecSin | tipo_riesgorecsin |  | 1 | unbounded | sequence |  | Datos de riesgo recibo siniestro. |

### tipo_embarcacion  (PDF §13.86)
_Datos de embarcación._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_embarcacion.Nombre | _char_40 | xs:string, max 40 | 1 | 1 | sequence |  | Nombre de la embarcación |
| tipo_embarcacion.Matricula | _char_20 | xs:string, max 20 | 1 | 1 | sequence |  | Matrícula de la embarcación |
| tipo_embarcacion.Marca | _char_20 | xs:string, max 20 | 1 | 1 | sequence |  | Marca de la embarcación |
| tipo_embarcacion.Modelo | _char_20 | xs:string, max 20 | 1 | 1 | sequence |  | Modelo de la embarcación |
| tipo_embarcacion.AnyoConstruccion | xs:gYear |  | 1 | 1 | sequence |  | Año de fabricación |
| tipo_embarcacion.ClaseEmbarcacion | claves_claseembarcacion | clave | 1 | 1 | sequence | claves_claseembarcacion (§13.3.56) | Clase de embarcación |
| tipo_embarcacion.ListaMatricula | claves_listamatricula | clave | 0 | 1 | sequence | claves_listamatricula (§13.3.59) | Lista de inscripción del registro de matrícula de la embarcación |
| tipo_embarcacion.ValorEmbarcacion | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 0 | 1 | sequence |  | Valor de la embarcación en euros |
| tipo_embarcacion.Eslora | xs:decimal |  | 0 | 1 | sequence |  | Eslora de la embarcación en metros |
| tipo_embarcacion.PotenciaMotores | xs:decimal |  | 0 | 1 | sequence |  | Potencia total sumada de los motores HP - CV |
| tipo_embarcacion.PlazasAutorizadas | xs:unsignedInt |  | 0 | 1 | sequence |  | Según certificado de navegabilidad |
| tipo_embarcacion.PuertoBase | _char_80 | xs:string, max 80 | 0 | 1 | sequence |  | Puerto base de amarre |

### tipo_aeronave  (PDF §13.87)
_Datos de aeronave._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_aeronave.Matricula | _char_20 | xs:string, max 20 | 1 | 1 | sequence |  | Matrícula de la aeronave |
| tipo_aeronave.Marca | _char_20 | xs:string, max 20 | 1 | 1 | sequence |  | Marca de la aeronave |
| tipo_aeronave.Modelo | _char_20 | xs:string, max 20 | 1 | 1 | sequence |  | Modelo de la aeronave |
| tipo_aeronave.AnyoFabricacion | xs:gYear |  | 1 | 1 | sequence |  | Año de fabricación |
| tipo_aeronave.ValorCasco | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 0 | 1 | sequence |  | Valor del casco (en euros). |
| tipo_aeronave.Capacidad | xs:unsignedInt |  | 0 | 1 | sequence |  | Capacidad de la aeronave pasajeros más tripulantes |
| tipo_aeronave.AeropuertoBase | _char_80 | xs:string, max 80 | 0 | 1 | sequence |  | Aeropuerto base de las operaciones |

### tipo_profesion  (PDF §13.88)
_Datos de profesión._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_profesion.Codigo | _t_CnoCnae | xs:string, pattern \d{2,4} | 0 | 1 | sequence |  | Código de profesión según CNO-11. |
| tipo_profesion.Descripcion | xs:string |  | 1 | 1 | sequence |  | Literal o descripción de la profesión. |

### tipo_contacto  (PDF §13.89)
_Datos de contacto._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_contacto.Telefonos | n_tipo_telefono |  | 0 | 1 | sequence |  | Números de teléfono completo, preferentemente con prefijos del país |
| tipo_contacto.Emails | n_tipo_email |  | 0 | 1 | sequence |  | Direcciones de correo electrónico. |
| tipo_contacto.Perfiles | n_tipo_perfil |  | 0 | 1 | sequence |  | Dirección de Internet o identificadores en red social. |
| tipo_contacto.Consentimientos | n_tipo_consentimiento |  | 0 | 1 | sequence |  | Consentimientos respecto de la utilización de datos personales. |

### tipo_reciborelacionado  (PDF §13.91)
_Datos de recibo relacionado._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_reciborelacionado.IdRecibo | tipo_datosrecibo |  | 1 | 1 | sequence |  | Datos del recibo relacionado. |
| tipo_reciborelacionado.CausaRelacion | claves_causarelacion | clave | 1 | 1 | sequence | claves_causarelacion (§13.3.69) | Causa de la relación entre recibos. |

### n_tipo_reciborelacionado  (PDF §13.91.n)
_Lista de recibos relacionado._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_reciborelacionado.ReciboRelacionado | tipo_reciborelacionado |  | 1 | unbounded | sequence |  | Datos del recibo relacionado. |

### tipo_telefono  (PDF §13.92)
_Datos de teléfono._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_telefono.Numero | xs:string |  | 1 | 1 | sequence |  | Número de telefono. |
| tipo_telefono.Clase | claves_telefono | clave | 0 | 1 | sequence | claves_telefono (§13.3.64) | Clase o tipo de teléfono (Casa, trabajo, movil, etc) |

### n_tipo_telefono  (PDF §13.92.n)
_Lista de teléfonos._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_telefono.Telefono | tipo_telefono |  | 1 | unbounded | sequence |  | Datos de teléfono |

### tipo_email  (PDF §13.93)
_Datos de email._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_email.Direccion | xs:string |  | 1 | 1 | sequence |  | Dirección de email |
| tipo_email.Clase | claves_email | clave | 0 | 1 | sequence | claves_email (§13.3.65) | Clase o tipo de email (personal, trabajo, etc) |

### n_tipo_email  (PDF §13.93.n)
_Lista de emails._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_email.Email | tipo_email |  | 1 | unbounded | sequence |  | Datos de email. |

### tipo_perfil  (PDF §13.94)
_Datos de perfil._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_perfil.Identificador | _char_150 | xs:string, max 150 | 1 | 1 | sequence |  | Dirección de la Web o identificador en red social |
| tipo_perfil.Clase | claves_perfil | clave | 1 | 1 | sequence | claves_perfil (§13.3.66) | Web o nombre de la red social. |

### n_tipo_perfil  (PDF §13.94.n)
_Lista de perfiles._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_perfil.Perfil | tipo_perfil |  | 1 | unbounded | sequence |  | Datos de perfil. |

### tipo_consentimiento  (PDF §13.95)
_Datos de consentimiento._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_consentimiento.Clase | claves_consentimiento | clave | 1 | 1 | sequence | claves_consentimiento (§13.3.67) | Clase de consentimiento respecto de la utilización o cesión de datos |
| tipo_consentimiento.Situacion | xs:boolean |  | 1 | 1 | sequence |  | Situación respecto del consentimiento: S: Admitido, N: Rechazado |

### n_tipo_consentimiento  (PDF §13.95.n)
_Lista de consentimientos._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_consentimiento.Consentimiento | tipo_consentimiento |  | 1 | unbounded | sequence |  | Datos de consentimiento. |

### tipo_comercializacion  (PDF §13.96)
_Datos de comercialización._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_comercializacion.Clase | claves_comercializacion | clave | 1 | 1 | sequence | claves_comercializacion (§13.3.68) | Clase de elemento (Producto, campaña, acuerdo comercial) |
| tipo_comercializacion.IdComercializacion | _char_40 | xs:string, max 40 | 1 | 1 | sequence |  | Identificador de producto, campaña o acuerdo comercial. |
| tipo_comercializacion.Descripcion | xs:string |  | 0 | 1 | sequence |  | Descripción del producto, campaña o acuerdo comercial. |

### n_tipo_comercializacion  (PDF §13.96.n)
_Lista de datos de comercialización._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_comercializacion.Comercializacion | tipo_comercializacion |  | 1 | unbounded | sequence |  | Datos de comercialización. |

### tipo_coaseguro  (PDF §13.98)
_Datos de Coaseguro._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_coaseguro.CuadroCoaseguro | n_tipo_participacion |  | 1 | 1 | sequence |  | Cuadro de la póliza de coaseguro: Entidades que participan en el contrato con indicación de rol y porcentaje. |

### tipo_capital  (PDF §13.99)
_Datos de capital asegurado._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_capital.Bien | claves_bien | clave | 1 | 1 | sequence | claves_bien (§13.3.72) | Bien sobre el que se contrata el capital |
| tipo_capital.ModalidadValoracion | claves_modalidadvaloracion | clave | 1 | 1 | sequence | claves_modalidadvaloracion (§13.3.60) | Modalidad de valoración del bien asegurado. |
| tipo_capital.Importe | _t_num2dou | xs:double, pattern -?[0-9]+(\.[0-9]{1,2})?\|INF | 1 | 1 | sequence |  | Importe del capital contratado. |
| tipo_capital.Descripcion | xs:string |  | 0 | 1 | sequence |  | Descripción del capital asegurado. Obligatorio en caso de que Bien sea Otros. |

### n_tipo_capital  (PDF §13.99.n)
_Lista de capitales asegurado._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_capital.Capital | tipo_capital |  | 1 | unbounded | sequence |  | Datos de capital asegurado. |

### tipo_participacion  (PDF §13.100)
_Datos participación en póliza de coaseguro._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_participacion.CodigoEntidad | _t_codigoDGSea | xs:string, pattern [A-Z](\d{4}) | 1 | 1 | sequence |  | Código DGS de entidad aseguradora. |
| tipo_participacion.Rol | claves_rolcoaseguro | clave | 1 | 1 | sequence | claves_rolcoaseguro (§13.3.70) | Rol de la entidad en la póliza de coaseguro: Abridora o aceptante |
| tipo_participacion.Porcentaje | xs:decimal |  | 1 | 1 | sequence |  | Porcentaje de participación de la entidad aseguradora en la póliza de coaseguro. |

### n_tipo_participacion  (PDF §13.100.n)
_Lista de participaciones en póliza de Coaseguro._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_participacion.Participacion | tipo_participacion |  | 1 | unbounded | sequence |  | Datos de participación en póliza de coaseguro. |

### tipo_riesgoembarcaciones  (PDF §13.101)
_Datos del riesgo de embarcaciones._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_riesgoembarcaciones.Embarcacion | tipo_embarcacion |  | 1 | 1 | sequence |  | Embarcación asegurada. |

### tipo_movimientocontable  (PDF §13.102)
_Datos del movimiento contable._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_movimientocontable.Concepto | _char_150 | xs:string, max 150 | 1 | 1 | sequence |  | Concepto por el que se realiza el movmiento o apunte contable. |
| tipo_movimientocontable.Clase | claves_claseconcepto | clave | 1 | 1 | sequence | claves_claseconcepto (§13.3.73) | Clase o tipo de concepto. |
| tipo_movimientocontable.ImporteBruto | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 1 | 1 | sequence |  | Importe bruto |
| tipo_movimientocontable.ImporteLiquido | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 1 | 1 | sequence |  | Importe líquido (Bruto - retención por IRPF) |
| tipo_movimientocontable.RetencionIRPF | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 1 | 1 | sequence |  | Porcentaje de retención por IRPF aplicado |
| tipo_movimientocontable.Descripcion | xs:string |  | 0 | 1 | sequence |  | Información ampliada sobre el concepto. |

### tipo_cuentaefectivo  (PDF §11.3)
_Cuenta de efectivo._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_cuentaefectivo.DetalleProceso | tipo_detalleproceso |  | 0 | 1 | sequence |  | Detalle de proceso. Informar si en cabecera de fichero el proceso se identificar por detalle de proceso. |
| tipo_cuentaefectivo.DatosMediador | tipo_mediador |  | 1 | 1 | sequence |  | Datos del mediador |
| tipo_cuentaefectivo.CodigoEntidad | _t_codigoDGSea | xs:string, pattern [A-Z](\d{4}) | 1 | 1 | sequence |  | Código DGS de entidad aseguradora. |
| tipo_cuentaefectivo.Periodo | tipo_periodo |  | 1 | 1 | sequence |  | Periodo contable recogido en la cuenta. |
| tipo_cuentaefectivo.DatosMoneda | tipo_moneda |  | 0 | 1 | sequence |  | Datos de la moneda en la que se expresan las unidades monetarias (si no viene informado es Euro) |
| tipo_cuentaefectivo.Saldos | tipo_saldos |  | 1 | 1 | sequence |  | Saldos de la cuenta de efectivo. Signo positivo indica acreedor mediador. Signo negativo indica deudor mediador. |
| tipo_cuentaefectivo.Conceptos | tipo_conceptos |  | 1 | 1 | sequence |  | Conceptos de la cuenta de efectivo. |
| tipo_cuentaefectivo.Liquidaciones | n_tipo_liquidacion |  | 1 | 1 | sequence |  | Liquidaciones del periodo cubierto por la cuenta. Ha de incluir todas las liquidaciones realizadas en el periodo correspondiente a la cuenta. . Pueden haber sido informados en los procesos 500 y 501 |

### n_tipo_liquidacion  (PDF §13.131)
_Lista de liquidaciones._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_liquidacion.Liquidacion | tipo_liquidacion |  | 1 | unbounded | sequence |  |  |

### tipo_periodo  (PDF §13.104)
_Fechas de periodo contable._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_periodo.FechaInicio | xs:dateTime |  | 1 | 1 | sequence |  | Fecha de inicio del periodo contable. Incluida en el periodo. |
| tipo_periodo.FechaFin | xs:dateTime |  | 1 | 1 | sequence |  | Fecha de fin del periodo contable. Incluida en el periodo. |

### tipo_saldos  (PDF §13.105)
_Saldos de cuenta._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_saldos.SaldoInicial | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 1 | 1 | sequence |  | Saldo inicial del periodo. |
| tipo_saldos.SaldoFinal | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 1 | 1 | sequence |  | Saldo final del periodo. |

### tipo_conceptos  (PDF §13.106)
_Conceptos de cuenta._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_conceptos.RecibosCobrados | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 1 | 1 | sequence |  | Suma del importe Prima total de los recibos cobrados por el Mediador en el periodo. |
| tipo_conceptos.ComisionesRecibos | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 1 | 1 | sequence |  | Suma del importe de la comisión bruta de los recibos cobrados por mediador o entidad en el peridodo. |
| tipo_conceptos.RetencionComisiones | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 1 | 1 | sequence |  | Suma del importe de la retención IRPF sobre las comisiones brutas de los recibos cobrados por mediador o entidad en el periodo. |
| tipo_conceptos.SiniestrosPagados | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 1 | 1 | sequence |  | Suma del importe de los pagos de siniestro realizados por el mediador en el periodo. |
| tipo_conceptos.OtrosConceptos | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 1 | 1 | sequence |  | Suma del importe de otros conceptos contabilizados en el saldo de la cuenta de efectivo. |
| tipo_conceptos.RetencionOtros | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 1 | 1 | sequence |  | Suma del importe de la retención IRPF sobre el importe bruto de los Movimientos contables por otros conceptos distintos de comisiones. |
| tipo_conceptos.Remesas | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 1 | 1 | sequence |  | Suma de importe de las liquidaciones realizadas por mediador o entidad en el periodo. |

### tipo_polizacolectiva  (PDF §13.107)
_Datos propios de póliza colectiva._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_polizacolectiva.ClasePolizaColectiva | claves_clasepolizacolectiva | clave | 1 | 1 | sequence | claves_clasepolizacolectiva (§13.3.88) | Indicador de si el objeto póliza hace referencia a la póliza principal o a una aplicación (certificado) |
| tipo_polizacolectiva.CondicionesColectivo | tipo_condicionescolectivo |  | 0 | 1 | sequence |  | Condiciones que aplican al colectivo asegurado . |
| tipo_polizacolectiva.Agrupaciones | n_tipo_agrupacion |  | 0 | 1 | sequence |  | Agrupaciones o grupos de asegurados con condiciones específicas |
| tipo_polizacolectiva.CentrosFacturacion | n_tipo_centrofacturacion |  | 0 | 1 | sequence |  | Datos de los centros de facturación. |

### tipo_condicionescolectivo  (PDF §13.108)
_Condiciones de póliza colectiva._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_condicionescolectivo.Tipologias | tipo_clasecolectivo |  | 0 | 1 | sequence |  | Tipología de póliza en función de varios parámetros del colectivo |
| tipo_condicionescolectivo.NumAsegurados | xs:unsignedInt |  | 0 | 1 | sequence |  | Número de asegurados que forman parte del colectivo. |
| tipo_condicionescolectivo.RequisitosAdhesion | xs:string |  | 0 | 1 | sequence |  | Requisitos de adhesión a la póliza que han de cumplir los potenciales asegurados |
| tipo_condicionescolectivo.DistribucionPago | tipo_distribucionpago |  | 0 | 1 | sequence |  | Distribución del pago de la póliza colectiva |

### tipo_agrupacion  (PDF §13.109)
_Datos de agrupación._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_agrupacion.IdAgrupacion | _char_40 | xs:string, max 40 | 1 | 1 | sequence |  | Identificador de grupo. |
| tipo_agrupacion.Descripcion | xs:string |  | 1 | 1 | sequence |  | Descripción del grupo |
| tipo_agrupacion.CondicionesAgrupacion | tipo_condicionesagrupacion |  | 0 | 1 | sequence |  | Condiciones que aplican a la agrupación |

### n_tipo_agrupacion  (PDF §13.109.n)
_Lista de agrupaciones._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_agrupacion.Agrupacion | tipo_agrupacion |  | 1 | unbounded | sequence |  | Datos de agrupación |

### tipo_centrofacturacion  (PDF §13.110)
_Datos de centro de facturación_

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_centrofacturacion.IdCentroFacturacion | _char_40 | xs:string, max 40 | 1 | 1 | sequence |  | Identificador de centro de facturación. |
| tipo_centrofacturacion.Descripcion | xs:string |  | 1 | 1 | sequence |  | Descripción del centro de facturación |
| tipo_centrofacturacion.ClaseCentro | claves_clasecentrofacturacion | clave | 1 | 1 | sequence | claves_clasecentrofacturacion (§13.3.78) | Clase de centro de facturación |
| tipo_centrofacturacion.Pagadores | n_tipo_pagador |  | 0 | 1 | sequence |  | Pagadores del centro de facturación |
| tipo_centrofacturacion.DistribucionPago | tipo_distribucionpago |  | 0 | 1 | sequence |  | Distribución del pago de la póliza colectiva |

### n_tipo_centrofacturacion  (PDF §13.110.n)
_Lista de centros de facturación._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_centrofacturacion.CentroFacturacion | tipo_centrofacturacion |  | 1 | unbounded | sequence |  | Datos de centro de facturación |

### tipo_clasecolectivo  (PDF §13.111)
_Clase o tipologías del colectivo._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_clasecolectivo.PorAdhesion | claves_tipologia_adhesion | clave | 0 | 1 | sequence | claves_tipologia_adhesion (§13.3.74) | Por adhesión al colectivo. |
| tipo_clasecolectivo.PorAsegurados | claves_tipologia_asegurados | clave | 0 | 1 | sequence | claves_tipologia_asegurados (§13.3.75) | Por identificación de los miembros del colectivo. |

### tipo_distribucionpago  (PDF §13.113)
_Distribución de pago._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_distribucionpago.Clase | claves_distribucionpago | clave | 1 | 1 | sequence | claves_distribucionpago (§13.3.76) | Clase de distribución de pago. |
| tipo_distribucionpago.CuadroFinanciacion | tipo_cuadro_financiacion |  | 0 | 1 | sequence |  | Cuadro de financacion del pago |

### tipo_condicionesagrupacion  (PDF §13.113)
_Condiciones de agrupación._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_condicionesagrupacion.Tipologias | tipo_claseagrupacion |  | 0 | 1 | sequence |  | Tipología de póliza colectiva en función de varios parámetros |
| tipo_condicionesagrupacion.NumAsegurados | xs:unsignedInt |  | 0 | 1 | sequence |  | Número de asegurados que forman parte del colectivo. |
| tipo_condicionesagrupacion.RequisitosAdhesion | xs:string |  | 0 | 1 | sequence |  | Requisitos de adhesión a la póliza que han de cumplir los potenciales asegurados |

### tipo_pagador  (PDF §13.114)
_Datos de pagador._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_pagador.Persona | tipo_persona |  | 1 | 1 | sequence |  | Datos de persona |
| tipo_pagador.DatosFormaPago | tipo_formapago |  | 1 | 1 | sequence |  | Datos de forma de pago |

### n_tipo_pagador  (PDF §13.114.n)
_Lista de pagadores._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_pagador.Pagador | tipo_pagador |  | 1 | unbounded | sequence |  | Datos de pagador. |

### tipo_cuadro_financiacion  (PDF §13.115)
_Cuadro de financiación._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_cuadro_financiacion.PagadorCuadro | tipo_pagadorcuadro |  | 1 | unbounded | sequence |  | Pagador del cuadro de financiacion |

### tipo_pagadorcuadro  (PDF §13.116)
_Pagador de cuadro de financiación._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_pagadorcuadro.Pagador | claves_pagador | clave | 1 | 1 | sequence | claves_pagador (§13.3.77) | Asegurado, Tomador o Tercero |
| tipo_pagadorcuadro.Porcentaje | xs:decimal |  | 1 | 1 | sequence > choice#2 |  | Porcentaje correspondiente al pagador |
| tipo_pagadorcuadro.Importe | _t_num2dec | xs:decimal, pattern -?[0-9]+(\.[0-9]{1,2})? | 1 | 1 | sequence > choice#2 |  | Cantidad fija correspondiente al pagador |

### tipo_pb  (PDF §13.117)
_Participación en beneficios._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_pb.ExistePB | xs:boolean |  | 1 | 1 | sequence |  | Indicador de si existe participación en beneficios. |
| tipo_pb.Formula | xs:string |  | 0 | 1 | sequence |  | Descripción de la fórmula aplicada para el cálculo de la participación en beneficios. |
| tipo_pb.IdConjunto | _char_40 | xs:string, max 40 | 0 | 1 | sequence |  | Identificador del conjunto o grupo de pólizas sobre el que se calcula la participación en beneficios. |
| tipo_pb.FormaPago | claves_formapagopb | clave | 0 | 1 | sequence | claves_formapagopb (§13.3.87) | Forma de pago de la participación en beneficios. |

### tipo_asegurado  (PDF §13.118)
_Datos del asegurado implicado en el siniestro._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_asegurado.IdRiesgo | _char_20 | xs:string, max 20 | 0 | 1 | sequence |  | Identificador del riesgo |
| tipo_asegurado.Responsabilidad | claves_responsabilidad | clave | 0 | 1 | sequence | claves_responsabilidad (§13.3.85) | Causante; Perjudicado |
| tipo_asegurado.ImplicadoAutos | tipo_implicadoautos |  | 0 | 1 | sequence |  | Datos de vehículo implicado |
| tipo_asegurado.ImplicadoDiversos | tipo_implicadodiversos |  | 0 | 1 | sequence |  | Datos del bien afectado por el siniestro |
| tipo_asegurado.Lesionados | tipo_lesionados |  | 0 | 1 | sequence |  | Lesionados: número y condición |
| tipo_asegurado.Asistencias | n_tipo_asistencia |  | 0 | 1 | sequence |  | Asistencias prestadas al implicado. |
| tipo_asegurado.PersonaContacto | tipo_personacontacto |  | 0 | 1 | sequence |  | Datos de contacto para las comunicación con el implicado |

### tipo_contrario  (PDF §13.119)
_Datos de contrario implicado en el siniestro._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_contrario.DatosPoliza | tipo_polizacontrario |  | 0 | 1 | sequence |  | Datos de póliza de seguro del contrario implicado. |
| tipo_contrario.Responsabilidad | claves_responsabilidad | clave | 0 | 1 | sequence | claves_responsabilidad (§13.3.85) | Causante; Perjudicado |
| tipo_contrario.ImplicadoAutos | tipo_implicadoautos |  | 0 | 1 | sequence |  | Datos de vehículo implicado |
| tipo_contrario.ImplicadoDiversos | tipo_implicadodiversos |  | 0 | 1 | sequence |  | Datos del bien afectado por el siniestro |
| tipo_contrario.Lesionados | tipo_lesionados |  | 0 | 1 | sequence |  | Lesionados: número y condición |
| tipo_contrario.Asistencias | n_tipo_asistencia |  | 0 | 1 | sequence |  | Asistencias prestadas al implicado. |
| tipo_contrario.PersonaContacto | tipo_personacontacto |  | 0 | 1 | sequence |  | Datos de contacto para las comunicación con el implicado |

### n_tipo_contrario  (PDF §13.119.n)
_Lista de contrarios implicados en el siniestro._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_contrario.Contrario | tipo_contrario |  | 1 | unbounded | sequence |  | Datos de contrario implicado. |

### tipo_autoridad  (PDF §13.120)
_Datos de la autoridad._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_autoridad.ClaseAutoridad | claves_claseautoridad | clave | 1 | 1 | sequence | claves_claseautoridad (§13.3.83) | Autoridad que ha intervenido en el siniestro |
| tipo_autoridad.Descripcion | xs:string |  | 0 | 1 | sequence |  | Descripción de la intervención llevada a cabo. |
| tipo_autoridad.IdInforme | _char_40 | xs:string, max 40 | 0 | 1 | sequence |  | Identificador del Informe de la actuación o atestado emitido por la autoridad. |

### n_tipo_autoridad  (PDF §13.120.n)
_Lista de autoridades._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_autoridad.Autoridad | tipo_autoridad |  | 1 | unbounded | sequence |  | Datos de la autoridad. |

### tipo_implicadoautos  (PDF §13.121)
_Datos de vehículo implicado._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_implicadoautos.Vehiculo | tipo_vehiculo |  | 1 | 1 | sequence |  | Datos del vehículo |
| tipo_implicadoautos.Remolque | _t_matricula | xs:string, pattern [A-Z\-\d]{4,12} | 0 | 1 | sequence |  | Matrícula del remolque |
| tipo_implicadoautos.Conductor | tipo_personafisica |  | 1 | 1 | sequence |  | Datos del conductor |
| tipo_implicadoautos.DanosSiniestro | n_tipo_danosiniestro |  | 0 | 1 | sequence |  | Daños sufridos por el riesgo asegurado |

### tipo_implicadodiversos  (PDF §13.122)
_Datos de bien afectado._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_implicadodiversos.Domicilio | tipo_domicilio |  | 1 | 1 | sequence |  | Domicilio del bien |
| tipo_implicadodiversos.Actividad | tipo_actividad |  | 0 | 1 | sequence |  | Actividad desarrollada en el bien afectado |
| tipo_implicadodiversos.Descripcion | xs:string |  | 0 | 1 | sequence |  | Información descriptiva del bien. |
| tipo_implicadodiversos.DanosSiniestro | n_tipo_danosiniestro |  | 0 | 1 | sequence |  | Daños sufridos por el riesgo asegurado |

### tipo_lesionados  (PDF §13.123)
_Número y condición de lesionados._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_lesionados.Numero | xs:unsignedInt |  | 1 | 1 | sequence |  | Número total de lesionados. |
| tipo_lesionados.LesionadosVehiculo | n_tipo_lesionadovehiculo |  | 0 | 1 | sequence |  | Lesionados por condición respecto vehículo |

### tipo_asistencia  (PDF §13.124)
_Datos de asistencia prestada._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_asistencia.Asistente | tipo_figuraaccion |  | 1 | 1 | sequence |  | Empresa o profesional que presta la asistencia |
| tipo_asistencia.Descripcion | xs:string |  | 0 | 1 | sequence |  | Descripción de la asistencia prestada. |

### n_tipo_asistencia  (PDF §13.124.n)
_Lista de asistencias._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_asistencia.Asistencia | tipo_asistencia |  | 1 | unbounded | sequence |  | Datos de asistencia |

### tipo_personacontacto  (PDF §13.125)
_Datos de persona de contacto._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_personacontacto.Persona | tipo_personafisica |  | 1 | 1 | sequence |  | Persona de contacto |
| tipo_personacontacto.Observaciones | xs:string |  | 0 | 1 | sequence |  | Observaciones o información adicional sobre el contacto |

### tipo_lesionadovehiculo  (PDF §13.126)
_Condición y número de lesionados en vehículo._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_lesionadovehiculo.Condicion | claves_condicion | clave | 1 | 1 | sequence | claves_condicion (§13.3.84) | Conductor, Ocupante, Peatón (Solo en autos) |
| tipo_lesionadovehiculo.Numero | xs:unsignedInt |  | 1 | 1 | sequence |  | Número de lesionados de la condición indicada. |

### tipo_figuraaccion  (PDF §13.127)
_Datos de figura que realiza acción._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_figuraaccion.NumeroOrden | xs:unsignedInt |  | 0 | 1 | sequence |  | Número de orden o contador de unidades de tipo |
| tipo_figuraaccion.ClaseFigura | claves_figuraaccion | clave | 1 | 1 | sequence | claves_figuraaccion (§13.3.82) | Clase de figura |
| tipo_figuraaccion.DatosFigura | tipo_persona |  | 1 | 1 | sequence |  | Datos de la persona |

### n_tipo_figuraaccion  (PDF §13.127.n)
_Lista de figuras._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_figuraaccion.FiguraAccion | tipo_figuraaccion |  | 1 | unbounded | sequence |  | Datos de figura actuante. |

### tipo_polizacontrario  (PDF §13.128)
_Datos de póliza de contrario implicado._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_polizacontrario.CodigoEntidad | _t_codigoDGSea | xs:string, pattern [A-Z](\d{4}) | 0 | 1 | sequence |  | Código DGS de entidad aseguradora. |
| tipo_polizacontrario.NombreEntidad | _char_150 | xs:string, max 150 | 1 | 1 | sequence |  | Nombre de entidad aseguradora |
| tipo_polizacontrario.IdPoliza | _char_40 | xs:string, max 40 | 0 | 1 | sequence |  | Id o número de póliza |

### tipo_claseagrupacion  (PDF §13.129)
_Tipología de agrupación de póliza colectiva_

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_claseagrupacion.PorAdhesion | claves_tipologia_adhesion_agrupacion | clave | 0 | 1 | sequence | claves_tipologia_adhesion_agrupacion (§13.3.79) | Por adhesión al colectivo. |
| tipo_claseagrupacion.PorAsegurados | claves_tipologia_asegurados_agrupacion | clave | 0 | 1 | sequence | claves_tipologia_asegurados_agrupacion (§13.3.80) | Por identificación de los miembros del colectivo. |

### n_tipo_lesionadovehiculo  (PDF §13.130)
_Lista de número de lesionados por vehículo y condición._

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_lesionadovehiculo.LesionadoVehiculo | tipo_lesionadovehiculo |  | 1 | unbounded | sequence |  | Número de lesionados por vehículo y condición. |

### tipo_fechasrecibo  (PDF §13.171)
Extiende: `tipo_fechas`

| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_fechasrecibo.FechaLimiteRechazo | xs:dateTime |  | 0 | 1 | sequence |  | Fecha límite de rechazo de emisión. El rechazo de emisión se informa mediante los procesos 771 a 774. |

### tipo_datosmensaje  (PDF §12.2)
| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_datosmensaje.DetalleProceso | tipo_detalleproceso |  | 0 | 1 | sequence |  | Detalle de proceso. Informar si en cabecera de fichero el proceso se identificar por detalle de proceso. |
| tipo_datosmensaje.Fecha | xs:dateTime |  | 1 | 1 | sequence |  | Fecha hora exactos en que el mensaje o nota ha tenido lugar en el sistema de la aseguradora. |
| tipo_datosmensaje.IdMensaje | _char_40 | xs:string, max 40 | 1 | 1 | sequence |  | Campo identificador único que debe ayudar, junto al código de aseguradora a identificar mensajes ya procesadas anteriormente. |
| tipo_datosmensaje.Sistema | xs:boolean |  | 1 | 1 | sequence |  | Campo booleano que indica si se trata de un mensaje de sistema automático o se trata de una nota escrita por parte de alguna persona de la compañía. Ayuda a discernir sobre movimientos de sistema y notas escritas. |
| tipo_datosmensaje.Contenido | xs:string |  | 1 | 1 | sequence |  | Contenido del mensaje. Campo obligatorio donde incluir una explicación libre en formato de texto que detalla el movimiento, ya sea escrito manualmente por el tramitador o siendo una nota de sistema. |
| tipo_datosmensaje.ExisteAdjunto | xs:boolean |  | 1 | 1 | sequence |  | Campo boleano que indica si el mensaje tiene asociado o no documentos adjuntos. |
| tipo_datosmensaje.Adjuntos | n_tipo_adjunto |  | 0 | 1 | sequence |  | Referencia a los archivos adjuntos del mensaje. |

### tipo_adjunto  (PDF §13.178)
| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_adjunto.ClaseDocumento | claves_clasedocumento | clave | 0 | 1 | sequence | claves_clasedocumento (§13.3.135) | Clase de documento. |
| tipo_adjunto.Descripcion | xs:string |  | 1 | 1 | sequence |  | Descripción del documento. |
| tipo_adjunto.Nombre | _char_150 | xs:string, max 150 | 0 | 1 | sequence |  | Nombre del archivo. |

### n_tipo_adjunto  (PDF §13.178.n)
| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| n_tipo_adjunto.Adjunto | tipo_adjunto |  | 1 | unbounded | sequence |  | Datos del archivo adjunto. |

### tipo_mensajesiniestro  (PDF §12.3)
| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_mensajesiniestro.IdSiniestroEntidad | _char_40 | xs:string, max 40 | 1 | 1 | sequence |  | Número o identificador de siniestro asignado por la entidad aseguradora. |
| tipo_mensajesiniestro.IdSiniestroUnico | _char_40 | xs:string, max 40 | 0 | 1 | sequence |  | Número o identificador de siniestro único asignado por la entidad aseguradora. Informar si Id Siniestro Entidad no es identificador único del siniestro. |
| tipo_mensajesiniestro.IdSiniestroMediador | _char_40 | xs:string, max 40 | 0 | 1 | sequence |  | Número de referencia de siniestro asignado por el mediador. Informar siempre si ha sido previamente informado por el Mediador |
| tipo_mensajesiniestro.Expediente | _char_40 | xs:string, max 40 | 0 | 1 | sequence |  | Número de referencia del expediente. Informar si la entidad tramita el siniestro por expedientes. |
| tipo_mensajesiniestro.Ambito | claves_mensajeambito | clave | 1 | 1 | sequence | claves_mensajeambito (§13.3.133) | Ámbito de información que contiene el mensaje. Encuadra el mensaje en la fase de tramitación del siniestro. En caso de no poder indicar ninguno se indicará el valor: no clasificada. |
| tipo_mensajesiniestro.Titulo | claves_mensajetitulo | clave | 1 | 1 | sequence | claves_mensajetitulo (§13.3.134) | Título del mensaje. En función del ámbito, detalla el movimiento que ha generado el mensaje. En caso de no poder indicar ninguno se indicará el valor: no clasificada. |
| tipo_mensajesiniestro.TituloEntidad | xs:string |  | 1 | 1 | sequence |  | Título del mensaje asignado por la entidad aseguradora. Literal de acuerdo a su clasificación de notas o mensajes de siniestro. |

### tipo_mensaje  (PDF §12.1)
| Tipo.Elemento | Tipo de dato | Formato | Min | Max | Grupo | Clave § | Descripción |
|---|---|---|---|---|---|---|---|
| tipo_mensaje.DatosMensaje | tipo_datosmensaje |  | 1 | 1 | sequence |  | Datos genéricos de mensaje. |
| tipo_mensaje.MensajeSiniestro | tipo_mensajesiniestro |  | 1 | 1 | sequence |  | Datos de mensaje específicos de siniestro. |

