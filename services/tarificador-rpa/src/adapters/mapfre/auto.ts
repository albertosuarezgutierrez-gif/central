// Mapfre wmediadores · NSEI «Nueva Alta» AUTO y MOTO (13-14/10/2026).
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
// `ctx.confirmarVehiculoMapfre` (función guardada de guard.ts: la PRIMERA fila, y solo si su matrícula es la del riesgo,
// comparada dentro del guard). Devuelve `VehiculoConfirmado` (module-tarificacion), que alimentará a los demás bots (fase siguiente).
// NIF del tomador (paso 1): lo pone ASEGURA desde la ficha (`documentoTomador`); campo mapeado, LUPA sin DOM grabado.
// «Continuar» 1 → 2 → 3 por `ctx.continuarMapfre` (guard.ts). Lo que depende de pantallas NO mapeadas (lupa, mat-select)
// es `ErrorMapaIncompleto` con `pideInventarioDom` = el runner adjunta el inventario de estructura en la primera prueba real.
//
// 🚨 SEGURIDAD. Este fichero NO pulsa nada (ni `.click`, ni `ctx.pulsar`): solo lee y rellena campos de texto, siempre
// tras `comprobarCampo`. Los clics de la entrada van por `entrada.ts`; el del diálogo de vehículo y «Continuar», por guard.ts. No hay selectores para: «Contratar» (uno por producto, en la tarjeta de prima), el paso 6, «Generar
// Proyecto» / «Ir a generar proyecto» (crean un nº de proyecto REAL en Mapfre y generan documentación), el «Aceptar» de
// documentos, el «Aceptar Obs. y Cláusulas», el «Aceptar» de descuentos/verificación, ni la casilla de la cláusula de
// declaración. «Continuar» del paso 3 NO es un avance neutro: lanza «Verificando controles técnicos» + «Calculando las
// primas» (es lo que lleva a precio): PERMITIDO por Alberto (14/10/2026), solo por `pulsarContinuarMapfre` desde «Figuras».
// Datos personales: la matrícula, los NIF, las fechas y el IBAN solo se escriben en su campo; nunca en logs ni mensajes.

import type { Frame, Locator, Page } from 'playwright'
import {
  documentoTomadorDe,
  importeEs,
  normalizarMatricula,
  resolverVersion,
  vehiculoConfirmadoDesdeMapfre,
  type CandidatoVersion,
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
import { fechaEs } from '../allianz/comunidades.ts'
import { campoConRespaldo, type ContextoFormador } from '../../formador.ts'
import { abrirTarificacionRapidaAuto } from './entrada.ts'
import { login } from './login.ts'

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

/** Paso 1 · Datos básicos: tomador y compañía. El NIF se teclea y se busca con la lupa (clic → hueco). */
export const SEL_TOMADOR = {
  documento: 'app-datos-basicos input[name="codigoDocumento"]',
  razonSocial: 'app-datos-basicos input[name="razonSocial"]',
} as const

/** Paso 3 · Figuras → `app-conductor-habitual` (+ `app-historial-siniestralidad` anidado). */
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
  producto: 'app-primas prima-producto',
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
}

export type PrimaProductoMapfre = { producto: string; periodicidad: 'anual'; primaTotalEur: number; requiereVerificacionVehiculo: boolean }

const limpiar = (s: string) => s.replace(/\s+/g, ' ').trim()

/**
 * Importe de «PRIMA TOTAL: 1.234,56 €». Fail-closed: sin la etiqueta, con basura o ≤ 0 → `null` (nunca 0).
 * El placeholder `{{primaTotal}}` que la plantilla deja en el paso 6 sin calcular tampoco casa.
 */
export function importeDePrimaTotal(texto: string | null | undefined): number | null {
  if (typeof texto !== 'string') return null
  const m = /PRIMA\s+TOTAL\s*:\s*([\d.]+,\d{2})\s*€/i.exec(limpiar(texto))
  if (!m) return null
  const n = importeEs(m[1]!)
  return n !== null && n > 0 ? n : null
}

/**
 * Tarjetas leídas → primas. Fail-closed: una tarjeta cuya prima no se lee es un error `portal` (no se omite en silencio, que
 * dejaría un producto «inexistente»); ninguna tarjeta → error; periodicidad distinta de ANUAL → hueco (no se convierte).
 */
