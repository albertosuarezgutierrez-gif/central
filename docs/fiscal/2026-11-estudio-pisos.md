# Estudio fiscal pisos turísticos de Alberto — ejercicio 2026 (fecha: 03/11/2026)

SOLO LECTURA. No se ha consultado la BD ni se ha escrito nada. Se ha leído la skill `perfil-fiscal` y cabeceras del motor
`apps/plataforma/lib/base-fiscal-devengo.ts` (parámetros de amortización e imputación).

## Aviso de método y fiabilidad
- Los hosts oficiales (sede.agenciatributaria.gob.es, boe.es) NO resuelven desde esta sesión (WebFetch bloqueado por red). Todo lo
  de abajo sale de resúmenes de búsqueda (AEAT/BOE aparecen como resultado, pero su texto íntegro NO se ha podido abrir) y de
  fuentes secundarias (despachos, AEDAF, prensa). Para cada punto crítico se indica [Seguro]/[Probable]/[Suposición].
  Para activar la lectura directa: permitir `sede.agenciatributaria.gob.es` y `www.boe.es` en la red de la sesión.
- Los tipos/porcentajes de IRPF (3 %, 10 %, límite de intereses+reparación, art. 85 al 1,1 %/2 %) son de conocimiento propio del
  texto de la LIRPF/RIRPF; las búsquedas NO los confirmaron literalmente. [Seguro] por texto legal estable, pero citar BOE al presentar.

## 0. Hallazgo principal: el IVA puede dejar de ser exento el 01/12/2026
- **RDL 29/2026, de 6 de octubre** (BOE 07/10/2026, en vigor 08/10/2026) modifica el art. 20.Uno.23.º e') y el art. 91.Uno.2.2.º LIVA.
  La AEAT lo lista en "Novedades de normativa 2026" de IVA como "alquiler turístico o de corta duración". [Probable: título AEAT visto en
  resultados, texto no abierto].
- Contenido según fuentes secundarias: arrendamiento de alojamiento amueblado de **hasta 30 noches** al mismo arrendatario, distinto de la
  vivienda habitual del arrendador, pasa a **sujeto y NO exento al 10 %**, con efectos **desde el 01/12/2026**; estancias >30 noches siguen exentas.
  Una fuente indica que se atiende a la fecha de la estancia, no de la reserva. [Probable]. Régimen transitorio exacto: NO localizado. [Suposición: devengo por estancia].
- **Condición**: es un real decreto-ley que debe convalidar la Diputación Permanente (el RDL 26/2026, anterior, NO fue convalidado y se derogó
  el 02/10/2026). Se habla de sesión el 12/11/2026 (no confirmada oficialmente). Si no se convalida, decae. [Probable].
- También incluye (fuentes secundarias) recargo de IBI de hasta 50/100/150 % para viviendas de uso turístico en zonas tensionadas (depende de cada
  ayuntamiento) y retoca el art. 23.2 LIRPF (reducciones de vivienda en alquiler residencial; no afecta a turístico).
- **Conflicto con la premisa actual** ("sin servicios hoteleros → IVA exento"): vale hasta el 30/11/2026. Si se convalida, de diciembre en adelante
  las estancias ≤30 noches llevan IVA 10 % (modelo 303, factura con IVA, IVA soportado deducible según prorrata/sector diferenciado vs. correduría exenta).
  Además la Directiva (UE) 2025/516 apunta a IVA obligatorio en alquiler de corta duración vía plataformas desde 2028 (fuentes divergentes).
- Acciones: vigilar convalidación (12/11); preparar alta/ajuste censal (036/037), serie de facturas, tipo 10 % en Smoobu/Sivra/precios (los precios de
  Booking/Airbnb de diciembre ya publicados son "IVA incluido" o no: decisión comercial), y qué titular repercute en Socorro (50/50: cada comunero por su parte) [Suposición, validar con Asecon].
- Riesgo ligado ya abierto: modelo 309/303 por comisiones de Booking (inversión del sujeto pasivo) — está abierto en el requerimiento AEAT 2024 de la SL.

