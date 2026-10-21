# Inventario de datos que necesita cada bot de tarificación (20/10/2026)

Solo lectura del repo. Sin datos personales (claves y reglas, nunca valores).

Leyenda de celdas: **O** = obligatorio (el bot lanza `datos`/hueco si falta) · **p** = opcional (solo se escribe si viene) ·
**S** = supuesto declarado en «Precio con supuestos: …» (no bloquea) · **—** = no lo usa · **?** = sin captura del portal / desconocido ·
**H** = hueco de mapa (variante no soportada: el bot para) · `decl.` = está en `obligatorios.ts` (por tanto el chequeo de la ficha lo ve) ·
`NO decl.` = el bot lo exige y `obligatorios.ts` NO lo declara.

Fuente única de «qué exige cada bot»: `packages/module-tarificacion/src/obligatorios.ts` (forma del ramo `:77-131` + propios por
compañía `:150-293`). Lo evalúa la ficha (`apps/plataforma/lib/tarificador-checklist.ts:44`, `tarificador-pendientes.ts:76`) y la red
final del worker (`services/tarificador-rpa/src/ramo.ts:41`). Ojo: ese fichero solo cubre lo que sus autores declararon; abajo se
marca lo que el adaptador exige de más.

Estado de cada bot (`obligatorios.ts:276-293`, `llegaAPrecio`): Allianz comunidades SÍ · Allianz moto SÍ · Mapfre auto SÍ (precio real
19/10) · Mapfre moto SÍ (mismo plan NSEI) · Allianz auto/turismos NO (se para antes del precio; el 20/10 v0.6.12 ya lee la tabla de
paquetes) · Generali auto NO (llega a «Datos de Valoración») · Allianz hogar NO (flag apagado, pantalla 1) · Mapfre hogar NO (borrador
apagado) · Occident hogar (sin registrar; fuera de este inventario).

---

## 1. AUTO (turismo)

Ficha/cotizador hoy: `apps/plataforma/lib/tarificador-auto-formulario.ts` (`formularioBotAuto`), `tarificador-auto-riesgo.ts`
(`formularioBotsAutoDeRiesgo`), campos sueltos en `tarificador-bots-ramos.ts:90-104` (uso, ámbito, clase permiso, compañía anterior).