export function primasDesdeTarjetas(tarjetas: readonly TarjetaProductoLeida[]): PrimaProductoMapfre[] {
  if (tarjetas.length === 0) throw new ErrorTarificador('portal', 'mapfre/auto: el paso Coberturas no trae ninguna tarjeta de producto')
  return tarjetas.map((t) => {
    const producto = limpiar(t.producto)
    if (producto === '') throw new ErrorTarificador('portal', 'mapfre/auto: una tarjeta de producto no trae nombre')
    const prima = importeDePrimaTotal(t.textoPrima)
    if (prima === null) throw new ErrorTarificador('portal', `mapfre/auto: prima ilegible en el producto «${producto}»`)
    if (limpiar(t.periodicidad).toUpperCase() !== 'ANUAL') throw new ErrorMapaIncompleto(`la periodicidad «${limpiar(t.periodicidad)}» del producto «${producto}» (solo se ha visto ANUAL)`)
    return { producto, periodicidad: 'anual' as const, primaTotalEur: prima, requiereVerificacionVehiculo: t.avisoVerificacion }
  })
}

/** Lee las tarjetas de precio del paso Coberturas ya calculado. Solo lectura. */
export async function leerPrimasMapfre(raiz: Pick<Frame, 'locator'>): Promise<PrimaProductoMapfre[]> {
  const tarjetas = await raiz.locator(SEL_PRIMAS.producto).evaluateAll(
    (els, s) =>
      els.map((e) => {
        const textos = Array.from(e.querySelectorAll(s.desplegables)).map((x) => x.textContent ?? '')
        return {
          producto: textos[0] ?? '',
          periodicidad: textos[1] ?? '',
          textoPrima: e.querySelector(s.prima)?.textContent ?? '',
          avisoVerificacion: e.querySelector(s.avisoVerificacion) !== null,
        }
      }),
    { desplegables: SEL_PRIMAS.desplegables, prima: SEL_PRIMAS.prima, avisoVerificacion: SEL_PRIMAS.avisoVerificacion },
  )
  return primasDesdeTarjetas(tarjetas)
}

