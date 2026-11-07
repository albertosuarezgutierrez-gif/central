# EIAC V07.1 — Claves comunes (procesos, ramo, póliza, recibo, personas, pagos, coberturas, colectivas, liquidación...)

> Fuente: `209_IAC_ESP_DOC_DOCS-ESTANDAR-EIAC-V07-1_V05` (TIREA, 03/06/2026), apartado **10.2 Claves**. Transcripción literal: código -> descripción, sin interpretar. El § es el que figura en la columna «Clave» del PDF (numeración interna `13.x`).
> Cada tabla es el tipo `claves_*` del XSD con el mismo nombre. Buscar: `grep -n 'claves_formapago' docs/cima/eiac-claves*.md`. Índice de todas las tablas en `README.md`.

## claves_codigoproceso  (§13.1.1)

| Código | Descripción |
|---|---|
| 131 | Información de Pólizas de Nueva Producción |
| 132 | Información de Pólizas de Cartera |
| 133 | Información de Suplementos de Póliza |
| 134 | Precartera de pólizas colectivas |
| 151 | Información de Anulaciones de Póliza |
| 199 | Carga Masiva de Pólizas, Suplementos y Anulaciones |
| 211 | Emisión de Recibos Nueva Producción |
| 212 | Emisión de Recibos Cartera |
| 213 | Emisión de Recibos de Suplemento |
| 214 | Precartera de recibos |
| 251 | Emisión de Recibos Extornos |
| 261 | Movimientos de Recibo |
| 269 | Carga Masiva de Movimientos de Recibo |
| 299 | Carga Masiva de Recibos |
| 271 | Rechazo movimientos de Recibo |
| 771 | Rechazo de Emisión de Recibos Nueva Producción |
| 772 | Rechazo de Emisión de Recibos Cartera |
| 773 | Rechazo de Emisión de Recibos de Suplemento |
| 774 | Rechazo de Emisión de Recibos Extornos de anulación de póliza |
| 761 | Movimientos de Recibo |
| 775 | Rechazo movimientos de Recibo |
| 311 | Declaración de nuevos siniestros |
| 361 | Movimientos y pagos de siniestro |
| 399 | Carga masiva de siniestros |
| 371 | Rechazo de alta nuevos siniestros |
| 372 | Rechazo movimientos y pagos de siniestro |
| 841 | Solicitud alta nuevos siniestros |
| 861 | Movimientos y pagos de siniestro |
| 500 | Liquidación de cuenta de efectivo |
| 501 | Liquidación de cuenta de efectivo |
| 502 | Emisión de cuenta de efectivo |
| 601 | Envío de mensaje |

## claves_ramo  (§13.2)

| Código | Descripción |
|---|---|
| 111 | Vida individual |
| 121 | Vida colectivo |
| 211 | Accidentes |
| 221 | Enfermedad |
| 231 | Asistencia sanitaria |
| 241 | Autos |
| 251 | Transportes |
| 261 | Incendios y elementos naturales |
| 271 | Otros daños a los bienes: seguros agrarios combinados |
| 272 | Otros daños a los bienes: robo u otros |
| 273 | Otros daños a los bienes: total otros daños |
| 281 | Responsabilidad civil en general: riesgos nucleares |
| 282 | Responsabilidad civil en general: otros riesgos |
| 291 | Crédito |
| 2101 | Caución |
| 2111 | Pérdidas diversas |
| 2121 | Defensa jurídica |
| 2131 | Asistencia |
| 2141 | Decesos |
| 2151 | Multirriesgo hogar |
| 2161 | Multirriesgo comunidades |
| 2171 | Multirriesgo comercios |
| 2181 | Multirriesgo industriales |
| 2191 | Otros multirriesgos |

## claves_anulacionpoliza  (§13.3.1)

