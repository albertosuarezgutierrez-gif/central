# Campos que trae CIMA (EIAC) — inventario completo

> Generado el 24/09/2026 recorriendo **todos** los XML de las dos descargas del Portal CIMA que
> Alberto guarda en Google Drive (carpeta **«CIMA»**: `28-03-26a26-06-26.zip` y
> `26-06-26a24-09-26.zip`, 154 ficheros). Solo rutas de campo y qué compañía las manda: **ningún
> valor** (llevan datos personales).
>
> **Por qué importa (Alberto):** CIMA trae prácticamente todo lo que pone el PDF de la póliza. Un
> campo que no está en este inventario no lo manda ninguna compañía; uno que está y no se lee es un
> dato que tenemos y tiramos. Qué se lee HOY lo mide en vivo la tabla `seguros.cima_cobertura_campos`
> (`veces_visto` / `veces_leido`, desde el 17/09/2026). Tras asegura#851 se leen además anulación,
> póliza reemplazada, suplementos, «otros datos» y el resto de la ficha del inmueble.
>
> **Copia de TODO lo de CIMA en Drive:** la carpeta «CIMA» de Drive es la copia completa de los
> ficheros (POL, REC, SIN y CEF). TIREA no reentrega un fichero ya confirmado, así que es la
> única forma de reprocesar cuando el lector aprende un campo nuevo (`cima-rescate-lote` del repo
> `asegura`). Al regenerar este inventario, bájala otra vez: las rutas nuevas salen solas.

| Tipo | Compañía | Ficheros |
|---|---|---|
| CEF | Allianz | 4 |
| CEF | Occident | 5 |
| POL | Mapfre | 6 |
| POL | Generali | 2 |
| POL | Allianz | 7 |
| POL | Occident | 18 |
| POL | Reale | 3 |
| REC | Mapfre | 6 |
| REC | Allianz | 12 |
| REC | Occident | 41 |
| REC | Reale | 3 |
| SIN | Mapfre | 2 |
| SIN | Generali | 1 |
| SIN | Allianz | 16 |
| SIN | Occident | 27 |

## CEF — 108 campos