/** Primas → ofertas normalizadas (una por producto). `vehiculo` es opcional: Mapfre no separa marca y modelo (ver `lecturaResumenVehiculo`). */
export function ofertasDesdePrimasMapfre(primas: readonly PrimaProductoMapfre[], vehiculo: Vehiculo | null): OfertaNormalizada[] {
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

const ESPERA_DIALOGO_VEHICULO_MS = 15_000

/**
 * Paso 2 · VEHÍCULO CONFIRMADO por matrícula (coche y moto). Con el paso «Objeto asegurado» activo en `nsei` (la pestaña de
 * NSEI): teclea la matrícula (`comprobarCampo` + `fill`), espera el diálogo «Selección de vehículo», lee sus filas (sin
 * matrícula ni bastidor) y confirma la PRIMERA por `ctx.confirmarVehiculoMapfre` (guard.ts compara allí la matrícula de esa
 * fila con la del riesgo; no casa → `datos`). 0 filas → `datos`; varias → la primera (Alberto, 14/10/2026). Devuelve el vehículo SIN matrícula.
 * Ningún mensaje lleva la matrícula. No aparece el campo o el diálogo → `ErrorMapaIncompleto` con inventario.
 */
export async function consultarVehiculoPorMatricula(
  nsei: Page,
  matricula: string,
  ctx: Pick<ContextoPortal, 'confirmarVehiculoMapfre'>,
  esperaDialogoMs = ESPERA_DIALOGO_VEHICULO_MS,
  respaldo: RespaldoCampos = SIN_RESPALDO,
): Promise<VehiculoConfirmado> {
  if (!ctx.confirmarVehiculoMapfre) throw new ErrorMapaIncompleto('la función guardada que confirma el vehículo (contexto sin `confirmarVehiculoMapfre`)')
  const r = await campoConRespaldo(nsei, SEL_OBJETO.matricula, { ...respaldo, page: respaldo.page ?? null, etiqueta: 'Matrícula', descripcion: 'Campo «Matrícula» del vehículo en el paso «Objeto asegurado» de Mapfre NSEI' })
  if (!r) throw new ErrorMapaIncompleto('el campo de matrícula del paso «Objeto asegurado» (no aparece)', true)
  const campo = r.campo
  await comprobarCampo(campo)
  await campo.fill(matricula)
  if (normalizarMatricula(await campo.inputValue()) !== normalizarMatricula(matricula)) throw new ErrorTarificador('portal', 'mapfre/auto: el portal no dejó fijada la matrícula')
  await r.confirmar().catch(() => undefined)
  try {
    await nsei.locator(SEL_DIALOGO_VEHICULO.contenedor).first().waitFor({ state: 'visible', timeout: esperaDialogoMs })
  } catch {
    throw new ErrorMapaIncompleto('cómo se lanza la búsqueda por matrícula (tras teclearla no aparece «Selección de vehículo»)', true)
  }
  const filas = await leerFilasDialogoVehiculo(nsei)
  if (filas.length === 0) throw new ErrorTarificador('datos', 'mapfre/auto: «Selección de vehículo» no trae ningún vehículo para la matrícula del riesgo')
  // Varias filas → la PRIMERA (Alberto, 14/10/2026); el guard confirma esa misma fila y exige su matrícula = la del riesgo.
  const vehiculo = vehiculoConfirmadoDesdeMapfre(filas[0]!)
  if (!vehiculo) throw new ErrorTarificador('portal', 'mapfre/auto: la fila de «Selección de vehículo» no trae denominación comercial legible')
  await ctx.confirmarVehiculoMapfre(nsei, matricula)
  return vehiculo
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
export type OperacionNsei = { sel: string; etiqueta: string; tipo: 'texto' | 'mat-select' | 'interruptor' | 'casilla'; valor: string | boolean; paso: IdPasoNsei }

const CP = /^\d{5}$/

/**
 * Campos de los pasos 2 y 3 que la grabación permite escribir, a partir del formulario canónico. Puro. FAIL-CLOSED:
 * lo que Mapfre pide y el formulario no trae → `datos`; nada se inventa. La matrícula y las fechas son dato personal.
 *   · `siniestrosUltimos5Anios` → «Siniestros RC 5 últimos años» (texto numérico).
 *   · Fechas del conductor en DD/MM/AAAA (formato visto en la grabación).
 * Lo que NO está en el formulario canónico (y la grabación pide): NIF del conductor (búsqueda por NIF), clase del permiso,
 * compañía anterior y su nº de póliza, uso y ámbito de circulación. Van como `pendientes` en `PlanNsei`, no se asumen.
 */
export type PlanNsei = { escribibles: OperacionNsei[]; pendientes: OperacionNsei[] }

export function planObjetoYFiguras(f: FormularioAuto): PlanNsei {
  if (f.ramo !== 'auto') throw new ErrorTarificador('datos', `mapfre/auto: el formulario es de ${f.ramo}`)
  if (!CP.test(f.codigoPostal)) throw new ErrorTarificador('datos', 'mapfre/auto: el código postal de circulación tiene que tener 5 dígitos')
  if (f.siniestrosUltimos5Anios === null) throw new ErrorTarificador('datos', 'mapfre/auto: faltan los siniestros RC de los últimos 5 años (el portal no admite «sin dato»)')
  if (f.aniosAseguradoAnterior === null) throw new ErrorTarificador('datos', 'mapfre/auto: faltan los años asegurado en la compañía anterior (el portal pregunta si tiene compañía anterior: no se asume)')
  const escribibles: OperacionNsei[] = [
    { sel: SEL_OBJETO.matricula, etiqueta: 'matrícula', tipo: 'texto', valor: f.matricula, paso: 'objetoAsegurado' },
    { sel: SEL_OBJETO.cpCirculacion, etiqueta: 'CP de circulación', tipo: 'texto', valor: f.codigoPostal, paso: 'objetoAsegurado' },
    { sel: SEL_CONDUCTOR.fechaNacimiento, etiqueta: 'fecha de nacimiento del conductor', tipo: 'texto', valor: fechaEs(f.conductor.fechaNacimiento), paso: 'figuras' },
    { sel: SEL_CONDUCTOR.fechaCarne, etiqueta: 'fecha del carné', tipo: 'texto', valor: fechaEs(f.conductor.fechaCarne), paso: 'figuras' },
    { sel: SEL_HISTORIAL.siniestrosRc5, etiqueta: 'siniestros RC 5 años', tipo: 'texto', valor: String(f.siniestrosUltimos5Anios), paso: 'figuras' },
  ]
  const pendientes: OperacionNsei[] = [
    { sel: SEL_OBJETO.uso, etiqueta: 'uso del vehículo', tipo: 'mat-select', valor: '', paso: 'objetoAsegurado' },
    { sel: SEL_OBJETO.ambitoCirculacion, etiqueta: 'ámbito de circulación', tipo: 'mat-select', valor: '', paso: 'objetoAsegurado' },
    { sel: SEL_CONDUCTOR.claseCarne, etiqueta: 'clase del permiso', tipo: 'mat-select', valor: '', paso: 'figuras' },
  ]
  pendientes.push({ sel: SEL_HISTORIAL.tieneCompaniaAnterior, etiqueta: '¿tiene compañía anterior?', tipo: 'interruptor', valor: f.aniosAseguradoAnterior > 0, paso: 'figuras' })
  if (f.aniosAseguradoAnterior > 0) pendientes.push({ sel: SEL_HISTORIAL.companiaAnterior, etiqueta: 'compañía anterior', tipo: 'mat-select', valor: '', paso: 'figuras' })
  return { escribibles, pendientes }
}

/**
 * Escribe los campos de texto del plan (nunca los `pendientes`). Cada uno: existe → `comprobarCampo` → `fill` → relectura.
 * `fill` de Playwright lanza `input`, que es lo que escucha Angular Material (no hace falta `change` a mano). Devuelve las
 * etiquetas de lo que quedó sin escribir para que el llamante lo sepa (no se calla).
 */
export async function rellenarCamposTexto(raiz: Pick<Frame, 'locator'>, plan: PlanNsei, respaldo: RespaldoCampos = SIN_RESPALDO): Promise<string[]> {
  for (const op of plan.escribibles) {
    if (op.tipo !== 'texto') continue
    const r = await campoConRespaldo(raiz, op.sel, { ...respaldo, etiqueta: op.etiqueta, descripcion: `Campo «${op.etiqueta}» del paso «${PASOS_NSEI.find((x) => x.id === op.paso)!.nombre}» de Mapfre NSEI` })
    if (!r) throw new ErrorMapaIncompleto(`el campo «${op.etiqueta}» (${op.sel}; no aparece)`, true)
    const campo: Locator = r.campo
    await comprobarCampo(campo)
    await campo.fill(String(op.valor))
    if ((await campo.inputValue()) !== String(op.valor)) throw new ErrorTarificador('portal', `mapfre/auto: el portal no dejó fijado el campo «${op.etiqueta}»`)
    await r.confirmar().catch(() => undefined)
  }
  return plan.pendientes.map((p) => p.etiqueta)
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

const continuar = (nsei: Page, ctx: Pick<ContextoPortal, 'continuarMapfre'>, paso: 'datosBasicos' | 'objetoAsegurado' | 'figuras') => {
  if (!ctx.continuarMapfre) throw new ErrorMapaIncompleto('la función guardada «Continuar» de Mapfre en el contexto del runner')
  return ctx.continuarMapfre(nsei, paso)
}

/**
 * HUECO · la LUPA que busca al tomador por NIF/CIF en el paso 1. Sin DOM grabado del control (la grabación empieza con el
 * tomador ya cargado; Alberto la describió, sin selector). Para ANTES de teclear el NIF: tecleado y sin buscar, quedaría en
 * la pantalla de la evidencia. Pide el inventario de estructura (que ya recoge `mat-icon`) para mapearla en la 1.ª prueba.
 */
export async function buscarTomadorPorNif(_nsei: Page, _campo: Locator): Promise<void> {
  throw new ErrorMapaIncompleto('la lupa de búsqueda del tomador por NIF/CIF del paso 1 «Datos básicos» (sin DOM grabado; el campo NIF sí está mapeado)', true)
}

/**
 * Paso 1 «Datos básicos»: NIF/CIF del tomador → lupa → «Continuar» (guardado). El NIF lo pone asegura desde la ficha del
 * cliente (`documentoTomador`) o viene en `tomador.documentoIdentidad`; sin él → `datos` sin tocar nada. El NIF solo va a
 * su campo: nunca a logs, mensajes ni resultado.
 */
export async function pasoDatosBasicos(nsei: Page, f: FormularioAuto, ctx: Pick<ContextoPortal, 'continuarMapfre' | 'formador'>): Promise<void> {
  if (documentoTomadorDe(f) === null) throw new ErrorTarificador('datos', 'mapfre/auto: falta el NIF/CIF del tomador (Mapfre lo busca en el paso 1; asegura lo pone desde la ficha del cliente)')
  const r = await campoConRespaldo(nsei, SEL_TOMADOR.documento, { page: nsei, formador: ctx.formador, etiqueta: 'NIF/CIF', descripcion: 'Campo del documento (NIF/CIF) del TOMADOR en el paso 1 «Datos básicos» de Mapfre NSEI (no el del conductor)' })
  if (!r) throw new ErrorMapaIncompleto('el campo NIF/CIF del tomador del paso 1 «Datos básicos» (no aparece)', true)
  const campo = r.campo
  await comprobarCampo(campo)
  await buscarTomadorPorNif(nsei, campo)
  await continuar(nsei, ctx, 'datosBasicos')
}

/**
 * Del paso 2 (vehículo ya confirmado) al PRECIO: CP de circulación → «Continuar» → fechas del conductor y siniestros →
 * «Continuar» del paso 3 (calcula las primas; Alberto, 14/10/2026) → lectura de las tarjetas de precio. Antes de cada
 * «Continuar», `exigirPasoCompleto`: hoy uso/ámbito (paso 2) y clase de permiso / compañía anterior (paso 3) son mat-select
 * sin DOM grabado abierto → para con inventario en el paso 2, sin precio supuesto.
 */
export async function precioDesdeObjetoAsegurado(nsei: Page, f: FormularioAuto, vehiculo: VehiculoConfirmado, ctx: Pick<ContextoPortal, 'continuarMapfre' | 'formador'>): Promise<ResultadoAdaptador> {
  if (f.ramo === 'moto') throw new ErrorMapaIncompleto('el plan de campos de MOTO en NSEI (clase de permiso y figuras sin grabación de moto)', true)
  const plan = planObjetoYFiguras(f)
  const respaldo: RespaldoCampos = { page: nsei, formador: ctx.formador }
  await rellenarCamposTexto(nsei, planDelPaso(plan, 'objetoAsegurado', [SEL_OBJETO.matricula]), respaldo)
  exigirPasoCompleto(plan, 'objetoAsegurado')
  await continuar(nsei, ctx, 'objetoAsegurado')
  await rellenarCamposTexto(nsei, planDelPaso(plan, 'figuras'), respaldo)
  exigirPasoCompleto(plan, 'figuras')
  await continuar(nsei, ctx, 'figuras')
  const primas = await leerPrimasMapfre(nsei)
  return { ofertas: ofertasDesdePrimasMapfre(primas, null), vehiculoConfirmado: vehiculo }
}

/**
 * Adaptador de Mapfre (registrado SIEMPRE; la puerta es la fila `companias_integracion`). Coche y moto comparten NSEI
 * («Turismos y Motos»). Flujo: login → entrada (pestaña nueva de NSEI) → paso 1 (NIF; lupa = HUECO) → vehículo confirmado
 * por matrícula → CP → «Continuar» → figuras → «Continuar» (precio). Hoy para en la lupa del paso 1 con inventario.
 */
export const mapfreAuto = {
  compania: 'mapfre',
  ramo: 'auto',
  credencial: 'MAPFRE_WMEDIADORES',
  version: '0.4.0',
  async tarificar(page: Page, form: FormularioAuto, ctx: ContextoPortal): Promise<ResultadoAdaptador> {
    if (form?.ramo !== 'auto' && form?.ramo !== 'moto') throw new ErrorTarificador('datos', 'mapfre/auto: el formulario no es de auto ni de moto')
    const pulsarEnlaceEntrada = ctx?.pulsarEnlaceEntrada
    if (!pulsarEnlaceEntrada || !ctx.confirmarVehiculoMapfre || !ctx.continuarMapfre) throw new ErrorMapaIncompleto('las funciones guardadas de la entrada, del vehículo y de «Continuar» en el contexto del runner')
    // Sin NIF del tomador no se abre el portal (asegura lo pone; si falta, es un dato, no un hueco).
    if (documentoTomadorDe(form) === null) throw new ErrorTarificador('datos', 'mapfre/auto: falta el NIF/CIF del tomador (Mapfre lo busca en el paso 1; asegura lo pone desde la ficha del cliente)')
    await login(page, ctx)
    await ctx.trasLogin()
    const nsei = await abrirTarificacionRapidaAuto(page, { pulsar: ctx.pulsar, pausa: ctx.pausa, pulsarEnlaceEntrada, formador: ctx.formador })
    await pasoDatosBasicos(nsei, form, ctx)
    const vehiculoConfirmado = await consultarVehiculoPorMatricula(nsei, form.matricula, ctx, undefined, { page: nsei, formador: ctx.formador })
    ctx.log('vehiculo confirmado')
    return precioDesdeObjetoAsegurado(nsei, form, vehiculoConfirmado, ctx)
  },
} as const

/** MOTO: el mismo flujo NSEI que el coche (misma entrada «Turismos y Motos»), registrado con su propio ramo. */
export const mapfreMoto = { ...mapfreAuto, ramo: 'moto' } as const
