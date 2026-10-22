// Turismos v0.6.20 (22/10/2026, runs reales del 19 y 22/10 con `referencia_vendor` NULL: «el formulario «Guardar el presupuesto» no está a la vista»):
// `guardarPresupuestoTurismosAllianz` (guard.ts) ESPERA al bloque, desplaza la pantalla hasta él (scroll, sin clic), da el formulario
// por visible por su BOTÓN (un `<form>` de alto 0 no es «visible» para Playwright) y, si no lo usa, deja un motivo LEGIBLE en el aviso.
// Turismos v0.6.19 / Moto v0.7.21 (21/10/2026, trabajo real: «DIVINA PASTORA / CLEVEREA» sin casar): la compañía anterior COMPUESTA «A / B» (marca / revendedor) prueba cada parte por separado (la primera que casa con UNA sola); si nada casa y el desplegable tiene UNA opción genérica («OTRAS», «RESTO», «VARIAS…») se marca y se DECLARA («Compañía anterior «X» no está en la lista de Allianz: se marca «…»»); sin genérica sigue `datos` con la lista COMPLETA (las afines a cada parte, primero; tope por opciones enteras). Ver compania-actual.ts.
// Moto v0.7.20 (21/10/2026, captura de Alberto de «PRECIOS MODALIDADES»): la prima ANUAL comparable es «Anual sucesivos» del RECIBO BANCARIO (el «Anual 1er Recibo» depende del primer periodo: 182,23 € frente a 275,82 €); el 1er recibo va en avisos y, con sucesivos, se quita el supuesto «primer periodo inferior a un año… no comparable» (sin sucesivos: como antes). Solo LECTURA de lo demás: columnas con ⚠ («Normas de Contratación»), el texto rojo de TIREA y el CUESTIONARIO «Cliente Alto Potencial»/«CAP» (= descuento comercial; Alberto: no se fija aún, «enseñar al bot para el futuro») descritos saneados en avisos; `capAllianz`/`clienteAltoPotencialAllianz` del formulario NO se aplican (aviso). No se pulsa nada nuevo.
// Moto v0.7.19 (21/10/2026, decisión de Alberto): si la fecha de adquisición es anterior a la 1ª matriculación del portal (`#fechaMatriculacion`), venga de donde venga (por defecto, tecleada o sin marca), se escribe la del portal (setter nativo, 0.7.17) y se declara como supuesto con los días de diferencia (sin fechas); ya no para como `datos`. `fechaAdquisicionPorDefecto` se sigue aceptando pero no decide.
// Moto v0.7.18 (21/10/2026): Allianz rechazaba «[fechaAdquisicion] … no puede ser anterior a la fecha de primera matriculación» con la adquisición POR DEFECTO (= nuestra matriculación, que puede ser estimada): antes de escribirla se lee la 1ª matriculación del portal (DGT por matrícula); si la adquisición es la de por defecto (marca `fechaAdquisicionPorDefecto` de plataforma, o = nuestra matriculación) y la del portal es posterior, se usa la del portal y se declara como supuesto; si es explícita (o no se sabe), para como `datos` diciendo cuántos días antes (sin fechas).
// Moto v0.7.17 (21/10/2026): `#driverBirthDate` (máscara `mask:date(224)`, class `input-DateText`) quedaba con el MISMO día y mes y el año +40 → las fechas dd/mm/aaaa se escriben SIN teclas ni foco (setter nativo + `change`), así la máscara no reinterpreta lo tecleado; se relee y, si el año sigue desplazado, para como `portal` diciendo «año desplazado ±N años».
// Moto v0.7.16 (21/10/2026, trabajo real 3e85f80c): la fecha de nacimiento «distinta de todas» lleva la diferencia en días con signo y qué partes coinciden (sin valores) y el formato del campo (type/maxlength/placeholder/máscara); revisada la cadena ficha→tecleo: solo texto, sin zona horaria (sin desfase de ±1 día).
// Moto v0.7.15 (20/10/2026, trabajo real 08abe9d5): el confirm «Primer periodo inferior a 355 días…» al pasar a Datos básicos se responde «No» (excepción exacta del guard, nunca se alarga) y el presupuesto avisa de que la prima no es anual.
// Moto v0.7.14 (20/10/2026, trabajo real 2f90524e): `#driverBirthDate` quedaba con OTRA fecha válida → se dice con cuál coincide (sin el valor); si es la que el portal traía (registro de Allianz) o ninguna del formulario → `datos` «revisa la de la ficha», sin pelearse.
// Moto v0.7.13 (20/10/2026, trabajo real e5bcdb08): el portal perdía `#driverBirthDate` tras escribirlo → blur tras cada texto y UNA reescritura tecleada de lo perdido; el error dice la FORMA (vacío/otra fecha), nunca el valor.
// Moto v0.7.3 (20/10/2026): CP con varias poblaciones → se elige SOLA por la localidad del riesgo (contención de palabras enteras, única; ver poblacion-localidad.ts); varias/ninguna/contradictoria → persona.
// v0.6.18 / Moto v0.7.2 (19/10/2026, decisión de Alberto: «las diferencias entre acabados no son influyentes; el cliente revisa en la emisión»):
// con varias versiones y sin elección de la bandeja, se elige SOLA si son EQUIVALENTES (`versionAutomaticaAllianz`, regla común de
// module-tarificacion: mismo combustible y CV/kW/cc dentro de tolerancia; lo que la etiqueta no dice no cuenta) y se DECLARA en el aviso de
// supuestos («Versión elegida automáticamente: … revisar en la emisión»). Solo si difieren de forma MATERIAL → `ErrorEleccionVersion` con todas.
// v0.6.17 / Moto v0.7.1 (19/10/2026, decisión de Alberto: «la primera» puede dar el precio de otro coche): se REVOCA la elección de
// «el primero de la lista» (tarjetas y `<select>` de Turismos, `<select>` de Moto). Solo se elige si es inequívoco (elección de la bandeja,
// vehículo confirmado o riesgo que casan con UNA); si no, `ErrorEleccionVersion` (requiere_humano) con el texto exacto de cada versión.
// v0.6.16 (19/10/2026, mismo trabajo 02fd821b; el inventario de «Antecedentes» solo traía «Compañía actual del vehículo» y «Fecha de inicio del seguro»):
// las 3 preguntas (tiempo en la compañía, partes culpables, tiempo como titular) y los 5 dígitos de la póliza NO existen hasta elegir la
// compañía y Angular las pinta tarde: tras elegirla se espera (≤6 s, solo lectura) a que suba el nº de opciones marcables antes de contestarlas, en
// vez de dar `sin_grupo` en silencio. Sin dato, favorable y declarado (v0.6.10); con dato, el dato.
// v0.6.15 (19/10/2026, trabajo real 02fd821b atascado en «Antecedentes»: «compañía actual: sin indicar (la del riesgo no está en la lista)»
// con 96 opciones de nombre de registro): casado puro en `compania-actual.ts` (alias por «/» y «-», sin forma societaria, por niveles);
// ambigua o sin casar → `datos` con las candidatas / la lista (nunca se elige); cambio de seguro sin compañía en el riesgo → `datos`
// «falta la compañía actual del vehículo» (obligatorio declarado en module-tarificacion). Ya no se sigue «sin indicar».
// v0.6.14 (18/10/2026, revisión de seguridad): «Guardar presupuesto» relee las 4 casillas justo antes del clic y solo da por
// guardado lo que APARECE tras él (guard.ts); el vehículo marcado viaja como `seleccionVehiculo` (Generali lo usa).
// v0.6.13 (18/10/2026, autorizado por Alberto: «a ver si puede guardar presupuesto»): tras leer los paquetes, «Guardar presupuesto»
// (NO vinculante) por `guardarPresupuestoTurismosAllianz` (guard.ts: lista blanca exacta, «Envío a cliente/agente» y «Mostrar en
// eCliente» DESMARCADAS, solo el identificador sin datos personales); la referencia va a `referenciaPortal`. CP/localidad del tomador:
// Allianz los rellena y BLOQUEA desde su fichero tras el Nº de documento («Datos personales»); no hay otro campo editable: aviso.
// Moto v0.7.0 (18/10/2026, trabajo real atascado en `requiere_eleccion_version` con 20 versiones): la versión NO bloquea
// (`eleccionVersionMotoPorSimilitud`: riesgo normalizado → cilindrada → 1 = esa; varias o ninguna = la primera, DECLARADA), y
// los antecedentes sin dato van al supuesto favorable declarado (`conAntecedentesFavorables`). Se fija por el `<select>` de
// siempre (`resolverVehiculo`: código de la lista leída + relectura).
// v0.6.12 (20/10/2026, trabajo real d675077b llegó a «Selección de paquete»): LECTOR DE PRECIOS. La pantalla es una tabla comparativa `nx-comparison-table` (3 paquetes: «Terceros con lunas», «Tercero Ampliado», «Todo Riesgo con franq.»; cada cabecera trae «primer recibo» y «la anualidad»; filas de cobertura con icono check/minus o desplegable por paquete, filas de elección única que abarcan los 3 paquetes y «Todos los paquetes incluyen»). `leerPaquetesTurismosAllianz` (guard.ts, solo lectura) + `ofertasDesdePaquetesTurismos` devuelven una oferta por paquete con supuestos y coberturas; importe ilegible → fuera + aviso; sin tabla → hueco como antes. No se pulsa nada en esta pantalla.
// v0.6.11 (19/10/2026, trabajo real atascado en «Antecedentes» con «qué falta para habilitar SIGUIENTE»): el input obligatorio «Cinco últimos dígitos de la póliza actual» (aparece al haber compañía actual) se rellena con `polizaAnteriorUltimos5` del riesgo por la puerta `polizaActualTurismosAllianz` (guard.ts); sin dato → hueco con nombre, nunca inventado; ya con valor → «fijada por Allianz». El atasco genérico lista ahora las etiquetas de los obligatorios vacíos/inválidos del paso. Los 5 dígitos nunca van a supuestos, avisos ni errores.
// v0.6.10 (18/10/2026, decisión de Alberto «supuesto favorable»): «Antecedentes» contesta las 3 preguntas que bloqueaban «SIGUIENTE» (tiempo en la compañía, partes culpables, tiempo como titular): con dato del riesgo la opción que casa; sin dato, la más favorable y DECLARADA (guard.ts).
// v0.6.9 (18/10/2026): «Compañía actual del vehículo» casa también por contención de la clave de la ficha en la opción (solo si hay UNA candidata; guard.ts).
// v0.6.8 (18/10/2026): «Compañía actual del vehículo» se localiza también cuando la cabecera real no lleva `text` ni es hija directa del formulario (guard.ts).
// v0.6.7 (18/10/2026, decisión de Alberto): campo bloqueado con valor no vacío y distinto del riesgo → se acepta el del portal y se declara como supuesto (no hueco); vacío sigue siendo hueco. CP: solo cifras a 5 dígitos; localidad sin prefijo «NNNNN - ».
// v0.6.6 (18/10/2026, trabajo real 3553424d muerto en «Datos personales» con un timeout crudo de `fill` sobre el «Código postal» del
// tomador, que el portal deja DESHABILITADO y relleno tras el documento): en los pasos 2-3 un campo bloqueado (disabled/readonly) no
// se teclea: se LEE y vale si casa (normalizado) con el riesgo, o si el riesgo no trae el dato y el portal sí; si no casa o está
// vacío → hueco con motivo. Todo tecleo con tope corto y su fallo → hueco (el error de Playwright, que lleva el valor, no sube).
// Igual «Localidad». Moto no cambia. Ver «campos DESHABILITADOS».
// v0.6.5 (17/10/2026, trabajo real 590a330e parado en «Datos del vehículo» con huecos que NO eran de ese paso): el HTML real dice
// que el asistente tiene un `tabpanel` por paso, todos en el DOM. Tomador, documento, CP/localidad, fechas del conductor y segundo
// conductor son de «Datos personales»; la fecha de efecto y la compañía actual, de «Antecedentes»; «Nivel antecedentes»
// (deshabilitado, lo calcula el portal) y «Colaborador» (opcional, vacío = sin colaborador), del panel de agente de «Selección de
// paquete»; la dirección, de «Datos» (emisión, después del precio). El bot recorre los tres primeros pasos con su «SIGUIENTE» (texto
// real « Siguiente »), cada uno solo sin huecos; la compañía actual sigue en hueco (opciones sin mapa). Ver «Turismos · pasos».
// v0.6.4 (17/10/2026, trabajo real ebe2bb1e atascado con «faltan el resultado de «Encuentra mi vehículo»»): el resultado NO es un
// modal ni un `<select>` «Versión»: son TARJETAS SELECCIONABLES (`nx-selectable-card`) DENTRO del marco `appArea`, bajo el
// encabezado «Detalles del vehículo»: un control por vehículo con id dinámico `ng-…-nx-selectable-card-N`, SIN `name`, y su
// `<label for>` hermano «Marca del vehículo … Modelo … Tipo de combustible …»; «SIGUIENTE» sigue deshabilitado hasta elegir.
// Elección (Alberto, 17/10/2026, «como Avant2»): la de la bandeja (`eleccionVersion`) o la del vehículo confirmado por similitud
// (`eleccionVersionConOrigen`, CV/CC de la etiqueta); si no, LA PRIMERA, declarada como supuesto. Leer y marcar la tarjeta es de
// guard.ts (`leerTarjetasVehiculoTurismosAllianz` / `ctx.marcarTarjetaVehiculoTurismos`): aquí solo se decide CUÁL. Moto no cambia.
// v0.6.3 (17/10/2026, trabajo real c0a75a2c atascado con «Matrícula (hay 2, se esperaba uno)»): la cabecera de ePac vive en el
// marco PRINCIPAL y `appArea` es el IFRAME del motor; dentro de él había DOS «Matrícula» (una no visible). Los campos de texto del
// paso se localizan con `localizarControl` (src/localizar.ts) en la zona `appArea` DEL MARCO: descarta ocultos, deshabilitados,
// cabecera/menús, buscadores y bancarios; 1 → ese; 0 o ≥2 → hueco con inventario (y atasco del formador en «Matrícula»).
// Botones y «Versión», solo los VISIBLES. Nunca se adivina entre dos válidos.
// v0.6.2 (15/10/2026, decisión de Alberto): compra, uso, fecha de efecto, garaje colectivo/individual y segundo conductor ya NO son
// huecos: si el riesgo no los trae, el bot usa un valor «no determinante» (`supuestosAuto` de module-tarificacion) y lo DECLARA
// («Precio con supuestos: …» en el error y en cada oferta). Mismo cuidado que 0.6.1: opciones solo por la puerta de guard.ts (lista
// cerrada, grupo exacto), opción no encontrada → hueco. Siguen siendo hueco: antecedentes (valores sin mapa), colaborador y dirección.
// v0.6.1 (15/10/2026): búsquedas por etiqueta acotadas a la zona `appArea` (la cabecera de ePac ya no cuenta) y resto del paso
// «Datos del vehículo» con los datos inequívocos del riesgo (garaje en la calle, tipo de tomador, documento, CP y localidad del
// tomador, fechas del conductor); lo demás, huecos, y con huecos no se pulsa «SIGUIENTE». IBAN/BIC NUNCA (frontera de guard.ts).
// v0.6.0 (15/10/2026): Turismos se explora POR PASOS en el marco del motor `ngx-motor-azs`, con controles por etiqueta/rol
// accesible (sección «Turismos · paso Datos del vehículo»); lo que sigue a «SIGUIENTE» es hueco con inventario. Moto no cambia.
// Allianz ePAC AUTOS (turismo) y MOTO — EN CONSTRUCCIÓN (10/10/2026). NO está registrado en `adapters/index.ts`:
// solo explora (AUTO_ACTIVO = true desde 15/10/2026, sin mapa). Ver docs/TARIFICADOR-RPA.md «Allianz Autos/Moto».
//
// Fuente: grabaciones del marcador del 08/10 (Auto: home + modal «Nueva Alta»; el formulario quedó en un iframe que
// el grabador NO pudo leer) y del 09/10 (Moto «Motos-online», iframe `appArea` legible: Riesgo municipio, Datos
// básicos, Tarificar, Referencia). Se asume que Turismos usa el MISMO framework legado que Moto (ids iguales):
// TODO(capturas) confirmarlo con la grabación del formulario de Turismos.
// ⚠️ Grabación de Turismos del 13/10/2026 (4 pantallas, la 3.ª en tres intentos): el iframe `appArea` lo carga
// `form#applicationForm` (target="appArea", GET) contra el puente SSO de OTRO ORIGEN (`cloud.e-pacallianz.com/
// rws-router-sso-domain-bridge/bridge`, RelayState `ngx-motor-azs/`): app Angular distinta, no el legado de Moto
// (cuyo `appArea` sí era legible). El grabador (bookmarklet) no lee marcos de otro origen → sigue SIN formulario, sin
// buscador de poblaciones y sin Tarificar. Indicio fuerte de que los ids de Moto (td#datosBasicos/td#rate, #licensePlate…)
// NO valen para Turismos: no se reutilizan a ciegas. Para grabarlo: abrir la app del puente en su propia pestaña.
// INVENTARIO (13/10/2026, OK de Alberto a que el BOT lea la estructura): al entrar en Turismos, si en 25 s no aparece
// `#licensePlate` (o el marco que lo tiene es la app nueva), `ErrorMapaIncompleto` ANTES de rellenar nada; todo
// `ErrorMapaIncompleto` pide al runner el inventario de estructura de TODOS los marcos (src/inventario-dom.ts, solo
// lectura) que viaja en `error.inventarioDom` y asegura guarda en el `error` jsonb del trabajo.
//
// MOTO, grabación del 13/10/2026 (14 pantallas, marcos legibles): ENTRADA Nueva Alta → Autos → Moto confirmada; formulario
// EDITABLE de «Riesgo municipio» (vehículo en CASCADA marca → clase → modelo → versión, SIN búsqueda por matrícula; CP con
// buscador de poblaciones; ¿tomador es conductor/propietario?) y de «Datos básicos» (uso, conductor, sexo, matrícula que
// autorrellena la 1ª matriculación, antecedentes); pantalla de ERROR («INFORME DE AVISO E INCIDENCIAS»). Todo lo de Moto está
// en la sección «MOTO» de este fichero. Lo que FALTA (ver docs/TARIFICADOR-MATRIZ.md 0b): el buscador de poblaciones tras
// pulsar la lupa (HECHO 13/10/2026 con el inventario de estructura: celdas `receivedDataLocationFinder`), el avance entre pestañas (usa `aceptar_onclick()`, que el guard rechaza) y qué campos son obligatorios.
//
// Flujo: login → «Nueva Alta» → sección Autos → tarjeta (Turismos | Moto) → consulta por MATRÍCULA (el portal rellena
// marca/modelo/versión) → vehículo canónico (si hay varias versiones: requiere_humano con las opciones) → Datos básicos
// del conductor → [HUECO] avance a Tarificar → lector de primas (hecho, puro).
//
// SEGURIDAD: el robot NUNCA emite ni contrata. Aquí no hay selectores ni lógica para td#store «Archivar»,
// td#contract «Emitir», el botón del pie de Tarificar (validar_…) ni IPID: los bloquea `guard-emision.ts`. El avance de
// pestaña de esta app usa el handler de «Aceptar», que `ctx.pulsar()` rechaza: hará falta una función guardada por
// FASE en guard.ts (como la de Comunidades) — por eso el avance es un HUECO declarado. La matrícula es dato personal:
// solo se escribe en su campo; nunca en logs, trazas ni mensajes. Sin credenciales en el código.

import type { Frame, Locator, Page } from 'playwright'
import {
  clavePoblacion,
  comprobarBoton,
  conAntecedentesFavorables,
  conDatosUsados,
  MAX_DESCRIPCION_VEHICULO,
  pareceDatoPersonalEnDescripcion,
  AVISO_VERSION_POR_SIMILITUD,
  documentoTomadorDe,
  esCif,
  esDniNie,
  eleccionPorVehiculoConfirmadoDeEtiquetas,
  elegirVersionAutomaticamente,
  datosEquivalenciaDesdeEtiqueta,
  referenciaRiesgoVersion,
  etiquetasSupuestos,
  esOpcionVacia,
  fechaIsoDesdeTexto,
  codigoPostalTomadorDe,
  localidadTomadorDe,
  leerCeldaPoblacion,
  importeEs,
  mensajeEleccionPoblacion,
  mensajeEleccionVersion,
  opcionesPoblacionDesdeCeldas,
  PREFIJO_SUPUESTOS,
  redactarDatosPersonales,
  resolverPoblacion,
  resolverVersion,
  supuestosAuto,
  senalCuentaBancaria,
  textoSupuestos,
  vehiculoDesdeLectura,
  type CandidatoVersion,
  type EleccionVersion,
  type CoberturaOferta,
  type FormularioAuto,
  type FranquiciaOferta,
  type LecturaVehiculoPortal,
  type OfertaNormalizada,
  type OpcionPoblacion,
  type ResultadoAdaptador,
  type SeleccionVehiculo,
  type SupuestosAuto,
  type Vehiculo,
} from '@central/module-tarificacion'
import type { ContextoPortal } from '../../adaptador.ts'
import { ErrorTarificador } from '../../errores.ts'
import { elegirPoblacionPorLocalidades } from './poblacion-localidad.ts'
import { casarCompaniaActual, indiceOpcionGenerica, normalizarCompania, mensajeCompaniaAmbigua, PREFIJO_SUPUESTO_COMPANIA_GENERICA, supuestoCompaniaGenerica } from '../../compania-actual.ts'
import { conRespaldoIA, registrarAtasco, sugerirOpcion, type PeticionResolver } from '../../formador.ts'
import { ErrorMapaIncompleto as ErrorLocalizar, localizarControl } from '../../localizar.ts'
import {
  ENCABEZADO_TARJETAS_VEHICULO_TURISMOS,
  type ClaveAntecedenteTurismos,
  ErrorAvanceSinLlegar,
  ETIQUETA_POLIZA_ACTUAL_TURISMOS,
  esAppTurismosAllianz,
  exigirCampoNoBancario,
  leerPaquetesTurismosAllianz,
  leerTarjetasVehiculoTurismosAllianz,
  identificadorPresupuestoTurismos,
  leerDatosUsadosTurismosAllianz,
  type ResultadoGuardarPresupuestoTurismos,
  type LecturaPaquetesTurismos,
  SEL_FUERA_CABECERA_TURISMOS,
  SEL_ZONA_APP_TURISMOS,
  type TarjetaVehiculoTurismos,
  contarOpcionesMarcablesTurismos,
  supuestosAvanceAceptados,
  CONFIRMS_AVANCE_ACEPTABLES,
} from '../../guard.ts'
import { abrirNuevaAlta, fechaEs, login, marcoCon, sesionSirve, TARJETA_AUTOS } from './intranet/index.ts'

/** Flag de registro de TURISMOS: ENCENDIDO el 15/10/2026 (Alberto) para EXPLORAR con riesgos reales; sin mapa reconoce el marco o cae en ErrorMapaIncompleto + inventario antes de escribir. */
export const AUTO_ACTIVO = true
/**
 * Flag de registro de MOTO (separado de Turismos). ENCENDIDO por Alberto el 13/10/2026 para la primera prueba real
 * (la fila `allianz/moto` de `companias_integracion` sigue siendo el interruptor de BD). `adapters/index.ts` registra
 * `allianzMoto` solo con él en `true` y el runner ya valida el riesgo por ramo (`ramo.ts`).
 */
export const MOTO_ACTIVO = true

/**
 * Hueco declarado: falta un mapa de pantalla. NO transitorio → `error_definitivo`, no se reintenta. Pide al runner el
 * INVENTARIO DE ESTRUCTURA de todos los marcos (`pideInventarioDom`, OK de Alberto 13/10/2026; solo lectura, saneado)
 * para mapear la pantalla sin grabación humana.
 */
export class ErrorMapaIncompleto extends ErrorTarificador {
  /** SOLO true en dos huecos: la entrada a Turismos y el buscador de poblaciones de moto. El resto NO captura. */
  readonly pideInventarioDom: boolean
  /** true = el hueco es un caso de DATOS/negocio o de configuración (no una pantalla sin reconocer): error definitivo, sin atasco de pantalla. */
  readonly sinAtasco: boolean
  constructor(que: string, pideInventarioDom = false, sinAtasco = false) {
    super('portal', `allianz/auto: mapa incompleto: faltan ${que}`)
    this.pideInventarioDom = pideInventarioDom
    this.sinAtasco = sinAtasco
    this.name = 'ErrorMapaIncompleto'
  }
}

/**
 * El catálogo ofrece varias versiones y nadie ha elegido: para y pide una persona (`requiere_humano`; en el cable
 * viaja como `eleccion` desde el 15/10/2026 —antes `captcha`, etiqueta engañosa en la traza—). El mensaje lleva SOLO nombres de catálogo.
 */
export class ErrorEleccionVersion extends ErrorTarificador {
  readonly opciones: CandidatoVersion[]
  /** La lista COMPLETA viaja estructurada en `error.opcionesVersion` del resultado (`opcionesVersionDe` en errores.ts). */
  readonly opcionesVersion: CandidatoVersion[]
  constructor(opciones: CandidatoVersion[]) {
    super('eleccion', mensajeEleccionVersion(opciones))
    this.name = 'ErrorEleccionVersion'
    this.opciones = opciones
    this.opcionesVersion = opciones
  }
}

/**
 * El CP tiene VARIAS poblaciones y ni la `poblacion` del riesgo casa con UNA ni hay `eleccionPoblacion` válida: para y pide
 * una persona (`requiere_humano`, en el cable `eleccion`, como `ErrorEleccionVersion`). La lista viaja en
 * `error.opcionesPoblacion` (`opcionesPoblacionDe` en errores.ts): `codigo` = texto EXACTO de la celda del portal.
 */
export class ErrorEleccionPoblacion extends ErrorTarificador {
  readonly opcionesPoblacion: OpcionPoblacion[]
  constructor(opciones: OpcionPoblacion[]) {
    super('eleccion', mensajeEleccionPoblacion(opciones))
    this.name = 'ErrorEleccionPoblacion'
    this.opcionesPoblacion = opciones
  }
}

// ───────────────────────── selectores (mapa Moto 09/10/2026) ─────────────────────────

/** Ids estables de la app de vehículos (iframe `appArea`). */
export const SEL_VEHICULO = {
  /** Dispara la consulta por matrícula del portal en su `change`. */
  matricula: '#licensePlate',
  marca: '#marca',
  clase: '#clase',
  modelo: '#modelo',
  version: '#version',
  /** Texto de la versión elegida y potencia (solo lectura). */
  modeloVersion: '#modelVersion',
  potencia: '#motorPower',
  fechaMatriculacion: '#fechaMatriculacion',
  /** Hidden con el código del vehículo en el catálogo de Allianz. */
  codigoCatalogo: '#mobileCode',
} as const

export const SEL_DATOS_BASICOS = {
  codigoPostal: '#_cpostalCode',
  conductorNacimiento: '#driverBirthDate',
  conductorCarne: '#driverLicenseDate',
  conductorSexo: '#driverSex',
  garajeNoche: '#garageNight',
  aniosCompaniaAnterior: '#yearsOrigCompany',
  siniestros: '#numDisasters',
} as const

// ───────────────────────── guard de los CAMBIOS de campo ─────────────────────────

/**
 * Antes de CUALQUIER cambio en un control del portal (`fill` + `change`, `selectOption`, `setChecked`): sus
 * manejadores (`onchange`, `onclick`, `oninput`…) y su identidad pasan por el guard de emisión. Un cambio dispara el
 * JavaScript del portal igual que un clic: si ese manejador archiva/emite/avanza, se para ANTES de tocar nada.
 */
export async function comprobarCampo(campo: Locator): Promise<void> {
  // Sin funciones con nombre dentro de `evaluate` (tsx les mete `__name`, que no existe en la página).
  const desc = await campo.evaluate(
    (el, attrs) => {
      const h = el as HTMLElement & { name?: unknown }
      return [h.id || null, typeof h.name === 'string' ? h.name : null, ...attrs.map((n) => h.getAttribute(n))]
    },
    ATRIBUTOS_CAMPO,
  )
  comprobarBoton(desc)
  // Frontera de emisión (14/10/2026): un campo de cuenta bancaria nunca se escribe ni se elige.
  await exigirCampoNoBancario(campo)
}

/** Lo que describe un control antes de cambiarlo: etiquetas y TODOS los manejadores que un cambio puede disparar. */
const ATRIBUTOS_CAMPO = ['aria-label', 'title', 'onchange', 'onclick', 'oninput', 'onblur', 'onfocus', 'onfocusout', 'onkeydown', 'onkeyup', 'onkeypress', 'onmousedown', 'onmouseup', 'formaction']