## 1. Calificación: capital inmobiliario vs actividad económica
- Art. 27.2 LIRPF: el arrendamiento de inmuebles es actividad económica solo si para su ordenación se utiliza al menos una persona empleada con
  contrato laboral y jornada completa. La AEAT/DGT añade que, si hay servicios propios de la industria hotelera (limpieza periódica durante la estancia,
  cambio de ropa, desayuno, recepción, lavandería, restauración), el rendimiento se califica como de actividad económica (y en IVA se sujeta). La limpieza solo a
  la entrada/salida NO convierte la renta en actividad. [Seguro el criterio general; la regla precisa varía por consulta].
- Socorro 24 y Dúplex como **capital inmobiliario** es correcto si: sin servicios hoteleros durante la estancia, limpieza solo entre huéspedes
  (la hace Sique Brilla/proveedor, no un empleado de Alberto) y ningún empleado a jornada completa afecto. [Probable correcto — depende de hechos; confirmar que no hay
  desayuno, cambio de ropa intraestancia ni recepción 24 h]. Atención: no hay que ofrecer "servicios" nuevos sin reevaluar (también IVA).
- Socorro al 50/50 con Pilar: cada uno declara su 50 % como capital inmobiliario (atribución/comunidad de bienes sin actividad). [Seguro]; no es CB con actividad.
- **Bustos Tavera (subarriendo)**: el subarrendador percibe rendimiento de **capital mobiliario** (art. 25.4 LIRPF; DGT V0781-13 lo trata así); tributa en la base GENERAL
  (no en la del ahorro). La renta pagada al propietario es gasto; la amortización inmobiliaria no aplica (no es titular). [Probable]: confirmar con el texto del art. 25.4 y 26.1 que
  los gastos admitidos son la renta pagada y los demás necesarios (la lectura exacta de qué gastos aplican no se pudo abrir). Condición: el contrato de arrendamiento
  debe permitir subarrendar/uso turístico (si no, riesgo civil y de no ser gasto). Calificación actual correcta. [Probable]
- Dentro del motor: las ficha de Bustos sin amortización (`amortizacion = null`) coincide con este criterio.

## 2. IVA (situación actual hasta 30/11/2026)
- Art. 20.Uno.23.º LIVA: arrendamiento de edificaciones para vivienda, exento; DGT excluye de la exención el alojamiento turístico CON servicios de hostelería (10 %, art. 91.Uno.2.2.º).
  Sin servicios hoteleros, hoy: exento. [Seguro hasta el 30/11/2026, salvo convalidación del RDL].
- Efecto: sin IVA repercutido, el IVA soportado de gastos NO es deducible y forma parte del gasto (ya se hace). Con IVA desde el 01/12/2026 (si se convalida), habrá deducción de IVA soportado
  de gastos de ese periodo (prorrata si Alberto sigue con actividad exenta de seguros: valorar sector diferenciado).
- Registro único de arrendamientos / NRA: el RD 1312/2024 exigía número de registro único (aplicable desde 01/07/2025). **El Tribunal Supremo, sentencia 620/2026 de 19/05/2026 (BOE 08/06/2026),
  anuló los preceptos sobre el procedimiento de registro único y la inscripción en el Registro de la Propiedad para obtener el número** por falta de competencia estatal; se mantiene la Ventanilla Única Digital (UE).
  [Probable: fuentes secundarias (Cuatrecasas, notariosyregistradores, Andersen); no se pudo abrir el BOE]. Confirmar si hay norma posterior de sustitución. Efecto práctico: el número VFT/ autonómico sigue siendo el exigible.

## 3. Gastos deducibles (capital inmobiliario: Socorro y Dúplex)
- Art. 23.1 LIRPF + arts. 13-14 RIRPF: gastos necesarios (IBI, comunidad, suministros, seguros, comisiones de plataformas, reparación y conservación, intereses, amortización...). [Seguro]
- Límite art. 23.1.a: intereses + reparación/conservación ≤ ingresos íntegros; el exceso se arrastra 4 años. Ni Socorro ni Dúplex tienen hipoteca → sin intereses; el límite
  afecta solo si las reparaciones superan ingresos. [Seguro]