| Campo | Allianz Turismos | Mapfre NSEI | Generali | Regla de validación | Fuente actual | ¿Lo pide hoy la ficha? |
|---|---|---|---|---|---|---|
| Matrícula | O (consulta paso 1) | O (paso «objeto asegurado») | O (campo «Matrícula» + verificación opcional; formato `1234*BCD`, provincial → S) | `esMatriculaEspanola` (`formulario-auto.ts:455-457`); decl. | oportunidad / `datosVehiculo.matricula` (`tarificador-auto-riesgo.ts:matriculaDeRiesgo`) | Sí, bloquea (`tarificador-auto-formulario.ts:106-108`) |
| Marca / modelo / versión | sale del portal por matrícula; con varias versiones: elección de bandeja, o equivalentes → elige sola y declara, o difieren → `requiere_humano` (`allianz/auto.ts:5-12`) | sale del portal por matrícula («Selección de vehículo»); si ninguna casa sola → equivalencia/primera declarada (`mapfre/auto.ts:64-71`) | **O**: NO busca por matrícula; exige `seleccionVehiculo.marca+modelo` o `vehiculoConfirmado.denominacion`, que asegura inyecta del `ok` de Allianz/Mapfre de la MISMA oportunidad (`obligatorios.ts:247-256`, `generali/auto.ts:1117`). `esperaVehiculo` = no arranca hasta tenerlo | Vendor por matrícula (`datosVehiculo.marca/modelo/version`) solo como pista; el vehículo real lo confirma el bot | Opcional (solo si hay marca y modelo, `auto-formulario.ts:174`); Generali: decl. `ficha` |
| CP | **no usa el de circulación**: teclea CP y localidad DEL TOMADOR (`planDatosTurismos`, `allianz/auto.ts:1780-1784`); si falta → hueco | O CP de circulación (5 dígitos; `mapfre/auto.ts:755`) | mapa provisional por etiqueta («CP»), sin captura (?) | 5 dígitos, provincia 01-52 (`formulario-auto.ts:459-463`); decl. como «CP de circulación» | `datosVehiculo.cpCirculacion`, si no CP de la ficha (`'ficha'`, `completarRiesgoVehiculoDesdeFicha`) | Sí (de la ficha si no hay). El CP del TOMADOR (Allianz) viaja en `fichaTomador` pero **no se comprueba** (ver huecos) |
| Localidad/población | S: la que propone el portal para el CP (declarada) o `fichaTomador.localidad` | — | ? | texto ≤80 sin caracteres prohibidos (`formulario-auto.ts:546`) | ficha (`clientes.ciudad`) | No |
| Tipo y documento del tomador (NIF/CIF) | O (tipo Individual/Empresa + nº documento, bloque tomador; el portal luego bloquea CP/localidad); tipo contradictorio con el documento → hueco | O (`documentoTomador` o `tomador.documentoIdentidad`; Mapfre lo busca en el paso 1) | ? (mapa provisional, no incluye documento) | DNI/NIE/CIF con letra de control (`formulario-auto.ts:559-563`) | ficha del cliente, lo inyecta asegura al entregar (`aplicarNifTomador`) | Mapfre: decl. `ficha` (no bloquea). Allianz Turismos: **NO decl.** |
| Alta del tomador (nombre, 1.er apellido, f. nacimiento; o razón social) | — | O solo si Mapfre no conoce al tomador (`planAltaTomador`, `mapfre/auto.ts:1130-1160`); decl. | ? | nombre/apellido ≤100; f. nacimiento ISO real (`formulario-auto.ts:580-590`) | ficha (`datosTomador`, asegura al entregar) | Aviso en cotizador (`faltanFichaTomadorParaAlta`, `tarificador-auto-riesgo.ts:~185`) |
| Fecha de nacimiento del conductor | O (DD/MM/AAAA; si conduce el tomador, a falta de ella la de la ficha) | O de hecho: debe coincidir con la del tomador si `tomadorEsConductor` es null (`exigirConductorEsTomador`, `mapfre/auto.ts:714-722`) | mapa provisional («Fecha de nacimiento») | edad 14-110 (`formulario-auto.ts:480`). Allianz exige conductor ≥18 al sacarse el carné (ver fila siguiente) | ficha (identidad / pólizas) | Sí (`'ficha'`, o falta) |
| Fecha del carné | O (en Turismos se teclea MM/AAAA) | O (`SEL_LICENCIA.fechaCarne`, «Valido desde», dd/mm/aaaa) | mapa provisional («Fecha de carné») | `carné > nacimiento`, no futura (`formulario-auto.ts:481-482`). **Portal Allianz: «conductor principal mayor de 18 al sacarse el carné»**; la pre-comprobación `exigirCarneCoherente` (`allianz/auto.ts:1010-1017`) solo se aplica a MOTO; en coche lo rechaza el portal | ficha: carné B más antiguo (`carneDelRamo`, `tarificador-moto-formulario.ts:~266`), si no el de pólizas | Sí, pero **sin regla de 18 años** |
| Clase de permiso | — | O pero con defecto `b` (auto) (`clasePermisoNsei`, `mapfre/auto.ts:745`) | — | lista cerrada b/a/a1/a2 (`formulario-auto.ts:29`) | defecto de coche | Sí (selector, `tarificador-bots-ramos.ts:96`) |
| Uso del vehículo | S: `diario` si no viene (`supuestos-auto.ts:94`) | O con defecto `particular` (opcional si el portal no lo pinta) | O: sólo «particular» (`elegirUsoGenerali`, `generali/reglas.ts:406`); otro uso = hueco | lista cerrada | defecto | Sí (selector `usoVehiculo`) — no distingue `usoFrecuencia` (ocasional/diario/laboral) |
| Ámbito de circulación | — | defecto `espana` | — | lista cerrada | defecto | Sí |
| Frecuencia de uso (`usoFrecuencia`) | S «diario» | — | — | `ocasional/diario/laboral` | — (no hay fuente) | **No** |
| Garaje (dónde duerme / tipo) | S: «colectivo» si no consta (`supuestos-auto.ts:106-119`) | — | S: igual que Allianz (`rellenarValoracionGenerali`, `generali/auto.ts:1168`) | `calle/colectivo/individual` | código de garaje del riesgo (`tipoGarajeDeCodigo`) | Solo si hay dato (el defecto de pantalla llega `null`) |
| Fecha de 1.ª matriculación | S: decide «nuevo/ya lo tenía» (sin dato → «ya lo tenía») | — (NSEI la autorrellena) | **O** (`generali/auto.ts:1197-1198`: sin ella y campo vacío → `datos`). **NO decl.** | ISO, no futura (`formulario-auto.ts:621-622`) | **vendor por matrícula** (`datosVehiculo.fechaMatriculacion`) | Viaja si consta (`auto-formulario.ts:169`); **no bloquea ni se avisa** |
| Compra: nuevo / ya lo tenía | S (derivada de matriculación y póliza actual) | — | — | `supuestosAuto` | derivada | No |
| Fecha de efecto | S: vencimiento de la póliza actual si es futuro, si no «mañana»; portal: min hoy, max hoy+90 días | — | ? («F. Efectos» se deja como viene) | ISO | `oportunidad.vence` / póliza leída (`vencimientoActualDeRiesgo`) | Sí, viaja; nunca bloquea |
| Tomador = propietario / = conductor | S «Sí» si no consta; «No» = **H** | `tomadorEsConductor` O (true/false o deducible por f. nacimiento); `false` = **H** | S «Sí»; «No» = **H** | boolean | el cotizador manda siempre `true/true` salvo otra ficha (`auto-formulario.ts:160-161`) | Sí: corta con aviso si el conductor/propietario es otra ficha o el tomador es empresa |
| Segundo conductor | S «No»; con ocasional «Sí» = **H** | — | — | boolean | `conductorOcasionalDeRiesgo` | Viaja; sin preguntar = supuesto |
| ¿Hubo seguro anterior? / años asegurado | S favorable «5 años o más»; tres preguntas de «Antecedentes» (tiempo en compañía, partes, tiempo titular) | O (`aniosAseguradoAnterior`; null → S favorable 6) | mapa provisional («Años asegurado») | entero 0-80 (`formulario-auto.ts:489`); decl. + `conAntecedentesFavorables` | `historialDeclarado.aniosAsegurado` | Sí; **bloquea si no hay "seguro actual" marcado** (`auto-formulario.ts:124`) |
| Siniestros con culpa 5 años | S favorable 0 («partes culpables») | O (`siniestrosUltimos5Anios`; null → S 0) | mapa provisional | entero 0-50 | `historialDeclarado` / póliza anterior | Sí (nunca bloquea, supuesto) |
| Compañía anterior (nombre) | O si «ya lo tenía» (cambio de seguro): casada contra ~96 opciones del portal (`compania-actual.ts`); ambigua/sin casar → `datos` con candidatas (`exigirCompaniaActualTurismos`, `allianz/auto.ts:1657`); decl. | O si años>0 (`faltaCompaniaAnterior`, `formulario-auto.ts:~66`; `mapfre/auto.ts:760-763`) | ? | texto ≤80 sin caracteres prohibidos (`MAX_COMPANIA_ANTERIOR`) | `historialDeclarado.companiaActual` / `aseguradora`; respaldo póliza en vigor de la cartera si es UNA (`tarificador-compania-poliza.ts`) | Sí (campo `companiaAnterior`; aviso si falta) |
| Últimas 5 cifras de la póliza actual | **O si aparece el input** (aparece al elegir compañía; sin dato → hueco `HUECO_POLIZA_ACTUAL`, `allianz/auto.ts:~1630`). **NO decl.** | **O si el portal lo marca obligatorio** (`historialAnterior`, `mapfre/auto.ts:1325-1334`); en riesgo solo hay 5 cifras, Mapfre pide el «Nº de Póliza» (¿completo?) **NO decl.** | ? | exactamente 5 cifras (`formulario-auto.ts:617`) | `historialDeclarado.numeroPoliza` / póliza subida (`numeroPolizaActual`) | **No en coche**: `EntradaBotAuto` ni lo lleva (solo moto) |
| Justificante del seguro anterior (`fotocopiaAnterior`) | — en Turismos no se ha visto (sí en Moto) | — | — | `proximo_anio` / `dos_ultimos_anios` | historial declarado | No en coche |
| Fecha de adquisición | — (compra se deriva) | — | — | ISO, ≥1900, no ≥ matriculación (`formulario-auto.ts:623-628`) | — | No (solo moto) |
| Sexo del conductor | — | — | ? | `hombre/mujer` | tratamiento Sr./Sra. de la ficha | No (el coche manda `sexo: null`) |
| Dirección del tomador (vía, número, piso) | — (paso «Datos» de emisión, el bot no va) | — | ? | `fichaTomador.direccion` (`formulario-auto.ts:~185`) | ficha | No (no se supone nunca: `supuestos-auto.ts:146`) |