// ───────────────────────── consulta por matrícula → vehículo ─────────────────────────

/** Lee lo que el portal dejó tras la consulta (solo lectura). Un campo que no está → `null`. */
export async function leerVehiculoPortal(raiz: Pick<Frame, 'locator'>): Promise<LecturaVehiculoPortal> {
  const valor = async (sel: string) => {
    const l = raiz.locator(sel).first()
    if ((await l.count()) === 0) return null
    const v = await l.inputValue({ timeout: 1_000 }).catch(() => null)
    return v === null || v.trim() === '' ? null : v.trim()
  }
  const select = async (sel: string) => {
    const l = raiz.locator(sel).first()
    if ((await l.count()) === 0) return { elegida: null as CandidatoVersion | null, opciones: [] as CandidatoVersion[] }
    return l.evaluate((el) => {
      const s = el as HTMLSelectElement
      const opciones = Array.from(s.options).map((o) => ({ etiqueta: (o.textContent ?? '').trim(), codigo: o.value || null }))
      const o = s.selectedIndex >= 0 ? s.options[s.selectedIndex] : null
      const elegida = o && o.value ? { etiqueta: (o.textContent ?? '').trim(), codigo: o.value } : null
      return { elegida, opciones }
    })
  }
  const marca = await select(SEL_VEHICULO.marca)
  const modelo = await select(SEL_VEHICULO.modelo)
  const version = await select(SEL_VEHICULO.version)
  return {
    marca: marca.elegida?.etiqueta ?? null,
    modelo: modelo.elegida?.etiqueta ?? null,
    versionSeleccionada: version.elegida,
    versiones: version.opciones,
    // TODO(capturas): Moto no enseña combustible; en Turismos está por ver. Sin campo → null (no se deduce).
    combustible: null,
    potencia: await valor(SEL_VEHICULO.potencia),
    // TODO(capturas): unidad de `motorPower` sin confirmar (en Moto parece CV): sin unidad no se asume.
    unidadPotencia: null,
    fechaMatriculacion: await valor(SEL_VEHICULO.fechaMatriculacion),
    codigoCatalogo: await valor(SEL_VEHICULO.codigoCatalogo),
  }
}

/**
 * Teclea la matrícula (solo `fill` + evento `change`, que es lo que lanza la consulta del portal) y espera a que el
 * catálogo responda con marca y modelo. La matrícula no se escribe en ningún log.
 */
export async function consultarMatricula(raiz: Pick<Frame, 'locator'>, matricula: string, page: Pick<Page, 'waitForTimeout'>, timeoutMs = 20_000): Promise<LecturaVehiculoPortal> {
  const campo = raiz.locator(SEL_VEHICULO.matricula).first()
  if ((await campo.count()) === 0) throw new ErrorTarificador('portal', 'allianz/auto: no aparece el campo de matrícula')
  await comprobarCampo(campo)
  await campo.fill(matricula)
  await campo.dispatchEvent('change')
  const fin = Date.now() + timeoutMs
  for (;;) {
    const l = await leerVehiculoPortal(raiz)
    // El catálogo puede rellenar marca/modelo antes que las versiones: se espera a tener alguna versión.
    const conVersion = l.versionSeleccionada !== null || l.versiones.some((v) => !esOpcionVacia(v.etiqueta))
    if (l.marca && l.modelo && conVersion) return l
    if (Date.now() >= fin) {
      if (l.marca && l.modelo) return l
      throw new ErrorTarificador('datos', 'allianz/auto: la consulta por matrícula no devolvió marca y modelo')
    }
    await page.waitForTimeout(500)
  }
}

/**
 * Elección de versión que se usa (14/10/2026). La de una PERSONA o la IA/memoria (`eleccionVersion`) manda siempre; si no hay,
 * la del VEHÍCULO CONFIRMADO por Mapfre (`vehiculoConfirmado`) POR SIMILITUD: Mapfre saca el vehículo exacto y aquí no hace falta
 * coincidencia exacta, basta la versión «prácticamente la misma» (CV ±10 %, CC ±5 % leídos de la etiqueta; gana la más próxima,
 * empate → la primera). Si ninguna entra en tolerancia o la lista no trae CV/CC legibles → `null` y sigue el flujo de siempre
 * (requiere_humano → memoria/IA/persona). Pura. `porSimilitud` deja la traza de que no fue una elección explícita.
 */
export function eleccionVersionConOrigen(lectura: Pick<LecturaVehiculoPortal, 'versiones'>, form: Pick<FormularioAuto, 'eleccionVersion' | 'vehiculoConfirmado'>): { eleccion: EleccionVersion | null; porSimilitud: boolean } {
  const explicita = form.eleccionVersion ?? null
  if (explicita && (explicita.codigo?.trim() || explicita.etiqueta?.trim())) return { eleccion: explicita, porSimilitud: false }
  const porSimilitud = eleccionPorVehiculoConfirmadoDeEtiquetas(form.vehiculoConfirmado ?? null, lectura.versiones)
  return { eleccion: porSimilitud, porSimilitud: porSimilitud !== null }
}

export function eleccionVersionEfectiva(lectura: Pick<LecturaVehiculoPortal, 'versiones'>, form: Pick<FormularioAuto, 'eleccionVersion' | 'vehiculoConfirmado'>): EleccionVersion | null {
  return eleccionVersionConOrigen(lectura, form).eleccion
}

// ───────────────────────── MOTO: versión por regla fija (v0.7.1, 19/10/2026) ─────────────────────────
// Decisión de Alberto (19/10/2026): NUNCA «la primera» (v0.7.0 lo hacía y podía dar el precio de otra moto). Con varias versiones en
// el desplegable y sin elección explícita, se elige SOLO si es inequívoco (una única candidata que case con marca/modelo/descripción
// del riesgo y su cilindrada, o una única de la cilindrada del riesgo); ambiguo → `ErrorEleccionVersion` (requiere_humano).

const normalizarVersion = (t: string): string =>
  t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/C\.\s*C\.?/g, 'CC').replace(/[^A-Z0-9]+/g, ' ').trim()
const tokensVersion = (t: string): string[] => normalizarVersion(t).split(' ').filter((x) => x !== '')
/** Cilindradas que nombra una etiqueta («798C.C.» → 798; «895 CC» → 895). */
const cilindradasDe = (etiqueta: string): number[] => [...normalizarVersion(etiqueta).matchAll(/\b(\d{2,4}) ?CC\b/g)].map((m) => Number(m[1]))

/**
 * Elección AUTOMÁTICA de la versión de moto. Pura, sin «la primera». Orden: (1) opciones cuyas palabras (sin la cilindrada) están
 * TODAS en marca + modelo + descripción del riesgo; (2) de ellas, las de la cilindrada del riesgo (si filtrar no deja ninguna, se
 * conservan); (3) UNA sola → `unica`; varias → `ambigua` con ESAS (las que casan; el texto exacto de cada una); (4) ninguna casa
 * por palabras: si la cilindrada del riesgo deja UNA sola → esa; si no → `ambigua` con todas. `null` = no hace falta elegir
 * (0 o 1 opciones).
 */
export function eleccionVersionMotoPorSimilitud(
  versiones: readonly CandidatoVersion[],
  sel: Pick<SeleccionVehiculo, 'marca' | 'modelo' | 'cilindradaCc' | 'descripcion'> | null | undefined,
): { tipo: 'unica'; eleccion: EleccionVersion } | { tipo: 'ambigua'; opciones: CandidatoVersion[] } | null {
  const ops = versiones.filter((v) => !esOpcionVacia(v.etiqueta))
  if (ops.length <= 1) return null
  const delRiesgo = new Set(tokensVersion([sel?.marca, sel?.modelo, sel?.descripcion].filter((x): x is string => typeof x === 'string').join(' ')))
  const cc = typeof sel?.cilindradaCc === 'number' ? sel.cilindradaCc : null
  const esCc = (t: string) => /^\d+CC$/.test(t) || (cc !== null && t === String(cc))
  const casan = ops.filter((o) => tokensVersion(o.etiqueta).filter((t) => !esCc(t)).every((t) => delRiesgo.has(t)))
  const porCc = (l: readonly CandidatoVersion[]) => (cc === null ? [...l] : l.filter((o) => cilindradasDe(o.etiqueta).includes(cc)))
  const elegir = (o: CandidatoVersion) => ({ tipo: 'unica' as const, eleccion: { codigo: o.codigo, etiqueta: o.etiqueta } })
  if (casan.length) {
    const finos = porCc(casan).length ? porCc(casan) : casan
    return finos.length === 1 ? elegir(finos[0]!) : { tipo: 'ambigua', opciones: finos }
  }
  const soloCc = cc === null ? [] : porCc(ops)
  return soloCc.length === 1 ? elegir(soloCc[0]!) : { tipo: 'ambigua', opciones: ops }
}

/**
 * Elección AUTOMÁTICA por EQUIVALENCIA (v0.6.18 / Moto v0.7.2, 19/10/2026). Candidatas = opciones del desplegable o tarjetas (los datos
 * salen de la ETIQUETA: «163 CV», «2902 cc», «Potencia (kW) 163», «Diésel»; lo que no se puede leer no cuenta). Equivalentes → índice de la
 * elegida (de `opciones`) + el supuesto a declarar; la elección de la bandeja (`form.eleccionVersion`) casa exacta, sin supuesto; diferencias
 * MATERIALES (combustible, CV/cc fuera de tolerancia) o nada compatible con el riesgo → `ErrorEleccionVersion` con `mostrar` (por defecto,
 * todas). PURA salvo el lanzamiento.
 */
export function versionAutomaticaAllianz(
  opciones: readonly CandidatoVersion[],
  form: Pick<FormularioAuto, 'eleccionVersion' | 'vehiculoConfirmado' | 'seleccionVehiculo' | 'fechaMatriculacion'>,
  mostrar: readonly CandidatoVersion[] = opciones,
): { indice: number; eleccion: EleccionVersion; supuesto: string | null } {
  const r = elegirVersionAutomaticamente(
    opciones.map((o) => ({ etiqueta: o.etiqueta, codigo: o.codigo, datos: datosEquivalenciaDesdeEtiqueta(o.etiqueta) })),
    { riesgo: referenciaRiesgoVersion(form), eleccion: form.eleccionVersion ?? null },
  )
  if (r.tipo === 'ninguna') throw new ErrorTarificador('portal', 'allianz/auto: el portal no ofrece ninguna versión utilizable')
  if (r.tipo === 'preguntar') throw new ErrorEleccionVersion(mostrar.filter((o) => !esOpcionVacia(o.etiqueta)).map((o): CandidatoVersion => ({ etiqueta: o.etiqueta, codigo: o.codigo })))
  return { indice: r.indice, eleccion: r.eleccion, supuesto: r.supuesto }
}

/**
 * Lectura → vehículo canónico, o para. Varias versiones sin elección → `ErrorEleccionVersion` (requiere_humano);
 * sin marca/modelo/versión → error `datos`. La versión resuelta se deja FIJADA en el `<select>` nativo por el código
 * de SU opción (nunca por el hidden `mobileCode`, que refleja lo que el portal tenía antes, ni por parecido); después se
 * RELEE el desplegable y, si no tiene ese código, se aborta (`portal`): el resultado nunca anuncia una versión que el
 * portal no tiene puesta.
 */
export async function resolverVehiculo(raiz: Pick<Frame, 'locator'>, lectura: LecturaVehiculoPortal, form: Pick<FormularioAuto, 'eleccionVersion' | 'vehiculoConfirmado'>): Promise<Vehiculo> {
  const { eleccion, porSimilitud } = eleccionVersionConOrigen(lectura, form)
  const r = vehiculoDesdeLectura(lectura, eleccion)
  if (r.tipo === 'ambigua') throw new ErrorEleccionVersion(r.opciones)
  if (r.tipo === 'incompleto') throw new ErrorTarificador('datos', `allianz/auto: el portal no da ${r.faltan.join(', ')} del vehículo`)
  const codigo = r.opcion.codigo
  const select = raiz.locator(SEL_VEHICULO.version).first()
  if ((await select.count()) === 0) throw new ErrorTarificador('portal', 'allianz/auto: no aparece el desplegable de versión')
  if (!codigo) throw new ErrorTarificador('portal', 'allianz/auto: la versión resuelta no tiene código en el desplegable: no se puede fijar')
  if ((await select.inputValue()) !== codigo) {
    await comprobarCampo(select)
    await select.selectOption(codigo)
  }
  if ((await select.inputValue()) !== codigo) throw new ErrorTarificador('portal', 'allianz/auto: el portal no dejó fijada la versión resuelta')
  return porSimilitud ? { ...r.vehiculo, versionPorSimilitud: true } : r.vehiculo
}

// ───────────────────────── Datos básicos (conductor) ─────────────────────────

/** Plan de escritura de Datos básicos: [selector, valor] en orden. Puro. Lo que no consta no se escribe. */
export function planDatosBasicos(f: FormularioAuto): Array<readonly [string, string]> {
  const plan: Array<readonly [string, string]> = [
    [SEL_DATOS_BASICOS.codigoPostal, f.codigoPostal],
    [SEL_DATOS_BASICOS.conductorNacimiento, fechaEs(f.conductor.fechaNacimiento)],
    [SEL_DATOS_BASICOS.conductorCarne, fechaEs(f.conductor.fechaCarne)],
  ]
  if (f.siniestrosUltimos5Anios !== null) plan.push([SEL_DATOS_BASICOS.siniestros, String(f.siniestrosUltimos5Anios)])
  // TODO(capturas): valores de `driverSex`, `yearsOrigCompany` y `use` (desplegables) sin ver las opciones: no se tocan.
  return plan
}

export async function rellenarDatosBasicos(raiz: Pick<Frame, 'locator'>, f: FormularioAuto): Promise<void> {
  for (const [sel, valor] of planDatosBasicos(f)) {
    const campo = raiz.locator(sel).first()
    if ((await campo.count()) === 0) throw new ErrorTarificador('portal', `allianz/auto: no aparece el campo ${sel} de Datos básicos`)
    await comprobarCampo(campo)
    await campo.fill(valor)
    await campo.dispatchEvent('change')
  }
  if (f.garajeNoche !== null) {
    const g = raiz.locator(SEL_DATOS_BASICOS.garajeNoche).first()
    if ((await g.count()) > 0) {
      await comprobarCampo(g)
      await g.setChecked(f.garajeNoche)
    }
  }
}

/**
 * Avance entre pestañas. Grabación 13/10/2026: AMBOS avances hacia delante (`td#datosBasicos` desde Riesgo municipio y `td#rate`
 * desde Datos básicos) ejecutan el manejador de confirmación del portal, que `ctx.pulsar()` rechaza.
 *   · MOTO: autorizado por Alberto (13/10/2026) SOLO por `ctx.avanzarPestanaAutorizada` (guard.ts: lista blanca exacta de los
 *     dos selectores + ventana de red con dos capas). Puede dejar un PROYECTO guardado en Allianz; nunca una póliza.
 *   Devuelve el marco donde está el formulario de la pestaña DESTINO (ahí se leen incidencias y campos).
 *   · TURISMOS (y cualquier ramo sin decir): sigue siendo HUECO (`ErrorMapaIncompleto`), sin formulario grabado.
 */
export async function avanzarPestanaGuardada(_page: Page, ctx: ContextoPortal, destino: 'datosBasicos' | 'tarificar', ramo: 'auto' | 'moto' = 'auto'): Promise<Frame> {
  if (ramo !== 'moto') {
    throw new ErrorMapaIncompleto(
      destino === 'datosBasicos'
        ? 'el avance guardado por fase de Riesgo municipio a Datos básicos (td#datosBasicos, manejador de avance con confirmación)'
        : 'el avance guardado por fase de Datos básicos a Tarificar (td#rate, manejador de avance con confirmación)',
    )
  }
  if (typeof ctx?.avanzarPestanaAutorizada !== 'function') throw new ErrorMapaIncompleto('el avance autorizado de pestaña en el contexto del worker', false, true)
  try {
    return await ctx.avanzarPestanaAutorizada(destino === 'datosBasicos' ? 'td#datosBasicos' : 'td#rate')
  } catch (e) {
    // El portal no dejó avanzar: si su informe de incidencias trae errores (en el marco de ORIGEN o donde aparezcan), el
    // trabajo cae como `datos` con SU mensaje (redactado); si no, sigue el error del guard (`portal`).
    if (e instanceof ErrorAvanceSinLlegar) for (const m of e.marcos) await lanzarSiHayErrores(m)
    throw e
  }
}

/** HUECO: el avance de Riesgo municipio / Datos básicos a Tarificar (Turismos y compatibilidad). */
export async function avanzarATarificarAutos(page: Page, ctx: ContextoPortal): Promise<never> {
  await avanzarPestanaGuardada(page, ctx, 'tarificar')
  throw new ErrorMapaIncompleto('el avance guardado por fase a Tarificar (pantallas editables de Riesgo municipio y Datos básicos ANTES de calcular)')
}

// ───────────────────────── lector de primas de Tarificar (puro) ─────────────────────────

/**
 * Tabla «PRECIOS MODALIDADES»: una columna por modalidad (`input[name=numModality]`, id `modality_<m>`, etiqueta debajo)
 * y, por forma de pago, celdas `td#<m>_<F|B>_<A|S|T>_<fila>_0` (fila 0 = primer recibo, 1 = sucesivos). Se lee el
 * recibo BANCARIO anual (`B_A`). Una modalidad que el portal no ofrece no trae celda («--»): no es oferta.
 */
export type PrimaModalidad = { modalidad: string; nombre: string; primerReciboEur: number; sucesivosEur: number | null }

export function idCeldaPrima(modalidad: string, fila: 0 | 1, medio: 'F' | 'B' = 'B', periodo: 'A' | 'S' | 'T' = 'A'): string {
  return `${modalidad}_${medio}_${periodo}_${fila}_0`
}

/**
 * Celdas leídas (id → texto) + modalidades (código → nombre) → primas. Fail-closed: ninguna modalidad con primer
 * recibo legible y > 0 → error `portal` (nunca 0 ni «lo más parecido»); un primer recibo presente pero ilegible → error.
 */
export function primasDesdeCeldas(celdas: Readonly<Record<string, string>>, modalidades: ReadonlyArray<{ modalidad: string; nombre: string }>): PrimaModalidad[] {
  const out: PrimaModalidad[] = []
  for (const m of modalidades) {
    const t0 = celdas[idCeldaPrima(m.modalidad, 0)]
    if (t0 === undefined || /^\s*-*\s*$/.test(t0)) continue
    const p0 = importeEs(t0)
    if (p0 === null || !(p0 > 0)) throw new ErrorTarificador('portal', `allianz/auto: prima ilegible en la modalidad «${m.nombre}»`)
    const t1 = celdas[idCeldaPrima(m.modalidad, 1)]
    const p1 = t1 === undefined ? null : importeEs(t1)
    out.push({ modalidad: m.modalidad, nombre: m.nombre.replace(/\s+/g, ' ').trim(), primerReciboEur: p0, sucesivosEur: p1 !== null && p1 > 0 ? p1 : null })
  }
  if (out.length === 0) throw new ErrorTarificador('portal', 'allianz/auto: la tabla de precios no trae ninguna modalidad con prima')
  return out
}

/** Lee la tabla de precios de la pestaña Tarificar ya calculada. Solo lectura. */
export async function leerPrimasTarificar(raiz: Pick<Frame, 'locator'>): Promise<PrimaModalidad[]> {
  const modalidades = await raiz.locator('input[name="numModality"]').evaluateAll((els) =>
    els.map((e) => ({
      modalidad: (e.id || '').replace(/^modality_/, ''),
      nombre: (e.closest('table')?.querySelector('label')?.textContent ?? '').trim(),
    })),
  )
  const celdas = await raiz.locator('td[id$="_B_A_0_0"], td[id$="_B_A_1_0"]').evaluateAll((els) => Object.fromEntries(els.map((e) => [e.id, (e.textContent ?? '').trim()])))
  return primasDesdeCeldas(celdas, modalidades.filter((m) => m.modalidad !== ''))
}

/** Primas → ofertas normalizadas (una por modalidad). */
export function ofertasDesdePrimas(primas: readonly PrimaModalidad[], producto: string, vehiculo: Vehiculo | null, supuestos: string | null = null): OfertaNormalizada[] {
  return primas.map((p) => ({
    compania: 'allianz',
    producto: `${producto} · ${p.nombre}`,
    primaAnualEur: p.primerReciboEur,
    primaNetaEur: null,
    fraccionamiento: 'anual',
    importeReciboEur: p.primerReciboEur,
    coberturas: [],
    franquicias: [],
    validaHasta: null,
    referenciaPortal: null,
    pdf: null,
    desglose: { anual: { primaNetaEur: null, impuestosEur: null, primaTotalEur: p.primerReciboEur }, sucesivos: { primaNetaEur: null, impuestosEur: null, primaTotalEur: p.sucesivosEur } },
    avisos: [
      'Importe del primer recibo anual (recibo bancario) de la tabla «PRECIOS MODALIDADES»; sin desglose neta/impuestos.',
      ...(vehiculo ? [`Vehículo según el catálogo de Allianz: ${vehiculo.marca} ${vehiculo.modelo} ${vehiculo.version}.`] : []),
      ...(vehiculo?.versionPorSimilitud ? [AVISO_VERSION_POR_SIMILITUD] : []),
      // v0.6.2: lo que el bot SUPUSO (Turismos), junto al precio. Asegura lo deja pasar a plataforma (`supuestosDeAvisos`).
      ...(supuestos ? [supuestos] : []),
    ],
  }))
}

// ───────────────────────── MOTO v0.7.20: prima comparable, avisos de la tabla y CUESTIONARIO (solo lectura) ─────────────────────────
// Captura de Alberto (21/10/2026) de «PRECIOS MODALIDADES» de Moto: secciones RECIBO FÍSICO · RECIBO BANCARIO · FRACCIONAMIENTOS;
// en las dos primeras, filas «Anual 1er Recibo» y «Anual sucesivos». Con un primer periodo corto el 1er recibo NO es anual
// (G. Básicas 182,23 € frente a 275,82 € de sucesivos con término de un año): la prima COMPARABLE es «Anual sucesivos» del recibo
// bancario. Celdas con ⚠ = «Opción sujeta a Normas de Contratación de la Compañía». Bajo la tabla, texto rojo del portal
// (TIREA) y el CUESTIONARIO con «Cliente Alto Potencial» y «CAP» (= el descuento comercial): HOY solo se LEEN y describen
// («enseñar al bot para el futuro»); no se cambian ni se pulsa nada. Nada de esto toca el pie de emisión.

/** Un control de formulario de la pantalla de precios con su contexto de etiqueta (lo que devuelve el navegador). */
export type ControlCandidato = {
  tag: string
  tipo: string | null
  id: string | null
  name: string | null
  /** Textos de etiqueta del más específico al más amplio (`label[for]`, aria-label, title, label envolvente, celda anterior, fila, contenedor). */
  etiquetas: readonly string[]
  valor: string | null
  opciones: ReadonlyArray<{ valor: string; texto: string }>
  min: string | null
  max: string | null
  maxLength: number | null
  step: string | null
  deshabilitado: boolean
  soloLectura: boolean
  botonesCerca: readonly string[]
}

/** Campos del CUESTIONARIO que se describen (solo lectura). `cap` = el descuento comercial de Allianz. */
export const CAMPOS_CUESTIONARIO_MOTO = [
  { clave: 'clienteAltoPotencial', nombre: 'Cliente Alto Potencial', casa: (t: string) => plano(t).includes('cliente alto potencial') },
  { clave: 'cap', nombre: 'CAP', casa: (t: string) => /(^|[^a-z0-9])cap([^a-z0-9]|$)/.test(plano(t)) },
] as const

const plano = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Importe en formato español: `2.162,49€` (puntos de miles también con 4 cifras). PURA. */
export function eurEs(n: number): string {
  const [ent, dec] = Math.abs(n).toFixed(2).split('.')
  return `${n < 0 ? '-' : ''}${ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}€`
}

const idSeguro = (t: string | null): string | null => (t && /^[A-Za-z_][A-Za-z0-9_.:-]{0,59}$/.test(t) ? t : t ? '(id no estándar)' : null)
const textoSeguro = (t: string, n = 60): string => redactarDatosPersonales(t.replace(/\s+/g, ' ').trim()).slice(0, n)
/** Valor tecleado: cifras, separadores y «%»; otra cosa no se copia (podría ser un dato personal). */
const valorSeguro = (t: string | null): string => (t === null || t === '' ? 'vacío' : /^[\d\s.,%+-]{1,12}$/.test(t) ? t.trim() : '(texto, no se copia)')
/** Código de opción de un desplegable (S/N, 05, 10%…): corto y sin espacios raros. */
const codigoSeguro = (t: string | null): string => (t === null || t === '' ? 'vacío' : /^[A-Za-z0-9.,%+-]{1,12}$/.test(t.trim()) ? t.trim() : '(no se copia)')

/** Describe un control saneado (sin datos personales). PURA. */
export function describirControl(c: ControlCandidato): string {
  const esSelect = c.tag.toUpperCase() === 'SELECT'
  const partes = [`<${idSeguro(c.tag.toLowerCase()) ?? '?'}${c.tipo ? ` type=${idSeguro(c.tipo)}` : ''}>`, `id=${idSeguro(c.id) ?? '—'}`, `name=${idSeguro(c.name) ?? '—'}`]
  if (c.opciones.length > 0) {
    const ops = c.opciones.slice(0, 25).map((o) => `${codigoSeguro(o.valor)}«${textoSeguro(o.texto, 20)}»`)
    partes.push(`opciones [${ops.join(', ')}${c.opciones.length > 25 ? `, … (${c.opciones.length})` : ''}]`)
  }
  if (c.min !== null || c.max !== null) partes.push(`min=${valorSeguro(c.min)} max=${valorSeguro(c.max)}`)
  if (c.step !== null) partes.push(`step=${valorSeguro(c.step)}`)
  if (c.maxLength !== null && c.maxLength >= 0) partes.push(`maxlength=${c.maxLength}`)
  partes.push(`valor actual ${esSelect ? codigoSeguro(c.valor) : valorSeguro(c.valor)}`)
  if (c.deshabilitado) partes.push('deshabilitado')
  if (c.soloLectura) partes.push('solo lectura')
  if (c.botonesCerca.length > 0) partes.push(`botones cerca: ${c.botonesCerca.slice(0, 5).map((b) => `«${textoSeguro(b, 30)}»`).join(', ')}`)
  return partes.join(' · ')
}

/**
 * Candidatos → un aviso por campo del CUESTIONARIO (`CAMPOS_CUESTIONARIO_MOTO`). Cada campo se queda con el control cuya etiqueta
 * MÁS ESPECÍFICA lo nombra (una fila con «Cliente Alto Potencial … CAP» no confunde los dos); un control no sirve a dos campos.
 * No encontrado → se dice («no se encontró», lo mirado). PURA.
 */
export function avisosCuestionarioMoto(candidatos: readonly ControlCandidato[]): string[] {
  const usados = new Set<number>()
  return CAMPOS_CUESTIONARIO_MOTO.map((campo) => {
    let mejor: { i: number; nivel: number } | null = null
    candidatos.forEach((c, i) => {
      if (usados.has(i)) return
      const nivel = c.etiquetas.findIndex((t) => campo.casa(t))
      if (nivel >= 0 && (mejor === null || nivel < mejor.nivel)) mejor = { i, nivel }
    })
    const pref = `Allianz «${campo.nombre}» (cuestionario de la tabla de precios; solo lectura, NO se cambia en 0.7.20):`
    if (mejor === null) return `${pref} no se encontró en la pantalla de precios.`
    const elegido: { i: number; nivel: number } = mejor
    usados.add(elegido.i)
    return `${pref} ${describirControl(candidatos[elegido.i])}.`
  })
}

/** Lo que el formulario PIDE para CAP / Cliente Alto Potencial no se aplica hoy: se dice, sin tocar el portal. PURA. */
export function avisoCuestionarioPedido(form: Pick<FormularioAuto, 'clienteAltoPotencialAllianz' | 'capAllianz'>): string | null {
  const pedido = [
    ...(form.clienteAltoPotencialAllianz ? [`Cliente Alto Potencial=${form.clienteAltoPotencialAllianz}`] : []),
    ...(form.capAllianz ? [`CAP=${codigoSeguro(form.capAllianz)}`] : []),
  ]
  return pedido.length === 0 ? null : `Pedido ${pedido.join(', ')}: NO aplicado (Allianz moto 0.7.20 solo lee el cuestionario); el precio es con el valor que trae el portal.`
}