- Amortización 3 % (art. 14.1.b RIRPF) sobre el MAYOR de coste de adquisición (con gastos/tributos) o valor catastral, ambos sin suelo; mobiliario/enseres 10 % máx. según tablas
  (lineal, hasta 15 % admisible). El motor lo hace así: Socorro 374.412,20 € × 60,58 % × 3 % = 6.804,63 €/año el piso entero (3.402,32 € cada titular); Dúplex 63.799,97 € × 3 % ≈ 1.914 €. [Seguro la mecánica; revisar
  que 374.412,20 € incluya ITP/notaría/registro y que, en el Dúplex (donado 21/05/2024), la base sea valor de ISD + gastos o el catastral si fuera mayor].
- **Mobiliario/televisor**: el criterio de Alberto (gasto íntegro 2026, p. ej. televisor 1.749 €) choca con el art. 23.1.b: bienes duraderos se amortizan (≈10 %/año = 174,90 € en 2026, y por días de uso).
  [Probable riesgo]. Ahorro frente a Hacienda: la diferencia es ≈1.574 € de gasto; a tipo marginal aproximado del 37-45 % ≈ 580-700 € de cuota si se regulariza (más intereses/recargo). El código ya lo anota como riesgo. Decisión de Alberto,
  pero documentarla ante la asesoría. Lo mismo para IKEA/obras si se tratan íntegras.
- Imputación art. 85 por días NO alquilados: se imputa el 1,1 % (catastral revisado en últimos 10 años) o el 2 % del valor catastral, proporcional a los días no arrendados
  (DGT V2227-20 de 30/06/2020 aplica la proporción a viviendas turísticas; [Probable, resumen secundario]). Socorro: valor catastral piso 150.549,25 € → imputación anual máxima (todo el año sin alquilar) 1.656,04 € al 1,1 % o 3.010,99 € al 2 %; cada titular mitad.
  El motor usa días con reserva cobrada (las de 0 € no cuentan) — correcto como criterio, pero los días en que el propietario bloquea para uso propio SÍ imputan; los bloqueos por obras/ inhabilitación no deberían imputar (documentarlo).
- **Reducción 60 % (art. 23.2)**: NO aplica al alquiler turístico/de temporada. Tras Ley 12/2023 las reducciones (50/60/70/90 %) exigen arrendamiento de VIVIENDA (LAU, habitual del inquilino);
  [Probable] no aplicable; el RDL 29/2026 la retoca solo para vivienda residencial (60 % rehabilitada, 80 % prórrogas) — no afecta. Un artículo de idealista (2024) sostenía lo contrario sin respaldo de DGT: NO aplicarla.
- Comisiones de Booking/Airbnb: gasto deducible (el motor las resta; la nota de riesgo "no resta la comisión" del código está vencida si ya lo hace — verificar).
- Gastos del subarriendo (Bustos): renta + suministros + comisiones; sin amortización. [Probable]

## 4. Obligaciones formales y plazos
- **Modelo 179** (cesión de uso de viviendas con fines turísticos): lo presentan los INTERMEDIARIOS (plataformas, gestores que comercializan viviendas de terceros), no el propietario que alquila lo suyo; periodicidad ANUAL, 1-31 enero (antes trimestral; cambio por orden de febrero 2023).
  Alberto/Sivra solo debería presentarlo si intermedia pisos AJENOS; en ese caso el plazo para 2026 sería enero de 2027. [Probable]
- **Registro autonómico**: Andalucía: declaración responsable para viviendas con fines turísticos (VFT), número VFT/SE/xxxxx; Decreto 28/2016, reformado por Decreto 31/2024 y Decreto-ley 1/2025. Debe constar en anuncios.
  Verificar que Socorro, Dúplex y Bustos tienen VFT vigente y cambios de titularidad (Socorro ahora 50/50) comunicados. [Seguro marco; estado concreto: comprobar]
- **NRA / registro único estatal**: obligación anulada (STS 620/2026). Mantener el número por si la plataforma lo pide. [Probable]
- **Tasa turística Sevilla**: NO existe. El alcalde (PP) plantea pedirla a la Junta (agosto 2026); en Andalucía el impuesto sobre estancias es autonómico y requiere ley/Junta. [Seguro que no hay a 03/11/2026 según prensa; vigilar]
- Límites urbanísticos: Sevilla limita al 10 % las licencias de VUT y CNMC cuestiona exigencia de cambio de uso — riesgo de no poder transmitir/ampliar licencias.
- IRPF: capital inmobiliario sin pagos fraccionados ni retención (huéspedes particulares). Renta 2026: campaña abril-junio 2027. IVA: si se convalida, 303 trimestral desde 4T 2026 (enero 2027).
- DAC7: plataformas informan a Hacienda de ingresos brutos por titular; cuadrar con lo declarado (ver requerimiento 2024 de la SL).