| Campo (ruta sin la raíz) | Compañías |
|---|---|
| `Cabecera.DatosLote.IdLote` | Allianz, Occident |
| `Cabecera.DatosLote.NumeroFicheros` | Allianz, Occident |
| `Cabecera.DatosLote.SecuenciaFichero` | Allianz, Occident |
| `Cabecera.DatosProcesos.CodigoProceso` | Allianz, Occident |
| `Cabecera.Emisor.CodigoDGS` | Allianz, Occident |
| `Cabecera.Emisor.CodigoInterno` | Allianz, Occident |
| `Cabecera.FechaCreacion` | Allianz, Occident |
| `Cabecera.Receptor.CodigoDGS` | Allianz, Occident |
| `Cabecera.Receptor.CodigoInterno` | Allianz, Occident |
| `Cabecera.Version` | Allianz, Occident |
| `Objetos.CuentaEfectivo.CodigoEntidad.CodigoDGS` | Allianz, Occident |
| `Objetos.CuentaEfectivo.CodigoEntidad.CodigoInterno` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Conceptos.ComisionesRecibos` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Conceptos.OtrosConceptos` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Conceptos.RecibosCobrados` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Conceptos.Remesas` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Conceptos.RetencionComisiones` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Conceptos.RetencionOtros` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Conceptos.SiniestrosPagados` | Allianz, Occident |
| `Objetos.CuentaEfectivo.DatosMediador.ClaseMediador` | Allianz, Occident |
| `Objetos.CuentaEfectivo.DatosMediador.IdMediador.CodigoDGS` | Allianz, Occident |
| `Objetos.CuentaEfectivo.DatosMediador.IdMediador.CodigoInterno` | Allianz, Occident |
| `Objetos.CuentaEfectivo.DatosMediador.NombreMediador` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.CodigoEntidad.CodigoDGS` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.CodigoEntidad.CodigoInterno` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.DatosMediador.ClaseMediador` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.DatosMediador.IdMediador.CodigoDGS` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.DatosMediador.IdMediador.CodigoInterno` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.DatosMediador.NombreMediador` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.EstadoLiquidacion` | Allianz |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.FechaLiquidacion` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.FechaPago` | Allianz |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.FormaPago.ClaseFormaPago` | Allianz |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.FormaPago.DatosCuentaCorriente.BIC` | Allianz |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.FormaPago.DatosCuentaCorriente.IBAN` | Allianz |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.FormaPago.DatosCuentaCorriente.Titular.PersonaFisica.Apellido1` | Allianz |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.FormaPago.DatosCuentaCorriente.Titular.PersonaFisica.Apellido2` | Allianz |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.FormaPago.DatosCuentaCorriente.Titular.PersonaFisica.Domicilio.CodigoPostal` | Allianz |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.FormaPago.DatosCuentaCorriente.Titular.PersonaFisica.Domicilio.NombreVia` | Allianz |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.FormaPago.DatosCuentaCorriente.Titular.PersonaFisica.Domicilio.Poblacion` | Allianz |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.FormaPago.DatosCuentaCorriente.Titular.PersonaFisica.Domicilio.Provincia` | Allianz |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.FormaPago.DatosCuentaCorriente.Titular.PersonaFisica.IdPersona` | Allianz |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.FormaPago.DatosCuentaCorriente.Titular.PersonaFisica.Nombre` | Allianz |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.FormaPago.DatosCuentaCorriente.Titular.PersonaFisica.Sexo` | Allianz |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.FormaPago.DatosCuentaCorriente.Titular.PersonaFisica.TipoIdentificacion` | Allianz |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.IdLiquidacionEntidad` | Allianz |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.ImporteRemesa` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.FechaMovimiento` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.ImporteMovimiento.ClaseImporte` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.ImporteMovimiento.Importe` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.ImporteMovimiento.NumeroOrden` | Allianz |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoContable.Clase` | Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoContable.Concepto` | Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoContable.Descripcion` | Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoContable.ImporteBruto` | Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoContable.ImporteLiquido` | Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoContable.RetencionIRPF` | Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoRecibo.DatosPoliza.CodigoEntidad.CodigoDGS` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoRecibo.DatosPoliza.CodigoEntidad.CodigoInterno` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoRecibo.DatosPoliza.DatosMediador.ClaseMediador` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoRecibo.DatosPoliza.DatosMediador.IdMediador.CodigoDGS` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoRecibo.DatosPoliza.DatosMediador.IdMediador.CodigoInterno` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoRecibo.DatosPoliza.DatosMediador.NombreMediador` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoRecibo.DatosPoliza.DatosRamo.DescripcionModalidad` | Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoRecibo.DatosPoliza.DatosRamo.DescripcionRamo` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoRecibo.DatosPoliza.DatosRamo.ModalidadRamo` | Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoRecibo.DatosPoliza.DatosRamo.RamoDGS` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoRecibo.DatosPoliza.DatosRamo.RamoEntidad` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoRecibo.DatosPoliza.IdAplicacion` | Allianz |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoRecibo.DatosPoliza.IdPoliza` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoRecibo.DatosPoliza.NumeroSuplemento` | Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoRecibo.DatosRecibo.ClaseRecibo` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoRecibo.DatosRecibo.DatosComisiones.Comision.Base` | Allianz |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoRecibo.DatosRecibo.DatosComisiones.Comision.ClaseComision` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoRecibo.DatosRecibo.DatosComisiones.Comision.ComisionBruta` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoRecibo.DatosRecibo.DatosComisiones.Comision.ComisionLiquida` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoRecibo.DatosRecibo.DatosComisiones.Comision.NumeroOrden` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoRecibo.DatosRecibo.DatosComisiones.Comision.RetencionIRPF` | Allianz |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoRecibo.DatosRecibo.DatosImportes.Importes.DatosCargos.Cargo.ClaseCargo` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoRecibo.DatosRecibo.DatosImportes.Importes.DatosCargos.Cargo.DescripcionCargo` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoRecibo.DatosRecibo.DatosImportes.Importes.DatosCargos.Cargo.Importe` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoRecibo.DatosRecibo.DatosImportes.Importes.DatosCargos.Cargo.NumeroOrden` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoRecibo.DatosRecibo.DatosImportes.Importes.PrimaNeta` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoRecibo.DatosRecibo.DatosImportes.Importes.PrimaTotal` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoRecibo.DatosRecibo.DatosImportes.ImportesDEC.CapitalAseguradoAgregado` | Allianz |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoRecibo.DatosRecibo.DatosImportes.ImportesDEC.ComisionAnualizada` | Allianz |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoRecibo.DatosRecibo.DatosImportes.ImportesDEC.PrimaNetaAnualizada` | Allianz |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoRecibo.DatosRecibo.DatosImportes.ImportesDEC.PrimaTotalAnualizada` | Allianz |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoRecibo.DatosRecibo.Fechas.FechaEfectoActual` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoRecibo.DatosRecibo.Fechas.FechaEfectoInicial` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoRecibo.DatosRecibo.Fechas.FechaEmision` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoRecibo.DatosRecibo.Fechas.FechaSituacion` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoRecibo.DatosRecibo.Fechas.FechaVencimiento` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoRecibo.DatosRecibo.GestionCobro.ClaseGestion` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoRecibo.DatosRecibo.GestionCobro.DatosFormaPago.ClaseFormaPago` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoRecibo.DatosRecibo.GestionCobro.DatosFormaPago.DatosCuentaCorriente.BIC` | Allianz |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoRecibo.DatosRecibo.GestionCobro.DatosFormaPago.DatosCuentaCorriente.IBAN` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoRecibo.DatosRecibo.IdRecibo` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoRecibo.DatosRecibo.IdRemesa` | Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoRecibo.DatosRecibo.MovimientosRecibo.Movimiento.ClaseMovimiento` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoRecibo.DatosRecibo.MovimientosRecibo.Movimiento.FechaMovimiento` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoRecibo.DatosRecibo.MovimientosRecibo.Movimiento.NumeroOrden` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.MovimientoRecibo.DatosRecibo.SituacionRecibo` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion.NumeroOrden` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Periodo.FechaFin` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Periodo.FechaInicio` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Saldos.SaldoFinal` | Allianz, Occident |
| `Objetos.CuentaEfectivo.Saldos.SaldoInicial` | Allianz, Occident |

## POL — 470 campos

| Campo (ruta sin la raíz) | Compañías |
|---|---|
| `Cabecera.DatosLote.IdLote` | Allianz, Generali, Mapfre, Occident, Reale |
| `Cabecera.DatosLote.NumeroFicheros` | Allianz, Mapfre, Occident, Reale |
| `Cabecera.DatosLote.SecuenciaFichero` | Allianz, Mapfre, Occident, Reale |
| `Cabecera.DatosProcesos.CodigoProceso` | Allianz, Generali, Mapfre, Occident, Reale |
| `Cabecera.Emisor.CodigoDGS` | Allianz, Generali, Mapfre, Occident, Reale |
| `Cabecera.Emisor.CodigoInterno` | Allianz, Generali, Mapfre, Occident, Reale |
| `Cabecera.FechaCreacion` | Allianz, Generali, Mapfre, Occident, Reale |
| `Cabecera.Receptor.CodigoDGS` | Allianz, Generali, Mapfre, Occident, Reale |
| `Cabecera.Receptor.CodigoInterno` | Allianz, Generali, Mapfre, Occident, Reale |
| `Cabecera.Version` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.Asegurado.PersonaFisica.Apellido1` | Allianz, Reale |
| `Objetos.Poliza.Asegurado.PersonaFisica.Apellido2` | Allianz, Reale |
| `Objetos.Poliza.Asegurado.PersonaFisica.DatosContacto.Consentimientos.Consentimiento.Clase` | Allianz |
| `Objetos.Poliza.Asegurado.PersonaFisica.DatosContacto.Consentimientos.Consentimiento.Situacion` | Allianz |
| `Objetos.Poliza.Asegurado.PersonaFisica.DatosContacto.Emails.Email.Clase` | Reale |
| `Objetos.Poliza.Asegurado.PersonaFisica.DatosContacto.Emails.Email.Direccion` | Allianz, Reale |
| `Objetos.Poliza.Asegurado.PersonaFisica.DatosContacto.Telefonos.Telefono.Clase` | Reale |
| `Objetos.Poliza.Asegurado.PersonaFisica.DatosContacto.Telefonos.Telefono.Numero` | Allianz, Reale |
| `Objetos.Poliza.Asegurado.PersonaFisica.Domicilio.ClaseVia` | Allianz, Reale |
| `Objetos.Poliza.Asegurado.PersonaFisica.Domicilio.CodigoPostal` | Allianz, Reale |
| `Objetos.Poliza.Asegurado.PersonaFisica.Domicilio.NombreVia` | Allianz, Reale |
| `Objetos.Poliza.Asegurado.PersonaFisica.Domicilio.OtrosDatosVia` | Allianz, Reale |
| `Objetos.Poliza.Asegurado.PersonaFisica.Domicilio.Pais` | Allianz, Reale |
| `Objetos.Poliza.Asegurado.PersonaFisica.Domicilio.Poblacion` | Allianz, Reale |
| `Objetos.Poliza.Asegurado.PersonaFisica.Domicilio.Provincia` | Allianz, Reale |
| `Objetos.Poliza.Asegurado.PersonaFisica.FechaNacimiento` | Allianz, Reale |
| `Objetos.Poliza.Asegurado.PersonaFisica.IdCliente` | Allianz |
| `Objetos.Poliza.Asegurado.PersonaFisica.IdPersona` | Allianz, Reale |
| `Objetos.Poliza.Asegurado.PersonaFisica.Nombre` | Allianz, Reale |
| `Objetos.Poliza.Asegurado.PersonaFisica.Profesion.Descripcion` | Reale |
| `Objetos.Poliza.Asegurado.PersonaFisica.Sexo` | Allianz, Reale |
| `Objetos.Poliza.Asegurado.PersonaFisica.TipoIdentificacion` | Allianz, Reale |
| `Objetos.Poliza.Asegurado.PersonaJuridica.DatosContacto.Consentimientos.Consentimiento.Clase` | Allianz |
| `Objetos.Poliza.Asegurado.PersonaJuridica.DatosContacto.Consentimientos.Consentimiento.Situacion` | Allianz |
| `Objetos.Poliza.Asegurado.PersonaJuridica.DatosContacto.Emails.Email.Direccion` | Allianz |
| `Objetos.Poliza.Asegurado.PersonaJuridica.DatosContacto.Telefonos.Telefono.Numero` | Allianz |
| `Objetos.Poliza.Asegurado.PersonaJuridica.Domicilio.ClaseVia` | Allianz |
| `Objetos.Poliza.Asegurado.PersonaJuridica.Domicilio.CodigoPostal` | Allianz |
| `Objetos.Poliza.Asegurado.PersonaJuridica.Domicilio.NombreVia` | Allianz |
| `Objetos.Poliza.Asegurado.PersonaJuridica.Domicilio.OtrosDatosVia` | Allianz |
| `Objetos.Poliza.Asegurado.PersonaJuridica.Domicilio.Pais` | Allianz |
| `Objetos.Poliza.Asegurado.PersonaJuridica.Domicilio.Poblacion` | Allianz |
| `Objetos.Poliza.Asegurado.PersonaJuridica.Domicilio.Provincia` | Allianz |
| `Objetos.Poliza.Asegurado.PersonaJuridica.IdCliente` | Allianz |
| `Objetos.Poliza.Asegurado.PersonaJuridica.IdPersona` | Allianz, Generali |
| `Objetos.Poliza.Asegurado.PersonaJuridica.Idioma` | Allianz |
| `Objetos.Poliza.Asegurado.PersonaJuridica.RazonSocial` | Allianz, Generali |
| `Objetos.Poliza.Asegurado.PersonaJuridica.TipoIdentificacion` | Allianz, Generali |
| `Objetos.Poliza.ClasePoliza` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosAnulacion.DetalleAnulacion` | Allianz, Generali, Mapfre, Occident |
| `Objetos.Poliza.DatosAnulacion.FechaAnulacion` | Allianz, Generali, Mapfre, Occident |
| `Objetos.Poliza.DatosAnulacion.MotivoAnulacion` | Allianz, Generali, Mapfre, Occident |
| `Objetos.Poliza.DatosComercializacion.Comercializacion.Clase` | Occident |
| `Objetos.Poliza.DatosComercializacion.Comercializacion.Descripcion` | Occident |
| `Objetos.Poliza.DatosComercializacion.Comercializacion.IdComercializacion` | Occident |
| `Objetos.Poliza.DatosComisiones.Comision.ClaseComision` | Reale |
| `Objetos.Poliza.DatosComisiones.Comision.ComisionBruta` | Reale |
| `Objetos.Poliza.DatosImportes.Importes.DatosCargos.Cargo.ClaseCargo` | Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosImportes.Importes.DatosCargos.Cargo.DescripcionCargo` | Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosImportes.Importes.DatosCargos.Cargo.Importe` | Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosImportes.Importes.DatosCargos.Cargo.NumeroOrden` | Mapfre, Occident |
| `Objetos.Poliza.DatosImportes.Importes.DatosMoneda.FechaCambio` | Generali, Mapfre |
| `Objetos.Poliza.DatosImportes.Importes.DatosMoneda.Moneda` | Generali, Mapfre |
| `Objetos.Poliza.DatosImportes.Importes.DatosMoneda.TipoCambio` | Generali, Mapfre |
| `Objetos.Poliza.DatosImportes.Importes.PrimaNeta` | Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosImportes.Importes.PrimaTotal` | Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosImportes.ImportesDEC.CapitalAseguradoAgregado` | Generali, Occident |
| `Objetos.Poliza.DatosImportes.ImportesDEC.ComisionAnualizada` | Generali |
| `Objetos.Poliza.DatosImportes.ImportesDEC.PrimaNetaAnualizada` | Generali, Occident |
| `Objetos.Poliza.DatosImportes.ImportesDEC.PrimaTotalAnualizada` | Generali, Occident |
| `Objetos.Poliza.DatosPoliza.CodigoEntidad.CodigoDGS` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosPoliza.CodigoEntidad.CodigoInterno` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosPoliza.DatosMediador.ClaseMediador` | Allianz, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosPoliza.DatosMediador.IdMediador.CodigoDGS` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosPoliza.DatosMediador.IdMediador.CodigoInterno` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosPoliza.DatosMediador.NombreMediador` | Allianz, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosPoliza.DatosRamo.DescripcionModalidad` | Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosPoliza.DatosRamo.DescripcionRamo` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosPoliza.DatosRamo.ModalidadRamo` | Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosPoliza.DatosRamo.RamoDGS` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosPoliza.DatosRamo.RamoEntidad` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosPoliza.IdAplicacion` | Allianz, Generali |
| `Objetos.Poliza.DatosPoliza.IdPoliza` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosPoliza.NumeroSuplemento` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosPolizaReemplazada.CodigoEntidad.CodigoDGS` | Allianz, Occident |
| `Objetos.Poliza.DatosPolizaReemplazada.CodigoEntidad.CodigoInterno` | Allianz, Occident |
| `Objetos.Poliza.DatosPolizaReemplazada.DatosMediador.ClaseMediador` | Allianz, Occident |
| `Objetos.Poliza.DatosPolizaReemplazada.DatosMediador.IdMediador.CodigoDGS` | Allianz, Occident |
| `Objetos.Poliza.DatosPolizaReemplazada.DatosMediador.IdMediador.CodigoInterno` | Allianz, Occident |
| `Objetos.Poliza.DatosPolizaReemplazada.DatosMediador.NombreMediador` | Allianz, Occident |
| `Objetos.Poliza.DatosPolizaReemplazada.DatosRamo.DescripcionModalidad` | Occident |
| `Objetos.Poliza.DatosPolizaReemplazada.DatosRamo.DescripcionRamo` | Allianz, Occident |
| `Objetos.Poliza.DatosPolizaReemplazada.DatosRamo.ModalidadRamo` | Occident |
| `Objetos.Poliza.DatosPolizaReemplazada.DatosRamo.RamoDGS` | Allianz, Occident |
| `Objetos.Poliza.DatosPolizaReemplazada.DatosRamo.RamoEntidad` | Allianz, Occident |
| `Objetos.Poliza.DatosPolizaReemplazada.IdAplicacion` | Allianz |
| `Objetos.Poliza.DatosPolizaReemplazada.IdPoliza` | Allianz, Occident |
| `Objetos.Poliza.DatosPolizaReemplazada.NumeroSuplemento` | Allianz |
| `Objetos.Poliza.DatosRegularizacion.PolizaRegularizable` | Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.Beneficiarios.Beneficiario.DescripcionBeneficiario` | Mapfre |
| `Objetos.Poliza.DatosRiesgos.Riesgo.Beneficiarios.Beneficiario.NumeroOrden` | Mapfre |
| `Objetos.Poliza.DatosRiesgos.Riesgo.Beneficiarios.Beneficiario.Orden` | Mapfre |
| `Objetos.Poliza.DatosRiesgos.Riesgo.Beneficiarios.Beneficiario.Prestamo.DescripcionPrestamo` | Mapfre |
| `Objetos.Poliza.DatosRiesgos.Riesgo.DatosCoberturas.Cobertura.CapitalAsegurado` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.DatosCoberturas.Cobertura.DatosFranquicias.Franquicia.ClaseFranquicia` | Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.DatosCoberturas.Cobertura.DatosFranquicias.Franquicia.NumeroOrden` | Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.DatosCoberturas.Cobertura.DatosFranquicias.Franquicia.Porcentaje` | Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.DatosCoberturas.Cobertura.DatosFranquicias.Franquicia.ValorExacto` | Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.DatosCoberturas.Cobertura.DatosFranquicias.Franquicia.ValorMaximo` | Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.DatosCoberturas.Cobertura.DatosFranquicias.Franquicia.ValorMinimo` | Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.DatosCoberturas.Cobertura.DatosImportes.DatosCargos.Cargo.ClaseCargo` | Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.DatosCoberturas.Cobertura.DatosImportes.DatosCargos.Cargo.DescripcionCargo` | Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.DatosCoberturas.Cobertura.DatosImportes.DatosCargos.Cargo.Importe` | Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.DatosCoberturas.Cobertura.DatosImportes.PrimaNeta` | Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.DatosCoberturas.Cobertura.DatosImportes.PrimaTotal` | Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.DatosCoberturas.Cobertura.DatosLimitesAsegurados.Limite.ClaseLimite` | Allianz, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.DatosCoberturas.Cobertura.DatosLimitesAsegurados.Limite.DescripcionLimite` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.DatosCoberturas.Cobertura.DatosLimitesAsegurados.Limite.LimiteMaximo` | Allianz, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.DatosCoberturas.Cobertura.DatosLimitesAsegurados.Limite.LimiteMinimo` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.DatosCoberturas.Cobertura.DatosLimitesAsegurados.Limite.NumeroOrden` | Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.DatosCoberturas.Cobertura.DescripcionCapitalAsegurado` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.DatosCoberturas.Cobertura.DescripcionCobertura` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.DatosCoberturas.Cobertura.FechaFin` | Allianz, Mapfre, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.DatosCoberturas.Cobertura.FechaInicio` | Allianz, Mapfre, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.DatosCoberturas.Cobertura.IdCobertura` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.DatosCoberturas.Cobertura.ModalidadValoracion` | Allianz, Mapfre |
| `Objetos.Poliza.DatosRiesgos.Riesgo.DatosCoberturas.Cobertura.NumeroOrden` | Allianz, Mapfre, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.DescripcionRiesgo` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.FechaFin` | Allianz, Mapfre, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.FechaInicio` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.IdRiesgo` | Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.NumeroOrden` | Allianz, Mapfre, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.OtrasFiguras.Figura.ClaseFigura` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.OtrasFiguras.Figura.DatosFigura.PersonaFisica.Apellido1` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.OtrasFiguras.Figura.DatosFigura.PersonaFisica.Apellido2` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.OtrasFiguras.Figura.DatosFigura.PersonaFisica.DatosContacto.Consentimientos.Consentimiento.Clase` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.OtrasFiguras.Figura.DatosFigura.PersonaFisica.DatosContacto.Consentimientos.Consentimiento.Situacion` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.OtrasFiguras.Figura.DatosFigura.PersonaFisica.DatosContacto.Emails.Email.Direccion` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.OtrasFiguras.Figura.DatosFigura.PersonaFisica.DatosContacto.Telefonos.Telefono.Numero` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.OtrasFiguras.Figura.DatosFigura.PersonaFisica.Domicilio.ClaseVia` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.OtrasFiguras.Figura.DatosFigura.PersonaFisica.Domicilio.CodigoPostal` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.OtrasFiguras.Figura.DatosFigura.PersonaFisica.Domicilio.NombreVia` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.OtrasFiguras.Figura.DatosFigura.PersonaFisica.Domicilio.OtrosDatosVia` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.OtrasFiguras.Figura.DatosFigura.PersonaFisica.Domicilio.Pais` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.OtrasFiguras.Figura.DatosFigura.PersonaFisica.Domicilio.Poblacion` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.OtrasFiguras.Figura.DatosFigura.PersonaFisica.Domicilio.Provincia` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.OtrasFiguras.Figura.DatosFigura.PersonaFisica.FechaNacimiento` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.OtrasFiguras.Figura.DatosFigura.PersonaFisica.IdCliente` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.OtrasFiguras.Figura.DatosFigura.PersonaFisica.IdPersona` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.OtrasFiguras.Figura.DatosFigura.PersonaFisica.Idioma` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.OtrasFiguras.Figura.DatosFigura.PersonaFisica.Nombre` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.OtrasFiguras.Figura.DatosFigura.PersonaFisica.Sexo` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.OtrasFiguras.Figura.DatosFigura.PersonaFisica.TipoIdentificacion` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.OtrasFiguras.Figura.DatosFigura.PersonaJuridica.DatosContacto.Consentimientos.Consentimiento.Clase` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.OtrasFiguras.Figura.DatosFigura.PersonaJuridica.DatosContacto.Consentimientos.Consentimiento.Situacion` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.OtrasFiguras.Figura.DatosFigura.PersonaJuridica.DatosContacto.Emails.Email.Direccion` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.OtrasFiguras.Figura.DatosFigura.PersonaJuridica.DatosContacto.Telefonos.Telefono.Numero` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.OtrasFiguras.Figura.DatosFigura.PersonaJuridica.Domicilio.ClaseVia` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.OtrasFiguras.Figura.DatosFigura.PersonaJuridica.Domicilio.CodigoPostal` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.OtrasFiguras.Figura.DatosFigura.PersonaJuridica.Domicilio.NombreVia` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.OtrasFiguras.Figura.DatosFigura.PersonaJuridica.Domicilio.OtrosDatosVia` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.OtrasFiguras.Figura.DatosFigura.PersonaJuridica.Domicilio.Pais` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.OtrasFiguras.Figura.DatosFigura.PersonaJuridica.Domicilio.Poblacion` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.OtrasFiguras.Figura.DatosFigura.PersonaJuridica.Domicilio.Provincia` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.OtrasFiguras.Figura.DatosFigura.PersonaJuridica.IdCliente` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.OtrasFiguras.Figura.DatosFigura.PersonaJuridica.IdPersona` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.OtrasFiguras.Figura.DatosFigura.PersonaJuridica.Idioma` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.OtrasFiguras.Figura.DatosFigura.PersonaJuridica.RazonSocial` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.OtrasFiguras.Figura.DatosFigura.PersonaJuridica.TipoIdentificacion` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.OtrosDatos.Dato.DescripcionDato` | Generali |
| `Objetos.Poliza.DatosRiesgos.Riesgo.OtrosDatos.Dato.IdDato` | Generali |
| `Objetos.Poliza.DatosRiesgos.Riesgo.OtrosDatos.Dato.IdSubdato` | Generali |
| `Objetos.Poliza.DatosRiesgos.Riesgo.OtrosDatos.Dato.ValorSubdato` | Generali |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAccidentes.Convenio` | Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAccidentes.IdAplicacion` | Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Conductores.Conductor.ClaseConductor` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Conductores.Conductor.DatosConductor.Apellido1` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Conductores.Conductor.DatosConductor.Apellido2` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Conductores.Conductor.DatosConductor.DatosContacto.Consentimientos.Consentimiento.Clase` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Conductores.Conductor.DatosConductor.DatosContacto.Consentimientos.Consentimiento.Situacion` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Conductores.Conductor.DatosConductor.DatosContacto.Emails.Email.Direccion` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Conductores.Conductor.DatosConductor.DatosContacto.Telefonos.Telefono.Clase` | Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Conductores.Conductor.DatosConductor.DatosContacto.Telefonos.Telefono.Numero` | Allianz, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Conductores.Conductor.DatosConductor.Domicilio.ClaseVia` | Allianz, Mapfre, Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Conductores.Conductor.DatosConductor.Domicilio.CodigoPostal` | Allianz, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Conductores.Conductor.DatosConductor.Domicilio.NombreVia` | Allianz, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Conductores.Conductor.DatosConductor.Domicilio.OtrosDatosVia` | Allianz, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Conductores.Conductor.DatosConductor.Domicilio.Pais` | Allianz, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Conductores.Conductor.DatosConductor.Domicilio.Poblacion` | Allianz, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Conductores.Conductor.DatosConductor.Domicilio.Provincia` | Allianz, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Conductores.Conductor.DatosConductor.EstadoCivil` | Allianz, Mapfre, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Conductores.Conductor.DatosConductor.FechaNacimiento` | Allianz, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Conductores.Conductor.DatosConductor.IdCliente` | Allianz, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Conductores.Conductor.DatosConductor.IdPersona` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Conductores.Conductor.DatosConductor.Idioma` | Allianz, Mapfre, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Conductores.Conductor.DatosConductor.Nombre` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Conductores.Conductor.DatosConductor.Profesion.Descripcion` | Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Conductores.Conductor.DatosConductor.Sexo` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Conductores.Conductor.DatosConductor.TipoIdentificacion` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Conductores.Conductor.FechaPermiso` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Conductores.Conductor.NumeroOrden` | Allianz, Mapfre, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Conductores.Conductor.TipoPermiso` | Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.IdAplicacion` | Allianz, Generali |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.IdEmpleado` | Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Propietario.PersonaFisica.Apellido1` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Propietario.PersonaFisica.Apellido2` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Propietario.PersonaFisica.DatosContacto.Consentimientos.Consentimiento.Clase` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Propietario.PersonaFisica.DatosContacto.Consentimientos.Consentimiento.Situacion` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Propietario.PersonaFisica.DatosContacto.Emails.Email.Clase` | Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Propietario.PersonaFisica.DatosContacto.Emails.Email.Direccion` | Allianz, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Propietario.PersonaFisica.DatosContacto.Telefonos.Telefono.Clase` | Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Propietario.PersonaFisica.DatosContacto.Telefonos.Telefono.Numero` | Allianz, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Propietario.PersonaFisica.Domicilio.ClaseVia` | Allianz, Mapfre, Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Propietario.PersonaFisica.Domicilio.CodigoPostal` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Propietario.PersonaFisica.Domicilio.NombreVia` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Propietario.PersonaFisica.Domicilio.OtrosDatosVia` | Allianz, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Propietario.PersonaFisica.Domicilio.Pais` | Allianz, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Propietario.PersonaFisica.Domicilio.Poblacion` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Propietario.PersonaFisica.Domicilio.Provincia` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Propietario.PersonaFisica.EstadoCivil` | Allianz, Mapfre, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Propietario.PersonaFisica.FechaNacimiento` | Allianz, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Propietario.PersonaFisica.IdCliente` | Allianz, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Propietario.PersonaFisica.IdPersona` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Propietario.PersonaFisica.Idioma` | Allianz, Mapfre, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Propietario.PersonaFisica.Nombre` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Propietario.PersonaFisica.Sexo` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Propietario.PersonaFisica.TipoIdentificacion` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Propietario.PersonaJuridica.DatosContacto.Consentimientos.Consentimiento.Clase` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Propietario.PersonaJuridica.DatosContacto.Consentimientos.Consentimiento.Situacion` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Propietario.PersonaJuridica.DatosContacto.Emails.Email.Direccion` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Propietario.PersonaJuridica.DatosContacto.Telefonos.Telefono.Numero` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Propietario.PersonaJuridica.Domicilio.ClaseVia` | Allianz, Mapfre |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Propietario.PersonaJuridica.Domicilio.CodigoPostal` | Allianz, Generali, Mapfre |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Propietario.PersonaJuridica.Domicilio.NombreVia` | Allianz, Generali, Mapfre |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Propietario.PersonaJuridica.Domicilio.OtrosDatosVia` | Allianz, Mapfre |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Propietario.PersonaJuridica.Domicilio.Pais` | Allianz, Mapfre |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Propietario.PersonaJuridica.Domicilio.Poblacion` | Allianz, Generali, Mapfre |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Propietario.PersonaJuridica.Domicilio.Provincia` | Allianz, Generali, Mapfre |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Propietario.PersonaJuridica.IdCliente` | Allianz |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Propietario.PersonaJuridica.IdPersona` | Allianz, Generali, Mapfre |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Propietario.PersonaJuridica.Idioma` | Allianz, Mapfre |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Propietario.PersonaJuridica.RazonSocial` | Allianz, Generali, Mapfre |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Propietario.PersonaJuridica.TipoIdentificacion` | Allianz, Generali, Mapfre |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Vehiculo.Antiguedad` | Allianz, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Vehiculo.BaseSIETe` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Vehiculo.Bastidor` | Allianz, Generali, Occident, Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Vehiculo.CategoriaVehiculo` | Allianz, Generali, Mapfre, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Vehiculo.Cilindrada` | Allianz, Mapfre, Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Vehiculo.ClaseVehiculo` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Vehiculo.Combustible` | Allianz, Mapfre, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Vehiculo.FechaMatriculacion` | Allianz, Generali, Mapfre, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Vehiculo.Marca` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Vehiculo.Matricula` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Vehiculo.Modelo` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Vehiculo.PMA` | Allianz, Generali, Mapfre, Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Vehiculo.Plazas` | Allianz, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Vehiculo.Potencia` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Vehiculo.Remolque` | Allianz, Mapfre, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Vehiculo.UsoVehiculo` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Vehiculo.Valor` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoAutos.Vehiculo.Version` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoComercios.Actividad.DescripcionActividad` | Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoComercios.Antiguedad` | Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoComercios.Capitales.Capital.Bien` | Generali, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoComercios.Capitales.Capital.Descripcion` | Generali, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoComercios.Capitales.Capital.Importe` | Generali, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoComercios.Capitales.Capital.ModalidadValoracion` | Generali, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoComercios.MedidasProteccion.Proteccion.DescripcionMedida` | Generali, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoComercios.MedidasProteccion.Proteccion.NumeroOrden` | Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoComercios.MedidasProteccion.Proteccion.ValorSubmedida` | Generali |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoComercios.SituacionRiesgo.CodigoPostal` | Generali, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoComercios.SituacionRiesgo.NombreVia` | Generali, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoComercios.SituacionRiesgo.OtrosDatosVia` | Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoComercios.SituacionRiesgo.Pais` | Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoComercios.SituacionRiesgo.Poblacion` | Generali, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoComercios.SituacionRiesgo.Provincia` | Generali, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoComercios.SuperficieConstruida` | Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoComercios.SuperficieTotal` | Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoComercios.Zona` | Generali, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoComunidades.Antiguedad` | Generali, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoComunidades.Capitales.Capital.Bien` | Generali, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoComunidades.Capitales.Capital.Descripcion` | Generali, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoComunidades.Capitales.Capital.Importe` | Generali, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoComunidades.Capitales.Capital.ModalidadValoracion` | Generali, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoComunidades.ClaseComunidad` | Generali, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoComunidades.NumeroViviendas` | Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoComunidades.SituacionRiesgo.CodigoPostal` | Generali, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoComunidades.SituacionRiesgo.NombreVia` | Generali, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoComunidades.SituacionRiesgo.OtrosDatosVia` | Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoComunidades.SituacionRiesgo.Pais` | Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoComunidades.SituacionRiesgo.Poblacion` | Generali, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoComunidades.SituacionRiesgo.Provincia` | Generali, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoComunidades.SuperficieConstruida` | Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoComunidades.SuperficieTotal` | Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoComunidades.Zona` | Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoDecesos.Persona.Apellido1` | Generali |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoDecesos.Persona.Apellido2` | Generali |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoDecesos.Persona.IdPersona` | Generali |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoDecesos.Persona.Nombre` | Generali |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoDecesos.Persona.Sexo` | Generali |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoDecesos.Persona.TipoIdentificacion` | Generali |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoEmbarcaciones.Embarcacion.AnyoConstruccion` | Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoEmbarcaciones.Embarcacion.ClaseEmbarcacion` | Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoEmbarcaciones.Embarcacion.Eslora` | Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoEmbarcaciones.Embarcacion.ListaMatricula` | Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoEmbarcaciones.Embarcacion.Marca` | Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoEmbarcaciones.Embarcacion.Matricula` | Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoEmbarcaciones.Embarcacion.Modelo` | Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoEmbarcaciones.Embarcacion.Nombre` | Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoEmbarcaciones.Embarcacion.PlazasAutorizadas` | Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoEmbarcaciones.Embarcacion.PotenciaMotores` | Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoEmbarcaciones.Embarcacion.PuertoBase` | Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoHogar.Antiguedad` | Generali, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoHogar.Capitales.Capital.Bien` | Generali, Mapfre, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoHogar.Capitales.Capital.Descripcion` | Generali, Mapfre, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoHogar.Capitales.Capital.Importe` | Generali, Mapfre, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoHogar.Capitales.Capital.ModalidadValoracion` | Generali, Mapfre, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoHogar.ClaseInmueble` | Generali, Mapfre, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoHogar.MedidasProteccion.Proteccion.DescripcionMedida` | Generali, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoHogar.MedidasProteccion.Proteccion.NumeroOrden` | Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoHogar.MedidasProteccion.Proteccion.ValorSubmedida` | Generali |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoHogar.SituacionRiesgo.ClaseVia` | Mapfre |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoHogar.SituacionRiesgo.CodigoPostal` | Generali, Mapfre, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoHogar.SituacionRiesgo.NombreVia` | Generali, Mapfre, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoHogar.SituacionRiesgo.OtrosDatosVia` | Mapfre, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoHogar.SituacionRiesgo.Pais` | Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoHogar.SituacionRiesgo.Poblacion` | Generali, Mapfre, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoHogar.SituacionRiesgo.Provincia` | Generali, Mapfre, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoHogar.SuperficieConstruida` | Generali, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoHogar.SuperficieTotal` | Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoHogar.UsoInmueble` | Generali, Mapfre, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoHogar.Zona` | Generali, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoRC.Actividad.DescripcionActividad` | Mapfre, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoRC.Actividad.IdActividad` | Mapfre |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoRC.Animal.ClaseAnimal` | Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoRC.Animal.FechaNacimiento` | Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoRC.Animal.IdAnimal` | Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoRC.Animal.RazaAnimal` | Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoRC.Animal.UsoAnimal` | Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoRC.Capitales.Capital.Bien` | Mapfre, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoRC.Capitales.Capital.Descripcion` | Mapfre, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoRC.Capitales.Capital.Importe` | Mapfre, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoRC.Capitales.Capital.ModalidadValoracion` | Mapfre, Occident |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoVida.IdAplicacion` | Generali |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoVida.Persona.Apellido1` | Generali |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoVida.Persona.Apellido2` | Generali |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoVida.Persona.Domicilio.CodigoPostal` | Generali |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoVida.Persona.Domicilio.NombreVia` | Generali |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoVida.Persona.Domicilio.Poblacion` | Generali |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoVida.Persona.Domicilio.Provincia` | Generali |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoVida.Persona.IdPersona` | Generali |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoVida.Persona.Nombre` | Generali |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoVida.Persona.Sexo` | Generali |
| `Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoVida.Persona.TipoIdentificacion` | Generali |
| `Objetos.Poliza.DatosSuspensiones.Suspension.FechaSuspension` | Allianz |
| `Objetos.Poliza.DatosSuspensiones.Suspension.NumeroOrden` | Allianz |
| `Objetos.Poliza.DuracionPoliza` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.Fechas.FechaEfectoActual` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.Fechas.FechaEfectoInicial` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.Fechas.FechaEmision` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.Fechas.FechaSituacion` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.Fechas.FechaSolicitud` | Allianz, Mapfre, Occident |
| `Objetos.Poliza.Fechas.FechaVencimiento` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.FraccionPago` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.GestionCobro.ClaseGestion` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.GestionCobro.DatosFormaPago.ClaseFormaPago` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.GestionCobro.DatosFormaPago.DatosCuentaCorriente.BIC` | Generali |
| `Objetos.Poliza.GestionCobro.DatosFormaPago.DatosCuentaCorriente.IBAN` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaFisica.Apellido1` | Allianz |
| `Objetos.Poliza.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaFisica.Apellido2` | Allianz |
| `Objetos.Poliza.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaFisica.DatosContacto.Consentimientos.Consentimiento.Clase` | Allianz |
| `Objetos.Poliza.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaFisica.DatosContacto.Consentimientos.Consentimiento.Situacion` | Allianz |
| `Objetos.Poliza.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaFisica.DatosContacto.Emails.Email.Direccion` | Allianz |
| `Objetos.Poliza.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaFisica.DatosContacto.Telefonos.Telefono.Numero` | Allianz |
| `Objetos.Poliza.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaFisica.Domicilio.ClaseVia` | Allianz |
| `Objetos.Poliza.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaFisica.Domicilio.CodigoPostal` | Allianz |
| `Objetos.Poliza.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaFisica.Domicilio.NombreVia` | Allianz |
| `Objetos.Poliza.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaFisica.Domicilio.OtrosDatosVia` | Allianz |
| `Objetos.Poliza.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaFisica.Domicilio.Pais` | Allianz |
| `Objetos.Poliza.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaFisica.Domicilio.Poblacion` | Allianz |
| `Objetos.Poliza.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaFisica.Domicilio.Provincia` | Allianz |
| `Objetos.Poliza.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaFisica.FechaNacimiento` | Allianz |
| `Objetos.Poliza.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaFisica.IdCliente` | Allianz |
| `Objetos.Poliza.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaFisica.IdPersona` | Allianz |
| `Objetos.Poliza.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaFisica.Idioma` | Allianz |
| `Objetos.Poliza.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaFisica.Nombre` | Allianz |
| `Objetos.Poliza.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaFisica.Sexo` | Allianz |
| `Objetos.Poliza.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaFisica.TipoIdentificacion` | Allianz |
| `Objetos.Poliza.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaJuridica.DatosContacto.Consentimientos.Consentimiento.Clase` | Allianz |
| `Objetos.Poliza.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaJuridica.DatosContacto.Consentimientos.Consentimiento.Situacion` | Allianz |
| `Objetos.Poliza.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaJuridica.DatosContacto.Emails.Email.Direccion` | Allianz |
| `Objetos.Poliza.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaJuridica.DatosContacto.Telefonos.Telefono.Numero` | Allianz |
| `Objetos.Poliza.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaJuridica.Domicilio.ClaseVia` | Allianz |
| `Objetos.Poliza.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaJuridica.Domicilio.CodigoPostal` | Allianz |
| `Objetos.Poliza.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaJuridica.Domicilio.NombreVia` | Allianz |
| `Objetos.Poliza.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaJuridica.Domicilio.OtrosDatosVia` | Allianz |
| `Objetos.Poliza.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaJuridica.Domicilio.Pais` | Allianz |
| `Objetos.Poliza.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaJuridica.Domicilio.Poblacion` | Allianz |
| `Objetos.Poliza.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaJuridica.Domicilio.Provincia` | Allianz |
| `Objetos.Poliza.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaJuridica.IdCliente` | Allianz |
| `Objetos.Poliza.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaJuridica.IdPersona` | Allianz |
| `Objetos.Poliza.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaJuridica.Idioma` | Allianz |
| `Objetos.Poliza.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaJuridica.RazonSocial` | Allianz |
| `Objetos.Poliza.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaJuridica.TipoIdentificacion` | Allianz |
| `Objetos.Poliza.OrigenesContratacion.OrigenContratacion.ClaseContratacion` | Allianz, Mapfre, Occident |
| `Objetos.Poliza.OrigenesContratacion.OrigenContratacion.CodigoCentro` | Allianz, Mapfre, Occident |
| `Objetos.Poliza.OrigenesContratacion.OrigenContratacion.DescripcionCentro` | Mapfre |
| `Objetos.Poliza.OrigenesContratacion.OrigenContratacion.DescripcionClase` | Allianz, Mapfre |
| `Objetos.Poliza.OrigenesContratacion.OrigenContratacion.NumeroOrden` | Allianz, Mapfre, Occident |
| `Objetos.Poliza.OtrosDatos.Dato.DescripcionDato` | Generali, Mapfre |
| `Objetos.Poliza.OtrosDatos.Dato.IdDato` | Generali, Mapfre |
| `Objetos.Poliza.OtrosDatos.Dato.IdSubdato` | Generali, Mapfre |
| `Objetos.Poliza.OtrosDatos.Dato.NumeroOrden` | Mapfre |
| `Objetos.Poliza.OtrosDatos.Dato.ValorSubdato` | Generali, Mapfre |
| `Objetos.Poliza.SituacionPoliza` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.Suplementos.Suplemento.ClaseSuplemento` | Allianz, Generali, Occident, Reale |
| `Objetos.Poliza.Suplementos.Suplemento.DescripcionClaseSuplemento` | Allianz, Occident, Reale |
| `Objetos.Poliza.Suplementos.Suplemento.Detalle` | Allianz, Generali, Occident, Reale |
| `Objetos.Poliza.Suplementos.Suplemento.Fechas.FechaEfectoActual` | Allianz, Generali, Occident, Reale |
| `Objetos.Poliza.Suplementos.Suplemento.Fechas.FechaEfectoInicial` | Allianz, Generali, Occident, Reale |
| `Objetos.Poliza.Suplementos.Suplemento.Fechas.FechaEmision` | Allianz, Generali, Occident, Reale |
| `Objetos.Poliza.Suplementos.Suplemento.Fechas.FechaSituacion` | Allianz, Generali, Occident, Reale |
| `Objetos.Poliza.Suplementos.Suplemento.Fechas.FechaVencimiento` | Allianz, Generali, Occident, Reale |
| `Objetos.Poliza.Suplementos.Suplemento.IdSuplemento` | Allianz, Generali, Occident, Reale |
| `Objetos.Poliza.Suplementos.Suplemento.NumeroOrden` | Occident, Reale |
| `Objetos.Poliza.Suplementos.Suplemento.Situacion` | Allianz, Generali, Occident, Reale |
| `Objetos.Poliza.Tomador.PersonaFisica.Apellido1` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.Tomador.PersonaFisica.Apellido2` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.Tomador.PersonaFisica.DatosContacto.Consentimientos.Consentimiento.Clase` | Allianz |
| `Objetos.Poliza.Tomador.PersonaFisica.DatosContacto.Consentimientos.Consentimiento.Situacion` | Allianz |
| `Objetos.Poliza.Tomador.PersonaFisica.DatosContacto.Emails.Email.Clase` | Generali, Occident, Reale |
| `Objetos.Poliza.Tomador.PersonaFisica.DatosContacto.Emails.Email.Direccion` | Allianz, Generali, Occident, Reale |
| `Objetos.Poliza.Tomador.PersonaFisica.DatosContacto.Telefonos.Telefono.Clase` | Generali, Occident, Reale |
| `Objetos.Poliza.Tomador.PersonaFisica.DatosContacto.Telefonos.Telefono.Numero` | Allianz, Generali, Occident, Reale |
| `Objetos.Poliza.Tomador.PersonaFisica.Domicilio.ClaseVia` | Allianz, Mapfre, Reale |
| `Objetos.Poliza.Tomador.PersonaFisica.Domicilio.CodigoPostal` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.Tomador.PersonaFisica.Domicilio.NombreVia` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.Tomador.PersonaFisica.Domicilio.OtrosDatosVia` | Allianz, Mapfre, Occident, Reale |
| `Objetos.Poliza.Tomador.PersonaFisica.Domicilio.Pais` | Allianz, Mapfre, Occident, Reale |
| `Objetos.Poliza.Tomador.PersonaFisica.Domicilio.Poblacion` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.Tomador.PersonaFisica.Domicilio.Provincia` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.Tomador.PersonaFisica.EstadoCivil` | Generali, Occident |
| `Objetos.Poliza.Tomador.PersonaFisica.FechaNacimiento` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.Tomador.PersonaFisica.IdCliente` | Allianz, Occident |
| `Objetos.Poliza.Tomador.PersonaFisica.IdPersona` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.Tomador.PersonaFisica.Idioma` | Allianz, Mapfre, Occident |
| `Objetos.Poliza.Tomador.PersonaFisica.Nombre` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.Tomador.PersonaFisica.Profesion.Descripcion` | Reale |
| `Objetos.Poliza.Tomador.PersonaFisica.Sexo` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.Tomador.PersonaFisica.TipoIdentificacion` | Allianz, Generali, Mapfre, Occident, Reale |
| `Objetos.Poliza.Tomador.PersonaJuridica.Actividad.DescripcionActividad` | Mapfre |
| `Objetos.Poliza.Tomador.PersonaJuridica.Actividad.IdActividad` | Mapfre |
| `Objetos.Poliza.Tomador.PersonaJuridica.DatosContacto.Consentimientos.Consentimiento.Clase` | Allianz |
| `Objetos.Poliza.Tomador.PersonaJuridica.DatosContacto.Consentimientos.Consentimiento.Situacion` | Allianz |
| `Objetos.Poliza.Tomador.PersonaJuridica.DatosContacto.Emails.Email.Clase` | Generali, Occident |
| `Objetos.Poliza.Tomador.PersonaJuridica.DatosContacto.Emails.Email.Direccion` | Allianz, Generali, Occident |
| `Objetos.Poliza.Tomador.PersonaJuridica.DatosContacto.Telefonos.Telefono.Clase` | Generali, Occident |
| `Objetos.Poliza.Tomador.PersonaJuridica.DatosContacto.Telefonos.Telefono.Numero` | Allianz, Generali, Occident |
| `Objetos.Poliza.Tomador.PersonaJuridica.Domicilio.ClaseVia` | Allianz, Mapfre |
| `Objetos.Poliza.Tomador.PersonaJuridica.Domicilio.CodigoPostal` | Allianz, Generali, Mapfre, Occident |
| `Objetos.Poliza.Tomador.PersonaJuridica.Domicilio.NombreVia` | Allianz, Generali, Mapfre, Occident |
| `Objetos.Poliza.Tomador.PersonaJuridica.Domicilio.OtrosDatosVia` | Allianz, Mapfre, Occident |
| `Objetos.Poliza.Tomador.PersonaJuridica.Domicilio.Pais` | Allianz, Mapfre, Occident |
| `Objetos.Poliza.Tomador.PersonaJuridica.Domicilio.Poblacion` | Allianz, Generali, Mapfre, Occident |
| `Objetos.Poliza.Tomador.PersonaJuridica.Domicilio.Provincia` | Allianz, Generali, Mapfre, Occident |
| `Objetos.Poliza.Tomador.PersonaJuridica.IdCliente` | Allianz, Occident |
| `Objetos.Poliza.Tomador.PersonaJuridica.IdPersona` | Allianz, Generali, Mapfre, Occident |
| `Objetos.Poliza.Tomador.PersonaJuridica.Idioma` | Allianz, Mapfre, Occident |
| `Objetos.Poliza.Tomador.PersonaJuridica.RazonSocial` | Allianz, Generali, Mapfre, Occident |
| `Objetos.Poliza.Tomador.PersonaJuridica.TipoIdentificacion` | Allianz, Generali, Mapfre, Occident |

