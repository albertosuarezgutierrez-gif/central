// Mapfre wmediadores · NSEI «Nueva Alta» AUTO y MOTO (13-14/10/2026).
// v0.8.15 (22/10/2026, run real: «Proyecto NO guardado en Mapfre: no aparece el botón «Generar Proyecto» en «Coberturas»»; sin HTML guardado):
//   el botón se busca en TODA la pantalla (el «Continuar» ya vive en el pie del paso, fuera de `app-coberturas`) y no solo como <button>
//   (<a>, [role=button], mat-button…), con el texto SIN iconos (un mat-icon dentro rompía la igualdad exacta) o, en botones de solo
//   icono, por aria-label/title/value; se espera (hasta 10 s, desplazando la pantalla, sin clics). Texto EXACTO y guard intactos
//   (`permitirGenerarProyectoMapfre`, una sola vez). Si sigue sin aparecer, el aviso lista las etiquetas de botones/enlaces a la vista
//   (≤10, ≤40 caracteres, sin cifras largas/@/nombres) para saber qué hay. Código en guard.ts (`buscarBotonGenerarProyectoMapfre`).
// v0.8.14 (22/10/2026, AUTORIZADO por Alberto: «un proyecto no es póliza»): tras LEER las primas, el bot pulsa «Generar Proyecto»
//   por `ctx.generarProyectoMapfre` (guard.ts: texto exacto, guardar por la lista única, ventana de red de guardado, nada más tras el
//   clic) y lleva el nº de proyecto a `referenciaPortal` de cada oferta. Si no se genera o no se lee el nº: precio intacto + AVISO
//   legible («Proyecto NO guardado en Mapfre: …»). «Ir a generar», «Contratar» y el paso 6 siguen bloqueados.
// v0.8.7 (18/10/2026, trabajo real de moto atascado en «plan de campos de MOTO»): el inventario guardado del paso 2 de moto es el
// del coche (matrícula, 1ª matriculación, CP; licencia con «Clase *» y «Valido desde *»): MOTO va por el mismo plan con la clase
// de permiso de moto (A si no consta, declarada). Antecedentes sin dato → supuesto favorable declarado (decisión de Alberto).
// Registrado SIEMPRE en `adapters/index.ts` (14/10/2026: el worker de Fly no recibe secretos nuevos). La PUERTA es la fila
// `seguros.companias_integracion` mapfre/<ramo> activa y `rpa_autorizada`: sin ella asegura no encola, no reclama ni lanza.
// Ver docs/TARIFICADOR-RPA.md y docs/TARIFICADOR-MATRIZ.md (fila Mapfre).
//
// Fuente: UNA grabación del marcador del 13/10/2026 (19 pantallas, 0 marcos sin leer: la app NSEI es una SPA Angular
// Material SIN iframes, todo el DOM es legible). Empieza YA dentro de NSEI (`/evt21_nsei_fe-web/`): NO trae el login ni
// la entrada al portal (menú de wmediadores → Auto → Nueva Alta). Llega a PRECIO: tres productos con «PRIMA TOTAL».
//
// Flujo real (stepper de 6 pasos, todos los componentes viven a la vez en el DOM; manda el paso activo):
//   1 Datos básicos (tomador por NIF/CIF + compañía, agente, acuerdo, fechas) → 2 Objeto asegurado (matrícula + CP de
//   circulación; diálogo «Selección de vehículo»; resumen del vehículo) → 3 Figuras (conductor habitual + historial de
//   siniestralidad) → 4 Coberturas (3 productos con prima) → 5 Proyectos (genera nº de proyecto y documentación) →
//   6 Contratación (emite).
//
// VEHÍCULO CONFIRMADO (14/10/2026, Alberto: «usa el bot de Mapfre que ya tiene esa información»): por MATRÍCULA, el diálogo
// «Selección de vehículo» da el vehículo exacto (denominación, CV, CC, puertas, fecha de inicio) de coche y moto (mismo NSEI).
// `consultarVehiculoPorMatricula` teclea la matrícula, lee la fila (sin matrícula ni bastidor) y la confirma SOLO por
// `ctx.confirmarVehiculoMapfre` (función guardada de guard.ts: la fila elegida por regla fija —v0.8.0—, y solo si su matrícula es la del riesgo,
// comparada dentro del guard). Devuelve `VehiculoConfirmado` (module-tarificacion), que alimentará a los demás bots (fase siguiente).
// NIF del tomador (paso 1): lo pone ASEGURA desde la ficha (`documentoTomador`); campo mapeado. SIN LUPA (v0.7.0): al teclear el
// NIF y salir del campo, Mapfre busca sola; si el tomador no existe se da de alta en el propio formulario (ver el bloque «paso 1»).
// «Continuar» 1 → 2 → 3 por `ctx.continuarMapfre` (guard.ts). Lo que depende de pantallas NO mapeadas (mat-select sin valor,
// diálogo tras la búsqueda del tomador) es `ErrorMapaIncompleto` con `pideInventarioDom` = el runner adjunta el inventario de estructura.
//
// 🚨 SEGURIDAD. Este fichero NO pulsa nada (ni `.click`, ni `ctx.pulsar`): solo lee y rellena campos de texto, siempre
// tras `comprobarCampo`. Los clics de la entrada van por `entrada.ts`; el del diálogo de vehículo, «Continuar» y «Generar Proyecto»
// (v0.8.14), por guard.ts. No hay selectores para: «Contratar» (uno por producto, en la tarjeta de prima), el paso 6, «Ir a generar
// proyecto», el «Aceptar» de
// documentos, el «Aceptar Obs. y Cláusulas», el «Aceptar» de descuentos/verificación, ni la casilla de la cláusula de
// declaración. «Continuar» del paso 3 NO es un avance neutro: lanza «Verificando controles técnicos» + «Calculando las
// primas» (es lo que lleva a precio): PERMITIDO por Alberto (14/10/2026), solo por `pulsarContinuarMapfre` desde «Figuras».
// Datos personales: la matrícula, los NIF, las fechas y el IBAN solo se escriben en su campo; nunca en logs ni mensajes.
//
// v0.8.0 (15/10/2026) · GRABACIÓN COMPLETA de Alberto (Chrome Recorder, saneada) de matrícula → precio. Lo que cambia:
//   · «Selección de vehículo»: la fila se elige por REGLA FIJA (`indiceFilaVehiculoMapfre`: una sola fila, o la ÚNICA que casa
//     con los datos del riesgo); si no → atasco + `ErrorEleccionVersion` (una persona elige). Confirma el guard (`indice`).
//   · Figuras: la licencia vive en `datos-licencia` (pestaña «Tomador»: el tomador es el conductor), con su mat-select de clase
//     de permiso y «Valido desde» (fecha del carné). La compañía anterior es un mat-select (capa común) y el «Nº de Póliza»
//     anterior NO está en el riesgo: si el portal lo exige → `datos`; si no, se deja como está.
//   · Tras «Continuar» desde Figuras sale el diálogo «Club MAPFRE»: se cierra por `ctx.cerrarClubMapfre` (botón izquierdo).
// v0.8.1 (15/10/2026, trabajo real 39c8016e) · con la versión elegida por etiqueta (código null) el bot SÍ eligió la fila y
//   aceptó («Resumen vehículo» a la vista), pero paró pidiendo el mat-select «uso», que ese flujo NO pinta (ni «ámbito»; la
//   grabación tampoco los toca antes de «Continuar»). Uso y ámbito pasan a OPCIONALES: si no aparecen, se sigue; un mat-select
//   obligatorio (clase de permiso, compañía anterior) que no aparece → atasco + hueco.
// v0.8.2 (15/10/2026, trabajo real con uso null) · `app-datos-vehiculo` deja los mat-select de uso/ámbito en el DOM SIN pintar:
//   la espera contaba `count()` (ocultos incluidos), el opcional «aparecía» y la capa común paraba con «0 visibles» → atasco.
//   Ahora presente = VISIBLE (`apareceEn`). Regla dura intacta: valor no por defecto + ausente → atasco.
//   · Coberturas: espera robusta de las tarjetas de prima; se LEE y se PARA. «Ir a generar» / «Generar Proyecto» bloqueados
//     en el guard común (guard-emision.ts) y nunca nombrados como acción aquí.
// v0.8.11 (20/10/2026, HTML del fallo ff13b5d3 leído): en MOTO «Figuras» solo trae `app-tomador` (datos-basicos, datos-direccion,
//   datos-licencia: clase y «Valido desde») y NO existe `app-historial-siniestralidad`. «Procedencia Siniestralidad», «Expuestos/Años»,
//   «Siniestros» y «Bonus Malus» son de `app-info-descuentos` (paso Coberturas, ya montado en el DOM), con los inputs DESHABILITADOS:
//   los calcula el portal. Compañía anterior, nº de póliza y siniestros no se piden en moto → se omiten (`planFigurasSinHistorial`);
//   moto con siniestros > 0 sin dónde declararlos → atasco + hueco (no se calla). Coche sin el bloque sigue siendo hueco.
// v0.8.10 (20/10/2026, trabajo real de moto ff13b5d3): en MOTO el paso «Figuras» pinta etiquetas «Procedencia Siniestralidad»,
//   «Expuestos/Años», «Siniestros» y «Modificación Manual Niveles Bonus Malus» y NINGUNA de «compañía anterior»; el inventario no
//   trae ni `app-historial-siniestralidad` ni `#companiaAnteriorSlide-input`. Sin evidencia de qué control es el equivalente (no hay
//   grabación de moto) NO se inventa selector ni clic: el hueco de «compañía anterior» ahora LISTA el bloque (`describirBloqueHistorial`).
// v0.8.9 (19/10/2026, decisión de Alberto: «las diferencias entre acabados no son influyentes; el cliente revisa en la emisión»): varias
//   filas y ninguna casa SOLA → se elige SOLA si son equivalentes (`filaVehiculoPorEquivalencia`, regla común de module-tarificacion:
//   CV ±10 %, cc ±5 %; la de fecha de inicio más cercana (≤) a la matriculación o la primera) y se DECLARA en el aviso de supuestos.
//   Solo si difieren de forma MATERIAL → `ErrorEleccionVersion` con todas (como la 0.8.8). Coche y moto.
// v0.8.8 (19/10/2026, decisión de Alberto: «puede dar el precio de otro coche»): se REVOCA el «primero de la lista» de la 0.8.6. Varias
//   filas y ninguna casa SOLA (elección de la bandeja, vehículo confirmado, marca+modelo[+cc]) → `ErrorEleccionVersion` (requiere_humano)
//   con TODAS las filas (`opcionesFilasVehiculo`: denominación · CV · cc · fecha). Coche y moto.
// v0.8.6 (18/10/2026, trabajos reales a59d12ac / 9aaeb074) · «requiere_eleccion_version» (5 filas en «Selección de vehículo»): Alberto
//   decide que, si ninguna fila casa SOLA con el riesgo, se coge la PRIMERA y se DECLARA («Precio con supuestos: vehículo/versión:
//   el primero de la lista (supuesto, había N)»), como en Allianz Turismos. Casada por regla fija = dato, sin supuesto. Coche y moto.
// v0.8.5 (15/10/2026, trabajo real 815f6675) · en «Coberturas» con primas visibles moría por atasco: el lector exigía 2 decimales
//   («670,1 €» no casaba) y que TODAS las tarjetas tuvieran prima (TODO RIESGO sale bloqueada por «controles técnicos»). Ahora 0-2
//   decimales + miles, y una tarjeta bloqueada se omite si otra tiene prima. Sin ninguna prima → atasco como antes. Solo lectura.
// v0.8.4 (15/10/2026, trabajo real 39c8016e) · ya en «Figuras», moría `error_definitivo` en `fill` sobre «siniestros RC 5 años»
//   (input DESHABILITADO: la grabación no lo toca). Ningún `fill` sobre un campo no editable: con 0 siniestros se deja como lo
//   pinta el portal; con >0 → atasco + hueco. Y la red de la capa común (formador.ts) atasca un TimeoutError sobre un control.
// v0.8.3 (15/10/2026, trabajo real 39c8016e) · tras «Continuar» desde «Objeto asegurado» NO llegaba a «Figuras». La grabación
//   rellena el CP de circulación y SALE del campo (Tab) antes de «Continuar»; el bot lo escribía y pulsaba «Continuar» con el
//   foco aún dentro: NSEI valida el CP al salir (asíncrono) y el clic llegaba con el control sin asentar. Ahora cada campo de
//   texto: escribir → relectura → SALIR del campo (`blur`) → esperar a que se asiente (sin `ng-pending` ni spinner). Y si un
//   «Continuar» no llega a su destino, el hueco NOMBRA los campos con `mat-error` visible (solo etiquetas, redactadas).

import type { Frame, Locator, Page } from 'playwright'
import {
  AMBITO_CIRCULACION_POR_DEFECTO,
  documentoTomadorDe,
  EmisionBloqueadaError,
  importeEs,
  normalizarMatricula,
  redactarDatosPersonales,
  resolverVersion,
  textoSupuestos,
  supuestoConductorTomador,
  conAntecedentesFavorables,
  conDatosUsados,
  elegirVersionAutomaticamente,
  referenciaRiesgoVersion,
  USO_VEHICULO_POR_DEFECTO,
  vehiculoConfirmadoDesdeMapfre,
  type CandidatoVersion,
  type DatosTomadorFicha,
  type EleccionVersion,
  type FormularioAuto,
  type OfertaNormalizada,
  type ResultadoAdaptador,
  type Vehiculo,
  type VehiculoConfirmado,
} from '@central/module-tarificacion'
import type { ContextoPortal } from '../../adaptador.ts'
import { ErrorTarificador } from '../../errores.ts'
import { comprobarCampo, ErrorEleccionVersion } from '../allianz/auto.ts'
import { fechaEs } from '../allianz/intranet/index.ts'
import { campoConRespaldo, claveCampo, registrarAtasco, type ContextoFormador } from '../../formador.ts'
import { abrirTarificacionRapidaAuto } from './entrada.ts'
import { login } from './login.ts'
import { pasoActivoMapfre, SEL_CLUB_MAPFRE, SEL_FILAS_DIALOGO_PERSONAS } from '../../guard.ts'
import { ErrorOpcionSinResolver } from '../../mat-select.ts'

/**
 * Hueco declarado: falta un dato de la grabación. NO transitorio → `error_definitivo`, no se reintenta. Con
 * `pideInventarioDom` el runner adjunta el INVENTARIO DE ESTRUCTURA de la pantalla (solo lectura, saneado; como Allianz)
 * para mapearla sin otra grabación humana.
 */
export class ErrorMapaIncompleto extends ErrorTarificador {
  readonly pideInventarioDom: boolean
  constructor(que: string, pideInventarioDom = false) {
    super('portal', `mapfre/auto: mapa incompleto: faltan ${que}`)
    this.name = 'ErrorMapaIncompleto'
    this.pideInventarioDom = pideInventarioDom
  }
}

// ───────────────────────── mapa de pantallas (grabación 13/10/2026) ─────────────────────────

/** Los 6 pasos del stepper de NSEI y el componente Angular que los pinta (selector de ámbito para no mezclar campos homónimos). */
export const PASOS_NSEI = [
  { n: 1, id: 'datosBasicos', nombre: 'Datos básicos', componente: 'app-datos-basicos' },
  { n: 2, id: 'objetoAsegurado', nombre: 'Objeto asegurado', componente: 'app-objeto-asegurado' },
  { n: 3, id: 'figuras', nombre: 'Figuras', componente: 'app-figuras' },
  { n: 4, id: 'coberturas', nombre: 'Coberturas', componente: 'app-coberturas' },
  { n: 5, id: 'proyectos', nombre: 'Proyectos', componente: 'app-proyecto' },
  { n: 6, id: 'contratacion', nombre: 'Contratación (emite; sin selector a propósito)', componente: null },
] as const
export type IdPasoNsei = (typeof PASOS_NSEI)[number]['id']

