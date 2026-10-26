// Generali · portal del corredor · TURISMOS (Ramo UV) — v0.2.4 (19/10/2026).
// Registrado SOLO con `GENERALI_AUTO_ACTIVO` (abajo, ENCENDIDO el 18/10/2026 por Alberto) y, además, la puerta de BD de siempre: la
// fila `seguros.companias_integracion` generali/auto activa y `rpa_autorizada` (NO se activa desde aquí).
//
// Fuente: 6 capturas de Alberto (Drive «BOT compañías › Generali», 18/10/2026); mapa en docs/generali-mapa-capturas.md.
//   1 login (access.generali.es) → 2 «Seleccionar mediador» (cascada; se elige el mediador de la correduría y «ACEPTAR») →
//   3 menú NEGOCIO › EMISIÓN › CONTRATACIÓN › AUTOMÓVILES › TURISMOS (RAMO UV) → 4 «Valoración Riesgo › Datos de Valoración»
//   (General: Mediador, Flota, F.Efectos, canal y subcanal; botón «Vehículo») → 5 «Selector de vehículos» (tipo, subtipo, marca)
//   → 6 «Datos de Valoración» (Identificación del vehículo + Roles).
// SIN CAPTURA (v0.2.0: el bot AVANZA todo lo que puede y, donde no sabe seguir, PARA con `ErrorMapaIncompletoGenerali` +
// registro de la pantalla en el mensaje + inventario de estructura + HTML redactado, que es el «modo exploración» del worker):
// lo que sale tras elegir la marca (modelo, versión y cómo se confirma), el resto de «Datos de Valoración» (tomador, conductor,
// antecedentes: se recorre el scroll del panel, se registra y se rellena lo del mapa PROVISIONAL por etiqueta exacta) y
// «Garantías y Resultados» (se pulsa por la compuerta del guard y se lee el PRECIO con un lector tolerante). La verificación
// de la matrícula es OPCIONAL (la captura 6 solo tiene un campo).
//
// Reglas de Alberto (18/10/2026): matrícula «1234*BCD» también en su verificación (`matriculaGenerali`); el vehículo NO se
// busca por matrícula: llega confirmado de Allianz/Mapfre de la misma oportunidad (asegura lo inyecta) y se casa en los
// desplegables EXACTO → por palabra entera → uno solo (`elegirOpcionCatalogo`); 0 o varios = atasco con las opciones. Mediador
// `MEDIADOR_GENERALI`; «Canal entrada», «Subcanal entrada» y «Flota» se dejan como vienen. Solo Turismos (moto, después).
// Sesión: login con `CRED_GENERALI_MEDIADORES_USER/_PASS`; si Okta pide el SMS (cada 30 días por dispositivo), `ctx.trasLogin`
// corta y el runner RELEVA el código por Telegram (`codigoSms: 'okta-generali'`, relevo-sms.ts, 19/10/2026): verifica, recuerda el
// dispositivo 30 días en la bóveda y repite el intento. Sin código a tiempo → `requiere_humano`.
//
// 🚨 SEGURIDAD. Este fichero no pulsa nada del menú ni del mediador: lo hacen `ctx.entrarTurismosGenerali` y
// `ctx.confirmarMediadorGenerali` (guard.ts). Aquí solo `ctx.pulsar` («Iniciar sesión», «Vehículo»),
// `ctx.pulsarSubpestanaGenerali` (lista blanca del guard) y campos tras `comprobarCampo`. Scroll y lectura de pantalla SOLO LEEN.
// Nunca emitir, contratar, grabar póliza ni pagar. Datos personales (matrícula, credenciales) solo en su campo: nunca en mensajes.

import type { Frame, Locator, Page } from 'playwright'
import {
  conAntecedentesFavorables,
  datosEquivalenciaDesdeEtiqueta,
  elegirVersionAutomaticamente,
  referenciaRiesgoVersion,
  supuestosAuto,
  textoSupuestos,
  type CandidatoVersion,
  type FormularioAuto,
  type OfertaNormalizada,
  type ResultadoAdaptador,
} from '@central/module-tarificacion'
import type { ContextoPortal } from '../../adaptador.ts'
import { ErrorTarificador } from '../../errores.ts'
import { comprobarCampo, ErrorEleccionVersion } from '../allianz/auto.ts'
import { campoConRespaldo, type ContextoFormador } from '../../formador.ts'
import { esUrlOktaSmsGenerali } from '../../guard.ts'
import {
  AVISO_MATRICULA_PROVINCIAL,
  claveEtiquetaRiesgoGenerali,
  decidirVerificacionMatricula,
  leerPrecioGenerali,
  avisosObligatorioGenerali,
  motivosInteresadoGenerali,
  PESTANA_PERSONAS_GENERALI,
  PREFIJO_ID_PERSONAS_GENERALI,
  resumenPersonasGenerali,
  type ControlPersonasGenerali,
  camposInteresadoGenerali,
  fragmentosImportesGenerali,
  PESTANAS_VALORACION_GENERALI,
  resumenVolcadoResultadosGenerali,
  resumenDiagnosticoImportesGenerali,
  type DiagnosticoImportesMarcoGenerali,
  resumenNavegacionGenerali,
  type NavegacionMarcoGenerali,
  type ControlNavegacionGenerali,
  type VolcadoMarcoResultadosGenerali,
  filaCoincideDocumentoGenerali,
  ID_BOTON_PERSONAS_GENERALI,
  normalizarRotuloGenerali,
  RE_ALTA_PERSONA_GENERALI,
  RE_BUSCAR_PERSONA_GENERALI,
  RE_ELEGIR_FILA_GENERALI,
  RE_PESTANA_SELECCION_PERSONAS_GENERALI,
  indiceMarcosGenerali,
  resumenControlesAbiertoGenerali,
  type ControlAbiertoGenerali,
  PREFIJO_ID_INTERESADO_GENERALI,
  resumenPantallaGenerali,
  valorRiesgoGenerali,
  type PantallaLeida,
  AVISO_SIMILITUD_GENERALI,
  ETIQUETAS_VALORACION,
  MEDIADOR_GENERALI,
  buscadoEnNivel,
  elegirGarajeGenerali,
  elegirMarcaExactaGenerali,
  elegirModeloGenerali,
  dataLabelDeOpcionGenerali,
  estadoTrasOtrosModeloGenerali,
  opcionPuestaPrimeFaces,
  camposNuevosSelectorGenerali,
  cvDePotenciaGenerali,
  desplegableVersionGenerali,
  grupoPotenciaGenerali,
  combustibleRiesgoGenerali,
  cvRiesgoGenerali,
  decidirCombustibleGenerali,
  elegirVersionDesplegableGenerali,
  esOpcionNoLoSeGenerali,
  grupoCombustibleGenerali,
  potenciaExactaGenerali,
  resumenCoincideConFilaGenerali,
  resumenCamposSelectorGenerali,
  type CampoSelectorGenerali,
  type FichaVersionGenerali,
  type FilaVersionGenerali,
  elegirOpcionCatalogo,
  decidirUsoGenerali,
  esEtiquetaVerificacionMatricula,
  esOpcionVaciaCatalogo,
  fechaGenerali,
  matriculaGenerali,
  mensajeAtascoCatalogo,
  normalizarCatalogo,
  opcionMediadorGenerali,
  decidirMediadorGenerali,
  inventarioMediadorGenerali,
  rutaSinQuery,
  type ControlMediador,
  type DecisionMediador,
  type MarcoMediador,
  rolesGenerali,
  urlConMediador,
  documentoNormalizadoGenerali,
  mensajesValidacionGenerali,
  opcionEspanaGenerali,
  opcionSelectVaciaGenerali,
  opcionSexoGenerali,
  opcionTipoCarneGenerali,
  opcionTipoDocumentoGenerali,
  planDatosPersonasGenerali,
  PREFIJO_ID_DATOS_PERSONAS_GENERALI,
  urlDatosPersonasGenerali,
  esPortalCorredorGenerali,
  vehiculoBuscadoGenerali,
  type VehiculoBuscado,
} from './reglas.ts'

/**
 * Flag de registro de Generali Turismos. ENCENDIDO el 18/10/2026 (Alberto lo pide). Encendido NO basta para que corra: sin la
 * fila `seguros.companias_integracion` generali/auto activa y `rpa_autorizada`, asegura no reclama ningún trabajo de Generali
 * (`reclamarSiguiente`) y el barrido cancela los pendientes («modo_no_automatizable»); el worker solo ejecuta el JOB_ID que asegura
 * le asigna. Apagado, un trabajo de generali/auto cae como `datos` («sin adaptador en esta imagen») sin abrir el navegador.
 */
export const GENERALI_AUTO_ACTIVO = true

/**
 * 0.1.1 (18/10/2026): flag encendido; «conductor habitual: el tomador (supuesto)» común (`supuestoConductorTomador`).
 * 0.2.0 (19/10/2026): verificación de matrícula OPCIONAL (0 sigue · 1 rellena · >1 para; se vuelve a mirar tras salir del
 * campo); selector de vehículos sin el desplegable esperado → hueco con los desplegables y opciones LEÍDOS; tras «Roles»,
 * scroll del panel + registro de campos/botones + mapa provisional de tomador/conductor/antecedentes + «Garantías y
 * Resultados» por la compuerta del guard + lector tolerante del precio (oferta) o hueco con el registro de esa pantalla.
 * 0.2.9 (19/10/2026): la versión elegida por una persona que no casa con UNA sola opción vuelve a `ErrorEleccionVersion` (con la lista), no a hueco de mapa. Generali ya NO elegía «la primera»: solo exacta o contención única.
 * 0.2.10 (19/10/2026, decisión de Alberto: «las diferencias entre acabados no son influyentes; el cliente revisa en la emisión»): la VERSIÓN
 * con varias candidatas y sin elección de la bandeja se elige SOLA si son EQUIVALENTES (`versionGeneraliPorEquivalencia`, regla común de
 * module-tarificacion) y se declara en el aviso de supuestos; con diferencias materiales sigue siendo `ErrorEleccionVersion` con todas.
 * 0.2.1 (19/10/2026): SMS de Okta relevado por Telegram (`codigoSms`) y dispositivo recordado 30 días en la bóveda; el login ya no
 * espera 30 s en la pantalla del SMS.
 * 0.2.2 (19/10/2026, prueba real b41be722): «Seleccionar mediador» vive en un MARCO (`seleccionAmbito.do`) con 5 campos sin
 * etiqueta: se busca en TODOS los marcos el desplegable por la OPCIÓN del mediador, esperando a que el bucle CorredorInicio →
 * seleccionAmbito → Refresh se estabilice; el botón de ese marco, solo por la lista blanca del guard; 0 o varias → inventario.
 * 0.2.5 (19/10/2026, prueba real c8838c26): el overlay «¿Sabías qué…?» llega segundos DESPUÉS del portal y interceptaba el sobrevuelo de
 * NEGOCIO: el cierre espera a que aparezca; el menú cierra el aviso si sigue, sobrevuela con plazo corto y, si no se despliega, pulsa el toggle.
 * 0.2.6 (19/10/2026, prueba real): el «Selector de vehículos» (marco `selVehiculo`) es PrimeFaces: «Todas las marcas» es un SelectOneMenu
 * (`select#X_input` OCULTO + `div#X[role=combobox]`); se reconoce, la marca se elige por igualdad EXACTA normalizada (0 o varias →
 * atasco `eleccion` con las cercanas), «Placas especiales» = «No» y «Confirmar» por puertas de guard.ts; la pantalla siguiente → hueco.
 * 0.2.11 (19/10/2026, prueba real): tras la marca aparece «Modelo» (otro SelectOneMenu PrimeFaces): se espera, se elige por igualdad EXACTA
 * normalizada (varias → atasco `eleccion`; ninguna → «Otros» declarado como supuesto) por las puertas de modelo de guard.ts. Si tras el
 * modelo salen campos NUEVOS sin rellenar, NO se pulsa «Confirmar»: se baja el scroll y se PARA con hueco listando etiquetas y opciones.
 * El hueco ya no dice «SIN CAPTURA» (el runner SÍ guarda la captura/recorrido/inventario en cualquier hueco con `pideInventarioDom`).
 * 0.2.13 (20/10/2026, prueba real: tras «Confirmar» el selector seguía abierto con «Modelo: Seleccione uno»): ANTES de «Confirmar» se verifica que
 * el modelo elegido es el del label del SelectOneMenu Y el del `<select>` oculto (si no, un reintento por el select oculto esperando al AJAX; si
 * sigue sin casar, hueco «el modelo no quedó seleccionado: label=…, input=…» SIN pulsar). TRAS «Confirmar» se espera hasta 25 s: Identificación
 * del vehículo con el selector cerrado → sigue; selector abierto → hueco con los mensajes de validación visibles (`.ui-messages`, error, growl).
 * 0.2.14 (20/10/2026, flujo REAL enseñado por Alberto): tras el modelo el selector enseña «Potencia» (grupo «116.0 CV»…), «Versión» y la tabla
 * Código | Modelo | Versión + «Resumen». La potencia y la fila se eligen con la regla de versión automática del monorepo (CV ±10 %, cc ±5 %,
 * combustible; equivalentes → declarada, material → `eleccion`) por las puertas nuevas de guard.ts; ANTES de avanzar se verifica el «Resumen»
 * (código/descripción); se avanza con «Siguiente» o «Confirmar». Sin Potencia/Versión (una sola versión) sigue como 0.2.13.
 * 0.2.16 (22/10/2026, prueba real: «el modelo no quedó seleccionado: label=«Seleccione uno», input=«Seleccione uno» (esperado «Otros modelos ...»)»):
 * «Otros modelos ...» no se da por puesto hasta que el AJAX termina: si sigue puesto y estable → ese (supuesto); si el portal RECARGA la lista
 * (el «...» es un «ver más»), el modelo se elige en la lista nueva por la misma regla y por la segunda ronda de la puerta de modelo (guard.ts:
 * solo tras «Otros», una vez, nunca «Otros» otra vez); si nada cambia → hueco claro SIN «Confirmar». Además «puesta» exige valor Y texto de
 * la opción (un valor compartido con «Seleccione uno» ya no «casa») y el `li` se empareja normalizado («…»/«...», espacios).
 * 0.2.17 (22/10/2026, prueba real: tras «Otros modelos ...» salen «combustible» [grupo] (Diésel | Gasolina | No lo sé), «potencia» [grupo]
 * (… | 163.0 CV | … | No lo sé) y «Versión» [desplegable] con textos REPETIDOS): EN ESE ORDEN, combustible del riesgo (vehículo confirmado o lo
 * que diga el texto de la versión) → potencia por CV ENTERO exacto (sin dato o sin coincidencia → «No lo sé» declarado, solo si el portal lo
 * ofrece) → espera a la recarga → versión del desplegable (bandeja > versión del riesgo > CV/combustible; idénticas → la primera, declarada;
 * sin elección → `eleccion` con la lista), verificada valor+texto+label y estable. Puertas nuevas en guard.ts (combustible, abrir/elegir
 * versión, una vez cada una). Antes de «Confirmar» se relee el selector: un campo nuevo sin mapear sigue PARANDO.
 * 0.2.18 (22/10/2026, prueba real: «Uso del Vehículo» ofrece «Particular Ocasional (…)» y «Particular Diario (…)»): manda `usoFrecuencia` del riesgo;
 * sin dato → «Particular Diario» declarado como supuesto (`decidirUsoGenerali`, reglas.ts). Otro uso: sin mapa, como antes.
 * 0.2.19 (22/10/2026, trabajo 304ac3a2: «Garantías y Resultados» sin precio; el portal mostraba «Es obligatorio informar el tomador» y los
 * campos del «Interesado / Tomador» seguían vacíos): rellena nombre, apellidos, NIF, nacimiento y carné del tomador por sus ids reales
 * (`camposInteresadoGenerali`); el lector del precio mira también los `<input>` de solo lectura y 2 líneas de lookahead; el atasco
 * nombra los avisos «Es obligatorio…» y trae fragmentos saneados alrededor de cada «€».
 * 0.2.20 (22/10/2026, misma prueba con 0.2.19: «mapa provisional: nada», el tomador seguía vacío y los ids eran los correctos). HIPÓTESIS: el bloque
 * «Interesado / Tomador» cuelga de la pestaña «Personas» (botón junto a «Vehículo») y sus campos no se ven hasta pulsarla; si los
 * campos existen pero están ocultos se pulsa «Personas» (por `ctx.pulsar`, una vez) y se rellena; tras el NIF se espera a la recarga. Fecha de
 * nacimiento y carné caen a `fichaTomador`. El atasco trae el inventario SANEADO de `reg1063A_personas_*` (tipo, oculto/deshab/ro, vacío o
 * con valor, rótulos de botones como el de búsqueda de persona) y el motivo por campo. NO se pulsa el buscador de personas (sin evidencia).
 * 0.2.21 (22/10/2026, misma prueba con 0.2.20: seguía «Mapa provisional: nada» y el atasco decía «ffnain/ffcain no_existe»). El inventario del trabajo
 * 304ac3a2 SÍ trae `reg1063A_personas_interesado_{nombre,papell,sapell,nifcif,ffnain,ffcain,npunts,wnacld}` (y `ynidcl/ysexo/ycarnc` deshabilitados):
 * el «no_existe» era un ARTEFACTO del lector (tope de 60 controles llenado por los `div` contenedores `*Identification`). Ahora el lector solo
 * mira controles (input/select/textarea/button/a, tope 90) y anota las opciones marcadas y la opción elegida de los desplegables de `roles_*`. La
 * pestaña «Personas» no salía como botón en el inventario (no tiene id): se busca por rol botón/pestaña/enlace, `input[value]` y texto exacto
 * (uno solo visible) y, si no se encuentra, el atasco lo dice. Cada campo omitido da su motivo (`omitido:`). El atasco lleva «Tomador» y
 * «Roles/Personas» PRIMERO y compactos (el mensaje se corta a 2000). Las opciones de rol (`roles_zprieq`/`roles_cconno`), desplegables `ycond1/ycond2`
 * y el botón `lnkPers` NO se tocan (hace falta una puerta en runner/adaptador y la semántica; ver docs/TARIFICADOR-RPA.md).
 * 0.2.22 (22/10/2026, misma prueba con 0.2.21: «Es obligatorio informar el tomador»; roles ya correctos —TOMADOR / NO HAY—, y TODOS los `interesado_*`
 * readonly/deshabilitados y VACÍOS; existe `roles_lnkPers` «Personas»). Hipótesis: el interesado se rellena al buscar/elegir la persona. Si tras el
 * rellenado normal el NIF del interesado sigue readonly y vacío, se pulsa UNA vez «Personas» (por `ctx.pulsar`), se espera lo que abre (ventana nueva,
 * marco o capa), y SOLO si hay un buscador con campo de documento y botón «Buscar/Consultar» se teclea el NIF del tomador, se busca y, si sale
 * EXACTAMENTE una fila y su documento coincide, se elige (por `ctx.pulsar`). 0 o varias filas, o una pantalla de ALTA: PARA sin crear nada. Después se
 * verifica que `interesado_nifcif`/`nombre` ya traen valor. El mensaje lleva la rama tomada y el inventario SANEADO de lo abierto (sin valores).
 * 0.2.23 (25/10/2026, prueba real con 0.2.22: «sin_buscador … sin controles visibles»). El recorrido muestra que «Personas» NO abre ventana: el marco
 * `mainFrame` NAVEGA en el sitio (selVehiculo2.do → emiAutosGenB028.do, «Interesado / Tomador») con las pestañas «Selección personas que intervienen» y
 * «Datos personas»; el escaneo lo trataba como «capa» sin alta y el inventario solo contaba los marcos NUEVOS (vacíos: modalFrame, errorIF…), por eso
 * salía «sin controles visibles». Ahora un marco que cambia de URL cuenta como abierto (rama=marco), la espera es de 15 s, si el marco abierto no trae
 * buscador se pulsa UNA vez la pestaña «Selección personas…» (por `ctx.pulsar`; nunca «Confirmar» ni «Alta») y el diagnóstico lista TODOS los marcos
 * (URL sin query, nombre, nº de controles) y los controles de los abiertos. Se escanean marcos anidados y ventanas nuevas del contexto.
 * 0.2.24 (25/10/2026, prueba real con 0.2.23): se pulsó la pestaña «Selección personas…» y el marco `emiAutosGenB028.do` sigue con 23 controles SIN «Buscar»
 * (tipo de documento, NIF, nombre, apellidos, sexo, fechas, permiso, nacionalidad, email, móvil, «Cancelar», «Confirmar» y 3 enlaces sin texto: posibles iconos).
 * El recorrido no basta para ver el patrón real. Esta versión (1) reconoce botones-imagen/enlaces-icono con title/alt/aria-label «Buscar/Consultar/lupa»,
 * (2) vuelca en el atasco, primero lo pulsable (rótulo, title/alt, imagen, función del onclick, clase del enlace y de su contenedor) y las cabeceras de tabla,
 * y (3) anota cuántos controles había antes y después de pulsar la pestaña. «Confirmar»/«Alta» siguen sin pulsarse nunca.
 */
/**
 * 0.2.25 (26/10/2026, prueba real con 0.2.24 + AUTORIZACIÓN de Alberto): «Personas» navega `mainFrame` a `emiAutosGenB028.do`, pestaña «Datos
 * personas», SIN buscador. Ahora el bot rellena ahí SOLO los campos vacíos con los datos del riesgo (`planDatosPersonasGenerali`: NIF/NIE,
 * nombre, apellidos, nacimiento; carné y sexo del conductor solo si es el tomador; España con DNI; email/móvil solo si vienen) respetando lo
 * que autocomplete el portal al salir del NIF, y pulsa «Confirmar» SOLO por `ctx.confirmarDatosPersonasGenerali` (guard: #confirmar, marco
 * emiAutosGenB028.do, pestaña «Datos personas»). Cualquier otro «Confirmar» de Generali lo rechaza `pulsar`. Nunca casillas ni emisión.
 */
/**
 * 0.2.28 (26/10/2026, prueba real con 0.2.27: tras «Confirmar» de «Datos personas» el bot queda en `emiAutosGenB028.do` con botones solo «Vehículo»/«Personas»
 * y pestañas de sección, SIN «Datos de Valoración» ni `#siguiente`; el motivo del gate de «Siguiente» no llegó porque el runner corta el mensaje a 2000
 * y «Avance» iba al final). El atasco pone ahora al PRINCIPIO el motivo del gate (también si no se intentó) y el inventario de controles de
 * navegación de TODOS los marcos (botones/enlaces/imágenes con acción, pestañas y cuál está activa), sin valores de campos. El gate NO se amplía:
 * en esa pantalla no hay ningún «Siguiente» que pulsar.
 */
