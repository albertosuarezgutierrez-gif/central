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

> Actualizado con las capturas del formulario real: ver §5 (lista corregida de huecos, campos COMUNES vs PROPIOS de compañía).

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

> Preguntas nuevas y correcciones que confirman las capturas: §5.3.

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

## 5. Formulario real de Avant2 (capturas)

Fuente: 5 capturas del alta de comercio (pasos Comercio · Personas · Seguro · Productos con Occident y con Reale). Solo
nombres de campo, tipo y opciones visibles; sin datos del cliente. `*` = obligatorio. «Propio» = campo/estructura de
`DatosComercioRiesgo`. «CIMA» = ruta EIAC de `RiesgoComercios`/`DatosCoberturas` (ver §1-§2); «no» = no existe ruta.

**Regla de lectura:** los pasos Comercio y Seguro son **COMUNES** (se piden igual sea cual sea la compañía; son lo que
debe preguntar nuestro formulario). El paso Productos es **PROPIO de cada compañía**: Avant2 muestra un bloque distinto
por compañía elegida (Occident, Reale) y solo lo pide al cotizar con ella.

### 5.1 Comunes

**Paso Comercio: Actividad**

| Campo Avant2 | Ob. | Tipo / opciones | Campo nuestro | ¿CIMA? |
|---|---|---|---|---|
| Familia | * | select (catálogo; visto: Hostelería y restauración) | FALTA | no |
| Actividad | * | select dependiente de la familia (catálogo) | `actividad` (texto libre, sin catálogo) | sí |
| Número de empleados | * | entero | FALTA | no |
| Facturación estimada | * | importe € | FALTA | no |
| Régimen del tomador | * | select (visto: Inquilino) | `regimenLocal` | no |

**Paso Comercio: Descripción**

| Campo Avant2 | Ob. | Tipo / opciones | Campo nuestro | ¿CIMA? |
|---|---|---|---|---|
| Situación | * | select (visto: Núcleo urbano) | FALTA | no |
| Tipo de edificio | * | select (visto: Planta baja de viviendas y/o efectiva) | FALTA | no |
| ¿Sólo tiene planta baja? | | interruptor sí/no | FALTA | no |
| Superficie total efectiva | * | número m² | `metrosCuadrados` (y `superficieTotal`) | sí |
| Año de construcción | * | año | `anioConstruccion` | sí (`Antiguedad`) |
| ¿Ha sido reformado? | | interruptor sí/no (probable año al activarlo; no visible) | FALTA (`anioReforma`) | no |
| Materiales | * | select (visto: Incombustibles) | FALTA | no |
| Calidad de construcción | * | select (visto: Normal) | FALTA | no |
| Buen estado de conservación | * | sí/no | FALTA | no |
| Instalación eléctrica revisada | * | sí/no | FALTA | no |

**Paso Comercio: Dirección**

| Campo Avant2 | Ob. | Tipo / opciones | Campo nuestro | ¿CIMA? |
|---|---|---|---|---|
| Código postal (autocompleta población) | * | texto + select de población | `cp`, `localidad` | sí |
| Tipo de vía | * | select (visto: Avenida) | parcial: dentro de `direccion` (texto) | sí (`NombreVia`) |
| Nombre de vía | * | texto | `direccion` | sí |
| Número | * | texto | parcial: dentro de `direccion` | sí |
| Localización (bloque, escalera, piso, puerta) + otros datos | | 4 textos cortos + texto | `otrosDatosVia` (sin desglosar) | sí (`OtrosDatosVia`) |

**Paso Comercio: Seguridad** (13 preguntas; todas `*`; en CIMA existe `MedidasProteccion.Proteccion`, en nuestro código
`medidasProteccion[{medida,valor}]` en texto libre, sin catálogo)

| Campo Avant2 | Tipo / opciones vistas |
|---|---|
| Puerta principal | select (visto: Puerta simple) |
| Cierre puerta principal | select (visto: cierre de tijerilla, articulados, balaústres, rejas o similares) |
| Puerta secundaria | select (visto: No existe) |
| Escaparates | select (visto: No existe) |
| Ventanas y otros huecos | select (visto: Cristal normal) |
| Cierre ventanas y otros huecos | select (visto: No existen) |
| Alarma | select (visto: Sin alarma) |
| Vigilancia permanente | sí/no |
| Bocas de incendio equipadas | sí/no |
| Detectores de incendio | sí/no |
| Rociadores automáticos | sí/no |
| Columnas hidrantes | sí/no |
| Extintores | sí/no |