## 5. Riesgos fiscales concretos
1. **IVA 10 % desde 01/12/2026** (ver §0): sin preparación, ingresos de diciembre mal tratados; plazo de respuesta corto. ALTO / probable.
2. **Extras (cuna/trona 20 €) "sin IVA y no declarados"**: son contraprestación accesoria del alojamiento; deben computar como ingreso y seguir la tributación de la operación principal. Importe pequeño, decisión cerrada por Alberto, pero es criterio contrario al de la AEAT [Probable]. Riesgo bajo; el rastro en `incomes` permite revertir.
3. Mobiliario/TV como gasto íntegro (§3): riesgo medio-bajo, regularizable.
4. Imputación art. 85 mal calculada (valor catastral por piso/ año; 1,1 % vs 2 %): riesgo medio; confirmar la revisión catastral de Sevilla y el VC de Dúplex (el motor tiene Socorro; revisar Dúplex).
5. Socorro 2025 al IS de la SL vs IRPF 2026: incoherencia ya vigilada por Inspección (requerimiento AEAT 2024 abierto; la SL dormida). No mover nada en la SL.
6. Hechos que cambiarían la calificación a actividad económica (empleado, servicios hoteleros): control de proveedores (Sique Brilla como contratista, no empleada).
7. Bustos: dependencia del contrato de subarriendo con la propietaria (y que el pago de renta sea trazable y con retención/modelo 115 si el arrendador es empresario o persona jurídica). [Suposición: verificar quién es la propietaria y si hay IVA/retención en la renta].
8. Comisiones de plataformas extranjeras sin IVA: autoliquidación (inversión del sujeto pasivo) — abierto desde el requerimiento.
9. IBI: recargo hasta 150 % en zona tensionada según ayuntamiento; Sevilla no ha acordado (comprobar).

## 6. Oportunidades legales de ahorro
Antes del 31/12/2026:
- Concentrar en 2026 gastos reales de reparación/conservación pendientes (deducibles en el año de devengo) respetando que sean reparación y no mejora (la mejora se amortiza); límite ≤ ingresos.
- Comprar/facturar en 2026 el mobiliario pendiente de Socorro/Dúplex (se amortiza al 10 % desde la puesta en funcionamiento; criterio de Alberto = gasto íntegro, ver riesgo).
- Cerrar la documentación de gastos de 2026 (facturas con NIF, pagos con tarjeta/Kutxa) y revisar clasificación de suministros mixtos (TotalEnergies, DIGI, Endesa): solo la parte afecta.
- Decidir con Asecon el tratamiento IVA de diciembre antes del 01/12 (precios, facturación, censo).
- Revisar que el uso propio/bloqueos no generen imputación indebida (bloqueos por obras ≠ uso propio).
Estructurales:
- **Titularidad del Dúplex (100 % Alberto)**: pasar parte a Pilar (donación entre cónyuges; en Andalucía, ISD con bonificación del 99 % en grupos I/II [Probable, comprobar]; coste notaría/registro/plusvalía municipal) permitiría repartir rentas en dos declaraciones individuales
  con tarifa progresiva. Ahorro típico: reduce tipo marginal sobre la renta del Dúplex; hay que hacer números con ingresos reales. Atención al coste y a que Pilar es autónoma (RETA) y que la donación tiene efecto de valor de adquisición para amortizar. [Suposición/Probable: viable, validar con Asecon].
- Declaración individual vs conjunta: la skill indica ≈5.000 € más barata la individual en 2026 [Probable, validar con asesoría]; mantener.
- Seguir sin sociedad (descartada).
- Si se convalida el IVA, valorar el efecto de deducir IVA soportado de reformas/mobiliario (inversiones más rentables) y sector diferenciado frente a la correduría exenta.

