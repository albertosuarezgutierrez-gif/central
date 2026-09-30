# Comercio: qué pide Avant2 vs qué tenemos (CIMA/EIAC y `datosComercio`)

> Análisis del 30/09/2026 sobre UN presupuesto real de Avant2 (Codeoscopic → Occident, modalidad «ESTÁNDAR Comercios»,
> actividad de hostelería: bar con terraza). **Sin datos del cliente**: solo campos, garantías y opciones. Código de
> referencia: `packages/module-seguros/src/datos-comercio-riesgo.ts`. CIMA: `docs/CIMA-CAMPOS.md` (bloques
> `RiesgoComercios` y `DatosCoberturas`) y `docs/ASEGURA-EIAC-CAPITALES.md`.
> Ruta EIAC base: `Objetos.Poliza.DatosRiesgos.Riesgo.` (abreviada `R.` abajo).

Cómo leer: **Sí** = existe en `DatosComercioRiesgo`. **FALTA** = no existe. En «¿CIMA?»: sí/no según la lista de campos
que las compañías mandan hoy (CIMA-CAMPOS.md); «no» = el EIAC de comercio no tiene sitio para ese dato.

## 1. Datos del riesgo que pide Avant2 (41 campos)

Además del riesgo, el presupuesto lleva fecha de efecto y fraccionamiento (datos de la operación, no del riesgo).

| # | Pregunta de Avant2 (valor visto) | Campo nuestro | ¿Lo trae CIMA? |
|---|---|---|---|
| **Negocio** | | | |
| 1 | Familia (Hostelería y restauración) | FALTA | no |
| 2 | Actividad (Bar con terraza) | `actividad` (texto libre; Avant2 usa catálogo familia > actividad) | sí, `R.RiesgoComercios.Actividad.DescripcionActividad` |
| 3 | Número de empleados | FALTA (Alberto lo descartó a propósito el 30/09) | no |
| 4 | Facturación año anterior o estimada | FALTA | no |
| 5 | Régimen del tomador (Inquilino) | `regimenLocal` | no (campo propio nuestro) |
| **Local** | | | |
| 6 | Dirección | `direccion` | sí, `…SituacionRiesgo.NombreVia` |
| 7 | Población | `localidad` | sí, `…SituacionRiesgo.Poblacion` |
| 8 | Código postal (implícito, se tarifica por zona) | `cp` | sí, `…SituacionRiesgo.CodigoPostal` |
| 9 | Situación (Núcleo urbano / diseminado / polígono…) | FALTA (`zona` es el código de la compañía, no esto) | no (`…Zona` es código de compañía) |
| 10 | Superficie del local (m²) | `metrosCuadrados` | sí, `…SuperficieConstruida` |
| 11 | Año de construcción | `anioConstruccion` | sí, `…Antiguedad` |
| 12 | Año de la última reforma | FALTA | no |
| 13 | Tipo de edificio (planta baja de viviendas/oficinas…) | FALTA | no |
| 14 | ¿El edificio sólo tiene planta baja? | FALTA | no |
| 15 | Edificación en buen estado de conservación | FALTA | no |
| 16 | Instalación eléctrica revisada y protegida | FALTA | no |
| 17 | Materiales (Incombustibles…) | FALTA | no |
| 18 | Calidad de la construcción (Normal…) | FALTA | no |
| **Medidas de protección del local** | | | |
| 19 | Puerta principal (simple, blindada…) | `medidasProteccion[{medida,valor}]` (texto libre) | sí, `…MedidasProteccion.Proteccion.DescripcionMedida/ValorSubmedida` |
| 20 | Cierre puerta principal (tijerilla…) | ídem | ídem |
| 21 | Puerta secundaria | ídem | ídem |
| 22 | Cierre puerta secundaria | ídem | ídem |
| 23 | Escaparates | ídem | ídem |
| 24 | Cierres escaparates | ídem | ídem |
| 25 | Ventanas y otros huecos (cristal normal…) | ídem | ídem |
| 26 | Cierres ventanas y otros huecos | ídem | ídem |
| **Robo** | | | |
| 27 | Alarma (sin alarma / conectada…) | `medidasProteccion` | ídem |
| 28 | Vigilancia permanente en edificio/polígono | `medidasProteccion` | ídem |
| **Incendio** | | | |
| 29 | Bocas de incendio equipadas (BIES) | `medidasProteccion` | ídem |
| 30 | Detectores automáticos de incendio | `medidasProteccion` | ídem |
| 31 | Rociadores automáticos | `medidasProteccion` | ídem |
| 32 | Columnas hidrantes | `medidasProteccion` | ídem |
| 33 | Extintores | `medidasProteccion` | ídem |
| **Capitales** | | | |
| 34 | Capital de continente (+ modalidad de valoración) | `capitales[bien=CONTINENTE].importe/.modalidad` | sí, `…Capitales.Capital.Bien/Importe/ModalidadValoracion` |
| 35 | Capital mobiliario | `capitales[bien=CONTENIDO]` + `descripcion:'mobiliario'` | sí (`CONTENIDO`) |
| 36 | Capital maquinaria | `capitales[bien=CONTENIDO]` + `descripcion:'maquinaria'` | sí (`CONTENIDO`) |
| 37 | Capital mercancías (existencias) | `capitales[bien=MERCADERIAS]` | sí |
| 38 | Capital responsabilidad civil | `capitales[bien=RC]` | sí |
| 39 | Capital avería de maquinaria (0 € aquí) | `capitales[bien=OTROS]` + `descripcion` (encaje débil, ver §2) | parcial: solo como cobertura |
| 40 | Capital equipos electrónicos (0 € aquí) | `capitales[bien=OTROS]` + `descripcion` | parcial: solo como cobertura |
| 41 | Capital bienes refrigerados (0 € aquí) | ídem | parcial: solo como cobertura |

