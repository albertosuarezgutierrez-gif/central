# CIMA — qué manda y NO guardamos (huecos) + claves oficiales

> Lote 1 de la auditoría CIMA (03/10/2026). Solo RUTAS de campo y compañías: ningún valor.
> Complementa `docs/CIMA-CAMPOS.md` (universo de campos). Leído = el lector **accede** a la ruta
> (y suele guardarla en una columna o en `datos_extra`); no implica columna propia.

## 1. Método (y por qué `ultima_vez_leido IS NULL` miente)

1. **Universo**: hojas de `docs/CIMA-CAMPOS.md` (24/09, XML reales) ∪ hojas de `seguros.cima_cobertura_campos`
   (tipo, ruta, hoja=true, veces_visto, codigo_entidad). Se descarta `schemaLocation` como ruido (atributo XML).
2. **Causa de los falsos «nunca leído»**: la tabla guarda DOS filas por campo y compañía, una con la ruta
   `Objetos.…` y otra con el prefijo antiguo `ProcesosEIAC.Objetos.…` (antes de la normalización del 28/09,
   `normalizarRutaEiac`). Las filas con prefijo se midieron con `veces_leido = 0` aunque el campo se lea:
   POL **123**, REC **10**, SIN **65** rutas salían «nunca leídas» solo por eso (caso `PrimaTotal`, `FechaEmision`).
   Solución: quitar el prefijo y agregar por ruta sumando compañías.
3. **Decidir «leído» desde el CÓDIGO** (dos pruebas, se une el resultado):
   - Pasada real: ejecutar `medirCoberturaCampos` + `mapEiacPolAll/SinAll/RecAll/CefAll` (los mismos que usa el
     pipeline, `/home/user/asegura/src/lib/integrations/cima/`) sobre un árbol sintético con TODAS las rutas
     (19 juegos de valores, para ramos 241/2151/282/2171/211/2161 y fechas/decimales/códigos). Es el medidor
     de producción sin depender de qué ficheros llegaron.
   - Medición viva de BD ya normalizada (`veces_leido > 0` en alguna compañía): recoge lecturas que dependen
     del valor real (p. ej. bloques por ramo) que el árbol sintético no dispara.
   - Resultado: BD ⊇ sintético salvo 1 ruta SIN y 1 REC (`OtrosDatos.Dato.DescripcionDato`,
     `Fechas.FechaFinSeguro`); se cuentan como leídas.