/** Qué trae cada pantalla de la grabación (documental y probado: los rangos son contiguos y cubren 1-19). */
export const PANTALLAS_GRABACION = [
  { desde: 1, hasta: 1, paso: null, que: 'carga de NSEI («Petición en curso», «Cargando estructura del usuario»)' },
  { desde: 2, hasta: 3, paso: 'datosBasicos', que: 'Datos básicos vacío; el formulario cambia al pasar el tomador a persona jurídica (razón social en vez de nombre y apellidos)' },
  { desde: 4, hasta: 4, paso: 'datosBasicos', que: 'tomador cargado tras la búsqueda por NIF/CIF; paso 1 completado' },
  { desde: 5, hasta: 5, paso: 'objetoAsegurado', que: 'diálogo «Selección de vehículo» tras teclear la matrícula (filas con denominación, CV/KW, CC, puertas, fecha de inicio)' },
  { desde: 6, hasta: 6, paso: 'objetoAsegurado', que: 'vehículo elegido: «Resumen vehículo», uso y ámbito de circulación; 1ª matriculación autorrellenada' },
  { desde: 7, hasta: 12, paso: 'figuras', que: 'conductor habitual (búsqueda por NIF; p09 = «NO EXISTE NINGUN REGISTRO PARA ESA CONDICION DE BUSQUEDA»), permiso de conducir, historial de siniestralidad' },
  { desde: 13, hasta: 13, paso: 'figuras', que: 'modal «Verificando controles técnicos» + «Calculando las primas» tras «Continuar»' },
  { desde: 14, hasta: 16, paso: 'coberturas', que: 'PRECIO: 3 productos con prima total y cuadro de coberturas; botones de contratar y de generar proyecto' },
  { desde: 17, hasta: 17, paso: 'coberturas', que: 'modal «Generando proyecto» (se pulsó Generar Proyecto en la grabación)' },
  { desde: 18, hasta: 19, paso: 'proyectos', que: 'nº de proyecto, idioma y tipo de documento; modal «Generando documentación» (se confirmó el paso de documentos)' },
] as const

export const TOTAL_PANTALLAS_GRABACION = 19

// ───────────────────────── selectores (por name/formcontrolname, NUNCA por mat-input-N) ─────────────────────────
// Los `id` `mat-input-N`/`mat-select-N`/`mat-checkbox-N` son contadores de Angular Material y cambian entre cargas.
// Los nombres de campo se repiten entre componentes (`codigoDocumento`, `codpostal`, `siniestros`…): siempre con ámbito.

/** Paso 2 · `app-datos-vehiculo`. */
export const SEL_OBJETO = {
  matricula: 'app-datos-vehiculo input[name="matricula"]',
  bastidor: 'app-datos-vehiculo input[name="bastidor"]',
  /** MM/AAAA; se autorrellena al elegir el vehículo en el diálogo. */
  primeraMatriculacion: 'app-datos-vehiculo input[name="dateMatriculacion"]',
  /** CP de circulación (el `name` es `cpCirculacion`, el control reactivo `codPostal`). */
  cpCirculacion: 'app-datos-vehiculo input[name="cpCirculacion"]',
  /** «Buscador de vehículos»: combobox predictivo; se rellena solo al elegir en el diálogo. */
  buscadorVehiculo: 'app-datos-vehiculo input[formcontrolname="txtPredictivo"]',
  /** mat-select (necesitan abrirse con un clic → hueco, ver `OperacionNsei`). */
  uso: 'app-datos-vehiculo mat-select[formcontrolname="uso"]',
  ambitoCirculacion: 'app-datos-vehiculo mat-select[formcontrolname="ambitoCirculacion"]',
  km0: 'app-datos-vehiculo mat-checkbox[formcontrolname="km0"]',
} as const

/** Paso 2 · diálogo «Selección de vehículo» (`app-matricula-dialog`). Solo LECTURA de filas; elegir una fila es un clic (hueco). */
export const SEL_DIALOGO_VEHICULO = {
  contenedor: 'app-matricula-dialog',
  filas: 'app-matricula-dialog table tbody tr',
  celda: 'td',
} as const

/** Posición de las celdas de una fila del diálogo. Se leen SOLO la 3 en adelante (la 1 y la 2 son matrícula y bastidor: dato personal). */
export const COLUMNA_DIALOGO = { denominacion: 3, cvKw: 4, cc: 5, puertas: 6, fechaInicio: 7 } as const

/** Paso 2 · «Resumen vehículo» (pares `<span>Etiqueta:</span><span>valor</span>` dentro de `app-datos-vehiculo`). */
export const SEL_RESUMEN_VEHICULO = {
  titulo: 'app-datos-vehiculo mat-expansion-panel-header mat-panel-description span',
  pares: 'app-datos-vehiculo mat-expansion-panel-header ~ div div > div',
} as const

/** Paso 1 · Datos básicos: tomador y compañía. El NIF se teclea y Mapfre busca sola al salir del campo (sin lupa). */
export const SEL_TOMADOR = {
  /** Ámbito del paso 1. */
  ambito: 'app-datos-basicos',
  documento: 'app-datos-basicos input[name="codigoDocumento"]',
  razonSocial: 'app-datos-basicos input[name="razonSocial"]',
  /** Alta del tomador nuevo (DOM real 14/10/2026): campos del mismo formulario, vacíos si Mapfre no lo conoce. */
  nombre: 'app-datos-basicos input[name="nombre"]',
  primerApellido: 'app-datos-basicos input[name="primerApellido"]',
  segundoApellido: 'app-datos-basicos input[name="segundoApellido"]',
  fechaNacimiento: 'app-datos-basicos input[name="fechaNacimiento"]',
} as const

/**
 * Paso 3 · Figuras → pestaña «Tomador» → panel `datos-licencia` (grabación 15/10/2026): mat-select de clase de permiso (1.er
 * campo) y «Valido desde» (fecha del carné, dd/mm/aaaa). El `name` del input no sale en la grabación: va el grabado el 13/10
 * (`fechaExpedicion`) y, si no está, la ETIQUETA del portal dentro del panel; después, la capa común.
 */
export const SEL_LICENCIA = {
  ambito: 'datos-licencia',
  clasePermiso: 'datos-licencia mat-select',
  fechaCarne: 'datos-licencia input[name="fechaExpedicion"], datos-licencia input[formcontrolname="fechaExpedicion"]',
  /** Texto de la etiqueta del campo de la fecha del carné en el portal. */
  etiquetaFechaCarne: 'Valido desde',
} as const

/** Paso 3 · Figuras → `app-conductor-habitual` (+ `app-historial-siniestralidad` anidado). Grabación 13/10/2026. */
export const SEL_CONDUCTOR = {
  documento: 'app-conductor-habitual input[name="codigoDocumento"]',
  fechaNacimiento: 'app-conductor-habitual input[name="fechaNacimiento"]',
  /** mat-select de clase de permiso (en la grabación, «B»). */
  claseCarne: 'app-conductor-habitual mat-select[name="codigoTipoLicencia"]',
  fechaCarne: 'app-conductor-habitual input[name="fechaExpedicion"]',
} as const

export const SEL_HISTORIAL = {
  /** Interruptor «¿Tiene compañía anterior?» (mat-slide-toggle; su input es visualmente oculto → clic, hueco). */
  tieneCompaniaAnterior: '#companiaAnteriorSlide-input',
  companiaAnterior: 'app-historial-siniestralidad mat-select[formcontrolname="companiaAnterior"]',
  numPoliza: 'app-historial-siniestralidad input[formcontrolname="numPoliza"]',
  /** Años en la compañía anterior: llega DESHABILITADO (lo calcula el portal). Nunca se escribe. */
  aniosCompaniaAnterior: 'app-historial-siniestralidad input[formcontrolname="tiempoAntComp"]',
  /** «Siniestros RC 5 últimos años» (numérico). */
  siniestrosRc5: 'app-historial-siniestralidad input[formcontrolname="siniestros"]',
} as const

/** Paso 4 · Coberturas: tarjetas de producto. Solo lectura. */
export const SEL_PRIMAS = {
  /** Grabación 13/10 (`app-primas`); la del 15/10 pinta el paso dentro de `app-coberturas`. Un elemento cuenta una vez. */
  producto: 'app-primas prima-producto, app-coberturas prima-producto',
  /** Los dos `mat-select` de la cabecera de cada tarjeta: 1º producto comercial, 2º periodicidad. */
  desplegables: 'mat-select .mat-select-value-text',
  prima: '.caja-primas p strong',
  /** Icono de aviso junto al botón de contratar: «Es obligatorio realizar la verificación del vehículo». */
  avisoVerificacion: '.ccttVerificacion .warning-color',
} as const

/**
 * RESPALDO de campos (Regla «todo bot con IA detrás», 14/10/2026): la pestaña NSEI y el formador del trabajo. Si el selector
 * fijo de un campo no aparece, `campoConRespaldo` (formador.ts) prueba lo aprendido y la IA (campo editable con la etiqueta de
 * su fila contrastada). Sin él (tests, explorador) = como siempre. Este fichero sigue sin pulsar: solo escribe en campos.
 */
export type RespaldoCampos = { page: Page | null; formador: ContextoFormador | undefined }
const SIN_RESPALDO: RespaldoCampos = { page: null, formador: undefined }

// ───────────────────────── lectura de primas (puro + lector) ─────────────────────────

export type TarjetaProductoLeida = {
  /** Texto del 1º desplegable (producto comercial). */
  producto: string
  /** Texto del 2º desplegable (periodicidad). */
  periodicidad: string
  /** Texto de «PRIMA TOTAL: 123,45 €». */
  textoPrima: string
  /** Hay icono de aviso de verificación del vehículo. */
  avisoVerificacion: boolean
  /** Texto completo de la tarjeta (para reconocer «Existen controles técnicos que impiden tarificar…» y de respaldo de la prima). */
  textoTarjeta?: string
}

export type PrimaProductoMapfre = { producto: string; periodicidad: 'anual'; primaTotalEur: number; requiereVerificacionVehiculo: boolean }

const limpiar = (s: string) => s.replace(/\s+/g, ' ').trim()

/**
 * Importe de «PRIMA TOTAL: 1.234,56 €». Fail-closed: sin la etiqueta, con basura o ≤ 0 → `null` (nunca 0).
 * El placeholder `{{primaTotal}}` que la plantilla deja en el paso 6 sin calcular tampoco casa.
 */
export function importeDePrimaTotal(texto: string | null | undefined): number | null {
  if (typeof texto !== 'string') return null
  // 0, 1 o 2 decimales y miles con punto opcional: «670,1 €», «392,02 €», «1.234 €», «1.234,56 €» (v0.8.5).
  const m = /PRIMA\s+TOTAL\s*:\s*(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)\s*€/i.exec(limpiar(texto))
  if (!m) return null
  const n = importeEs(m[1]!)
  return n !== null && n > 0 ? n : null
}

/** v0.8.5 · Prima de una tarjeta: la caja de prima y, si el selector no la encuentra, el texto entero de la tarjeta. */
function primaDeTarjeta(t: TarjetaProductoLeida): number | null {
  return importeDePrimaTotal(t.textoPrima) ?? importeDePrimaTotal(t.textoTarjeta)
}

/** v0.8.5 · Tarjeta SIN prima porque Mapfre la bloquea («Existen controles técnicos que impiden tarificar…»): no es un error. */
export function tarjetaBloqueadaPorControles(t: TarjetaProductoLeida): boolean {
  return primaDeTarjeta(t) === null && /controles\s+t[eé]cnicos|impiden\s+tarificar/i.test(limpiar(`${t.textoTarjeta ?? ''} ${t.textoPrima}`))
}

/** Firma de estabilidad de las tarjetas: solo los campos normalizados (no el textContent crudo, que puede variar entre lecturas). */
export function firmaTarjetas(tarjetas: readonly TarjetaProductoLeida[]): string {
  return JSON.stringify(tarjetas.map((t) => [limpiar(t.producto), limpiar(t.periodicidad), primaDeTarjeta(t), tarjetaBloqueadaPorControles(t), t.avisoVerificacion]))
}

/** v0.8.5 · ¿Todas las tarjetas están resueltas (con prima o bloqueadas) y AL MENOS UNA tiene prima? */
export function tarjetasListasParaLeer(tarjetas: readonly TarjetaProductoLeida[]): boolean {
  return tarjetas.some((t) => primaDeTarjeta(t) !== null) && tarjetas.every((t) => primaDeTarjeta(t) !== null || tarjetaBloqueadaPorControles(t))
}

/**
 * Tarjetas leídas → primas. Las bloqueadas por controles técnicos se omiten (v0.8.5) si otra tiene prima. Fail-closed: una tarjeta cuya prima no se lee es un error `portal` (no se omite en silencio, que
 * dejaría un producto «inexistente»); ninguna tarjeta → error; periodicidad distinta de ANUAL → hueco (no se convierte).
 */
export function primasDesdeTarjetas(tarjetas: readonly TarjetaProductoLeida[]): PrimaProductoMapfre[] {
  if (tarjetas.length === 0) throw new ErrorTarificador('portal', 'mapfre/auto: el paso Coberturas no trae ninguna tarjeta de producto')
  const conPrima = tarjetas.filter((t) => !tarjetaBloqueadaPorControles(t))
  if (conPrima.length === 0) throw new ErrorTarificador('portal', 'mapfre/auto: todos los productos de Coberturas están bloqueados por controles técnicos (sin prima)')
  return conPrima.map((t) => {
    const producto = limpiar(t.producto)
    if (producto === '') throw new ErrorTarificador('portal', 'mapfre/auto: una tarjeta de producto no trae nombre')
    const prima = primaDeTarjeta(t)
    if (prima === null) throw new ErrorTarificador('portal', `mapfre/auto: prima ilegible en el producto «${producto}»`)
    if (limpiar(t.periodicidad).toUpperCase() !== 'ANUAL') throw new ErrorMapaIncompleto(`la periodicidad «${limpiar(t.periodicidad)}» del producto «${producto}» (solo se ha visto ANUAL)`)
    return { producto, periodicidad: 'anual' as const, primaTotalEur: prima, requiereVerificacionVehiculo: t.avisoVerificacion }
  })
}

/** Lee las tarjetas de precio del paso Coberturas ya calculado. Solo lectura. */
export async function leerPrimasMapfre(raiz: Pick<Frame, 'locator'>): Promise<PrimaProductoMapfre[]> {
  return primasDesdeTarjetas(await leerTarjetasPrima(raiz))
}

/** Tarjetas de producto tal cual (sin validar). Solo lectura. */
async function leerTarjetasPrima(raiz: Pick<Frame, 'locator'>): Promise<TarjetaProductoLeida[]> {
  return raiz.locator(SEL_PRIMAS.producto).evaluateAll(
    (els, s) =>
      els.map((e) => {
        const textos = Array.from(e.querySelectorAll(s.desplegables)).map((x) => x.textContent ?? '')
        return {
          producto: textos[0] ?? '',
          periodicidad: textos[1] ?? '',
          textoPrima: e.querySelector(s.prima)?.textContent ?? '',
          avisoVerificacion: e.querySelector(s.avisoVerificacion) !== null,
          textoTarjeta: e.textContent ?? '',
        }
      }),
    { desplegables: SEL_PRIMAS.desplegables, prima: SEL_PRIMAS.prima, avisoVerificacion: SEL_PRIMAS.avisoVerificacion },
  )
}

/** Primas → ofertas normalizadas (una por producto). `vehiculo` es opcional: Mapfre no separa marca y modelo (ver `lecturaResumenVehiculo`). */
export function ofertasDesdePrimasMapfre(primas: readonly PrimaProductoMapfre[], vehiculo: Vehiculo | null, supuestos: string | null = null, diagnostico: string | null = null): OfertaNormalizada[] {
  return primas.map((p) => ({
    compania: 'mapfre',
    producto: `Auto · ${p.producto}`,
    primaAnualEur: p.primaTotalEur,
    primaNetaEur: null,
    fraccionamiento: 'anual',
    importeReciboEur: p.primaTotalEur,
    coberturas: [],
    franquicias: [],
    validaHasta: null,
    referenciaPortal: null,
    pdf: null,
    desglose: null,
    avisos: [
      'PRIMA TOTAL anual de la tarjeta del producto; sin desglose neta/impuestos (el desglose está tras el botón «Desgloses», sin grabar).',
      ...(p.requiereVerificacionVehiculo ? ['Mapfre exige la verificación del vehículo antes de contratar este producto.'] : []),
      ...(vehiculo ? [`Vehículo según el catálogo de Mapfre: ${vehiculo.marca} ${vehiculo.modelo} ${vehiculo.version}.`] : []),
      // v0.8.6: lo que el bot SUPUSO (la fila del vehículo), junto al precio, como en Allianz. Asegura lo deja pasar (`supuestosDeAvisos`).
      ...(supuestos ? [supuestos] : []),
      // v0.8.12: diagnóstico de SOLO LECTURA del formato del «Nº de Póliza» anterior (atributos, nunca el valor). No es un supuesto.
      ...(diagnostico ? [diagnostico] : []),
    ],
  }))
}

