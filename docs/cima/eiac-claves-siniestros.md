# EIAC V07.1 — Claves de siniestros y mensajes (tipología de siniestro, acciones, situaciones, convenios, mensajes, documentos)

> Fuente: `209_IAC_ESP_DOC_DOCS-ESTANDAR-EIAC-V07-1_V05` (TIREA, 03/06/2026), apartado **10.2 Claves**. Transcripción literal: código -> descripción, sin interpretar. El § es el que figura en la columna «Clave» del PDF (numeración interna `13.x`).
> Cada tabla es el tipo `claves_*` del XSD con el mismo nombre. Buscar: `grep -n 'claves_formapago' docs/cima/eiac-claves*.md`. Índice de todas las tablas en `README.md`.

## claves_accionsiniestro  (§13.3.44)

| Código | Descripción |
|---|---|
| DI | Documentación / información |
| EJ | Judicial |
| EP | Peritación |
| ER | Reparación |
| IN | Indemnización |

## claves_clasesiniestro  (§13.3.45)

| Código | Descripción |
|---|---|
| CA | Cartera |
| MO | Movimientos |
| DE | Declaración - Nueva producción |

## claves_convenio  (§13.3.46)

| Código | Descripción |
|---|---|
| AS | ASCIDE |
| CA | Convenio de Asistencia Sanitaria Sector Público |
| CE | Convenio de Emergencias Sanitarias |
| CM | Convenio de Asistencia Sanitaria Sector Público (Sistema modular) |
| CP | Convenio de Asistencia Sanitaria Sector Privado |
| CS | Convenio SAMUR |
| CV | CIDE |
| SD | SDM |
| VM | Convenio Vehículos Mixtos |
| OC | Otros Convenios |
| SC | Sin convenio |

## claves_posicionsiniestro  (§13.3.47)

| Código | Descripción |
|---|---|
| CU | Culpa |
| RE | Reclamación |
| IN | Indeterminado |
| NA | No aplica |

## claves_situacionsiniestro  (§13.3.48)

| Código | Descripción |
|---|---|
| AP | Abierto |
| CE | Cerrado |
| RA | Reabierto |
| RC | Rechazado |

## claves_devolucion  (§13.3.50)

| Código | Descripción |
|---|---|
| DC | Diferencia comisión informada con la calculada por la otra entidad |
| EF | Error en fecha efecto |
| EH | Error en fecha vencimiento |
| ET | Error en importe total de recibo |
| EP | Error en prima neta |
| GC | Garantía no cubierta |
| GI | Gestión de Cobro del recibo incorrecta |
| PD | Prima Total no coincide con desglose (prima neta, impuestos, bonificaciones, recargos, descuentos) |
| RD | Recibo duplicado |
| PA | Póliza anulada |
| OT | Otros motivos de rechazo |

## claves_claseexpediente  (§13.3.54)

| Código | Descripción |
|---|---|
| DP | Daños Propios |
| LE | Lesiones |
| RC | Responsabilidad civil |
| RE | Recobro |
| CR | Cristales |
| DA | Daños por agua |
| EC | Expediente consorcio |
| NI | Ninguno de los anteriores |

## claves_estadoexpediente  (§13.3.55)

| Código | Descripción |
|---|---|
| DE | Declarado |
| LI | Liquidado |
| PE | Pendiente |
| RE | Reapertura |
| TE | Terminado |

## claves_situacionaccion  (§13.3.81)

| Código | Descripción |
|---|---|
| PD | Pendiente de inicio |
| EC | En curso de ejecución: Iniciada. |
| FI | Finalizada |

## claves_figuraaccion  (§13.3.82)

| Código | Descripción |
|---|---|
| AB | Abogado / Procurador |
| EA | Empresa de asistencia. |
| PE | Perito |
| RE | Reparador |
| TA | Taller |
| TR | Tramitador |

## claves_claseautoridad  (§13.3.83)

| Código | Descripción |
|---|---|
| BOMBEROS | Bomberos |
| GC | Guardia civil |
| POL-AUTO | Policia autonómica |
| POL-LOCAL | Policía local |
| MOV | Agentes de movilidad |

## claves_condicion  (§13.3.84)

| Código | Descripción |
|---|---|
| CONDUCTOR | Conductor |
| OCUPANTE | Ocupante |
| PEATON | Peatón |

## claves_responsabilidad  (§13.3.85)

| Código | Descripción |
|---|---|
| CAUSANTE | Causante |
| PERJUDICADO | Perjudicado |

## claves_tipologiasiniestro  (§13.3.86)