/** Texto rojo del portal bajo la tabla (p. ej. «Tomador no disponible en TIREA…») → aviso saneado. PURA. */
export function avisosTextoPortalTarificar(textos: readonly string[]): string[] {
  const vistos = new Set<string>()
  const out: string[] = []
  for (const t of textos) {
    const limpio = textoSeguro(t.replace(/^\s*-\s*/, ''), 200)
    if (limpio === '' || vistos.has(limpio)) continue
    vistos.add(limpio)
    out.push(`Allianz (texto del portal bajo la tabla de precios): ${limpio}`)
  }
  return out.slice(0, 3)
}

export type ExtrasTarificarMoto = { normas: readonly string[]; textosPortal: readonly string[]; controles: readonly ControlCandidato[] }

/**
 * Lee (SOLO lectura: ni clic, ni foco, ni escritura) de la pestaña Tarificar: modalidades con ⚠ (elemento con title/alt/texto
 * «Normas de Contratación» en sus celdas `td[id^="<m>_"]` o en su cabecera), textos que nombran TIREA y los controles con su etiqueta.
 */
export async function leerExtrasTarificarMoto(raiz: Pick<Frame, 'locator'>, modalidades: readonly string[]): Promise<ExtrasTarificarMoto> {
  const { normas, textosPortal } = await raiz.locator('body').first().evaluate((body, mods: string[]) => {
    // Sin funciones con nombre dentro del navegador (tsx inyecta `__name`, que la página no tiene).
    const normas: string[] = []
    for (const m of mods) {
      const zonas = Array.from(body.querySelectorAll('td[id]')).filter((td) => td.id.startsWith(`${m}_`))
      const cabecera = body.querySelector(`#modality_${CSS.escape(m)}`)?.closest('table')
      if (cabecera) zonas.push(cabecera)
      const hay = zonas.some((z) =>
        [z, ...Array.from(z.querySelectorAll('*'))].some((n) =>
          /normas de contrataci/i.test(`${n.getAttribute('title') ?? ''} ${n.getAttribute('alt') ?? ''} ${n.getAttribute('aria-label') ?? ''} ${n.children.length === 0 ? (n.textContent ?? '') : ''}`),
        ),
      )
      if (hay) normas.push(m)
    }
    const textosPortal: string[] = []
    for (const el of Array.from(body.querySelectorAll('*'))) {
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue
      const propio = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent ?? '').join(' ')
      if (/\bTIREA\b/i.test(propio)) textosPortal.push((el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 400))
    }
    return { normas, textosPortal: textosPortal.slice(0, 5) }
  }, [...modalidades])
  return { normas, textosPortal, controles: await leerControlesTarificar(raiz) }
}

/**
 * Controles visibles de la pantalla de precios con su etiqueta: `label[for]`, `aria-label`/`title`, la `<label>` que lo envuelve,
 * la celda anterior, el texto de su fila (`tr`) y el contenedor inmediato. Botones cercanos = textos de botones de la misma
 * tabla/fieldset/form (para saber cuál confirma, sin pulsarlo). SOLO lectura.
 */
export async function leerControlesTarificar(raiz: Pick<Frame, 'locator'>): Promise<ControlCandidato[]> {
  return raiz.locator('select, textarea, input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="image"])').evaluateAll((els) =>
    els.map((e) => {
      const el = e as HTMLInputElement & HTMLSelectElement
      const porFor = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent ?? '' : ''
      const envoltorio = el.closest('label')?.textContent ?? ''
      const celda = el.closest('td, th')
      let anterior = celda?.previousElementSibling ?? null
      while (anterior && (anterior.textContent ?? '').trim() === '') anterior = anterior.previousElementSibling
      const fila = el.closest('tr')
      const textoFila = fila ? Array.from(fila.querySelectorAll('td, th, label, span')).filter((n) => !n.contains(el)).map((n) => n.textContent ?? '').join(' ') : ''
      const contenedor = (el.parentElement?.textContent ?? '').slice(0, 200)
      const etiquetas = [porFor, el.getAttribute('aria-label') ?? '', el.getAttribute('title') ?? '', envoltorio, anterior?.textContent ?? '', textoFila, contenedor]
        .map((t) => t.replace(/\s+/g, ' ').trim().slice(0, 300))
        .filter((t) => t !== '')
      const zona = el.closest('table, fieldset, form') ?? document.body
      const botones = Array.from(zona.querySelectorAll('button, input[type="button"], input[type="submit"], a.button, a[role="button"]'))
        .map((b) => ((b as HTMLInputElement).value || b.textContent || '').replace(/\s+/g, ' ').trim())
        .filter((t) => t !== '')
      const esSelect = el.tagName === 'SELECT'
      return {
        tag: el.tagName,
        tipo: esSelect ? null : el.getAttribute('type'),
        id: el.id || null,
        name: el.getAttribute('name'),
        etiquetas,
        valor: esSelect ? (el.selectedOptions[0]?.value ?? null) : el.value,
        opciones: esSelect ? Array.from(el.options).map((o) => ({ valor: o.value, texto: (o.textContent ?? '').trim() })) : [],
        min: el.getAttribute('min'),
        max: el.getAttribute('max'),
        maxLength: esSelect ? null : el.getAttribute('maxlength') === null ? null : Number(el.getAttribute('maxlength')),
        step: el.getAttribute('step'),
        deshabilitado: el.disabled,
        soloLectura: !esSelect && el.readOnly,
        botonesCerca: [...new Set(botones)].slice(0, 5),
      }
    }),
  )
}

/** Lectura tolerante: si falla, se dice que NO se pudo mirar (nunca «no hay»), y la tarificación sigue con los precios. */
export async function extrasTarificarMotoSeguros(raiz: Pick<Frame, 'locator'>, modalidades: readonly string[]): Promise<{ extras: ExtrasTarificarMoto | null; avisos: string[] }> {
  try {
    const extras = await leerExtrasTarificarMoto(raiz, modalidades)
    return { extras, avisos: [...avisosTextoPortalTarificar(extras.textosPortal), ...avisosCuestionarioMoto(extras.controles)] }
  } catch {
    return { extras: null, avisos: ['Allianz moto: no se pudo leer el cuestionario ni los avisos bajo la tabla de precios (sin comprobar: ⚠ de Normas de Contratación, TIREA, CAP).'] }
  }
}

export const AVISO_PRIMA_SUCESIVOS =
  'Prima anual comparable = «Anual sucesivos» del RECIBO BANCARIO de la tabla «PRECIOS MODALIDADES» (el 1er recibo depende del primer periodo); sin desglose neta/impuestos.'

/**
 * Ofertas de MOTO (v0.7.20). Con «Anual sucesivos» legible: ESA es la prima anual comparable, el 1er recibo va en avisos si
 * difiere, y el supuesto «primer periodo inferior a un año… no comparable» (`supuestoPeriodo`) se QUITA (ya no aplica). Sin
 * sucesivos: como antes (1er recibo + ese supuesto). Modalidades con ⚠ → aviso de Normas de Contratación. PURA.
 */
export function ofertasMotoDesdePrimas(
  primas: readonly PrimaModalidad[],
  vehiculo: Vehiculo | null,
  supuestos: { supuestoVersion: string | null; form: FormularioAuto; delPortal: readonly string[]; supuestoPeriodo: string | null },
  normas: readonly string[] = [],
): OfertaNormalizada[] {
  const sinPeriodo = supuestos.delPortal.filter((x) => x !== supuestos.supuestoPeriodo)
  return primas.map((p) => {
    const sucesivos = p.sucesivosEur
    const textoSup = supuestosMoto(supuestos.supuestoVersion, supuestos.form, sucesivos !== null ? sinPeriodo : supuestos.delPortal)
    const [o] = ofertasDesdePrimas([p], 'Moto', vehiculo, textoSup)
    const avisoNormas = normas.includes(p.modalidad) ? [`Modalidad «${p.nombre}»: opción sujeta a Normas de Contratación de la Compañía (⚠ en la tabla).`] : []
    if (sucesivos === null) return { ...o, avisos: [...o.avisos, ...avisoNormas] }
    const primerRecibo = p.primerReciboEur !== sucesivos ? [`1er recibo: ${eurEs(p.primerReciboEur)} (primer periodo distinto de un año)`] : []
    return { ...o, primaAnualEur: sucesivos, importeReciboEur: sucesivos, avisos: [AVISO_PRIMA_SUCESIVOS, ...primerRecibo, ...o.avisos.slice(1), ...avisoNormas] }
  })
}

// ───────────────────────── MOTO: formulario editable (grabación 13/10/2026) ─────────────────────────
// Orden real del portal: «Riesgo municipio» (vehículo en CASCADA marca → clase → modelo → versión, CP con buscador de
// poblaciones, ¿tomador es conductor/propietario?) → «Datos básicos» (uso, conductor, matrícula, antecedentes) → «Tarificar».
// La matrícula NO elige el vehículo en Moto: solo autorrellena la 1ª matriculación (campo bloqueado) y es «obligatoria para
// emisión», no para tarificar. Ningún valor de este bloque es de una persona: selectores, códigos de catálogo y literales.

/** «Riesgo municipio» editable. */
export const SEL_RIESGO_MOTO = {
  marca: '#marca',
  /** Tramo de cilindrada: «1.Hasta 125 c.c.» · «2.Hasta 350 c.c.» · «3.De 351 c.c. hasta 750 c.c.» · «4.Mas de 750 c.c.». */
  clase: '#clase',
  modelo: '#modelo',
  version: '#version',
  codigoPostal: '#_cpostalCode',
  /** Población: la rellena el buscador (Datos básicos la enseña bloqueada en `#cpPoblacion`). */
  poblacion: '#_destown',
  /** Lupa del buscador de poblaciones: `<img onclick="sendRequestLocationFinder(...)">`. */
  buscarPoblacion: '#_cpostalCodeAjaxLocFinderImg',
  tomadorEsConductor: '#takerDriver',
  tomadorEsPropietario: '#takerOwner',
  /**
   * NIF/CIF del tomador (v0.7.5-0.7.6): con «tomador = conductor/propietario» el portal lo exige. `#idDocTaker` es un
   * `<input type="hidden">` (no admite `fill`): el control VISIBLE es `#idNifTaker_doc` (widget IdentificationNumber, máscara
   * `text(0,9)`), cuyo `onchange` copia el valor al hidden con `inputChange('idNifTaker_doc','idDocTaker')`.
   */
  documentoTomador: '#idNifTaker_doc',
  /** Hidden que rellena el portal a partir del visible: se comprueba (sin leer su valor al informe) que queda con valor. */
  documentoTomadorOculto: '#idDocTaker',
} as const

/** «Datos básicos» editable. Valores de los desplegables = los del portal (grabación 13/10/2026). */
export const SEL_DATOS_MOTO = {
  uso: '#use',
  conductorNacimiento: '#driverBirthDate',
  conductorCarne: '#driverLicenseDate',
  conductorSexo: '#driverSex',
  matricula: '#licensePlate',
  /** Bloqueado (`disabled`) tras la consulta por matrícula: solo lectura. */
  fechaMatriculacion: '#fechaMatriculacion',
  garajeNoche: '#garageNight',
  aseguradoOtraCia: '#aseguradoOtraCia',
  aniosCompaniaAnterior: '#yearsOrigCompany',
  aniosSinSiniestros: '#aniosSinSiniestros',
  /** Se bloquea solo cuando «años sin siniestros» = 5: no se escribe. */
  siniestros: '#numDisasters',
} as const

/** Valores del portal. `driverSex`: V = Hombre · H = Mujer (sin opción vacía: el portal asume Hombre si no se toca). */
export const SEXO_PORTAL = { hombre: 'V', mujer: 'H' } as const
export const USO_PARTICULAR = '1'
/** `yearsOrigCompany`: 0-5 y «6» = «Más de 5». */
export const ANIOS_MAS_DE_5 = '6'

/** Informe de aviso e incidencias («INFORME DE AVISO E INCIDENCIAS»): filas de error y filas informativas. */
export const SEL_INCIDENCIAS = 'tr.rowAppErrorTextBlock, tr.rowAppErrorInfoTextBlock'

// ── desplegables en cascada ──

export type OpcionSelect = { valor: string; etiqueta: string }

const claveCatalogo = (s: string) => s.replace(/\s+/g, ' ').trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

/** Valor de la ÚNICA opción cuya etiqueta es igual (salvo mayúsculas/tildes/espacios). Ninguna o varias → `null` (nunca «la parecida»). */
export function valorOpcionExacta(opciones: readonly OpcionSelect[], buscada: string): string | null {
  const k = claveCatalogo(buscada)
  if (k === '') return null
  const casan = opciones.filter((o) => !esOpcionVacia(o.etiqueta) && claveCatalogo(o.etiqueta) === k)
  return casan.length === 1 ? casan[0].valor : null
}

/** Valor de la opción de `#clase` cuya etiqueta empieza por «<n>.» (tramo de cilindrada 1-4). */
export function valorClaseMoto(opciones: readonly OpcionSelect[], clase: number): string | null {
  const casan = opciones.filter((o) => o.etiqueta.trim().startsWith(`${clase}.`))
  return casan.length === 1 ? casan[0].valor : null
}

async function leerSelect(raiz: Pick<Frame, 'locator'>, sel: string) {
  const l = raiz.locator(sel).first()
  if ((await l.count()) === 0) return null
  return l.evaluate((el) => {
    const s = el as HTMLSelectElement
    return { deshabilitado: s.disabled, valor: s.value, opciones: Array.from(s.options).map((o) => ({ valor: o.value, etiqueta: (o.textContent ?? '').trim() })) }
  })
}

/**
 * Espera a que el desplegable esté habilitado y con opciones, elige UNA con `elegir` (valor o `null` = no está en el
 * catálogo → error `datos`), la fija y relee: si el portal no la dejó puesta, aborta (`portal`).
 */
async function elegirOpcion(raiz: Pick<Frame, 'locator'>, sel: string, que: string, elegir: (o: readonly OpcionSelect[]) => string | null, page: Pick<Page, 'waitForTimeout'>, timeoutMs = 15_000): Promise<void> {
  const fin = Date.now() + timeoutMs
  for (;;) {
    const s = await leerSelect(raiz, sel)
    if (!s) throw new ErrorTarificador('portal', `allianz/auto: no aparece el desplegable de ${que}`)
    if (!s.deshabilitado && s.opciones.some((o) => !esOpcionVacia(o.etiqueta))) {
      const v = elegir(s.opciones)
      if (v === null) throw new ErrorTarificador('datos', `allianz/auto: ${que} no está (o está repetido) en el catálogo del portal`)
      const campo = raiz.locator(sel).first()
      if (s.valor !== v) {
        await comprobarCampo(campo)
        await campo.selectOption(v)
      }
      if ((await campo.inputValue()) !== v) throw new ErrorTarificador('portal', `allianz/auto: el portal no dejó fijado el desplegable de ${que}`)
      return
    }
    if (Date.now() >= fin) throw new ErrorTarificador('portal', `allianz/auto: el desplegable de ${que} no se llenó a tiempo`)
    await page.waitForTimeout(300)
  }
}

/**
 * Riesgo municipio: marca → clase → modelo, cada uno por su etiqueta EXACTA, y espera a que el portal ofrezca versiones.
 * La versión la resuelve después `resolverVehiculo` (una sola → ok; varias sin elección → requiere_humano).
 */
export async function elegirVehiculoMoto(raiz: Pick<Frame, 'locator'>, sel: SeleccionVehiculo, page: Pick<Page, 'waitForTimeout'>): Promise<void> {
  if (sel.clase == null) throw new ErrorTarificador('datos', 'allianz/moto: falta la clase (tramo de cilindrada 1-4) de la moto')
  await elegirOpcion(raiz, SEL_RIESGO_MOTO.marca, 'la marca', (o) => valorOpcionExacta(o, sel.marca), page)
  await elegirOpcion(raiz, SEL_RIESGO_MOTO.clase, 'la clase', (o) => valorClaseMoto(o, sel.clase as number), page)
  await elegirOpcion(raiz, SEL_RIESGO_MOTO.modelo, 'el modelo', (o) => valorOpcionExacta(o, sel.modelo), page)
  // Versiones: esperar a que haya alguna; no se elige aquí.
  const fin = Date.now() + 15_000
  for (;;) {
    const v = await leerSelect(raiz, SEL_RIESGO_MOTO.version)
    if (!v) throw new ErrorTarificador('portal', 'allianz/auto: no aparece el desplegable de versión')
    if (v.opciones.some((o) => !esOpcionVacia(o.etiqueta))) return
    if (Date.now() >= fin) throw new ErrorTarificador('portal', 'allianz/moto: el portal no ofreció ninguna versión para ese modelo')
    await page.waitForTimeout(300)
  }
}

// ── Riesgo municipio: población y titulares ──

/**
 * Celdas de resultado del buscador de poblaciones (inventario de estructura del 13/10/2026, marco `appArea`): un `td` por
 * población, texto «CP- NOMBRE», `onclick="receivedDataLocationFinder({…})"` (copia la población a `#_destown`; no emite).
 */
export const SEL_CELDA_POBLACION = 'td[onclick*="receivedDataLocationFinder"]'

const leerCeldasPoblacion = (raiz: Pick<Frame, 'locator'>) =>
  raiz.locator(SEL_CELDA_POBLACION).evaluateAll((els) => els.map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim()))

const valorPoblacion = (raiz: Pick<Frame, 'locator'>) =>
  raiz.locator(SEL_RIESGO_MOTO.poblacion).first().inputValue({ timeout: 1_000 }).catch(() => '')

/** Petición de la capa común para el buscador de poblaciones (acción `elegir_opcion`: solo ofrece celdas «CP- NOMBRE»). */
const PETICION_POBLACION: PeticionResolver = {
  clave: 'elegir_opcion_poblacion',
  tipo: 'accion',
  descripcion:
    'Celda «CP- POBLACIÓN» del buscador de poblaciones de Allianz Moto (resultado de la lupa del código postal) que corresponde a la población del riesgo. Solo elige una población de la lista; NUNCA emitir, contratar, grabar ni pagar.',
}

/** Contexto del buscador: `pulsar` (guard, `comprobarBoton`) y el formador de la capa común (opcional: sin él, el hueco de siempre). */
export type CtxPoblacion = Pick<ContextoPortal, 'pulsar'> & Partial<Pick<ContextoPortal, 'formador'>>

/**
 * CAPA COMÚN del buscador (fijo → aprendido → IA `elegir_opcion` → ATASCO). La regla fija (celdas «CP- NOMBRE» + `resolverPoblacion`)
 * ya NO pudo (o no tuvo efecto): `hueco` es su error. Lo que devuelva lo aprendido o la IA solo se pulsa si, ANTES de pulsar,
 * su texto es «CP- NOMBRE» del CP del riesgo Y es la población del riesgo (elección de la bandeja o nombre exacto normalizado);
 * si no, atasco y hueco (nunca se elige «la parecida»). Se pulsa por `ctx.pulsar` y solo se aprende
 * si tras pulsar `#_destown` quedó relleno. Sin candidatos que mostrar, el atasco no puede prepararse (queda el hueco con
 * inventario de estructura).
 */