// ───────────────────────── vehículo: diálogo de selección y resumen ─────────────────────────

export type FilaVehiculoDialogo = { denominacion: string; cvKw: string; cc: string; puertas: string; fechaInicio: string }

/**
 * Filas del diálogo «Selección de vehículo» (solo denominación, CV/KW, CC, puertas y fecha de inicio del catálogo).
 * NUNCA lee las columnas matrícula y bastidor. Solo lectura.
 */
export async function leerFilasDialogoVehiculo(raiz: Pick<Frame, 'locator'>): Promise<FilaVehiculoDialogo[]> {
  const filas = await raiz.locator(SEL_DIALOGO_VEHICULO.filas).evaluateAll(
    (els, s) =>
      els.map((tr) => {
        const c = Array.from(tr.querySelectorAll(s.celda)).map((x) => x.textContent ?? '')
        return [c[s.col.denominacion] ?? '', c[s.col.cvKw] ?? '', c[s.col.cc] ?? '', c[s.col.puertas] ?? '', c[s.col.fechaInicio] ?? '']
      }),
    { celda: SEL_DIALOGO_VEHICULO.celda, col: COLUMNA_DIALOGO },
  )
  return filas.map(([d, k, c, p, f]) => ({ denominacion: limpiar(d!), cvKw: limpiar(k!), cc: limpiar(c!), puertas: limpiar(p!), fechaInicio: limpiar(f!) }))
}

/**
 * Qué fila del diálogo hay que elegir. Una sola → esa; varias → tiene que haber `eleccionVersion` por etiqueta exacta
 * (denominación); si no, `ErrorEleccionVersion` (requiere_humano con las opciones). Devuelve el ÍNDICE de la fila.
 * Elegir la fila (un clic) y confirmar el diálogo NO está implementado: ver `elegirFilaDialogo`.
 */
export function indiceFilaVehiculo(filas: readonly FilaVehiculoDialogo[], eleccion: EleccionVersion | null): number {
  if (filas.length === 0) throw new ErrorTarificador('portal', 'mapfre/auto: el diálogo de selección de vehículo no trae ninguna fila')
  const candidatos: CandidatoVersion[] = filas.map((f) => ({ etiqueta: f.denominacion, codigo: null }))
  const r = resolverVersion(candidatos, eleccion)
  if (r.tipo === 'ambigua') throw new ErrorEleccionVersion(r.opciones)
  if (r.tipo === 'ninguna') throw new ErrorTarificador('portal', 'mapfre/auto: el diálogo de selección de vehículo no trae ninguna fila utilizable')
  const k = (e: string) => limpiar(e).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
  const coinciden = candidatos.flatMap((c, i) => (k(c.etiqueta) === k(r.candidato.etiqueta) ? [i] : []))
  // Dos filas con la MISMA denominación (distinta fecha de inicio o CV/KW) no se distinguen por etiqueta: se pregunta.
  if (coinciden.length !== 1) throw new ErrorEleccionVersion(candidatos)
  return coinciden[0]!
}

/** Etiqueta de una fila para la persona que elige (solo catálogo: denominación, CV, CC, fecha de inicio). PURA. */
export function etiquetaFilaVehiculo(f: FilaVehiculoDialogo): string {
  return [f.denominacion, f.cvKw && `${f.cvKw} CV`, f.cc && `${f.cc} cc`, f.fechaInicio].filter(Boolean).join(' · ')
}

/** Datos del riesgo con los que se elige la fila del diálogo cuando hay VARIAS (nunca la matrícula: esa la compara el guard). */
export type CriterioFilaVehiculo = Pick<FormularioAuto, 'eleccionVersion' | 'vehiculoConfirmado' | 'seleccionVehiculo' | 'fechaMatriculacion'>

/**
 * Fila de «Selección de vehículo» por REGLA FIJA (grabación 15/10/2026; sin IA ni «la primera»). PURA. Una fila → 0. Varias →
 * la ÚNICA que casa, en este orden: (1) la versión que eligió una persona (`eleccionVersion.etiqueta` = denominación exacta);
 * (2) el vehículo ya confirmado del riesgo (denominación exacta y, si hace falta desempatar, CV/CC/fecha de inicio); (3) la
 * marca y el modelo del riesgo como palabras de la denominación (y la cilindrada si consta). El riesgo no trae BASTIDOR, así
 * que no se usa. Ninguna o varias → `null`: el llamante registra atasco y pide a una persona (nunca se adivina).
 */
export function indiceFilaVehiculoMapfre(filas: readonly FilaVehiculoDialogo[], c: Partial<CriterioFilaVehiculo> | null | undefined): number | null {
  if (filas.length === 1) return 0
  if (filas.length === 0 || !c) return null
  const k = (t: string | null | undefined) => limpiar(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
  const unico = (pred: (f: FilaVehiculoDialogo, v: VehiculoConfirmado | null) => boolean): number | null => {
    const ix = filas.flatMap((f, i) => (pred(f, vehiculoConfirmadoDesdeMapfre(f)) ? [i] : []))
    return ix.length === 1 ? ix[0]! : null
  }
  const etiqueta = k(c.eleccionVersion?.etiqueta)
  if (etiqueta !== '') {
    const i = unico((f) => k(f.denominacion) === etiqueta) ?? unico((f) => k(etiquetaFilaVehiculo(f)) === etiqueta)
    if (i !== null) return i
  }
  const vc = c.vehiculoConfirmado
  if (vc && k(vc.denominacion) !== '') {
    const i = unico((f) => k(f.denominacion) === k(vc.denominacion)) ??
      unico((f, v) => k(f.denominacion) === k(vc.denominacion) && v !== null && v.cv === vc.cv && v.cc === vc.cc && v.fechaInicio === vc.fechaInicio)
    if (i !== null) return i
  }
  const sv = c.seleccionVehiculo
  if (sv && k(sv.marca) !== '' && k(sv.modelo) !== '') {
    const palabras = (t: string) => ` ${k(t).replace(/[^A-Z0-9]+/g, ' ').trim()} `
    const casa = (f: FilaVehiculoDialogo) => palabras(f.denominacion).includes(palabras(sv.marca)) && palabras(f.denominacion).includes(palabras(sv.modelo))
    const i = unico(casa) ?? (typeof sv.cilindradaCc === 'number' ? unico((f, v) => casa(f) && v?.cc === sv.cilindradaCc) : null)
    if (i !== null) return i
  }
  return null
}

/**
 * v0.8.8 (19/10/2026): varias filas en «Selección de vehículo» y ninguna casa SOLA con el riesgo → NO se elige («la primera» pudo
 * dar el precio de otro coche): `ErrorEleccionVersion` (requiere_humano) con TODAS las filas, cada una con su texto exacto y sus
 * datos de catálogo (`etiquetaFilaVehiculo`: denominación · CV · cc · fecha). La etiqueta elegida vuelve en `eleccionVersion` y
 * `indiceFilaVehiculoMapfre` la casa exacta (denominación o etiqueta completa). PURA.
 */
export function opcionesFilasVehiculo(filas: readonly FilaVehiculoDialogo[]): CandidatoVersion[] {
  return filas.map((f) => ({ etiqueta: etiquetaFilaVehiculo(f), codigo: null }))
}

/**
 * v0.8.9 (19/10/2026, decisión de Alberto: «las diferencias entre acabados no son influyentes; el cliente revisa en la emisión»):
 * varias filas y ninguna casa SOLA por regla fija → se elige SOLA si son EQUIVALENTES (CV ±10 %, cc ±5 % entre sí y compatibles con
 * el riesgo; combustible exacto si consta): la de fecha de inicio más cercana (≤) a la 1ª matriculación o, sin fechas, la primera del
 * portal, y se DECLARA (`supuesto`). Si difieren de forma MATERIAL (CV/cc fuera de tolerancia) → `ErrorEleccionVersion` con TODAS las
 * filas, como en la 0.8.8. La elección de la bandeja se respeta exacta (`indiceFilaVehiculoMapfre`, antes que esto). PURA.
 */
export function filaVehiculoPorEquivalencia(filas: readonly FilaVehiculoDialogo[], c: Partial<CriterioFilaVehiculo> | null | undefined): { indice: number; supuesto: string | null } {
  const casada = indiceFilaVehiculoMapfre(filas, c)
  if (casada !== null) return { indice: casada, supuesto: null }
  const r = elegirVersionAutomaticamente(
    filas.map((f) => {
      const v = vehiculoConfirmadoDesdeMapfre(f)
      return { etiqueta: etiquetaFilaVehiculo(f), codigo: null, datos: { cv: v?.cv ?? null, cc: v?.cc ?? null, puertas: v?.puertas ?? null, fechaInicio: v?.fechaInicio ?? null } }
    }),
    // La elección de la bandeja que no casó arriba NO se ignora: `elegirVersionAutomaticamente` la vuelve a preguntar.
    { riesgo: referenciaRiesgoVersion(c ?? null), eleccion: c?.eleccionVersion ?? null },
  )
  if (r.tipo === 'automatica' || r.tipo === 'bandeja' || r.tipo === 'unica') return { indice: r.indice, supuesto: r.supuesto }
  throw new ErrorEleccionVersion(opcionesFilasVehiculo(filas))
}

const ESPERA_DIALOGO_VEHICULO_MS = 15_000

/** Cómo se abrió «Selección de vehículo»: ya estaba abierto al teclear, o al salir del campo (blur/focusout/change). */
export type DisparoBusquedaMatricula = 'al_teclear' | 'salir_del_campo'

async function dialogoVehiculoVisible(nsei: Page, ms: number): Promise<boolean> {
  return nsei.locator(SEL_DIALOGO_VEHICULO.contenedor).first().waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false)
}

/**
 * Lanza la búsqueda por MATRÍCULA (DOM real de la prueba del 15/10/2026, v0.7.2): junto al campo `input[name=matricula]` NO
 * hay lupa (el botón `matsuffix` de al lado es `button.infoButton` con el icono `info_outlined`; la lupa `search` es la del
 * «Buscador de vehículos» predictivo `txtPredictivo`, OTRA búsqueda) y en la página no hay ningún `type=submit`. El campo
 * quedó `mat-focused` + `ng-dirty` + `ng-untouched`: el robot tecleó y NUNCA salió de él. Como el NIF del tomador, Mapfre
 * busca AL SALIR DEL CAMPO: `blur` (dispara blur/focusout/change). Ni Intro ni clics: este adaptador no teclea teclas ni
 * pulsa (guardián de mapfre-auto.test.ts). Devuelve el disparo que abrió el diálogo, o `null` (el llamante lo convierte en
 * atasco de la capa común).
 */
export async function lanzarBusquedaMatricula(nsei: Page, campo: Locator, esperaMs = ESPERA_DIALOGO_VEHICULO_MS): Promise<DisparoBusquedaMatricula | null> {
  // Ya abierto (un portal que busca al teclear): no se toca nada más.
  if (await dialogoVehiculoVisible(nsei, 300)) return 'al_teclear'
  await campo.blur().catch(() => undefined)
  return (await dialogoVehiculoVisible(nsei, esperaMs)) ? 'salir_del_campo' : null
}

/**
 * Hueco del paso 2 (búsqueda por matrícula): checkpoint de ATASCO por la capa común (Telegram + elección de Alberto, como el
 * tomador) y `ErrorMapaIncompleto` con inventario. Sin valores (ni la matrícula) en ningún texto.
 */
async function huecoVehiculo(nsei: Page, formador: ContextoFormador | undefined, que: string): Promise<never> {
  await registrarAtasco(nsei, formador, {
    clave: claveCampo('matricula busqueda vehiculo'),
    tipo: 'campo',
    etiqueta: 'Matrícula',
    descripcion: `Paso 2 «Objeto asegurado» de Mapfre NSEI: ${que}. El robot salió del campo; no teclea Intro ni pulsa botones (ni la lupa) a ciegas.`,
  }).catch(() => undefined)
  throw new ErrorMapaIncompleto(que, true)
}

/**
 * Paso 2 · VEHÍCULO CONFIRMADO por matrícula (coche y moto). Con el paso «Objeto asegurado» activo en `nsei` (la pestaña de
 * NSEI): teclea la matrícula (`comprobarCampo` + `fill`), LANZA la búsqueda (`lanzarBusquedaMatricula`: salir del campo), espera el diálogo «Selección de vehículo», lee sus filas (sin
 * matrícula ni bastidor), elige la fila por REGLA FIJA (`indiceFilaVehiculoMapfre`; sin regla → atasco + elección de una
 * persona) y la confirma por `ctx.confirmarVehiculoMapfre` (guard.ts compara allí la matrícula de esa fila con la del riesgo;
 * no casa → `datos`). 0 filas → `datos`. Devuelve el vehículo SIN matrícula.
 * Ningún mensaje lleva la matrícula. No aparece el campo o el diálogo → ATASCO (capa común) + `ErrorMapaIncompleto` con inventario.
 */
export async function consultarVehiculoPorMatricula(
  nsei: Page,
  matricula: string,
  ctx: Pick<ContextoPortal, 'confirmarVehiculoMapfre'>,
  esperaDialogoMs = ESPERA_DIALOGO_VEHICULO_MS,
  respaldo: RespaldoCampos = SIN_RESPALDO,
  criterio: Partial<CriterioFilaVehiculo> | null = null,
): Promise<VehiculoConfirmado> {
  return (await consultarVehiculoPorMatriculaConSupuesto(nsei, matricula, ctx, esperaDialogoMs, respaldo, criterio)).vehiculo
}

/** Como `consultarVehiculoPorMatricula`, y además devuelve el supuesto de versión (fila elegida sola por equivalencia) si lo hubo. */
export async function consultarVehiculoPorMatriculaConSupuesto(
  nsei: Page,
  matricula: string,
  ctx: Pick<ContextoPortal, 'confirmarVehiculoMapfre'>,
  esperaDialogoMs = ESPERA_DIALOGO_VEHICULO_MS,
  respaldo: RespaldoCampos = SIN_RESPALDO,
  criterio: Partial<CriterioFilaVehiculo> | null = null,
): Promise<{ vehiculo: VehiculoConfirmado; supuestoVersion: string | null }> {
  if (!ctx.confirmarVehiculoMapfre) throw new ErrorMapaIncompleto('la función guardada que confirma el vehículo (contexto sin `confirmarVehiculoMapfre`)')
  const r = await campoConRespaldo(nsei, SEL_OBJETO.matricula, { ...respaldo, page: respaldo.page ?? null, etiqueta: 'Matrícula', descripcion: 'Campo «Matrícula» del vehículo en el paso «Objeto asegurado» de Mapfre NSEI' })
  if (!r) throw new ErrorMapaIncompleto('el campo de matrícula del paso «Objeto asegurado» (no aparece)', true)
  const campo = r.campo
  await comprobarCampo(campo)
  if (!(await esperarEditable(campo))) await huecoVehiculo(nsei, respaldo.formador, 'el campo de matrícula del paso «Objeto asegurado» (está deshabilitado: no se escribe)')
  await campo.fill(matricula)
  if (normalizarMatricula(await campo.inputValue()) !== normalizarMatricula(matricula)) throw new ErrorTarificador('portal', 'mapfre/auto: el portal no dejó fijada la matrícula')
  await r.confirmar().catch(() => undefined)
  const disparo = await lanzarBusquedaMatricula(nsei, campo, esperaDialogoMs)
  if (!disparo) await huecoVehiculo(nsei, respaldo.formador, 'cómo se lanza la búsqueda por matrícula (tras teclearla y salir del campo no aparece «Selección de vehículo»)')
  respaldo.formador?.log('mapfre_busqueda_matricula', { disparo })
  const filas = await leerFilasDialogoVehiculo(nsei)
  if (filas.length === 0) throw new ErrorTarificador('datos', 'mapfre/auto: «Selección de vehículo» no trae ningún vehículo para la matrícula del riesgo')
  // Fila por REGLA FIJA (v0.8.0): una sola, o la única que casa con el riesgo (dato). v0.8.9: si no casa ninguna SOLA, se elige
  // la equivalente (declarada) o, si difieren de forma material, `ErrorEleccionVersion` con las filas y sus datos (requiere_humano).
  const { indice, supuesto: supuestoVersion } = filaVehiculoPorEquivalencia(filas, criterio)
  const vehiculo = vehiculoConfirmadoDesdeMapfre(filas[indice]!)
  if (!vehiculo) throw new ErrorTarificador('portal', 'mapfre/auto: la fila de «Selección de vehículo» no trae denominación comercial legible')
  // El guard confirma ESA fila y exige que su matrícula sea la del riesgo (la comparación no sale de guard.ts).
  await ctx.confirmarVehiculoMapfre(nsei, matricula, indice, filas[indice]!.denominacion)
  return { vehiculo, supuestoVersion }
}