Recuento (41 campos): **12 con campo propio** (2, 5, 6, 7, 8, 10, 11, 34-38) · **15 solo como texto libre** en
`medidasProteccion` (19-33: existe la ruta CIMA pero sin catálogo) · **3 de encaje débil** en `capitales.OTROS` (39-41) ·
**11 SIN sitio, ni nuestro ni en CIMA** (1, 3, 4, 9, 12-18). `zona` no cuenta: es el código de la compañía, no una pregunta.

## 2. Garantías del presupuesto (Occident «ESTÁNDAR»)

El PDF lista **57 garantías con línea** (31 incluidas, 26 opcionales «no incluidas») y 5 epígrafes sin ninguna línea
(lucro cesante, todo riesgo accidental, vehículos/maquinaria en reposo, mercancías/transporte, deterioro refrigerados
como epígrafe): son «no contratables» para esta actividad. Prima anual única (sin desglose por garantía). **El PDF NO
muestra franquicias** ni prima por cobertura: donde CIMA sí las tiene (`DatosFranquicias`, Occident) el presupuesto no las
da; hay que pedirlas al condicionado o al pre-emisión.

Cómo encajan en CIMA: cada garantía es una `DatosCoberturas.Cobertura` de póliza (`R.DatosCoberturas.Cobertura.`
`DescripcionCobertura` + `CapitalAsegurado` o `DatosLimitesAsegurados.Limite.LimiteMaximo` + `DatosFranquicias`). El
**capital de bien** (lo que se asegura) va aparte, en `capitales.bien` (§13.99); la garantía solo lo referencia con un %.

| Bloque de Avant2 | Garantía (límite en el presupuesto) | ¿Opcional? | Encaje CIMA | ¿Guardable hoy en la oportunidad? |
|---|---|---|---|---|
| RC | RC inmueble (no agua): 150.000 €, máx. víctima 150.000 € | incluida | `Cobertura` + `Limite` (sublímite bajo capital `RC`) | capital RC sí; sublímites/víctima **no** |
| RC | RC explotación: 225.000 €, víctima 151.000 € | incluida | ídem | ídem |
| RC | RC locativa: 225.000 €, víctima 151.000 € | incluida | ídem | ídem |
| RC | RC patronal, trabajos fuera del recinto, productos y trabajos, bienes en depósito, bienes manipulados, aparcacoches, guardarropía (7) | opcionales | `Cobertura` (sin importe) | no |
| Robo | Robo y atraco del contenido: 100% del Contenido | incluida | `Cobertura` sobre `CONTENIDO` | no (solo el capital `CONTENIDO`) |
| Robo | Desperfectos en continente por robo/atraco: 1.000 € | incluida | `Cobertura` + `Limite` | no |
| Robo | Sustitución de cerradura: 500 € | incluida | ídem | no |
| Robo | Robo del continente; metálico fuera de caja; metálico en caja fuerte; atraco metálico en interior; transporte de fondos; reparto a domicilio; atraco de bienes a asegurado/empleados/clientes; infidelidad de empleados; bienes en escaparates (9) | opcionales | `Cobertura` (sin importe; los de metálico piden capital `OTROS`) | no |
| Incendio | Incendio y complementarios: 100% Continente y Contenido | incluida | `Cobertura` sobre `CONTINENTE`+`CONTENIDO` | no |
| Agua | Daños por agua; localización y reparación de escapes: 100% Continente y Contenido; RC agua incluida | incluidas (3) | `Cobertura` | no |
| Agua | Localización sin daños; exceso de consumo; filtraciones por juntas de sanitarios (3) | opcionales | `Cobertura` | no |
| Eléctricos | Daños eléctricos: 100% Continente y Contenido | incluida | `Cobertura` | no |
| Cristales | Espejos/cristales/metacrilato: 500 €; rótulos y letreros luminosos: 500 €; sanitarios: 500 € | incluidas (3) | `Cobertura` + `Limite` | no |
| Cristales | Rotura de encimeras | opcional | `Cobertura` | no |
| Estética | Restitución estética: 500 € | incluida | `Cobertura` + `Limite` | no |
| Asistencia | Asistencia comercios; asistencia informática | incluidas (2) | `Cobertura` (sin importe) | no |
| Jurídica | Defensa jurídica base: 3.000 € | incluida | `Cobertura` + `Limite` | no |
| Jurídica | Defensa jurídica amplia | opcional | `Cobertura` | no |
| Refrigerados | Deterioro de bienes refrigerados (capital 0 € aquí) | opcional | `Cobertura` + capital `OTROS` | no |
| Naturaleza | Lluvia/viento/pedrisco/nieve; inundación; choque de vehículos; vandalismo; humo repentino; ruina total por terceros: 100% Continente y Contenido; desembarre y extracción de lodos: 5% | incluidas (7) | `Cobertura` (% del capital) | no |
| Naturaleza | Filtraciones por terraza | opcional | `Cobertura` | no |
| Avería | Avería de equipos ofimáticos; avería de maquinaria | opcionales (2) | `Cobertura` + capital `OTROS` (0 € aquí) | no |
| Otras | Gastos de extinción/aminoración; salvamento (100% Contenido); demolición y desescombro; honorarios técnicos y permisos: 100%; desalojo forzoso: 20% Contenido; reposición de archivos: 500 € | incluidas (6) | `Cobertura` | no |
| Otras | Honorarios de perito | opcional | `Cobertura` | no |