/**
 * 0.2.27 (26/10/2026, prueba real con 0.2.26: pasa el tomador pero «Garantías y Resultados» no da precio). El inventario final seguía siendo el
 * formulario de «Valoración Riesgo» (`emiAutosGenB028.do`: pestañas «Valoración Riesgo · Datos de Valoración · Garantías y Resultados», botones
 * `siguiente`/`cancelar`, enlace «Paso con datos incompletos») y NINGÚN texto con «€»: el precio NO estaba visible tras el clic. El lector ahora
 * entiende también tablas (cabecera «Prima/Importe/Total…» + celda con importe, una línea por celda) y el atasco VUELCA, saneado, las pestañas
 * (¿marcada?), las tablas con cabeceras y filas con «€» y los botones, para ver si el clic cambió la pantalla. Sin pulsar nada nuevo.
 */
export const VERSION_GENERALI_AUTO = '0.2.30'
/** Texto EXACTO de la subpestaña del precio (captura 6). Solo se pulsa por `ctx.pulsarSubpestanaGenerali` (lista blanca del guard). */
export const SUBPESTANA_PRECIO_GENERALI = 'Garantías y Resultados'
/** Espera corta tras salir del campo «Matrícula» por si el portal pinta entonces la verificación. */
const ESPERA_VERIFICACION_MS = 1_200
/** Espera del precio tras pulsar la subpestaña. */
const ESPERA_PRECIO_MS = 25_000

export const URL_INICIO_GENERALI = 'https://www.generali.es/arq_genernetPortalFormWeb/CorredorInicio.po'
export const ORIGEN_ACCESO_GENERALI = 'https://access.generali.es'

/** Hueco de mapa (pantalla sin captura): NO transitorio y pide el inventario de estructura (modo exploración del worker). */
export class ErrorMapaIncompletoGenerali extends ErrorTarificador {
  readonly pideInventarioDom: boolean
  constructor(que: string, pideInventarioDom = true) {
    super('portal', `generali/auto: mapa incompleto: faltan ${que}`)
    this.name = 'ErrorMapaIncompletoGenerali'
    this.pideInventarioDom = pideInventarioDom
  }
}

const ESPERA_PANTALLA_MS = 20_000
type Raiz = Page | Frame

// ───────────────────────── ayudas de lectura (solo leen) ─────────────────────────

/** «Aprende» de la capa común solo lo que funcionó: el `confirmar` del respaldo se llama tras escribir/elegir con éxito. */
const CONFIRMAR = new WeakMap<Locator, () => Promise<void>>()
const confirmarUso = async (l: Locator) => { await CONFIRMAR.get(l)?.().catch(() => undefined) }

/**
 * El control `tag` de la etiqueta EXACTA `etiqueta`: `getByLabel` (uno visible) → el primer control que la sigue en el DOM →
 * CAPA COMÚN (`campoConRespaldo` de formador.ts: lo aprendido y la IA, validado). `null` si nadie lo resuelve (el adaptador
 * lanza su hueco). Sin `formador` (login: campos de credenciales) no hay respaldo.
 */