export type ResumenVehiculoMapfre = {
  /** Denominación completa: marca + modelo + versión en UN solo texto (Mapfre no los separa). */
  denominacion: string | null
  combustible: string | null
  tipoVehiculo: string | null
  /** Texto de «Potencia:» sin unidad confirmada (la grabación enseña un valor con «KWT: 0,00» al lado). */
  potencia: string | null
  codigoMapfre: string | null
  cambio: string | null
}

/** Pares etiqueta→valor del «Resumen vehículo» (`Combustible:`, `Potencia:`…) a un objeto. Puro. Vacío o guion → `null`. */
export function resumenDesdePares(titulo: string | null, pares: ReadonlyArray<readonly [string, string]>): ResumenVehiculoMapfre {
  const m = new Map<string, string>()
  for (const [k, v] of pares) {
    const clave = limpiar(k).replace(/:$/, '').toLowerCase()
    const valor = limpiar(v)
    if (clave !== '' && valor !== '' && !m.has(clave)) m.set(clave, valor)
  }
  const t = titulo === null ? '' : limpiar(titulo)
  return {
    denominacion: t === '' ? null : t,
    combustible: m.get('combustible') ?? null,
    tipoVehiculo: m.get('tipo vehículo') ?? null,
    potencia: m.get('potencia') ?? null,
    codigoMapfre: m.get('cod. mapfre') ?? null,
    cambio: m.get('cambio') ?? null,
  }
}

/** Lee el «Resumen vehículo». Solo lectura. */
export async function leerResumenVehiculo(raiz: Pick<Frame, 'locator'>): Promise<ResumenVehiculoMapfre> {
  const titulo = await raiz.locator(SEL_RESUMEN_VEHICULO.titulo).first().textContent({ timeout: 1_000 }).catch(() => null)
  const pares = await raiz.locator(SEL_RESUMEN_VEHICULO.pares).evaluateAll((els) =>
    els.flatMap((e) => {
      const s = Array.from(e.children).filter((c) => c.tagName === 'SPAN')
      return s.length === 2 ? [[s[0]!.textContent ?? '', s[1]!.textContent ?? '']] : []
    }),
  )
  return resumenDesdePares(titulo, pares as Array<[string, string]>)
}

// ───────────────────────── plan de campos (puro) ─────────────────────────

/** Cómo se escribe un campo. Solo `texto` se sabe hacer sin pulsar nada; el resto necesita un clic (hueco). */
export type OperacionNsei = {
  sel: string
  etiqueta: string
  tipo: 'texto' | 'mat-select' | 'interruptor' | 'casilla'
  valor: string | boolean
  paso: IdPasoNsei
  /** mat-select: textos de Mapfre aceptables, en orden de preferencia (`MAPEO_MAPFRE_AUTO`). */
  opciones?: readonly string[]
  /** Texto: si `sel` no aparece, se busca el campo por la ETIQUETA del portal dentro de `ambito` (antes de la capa común). */
  porEtiqueta?: { ambito: string; etiqueta: string }
  /**
   * v0.8.1 (trabajo real 39c8016e, 15/10/2026): el control NO sale en todos los flujos. Tras elegir el vehículo en «Selección
   * de vehículo», NSEI NO pintó ni «uso» ni «ámbito de circulación» (la grabación tampoco los rellena antes de «Continuar»).
   * Si no aparece en la pantalla, se SIGUE (no hay nada que rellenar ni dato que suponer). Si aparece, se rellena o, sin
   * valor en el riesgo, queda pendiente como siempre. Un control NO opcional que no aparece → atasco + hueco.
   * Solo es `opcional` si el riesgo no trae valor o trae el DEFECTO (particular / España): con otro valor (alquiler,
   * profesional, internacional…) un desplegable ausente NO se salta (no se tarifica con el valor implícito de Mapfre).
   * Aun así, solo se da por ausente tras una ESPERA ACTIVA (`ESPERA_OPCIONAL_MS`), nunca con un `count()` instantáneo.
   */
  opcional?: boolean
  /**
   * v0.8.4 (trabajo real 39c8016e): si el portal pinta el campo DESHABILITADO, para ESTE valor es su estado natural: no se
   * toca y se sigue. Hoy solo «siniestros RC 5 años» con 0 (la grabación del 15/10 no lo toca: el portal lo deja
   * deshabilitado). Sin la marca, un campo deshabilitado → ATASCO + hueco (nunca un `fill` sobre él ni 30 s de espera).
   */
  intactoSiDeshabilitado?: boolean
}

// ───────────────────────── mapeo valor del formulario → texto de Mapfre (datos explícitos) ─────────────────────────
/**
 * Lo que el formulario de auto (`FormularioAuto`; validador en module-tarificacion y `tarificador-auto-formulario` en plataforma)
 * AÚN NO trae y NSEI pide en `mat-select`: uso, ámbito de circulación, clase del permiso y compañía anterior. Hasta que el
 * formulario los lleve, ninguno se supone (el paso para con inventario, como antes); en cuanto un valor llega (campo opcional
 * en el formulario ampliado) se traduce con ESTA tabla. Los textos de Mapfre son CANDIDATOS (la grabación no los tiene abiertos,
 * pieza 4, 14/10/2026): el helper elige por coincidencia clara y, si no, IA o hueco con la lista de opciones. NUNCA el primero.
 */
export type DatosMatSelectMapfre = { usoVehiculo?: string | null; ambitoCirculacion?: string | null; clasePermiso?: string | null; companiaAnterior?: string | null }

export const MAPEO_MAPFRE_AUTO = Object.freeze({
  uso: Object.freeze({ particular: Object.freeze(['Particular', 'Privado']) }) as Readonly<Record<string, readonly string[]>>,
  ambito: Object.freeze({ espana: Object.freeze(['España', 'Nacional']) }) as Readonly<Record<string, readonly string[]>>,
  /** Clases de permiso de coche/moto: el texto de Mapfre es la propia clase («B» en la grabación). */
  clasePermiso: Object.freeze({ b: Object.freeze(['B']), a: Object.freeze(['A']), a1: Object.freeze(['A1']), a2: Object.freeze(['A2']) }) as Readonly<Record<string, readonly string[]>>,
})

/** Valor canónico del formulario → textos de Mapfre. `null` = sin valor o sin mapeo (queda pendiente: no se supone). PURA. */
export function textosMapfreDe(campo: keyof typeof MAPEO_MAPFRE_AUTO, valor: string | null | undefined): readonly string[] | null {
  const k = typeof valor === 'string' ? valor.trim().toLowerCase() : ''
  return k !== '' && Object.hasOwn(MAPEO_MAPFRE_AUTO[campo], k) ? MAPEO_MAPFRE_AUTO[campo][k]! : null
}

const CP = /^\d{5}$/

/** Espera activa antes de dar por ausente un desplegable opcional (uso/ámbito): el flujo los pinta a veces con retraso. */
export const ESPERA_OPCIONAL_MS = 2_500

/**
 * ¿Aparece `sel` VISIBLE dentro de `ms`? Sondeo cada 250 ms (espera activa); `ms` 0 = una sola mirada. Solo lectura.
 * v0.8.2: cuenta solo los VISIBLES (como la capa común `elegirOpcionMatSelect`). NSEI deja los mat-select de uso/ámbito en el
 * DOM sin pintar: con `count()` a secas el opcional «aparecía», se abría la capa común («0 visibles») y acababa en atasco.
 */
async function apareceEn(raiz: Pick<Frame, 'locator'>, sel: string, ms: number): Promise<boolean> {
  const fin = Date.now() + ms
  for (;;) {
    if ((await raiz.locator(sel).locator('visible=true').count().catch(() => 0)) > 0) return true
    if (Date.now() >= fin) return false
    await new Promise((r) => setTimeout(r, Math.min(250, Math.max(1, fin - Date.now()))))
  }
}

/** Opcional solo si el riesgo no trae valor (o está vacío) o trae el defecto del formulario. PURA. */
function esDefectoOVacio(valor: string | null | undefined, defecto: string): boolean {
  const k = typeof valor === 'string' ? valor.trim().toLowerCase() : ''
  return k === '' || k === defecto
}

/**
 * ¿El conductor habitual es el TOMADOR? La grabación del 15/10/2026 rellena la licencia en la pestaña «Tomador» de Figuras: el
 * bot solo sabe tarificar ese caso. PURA. `tomadorEsConductor` = true → sí; false o tomador EMPRESA → hueco (sin grabación del
 * conductor distinto); `null` (no consta) → sí SOLO si la fecha de nacimiento del conductor es la del tomador de la ficha; si no,
 * `datos` (no se supone). Nunca devuelve ni registra fechas.
 */
export function exigirConductorEsTomador(f: FormularioAuto): void {
  const t = tomadorParaAlta(f)
  if (t?.tipo === 'juridica') throw new ErrorMapaIncompleto('el conductor habitual de un tomador EMPRESA (la grabación solo trae la licencia del tomador persona física)')
  if (f.tomadorEsConductor === false) throw new ErrorMapaIncompleto('el conductor habitual distinto del tomador (la grabación solo trae la licencia del TOMADOR en «Figuras»)')
  if (f.tomadorEsConductor === true) return
  const nac = t?.tipo === 'fisica' && typeof t.fechaNacimiento === 'string' ? t.fechaNacimiento.trim() : ''
  if (nac === '' || nac !== f.conductor.fechaNacimiento) {
    throw new ErrorTarificador('datos', 'mapfre/auto: no consta que el tomador sea el conductor habitual (Mapfre pide la licencia en la pestaña del tomador): indica «tomador es conductor» en el riesgo')
  }
}

/**
 * Campos de los pasos 2 y 3 que la grabación permite escribir, a partir del formulario canónico. Puro. FAIL-CLOSED:
 * lo que Mapfre pide y el formulario no trae → `datos`; nada se inventa. La matrícula y las fechas son dato personal.
 *   · Paso 2: CP de circulación; uso y ámbito (mat-select; el formulario de auto trae defecto «particular»/«españa»).
 *   · Paso 3 (grabación 15/10/2026, pestaña «Tomador»): clase de permiso (mat-select de `datos-licencia`), «Valido desde»
 *     (fecha del carné, dd/mm/aaaa), siniestros RC 5 años y, con años en la compañía anterior > 0, la compañía anterior
 *     (mat-select; OBLIGATORIA: sin ella el precio no sería el del cliente → `datos`). El «Nº de Póliza» anterior NO está en el
 *     riesgo: lo resuelve `historialAnterior` en la pantalla (obligatorio y vacío → `datos`).
 * Lo que sigue sin dato (uso/ámbito/clase sin mapeo) va a `pendientes`: el paso PARA con inventario, no se asume.
 */
export type PlanNsei = { escribibles: OperacionNsei[]; pendientes: OperacionNsei[] }

/** v0.8.7: clase de permiso SUPUESTA en moto cuando el riesgo no la trae (carné A completo), DECLARADA en el precio. */
export const SUPUESTO_CLASE_PERMISO_MOTO = 'clase del permiso: A (supuesto, no consta)'

/**
 * Clase de permiso de MOTO (v0.8.7, 18/10/2026). Pura. La del riesgo si es de moto (A, A1, A2); si no consta, «A» (el carné de
 * moto completo: la fecha del carné que viaja es la del carné A de la ficha) DECLARADA como supuesto. Una clase que no es de
 * moto (B) en un riesgo de moto → `datos` (no se cambia en silencio). Coche: la del riesgo, sin supuesto.
 */
export function clasePermisoNsei(f: Pick<FormularioAuto, 'ramo'> & DatosMatSelectMapfre): { clase: string | null; supuesto: string | null } {
  const c = typeof f.clasePermiso === 'string' && f.clasePermiso.trim() !== '' ? f.clasePermiso.trim().toLowerCase() : null
  if (f.ramo !== 'moto') return { clase: c, supuesto: null }
  if (c === null) return { clase: 'a', supuesto: SUPUESTO_CLASE_PERMISO_MOTO }
  if (!['a', 'a1', 'a2'].includes(c)) throw new ErrorTarificador('datos', 'mapfre/moto: la clase del permiso del riesgo no es de moto (A, A1 o A2)')
  return { clase: c, supuesto: null }
}

export function planObjetoYFiguras(form: FormularioAuto): PlanNsei {
  if (form.ramo !== 'auto' && form.ramo !== 'moto') throw new ErrorTarificador('datos', `mapfre/auto: el formulario es de ${form.ramo}`)
  if (!CP.test(form.codigoPostal)) throw new ErrorTarificador('datos', 'mapfre/auto: el código postal de circulación tiene que tener 5 dígitos')
  // 18/10/2026 (decisión de Alberto «supuesto favorable»): antecedentes sin dato → 5 años o más y ningún siniestro, DECLARADOS
  // en el precio por `tarificar`. Con años > 0 sigue haciendo falta el NOMBRE de la compañía anterior (no se inventa).
  const f = conAntecedentesFavorables(form).formulario
  const extra = f as FormularioAuto & DatosMatSelectMapfre
  const nombreAnterior = typeof extra.companiaAnterior === 'string' ? extra.companiaAnterior.trim() : ''
  if (f.aniosAseguradoAnterior > 0 && (nombreAnterior === '' || nombreAnterior.length > 80)) {
    throw new ErrorTarificador('datos', 'mapfre/auto: falta el nombre de la compañía anterior (estuvo asegurado —dato del riesgo o supuesto favorable de 5 años o más— y Mapfre la pide en «Figuras»; no se inventa)')
  }
  exigirConductorEsTomador(f)
  const escribibles: OperacionNsei[] = [
    { sel: SEL_OBJETO.matricula, etiqueta: 'matrícula', tipo: 'texto', valor: f.matricula, paso: 'objetoAsegurado' },
    { sel: SEL_OBJETO.cpCirculacion, etiqueta: 'CP de circulación', tipo: 'texto', valor: f.codigoPostal, paso: 'objetoAsegurado' },
    { sel: SEL_LICENCIA.fechaCarne, etiqueta: 'fecha del carné (Valido desde)', tipo: 'texto', valor: fechaEs(f.conductor.fechaCarne, 'mapfre/auto: la fecha del carné'), paso: 'figuras', porEtiqueta: { ambito: SEL_LICENCIA.ambito, etiqueta: SEL_LICENCIA.etiquetaFechaCarne } },
    { sel: SEL_HISTORIAL.siniestrosRc5, etiqueta: 'siniestros RC 5 años', tipo: 'texto', valor: String(f.siniestrosUltimos5Anios), paso: 'figuras', ...(f.siniestrosUltimos5Anios === 0 ? { intactoSiDeshabilitado: true } : {}) },
  ]
  const pendientes: OperacionNsei[] = []
  // mat-select: con el valor del formulario mapeado van a `escribibles` (los rellena `rellenarMatSelects`); sin él, pendiente.
  const selectDe = (sel: string, etiqueta: string, paso: IdPasoNsei, textos: readonly string[] | null, opcional = false) => {
    const o = opcional ? { opcional: true } : {}
    if (textos) escribibles.push({ sel, etiqueta, tipo: 'mat-select', valor: textos[0]!, paso, opciones: textos, ...o })
    else pendientes.push({ sel, etiqueta, tipo: 'mat-select', valor: '', paso, ...o })
  }
  // Uso y ámbito: OPCIONALES (v0.8.1): solo se rellenan si el flujo los pinta (ver `OperacionNsei.opcional`).
  // Opcional SOLO con valor nulo o igual al defecto; con otro valor, ausente = atasco + hueco.
  selectDe(SEL_OBJETO.uso, 'uso del vehículo', 'objetoAsegurado', textosMapfreDe('uso', extra.usoVehiculo), esDefectoOVacio(extra.usoVehiculo, USO_VEHICULO_POR_DEFECTO))
  selectDe(SEL_OBJETO.ambitoCirculacion, 'ámbito de circulación', 'objetoAsegurado', textosMapfreDe('ambito', extra.ambitoCirculacion), esDefectoOVacio(extra.ambitoCirculacion, AMBITO_CIRCULACION_POR_DEFECTO))
  // v0.8.7: moto (inventario real del 18/10/2026: paso 2 con matrícula, 1ª matriculación y CP; «Clase *» y «Valido desde *» en
  // la licencia, como en coche) → clase de permiso de moto (`clasePermisoNsei`).
  selectDe(SEL_LICENCIA.clasePermiso, 'clase del permiso', 'figuras', textosMapfreDe('clasePermiso', clasePermisoNsei(extra).clase))
  if (f.aniosAseguradoAnterior > 0) selectDe(SEL_HISTORIAL.companiaAnterior, 'compañía anterior', 'figuras', [nombreAnterior])
  return { escribibles, pendientes }
}