Resumen: **los capitales de bien sí (continente, contenido, mercancías, RC, y `OTROS` con descripción para el resto). Las
garantías (incluida/opcional, sublímite, franquicia) NO tienen campo en `datosComercio`**, y `catalogo-garantias.ts` no
tiene ramo `comercio` (solo auto, moto, hogar, decesos, salud, vida). Ojo: en la ingesta los `OTROS` son partidas de
cobertura, no capitales del bien (ver `precargaComercioDePoliza`), así que usar `OTROS` para «capital avería» mezcla dos
cosas: mejor un campo de coberturas aparte (§3).

## 3. Huecos: qué añadir a `datosComercio` para tarificar como Avant2

Ordenados por importancia para el precio. «CIMA» = ¿existe ruta EIAC?

| Prioridad | Campo nuevo propuesto | Tipo | ¿En CIMA? | Nota |
|---|---|---|---|---|
| 1 | `familiaActividad` (+ `actividad` con catálogo de Avant2) | texto/código | no | Sin la actividad exacta del catálogo, Avant2 no da precio; hoy `actividad` es libre |
| 2 | `garantiasDeseadas[{clave, incluida, limite?, franquicia?}]` (tres estados: `null` sin mirar · `[]` ninguna · filas) | lista | parcial: `DatosCoberturas.Cobertura` + `DatosFranquicias` | Es el mayor hueco: RC patronal/productos, robo de metálico, lucro cesante, etc. mueven la prima |
| 3 | `facturacionAnual` | número € | no | Lo pide Avant2 (RC y tarifa) |
| 4 | `numeroEmpleados` | entero | no | Decisión previa de Alberto: no. Reabrir: lo pide Avant2 y condiciona RC patronal |
| 5 | `situacionEntorno` (núcleo urbano…) | código | no (`Zona` es código de compañía) | Distinto de `zona` |
| 6 | `tipoEdificio` + `soloPlantaBaja` | código + sí/no | no | |
| 7 | `materiales` + `calidadConstruccion` | códigos | no | |
| 8 | `conservacionBuena` + `instalacionElectricaRevisada` | sí/no/`null` | no | Ojo tres estados: «no sabe» ≠ «no» |
| 9 | `anioReforma` | entero | no | Opcional (nulo = no reformado o no se sabe) |
| 10 | Medidas de protección con **catálogo** (puerta, cierre, alarma, vigilancia, BIES, detectores, rociadores, hidrantes, extintores) en vez de texto libre | catálogo sobre `medidasProteccion` | sí (`DescripcionMedida`/`ValorSubmedida`) | No es campo nuevo: es normalizar los `medida`/`valor` que ya existen |

Sin hueco pero a vigilar: capitales de avería de maquinaria, equipos electrónicos y refrigerados (Avant2 los pide como
capital de garantía): resolver con `garantiasDeseadas.limite`, no con `capitales.OTROS`. Falta también `Pais`
(`…SituacionRiesgo.Pais`, CIMA sí lo trae, irrelevante para tarificar en España).

Los huecos 1-9 **no existen en CIMA** salvo lo señalado: son datos para tarificar, no para la ficha de póliza; al emitir
no habrá ruta EIAC donde volcarlos (irán a `datos_especificos` con clave propia, sin afirmar que vengan de CIMA).