async function poblacionPorCapaComun(
  raiz: Pick<Frame, 'locator'>,
  codigoPostal: string,
  page: Page,
  ctx: CtxPoblacion,
  eleccion: Pick<FormularioAuto, 'poblacion' | 'eleccionPoblacion'>,
  hueco: string,
  timeoutMs: number,
  sinIA = false,
): Promise<void> {
  // Fijo real (no un stub): UNA sola celda del buscador visible ahora (p. ej. pintada tras el plazo de la regla principal).
  const fijo = async (): Promise<Locator> => {
    const celdas = raiz.locator(SEL_CELDA_POBLACION)
    if ((await celdas.count()) !== 1) throw new ErrorMapaIncompleto(hueco, true)
    return celdas
  }
  const atascar = async (): Promise<never> => {
    await registrarAtasco(page, ctx.formador, PETICION_POBLACION).catch(() => undefined)
    throw new ErrorMapaIncompleto(hueco, true)
  }
  // La regla fija ya dictaminó que NINGUNA celda es la población del riesgo: la IA no puede «adivinar» otra → atasco directo.
  if (sinIA) return atascar()
  const r = await conRespaldoIA(page, ctx.formador, fijo, PETICION_POBLACION) // sin resolver: atasco registrado y error ORIGINAL
  const texto = await r.locator.evaluate((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim()).catch(() => null)
  const celda = texto ? leerCeldaPoblacion(texto) : null
  if (!texto || !celda || celda.cp !== codigoPostal.trim()) return atascar()
  const eleg = (eleccion.eleccionPoblacion ?? '').replace(/\s+/g, ' ').trim()
  const nombre = clavePoblacion(eleccion.poblacion ?? '')
  const esLaDelRiesgo = eleg !== '' ? eleg === texto : nombre !== '' && clavePoblacion(celda.nombre) === nombre
  if (!esLaDelRiesgo) return atascar()
  await ctx.pulsar(r.locator)
  const fin = Date.now() + timeoutMs
  for (;;) {
    if ((await valorPoblacion(raiz)).trim() !== '') {
      await r.confirmar().catch(() => undefined)
      return
    }
    if (Date.now() >= fin) return atascar()
    await page.waitForTimeout(300)
  }
}

/**
 * CP → buscador de poblaciones: se teclea el CP y se pulsa la LUPA con `ctx.pulsar` (no Enter: el Enter de un campo de un
 * formulario legado puede enviarlo). Después:
 *   · el portal rellena `#_destown` solo → hecho;
 *   · aparecen celdas `receivedDataLocationFinder` («CP- NOMBRE»): una → se pulsa; varias → `resolverPoblacion` (la
 *     `eleccionPoblacion` de la bandeja si está en la lista; si no, la `poblacion` del riesgo si casa con UNA, salvo
 *     mayúsculas/tildes/espacios) y se pulsa con `ctx.pulsar`; sin elección posible → `ErrorEleccionPoblacion` (persona);
 *   · tras pulsar, `#_destown` tiene que quedar relleno.
 * Todo lo demás (no aparece el buscador, ni celdas ni población a tiempo, celdas sin la forma «CP- NOMBRE», la celda no rellena)
 * va por la CAPA COMÚN (`poblacionPorCapaComun`: aprendido → IA → atasco), nunca a un error mudo. La población del cliente no
 * sale en ningún mensaje.
 */
export async function buscarPoblacion(
  raiz: Pick<Frame, 'locator'>,
  codigoPostal: string,
  page: Page,
  ctx: CtxPoblacion,
  timeoutMs = 10_000,
  eleccion: Pick<FormularioAuto, 'poblacion' | 'eleccionPoblacion'> & { localidades?: ReadonlyArray<string | null | undefined> } = {},
): Promise<void> {
  const capaComun = (hueco: string, sinIA = false) => poblacionPorCapaComun(raiz, codigoPostal, page, ctx, eleccion, hueco, timeoutMs, sinIA)
  const cp = raiz.locator(SEL_RIESGO_MOTO.codigoPostal).first()
  const lupa = raiz.locator(SEL_RIESGO_MOTO.buscarPoblacion).first()
  if ((await cp.count()) === 0 || (await lupa.count()) === 0) {
    await registrarAtasco(page, ctx.formador, PETICION_POBLACION).catch(() => undefined)
    throw new ErrorTarificador('portal', 'allianz/moto: no aparece el buscador de poblaciones')
  }
  await comprobarCampo(cp)
  await cp.fill(codigoPostal)
  await ctx.pulsar(lupa)
  const fin = Date.now() + timeoutMs
  let textos: string[] = []
  for (;;) {
    if ((await valorPoblacion(raiz)).trim() !== '') return
    textos = await leerCeldasPoblacion(raiz)
    if (textos.length > 0) {
      // La respuesta del buscador puede pintar las celdas en varias pasadas: una relectura tras una pausa corta.
      await page.waitForTimeout(300)
      textos = await leerCeldasPoblacion(raiz)
      break
    }
    if (Date.now() >= fin) return capaComun('la pantalla del buscador de poblaciones (el CP no dejó la población rellena ni celdas de resultado)')
    await page.waitForTimeout(300)
  }
  const opciones = opcionesPoblacionDesdeCeldas(textos)
  if (opciones.length === 0) return capaComun('el formato de las celdas del buscador de poblaciones (no son «CP- NOMBRE»)', true)
  const r = resolverPoblacion(opciones, eleccion)
  // v0.7.3: sin elección de la bandeja, la localidad del riesgo (poblacion / localidad del tomador con el mismo CP) por contención de palabras enteras, si da UNA sola.
  const porLocalidad = r.tipo === 'ambigua' && (eleccion.eleccionPoblacion ?? '').trim() === '' ? elegirPoblacionPorLocalidades(r.opciones, [eleccion.poblacion, ...(eleccion.localidades ?? [])]) : null
  if (r.tipo === 'ambigua' && !porLocalidad) throw new ErrorEleccionPoblacion(r.opciones)
  if (r.tipo === 'ninguna') return capaComun('las celdas del buscador de poblaciones', true)
  const opcionElegida = r.tipo === 'elegida' ? r.opcion : porLocalidad!
  const indice = textos.findIndex((t) => t === opcionElegida.codigo)
  if (indice < 0) return capaComun('la celda de la población elegida (ya no está en el buscador)')
  await ctx.pulsar(raiz.locator(SEL_CELDA_POBLACION).nth(indice))
  const finPulsar = Date.now() + timeoutMs
  for (;;) {
    if ((await valorPoblacion(raiz)).trim() !== '') return
    if (Date.now() >= finPulsar) {
      await registrarAtasco(page, ctx.formador, PETICION_POBLACION).catch(() => undefined)
      throw new ErrorMapaIncompleto('el efecto de la celda del buscador de poblaciones (tras pulsarla, la población no quedó rellena)', true)
    }
    await page.waitForTimeout(300)
  }
}

/**
 * ¿Tomador = conductor = propietario? `false` pide el NIF del otro (`#idNifDriver_doc`/`#idNifOwner_doc`): sin mapa → hueco.
 * v0.7.5: marcar «Sí» (tomador conductor/propietario) obliga a informar el NIF/CIF del tomador (`idDocTaker`): sin él se PARA
 * aquí, con un hueco claro, antes de abrir el portal (nunca marcar a ciegas y esperar el rechazo). PURA.
 */
export function comprobarTitularesMoto(f: Pick<FormularioAuto, 'tomadorEsConductor' | 'tomadorEsPropietario' | 'documentoTomador' | 'tomador' | 'fichaTomador'>): void {
  if (f.tomadorEsConductor === false || f.tomadorEsPropietario === false) {
    throw new ErrorMapaIncompleto('el NIF del conductor/propietario distinto del tomador (campos idNifDriver_doc/idNifOwner_doc, sin mapa de qué exige el portal)', false, true)
  }
  if ((f.tomadorEsConductor === true || f.tomadorEsPropietario === true) && documentoTomadorDe(f) === null) {
    throw new ErrorTarificador('datos', 'allianz/moto: falta el NIF del tomador (el portal lo exige si el tomador es el conductor/propietario); complétalo en la ficha del cliente')
  }
}

export async function rellenarRiesgoMoto(raiz: Pick<Frame, 'locator'>, f: FormularioAuto, page: Page, ctx: CtxPoblacion): Promise<void> {
  comprobarTitularesMoto(f)
  // La localidad del tomador solo vale si su CP es el del riesgo (si no, es de otro sitio).
  const localidadTomador = codigoPostalTomadorDe(f) === f.codigoPostal.trim() ? localidadTomadorDe(f) : null
  await buscarPoblacion(raiz, f.codigoPostal, page, ctx, undefined, { poblacion: f.poblacion ?? null, eleccionPoblacion: f.eleccionPoblacion ?? null, localidades: [localidadTomador] })
  // v0.7.5: el NIF del tomador (de la ficha) ANTES de marcar tomador = conductor/propietario. Nunca sale en mensajes ni se relee.
  const nif = documentoTomadorDe(f)
  if (nif !== null && (f.tomadorEsConductor === true || f.tomadorEsPropietario === true)) {
    const campo = raiz.locator(SEL_RIESGO_MOTO.documentoTomador).first()
    if ((await campo.count()) === 0) throw new ErrorMapaIncompleto(`el campo del NIF del tomador (${SEL_RIESGO_MOTO.documentoTomador}) en Riesgo municipio`, true)
    await comprobarCampo(campo)
    await campo.fill(nif)
    await campo.dispatchEvent('change') // el `onchange` del portal copia el valor al hidden `#idDocTaker`
    const oculto = raiz.locator(SEL_RIESGO_MOTO.documentoTomadorOculto).first()
    if ((await oculto.count()) > 0 && (await oculto.inputValue()).trim() === '') {
      throw new ErrorTarificador('portal', `allianz/moto: el portal no copió el NIF del tomador a ${SEL_RIESGO_MOTO.documentoTomadorOculto}`)
    }
  }
  for (const [sel, dato] of [[SEL_RIESGO_MOTO.tomadorEsConductor, f.tomadorEsConductor], [SEL_RIESGO_MOTO.tomadorEsPropietario, f.tomadorEsPropietario]] as const) {
    if (dato !== true) continue // null = no consta: no se toca
    await fijarSelect(raiz, sel, 'S')
  }
}

async function fijarSelect(raiz: Pick<Frame, 'locator'>, sel: string, valor: string): Promise<void> {
  const campo = raiz.locator(sel).first()
  if ((await campo.count()) === 0) throw new ErrorTarificador('portal', `allianz/moto: no aparece el campo ${sel}`)
  await comprobarCampo(campo)
  await campo.selectOption(valor)
  if ((await campo.inputValue()) !== valor) throw new ErrorTarificador('portal', `allianz/moto: el portal no dejó fijado ${sel}`)
}

// ── Datos básicos ──

export type OperacionCampo = { sel: string; tipo: 'texto' | 'select' | 'casilla'; valor: string | boolean }

/**
 * Plan de escritura de Datos básicos de MOTO. Puro. El portal NO tiene «sin dato» en sexo (asume Hombre): sin sexo se para
 * (FAIL-CLOSED, nunca se inventa). Antecedentes sin dato (18/10/2026, decisión de Alberto «supuesto favorable»): el tramo
 * más favorable (`conAntecedentesFavorables`: más de 5 años, ningún siniestro), DECLARADO en el precio
 * (`supuestosDatosBasicosMoto`), nunca como dato.
 *   · `aniosAseguradoAnterior` → «ha estado asegurado» (S si > 0) y `yearsOrigCompany` (0-5; más de 5 → «6»).
 *   · 0 siniestros en 5 años → `aniosSinSiniestros` = min(5, años asegurado): ASUNCIÓN (sin siniestros durante todo el
 *     tiempo asegurado); se relee y, si el portal lo cambia, aborta. Con siniestros > 0 → hueco (el portal pide «años sin
 *     siniestros» y «nº en el último año», que el formulario canónico no distingue).
 */
export function planDatosBasicosMoto(form: FormularioAuto): OperacionCampo[] {
  if (form.conductor.sexo === null) throw new ErrorTarificador('datos', 'allianz/moto: falta el sexo del conductor (el portal asumiría «Hombre»)')
  exigirCarneCoherente(form)
  const f = conAntecedentesFavorables(form).formulario
  if (f.siniestrosUltimos5Anios > 0) throw new ErrorMapaIncompleto('la traducción de siniestros > 0 a «años sin siniestros» y «nº de siniestros en el último año» de Antecedentes', false, true)
  const anios = f.aniosAseguradoAnterior
  const plan: OperacionCampo[] = [
    { sel: SEL_DATOS_MOTO.uso, tipo: 'select', valor: USO_PARTICULAR },
    { sel: SEL_DATOS_MOTO.conductorNacimiento, tipo: 'texto', valor: fechaEs(f.conductor.fechaNacimiento) },
    { sel: SEL_DATOS_MOTO.conductorCarne, tipo: 'texto', valor: fechaEs(f.conductor.fechaCarne) },
    { sel: SEL_DATOS_MOTO.conductorSexo, tipo: 'select', valor: SEXO_PORTAL[form.conductor.sexo] },
  ]
  if (f.garajeNoche !== null) plan.push({ sel: SEL_DATOS_MOTO.garajeNoche, tipo: 'casilla', valor: f.garajeNoche })
  plan.push(
    { sel: SEL_DATOS_MOTO.aseguradoOtraCia, tipo: 'select', valor: anios > 0 ? 'S' : 'N' },
    // Primero los años en la compañía (su onchange recalcula «años sin siniestros»), después estos.
    { sel: SEL_DATOS_MOTO.aniosCompaniaAnterior, tipo: 'select', valor: anios > 5 ? ANIOS_MAS_DE_5 : String(anios) },
    { sel: SEL_DATOS_MOTO.aniosSinSiniestros, tipo: 'select', valor: `0${Math.min(5, anios)}` },
  )
  return plan
}

/** «Precio con supuestos: …» de Datos básicos de MOTO (los antecedentes que el riesgo no trae), o `null`. Puro. */
export function supuestosDatosBasicosMoto(f: FormularioAuto): string | null {
  return textoSupuestos(conAntecedentesFavorables(f).supuestos)
}

/** Aviso único de supuestos de MOTO: la versión (si se eligió por similitud entre varias) y los antecedentes favorables. Puro. */
export function supuestosMoto(supuestoVersion: string | null, f: FormularioAuto, delPortal: readonly string[] = []): string | null {
  // v0.7.15: `delPortal` = avisos de la excepción exacta del guard (primer periodo < 1 año respondido «No»: prima no anual).
  return textoSupuestos([...(supuestoVersion ? [supuestoVersion] : []), ...conAntecedentesFavorables(f).supuestos, ...delPortal])
}

// ── Seguro anterior y fecha de adquisición (v0.7.11, trabajo real 6cd26c10) ──

/** Controles de «Datos básicos» de MOTO que el portal exige y la 0.7.10 no rellenaba (ids del snapshot del fallo, 20/10/2026). */
export const SEL_SEGURO_ANTERIOR_MOTO = {
  /** `<select>` de compañías (valor `Cnnn`/`Mnnn`/`Ennn`; «---Selección Compañías---», «**** TOP ****» y separadores no son compañías). */
  companiaOrigen: '#ciaOrigen',
  /** `<input type="text">` con máscara `text(0,5)`: los 5 últimos dígitos de la póliza anterior. Dato sensible. */
  polizaOrigen: '#polizaOrigen',
  /** `<select>`: «No» (por defecto, el portal lo rechaza si estuvo asegurado) · `P` recibo próximo año/Certificado · `U` recibo 2 últimos años. */
  fotocopia: '#fotocopia',
  /** `<input type="text">` con máscara de fecha dd/mm/aaaa, como la de carné. */
  fechaAdquisicion: '#fechaAdquisicion',
} as const

/** Justificante del seguro anterior que el riesgo declara que se aporta → valor del `<select #fotocopia>`. */
export const FOTOCOPIA_PORTAL = { proximo_anio: 'P', dos_ultimos_anios: 'U' } as const
export type ClaveFotocopia = keyof typeof FOTOCOPIA_PORTAL

/**
 * Lo que el portal pide de Moto además de los antecedentes numéricos y el riesgo NO trae hoy en su modelo. Se leen como claves
 * OPCIONALES del riesgo (como `companiaActual`): `fechaAdquisicion` (ISO), `fotocopiaAnterior` (`ClaveFotocopia`) y, ya en el
 * modelo, `companiaAnterior` y `polizaAnteriorUltimos5`. Ausente = no consta: nunca se inventa (hueco `datos` ANTES del login).
 */
export type DatosPortalMoto = {
  estuvoAsegurado: boolean
  compania: string | null
  poliza5: string | null
  fotocopia: ClaveFotocopia | null
  fechaAdquisicionIso: string | null
}

export function datosPortalMoto(form: FormularioAuto): DatosPortalMoto {
  const r = (form as object) as { fechaAdquisicion?: unknown; fotocopiaAnterior?: unknown }
  const fecha = textoDe(r.fechaAdquisicion)
  const foto = textoDe(r.fotocopiaAnterior)
  return {
    estuvoAsegurado: conAntecedentesFavorables(form).formulario.aniosAseguradoAnterior > 0,
    compania: companiaActualDe(form),
    poliza5: polizaActualUltimos5De(form),
    fotocopia: foto !== null && Object.hasOwn(FOTOCOPIA_PORTAL, foto) ? (foto as ClaveFotocopia) : null,
    fechaAdquisicionIso: fecha !== null && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : null,
  }
}

/** Huecos de datos (frases «Falta: …» para quien monta el riesgo). Puro. Vacío = el bot puede rellenar todo. */
export function faltasDatosPortalMoto(form: FormularioAuto): string[] {
  const d = datosPortalMoto(form)
  const faltas: string[] = []
  if (d.estuvoAsegurado) {
    if (d.compania === null) faltas.push('compañía anterior (Allianz la exige si estuvo asegurado)')
    if (d.poliza5 === null) faltas.push('número de póliza anterior, últimas 5 cifras (Allianz lo exige si estuvo asegurado)')
    if (d.fotocopia === null) faltas.push('justificante del seguro anterior: recibo del próximo año/certificado o recibos de los 2 últimos años (Allianz exige indicar cuál se aporta; no se declara nada sin saberlo)')
  }
  if (d.fechaAdquisicionIso === null) faltas.push('fecha de adquisición de la moto, no la de matriculación (Allianz la exige)')
  return faltas
}

/** Hueco claro ANTES de abrir el portal: qué hay que pedir. Puro. */
export function exigirDatosPortalMoto(form: FormularioAuto): void {
  const faltas = faltasDatosPortalMoto(form)
  if (faltas.length > 0) throw new ErrorTarificador('datos', `allianz/moto: Falta: ${faltas.join(' · Falta: ')}`)
}

/**
 * Allianz rechaza «El conductor principal debe ser mayor de 18 al sacarse el carnet» (trabajo real 6cd26c10): el campo se
 * escribía bien, así que la causa es la propia fecha. Se para ANTES del login con un mensaje que dice qué revisar (sin las fechas). Puro.
 */
export function exigirCarneCoherente(form: FormularioAuto): void {
  const nac = form.conductor.fechaNacimiento
  const carne = form.conductor.fechaCarne
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nac) || !/^\d{4}-\d{2}-\d{2}$/.test(carne)) return // el formato lo valida fechaEs en el plan
  const mayoria = `${Number(nac.slice(0, 4)) + 18}${nac.slice(4)}`
  if (carne < mayoria) throw new ErrorTarificador('datos', 'allianz/moto: la fecha de carné es anterior a cumplir 18 años (Allianz exige conductor principal mayor de 18 al sacarse el carné): revisar la fecha de carné y la de nacimiento del conductor')
}

/** Opciones de compañía de verdad: fuera la vacía, «**** TOP ****» y los separadores (valor `0000` / solo asteriscos). Puro. */
export function opcionesCompaniaOrigen(opciones: readonly OpcionSelect[]): OpcionSelect[] {
  return opciones.filter((o) => o.valor.trim() !== '' && o.valor.trim() !== '0000' && !esOpcionVacia(o.etiqueta) && !/^[*\s]+$/.test(o.etiqueta) && !/selecci[oó]n/i.test(o.etiqueta))
}

export type CasadoCompaniaOrigen = { tipo: 'unica'; opcion: OpcionSelect } | { tipo: 'ambigua'; candidatas: OpcionSelect[] } | { tipo: 'ninguna' }

/** Casado puro de la compañía anterior contra el `<select>`: texto exacto (salvo mayúsculas/tildes/espacios) → nombre normalizado/alias (compania-actual.ts). Nunca «la parecida». */
export function casarCompaniaOrigen(opciones: readonly OpcionSelect[], buscada: string): CasadoCompaniaOrigen {
  const reales = opcionesCompaniaOrigen(opciones)
  const exacta = valorOpcionExacta(reales, buscada)
  if (exacta !== null) return { tipo: 'unica', opcion: reales.find((o) => o.valor === exacta)! }
  const c = casarCompaniaActual(reales.map((o) => o.etiqueta), buscada)
  if (c.estado === 'unica') return { tipo: 'unica', opcion: reales[c.indice]! }
  return c.estado === 'ambigua' ? { tipo: 'ambigua', candidatas: c.indices.map((i) => reales[i]!) } : { tipo: 'ninguna' }
}

const textoCia = (s: string) => s.replace(/\s+/g, ' ').trim()

/**
 * Elige la compañía anterior en `#ciaOrigen`: casado puro; si no es único, la IA (`elegir_opcion`, solo un ÍNDICE entre las opciones
 * VISIBLES —las candidatas si hubo varias—, validado en sugerirOpcion); si tampoco, hueco `datos` con la lista. Lo elegido se
 * relee del control. No se aprende (es un `<select>` por valor, no un selector que se pueda reutilizar).
 */
export async function elegirCompaniaOrigen(raiz: Pick<Frame, 'locator'>, buscada: string, page: Pick<Page, 'waitForTimeout'>, ctx: Pick<ContextoPortal, 'formador'>, timeoutMs = 15_000): Promise<string | null> {
  const sel = SEL_SEGURO_ANTERIOR_MOTO.companiaOrigen
  const fin = Date.now() + timeoutMs
  let s = await leerSelect(raiz, sel)
  for (;;) {
    if (!s) throw new ErrorTarificador('portal', 'allianz/moto: no aparece el desplegable de compañía de origen')
    if (!s.deshabilitado && opcionesCompaniaOrigen(s.opciones).length > 0) break
    if (Date.now() >= fin) throw new ErrorTarificador('portal', 'allianz/moto: el desplegable de compañía de origen no se llenó a tiempo')
    await page.waitForTimeout(300)
    s = await leerSelect(raiz, sel)
  }
  const reales = opcionesCompaniaOrigen(s.opciones)
  const c = casarCompaniaOrigen(s.opciones, buscada)
  let valor: string | null = c.tipo === 'unica' ? c.opcion.valor : null
  if (valor === null) {
    const visibles = c.tipo === 'ambigua' ? c.candidatas : reales
    const i = await sugerirOpcion(ctx.formador, {
      clave: 'elegir_opcion_compania_origen',
      descripcion: `Valor buscado: «${textoCia(buscada).slice(0, 60)}». Lista «Compañía de origen» del seguro anterior de una moto en Allianz: elige la aseguradora que es la misma; si ninguna lo es, no elijas.`,
      opciones: visibles.map((o) => textoCia(o.etiqueta)),
    }).catch(() => null)
    if (i !== null && i >= 0 && i < visibles.length) valor = visibles[i]!.valor
  }
  // v0.7.21: sin casar (y NO ambigua) y con UNA opción genérica («OTRAS», «RESTO»…), se marca esa y se DECLARA.
  let supuestoGenerica: string | null = null
  if (valor === null && c.tipo === 'ninguna') {
    const g = indiceOpcionGenerica(reales.map((o) => textoCia(o.etiqueta)))
    if (g >= 0) {
      valor = reales[g]!.valor
      supuestoGenerica = supuestoCompaniaGenerica(buscada, textoCia(reales[g]!.etiqueta))
    }
  }
  if (valor === null) {
    throw new ErrorTarificador(
      'datos',
      `allianz/moto: Falta: compañía anterior reconocible por Allianz. ${c.tipo === 'ambigua' ? mensajeCompaniaAmbigua(buscada, c.candidatas.map((o) => textoCia(o.etiqueta))) : mensajeCompaniaNoCasa(buscada, reales.map((o) => textoCia(o.etiqueta)))}`,
    )
  }
  const campo = raiz.locator(sel).first()
  await comprobarCampo(campo)
  if (s.valor !== valor) await campo.selectOption(valor)
  if ((await campo.inputValue()) !== valor) throw new ErrorTarificador('portal', 'allianz/moto: el portal no dejó fijada la compañía de origen')
  return supuestoGenerica
}

/** `dd/mm/aaaa` (forma de las fechas que escribimos en los campos con máscara de fecha del portal). Puro. */
export const esFechaDdMmAaaa = (v: string): boolean => /^\d{2}\/\d{2}\/\d{4}$/.test(v)

/**
 * v0.7.17: escribe una fecha dd/mm/aaaa en un campo con la máscara de fecha del portal (`data-mask=«;mask:date(224);…»`,
 * class `input-DateText`) SIN teclas, sin foco y sin `input`/`blur`: setter nativo de `value` y luego `change` (para que
 * corra su `onchange`, p. ej. `menores25()`). Con `fill`/`pressSequentially` la máscara reinterpretaba lo escrito y dejaba
 * el mismo día y mes con el año +40 (trabajo real 3e85f80c). Nada se pulsa: no hay clic que pasar por `ctx.pulsar`.
 */
async function fijarFechaSinMascara(campo: Locator, valor: string): Promise<void> {
  const setterNativo = (el: Element, v: string) => {
    const i = el as HTMLInputElement
    const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(i), 'value')?.set
    if (set) set.call(i, v)
    else i.value = v
  }
  await comprobarCampo(campo)
  await campo.evaluate(setterNativo, valor)
  await campo.dispatchEvent('change')
}

/** Texto normal: `fill` + `change` + blur (v0.7.13). Fecha dd/mm/aaaa: sin pasar por la máscara (v0.7.17). */
async function escribirValorTexto(campo: Locator, valor: string): Promise<void> {
  if (esFechaDdMmAaaa(valor)) return fijarFechaSinMascara(campo, valor)
  await comprobarCampo(campo)
  await campo.fill(valor)
  await campo.dispatchEvent('change')
  await campo.blur().catch(() => undefined)
}

async function escribirTexto(raiz: Pick<Frame, 'locator'>, sel: string, valor: string): Promise<void> {
  const campo = raiz.locator(sel).first()
  if ((await campo.count()) === 0) throw new ErrorTarificador('portal', `allianz/moto: no aparece el campo ${sel} de Datos básicos`)
  await comprobarCampo(campo)
  await escribirValorTexto(campo, valor)
}

const alfanumerico = (s: string) => s.replace(/[^0-9A-Za-z]/g, '')

/**
 * FORMA de lo que el portal dejó en un campo de texto que no casa con lo escrito, para el mensaje de error. Puro. NUNCA el
 * valor (son fechas de nacimiento, pólizas…): solo «vacío», «otra fecha dd/mm/aaaa» o la longitud.
 */
export function formaTextoLeido(leido: string): string {
  const t = leido.trim()
  if (t === '') return 'quedó vacío'
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(t)) return 'quedó otra fecha dd/mm/aaaa'
  return `quedó un texto de ${t.length} caracteres con otro formato`
}

/**
 * v0.7.13 (trabajo real e5bcdb08, 20/10/2026): `#driverBirthDate` (onchange `menores25()`) no conservaba lo escrito al
 * terminar Datos básicos. Con la MISMA ficha, la 0.7.10 llegó a la validación y Allianz dijo «el conductor principal debe ser
 * mayor de 18 al sacarse el carnet» aunque las fechas de la ficha son coherentes (lo comprueba `exigirCarneCoherente`, que la
 * 0.7.12 pasó): el portal pierde/cambia la fecha de nacimiento tras escribirla (un recálculo posterior del formulario). Un
 * reintento: se reescribe TECLEANDO (la máscara de fecha del portal procesa teclas) y se quita el foco para que corran sus
 * `onchange`/`onblur`; quien relee después decide.
 */
async function reescribirTexto(raiz: Pick<Frame, 'locator'>, sel: string, valor: string, page: Pick<Page, 'waitForTimeout'>): Promise<void> {
  const campo = raiz.locator(sel).first()
  await comprobarCampo(campo)
  if (esFechaDdMmAaaa(valor)) {
    // v0.7.17: una fecha NO se reescribe tecleando (la máscara de fecha del portal reinterpretaba las teclas: año +40).
    await fijarFechaSinMascara(campo, valor)
    await page.waitForTimeout(300)
    return
  }
  await comprobarCampo(campo)
  await campo.fill('')
  await campo.pressSequentially(valor, { delay: 60, timeout: 15_000 })
  await campo.dispatchEvent('change')
  await campo.blur().catch(() => undefined)
  await page.waitForTimeout(300)
}

/** Compañía, póliza (5 cifras) y justificante del seguro anterior; solo si estuvo asegurado. Los datos ya se exigieron (`exigirDatosPortalMoto`). */
async function rellenarSeguroAnteriorMoto(raiz: Pick<Frame, 'locator'>, d: DatosPortalMoto, page: Pick<Page, 'waitForTimeout'>, ctx: Pick<ContextoPortal, 'formador'>): Promise<string | null> {
  const supuestoCompania = await elegirCompaniaOrigen(raiz, d.compania as string, page, ctx)
  await escribirTexto(raiz, SEL_SEGURO_ANTERIOR_MOTO.polizaOrigen, d.poliza5 as string)
  await fijarSelect(raiz, SEL_SEGURO_ANTERIOR_MOTO.fotocopia, FOTOCOPIA_PORTAL[d.fotocopia as ClaveFotocopia])
  return supuestoCompania
}

/** De dónde parece salir la fecha de nacimiento que el portal dejó en `#driverBirthDate` (v0.7.14, trabajo real 2f90524e). */
export type OrigenFechaLeida = 'nuestra' | 'vacia' | 'otro_formato' | 'registro' | 'carne' | 'adquisicion' | 'matriculacion' | 'dia_mes_cambiados' | 'anio_desplazado' | 'distinta'

/** Fechas dd/mm/aaaa conocidas al terminar Datos básicos. `previa` = lo que el portal traía en el campo ANTES de escribir (su registro). */
export type FechasConocidasMoto = { nuestra: string; previa: string | null; carne: string | null; adquisicion: string | null; matriculacion: string | null }

/**
 * Compara (por cifras, sin separadores) lo leído con las fechas conocidas. Puro. Solo devuelve una ETIQUETA: el valor nunca sale.
 * El orden importa: «registro» (lo que el portal traía) antes que las del formulario.
 */
export function origenFechaLeida(leido: string, c: FechasConocidasMoto): OrigenFechaLeida {
  const t = leido.trim()
  const k = alfanumerico(t)
  if (k === alfanumerico(c.nuestra)) return 'nuestra'
  if (t === '') return 'vacia'
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(t)) return 'otro_formato'
  const igual = (x: string | null) => x !== null && x.trim() !== '' && alfanumerico(x) === k
  if (igual(c.previa)) return 'registro'
  if (igual(c.carne)) return 'carne'
  if (igual(c.adquisicion)) return 'adquisicion'
  if (igual(c.matriculacion)) return 'matriculacion'
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(c.nuestra.trim())
  if (m && m[1] !== m[2] && k === `${m[2]}${m[1]}${m[3]}`) return 'dia_mes_cambiados'
  if (aniosDesplazados(t, c.nuestra) !== null) return 'anio_desplazado'
  return 'distinta'
}

/**
 * v0.7.17 (trabajo real 3e85f80c): si lo leído es nuestra fecha con el MISMO día y mes y solo el año cambiado, cuántos años
 * (con signo: +40 = el portal la dejó 40 años después). Un registro ajeno con el mismo día y mes es inverosímil: es la máscara
 * de fecha del portal. `null` si no es ese caso. Puro; no devuelve ninguna de las dos fechas.
 */
export function aniosDesplazados(leido: string, nuestra: string): number | null {
  const a = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(leido.trim())
  const b = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(nuestra.trim())
  if (!a || !b || a[1] !== b[1] || a[2] !== b[2] || a[3] === b[3]) return null
  return Number(a[3]) - Number(b[3])
}

export const MENSAJE_NACIMIENTO_REGISTRO_ALLIANZ =
  'allianz/moto: Allianz tiene otra fecha de nacimiento para este NIF (el portal pone la de su registro en lugar de la de la ficha); revisa la de la ficha'

/** Atributos de FORMATO de un campo (no datos personales) que explican cómo reinterpreta lo tecleado. */
export const ATRIBUTOS_FORMATO_CAMPO = ['type', 'maxlength', 'placeholder', 'data-mask', 'pattern', 'class'] as const

/**
 * «campo: type=text maxlength=10 placeholder=«dd/mm/aaaa» …» a partir de los atributos leídos. Puro. Cada valor saneado: solo
 * letras, `/ . : ; , ( ) _ -` y espacios; un ejemplo de fecha → «#fecha» y series de 4+ cifras → «#»; como mucho 40 caracteres.
 */
export function describirFormatoCampo(attrs: Readonly<Record<string, string | null>>): string | null {
  const limpio = (v: string) => v.replace(/\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/g, '#fecha').replace(/\d{4,}/g, '#').replace(/[^\p{L}\d/.:;,()_#\- ]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 40)
  const partes = ATRIBUTOS_FORMATO_CAMPO.filter((k) => attrs[k] !== null && attrs[k] !== undefined).map((k) => `${k}=«${limpio(attrs[k] as string)}»`)
  return partes.length > 0 ? `campo: ${partes.join(' ')}` : null
}

async function formatoCampo(raiz: Pick<Frame, 'locator'>, sel: string): Promise<string | null> {
  const attrs = await raiz.locator(sel).first().evaluate((el, ks) => Object.fromEntries(ks.map((k) => [k, el.getAttribute(k)])), [...ATRIBUTOS_FORMATO_CAMPO]).catch(() => null)
  return attrs ? describirFormatoCampo(attrs as Record<string, string | null>) : null
}

/** Error de `#driverBirthDate` según el origen. Puro. Registro de Allianz → `datos` (lo resuelve Alberto en la ficha); fallo nuestro → `portal`. */
/** dd/mm/aaaa → días desde 1970 (UTC, sin zona horaria: solo aritmética de calendario). `null` si no es una fecha real. Puro. */
function diaCalendario(t: string): { d: number; dia: string; mes: string; anio: string } | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t.trim())
  if (!m) return null
  const ms = Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
  const f = new Date(ms)
  if (f.getUTCFullYear() !== Number(m[3]) || f.getUTCMonth() !== Number(m[2]) - 1 || f.getUTCDate() !== Number(m[1])) return null
  return { d: Math.round(ms / 86_400_000), dia: m[1], mes: m[2], anio: m[3] }
}

/**
 * v0.7.16 (trabajo real 3e85f80c): cuánto y en qué difiere lo que quedó de lo que escribimos, SIN ninguna de las dos fechas:
 * diferencia en días con signo (− = anterior a la nuestra), los años aproximados si pasa de un año, y qué partes coinciden.
 * Distingue un desfase nuestro (±1 día, mes 0/1) de una fecha de otra persona/registro. Puro. `null` si alguna no es fecha.
 */
export function diferenciaFechaSinValor(leido: string, nuestra: string): string | null {
  const a = diaCalendario(leido)
  const b = diaCalendario(nuestra)
  if (!a || !b) return null
  const n = a.d - b.d
  const abs = Math.abs(n)
  const signo = n < 0 ? '−' : '+'
  const anios = abs >= 365 ? ` ≈ ${(Math.round((abs / 365.25) * 10) / 10).toLocaleString('es-ES')} años` : ''
  const partes = [['día', a.dia === b.dia], ['mes', a.mes === b.mes], ['año', a.anio === b.anio]] as const
  const iguales = partes.filter(([, ig]) => ig).map(([p]) => p)
  const distintas = partes.filter(([, ig]) => !ig).map(([p]) => p)
  const y = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`)
  const coincide = iguales.length === 0 ? 'día, mes y año distintos' : `mismo ${y(iguales)}, distinto ${y(distintas)}`
  const miles = String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, '.') // 3.652 (también con 4 cifras, regla del repo)
  return `difiere ${signo}${miles} ${abs === 1 ? 'día' : 'días'}${anios}; ${coincide}`
}

/** Error de `#driverBirthDate` según el origen. Puro. Registro de Allianz → `datos` (lo resuelve Alberto en la ficha); fallo nuestro → `portal`. */
export function errorFechaNacimientoMoto(origen: Exclude<OrigenFechaLeida, 'nuestra'>, leido: string, nuestra = '', formato: string | null = null): ErrorTarificador {
  const sel = SEL_DATOS_MOTO.conductorNacimiento
  const dif = diferenciaFechaSinValor(leido, nuestra)
  const extra = [dif, formato].filter((x): x is string => !!x)
  const conDif = extra.length > 0 ? ` [${extra.join('; ')}]` : ''
  if (origen === 'registro') return new ErrorTarificador('datos', `${MENSAJE_NACIMIENTO_REGISTRO_ALLIANZ}${conDif}`)
  if (origen === 'distinta') return new ErrorTarificador('datos', `${MENSAJE_NACIMIENTO_REGISTRO_ALLIANZ} (lo que queda en ${sel} es distinta de todas las fechas del formulario: probablemente del registro de Allianz)${conDif}`)
  if (origen === 'anio_desplazado') {
    const n = aniosDesplazados(leido, nuestra) as number
    return new ErrorTarificador('portal', `allianz/moto: el portal desplazó el año de ${sel} (año desplazado ${n > 0 ? '+' : '−'}${Math.abs(n)} años, mismo día y mes: lo reinterpreta su máscara de fecha, no es la ficha; escrita sin teclas y reescrita una vez)${conDif}`)
  }
  const que = { carne: '= fecha de carné', adquisicion: '= fecha de adquisición', matriculacion: '= fecha de matriculación', dia_mes_cambiados: '= nuestra fecha con día/mes cambiados' } as const
  const forma = origen === 'vacia' || origen === 'otro_formato' ? formaTextoLeido(leido) : `quedó ${que[origen]}`
  return new ErrorTarificador('portal', `allianz/moto: el portal no dejó escrito ${sel} (reescrito una vez; ${forma})${conDif}`)
}

/** ISO aaaa-mm-dd → días desde 1970 (UTC). `null` si no es una fecha real. Puro. */
function diaIso(iso: string | null | undefined): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso ?? '').trim())
  if (!m) return null
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return new Date(ms).toISOString().slice(0, 10) === m[0] ? Math.round(ms / 86_400_000) : null
}