| Código | Descripción |
|---|---|
| AC | Acuerdo anulación |
| ER | Error |
| EX | Extinción Riesgo |
| FA | Falta Documentación |
| IM | Impago |
| MN | Motivo No disponible |
| RE | Reclamación |
| RP | Reemplazo |
| SI | Siniestralidad |
| TR | Traspaso |
| NI | Ninguno de los anteriores |

## claves_anulacionrecibo  (§13.3.2)

| Código | Descripción |
|---|---|
| CA | Cambio vencimiento |
| EX | Extinción del riesgo |
| FA | Falta de pago |
| PE | Petición cliente |
| PA | Póliza anulada |
| RE | Reemplazo póliza |
| RH | Rehecho |
| SE | Sin efecto |
| TI | Tomador ilocalizable |
| TR | Traspaso póliza |
| NI | Ninguno de los anteriores |

## claves_cargo  (§13.3.3)

| Código | Descripción |
|---|---|
| AR | Arbitrio municipal de bomberos |
| CN | Cargo no disponible |
| CL | CCS: Recargo actividad liquidadora. |
| IM | Impuestos |
| IP | IPS |
| RE | Recargo Externo (Derogado Ley 30/1995 de ordenación y supervisión de los seguros privados. Disposición transitoria Tercera punto 3) |
| REDD | CCS: Recargo en el Seguro de Riesgos Extraordinarios Daños Directos, sobre los bienes y las personas. |
| REPB | CCS: Recargo en el Seguro de Riesgos Extraordinarios Pérdida de Beneficios |
| RSOA | CCS: Recargo en el Seguro de Responsabilidad Civil de Suscripción Obligatoria derivada del Uso y Circulación de Vehículos a Motor. |
| RDM | CCS: Recargo Daños medioambientales |
| NI | Ninguno de los anteriores |

## claves_clasecomision  (§13.3.5)

| Código | Descripción |
|---|---|
| ME | Mediador: Comisión por producto. |
| MI | Mediador: Comisión incremental. |
| OT | Otros |

## claves_clasecontratacion  (§13.3.6)

| Código | Descripción |
|---|---|
| AX | Auxiliar |
| DE | Delegación |
| EN | Entidad |
| OF | Oficina |
| EM | Empleado / Usuario |
| OT | Otros |

## claves_clasegestion  (§13.3.7)

| Código | Descripción |
|---|---|
| CO | Compañía |
| ME | Mediador |

## claves_claselimite  (§13.3.9)

| Código | Descripción |
|---|---|
| AA | Acumulado anual |
| AS | Número acumulado de siniestros anual |
| PC | Por ocupante y siniestro |
| PS | Por siniestro |
| NI | Ninguno de los anteriores |

## claves_clasemovimientorecibo  (§13.3.10)

| Código | Descripción |
|---|---|
| AE | Anulación de extorno |
| AN | Anulación |
| CO | Cobro |
| DE | Devolución |
| DL | Devolución Liquidación |
| EM | Emisión |
| EX | Pago de extorno |
| LI | Liquidación |
| CG | Cambio en gestión de cobro. |
| NM | Recibo es no modificable. |

## claves_clasepoliza  (§13.3.11)

| Código | Descripción |
|---|---|
| AN | Anulación |
| CA | Cartera |
| NP | Nueva producción (Póliza que se encuentra en el primer año de vida, hasta la primera renovación) |
| SU | Suplemento |
| PC | Precartera de pólizas colectivas |

## claves_claserecibo  (§13.3.12)

| Código | Descripción |
|---|---|
| CA | Cartera |
| EX | Extorno |
| PA | Pago anticipado (seguro decenal y transportes) |
| MO | Movimientos |
| NP | Nueva producción |
| PB | Participación en beneficios |
| SU | Suplemento |
| AE | Aportación extraordinaria |
| TR | Traspaso |
| AP | Aportaciones periódicas |
| PC | Precartera |

## claves_claseregularizacion  (§13.3.13)

| Código | Descripción |
|---|---|
| CO | Codificado |
| TX | Texto |

## claves_clasesuplemento  (§13.3.14)