**Paso Seguro (Datos complementarios, Capitales, Garantías)**

| Campo Avant2 | Ob. | Tipo / opciones | Campo nuestro | ¿CIMA? |
|---|---|---|---|---|
| Fecha de efecto | * | fecha (aviso: usar la definitiva) | dato de la oportunidad, no del riesgo | n/a |
| Modalidad de continente | * | select (visto: Valor de reposición) | `capitales[CONTINENTE].modalidad` | sí |
| Continente | | importe € | `capitales[CONTINENTE]` | sí |
| Mobiliario | | importe € | `capitales[CONTENIDO]` + `descripcion` | sí |
| Maquinaria | | importe € | `capitales[CONTENIDO]` + `descripcion` | sí |
| Mercancías | | importe € | `capitales[MERCADERIAS]` | sí |
| Responsabilidad civil | | importe € | `capitales[RC]` | sí |
| Avería de maquinaria | | importe € (0 por defecto) | débil: `capitales[OTROS]` (mejor `garantiasDeseadas`) | parcial |
| Avería de equipos electrónicos | | importe € | ídem | parcial |
| Deterioro de bienes refrigerados | | importe € | ídem | parcial |

**Paso Personas (tomador)**, todos `*`: Identificación (tipo de documento select + número) · Nombre (nombre y dos
apellidos) · Teléfono principal · Fecha de nacimiento. No son del riesgo: van en la ficha del cliente (`clientes`),
FALTA en `DatosComercioRiesgo` a propósito. CIMA los trae en el bloque de tomador.

### 5.2 Propias de compañía (paso Productos)

Ninguna existe en `DatosComercioRiesgo`. Son datos de tarificación de esa compañía: si no se cotiza con ella, no se
piden. Encaje en CIMA: casi todas salen como `Cobertura`/`Limite` (§2), no como dato del riesgo.

**Occident** (17 campos)

| Campo Avant2 | Ob. | Tipo / opciones | Campo nuestro |
|---|---|---|---|
| Descuento | | número (visto: 50) | FALTA (dato comercial) |
| ¿Forma parte de un colectivo con condiciones especiales? | * | sí/no | FALTA |
| Actividad secundaria | * | sí/no | FALTA |
| ¿Basculantes con anclajes laterales y cerradura de seguridad, con puerta peatonal? / sin puerta peatonal? (2, bloque «Seguridad adicional») | * | sí/no | FALTA |
| Actividad de temporada | * | sí/no | FALTA |
| Aforo máximo autorizado (local y terraza) | | entero | FALTA |
| Contratar robo del contenido | * | sí/no | FALTA (garantía) |
| Superficie de local | | m² | `metrosCuadrados` |
| Superficie de zona exterior | | m² | FALTA |
| Superficie de almacenamiento | | m² | FALTA |
| Superficie de zona común | | m² | FALTA |
| ¿Bienes de terceros incluidos en los capitales? | * | sí/no | FALTA |
| Capital de objetos de valor | | importe € | `capitales[OVJ]` |
| ¿Tiene períodos de mercancías? | * | sí/no | FALTA |
| Forma de aseguramiento (zona exterior) | * | select (visto: No contestado) | FALTA |
| Capital de arbolado, jardines y plantas | | select (visto: No contestado) | FALTA |

(La fila de basculantes agrupa 2 preguntas: 17 campos en total.)

**Reale** (21 campos)