---

## 2. MOTO

Ficha/cotizador hoy: `tarificador-moto-formulario.ts` (`formularioBotMoto`) y campos sueltos `tarificador-bots-ramos.ts:55-85`
(cilindrada, sexo, compañía anterior, fecha de adquisición, nº póliza anterior, justificante). Preferencias de guardado:
`tarificador-bots-extra.ts:1-12`. Generali **no tiene bot de moto** («solo turismos»: `generali/auto.ts:1331`).

| Campo | Allianz Moto | Mapfre NSEI (moto) | Generali | Regla de validación | Fuente actual | ¿Lo pide hoy la ficha? |
|---|---|---|---|---|---|---|
| Matrícula | O (`consultarMatriculaMoto`; lee de vuelta la f. matriculación) | O | — | formato español; «una moto sin matricular no se puede tarificar» (`moto-formulario.ts:170`) | oportunidad / vehículo | Sí, bloquea |
| Marca y modelo | O (cascada marca → clase → modelo → versión) (`seleccionVehiculo`) | O (por matrícula) | — | `seleccionVehiculo.marca/modelo` (`formulario-auto.ts:524`); decl. | **vendor por matrícula** / catálogo | Sí («elígelos del catálogo») |
| Cilindrada (cc) | O; Moto vs Ciclomotor: ≤50 cc rechazado (`formulario-auto.ts:641`) | decl. por BASE_MOTO | — | entero 1-3000; 51-3000 en ficha | campo suelto `cilindrada`; guarda en `datosVehiculo.cilindradaCc` | Sí |
| Clase de moto (tramo 1-4) | O (`seleccionVehiculo.clase`; 1 ≤125 · 2 ≤350 · 3 ≤750 · 4 >750) | — | — | debe casar con la cc (`formulario-auto.ts:644`) | derivada (`claseMotoPorCilindrada`) | Derivada, no se pide |
| CP + población | O; CP con varias poblaciones → se elige sola por la localidad (v0.7.3); si no, persona | O (5 dígitos) | — | 5 dígitos prov. 01-52 | `cpCirculacion` o ficha; población elegida en cotizador | Sí / elegir municipio |
| F. nacimiento conductor | O | O (comparación con tomador) | — | 14-110 años | ficha | Sí |
| F. carné | O; **conductor ≥18 al sacarse el carné** (`exigirCarneCoherente`, `allianz/auto.ts:1010-1017`, antes del login) | O («Valido desde») | — | carné > nacimiento; ≥18 solo en el bot | ficha: carné A/A1/A2 más antiguo (`carnetMotoMasAntiguo`) | Sí, sin regla de 18 años |
| Clase de permiso (A/A1/A2) | — | S «A» (declarada); si el riesgo trae `b` → `datos` (`mapfre/auto.ts:741-750`) | — | lista cerrada | — | **No** (el selector es el de coche, solo `b` por defecto) |
| Sexo del conductor | **O** (el portal asumiría «Hombre»; `planDatosBasicosMoto`, `allianz/auto.ts:912`); decl. `ficha` | — | — | `hombre/mujer` | tratamiento Sr./Sra. (`saludo`) si no se teclea | Sí (campo `sexo`) |
| NIF/CIF del tomador | O si tomador = conductor/propietario (`comprobarTitularesMoto`, `allianz/auto.ts:856-863`); decl. | O (paso 1) | — | DNI/NIE/CIF | ficha, asegura al entregar | Decl. `ficha`; no bloquea |
| Alta tomador (nombre, apellido, f. nacimiento) | — | O si Mapfre no lo conoce | — | idem coche | ficha | Aviso |
| Años asegurado | O (S favorable «más de 5» si no consta) | S favorable | — | 0-80 | historial declarado | Sí |
| Siniestros 5 años | O (S favorable 0); **>0 = H** (no hay traducción a «años sin siniestros / nº último año», `allianz/auto.ts:915`) | S 0; **>0 en moto sin bloque de historial = H** (`mapfre/auto.ts:1346`) | — | 0-50 | historial | Sí; **no avisa del H con siniestros>0** |
| Compañía anterior | **O si estuvo asegurado** (`años !== 0`, incluido sin dato); casada contra `#ciaOrigen` (ambigua → IA/humano); decl. | O si años>0 | — | texto ≤80; valores de cajón («otro», «N/A») descartados | historial / póliza; respaldo cartera | Sí |
| Nº póliza anterior: últimas 5 cifras | **O si estuvo asegurado** (máscara `text(0,5)`; `allianz/auto.ts:988-1000`); decl. | **O si el portal lo marca** (`historialAnterior`); **NO decl.** | — | exactamente 5 cifras | `historialDeclarado.numeroPoliza` o póliza subida (5 últimas cifras por defecto) | Sí (Allianz); para Mapfre no se comprueba |
| Justificante del seguro anterior | **O si estuvo asegurado** («No» no vale): `proximo_anio` (recibo próximo año/certificado) · `dos_ultimos_anios` (recibos 2 últimos años) | — | — | lista cerrada | `historialDeclarado.fotocopiaAnterior` | Sí, **sin valor por defecto: hay que elegir a mano** |
| Fecha de adquisición (no matriculación) | **O siempre** (`allianz/auto.ts:988-1000`); decl. | — | — | ISO real, ≥1900, no futura, no anterior a la matriculación (`formulario-auto.ts:623-628`) | `datosVehiculo.fechaCompra`; por defecto la de matriculación (se muestra, no se guarda) | Sí (por defecto = matriculación, que puede ser incorrecto en 2.ª mano) |
| Uso | fijo particular (`USO_PARTICULAR`) | opcional con defecto | — | — | defecto | No |
| Garaje de noche | p (si consta) | — | — | boolean | `garajeNoche: null` (supuesto, no se manda) | No |
| Propietario / conductor otra ficha | **H** | **H** | — | — | cotizador | Sí, bloquea con aviso |