const diasTexto = (n: number) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} ${n === 1 ? 'día' : 'días'}`

/**
 * v0.7.18 (trabajo real, 21/10/2026): Allianz rechaza «la fecha de adquisición del vehículo no puede ser anterior a la fecha de
 * primera matriculación», comparando con SU 1ª matriculación (`#fechaMatriculacion`, autorrellenada por la matrícula), no con la
 * nuestra (que en plataforma puede ser estimada por la serie de la matrícula). Decide qué adquisición escribir. Puro.
 * v0.7.19 (Alberto, 21/10/2026): venga de donde venga (por defecto, tecleada o sin marca), si es anterior a la del portal se
 * escribe la del portal y se declara como supuesto con cuántos días antes era (nunca las fechas). La marca
 * `fechaAdquisicionPorDefecto` se sigue aceptando en el formulario, pero ya no decide nada aquí.
 *  - Portal sin fecha legible, o adquisición ≥ la del portal → la nuestra, sin supuesto.
 *  - Adquisición anterior a la del portal → la del portal + supuesto.
 */
export function fechaAdquisicionFrentePortal(adquisicionIso: string, portalMatriculacionIso: string | null): { iso: string; supuesto: string | null } {
  const adq = diaIso(adquisicionIso)
  const portal = diaIso(portalMatriculacionIso)
  if (adq === null || portal === null || adq >= portal) return { iso: adquisicionIso, supuesto: null }
  return {
    iso: portalMatriculacionIso as string,
    supuesto: `Fecha de adquisición ajustada a la 1ª matriculación que Allianz tiene para la matrícula (la declarada era ${diasTexto(portal - adq)} anterior)`,
  }
}

/** Rellena Datos básicos de Moto. Devuelve los supuestos que hubo que tomar del portal (v0.7.18/0.7.19: la fecha de adquisición). */
export async function rellenarDatosBasicosMoto(raiz: Pick<Frame, 'locator'>, f: FormularioAuto, page: Pick<Page, 'waitForTimeout'>, ctx: Pick<ContextoPortal, 'formador'> = {}): Promise<string[]> {
  exigirDatosPortalMoto(f)
  const ant = datosPortalMoto(f)
  const plan = planDatosBasicosMoto(f)
  // v0.7.14: lo que el portal trae YA en la fecha de nacimiento (con tomador = conductor, la de su registro para ese NIF). Solo se compara.
  const leerTexto = (sel: string) => raiz.locator(sel).first().inputValue()
  const nacimientoPrevio = await leerTexto(SEL_DATOS_MOTO.conductorNacimiento).catch(() => null)
  let supuestoCompaniaMoto: string | null = null
  for (const op of plan) {
    const campo = raiz.locator(op.sel).first()
    if ((await campo.count()) === 0) throw new ErrorTarificador('portal', `allianz/moto: no aparece el campo ${op.sel} de Datos básicos`)
    await comprobarCampo(campo)
    if (op.tipo === 'texto') {
      // v0.7.13: quitar el foco AQUÍ (`onblur` del portal). v0.7.17: las fechas dd/mm/aaaa, sin teclas (máscara de fecha).
      await escribirValorTexto(campo, String(op.valor))
    } else if (op.tipo === 'select') {
      await campo.selectOption(String(op.valor))
    } else {
      await comprobarCampo(campo)
      await campo.setChecked(op.valor === true)
    }
    // «Asegurado en otra compañía» = Sí abre compañía de origen, póliza y justificante: antes de los años en la compañía.
    if (op.sel === SEL_DATOS_MOTO.aseguradoOtraCia && op.valor === 'S' && ant.estuvoAsegurado) supuestoCompaniaMoto = await rellenarSeguroAnteriorMoto(raiz, ant, page, ctx)
  }
  // v0.7.18: la adquisición se compara con la 1ª matriculación que el PORTAL ya tiene (la de la matrícula), no con la nuestra.
  // v0.7.19: si es anterior, se escribe la del portal (setter nativo de la 0.7.17) y se declara, venga de donde venga.
  const matriculacionPortal = fechaIsoDesdeTexto(await raiz.locator(SEL_DATOS_MOTO.fechaMatriculacion).first().inputValue({ timeout: 1_000 }).catch(() => ''))
  const adquisicion = fechaAdquisicionFrentePortal(ant.fechaAdquisicionIso as string, matriculacionPortal)
  const adquisicionEs = fechaEs(adquisicion.iso)
  await escribirTexto(raiz, SEL_SEGURO_ANTERIOR_MOTO.fechaAdquisicion, adquisicionEs)
  const textos: Array<[string, string]> = [
    ...plan.filter((o) => o.tipo === 'texto').map((o): [string, string] => [o.sel, String(o.valor)]),
    [SEL_SEGURO_ANTERIOR_MOTO.fechaAdquisicion, adquisicionEs],
    ...(ant.estuvoAsegurado ? ([[SEL_SEGURO_ANTERIOR_MOTO.polizaOrigen, ant.poliza5 as string]] as Array<[string, string]>) : []),
  ]
  const nacimiento = String(plan.find((o) => o.sel === SEL_DATOS_MOTO.conductorNacimiento)?.valor ?? '')
  const conocidas = async (): Promise<FechasConocidasMoto> => ({
    nuestra: nacimiento,
    previa: nacimientoPrevio,
    carne: String(plan.find((o) => o.sel === SEL_DATOS_MOTO.conductorCarne)?.valor ?? ''),
    adquisicion: adquisicionEs,
    matriculacion: await raiz.locator(SEL_DATOS_MOTO.fechaMatriculacion).first().inputValue({ timeout: 1_000 }).catch(() => null),
  })
  // v0.7.13: lo que el portal perdió tras escribirlo (p. ej. la fecha de nacimiento, trabajo e5bcdb08) se reescribe UNA vez.
  // v0.7.14: salvo que la fecha de nacimiento sea la que el portal traía de su registro: no se pelea, se para (`datos`).
  for (const [sel, esperado] of textos) {
    const leido = await leerTexto(sel)
    if (alfanumerico(leido) === alfanumerico(esperado)) continue
    if (sel === SEL_DATOS_MOTO.conductorNacimiento && origenFechaLeida(leido, await conocidas()) === 'registro') throw errorFechaNacimientoMoto('registro', leido, nacimiento, await formatoCampo(raiz, sel))
    await reescribirTexto(raiz, sel, esperado, page)
  }
  // Releer TODO al final: los selects encadenados (años en la compañía → años sin siniestros) pueden revertirse, y las
  // fechas/póliza tienen que haber quedado escritas (un campo vacío o reformateado: el portal lo rechazaría con un error engañoso).
  for (const op of plan.filter((o) => o.tipo === 'select')) {
    if ((await raiz.locator(op.sel).first().inputValue()) !== op.valor) throw new ErrorTarificador('portal', `allianz/moto: el portal no dejó fijado ${op.sel}`)
  }
  for (const [sel, esperado] of textos) {
    const leido = await leerTexto(sel)
    if (alfanumerico(leido) === alfanumerico(esperado)) continue
    if (sel === SEL_DATOS_MOTO.conductorNacimiento) {
      const origen = origenFechaLeida(leido, await conocidas())
      if (origen !== 'nuestra') throw errorFechaNacimientoMoto(origen, leido, nacimiento, await formatoCampo(raiz, sel))
    }
    const desp = esFechaDdMmAaaa(esperado) ? aniosDesplazados(leido, esperado) : null
    const forma = desp !== null ? `año desplazado ${desp > 0 ? '+' : '−'}${Math.abs(desp)} años, mismo día y mes: máscara de fecha del portal` : formaTextoLeido(leido)
    throw new ErrorTarificador('portal', `allianz/moto: el portal no dejó escrito ${sel} (reescrito una vez; ${forma})`)
  }
  if (ant.estuvoAsegurado) {
    if ((await raiz.locator(SEL_SEGURO_ANTERIOR_MOTO.companiaOrigen).first().inputValue()) === '') throw new ErrorTarificador('portal', `allianz/moto: el portal vació ${SEL_SEGURO_ANTERIOR_MOTO.companiaOrigen}`)
    if ((await raiz.locator(SEL_SEGURO_ANTERIOR_MOTO.fotocopia).first().inputValue()) !== FOTOCOPIA_PORTAL[ant.fotocopia as ClaveFotocopia]) throw new ErrorTarificador('portal', `allianz/moto: el portal no dejó fijado ${SEL_SEGURO_ANTERIOR_MOTO.fotocopia}`)
  }  return [...(adquisicion.supuesto ? [adquisicion.supuesto] : []), ...(supuestoCompaniaMoto ? [supuestoCompaniaMoto] : [])]
}

/**
 * Matrícula (solo `fill` + `change`; el manejador del portal es `eventoMatriculaDatosBasicos()`) → el portal autorrellena la
 * 1ª matriculación en un campo bloqueado. Devuelve esa fecha ISO. Sin fecha a tiempo → error `datos` (la antigüedad del
 * vehículo cambia el precio: no se cotiza sin ella). La matrícula no sale en ningún mensaje.
 */
export async function consultarMatriculaMoto(raiz: Pick<Frame, 'locator'>, matricula: string, page: Pick<Page, 'waitForTimeout'>, timeoutMs = 15_000): Promise<string> {
  const campo = raiz.locator(SEL_DATOS_MOTO.matricula).first()
  if ((await campo.count()) === 0) throw new ErrorTarificador('portal', 'allianz/moto: no aparece el campo de matrícula')
  await comprobarCampo(campo)
  await campo.fill(matricula)
  await campo.dispatchEvent('change')
  const fin = Date.now() + timeoutMs
  for (;;) {
    const t = await raiz.locator(SEL_DATOS_MOTO.fechaMatriculacion).first().inputValue({ timeout: 1_000 }).catch(() => '')
    const iso = fechaIsoDesdeTexto(t)
    if (iso) return iso
    if (Date.now() >= fin) throw new ErrorTarificador('datos', 'allianz/moto: la matrícula no devolvió la fecha de primera matriculación')
    await page.waitForTimeout(300)
  }
}

// ── pantalla de error («INFORME DE AVISO E INCIDENCIAS») ──

export type Incidencia = { tipo: 'error' | 'aviso'; /** Id del campo si el portal lo da. */ campo: string | null; mensaje: string }

/**
 * Una fila del informe → incidencia. Puro. Filas de error: `tr.rowAppErrorTextBlock` (celda 1 = «NN <b>campo</b>», celda 2 =
 * mensaje); informativas (p. ej. «Alerta — Proyecto archivado correctamente»): `tr.rowAppErrorInfoTextBlock`. El mensaje se
 * pasa por el redactor de datos personales (el portal podría repetir un valor tecleado) y se corta.
 */
export function incidenciaDesdeFila(clase: string, campoNegrita: string | null, mensaje: string): Incidencia | null {
  const tipo = /\browAppErrorInfoTextBlock\b/.test(clase) ? 'aviso' : /\browAppErrorTextBlock\b/.test(clase) ? 'error' : null
  if (!tipo) return null
  const c = (campoNegrita ?? '').trim()
  return { tipo, campo: /^[A-Za-z_][A-Za-z0-9_.]{0,39}$/.test(c) ? c : null, mensaje: redactarDatosPersonales(mensaje.replace(/\s+/g, ' ').trim()).slice(0, 200) }
}

export async function leerIncidencias(raiz: Pick<Frame, 'locator'>): Promise<Incidencia[]> {
  const filas = await raiz.locator(`#dataErrorSection ${SEL_INCIDENCIAS.replace(', ', ', #dataErrorSection ')}`).evaluateAll((els) =>
    els.map((e) => {
      const celdas = Array.from(e.querySelectorAll('td'))
      return { clase: e.className, campo: celdas[0]?.querySelector('b')?.textContent ?? null, mensaje: celdas[1]?.textContent ?? '' }
    }),
  )
  return filas.map((f) => incidenciaDesdeFila(f.clase, f.campo, f.mensaje)).filter((i): i is Incidencia => i !== null)
}

/** Hay errores de validación del portal → error `datos` con campo y mensaje saneados (nunca se avanza con ellos). */
export async function lanzarSiHayErrores(raiz: Pick<Frame, 'locator'>): Promise<void> {
  const errores = (await leerIncidencias(raiz)).filter((i) => i.tipo === 'error')
  if (errores.length === 0) return
  throw new ErrorTarificador('datos', `allianz/auto: el portal rechaza los datos: ${errores.map((e) => `${e.campo ? `[${e.campo}] ` : ''}${e.mensaje}`).join(' · ')}`)
}

/** Flujo MOTO: Riesgo municipio → (avance autorizado) Datos básicos → (avance autorizado) Tarificar → lectura de primas. */
async function tarificarMoto(page: Page, form: FormularioAuto, ctx: ContextoPortal): Promise<ResultadoAdaptador> {
  // Todo lo que se puede comprobar SIN tocar el portal, antes de abrirlo (fail-closed).
  if (!form.seleccionVehiculo) throw new ErrorTarificador('datos', 'allianz/moto: falta seleccionVehiculo (marca, modelo y clase): el portal de Moto no busca el vehículo por matrícula')
  if ((form.seleccionVehiculo.clase ?? null) === null) throw new ErrorTarificador('datos', 'allianz/moto: falta la clase (tramo de cilindrada 1-4) de la moto')
  // Allianz separa Moto y Ciclomotor (≤50 cc): sin cilindrada, o ciclomotor, no se tarifica con el producto Moto.
  const cc = form.seleccionVehiculo.cilindradaCc ?? null
  if (cc === null) throw new ErrorTarificador('datos', 'allianz/moto: falta la cilindrada (Allianz separa Moto y Ciclomotor)')
  if (cc <= 50) throw new ErrorTarificador('datos', 'allianz/moto: ciclomotor (≤50 cc): producto Ciclomotor de Allianz, no Moto; no soportado aún')
  comprobarTitularesMoto(form)
  planDatosBasicosMoto(form)
  exigirDatosPortalMoto(form) // v0.7.11: póliza/compañía/justificante anterior y fecha de adquisición: hueco claro antes de abrir el portal
  if (!(ctx.sesionReutilizada && (await sesionSirve(page, ctx)))) await login(page, ctx)
  await ctx.trasLogin()
  await abrirNuevaAlta(page, ctx, { pestana: 'Autos', producto: 'Moto', selectorTarjeta: TARJETA_AUTOS.moto })
  const riesgo = await marcoCon(page, (r) => r.locator(SEL_RIESGO_MOTO.marca), 'Riesgo municipio (marca)')
  await elegirVehiculoMoto(riesgo, form.seleccionVehiculo, page)
  // v0.7.1: sin elección explícita ni vehículo confirmado que case, solo se elige si es inequívoco; si no, requiere_humano (nunca «la primera»).
  const lectura = await leerVehiculoPortal(riesgo)
  const yaElegida = eleccionVersionConOrigen(lectura, form).eleccion !== null
  const auto = yaElegida ? null : eleccionVersionMotoPorSimilitud(lectura.versiones, form.seleccionVehiculo)
  // v0.7.2: ambigua → se elige SOLA si las candidatas son equivalentes (declarado); diferencias materiales → ErrorEleccionVersion (como la 0.7.1).
  const porEquivalencia = auto?.tipo === 'ambigua' ? versionAutomaticaAllianz(auto.opciones, form) : null
  const elegidaAuto = auto?.tipo === 'unica' ? auto.eleccion : (porEquivalencia?.eleccion ?? null)
  const vehiculo = await resolverVehiculo(riesgo, lectura, elegidaAuto ? { ...form, eleccionVersion: elegidaAuto } : form)
  const supuestoVersion: string | null = porEquivalencia?.supuesto ?? null
  await ctx.pausa()
  await rellenarRiesgoMoto(riesgo, form, page, ctx)
  await lanzarSiHayErrores(riesgo)
  // 18/10/2026: lo que Allianz USA (leído del portal, no de la ficha): CP y población del riesgo, y el vehículo fijado.
  const leerCampo = async (sel: string) => (await riesgo.locator(sel).first().inputValue({ timeout: 2_000 }).catch(() => null))
  const usados = { codigoPostal: await leerCampo(SEL_RIESGO_MOTO.codigoPostal), localidad: await leerCampo(SEL_RIESGO_MOTO.poblacion), vehiculo: { marca: vehiculo.marca, modelo: vehiculo.modelo, version: vehiculo.version } }
  await ctx.pausa()
  // El marco de Datos básicos es el del formulario de DESTINO que confirma el guard (no uno elegido por otro selector).
  const datos = await avanzarPestanaGuardada(page, ctx, 'datosBasicos', 'moto')
  await lanzarSiHayErrores(datos)
  const fechaMatriculacion = await consultarMatriculaMoto(datos, form.matricula, page)
  const supuestosDatos = await rellenarDatosBasicosMoto(datos, form, page, ctx)
  await lanzarSiHayErrores(datos)
  await ctx.pausa()
  // Tarificar: SOLO se abre la pestaña y se leen primas. Nada del pie, ni Archivar/Emitir/Proyecto Ampliado/Datos emisión (el adaptador no guarda: eso es del explorador).
  const tarifa = await avanzarPestanaGuardada(page, ctx, 'tarificar', 'moto')
  await lanzarSiHayErrores(tarifa)
  const primas = await leerPrimasTarificar(tarifa)
  // v0.7.20: ⚠ Normas de Contratación, texto rojo (TIREA) y CUESTIONARIO (CAP / Cliente Alto Potencial) se LEEN; no se cambia ni pulsa nada.
  const { extras, avisos: avisosTabla } = await extrasTarificarMotoSeguros(tarifa, primas.map((p) => p.modalidad))
  const pedido = avisoCuestionarioPedido(form)
  // 18/10/2026: los antecedentes SUPUESTOS (favorables) viajan con cada oferta («Precio con supuestos: …»). v0.7.20: prima = «Anual sucesivos».
  const ofertas = ofertasMotoDesdePrimas(
    primas,
    { ...vehiculo, fechaMatriculacion: fechaMatriculacion || vehiculo.fechaMatriculacion },
    { supuestoVersion, form, delPortal: [...supuestosDatos, ...supuestosAvanceAceptados(page)], supuestoPeriodo: CONFIRMS_AVANCE_ACEPTABLES['td#datosBasicos']?.supuesto ?? null },
    extras?.normas ?? [],
  )
  return {
    ofertas: conDatosUsados(ofertas.map((o) => ({ ...o, avisos: [...o.avisos, ...avisosTabla, ...(pedido ? [pedido] : [])] })), usados),
    // El vehículo fijado en el `<select>` (resolverVehiculo): asegura solo lo encadena a Generali en ramo auto; viaja igual.
    seleccionVehiculo: seleccionVehiculoConfirmada(usados.vehiculo),
  }
}

// ───────────────────────── flujo (con huecos) ─────────────────────────

/**
 * ¿Es la app NUEVA de Turismos? Grabación 13/10/2026: `appArea` la carga el puente SSO de otro origen
 * (`rws-router-sso-domain-bridge`, RelayState `ngx-motor-azs/`), app Angular sin mapa. Puro.
 */
export function esAppNuevaTurismos(url: string): boolean {
  return /ngx-motor-azs|rws-router-sso/i.test(url)
}

/** Lo que se espera al formulario de Turismos antes de declarar el hueco (por debajo del tope de paso de 30 s). */
export const MS_ESPERA_FORMULARIO_TURISMOS = 25_000

const HUECO_TURISMOS =
  'el formulario de AUTOS Turismos (la app nueva ngx-motor-azs, en un iframe de otro origen: no se localizó su marco con la pestaña «Datos del vehículo»)'

/**
 * Marco del motor de Turismos (`https://cloud.e-pacallianz.com/ngx-motor-azs/`, iframe `appArea` de OTRO origen). v0.6.0
 * (15/10/2026): ya no se busca `#licensePlate` (ids de Moto); se busca el marco por su URL EXACTA (`esAppTurismosAllianz`) y por
 * la pestaña accesible «Datos del vehículo». Si no aparece en `timeoutMs` → `ErrorMapaIncompleto` (pide inventario) ANTES de
 * rellenar nada. Solo lectura (sondas `count()`), sin clics.
 */
export async function marcoFormularioTurismos(page: Pick<Page, 'frames' | 'waitForTimeout'>, timeoutMs = MS_ESPERA_FORMULARIO_TURISMOS): Promise<Frame> {
  const fin = Date.now() + timeoutMs
  for (;;) {
    for (const f of page.frames()) {
      if (f.isDetached() || !esAppTurismosAllianz(f.url())) continue
      if ((await f.getByRole('tab', { name: PASO_VEHICULO }).count().catch(() => 0)) > 0) return f
    }
    if (Date.now() >= fin) throw new ErrorMapaIncompleto(HUECO_TURISMOS, true)
    await page.waitForTimeout(500)
  }
}

// ───────────────────────── Turismos · paso «Datos del vehículo» (v0.6.0; v0.6.1 rellena el resto del paso) ─────────────────────────
// Controles SIEMPRE por etiqueta/rol accesible (los ids de la app Angular son dinámicos: `ng-xxxx-nx-input-12`) y SIEMPRE dentro de
// la zona `appArea` del marco y fuera de la cabecera (v0.6.1: en la prueba real del 15/10/2026 «Matrícula» casaba 2 veces porque el
// desplegable de colaborador y el buscador «Buscar Aquí...» de la cabecera también cuentan).

/** Textos visibles vistos en el inventario del 15/10/2026 (primer paso). */
export const PASO_VEHICULO = 'Datos del vehículo'
export const ETIQUETA_CONOCE_MATRICULA = '¿Conoces la matrícula del vehículo?'
export const ETIQUETA_MATRICULA = 'Matrícula'
export const BOTON_ENCUENTRA_VEHICULO = 'Encuentra mi vehículo'
export const BOTON_SIGUIENTE_TURISMOS = 'SIGUIENTE'
export const OPCION_SI = 'Sí'

/** Etiquetas EXACTAS de los campos de texto del paso (inventario saneado del 15/10/2026, `allianz-turismos-paso2`). */
export const ETIQUETAS_TURISMOS = {
  documento: 'Número de documento',
  codigoPostal: 'Código postal',
  localidad: 'Localidad',
  nacimientoConductor: 'Fecha de nacimiento del conductor',
  carnetConductor: 'Fecha de expedición de carnet',
  fechaEfecto: '¿Cuándo quieres que comience tu seguro?',
} as const

/** Claves de la lista cerrada de opciones de `guard.ts` (`OPCIONES_TURISMOS_ALLIANZ`): el adaptador solo pide CLAVES. */
export const CLAVE_CONOCE_MATRICULA = 'conoce_matricula:si'
export const CLAVE_GARAJE_CALLE = 'garaje:calle'
export const CLAVE_TOMADOR_INDIVIDUAL = 'tomador:individual'
export const CLAVE_TOMADOR_EMPRESA = 'tomador:empresa'
/** v0.6.2: claves de los supuestos (misma lista cerrada de guard.ts). */
export const CLAVE_COMPRA_NUEVO = 'compra:nuevo'
export const CLAVE_COMPRA_YA_LO_TENIA = 'compra:ya_lo_tenia'
export const CLAVE_SEGUNDO_CONDUCTOR_NO = 'segundo_conductor:no'
/** v0.6.5: «¿Es el tomador de la póliza el propietario?» y «El tomador ¿también conduce el vehículo?» = Sí («Datos personales»). */
export const CLAVE_TOMADOR_PROPIETARIO_SI = 'tomador_propietario:si'
export const CLAVE_TOMADOR_CONDUCE_SI = 'tomador_conduce:si'
export const claveUsoTurismos = (uso: 'ocasional' | 'diario' | 'laboral') => `uso:${uso}`
export const claveGarajeTurismos = (g: 'calle' | 'colectivo' | 'individual') => `garaje:${g}`

/** Zona de trabajo del marco: el contenedor `appArea` (o el `body` si el marco ES el iframe `appArea`). */
export const zonaTurismos = (marco: Pick<Frame, 'locator'>): Locator => marco.locator(SEL_ZONA_APP_TURISMOS)
const sinCabecera = (marco: Pick<Frame, 'locator'>, l: Locator): Locator => l.and(marco.locator(SEL_FUERA_CABECERA_TURISMOS))

/** Modal VISIBLE del marco (todo el marco: los overlays de CDK/ndbx viven fuera de `appArea`). Solo lectura. */
export const SEL_MODAL_TURISMOS = '[role=dialog], [role=alertdialog], [aria-modal=true], nx-modal-container'
export const modalTurismos = (marco: Pick<Frame, 'locator'>): Locator => marco.locator(SEL_MODAL_TURISMOS).locator('visible=true')

/** Campo de texto por su etiqueta EXACTA, dentro de la zona `appArea` y fuera de la cabecera. */
export const campoTurismos = (marco: Pick<Frame, 'locator'>, etiqueta: string): Locator => sinCabecera(marco, zonaTurismos(marco).getByLabel(etiqueta, { exact: true }))
/** Botón VISIBLE por su nombre accesible EXACTO, dentro de la zona `appArea` y fuera de la cabecera (v0.6.3: un gemelo oculto no cuenta). */
export const botonTurismos = (marco: Pick<Frame, 'locator'>, nombre: string | RegExp): Locator =>
  sinCabecera(marco, zonaTurismos(marco).getByRole('button', { name: nombre, exact: true })).filter({ visible: true })
/**
 * v0.6.5: «SIGUIENTE» VISIBLE del paso activo. En el DOM real el texto es « Siguiente » (las mayúsculas son de CSS) y hay UNO por
 * paso (ocho; solo el del paso activo se ve): nombre sin distinguir mayúsculas, exacto salvo espacios. «Anterior» nunca.
 */
export const RE_BOTON_SIGUIENTE_TURISMOS = /^\s*siguiente\s*$/i
export const botonSiguienteTurismos = (marco: Pick<Frame, 'locator'>): Locator => botonTurismos(marco, RE_BOTON_SIGUIENTE_TURISMOS)

/** `formador` (opcional): solo para el atasco de «Matrícula» (candidatos con pista, se aprende al elegir). */
export type CtxTurismos = Pick<ContextoPortal, 'pulsar' | 'pausaAccion' | 'marcarOpcionTurismos' | 'marcarTarjetaVehiculoTurismos'> & Partial<Pick<ContextoPortal, 'formador' | 'companiaActualTurismos' | 'marcarAntecedenteTurismos' | 'polizaActualTurismos' | 'guardarPresupuestoTurismos' | 'trabajoId'>>

const ESPERA_CONTROL_TURISMOS_MS = 8_000
/** Espera por campo del resto del paso (la pantalla ya está pintada tras la consulta: no se acumulan 8 s por hueco). */
const ESPERA_CAMPO_TURISMOS_MS = 1_500
export const ESPERA_RESULTADO_VEHICULO_MS = 20_000

/** Habilitado de verdad: ni `disabled` nativo ni `aria-disabled="true"` (los botones de Angular Material/ndbx usan el segundo). */
export async function habilitadoDeVerdad(loc: Locator): Promise<boolean> {
  if (!(await loc.isEnabled().catch(() => false))) return false
  return (await loc.getAttribute('aria-disabled').catch(() => null)) !== 'true'
}

/** Espera a que haya EXACTAMENTE un control (y, si `habilitado`, activo); si no, hueco con inventario. */
async function unicoControl(page: Pick<Page, 'waitForTimeout'>, loc: Locator, que: string, habilitado: boolean, timeoutMs = ESPERA_CONTROL_TURISMOS_MS): Promise<Locator> {
  const fin = Date.now() + timeoutMs
  for (;;) {
    const n = await loc.count().catch(() => 0)
    if (n === 1 && (!habilitado || (await habilitadoDeVerdad(loc)))) return loc
    if (Date.now() >= fin) throw new ErrorMapaIncompleto(`${que} (${n === 0 ? 'no aparece' : n > 1 ? `hay ${n}, se esperaba uno` : 'sigue deshabilitado'})`, true)
    await page.waitForTimeout(300)
  }
}

/**
 * v0.6.3: campo de texto ÚNICO por su etiqueta EXACTA en la zona `appArea` DEL MARCO del motor, por el localizador común
 * (`localizarControl`): fuera ocultos, deshabilitados, cabecera/menús, buscadores, bancarios y no editables. Se reintenta hasta
 * `timeoutMs` solo con la heurística; el último intento lleva el `formador` (pistas aprendidas y, si no, ATASCO con los
 * candidatos). 0 o ≥2 → `ErrorMapaIncompleto` (con inventario) del adaptador: «… (no aparece)» / «… (hay N, se esperaba uno)».
 */