| Código | Descripción |
|---|---|
| **10** | **Agua y conducciones** |
| 1001 | Atasco - Con Daños por Agua |
| 1002 | Atasco - Sin Daños por Agua - Desatasco |
| 1003 | Condensación |
| 1004 | Escape - Accidental Agua - Omisión Cierre de Grifos |
| 1005 | Escape - de conducción subterránea |
| 1006 | Escape - de grifos comunitarios |
| 1007 | Escape - de instalaciones contra incendios |
| 1008 | Escape - de piscinas - Aljibes - Estanques |
| 1009 | Escape - desde bajante general |
| 1010 | Escape - desde montantes/acometidas |
| 1011 | Escape - en desagües privados |
| 1012 | Escape - sistema calefacción |
| 1013 | Escape - tubería vista - Radiadores - Sin daños |
| 1014 | Consumo - de Agua - Exceso |
| 1015 | Filtraciones - internas |
| 1016 | Filtraciones - por capilaridad |
| 1017 | Filtraciones - por cubiertas |
| 1018 | Filtraciones - por fachadas |
| 1019 | Rotura de conducción - de saneamiento |
| 1020 | Rotura de conducción - de suministro |
| 1021 | Rotura de conducción - subterránea |
| 1022 | Otras - Escape Agua y conducciones |
| 1023 | Otras - Rotura de conducción |
| **11** | **Asistencia** |
| 1101 | Asistencia - Cerrajería |
| 1102 | Asistencia - En Viaje |
| 1103 | Asistencia - Jurídica |
| 1104 | Asistencia - Manitas - Bricolaje |
| 1105 | Asistencia - Reparación Electrodomésticos |
| 1106 | Asistencia - Urgencia doméstica |
| 1107 | Otras Asistencias |
| **12** | **Atmosféricos** |
| 1201 | Heladas |
| 1202 | Inundación no consorciable |
| 1203 | Lluvia |
| 1204 | Nieve - Sobrecarga por nieve |
| 1205 | Pedrisco - Granizo |
| 1206 | Riesgos Extraordinarios - Inundación |
| 1207 | Riesgos Extraordinarios - Viento |
| 1208 | Viento - Edificación |
| 1209 | Viento - Toldos - Antenas |
| 1210 | Otras Riesgos Extraordinarios |
| 1211 | Otras Atmosféricos |
| **13** | **Colisiones - Vehículos** |
| 1301 | Cascos - Colisión |
| 1302 | Cascos - Daños Propios |
| 1303 | Colisión - Animales - Cinegéticos |
| 1304 | Colisión - Animales - Domésticos |
| 1305 | Colisión - Atropello - Peatón - Ciclista |
| 1306 | Colisión - Con objeto - Socavón en la vía |
| 1307 | Colisión - Daños por colisión vehículo con continente |
| 1308 | Colisión - Vehículos - Dos |
| 1309 | Colisión - Vehículos - Tres o mas |
| 1310 | Daños propios - Con colisión con tercero |
| 1311 | Daños propios - Externos Maquinaria |
| 1312 | Daños Propios - Incendio |
| 1313 | Daños propios - Lunas |
| 1314 | Daños Propios - Robo |
| 1315 | Daños propios - Solo daños propios - Aparcamiento |
| 1316 | Daños propios - Vandalismo |
| 1317 | Inexistencia de Siniestro |
| 1318 | Mercancías - Daños |
| 1319 | Vehículo Sustitución - Accidente - Avería |
| 1320 | Otras - Colisiones |
| 1321 | Otras - Daños Propios |
| 1322 | Otras - Mercancías |
| **14** | **Daños eléctricos y averías** |
| 1401 | Alteración del suministro eléctrico |
| 1402 | Arco Eléctrico |
| 1403 | Avería equipos electrónicos |
| 1404 | Avería maquinaria - Avería del propio aparato |
| 1405 | Defecto propio - Vicio instalación - Uso defectuoso |
| 1406 | Errores de diseño y/o fabricación |
| 1407 | Falta de mantenimiento |
| 1408 | Interrupción suministro |
| 1409 | Sobretensión Externa - Tormenta eléctrica - Corriente anormal. |
| 1410 | Sobretensión Interna - cortocircuito |
| 1411 | Otras - Daños Eléctricos |
| 1412 | Otras - Averías |
| 1413 | Otras - Equipos Electrónicos |
| **15** | **Daños Personales - Vida** |
| 1501 | Accidente - Asistencia Sanitaria |
| 1502 | Accidente - Caída accidental |
| 1503 | Accidente - Deportivo |
| 1504 | Accidente - Domestico |
| 1505 | Accidente - En riesgo asegurado |
| 1506 | Accidente - Laboral |
| 1507 | Accidente - Otros |
| 1508 | Accidente - Personales |
| 1509 | Fallecimiento - Deceso |
| 1510 | Invalidez |
| 1511 | Reembolso - Salud |
| 1512 | Rescate - Reembolso - Seguro Ahorro-Pensiones-Fondos |
| 1513 | Subsidio - Accidente |
| 1514 | Subsidio - Enfermedad |
| 1515 | Otros Accidentes - Daños Personales |
| 1516 | Otros Salud |
| 1517 | Otras Vida |
| **16** | **Incendio y explosion** |
| 1601 | Daños por salvamento |
| 1602 | Explosión - Autoimplosión |
| 1603 | Explosión - Daños por Explosión Causas Externas |
| 1604 | Explosión - Red de gas |
| 1605 | Humo - Daños propios |
| 1606 | Humo - Emisión |
| 1607 | Incendio |
| 1608 | Incendio - Desde el exterior |
| 1609 | Otras - Incendio Explosión |
| **17** | **Otras Causas** |
| 1701 | Caída de astronaves o aeronaves |
| 1702 | Caución - Incumplimiento Contractual |
| 1703 | Contingencias |
| 1704 | Cyber - Daños |
| 1705 | Garantía Decenal |
| 1706 | Ingeniería - Construcción - Daños |
| 1707 | Insolvencia - Crédito |
| 1708 | Mascotas - Daños - Asistencia Veterinaria |
| 1709 | Onda sónica |
| 1710 | Pérdida de puntos carné |
| 1712 | Otras - Ingeniería |
| 1713 | Otras - Otras Causas |
| 1714 | Otras - Ramo Vida |
| **18** | **Reclamaciones y Defensa** |
| 1801 | Defensa - Administrativa |
| 1802 | Defensa - Contractual |
| 1803 | Defensa - Laboral - Fiscal |
| 1804 | Defensa - Privada |
| 1805 | Defensa - Responsabilidad Civil |
| 1806 | Defensa - Responsabilidad Penal |
| 1807 | Reclamación - Clientes |
| 1808 | Reclamación - Daños Materiales |
| 1809 | Reclamación - Daños Por Daños causados por Animales |
| 1810 | Reclamación - Errores de diseño/fabricación |
| 1811 | Reclamación - Impagos |
| 1812 | Reclamación - Incumplimiento Contractual |
| 1813 | Reclamación - Por caída de carga |
| 1815 | Reclamación - Por Daños Personales |
| 1816 | Reclamación - Por Daños por Obras |
| 1817 | Reclamación - Por Dolo |
| 1818 | Reclamación - Por Impago Alquiler |
| 1819 | Reclamación - Por Impericia - Negligencia de Usuario |
| 1820 | Reclamación - A Compañía del asegurado |
| 1821 | Otras - Defensa |
| 1814 | Otras - Reclamación |
| **19** | **Responsabilidad** |
| 1901 | Responsablidad: Errores Diseño Fabricación |
| 1902 | Responsabilidad Profesional |
| 1903 | RC Animales |
| 1904 | RC Carga |
| 1905 | RC Colindantes - Conducciones y similares |
| 1906 | RC Explotación |
| 1907 | RC Familiar - Privada |
| 1908 | RC Patronal |
| 1909 | RC Intoxicación Alimentaria |
| 1910 | RC Perros |
| 1911 | RC Post Trabajos |
| 1912 | RC Productos |
| 1913 | RC Subsidiaria |
| 1914 | RC Unión y Mezcla |
| 1915 | Otras - Responsabilidades |
| **20** | **Robo y Vandalismo** |
| 2001 | Actos vandálicos - Acciones tumultuarias |
| 2002 | Actos vandálicos - Malintencionados |
| 2003 | Daños por robo |
| 2004 | Daños por Robo - Anexos |
| 2006 | Expoliación |
| 2007 | Expoliación - Fuera de domicilios y empresas |
| 2008 | Hurto |
| 2009 | Pérdida - Extravío |
| 2010 | Robo - Con fuerza |
| 2011 | Robo - En Anexos |
| 2012 | Uso fraudulento - Tarjeta bancaria |
| 2013 | Otras - Robo y Vandalismo |
| **21** | **Roturas** |
| 2101 | Rotura - Accidental |
| 2102 | Rotura - Cristales, espejos y similares |
| 2103 | Rotura - Loza sanitaria |
| 2104 | Rotura - Mármol y similares |
| 2105 | Rotura - Placa Vitrocerámica |
| 2106 | Rotura - Rotulos comercios |
| 2107 | Otras - Roturas |