| Código | Descripción |
|---|---|
| AL | Alta de riesgo |
| BA | Baja de riesgo |
| CA | Cambio Asegurado-Beneficiario |
| CC | Cambio coberturas |
| CR | Cambio de riesgo |
| CT | Cambio tomador |
| DC | Decremento capital |
| DE | Decremento coberturas |
| EV | Entrada vigor |
| EC | Entrada en cobertura pólizas decenales |
| IC | Incremento capital |
| IN | Incremento coberturas |
| PC | Prórroga de cobertura pólizas temporales |
| RE | Regularización |
| RH | Rehabilitación |
| RP | Renovación pólizas negociables |
| NI | Ninguno de los anteriores |
| CP | Cambio en gestión de cobro o forma de pago. |

## claves_clasetasa  (§13.3.15)

| Código | Descripción |
|---|---|
| TC | Tanto por ciento (%) |
| TM | Tanto por mil |
| VA | Valor |

## claves_duracionpoliza  (§13.3.20)

| Código | Descripción |
|---|---|
| DE | Decenal |
| NE | Negociable |
| RE | Renovable |
| TE | Temporal |
| TR | Temporal (con posibilidad de ampliación de cobertura) |
| UN | Única |
| ND | Duración no disponible |

## claves_estadocivil  (§13.3.21)

| Código | Descripción |
|---|---|
| CA | Casado |
| DI | Divorciado |
| SE | Separado |
| SO | Soltero |
| VI | Viudo |
| NI | Ninguno de los anteriores |

## claves_figura  (§13.3.22)

| Código | Descripción |
|---|---|
| AD | Asegurado dependiente |
| BE | Beneficiario |
| CO | Contratista |
| PA | Pagador (Utilizar si es distinto del Tomador; No aplica a Siniestros) |
| PE | Perjudicado |
| PR | Promotor |
| SU | Subcontratista |
| TE | Terceros |
| TS | Testigo |

## claves_formapago  (§13.3.23)

| Código | Descripción |
|---|---|
| CH | Cheque |
| CC | Cuenta bancaria |
| IN | Ingreso o transferencia |
| OF | Oficina, efectivo o gestión delegada |
| PC | Por cuenta de la compañía |
| TA | Tarjeta |
| BI | BIZUM |
| MC | Mediador por cuenta bancaria |

## claves_fraccionpago  (§13.3.24)

| Código | Descripción |
|---|---|
| ME | Mensual |
| BI | Bimestral |
| TR | Trimestral |
| CU | Cuatrimestral |
| SE | Semestral |
| AN | Anual |
| UN | Única |
| EX | Extraordinaria |

## claves_franquicia  (§13.3.25)

| Código | Descripción |
|---|---|
| AA | Acumulado Anual |
| PE | Periódica |
| PO | Porcentual |
| PS | Por siniestro |
| NI | Ninguno de los anteriores |

## claves_mediador  (§13.3.26)

| Código | Descripción |
|---|---|
| BS | Banca Seguros |
| CO | Corredor |
| EX | Exclusivo |
| VI | Vinculado |

## claves_otroimporte  (§13.3.28)

| Código | Descripción |
|---|---|
| BO | Bonificación |
| DE | Descuento |
| MA | Malus |
| RE | Recargo |
| SU | Suspensión |
| PB | Participación en beneficios: Devengado en ejercicio anterior |
| PC | Participación en beneficios: Anticipo ejercicio actual |
| PD | Participación en beneficios: Recuperación sobre anticipo de ejercicio anterior |
| PR | Participación en beneficios: Retención IRPF |

## claves_periodo  (§13.3.29)

| Código | Descripción |
|---|---|
| DI | Diario |
| SE | Semanal |
| ME | Mensual |
| BI | Bimensual |
| TR | Trimestral |
| CU | Cuatrimestral |
| SM | Semestral |
| AN | Anual |
| SP | Sin periodo |

## claves_reactivacion  (§13.3.30)