export async function campoUnicoTurismos(
  page: Pick<Page, 'waitForTimeout'>,
  marco: Frame,
  etiqueta: string,
  que: string,
  timeoutMs = ESPERA_CONTROL_TURISMOS_MS,
  formador?: ContextoPortal['formador'],
  paso: string = PASO_VEHICULO,
  contenedor: string = SEL_ZONA_APP_TURISMOS,
): Promise<{ locator: Locator; confirmar: () => Promise<void> }> {
  const buscar = (f?: ContextoPortal['formador']) =>
    localizarControl(marco, { paso, etiqueta }, { adaptador: 'allianz/auto', contenedor, formador: f, pideInventarioDom: true })
  const fin = Date.now() + timeoutMs
  for (;;) {
    const ultimo = Date.now() >= fin
    try {
      const r = await buscar(ultimo ? formador : undefined)
      return { locator: r.locator, confirmar: r.confirmar }
    } catch (e) {
      if (!(e instanceof ErrorLocalizar)) throw e
      if (ultimo) throw new ErrorMapaIncompleto(`${que} (${e.decision === 'varios' ? `hay ${e.candidatos.length}, se esperaba uno` : 'no aparece'})`, true)
    }
    await page.waitForTimeout(300)
  }
}

/** Versiones que ofrece el portal, SOLO si el control es un `<select>` nativo con etiqueta «Versión». Otro control → `null`. */
export async function leerVersionesTurismos(marco: Pick<Frame, 'locator'>): Promise<{ control: Locator; opciones: CandidatoVersion[] } | null> {
  const control = sinCabecera(marco, zonaTurismos(marco).getByLabel(/^versi[oó]n$/i)).filter({ visible: true })
  if ((await control.count().catch(() => 0)) !== 1) return null
  const opciones = await control
    .evaluate((el) => (el.tagName === 'SELECT' ? Array.from((el as HTMLSelectElement).options).map((o) => ({ etiqueta: (o.textContent ?? '').trim(), codigo: o.value || null })) : null))
    .catch(() => null)
  return opciones ? { control, opciones: opciones.filter((o) => !esOpcionVacia(o.etiqueta)) } : null
}

/**
 * Elección de versión tras «Encuentra mi vehículo». Una sola o elegida → se FIJA por el código de SU opción y se relee.
 * Varias que no casan con UNA sola (elección del formulario o vehículo confirmado) → `ErrorEleccionVersion` (requiere_humano) con
 * todas (v0.6.17, 19/10/2026: se revoca «la primera»). v0.6.18: si son EQUIVALENTES se elige sola y `supuesto` lo declara. Solo Turismos. `conVersiones`: había selector.
 */
export async function resolverVersionTurismos(
  marco: Pick<Frame, 'locator'>,
  form: Pick<FormularioAuto, 'eleccionVersion' | 'vehiculoConfirmado' | 'seleccionVehiculo' | 'fechaMatriculacion'>,
): Promise<{ conVersiones: boolean; supuesto: string | null }> {
  const l = await leerVersionesTurismos(marco)
  if (!l || l.opciones.length === 0) return { conVersiones: false, supuesto: null }
  const { eleccion } = eleccionVersionConOrigen({ versiones: l.opciones }, form)
  const r = resolverVersion(l.opciones, eleccion)
  let supuesto: string | null = null
  let elegida: CandidatoVersion
  if (r.tipo === 'ninguna') return { conVersiones: false, supuesto: null }
  if (r.tipo === 'ambigua') {
    // v0.6.18: equivalentes → se elige SOLA y se declara; diferencias materiales → ErrorEleccionVersion con todas.
    const a = versionAutomaticaAllianz(r.opciones, form)
    supuesto = a.supuesto
    elegida = r.opciones[a.indice]!
  } else elegida = r.candidato
  const codigo = elegida.codigo
  if (!codigo) throw new ErrorTarificador('portal', 'allianz/auto: la versión resuelta no tiene código en el desplegable: no se puede fijar')
  if ((await l.control.inputValue()) !== codigo) {
    await comprobarCampo(l.control)
    await l.control.selectOption(codigo)
  }
  if ((await l.control.inputValue()) !== codigo) throw new ErrorTarificador('portal', 'allianz/auto: el portal no dejó fijada la versión resuelta')
  return { conVersiones: true, supuesto }
}

// ── v0.6.4: tarjetas de vehículo tras «Encuentra mi vehículo» (inventario real del trabajo ebe2bb1e, 17/10/2026) ──

/** Encabezado bajo el que el portal pinta las tarjetas (la puerta de guard.ts lo exige). */
export const ENCABEZADO_TARJETAS_VEHICULO = ENCABEZADO_TARJETAS_VEHICULO_TURISMOS
export type { TarjetaVehiculoTurismos }

/** Las tarjetas, solo cuando su número no cambia en dos lecturas seguidas (el portal puede pintarlas de una en una). */
async function tarjetasVehiculoEstables(page: Pick<Page, 'waitForTimeout'>, marco: Frame): Promise<TarjetaVehiculoTurismos[]> {
  const a = await leerTarjetasVehiculoTurismosAllianz(marco)
  if (a.length === 0) return a
  await page.waitForTimeout(400)
  const b = await leerTarjetasVehiculoTurismosAllianz(marco)
  return b.length === a.length ? b : []
}

/**
 * Qué tarjeta se elige (pura). Una → esa. Varias: la elección de la bandeja (`eleccionVersion`, por ETIQUETA: los ids son
 * dinámicos y no valen de una sesión a otra) o la del vehículo confirmado por similitud (`eleccionVersionConOrigen`, solo si casa UNA).
 * v0.6.18: cualquier otro caso con varias → se elige SOLA si las tarjetas son EQUIVALENTES (`versionAutomaticaAllianz`; `supuesto` lo declara);
 * si difieren de forma material → `ErrorEleccionVersion` (requiere_humano) con la etiqueta exacta de cada tarjeta (marca, modelo, combustible…).
 */
export function decidirTarjetaVehiculoTurismos(
  tarjetas: readonly Pick<TarjetaVehiculoTurismos, 'etiqueta'>[],
  form: Pick<FormularioAuto, 'eleccionVersion' | 'vehiculoConfirmado' | 'seleccionVehiculo' | 'fechaMatriculacion'>,
): { indice: number; supuesto: string | null } {
  if (tarjetas.length === 0) throw new ErrorMapaIncompleto(`las tarjetas de vehículo de «${BOTON_ENCUENTRA_VEHICULO}» (no hay ninguna)`, true)
  if (tarjetas.length === 1) return { indice: 0, supuesto: null }
  const candidatos: CandidatoVersion[] = tarjetas.map((t) => ({ etiqueta: t.etiqueta, codigo: null }))
  const { eleccion } = eleccionVersionConOrigen({ versiones: candidatos }, form)
  if (eleccion) {
    const r = resolverVersion(candidatos, eleccion)
    if (r.tipo === 'unica') {
      const i = tarjetas.findIndex((t) => t.etiqueta === r.candidato.etiqueta)
      if (i >= 0) return { indice: i, supuesto: null }
    }
  }
  // v0.6.18: equivalentes → la primera de las compatibles (o la de fecha más cercana), declarada; diferencias materiales → ErrorEleccionVersion.
  const a = versionAutomaticaAllianz(candidatos, form)
  return { indice: a.indice, supuesto: a.supuesto }
}

/**
 * Elige la tarjeta decidida por la puerta de guard.ts (`ctx.marcarTarjetaVehiculoTurismos`: appArea, bajo «Detalles del vehículo»,
 * veto de emisión/pago/banca, un clic y relectura). `no_unica`/`no_quedo` → hueco con inventario.
 */
export async function elegirTarjetaVehiculoTurismos(
  marco: Frame,
  form: Pick<FormularioAuto, 'eleccionVersion' | 'vehiculoConfirmado' | 'seleccionVehiculo' | 'fechaMatriculacion'>,
  ctx: Pick<CtxTurismos, 'marcarTarjetaVehiculoTurismos'>,
  tarjetas: readonly TarjetaVehiculoTurismos[],
): Promise<{ supuesto: string | null }> {
  if (typeof ctx?.marcarTarjetaVehiculoTurismos !== 'function') throw new ErrorMapaIncompleto('la puerta guardada de tarjetas de vehículo de Turismos en el contexto del worker', false, true)
  const { indice, supuesto } = decidirTarjetaVehiculoTurismos(tarjetas, form)
  const r = await ctx.marcarTarjetaVehiculoTurismos(marco, indice, tarjetas[indice]!.etiqueta)
  if (r.estado === 'no_unica' || r.estado === 'no_quedo') {
    throw new ErrorMapaIncompleto(`la tarjeta de vehículo elegida tras «${BOTON_ENCUENTRA_VEHICULO}» (${r.estado === 'no_unica' ? `${r.coincidencias} coincidencias` : 'tras pulsarla no quedó elegida'})`, true)
  }
  return { supuesto }
}

/** Une el supuesto de la versión al «Precio con supuestos: …» del riesgo (un solo aviso, versión primero). Puro. */
export function unirSupuestoVersion(supuestoVersion: string | null, riesgo: string | null): string | null {
  if (!supuestoVersion) return riesgo
  const resto = riesgo?.startsWith(PREFIJO_SUPUESTOS) ? riesgo.slice(PREFIJO_SUPUESTOS.length).replace(/\.$/, '').split(', ') : []
  return textoSupuestos([supuestoVersion, ...resto])
}

/**
 * Paso 1 «Datos del vehículo», parte del vehículo: «¿Conoces la matrícula?» = Sí (puerta guardada), matrícula, «Encuentra mi
 * vehículo» (por `ctx.pulsar`), espera del resultado y versión. Captura real de la 0.6.0 (Alberto, 15/10/2026): el resultado es un
 * MODAL con la lista de coches de esa matrícula (uno → ese; varios → `ErrorEleccionVersion`) y, al cerrarlo, aparece el resto del
 * formulario. La estructura de ese modal NO está mapeada: si aparece (`role=dialog`/`aria-modal`, en TODO el marco: los overlays
 * se pintan fuera de `appArea`) → hueco CON inventario y no se pulsa nada dentro. Un aviso del portal → hueco. Se conserva el camino
 * del `<select>` «Versión» nativo. Sin modal, ni versiones ni «SIGUIENTE» habilitado en el plazo → hueco. Sin log de la matrícula.
 * v0.6.4 (inventario real del 17/10/2026): en producción salen TARJETAS de vehículo en `appArea` (no modal): se elige una
 * (`elegirTarjetaVehiculoTurismos`: bandeja / vehículo confirmado / la primera como supuesto) y sigue el resto del paso.
 */
export async function rellenarDatosVehiculoTurismos(page: Page, marco: Frame, form: FormularioAuto, ctx: CtxTurismos): Promise<string[]> {
  return (await rellenarDatosVehiculoTurismosConSupuesto(page, marco, form, ctx)).huecos
}

/** Como `rellenarDatosVehiculoTurismos`, y además devuelve el supuesto de versión (primera de la lista) si se aplicó. */
export async function rellenarDatosVehiculoTurismosConSupuesto(page: Page, marco: Frame, form: FormularioAuto, ctx: CtxTurismos): Promise<{ huecos: string[]; supuestoVersion: string | null }> {
  if (typeof ctx?.marcarOpcionTurismos !== 'function') throw new ErrorMapaIncompleto('la puerta guardada de opciones de Turismos en el contexto del worker', false, true)
  const r = await ctx.marcarOpcionTurismos(marco, CLAVE_CONOCE_MATRICULA)
  if (r.estado === 'no_unica' || r.estado === 'no_quedo') {
    throw new ErrorMapaIncompleto(`cómo se marca «${OPCION_SI}» en «${ETIQUETA_CONOCE_MATRICULA}» (${r.estado === 'no_unica' ? `${r.coincidencias} coincidencias` : 'tras pulsar no quedó marcada'})`, true)
  }
  const { locator: campo, confirmar } = await campoUnicoTurismos(page, marco, ETIQUETA_MATRICULA, `el campo «${ETIQUETA_MATRICULA}»`, ESPERA_CONTROL_TURISMOS_MS, ctx.formador)
  await ctx.pausaAccion()
  await comprobarCampo(campo)
  // v0.6.6: tope corto y sin el error crudo de Playwright (lleva la matrícula).
  if (!(await teclearTurismos(campo, form.matricula))) throw new ErrorMapaIncompleto(`el campo «${ETIQUETA_MATRICULA}» (el portal no dejó escribir en él a tiempo)`, true)
  await confirmar()
  const boton = await unicoControl(page, botonTurismos(marco, BOTON_ENCUENTRA_VEHICULO), `el botón «${BOTON_ENCUENTRA_VEHICULO}»`, true)
  await ctx.pausaAccion()
  await ctx.pulsar(boton)
  // Resultado: el modal de vehículos (sin mapa → hueco), las tarjetas de vehículo (v0.6.4), versiones elegibles, «SIGUIENTE»
  // habilitado o un aviso del portal.
  const fin = Date.now() + ESPERA_RESULTADO_VEHICULO_MS
  for (;;) {
    if ((await modalTurismos(marco).count().catch(() => 0)) > 0) {
      throw new ErrorMapaIncompleto(`el modal con la lista de vehículos que abre «${BOTON_ENCUENTRA_VEHICULO}» (estructura sin mapear: elegir uno si hay uno, «eleccion» si hay varios, y cerrarlo)`, true)
    }
    const tarjetas = await tarjetasVehiculoEstables(page, marco)
    if (tarjetas.length > 0) return { huecos: [], supuestoVersion: (await elegirTarjetaVehiculoTurismos(marco, form, ctx, tarjetas)).supuesto }
    const { conVersiones, supuesto } = await resolverVersionTurismos(marco, form)
    const siguiente = botonSiguienteTurismos(marco)
    if (conVersiones || ((await siguiente.count().catch(() => 0)) === 1 && (await habilitadoDeVerdad(siguiente)))) return { huecos: [], supuestoVersion: supuesto }
    if ((await zonaTurismos(marco).getByRole('alert').count().catch(() => 0)) > 0) throw new ErrorMapaIncompleto(`qué respondió Allianz a «${BOTON_ENCUENTRA_VEHICULO}» (aviso en pantalla)`, true)
    if (Date.now() >= fin) throw new ErrorMapaIncompleto(`el resultado de «${BOTON_ENCUENTRA_VEHICULO}» (ni modal de vehículos, ni versiones elegibles, ni «${BOTON_SIGUIENTE_TURISMOS}» habilitado)`, true)
    await page.waitForTimeout(500)
  }
}

// ── Turismos · pasos «Datos del vehículo» (resto), «Datos personales» y «Antecedentes» (v0.6.5) ──
// HTML real del trabajo 590a330e (17/10/2026, solo estructura): el asistente es un `cdk-stepper` con UN `tabpanel` por paso y los
// ocho están en el DOM desde el principio (ocultos salvo el activo). Por eso la 0.6.4 «no veía» las fechas, el segundo conductor
// ni la fecha de efecto: no son de «Datos del vehículo». Reparto real:
//   1 «Datos del vehículo»: matrícula, tarjeta, compra, uso, garaje.
//   2 «Datos personales»: «¿Quién es el tomador?» (Individual/Empresa), «Tipo de documento» (desplegable opcional), «Número de
//     documento», «Código postal» y «Localidad» (autocompletado) DEL TOMADOR, «¿Es el tomador de la póliza el propietario?» y
//     «El tomador ¿también conduce el vehículo?» (Sí por defecto; con «No» salen otros CP/localidad), «Fecha de nacimiento del
//     conductor» (DD / MM / AAAA), «Fecha de expedición de carnet» (MM / AAAA) y el interruptor «Segundo conductor» (apagado).
//   3 «Antecedentes»: «Compañía actual del vehículo» (desplegable opcional SIN etiqueta de texto; sus opciones no se pintan hasta
//     abrirlo: puerta `companiaActualTurismosAllianz` de guard.ts, que abre, lee y elige como mucho la ÚNICA que casa con la del
//     riesgo; sin dato o sin casar se deja vacío y se DECLARA) y «¿Cuándo quieres que comience tu seguro?» (DD / MM / AAAA, min =
//     hoy, max = hoy + 90 días).
//   4 «Selección de paquete»: los PRECIOS, y el panel plegado «Vista Ampliada» (opciones de agente): «Nivel antecedentes» es un
//     campo DESHABILITADO que calcula el portal (%), y «Colaborador» un número OPCIONAL (4 cifras) que se deja VACÍO (= sin
//     colaborador). Ninguno de los dos se rellena: dejan de ser huecos.
//   5 «Datos» (dirección), 6 «Revisión», 7 «Pago» (IBAN), 8 «Confirmación»: son de EMISIÓN, después del precio. El bot no va.

export const PASO_PERSONALES = 'Datos personales'
export const PASO_ANTECEDENTES = 'Antecedentes'
export const PASO_PAQUETE = 'Selección de paquete'
export type PasoTurismos = typeof PASO_VEHICULO | typeof PASO_PERSONALES | typeof PASO_ANTECEDENTES
/** Orden de los pasos que el bot recorre (el siguiente de cada uno es el de después). */
export const PASOS_TURISMOS: readonly string[] = Object.freeze([PASO_VEHICULO, PASO_PERSONALES, PASO_ANTECEDENTES, PASO_PAQUETE])

/** Bloque del TOMADOR en «Datos personales»: ese paso tiene TRES «Código postal»/«Localidad» (tomador, propietario, conductor). */
export const SEL_BLOQUE_TOMADOR_TURISMOS = 'nx-mt-person-information:has(nx-x-common-header[text="¿Quién es el tomador?"])'

/** Supuestos propios de Turismos (fuera de `supuestosAuto`), declarados tras los canónicos y SOLO si quedaron aplicados. */
export const SUPUESTO_TOMADOR_PROPIETARIO = 'el tomador es el propietario'
export const SUPUESTO_TOMADOR_CONDUCE = 'el tomador es el conductor'
export const SUPUESTO_LOCALIDAD_PORTAL = 'localidad: la que propone el portal para el CP'
/** v0.6.7: campo fijado (deshabilitado) por Allianz con un valor no vacío y distinto del riesgo: se acepta y se declara. */
export const SUPUESTO_CP_FIJADO_DISTINTO = 'código postal fijado por Allianz (no editable), distinto de la ficha'
export const SUPUESTO_LOCALIDAD_FIJADA_DISTINTA = 'localidad fijada por Allianz (no editable), distinta de la ficha'
const supuestoFijadoDistintoTurismos = (etiqueta: string): string => (etiqueta === ETIQUETAS_TURISMOS.codigoPostal ? SUPUESTO_CP_FIJADO_DISTINTO : SUPUESTO_LOCALIDAD_FIJADA_DISTINTA)
export const SUPUESTO_COMPANIA_NO_CONSTA = 'compañía actual: sin indicar (no consta)'
export const SUPUESTO_COMPANIA_NO_CASA = 'compañía actual: sin indicar (la del riesgo no está en la lista del portal)'
// v0.6.10 «Antecedentes»: sin dato del riesgo se elige la opción más favorable y se DECLARA (un supuesto nunca se presenta como dato).
export const SUPUESTO_TIEMPO_COMPANIA = 'tiempo en la compañía: 5 años o más (supuesto favorable, no consta)'
export const SUPUESTO_PARTES_CULPABLES = 'partes culpables: ninguno (supuesto favorable, no consta)'
export const SUPUESTO_TIEMPO_TITULAR = 'tiempo como titular de un seguro: 9-10 años o más (supuesto favorable, no consta)'
// v0.6.10: supuestos DINÁMICOS de «Antecedentes» (nombran la etiqueta REAL del portal): «<prefijo>: «<etiqueta>» (…)».
/** v0.6.11: el input «Cinco últimos dígitos de la póliza actual» ya traía valor: se acepta sin tocar y se declara (sin el valor). */
export const SUPUESTO_POLIZA_FIJADA = 'póliza actual: fijada por Allianz (ya traía valor)'
/** v0.6.11: hueco con nombre cuando el campo está en pantalla, vacío, y la ficha no trae el número (nunca se inventa). */
export const HUECO_POLIZA_ACTUAL = 'póliza actual: faltan los 5 últimos dígitos'
const PREFIJOS_ANTECEDENTES_TURISMOS = ['tiempo en la compañía', 'partes culpables', 'tiempo como titular de un seguro'] as const
const SUPUESTOS_EXTRA_TURISMOS = [SUPUESTO_TOMADOR_PROPIETARIO, SUPUESTO_TOMADOR_CONDUCE, SUPUESTO_LOCALIDAD_PORTAL, SUPUESTO_CP_FIJADO_DISTINTO, SUPUESTO_LOCALIDAD_FIJADA_DISTINTA, SUPUESTO_COMPANIA_NO_CONSTA, SUPUESTO_COMPANIA_NO_CASA, SUPUESTO_TIEMPO_COMPANIA, SUPUESTO_PARTES_CULPABLES, SUPUESTO_TIEMPO_TITULAR, SUPUESTO_POLIZA_FIJADA] as const
export const ETIQUETA_COMPANIA_ACTUAL = 'Compañía actual del vehículo'
/**
 * v0.6.16: las tres preguntas de «Antecedentes» (tiempo en la compañía, partes culpables, tiempo como titular) y los 5 dígitos de la
 * póliza SOLO se pintan DESPUÉS de elegir la compañía actual (trabajo real 02fd821b: el inventario del paso solo traía «Compañía actual
 * del vehículo» y «Fecha de inicio del seguro»). Elegida la compañía, Angular las pinta de forma asíncrona: contestar antes daba
 * `sin_grupo` (silencioso) y «SIGUIENTE» seguía deshabilitado sin decir qué faltaba. Puro: ¿hay que seguir esperando a que aparezcan?
 * Sí si la compañía se ELIGIÓ y el número de opciones marcables del DOM no ha subido respecto de antes de elegirla.
 */
export function antecedentesPendientesDeAparecer(companiaElegida: boolean, opcionesAntes: number, opcionesAhora: number): boolean {
  return companiaElegida && opcionesAhora <= opcionesAntes
}
export const ESPERA_ANTECEDENTES_TURISMOS_MS = 6_000
/** Tras elegir la compañía: espera (tope `ms`) a que aparezcan las preguntas. `true` = aparecieron. Solo lee; nunca pulsa. */
export async function esperarPreguntasAntecedentesTurismos(page: Pick<Page, 'waitForTimeout'>, marco: Pick<Frame, 'locator'>, opcionesAntes: number, ms: number = ESPERA_ANTECEDENTES_TURISMOS_MS): Promise<boolean> {
  const fin = Date.now() + ms
  for (;;) {
    if (!antecedentesPendientesDeAparecer(true, opcionesAntes, await contarOpcionesMarcablesTurismos(marco))) return true
    if (Date.now() >= fin) return false
    await page.waitForTimeout(300)
  }
}
/** v0.6.15: con «ya lo tenía (cambio de seguro)» Allianz exige la compañía actual; sin ella en el riesgo → `datos` (la pantalla la pide). */
export const MENSAJE_FALTA_COMPANIA_ACTUAL = 'falta la compañía actual del vehículo; Allianz la exige con cambio de seguro'
/** v0.6.15: cambio de seguro sin compañía actual en el riesgo → `datos` (no un «mapa incompleto» del portal). Se llama ANTES del login. Puro. */
export function exigirCompaniaActualTurismos(f: FormularioAuto, hoy: Date = new Date()): void {
  if (supuestosAuto(f, hoy).compra.valor === 'ya_lo_tenia' && companiaActualDe(f) === null) throw new ErrorTarificador('datos', MENSAJE_FALTA_COMPANIA_ACTUAL)
}
/** Tope del texto de la lista en el mensaje (el runner corta el mensaje a 2.000 caracteres): se corta por opciones enteras, nunca a mitad. */
const MAX_LISTA_COMPANIAS_MENSAJE = 1_500
/**
 * Mensaje de «la compañía no está en la lista». Lista las opciones COMPLETAS (hasta el tope, por opciones enteras con «(+N más)»);
 * van primero las que empiezan por la primera palabra de cada parte de «A / B», que son las que ayudan a decidir. Puro.
 */
export function mensajeCompaniaNoCasa(buscada: string, opciones: readonly string[]): string {
  const claves = buscada.split(/\s+\/\s+/).map((p) => normalizarCompania(p).split(' ')[0] ?? '').filter((k) => k !== '')
  const afines = (o: string) => claves.some((k) => normalizarCompania(o).split(' ')[0] === k || normalizarCompania(o).includes(k))
  const ordenadas = [...opciones.filter(afines), ...opciones.filter((o) => !afines(o))]
  const dentro: string[] = []
  let largo = 0
  for (const o of ordenadas) {
    largo += o.length + 3
    if (largo > MAX_LISTA_COMPANIAS_MENSAJE && dentro.length > 0) break
    dentro.push(o)
  }
  const resto = ordenadas.length - dentro.length
  const lista = opciones.length > 0 ? `; opciones leídas (${opciones.length}): ${dentro.join(' | ')}${resto > 0 ? ` (+${resto} más)` : ''}` : ''
  return `la compañía actual «${buscada.replace(/\s+/g, ' ').trim().slice(0, 80)}» no está en la lista de Allianz y no se elige ninguna${lista}`
}

/**
 * Compañía ACTUAL del vehículo (la que el cliente quiere dejar), leída del riesgo: `companiaAnterior` (FormularioAuto: la del seguro
 * que se cambia) o, si no, una clave opcional `companiaActual`. `null` = no consta: nunca se inventa. Puro.
 */
export function companiaActualDe(f: object): string | null {
  const r = f as { companiaAnterior?: unknown; companiaActual?: unknown }
  return textoDe(r.companiaAnterior) ?? textoDe(r.companiaActual)
}

/**
 * Últimos 5 dígitos de la póliza ACTUAL, del riesgo (`polizaAnteriorUltimos5`, que añade asegura al entregar): solo si son
 * EXACTAMENTE 5 cifras. `null` = no consta: nunca se inventa. Dato sensible. Puro.
 */
export function polizaActualUltimos5De(f: object): string | null {
  const v = textoDe((f as { polizaAnteriorUltimos5?: unknown }).polizaAnteriorUltimos5)
  return v !== null && /^\d{5}$/.test(v) ? v : null
}

export type OperacionTurismos =
  | { tipo: 'opcion'; clave: string; que: string; supuesto?: string }
  /** `iso`: la fecha ISO detrás de `valor` (para el rango `min`/`max` del portal). `bloqueTomador`: se busca en el bloque del tomador. */
  | { tipo: 'texto'; etiqueta: string; valor: string; fecha: boolean; iso?: string; bloqueTomador?: true; supuesto?: string }
  /** `valor` null = el riesgo no la trae: vale la que proponga el portal para el CP, DECLARADA. Nunca se teclea en el autocompletado. */
  | { tipo: 'localidad'; valor: string | null }
  /** «Compañía actual del vehículo» por la puerta de guard.ts. `valor` null = no consta: se deja vacía y se DECLARA. */
  | { tipo: 'compania'; valor: string | null }
  /** v0.6.11: los 5 últimos dígitos de la póliza actual por la puerta de guard.ts. `valor` null = no consta (hueco si el campo está en pantalla). Sensible. */
  | { tipo: 'poliza'; valor: string | null }
  /** v0.6.10: pregunta de «Antecedentes» por la puerta de guard.ts. `dato` null = no consta: la más favorable, DECLARADA con `supuesto`. */
  | { tipo: 'antecedente'; clave: ClaveAntecedenteTurismos; dato: number | null; que: string; supuesto: string }

export type PasoPlanTurismos = { paso: PasoTurismos; operaciones: OperacionTurismos[]; huecos: string[] }

/**
 * Lectura OPCIONAL de `fichaTomador` (la añade asegura al entregar; 17/10/2026, puede no existir todavía): claves esperadas
 * `tipo` ('fisica'|'juridica'), `documento`, `codigoPostal`, `localidad`, `fechaNacimiento` y `fechaCarnet` (ISO). Cada una
 * `null`/ausente = no consta. Nunca un valor de relleno. PURO.
 */
type FichaTomadorLeida = { tipo: 'fisica' | 'juridica' | null; documento: string | null; codigoPostal: string | null; localidad: string | null; fechaNacimiento: string | null; fechaCarnet: string | null }
const textoDe = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
export function fichaTomadorTurismos(f: object): FichaTomadorLeida | null {
  const v = (f as { fichaTomador?: unknown }).fichaTomador
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  return {
    tipo: o.tipo === 'fisica' || o.tipo === 'juridica' ? o.tipo : null,
    documento: textoDe(o.documento),
    codigoPostal: textoDe(o.codigoPostal),
    localidad: textoDe(o.localidad),
    fechaNacimiento: textoDe(o.fechaNacimiento),
    fechaCarnet: textoDe(o.fechaCarnet),
  }
}