4. **CEF no está en `cima_cobertura_campos`** (0 filas): solo pasada sintética sobre las 108 rutas del inventario.
5. Límites: la medición viva es anterior a los cambios de código del 03/10 (#868 `OtrosRiesgos`); una ruta
   que hoy se lee y antes no, aparece como leída solo si la pasada sintética la dispara. Un cambio posterior
   en el lector exige repetir la pasada (guion: ver §6).

## 2. Cifras por objeto (hojas)

| Objeto | Hojas | Leídas | NO leídas | Cabecera/schema | Ids técnicos/orden | Personas (PII terceros) | Negocio a revisar |
|---|---|---|---|---|---|---|---|
| POL | 473 | 267 | **206** | 11 | 29 | 148 | 18 |
| REC | 90 | 48 | **42** | 11 | 5 | 17 | 9 |
| SIN | 276 | 100 | **176** | 11 | 43 | 87 | 35 |
| CEF | 108 | 45 | **63** | 10 | 14 | 9 | 30 |

«Personas» = datos de personas distintas del titular ya leído (domicilio, sexo, tipo de id, idioma, consentimientos,
estado civil, contactos de conductor/propietario/asegurado/figuras/perjudicados). «Negocio a revisar» = el resto.
Conclusión: **el dinero y las fechas de póliza, recibo y siniestro SÍ se leen** (primas, cargos, comisiones,
capitales, límites, franquicias, reservas, pagos, fechas de efecto/vencimiento/ocurrencia). Lo tirado es contexto.

## 3. Huecos de valor, ordenados (ruta abreviada sin `Objetos.`; compañías entre corchetes)

All=Allianz, Occ=Occident, Map=Mapfre, Gen=Generali, Rea=Reale.

**Dinero / dato de negocio**
1. SIN `Siniestro.DatosSiniestro.RiesgosSiniestro.RiesgoRecSin.DatosCoberturas.Cobertura.DatosImportes.{PrimaNeta,PrimaTotal}` [Occ]
   y `.FechaInicio`, `.DescripcionCapitalAsegurado` [Occ] — prima y capital por cobertura en el siniestro.
2. SIN `…Contrarios.Contrario.ImplicadoDiversos.DanosSiniestro.DanoSiniestro.{ValorDano,DescripcionDano}` [Gen] — daños a terceros.
3. SIN `…PagosSiniestro.PagoSiniestro.FormaPago.DatosCuentaCorriente.IBAN` [All] (PII bancaria: solo con cifrado) y
   `…ReceptoresPago.Figura.DatosFigura.PersonaJuridica.{RazonSocial,IdPersona,TipoIdentificacion}` [All] — a quién se paga.
4. CEF `…MovimientoRecibo.DatosRecibo.DatosImportes.Importes.{PrimaNeta,PrimaTotal,DatosCargos.Cargo.*}` [All,Occ] y
   `…ImportesDEC.{PrimaTotalAnualizada,PrimaNetaAnualizada,ComisionAnualizada,CapitalAseguradoAgregado}` [All]
   — el desglose del recibo dentro de la liquidación (el REC ya trae primas; falta la copia en la cuenta).
5. CEF `…DatosLiquidacion.FormaPago.DatosCuentaCorriente.{IBAN,BIC}` + Titular [All] — cuenta de abono de la remesa.
6. POL `Poliza.DatosImportes.Importes.DatosMoneda.{TipoCambio,FechaCambio}` [Gen,Map] (también REC/SIN Map) — solo si no es EUR.

**Fechas / identidad del movimiento**
7. POL `Poliza.Suplementos.Suplemento.Fechas.{FechaEfectoInicial,FechaSituacion}` [All,Gen,Occ,Rea] — vigencia del suplemento.
8. POL `Poliza.DatosPoliza.NumeroSuplemento` [All,Gen,Map,Occ,Rea] (y REC/SIN/CEF `DatosPoliza.NumeroSuplemento`
   [All,Map,Occ]) — qué suplemento es: sin él no se ordena el historial.
9. CEF `…MovimientoRecibo.DatosRecibo.Fechas.{FechaEmision,FechaEfectoInicial,FechaEfectoActual,FechaVencimiento,FechaSituacion}`
   y `…MovimientosRecibo.Movimiento.{ClaseMovimiento,FechaMovimiento}` [All,Occ], `…GestionCobro.{ClaseGestion,DatosFormaPago.ClaseFormaPago}`.
10. REC `Recibo.DatosRecibo.MovimientosRecibo.Movimiento.Anulacion.ReferenciaAnulacion` [All].
11. POL `Poliza.DatosPolizaReemplazada.{DatosMediador.*,DatosRamo.{RamoEntidad,ModalidadRamo,DescripcionModalidad},NumeroSuplemento,IdAplicacion}` [All,Occ]
    (el número y el DGS de la reemplazada sí se leen).

**Riesgo (vehículo / hogar / conductor)**
12. SIN `…Asegurado.ImplicadoAutos.Vehiculo.{ClaseVehiculo,CategoriaVehiculo,Combustible,UsoVehiculo,Valor,Potencia,Cilindrada,Plazas,PMA,Remolque,Antiguedad,FechaMatriculacion,Bastidor,Version,Color,BaseSIETe}`
    [Occ; ClaseVehiculo también All,Gen; Bastidor y Version también Gen] — el vehículo del siniestro (el de la póliza sí se lee en POL).
13. POL `Riesgo.RiesgoAutos.Conductores.Conductor.TipoPermiso` [Occ] y `.EstadoCivil` [All,Map,Occ]; mismos campos de personas del `Propietario`.
14. POL `Riesgo.{RiesgoHogar,RiesgoComercios,RiesgoComunidades}.SuperficieTotal` [Occ] (m² con solar) y `.SituacionRiesgo.Pais`;
    HOGAR `SituacionRiesgo.ClaseVia` [Map].
15. POL `Tomador.PersonaJuridica.Actividad.IdActividad` [Map] (CNAE de la actividad).

**Regulatorio / personas**
16. POL `Asegurado|Tomador|Figura|Titular….DatosContacto.Consentimientos.Consentimiento.{Clase,Situacion}` [All] — consentimientos RGPD.
17. POL `Asegurado.PersonaFisica|PersonaJuridica.Domicilio.*` [All,Rea] y `GestionCobro…Titular.*` [All] — domicilio del asegurado y
    del titular del pago cuando difieren del tomador.
18. POL `…OtrosDatos.Dato.{IdSubdato,NumeroOrden}` [Gen,Map] y SIN `…OtrosDatos.Dato.{IdSubdato,NumeroOrden}` [All]: se lee el valor
    pero no el identificador que lo explica.

## 4. Ruido (no merece desarrollo)

- Cabecera (`Cabecera.*`, `DatosLote`, `Emisor`, `Receptor`, `Version`, `FechaCreacion`): 10-11 por objeto, todas las compañías.
- Ids técnicos: `NumeroOrden` (todas las listas), `IdAplicacion`, `CodigoInterno` de entidad/mediador/receptor, `IdCliente`,
  `IdSolicitudMediador` [Map,Occ], `IdEmpleado` [Occ], `IdAgrupacion`/`IdCentroFacturacion` [Occ], `IdAccion`/`ClaseIdAccion` [All].
- Ramo repetido dentro de REC/SIN/CEF (`DatosPoliza.DatosRamo.*`): ya está en la póliza vinculada.
- PII de terceros sin uso de negocio: perjudicados, testigos, asistentes, contrarios (nombre/domicilio/sexo/tipo id) en SIN
  [All,Gen,Occ]; contacto de conductores [All,Occ]; `Sexo`, `Idioma`, `TipoIdentificacion` de cualquier persona.

## 5. Compañías por hueco (resumen)

- **Occident**: más ruido de riesgo (Superficie Total, TipoPermiso, Vehiculo del SIN, prima por cobertura del SIN, IdEmpleado).
- **Allianz**: consentimientos, domicilios del asegurado/titular, pagos de siniestro (IBAN, receptores), ImportesDEC en CEF.
- **Mapfre**: DatosMoneda, IdActividad, Beneficiario.NumeroOrden, IdSolicitudMediador.
- **Generali**: daños de contrarios, DatosMoneda, vida/decesos (persona del riesgo, `IdSubdato`).
- **Reale**: domicilio/sexo del asegurado, `Profesion` del conductor/asegurado, Clase de email/teléfono.

## 6. Claves oficiales (estándar EIAC V07.1, doc 209_IAC_ESP_DOC_DOCS-ESTANDAR-EIAC-V07-1_V05, 03/06/2026, §13.3)

Implementadas en `packages/module-seguros/src/claves-eiac.ts` (`CLAVES_EIAC` + `etiquetaClave(tabla, codigo)`; test
`claves-eiac.test.ts`). Código desconocido → se devuelve crudo; vacío/null → `null`. Las 137 parejas código/etiqueta
se comprobaron literalmente contra el texto del documento.

| Tabla (clave en el módulo) | Sección | Claves |
|---|---|---|
| `situacionPoliza` | 13.3.32 | AN, ES, EV, EX, PR |
| `situacionRecibo` | 13.3.33 | PE, CO, DE, AN, LI, RE |
| `claseRecibo` | 13.3.12 | CA, EX, PA, MO, NP, PB, SU, AE, TR, AP, PC |
| `formaPago` | 13.3.23 | CH, CC, IN, OF, PC, TA, BI, MC |
| `claseFigura` | 13.3.22 | AD, BE, CO, PA, PE, PR, SU, TE, TS |
| `combustible` | 13.3.17 | DI, EL, GA, GL, GE, HI |
| `claseVehiculo` | 13.3.16 | 27 claves |
| `categoriaVehiculo` | 13.3.4 | CA, MO, TU |
| `claseInmueble` | 13.3.8 | 16 claves |
| `usoInmueble` | 13.3.37 | AL, HA, SE, NI |
| `zona` | 13.3.39 | DE, PO, UR, NI |
| `claseComunidad` | 13.3.18 (`claves_comunidad`) | CO, EG, EO, EV, EW, NI |
| extra: `fraccionPago` 13.3.24, `claseGestion` 13.3.7, `claseComision` 13.3.5, `clasePoliza` 13.3.11, `claseMovimientoRecibo` 13.3.10, `situacionSiniestro` 13.3.48 | | |

**NO existen como lista de claves en el documento** (no se inventan):
- **Uso del vehículo**: el tipo `_t_usovehiculo` remite a «Tabla RGV-Servicio Uso vehículo», externa al estándar.
- **Antigüedad**: inmueble = año (`xs:gYear`); vehículo = fecha (`xs:dateTime`). Sin claves.
- **Medidas de protección**: estructura libre `tipo_proteccion` (IdMedida, DescripcionMedida, IdSubmedida, ValorSubmedida), sin tabla.

Avisos para quien use la tabla: `situacionPoliza` oficial NO trae «vigente/no vigente» (EV=En Vigor, PR=Propuesta, ES=En Suspenso);
`claseFigura` PA «Pagador» no aplica a siniestros; el estándar numera 13.3.27 y 13.3.38 sin contenido legible.

## 7. Reproducir

Árbol sintético + `medirCoberturaCampos` con `tsx --tsconfig /home/user/asegura/tsconfig.json` (cwd fuera del repo asegura),
cruzado con `select … from seguros.cima_cobertura_campos` normalizando `regexp_replace(ruta,'^ProcesosEIAC\.','')` y sumando
`veces_leido` por ruta. Arreglo de fondo recomendado (no hecho aquí): borrar o fusionar las filas con prefijo
`ProcesosEIAC.` en `cima_cobertura_campos`, para que la pantalla no vuelva a decir «nunca leído» de campos que sí se leen.