async function controlJuntoA(raiz: Raiz, etiqueta: string, tag: 'input' | 'select', formador?: ContextoFormador): Promise<Locator | null> {
  const porLabel = raiz.getByLabel(etiqueta, { exact: true }).filter({ visible: true })
  if ((await porLabel.count().catch(() => 0)) === 1) return porLabel.first()
  const lit = etiqueta.replace(/"/g, '')
  const tipo = tag === 'input' ? "input[not(@type='hidden') and not(@type='checkbox') and not(@type='button') and not(@type='submit')]" : 'select'
  const sel = `xpath=//*[normalize-space(text())="${lit}"]/following::${tipo}[1]`
  const cand = raiz.locator(sel).filter({ visible: true })
  if ((await cand.count().catch(() => 0)) === 1) return cand.first()
  if (!formador) return null
  const page = 'mainFrame' in raiz ? raiz : raiz.page()
  const r = await campoConRespaldo(raiz, `${sel}[not(ancestor-or-self::*[@hidden])]`, { page, formador, etiqueta, descripcion: `Control «${etiqueta}» del formulario de Turismos de Generali` }).catch(() => null)
  if (!r) return null
  CONFIRMAR.set(r.campo, r.confirmar)
  return r.campo
}

async function opcionesSelect(sel: Locator): Promise<{ valor: string; texto: string }[]> {
  return sel.evaluate((el) => Array.from((el as HTMLSelectElement).options).map((o) => ({ valor: o.value ?? '', texto: (o.textContent ?? '').trim() })))
}

/** Valor y texto de la opción seleccionada de un `<select>` (también oculto). Vacíos si no se deja leer. Solo lee. */
async function leerOpcionSeleccionada(sel: Locator): Promise<{ valor: string; texto: string }> {
  return sel
    .evaluate((el) => {
      const s = el as HTMLSelectElement
      return { valor: s.value ?? '', texto: (s.selectedOptions[0]?.textContent ?? '').trim() }
    })
    .catch(() => ({ valor: '', texto: '' }))
}

async function esSelectNativo(l: Locator): Promise<boolean> {
  return l.evaluate((el) => el.tagName === 'SELECT').catch(() => false)
}

/** El marco (o la página) donde aparece el texto EXACTO `texto` visible; espera hasta `ms`. */
async function marcoConTexto(page: Page, texto: string, ms = ESPERA_PANTALLA_MS): Promise<Raiz | null> {
  const fin = Date.now() + ms
  for (;;) {
    for (const f of page.frames()) {
      if (f.isDetached()) continue
      if ((await f.getByText(texto, { exact: true }).filter({ visible: true }).count().catch(() => 0)) > 0) return f === page.mainFrame() ? page : f
    }
    if (Date.now() >= fin) return null
    await page.waitForTimeout(400)
  }
}

/** Escribe en un campo de texto: guard del campo → `fill` → salir del campo (el portal valida al salir). */
async function escribir(campo: Locator, valor: string, ctx: ContextoPortal): Promise<void> {
  await ctx.pausaAccion()
  await comprobarCampo(campo)
  await campo.fill(valor)
  await campo.blur().catch(() => undefined)
  await confirmarUso(campo)
}

/** Elige la opción nº `indice` de un `<select>` nativo (guard del campo antes). */
async function elegirIndice(sel: Locator, indice: number, ctx: Pick<ContextoPortal, 'pausaAccion'>): Promise<void> {
  await ctx.pausaAccion()
  await comprobarCampo(sel)
  await sel.selectOption({ index: indice })
  await confirmarUso(sel)
}

// ───────────────────────── lectura de pantalla (v0.2.0: SOLO LEE; nunca pulsa ni escribe) ─────────────────────────
// Los extractores van como TEXTO (no como función): tsx envuelve las funciones con nombre en `__name`, que no existe en la
// página. Nunca sale el valor de un campo de texto (solo «vacío»/«con valor»); de un desplegable, el texto de la opción puesta
// salvo en etiquetas que pueden llevar datos personales.

const JS_COMUN = `
  const T = (n) => (n ? (n.innerText || n.textContent || '') : '').replace(/\\s+/g, ' ').trim();
  const VIS = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility === 'visible';
  const ETQ = (el) => {
    if (el.labels && el.labels.length) {
      const c = el.labels[0].cloneNode(true);
      c.querySelectorAll('input,select,textarea').forEach((x) => x.remove());
      const t = T(c);
      if (t) return t;
    }
    const a = el.getAttribute('aria-label') || el.getAttribute('title');
    if (a && a.trim()) return a.trim();
    let c = el;
    for (let i = 0; c && i < 4; i++) {
      let p = c.previousElementSibling;
      while (p) {
        if (!p.matches('input,select,textarea,button')) {
          const t = T(p);
          if (t && t.length <= 80) return t;
        }
        p = p.previousElementSibling;
      }
      c = c.parentElement;
    }
    return el.getAttribute('name') || el.id || '';
  };`

/** Lee campos (etiqueta, tipo, obligatorio, valor), botones y avisos VISIBLES de un marco. */
const JS_LEER_PANTALLA = `(() => {${JS_COMUN}
  const TEXTO = ['text', 'password', 'email', 'tel', 'number', 'date', 'search', 'url', ''];
  const PERSONAL = /mediador|nombre|apellido|nif|dni|documento|direcci|tel[eé]fono|correo|email|cuenta|iban|matr[ií]cula/i;
  const campos = [];
  for (const el of Array.from(document.querySelectorAll('input,select,textarea'))) {
    const ta = (el.getAttribute('type') || '').toLowerCase();
    if (el.tagName === 'INPUT' && ta === 'hidden') continue;
    if (!VIS(el)) continue;
    const etiqueta = ETQ(el).slice(0, 80);
    const tag = el.tagName.toLowerCase();
    let tipo = tag === 'input' ? (ta || 'text') : tag;
    if (el.disabled || el.readOnly) tipo += ',ro';
    const obligatorio = el.required === true || el.getAttribute('aria-required') === 'true' || /\\*\\s*$/.test(etiqueta);
    let valor;
    if (tag === 'select') {
      const o = el.selectedIndex >= 0 ? el.options[el.selectedIndex] : null;
      const t = o ? T(o) : '';
      valor = t === '' ? 'vacío' : PERSONAL.test(etiqueta) ? 'con valor' : t.slice(0, 40);
    } else if (tag === 'input' && !TEXTO.includes(ta)) {
      valor = el.checked === true ? 'marcado' : 'sin marcar';
    } else {
      valor = String(el.value || '').trim() === '' ? 'vacío' : 'con valor';
    }
    campos.push({ etiqueta, tipo, obligatorio, valor });
    if (campos.length >= 150) break;
  }
  const botones = [];
  for (const el of Array.from(document.querySelectorAll('button,input[type=button],input[type=submit],[role=button],[role=tab],a[onclick],li[onclick],td[onclick],span[onclick],div[onclick]'))) {
    if (!VIS(el)) continue;
    const t = (T(el) || el.value || el.getAttribute('aria-label') || el.getAttribute('title') || '').trim();
    if (t && t.length <= 60 && !botones.includes(t)) botones.push(t);
    if (botones.length >= 40) break;
  }
  const avisos = [];
  for (const el of Array.from(document.querySelectorAll('[role=alert],[class*=error],[class*=Error],[class*=aviso],[class*=Aviso],[class*=alert],[class*=mensaje]'))) {
    if (!VIS(el)) continue;
    const t = T(el);
    if (t.length >= 3 && t.length <= 160 && !avisos.includes(t)) avisos.push(t);
    if (avisos.length >= 10) break;
  }
  return { campos, botones, avisos };
})()`

/** Desplegables visibles con su etiqueta y sus primeras opciones (para el hueco del selector de vehículos). */
const JS_SELECTS = `(() => {${JS_COMUN}
  return Array.from(document.querySelectorAll('select')).filter(VIS).slice(0, 12).map((s) => ({
    etiqueta: ETQ(s).slice(0, 60),
    opciones: Array.from(s.options).map((o) => T(o)).filter((t) => t !== '').slice(0, 20),
    total: s.options.length,
  }));
})()`

/** Controles del selector de vehículos (solo lectura; NUNCA valores): menús de PrimeFaces (por el id de su combobox), selects visibles, campos de texto y grupos de opciones. */
const JS_CAMPOS_SELECTOR = `(() => {${JS_COMUN}
  const TEXTO = ['text', 'email', 'tel', 'number', 'date', 'search', 'url', ''];
  const out = [];
  const grupos = new Map();
  for (const el of Array.from(document.querySelectorAll('input,select,textarea'))) {
    const tag = el.tagName.toLowerCase();
    const ta = (el.getAttribute('type') || '').toLowerCase();
    if (tag === 'input' && ['hidden', 'button', 'submit', 'image', 'reset', 'password'].includes(ta)) continue;
    if (el.id && /_(focus|filter)$/.test(el.id)) continue;
    if (tag === 'select') {
      const m = /^(.*)_input$/.exec(el.id || '');
      const combo = m ? document.getElementById(m[1]) : null;
      const pf = !!combo && combo.getAttribute('role') === 'combobox';
      if (!(pf ? VIS(combo) : VIS(el))) continue;
      const etiqueta = (pf ? ETQ(combo) : ETQ(el)).slice(0, 80);
      const ops = Array.from(el.options).map((o) => T(o)).filter((t) => t !== '');
      out.push({ clave: pf ? m[1] : (el.id || 'select|' + etiqueta), etiqueta, tipo: pf ? 'desplegable' : 'select', opciones: ops.slice(0, 25), total: el.options.length });
    } else if (tag === 'input' && !TEXTO.includes(ta)) {
      if (!(VIS(el) || (el.labels && el.labels[0] && VIS(el.labels[0])))) continue;
      const g = el.name || el.id || ta;
      let e = grupos.get(g);
      if (!e) { e = { clave: 'grupo|' + g, etiqueta: g.slice(0, 80), tipo: ta === 'checkbox' ? 'casilla' : 'grupo', opciones: [], total: 0 }; grupos.set(g, e); out.push(e); }
      const lab = el.labels && el.labels.length ? T(el.labels[0]) : '';
      e.total++;
      if (lab && e.opciones.length < 25) e.opciones.push(lab.slice(0, 60));
    } else {
      if (!VIS(el)) continue;
      const etiqueta = ETQ(el).slice(0, 80);
      out.push({ clave: el.id || 'texto|' + etiqueta, etiqueta, tipo: 'texto', opciones: [], total: 0 });
    }
    if (out.length >= 80) break;
  }
  return out;
})()`

/** Controles del selector de vehículos (solo lectura): sirve para detectar campos NUEVOS tras elegir marca/modelo. */
export async function leerCamposSelector(raiz: Raiz): Promise<CampoSelectorGenerali[]> {
  return ((await raiz.evaluate(JS_CAMPOS_SELECTOR).catch(() => [])) as CampoSelectorGenerali[] | null) ?? []
}

/** Un paso de scroll en TODOS los contenedores con scroll del marco (el formulario tiene el suyo). `true` = alguno bajó. */
const JS_SCROLL = `(() => {
  const els = Array.from(document.querySelectorAll('*')).filter((e) => {
    const cs = getComputedStyle(e);
    return /(auto|scroll)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 10;
  });
  if (document.scrollingElement) els.push(document.scrollingElement);
  let bajo = false;
  for (const e of els) {
    const antes = e.scrollTop;
    e.scrollTop = antes + Math.max(200, Math.floor(e.clientHeight * 0.8));
    if (e.scrollTop > antes) bajo = true;
  }
  return bajo;
})()`

/** Pantalla leída de un marco (vacía si el marco no se deja leer). */
export async function leerPantalla(raiz: Raiz): Promise<PantallaLeida> {
  const r = await raiz.evaluate(JS_LEER_PANTALLA).catch(() => null)
  return (r as PantallaLeida | null) ?? { campos: [], botones: [], avisos: [] }
}

/** Pantalla leída de TODOS los marcos de la página (la vista tras la subpestaña puede estar en otro marco). */
async function leerPantallaPagina(page: Page): Promise<PantallaLeida> {
  const total: PantallaLeida = { campos: [], botones: [], avisos: [] }
  for (const f of page.frames()) {
    if (f.isDetached()) continue
    const p = await leerPantalla(f)
    total.campos.push(...p.campos)
    for (const b of p.botones) if (!total.botones.includes(b)) total.botones.push(b)
    for (const a of p.avisos) if (!total.avisos.includes(a)) total.avisos.push(a)
  }
  return total
}

/**
 * Recorre el scroll del formulario (contenedor propio, captura 6) hasta abajo, con pausas cortas por si pinta más campos al
 * bajar. Solo desplaza: no pulsa ni escribe. Devuelve cuántos pasos bajó.
 */
export async function recorrerScroll(page: Page, raiz: Raiz, maxPasos = 15): Promise<number> {
  let n = 0
  for (; n < maxPasos; n++) {
    const bajo = await raiz.evaluate(JS_SCROLL).catch(() => false)
    if (!bajo) break
    await page.waitForTimeout(250)
  }
  return n
}

/** «Etiqueta: op1 | op2 …» de los desplegables visibles del marco (catálogo, sin datos personales). */
async function describirSelects(raiz: Raiz): Promise<string> {
  const r = ((await raiz.evaluate(JS_SELECTS).catch(() => [])) as { etiqueta: string; opciones: string[]; total: number }[]) ?? []
  if (r.length === 0) return 'ningún desplegable visible'
  return r.map((s) => `«${s.etiqueta || '(sin etiqueta)'}» (${s.total}): ${s.opciones.join(' | ')}`).join(' ; ').slice(0, 1200)
}

/** Importes en controles de formulario (solo lectura o no): «etiqueta valor», con la etiqueta sacada del label/aria/id/name. Sin funciones con nombre (tsx). */
const JS_IMPORTES_INPUT = `(() => {
  const out = [];
  document.querySelectorAll('input, textarea').forEach((e) => {
    const t = (e.getAttribute('type') || 'text').toLowerCase();
    if (!['text', 'number', 'tel', ''].includes(t)) return;
    const v = String(e.value || '').trim();
    if (!/^[€\\s]*\\d[\\d.]*(,\\d{1,2})?\\s*(€|eur|euros)?$/i.test(v) || !/[,€]/.test(v)) return;
    const lab = e.id ? document.querySelector('label[for="' + e.id.replace(/"/g, '') + '"]') : null;
    const par = e.closest('td,div,li,tr');
    const nombre = ((e.id || '') + ' ' + (e.name || '')).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_.]/g, ' ');
    const txt = ((lab && lab.textContent) || e.getAttribute('aria-label') || e.title || (par && par.textContent && par.textContent.length < 80 ? par.textContent : '') || '') + ' ' + nombre;
    out.push(txt.replace(/\\s+/g, ' ').trim().slice(0, 100) + '\\n' + v);
  });
  return out;
})()`

/** Importes en TABLAS: columna con cabecera «prima/importe/total/precio…» + celda con importe → «cabecera fila» y el valor en la línea siguiente. */
const JS_IMPORTES_TABLA = `(() => {
  const out = [];
  const reImp = /^[€\\s]*\\d[\\d.]*(,\\d{1,2})?\\s*(€|eur|euros)?$/i;
  const gar = /garant[ií]as y capitales opcionales/i.test(document.body ? document.body.innerText || '' : '');
  const reCab = gar ? /prima|precio|importe|total|recibo|anual|contado|pagar|cuota/i : /prima|precio|importe|total|recibo|anual|contado|pagar/i;
  document.querySelectorAll('table').forEach((t) => {
    const filas = Array.from(t.rows || []);
    let cab = null;
    filas.forEach((r) => {
      const cs = Array.from(r.cells || []);
      const esCab = cs.length > 0 && cs.every((c) => c.tagName === 'TH') || (!cab && cs.some((c) => reCab.test(c.textContent || '')) && !cs.some((c) => reImp.test((c.textContent || '').trim())));
      if (esCab) { cab = cs.map((c) => (c.textContent || '').replace(/\\s+/g, ' ').trim()); return; }
      if (!cab) return;
      const et = ((cs[0] && cs[0].textContent) || '').replace(/\\s+/g, ' ').trim().slice(0, 40);
      const sel = gar && (/selected|seleccionad|current|activ|marcad/i.test(String(r.className || '')) || !!r.querySelector('input:checked') || cs.some((c) => /selected|seleccionad|marcad/i.test(String(c.className || ''))));
      cs.forEach((c, i) => {
        const v = (c.textContent || '').replace(/\\s+/g, ' ').trim();
        if (i > 0 && cab[i] && reCab.test(cab[i]) && reImp.test(v) && /[,€]/.test(v)) out.push((sel ? '[SEL] ' : '') + cab[i].slice(0, 40) + ' ' + et + '\\n' + v);
      });
    });
  });
  return out;
})()`

/** Volcado SOLO LECTURA de pestañas, tablas y botones (sin celdas que no tengan «€», para no sacar datos personales). */
const JS_VOLCADO_RESULTADOS = `((nombres) => {
  const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
  const txt = (e) => (e.textContent || '').replace(/\\s+/g, ' ').trim();
  const pestanas = [];
  document.querySelectorAll('a, li, td, span, div, input[type=button]').forEach((e) => {
    const t = e.tagName === 'INPUT' ? (e.value || '') : (e.children.length === 0 || e.tagName === 'A' ? txt(e) : '');
    if (!nombres.includes(t) || !vis(e)) return;
    const c = (e.className || '') + ' ' + ((e.parentElement && e.parentElement.className) || '');
    pestanas.push({ texto: t.slice(0, 40), marcada: /current|active|selected|activ/i.test(String(c)) || e.getAttribute('aria-selected') === 'true' });
  });
  const tablas = [];
  document.querySelectorAll('table').forEach((t) => {
    if (!vis(t) || tablas.length >= 6) return;
    const filas = Array.from(t.rows || []);
    const cab = filas.length ? Array.from(filas[0].cells || []).map((c) => txt(c).slice(0, 30)) : [];
    const euro = filas.filter((r) => /€|eur\\b/i.test(r.textContent || '')).slice(0, 4).map((r) => Array.from(r.cells || []).map((c) => txt(c).slice(0, 30)).filter((x) => /€|\\d,\\d{2}|^[A-Za-zÁÉÍÓÚáéíóúñ ]{2,24}$/.test(x)).slice(0, 6));
    if (cab.length || euro.length) tablas.push({ cabeceras: cab.slice(0, 8), filas: filas.length, filasEuro: euro });
  });
  const botones = [];
  document.querySelectorAll('input[type=button], input[type=submit], button').forEach((e) => {
    if (!vis(e) || botones.length >= 8) return;
    const t = (e.value || txt(e) || e.id || '').slice(0, 30);
    if (t) botones.push(t);
  });
  return { ruta: location.pathname, pestanas, tablas, botones };
})`

/** Volcado saneado de «Garantías y Resultados» (o de lo que haya tras el clic) por marco, para el atasco. Nunca lanza. */
export async function volcarResultadosGenerali(page: Page): Promise<VolcadoMarcoResultadosGenerali[]> {
  const out: VolcadoMarcoResultadosGenerali[] = []
  for (const f of page.frames()) {
    if (f.isDetached()) continue
    const v = (await f.evaluate(`${JS_VOLCADO_RESULTADOS}(${JSON.stringify([...PESTANAS_VALORACION_GENERALI])})`).catch(() => null)) as VolcadoMarcoResultadosGenerali | null
    if (v && (v.pestanas.length > 0 || v.tablas.length > 0)) out.push(v)
  }
  return out
}

/** v0.2.30: cabeceras de las tablas visibles e importes con la etiqueta de su fila/celda (sin filtrar aquí: el saneo es `resumenDiagnosticoImportesGenerali`). SOLO LEE. */
const JS_DIAGNOSTICO_IMPORTES = `(() => {
  const vis = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const txt = (e) => String(e.textContent || '').replace(/\\s+/g, ' ').trim();
  const reImp = /^€?\\s?\\d[\\d.]*(,\\d{1,2})?\\s?€?$/;
  const cabeceras = [];
  const importes = [];
  document.querySelectorAll('table').forEach((t) => {
    if (!vis(t)) return;
    const filas = Array.from(t.rows || []);
    let cab = null;
    filas.forEach((r) => {
      const cs = Array.from(r.cells || []);
      if (cs.length === 0) return;
      if (!cab && (cs.every((c) => c.tagName === 'TH') || !cs.some((c) => /\\d/.test(txt(c))))) { cab = cs.map((c) => txt(c).slice(0, 40)); if (cabeceras.length < 6) cabeceras.push(cab.slice(0, 8)); return; }
      const et = txt(cs[0]).slice(0, 40);
      cs.forEach((c, i) => {
        const v = txt(c);
        if (v && reImp.test(v) && /[,€]/.test(v) && importes.length < 60) importes.push({ etiqueta: (i > 0 ? (cab && cab[i] ? cab[i] + ' ' : '') + et : (cab && cab[i]) || ''), importe: v });
      });
    });
  });
  document.querySelectorAll('td,th,span,div,li,label,p,b,strong,dt,dd,font').forEach((e) => {
    if (e.children.length > 0 || e.closest('table') || !vis(e) || importes.length >= 60) return;
    const v = txt(e);
    const m = /€?\\s?\\d{1,3}(?:\\.\\d{3})*,\\d{1,2}\\s?€?|€\\s?\\d+(?:,\\d{1,2})?|\\d+(?:,\\d{1,2})?\\s?€/.exec(v);
    if (!m) return;
    let et = v.replace(m[0], '').trim();
    if (!et && e.previousElementSibling) et = txt(e.previousElementSibling);
    if (!et && e.parentElement && e.parentElement.children.length <= 4) et = txt(e.parentElement).replace(m[0], '').trim();
    importes.push({ etiqueta: et.slice(0, 40), importe: m[0].trim() });
  });
  return { cabeceras: cabeceras, importes: importes };
})()`

/** v0.2.30: diagnóstico saneado de las tablas y los importes de TODOS los marcos (solo lee; nunca lanza). */
export async function volcarDiagnosticoImportesGenerali(page: Page): Promise<DiagnosticoImportesMarcoGenerali[]> {
  const out: DiagnosticoImportesMarcoGenerali[] = []
  for (const f of page.frames()) {
    if (f.isDetached()) continue
    const v = (await f.evaluate(JS_DIAGNOSTICO_IMPORTES).catch(() => null)) as DiagnosticoImportesMarcoGenerali | null
    if (v && (v.cabeceras.length > 0 || v.importes.length > 0)) out.push(v)
  }
  return out
}

const JS_NAVEGACION_GENERALI = `(() => {
  const vis = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const cl = (e) => (typeof e.className === 'string' ? e.className : '');
  const controles = [];
  document.querySelectorAll('input[type=button],input[type=submit],input[type=image],button,a[onclick],a[href^="javascript"],img[onclick]').forEach((e) => {
    if (controles.length >= 40) return;
    const tag = e.tagName.toLowerCase();
    const tipo = (e.getAttribute('type') || '').toLowerCase();
    const texto = tag === 'input' ? (e.getAttribute('value') || e.getAttribute('alt') || e.getAttribute('title') || '') : (e.textContent || e.getAttribute('alt') || e.getAttribute('title') || '');
    controles.push({ tag: tag, tipo: tipo, id: e.id || '', name: e.getAttribute('name') || '', texto: String(texto).replace(/\\s+/g, ' ').trim().slice(0, 40), visible: vis(e) });
  });
  const pestanas = [];
  document.querySelectorAll('[role=tab],[class*=tab] li,[class*=tab] a,[class*=pest] li,[class*=pest] a,ul.tabs li').forEach((e) => {
    if (pestanas.length >= 20 || !vis(e)) return;
    if (Array.from(e.children).some((c) => c.tagName === 'LI' || c.tagName === 'UL')) return;
    const t = String(e.textContent || '').replace(/\\s+/g, ' ').trim();
    if (!t || t.length > 40 || pestanas.some((p) => p.texto === t)) return;
    let activa = false;
    for (let x = e, n = 0; x && n < 3 && !activa; x = x.parentElement, n++) {
      if (x.getAttribute('aria-selected') === 'true' || x.getAttribute('aria-current')) activa = true;
      if (cl(x).split(/\\s+/).some((k) => !/inactiv|noactiv|desactiv|unselect|nosel/i.test(k) && /^(activ|selected|current|on|sel)|activ|selected|current/i.test(k))) activa = true;
    }
    pestanas.push({ texto: t, activa: activa });
  });
  return { controles: controles, pestanas: pestanas };
})()`

/** Controles de navegación y pestañas de TODOS los marcos (solo lee; sin valores de campos de datos). */
export async function volcarNavegacionGenerali(page: Page): Promise<NavegacionMarcoGenerali[]> {
  const out: NavegacionMarcoGenerali[] = []
  for (const f of page.frames()) {
    if (f.isDetached()) continue
    const v = (await f.evaluate(JS_NAVEGACION_GENERALI).catch(() => null)) as { controles: ControlNavegacionGenerali[]; pestanas: { texto: string; activa: boolean }[] } | null
    if (v && (v.controles.length > 0 || v.pestanas.length > 0)) out.push({ marco: f.name(), ruta: f.url(), pestanas: v.pestanas, controles: v.controles })
  }
  return out
}

/** Texto visible de todos los marcos (para el lector tolerante del precio). */
export async function textoPagina(page: Page): Promise<string> {
  const partes: string[] = []
  for (const f of page.frames()) {
    if (f.isDetached()) continue
    partes.push(await f.locator('body').innerText({ timeout: 2_000 }).catch(() => ''))
    // Importes en `<input>` (innerText no los ve): «etiqueta valor» con la etiqueta del id/name/aria/label.
    partes.push(((await f.evaluate(JS_IMPORTES_INPUT).catch(() => [])) as string[]).join('\n'))
    partes.push(((await f.evaluate(JS_IMPORTES_TABLA).catch(() => [])) as string[]).join('\n'))
  }
  return partes.join('\n')
}

// ───────────────────────── 1 · login ─────────────────────────

/** Login en access.generali.es (captura 1) si hace falta. El SMS de 30 días lo detecta `ctx.trasLogin` (relevo por Telegram). */
export async function loginGenerali(page: Page, ctx: ContextoPortal): Promise<void> {
  await page.goto(URL_INICIO_GENERALI, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined)
  await ctx.exigirSinCaptcha()
  const enAcceso = page.url().startsWith(ORIGEN_ACCESO_GENERALI)
  const password = page.locator('input[type="password"]').filter({ visible: true })
  if (enAcceso || (await password.count()) > 0) {
    if (ctx.sesionManual) throw new ErrorTarificador('portal', 'generali: la sesión guardada no sirve (el portal pide login)')
    const usuario = await controlJuntoA(page, 'Nombre de usuario', 'input')
    const clave = (await password.count()) === 1 ? password.first() : null
    if (!usuario || !clave) throw new ErrorMapaIncompletoGenerali('los campos «Nombre de usuario» y «Contraseña» del acceso (captura 1)')
    await escribir(usuario, ctx.credenciales.usuario, ctx)
    await escribir(clave, ctx.credenciales.contrasena, ctx)
    const boton = page.getByRole('button', { name: 'Iniciar sesión', exact: true }).filter({ visible: true })
    if ((await boton.count()) !== 1) throw new ErrorMapaIncompletoGenerali('el botón «Iniciar sesión» del acceso (captura 1)')
    await ctx.pulsar(boton.first())
    // Sale de access.generali.es… o se queda en la pantalla del SMS de Okta (la decide `ctx.trasLogin`): no se esperan 30 s en vano.
    await page.waitForURL((u) => !u.toString().startsWith(ORIGEN_ACCESO_GENERALI) || esUrlOktaSmsGenerali(u.toString()), { timeout: 30_000 }).catch(() => undefined)
    await page.waitForLoadState('domcontentloaded').catch(() => undefined)
  }
  await ctx.trasLogin()
  await ctx.exigirSinCaptcha()
}

// ───────────────────────── 2 · mediador ─────────────────────────

/** Lee los controles VISIBLES de formulario de un marco: estructura y opciones (nunca lo tecleado). SOLO LEE. */
const JS_CONTROLES_MEDIADOR = `(() => {
  const VIS = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility === 'visible';
  const T = (n) => (n ? (n.textContent || '') : '').replace(/\\s+/g, ' ').trim();
  const selects = Array.from(document.querySelectorAll('select'));
  const out = [];
  for (const el of Array.from(document.querySelectorAll('select, input, textarea, [role=combobox], [role=listbox]'))) {
    const ta = (el.getAttribute('type') || '').toLowerCase();
    if (el.tagName === 'INPUT' && ['hidden', 'button', 'submit', 'image', 'reset'].includes(ta)) continue;
    if (!VIS(el)) continue;
    const nativo = el.tagName === 'SELECT';
    const role = el.getAttribute('role') || '';
    let opciones = [];
    let seleccionada = null;
    if (nativo) {
      opciones = Array.from(el.options).map((o) => ({ valor: o.value || '', texto: T(o) }));
      const o = el.selectedIndex >= 0 ? el.options[el.selectedIndex] : null;
      seleccionada = o ? { valor: o.value || '', texto: T(o) } : null;
    } else if (role) {
      const lista = el.getAttribute('aria-controls') ? document.getElementById(el.getAttribute('aria-controls')) : el;
      opciones = Array.from((lista || el).querySelectorAll('[role=option]')).map((o) => ({ valor: o.getAttribute('data-value') || '', texto: T(o) }));
      if (opciones.length === 0) opciones = [{ valor: '', texto: T(el) }];
    }
    const tipo = nativo ? 'select' : role ? role : el.tagName.toLowerCase() + (ta ? ':' + ta : '');
    out.push({ tipo, name: el.getAttribute('name') || '', id: el.id || '', nativo, indiceSelect: nativo ? selects.indexOf(el) : -1, opciones: opciones.slice(0, 400), seleccionada });
    if (out.length >= 40) break;
  }
  return out;
})()`

type EscaneoMediador = { marcos: (MarcoMediador & { frame: Frame })[] }

/** Controles de TODOS los marcos vivos (la cascada de «Seleccionar mediador» vive en el marco `seleccionAmbito.do`). */
async function escanearMediador(page: Page): Promise<EscaneoMediador> {
  const marcos: EscaneoMediador['marcos'] = []
  for (const f of page.frames()) {
    if (f.isDetached()) continue
    const controles = ((await f.evaluate(JS_CONTROLES_MEDIADOR).catch(() => null)) as ControlMediador[] | null) ?? []
    marcos.push({ frame: f, ruta: rutaSinQuery(f.url()), controles })
  }
  return { marcos }
}

/** Espera de «Seleccionar mediador»: tolera el bucle CorredorInicio → seleccionAmbito → seleccionAmbitoRefresh (prueba real). */
export const ESPERA_MEDIADOR_MS = 45_000
/** Tras elegir el mediador, el marco puede recargarse (`seleccionAmbitoRefresh.do`): lo que se espera a que vuelva estable. */
const ESPERA_REFRESCO_MEDIADOR_MS = 15_000
const PAUSA_MEDIADOR_MS = 700

type CandidatoMediador = { escaneo: EscaneoMediador; d: Extract<DecisionMediador, { tipo: 'unica' }> }

/**
 * Escanea hasta que la pantalla se ESTABILIZA (dos lecturas seguidas iguales: rutas de los marcos, nº de controles y la
 * decisión). `null` = el portal ya está con el mediador correcto. Una sola candidata estable → esa; varias estables → PARA
 * con inventario; ninguna hasta el tope → PARA con inventario. Nunca elige a ciegas.
 */
async function candidatoMediadorEstable(page: Page, esperaMs: number, pausaMs: number): Promise<CandidatoMediador | null> {
  const fin = Date.now() + esperaMs
  let firmaAnterior: string | null = null
  let ultimo: EscaneoMediador = { marcos: [] }
  for (;;) {
    const conMediador = urlConMediador(page.url())
    if (conMediador === true) return null
    if (conMediador === false) throw new ErrorMapaIncompletoGenerali('el portal entró con OTRO mediador (no se cambia a ciegas)', false)
    const escaneo = await escanearMediador(page)
    const d = decidirMediadorGenerali(escaneo.marcos)
    const firma = JSON.stringify([escaneo.marcos.map((m) => [m.ruta, m.controles.length]), d])
    if (firma === firmaAnterior) {
      if (d.tipo === 'unica') {
        if (!d.nativo) throw new ErrorMapaIncompletoGenerali(`el desplegable «Mediador» (captura 2): el código de la correduría está en un control que no es un desplegable nativo (sin mapa para elegirlo). Campos: ${inventarioMediadorGenerali(escaneo.marcos)}`)
        return { escaneo, d }
      }
      // Las opciones llevan nombres de mediadores: el inventario solo lleva códigos y marcadores (opcionSinDatosGenerali).
      if (d.tipo === 'varias') throw new ErrorMapaIncompletoGenerali(`el desplegable «Mediador» (captura 2): ${d.n} opciones/desplegables casan con el mediador de la correduría; no se elige ninguno. Campos: ${inventarioMediadorGenerali(escaneo.marcos)}`)
    }
    firmaAnterior = firma
    ultimo = escaneo
    if (Date.now() >= fin) {
      throw new ErrorMapaIncompletoGenerali(`el desplegable «Mediador» (captura 2): el mediador de la correduría no aparece en ningún desplegable de ningún marco tras esperar a que la pantalla se estabilice; no se elige otro. Página: ${rutaSinQuery(page.url())}. Campos: ${inventarioMediadorGenerali(ultimo.marcos)}`)
    }
    await page.waitForTimeout(pausaMs)
  }
}

/** El `<select>` de la candidata en SU marco: por id, por name o por posición; siempre UNO y con la opción del mediador. */
async function selectDeCandidato(c: CandidatoMediador): Promise<Locator> {
  const m = c.escaneo.marcos[c.d.marco]!
  const ctl = m.controles[c.d.control]!
  const opciones: Locator[] = []
  if (ctl.id) opciones.push(m.frame.locator(`select[id="${ctl.id.replace(/["\\]/g, '')}"]`))
  if (ctl.name) opciones.push(m.frame.locator(`select[name="${ctl.name.replace(/["\\]/g, '')}"]`))
  if (ctl.indiceSelect >= 0) opciones.push(m.frame.locator('select').nth(ctl.indiceSelect))
  for (const l of opciones) {
    if ((await l.count().catch(() => 0)) !== 1) continue
    const r = opcionMediadorGenerali(await opcionesSelect(l).catch(() => []), MEDIADOR_GENERALI)
    if (r.tipo === 'unica' && r.indice === c.d.indice) return l
  }
  throw new ErrorMapaIncompletoGenerali(`el desplegable «Mediador» (captura 2): la candidata no se deja localizar de forma única en su marco (${m.ruta})`)
}

/**
 * ¿Hay un «NEGOCIO» en algún marco? (el menú del portal del corredor). Prueba real 31e76085: en `CorredorPortal.po` es un
 * enlace `<a>` SIN href con ese texto exacto (junto a COMPAÑÍA · FORMACIÓN · NORMAS · … · CERRAR) que puede estar plegado y no
 * contar como «visible»: aquí basta con que esté en el DOM (solo lee; el sobrevuelo lo hace la puerta del guard).
 */
async function menuNegocioVisible(page: Page): Promise<boolean> {
  for (const f of page.frames()) {
    if (!f.isDetached() && (await f.getByText(/^\s*NEGOCIO\s*$/).count().catch(() => 0)) >= 1) return true
  }
  return false
}

/** ¿Ya estamos en el portal del corredor? Ruta EXACTA `CorredorPortal.po` de www.generali.es (con o sin `mediatorCode`) o el menú NEGOCIO. */
async function llegadoAlPortal(page: Page): Promise<boolean> {
  if (urlConMediador(page.url()) === true || esPortalCorredorGenerali(page.url())) return true
  return rutaSinQuery(page.url()).startsWith('https://www.generali.es/') && (await menuNegocioVisible(page))
}

/** Tras «ENTRAR»: espera a la llegada a `CorredorPortal.po` (ruta exacta) o al menú NEGOCIO. */
async function esperarMenuNegocio(page: Page, esperaMs: number, pausaMs: number): Promise<boolean> {
  const fin = Date.now() + esperaMs
  while (Date.now() < fin) {
    if (await llegadoAlPortal(page)) return true
    await page.waitForTimeout(pausaMs)
  }
  return llegadoAlPortal(page)
}

/** Tras confirmar el mediador: espera a la URL con `mediatorCode`, al menú NEGOCIO o a que CorredorInicio.po ofrezca «ENTRAR». */
async function esperarPortalOEntrar(page: Page, esperaMs: number, pausaMs: number): Promise<void> {
  const fin = Date.now() + esperaMs
  while (Date.now() < fin) {
    if (await llegadoAlPortal(page)) return
    if (rutaSinQuery(page.url()).endsWith('/CorredorInicio.po')) {
      for (const f of page.frames()) {
        if (!f.isDetached() && (await f.getByText(/^\s*ENTRAR\s*$/).filter({ visible: true }).count().catch(() => 0)) >= 1) return
      }
    }
    await page.waitForTimeout(pausaMs)
  }
}

/**
 * «Seleccionar mediador» (captura 2 + prueba real b41be722, v0.2.2): la cascada vive en un MARCO (`seleccionAmbito.do`) con
 * 5 campos SIN etiqueta. Se busca en TODOS los marcos el único desplegable con la opción del mediador de la correduría
 * (`MEDIADOR_GENERALI`), esperando a que el bucle CorredorInicio → seleccionAmbito → Refresh se estabilice; se elige (el marco
 * puede recargarse: se vuelve a leer hasta verla puesta) y el botón de ESE marco lo pulsa SOLO la puerta del guard
 * (`ctx.confirmarMediadorGenerali`, lista blanca exacta). 0 o varias → PARA con inventario (tipo, name/id, nº de opciones y
 * textos sin datos personales). Si el portal ya entra con ese mediador, nada; con otro, PARA.
 */
export async function elegirMediadorGenerali(page: Page, ctx: Pick<ContextoPortal, 'pausaAccion' | 'confirmarMediadorGenerali' | 'entrarPortalGenerali'>, o: { esperaMs?: number; pausaMs?: number } = {}): Promise<void> {
  const espera = o.esperaMs ?? ESPERA_MEDIADOR_MS
  const pausa = o.pausaMs ?? PAUSA_MEDIADOR_MS
  if (!ctx.confirmarMediadorGenerali) throw new ErrorMapaIncompletoGenerali('la puerta guardada del mediador en el contexto del runner', false)
  let elegidas = 0
  for (let esperaEsta = espera; ; esperaEsta = Math.min(espera, ESPERA_REFRESCO_MEDIADOR_MS)) {
    const c = await candidatoMediadorEstable(page, esperaEsta, pausa)
    if (!c) return
    const sel = await selectDeCandidato(c)
    if (!c.d.puesto) {
      // Elegir dispara el `onchange` de la cascada (recarga el marco): se vuelve a leer hasta verla puesta y estable.
      if (elegidas >= 2) throw new ErrorMapaIncompletoGenerali('el desplegable «Mediador» (captura 2): el mediador de la correduría no se queda elegido tras recargarse el marco')
      elegidas++
      await elegirIndice(sel, c.d.indice, ctx)
      await page.waitForTimeout(pausa)
      continue
    }
    await ctx.confirmarMediadorGenerali(sel)
    await esperarPortalOEntrar(page, o.esperaMs ?? ESPERA_PANTALLA_MS, pausa)
    if (await llegadoAlPortal(page)) return
    // Prueba real 351f946b (v0.2.3): aceptado el mediador, CorredorInicio.po se queda con «ENTRAR»: se pulsa por la puerta del guard.
    if (ctx.entrarPortalGenerali && rutaSinQuery(page.url()).endsWith('/CorredorInicio.po')) {
      await ctx.entrarPortalGenerali()
      if (await esperarMenuNegocio(page, o.esperaMs ?? ESPERA_PANTALLA_MS, pausa)) return
    }
    throw new ErrorMapaIncompletoGenerali(`la llegada al portal del corredor con el mediador elegido (página: ${rutaSinQuery(page.url())})`)
  }
}

// ───────────────────────── 4-5 · General + selector de vehículos ─────────────────────────

/** «Mediador» del bloque General (captura 4): viene «00000»; si está vacío o a ceros se teclea el de la correduría. Otro → PARA. */
async function mediadorDelFormulario(marco: Raiz, ctx: ContextoPortal): Promise<void> {
  const campo = await controlJuntoA(marco, 'Mediador', 'input', ctx.formador)
  if (!campo) throw new ErrorMapaIncompletoGenerali('el campo «Mediador» del bloque General (captura 4)')
  const actual = (await campo.inputValue().catch(() => '')).trim()
  if (actual === MEDIADOR_GENERALI) return
  if (actual !== '' && !/^0+$/.test(actual)) throw new ErrorMapaIncompletoGenerali('el «Mediador» del formulario viene con otro código (no se cambia a ciegas)', false)
  await escribir(campo, MEDIADOR_GENERALI, ctx)
}

type FormVersionGenerali = Pick<FormularioAuto, 'eleccionVersion' | 'vehiculoConfirmado' | 'seleccionVehiculo' | 'fechaMatriculacion'>

/**
 * Versión de Generali por EQUIVALENCIA (v0.2.10, 19/10/2026). `candidatas` = textos de las opciones (las que siguen en juego); devuelve
 * el índice dentro de `candidatas` y el supuesto a declarar, o lanza `ErrorEleccionVersion` con `candidatas` si difieren de forma
 * material (combustible, CV/cc fuera de tolerancia) o ninguna es compatible con el riesgo. Datos leídos de la etiqueta. PURA salvo el lanzamiento.
 */
export function versionGeneraliPorEquivalencia(candidatas: readonly string[], form: FormVersionGenerali): { indice: number; supuesto: string | null } {
  const r = elegirVersionAutomaticamente(
    candidatas.map((o) => ({ etiqueta: o, codigo: null, datos: datosEquivalenciaDesdeEtiqueta(o) })),
    { riesgo: referenciaRiesgoVersion(form) },
  )
  if (r.tipo === 'automatica' || r.tipo === 'unica') return { indice: r.indice, supuesto: r.supuesto }
  throw new ErrorEleccionVersion(candidatas.map((o): CandidatoVersion => ({ etiqueta: o, codigo: null })))
}

/** Un nivel del selector (marca/modelo/versión) en un `<select>` nativo, casado por la regla de Alberto. Devuelve si fue por similitud. `avisos` recoge el supuesto de una versión elegida sola. */
async function elegirNivel(sel: Locator, nivel: 'marca' | 'modelo' | 'version', v: VehiculoBuscado, form: FormVersionGenerali, ctx: ContextoPortal, avisos?: string[]): Promise<boolean> {
  const opciones = (await opcionesSelect(sel)).map((o) => o.texto)
  // Versión: la elección de una PERSONA (bandeja) manda; texto EXACTO de la opción.
  const persona = nivel === 'version' ? form.eleccionVersion?.etiqueta?.trim() : undefined
  if (persona) {
    const ix = opciones.flatMap((o, i) => (normalizarCatalogo(o) === normalizarCatalogo(persona) ? [i] : []))
    // v0.2.9: una elección que no casa con UNA sola opción se vuelve a preguntar con la lista (nunca se elige otra ni se para sin opciones).
    if (ix.length !== 1) throw new ErrorEleccionVersion(opciones.filter((o) => !esOpcionVaciaCatalogo(o)).map((o): CandidatoVersion => ({ etiqueta: o, codigo: null })))
    await elegirIndice(sel, ix[0]!, ctx)
    return false
  }
  const b = buscadoEnNivel(v, nivel)
  const validas = opciones.filter((o) => !esOpcionVaciaCatalogo(o))
  if (!b) {
    // Sin versión confirmada: una sola versión → esa; varias → la equivalente (declarada) o, si difieren de forma material, elige una persona.
    if (validas.length === 1) {
      await elegirIndice(sel, opciones.indexOf(validas[0]!), ctx)
      return false
    }
    const a = nivel === 'version' ? versionGeneraliPorEquivalencia(validas, form) : null
    if (!a) throw new ErrorEleccionVersion(validas.map((o): CandidatoVersion => ({ etiqueta: o, codigo: null })))
    if (a.supuesto) avisos?.push(a.supuesto)
    await elegirIndice(sel, opciones.indexOf(validas[a.indice]!), ctx)
    return false
  }
  const e = elegirOpcionCatalogo(opciones, b.texto, b.modo)
  if (e.tipo !== 'unica') {
    if (nivel === 'version' && e.tipo === 'varias') {
      const entre = e.indices.map((i) => opciones[i]!)
      const a = versionGeneraliPorEquivalencia(entre, form)
      if (a.supuesto) avisos?.push(a.supuesto)
      await elegirIndice(sel, e.indices[a.indice]!, ctx)
      return false
    }
    if (nivel === 'version') throw new ErrorEleccionVersion(validas.map((o): CandidatoVersion => ({ etiqueta: o, codigo: null })))
    throw new ErrorMapaIncompletoGenerali(mensajeAtascoCatalogo(nivel, b.texto, opciones, e))
  }
  await elegirIndice(sel, e.indice, ctx)
  return e.porSimilitud
}

/** Un `<select>` nativo visible cuya etiqueta casa con `re` (selector de vehículos, niveles sin captura). */
async function selectPorEtiqueta(raiz: Raiz, re: RegExp): Promise<Locator | null> {
  const etiquetas = raiz.getByText(re).filter({ visible: true })
  const n = await etiquetas.count().catch(() => 0)
  const hallados: Locator[] = []
  for (let i = 0; i < n; i++) {
    const s = etiquetas.nth(i).locator('xpath=following::select[1]')
    if ((await s.count().catch(() => 0)) === 1 && (await s.isVisible().catch(() => false))) hallados.push(s)
  }
  return hallados.length === 1 ? hallados[0]! : null
}

// ───────────────────────── selector de vehículos PrimeFaces (v0.2.6) ─────────────────────────

/** SelectOneMenu de PrimeFaces: `select` OCULTO `<base>_input` (las opciones y el valor) y su `div#<base>[role=combobox]` visible. */
export type MenuPrimeFaces = { select: Locator; base: string }

/**
 * Reconoce un SelectOneMenu de PrimeFaces SIN exigir que el `<select>` sea visible (PrimeFaces lo oculta): el primer `<select>`
 * que sigue a la etiqueta EXACTA `etiqueta` o, si no hay etiqueta, el único `select[id$="_input"]` de la marca; vale solo si su id
 * acaba en `_input` y existe `div#<base>` con role=combobox. `null` si nadie lo es (el llamador sigue con el `<select>` nativo).
 */
export async function menuPrimeFaces(raiz: Raiz, etiqueta: string, fragmentoId = 'marca'): Promise<MenuPrimeFaces | null> {
  const lit = etiqueta.replace(/"/g, '')
  let cand = raiz.locator(`xpath=//*[normalize-space(text())="${lit}"]/following::select[1]`)
  if ((await cand.count().catch(() => 0)) !== 1) cand = raiz.locator(`select[id$="_input"][id*="${fragmentoId.replace(/[^a-z]/gi, '')}" i]`)
  if ((await cand.count().catch(() => 0)) !== 1) return null
  const base = await cand.first().evaluate((el) => {
    const id = el.id
    if (!id.endsWith('_input')) return null
    const b = id.slice(0, -'_input'.length)
    const c = document.getElementById(b)
    return c && c.getAttribute('role') === 'combobox' ? b : null
  }).catch(() => null)
  return base ? { select: cand.first(), base } : null
}

/**
 * Elige la marca en el SelectOneMenu. Vía: abrir el desplegable por su disparador (puerta del guard) y pulsar el `li` de `data-label` exacto (la vía propia de PrimeFaces:
 * actualiza etiqueta, valor y dispara su change/ajax); si eso falla (no por el guard), `selectOption` en el select oculto + change.
 * Solo igualdad EXACTA normalizada: 0 o varias → `ErrorEleccionVersion` (tipo `eleccion`) con las cercanas, sin tocar nada.
 */
export async function elegirMarcaPrimeFaces(raiz: Raiz, menu: MenuPrimeFaces, v: VehiculoBuscado, ctx: ContextoPortal): Promise<void> {
  const b = buscadoEnNivel(v, 'marca')
  if (!b) throw new ErrorMapaIncompletoGenerali('la marca del vehículo de la oportunidad (el selector de Generali la exige)', false)
  const opciones = await opcionesSelect(menu.select)
  const e = elegirMarcaExactaGenerali(opciones.map((o) => o.texto), b.texto)
  if (e.tipo !== 'unica') {
    if (e.cercanas.length > 0) throw new ErrorEleccionVersion(e.cercanas.map((o): CandidatoVersion => ({ etiqueta: o, codigo: null })))
    throw new ErrorMapaIncompletoGenerali(mensajeAtascoCatalogo('marca', b.texto, opciones.map((o) => o.texto), { tipo: 'ninguna' }))
  }
  await ponerOpcionPrimeFaces(raiz, menu, opciones[e.indice]!, e.indice, ctx.abrirDesplegableMarcaGenerali, ctx.elegirMarcaListaGenerali, ctx, 'la marca elegida en «Todas las marcas»')
}

/**
 * Pone una opción ya decidida en un SelectOneMenu de PrimeFaces: abre por su disparador (puerta del guard), pulsa el `li` de `data-label`
 * exacto (puerta del guard) y, si el navegador agota el plazo, cae a `selectOption` en el select oculto + change. Comprueba que quedó puesta.
 */
async function ponerOpcionPrimeFaces(
  raiz: Raiz,
  menu: MenuPrimeFaces,
  elegida: { valor: string; texto: string },
  indice: number,
  abrir: ((base: string) => Promise<void>) | undefined,
  elegir: ((base: string, texto: string) => Promise<void>) | undefined,
  ctx: Pick<ContextoPortal, 'pausaAccion'>,
  que: string,
  repetidas = false,
): Promise<void> {
  // v0.2.16: valor Y texto de la opción seleccionada (si el placeholder y «Otros modelos ...» comparten valor, el valor solo «casaba» sin elegir).
  const puesta = async () => {
    const actual = await leerOpcionSeleccionada(menu.select)
    return opcionPuestaPrimeFaces(actual.valor, actual.texto, elegida)
  }
  if (!abrir || !elegir) throw new ErrorMapaIncompletoGenerali(`las puertas guardadas del desplegable de ${que} (disparador y \`li\`) en el contexto del runner`, false)
  await ctx.pausaAccion()
  try {
    // v0.2.7: se abre pulsando el disparador propio de PrimeFaces (sin las opciones dentro), no el `div` que las contiene.
    await abrir(menu.base)
    // v0.2.16: el `li` se empareja con la opción normalizada («…» vs «...», espacios) y a la puerta va su `data-label` EXACTO.
    const etiquetas = await raiz.locator(`[id="${menu.base}_panel"] li[data-label]`).evaluateAll((els) => els.map((el) => el.getAttribute('data-label') ?? '')).catch(() => [] as string[])
    const etq = dataLabelDeOpcionGenerali(etiquetas, elegida.texto, repetidas)
    if (etq !== null) {
      await elegir(menu.base, etq)
      for (let i = 0; i < 10 && !(await puesta()); i++) await new Promise((r) => setTimeout(r, 300))
    }
  } catch (err) {
    // Solo un plazo agotado del navegador cae a la vía de reserva; un bloqueo del guard (u otro error) sube tal cual.
    if (!(err instanceof Error && err.name === 'TimeoutError')) throw err
  }
  if (!(await puesta())) {
    await comprobarCampo(menu.select)
    await menu.select.selectOption({ index: indice }, { force: true })
    await menu.select.dispatchEvent('change')
  }
  if (!(await puesta())) throw new ErrorMapaIncompletoGenerali(`${que} no quedó puesta en el selector (PrimeFaces)`)
}

const ESPERA_MODELO_MS = 12_000
const PAUSA_CAMPOS_NUEVOS_MS = 1_500

/** Espera (hasta `esperaMs`) al desplegable «Modelo» de PrimeFaces, distinto del de marcas y con alguna opción real. `null` si no sale. */
export async function esperarMenuModelo(page: Page, selector: Raiz, baseMarca: string, esperaMs = ESPERA_MODELO_MS): Promise<MenuPrimeFaces | null> {
  const fin = Date.now() + esperaMs
  for (;;) {
    const m = await menuPrimeFaces(selector, 'Modelo', 'model')
    if (m && m.base !== baseMarca) {
      const ops = await opcionesSelect(m.select).catch(() => [])
      if (ops.some((o) => !esOpcionVaciaCatalogo(o.texto))) return m
    }
    if (Date.now() >= fin) return null
    await page.waitForTimeout(400)
  }
}

/**
 * Elige el modelo en su SelectOneMenu con el criterio de la marca (igualdad EXACTA normalizada). Varias → atasco `eleccion`; ninguna →
 * «Otros» si hay UNA (se declara en `avisos` como supuesto); sin «Otros» → atasco `eleccion` con las cercanas o todas, sin tocar nada.
 */
export async function elegirModeloPrimeFaces(raiz: Raiz, menu: MenuPrimeFaces, v: VehiculoBuscado, ctx: ContextoPortal, avisos?: string[]): Promise<{ valor: string; texto: string; indice: number }> {
  const b = buscadoEnNivel(v, 'modelo')
  if (!b) throw new ErrorMapaIncompletoGenerali('el modelo del vehículo de la oportunidad (el selector de Generali lo exige)', false)
  const opciones = await opcionesSelect(menu.select)
  const textos = opciones.map((o) => o.texto)
  const e = elegirModeloGenerali(textos, b.texto, b.modo)
  if (e.tipo === 'varias' || e.tipo === 'ninguna') {
    const lista = e.cercanas.length > 0 ? e.cercanas : e.tipo === 'ninguna' ? textos.filter((o) => !esOpcionVaciaCatalogo(o)).slice(0, 25) : []
    if (lista.length > 0) throw new ErrorEleccionVersion(lista.map((o): CandidatoVersion => ({ etiqueta: o, codigo: null })))
    throw new ErrorMapaIncompletoGenerali(mensajeAtascoCatalogo('modelo', b.texto, textos, { tipo: 'ninguna' }))
  }
  await ponerOpcionPrimeFaces(raiz, menu, opciones[e.indice]!, e.indice, ctx.abrirDesplegableModeloGenerali, ctx.elegirModeloListaGenerali, ctx, 'el modelo elegido en «Modelo»')
  if (e.tipo !== 'otros') return { ...opciones[e.indice]!, indice: e.indice }
  return resolverTrasOtrosModelo(raiz, menu, textos, opciones[e.indice]!, e.indice, e.supuesto, b, ctx, avisos)
}

/** Plazo para que el AJAX de «Otros modelos ...» termine (deje «Otros» puesto o recargue la lista). */
let ESPERA_TRAS_OTROS_MS = 10_000
/** «Otros» tiene que SEGUIR puesto al menos esto antes de darlo por bueno (el AJAX puede devolverlo a «Seleccione uno»). */
let ESTABLE_TRAS_OTROS_MS = 3_000
/** Solo para pruebas: acorta las esperas tras «Otros modelos ...». */
export function fijarEsperasTrasOtrosGenerali(espera: number, estable: number): void {
  ESPERA_TRAS_OTROS_MS = espera
  ESTABLE_TRAS_OTROS_MS = estable
}

/**
 * v0.2.16 (fallo real de la 0.2.15: tras «Otros modelos ...» el desplegable volvió a «Seleccione uno» y el bot paró antes de «Confirmar»).
 * Se espera al AJAX: si «Otros» queda puesto y estable → ese (supuesto declarado). Si la lista se RECARGA con modelos nuevos (la opción
 * con «...» es un «ver más»), se elige el modelo en la lista nueva por la misma regla (exacta; varias/ninguna → `eleccion`, sin pulsar) y
 * por la segunda puerta del guard (solo permitida tras «Otros»). Si ni una cosa ni otra → hueco SIN pulsar «Confirmar».
 */
async function resolverTrasOtrosModelo(
  raiz: Raiz,
  menu: MenuPrimeFaces,
  antes: readonly string[],
  otros: { valor: string; texto: string },
  indiceOtros: number,
  supuesto: string,
  b: { texto: string; modo: 'dato' | 'denominacion' },
  ctx: ContextoPortal,
  avisos?: string[],
): Promise<{ valor: string; texto: string; indice: number }> {
  const ini = Date.now()
  let ultimo = { label: '', input: '', n: antes.length }
  let puestaDesde: number | null = null
  for (;;) {
    const ops = await opcionesSelect(menu.select).catch(() => [] as { valor: string; texto: string }[])
    const m = await leerModeloMostrado(menu)
    ultimo = { label: m.label, input: m.input, n: ops.length }
    const est = estadoTrasOtrosModeloGenerali(antes, ops.map((o) => o.texto), otros.texto, m.label, m.input, b.texto, b.modo)
    const t = Date.now() - ini
    // «Estable» = puesta SIN interrupción durante la ventana (si el AJAX la devuelve a «Seleccione uno», el reloj vuelve a cero).
    puestaDesde = est.tipo === 'puesta' ? (puestaDesde ?? Date.now()) : null
    if (puestaDesde !== null && Date.now() - puestaDesde >= ESTABLE_TRAS_OTROS_MS) {
      avisos?.push(supuesto)
      return { ...otros, indice: indiceOtros }
    }
    if (est.tipo === 'ampliada') {
      const e = est.eleccion
      if (e.tipo === 'varias' || e.tipo === 'ninguna') {
        const lista = e.cercanas.length > 0 ? e.cercanas : ops.map((o) => o.texto).filter((o) => !esOpcionVaciaCatalogo(o)).slice(0, 25)
        if (lista.length > 0) throw new ErrorEleccionVersion(lista.map((o): CandidatoVersion => ({ etiqueta: o, codigo: null })))
        throw new ErrorMapaIncompletoGenerali(mensajeAtascoCatalogo('modelo', b.texto, ops.map((o) => o.texto), { tipo: 'ninguna' }))
      }
      // `otros` no llega aquí (estadoTrasOtrosModeloGenerali lo convierte en `ninguna`): unica.
      await ponerOpcionPrimeFaces(raiz, menu, ops[e.indice]!, e.indice, ctx.abrirDesplegableModeloGenerali, ctx.elegirModeloListaGenerali, ctx, 'el modelo elegido en «Modelo» (lista ampliada tras «Otros modelos»)')
      return { ...ops[e.indice]!, indice: e.indice }
    }
    if (t >= ESPERA_TRAS_OTROS_MS) break
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new ErrorMapaIncompletoGenerali(
    `lo que hace el portal tras elegir «${otros.texto.slice(0, 40)}» en «Modelo»: en ${Math.round(ESPERA_TRAS_OTROS_MS / 1000)} s ni quedó puesto ni cambió la lista ` +
      `(label=«${ultimo.label.slice(0, 60)}», input=«${ultimo.input.slice(0, 60)}», ${ultimo.n} opciones); NO se pulsa «Confirmar»`,
  )
}

// ───────────── v0.2.14: potencia · versión · tabla · «Resumen» ─────────────

/** Tabla Código | Modelo | Versión y bloque «Resumen» del selector (solo lectura; catálogo, sin datos personales). Como TEXTO (tsx y `__name`). */
const JS_FICHA_VERSION = `(() => {${JS_COMUN}
  const N = (t) => t.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toUpperCase().replace(/\\s+/g, ' ').trim();
  const filas = [];
  for (const tabla of Array.from(document.querySelectorAll('table'))) {
    const ths = Array.from(tabla.querySelectorAll('thead th, thead td, tr:first-child th')).map((x) => N(T(x)));
    const ic = ths.findIndex((x) => x === 'CODIGO');
    const iv = ths.findIndex((x) => x === 'VERSION');
    const im = ths.findIndex((x) => x === 'MODELO');
    if (ic < 0 || iv < 0 || !VIS(tabla)) continue;
    for (const tr of Array.from(tabla.querySelectorAll('tbody tr'))) {
      const tds = Array.from(tr.children).filter((x) => x.tagName === 'TD');
      if (tds.length <= Math.max(ic, iv) || !VIS(tr)) continue;
      const sel = tr.classList.contains('ui-state-highlight') || tr.getAttribute('aria-selected') === 'true';
      filas.push({ codigo: T(tds[ic]).slice(0, 40), modelo: im >= 0 && tds[im] ? T(tds[im]).slice(0, 80) : '', version: T(tds[iv]).slice(0, 200), seleccionada: sel });
      if (filas.length >= 200) break;
    }
  }
  let resumen = '';
  let mejor = Infinity;
  for (const el of Array.from(document.querySelectorAll('div,fieldset,section,table,td,span,p'))) {
    const t = T(el);
    if (!/RESUMEN/.test(N(t))) continue;
    const m = /C[oó]digo y descripci[oó]n\\s*:?\\s*(.*)$/i.exec(t);
    if (!m || t.length >= mejor) continue;
    mejor = t.length;
    resumen = m[1].trim().slice(0, 300);
  }
  return { filas, resumen };
})()`

/** Lee la ficha de versión del selector. Vacía si no se deja leer. Solo lee. */
export async function leerFichaVersion(raiz: Raiz): Promise<FichaVersionGenerali> {
  const r = (await raiz.evaluate(JS_FICHA_VERSION).catch(() => null)) as FichaVersionGenerali | null
  return { filas: Array.isArray(r?.filas) ? r!.filas : [], resumen: typeof r?.resumen === 'string' ? r!.resumen : '' }
}

const PAUSA_FICHA_MS = 500
const ESPERA_FICHA_MS = 8_000

/** Lee la ficha hasta que dos lecturas seguidas coinciden (el AJAX de PrimeFaces repinta la tabla y el resumen) o se agota la espera; con `requiereFilas` espera a que haya filas. */
export async function leerFichaEstable(page: Page, raiz: Raiz, requiereFilas: boolean, esperaMs = ESPERA_FICHA_MS): Promise<FichaVersionGenerali> {
  const ini = Date.now()
  let ant = await leerFichaVersion(raiz)
  for (;;) {
    await page.waitForTimeout(PAUSA_FICHA_MS)
    const ahora = await leerFichaVersion(raiz)
    const igual = JSON.stringify(ahora) === JSON.stringify(ant)
    if (igual && (!requiereFilas || ahora.filas.length > 0)) return ahora
    ant = ahora
    if (Date.now() - ini >= esperaMs) return ahora
  }
}

type FormFichaGenerali = FormVersionGenerali

/**
 * Potencia. Manda la elección de una persona (si es una de las potencias). v0.2.17: si no, CV ENTERO EXACTO del riesgo (163 ↔ «163.0 CV»);
 * sin dato o sin coincidencia → «No lo sé» con supuesto si el portal lo ofrece. Si no lo ofrece, la regla común de versión de 0.2.14 (CV ±10 %
 * del vehículo confirmado, equivalentes → la primera declarada, material → `ErrorEleccionVersion` con todas). PURA salvo el lanzamiento.
 */
export function decidirPotenciaGenerali(opciones: readonly string[], form: FormFichaGenerali): { texto: string; supuesto: string | null } {
  const eleccion = form.eleccionVersion?.etiqueta && opciones.some((o) => normalizarCatalogo(o) === normalizarCatalogo(form.eleccionVersion!.etiqueta!)) ? form.eleccionVersion : null
  if (!eleccion) {
    const ex = potenciaExactaGenerali(opciones, cvRiesgoGenerali(form))
    if (ex.tipo === 'exacta') return { texto: ex.texto, supuesto: null }
    if (ex.tipo === 'no_lo_se') return { texto: ex.texto, supuesto: ex.supuesto }
  }
  const conCv = opciones.filter((o) => !esOpcionNoLoSeGenerali(o))
  const r = elegirVersionAutomaticamente(
    conCv.map((o) => ({ etiqueta: o, codigo: null, datos: { cv: cvDePotenciaGenerali(o), cc: null, puertas: null, fechaInicio: null } })),
    { riesgo: referenciaRiesgoVersion(form), eleccion },
  )
  if (r.tipo === 'automatica' || r.tipo === 'unica' || r.tipo === 'bandeja') return { texto: conCv[r.indice]!, supuesto: r.supuesto }
  throw new ErrorEleccionVersion(opciones.map((o): CandidatoVersion => ({ etiqueta: o, codigo: null })))
}

/**
 * Fila de la tabla de versiones por la misma regla (etiqueta = columna «Versión», código = columna «Código»). Elección de la bandeja: exacta,
 * salvo que sea una potencia. Equivalentes → la de inicio más cercano o la primera, declarada; material → `ErrorEleccionVersion` con todas. PURA salvo el lanzamiento.
 */
export function decidirFilaVersionGenerali(filas: readonly FilaVersionGenerali[], form: FormFichaGenerali, potencias: readonly string[] = []): { fila: FilaVersionGenerali; supuesto: string | null } {
  const e = form.eleccionVersion
  const esPotencia = !!e?.etiqueta && potencias.some((o) => normalizarCatalogo(o) === normalizarCatalogo(e.etiqueta!))
  const r = elegirVersionAutomaticamente(
    filas.map((f) => ({ etiqueta: f.version, codigo: f.codigo || null, datos: datosEquivalenciaDesdeEtiqueta(f.version) })),
    { riesgo: referenciaRiesgoVersion(form), eleccion: esPotencia ? null : e },
  )
  if (r.tipo === 'automatica' || r.tipo === 'unica' || r.tipo === 'bandeja') return { fila: filas[r.indice]!, supuesto: r.supuesto }
  const op = r.tipo === 'preguntar' ? r.opciones : filas.map((f): CandidatoVersion => ({ etiqueta: f.version, codigo: f.codigo || null }))
  throw new ErrorEleccionVersion(op)
}

/**
 * v0.2.17: versión del desplegable «Versión» (con textos repetidos) por `elegirVersionDesplegableGenerali`: elección de la bandeja (salvo que
 * sea una potencia o un combustible), versión/denominación del riesgo, y si no casa, CV y combustible del riesgo. Devuelve el índice en
 * `opciones` y el supuesto; sin elección posible → `ErrorEleccionVersion` con la lista (sin repetidos). PURA salvo el lanzamiento.
 */
export function decidirVersionDesplegableGenerali(opciones: readonly string[], form: FormFichaGenerali, otrasOpciones: readonly string[] = []): { indice: number; supuesto: string | null } {
  const etq = form.eleccionVersion?.etiqueta?.trim() || null
  const persona = etq && !otrasOpciones.some((o) => normalizarCatalogo(o) === normalizarCatalogo(etq)) ? etq : null
  const v = vehiculoBuscadoGenerali(form)
  const buscado = v ? (v.tipo === 'separado' ? v.version : v.denominacion) : null
  const e = elegirVersionDesplegableGenerali(opciones, { persona, buscado, cv: cvRiesgoGenerali(form), combustible: combustibleRiesgoGenerali(form) })
  if (e.tipo === 'opcion') return { indice: e.indice, supuesto: e.supuesto }
  const unicas = [...new Set(e.candidatas)]
  throw new ErrorEleccionVersion(unicas.map((o): CandidatoVersion => ({ etiqueta: o, codigo: null })))
}

/** Lee los controles del selector hasta que dos lecturas seguidas coinciden (el AJAX de combustible/potencia recarga listas) tras un mínimo; tope `esperaMs`. Solo lee. */
async function camposSelectorEstables(page: Page, selector: Raiz, esperaMs = ESPERA_RECARGA_SELECTOR_MS): Promise<CampoSelectorGenerali[]> {
  const ini = Date.now()
  let ant = JSON.stringify(await leerCamposSelector(selector))
  for (;;) {
    await page.waitForTimeout(PAUSA_FICHA_MS)
    const ahora = await leerCamposSelector(selector)
    const t = JSON.stringify(ahora)
    if ((t === ant && Date.now() - ini >= MIN_RECARGA_SELECTOR_MS) || Date.now() - ini >= esperaMs) return ahora
    ant = t
  }
}

const ESPERA_RECARGA_SELECTOR_MS = 6_000
const MIN_RECARGA_SELECTOR_MS = 1_200
/** La versión elegida tiene que seguir puesta al menos esto (el AJAX puede devolverla a «Seleccione una»). */
const ESTABLE_VERSION_MS = 1_500

/**
 * v0.2.17: elige la versión en el desplegable «Versión» (PrimeFaces por las puertas de versión de guard.ts; un `<select>` nativo, por el
 * campo) y verifica valor Y texto (y el label de PrimeFaces) como el modelo en 0.2.16, de forma ESTABLE. Si no queda → hueco SIN «Confirmar».
 */
async function elegirVersionDesplegableSelector(page: Page, selector: Raiz, campo: CampoSelectorGenerali, form: FormFichaGenerali, otras: readonly string[], ctx: ContextoPortal, avisos?: string[]): Promise<void> {
  const pf = campo.tipo === 'desplegable'
  const select = pf ? selector.locator(`select[id="${campo.clave.replace(/"/g, '')}_input"]`) : selector.locator(`select[id="${campo.clave.replace(/"/g, '')}"]`)
  if ((await select.count().catch(() => 0)) !== 1) throw new ErrorMapaIncompletoGenerali(`el desplegable «Versión» del selector (no se localiza su <select> por «${campo.clave.slice(0, 60)}»); NO se pulsa «Confirmar»`)
  const opciones = await opcionesSelect(select)
  const d = decidirVersionDesplegableGenerali(opciones.map((o) => o.texto), form, otras)
  const elegida = opciones[d.indice]!
  const actual = await leerOpcionSeleccionada(select)
  if (!opcionPuestaPrimeFaces(actual.valor, actual.texto, elegida)) {
    if (pf) await ponerOpcionPrimeFaces(selector, { select, base: campo.clave }, elegida, d.indice, ctx.abrirDesplegableVersionGenerali, ctx.elegirVersionListaGenerali, ctx, 'la versión elegida en «Versión»', true)
    else await elegirIndice(select, d.indice, ctx)
  }
  // Verificación ESTABLE: valor + texto del select y, en PrimeFaces, el label; si el AJAX la quita, hueco sin «Confirmar».
  const ini = Date.now()
  let desde: number | null = null
  let visto = { valor: '', texto: '', label: '' }
  while (Date.now() - ini < ESTABLE_VERSION_MS + 4_000) {
    const s = await leerOpcionSeleccionada(select)
    const label = pf ? (await leerModeloMostrado({ select, base: campo.clave })).label : s.texto
    visto = { ...s, label }
    const ok = opcionPuestaPrimeFaces(s.valor, s.texto, elegida) && modeloVerificadoGenerali(elegida.texto, label, s.texto)
    desde = ok ? (desde ?? Date.now()) : null
    if (desde !== null && Date.now() - desde >= ESTABLE_VERSION_MS) {
      if (d.supuesto) avisos?.push(d.supuesto)
      return
    }
    await page.waitForTimeout(300)
  }
  throw new ErrorMapaIncompletoGenerali(`la versión no quedó seleccionada en «Versión»: label=«${visto.label.slice(0, 80)}», input=«${visto.texto.slice(0, 80)}» (esperada «${elegida.texto.slice(0, 80)}»); NO se pulsa «Confirmar»`)
}

/** Fila de la tabla Código | Modelo | Versión (0.2.14) + verificación del «Resumen» antes de avanzar. */
async function elegirFilaTablaGenerali(page: Page, selector: Raiz, ficha: FichaVersionGenerali, form: FormFichaGenerali, potencias: readonly string[], ctx: ContextoPortal, avisos?: string[]): Promise<void> {
  if (!ctx.elegirFilaVersionGenerali) throw new ErrorMapaIncompletoGenerali('la puerta guardada de la fila de versión del selector (`elegirFilaVersionGenerali`) en el contexto del runner', false)
  const v = decidirFilaVersionGenerali(ficha.filas, form, potencias)
  if (v.supuesto) avisos?.push(v.supuesto)
  await ctx.elegirFilaVersionGenerali(v.fila.codigo || null, v.fila.version)
  // «Resumen»: el código/descripción tiene que ser el de la fila elegida ANTES de avanzar (el AJAX tarda; se reintenta con espera).
  const ini = Date.now()
  let r = (await leerFichaEstable(page, selector, true, 2_500)).resumen
  while (!resumenCoincideConFilaGenerali(r, v.fila) && Date.now() - ini < 8_000) {
    await page.waitForTimeout(PAUSA_FICHA_MS)
    r = (await leerFichaVersion(selector)).resumen
  }
  if (!resumenCoincideConFilaGenerali(r, v.fila)) {
    throw new ErrorMapaIncompletoGenerali(`el «Resumen» del selector no coincide con la versión elegida (código «${v.fila.codigo.slice(0, 40)}», versión «${v.fila.version.slice(0, 80)}»; el resumen dice «${r.slice(0, 120) || '(vacío)'}»); NO se pulsa «Siguiente»`)
  }
}

/**
 * Tras el modelo: si el selector enseña combustible / Potencia / Versión / tabla, los elige EN ESE ORDEN (v0.2.17: combustible → potencia →
 * recarga → versión del desplegable con verificación estable; la tabla, si la hay, con su «Resumen») y devuelve las claves de campos que
 * explicó. `null` = no hay nada de eso (modelo con una sola versión) o hay campos que el bot no conoce: el llamador sigue como 0.2.13.
 */
async function resolverFichaVersionGenerali(page: Page, selector: Raiz, campos: readonly CampoSelectorGenerali[], nuevos: readonly CampoSelectorGenerali[], form: FormFichaGenerali, ctx: ContextoPortal, avisos?: string[]): Promise<Set<string> | null> {
  const combustible = grupoCombustibleGenerali(campos)
  const potencia0 = grupoPotenciaGenerali(campos)
  const desplegable0 = desplegableVersionGenerali(campos)
  let ficha = await leerFichaEstable(page, selector, false, 1_500)
  if (!combustible && !potencia0 && !desplegable0 && ficha.filas.length === 0) return null
  const explicados = new Set([combustible ? `grupo|${combustible.grupo}` : '', potencia0 ? `grupo|${potencia0.grupo}` : '', desplegable0?.clave ?? ''].filter((x) => x !== ''))
  const ajenos = nuevos.filter((c) => !explicados.has(c.clave))
  if (ajenos.length > 0) return null
  const otras: string[] = [...(combustible?.opciones ?? []), ...(potencia0?.opciones ?? [])]
  let actuales: readonly CampoSelectorGenerali[] = campos
  if (combustible) {
    if (!ctx.elegirCombustibleGenerali) throw new ErrorMapaIncompletoGenerali('la puerta guardada del combustible del selector (`elegirCombustibleGenerali`) en el contexto del runner', false)
    const d = decidirCombustibleGenerali(combustible.opciones, combustibleRiesgoGenerali(form))
    if (d.tipo === 'sin_opcion') throw new ErrorMapaIncompletoGenerali(`el combustible del selector de vehículos: ${d.motivo}; NO se pulsa «Confirmar»`, false)
    if (d.supuesto) avisos?.push(d.supuesto)
    await ctx.elegirCombustibleGenerali(combustible.grupo, d.texto)
    // El combustible puede recargar por AJAX las potencias y las versiones: se releen estables.
    actuales = await camposSelectorEstables(page, selector)
  }
  const potencia = combustible ? grupoPotenciaGenerali(actuales) ?? potencia0 : potencia0
  if (potencia) {
    if (!ctx.elegirPotenciaGenerali) throw new ErrorMapaIncompletoGenerali('la puerta guardada de la potencia del selector (`elegirPotenciaGenerali`) en el contexto del runner', false)
    const p = decidirPotenciaGenerali(potencia.opciones, form)
    if (p.supuesto) avisos?.push(p.supuesto)
    await ctx.elegirPotenciaGenerali(potencia.grupo, p.texto)
    otras.push(...potencia.opciones)
    explicados.add(`grupo|${potencia.grupo}`)
  }
  if (desplegable0) {
    // v0.2.17: la potencia puede filtrar la lista de versiones por AJAX: se espera a que se estabilice antes de elegir.
    if (potencia || combustible) actuales = await camposSelectorEstables(page, selector)
    const desplegable = desplegableVersionGenerali(actuales) ?? desplegable0
    explicados.add(desplegable.clave)
    const reales = desplegable.opciones.filter((o) => !esOpcionVaciaCatalogo(o))
    if (reales.length === 0) {
      await recorrerScroll(page, selector)
      throw new ErrorMapaIncompletoGenerali(`las opciones del desplegable «Versión» tras elegir combustible y potencia (está vacío; no se pulsa «Confirmar»). Campos vistos: ${resumenCamposSelectorGenerali(await leerCamposSelector(selector))}`)
    }
    await elegirVersionDesplegableSelector(page, selector, desplegable, form, otras, ctx, avisos)
    ficha = await leerFichaEstable(page, selector, false, 2_500)
    if (ficha.filas.length > 0 && !ficha.filas.some((f) => f.seleccionada)) await elegirFilaTablaGenerali(page, selector, ficha, form, potencia?.opciones ?? [], ctx, avisos)
    return explicados
  }
  if (potencia) ficha = await leerFichaEstable(page, selector, true)
  else if (ficha.filas.length === 0) ficha = await leerFichaEstable(page, selector, true, 4_000)
  if (ficha.filas.length === 0) {
    await recorrerScroll(page, selector)
    throw new ErrorMapaIncompletoGenerali(`la tabla de versiones (Código | Modelo | Versión) del selector de vehículos tras elegir la potencia (no hay filas; no se pulsa «Siguiente»). Campos vistos: ${resumenCamposSelectorGenerali(await leerCamposSelector(selector))}`)
  }
  await elegirFilaTablaGenerali(page, selector, ficha, form, potencia?.opciones ?? [], ctx, avisos)
  return explicados
}

// ───────────── v0.2.13: verificación del modelo antes de «Confirmar» y espera clasificada después ─────────────

/** El modelo está de verdad elegido cuando el label del SelectOneMenu Y la opción seleccionada del `<select>` oculto dicen el elegido (normalizado). */
export function modeloVerificadoGenerali(esperado: string, label: string, input: string): boolean {
  const e = normalizarCatalogo(esperado)
  return e !== '' && normalizarCatalogo(label) === e && normalizarCatalogo(input) === e
}

/** Lo que muestran hoy el label y el `<select>` oculto (texto de la opción seleccionada) del SelectOneMenu. Solo lee. */
async function leerModeloMostrado(menu: MenuPrimeFaces): Promise<{ label: string; input: string }> {
  const input = await menu.select.evaluate((el) => {
    const s = el as HTMLSelectElement
    return (s.selectedOptions[0]?.textContent ?? '').trim()
  }).catch(() => '')
  const label = await menu.select.evaluate((el, b) => (document.getElementById(`${b}_label`)?.textContent ?? '').trim(), menu.base).catch(() => '')
  return { label, input }
}

const ESPERA_AJAX_MODELO_MS = 2_500

/**
 * Antes de «Confirmar»: el modelo elegido debe verse en el label Y en el `<select>` oculto. Si no casa, UN reintento: espera a que el panel AJAX
 * termine, vuelve a localizar el menú y repone la opción por el select oculto (+ change). Si sigue sin casar → hueco, SIN pulsar «Confirmar».
 */
export async function verificarModeloAntesDeConfirmar(page: Page, selector: Raiz, menu: MenuPrimeFaces, baseMarca: string, elegida: { valor: string; texto: string; indice: number }): Promise<void> {
  let m = await leerModeloMostrado(menu)
  if (modeloVerificadoGenerali(elegida.texto, m.label, m.input)) return
  await page.waitForTimeout(ESPERA_AJAX_MODELO_MS)
  const de = await esperarMenuModelo(page, selector, baseMarca, 6_000)
  const m2 = de ?? menu
  const ops = await opcionesSelect(m2.select).catch(() => [])
  const idx = ops.findIndex((o) => normalizarCatalogo(o.texto) === normalizarCatalogo(elegida.texto))
  if (idx >= 0) {
    await comprobarCampo(m2.select)
    await m2.select.selectOption({ index: idx }, { force: true }).catch(() => undefined)
    await m2.select.dispatchEvent('change').catch(() => undefined)
    await page.waitForTimeout(ESPERA_AJAX_MODELO_MS)
  }
  m = await leerModeloMostrado(de ?? menu)
  if (modeloVerificadoGenerali(elegida.texto, m.label, m.input)) return
  throw new ErrorMapaIncompletoGenerali(`el modelo no quedó seleccionado: label=«${m.label.slice(0, 80)}», input=«${m.input.slice(0, 80)}» (esperado «${elegida.texto.slice(0, 80)}»); NO se pulsa «Confirmar»`)
}

export type EstadoPostConfirmar = { identificacion: boolean; selectorAbierto: boolean; mensajes: string[]; transcurridoMs: number; esperaMs: number }
/** Gracia mínima con el selector abierto antes de dar por buenos unos mensajes de validación (el portal puede pintarlos y limpiarlos). */
const GRACIA_MENSAJES_MS = 4_000
let ESPERA_POST_CONFIRMAR_MS = 25_000
/** Solo para pruebas: acorta la espera posterior a «Confirmar» (en producción son 25 s). */
export function fijarEsperaPostConfirmarGenerali(ms: number): void {
  ESPERA_POST_CONFIRMAR_MS = ms
}

/**
 * Clasifica lo visto tras «Confirmar»: `siguiente` (Identificación del vehículo y el selector cerrado), `validacion` (selector abierto con
 * mensajes tras la gracia, o agotada la espera con el selector abierto), `desconocida` (agotada la espera, selector cerrado y sin Identificación),
 * `esperar` (aún dentro del plazo).
 */
export function clasificarPostConfirmarGenerali(e: EstadoPostConfirmar): 'siguiente' | 'validacion' | 'desconocida' | 'esperar' {
  if (e.identificacion && !e.selectorAbierto) return 'siguiente'
  if (e.selectorAbierto && e.mensajes.length > 0 && e.transcurridoMs >= GRACIA_MENSAJES_MS) return 'validacion'
  if (e.transcurridoMs < e.esperaMs) return 'esperar'
  return e.selectorAbierto ? 'validacion' : 'desconocida'
}

const JS_MENSAJES_VALIDACION = `(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const out = [];
  for (const el of Array.from(document.querySelectorAll('.ui-messages-error, .ui-messages-warn, .ui-messages li, .ui-message-error, .ui-growl-message, .ui-growl-item'))) {
    if (!vis(el)) continue;
    const t = (el.textContent || '').replace(/\\s+/g, ' ').trim();
    if (t && !out.includes(t)) out.push(t.slice(0, 200));
  }
  return out;
})()`

/** ¿Sigue abierto el selector (marco no desprendido y con «Confirmar» visible)? Y los mensajes de validación visibles de TODOS los marcos. Solo lee. */
async function leerEstadoPostConfirmar(page: Page, selector: Raiz): Promise<{ selectorAbierto: boolean; mensajes: string[] }> {
  let selectorAbierto = false
  if (!('isDetached' in selector && selector.isDetached())) {
    selectorAbierto = (await selector.getByRole('button', { name: /^(Confirmar|Siguiente)$/ }).filter({ visible: true }).count().catch(() => 0)) > 0
  }
  const mensajes: string[] = []
  for (const f of page.frames()) {
    if (f.isDetached()) continue
    for (const t of ((await f.evaluate(JS_MENSAJES_VALIDACION).catch(() => [])) as string[])) if (!mensajes.includes(t)) mensajes.push(t)
  }
  return { selectorAbierto, mensajes: mensajes.slice(0, 8) }
}

/** Espera (hasta `esperaMs`) a que el portal cierre el selector o lo valide. `true` = Identificación del vehículo; si no, hueco con el motivo. */
export async function esperarTrasConfirmarGenerali(page: Page, selector: Raiz, esperaMs?: number): Promise<void> {
  const ini = Date.now()
  esperaMs ??= ESPERA_POST_CONFIRMAR_MS
  for (;;) {
    const { selectorAbierto, mensajes } = await leerEstadoPostConfirmar(page, selector)
    const identificacion = (await marcoConTexto(page, 'Identificación del vehículo', 0)) !== null
    const transcurridoMs = Date.now() - ini
    const c = clasificarPostConfirmarGenerali({ identificacion, selectorAbierto, mensajes, transcurridoMs, esperaMs })
    if (c === 'siguiente') return
    if (c !== 'esperar') {
      // El inventario de TODOS los marcos lo toma el runner al parar con este hueco: es justo después de esta lectura, al FINAL de la espera.
      const botones: string[] = []
      const marcos: string[] = []
      for (const f of page.frames()) if (!f.isDetached()) {
        marcos.push(rutaSinQuery(f.url()) || '(vacío)')
        botones.push(...(await leerPantalla(f).catch(() => ({ botones: [] as string[] }))).botones)
      }
      const b = [...new Set(botones)].join(' · ').slice(0, 600) || '(ninguno)'
      const m = marcos.join(' | ').slice(0, 400)
      if (c === 'validacion') {
        throw new ErrorMapaIncompletoGenerali(`la pantalla que sigue a «Confirmar» en el selector de vehículos: el selector SIGUE ABIERTO tras ${Math.round(transcurridoMs / 1000)} s y el portal no lo validó. Mensajes de validación visibles: ${mensajes.length > 0 ? mensajes.map((x) => `«${x}»`).join(' · ') : '(ninguno visible)'}. Botones vistos: ${b}. Marcos: ${m}`)
      }
      throw new ErrorMapaIncompletoGenerali(`la pantalla que sigue a «Confirmar» en el selector de vehículos (no es «Identificación del vehículo»; el selector se cerró pero no apareció tras ${Math.round(transcurridoMs / 1000)} s; su captura y su inventario los deja el runner). Botones vistos: ${b}. Marcos: ${m}`)
    }
    await page.waitForTimeout(500)
  }
}

/**
 * Selector PrimeFaces: «Placas especiales» = «No», marca exacta, «Confirmar» (solo confirma el vehículo) y se PARA con hueco
 * `hueco_mapa` si la pantalla siguiente no es «Identificación del vehículo»: su inventario lo captura el modo exploración.
 */
async function seleccionarVehiculoPrimeFaces(page: Page, selector: Raiz, menu: MenuPrimeFaces, v: VehiculoBuscado, form: FormFichaGenerali, ctx: ContextoPortal, avisos?: string[]): Promise<boolean> {
  if (!ctx.marcarPlacasEspecialesGenerali || !ctx.confirmarVehiculoGenerali || !ctx.abrirDesplegableMarcaGenerali || !ctx.elegirMarcaListaGenerali) throw new ErrorMapaIncompletoGenerali('las puertas guardadas del selector de vehículos (placas especiales, desplegable de marcas y «Confirmar») en el contexto del runner', false)
  if (!ctx.abrirDesplegableModeloGenerali || !ctx.elegirModeloListaGenerali) throw new ErrorMapaIncompletoGenerali('las puertas guardadas del desplegable de modelos (disparador y `li`) en el contexto del runner', false)
  await ctx.marcarPlacasEspecialesGenerali()
  // Lo que hay ANTES de elegir marca: lo que aparezca después y no sea el menú de modelos es campo NUEVO.
  const antes = (await leerCamposSelector(selector)).map((c) => c.clave)
  await elegirMarcaPrimeFaces(selector, menu, v, ctx)
  const modelo = await esperarMenuModelo(page, selector, menu.base)
  if (!modelo) throw new ErrorMapaIncompletoGenerali(`el desplegable «Modelo» del selector de vehículos tras elegir la marca (no apareció en ${Math.round(ESPERA_MODELO_MS / 1000)} s). Campos vistos: ${resumenCamposSelectorGenerali(await leerCamposSelector(selector))}`)
  const elegida = await elegirModeloPrimeFaces(selector, modelo, v, ctx, avisos)
  await page.waitForTimeout(PAUSA_CAMPOS_NUEVOS_MS)
  const nuevos = camposNuevosSelectorGenerali(antes, await leerCamposSelector(selector), [menu.base, modelo.base])
  // v0.2.14: Potencia / Versión / tabla: se eligen y se verifica el «Resumen»; luego se avanza. Si no hay nada de eso (una sola versión) o hay campos ajenos, como antes.
  const explicados = await resolverFichaVersionGenerali(page, selector, await leerCamposSelector(selector), nuevos, form, ctx, avisos)
  if (explicados) {
    // v0.2.17: validación final previa a «Confirmar»: si tras combustible/potencia/versión queda un campo nuevo sin mapear, se PARA.
    const restantes = camposNuevosSelectorGenerali(antes, await leerCamposSelector(selector), [menu.base, modelo.base]).filter((c) => !explicados.has(c.clave))
    if (restantes.length > 0) {
      await recorrerScroll(page, selector)
      const p = await leerPantalla(selector)
      throw new ErrorMapaIncompletoGenerali(`los campos nuevos que salen en el selector de vehículos tras elegir combustible, potencia y versión (no se pulsa «Confirmar»): ${resumenCamposSelectorGenerali(restantes)}. Botones vistos: ${p.botones.join(' · ').slice(0, 400) || '(ninguno)'}`)
    }
    await verificarModeloAntesDeConfirmar(page, selector, modelo, menu.base, elegida)
    await ctx.confirmarVehiculoGenerali()
    await esperarTrasConfirmarGenerali(page, selector)
    return false
  }
  if (nuevos.length > 0) {
    // NO se pulsa «Confirmar»: campos que el bot no conoce. Se baja el scroll del selector (la evidencia del runner sale de ahí) y se PARA.
    await recorrerScroll(page, selector)
    const p = await leerPantalla(selector)
    throw new ErrorMapaIncompletoGenerali(`los campos nuevos que salen en el selector de vehículos tras elegir marca y modelo (no se pulsa «Confirmar»): ${resumenCamposSelectorGenerali(nuevos)}. Botones vistos: ${p.botones.join(' · ').slice(0, 400) || '(ninguno)'}`)
  }
  await verificarModeloAntesDeConfirmar(page, selector, modelo, menu.base, elegida)
  await ctx.confirmarVehiculoGenerali()
  await esperarTrasConfirmarGenerali(page, selector)
  return false
}

/**
 * «Vehículo» → «Selector de vehículos» (captura 5): tipo «Turismo» y subtipo «Turismos» vienen marcados; la marca, en «Todas
 * las marcas». Modelo y versión: SIN captura; se buscan como desplegables etiquetados «Modelo»/«Versión» y, si no están así,
 * PARA con inventario. Devuelve si alguna elección fue por similitud.
 */
export async function seleccionarVehiculoGenerali(page: Page, marco: Raiz, form: FormularioAuto, ctx: ContextoPortal, avisos?: string[]): Promise<boolean> {
  const v = vehiculoBuscadoGenerali(form)
  if (!v) throw new ErrorTarificador('datos', 'generali/auto: falta el vehículo confirmado por Allianz o Mapfre (Generali no busca por matrícula; asegura lo pone desde la oportunidad)')
  const boton = marco.getByRole('button', { name: 'Vehículo', exact: true }).filter({ visible: true })
  if ((await boton.count()) !== 1) throw new ErrorMapaIncompletoGenerali('el botón «Vehículo» de «Características del vehículo» (captura 4)')
  await ctx.pulsar(boton.first())
  const selector = await marcoConTexto(page, 'Selector de vehículos')
  if (!selector) throw new ErrorMapaIncompletoGenerali('la pantalla «Selector de vehículos» tras pulsar «Vehículo» (captura 5)')
  // v0.2.6: el selector real es PrimeFaces (select oculto + div combobox): ese camino NO busca modelo/versión (sin captura).
  const menuMarcas = await menuPrimeFaces(selector, 'Todas las marcas')
  if (menuMarcas) return seleccionarVehiculoPrimeFaces(page, selector, menuMarcas, v, form, ctx, avisos)
  const marcas = await controlJuntoA(selector, 'Todas las marcas', 'select', ctx.formador)
  if (!marcas || !(await esSelectNativo(marcas))) throw new ErrorMapaIncompletoGenerali(`el desplegable «Todas las marcas» del selector (captura 5; ¿no es un <select> nativo?). Desplegables vistos: ${await describirSelects(selector)}`)
  let similitud = await elegirNivel(marcas, 'marca', v, form, ctx)
  await page.waitForTimeout(1_500)
  const modelo = await selectPorEtiqueta(selector, /^\s*modelos?\s*:?\s*$/i)
  if (!modelo) throw new ErrorMapaIncompletoGenerali(`la pantalla del selector tras elegir la marca (modelo y versión): SIN CAPTURA; no hay un desplegable «Modelo». Desplegables vistos: ${await describirSelects(selector)}`)
  similitud = (await elegirNivel(modelo, 'modelo', v, form, ctx)) || similitud
  await page.waitForTimeout(1_500)
  const version = await selectPorEtiqueta(selector, /^\s*versi[oó]n(es)?\s*:?\s*$/i)
  if (!version) throw new ErrorMapaIncompletoGenerali(`el desplegable de versión del selector tras elegir el modelo: SIN CAPTURA; no hay un desplegable «Versión». Desplegables vistos: ${await describirSelects(selector)}`)
  similitud = (await elegirNivel(version, 'version', v, form, ctx, avisos)) || similitud
  const valoracion = await marcoConTexto(page, 'Identificación del vehículo', 10_000)
  if (!valoracion) {
    const p = await leerPantalla(selector)
    throw new ErrorMapaIncompletoGenerali(`cómo se confirma el vehículo elegido en el selector (sin captura del paso que lleva a «Identificación del vehículo»). Botones vistos: ${p.botones.join(' · ').slice(0, 600) || '(ninguno)'}`)
  }
  return similitud
}

// ───────────────────────── 6 · Datos de Valoración ─────────────────────────

/** Rellena «Identificación del vehículo» y comprueba «Roles» (captura 6). Devuelve las etiquetas de lo SUPUESTO. */
export async function rellenarValoracionGenerali(page: Page, form: FormularioAuto, ctx: ContextoPortal, hoy: Date): Promise<string[]> {
  const marco = await marcoConTexto(page, 'Identificación del vehículo')
  if (!marco) throw new ErrorMapaIncompletoGenerali('la sección «Identificación del vehículo» (captura 6)')
  const supuestos: string[] = []
  const m = matriculaGenerali(form.matricula)
  if (!m.ok) throw new ErrorTarificador('datos', m.motivo)
  if (m.formato === 'provincial') supuestos.push(AVISO_MATRICULA_PROVINCIAL)
  const campoMat = await controlJuntoA(marco, ETIQUETAS_VALORACION.matricula, 'input', ctx.formador)
  if (!campoMat) throw new ErrorMapaIncompletoGenerali(`el campo «${ETIQUETAS_VALORACION.matricula}» (captura 6)`)
  await escribir(campoMat, m.valor, ctx)
  // Verificación (Alberto): si el portal la pide, la MISMA matrícula otra vez. La captura 6 tiene UN solo campo: es OPCIONAL
  // (0 → se sigue; 1 → se rellena; >1 → para). Si no está, se vuelve a mirar tras una espera corta (puede pintarse al salir).
  const buscarVerificacion = async (): Promise<Locator[]> => {
    const textos = marco.getByText(/matr[ií]cula/i).filter({ visible: true })
    const out: Locator[] = []
    for (let i = 0; i < (await textos.count().catch(() => 0)); i++) {
      const t = (await textos.nth(i).innerText().catch(() => '')).trim()
      if (esEtiquetaVerificacionMatricula(t)) out.push(textos.nth(i).locator("xpath=following::input[not(@type='hidden')][1]"))
    }
    return out
  }
  let verif = await buscarVerificacion()
  if (verif.length === 0) {
    await page.waitForTimeout(ESPERA_VERIFICACION_MS)
    verif = await buscarVerificacion()
  }
  const dv = decidirVerificacionMatricula(verif.length)
  if (dv.tipo === 'parar') throw new ErrorMapaIncompletoGenerali(dv.motivo)
  if (dv.tipo === 'rellenar') await escribir(verif[0]!, m.valor, ctx)

  const uso = await controlJuntoA(marco, ETIQUETAS_VALORACION.uso, 'select', ctx.formador)
  if (!uso) throw new ErrorMapaIncompletoGenerali(`el desplegable «${ETIQUETAS_VALORACION.uso}» (captura 6)`)
  const opUso = (await opcionesSelect(uso)).map((o) => o.texto)
  const dUso = decidirUsoGenerali(opUso, form.usoVehiculo, form.usoFrecuencia)
  const eUso = dUso.eleccion
  if (eUso.tipo !== 'unica') throw new ErrorMapaIncompletoGenerali(`la opción de «${ETIQUETAS_VALORACION.uso}» para el uso particular (${eUso.tipo === 'varias' ? `${eUso.indices.length} casan` : 'ninguna casa'}): ${opUso.filter((o) => !esOpcionVaciaCatalogo(o)).join(' | ').slice(0, 600)}`)
  await elegirIndice(uso, eUso.indice, ctx)
  if (dUso.supuesto) supuestos.push(dUso.supuesto)

  const s = supuestosAuto(form, hoy)
  const garaje = await controlJuntoA(marco, ETIQUETAS_VALORACION.garaje, 'select', ctx.formador)
  if (!garaje) throw new ErrorMapaIncompletoGenerali(`el desplegable «${ETIQUETAS_VALORACION.garaje}» (captura 6)`)
  const opGaraje = (await opcionesSelect(garaje)).map((o) => o.texto)
  const eGaraje = elegirGarajeGenerali(opGaraje, s.garaje.valor ?? 'colectivo')
  if (eGaraje.tipo !== 'unica') throw new ErrorMapaIncompletoGenerali(`la opción de «${ETIQUETAS_VALORACION.garaje}» para «${s.garaje.valor}»: ${opGaraje.join(' | ').slice(0, 600)}`)
  await elegirIndice(garaje, eGaraje.indice, ctx)
  if (s.garaje.supuesto && s.garaje.etiqueta) supuestos.push(s.garaje.etiqueta)

  const fecha = await controlJuntoA(marco, ETIQUETAS_VALORACION.fechaPrimeraMatriculacion, 'input', ctx.formador)
  if (!fecha) throw new ErrorMapaIncompletoGenerali(`el campo «${ETIQUETAS_VALORACION.fechaPrimeraMatriculacion}» (captura 6)`)
  // 0.2.15 (21/10/2026): sin la real, la ESTIMADA por la serie de la matrícula (`fechaMatriculacionEstimada`, solo la lee Generali) y se declara.
  const fm = fechaGenerali(form.fechaMatriculacion ?? form.fechaMatriculacionEstimada ?? null)
  if (fm) {
    await escribir(fecha, fm, ctx)
    if (!form.fechaMatriculacion) supuestos.push('Fecha de 1.ª matriculación estimada por la serie de la matrícula')
  }
  else if ((await fecha.inputValue().catch(() => '')).trim() === '') throw new ErrorTarificador('datos', 'generali/auto: Generali pide la fecha de 1ª matriculación y el riesgo no la trae')

  const roles = rolesGenerali(form)
  if (!roles.ok) throw new ErrorMapaIncompletoGenerali(roles.hueco, false)
  supuestos.push(...roles.supuestos)
  return supuestos
}

// ───────────────────────── 7 · resto de «Datos de Valoración» + «Garantías y Resultados» (v0.2.0) ─────────────────────────

const TIPOS_TEXTO = new Set(['text', 'tel', 'number', 'date', 'search', ''])

/**
 * Mapa PROVISIONAL de tomador/conductor/antecedentes (`ETIQUETAS_RIESGO_GENERALI`): para cada campo de TEXTO registrado cuya
 * etiqueta casa EXACTA con una clave, VACÍO, editable y único para esa clave, teclea el dato del riesgo (antecedentes: dato o
 * supuesto favorable ya declarado). Sin respaldo de IA (no se adivina un campo sin captura). Devuelve las claves rellenadas.
 */
export async function rellenarMapaProvisionalGenerali(
  marco: Raiz,
  pantalla: PantallaLeida,
  form: Parameters<typeof valorRiesgoGenerali>[1],
  ctx: ContextoPortal,
): Promise<string[]> {
  const porClave = new Map<string, { etiqueta: string; editable: boolean; vacio: boolean }[]>()
  for (const c of pantalla.campos) {
    const k = claveEtiquetaRiesgoGenerali(c.etiqueta)
    if (!k) continue
    const tipo = c.tipo.split(',')[0]!
    const lista = porClave.get(k) ?? []
    lista.push({ etiqueta: c.etiqueta, editable: TIPOS_TEXTO.has(tipo) && !c.tipo.includes(',ro'), vacio: c.valor === 'vacío' })
    porClave.set(k, lista)
  }
  const hechos: string[] = []
  for (const [k, lista] of porClave) {
    if (lista.length !== 1 || !lista[0]!.editable || !lista[0]!.vacio) continue
    const valor = valorRiesgoGenerali(k as Parameters<typeof valorRiesgoGenerali>[0], form)
    if (valor === null) continue
    const campo = await controlJuntoA(marco, lista[0]!.etiqueta, 'input')
    if (!campo) continue
    if ((await campo.inputValue().catch(() => 'x')).trim() !== '') continue
    await escribir(campo, valor, ctx)
    hechos.push(k)
  }
  return hechos
}

/** Controles del bloque de personas (ids `reg1063A_personas_*`) y rótulos de botones/enlaces afines. Sin valores. Sin funciones con nombre (tsx). */
const JS_PERSONAS = `(() => {
  const out = [];
  const visible = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  document.querySelectorAll('input[id^="${PREFIJO_ID_PERSONAS_GENERALI}"], select[id^="${PREFIJO_ID_PERSONAS_GENERALI}"], textarea[id^="${PREFIJO_ID_PERSONAS_GENERALI}"], button[id^="${PREFIJO_ID_PERSONAS_GENERALI}"], a[id^="${PREFIJO_ID_PERSONAS_GENERALI}"]').forEach((e) => {
    const tag = e.tagName.toLowerCase();
    const tipo = tag === 'select' ? 'select' : (e.getAttribute('type') || 'text').toLowerCase();
    const boton = ['button', 'submit', 'image'].includes(tipo) || tag === 'a' || tag === 'button';
    const o = { id: e.id, tag, tipo, visible: visible(e), habilitado: !e.disabled, editable: !e.disabled && !e.readOnly, vacio: boton ? false : String(e.value || '').trim() === '' };
    if (boton) o.texto = String(e.value || e.textContent || e.title || '').replace(/\\s+/g, ' ').trim().slice(0, 60);
    if (tag === 'input' && (tipo === 'checkbox' || tipo.indexOf('rad') === 0)) o.marcado = !!e.checked;
    if (tag === 'select' && e.id.indexOf('_roles_') > -1 && e.selectedIndex >= 0) o.opcion = String(e.options[e.selectedIndex].text || '').replace(/\\s+/g, ' ').trim().slice(0, 30);
    out.push(o);
  });
  return out.slice(0, 90);
})()`

/** Lee los controles del bloque de personas en la raíz (todos sus marcos si es una página). Solo lee. */
export async function leerPersonasGenerali(raiz: Raiz): Promise<ControlPersonasGenerali[]> {
  const marcos: Frame[] = 'frames' in raiz && typeof raiz.frames === 'function' ? (raiz as Page).frames() : [raiz as Frame]
  const out: ControlPersonasGenerali[] = []
  for (const f of marcos) {
    if (f.isDetached()) continue
    out.push(...(((await f.evaluate(JS_PERSONAS).catch(() => [])) as ControlPersonasGenerali[]) ?? []))
  }
  return out
}

/** Controles de texto del tomador con ese id y, de ellos, los visibles. */
const idInteresado = (campo: string) => `[id="${PREFIJO_ID_INTERESADO_GENERALI}${campo}"]`

/**
 * v0.2.21 · La pestaña «Personas» (no tiene id en el inventario: puede ser botón, pestaña, enlace, `input[value]` o un `li/span` con onclick).
 * Estrategias en orden; vale la primera con EXACTAMENTE un control visible. Solo localiza (la pulsación va por `ctx.pulsar`).
 */
export async function localizarPestanaPersonasGenerali(marco: Raiz): Promise<{ control: Locator | null; hallados: string }> {
  const t = PESTANA_PERSONAS_GENERALI
  const estrategias: [string, Locator][] = [
    ['boton', marco.getByRole('button', { name: t, exact: true })],
    ['pestana', marco.getByRole('tab', { name: t, exact: true })],
    ['enlace', marco.getByRole('link', { name: t, exact: true })],
    ['input', marco.locator(`input[type=button][value="${t}"], input[type=submit][value="${t}"]`)],
    ['texto', marco.getByText(t, { exact: true })],
  ]
  const cuentas: string[] = []
  for (const [nombre, l] of estrategias) {
    const v = l.filter({ visible: true })
    const n = await v.count().catch(() => 0)
    cuentas.push(`${nombre}:${n}`)
    if (n === 1) return { control: v.first(), hallados: cuentas.join(',') }
  }
  return { control: null, hallados: cuentas.join(',') }
}

/**
 * Rellena el «Interesado / Tomador» por sus ids reales: solo campos visibles, habilitados, editables y VACÍOS, con el dato que trae el
 * riesgo. Sin tomador en el portal «Garantías y Resultados» no calcula. v0.2.20: si los campos EXISTEN pero están ocultos (cuelgan de la
 * pestaña «Personas»), pulsa esa pestaña UNA vez por `ctx.pulsar` (solo cambia de vista) y reintenta. v0.2.21: la pestaña se busca con
 * varias estrategias y cada campo omitido deja su motivo en `omitidos` (`campo:motivo`, sin valores). Devuelve lo hecho (nombres, no valores).
 */
export async function rellenarInteresadoGenerali(marco: Raiz, form: Parameters<typeof camposInteresadoGenerali>[0], ctx: ContextoPortal, omitidos: string[] = []): Promise<string[]> {
  const hechos: string[] = []
  const campos = camposInteresadoGenerali(form)
  let pestanaIntentada = false
  for (const { campo, valor } of campos) {
    const todos = await marco.locator(idInteresado(campo)).count().catch(() => 0)
    let loc = marco.locator(idInteresado(campo)).filter({ visible: true })
    if ((await loc.count().catch(() => 0)) === 0 && todos === 1 && !pestanaIntentada) {
      pestanaIntentada = true
      const { control, hallados } = await localizarPestanaPersonasGenerali(marco)
      if (control) {
        await ctx.pulsar(control)
        await new Promise((r) => setTimeout(r, 600))
        hechos.push('pestana.personas')
        loc = marco.locator(idInteresado(campo)).filter({ visible: true })
      } else {
        omitidos.push(`pestana:no_hallada(${hallados})`)
      }
    }
    const n = await loc.count().catch(() => 0)
    if (n !== 1) {
      omitidos.push(`${campo}:${todos === 0 ? 'no_existe' : n === 0 ? 'oculto' : 'varios'}`)
      continue
    }
    const el = loc.first()
    if (!(await el.isEnabled().catch(() => false))) {
      omitidos.push(`${campo}:deshabilitado`)
      continue
    }
    if (!(await el.isEditable().catch(() => false))) {
      omitidos.push(`${campo}:solo_lectura`)
      continue
    }
    if ((await el.inputValue().catch(() => 'x')).trim() !== '') {
      omitidos.push(`${campo}:con_valor`)
      continue
    }
    await escribir(el, valor, ctx)
    hechos.push(`tomador.${campo}`)
    // El portal puede autorrellenar o recargar el bloque al salir del NIF.
    if (campo === 'nifcif') await new Promise((r) => setTimeout(r, 800))
  }
  return hechos
}

// ───────────────────────── v0.2.22 · «Personas»: buscar y elegir la persona del tomador ─────────────────────────

/** Controles visibles de lo que abrió «Personas» (sin valores; los rótulos de celdas de resultados NO salen: pueden ser nombres). Sin funciones con nombre (tsx). */
const JS_CONTROLES_ABIERTO = `(() => {
  const vis = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const out = [];
  document.querySelectorAll('input,select,textarea,button,a,img[onclick],th').forEach((e) => {
    if (!vis(e)) return;
    const tag = e.tagName.toLowerCase();
    if (tag === 'th') { out.push({ tag: 'th', tipo: 'th', id: '', rotulo: String(e.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 30), ro: false }); return; }
    const tipo = tag === 'select' || tag === 'textarea' || tag === 'img' ? tag : (e.getAttribute('type') || (tag === 'input' ? 'text' : tag)).toLowerCase();
    if (tipo === 'hidden') return;
    const boton = tag === 'button' || tag === 'a' || tag === 'img' || ['button', 'submit', 'image', 'reset'].indexOf(tipo) > -1;
    const enCelda = !!e.closest('td');
    let rot = '';
    let extra = '';
    if (!enCelda) {
      if (boton) {
        const im = e.querySelector ? e.querySelector('img') : null;
        rot = e.value || e.textContent || e.title || e.getAttribute('alt') || e.getAttribute('aria-label') || (im ? (im.getAttribute('alt') || im.title || '') : '') || '';
        const oc = String(e.getAttribute('onclick') || '').replace(/\\s+/g, ' ').trim();
        const fn = oc.match(/[A-Za-z_$][\\w$]*\\(/);
        extra = tag === 'input' ? '' : (e.title ? 't=' + String(e.title).slice(0, 25) + ' ' : '') + (im ? 'img ' : '') + (fn ? 'oc=' + fn[0] + ' ' : '') + (tag === 'a' && e.className ? 'c=' + String(e.className).slice(0, 25) + ' ' : '') + (tag === 'a' && e.parentElement && e.parentElement.className ? 'pc=' + String(e.parentElement.className).slice(0, 20) : '');
      } else { const l = e.labels && e.labels[0]; rot = (l ? l.textContent : '') || e.getAttribute('placeholder') || e.title || ''; }
    }
    out.push({ tag: tag, tipo: tipo, id: String(e.id || '').slice(0, 60), rotulo: (String(rot).replace(/\\s+/g, ' ').trim() + (extra.trim() ? ' {' + extra.trim() + '}' : '')).slice(0, 90), ro: !!(e.disabled || e.readOnly) });
  });
  const filas = Array.from(document.querySelectorAll('tr')).filter((tr) => vis(tr) && tr.querySelector('td')).length;
  return { controles: out.slice(0, 80), filas: filas };
})()`

const SEL_CAMPO_TEXTO = 'input:not([type]), input[type=text], input[type=search], input[type=number]'
const SEL_ACCION = 'input[type=button], input[type=submit], input[type=image], button, a, img[onclick]'
const RE_DOCUMENTO_CAMPO = /nif|cif|docum|identif|\bdni\b|\bnie\b/i
const RE_PERSONA_CAMPO = /nombre|apell/i
const RE_DOC_PARECE = /^(?:[XYZ]?\d{7,8}[A-Z]|[A-Z]\d{7}[A-Z0-9])$/
const ESPERA_ABRIR_PERSONAS_MS = 15_000
const ESPERA_RESULTADOS_PERSONAS_MS = 7_000
const ESPERA_VUELTA_PERSONAS_MS = 8_000
const pausaMs = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

type RamaPersonas = 'ventana' | 'marco' | 'capa'
type RaizAbierta = { rama: RamaPersonas; marco: Frame; nuevo: boolean }
type Buscador = { marco: Frame; documento: Locator; buscar: Locator }
type Hallazgo = { tipo: 'buscador'; b: Buscador; rama: RamaPersonas } | { tipo: 'alta'; rama: RamaPersonas }
type FilaPersonas = { loc: Locator; celdas: string[]; controles: string[]; onclick: boolean }

const paginaDe = (r: Raiz): Page => (typeof (r as Frame).page === 'function' ? (r as Frame).page() : (r as Page))

async function rotuloDe(l: Locator): Promise<string> {
  return normalizarRotuloGenerali(await l.evaluate((e) => (e as HTMLInputElement).value || e.textContent || e.getAttribute('title') || e.getAttribute('alt') || e.getAttribute('aria-label') || (e.querySelector('img')?.getAttribute('alt') ?? '') || (e.querySelector('img')?.getAttribute('title') ?? '') || '').catch(() => ''))
}

/** ¿Hay un buscador (UN campo de documento editable ajeno al interesado + UN botón Buscar/Consultar) o una pantalla de ALTA? Solo lee. */
async function analizarAbiertoPersonas(m: Frame, nuevo: boolean): Promise<{ tipo: 'buscador'; b: Buscador } | { tipo: 'alta' } | null> {
  const campos = m.locator(SEL_CAMPO_TEXTO).filter({ visible: true })
  const documentos: Locator[] = []
  let camposPersona = 0
  const nc = Math.min(await campos.count().catch(() => 0), 30)
  for (let i = 0; i < nc; i++) {
    const c = campos.nth(i)
    const d = (await c.evaluate((e) => { const x = e as HTMLInputElement; return [x.id, x.name, x.placeholder, x.title, x.labels && x.labels[0] ? x.labels[0].textContent : ''].join(' ') }).catch(() => '')) as string
    if (d.includes(PREFIJO_ID_INTERESADO_GENERALI)) continue
    if (!(await c.isEditable().catch(() => false))) continue
    if (RE_DOCUMENTO_CAMPO.test(d)) documentos.push(c)
    else if (RE_PERSONA_CAMPO.test(d)) camposPersona++
  }
  const acciones = m.locator(SEL_ACCION).filter({ visible: true })
  const buscar: Locator[] = []
  let altas = 0
  const na = Math.min(await acciones.count().catch(() => 0), 60)
  for (let i = 0; i < na; i++) {
    const r = await rotuloDe(acciones.nth(i))
    if (RE_BUSCAR_PERSONA_GENERALI.test(r)) buscar.push(acciones.nth(i))
    else if (nuevo && RE_ALTA_PERSONA_GENERALI.test(r)) altas++
  }
  // v0.2.23: con el formulario de la persona y el buscador en la misma pantalla hay VARIOS campos de documento: vale el que comparte con «Buscar» el ancestro común MÁS CERCANO (si empata, no se adivina).
  if (documentos.length > 1 && buscar.length === 1) {
    const prof: number[] = []
    for (const d of documentos) {
      const h = await d.elementHandle().catch(() => null)
      prof.push(h ? ((await buscar[0]!.evaluate((bt, dd) => { let n = 0; for (let x: Element | null = bt; x; x = x.parentElement) { n++; if (x.contains(dd as Node)) return n } return 0 }, h).catch(() => 0)) as number) : 0)
    }
    const validos = prof.filter((n) => n > 0)
    const min = validos.length ? Math.min(...validos) : 0
    const mejores = documentos.filter((_, i) => prof[i] === min)
    if (min > 0 && mejores.length === 1) return { tipo: 'buscador', b: { marco: m, documento: mejores[0]!, buscar: buscar[0]! } }
  }
  if (documentos.length === 1 && buscar.length === 1) return { tipo: 'buscador', b: { marco: m, documento: documentos[0]!, buscar: buscar[0]! } }
  if (nuevo && documentos.length === 0 && (altas > 0 || camposPersona >= 2)) return { tipo: 'alta' }
  return null
}

/** Marcos de lo que abrió «Personas»: ventanas nuevas, marcos nuevos o que NAVEGARON (URL distinta) y, al final, los de siempre (capa). `page.frames()` ya incluye los anidados. */
function raicesTrasPersonas(page: Page, antesP: ReadonlySet<Page>, antesF: ReadonlyMap<Frame, string>, conBuscador: ReadonlySet<Frame>): RaizAbierta[] {
  const out: RaizAbierta[] = []
  for (const p of page.context().pages()) if (!antesP.has(p) && !p.isClosed()) for (const f of p.frames()) if (!f.isDetached()) out.push({ rama: 'ventana', marco: f, nuevo: true })
  for (const f of page.frames()) if (!f.isDetached() && (!antesF.has(f) || antesF.get(f) !== f.url())) out.push({ rama: 'marco', marco: f, nuevo: true })
  for (const f of page.frames()) if (antesF.get(f) === f.url() && !f.isDetached() && !conBuscador.has(f)) out.push({ rama: 'capa', marco: f, nuevo: false })
  return out
}

/** Inventario SANEADO: índice de TODOS los marcos (rama, URL sin datos, nombre, nº de controles) + controles de los abiertos (nuevos/navegados; si no hay, los de siempre con controles). */
async function inventarioPersonas(raices: readonly RaizAbierta[]): Promise<string> {
  const leidos: { r: RaizAbierta; controles: ControlAbiertoGenerali[]; filas: number }[] = []
  for (const r of raices.slice(0, 16)) {
    const l = ((await r.marco.evaluate(JS_CONTROLES_ABIERTO).catch(() => null)) as { controles: ControlAbiertoGenerali[]; filas: number } | null) ?? { controles: [], filas: 0 }
    leidos.push({ r, controles: l.controles, filas: l.filas })
  }
  if (leidos.length === 0) return 'sin marcos'
  const indice = indiceMarcosGenerali(leidos.map((x) => ({ rama: x.r.rama, url: x.r.marco.url(), nombre: x.r.marco.name() || null, controles: x.controles.length })))
  const nuevas = leidos.filter((x) => x.r.nuevo && !/vimeo/i.test(x.r.marco.url()))
  const conControles = nuevas.filter((x) => x.controles.length > 0)
  const detalle = (conControles.length > 0 ? conControles : nuevas.length > 0 ? nuevas : leidos.filter((x) => x.controles.length > 0 && !/vimeo/i.test(x.r.marco.url())).slice(0, 1)).slice(0, 2)
  const partes = detalle.map((x) => `[${x.r.rama}] ${resumenControlesAbiertoGenerali(x.controles, x.filas, Math.floor(1200 / detalle.length))}`)
  return `marcos: ${indice} | ${partes.join(' | ') || 'sin controles visibles'}`
}

/** La pestaña «Selección personas (que intervienen)» del marco abierto: solo si hay exactamente UNA. */
async function pestanaSeleccionPersonas(m: Frame): Promise<Locator | null> {
  const enlaces = m.locator('a, input[type=button], button').filter({ visible: true })
  const n = Math.min(await enlaces.count().catch(() => 0), 60)
  const hallados: Locator[] = []
  for (let i = 0; i < n; i++) if (RE_PESTANA_SELECCION_PERSONAS_GENERALI.test(await rotuloDe(enlaces.nth(i)))) hallados.push(enlaces.nth(i))
  return hallados.length === 1 ? hallados[0]! : null
}

/** Filas de resultado: con algún control o un documento, sin campos de texto (las de maquetación y los encabezados no cuentan). */
async function filasResultadoPersonas(m: Frame): Promise<FilaPersonas[]> {
  const trs = m.locator('tr').filter({ visible: true })
  const n = Math.min(await trs.count().catch(() => 0), 100)
  const out: FilaPersonas[] = []
  for (let i = 0; i < n; i++) {
    const loc = trs.nth(i)
    const info = (await loc
      .evaluate((tr) => {
        if (!tr.querySelector('td') || tr.querySelector('table')) return null
        if (tr.querySelector('input[type=text],input:not([type]),input[type=search],input[type=number],select,textarea')) return null
        const celdas = Array.from(tr.children).filter((c) => /^(td|th)$/i.test(c.tagName)).map((c) => (c.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80))
        return { celdas, onclick: !!tr.getAttribute('onclick') }
      })
      .catch(() => null)) as { celdas: string[]; onclick: boolean } | null
    if (!info) continue
    const ctl = loc.locator(SEL_ACCION).filter({ visible: true })
    const controles: string[] = []
    for (let j = 0; j < Math.min(await ctl.count().catch(() => 0), 8); j++) controles.push(await rotuloDe(ctl.nth(j)))
    if (controles.some((c) => RE_BUSCAR_PERSONA_GENERALI.test(c))) continue
    const pareceDoc = info.celdas.some((c) => RE_DOC_PARECE.test(c.toUpperCase().replace(/[^A-Z0-9]/g, '')))
    if (controles.length === 0 && !info.onclick && !pareceDoc) continue
    out.push({ loc, celdas: info.celdas, controles, onclick: info.onclick })
  }
  return out
}

/** ¿El interesado está readonly/deshabilitado y VACÍO (NIF y, si existe, nombre)? Solo lee. */
async function interesadoSoloLecturaVacioGenerali(marco: Raiz): Promise<boolean> {
  const estado = async (campo: string): Promise<{ ro: boolean; vacio: boolean } | null> => {
    const l = marco.locator(idInteresado(campo)).filter({ visible: true })
    if ((await l.count().catch(() => 0)) !== 1) return null
    return (await l.first().evaluate((e) => ({ ro: !!((e as HTMLInputElement).disabled || (e as HTMLInputElement).readOnly), vacio: String((e as HTMLInputElement).value || '').trim() === '' })).catch(() => null)) as { ro: boolean; vacio: boolean } | null
  }
  const nif = await estado('nifcif')
  if (!nif || !nif.ro || !nif.vacio) return false
  const nombre = await estado('nombre')
  return !nombre || nombre.vacio
}

async function interesadoRellenoGenerali(marco: Raiz): Promise<boolean> {
  for (const campo of ['nifcif', 'nombre']) {
    const l = marco.locator(idInteresado(campo)).filter({ visible: true })
    if ((await l.count().catch(() => 0)) !== 1) return false
    if ((await l.first().inputValue().catch(() => '')).trim() === '') return false
  }
  return true
}

// ───────────────────────── v0.2.25 · «Interesado / Tomador › Datos personas»: alta del tomador + «Confirmar» por el guard ─────────────────────────

/** Espera tras teclear el NIF: el portal puede autocompletar el resto al salir del campo (se respeta lo que ponga). */
const ESPERA_AUTOCOMPLETAR_NIF_MS = 1_500
/** Espera tras «Confirmar» de «Datos personas» a que el portal vuelva (o pinte su validación). */
const ESPERA_TRAS_CONFIRMAR_PERSONAS_MS = 15_000

/** Mensajes de validación visibles del marco (clases/ids de error/aviso/mensaje y líneas «Es obligatorio…»). Textos crudos: se SANEAN al usarlos. Sin funciones con nombre (tsx). */
const JS_MENSAJES_DATOS_PERSONAS = `(() => {
  const vis = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const out = [];
  document.querySelectorAll('[class*="error" i],[class*="aviso" i],[class*="alert" i],[class*="mensaje" i],[class*="msg" i],[class*="valida" i],[id*="error" i],[id*="mensaje" i],[id*="msg" i],[role=alert]').forEach((e) => {
    if (!vis(e) || /^(INPUT|SELECT|TEXTAREA|SCRIPT|STYLE)$/.test(e.tagName)) return;
    const t = String(e.innerText || e.textContent || '').replace(/\\s+/g, ' ').trim();
    if (t.length >= 3 && t.length <= 200 && out.indexOf(t) < 0) out.push(t);
  });
  String(document.body ? document.body.innerText : '').split(/\\n/).forEach((l) => {
    const t = l.replace(/\\s+/g, ' ').trim();
    if (/^(es obligatori[oa]|falta|debe (informar|indicar)|campo obligatorio|el campo|formato|fecha (no valida|incorrecta|erronea))/i.test(t) && t.length <= 160 && out.indexOf(t) < 0) out.push(t);
  });
  return out.slice(0, 12);
})()`

/** ¿Es el marco «Interesado / Tomador» (`emiAutosGenB028.do`) con el NIF de «Datos personas» visible? Solo lee. */
async function esDatosPersonasGenerali(m: Frame): Promise<boolean> {
  if (m.isDetached() || !urlDatosPersonasGenerali(m.url())) return false
  return (await m.locator(`[id="${PREFIJO_ID_DATOS_PERSONAS_GENERALI}nifcif"]`).filter({ visible: true }).count().catch(() => 0)) === 1
}

type FormDatosPersonasGenerali = Parameters<typeof camposInteresadoGenerali>[0] & Parameters<typeof planDatosPersonasGenerali>[0]

/**
 * v0.2.25 · «Personas» abrió «Interesado / Tomador › Datos personas» (`emiAutosGenB028.do`, sin buscador). Rellena SOLO los campos VACÍOS con
 * los datos del riesgo (`planDatosPersonasGenerali`): tipo de documento (NIF/NIE), NIF (y espera el autocompletado del portal al salir del
 * campo: lo que ponga se respeta), nombre, apellidos, nacimiento, carné/sexo (del conductor solo si el tomador ES el conductor), nacionalidad
 * España (DNI y desplegable vacío) y email/móvil solo si el riesgo los trae. Un NIF ya puesto que NO es el del tomador → para. Nunca toca
 * casillas (el checkbox `#campofocus` tampoco). Con NIF, nombre y primer apellido puestos, pulsa «Confirmar» SOLO por la puerta acotada del
 * guard (`ctx.confirmarDatosPersonasGenerali`) y espera la vuelta; una validación del portal o un diálogo → atasco SANEADO (sin valores).
 */
export async function altaDatosPersonasGenerali(
  marco: Raiz,
  m: Frame,
  form: FormDatosPersonasGenerali,
  ctx: ContextoPortal,
  esperas: { autocompletarMs?: number; trasConfirmarMs?: number } = {},
): Promise<{ hechos: string[]; diag: string }> {
  const inventario = async () => inventarioPersonas([{ rama: 'marco', marco: m, nuevo: true }])
  const hechos: string[] = []
  const omitidos: string[] = []
  const parar = async (que: string, rama: string, conInventario = true): Promise<never> => {
    const confirmado = hechos.includes('datos_personas.confirmar')
    throw new ErrorMapaIncompletoGenerali(
      `la persona del tomador en «Datos personas»: ${que}. ${confirmado ? 'Se pulsó «Confirmar» una vez; no se repite.' : 'No se pulsa «Confirmar».'} Datos-personas: rama=datos_personas, ${rama}; hecho: ${hechos.join(',') || 'nada'}${omitidos.length ? `; omitido: ${omitidos.join(', ')}` : ''}${conInventario ? `; controles: ${await inventario()}` : ''}`,
    )
  }
  const plan = planDatosPersonasGenerali(form)
  if ('error' in plan) return parar(plan.error, 'sin_plan')
  const ctl = (c: string) => m.locator(`[id="${PREFIJO_ID_DATOS_PERSONAS_GENERALI}${c}"]`)
  /** El control si es ÚNICO, visible, habilitado y editable; si no, `null` con su motivo en `omitidos`. */
  const usable = async (c: string): Promise<Locator | null> => {
    const total = await ctl(c).count().catch(() => 0)
    const l = ctl(c).filter({ visible: true })
    const n = await l.count().catch(() => 0)
    if (n !== 1) {
      omitidos.push(`${c}:${total === 0 ? 'no_existe' : n === 0 ? 'oculto' : 'varios'}`)
      return null
    }
    const el = l.first()
    if (!(await el.isEnabled().catch(() => false))) { omitidos.push(`${c}:deshabilitado`); return null }
    if (!(await esSelectNativo(el)) && !(await el.isEditable().catch(() => false))) { omitidos.push(`${c}:solo_lectura`); return null }
    return el
  }
  const escribirSiVacio = async (c: string, valor: string | null): Promise<void> => {
    if (!valor) return
    const el = await usable(c)
    if (!el) return
    if ((await el.inputValue().catch(() => 'x')).trim() !== '') { omitidos.push(`${c}:con_valor`); return }
    await escribir(el, valor, ctx)
    hechos.push(`datos_personas.${c}`)
  }
  const elegirSiVacio = async (c: string, elegir: (ops: { valor: string; texto: string }[]) => number | null): Promise<void> => {
    const el = await usable(c)
    if (!el) return
    if (!(await esSelectNativo(el))) { omitidos.push(`${c}:no_es_select`); return }
    if (!opcionSelectVaciaGenerali(await leerOpcionSeleccionada(el))) { omitidos.push(`${c}:con_valor`); return }
    const i = elegir(await opcionesSelect(el).catch(() => []))
    if (i === null) { omitidos.push(`${c}:sin_opcion_clara`); return }
    await elegirIndice(el, i, ctx)
    hechos.push(`datos_personas.${c}`)
  }

  // 1. Tipo de documento, antes del NIF (el portal puede validar el NIF contra él).
  await elegirSiVacio('ynidcl', (ops) => opcionTipoDocumentoGenerali(ops, plan.tipoDocumento))
  // 2. NIF: vacío → se teclea y se espera el autocompletado; con valor → tiene que ser EL MISMO documento.
  const nifVisible = ctl('nifcif').filter({ visible: true })
  if ((await nifVisible.count().catch(() => 0)) !== 1) return parar('el campo NIF no es único y visible', 'sin_nif_campo')
  const nifActual = (await nifVisible.first().inputValue().catch(() => '')).trim()
  if (nifActual === '') {
    const el = await usable('nifcif')
    if (!el) return parar('el campo NIF está vacío y no es editable', 'nif_no_editable')
    await escribir(el, plan.documento, ctx)
    hechos.push('datos_personas.nifcif')
    await pausaMs(esperas.autocompletarMs ?? ESPERA_AUTOCOMPLETAR_NIF_MS)
  } else if (documentoNormalizadoGenerali(nifActual) !== plan.documento) {
    return parar('el NIF que ya trae la pantalla NO es el del tomador; no se sobrescribe ni se confirma otra persona', 'nif_distinto')
  } else omitidos.push('nifcif:con_valor')
  // 3. El resto, solo si está VACÍO (lo que autocompletó el portal se respeta).
  await escribirSiVacio('nombre', plan.nombre)
  await escribirSiVacio('papell', plan.apellido1)
  await escribirSiVacio('sapell', plan.apellido2)
  if (plan.sexo) await elegirSiVacio('ysexo', (ops) => opcionSexoGenerali(ops, plan.sexo!))
  await escribirSiVacio('ffnain', plan.fechaNacimiento)
  await escribirSiVacio('ffcain', plan.fechaCarne)
  if (plan.tipoCarne) await elegirSiVacio('ycarnc', (ops) => opcionTipoCarneGenerali(ops, plan.tipoCarne))
  if (plan.espana) await elegirSiVacio('pnacld', (ops) => opcionEspanaGenerali(ops))
  await escribirSiVacio('yemail', plan.email)
  await escribirSiVacio('movtom', plan.movil)

  // 4. Mínimo antes de confirmar: el NIF del tomador, nombre y primer apellido (puestos por el bot o por el portal).
  const valor = async (c: string) => (await ctl(c).filter({ visible: true }).first().inputValue().catch(() => '')).trim()
  if (documentoNormalizadoGenerali(await valor('nifcif')) !== plan.documento) return parar('tras rellenar, el NIF de la pantalla no es el del tomador', 'nif_tras_rellenar')
  const faltan = [(await valor('nombre')) === '' ? 'nombre' : null, (await valor('papell')) === '' ? 'primer apellido' : null].filter((x): x is string => x !== null)
  if (faltan.length) return parar(`falta ${faltan.join(' y ')} (ni el riesgo ni el portal lo ponen)`, 'incompleto')
  if (!ctx.confirmarDatosPersonasGenerali) return parar('falta la puerta guardada de «Confirmar» de «Datos personas» en el contexto del runner', 'sin_puerta')

  // 5. «Confirmar» SOLO por el guard (marco emiAutosGenB028.do, pestaña «Datos personas», #confirmar, una vez).
  const { dialogo } = await ctx.confirmarDatosPersonasGenerali()
  hechos.push('datos_personas.confirmar')
  if (dialogo) return parar(`el portal abrió un diálogo al confirmar (se canceló): «${dialogo}»`, 'dialogo', false)

  // 6. Esperar la vuelta: el interesado relleno (verificado) o fuera de emiAutosGenB028.do sin mensajes; si la pantalla sigue con su validación → atasco.
  const fin = Date.now() + (esperas.trasConfirmarMs ?? ESPERA_TRAS_CONFIRMAR_PERSONAS_MS)
  let mensajes: string[] = []
  let previos = ''
  for (;;) {
    await pausaMs(500)
    if (await interesadoRellenoGenerali(marco)) return { hechos, diag: `rama=datos_personas, confirmado, verificado; ${hechos.join(',')}${omitidos.length ? `; omitido: ${omitidos.join(', ')}` : ''}` }
    const enPantalla = !m.isDetached() && urlDatosPersonasGenerali(m.url())
    mensajes = enPantalla ? mensajesValidacionGenerali(((await m.evaluate(JS_MENSAJES_DATOS_PERSONAS).catch(() => [])) as string[]) ?? []) : []
    if (!enPantalla && Date.now() >= fin) return { hechos, diag: `rama=datos_personas, confirmado, fuera_de_B028_sin_verificar; ${hechos.join(',')}` }
    const clave = mensajes.join('|')
    if (enPantalla && mensajes.length > 0 && clave === previos) break
    previos = clave
    if (Date.now() >= fin) break
  }
  return parar(
    mensajes.length ? `el portal no aceptó los datos: ${mensajes.map((x) => `«${x}»`).join(' · ')}` : 'tras «Confirmar» la pantalla no volvió a «Datos de Valoración» ni dio un mensaje legible',
    mensajes.length ? 'validacion' : 'sin_vuelta',
  )
}

/**
 * v0.2.22 · Si tras el rellenado normal el «Interesado / Tomador» sigue READONLY y VACÍO, pulsa UNA vez «Personas» (`ctx.pulsar`), espera lo que abre
 * (ventana nueva, marco o capa), busca el NIF del tomador y elige la fila SOLO si es la única y su documento coincide. Nunca crea una persona
 * (pantalla de alta, 0 filas o varias: `ErrorMapaIncompletoGenerali` con la rama y el inventario SANEADO de lo abierto, sin valores). Tras volver
 * verifica que `interesado_nifcif`/`nombre` ya traen valor. Devuelve lo hecho y un diagnóstico compacto (`null` = no aplicaba, no se pulsó nada).
 */
export async function elegirPersonaTomadorGenerali(
  marco: Raiz,
  form: FormDatosPersonasGenerali,
  ctx: ContextoPortal,
  esperas: { abrirMs?: number; resultadosMs?: number; vueltaMs?: number; autocompletarMs?: number; trasConfirmarMs?: number } = {},
): Promise<{ hechos: string[]; diag: string } | null> {
  if (!(await interesadoSoloLecturaVacioGenerali(marco))) return null
  const page = paginaDe(marco)
  const parar = (que: string, ...extra: string[]): never => {
    throw new ErrorMapaIncompletoGenerali(`la persona del tomador: ${que}. No se crea ni se elige nada más. Personas-pulsar: ${extra.join('; ')}`)
  }
  const nif = camposInteresadoGenerali(form).find((c) => c.campo === 'nifcif')?.valor ?? null
  if (!nif) return parar('el interesado es de solo lectura y el riesgo no trae el NIF/documento del tomador (o es persona jurídica, sin mapa)', 'rama=sin_nif')
  let boton: Locator | null = marco.locator(`[id="${ID_BOTON_PERSONAS_GENERALI}"]`).filter({ visible: true })
  if ((await boton.count().catch(() => 0)) !== 1) boton = (await localizarPestanaPersonasGenerali(marco)).control
  if (!boton) return parar('el interesado es de solo lectura y no se halla el botón «Personas» (roles_lnkPers)', 'rama=sin_boton')

  const antesP = new Set(page.context().pages())
  const antesF = new Map<Frame, string>(page.frames().map((f) => [f, f.url()] as [Frame, string]))
  const conBuscador = new Set<Frame>()
  for (const f of page.frames()) if (!f.isDetached() && (await analizarAbiertoPersonas(f, false)) !== null) conBuscador.add(f)
  await ctx.pulsar(boton)

  // 1. Esperar a que aparezca lo que abre.
  let finAbrir = Date.now() + (esperas.abrirMs ?? ESPERA_ABRIR_PERSONAS_MS)
  const cargadas = new Set<Page>()
  let tabPulsada = false
  let tabMarco: Frame | null = null
  let tabAntes = 0
  let raices: RaizAbierta[] = []
  const donde: { h: Hallazgo | null } = { h: null }
  let datosPersonas: Frame | null = null
  for (;;) {
    for (const p of page.context().pages()) if (!antesP.has(p) && !cargadas.has(p)) { cargadas.add(p); await p.waitForLoadState('domcontentloaded', { timeout: 3_000 }).catch(() => undefined) }
    raices = raicesTrasPersonas(page, antesP, antesF, conBuscador)
    for (const r of raices) {
      const a = await analizarAbiertoPersonas(r.marco, r.nuevo)
      if (a) { donde.h = { ...a, rama: r.rama }; break }
    }
    if (donde.h) break
    // v0.2.25: sin buscador, «Interesado / Tomador › Datos personas» (emiAutosGenB028.do) → alta con los datos del riesgo + «Confirmar» por el guard.
    for (const r of raices) {
      if (r.nuevo && (await esDatosPersonasGenerali(r.marco))) { datosPersonas = r.marco; break }
    }
    if (datosPersonas) break
    // El marco abierto no trae buscador pero sí la pestaña «Selección personas…»: se pulsa UNA vez (nunca «Confirmar» ni «Alta») y se sigue esperando.
    if (!tabPulsada) {
      for (const r of raices) {
        if (!r.nuevo) continue
        const tab = await pestanaSeleccionPersonas(r.marco)
        if (!tab) continue
        tabPulsada = true
        tabMarco = r.marco
        tabAntes = ((await r.marco.evaluate(JS_CONTROLES_ABIERTO).catch(() => null)) as { controles: unknown[] } | null)?.controles.length ?? 0
        await ctx.pulsar(tab)
        finAbrir = Date.now() + (esperas.abrirMs ?? ESPERA_ABRIR_PERSONAS_MS)
        break
      }
    }
    if (Date.now() >= finAbrir) break
    await pausaMs(400)
  }
  if (datosPersonas) {
    const r = await altaDatosPersonasGenerali(marco, datosPersonas, form, ctx, esperas)
    return { hechos: ['tomador.datos_personas', ...r.hechos], diag: r.diag }
  }
  const inv = await inventarioPersonas(raices)
  const hallazgo = donde.h
  if (!hallazgo) return parar('se pulsó «Personas» y no se encontró un buscador con campo de documento y botón «Buscar/Consultar»', `rama=${raices.find((r) => r.nuevo)?.rama ?? 'nada_nuevo'}, sin_buscador${tabPulsada ? ', pestaña_seleccion_pulsada' : ''}`, ...(tabMarco ? [`pestaña: controles ${tabAntes}→${((await tabMarco.evaluate(JS_CONTROLES_ABIERTO).catch(() => null)) as { controles: unknown[] } | null)?.controles.length ?? '?'}`] : []), `controles: ${inv}`)
  if (hallazgo.tipo === 'alta') return parar('«Personas» abrió una pantalla de ALTA de persona, no un buscador', `rama=${hallazgo.rama}, alta`, `controles: ${inv}`)

  // 2. Buscar el NIF del tomador.
  const { documento, buscar, marco: mb } = hallazgo.b
  await ctx.pausaAccion()
  await comprobarCampo(documento)
  await documento.fill(nif)
  await documento.blur().catch(() => undefined)
  await confirmarUso(documento)
  await ctx.pulsar(buscar)

  // 3. Esperar el resultado (estable en dos lecturas) y exigir EXACTAMENTE una fila cuyo documento coincide.
  const finRes = Date.now() + (esperas.resultadosMs ?? ESPERA_RESULTADOS_PERSONAS_MS)
  let filas: FilaPersonas[] = []
  let previas = -1
  for (;;) {
    await pausaMs(500)
    if (mb.isDetached()) break
    filas = await filasResultadoPersonas(mb)
    if (filas.length > 0 && filas.length === previas) break
    previas = filas.length
    if (Date.now() >= finRes) break
  }
  const coinciden = filas.filter((f) => filaCoincideDocumentoGenerali(f.celdas, nif))
  const rama = `rama=${hallazgo.rama}, buscador, filas=${filas.length}, coinciden=${coinciden.length}`
  if (filas.length !== 1 || coinciden.length !== 1) return parar(`la búsqueda devolvió ${filas.length} fila(s) y ${coinciden.length} con el documento exacto; no se elige a ciegas ni se da de alta`, rama, `controles: ${await inventarioPersonas(raices)}`)

  // 4. Elegir esa fila por el guard.
  const fila = coinciden[0]!
  const idx = fila.controles.filter((c) => RE_ELEGIR_FILA_GENERALI.test(c)).length === 1 ? fila.controles.findIndex((c) => RE_ELEGIR_FILA_GENERALI.test(c)) : fila.controles.length === 1 ? 0 : -1
  if (idx >= 0) await ctx.pulsar(fila.loc.locator(SEL_ACCION).filter({ visible: true }).nth(idx))
  else if (fila.onclick) await ctx.pulsar(fila.loc)
  else return parar('la fila única no tiene un control claro para elegirla (ni «Seleccionar» ni un solo botón)', rama, `controles: ${await inventarioPersonas(raices)}`)

  // 5. Volver y verificar que el interesado ya trae NIF y nombre.
  const finVuelta = Date.now() + (esperas.vueltaMs ?? ESPERA_VUELTA_PERSONAS_MS)
  while (!(await interesadoRellenoGenerali(marco)) && Date.now() < finVuelta) await pausaMs(400)
  if (!(await interesadoRellenoGenerali(marco))) return parar('se eligió la fila única pero `interesado_nifcif`/`nombre` siguen vacíos', rama, 'verificación=vacío', `controles: ${await inventarioPersonas(raices)}`)
  return { hechos: ['tomador.persona_elegida'], diag: `${rama}, verificado; controles: ${inv.slice(0, 350)}` }
}

/** Oferta de Generali con el importe del lector tolerante: avisos claros de lo que NO se sabe y de lo SUPUESTO. */
export function ofertaGenerali(eur: number, supuestos: string | null, avisosLectura: readonly string[] = []): OfertaNormalizada {
  return {
    compania: 'generali',
    producto: 'Auto · Turismos (Ramo UV)',
    primaAnualEur: eur,
    primaNetaEur: null,
    fraccionamiento: null,
    importeReciboEur: null,
    coberturas: [],
    franquicias: [],
    validaHasta: null,
    referenciaPortal: null,
    pdf: null,
    desglose: null,
    avisos: [
      'Importe leído de «Garantías y Resultados» con un lector tolerante (bot 0.2.0, sin captura de esa pantalla): compruébalo en el portal; no consta la modalidad ni si es anual.',
      ...avisosLectura,
      ...(supuestos ? [supuestos] : []),
    ],
  }
}

/** Espera el precio tras la subpestaña: un único importe, estable en dos lecturas; si no, la última lectura. */
async function esperarPrecioGenerali(page: Page, ignorar: readonly number[], ms = ESPERA_PRECIO_MS): Promise<ReturnType<typeof leerPrecioGenerali>> {
  const fin = Date.now() + ms
  let ultima: ReturnType<typeof leerPrecioGenerali> = { tipo: 'ninguno' }
  for (;;) {
    ultima = leerPrecioGenerali(await textoPagina(page), ignorar)
    if (ultima.tipo === 'unico') {
      await page.waitForTimeout(1_000)
      const otra = leerPrecioGenerali(await textoPagina(page), ignorar)
      if (otra.tipo === 'unico' && otra.eur === ultima.eur) return otra
      ultima = otra
    }
    if (Date.now() >= fin) return ultima
    await page.waitForTimeout(800)
  }
}

/**
 * Tras «Roles»: scroll del panel, registro de la pantalla, mapa provisional, «Garantías y Resultados» por la compuerta del
 * guard y lectura del precio. Devuelve la oferta o PARA (`ErrorMapaIncompletoGenerali`) con el registro de donde se quedó; el
 * runner guarda además el HTML redactado, el inventario de estructura y el recorrido.
 */
export async function hastaPrecioGenerali(page: Page, form: FormularioAuto, supuestos: string[], ctx: ContextoPortal, opciones: { esperaPrecioMs?: number } = {}): Promise<ResultadoAdaptador> {
  const paso = <T>(n: Parameters<ContextoPortal['paso']>[0], fn: () => Promise<T>): Promise<T> => (typeof ctx.paso === 'function' ? ctx.paso(n, fn) : fn())
  const ant = conAntecedentesFavorables(form)
  for (const x of ant.supuestos) if (!supuestos.includes(x)) supuestos.push(x)
  const texto = textoSupuestos(supuestos)
  const marco = (await marcoConTexto(page, 'Identificación del vehículo', 5_000)) ?? page
  const { pantalla, hechos, tomador } = await paso('formulario', async () => {
    await recorrerScroll(page, marco)
    const antes = await leerPantalla(marco)
    const hechos = await rellenarMapaProvisionalGenerali(marco, antes, ant.formulario, ctx)
    const omitidos: string[] = []
    hechos.push(...(await rellenarInteresadoGenerali(marco, ant.formulario, ctx, omitidos)))
    // v0.2.22: interesado readonly y vacío → «Personas» (buscar y elegir la persona). Para sin crear nada si no es seguro.
    const persona = await elegirPersonaTomadorGenerali(marco, ant.formulario, ctx)
    if (persona) hechos.push(...persona.hechos)
    // Tras rellenar, se relee (el portal puede pintar campos nuevos al salir de uno).
    if (hechos.length > 0) await recorrerScroll(page, marco)
    const personas = await leerPersonasGenerali(page)
    const tomador = `Tomador: ${motivosInteresadoGenerali(camposInteresadoGenerali(ant.formulario), personas)}${omitidos.length ? `; omitido: ${omitidos.join(', ')}` : ''}${persona ? `; Personas-pulsar: ${persona.diag}` : ''}. Personas: ${resumenPersonasGenerali(personas, 800)}`
    return { pantalla: hechos.length > 0 ? await leerPantalla(marco) : antes, hechos, tomador }
  })
  ctx.log?.(`generali/auto: Datos de Valoración: ${pantalla.campos.length} campos, ${pantalla.botones.length} botones, mapa provisional: ${hechos.join(',') || 'nada'}`)
  const datos = `Datos de Valoración: ${resumenPantallaGenerali(pantalla, 700)}`
  if (!ctx.pulsarSubpestanaGenerali) throw new ErrorMapaIncompletoGenerali(`la puerta guardada de «${SUBPESTANA_PRECIO_GENERALI}» en el contexto del runner; ${datos}`)
  // Importes que YA estaban antes del clic no son el precio (la lectura de después los ignora).
  const lAntes = leerPrecioGenerali(await textoPagina(page))
  const ignorar = lAntes.tipo === 'unico' ? [lAntes.eur] : lAntes.tipo === 'varios' ? lAntes.candidatos.map((c) => c.eur) : []
  await paso('tarificar', () => ctx.pulsarSubpestanaGenerali!(SUBPESTANA_PRECIO_GENERALI))
  const lectura = await paso('lectura_primas', () => esperarPrecioGenerali(page, ignorar, opciones.esperaPrecioMs ?? ESPERA_PRECIO_MS))
  if (lectura.tipo === 'unico') return { ofertas: [ofertaGenerali(lectura.eur, texto, lectura.avisos)] }
  // v0.2.27: si la pestaña no cambió la pantalla, «Siguiente» (puerta del guard, máx. 3) avanza hacia «Garantías y Resultados».
  let lecturaFinal: Awaited<ReturnType<typeof esperarPrecioGenerali>> = lectura
  const avanceSiguiente: string[] = []
  if (!ctx.pulsarSiguienteGenerali) avanceSiguiente.push('Siguiente no intentado: el contexto del runner no trae la puerta guardada')
  else if (lecturaFinal.tipo !== 'ninguno') avanceSiguiente.push(`Siguiente no intentado: la lectura ya era «${lecturaFinal.tipo}» (no «ninguno»)`)
  if (ctx.pulsarSiguienteGenerali) {
    for (let i = 1; i <= 3 && lecturaFinal.tipo === 'ninguno'; i++) {
      try {
        const r = await paso('tarificar', () => ctx.pulsarSiguienteGenerali!())
        avanceSiguiente.push(`Siguiente×${i}${r.dialogo ? ` (diálogo cancelado: ${r.dialogo.slice(0, 120)})` : ''}`)
      } catch (e) {
        avanceSiguiente.push(`Siguiente×${i} no pulsado: ${(e instanceof Error ? e.message : String(e)).slice(0, 160)}`)
        break
      }
      lecturaFinal = await paso('lectura_primas', () => esperarPrecioGenerali(page, ignorar, opciones.esperaPrecioMs ?? ESPERA_PRECIO_MS))
      if (lecturaFinal.tipo === 'unico') return { ofertas: [ofertaGenerali(lecturaFinal.eur, texto, lecturaFinal.avisos)] }
    }
  }
  const despues = await leerPantallaPagina(page)
  const textoFinal = await textoPagina(page)
  const obligatorios = avisosObligatorioGenerali(textoFinal)
  const importes = fragmentosImportesGenerali(textoFinal)
  const volcado = await volcarResultadosGenerali(page)
  const diagnostico = resumenDiagnosticoImportesGenerali(await volcarDiagnosticoImportesGenerali(page), 430)
  const navegacionMarcos = await volcarNavegacionGenerali(page)
  const que = lecturaFinal.tipo === 'varios'
    ? `${lecturaFinal.candidatos.length} importes candidatos y no se elige uno a ciegas: ${lecturaFinal.candidatos.map((c) => `${c.eur} € («${c.linea.slice(0, 60)}»)`).join(' · ')}`
    : 'ningún importe legible con «prima/precio/importe/total/cuota/recibo»'
  // El runner corta el mensaje a 2000: lo que más importa (avisos, diagnóstico de tablas/importes) va PRIMERO y la navegación, el resto y la pantalla, después
  // y con presupuesto decreciente hasta que todo quepa (v0.2.30: el diagnóstico va ANTES de la navegación).
  const compuesto = (nav: number, res: number, pan: number, imp: number): string =>
    `el PRECIO de «${SUBPESTANA_PRECIO_GENERALI}» (${que}). ${obligatorios.length ? `Avisos del portal: ${obligatorios.join(' · ')}. ` : ''}${avanceSiguiente.length ? `Avance: ${avanceSiguiente.join(' · ')}. ` : ''}${diagnostico}. Navegación: ${resumenNavegacionGenerali(navegacionMarcos, nav)}. ${tomador.slice(0, 500)}. Mapa provisional: ${hechos.join(',') || 'nada'}. Textos con «€»: ${importes.length ? importes.slice(0, imp).map((f) => `«${f}»`).join(' ') : 'ninguno'}${texto ? `; ${texto}` : ''}. Resultados: ${resumenVolcadoResultadosGenerali(volcado, res)}. Pantalla: ${resumenPantallaGenerali(despues, pan)}`
  const LIMITE = 1_900 - 'generali/auto: mapa incompleto: faltan '.length
  let mensaje = compuesto(650, 360, 450, 8)
  for (const [nav, res, pan, imp] of [[450, 260, 300, 5], [350, 180, 200, 3], [250, 120, 100, 2], [150, 80, 60, 1]] as const) {
    if (mensaje.length <= LIMITE) break
    mensaje = compuesto(nav, res, pan, imp)
  }
  throw new ErrorMapaIncompletoGenerali(mensaje.slice(0, LIMITE))
}

/**
 * Adaptador de Generali Turismos (v0.2.0). Llega a «Datos de Valoración» (captura 6), recorre y registra el resto del panel,
 * pulsa «Garantías y Resultados» por la compuerta del guard y devuelve la oferta si lee un precio; donde no sabe seguir, PARA
 * con `ErrorMapaIncompletoGenerali` + registro de la pantalla + inventario + HTML, para mapearlo sin pedir capturas.
 */
export const generaliAuto = {
  compania: 'generali',
  ramo: 'auto',
  credencial: 'GENERALI_MEDIADORES',
  version: VERSION_GENERALI_AUTO,
  // SMS de Okta (cada 30 días por dispositivo): el runner releva el código por Telegram y recuerda el dispositivo (relevo-sms.ts).
  codigoSms: 'okta-generali',
  async tarificar(page: Page, form: FormularioAuto, ctx: ContextoPortal): Promise<ResultadoAdaptador> {
    if (form?.ramo !== 'auto') throw new ErrorTarificador('datos', 'generali/auto: solo turismos (moto, después)')
    // Lo que se sabe sin portal, ANTES de abrirlo: matrícula con asterisco y vehículo confirmado.
    const m = matriculaGenerali(form.matricula)
    if (!m.ok) throw new ErrorTarificador('datos', m.motivo)
    if (!vehiculoBuscadoGenerali(form)) throw new ErrorTarificador('datos', 'generali/auto: falta el vehículo confirmado por Allianz o Mapfre (Generali no busca por matrícula; asegura lo pone desde la oportunidad)')
    if (!ctx.confirmarMediadorGenerali || !ctx.entrarTurismosGenerali) throw new ErrorMapaIncompletoGenerali('las puertas guardadas de Generali (mediador y menú) en el contexto del runner', false)
    const hoy = new Date()
    await loginGenerali(page, ctx)
    await elegirMediadorGenerali(page, ctx)
    // v0.2.4: el modal «¿Sabías qué…?» tapa el portal al llegar; si está, se cierra por la compuerta del guard (si no, nada).
    await ctx.cerrarAvisoSabiasQueGenerali?.()
    await ctx.entrarTurismosGenerali()
    const marco = await marcoConTexto(page, 'Datos de Valoración')
    if (!marco) throw new ErrorMapaIncompletoGenerali('el formulario «Valoración Riesgo › Datos de Valoración» tras el menú de Turismos (captura 4)')
    await mediadorDelFormulario(marco, ctx)
    const avisosVersion: string[] = []
    const similitud = await seleccionarVehiculoGenerali(page, marco, form, ctx, avisosVersion)
    const supuestos = await rellenarValoracionGenerali(page, form, ctx, hoy)
    // v0.2.10: la versión elegida SOLA (equivalentes) va delante, declarada («revisar en la emisión»).
    supuestos.unshift(...avisosVersion)
    if (similitud) supuestos.unshift(AVISO_SIMILITUD_GENERALI)
    // Antecedentes (regla 3): sin dato, supuesto FAVORABLE declarado (lo añade `hastaPrecioGenerali`, que también los teclea
    // si el formulario tiene esos campos con etiqueta del mapa provisional).
    return hastaPrecioGenerali(page, form, supuestos, ctx)
  },
} as const