/** Tipo de tomador INEQUÍVOCO: el declarado (`tomador`/`datosTomador`/`fichaTomador`) y el que dice el documento (CIF → empresa; DNI/NIE → persona) no se contradicen. Puro. */
export function tipoTomadorTurismos(f: Pick<FormularioAuto, 'tomador' | 'datosTomador' | 'documentoTomador'>): 'fisica' | 'juridica' | null {
  const ficha = fichaTomadorTurismos(f)
  const doc = documentoTomadorDe(f) ?? ficha?.documento ?? null
  const porDocumento = doc === null ? null : esCif(doc) ? 'juridica' : esDniNie(doc) ? 'fisica' : null
  const vistos = [f.tomador?.tipo ?? null, f.datosTomador?.tipo ?? null, ficha?.tipo ?? null, porDocumento].filter((t): t is 'fisica' | 'juridica' => t === 'fisica' || t === 'juridica')
  if (vistos.length === 0) return null
  return vistos.every((t) => t === vistos[0]) ? vistos[0] : null
}

/** Etiqueta del supuesto de un campo (solo si es SUPUESTO, no dato), para colgarla de la operación que lo aplica. Puro. */
const declarado = (x: { supuesto: boolean; valor: unknown; etiqueta: string | null }): { supuesto?: string } =>
  x.supuesto && x.valor !== null && x.etiqueta ? { supuesto: x.etiqueta } : {}

/**
 * «Precio con supuestos: …» con SOLO lo que se aplicó en el portal (revisión 15/10/2026): un supuesto calculado que se queda en
 * hueco o cuya opción/campo no quedó puesto NO se declara. Orden canónico de `etiquetasSupuestos` y, detrás, los propios de
 * Turismos (`SUPUESTO_TOMADOR_*`, `SUPUESTO_LOCALIDAD_PORTAL`). Puro.
 */
export function supuestosAplicadosTurismos(s: SupuestosAuto, aplicados: Iterable<string>): string | null {
  const hechos = new Set(aplicados)
  return textoSupuestos([...etiquetasSupuestos(s).filter((e) => hechos.has(e)), ...SUPUESTOS_EXTRA_TURISMOS.filter((e) => hechos.has(e)), ...[...hechos].filter((e) => PREFIJOS_ANTECEDENTES_TURISMOS.some((p) => e.startsWith(`${p}: «`)) || e.startsWith(PREFIJO_SUPUESTO_COMPANIA_GENERICA))])
}

/** Etiquetas de supuesto que lleva el plan (lo que se INTENTARÁ aplicar). Puro. */
const supuestosDelPlan = (ops: readonly OperacionTurismos[]): string[] =>
  ops.flatMap((o) =>
    o.tipo === 'localidad' ? (o.valor === null ? [SUPUESTO_LOCALIDAD_PORTAL] : []) : o.tipo === 'compania' ? (o.valor === null ? [SUPUESTO_COMPANIA_NO_CONSTA] : []) : o.tipo === 'poliza' ? [] : o.tipo === 'antecedente' ? (o.dato === null ? [o.supuesto] : []) : o.supuesto ? [o.supuesto] : [],
  )

/** ISO AAAA-MM-DD válido → `{ dia: 'DD/MM/AAAA', mes: 'MM/AAAA' }`; si no, `null` (hueco, nunca una excepción en el plan). Puro. */
function fechaPortal(iso: string | null | undefined): { dia: string; mes: string } | null {
  const m = typeof iso === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim()) : null
  return m ? { dia: `${m[3]}/${m[2]}/${m[1]}`, mes: `${m[2]}/${m[1]}` } : null
}

/**
 * Plan de los TRES pasos que preceden al precio, en el orden de la pantalla. PURO. Datos del riesgo y, donde Alberto lo decidió
 * (v0.6.2), el valor SUPUESTO de `supuestosAuto`, declarado en `supuestos` («Precio con supuestos: …», `null` = ninguno). Lo demás,
 * `huecos` de SU paso (sin valores: los mensajes nunca llevan datos personales). IBAN/BIC, dirección y cualquier campo de los
 * pasos de emisión NO están en el plan.
 */
export function planDatosTurismos(f: FormularioAuto, hoy: Date = new Date()): { pasos: PasoPlanTurismos[]; supuestos: string | null } {
  const sup = supuestosAuto(f, hoy)
  const ficha = fichaTomadorTurismos(f)

  // 1 «Datos del vehículo» (resto): compra (nuevo / ya lo tenía; la 2ª mano nunca se supone), uso y garaje.
  const veh: PasoPlanTurismos = { paso: PASO_VEHICULO, operaciones: [], huecos: [] }
  if (sup.compra.valor === 'nuevo') veh.operaciones.push({ tipo: 'opcion', clave: CLAVE_COMPRA_NUEVO, que: 'la compra «nuevo»', ...declarado(sup.compra) })
  else veh.operaciones.push({ tipo: 'opcion', clave: CLAVE_COMPRA_YA_LO_TENIA, que: 'la compra «ya lo tenía»', ...declarado(sup.compra) })
  if (sup.uso.valor) veh.operaciones.push({ tipo: 'opcion', clave: claveUsoTurismos(sup.uso.valor), que: `el uso «${sup.uso.valor}»`, ...declarado(sup.uso) })
  if (sup.garaje.valor) veh.operaciones.push({ tipo: 'opcion', clave: claveGarajeTurismos(sup.garaje.valor), que: `el garaje «${sup.garaje.valor}»`, ...declarado(sup.garaje) })

  // 2 «Datos personales».
  const per: PasoPlanTurismos = { paso: PASO_PERSONALES, operaciones: [], huecos: [] }
  const tipo = tipoTomadorTurismos(f)
  if (tipo === null) per.huecos.push('el tipo de tomador Individual/Empresa (no consta o el riesgo se contradice)')
  else per.operaciones.push({ tipo: 'opcion', clave: tipo === 'juridica' ? CLAVE_TOMADOR_EMPRESA : CLAVE_TOMADOR_INDIVIDUAL, que: `el tomador «${tipo === 'juridica' ? 'Empresa' : 'Individual'}»` })
  const doc = documentoTomadorDe(f) ?? ficha?.documento ?? null
  if (doc === null) per.huecos.push(`«${ETIQUETAS_TURISMOS.documento}» (el riesgo no trae el documento del tomador)`)
  else per.operaciones.push({ tipo: 'texto', etiqueta: ETIQUETAS_TURISMOS.documento, valor: doc, fecha: false, bloqueTomador: true })
  // CP y localidad del bloque del TOMADOR (nunca el de circulación: el portal pide el de residencia del tomador).
  const cpTomador = textoDe(f.tomador?.codigoPostal) ?? ficha?.codigoPostal ?? null
  if (cpTomador === null) {
    per.huecos.push(`«${ETIQUETAS_TURISMOS.codigoPostal}» y «${ETIQUETAS_TURISMOS.localidad}» (el riesgo no trae el CP del tomador)`)
  } else {
    per.operaciones.push({ tipo: 'texto', etiqueta: ETIQUETAS_TURISMOS.codigoPostal, valor: cpTomador, fecha: false, bloqueTomador: true })
    per.operaciones.push({ tipo: 'localidad', valor: textoDe(f.tomador?.poblacion) ?? ficha?.localidad ?? null })
  }
  // Propietario y conductor: «Sí» (dato o supuesto declarado). «No» abre los datos de OTRA persona, sin mapa → hueco.
  if (f.tomadorEsPropietario === false) per.huecos.push('el propietario distinto del tomador (sus datos no tienen mapa)')
  else per.operaciones.push({ tipo: 'opcion', clave: CLAVE_TOMADOR_PROPIETARIO_SI, que: 'el tomador propietario «Sí»', ...(f.tomadorEsPropietario === true ? {} : { supuesto: SUPUESTO_TOMADOR_PROPIETARIO }) })
  if (f.tomadorEsConductor === false) per.huecos.push('el conductor distinto del tomador (sus datos no tienen mapa)')
  else per.operaciones.push({ tipo: 'opcion', clave: CLAVE_TOMADOR_CONDUCE_SI, que: 'el tomador conductor «Sí»', ...(f.tomadorEsConductor === true ? {} : { supuesto: SUPUESTO_TOMADOR_CONDUCE }) })
  // Fechas del CONDUCTOR (si el conductor es el tomador, a falta de ellas, las de su ficha).
  const deFicha = f.tomadorEsConductor !== false
  const nac = fechaPortal(textoDe(f.conductor?.fechaNacimiento) ?? (deFicha ? ficha?.fechaNacimiento : null))
  const carnetIso = textoDe(f.conductor?.fechaCarne) ?? (deFicha ? ficha?.fechaCarnet : null) ?? null
  const carnet = fechaPortal(carnetIso)
  if (nac === null) per.huecos.push(`«${ETIQUETAS_TURISMOS.nacimientoConductor}» (el riesgo no la trae)`)
  else per.operaciones.push({ tipo: 'texto', etiqueta: ETIQUETAS_TURISMOS.nacimientoConductor, valor: nac.dia, fecha: true })
  // El portal pide el carné como MM / AAAA (HTML real): se teclea el mes.
  if (carnet === null) per.huecos.push(`«${ETIQUETAS_TURISMOS.carnetConductor}» (el riesgo no la trae)`)
  else per.operaciones.push({ tipo: 'texto', etiqueta: ETIQUETAS_TURISMOS.carnetConductor, valor: carnet.mes, fecha: true })
  // Segundo conductor: interruptor que debe seguir APAGADO (dato o supuesto). Encendido = datos de otra persona, sin mapa → hueco.
  if (sup.segundoConductor.valor === false) per.operaciones.push({ tipo: 'opcion', clave: CLAVE_SEGUNDO_CONDUCTOR_NO, que: 'el segundo conductor «No»', ...declarado(sup.segundoConductor) })
  else per.huecos.push('el segundo conductor «Sí» (el riesgo trae conductor ocasional: sus datos no tienen mapa)')

  // 3 «Antecedentes»: la compañía actual (decisión de Alberto: «procede de otra compañía»; la del riesgo si consta) y la fecha de efecto.
  const ant: PasoPlanTurismos = { paso: PASO_ANTECEDENTES, operaciones: [{ tipo: 'compania', valor: companiaActualDe(f) }, { tipo: 'poliza', valor: polizaActualUltimos5De(f) }], huecos: [] }
  // v0.6.10: tres preguntas que bloquean «SIGUIENTE». Dato del formulario si existe (0 es un DATO); si no, la más favorable y declarada.
  const entero = (x: unknown): number | null => (typeof x === 'number' && Number.isInteger(x) && x >= 0 ? x : null)
  ant.operaciones.push({ tipo: 'antecedente', clave: 'compania_tiempo', dato: entero(f.aniosAseguradoAnterior), que: 'el tiempo en la compañía', supuesto: SUPUESTO_TIEMPO_COMPANIA })
  ant.operaciones.push({ tipo: 'antecedente', clave: 'partes_culpables', dato: entero(f.siniestrosUltimos5Anios), que: 'los partes culpables', supuesto: SUPUESTO_PARTES_CULPABLES })
  ant.operaciones.push({ tipo: 'antecedente', clave: 'titular_tiempo', dato: null, que: 'el tiempo como titular de un seguro', supuesto: SUPUESTO_TIEMPO_TITULAR })
  const efecto = fechaPortal(sup.fechaEfecto.valor)
  if (efecto && sup.fechaEfecto.valor) ant.operaciones.push({ tipo: 'texto', etiqueta: ETIQUETAS_TURISMOS.fechaEfecto, valor: efecto.dia, fecha: true, iso: sup.fechaEfecto.valor, ...declarado(sup.fechaEfecto) })
  else ant.huecos.push(`«${ETIQUETAS_TURISMOS.fechaEfecto}» (sin fecha de efecto)`)

  const pasos = [veh, per, ant]
  return { pasos, supuestos: supuestosAplicadosTurismos(sup, pasos.flatMap((p) => supuestosDelPlan(p.operaciones))) }
}

/** ¿El control es un campo de TEXTO editable (no un desplegable/combobox, que solo se tocaría por una puerta de guard.ts)? */
async function esCampoTexto(campo: Locator): Promise<boolean> {
  return campo
    .evaluate((el) => {
      const e = el as HTMLInputElement
      const rol = (e.getAttribute('role') ?? '').toLowerCase()
      if (rol === 'combobox' || rol === 'listbox' || e.readOnly || e.disabled) return false
      if (e.tagName === 'TEXTAREA') return true
      return e.tagName === 'INPUT' && ['', 'text', 'tel', 'search'].includes((e.getAttribute('type') ?? '').toLowerCase())
    })
    .catch(() => false)
}

/** Texto que ENSEÑA un control (valor de un input; texto de un desplegable). Solo lectura; nunca sale en mensajes. */
async function textoMostrado(campo: Locator): Promise<string> {
  return campo
    .evaluate((el) => {
      const e = el as HTMLInputElement & HTMLSelectElement
      if (e.tagName === 'SELECT') return e.selectedIndex >= 0 ? (e.options[e.selectedIndex].textContent ?? '') : ''
      if (e.tagName === 'INPUT' || e.tagName === 'TEXTAREA') return e.value ?? ''
      return el.textContent ?? ''
    })
    .catch(() => '')
}

/** Rango `min`/`max` (ISO) que declara un campo de fecha del portal (`nxdatefield`). Solo lectura. */
async function rangoFecha(campo: Locator): Promise<{ min: string | null; max: string | null }> {
  const r = await campo.evaluate((el) => [el.getAttribute('min'), el.getAttribute('max')]).catch(() => [null, null])
  const iso = (v: string | null | undefined) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null)
  return { min: iso(r[0]), max: iso(r[1]) }
}

const soloCifras = (s: string) => s.replace(/\D/g, '')

/** Pestaña SELECCIONADA del asistente (texto normalizado; '' si no hay una sola). Solo lectura. */
export async function pasoActivoTurismos(marco: Pick<Frame, 'getByRole'>): Promise<string> {
  const t = marco.getByRole('tab', { selected: true })
  if ((await t.count().catch(() => 0)) !== 1) return ''
  return (await t.first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim()
}

const ESPERA_LOCALIDAD_MS = 3_000
/** v0.6.6: tope de cada tecleo de los pasos 2-3 (nunca los 30 s por defecto de Playwright, ni su error crudo con el valor). */
export const ESPERA_TECLEO_TURISMOS_MS = 5_000

// ── v0.6.6: campos DESHABILITADOS / solo lectura de los pasos 2-3 (trabajo real 3553424d, 18/10/2026) ──
// HTML real (solo estructura): tras teclear el documento, el portal deja «Número de documento», «Código postal» y «Localidad» del
// bloque del tomador `disabled` y RELLENOS (`is-filled is-disabled`); nombre/apellidos quedan deshabilitados y vacíos. La 0.6.5
// tecleaba encima y moría con un timeout crudo de `fill` (con el CP en claro en el mensaje). Regla: un campo bloqueado NUNCA se
// teclea; se LEE y, si casa con el riesgo (o el riesgo no trae el dato y el portal sí), vale; si no, hueco con motivo.

/** Cómo se comparan el valor del portal y el del riesgo: texto (mayúsculas, sin espacios/guiones/puntos ni tildes), fecha (solo cifras) o población (`clavePoblacion`). */
export type ComparacionCampoTurismos = 'texto' | 'fecha' | 'poblacion' | 'cp'

export function normalizarValorCampoTurismos(v: string, como: ComparacionCampoTurismos): string {
  if (como === 'fecha') return soloCifras(v)
  // v0.6.7: la localidad del portal puede venir como «NNNNN - NOMBRE»; el CP, con ceros perdidos o decorado (solo cifras, 5 dígitos).
  if (como === 'poblacion') return clavePoblacion(v.replace(/^\s*\d{5}\s*-\s*/, ''))
  if (como === 'cp') {
    const d = soloCifras(v)
    return d === '' ? v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s.\-]/g, '').toUpperCase() : d.padStart(5, '0')
  }
  return v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s.\-]/g, '').toUpperCase()
}

export type DecisionCampoBloqueado = { tipo: 'vale' } | { tipo: 'vale_portal' } | { tipo: 'vale_distinto' } | { tipo: 'hueco'; motivo: string }

/**
 * Campo bloqueado (deshabilitado o solo lectura) → qué se hace, SIN teclear. PURO. Vacío → hueco; el riesgo no trae el dato y el
 * portal sí → `vale_portal` (el llamante lo declara si procede); casa (normalizado) → `vale`; no casa (v0.6.7) → `vale_distinto`
 * (se acepta el del portal y se declara como supuesto). Los motivos y supuestos nunca llevan ninguno de los dos valores.
 */
export function decidirCampoBloqueadoTurismos(etiqueta: string, valorPortal: string, valorRiesgo: string | null, como: ComparacionCampoTurismos): DecisionCampoBloqueado {
  const portal = normalizarValorCampoTurismos(valorPortal, como)
  if (portal === '') return { tipo: 'hueco', motivo: `«${etiqueta}» (el portal lo tiene deshabilitado y vacío: no se puede rellenar)` }
  const riesgo = valorRiesgo === null ? '' : normalizarValorCampoTurismos(valorRiesgo, como)
  if (riesgo === '') return { tipo: 'vale_portal' }
  if (portal === riesgo) return { tipo: 'vale' }
  // v0.6.7 (decisión de Alberto): SOLO «Código postal» y «Localidad» bloqueados, no vacíos y distintos → se acepta el del portal y se
  // DECLARA (sin valores). Cualquier otro (documento, fechas…) sigue siendo hueco: un documento distinto sería otra persona.
  if (etiqueta === ETIQUETAS_TURISMOS.codigoPostal || etiqueta === ETIQUETAS_TURISMOS.localidad) return { tipo: 'vale_distinto' }
  return { tipo: 'hueco', motivo: `«${etiqueta}» (el portal lo trae deshabilitado con un valor distinto del riesgo: no se teclea)` }
}

/** Estado de un control: bloqueado (disabled, readonly, aria-disabled/aria-readonly o fieldset deshabilitado) y su valor. Solo lectura. */
async function estadoCampoTurismos(campo: Locator): Promise<{ bloqueado: boolean; valor: string } | null> {
  return campo
    .evaluate((el) => {
      const e = el as HTMLInputElement
      const bloqueado =
        e.disabled === true || e.readOnly === true || e.getAttribute('aria-disabled') === 'true' || e.getAttribute('aria-readonly') === 'true' || !!e.closest('fieldset[disabled]')
      const valor = e.tagName === 'INPUT' || e.tagName === 'TEXTAREA' ? (e.value ?? '') : (el.textContent ?? '')
      return { bloqueado, valor }
    }, undefined, { timeout: 1_000 })
    .catch(() => null)
}

/**
 * El control VISIBLE con esa etiqueta EXACTA (en el bloque del tomador si `bloqueTomador`), SOLO si es uno y está bloqueado. El
 * localizador común descarta los deshabilitados (para él «no aparece»): este es el camino de los que el portal prerrellena.
 */
async function campoBloqueadoTurismos(marco: Frame, etiqueta: string, bloqueTomador: boolean): Promise<{ campo: Locator; valor: string } | null> {
  const base = bloqueTomador ? zonaTurismos(marco).locator(SEL_BLOQUE_TOMADOR_TURISMOS) : zonaTurismos(marco)
  const l = sinCabecera(marco, base.getByLabel(etiqueta, { exact: true })).filter({ visible: true })
  if ((await l.count().catch(() => 0)) !== 1) return null
  const e = await estadoCampoTurismos(l.first())
  return e?.bloqueado ? { campo: l.first(), valor: e.valor } : null
}

/**
 * Teclea con tope corto. `true` = escrito; `false` = no se pudo (el llamante lo convierte en hueco). El error de Playwright NUNCA
 * sube: su mensaje lleva el valor tecleado (dato personal).
 */
async function teclearTurismos(campo: Locator, valor: string): Promise<boolean> {
  try {
    await campo.fill(valor, { timeout: ESPERA_TECLEO_TURISMOS_MS })
    return true
  } catch {
    return false
  }
}

/**
 * Rellena UN paso según su plan (`planDatosTurismos(...).pasos[i]`). Solo con SU pestaña seleccionada (si no, hueco con inventario,
 * nada tocado). Cada control por su etiqueta EXACTA en la zona `appArea` (CP/localidad/documento, en el bloque del tomador); un
 * campo de texto se escribe tras `comprobarCampo` (guard de emisión + frontera bancaria) y se RELEE; una fecha fuera del rango
 * `min`/`max` del portal no se teclea; las opciones, SOLO por la puerta guardada (`ctx.marcarOpcionTurismos`, lista cerrada de
 * guard.ts). «Localidad» es un autocompletado: NUNCA se teclea; vale si el portal la propone y casa (o, sin dato, se declara).
 * Lo que no aparece, aparece repetido o no queda puesto → hueco (se juntan). Devuelve los huecos y los supuestos APLICADOS.
 */
export async function rellenarPasoTurismos(page: Page, marco: Frame, ctx: CtxTurismos, plan: PasoPlanTurismos): Promise<{ huecos: string[]; aplicados: string[]; opcionesCompania?: string[] }> {
  const marcar = ctx?.marcarOpcionTurismos
  if (typeof marcar !== 'function') throw new ErrorMapaIncompleto('la puerta guardada de opciones de Turismos en el contexto del worker', false, true)
  const activo = await pasoActivoTurismos(marco)
  if (activo !== plan.paso) throw new ErrorMapaIncompleto(`el paso activo del asistente (se esperaba «${plan.paso}», la pestaña seleccionada es «${activo.slice(0, 40) || 'desconocida'}»)`, true)
  const huecos = [...plan.huecos]
  const aplicados: string[] = []
  let opcionesCompania: string[] | undefined
  // v0.6.16: opciones marcables del DOM ANTES de elegir la compañía (las preguntas de «Antecedentes» aparecen después).
  const opcionesAntes = plan.paso === PASO_ANTECEDENTES ? await contarOpcionesMarcablesTurismos(marco) : 0
  const esperar = async (etiqueta: string, bloqueTomador: boolean): Promise<Locator | string> => {
    try {
      return (await campoUnicoTurismos(page, marco, etiqueta, `«${etiqueta}»`, ESPERA_CAMPO_TURISMOS_MS, undefined, plan.paso, bloqueTomador ? SEL_BLOQUE_TOMADOR_TURISMOS : undefined)).locator
    } catch (e) {
      if (e instanceof ErrorMapaIncompleto) return e.message.replace(/^.*?mapa incompleto: faltan /, '')
      throw e
    }
  }
  // v0.6.6: campo bloqueado → se lee y se decide (nunca se teclea; v0.6.7: distinto y no vacío → se acepta y se declara). `supuestoPortal`: lo que se declara si el riesgo no traía el dato.
  const segunBloqueado = (etiqueta: string, valorPortal: string, valorRiesgo: string | null, como: ComparacionCampoTurismos, supuesto?: string, supuestoPortal?: string) => {
    const d = decidirCampoBloqueadoTurismos(etiqueta, valorPortal, valorRiesgo, como)
    if (d.tipo === 'hueco') huecos.push(d.motivo)
    else if (d.tipo === 'vale_distinto') aplicados.push(supuestoFijadoDistintoTurismos(etiqueta))
    else if (d.tipo === 'vale_portal' && supuestoPortal) aplicados.push(supuestoPortal)
    else if (d.tipo === 'vale' && supuesto) aplicados.push(supuesto)
  }
  for (const op of plan.operaciones) {
    if (op.tipo === 'compania') {
      const puerta = ctx.companiaActualTurismos
      if (typeof puerta !== 'function') {
        huecos.push(`«${ETIQUETA_COMPANIA_ACTUAL}» (sin la puerta guardada en el contexto del worker)`)
        continue
      }
      const r = await puerta(marco, op.valor)
      opcionesCompania = r.opciones
      if (r.estado === 'elegida') {
        if (r.generica) aplicados.push(supuestoCompaniaGenerica(op.valor ?? '', r.elegida))
        if (plan.paso === PASO_ANTECEDENTES) await esperarPreguntasAntecedentesTurismos(page, marco, opcionesAntes)
        continue
      }
      if (r.estado === 'sin_elegir') aplicados.push(SUPUESTO_COMPANIA_NO_CONSTA)
      // v0.6.15: la compañía del riesgo que el portal no resuelve ya NO sigue «sin indicar» (Allianz la exige con cambio de seguro y
      // «SIGUIENTE» quedaba deshabilitado): es un error de DATOS claro, con las candidatas si hay varias. Nunca se elige una.
      else if (r.estado === 'no_casa') throw new ErrorTarificador('datos', mensajeCompaniaNoCasa(op.valor ?? '', r.opciones))
      else if (r.estado === 'ambigua') throw new ErrorTarificador('datos', mensajeCompaniaAmbigua(op.valor ?? '', r.candidatas))
      else if (r.estado === 'con_valor') huecos.push(`«${ETIQUETA_COMPANIA_ACTUAL}» (el portal ya trae una: no se toca)`)
      else huecos.push(`«${ETIQUETA_COMPANIA_ACTUAL}» (${r.motivo})`)
      continue
    }
    if (op.tipo === 'poliza') {
      const puerta = ctx.polizaActualTurismos
      if (typeof puerta !== 'function') {
        huecos.push(`«${ETIQUETA_POLIZA_ACTUAL_TURISMOS}» (sin la puerta guardada en el contexto del worker)`)
        continue
      }
      // Ni el dato ni nada derivado de él sale en huecos ni supuestos: solo estados.
      const r = await puerta(marco, op.valor)
      if (r.estado === 'con_valor') aplicados.push(SUPUESTO_POLIZA_FIJADA)
      else if (r.estado === 'sin_dato') huecos.push(HUECO_POLIZA_ACTUAL)
      else if (r.estado === 'no_unica') huecos.push(`«${ETIQUETA_POLIZA_ACTUAL_TURISMOS}» (${r.motivo})`)
      else if (r.estado === 'no_quedo') huecos.push(`«${ETIQUETA_POLIZA_ACTUAL_TURISMOS}» (el portal no dejó puesto el valor)`)
      continue
    }
    if (op.tipo === 'antecedente') {
      const puerta = ctx.marcarAntecedenteTurismos
      if (typeof puerta !== 'function') {
        huecos.push(`${op.que} (sin la puerta guardada en el contexto del worker)`)
        continue
      }
      const r = await puerta(marco, op.clave, op.dato)
      const prefijo = op.supuesto.split(':')[0]
      if (r.estado === 'marcada' && op.dato === null) aplicados.push(r.ultima ? `${prefijo}: «${r.elegida}» (la última del grupo, supuesto favorable, no consta)` : op.supuesto)
      // El portal ya trae un valor: el precio sale con ÉL. Si es el dato de la ficha es dato; si no, se DECLARA con su etiqueta real.
      else if (r.estado === 'con_valor') {
        if (!r.coincide) aplicados.push(`${prefijo}: «${r.marcada}» (${op.dato === null ? 'fijado por Allianz' : 'fijado por Allianz, distinto de la ficha'})`)
      } else if (r.estado === 'no_unica') huecos.push(`${op.que} (${r.motivo})`)
      else if (r.estado === 'no_quedo') huecos.push(`${op.que} (tras pulsar no quedó marcada)`)
      continue
    }
    if (op.tipo === 'opcion') {
      const r = await marcar(marco, op.clave)
      if (r.estado === 'no_unica' || r.estado === 'no_quedo') huecos.push(`cómo se marca ${op.que} (${r.estado === 'no_unica' ? `${r.coincidencias} coincidencias` : 'tras pulsar no quedó marcada'})`)
      else if (op.supuesto) aplicados.push(op.supuesto)
      continue
    }
    if (op.tipo === 'localidad') {
      // v0.6.6: bloqueada (el portal la fija desde el CP o la ficha del cliente): se lee, con la espera del autocompletado si sigue vacía.
      let bloq = await campoBloqueadoTurismos(marco, ETIQUETAS_TURISMOS.localidad, true)
      const finBloq = Date.now() + ESPERA_LOCALIDAD_MS
      while (bloq && bloq.valor.trim() === '' && Date.now() < finBloq) {
        await page.waitForTimeout(300)
        bloq = await campoBloqueadoTurismos(marco, ETIQUETAS_TURISMOS.localidad, true)
      }
      if (bloq) {
        segunBloqueado(ETIQUETAS_TURISMOS.localidad, bloq.valor, op.valor, 'poblacion', undefined, SUPUESTO_LOCALIDAD_PORTAL)
        continue
      }
      const campo = await esperar(ETIQUETAS_TURISMOS.localidad, true)
      if (typeof campo === 'string') {
        huecos.push(campo)
        continue
      }
      // El portal la propone a partir del CP: se espera un poco y se LEE.
      const fin = Date.now() + ESPERA_LOCALIDAD_MS
      let mostrada = (await textoMostrado(campo)).trim()
      while (mostrada === '' && Date.now() < fin) {
        await page.waitForTimeout(300)
        mostrada = (await textoMostrado(campo)).trim()
      }
      const eLoc = await estadoCampoTurismos(campo)
      if (eLoc?.bloqueado) {
        segunBloqueado(ETIQUETAS_TURISMOS.localidad, eLoc.valor, op.valor, 'poblacion', undefined, SUPUESTO_LOCALIDAD_PORTAL)
        continue
      }
      if (op.valor === null) {
        if (mostrada !== '') aplicados.push(SUPUESTO_LOCALIDAD_PORTAL)
        else huecos.push(`«${ETIQUETAS_TURISMOS.localidad}» (el riesgo no la trae y el portal no propuso ninguna para el CP)`)
        continue
      }
      if (clavePoblacion(mostrada) === clavePoblacion(op.valor)) continue
      if (!(await esCampoTexto(campo))) {
        huecos.push(`«${ETIQUETAS_TURISMOS.localidad}» (no es un campo de texto: desplegable/autocompletado sin puerta en guard.ts${mostrada ? '; el portal propone otra para el CP' : ''})`)
        continue
      }
      await ctx.pausaAccion()
      await comprobarCampo(campo)
      if (!(await teclearTurismos(campo, op.valor))) {
        const e = await estadoCampoTurismos(campo)
        if (e?.bloqueado) segunBloqueado(ETIQUETAS_TURISMOS.localidad, e.valor, op.valor, 'poblacion', undefined, SUPUESTO_LOCALIDAD_PORTAL)
        else huecos.push(`«${ETIQUETAS_TURISMOS.localidad}» (el portal no dejó escribir en el campo a tiempo)`)
        continue
      }
      await campo.blur().catch(() => undefined)
      if (clavePoblacion(await textoMostrado(campo)) !== clavePoblacion(op.valor)) huecos.push(`«${ETIQUETAS_TURISMOS.localidad}» (el portal no dejó puesto el valor)`)
      continue
    }
    const como: ComparacionCampoTurismos = op.fecha ? 'fecha' : op.etiqueta === ETIQUETAS_TURISMOS.codigoPostal ? 'cp' : 'texto'
    // v0.6.6: bloqueado ya (el localizador común lo descartaría como «no aparece») → se lee y se decide, sin teclear.
    const bloq = await campoBloqueadoTurismos(marco, op.etiqueta, op.bloqueTomador === true)
    if (bloq) {
      segunBloqueado(op.etiqueta, bloq.valor, op.valor, como, op.supuesto)
      continue
    }
    const campo = await esperar(op.etiqueta, op.bloqueTomador === true)
    if (typeof campo === 'string') {
      huecos.push(campo)
      continue
    }
    const e0 = await estadoCampoTurismos(campo)
    if (e0?.bloqueado) {
      segunBloqueado(op.etiqueta, e0.valor, op.valor, como, op.supuesto)
      continue
    }
    if (!(await esCampoTexto(campo))) {
      huecos.push(`«${op.etiqueta}» (no es un campo de texto: desplegable sin puerta en guard.ts)`)
      continue
    }
    if (op.iso) {
      const { min, max } = await rangoFecha(campo)
      if ((min && op.iso < min) || (max && op.iso > max)) {
        huecos.push(`«${op.etiqueta}» (la fecha queda fuera del rango que admite el portal)`)
        continue
      }
    }
    await ctx.pausaAccion()
    await comprobarCampo(campo)
    // El portal puede bloquearlo DESPUÉS de localizarlo (p. ej. al validar el documento): se relee antes y, si falla, después.
    const e1 = await estadoCampoTurismos(campo)
    if (e1?.bloqueado) {
      segunBloqueado(op.etiqueta, e1.valor, op.valor, como, op.supuesto)
      continue
    }
    if (!(await teclearTurismos(campo, op.valor))) {
      const e2 = await estadoCampoTurismos(campo)
      if (e2?.bloqueado) segunBloqueado(op.etiqueta, e2.valor, op.valor, como, op.supuesto)
      else huecos.push(`«${op.etiqueta}» (el portal no dejó escribir en el campo a tiempo)`)
      continue
    }
    await campo.blur().catch(() => undefined)
    const leido = await textoMostrado(campo)
    const quedo = op.fecha ? soloCifras(leido) === soloCifras(op.valor) : leido.trim().toUpperCase() === op.valor.toUpperCase()
    if (!quedo) huecos.push(`«${op.etiqueta}» (el portal no dejó puesto el valor)`)
    else if (op.supuesto) aplicados.push(op.supuesto)
  }
  return { huecos, aplicados, ...(opcionesCompania ? { opcionesCompania } : {}) }
}