Allianz Moto v0.7.19 (Alberto, 21/10/2026): si la fecha de adquisición es anterior a la 1ª matriculación que el portal trae por la matrícula (`#fechaMatriculacion`), venga de donde venga (por defecto, tecleada o sin marca `fechaAdquisicionPorDefecto`), el bot escribe la del portal y lo declara como supuesto con los días de diferencia, sin fechas (`fechaAdquisicionFrentePortal`, `allianz/auto.ts`); ya no para como `datos`. Sin fecha legible del portal, o igual/posterior, se escribe la nuestra.

Allianz Moto v0.7.20 — «Cliente Alto Potencial» (CAP), bajo la tabla «PRECIOS MODALIDADES» del ePAC: desplegable Sí/No. Elegir «Sí» abre una ventana lateral de descuento comercial, hoy **desactivado en la cuenta del broker** (Alberto, 21/10/2026). El bot solo lee CAP como diagnóstico (campos `capAllianz` / `clienteAltoPotencialAllianz` en `module-tarificacion`: validados, no aplicados); en el run 0.7.20 no se encontraron sus selectores (aviso «no se encontró en la pantalla de precios»). **Pendiente:** cuando Alberto active el descuento, verificar con un run real (capturar el HTML de la rejilla y de la ventana lateral) antes de que el bot escriba nada; el bot nunca aplica un descuento sin decisión explícita.