## REC — 88 campos

| Campo (ruta sin la raíz) | Compañías |
|---|---|
| `Cabecera.DatosLote.IdLote` | Allianz, Mapfre, Occident, Reale |
| `Cabecera.DatosLote.NumeroFicheros` | Allianz, Mapfre, Occident, Reale |
| `Cabecera.DatosLote.SecuenciaFichero` | Allianz, Mapfre, Occident, Reale |
| `Cabecera.DatosProcesos.CodigoProceso` | Allianz, Mapfre, Occident, Reale |
| `Cabecera.Emisor.CodigoDGS` | Allianz, Mapfre, Occident, Reale |
| `Cabecera.Emisor.CodigoInterno` | Allianz, Mapfre, Occident, Reale |
| `Cabecera.FechaCreacion` | Allianz, Mapfre, Occident, Reale |
| `Cabecera.Receptor.CodigoDGS` | Allianz, Mapfre, Occident, Reale |
| `Cabecera.Receptor.CodigoInterno` | Allianz, Mapfre, Occident, Reale |
| `Cabecera.Version` | Allianz, Mapfre, Occident, Reale |
| `Objetos.Recibo.DatosPoliza.CodigoEntidad.CodigoDGS` | Allianz, Mapfre, Occident, Reale |
| `Objetos.Recibo.DatosPoliza.CodigoEntidad.CodigoInterno` | Allianz, Mapfre, Occident, Reale |
| `Objetos.Recibo.DatosPoliza.DatosMediador.ClaseMediador` | Allianz, Mapfre, Occident, Reale |
| `Objetos.Recibo.DatosPoliza.DatosMediador.IdMediador.CodigoDGS` | Allianz, Mapfre, Occident, Reale |
| `Objetos.Recibo.DatosPoliza.DatosMediador.IdMediador.CodigoInterno` | Allianz, Mapfre, Occident, Reale |
| `Objetos.Recibo.DatosPoliza.DatosMediador.NombreMediador` | Allianz, Mapfre, Occident, Reale |
| `Objetos.Recibo.DatosPoliza.DatosRamo.DescripcionModalidad` | Mapfre, Occident, Reale |
| `Objetos.Recibo.DatosPoliza.DatosRamo.DescripcionRamo` | Allianz, Mapfre, Occident, Reale |
| `Objetos.Recibo.DatosPoliza.DatosRamo.ModalidadRamo` | Mapfre, Occident, Reale |
| `Objetos.Recibo.DatosPoliza.DatosRamo.RamoDGS` | Allianz, Mapfre, Occident, Reale |
| `Objetos.Recibo.DatosPoliza.DatosRamo.RamoEntidad` | Allianz, Mapfre, Occident, Reale |
| `Objetos.Recibo.DatosPoliza.IdAplicacion` | Allianz |
| `Objetos.Recibo.DatosPoliza.IdPoliza` | Allianz, Mapfre, Occident, Reale |
| `Objetos.Recibo.DatosPoliza.NumeroSuplemento` | Occident, Reale |
| `Objetos.Recibo.DatosRecibo.ClaseRecibo` | Allianz, Mapfre, Occident, Reale |
| `Objetos.Recibo.DatosRecibo.DatosComisiones.Comision.Base` | Allianz |
| `Objetos.Recibo.DatosRecibo.DatosComisiones.Comision.ClaseComision` | Allianz, Mapfre, Occident, Reale |
| `Objetos.Recibo.DatosRecibo.DatosComisiones.Comision.ComisionBruta` | Allianz, Mapfre, Occident, Reale |
| `Objetos.Recibo.DatosRecibo.DatosComisiones.Comision.ComisionLiquida` | Allianz, Occident |
| `Objetos.Recibo.DatosRecibo.DatosComisiones.Comision.NumeroOrden` | Allianz, Mapfre, Occident |
| `Objetos.Recibo.DatosRecibo.DatosComisiones.Comision.RetencionIRPF` | Allianz |
| `Objetos.Recibo.DatosRecibo.DatosImportes.Importes.DatosCargos.Cargo.ClaseCargo` | Allianz, Mapfre, Occident, Reale |
| `Objetos.Recibo.DatosRecibo.DatosImportes.Importes.DatosCargos.Cargo.DescripcionCargo` | Allianz, Mapfre, Occident, Reale |
| `Objetos.Recibo.DatosRecibo.DatosImportes.Importes.DatosCargos.Cargo.Importe` | Allianz, Mapfre, Occident, Reale |
| `Objetos.Recibo.DatosRecibo.DatosImportes.Importes.DatosCargos.Cargo.NumeroOrden` | Allianz, Mapfre, Occident |
| `Objetos.Recibo.DatosRecibo.DatosImportes.Importes.DatosMoneda.FechaCambio` | Mapfre |
| `Objetos.Recibo.DatosRecibo.DatosImportes.Importes.DatosMoneda.Moneda` | Mapfre |
| `Objetos.Recibo.DatosRecibo.DatosImportes.Importes.DatosMoneda.TipoCambio` | Mapfre |
| `Objetos.Recibo.DatosRecibo.DatosImportes.Importes.OtrosImportes.Importe.ClaseOtroImporte` | Reale |
| `Objetos.Recibo.DatosRecibo.DatosImportes.Importes.OtrosImportes.Importe.DescripcionOtroImporte` | Reale |
| `Objetos.Recibo.DatosRecibo.DatosImportes.Importes.OtrosImportes.Importe.Importe` | Reale |
| `Objetos.Recibo.DatosRecibo.DatosImportes.Importes.PrimaNeta` | Allianz, Mapfre, Occident, Reale |
| `Objetos.Recibo.DatosRecibo.DatosImportes.Importes.PrimaTotal` | Allianz, Mapfre, Occident, Reale |
| `Objetos.Recibo.DatosRecibo.DatosImportes.ImportesDEC.CapitalAseguradoAgregado` | Allianz |
| `Objetos.Recibo.DatosRecibo.DatosImportes.ImportesDEC.ComisionAnualizada` | Allianz |
| `Objetos.Recibo.DatosRecibo.DatosImportes.ImportesDEC.PrimaNetaAnualizada` | Allianz |
| `Objetos.Recibo.DatosRecibo.DatosImportes.ImportesDEC.PrimaTotalAnualizada` | Allianz |
| `Objetos.Recibo.DatosRecibo.Fechas.FechaEfectoActual` | Allianz, Mapfre, Occident, Reale |
| `Objetos.Recibo.DatosRecibo.Fechas.FechaEfectoInicial` | Allianz, Mapfre, Occident, Reale |
| `Objetos.Recibo.DatosRecibo.Fechas.FechaEmision` | Allianz, Mapfre, Occident, Reale |
| `Objetos.Recibo.DatosRecibo.Fechas.FechaFinSeguro` | Occident |
| `Objetos.Recibo.DatosRecibo.Fechas.FechaSituacion` | Allianz, Mapfre, Occident, Reale |
| `Objetos.Recibo.DatosRecibo.Fechas.FechaVencimiento` | Allianz, Mapfre, Occident, Reale |
| `Objetos.Recibo.DatosRecibo.GestionCobro.ClaseGestion` | Allianz, Mapfre, Occident, Reale |
| `Objetos.Recibo.DatosRecibo.GestionCobro.DatosFormaPago.ClaseFormaPago` | Allianz, Mapfre, Occident, Reale |
| `Objetos.Recibo.DatosRecibo.GestionCobro.DatosFormaPago.DatosCuentaCorriente.IBAN` | Allianz, Mapfre, Occident, Reale |
| `Objetos.Recibo.DatosRecibo.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaFisica.Apellido1` | Occident |
| `Objetos.Recibo.DatosRecibo.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaFisica.Apellido2` | Occident |
| `Objetos.Recibo.DatosRecibo.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaFisica.DatosContacto.Emails.Email.Clase` | Occident |
| `Objetos.Recibo.DatosRecibo.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaFisica.DatosContacto.Emails.Email.Direccion` | Occident |
| `Objetos.Recibo.DatosRecibo.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaFisica.DatosContacto.Telefonos.Telefono.Clase` | Occident |
| `Objetos.Recibo.DatosRecibo.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaFisica.DatosContacto.Telefonos.Telefono.Numero` | Occident |
| `Objetos.Recibo.DatosRecibo.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaFisica.Domicilio.CodigoPostal` | Occident |
| `Objetos.Recibo.DatosRecibo.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaFisica.Domicilio.NombreVia` | Occident |
| `Objetos.Recibo.DatosRecibo.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaFisica.Domicilio.OtrosDatosVia` | Occident |
| `Objetos.Recibo.DatosRecibo.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaFisica.Domicilio.Pais` | Occident |
| `Objetos.Recibo.DatosRecibo.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaFisica.Domicilio.Poblacion` | Occident |
| `Objetos.Recibo.DatosRecibo.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaFisica.Domicilio.Provincia` | Occident |
| `Objetos.Recibo.DatosRecibo.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaFisica.FechaNacimiento` | Occident |
| `Objetos.Recibo.DatosRecibo.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaFisica.IdPersona` | Occident |
| `Objetos.Recibo.DatosRecibo.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaFisica.Idioma` | Occident |
| `Objetos.Recibo.DatosRecibo.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaFisica.Nombre` | Occident |
| `Objetos.Recibo.DatosRecibo.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaFisica.Sexo` | Occident |
| `Objetos.Recibo.DatosRecibo.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular.PersonaFisica.TipoIdentificacion` | Occident |
| `Objetos.Recibo.DatosRecibo.IdRecibo` | Allianz, Mapfre, Occident, Reale |
| `Objetos.Recibo.DatosRecibo.IdRemesa` | Occident |
| `Objetos.Recibo.DatosRecibo.MovimientosRecibo.Movimiento.Anulacion.DescripcionMotivo` | Allianz, Mapfre, Occident |
| `Objetos.Recibo.DatosRecibo.MovimientosRecibo.Movimiento.Anulacion.MotivoAnulacion` | Allianz, Mapfre, Occident |
| `Objetos.Recibo.DatosRecibo.MovimientosRecibo.Movimiento.Anulacion.ReferenciaAnulacion` | Allianz |
| `Objetos.Recibo.DatosRecibo.MovimientosRecibo.Movimiento.ClaseMovimiento` | Allianz, Mapfre, Occident, Reale |
| `Objetos.Recibo.DatosRecibo.MovimientosRecibo.Movimiento.FechaMovimiento` | Allianz, Mapfre, Occident, Reale |
| `Objetos.Recibo.DatosRecibo.MovimientosRecibo.Movimiento.NumeroOrden` | Allianz, Mapfre, Occident, Reale |
| `Objetos.Recibo.DatosRecibo.OtrosDatos.Dato.DescripcionDato` | Allianz, Mapfre |
| `Objetos.Recibo.DatosRecibo.OtrosDatos.Dato.IdDato` | Allianz, Mapfre |
| `Objetos.Recibo.DatosRecibo.OtrosDatos.Dato.IdSubdato` | Allianz, Mapfre |
| `Objetos.Recibo.DatosRecibo.OtrosDatos.Dato.NumeroOrden` | Allianz, Mapfre |
| `Objetos.Recibo.DatosRecibo.OtrosDatos.Dato.ValorSubdato` | Allianz, Mapfre |
| `Objetos.Recibo.DatosRecibo.SituacionRecibo` | Allianz, Mapfre, Occident, Reale |