/**
 * Compatibilidad 0.6.1-0.6.4: rellena el resto de «Datos del vehículo» (compra, uso, garaje) y devuelve sus huecos y el «Precio con
 * supuestos» de lo aplicado. Los demás pasos van por `rellenarPasoTurismos` tras «SIGUIENTE».
 */
export async function rellenarDatosRiesgoTurismos(
  page: Page,
  marco: Frame,
  form: FormularioAuto,
  ctx: CtxTurismos,
  hoy: Date = new Date(),
): Promise<{ huecos: string[]; supuestos: string | null }> {
  const plan = planDatosTurismos(form, hoy).pasos[0]!
  const r = await rellenarPasoTurismos(page, marco, ctx, plan)
  return { huecos: r.huecos, supuestos: supuestosAplicadosTurismos(supuestosAuto(form, hoy), r.aplicados) }
}

/**
 * v0.6.11: etiquetas de los campos OBLIGATORIOS (`required` / `aria-required`) del paso visible que están vacíos o inválidos
 * (`aria-invalid`, `ng-invalid`), para que el atasco de «SIGUIENTE» diga qué falta. SOLO etiquetas (nunca valores). Máx. 8 de 60
 * caracteres; sin las que describen una cuenta bancaria. Solo lectura; un fallo de lectura → vacío.
 */
export async function obligatoriosPendientesTurismos(marco: Pick<Frame, 'locator'>): Promise<string[]> {
  // Sin funciones con nombre dentro de `evaluate` (tsx les mete `__name`, que no existe en la página).
  const etiquetas = await marco
    .locator('[role=tabpanel]:not([hidden]) :is(input,textarea,select)[required], [role=tabpanel]:not([hidden]) :is(input,textarea,select)[aria-required=true]')
    .evaluateAll((els) => {
      const salida: string[] = []
      for (const el of els) {
        const h = el as HTMLInputElement
        const cs = getComputedStyle(h)
        if (h.disabled || h.type === 'hidden' || cs.display === 'none' || cs.visibility === 'hidden' || h.getClientRects().length === 0) continue
        const vacio = (h.value ?? '').trim() === ''
        const invalido = h.getAttribute('aria-invalid') === 'true' || h.classList.contains('ng-invalid')
        if (!vacio && !invalido) continue
        const lab = h.labels && h.labels.length > 0 ? (h.labels[0].cloneNode(true) as HTMLElement) : null
        if (lab) lab.querySelectorAll('input,select,textarea,button').forEach((x) => x.remove())
        const t = ((lab ? lab.textContent : null) || h.getAttribute('aria-label') || h.getAttribute('placeholder') || '').replace(/\s+/g, ' ').replace(/\s*\*\s*$/, '').trim()
        salida.push(t === '' ? '(campo sin etiqueta)' : t.slice(0, 60))
      }
      return salida
    })
    .catch(() => [] as string[])
  return [...new Set(etiquetas.filter((t) => senalCuentaBancaria([t]) === null))].slice(0, 8)
}

/**
 * «SIGUIENTE» de `paso` por `ctx.pulsar` (guard de emisión) y espera a que la pestaña seleccionada pase a `siguiente`. Nunca pulsa
 * nada más que esa navegación. Solo con `paso` seleccionado y SIN `huecos` (con alguno, `ErrorMapaIncompleto` con la lista +
 * inventario ANTES de pulsar: Allianz guardaría el paso con sus valores por defecto). «SIGUIENTE» ausente, deshabilitado o sin
 * efecto → hueco, indicando cuál fue. Lo SUPUESTO viaja también en el error (queda registrado aunque no se llegue al precio).
 */
export async function avanzarPasoTurismos(
  page: Page,
  marco: Frame,
  ctx: Pick<ContextoPortal, 'pulsar' | 'pausaAccion'>,
  paso: string,
  esperaMs = 15_000,
  huecos: readonly string[] = [],
  supuestos: string | null = null,
): Promise<void> {
  const conSupuestos = (m: string) => (supuestos ? `${m}; ${supuestos}` : m)
  const conHuecos = (m: string) => conSupuestos(huecos.length > 0 ? `${m}; huecos de «${paso}»: ${huecos.join(' · ')}` : m)
  const i = PASOS_TURISMOS.indexOf(paso)
  const siguiente = i >= 0 ? PASOS_TURISMOS[i + 1] ?? null : null
  if (huecos.length > 0) throw new ErrorMapaIncompleto(conHuecos(`los datos de «${paso}» antes de «${BOTON_SIGUIENTE_TURISMOS}» (no se pulsa con huecos)`), true)
  const boton = botonSiguienteTurismos(marco)
  if ((await boton.count()) !== 1) throw new ErrorMapaIncompleto(conHuecos(`el botón «${BOTON_SIGUIENTE_TURISMOS}» del paso «${paso}»`), true)
  if (!(await habilitadoDeVerdad(boton))) {
    const pendientes = await obligatoriosPendientesTurismos(marco)
    throw new ErrorMapaIncompleto(conHuecos(`qué falta para habilitar «${BOTON_SIGUIENTE_TURISMOS}» en «${paso}»${pendientes.length > 0 ? ` (obligatorios sin rellenar o inválidos: ${pendientes.map((e) => `«${e}»`).join(' · ')})` : ''}`), true)
  }
  const activa = await pasoActivoTurismos(marco)
  if (activa !== paso) throw new ErrorMapaIncompleto(conHuecos(`el paso activo del asistente (se esperaba «${paso}», la pestaña seleccionada es «${activa.slice(0, 40) || 'desconocida'}»)`), true)
  await ctx.pausaAccion()
  await ctx.pulsar(boton)
  const fin = Date.now() + esperaMs
  for (;;) {
    const ahora = await pasoActivoTurismos(marco)
    if (ahora !== '' && ahora !== paso) {
      if (ahora === siguiente) return
      throw new ErrorMapaIncompleto(conHuecos(`la pantalla que sigue a «${paso}» («${ahora.slice(0, 40)}», se esperaba «${siguiente ?? '?'}»)`), true)
    }
    if (Date.now() >= fin) throw new ErrorMapaIncompleto(conHuecos(`el efecto de «${BOTON_SIGUIENTE_TURISMOS}» en «${paso}» (el asistente no cambió de paso)`), true)
    await page.waitForTimeout(300)
  }
}

/**
 * Compatibilidad: «SIGUIENTE» del paso 1 y, en la pantalla que sigue, `ErrorMapaIncompleto` CON inventario («… («Datos personales»)
 * del asistente de Turismos (sin explorar)»). El adaptador ya no lo usa: recorre los pasos con `avanzarPasoTurismos`.
 */
export async function avanzarDesdeDatosVehiculo(
  page: Page,
  marco: Frame,
  ctx: Pick<ContextoPortal, 'pulsar' | 'pausaAccion'>,
  esperaMs = 15_000,
  huecos: readonly string[] = [],
  supuestos: string | null = null,
): Promise<never> {
  await avanzarPasoTurismos(page, marco, ctx, PASO_VEHICULO, esperaMs, huecos, supuestos)
  const paso = await pasoActivoTurismos(marco)
  throw new ErrorMapaIncompleto(`${`la pantalla que sigue a «${PASO_VEHICULO}» («${paso.slice(0, 40)}») del asistente de Turismos (sin explorar)`}${supuestos ? `; ${supuestos}` : ''}`, true)
}

/**
 * v0.6.12: ofertas de «Selección de paquete» (tabla comparativa `nx-comparison-table`, una columna por paquete). PURA.
 * Prima anual = «la anualidad»; «primer recibo» = `importeReciboEur` (la pantalla no dice el fraccionamiento: `null`, declarado).
 * Un paquete sin nombre o con «la anualidad» ilegible queda FUERA con aviso; un «primer recibo» ilegible solo deja `importeReciboEur` en
 * null. Coberturas: icono check/minus y valor de desplegable por paquete, opciones de elección única (la que trae marcada el portal) y
 * «Todos los paquetes incluyen». Nunca se inventa un importe, un límite ni una franquicia. `supuestos` = «Precio con supuestos: …».
 */
export function ofertasDesdePaquetesTurismos(lectura: LecturaPaquetesTurismos, supuestos: string | null = null): OfertaNormalizada[] {
  const n = lectura.paquetes.length
  const fuera: string[] = []
  const filasValidas = lectura.filas.filter((f) => f.descripcion !== '' && (f.comunes.length > 0 || f.opciones.length > 0 || f.celdas.length === n))
  const hayCoberturas = filasValidas.some((f) => f.comunes.length > 0 || f.opciones.length > 0 || f.celdas.some((c) => c.icono !== null || c.texto !== ''))
  const opcionesMarcadas = filasValidas.flatMap((f) => f.opciones.filter((o) => o.marcada).map((o) => `${f.descripcion}: ${o.texto}${o.adicional ? ` ${o.adicional}` : ''}`))
  const coberturasDe = (i: number): { coberturas: CoberturaOferta[]; franquicias: FranquiciaOferta[] } => {
    const coberturas: CoberturaOferta[] = []
    const franquicias: FranquiciaOferta[] = []
    const cob = (clave: string, literal: string, estado: CoberturaOferta['estado'], capital: number | null = null) => coberturas.push({ clave, literal, estado, capital, limite: null, franquicia: null })
    for (const f of filasValidas) {
      for (const c of f.comunes) if (c !== '') cob(c, c, 'incluida')
      for (const o of f.opciones.filter((x) => x.marcada && x.texto !== '')) {
        const estado: CoberturaOferta['estado'] = /^no\s+incluid/i.test(o.texto) ? 'excluida' : 'incluida'
        cob(f.descripcion, `${f.descripcion}: ${o.texto}`, estado, importeEs(o.texto))
      }
      const c = f.celdas.length === n ? f.celdas[i]! : null
      if (c === null || f.opciones.length > 0 || f.comunes.length > 0) continue
      if (c.texto !== '') {
        const t = c.texto.toLowerCase()
        const estado: CoberturaOferta['estado'] = t === 'no' ? 'excluida' : 'incluida'
        cob(f.descripcion, `${f.descripcion}: ${c.texto}`, estado)
        if (t !== 'sí' && t !== 'si' && t !== 'no') franquicias.push({ ambito: f.descripcion, importeEur: null, literal: `nivel «${c.texto}» del desplegable (sin importe en pantalla)` })
      } else if (c.icono === 'check') cob(f.descripcion, f.descripcion, 'incluida')
      else if (c.icono === 'minus') cob(f.descripcion, f.descripcion, 'excluida')
    }
    return { coberturas, franquicias }
  }
  const ofertas: Array<{ idx: number; oferta: OfertaNormalizada }> = []
  lectura.paquetes.forEach((p, i) => {
    const anual = importeEs(p.anualidad)
    if (p.nombre === '' || anual === null) {
      fuera.push(`Paquete ${p.nombre !== '' ? `«${p.nombre}»` : `nº ${i + 1}`} descartado: «la anualidad» no se pudo leer como importe.`)
      return
    }
    const recibo = importeEs(p.primerRecibo)
    const { coberturas, franquicias } = hayCoberturas ? coberturasDe(i) : { coberturas: [], franquicias: [] }
    ofertas.push({
      idx: i,
      oferta: {
        compania: 'allianz',
        producto: `Auto · ${p.nombre}`,
        primaAnualEur: anual,
        primaNetaEur: null,
        fraccionamiento: null,
        importeReciboEur: recibo,
        coberturas,
        franquicias,
        validaHasta: null,
        referenciaPortal: null,
        pdf: null,
        desglose: null,
        avisos: [
          'Prima anual = «la anualidad» de la tabla comparativa de Allianz (con impuestos; sin desglose neta/impuestos). El importe del recibo es el «primer recibo»; la pantalla no indica el fraccionamiento, no se asume.',
          ...(recibo === null ? ['«Primer recibo» ilegible: importe del recibo no consta.'] : []),
          ...(p.mejorOpcion ? ['El portal lo marca como «MEJOR OPCIÓN».'] : []),
          ...(p.conAviso ? ['El portal muestra un aviso en el título del paquete (icono de advertencia; texto no leído).'] : []),
          ...(opcionesMarcadas.length > 0 ? [`Precio con las opciones que traía marcadas el portal: ${opcionesMarcadas.join('; ')}.`] : []),
          ...(hayCoberturas ? [] : ['coberturas no leídas']),
          ...(supuestos ? [supuestos] : []),
        ],
      },
    })
  })
  return ofertas.map(({ oferta }) => ({ ...oferta, avisos: [...oferta.avisos, ...fuera] }))
}

/** `app-price` presente en el marco (la pantalla de precios existe aunque la tabla aún no se haya pintado). */
async function hayPantallaPreciosTurismos(marco: Frame): Promise<boolean> {
  return (await marco.locator('app-price').count().catch(() => 0)) > 0
}

/**
 * Recorrido completo hasta el precio (v0.6.5): resto de «Datos del vehículo» → «SIGUIENTE» → «Datos personales» → «SIGUIENTE» →
 * «Antecedentes» → «SIGUIENTE» → «Selección de paquete». Cada paso, solo SIN huecos; el primero que tenga alguno para con la
 * lista + inventario (y los supuestos ya aplicados). v0.6.12: en «Selección de paquete» se LEE la tabla comparativa (paquetes, primas
 * y coberturas; solo lectura: ni «Seleccionar» ni desplegables ni opciones) y se devuelven las ofertas; sin tabla legible →
 * hueco con inventario. Nunca toca «Vista Ampliada» (colaborador vacío = sin colaborador; antecedentes, del portal).
 */
export async function recorrerPasosTurismos(
  page: Page,
  marco: Frame,
  form: FormularioAuto,
  ctx: CtxTurismos,
  supuestoVersion: string | null,
  hoy: Date = new Date(),
  esperaMs = 15_000,
): Promise<ResultadoAdaptador> {
  const sup = supuestosAuto(form, hoy)
  const { pasos } = planDatosTurismos(form, hoy)
  const aplicados: string[] = []
  let opciones: string[] | null = null
  // Las opciones LEÍDAS de la compañía actual viajan en el error (columna `error` del trabajo) para mapearlas después. Son nombres
  // de aseguradoras del catálogo del portal, nunca datos del cliente.
  const conOpciones = (m: string) => (opciones ? `${m}; opciones de «${ETIQUETA_COMPANIA_ACTUAL}» leídas (${opciones.length}): ${opciones.join(' | ')}`.slice(0, 1_500) : m)
  const declarar = () => unirSupuestoVersion(supuestoVersion, supuestosAplicadosTurismos(sup, aplicados))
  for (const plan of pasos) {
    const r = await rellenarPasoTurismos(page, marco, ctx, plan)
    aplicados.push(...r.aplicados)
    if (r.opcionesCompania) {
      opciones = r.opcionesCompania
      ctx.formador?.log('turismos_compania_actual_opciones', { n: opciones.length, opciones })
    }
    await ctx.pausaAccion()
    try {
      await avanzarPasoTurismos(page, marco, ctx, plan.paso, esperaMs, r.huecos, declarar())
    } catch (e) {
      if (e instanceof ErrorMapaIncompleto && opciones) throw new ErrorMapaIncompleto(conOpciones(e.message.replace(/^.*?mapa incompleto: faltan /, '')), true)
      throw e
    }
  }
  const s = declarar()
  // v0.6.12: la tabla de precios se pinta tras unos instantes; solo se espera si la pantalla de precios (`app-price`) existe.
  if (await hayPantallaPreciosTurismos(marco)) {
    const fin = Date.now() + esperaMs
    for (;;) {
      const lectura = await leerPaquetesTurismosAllianz(marco)
      if (lectura && lectura.paquetes.some((p) => p.anualidad !== '')) {
        const ofertas = ofertasDesdePaquetesTurismos(lectura, s)
        if (ofertas.length === 0) throw new ErrorMapaIncompleto(conOpciones(`importes legibles en la pantalla de precios «${PASO_PAQUETE}» (${lectura.paquetes.length} paquetes, ninguna «anualidad» legible)${s ? `; ${s}` : ''}`), true)
        // v0.6.13 (autorizado por Alberto, 18/10/2026): «Guardar presupuesto» en el portal (NO vinculante), por la puerta del guard.
        // Lo que no se pueda guardar («no aparece el botón», casilla, diálogo…) se avisa en la oferta y el precio leído se devuelve.
        // EXCEPCIÓN: si salta la red de emisión del guard (violación), `guardarPresupuestoTurismosAllianz` la RELANZA y el trabajo
        // entero cae como bloqueo de emisión (`error_definitivo`): ese precio NO llega a asegura. Es a propósito (fail-closed).
        const guardado = ctx.guardarPresupuestoTurismos
          ? await ctx.guardarPresupuestoTurismos(marco, identificadorPresupuestoTurismos(ctx.trabajoId ?? 'sin-trabajo'))
          : ({ estado: 'no_guardado', motivo: 'el runner no trae la puerta de guardado' } as const)
        ctx.formador?.log('turismos_guardar_presupuesto', { estado: guardado.estado })
        // 18/10/2026: CP, localidad y vehículo que Allianz usó, leídos del portal (guard.ts, solo lectura); null = no se leyó.
        const usados = await leerDatosUsadosTurismosAllianz(marco).catch(() => null)
        // v0.6.14: el vehículo de catálogo que Allianz dejó MARCADO viaja también como `seleccionVehiculo` (Generali lo usa).
        return { ofertas: conDatosUsados(ofertasConPresupuestoTurismos(ofertas, guardado), usados), seleccionVehiculo: seleccionVehiculoConfirmada(usados?.vehiculo) }
      }
      if (Date.now() >= fin) break
      await page.waitForTimeout(300)
    }
  }
  throw new ErrorMapaIncompleto(conOpciones(`la pantalla de precios «${PASO_PAQUETE}» del asistente de Turismos (sin mapa del lector de primas)${s ? `; ${s}` : ''}`), true)
}

/**
 * Marca, modelo y versión de catálogo CONFIRMADOS en el portal → `ResultadoAdaptador.seleccionVehiculo` (v0.6.14 / moto 0.7.0).
 * Los mismos que van a `datosUsados.vehiculo`. Sin marca o sin modelo → `null` (no viaja nada); sin versión → sin `descripcion`.
 * Un texto con forma de dato personal (matrícula, NIF…) → `null` entero (asegura lo valida otra vez). PURA.
 */
export function seleccionVehiculoConfirmada(v: { marca: string | null; modelo: string | null; version: string | null } | null | undefined): SeleccionVehiculo | null {
  const t = (x: string | null | undefined) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim() : '')
  const marca = t(v?.marca)
  const modelo = t(v?.modelo)
  const version = t(v?.version)
  if (!marca || !modelo || marca.length > 80 || modelo.length > 80 || version.length > MAX_DESCRIPCION_VEHICULO) return null
  if ([marca, modelo, version].some((x) => x !== '' && pareceDatoPersonalEnDescripcion(x))) return null
  return { marca, modelo, ...(version ? { descripcion: version } : {}) }
}

/** Aviso fijo cuando el presupuesto quedó guardado en Allianz (para rescatarlo al emitir). */
export const AVISO_PRESUPUESTO_GUARDADO = 'Presupuesto guardado en Allianz (no vinculante)'

/**
 * v0.6.13: lleva el resultado de «Guardar presupuesto» a cada oferta. Guardado → `referenciaPortal` = el número que dio el portal o,
 * si no lo enseñó, el identificador que puso el bot (con qué es cada uno, en el aviso). Sin confirmar / no guardado → solo un aviso
 * (no es error del precio). PURA.
 */
export function ofertasConPresupuestoTurismos(ofertas: readonly OfertaNormalizada[], r: ResultadoGuardarPresupuestoTurismos): OfertaNormalizada[] {
  const aviso =
    r.estado === 'guardado'
      ? r.referencia
        ? `${AVISO_PRESUPUESTO_GUARDADO}: nº ${r.referencia} (identificador ${r.identificador}).`
        : `${AVISO_PRESUPUESTO_GUARDADO}: identificador ${r.identificador} (el portal no enseñó número).`
      : r.estado === 'sin_confirmar'
        ? `Se pulsó «Guardar presupuesto» (identificador ${r.identificador}) pero el portal no lo confirmó: compruébalo en Allianz.`
        : `Presupuesto NO guardado en Allianz: ${r.motivo}.`
  const ref = r.estado === 'guardado' ? (r.referencia ?? r.identificador) : null
  return ofertas.map((o) => ({ ...o, referenciaPortal: ref ?? o.referenciaPortal, avisos: [...o.avisos, aviso] }))
}

/** Petición del atasco de cualquier pantalla de Moto sin mapa (la lista que ve Alberto en Telegram son las opciones visibles). */
const PETICION_PANTALLA_MOTO: PeticionResolver = {
  clave: 'elegir_opcion_pantalla_moto',
  tipo: 'accion',
  descripcion: 'Pantalla de Allianz Moto sin mapa (el robot no la reconoce). Solo muestra las opciones visibles; NUNCA emitir, contratar, grabar ni pagar.',
}

/**
 * Regla del servicio: el bot de Moto nunca muere en silencio. Un `ErrorMapaIncompleto` que ninguna capa común convirtió ya en
 * atasco (titulares distintos, siniestros > 0, avance guardado, hueco de entrada…) prepara aquí el atasco (Telegram) con las
 * opciones visibles; el error es el ORIGINAL. Sin opciones visibles no hay candidatos que numerar: queda el hueco con inventario.
 */
async function tarificarMotoConAtasco(page: Page, form: FormularioAuto, ctx: ContextoPortal): Promise<ResultadoAdaptador> {
  try {
    return await tarificarMoto(page, form, ctx)
  } catch (e) {
    // Datos/negocio (titulares distintos, siniestros > 0, avance sin configurar) → error definitivo; el atasco es SOLO para pantalla no reconocida.
    if (e instanceof ErrorMapaIncompleto && !e.sinAtasco && !ctx.formador?.atasco) await registrarAtasco(page, ctx.formador, PETICION_PANTALLA_MOTO).catch(() => undefined)
    throw e
  }
}

function crearAdaptador(ramo: 'auto' | 'moto') {
  return {
    compania: 'allianz',
    ramo,
    credencial: 'ALLIANZ_EPAC',
    // Moto no cambia en la 0.6.1 … 0.6.14 (solo Turismos): conserva su versión (0.7.0, aún sin publicar, incluye `seleccionVehiculo`).
    version: ramo === 'moto' ? '0.7.21' : '0.6.20',
    async tarificar(page: Page, form: FormularioAuto, ctx: ContextoPortal): Promise<ResultadoAdaptador> {
      if (form.ramo !== ramo) throw new ErrorTarificador('datos', `allianz/${ramo}: el formulario es de ${form.ramo}`)
      if (ramo === 'moto') return tarificarMotoConAtasco(page, form, ctx) // Moto: formulario real (grabación 13/10); Turismos sigue con el mapa SUPUESTO de abajo
      exigirCompaniaActualTurismos(form)
      if (!(ctx.sesionReutilizada && (await sesionSirve(page, ctx)))) await login(page, ctx)
      await ctx.trasLogin()
      await abrirNuevaAlta(page, ctx, { pestana: 'Autos', producto: 'Turismos', selectorTarjeta: TARJETA_AUTOS.turismos })
      // v0.6.0: marco del motor `ngx-motor-azs` (sin marco → hueco + inventario ANTES de escribir) y exploración por pasos.
      const marco = await marcoFormularioTurismos(page)
      const { supuestoVersion } = await rellenarDatosVehiculoTurismosConSupuesto(page, marco, form, ctx)
      await ctx.pausa()
      // v0.6.5: resto de «Datos del vehículo», «Datos personales» y «Antecedentes», cada uno con SU «SIGUIENTE» (guard) y solo sin
      // huecos; los SUPUESTOS aplicados viajan en el error. Cuando haya mapa de «Selección de paquete»: leerPrimas → ofertasDesdePrimas(…, supuestos).
      return recorrerPasosTurismos(page, marco, form, ctx, supuestoVersion, new Date())
    },
  } as const
}

export const allianzAuto = crearAdaptador('auto')
export const allianzMoto = crearAdaptador('moto')