---

## 3. HOGAR

Ficha/cotizador hoy: `tarificador-hogar-formulario.ts` (`formularioBotHogar`) y 4 campos «Elegir…» en
`tarificador-bots-ramos.ts:118-134`. El riesgo NO lleva tomador: lo inyecta asegura desde la ficha al entregar
(`obligatorios.ts:99-111`). Generali no tiene hogar. Los 3 bots están apagados/en borrador.

| Campo | Allianz Hogar (ePAC, pantalla 1) | Mapfre Hogar (borrador) | Generali | Regla de validación | Fuente actual | ¿Lo pide hoy la ficha? |
|---|---|---|---|---|---|---|
| DNI/NIE del tomador | O (idNumber; tipo de documento: el bot no lo cambia, lee lo que muestra) | O (`#numDocumento`) | — | DNI/NIE con letra (`formulario-hogar.ts:188`); **empresa no soportada** | ficha (asegura al entregar) | Decl. `ficha`; avisa si el tomador es empresa (`hogar-formulario.ts:64`) |
| F. nacimiento del tomador | O (dateOfBirth) | O (`#fechanacimientoTomador`) | — | ISO; edad 18-110 (`formulario-hogar.ts:199`) | ficha | Decl. `ficha` |
| Nombre y 1.er apellido del tomador | — | O si Mapfre no conoce al tomador (`datosTomador`); hoy asegura NO los inyecta en hogar → bot no tarificable (`obligatorios.ts:233-236`) | — | texto | ficha | **No** (decl. solo para Mapfre) |
| CP | O (postalCode; varias poblaciones = H) | O (primer paso) | — | 5 dígitos prov. 01-52 | Catastro / vivienda de la oportunidad | Sí |
| Municipio | p (si viene, el bot comprueba que el portal autocompleta ESA) | — | — | texto ≤80 | vivienda | p |
| Calle (solo el nombre, sin tipo de vía) | O (streetName, combobox; si no resuelve = H) | — (usa catastro) | — | texto ≤80 | vivienda | Sí |
| Número | O | — | — | texto ≤10 | vivienda | Sí |
| Bloque / escalera / planta / puerta | p | — | — | ≤10 | vivienda | p (planta, puerta) |
| Referencia catastral | p | **O: de 20 caracteres** (la de 14 no vale; sin ella `datos`, `exigirDatosHogar`, `mapfre/hogar.ts:94-99`); decl. | — | 14 o 20 alfanuméricos (`formulario-hogar.ts:229`); Mapfre exige 20 con formato `…[A-Z]{2}` | core-catastro, resuelta ANTES de encolar | Sí viaja si consta; **no se comprueba como obligatoria para Mapfre en la ficha de hogar si no se pasa por `checklistBot`** (sí lo hace: decl.) |
| Año de construcción | O (el campo quedaba inválido tras repintar; se escribe de los últimos) | — (Catastro) | — | 1500-año actual (`formulario-hogar.ts:224`) | Catastro | Sí |
| Año de reforma | p | — | — | ≥ construcción | Catastro | p |
| Superficie construida (m²) | O (entero) | — | — | entero 10-100000 (`formulario-hogar.ts:230`) | Catastro | Sí (avisa si no es entero) |
| Uso de la vivienda | **O, sin defecto** (decide tarifa): habitual / secundaria / alquiler / turístico | ? | — | lista cerrada | persona (no lo sabe Catastro) | Sí, «Elegir…», bloquea |
| Régimen (propietario/inquilino) | **O, sin defecto** | ? | — | lista cerrada | persona | Sí |
| Tipo de vivienda | **O, sin defecto** (piso, planta baja, ático, adosada, independiente) | ? | — | lista cerrada | persona (precarga si casa exacto con catálogo) | Sí |
| Con/sin madera | **O, sin defecto** | ? | — | boolean | persona | Sí |
| Capital continente / contenido | p hoy; **«Valoración de bienes» sin mapear** (el bot se para ahí) | ? (garantías sin mapear) | — | importe > 0 (`formulario-hogar.ts:129-134`) | Catastro/estimación | p (se manda si consta) |
| Forma de pago / comisión / efecto | ? (pasos posteriores sin ver) | ? | — | — | — | No |