## SIN — 275 campos

| Campo (ruta sin la raíz) | Compañías |
|---|---|
| `Cabecera.DatosLote.IdLote` | Allianz, Generali, Mapfre, Occident |
| `Cabecera.DatosLote.NumeroFicheros` | Allianz, Mapfre, Occident |
| `Cabecera.DatosLote.SecuenciaFichero` | Allianz, Mapfre, Occident |
| `Cabecera.DatosProcesos.CodigoProceso` | Allianz, Generali, Mapfre, Occident |
| `Cabecera.Emisor.CodigoDGS` | Allianz, Generali, Mapfre, Occident |
| `Cabecera.Emisor.CodigoInterno` | Allianz, Generali, Mapfre, Occident |
| `Cabecera.FechaCreacion` | Allianz, Generali, Mapfre, Occident |
| `Cabecera.Receptor.CodigoDGS` | Allianz, Generali, Mapfre, Occident |
| `Cabecera.Receptor.CodigoInterno` | Allianz, Generali, Mapfre, Occident |
| `Cabecera.Version` | Allianz, Generali, Mapfre, Occident |
| `Objetos.Siniestro.DatosPoliza.CodigoEntidad.CodigoDGS` | Allianz, Generali, Mapfre, Occident |
| `Objetos.Siniestro.DatosPoliza.CodigoEntidad.CodigoInterno` | Allianz, Generali, Mapfre, Occident |
| `Objetos.Siniestro.DatosPoliza.DatosMediador.ClaseMediador` | Allianz, Mapfre, Occident |
| `Objetos.Siniestro.DatosPoliza.DatosMediador.IdMediador.CodigoDGS` | Allianz, Generali, Mapfre, Occident |
| `Objetos.Siniestro.DatosPoliza.DatosMediador.IdMediador.CodigoInterno` | Allianz, Generali, Mapfre, Occident |
| `Objetos.Siniestro.DatosPoliza.DatosMediador.NombreMediador` | Allianz, Mapfre, Occident |
| `Objetos.Siniestro.DatosPoliza.DatosRamo.DescripcionModalidad` | Mapfre, Occident |
| `Objetos.Siniestro.DatosPoliza.DatosRamo.DescripcionRamo` | Allianz, Generali, Mapfre, Occident |
| `Objetos.Siniestro.DatosPoliza.DatosRamo.ModalidadRamo` | Mapfre, Occident |
| `Objetos.Siniestro.DatosPoliza.DatosRamo.RamoDGS` | Allianz, Generali, Mapfre, Occident |
| `Objetos.Siniestro.DatosPoliza.DatosRamo.RamoEntidad` | Allianz, Generali, Mapfre, Occident |
| `Objetos.Siniestro.DatosPoliza.IdAplicacion` | Allianz, Generali |
| `Objetos.Siniestro.DatosPoliza.IdPoliza` | Allianz, Generali, Mapfre, Occident |
| `Objetos.Siniestro.DatosPoliza.IdSolicitudMediador` | Mapfre, Occident |
| `Objetos.Siniestro.DatosPoliza.NumeroSuplemento` | Allianz, Mapfre, Occident |
| `Objetos.Siniestro.DatosSiniestro.AccionesSiniestro.Accion.AccionSiniestro` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.AccionesSiniestro.Accion.ClaseIdAccion` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.AccionesSiniestro.Accion.DescripcionAccion` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.AccionesSiniestro.Accion.FechaAccion` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.AccionesSiniestro.Accion.FigurasAccion.FiguraAccion.ClaseFigura` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.AccionesSiniestro.Accion.FigurasAccion.FiguraAccion.DatosFigura.PersonaFisica.Apellido1` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.AccionesSiniestro.Accion.FigurasAccion.FiguraAccion.DatosFigura.PersonaFisica.Apellido2` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.AccionesSiniestro.Accion.FigurasAccion.FiguraAccion.DatosFigura.PersonaFisica.IdPersona` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.AccionesSiniestro.Accion.FigurasAccion.FiguraAccion.DatosFigura.PersonaFisica.Nombre` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.AccionesSiniestro.Accion.FigurasAccion.FiguraAccion.DatosFigura.PersonaFisica.Sexo` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.AccionesSiniestro.Accion.FigurasAccion.FiguraAccion.DatosFigura.PersonaFisica.TipoIdentificacion` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.AccionesSiniestro.Accion.FigurasAccion.FiguraAccion.DatosFigura.PersonaJuridica.IdPersona` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.AccionesSiniestro.Accion.FigurasAccion.FiguraAccion.DatosFigura.PersonaJuridica.RazonSocial` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.AccionesSiniestro.Accion.FigurasAccion.FiguraAccion.DatosFigura.PersonaJuridica.TipoIdentificacion` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.AccionesSiniestro.Accion.FigurasAccion.FiguraAccion.NumeroOrden` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.AccionesSiniestro.Accion.IdAccion` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.AccionesSiniestro.Accion.NumeroOrden` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.AccionesSiniestro.Accion.SituacionAccion` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.Asistencias.Asistencia.Asistente.ClaseFigura` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.Asistencias.Asistencia.Asistente.DatosFigura.PersonaFisica.Apellido1` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.Asistencias.Asistencia.Asistente.DatosFigura.PersonaFisica.Apellido2` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.Asistencias.Asistencia.Asistente.DatosFigura.PersonaFisica.DatosContacto.Telefonos.Telefono.Clase` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.Asistencias.Asistencia.Asistente.DatosFigura.PersonaFisica.DatosContacto.Telefonos.Telefono.Numero` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.Asistencias.Asistencia.Asistente.DatosFigura.PersonaFisica.Domicilio.ClaseVia` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.Asistencias.Asistencia.Asistente.DatosFigura.PersonaFisica.Domicilio.CodigoPostal` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.Asistencias.Asistencia.Asistente.DatosFigura.PersonaFisica.Domicilio.NombreVia` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.Asistencias.Asistencia.Asistente.DatosFigura.PersonaFisica.Domicilio.OtrosDatosVia` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.Asistencias.Asistencia.Asistente.DatosFigura.PersonaFisica.Domicilio.Pais` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.Asistencias.Asistencia.Asistente.DatosFigura.PersonaFisica.Domicilio.Poblacion` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.Asistencias.Asistencia.Asistente.DatosFigura.PersonaFisica.Domicilio.Provincia` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.Asistencias.Asistencia.Asistente.DatosFigura.PersonaFisica.FechaNacimiento` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.Asistencias.Asistencia.Asistente.DatosFigura.PersonaFisica.IdCliente` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.Asistencias.Asistencia.Asistente.DatosFigura.PersonaFisica.IdPersona` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.Asistencias.Asistencia.Asistente.DatosFigura.PersonaFisica.Idioma` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.Asistencias.Asistencia.Asistente.DatosFigura.PersonaFisica.Nombre` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.Asistencias.Asistencia.Asistente.DatosFigura.PersonaFisica.Sexo` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.Asistencias.Asistencia.Asistente.DatosFigura.PersonaFisica.TipoIdentificacion` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.Asistencias.Asistencia.Asistente.DatosFigura.PersonaJuridica.DatosContacto.Telefonos.Telefono.Clase` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.Asistencias.Asistencia.Asistente.DatosFigura.PersonaJuridica.DatosContacto.Telefonos.Telefono.Numero` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.Asistencias.Asistencia.Asistente.DatosFigura.PersonaJuridica.Domicilio.ClaseVia` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.Asistencias.Asistencia.Asistente.DatosFigura.PersonaJuridica.Domicilio.CodigoPostal` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.Asistencias.Asistencia.Asistente.DatosFigura.PersonaJuridica.Domicilio.NombreVia` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.Asistencias.Asistencia.Asistente.DatosFigura.PersonaJuridica.Domicilio.OtrosDatosVia` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.Asistencias.Asistencia.Asistente.DatosFigura.PersonaJuridica.Domicilio.Pais` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.Asistencias.Asistencia.Asistente.DatosFigura.PersonaJuridica.Domicilio.Poblacion` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.Asistencias.Asistencia.Asistente.DatosFigura.PersonaJuridica.Domicilio.Provincia` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.Asistencias.Asistencia.Asistente.DatosFigura.PersonaJuridica.IdCliente` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.Asistencias.Asistencia.Asistente.DatosFigura.PersonaJuridica.IdPersona` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.Asistencias.Asistencia.Asistente.DatosFigura.PersonaJuridica.RazonSocial` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.Asistencias.Asistencia.Asistente.DatosFigura.PersonaJuridica.TipoIdentificacion` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.Asistencias.Asistencia.Asistente.NumeroOrden` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.Asistencias.Asistencia.Descripcion` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.IdRiesgo` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoAutos.Conductor.Apellido1` | Allianz, Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoAutos.Conductor.Apellido2` | Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoAutos.Conductor.DatosContacto.Telefonos.Telefono.Clase` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoAutos.Conductor.DatosContacto.Telefonos.Telefono.Numero` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoAutos.Conductor.Domicilio.ClaseVia` | Allianz, Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoAutos.Conductor.Domicilio.CodigoPostal` | Allianz, Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoAutos.Conductor.Domicilio.NombreVia` | Allianz, Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoAutos.Conductor.Domicilio.OtrosDatosVia` | Allianz, Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoAutos.Conductor.Domicilio.Pais` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoAutos.Conductor.Domicilio.Poblacion` | Allianz, Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoAutos.Conductor.Domicilio.Provincia` | Allianz, Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoAutos.Conductor.EstadoCivil` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoAutos.Conductor.FechaNacimiento` | Allianz, Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoAutos.Conductor.IdCliente` | Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoAutos.Conductor.IdPersona` | Allianz, Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoAutos.Conductor.Idioma` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoAutos.Conductor.Nombre` | Allianz, Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoAutos.Conductor.Sexo` | Allianz, Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoAutos.Conductor.TipoIdentificacion` | Allianz, Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoAutos.DanosSiniestro.DanoSiniestro.DescripcionDano` | Generali |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoAutos.DanosSiniestro.DanoSiniestro.NumeroOrden` | Generali |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoAutos.DanosSiniestro.DanoSiniestro.ValorDano` | Generali |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoAutos.Vehiculo.Antiguedad` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoAutos.Vehiculo.BaseSIETe` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoAutos.Vehiculo.Bastidor` | Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoAutos.Vehiculo.CategoriaVehiculo` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoAutos.Vehiculo.Cilindrada` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoAutos.Vehiculo.ClaseVehiculo` | Allianz, Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoAutos.Vehiculo.Color` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoAutos.Vehiculo.Combustible` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoAutos.Vehiculo.FechaMatriculacion` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoAutos.Vehiculo.Marca` | Allianz, Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoAutos.Vehiculo.Matricula` | Allianz, Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoAutos.Vehiculo.Modelo` | Allianz, Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoAutos.Vehiculo.PMA` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoAutos.Vehiculo.Plazas` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoAutos.Vehiculo.Potencia` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoAutos.Vehiculo.Remolque` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoAutos.Vehiculo.UsoVehiculo` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoAutos.Vehiculo.Valor` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoAutos.Vehiculo.Version` | Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoDiversos.DanosSiniestro.DanoSiniestro.DescripcionDano` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoDiversos.DanosSiniestro.DanoSiniestro.NumeroOrden` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoDiversos.DanosSiniestro.DanoSiniestro.ValorDano` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoDiversos.Descripcion` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoDiversos.Domicilio.ClaseVia` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoDiversos.Domicilio.CodigoPostal` | Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoDiversos.Domicilio.NombreVia` | Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoDiversos.Domicilio.OtrosDatosVia` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoDiversos.Domicilio.Pais` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoDiversos.Domicilio.Poblacion` | Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.ImplicadoDiversos.Domicilio.Provincia` | Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.Lesionados.Numero` | Allianz, Generali |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.PersonaContacto.Observaciones` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.PersonaContacto.Persona.Apellido1` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.PersonaContacto.Persona.Apellido2` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.PersonaContacto.Persona.DatosContacto.Telefonos.Telefono.Clase` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.PersonaContacto.Persona.DatosContacto.Telefonos.Telefono.Numero` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.PersonaContacto.Persona.Domicilio.ClaseVia` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.PersonaContacto.Persona.Domicilio.CodigoPostal` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.PersonaContacto.Persona.Domicilio.NombreVia` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.PersonaContacto.Persona.Domicilio.OtrosDatosVia` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.PersonaContacto.Persona.Domicilio.Pais` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.PersonaContacto.Persona.Domicilio.Poblacion` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.PersonaContacto.Persona.Domicilio.Provincia` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.PersonaContacto.Persona.IdCliente` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.PersonaContacto.Persona.IdPersona` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.PersonaContacto.Persona.Idioma` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.PersonaContacto.Persona.Nombre` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.PersonaContacto.Persona.Sexo` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.PersonaContacto.Persona.TipoIdentificacion` | Occident |
| `Objetos.Siniestro.DatosSiniestro.Asegurado.Responsabilidad` | Allianz, Generali, Mapfre, Occident |
| `Objetos.Siniestro.DatosSiniestro.Contrarios.Contrario.DatosPoliza.CodigoEntidad.CodigoDGS` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.Contrarios.Contrario.DatosPoliza.CodigoEntidad.CodigoInterno` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.Contrarios.Contrario.DatosPoliza.IdPoliza` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.Contrarios.Contrario.DatosPoliza.NombreEntidad` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.Contrarios.Contrario.ImplicadoDiversos.DanosSiniestro.DanoSiniestro.DescripcionDano` | Generali |
| `Objetos.Siniestro.DatosSiniestro.Contrarios.Contrario.ImplicadoDiversos.DanosSiniestro.DanoSiniestro.ValorDano` | Generali |
| `Objetos.Siniestro.DatosSiniestro.Contrarios.Contrario.ImplicadoDiversos.Domicilio.CodigoPostal` | Generali |
| `Objetos.Siniestro.DatosSiniestro.Contrarios.Contrario.ImplicadoDiversos.Domicilio.NombreVia` | Generali |
| `Objetos.Siniestro.DatosSiniestro.Contrarios.Contrario.ImplicadoDiversos.Domicilio.Poblacion` | Generali |
| `Objetos.Siniestro.DatosSiniestro.Contrarios.Contrario.ImplicadoDiversos.Domicilio.Provincia` | Generali |
| `Objetos.Siniestro.DatosSiniestro.Contrarios.Contrario.Lesionados.Numero` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.Contrarios.Contrario.PersonaContacto.Persona.Apellido1` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.Contrarios.Contrario.PersonaContacto.Persona.DatosContacto.Telefonos.Telefono.Numero` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.Contrarios.Contrario.PersonaContacto.Persona.IdPersona` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.Contrarios.Contrario.PersonaContacto.Persona.Nombre` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.Contrarios.Contrario.PersonaContacto.Persona.Sexo` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.Contrarios.Contrario.PersonaContacto.Persona.TipoIdentificacion` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.Contrarios.Contrario.Responsabilidad` | Allianz, Generali |
| `Objetos.Siniestro.DatosSiniestro.Convenios.Convenio.ConvenioSiniestro` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.Convenios.Convenio.NumeroOrden` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.DAA` | Allianz, Occident |
| `Objetos.Siniestro.DatosSiniestro.DatosMoneda.FechaCambio` | Mapfre |
| `Objetos.Siniestro.DatosSiniestro.DatosMoneda.Moneda` | Mapfre |
| `Objetos.Siniestro.DatosSiniestro.DatosMoneda.TipoCambio` | Mapfre |
| `Objetos.Siniestro.DatosSiniestro.DescripcionReserva` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.DescripcionSiniestro` | Allianz, Generali, Mapfre, Occident |
| `Objetos.Siniestro.DatosSiniestro.Expedientes.Expediente.ClaseExpediente` | Mapfre |
| `Objetos.Siniestro.DatosSiniestro.Expedientes.Expediente.Cobertura.Cobertura.CapitalAsegurado` | Mapfre |
| `Objetos.Siniestro.DatosSiniestro.Expedientes.Expediente.Cobertura.Cobertura.DescripcionCobertura` | Mapfre |
| `Objetos.Siniestro.DatosSiniestro.Expedientes.Expediente.Cobertura.Cobertura.FechaFin` | Mapfre |
| `Objetos.Siniestro.DatosSiniestro.Expedientes.Expediente.Cobertura.Cobertura.FechaInicio` | Mapfre |
| `Objetos.Siniestro.DatosSiniestro.Expedientes.Expediente.Cobertura.Cobertura.IdCobertura` | Mapfre |
| `Objetos.Siniestro.DatosSiniestro.Expedientes.Expediente.Cobertura.Cobertura.NumeroOrden` | Mapfre |
| `Objetos.Siniestro.DatosSiniestro.Expedientes.Expediente.EstadoExpediente` | Mapfre |
| `Objetos.Siniestro.DatosSiniestro.Expedientes.Expediente.FechaFin` | Mapfre |
| `Objetos.Siniestro.DatosSiniestro.Expedientes.Expediente.FechaInicio` | Mapfre |
| `Objetos.Siniestro.DatosSiniestro.Expedientes.Expediente.ImporteReserva` | Mapfre |
| `Objetos.Siniestro.DatosSiniestro.Expedientes.Expediente.NumeroExpediente` | Mapfre |
| `Objetos.Siniestro.DatosSiniestro.Expedientes.Expediente.NumeroOrden` | Mapfre |
| `Objetos.Siniestro.DatosSiniestro.Expedientes.Expediente.TotalPagos` | Mapfre |
| `Objetos.Siniestro.DatosSiniestro.Expedientes.Expediente.TotalRecobros` | Mapfre |
| `Objetos.Siniestro.DatosSiniestro.FechaDeclaracion` | Allianz, Generali, Mapfre, Occident |
| `Objetos.Siniestro.DatosSiniestro.FechaOcurrencia` | Allianz, Generali, Mapfre, Occident |
| `Objetos.Siniestro.DatosSiniestro.FigurasSiniestro.Figura.ClaseFigura` | Allianz, Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.FigurasSiniestro.Figura.DatosFigura.PersonaFisica.Apellido1` | Allianz, Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.FigurasSiniestro.Figura.DatosFigura.PersonaFisica.Apellido2` | Allianz, Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.FigurasSiniestro.Figura.DatosFigura.PersonaFisica.Domicilio.ClaseVia` | Allianz, Generali |
| `Objetos.Siniestro.DatosSiniestro.FigurasSiniestro.Figura.DatosFigura.PersonaFisica.Domicilio.CodigoPostal` | Allianz, Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.FigurasSiniestro.Figura.DatosFigura.PersonaFisica.Domicilio.NombreVia` | Allianz, Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.FigurasSiniestro.Figura.DatosFigura.PersonaFisica.Domicilio.OtrosDatosVia` | Allianz, Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.FigurasSiniestro.Figura.DatosFigura.PersonaFisica.Domicilio.Pais` | Allianz, Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.FigurasSiniestro.Figura.DatosFigura.PersonaFisica.Domicilio.Poblacion` | Allianz, Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.FigurasSiniestro.Figura.DatosFigura.PersonaFisica.Domicilio.Provincia` | Allianz, Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.FigurasSiniestro.Figura.DatosFigura.PersonaFisica.EstadoCivil` | Allianz, Occident |
| `Objetos.Siniestro.DatosSiniestro.FigurasSiniestro.Figura.DatosFigura.PersonaFisica.FechaNacimiento` | Allianz, Occident |
| `Objetos.Siniestro.DatosSiniestro.FigurasSiniestro.Figura.DatosFigura.PersonaFisica.IdCliente` | Allianz, Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.FigurasSiniestro.Figura.DatosFigura.PersonaFisica.IdPersona` | Allianz, Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.FigurasSiniestro.Figura.DatosFigura.PersonaFisica.Idioma` | Allianz, Occident |
| `Objetos.Siniestro.DatosSiniestro.FigurasSiniestro.Figura.DatosFigura.PersonaFisica.Nombre` | Allianz, Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.FigurasSiniestro.Figura.DatosFigura.PersonaFisica.Sexo` | Allianz, Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.FigurasSiniestro.Figura.DatosFigura.PersonaFisica.TipoIdentificacion` | Allianz, Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.FigurasSiniestro.Figura.DatosFigura.PersonaJuridica.Domicilio.ClaseVia` | Allianz, Generali |
| `Objetos.Siniestro.DatosSiniestro.FigurasSiniestro.Figura.DatosFigura.PersonaJuridica.Domicilio.CodigoPostal` | Allianz, Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.FigurasSiniestro.Figura.DatosFigura.PersonaJuridica.Domicilio.NombreVia` | Allianz, Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.FigurasSiniestro.Figura.DatosFigura.PersonaJuridica.Domicilio.OtrosDatosVia` | Allianz, Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.FigurasSiniestro.Figura.DatosFigura.PersonaJuridica.Domicilio.Pais` | Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.FigurasSiniestro.Figura.DatosFigura.PersonaJuridica.Domicilio.Poblacion` | Allianz, Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.FigurasSiniestro.Figura.DatosFigura.PersonaJuridica.Domicilio.Provincia` | Allianz, Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.FigurasSiniestro.Figura.DatosFigura.PersonaJuridica.IdCliente` | Allianz, Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.FigurasSiniestro.Figura.DatosFigura.PersonaJuridica.IdPersona` | Allianz, Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.FigurasSiniestro.Figura.DatosFigura.PersonaJuridica.Idioma` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.FigurasSiniestro.Figura.DatosFigura.PersonaJuridica.RazonSocial` | Allianz, Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.FigurasSiniestro.Figura.DatosFigura.PersonaJuridica.TipoIdentificacion` | Allianz, Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.FigurasSiniestro.Figura.NumeroOrden` | Allianz, Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.IdSiniestroEntidad` | Allianz, Generali, Mapfre, Occident |
| `Objetos.Siniestro.DatosSiniestro.IdSiniestroMediador` | Mapfre |
| `Objetos.Siniestro.DatosSiniestro.ImporteIndemnizacion` | Allianz, Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.ImporteReserva` | Allianz, Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.LugarSiniestro.CodigoPostal` | Allianz, Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.LugarSiniestro.NombreVia` | Allianz, Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.LugarSiniestro.Pais` | Allianz, Occident |
| `Objetos.Siniestro.DatosSiniestro.LugarSiniestro.Poblacion` | Allianz, Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.LugarSiniestro.Provincia` | Allianz, Generali, Occident |
| `Objetos.Siniestro.DatosSiniestro.OtrosDatos.Dato.DescripcionDato` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.OtrosDatos.Dato.IdDato` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.OtrosDatos.Dato.IdSubdato` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.OtrosDatos.Dato.NumeroOrden` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.OtrosDatos.Dato.ValorSubdato` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.PagosSiniestro.PagoSiniestro.CoberturasIndemnizadas.Cobertura.DescripcionCobertura` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.PagosSiniestro.PagoSiniestro.CoberturasIndemnizadas.Cobertura.IdCobertura` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.PagosSiniestro.PagoSiniestro.CoberturasIndemnizadas.Cobertura.ModalidadValoracion` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.PagosSiniestro.PagoSiniestro.CoberturasIndemnizadas.Cobertura.NumeroOrden` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.PagosSiniestro.PagoSiniestro.DescripcionPago` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.PagosSiniestro.PagoSiniestro.FechaLiquidacion` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.PagosSiniestro.PagoSiniestro.FechaPago` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.PagosSiniestro.PagoSiniestro.FormaPago.ClaseFormaPago` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.PagosSiniestro.PagoSiniestro.FormaPago.DatosCuentaCorriente.IBAN` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.PagosSiniestro.PagoSiniestro.ImportePago` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.PagosSiniestro.PagoSiniestro.NumeroOrden` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.PagosSiniestro.PagoSiniestro.ReceptoresPago.Figura.ClaseFigura` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.PagosSiniestro.PagoSiniestro.ReceptoresPago.Figura.DatosFigura.PersonaJuridica.IdPersona` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.PagosSiniestro.PagoSiniestro.ReceptoresPago.Figura.DatosFigura.PersonaJuridica.RazonSocial` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.PagosSiniestro.PagoSiniestro.ReceptoresPago.Figura.DatosFigura.PersonaJuridica.TipoIdentificacion` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.PagosSiniestro.PagoSiniestro.ReceptoresPago.Figura.NumeroOrden` | Allianz |
| `Objetos.Siniestro.DatosSiniestro.PosicionSiniestro` | Allianz, Generali, Mapfre, Occident |
| `Objetos.Siniestro.DatosSiniestro.RiesgosSiniestro.RiesgoRecSin.DatosCoberturas.Cobertura.CapitalAsegurado` | Occident |
| `Objetos.Siniestro.DatosSiniestro.RiesgosSiniestro.RiesgoRecSin.DatosCoberturas.Cobertura.DatosImportes.PrimaNeta` | Occident |
| `Objetos.Siniestro.DatosSiniestro.RiesgosSiniestro.RiesgoRecSin.DatosCoberturas.Cobertura.DatosImportes.PrimaTotal` | Occident |
| `Objetos.Siniestro.DatosSiniestro.RiesgosSiniestro.RiesgoRecSin.DatosCoberturas.Cobertura.DescripcionCapitalAsegurado` | Occident |
| `Objetos.Siniestro.DatosSiniestro.RiesgosSiniestro.RiesgoRecSin.DatosCoberturas.Cobertura.DescripcionCobertura` | Occident |
| `Objetos.Siniestro.DatosSiniestro.RiesgosSiniestro.RiesgoRecSin.DatosCoberturas.Cobertura.FechaInicio` | Occident |
| `Objetos.Siniestro.DatosSiniestro.RiesgosSiniestro.RiesgoRecSin.DatosCoberturas.Cobertura.IdCobertura` | Occident |
| `Objetos.Siniestro.DatosSiniestro.RiesgosSiniestro.RiesgoRecSin.DatosCoberturas.Cobertura.NumeroOrden` | Occident |
| `Objetos.Siniestro.DatosSiniestro.RiesgosSiniestro.RiesgoRecSin.DescripcionRiesgo` | Allianz, Mapfre, Occident |
| `Objetos.Siniestro.DatosSiniestro.RiesgosSiniestro.RiesgoRecSin.IdAgrupacion` | Occident |
| `Objetos.Siniestro.DatosSiniestro.RiesgosSiniestro.RiesgoRecSin.IdCentroFacturacion` | Occident |
| `Objetos.Siniestro.DatosSiniestro.RiesgosSiniestro.RiesgoRecSin.IdRiesgo` | Mapfre, Occident |
| `Objetos.Siniestro.DatosSiniestro.RiesgosSiniestro.RiesgoRecSin.NumeroOrden` | Mapfre, Occident |
| `Objetos.Siniestro.DatosSiniestro.SituacionesSiniestro.Situacion.DescripcionSituacion` | Allianz, Occident |
| `Objetos.Siniestro.DatosSiniestro.SituacionesSiniestro.Situacion.FechaSituacion` | Allianz, Generali, Mapfre, Occident |
| `Objetos.Siniestro.DatosSiniestro.SituacionesSiniestro.Situacion.NumeroOrden` | Allianz, Occident |
| `Objetos.Siniestro.DatosSiniestro.SituacionesSiniestro.Situacion.SituacionSiniestro` | Allianz, Generali, Mapfre, Occident |
| `Objetos.Siniestro.DatosSiniestro.TipologiaSiniestro` | Allianz, Generali, Mapfre, Occident |
| `Objetos.Siniestro.DatosSiniestro.TotalPagos` | Allianz, Occident |
| `Objetos.Siniestro.DatosSiniestro.TotalRecobros` | Occident |