## Fuentes (enlaces devueltos por las búsquedas; la AEAT/BOE no se pudieron abrir)
- BOE RDL 29/2026: https://www.boe.es/buscar/act.php?id=BOE-A-2026-20823
- AEAT, Novedades de normativa IVA 2026: https://sede.agenciatributaria.gob.es/Sede/iva/novedades-iva/novedades-normativa-2026.html
- AEAT, Manual IRPF 2019 (concepto capital inmobiliario / art. 27): https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/irpf-2019/capitulo-4-rendimientos-capital-inmobiliario/rendimientos-capital-inmobiliario/concepto-rendimientos-capital-inmobiliario/otras-precisiones-relacion-concepto-rendimientos.html
- AEAT, Manual IRPF 2024 (rendimientos íntegros capital inmobiliario): https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/irpf-2024/c04-rendimientos-capital-inmobiliario/rendimientos-integros.html
- DGT V1643-2025: https://www.fiscal-impuestos.com/sites/fiscal-impuestos.com/files/V1643-2025.pdf ; V1573-2025: https://www.fiscal-impuestos.com/sites/fiscal-impuestos.com/files/V1573-2025.pdf
- DGT V2227-20 (imputación días no alquilados): https://www.aedaf.es/es/documentos/descarga/48762/en-viviendas-destinadas-al-alquiler-de-uso-turistico-corresponde-imputar-la-renta-inmobiliaria-proporcionalmente-a-los-dias-en-que-el-inmueble-no-ha-e
- Hacienda aclara la tributación de particulares con pisos turísticos (AEDAF): https://aedaf.es/es/documentos/descarga/68040/hacienda-aclara-la-tributacion-de-los-particulares-con-pisos-turisticos
- Tributación indirecta en el arrendamiento de VUT (AEDAF): https://aedaf.es/es/documentos/descarga/41366/tributacion-indirecta-en-el-arrendamiento-de-viviendas-de-uso-turistico
- Derogación RDL 26/2026 (Fieldfisher): https://www.fieldfisher.com/es-es/locations/espana/actualidad/medidas-fiscales-vivienda-derogadas ; fiscal-impuestos: https://www.fiscal-impuestos.com/node/41914
- RDL 29/2026 resumen IVA/IBI: https://notariasbarcelona.es/real-decreto-ley-29-2026-novedades-fiscales/ ; https://herramientasfiscales.com/blog/iva-alquiler-turistico/ ; https://www.dig.es/iva-pisos-turisticos-ibi/ ; https://pixidia.com/?p=90428 (sesión 12/11)
- STS 620/2026 registro único: https://www.notariosyregistradores.com/web/participa/noticias/el-ts-anula-registro-arrendamientos-corta-duracion/ ; https://es.andersen.com/wp-content/uploads/2026/06/Andersen-Alerta-SENTENCIA-DEL-TRIBUNAL-SUPREMO-SOBRE-EL-REGISTRO-UNICO-DE-ARRENDAMIENTOS-DE-CORTA-DURACION.pdf ; https://www.cuatrecasas.com/es/spain/inmobiliario/art/arrendamientos-corta-duracion-numero-registro
- Modelo 179 (anual, enero): https://www.ineaf.es/tribuna/declaracion-informativa-cesion-uso-de-viviendas-turisticas/ ; https://www.fiscal-impuestos.com/modelo-179-declaracion-informativa-trimestral-cesion-uso-viviendas-fines-turisticos.html
- Andalucía VFT (Decreto 31/2024): https://www.juntadeandalucia.es/boja/2024/24/50 ; https://www.costaluzlawyers.com/licencia-vft-en-andalucia-2026-proceso-para-vivienda-turistica/
- Tasa turística Sevilla: https://www.moncloa.com/2026/08/06/tasa-turistica-sevilla-ayuntamiento-patronal-3411627/ ; https://www.eldiario.es/sevilla/alcalde-sevilla-pp-llamara-puerta-vox-junta-reclamarle-tasa-turistica-ciudad-necesita_1_13429113.html
- Reducción art. 23.2 y turístico: https://guiafiscal.es/calculadoras/irpf-alquiler/ ; https://www.idealista.com/news/node/816699 (posición contraria, no respaldada)
- Subarriendo DGT V0781-13: https://www.finect.com/preguntas/1739/las-rentas-procedentes-de-subalquilar-un-inmueble-son-deducibles
- Art. 23 LIRPF/STS 1130/2021 (base amortización): https://www.economistjurist.es/wp-content/uploads/sites/2/2022/06/STS-1130-2021-15-09-2021.pdf