---

## 4. COMUNIDADES (solo Allianz ePAC «Comunidades 2020»; Mapfre y Generali no tienen bot)

Ficha hoy: formulario propio «Precio Allianz (bot)» tecleado a mano (`apps/plataforma/lib/tarificador-asegura-reglas.ts:41-60`,
`riesgoDesdeFormulario` `:~120`). **No hay adaptador de comunidades en `tarificador-bots-ramos.ts`** (solo moto/auto/hogar), así que no
participa en el chequeo previo por bloque ni en el cuestionario único.

| Campo | Allianz | Regla de validación | Fuente actual | ¿Lo pide hoy la ficha? |
|---|---|---|---|---|
| CP (C.P./Población; lupa) | O; varias poblaciones sin municipio → `datos` con opciones (`comunidades.ts:504`). **El municipio no está decl.** | 5 dígitos (`riesgo.ts:67`) | dirección del edificio / Catastro | Sí |
| Fecha de inicio (efecto) | O | ISO; **no pasada** (`riesgo.ts:125-127`); ePAC la ajusta al día 1 del mes | por defecto `fechasPorDefecto` | Sí |
| Fecha de término | O | ISO, posterior al efecto (`riesgo.ts:128`) | por defecto | Sí |
| Metros cuadrados | O | entero ≥1 | Catastro / edificio | Sí |
| Año de construcción | O | 1800-año actual | Catastro | Sí |
| Año de reforma | p | idem | — | No |
| Tipo de vivienda (desplegable) | O, etiqueta exacta del portal (hoy solo se conoce «Viviendas Pisos en Alto»); valor no admitido → `datos` | texto libre | extra `tipoVivienda` | Sí (sugerencia única) |
| Uso (desplegable) | O («Habitual») | texto libre | extra | Sí |
| Plantas sobre calle | O | 1-80 | edificio | Sí |
| Plantas bajo calle / sótanos | p | 0-10 | — | No |
| Nº de edificios | O | 1-999 | edificio | Sí |
| Contiguos | p (se habilita con varios edificios) | texto | — | No |
| Nº viviendas y locales | O (dado, o viviendas + locales si vienen los dos) | ≥1 | edificio | Sí |
| Lista propietarios/arrendatarios (desplegable) | O («> 50%») | texto libre | extra | Sí |
| Instalaciones anexas | p (check) | boolean | — | No |
| Edificación valor de reposición (€) | O: sin él «Calcular» queda deshabilitado | importe > 0 | tecleado; aviso de infraseguro (`estimarInfraseguro`, umbral 0,8 × m² × €/m²) | Sí |
| Contenido (€) | p | importe > 0 | tecleado | p |
| Asistencia plagas, asesoramiento jurídico, impago cuotas, ITE | p (checks) | boolean | — | No |
| DNI/CIF del tomador, tipo documento, póliza a reemplazar | p | texto | — | No |
| Forma de pago (1.er recibo, sucesivos), % comisión | p: si no viene se respeta el defecto del portal | texto libre | — | No |
| Modalidad (estándar / personalizado) | p (defecto estándar; las dos = dos trabajos) | enum | extra | Sí |
| Ascensor, piscina, zonas ajardinadas, calidad | no los escribe el bot (ePAC no los pide); calidad solo para el aviso de infraseguro | — | tecleado | Sí (no necesarios) |