| Código | Descripción |
|---|---|
| AR | Acuerdo Reactivación |
| ER | Error |
| RE | Reclamación |
| NI | Ninguno de los anteriores |

## claves_sexo  (§13.3.31)

| Código | Descripción |
|---|---|
| HO | Hombre |
| MU | Mujer |
| ND | Desconocido |

## claves_situacionpoliza  (§13.3.32)

| Código | Descripción |
|---|---|
| AN | Anulada |
| ES | En Suspenso |
| EV | En Vigor |
| EX | Extinguida |
| PR | Propuesta |

## claves_situacionrecibo  (§13.3.33)

| Código | Descripción |
|---|---|
| PE | Pendiente |
| CO | Cobrado |
| DE | Devuelto |
| AN | Anulado |
| LI | Liquidado |
| RE | Rehabilitado |

## claves_situacionsuplemento  (§13.3.34)

| Código | Descripción |
|---|---|
| PE | Pendiente |
| AC | Aceptado |
| RE | Rechazado |

## claves_tipoidentificacion  (§13.3.35)

| Código | Descripción |
|---|---|
| CI | CIF |
| NI | NIF |
| EX | NIE |
| PS | Pasaporte |
| OT | Otros |
| NO | No identificado |

## claves_transaccion  (§13.3.36)

| Código | Descripción |
|---|---|
| OR | Ordinaria |
| CM | Carga Masiva |
| RE | Rechazo |
| SO | Solicitud |

## claves_claseseguro  (§13.3.40)

| Código | Descripción |
|---|---|
| AH | Ahorro |
| JU | Jubilación |
| PR | Previsión |
| VI | Vitalicio |

## claves_duracionprestamo  (§13.3.41)

| Código | Descripción |
|---|---|
| AA | Años |
| DD | Días |
| HH | Horas |
| MM | Meses |

## claves_mediotransporte  (§13.3.42)

| Código | Descripción |
|---|---|
| AE | Aéreo |
| FL | Fluvial |
| MA | Marítimo |
| TE | Terrestre |
| OT | Otros |

## claves_claseliquidacion  (§13.3.49)

| Código | Descripción |
|---|---|
| LI | Liquidación |
| CE | Cuenta de efectivo |

## claves_estadoliquidacion  (§13.3.51)

| Código | Descripción |
|---|---|
| AN | Anulada |
| LI | Liquidada: En cuenta de efectivo computa en remesas. |
| PE | Pendiente: En cuenta de efectivo no computa en remesas. |

## claves_importeliquidacion  (§13.3.52)

| Código | Descripción |
|---|---|
| BR | Importe bruto. En el caso de recibos cobro mediador, se liquida en un movimiento el importe de recibo y en otro la comisión. |
| LI | Importe líquido. Se realiza la liquidación en un único movimiento. |
| PA | Importe a pagar o abonar por siniestro. |

## claves_claseembarcacion  (§13.3.56)

| Código | Descripción |
|---|---|
| MA | Moto acuática |
| MO | Embarcación a motor |
| NE | Neumática |
| SR | Semirrígida |
| VE | Velero |
| NI | Ninguno de los anteriores |

## claves_version  (§13.3.57)

| Código | Descripción |
|---|---|
| 7.1 | Versión 7.1 |

## claves_soporte  (§13.3.58)

| Código | Descripción |
|---|---|
| FP | Factura papel |
| FE | Factura electrónica |
| NI | Ninguno de los anteriores |

## claves_listamatricula  (§13.3.59)

| Código | Descripción |
|---|---|
| 1 | Lista primera |
| 2 | Lista segunda |
| 3 | Lista tercera |
| 4 | Lista cuarta |
| 5 | Lista quinta |
| 6 | Lista sexta |
| 7 | Lista séptima |
| 8 | Lista octava |
| 9 | Lista novena o de registro provisional |

## claves_modalidadvaloracion  (§13.3.60)