/**
 * Escribe los campos de texto del plan (nunca los `pendientes`). Cada uno: existe → `comprobarCampo` → `fill` → relectura.
 * `fill` de Playwright lanza `input`, que es lo que escucha Angular Material (no hace falta `change` a mano). Devuelve las
 * etiquetas de lo que quedó sin escribir para que el llamante lo sepa (no se calla).
 */
export async function rellenarCamposTexto(raiz: Pick<Frame, 'locator'>, plan: PlanNsei, respaldo: RespaldoCampos = SIN_RESPALDO, esperaEditableMs: number = ESPERA_EDITABLE_MS): Promise<string[]> {
  for (const op of plan.escribibles) {
    if (op.tipo !== 'texto') continue
    const nombrePaso = PASOS_NSEI.find((x) => x.id === op.paso)!.nombre
    const porEtiqueta = op.porEtiqueta ? await campoPorEtiquetaPortal(raiz, op.sel, op.porEtiqueta) : null
    const r = porEtiqueta ?? (await campoConRespaldo(raiz, op.sel, { ...respaldo, etiqueta: op.etiqueta, descripcion: `Campo «${op.etiqueta}» del paso «${nombrePaso}» de Mapfre NSEI` }))
    if (!r) throw new ErrorMapaIncompleto(`el campo «${op.etiqueta}» (${op.sel}; no aparece)`, true)
    const campo: Locator = r.campo
    await comprobarCampo(campo)
    // v0.8.4: NUNCA `fill` sobre un campo deshabilitado/solo lectura (Playwright esperaría 30 s y moriría sin atasco).
    if (!(await esperarEditable(campo, esperaEditableMs))) {
      if (op.intactoSiDeshabilitado) {
        respaldo.formador?.log('mapfre_campo_deshabilitado_intacto', { etiqueta: op.etiqueta })
        continue
      }
      await registrarAtasco(respaldo.page, respaldo.formador, { clave: claveCampo(op.etiqueta), tipo: 'campo', etiqueta: op.etiqueta, descripcion: `Campo «${op.etiqueta}» del paso «${nombrePaso}» de Mapfre NSEI: está DESHABILITADO y la grabación no muestra cómo habilitarlo. El robot no escribe ni supone nada aquí.` }).catch(() => undefined)
      throw new ErrorMapaIncompleto(`el campo «${op.etiqueta}» está deshabilitado en el portal y el riesgo trae un valor (la grabación no muestra cómo habilitarlo)`, true)
    }
    await campo.fill(String(op.valor))
    if ((await campo.inputValue()) !== String(op.valor)) throw new ErrorTarificador('portal', `mapfre/auto: el portal no dejó fijado el campo «${op.etiqueta}»`)
    // v0.8.3: como la grabación (Tab tras el CP), SALIR del campo y esperar a que NSEI lo valide (asíncrono) antes de seguir.
    await campo.blur().catch(() => undefined)
    await esperarCampoAsentado(raiz, campo)
    if ((await campo.inputValue().catch(() => '')).trim() === '') throw new ErrorTarificador('portal', `mapfre/auto: el portal vació el campo «${op.etiqueta}» al salir de él`)
    await r.confirmar().catch(() => undefined)
  }
  return plan.pendientes.map((p) => p.etiqueta)
}

/** v0.8.4 · Espera máxima a que un campo pase a EDITABLE antes de escribir (Angular puede habilitarlo con un pequeño retraso). */
export const ESPERA_EDITABLE_MS = 1_500

/** v0.8.4 · ¿El campo es editable (habilitado y no solo lectura) dentro de `ms`? Sondeo corto; nunca lanza. Solo lectura. */
export async function esperarEditable(campo: Locator, ms: number = ESPERA_EDITABLE_MS): Promise<boolean> {
  const fin = Date.now() + ms
  for (;;) {
    if (await campo.isEditable({ timeout: 500 }).catch(() => false)) return true
    if (Date.now() >= fin) return false
    await new Promise((r) => setTimeout(r, 150))
  }
}

/** Espera máxima a que un campo recién escrito se asiente (validación asíncrona de NSEI al salir del campo). */
export const ESPERA_ASENTAR_MS = 5_000
const SEL_OCUPADO_NSEI = 'mat-progress-spinner, mat-spinner, mat-progress-bar'

/**
 * v0.8.3 · Tras SALIR de un campo (blur), espera a que NSEI lo dé por asentado: el control sin `ng-pending` (validador
 * asíncrono de Angular) y ningún spinner visible, en dos lecturas seguidas. Agotada la espera NO lanza: «Continuar» lo
 * comprueba el guard y, si no se llega, el hueco nombra los `mat-error` visibles. Solo lectura.
 */
export async function esperarCampoAsentado(raiz: Pick<Frame, 'locator'>, campo: Locator, ms: number = ESPERA_ASENTAR_MS): Promise<boolean> {
  const fin = Date.now() + ms
  let quietas = 0
  for (;;) {
    const pendiente = await campo.evaluate((el) => el.classList.contains('ng-pending') || el.closest('.ng-pending') !== null).catch(() => false)
    const ocupado = (await raiz.locator(SEL_OCUPADO_NSEI).locator('visible=true').count().catch(() => 0)) > 0
    quietas = pendiente || ocupado ? 0 : quietas + 1
    if (quietas >= 2) return true
    if (Date.now() >= fin) return false
    await new Promise((r) => setTimeout(r, 150))
  }
}

/**
 * v0.8.3 · Etiquetas de los campos con `mat-error` VISIBLE (sin el «*», redactadas; nunca el valor ni el texto del error), en
 * orden y sin repetir. Para que un «Continuar» que no llega a su destino diga QUÉ campo rechaza el portal. Solo lectura.
 */
export async function camposConErrorVisibles(raiz: Pick<Frame, 'locator'>): Promise<string[]> {
  const etiquetas = await raiz
    .locator('mat-error')
    .locator('visible=true')
    .evaluateAll((els) =>
      els.map((e) => {
        const ff = e.closest('mat-form-field')
        const l = ff?.querySelector('mat-label') ?? ff?.querySelector('label')
        const ctl = ff?.querySelector('input, textarea, mat-select')
        const t = (l?.textContent ?? '').replace(/\*/g, ' ').replace(/\s+/g, ' ').trim()
        return t !== '' ? t : (ctl?.getAttribute('formcontrolname') ?? ctl?.getAttribute('name') ?? '')
      }),
    )
    .catch(() => [] as string[])
  const vistas = new Set<string>()
  for (const t of etiquetas) {
    const limpia = redactarDatosPersonales(t).slice(0, 60).trim()
    if (limpia !== '') vistas.add(limpia)
  }
  return [...vistas]
}

/**
 * Campo por la ETIQUETA del portal dentro de su componente (grabación 15/10/2026: «Valido desde» en `datos-licencia`), SOLO si
 * el selector fijo no está: el `mat-form-field` cuyo texto contiene la etiqueta (sin tildes) y EXACTAMENTE un input. `null` =
 * no se resuelve aquí (sigue la capa común). Solo lectura.
 */