| Campo Avant2 | Ob. | Tipo / opciones | Campo nuestro |
|---|---|---|---|
| Campaña comercial | | select (sin campañas disponibles) | FALTA (dato comercial) |
| ¿Tiene sótano? | * | sí/no | FALTA |
| ¿Tiene almacén? | * | sí/no | FALTA |
| Aforo | * | entero | FALTA |
| Huecos a más de 5 m de altura o sin huecos accesibles | * | sí/no | FALTA |
| Ubicado en centro comercial | * | sí/no | FALTA |
| Franquicia | * | select (visto: Sin franquicia) | FALTA (garantía) |
| Capital robo continente a primer riesgo / Capital | * | sí/no + importe € | FALTA (garantía) |
| Desperfectos por robo al continente | * | sí/no | FALTA (garantía) |
| Robo contenido | * | sí/no | FALTA (garantía) |
| Tipo de cobertura de robo | * | select (visto: Valor total) | FALTA |
| Capital robo y expoliación de metálico fuera de caja | * | importe € | débil: `capitales[OTROS]` |
| Capital robo y expoliación de metálico en caja fuerte | * | importe € | débil: `capitales[OTROS]` |
| Capital de expoliación durante transporte de fondos | * | importe € | débil: `capitales[OTROS]` |
| RC intoxicaciones alimenticias | * | sí/no | FALTA (garantía) |
| Indemnización diaria a primer riesgo | * | sí/no | FALTA (garantía) |
| Capital RC objetos confiados | * | select (visto: 0) | FALTA |
| RC trabajos fuera | * | sí/no | FALTA (garantía) |
| Capital daños estéticos | | importe € | FALTA (garantía) |
| Capital de transporte de mercancías | * | sí/no | FALTA (garantía) |

### 5.3 Correcciones a §1-§4 y huecos confirmados

- **Fraccionamiento:** las capturas NO lo muestran en el paso Seguro (solo fecha de efecto). Quitarlo de «datos de la operación» hasta verlo.
- **Cierres de escaparates y de puerta secundaria:** el formulario tiene «Escaparates» y «Puerta secundaria» sin campo de cierre propio (§1 filas 22 y 24 sobraban); los cierres solo existen para puerta principal y ventanas. Seguridad = 13 preguntas, no 15.
- **Año de reforma:** Avant2 pregunta primero «¿Ha sido reformado?» (sí/no); el año, si existe, sale detrás. Modelar `reformado` (sí/no/`null`) + `anioReforma`.
- **Dirección:** Avant2 la desglosa (tipo de vía, nombre, número, bloque/escalera/piso/puerta). Nuestro `direccion` es una sola cadena: suficiente para tarificar (manda el CP), no para volcar 1 a 1.
- **Empleados:** confirmado obligatorio (`*`) en Avant2 → reabrir la decisión del 30/09 (§3, prioridad 4): sin él no hay precio.
- **Los huecos 1-9 de §3 se confirman**, con dos matices: `familiaActividad`/`actividad` es un par de selects de catálogo (obligatorios) y `garantiasDeseadas` no es un solo bloque: el paso Seguro común solo pide 4 capitales + RC + 3 averías, y el resto de garantías (robo, RC especiales, metálico, franquicia) las pide cada compañía en Productos.
- **Nuevo (COMÚN):** ninguno más; todo lo común queda cubierto por los huecos de §3. **Nuevos (PROPIOS):** los de §5.2, guardarlos en un bloque `datosCompania[{compania, clave, valor}]` (tres estados) y no en `datosComercio`, para no mezclar dato de riesgo con dato de una tarifa concreta.
- **Borrador del formulario (§4):** añadir a «Sobre tu negocio» la pregunta de aforo (solo si hay terraza o local de público) y, en «Sobre el local», «¿tiene sótano o almacén? ¿cuántos m²?»; el resto de preguntas propias (basculantes, temporada, colectivo, objetos confiados, centro comercial) se lanzan solo si se cotiza con Occident o Reale.

### 5.4 Recuento

| Grupo | Campos | Con sitio hoy | Débil / parcial | FALTA |
|---|---|---|---|---|
| Comunes (Comercio + Seguro) | 44 | 26 (7 propios + modalidad + 5 capitales + 13 medidas en texto libre) | 6 (3 de dirección desglosada + 3 averías) | 11 |
| Personas (tomador) | 4 | 0 (van a la ficha del cliente) | 0 | 4 |
| Occident | 17 | 2 | 0 | 15 |
| Reale | 21 | 0 | 3 | 18 |

Nota: en «Comunes» la fecha de efecto (1) es dato de operación, fuera de la tabla: 26 + 6 + 11 + 1 = 44. Las 13
medidas de seguridad solo tienen sitio como texto libre (sin catálogo).