| Código | Descripción |
|---|---|
| PR | Primer Riesgo: Independiente del valor tasado que se calcule (con depreciaciones), no se aplica la regla proporcional. |
| VE | Valor estimado: Valor pactado entre aseguradora y tomador. No se aplica depreciación ni regla proporcional. |
| VN | Valor nuevo: La indemnización cubre el bien como si fuese nuevo, sin depreciaciones. |
| VP | Valor Parcial: Porcentaje del valor total. |
| VT | Valor Total: El valor asegurado es el valor tasado por el perito, aplicando depreciaciones. |

## claves_telefono  (§13.3.64)

| Código | Descripción |
|---|---|
| CS | Casa |
| FC | Fax casa |
| FT | Fax trabajo |
| MV | Móvil |
| OT | Otro |
| PR | Principal |
| TR | Trabajo |

## claves_email  (§13.3.65)

| Código | Descripción |
|---|---|
| PR | Personal |
| OT | Otro |
| TR | Trabajo |

## claves_perfil  (§13.3.66)

| Código | Descripción |
|---|---|
| BL | Blog |
| FC | Facebook |
| IN | Instagram |
| LI | LinkedIn |
| TW | Twitter |
| WP | Web personal |
| WT | Web trabajo |
| YT | Youtube |

## claves_consentimiento  (§13.3.67)

| Código | Descripción |
|---|---|
| CD | Cesión de datos personales a terceros |
| CP | Contactos promocionales |
| PC | Realización de perfil de cliente |
| RI | Recibir información de productos de otras compañías del grupo |

## claves_comercializacion  (§13.3.68)

| Código | Descripción |
|---|---|
| AC | Acuerdo de comercialización |
| CA | Campaña |

## claves_causarelacion  (§13.3.69)

| Código | Descripción |
|---|---|
| AC | Ajuste de comisión: Recibo de prima cero que no se emiten al tomador y que corrigen la comisión de un recibo emitido previamente |
| AP | Ajuste de prima: Recibo de extorno (con cancelación de póliza o no) o recibo de suplemento que complementa un recibo inicial con objetivo de ajustar la prima pagada. |
| DC | Defensa de cartera |
| RP | Reemplazo de póliza |
| SE | Subsanación de errores de emisión: Nuevo recibo como corrección a un recibo generado de forma incorrecta |
| SD | Sustitución de recibo por devolución. |

## claves_rolcoaseguro  (§13.3.70)

| Código | Descripción |
|---|---|
| AB | Abridora |
| AC | Aceptante |

## claves_canalcontratacion  (§13.3.71)

| Código | Descripción |
|---|---|
| WEB | Portal o página Web |
| PT | Plataforma tecnológica de mediador |
| TF | Plataforma telefónica |

## claves_claseconcepto  (§13.3.73)

| Código | Descripción |
|---|---|
| AI | Ajuste intereses |
| CA | Campaña |
| OC | Otras comisiones |
| PU | Publicidad |
| RA | Rappel |
| RC | Regularización de comisión |
| RI | Regularización por IRPF |
| RE | Retribución en especie |
| SU | Subvención |
| OT | Otro tipo de concepto, no catalogable en ninguna de las clases de concepto recogidas con clave específica. |

## claves_tipologia_adhesion  (§13.3.74)

| Código | Descripción |
|---|---|
| ABIERTO | El colectivo es abierto: Admite adhesiones voluntarias. |
| CERRADO | El colectivo de es cerrado. No admite adhesiones voluntarias. |
| SEMICERRADO | El colectivo es abierto con ciertas restricciones. Puede producirse adhesiones si se cumplen ciertas condiciones. Por ejemplo: una póliza colectiva de accidentes individuales del personal de una empresa, en la que automáticamente se están produciendo altas y bajas del personal a su servicio. Quedan asegurados en todo momento todos los empleados de la industria. |

## claves_tipologia_asegurados  (§13.3.75)