/** Etiqueta → RegExp que tolera tildes, mayúsculas y espacios (solo letras/dígitos de la etiqueta; el resto se escapa). PURA. */
export function patronEtiqueta(etiqueta: string): RegExp {
  const vocal: Record<string, string> = { a: '[aá]', e: '[eé]', i: '[ií]', o: '[oó]', u: '[uúü]', n: '[nñ]' }
  const palabras = etiqueta.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().split(/\s+/)
  return new RegExp(palabras.map((w) => [...w].map((c) => vocal[c.toLowerCase()] ?? c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('')).join('\\s+'), 'iu')
}

async function campoPorEtiquetaPortal(raiz: Pick<Frame, 'locator'>, sel: string, p: { ambito: string; etiqueta: string }): Promise<{ campo: Locator; confirmar: () => Promise<void> } | null> {
  if ((await raiz.locator(sel).count().catch(() => 0)) > 0) return null
  const patron = patronEtiqueta(p.etiqueta)
  const campos = raiz.locator(`${p.ambito} mat-form-field`).filter({ hasText: patron }).locator('input')
  if ((await campos.count().catch(() => 0)) !== 1) return null
  return { campo: campos.first(), confirmar: async () => undefined }
}

/**
 * v0.8.10 · Qué hay en el bloque «historial de siniestralidad» (solo lectura, NUNCA valores): etiquetas y controles (etiqueta,
 * tag, formcontrolname/name/id, deshabilitado, interruptor). Si `app-historial-siniestralidad` no existe, las etiquetas de la
 * pantalla que hablan de siniestralidad/compañía. Para que el hueco de «compañía anterior» en MOTO diga qué pinta el portal.
 */
export async function describirBloqueHistorial(raiz: Pick<Frame, 'locator'>): Promise<string> {
  // Sin funciones con nombre dentro del `evaluate` (tsx/esbuild las envuelve en `__name`, que no existe en la página): el texto
  // crudo se limpia aquí, en Node.
  const crudo = await raiz
    .locator('body')
    .evaluate((body) => {
      const bloque = body.querySelector('app-historial-siniestralidad')
      if (!bloque) {
        const et = [...body.querySelectorAll('label, mat-label, mat-slide-toggle, mat-checkbox')].map((e) => e.textContent ?? '')
        return { bloque: false, etiquetas: et, controles: [] as { tag: string; id: string; et: string; off: boolean }[] }
      }
      const etiquetas = [...bloque.querySelectorAll('label, mat-label')].map((e) => e.textContent ?? '')
      const controles = [...bloque.querySelectorAll('input, textarea, mat-select, mat-slide-toggle, mat-checkbox')].map((e) => {
        const ff = e.closest('mat-form-field')
        return {
          tag: e.tagName.toLowerCase(),
          id: e.getAttribute('formcontrolname') ?? e.getAttribute('name') ?? e.id ?? '',
          et: (ff?.querySelector('mat-label') ?? ff?.querySelector('label') ?? e.closest('label'))?.textContent ?? e.getAttribute('aria-label') ?? '',
          off: (e as HTMLInputElement).disabled === true || e.getAttribute('aria-disabled') === 'true',
        }
      })
      return { bloque: true, etiquetas, controles }
    })
    .catch(() => null)
  if (!crudo) return 'no se pudo leer el bloque'
  const limpia = (t: string) => t.replace(/\*/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
  const etiquetas = [...new Set(crudo.etiquetas.map(limpia).filter((t) => (crudo.bloque ? t !== '' : /siniestr|compañ|compan|anterior|bonus|proced|expuest/i.test(t))))].slice(0, 12)
  const controles = crudo.controles.slice(0, 20).map((c) => `${c.tag}${c.id ? `[${c.id.slice(0, 40)}]` : ''}${limpia(c.et) ? `«${limpia(c.et)}»` : ''}${c.off ? '(deshabilitado)' : ''}`)
  const et = etiquetas.length ? ` etiquetas: ${etiquetas.map((t) => `«${t}»`).join(', ')}` : ''
  return crudo.bloque ? `el bloque app-historial-siniestralidad trae ${controles.length} controles (${controles.join('; ')});${et}` : `no existe app-historial-siniestralidad;${et || ' sin etiquetas de siniestralidad'}`
}

/**
 * Rellena los `mat-select` del plan que ya tienen valor mapeado (`escribibles` de tipo `mat-select`), por la capa común
 * (`ctx.elegirMatSelect`, mat-select.ts): coincidencia clara → IA → `ErrorOpcionSinResolver` (hueco con la lista de opciones).
 * Sin el desplegable en la pantalla o sin la función guardada → `ErrorMapaIncompleto` con inventario. Devuelve lo elegido.
 */
export async function rellenarMatSelects(raiz: Pick<Frame, 'locator'>, plan: PlanNsei, ctx: Pick<ContextoPortal, 'elegirMatSelect'>, respaldo: RespaldoCampos = SIN_RESPALDO, esperaOpcionalMs: number = ESPERA_OPCIONAL_MS): Promise<string[]> {
  const hechos: string[] = []
  for (const op of plan.escribibles) {
    if (op.tipo !== 'mat-select') continue
    const sel = raiz.locator(op.sel).first()
    if (!(await apareceEn(raiz, op.sel, op.opcional ? esperaOpcionalMs : 0))) {
      // Opcional que este flujo no pinta (v0.8.1): se sigue sin tocar nada. Obligatorio que no aparece → ATASCO + hueco.
      if (op.opcional) {
        respaldo.formador?.log('mapfre_select_ausente', { etiqueta: op.etiqueta })
        continue
      }
      await registrarAtasco(respaldo.page, respaldo.formador, { clave: claveCampo(op.etiqueta), tipo: 'campo', etiqueta: op.etiqueta, descripcion: `Desplegable «${op.etiqueta}» del paso «${PASOS_NSEI.find((x) => x.id === op.paso)!.nombre}» de Mapfre NSEI: no aparece en la pantalla` }).catch(() => undefined)
      const bloque = op.sel === SEL_HISTORIAL.companiaAnterior ? ` — ${redactarDatosPersonales(await describirBloqueHistorial(raiz))}` : ''
      throw new ErrorMapaIncompleto(`el desplegable «${op.etiqueta}» (${op.sel}; no aparece)${bloque}`, true)
    }
    if (!ctx.elegirMatSelect) throw new ErrorMapaIncompleto('la función guardada «elegir opción de mat-select» en el contexto del runner')
    // Capa común: coincidencia clara por texto → IA solo entre las opciones visibles → si no, ATASCO (Telegram) + hueco.
    await ctx.elegirMatSelect(sel, op.opciones ?? [String(op.valor)], { etiqueta: op.etiqueta }).catch(async (e: unknown) => {
      if (e instanceof ErrorOpcionSinResolver) {
        await registrarAtasco(respaldo.page, respaldo.formador, { clave: claveCampo(op.etiqueta), tipo: 'campo', etiqueta: op.etiqueta, descripcion: `Desplegable «${op.etiqueta}» del paso «${PASOS_NSEI.find((x) => x.id === op.paso)!.nombre}» de Mapfre NSEI: ninguna opción clara` }).catch(() => undefined)
      }
      throw e
    })
    hechos.push(op.etiqueta)
  }
  return hechos
}

// ───────────────────────── avance entre pasos y flujo ─────────────────────────
// «Continuar» del stepper solo por `ctx.continuarMapfre` (guard.ts, `pulsarContinuarMapfre`): lista cerrada 1 → 2 → 3, una
// vez por paso y en orden. El del paso 3 calcula las primas: PERMITIDO por Alberto (14/10/2026). Nada pasa de Coberturas.

/** Operaciones del plan que pertenecen a un paso (sin las que ya se hicieron por otra vía, p. ej. la matrícula). PURA. */
export function planDelPaso(plan: PlanNsei, paso: IdPasoNsei, excluir: readonly string[] = []): PlanNsei {
  const del = (o: OperacionNsei) => o.paso === paso && !excluir.includes(o.sel)
  return { escribibles: plan.escribibles.filter(del), pendientes: plan.pendientes.filter(del) }
}

/**
 * Antes de cada «Continuar»: si el paso deja algún control que el robot no sabe rellenar (mat-select, interruptor, sin
 * DOM grabado), PARA con inventario. No se avanza con el valor por defecto del portal: un precio con un dato supuesto
 * no es el del cliente. PURA (lanza).
 */
export function exigirPasoCompleto(plan: PlanNsei, paso: IdPasoNsei): void {
  const p = planDelPaso(plan, paso).pendientes
  if (p.length) throw new ErrorMapaIncompleto(`en el paso «${PASOS_NSEI.find((x) => x.id === paso)!.nombre}» los controles sin mapear: ${p.map((o) => o.etiqueta).join(', ')} (mat-select/interruptor sin DOM grabado abierto)`, true)
}

/**
 * Quita de `pendientes` los controles OPCIONALES que la pantalla no pinta tras la espera activa (v0.8.1): nada que rellenar ni suponer.
 * Los que SÍ aparecen siguen pendientes (y `exigirPasoCompleto` para con inventario). Solo lectura.
 */
export async function sinOpcionalesAusentes(raiz: Pick<Frame, 'locator'>, plan: PlanNsei, esperaMs: number = ESPERA_OPCIONAL_MS): Promise<PlanNsei> {
  const pendientes: OperacionNsei[] = []
  for (const o of plan.pendientes) {
    if (o.opcional && !(await apareceEn(raiz, o.sel, esperaMs))) continue
    pendientes.push(o)
  }
  return { escribibles: plan.escribibles, pendientes }
}

const continuar = (nsei: Page, ctx: Pick<ContextoPortal, 'continuarMapfre'> & { formador?: ContextoFormador }, paso: 'datosBasicos' | 'objetoAsegurado' | 'figuras') => {
  if (!ctx.continuarMapfre) throw new ErrorMapaIncompleto('la función guardada «Continuar» de Mapfre en el contexto del runner')
  // v0.8.3: si no se llega al destino y el portal marca campos con `mat-error`, el hueco los NOMBRA (etiquetas, sin valores).
  return ctx.continuarMapfre(nsei, paso).catch(async (e: unknown) => {
    if (!(e instanceof ErrorTarificador) || !/la llegada a «/.test(e.message)) throw e
    const conError = await camposConErrorVisibles(nsei)
    if (conError.length === 0) throw e
    const nombre = PASOS_NSEI.find((x) => x.id === paso)!.nombre
    const lista = conError.map((t) => `«${t}»`).join(', ')
    return huecoPaso(nsei, ctx.formador, conError[0]!, nombre, `${e.message.replace(/^mapfre: mapa incompleto: faltan /, '')}: el portal marca con error ${lista}`)
  })
}

// ───────────────────────── paso 1: tomador por NIF SIN LUPA (14/10/2026) ─────────────────────────
// Regla de Alberto (operador real del portal): NO se pulsa la lupa. Al teclear el NIF/CIF y salir del campo, Mapfre BUSCA SOLA:
//   · el cliente EXISTE → autorrellena Nombre / Apellidos / Fecha de Nacimiento (o la Razón social de una empresa) y el robot
//     NO teclea ni sobrescribe nada ahí;
//   · NO existe (lead nuevo = caso NORMAL) → avisa «NO EXISTE NINGUN REGISTRO PARA ESA CONDICION DE BUSQUEDA» y deja esos campos
//     vacíos y editables en el MISMO formulario (DOM real: `input[name=nombre|primerApellido|segundoApellido|fechaNacimiento]`;
//     «Fecha de Nacimiento *» obligatoria, dd/mm/aaaa; no hay botón de alta). Entonces se rellenan con los datos de la ficha
//     (`FormularioAuto.tomador`, o `datosTomador` que pone asegura al entregar) campo a campo, SOLO si el campo sigue vacío.
// «Nuevo» se decide SOLO por el aviso «no existe ningún registro» (con los campos presentes y vacíos). Agotada la espera sin
// aviso ni autorrelleno → `indeterminado` (estado conservador: atasco, nunca se supone que no existe). Todo hueco de este paso
// (diálogo, indeterminado, autorrelleno tardío, fecha que el portal no deja igual, «Campo obligatorio» pendiente) pasa por
// `registrarAtasco` (Telegram, como el resto) y lanza `ErrorMapaIncompleto` con inventario. Ningún mensaje lleva valores.

const ESPERA_REACCION_TOMADOR_MS = 8_000
const SEL_DIALOGO_NSEI = 'mat-dialog-container, [role="dialog"], [role="alertdialog"], app-matricula-dialog'
/** Aviso del portal cuando el NIF no está en su base (DOM real del 14/10/2026). */
const RE_SIN_REGISTRO = /NO EXISTE NINGUN REGISTRO|NO SE HA(N)? ENCONTRADO|SIN RESULTADOS/
const RE_CAMPO_OBLIGATORIO = /CAMPO OBLIGATORIO|OBLIGATORI/

export type ReaccionTomador = 'existe' | 'nuevo' | 'dialogo' | 'lista' | 'aviso' | 'indeterminado'
/** Clase de un diálogo visible durante la búsqueda del tomador. `cargando` = sin filas ni botones (el «espere» transitorio). */
export type ClaseDialogoTomador = 'ninguno' | 'cargando' | 'lista' | 'aviso' | 'otro'

const plano = (t: string | null) => (t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase()
const textoPagina = (nsei: Page) => nsei.locator('body').innerText({ timeout: 1_000 }).catch(() => '')

/**
 * Estado de los campos del tomador (solo recuentos; nunca el valor): `presentes` = cuántos de Nombre / Primer Apellido / Fecha
 * de Nacimiento hay (persona física); `razonSocial` = si está el de la razón social (empresa); `rellenos` = cuántos de TODOS
 * ellos (razón social incluida: un autorrelleno de empresa es «existe» y no se pisa) traen valor.
 */
async function estadoCamposTomador(nsei: Page): Promise<{ presentes: number; razonSocial: boolean; rellenos: number }> {
  return nsei.evaluate(([fisica, razon]) => {
    let presentes = 0
    let rellenos = 0
    for (const s of fisica) {
      const el = document.querySelector(s) as HTMLInputElement | null
      if (!el) continue
      presentes++
      if ((el.value ?? '').trim() !== '') rellenos++
    }
    const r = document.querySelector(razon) as HTMLInputElement | null
    if (r && (r.value ?? '').trim() !== '') rellenos++
    return { presentes, razonSocial: !!r, rellenos }
  }, [[SEL_TOMADOR.nombre, SEL_TOMADOR.primerApellido, SEL_TOMADOR.fechaNacimiento], SEL_TOMADOR.razonSocial] as const).catch(() => ({ presentes: 0, razonSocial: false, rellenos: 0 }))
}

/**
 * Clase del diálogo visible durante la búsqueda del tomador (solo lectura; nunca devuelve su texto). Por estructura:
 * filas/controles de elección → `lista` (selección de persona); texto «no existe ningún registro» → `aviso`; sin filas ni botones →
 * `cargando` (el diálogo transitorio de «espere» de Mapfre, que se cierra solo); otra cosa → `otro`. Varios diálogos → `otro`.
 */
export async function clasificarDialogoTomador(nsei: Page): Promise<ClaseDialogoTomador> {
  const d = nsei.locator(SEL_DIALOGO_NSEI).locator('visible=true')
  const n = await d.count().catch(() => 0)
  if (n === 0) return 'ninguno'
  if (n > 1) return 'otro'
  const l = await d.first().evaluate((el, selFilas) => ({
    filas: el.querySelectorAll(selFilas).length,
    botones: el.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]').length,
    texto: (el as HTMLElement).innerText ?? el.textContent ?? '',
  }), SEL_FILAS_DIALOGO_PERSONAS).catch(() => null)
  if (!l) return 'ninguno' // se cerró mientras se leía
  if (l.filas > 0) return 'lista'
  if (RE_SIN_REGISTRO.test(plano(l.texto))) return 'aviso'
  return l.botones === 0 ? 'cargando' : 'otro'
}

/**
 * Tras salir del campo del NIF: espera la reacción de Mapfre SIN pulsar nada. Un diálogo visible se clasifica: `cargando`
 * (el «espere» transitorio, 14/10/2026: se sigue esperando a que se cierre) · `lista` (selección de persona) · `aviso`
 * («no existe ningún registro» con botón) · otro → `dialogo`. Sin diálogo: algún campo del tomador con valor y QUIETO entre
 * dos lecturas → `existe` (autorrelleno); campos de alta presentes y vacíos CON el aviso «no existe ningún registro» →
 * `nuevo`. Cualquier otra cosa al agotar la espera (sin aviso ni autorrelleno, o sin campos) → `indeterminado`; un diálogo
 * `cargando` que sigue abierto al agotarla → `dialogo`. Solo lectura.
 */
export async function esperarReaccionTomador(nsei: Page, ms = ESPERA_REACCION_TOMADOR_MS): Promise<ReaccionTomador> {
  const hasta = Date.now() + ms
  let previo: number | null = null
  for (;;) {
    const clase = await clasificarDialogoTomador(nsei)
    if (clase === 'lista' || clase === 'aviso') return clase
    if (clase === 'otro') return 'dialogo'
    if (clase === 'cargando') {
      previo = null
      if (Date.now() >= hasta) return 'dialogo'
      await nsei.waitForTimeout(250)
      continue
    }
    const e = await estadoCamposTomador(nsei)
    if (e.rellenos > 0) {
      if (previo === e.rellenos) return 'existe'
      previo = e.rellenos
    } else {
      previo = null
      if ((e.presentes >= 3 || e.razonSocial) && RE_SIN_REGISTRO.test(plano(await textoPagina(nsei)))) return 'nuevo'
    }
    if (Date.now() >= hasta) return e.rellenos > 0 ? 'existe' : 'indeterminado'
    await nsei.waitForTimeout(250)
  }
}

/** Datos del tomador: el bloque `tomador` del riesgo si viene; si no, `datosTomador` (de la ficha, lo pone asegura). PURA. */
function tomadorParaAlta(f: FormularioAuto): DatosTomadorFicha | { tipo: 'fisica'; nombre: string | null; apellido1: string | null; apellido2: string | null; fechaNacimiento: string | null } | { tipo: 'juridica'; razonSocial: string | null } | null {
  const t = f.tomador
  if (t) return t.tipo === 'juridica' ? { tipo: 'juridica', razonSocial: t.razonSocial } : { tipo: 'fisica', nombre: t.nombre, apellido1: t.apellido1, apellido2: t.apellido2, fechaNacimiento: t.fechaNacimiento }
  return f.datosTomador ?? null
}

/** Datos de la ficha para el alta del tomador nuevo. PURA. Persona jurídica: razón social; física: nombre, apellidos, nacimiento. */
export function planAltaTomador(f: FormularioAuto): PlanNsei {
  const t = tomadorParaAlta(f)
  const falta = (q: string) => new ErrorTarificador('datos', `mapfre/auto: el tomador no existe en Mapfre y hay que darlo de alta, pero la ficha no trae ${q}`)
  const limpio = (v: string | null | undefined) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
  const escribibles: OperacionNsei[] = []
  const op = (sel: string, etiqueta: string, valor: string): void => { escribibles.push({ sel, etiqueta, tipo: 'texto', valor, paso: 'datosBasicos' }) }
  if (t?.tipo === 'juridica') {
    const razon = limpio(t.razonSocial)
    if (!razon) throw falta('la razón social')
    op(SEL_TOMADOR.razonSocial, 'Razón social', razon)
    return { escribibles, pendientes: [] }
  }
  const nombre = limpio(t?.nombre)
  const ap1 = limpio(t?.apellido1)
  const nac = limpio(t?.fechaNacimiento)
  if (!nombre) throw falta('el nombre')
  if (!ap1) throw falta('el primer apellido')
  if (!nac) throw falta('la fecha de nacimiento')
  op(SEL_TOMADOR.nombre, 'Nombre', nombre)
  op(SEL_TOMADOR.primerApellido, 'Primer Apellido', ap1)
  const ap2 = limpio(t?.apellido2)
  if (ap2) op(SEL_TOMADOR.segundoApellido, 'Segundo Apellido', ap2)
  op(SEL_TOMADOR.fechaNacimiento, 'Fecha de Nacimiento', fechaEs(nac, 'mapfre/auto: la fecha de nacimiento del tomador'))
  return { escribibles, pendientes: [] }
}

/**
 * Lo que dejó el portal en un campo de fecha frente a lo pedido (ambos dd/mm/aaaa; admite d/m sin cero). `invertida` = el
 * portal cambió día y mes (máscara en formato mm/dd). Nunca devuelve ni registra los valores. PURA.
 */
export function compararFechaEs(leida: string, esperada: string): 'ok' | 'invertida' | 'distinta' {
  const p = (s: string) => {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim())
    return m ? { d: Number(m[1]), m: Number(m[2]), a: m[3] } : null
  }
  const l = p(leida)
  const e = p(esperada)
  if (!l || !e) return 'distinta'
  if (l.a === e.a && l.d === e.d && l.m === e.m) return 'ok'
  if (l.a === e.a && e.d !== e.m && l.d === e.m && l.m === e.d) return 'invertida'
  return 'distinta'
}

/** Hueco del paso 1: checkpoint de ATASCO (Telegram) y `ErrorMapaIncompleto` con inventario. Sin valores en ningún texto. */
async function huecoTomador(nsei: Page, ctx: Pick<ContextoPortal, 'formador'>, etiqueta: string, que: string): Promise<never> {
  await registrarAtasco(nsei, ctx.formador, {
    clave: claveCampo(`tomador ${etiqueta}`),
    tipo: 'campo',
    etiqueta,
    descripcion: `Paso 1 «Datos básicos» de Mapfre NSEI, tomador: ${que}. Revisar a mano: el robot no pulsa nada en este paso (ni la lupa).`,
  }).catch(() => undefined)
  throw new ErrorMapaIncompleto(que, true)
}

/** Tras rellenar (o tras el autorrelleno): ningún «Campo obligatorio» visible en «Datos básicos». Si queda alguno → hueco. */
async function exigirSinCamposObligatorios(nsei: Page, ctx: Pick<ContextoPortal, 'formador'>, cuando: string): Promise<void> {
  const errores = nsei.locator(`${SEL_TOMADOR.ambito} mat-error`).locator('visible=true')
  await nsei.waitForTimeout(300)
  for (let i = 0; i < 4; i++) {
    const textos = await errores.allInnerTexts().catch(() => [] as string[])
    if (!textos.some((x) => RE_CAMPO_OBLIGATORIO.test(plano(x)))) return
    await nsei.waitForTimeout(250)
  }
  // La ETIQUETA del primer campo con el error (texto del formulario, nunca su valor), para el atasco.
  const etiqueta = await errores.first().evaluate((el) => {
    const f = el.closest('mat-form-field')
    return (f?.querySelector('mat-label, label')?.textContent ?? '').replace(/[*\s]+/g, ' ').trim().slice(0, 80)
  }).catch(() => '')
  await huecoTomador(nsei, ctx, etiqueta || 'campo obligatorio', `${cuando} queda algún «Campo obligatorio» sin cubrir en «Datos básicos»`)
}

/**
 * Alta del tomador NUEVO en el propio formulario (solo si Mapfre avisó de que no lo conoce): campo a campo, por la capa
 * común (`campoConRespaldo`) y `comprobarCampo`; ANTES de cada `fill` el campo tiene que seguir VACÍO (si Mapfre lo rellenó
 * tarde, no se toca: hueco). La fecha se verifica DESPUÉS de salir del campo (la máscara puede reescribirla: inversión
 * día/mes → hueco). Al final, ningún «Campo obligatorio». No pulsa nada (el «Continuar» es del llamante).
 */
export async function altaTomadorNuevo(nsei: Page, f: FormularioAuto, ctx: Pick<ContextoPortal, 'formador'>): Promise<void> {
  const plan = planAltaTomador(f)
  for (const op of plan.escribibles) {
    const r = await campoConRespaldo(nsei, op.sel, { page: nsei, formador: ctx.formador, etiqueta: op.etiqueta, descripcion: `Campo «${op.etiqueta}» del TOMADOR (alta) en el paso 1 «Datos básicos» de Mapfre NSEI` })
    if (!r) throw new ErrorMapaIncompleto(`el campo «${op.etiqueta}» del alta del tomador (${op.sel}; no aparece)`, true)
    const campo: Locator = r.campo
    await comprobarCampo(campo)
    // Mapfre puede autorrellenar DESPUÉS de la espera: lo que ya tiene valor no se sobrescribe nunca.
    if ((await campo.inputValue()).trim() !== '') await huecoTomador(nsei, ctx, op.etiqueta, `Mapfre rellenó «${op.etiqueta}» después de avisar de que el tomador no existe (señales contradictorias): no se sobrescribe`)
    if (!(await esperarEditable(campo))) await huecoTomador(nsei, ctx, op.etiqueta, `el campo «${op.etiqueta}» del alta del tomador está deshabilitado (no se escribe)`)
    const valor = String(op.valor)
    await campo.fill(valor)
    await campo.blur().catch(() => undefined)
    const leido = await campo.inputValue()
    if (op.sel === SEL_TOMADOR.fechaNacimiento) {
      const c = compararFechaEs(leido, valor)
      if (c === 'invertida') await huecoTomador(nsei, ctx, op.etiqueta, `el portal dejó «${op.etiqueta}» con el día y el mes cambiados (máscara mm/dd): no se continúa con una fecha falsa`)
      if (c === 'distinta') await huecoTomador(nsei, ctx, op.etiqueta, `el portal no dejó «${op.etiqueta}» como se tecleó (dd/mm/aaaa)`)
    } else if (leido.trim().toUpperCase() !== valor.trim().toUpperCase()) {
      throw new ErrorTarificador('portal', `mapfre/auto: el portal no dejó fijado el campo «${op.etiqueta}» del tomador`)
    }
    await r.confirmar().catch(() => undefined)
  }
  await exigirSinCamposObligatorios(nsei, ctx, 'tras rellenar el alta del tomador nuevo')
}

/**
 * Paso 1 «Datos básicos»: NIF/CIF del tomador (SIN lupa: Mapfre busca sola al salir del campo) → reacción → «Continuar»
 * (guardado). Existe → no se toca nada del tomador (pero sin «Campo obligatorio» pendiente); no existe → se da de alta en
 * el propio formulario con los datos de la ficha. El NIF lo pone asegura (`documentoTomador`) o viene en
 * `tomador.documentoIdentidad`; sin él → `datos` sin tocar nada. El NIF solo va a su campo: nunca a logs, mensajes ni
 * resultado. Lo resuelto por el respaldo se confirma tras llegar al paso 2.
 */
export async function pasoDatosBasicos(nsei: Page, f: FormularioAuto, ctx: Pick<ContextoPortal, 'continuarMapfre' | 'formador' | 'elegirTomadorMapfre' | 'cerrarAvisoTomadorMapfre'>, esperaMs = ESPERA_REACCION_TOMADOR_MS): Promise<void> {
  const nif = documentoTomadorDe(f)
  if (nif === null) throw new ErrorTarificador('datos', 'mapfre/auto: falta el NIF/CIF del tomador (Mapfre lo busca en el paso 1; asegura lo pone desde la ficha del cliente)')
  const r = await campoConRespaldo(nsei, SEL_TOMADOR.documento, { page: nsei, formador: ctx.formador, etiqueta: 'NIF/CIF', descripcion: 'Campo del documento (NIF/CIF) del TOMADOR en el paso 1 «Datos básicos» de Mapfre NSEI (no el del conductor)' })
  if (!r) throw new ErrorMapaIncompleto('el campo NIF/CIF del tomador del paso 1 «Datos básicos» (no aparece)', true)
  const campo = r.campo
  await comprobarCampo(campo)
  if (!(await esperarEditable(campo))) await huecoTomador(nsei, ctx, 'NIF/CIF', 'el campo NIF/CIF del tomador del paso 1 «Datos básicos» está deshabilitado (no se escribe)')
  await campo.fill(nif)
  if ((await campo.inputValue()).trim().toUpperCase() !== nif.trim().toUpperCase()) throw new ErrorTarificador('portal', 'mapfre/auto: el portal no dejó fijado el NIF/CIF del tomador')
  // Salir del campo dispara la búsqueda automática de Mapfre. NO se pulsa la lupa.
  await campo.blur()
  let reaccion = await esperarReaccionTomador(nsei, esperaMs)
  if (reaccion === 'lista') {
    // Lista de personas: SOLO la fila cuyo NIF (normalizado) es el del riesgo, y dentro del guard. 0 o >1 → atasco.
    if (!ctx.elegirTomadorMapfre) await huecoTomador(nsei, ctx, 'NIF/CIF', 'el diálogo de selección de persona del tomador (contexto sin la función guardada que la elige)')
    // Si la función guardada lanza (diálogo cambiado/cerrado, «Aceptar» sin habilitar…) → atasco, no error seco. La emisión bloqueada sube.
    const r = await ctx.elegirTomadorMapfre!(nsei, nif).catch(async (e: unknown) => {
      if (e instanceof EmisionBloqueadaError) throw e
      return huecoTomador(nsei, ctx, 'NIF/CIF', 'el diálogo de selección de persona del tomador cambió o falló al elegir la fila (el robot no insiste)')
    })
    if (r !== 'elegido') {
      const que = r === 'ninguna' ? 'ninguna fila con el NIF/CIF del riesgo' : r === 'varias' ? 'varias filas con el NIF/CIF del riesgo' : 'la fila con el NIF/CIF del riesgo no tiene un control para elegirla'
      await huecoTomador(nsei, ctx, 'NIF/CIF', `el diálogo de selección de persona del tomador: ${que}; el robot no elige persona a ciegas`)
    }
    reaccion = await esperarReaccionTomador(nsei, esperaMs)
    if (reaccion !== 'existe') await huecoTomador(nsei, ctx, 'NIF/CIF', 'tras elegir la persona del diálogo de selección Mapfre no autorrellenó el tomador')
  }
  if (reaccion === 'aviso') {
    // Aviso «no existe ningún registro» con botón: cerrarlo (texto validado en guard.ts) y seguir por el alta del tomador nuevo.
    if (!ctx.cerrarAvisoTomadorMapfre) await huecoTomador(nsei, ctx, 'NIF/CIF', 'el aviso del tomador (contexto sin la función guardada que lo cierra)')
    await ctx.cerrarAvisoTomadorMapfre!(nsei).catch(async (e: unknown) => {
      if (e instanceof EmisionBloqueadaError) throw e
      return huecoTomador(nsei, ctx, 'NIF/CIF', 'el aviso del tomador no se pudo cerrar (texto no validado, botón no habilitado o diálogo cerrado)')
    })
    const e = await estadoCamposTomador(nsei)
    if (!(e.presentes >= 3 || e.razonSocial) || e.rellenos > 0) await huecoTomador(nsei, ctx, 'NIF/CIF', 'tras cerrar el aviso de «no existe ningún registro» los campos del alta no están presentes y vacíos')
    reaccion = 'nuevo'
  }
  if (reaccion === 'dialogo') await huecoTomador(nsei, ctx, 'NIF/CIF', 'el diálogo que abre la búsqueda del tomador no es una lista de personas ni el aviso «no existe ningún registro» (el robot no elige ni pulsa a ciegas)')
  if (reaccion === 'indeterminado') await huecoTomador(nsei, ctx, 'NIF/CIF', 'la reacción de Mapfre al NIF/CIF del tomador (ni autorrelleno ni aviso de «no existe ningún registro» en la espera)')
  if (reaccion === 'nuevo') await altaTomadorNuevo(nsei, f, ctx)
  else await exigirSinCamposObligatorios(nsei, ctx, 'con el tomador autorrellenado por Mapfre')
  await continuar(nsei, ctx, 'datosBasicos')
  await r.confirmar().catch(() => undefined)
}

// ───────────────────────── paso 3 (historial) y paso 4 (Coberturas): grabación 15/10/2026 ─────────────────────────

/** Hueco de Figuras/Coberturas: checkpoint de ATASCO (Telegram) y `ErrorMapaIncompleto` con inventario. Sin valores. */
async function huecoPaso(nsei: Page, formador: ContextoFormador | undefined, etiqueta: string, paso: string, que: string): Promise<never> {
  await registrarAtasco(nsei, formador, {
    clave: claveCampo(`mapfre ${etiqueta}`),
    tipo: 'campo',
    etiqueta,
    descripcion: `Paso «${paso}» de Mapfre NSEI: ${que}. El robot no pulsa ni supone nada aquí.`,
  }).catch(() => undefined)
  throw new ErrorMapaIncompleto(que, true)
}

/** Estado del interruptor «¿Tiene compañía anterior?»: encendido/apagado, o `null` si la pantalla no lo trae. Solo lectura. */
async function interruptorCompaniaAnterior(nsei: Page): Promise<boolean | null> {
  const el = nsei.locator(SEL_HISTORIAL.tieneCompaniaAnterior)
  if ((await el.count().catch(() => 0)) === 0) return null
  return el.first().evaluate((e) => (e as HTMLInputElement).checked === true || e.getAttribute('aria-checked') === 'true').catch(() => null)
}

/** «Nº de Póliza» anterior (solo lectura): si está, si está vacío y si el portal lo marca OBLIGATORIO. Nunca devuelve el valor. */
export async function estadoPolizaAnterior(raiz: Pick<Frame, 'locator'>): Promise<{ presente: boolean; vacio: boolean; obligatorio: boolean }> {
  const campo = raiz.locator(SEL_HISTORIAL.numPoliza).first()
  if ((await campo.count().catch(() => 0)) === 0) return { presente: false, vacio: true, obligatorio: false }
  return campo.evaluate((el) => {
    const i = el as HTMLInputElement
    const ff = i.closest('mat-form-field')
    const obligatorio = i.required || i.getAttribute('aria-required') === 'true' || !!ff?.querySelector('.mat-placeholder-required, .mat-form-field-required-marker') || !!ff?.classList.contains('mat-form-field-required')
    return { presente: true, vacio: (i.value ?? '').trim() === '', obligatorio: obligatorio && !i.disabled }
  })
}

/** Las 5 últimas cifras de la póliza anterior del riesgo: solo si son EXACTAMENTE 5 cifras (ya validadas en module-tarificacion). Dato sensible: nunca a logs. */
export function polizaAnteriorUltimos5De(f: object): string | null {
  const v = (f as { polizaAnteriorUltimos5?: unknown }).polizaAnteriorUltimos5
  return typeof v === 'string' && /^\d{5}$/.test(v.trim()) ? v.trim() : null
}

const PREFIJO_DIAGNOSTICO_POLIZA = 'Diagnóstico Nº póliza anterior Mapfre'

/**
 * v0.8.12 · DIAGNÓSTICO de solo lectura del «Nº de Póliza» anterior: atributos del input (maxlength, minlength, pattern, placeholder,
 * type, inputmode), si es obligatorio y el texto visible de etiqueta/hint/mat-error del `mat-form-field`. NUNCA el valor ni se escribe
 * nada. Devuelve `null` si el campo no está; si la lectura falla, un texto «no se pudo leer el formato» (no rompe la ejecución).
 */
export async function diagnosticoPolizaAnterior(raiz: Pick<Frame, 'locator'>): Promise<string | null> {
  try {
    const campo = raiz.locator(SEL_HISTORIAL.numPoliza).first()
    if ((await campo.count().catch(() => 0)) === 0) return null
    const d = await campo.evaluate((el) => {
      const i = el as HTMLInputElement
      const ff = i.closest('mat-form-field')
      // Sin funciones auxiliares con nombre: el transpilador inyectaría `__name`, inexistente en el navegador.
      const obligatorio = i.required || i.getAttribute('aria-required') === 'true' || !!ff?.querySelector('.mat-placeholder-required, .mat-form-field-required-marker') || !!ff?.classList.contains('mat-form-field-required')
      return {
        maxlength: i.getAttribute('maxlength'), minlength: i.getAttribute('minlength'), pattern: i.getAttribute('pattern'), placeholder: i.getAttribute('placeholder'), type: i.getAttribute('type'), inputmode: i.getAttribute('inputmode'),
        obligatorio, deshabilitado: i.disabled,
        etiqueta: Array.from(ff?.querySelectorAll('mat-label, label') ?? []).map((n) => (n.textContent ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | '),
        ayuda: Array.from(ff?.querySelectorAll('mat-hint, .mat-hint') ?? []).map((n) => (n.textContent ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | '),
        error: Array.from(ff?.querySelectorAll('mat-error, .mat-error') ?? []).map((n) => (n.textContent ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | '),
      }
    })
    const v = (x: string | null) => (x === null || x === '' ? 'n/d' : x.slice(0, 120))
    return `${PREFIJO_DIAGNOSTICO_POLIZA}: maxlength=${v(d.maxlength)}, minlength=${v(d.minlength)}, pattern=${v(d.pattern)}, placeholder=${v(d.placeholder)}, type=${v(d.type)}, inputmode=${v(d.inputmode)}, obligatorio=${d.obligatorio}, deshabilitado=${d.deshabilitado}, etiqueta=${v(d.etiqueta)}, ayuda=${v(d.ayuda)}, error=${v(d.error)}`
  } catch {
    return `${PREFIJO_DIAGNOSTICO_POLIZA}: no se pudo leer el formato`
  }
}

/**
 * Historial del paso 3 tras elegir la compañía anterior (grabación 15/10/2026: el humano NO tocó el interruptor; la lista de
 * compañías estaba ya disponible). Fail-closed: el interruptor (si existe) tiene que estar como dice el riesgo (no se pulsa);
 * el «Nº de Póliza» anterior: si el campo está vacío y el riesgo trae `polizaAnteriorUltimos5` (5 cifras) se escribe y se relee
 * (`datos` si no se fija); sin ese dato: si el portal lo exige → `datos` (no se inventa); si no lo exige o ya viene relleno, no se toca. v0.8.12: devuelve el diagnóstico de formato del campo (aviso de la oferta); si lanza `datos`,
 * el diagnóstico va en el mensaje (los errores no llevan avisos).
 */
export async function historialAnterior(nsei: Page, f: FormularioAuto, formador: ContextoFormador | undefined): Promise<string | null> {
  const anios = f.aniosAseguradoAnterior ?? 0
  const sw = await interruptorCompaniaAnterior(nsei)
  if (anios > 0 && sw === false) await huecoPaso(nsei, formador, 'compania anterior', 'Figuras', 'el interruptor «¿Tiene compañía anterior?» está apagado y el riesgo trae años en la compañía anterior')
  if (anios === 0 && sw === true) await huecoPaso(nsei, formador, 'compania anterior', 'Figuras', 'el interruptor «¿Tiene compañía anterior?» está encendido y el riesgo no trae compañía anterior')
  if (anios === 0) return null
  const diagnostico = await diagnosticoPolizaAnterior(nsei)
  if (diagnostico) formador?.log('mapfre_num_poliza_diagnostico', { diagnostico })
  const p = await estadoPolizaAnterior(nsei)
  const ultimos5 = polizaAnteriorUltimos5De(f)
  if (p.presente && p.vacio && ultimos5 !== null) {
    // Mapfre acepta las 5 ÚLTIMAS cifras. Mismo ayudante de escritura que el resto de campos de texto (sin pulsaciones nuevas).
    const campo = nsei.locator(SEL_HISTORIAL.numPoliza).first()
    if (await esperarEditable(campo)) {
      const op: OperacionNsei = { sel: SEL_HISTORIAL.numPoliza, etiqueta: 'nº de póliza anterior', tipo: 'texto', valor: ultimos5, paso: 'figuras' }
      try {
        await rellenarCamposTexto(nsei, { escribibles: [op], pendientes: [] }, { page: nsei, formador })
      } catch (e) {
        if (e instanceof ErrorMapaIncompleto) throw e
        throw new ErrorTarificador('datos', 'mapfre/auto: no se pudo fijar el nº de póliza de la compañía anterior en el portal (las 5 últimas cifras del riesgo no quedaron escritas)')
      }
      if ((await campo.inputValue().catch(() => '')) !== ultimos5) throw new ErrorTarificador('datos', 'mapfre/auto: el portal no dejó fijado el nº de póliza de la compañía anterior (las 5 últimas cifras del riesgo no se mantuvieron)')
      formador?.log('mapfre_num_poliza_escrito', {})
      return diagnostico
    }
    formador?.log('mapfre_num_poliza_no_editable', {})
  }
  if (p.presente && p.vacio && p.obligatorio) {
    throw new ErrorTarificador('datos', `mapfre/auto: Mapfre exige el nº de póliza de la compañía anterior y el riesgo no lo trae (falta ese dato en el formulario de auto; no se inventa)${diagnostico ? `. ${diagnostico}` : ''}`)
  }
  return diagnostico
}

/**
 * v0.8.11 · MOTO: si «Figuras» (licencia ya pintada) NO trae `app-historial-siniestralidad` tras una espera corta, el historial no
 * se pide en ese flujo: se quitan del plan de «Figuras» la compañía anterior y los siniestros (el nº de póliza nunca estuvo). Con
 * siniestros > 0 no hay dónde declararlos → atasco + hueco. Coche (o con el bloque presente): el plan queda igual.
 */
export async function planFigurasSinHistorial(nsei: Page, f: FormularioAuto, plan: PlanNsei, formador: ContextoFormador | undefined, esperaMs: number = ESPERA_OPCIONAL_MS): Promise<{ plan: PlanNsei; omitido: boolean }> {
  if (f.ramo !== 'moto') return { plan, omitido: false }
  if ((await nsei.locator('datos-licencia').count().catch(() => 0)) === 0) return { plan, omitido: false }
  if (await apareceEn(nsei, 'app-historial-siniestralidad', esperaMs)) return { plan, omitido: false }
  if ((f.siniestrosUltimos5Anios ?? 0) > 0) await huecoPaso(nsei, formador, 'siniestros', 'Figuras', 'el riesgo de moto trae siniestros y «Figuras» no pinta el bloque de historial de siniestralidad donde declararlos')
  formador?.log('mapfre_historial_ausente_moto', {})
  const fuera = (o: OperacionNsei) => o.sel.startsWith('app-historial-siniestralidad')
  return { plan: { escribibles: plan.escribibles.filter((o) => !fuera(o)), pendientes: plan.pendientes.filter((o) => !fuera(o)) }, omitido: true }
}

const ESPERA_PRIMAS_MS = 60_000

/** Aviso fijo cuando el proyecto quedó generado en Mapfre (para rescatarlo si el cliente acepta). */
export const AVISO_PROYECTO_MAPFRE = 'Proyecto guardado en Mapfre (no es póliza)'

type ResultadoProyecto = import('../../guard.ts').ResultadoProyectoMapfre

/**
 * v0.8.14: lleva el resultado de «Generar Proyecto» a CADA oferta (un proyecto de NSEI cubre la tarificación entera). Generado →
 * `referenciaPortal` = nº de proyecto + aviso. Sin nº / no generado → solo un aviso legible (no es error del precio). PURA.
 */
export function ofertasConProyectoMapfre(ofertas: readonly OfertaNormalizada[], r: ResultadoProyecto): OfertaNormalizada[] {
  const aviso =
    r.estado === 'generado'
      ? `${AVISO_PROYECTO_MAPFRE}: nº ${r.numero}.`
      : r.estado === 'sin_numero'
        ? `Se pulsó «Generar Proyecto» en Mapfre pero no se leyó el nº de proyecto (${r.motivo}): compruébalo en Mapfre.`
        : `Proyecto NO guardado en Mapfre: ${r.motivo}.`
  const ref = r.estado === 'generado' ? r.numero : null
  return ofertas.map((o) => ({ ...o, referenciaPortal: ref ?? o.referenciaPortal, avisos: [...o.avisos, aviso] }))
}
const SEL_DIALOGO_OCUPADO = 'mat-dialog-container, [role="dialog"], [role="alertdialog"]'

/** Texto VISIBLE de Coberturas (o de la página) recortado y REDACTADO, para el atasco cuando no hay prima legible. */
async function textoVisibleSaneado(nsei: Page): Promise<string> {
  const cob = nsei.locator('app-coberturas').first()
  const t = (await cob.count().catch(() => 0)) > 0 ? await cob.innerText({ timeout: 1_000 }).catch(() => '') : await textoPagina(nsei)
  return redactarDatosPersonales(limpiar(t)).slice(0, 240)
}

/**
 * Paso 4 «Coberturas»: cierra «Club MAPFRE» si sale (por `ctx.cerrarClubMapfre`, botón izquierdo validado en guard.ts) y
 * ESPERA de forma robusta a que las tarjetas de producto tengan una prima LEGIBLE y QUIETA entre dos lecturas (sin diálogos de
 * «Calculando…» abiertos). Comprueba que el paso activo es Coberturas. Agotada la espera → atasco con el texto visible saneado.
 * Solo lectura: aquí no se pulsa nada más («Generar Proyecto» va DESPUÉS, por `ctx.generarProyectoMapfre`; «Ir a generar», nunca).
 */
export async function esperarPrimasMapfre(nsei: Page, ctx: Pick<ContextoPortal, 'cerrarClubMapfre' | 'formador'>, esperaMs = ESPERA_PRIMAS_MS): Promise<PrimaProductoMapfre[]> {
  const hasta = Date.now() + esperaMs
  let previo: string | null = null
  let clubCerrado = false
  for (;;) {
    if (!clubCerrado && (await nsei.locator(SEL_CLUB_MAPFRE).locator('visible=true').count().catch(() => 0)) > 0) {
      if (!ctx.cerrarClubMapfre) await huecoPaso(nsei, ctx.formador, 'club mapfre', 'Coberturas', 'el diálogo «Club MAPFRE» (contexto sin la función guardada que lo cierra)')
      await ctx.cerrarClubMapfre!(nsei).catch(async (e: unknown) => {
        if (e instanceof EmisionBloqueadaError) throw e
        return huecoPaso(nsei, ctx.formador, 'club mapfre', 'Coberturas', `el diálogo «Club MAPFRE» no se pudo cerrar por su botón izquierdo (${e instanceof Error ? e.message.slice(0, 160) : 'error'})`)
      })
      clubCerrado = true
      previo = null
      continue
    }
    const ocupado = (await nsei.locator(SEL_DIALOGO_OCUPADO).locator('visible=true').count().catch(() => 0)) > 0
    if (!ocupado) {
      const tarjetas = await leerTarjetasPrima(nsei).catch(() => [] as TarjetaProductoLeida[])
      const legibles = tarjetasListasParaLeer(tarjetas)
      const firma = legibles ? firmaTarjetas(tarjetas) : null
      if (firma !== null && firma === previo) {
        const paso = await pasoActivoMapfre(nsei)
        if (paso?.includes('CONTRATACION')) throw new EmisionBloqueadaError('fase', 'Mapfre: al leer las primas el paso activo es «Contratación»')
        if (!paso?.includes('COBERTURAS')) await huecoPaso(nsei, ctx.formador, 'coberturas', 'Coberturas', 'el paso activo al leer las primas no es «Coberturas»')
        return primasDesdeTarjetas(tarjetas)
      }
      previo = firma
    }
    if (Date.now() >= hasta) {
      const visto = await textoVisibleSaneado(nsei)
      await huecoPaso(nsei, ctx.formador, 'prima coberturas', 'Coberturas', `la prima anual en «Coberturas» (ninguna tarjeta con «PRIMA TOTAL: 1.234,56 €» legible tras ${Math.round(esperaMs / 1000)} s; texto visible: «${visto || '(vacío)'}»)`)
    }
    await nsei.waitForTimeout(400)
  }
}

/**
 * Del paso 2 (vehículo ya confirmado) al PRECIO: CP de circulación + uso/ámbito → «Continuar» → licencia del tomador (clase
 * de permiso y «Valido desde»), siniestros y compañía anterior (+ comprobación del nº de póliza anterior) → «Continuar» del
 * paso 3 (calcula las primas; Alberto, 14/10/2026) → «Club MAPFRE» (cerrar) → lectura de las tarjetas de precio. Y PARA.
 * Antes de cada «Continuar», `exigirPasoCompleto`: un mat-select sin valor en el riesgo para con inventario, sin precio supuesto.
 */
export async function precioDesdeObjetoAsegurado(
  nsei: Page,
  form: FormularioAuto,
  vehiculo: VehiculoConfirmado,
  ctx: Pick<ContextoPortal, 'continuarMapfre' | 'formador' | 'elegirMatSelect' | 'cerrarClubMapfre'> & Partial<Pick<ContextoPortal, 'generarProyectoMapfre'>>,
  esperaPrimasMs = ESPERA_PRIMAS_MS,
  supuestos: string | null = null,
): Promise<ResultadoAdaptador> {
  // v0.8.7: MOTO por el mismo plan que el coche (antes: hueco de mapa «el plan de campos de MOTO en NSEI»).
  // Antecedentes favorables (18/10/2026) también para el interruptor de compañía anterior de `historialAnterior`.
  const f = conAntecedentesFavorables(form).formulario
  const plan = planObjetoYFiguras(f)
  const respaldo: RespaldoCampos = { page: nsei, formador: ctx.formador }
  await rellenarCamposTexto(nsei, planDelPaso(plan, 'objetoAsegurado', [SEL_OBJETO.matricula]), respaldo)
  await rellenarMatSelects(nsei, planDelPaso(plan, 'objetoAsegurado'), ctx, respaldo)
  exigirPasoCompleto(await sinOpcionalesAusentes(nsei, planDelPaso(plan, 'objetoAsegurado')), 'objetoAsegurado')
  await continuar(nsei, ctx, 'objetoAsegurado')
  // Orden de la grabación: licencia (clase y fecha) → compañía anterior → nº de póliza anterior.
  await rellenarMatSelects(nsei, { escribibles: planDelPaso(plan, 'figuras').escribibles.filter((o) => o.sel === SEL_LICENCIA.clasePermiso), pendientes: [] }, ctx, respaldo)
  const sinHist = await planFigurasSinHistorial(nsei, f, plan, ctx.formador)
  const planFig = sinHist.plan
  await rellenarCamposTexto(nsei, planDelPaso(planFig, 'figuras', [SEL_HISTORIAL.siniestrosRc5]), respaldo)
  await rellenarMatSelects(nsei, { escribibles: planDelPaso(planFig, 'figuras').escribibles.filter((o) => o.sel !== SEL_LICENCIA.clasePermiso), pendientes: [] }, ctx, respaldo)
  const diagnosticoPoliza = sinHist.omitido ? null : await historialAnterior(nsei, f, ctx.formador)
  // v0.8.4: los siniestros, AL FINAL del historial (como la grabación: compañía → nº de póliza → salir). Con 0 y el campo
  // deshabilitado (estado natural del portal) no se tocan; con >0 y deshabilitado → atasco + hueco (no hay forma grabada).
  await rellenarCamposTexto(nsei, { escribibles: planDelPaso(planFig, 'figuras').escribibles.filter((o) => o.sel === SEL_HISTORIAL.siniestrosRc5), pendientes: [] }, respaldo)
  exigirPasoCompleto(planFig, 'figuras')
  await continuar(nsei, ctx, 'figuras')
  const primas = await esperarPrimasMapfre(nsei, ctx, esperaPrimasMs)
  // 18/10/2026: lo que Mapfre USÓ, leído del portal: el CP de circulación del paso 2 y la fila de vehículo confirmada (Mapfre da
  // marca + modelo + versión en un solo texto). Localidad: NSEI no la pide para el riesgo → null.
  const cpPortal = await nsei.locator(SEL_OBJETO.cpCirculacion).first().inputValue({ timeout: 2_000 }).catch(() => null)
  const usados = { codigoPostal: cpPortal, localidad: null, vehiculo: { marca: null, modelo: null, version: null, denominacion: vehiculo?.denominacion ?? null } }
  // v0.8.14: «Generar Proyecto» DESPUÉS de leer (el precio ya está a salvo). Una violación del guard se relanza (fail-closed).
  const proyecto: ResultadoProyecto = ctx.generarProyectoMapfre
    ? await ctx.generarProyectoMapfre(nsei)
    : { estado: 'no_generado', motivo: 'el runner no trae la puerta de «Generar Proyecto»' }
  ctx.formador?.log('mapfre_generar_proyecto', { estado: proyecto.estado })
  return { ofertas: ofertasConProyectoMapfre(conDatosUsados(ofertasDesdePrimasMapfre(primas, null, supuestos, diagnosticoPoliza), usados), proyecto), vehiculoConfirmado: vehiculo }
}

/**
 * Adaptador de Mapfre (registrado SIEMPRE; la puerta es la fila `companias_integracion`). Coche y moto comparten NSEI
 * («Turismos y Motos»). Flujo: login → entrada (pestaña nueva de NSEI) → paso 1 (NIF → salir del campo, Mapfre busca sola; si no existe, alta en el formulario →
 * «Continuar») → vehículo confirmado por matrícula (fila por regla fija) → CP → «Continuar» → licencia + compañía anterior →
 * «Continuar» (calcula) → «Club MAPFRE» (cerrar) → LECTURA de la prima en Coberturas → «Generar Proyecto» (v0.8.14) y lectura del nº. Ahí PARA.
 */
export const mapfreAuto = {
  compania: 'mapfre',
  ramo: 'auto',
  credencial: 'MAPFRE_WMEDIADORES',
  version: '0.8.15',
  async tarificar(page: Page, form: FormularioAuto, ctx: ContextoPortal): Promise<ResultadoAdaptador> {
    if (form?.ramo !== 'auto' && form?.ramo !== 'moto') throw new ErrorTarificador('datos', 'mapfre/auto: el formulario no es de auto ni de moto')
    const pulsarEnlaceEntrada = ctx?.pulsarEnlaceEntrada
    if (!pulsarEnlaceEntrada || !ctx.confirmarVehiculoMapfre || !ctx.continuarMapfre || !ctx.cerrarClubMapfre) throw new ErrorMapaIncompleto('las funciones guardadas de la entrada, del vehículo, de «Continuar» y de «Club MAPFRE» en el contexto del runner')
    // Sin NIF del tomador no se abre el portal (asegura lo pone; si falta, es un dato, no un hueco).
    if (documentoTomadorDe(form) === null) throw new ErrorTarificador('datos', 'mapfre/auto: falta el NIF/CIF del tomador (Mapfre lo busca en el paso 1; asegura lo pone desde la ficha del cliente)')
    // Coche: lo que falta del riesgo para los pasos 2-3 (compañía anterior, conductor = tomador…) se sabe ANTES de abrir el portal.
    // v0.8.7: también moto (mismo plan; clase de permiso de moto).
    planObjetoYFiguras(form)
    await login(page, ctx)
    await ctx.trasLogin()
    const nsei = await abrirTarificacionRapidaAuto(page, { pulsar: ctx.pulsar, pausa: ctx.pausa, pulsarEnlaceEntrada, formador: ctx.formador, credenciales: ctx.credenciales, log: ctx.log })
    await pasoDatosBasicos(nsei, form, ctx)
    const { vehiculo: vehiculoConfirmado, supuestoVersion } = await consultarVehiculoPorMatriculaConSupuesto(nsei, form.matricula, ctx, undefined, { page: nsei, formador: ctx.formador }, form)
    ctx.log('vehiculo confirmado')
    // 18/10/2026: los antecedentes SUPUESTOS (favorables) van detrás del supuesto del vehículo, en el mismo aviso.
    // Conductor = tomador sin `tomadorEsConductor` (solo pasa con la fecha de nacimiento de la ficha igual: `exigirConductorEsTomador`):
    // SUPUESTO declarado, no dato.
    const conductor = supuestoConductorTomador(form)
    return precioDesdeObjetoAsegurado(nsei, form, vehiculoConfirmado, ctx, undefined, textoSupuestos([...(supuestoVersion ? [supuestoVersion] : []), ...(clasePermisoNsei(form).supuesto ? [SUPUESTO_CLASE_PERMISO_MOTO] : []), ...(conductor ? [conductor] : []), ...conAntecedentesFavorables(form).supuestos]))
  },
} as const

/** MOTO: el mismo flujo NSEI que el coche (misma entrada «Turismos y Motos»), registrado con su propio ramo. */
export const mapfreMoto = { ...mapfreAuto, ramo: 'moto' } as const