## 4. Borrador del formulario para el cliente de comercio

Lenguaje llano; solo lo imprescindible para tarificar. `→` indica el campo destino (`nuevo` = a añadir, §3).

### Sobre tu negocio
1. ¿A qué se dedica el negocio? (elige tipo de negocio y luego la actividad) → `familiaActividad` (nuevo) + `actividad`
2. ¿Cuántas personas trabajan en él, contándote a ti? → `numeroEmpleados` (nuevo)
3. ¿Cuánto facturó el año pasado (o cuánto calculas que facturará este)? → `facturacionAnual` (nuevo)
4. El local, ¿es tuyo o lo tienes alquilado? → `regimenLocal`

### Sobre el local
5. ¿Cuál es la dirección del local, con código postal y población? → `direccion`, `otrosDatosVia`, `cp`, `localidad`, `provincia`
6. ¿Está en el casco urbano, en las afueras, en un polígono…? → `situacionEntorno` (nuevo)
7. ¿Cuántos metros cuadrados tiene el local? → `metrosCuadrados` (y `superficieTotal` si el edificio es mayor)
8. ¿De qué año es el edificio? ¿Se reformó después? ¿En qué año? → `anioConstruccion`, `anioReforma` (nuevo)
9. ¿En qué tipo de edificio está (planta baja de viviendas u oficinas, local independiente…)? ¿El edificio solo tiene planta baja? → `tipoEdificio`, `soloPlantaBaja` (nuevos)
10. ¿De qué está hecho (materiales) y qué calidad tiene la construcción? → `materiales`, `calidadConstruccion` (nuevos)
11. ¿Está en buen estado y con la instalación eléctrica revisada? (Sí / No / No lo sé) → `conservacionBuena`, `instalacionElectricaRevisada` (nuevos)

### Cuánto vale lo que quieres asegurar
12. ¿Cuánto costaría reconstruir el local? (solo si es tuyo) → `capitales[CONTINENTE]` + `modalidad`
13. Valor del mobiliario → `capitales[CONTENIDO]` (`descripcion: mobiliario`)
14. Valor de la maquinaria y equipos → `capitales[CONTENIDO]` (`descripcion: maquinaria`)
15. Valor de la mercancía o existencias que sueles tener → `capitales[MERCADERIAS]`
16. ¿Cuánto quieres cubrir si alguien te reclama por un daño (responsabilidad civil)? → `capitales[RC]`
17. (Si aplica) equipos electrónicos, cámaras frigoríficas o maquinaria que pueda averiarse: ¿cuánto valen? → `garantiasDeseadas[].limite` (nuevo)

### Seguridad del local
18. Puerta principal (simple, reforzada, blindada) y cómo cierra (llave, tijerilla, multipunto…) → `medidasProteccion`
19. ¿Hay otra puerta, escaparates o ventanas? ¿Con reja, persiana o cierre? → `medidasProteccion`
20. ¿Tienes alarma? ¿Conectada a central? ¿Vigilancia permanente en el edificio? → `medidasProteccion`
21. Contra incendios: ¿extintores, detectores, rociadores, bocas de incendio, hidrantes? → `medidasProteccion`

### Qué quieres que cubra (además de lo básico: incendio, agua, eléctricos, robo del contenido, RC, cristales, fenómenos naturales)
22. ¿Quieres cubrir a tus empleados si sufren un accidente por el que te reclamen (RC patronal)? → `garantiasDeseadas` (nuevo)
23. ¿Trabajas fuera del local o vendes/reparas productos? ¿Guardas cosas de clientes, aparcas coches o tienes guardarropa? → `garantiasDeseadas` (nuevo)
24. ¿Manejas dinero en efectivo (caja, caja fuerte, transporte a banco, reparto a domicilio)? ¿Cuánto? → `garantiasDeseadas` (nuevo)
25. ¿Quieres cubrir lo que dejas de ganar si tienes que cerrar por un siniestro (lucro cesante)? → `garantiasDeseadas` (nuevo)
26. ¿Tienes productos refrigerados que se puedan estropear? → `garantiasDeseadas` (nuevo)
27. ¿Quieres defensa jurídica ampliada, cobertura de terraza, encimeras o perito propio? → `garantiasDeseadas` (nuevo)
28. ¿Desde qué fecha quieres el seguro y pagarlo al año, semestre, trimestre o mes? → dato de la oportunidad (no del riesgo)

Notas para quien lo monte: los tres estados de las listas (`null` · `[]` · filas) se aplican también a `garantiasDeseadas`;
las preguntas de «sí/no» necesitan «No lo sé» para no guardar un `no` que nadie afirmó; los datos personales del tomador
van en su ficha, no en este formulario.