| Código | Descripción |
|---|---|
| NOMINADO | Los asegurados están identificados de forma individual. Cada asegurado puede tener diferentes prestaciones y capitales asegurados |
| INNOMINADO | Los asegurados no están identificados de forma individual. Mismas prestaciones y capitales a todos los asegurados |
| MIXTO | Se combinan grupos donde cada asegurado está identificado con otros cuyos asegurados están sin identificar. |

## claves_distribucionpago  (§13.3.76)

| Código | Descripción |
|---|---|
| 01 | 100% Tomador. |
| 02 | 100% Tercero ajeno a la póliza. |
| 03 | Centros de facturación. |
| 04 | Cada asegurado, sus riesgos. |
| 05 | Cada riesgo asegurado. |
| 06 | Cuadros de financiación: Son combinaciones en porcentaje o cantidades fijas (podría ser por coberturas) entre Tomador/Tercero y Asegurados. |

## claves_pagador  (§13.3.77)

| Código | Descripción |
|---|---|
| ASEGURADO | Asegurado |
| TERCERO | Tercero |
| TOMADOR | Tomador |

## claves_clasecentrofacturacion  (§13.3.78)

| Código | Descripción |
|---|---|
| CPL | Con poder liberatorio. |
| SPL | Sin poder liberatorio. |

## claves_tipologia_adhesion_agrupacion  (§13.3.79)

| Código | Descripción |
|---|---|
| ABIERTO | El colectivo es abierto: Admite adhesiones voluntarias. |
| CERRADO | El colectivo de es cerrado. No admite adhesiones voluntarias. |

## claves_tipologia_asegurados_agrupacion  (§13.3.80)

| Código | Descripción |
|---|---|
| NOMINADO | Los asegurados están identificados de forma individual. Cada asegurado puede tener diferentes prestaciones y capitales asegurados |
| INNOMINADO | Los asegurados no están identificados de forma individual. Mismas prestaciones y capitales a todos los asegurados |

## claves_formapagopb  (§13.3.87)

| Código | Descripción |
|---|---|
| CR | Concepto dentro del recibo de renovación de la póliza. |
| RP | Reajuste de la prima de cada riesgo en la renovación de la póliza. |
| EX | Recibo de extorno al renovar la póliza. |

## claves_clasepolizacolectiva  (§13.3.88)

| Código | Descripción |
|---|---|
| PR | Principal |
| AP | Aplicación o certificado |

## claves_modalidadramo  (§13.3.89)

| Código | Descripción |
|---|---|
| **** | **Autos** |
| AU-TER | Terceros |
| AU-TCL | Terceros Con Lunas |
| AU-TAM | Terceros Ampliado |
| AU-TPT | Terceros Pérdida Total |
| AU-TRC | Todo Riesgo Con Franquicia |
| AU-TRS | Todo Riesgo Sin Franquicia |
| **** | **Motos** |
| MO-TER | Terceros |
| MO-TCA | Terceros Con Asistencia |
| MO-TAF | Terceros Ampliado Con Franquicia |
| MO-TAS | Terceros Ampliado Sin Franquicia |
| MO-TPT | Terceros Pérdida Total |
| MO-TRC | Todo Riesgo Con Franquicia |
| MO-TRS | Todo Riesgo Sin Franquicia |
| **** | **Hogar** |
| HO-BAS | Básico |
| HO-MED | Medio |
| HO-PRE | Premium |
| **** | **Comunidades** |
| CO-SDA | Sin Daños Por Agua |
| CO-DAC | Daños Por Agua Comunes |
| CO-DCP | Daños Por Agua Comunes Y Privados |
| **** | **Asistencia sanitaria** |
| EN-DEN | Dental |
| EN-CPL | Consultas Y Pruebas Limitados |
| EN-CPR | Consultas Y Pruebas |
| EN-SEN | Senior |
| EN-CMC | Cuadro Médico Con Copago |
| EN-CMS | Cuadro Médico Sin Copago |
| EN-CYR | Cuadro Y Reembolso |