---

## HUECOS (campos que algún bot exige y la ficha no pide, o pide tarde)

Orden: de más a menos grave. Cada punto indica qué bot lo exige y dónde se queda.

1. **Nº de póliza anterior en COCHE (auto).** Allianz Turismos lo exige en «Antecedentes» al elegir la compañía (v0.6.11,
   `HUECO_POLIZA_ACTUAL`, `allianz/auto.ts:~1629`) y Mapfre lo exige si el portal lo marca obligatorio
   (`mapfre/auto.ts:1325-1334`, error `datos` ya DENTRO del portal). `EntradaBotAuto` no tiene `polizaAnteriorUltimos5` (solo moto lo
   lleva, `tarificador-moto-formulario.ts:60`), ni `obligatorios.ts` lo declara para Allianz auto ni Mapfre auto/moto. Resultado: el
   chequeo dice «listo» y el bot se atasca tras abrir el portal. Mapfre: además hay que averiguar si pide el número completo.
2. **Fecha de 1.ª matriculación para Generali auto.** Falla con `datos` si el campo está vacío (`generali/auto.ts:1197-1198`), pero
   `GENERALI_AUTO` (`obligatorios.ts:247-256`) solo declara el vehículo confirmado. La ficha sólo la manda «si consta» y nunca avisa.
   Fuente: vendor por matrícula.
3. **Regla «carné ≥18 años» (Allianz).** Solo está en el bot de MOTO, antes del login (`exigirCarneCoherente`,
   `allianz/auto.ts:1010-1017`). No está en `validarFormularioAuto` (admite 14+, `formulario-auto.ts:480`), ni en la ficha (moto ni coche),
   ni cubre Turismos: el portal lo rechaza («El conductor principal debe ser mayor de 18 al sacarse el carnet») ya dentro (trabajos
   6cd26c10 y e5bcdb08). Debe ir en el validador común y mostrarse en la ficha al elegir fecha de carné.
4. **Documento y CP/localidad del tomador en Allianz Turismos.** El bot necesita tipo de tomador, nº de documento y CP+localidad de
   RESIDENCIA del tomador (`planDatosTurismos`, `allianz/auto.ts:1775-1784`); falta cualquiera → hueco. `ALLIANZ_AUTO`
   (`obligatorios.ts:221-226`) solo declara la compañía actual. `fichaTomador` lo pone asegura al entregar, pero la ficha no lo
   comprueba antes (nunca se ve en rojo). Idem el tipo (Individual/Empresa) contradictorio con el documento.
5. **Compañía anterior y justificante: se piden «tarde» o sin saber cuándo aplican.** Allianz Moto exige compañía, 5 cifras y justificante
   cuando `aniosAseguradoAnterior !== 0`, **incluido sin dato** (el supuesto favorable dice «estuvo asegurado», `obligatorios.ts:175`);
   la ficha lo trata como pendiente solo en moto y el justificante no tiene valor por defecto. En coche, «seguro actual» marcado
   bloquea el botón antes que el resto (`auto-formulario.ts:124`), mezclando un dato con un interruptor de pantalla.