## claves_mensajeambito  (§13.3.133)

| Código | Descripción |
|---|---|
| RC | Reclamación |
| AU | Autoridad |
| RE | Recobro |
| VA | Valoración |
| AB | Abogado / Legal |
| RP | Reparación |
| TI | Tramitación Indemnización |
| IN | Indemnización |
| NC | No clasificado |

## claves_mensajetitulo  (§13.3.134)

| Código | Descripción |
|---|---|
| **** | **Reclamación** |
| RC-01 | Iniciada Reclamación |
| RC-02 | Nos aceptan reclamación |
| RC-03 | Nos rehúsan reclamación |
| RC-04 | Declaración de inexistencia de siniestro |
| RC-05 | En interlocución |
| RC-06 | Reclamación Recibida |
| RC-07 | Reclamación recibida sin parte registrado |
| RC-08 | En espera de recibir de reclamación |
| **** | **Autoridad** |
| AU-01 | Solicitado Atestado/Informe |
| AU-02 | Recibido Atestado/Informe |
| AU-03 | Inexistencia de Atestado |
| **** | **Recobro** |
| RE-01 | Recobro solicitado |
| RE-02 | Recobro recibido |
| **** | **Valoración** |
| VA-01 | Perito Asignado |
| VA-02 | Cita cerrada con perito |
| VA-03 | Pendiente de informe perito |
| VA-04 | Analizando informe perito |
| VA-05 | Informe recibido |
| VA-06 | Informe recibido sin salvedades |
| VA-07 | Informe recibido con salvedades |
| VA-08 | Avance informe pericial |
| **** | **Abogado / Legal** |
| AB-01 | Traslado a letrado |
| AB-02 | Designación aceptada |
| AB-03 | Fallo - Respuesta de letrado |
| AB-04 | Letrado designado |
| **** | **Reparación** |
| RP-01 | En espera de asignación de reparador |
| RP-02 | Reparación iniciada por el reparador |
| RP-03 | Reparación finalizada por el reparador |
| RP-04 | Pendiente de siguiente gremio |
| RP-05 | Cliente no localizado |
| RP-06 | Reparación pospuesta por el reparador |
| RP-07 | Reparación pospuesta por cliente |
| RP-08 | Reparador Asignado |
| RP-09 | Cita cerrada con/por reparador |
| RP-10 | Visita realizada por reparador |
| **** | **Tramitación Indemnización** |
| TI-01 | Propuesta indemnización rechazada por el cliente |
| TI-02 | Propuesta indemnización aceptada por el cliente |
| TI-03 | Propuesta enviada |
| TI-04 | Propuesta enviada con salvedades |
| TI-05 | Propuesta enviada sin salvedades |
| TI-06 | Propuesta de indemnización por perdida total |
| TI-07 | Solicitada documentación de cliente |
| TI-08 | Recibida documentación de cliente |
| TI-09 | Analizando documentación |
| TI-10 | Aceptación con compromiso |
| TI-11 | Nota Tramitador |
| TI-12 | Nota Mediador |
| TI-13 | Nota Perito |
| TI-14 | Nota Abogado |
| **** | **Indemnización** |
| IN-01 | Pago indemnizatorio parcial |
| IN-02 | Pago indemnizatorio total |
| IN-03 | Pago a terceros |
| NC | No clasificado |

## claves_clasedocumento  (§13.3.135)

| Código | Descripción |
|---|---|
| SIN-01 | Certificado Titularidad Cuenta Bancaria |
| SIN-02 | Judicial |
| SIN-03 | Parte amistoso |
| SIN-04 | Propuesta de indemnización |
| SIN-05 | Propuesta de rehúse |
| SIN-06 | Factura |
| SIN-07 | Presupuesto |
| SIN-08 | Fotografías daños asegurado |
| SIN-09 | Fotografías daños causante |
| SIN-10 | Fotografías daños perjudicado |
| SIN-11 | Fotografías previas a contratación |
| SIN-12 | Fotos Después reparación |
| SIN-13 | Fotos Durante la reparación |
| SIN-14 | Informe estado vehículo |
| SIN-15 | Informe pericial |
| SIN-16 | Justificante de Ingreso Bancario |

## claves_clasemensaje  (§13.3.136)

| Código | Descripción |
|---|---|
| MS | Mensaje. |