6. **Clase de permiso de MOTO para Mapfre.** El selector de la ficha es el de coche (solo `b` por defecto) y no está en
   `adaptadorMoto.campos`; el bot supone «A» y declara. Si alguien deja `b` en moto, `datos` (`mapfre/auto.ts:741-750`).
7. **Siniestros > 0 en moto.** Allianz Moto (`allianz/auto.ts:915`) y Mapfre moto sin bloque de historial (`mapfre/auto.ts:1346`)
   paran con hueco de mapa, pero la ficha deja introducir el dato sin avisar. Idem **propietario/conductor distinto del tomador** en
   Generali/Mapfre/Allianz (la ficha ya lo corta; Generali exige además `tomadorEsPropietario`/`tomadorEsConductor` no `false`).
8. **Uso, `usoFrecuencia` y fecha de efecto.** Allianz Turismos supone «uso diario» y «mañana» (declarados), pero no hay dónde
   pedirlos (frecuencia de uso, km); el cliente que usa poco el coche recibe precio con supuesto. Fecha de efecto máxima hoy+90 días
   (portal) no se comprueba en la ficha.
9. **Mapfre Hogar: nombre y 1.er apellido del tomador** (si no lo conoce) no se inyectan desde asegura en hogar (`obligatorios.ts:233-236`);
   y **referencia catastral de 20 caracteres** (la de 14 no vale) depende de core-catastro. **Allianz Hogar:** tipo de documento y
   «Valoración de bienes» (capitales) sin mapa; la ficha hoy deja `capitalContinente/Contenido` como opcionales.
10. **Comunidades: sin cuestionario ni chequeo previo.** No tiene adaptador en `tarificador-bots-ramos.ts` ni bloques
    personas/riesgo/póliza; el municipio (si el CP tiene varias poblaciones) no está declarado como obligatorio y el bot falla en `datos`.
    Los desplegables (tipo de vivienda, uso, lista de propietarios) son texto libre con una sola etiqueta conocida; cualquier otro valor
    no admitido por el portal se descubre en el bot.
11. **Generali auto: resto de «Datos de Valoración» sin captura** (tomador, conductor, antecedentes; mapa provisional por etiqueta:
    f. nacimiento, f. carné, CP, años asegurado, siniestros). Es imposible declarar sus obligatorios hasta tener captura; hoy el
    chequeo solo ve el vehículo. Y **dependencia de orden**: solo arranca cuando Allianz/Mapfre de la misma oportunidad ya han dado `ok`
    (`esperaVehiculo`), algo que la ficha no explica antes de pedir el precio.
12. **Sexo del conductor en coche:** la ficha manda `sexo: null` (solo moto lo pide); ningún bot de coche lo exige hoy, pero
    Generali puede pedirlo (sin captura).

### Fuentes de cada dato hoy (para el cuestionario único)
- **Ficha cliente (asegura, al entregar o con `completarDesdeFicha`):** CP de residencia, f. nacimiento, carné (B / A·A1·A2 más antiguo), NIF/CIF, nombre y apellidos o razón social, localidad, sexo por tratamiento Sr./Sra.
- **Oportunidad (`info_riesgo`):** matrícula, `datosVehiculo` (marca, modelo, versión, garaje, `cpCirculacion`, `fechaCompra`, cilindrada), `historialDeclarado` (¿seguro actual?, años asegurado, años sin siniestros, siniestros 5 años, compañía actual, `numeroPoliza`, `fotocopiaAnterior`), `vence`, aseguradora, conductor ocasional, roles/figuras.
- **Póliza subida / cartera:** compañía anterior (respaldo, solo si UNA póliza en vigor), nº de póliza actual (5 últimas cifras por defecto), vencimiento leído.
- **Vendor por matrícula:** `fechaMatriculacion`, marca/modelo/versión (pista; el bot confirma el vehículo real en el portal).
- **Catastro (core-catastro):** hogar y comunidades: año de construcción, m², referencia catastral.
- **Supuesto (declarado en el precio):** uso diario, garaje colectivo, sin 2.º conductor, compra nuevo/ya lo tenía, efecto «mañana», antecedentes «5 años o más / sin siniestros», clase de permiso «A» (moto Mapfre), tomador = propietario = conductor, localidad del portal, versión equivalente.
- **Persona (selector «Elegir…», sin defecto):** hogar (uso, régimen, tipo, madera), justificante del seguro anterior, sexo si la ficha no lo permite.
