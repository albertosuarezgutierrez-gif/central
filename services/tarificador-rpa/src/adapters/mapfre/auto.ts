// Mapfre wmediadores · NSEI «Nueva Alta» AUTO (turismo) — MAPA DE PANTALLAS, APAGADO (13/10/2026).
// NO está registrado en `adapters/index.ts`: nada de producción lo ejecuta (MAPFRE_AUTO_ACTIVO = false).
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
// 🚨 SEGURIDAD. Este fichero NO pulsa nada (ni `.click`, ni `ctx.pulsar`): solo lee y rellena campos de texto, siempre
// tras `comprobarCampo`. No hay selectores para: «Contratar» (uno por producto, en la tarjeta de prima), el paso 6, «Generar
// Proyecto» / «Ir a generar proyecto» (crean un nº de proyecto REAL en Mapfre y generan documentación), el «Aceptar» de
// documentos, el «Aceptar Obs. y Cláusulas», el «Aceptar» de descuentos/verificación, ni la casilla de la cláusula de
// declaración. «Continuar» del paso 3 NO es un avance neutro: lanza «Verificando controles técnicos» + «Calculando las
// primas» (es lo que lleva a precio). Pulsarlo es DECISIÓN PENDIENTE de Alberto (ver `avanzarPasoGuardado`).
// Datos personales: la matrícula, los NIF, las fechas y el IBAN solo se escriben en su campo; nunca en logs ni mensajes.

import type { Frame, Locator } from 'playwright'
import {
  importeEs,
  resolverVersion,
  type CandidatoVersion,
  type EleccionVersion,
  type FormularioAuto,
  type OfertaNormalizada,
  type Vehiculo,
} from '@central/module-tarificacion'
import { ErrorTarificador } from '../../errores.ts'
import { comprobarCampo, ErrorEleccionVersion } from '../allianz/auto.ts'
import { fechaEs } from '../allianz/comunidades.ts'

/** Flag de registro: apagado por defecto. Nada lo enciende en producción. */
export const MAPFRE_AUTO_ACTIVO = false

/** Hueco declarado: falta un dato de la grabación. NO transitorio → `error_definitivo`, no se reintenta. */
export class ErrorMapaIncompleto extends ErrorTarificador {
  constructor(que: string) {
    super('portal', `mapfre/auto: mapa incompleto: faltan ${que}`)
    this.name = 'ErrorMapaIncompleto'
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

const limpiar = (s: string) => s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim()

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

/** HUECO: marcar la fila y confirmar el diálogo son dos clics, y el de confirmar lleva el verbo que `guard.ts` rechaza. */
export async function elegirFilaDialogo(_raiz: Pick<Frame, 'locator'>, _indice: number): Promise<never> {
  throw new ErrorMapaIncompleto('la elección de fila y la confirmación del diálogo «Selección de vehículo» (clics; necesitan una función guardada por fase en guard.ts)')
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
export type OperacionNsei = { sel: string; etiqueta: string; tipo: 'texto' | 'mat-select' | 'interruptor' | 'casilla'; valor: string | boolean }

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
  const escribibles: OperacionNsei[] = [
    { sel: SEL_OBJETO.matricula, etiqueta: 'matrícula', tipo: 'texto', valor: f.matricula },
    { sel: SEL_OBJETO.cpCirculacion, etiqueta: 'CP de circulación', tipo: 'texto', valor: f.codigoPostal },
    { sel: SEL_CONDUCTOR.fechaNacimiento, etiqueta: 'fecha de nacimiento del conductor', tipo: 'texto', valor: fechaEs(f.conductor.fechaNacimiento) },
    { sel: SEL_CONDUCTOR.fechaCarne, etiqueta: 'fecha del carné', tipo: 'texto', valor: fechaEs(f.conductor.fechaCarne) },
    { sel: SEL_HISTORIAL.siniestrosRc5, etiqueta: 'siniestros RC 5 años', tipo: 'texto', valor: String(f.siniestrosUltimos5Anios) },
  ]
  const pendientes: OperacionNsei[] = [
    { sel: SEL_OBJETO.uso, etiqueta: 'uso del vehículo', tipo: 'mat-select', valor: '' },
    { sel: SEL_OBJETO.ambitoCirculacion, etiqueta: 'ámbito de circulación', tipo: 'mat-select', valor: '' },
    { sel: SEL_CONDUCTOR.claseCarne, etiqueta: 'clase del permiso', tipo: 'mat-select', valor: '' },
  ]
  if (f.aniosAseguradoAnterior !== null) {
    pendientes.push({ sel: SEL_HISTORIAL.tieneCompaniaAnterior, etiqueta: '¿tiene compañía anterior?', tipo: 'interruptor', valor: f.aniosAseguradoAnterior > 0 })
    if (f.aniosAseguradoAnterior > 0) pendientes.push({ sel: SEL_HISTORIAL.companiaAnterior, etiqueta: 'compañía anterior', tipo: 'mat-select', valor: '' })
  }
  return { escribibles, pendientes }
}

/**
 * Escribe los campos de texto del plan (nunca los `pendientes`). Cada uno: existe → `comprobarCampo` → `fill` → relectura.
 * `fill` de Playwright lanza `input`, que es lo que escucha Angular Material (no hace falta `change` a mano). Devuelve las
 * etiquetas de lo que quedó sin escribir para que el llamante lo sepa (no se calla).
 */
export async function rellenarCamposTexto(raiz: Pick<Frame, 'locator'>, plan: PlanNsei): Promise<string[]> {
  for (const op of plan.escribibles) {
    if (op.tipo !== 'texto') continue
    const campo: Locator = raiz.locator(op.sel).first()
    if ((await campo.count()) === 0) throw new ErrorTarificador('portal', `mapfre/auto: no aparece el campo «${op.etiqueta}» (${op.sel})`)
    await comprobarCampo(campo)
    await campo.fill(String(op.valor))
    if ((await campo.inputValue()) !== String(op.valor)) throw new ErrorTarificador('portal', `mapfre/auto: el portal no dejó fijado el campo «${op.etiqueta}»`)
  }
  return plan.pendientes.map((p) => p.etiqueta)
}

// ───────────────────────── avance entre pasos y flujo (huecos) ─────────────────────────

/**
 * HUECO / DECISIÓN PENDIENTE. «Continuar» (pie del stepper) avanza de paso. Del paso 1 al 2 y del 2 al 3 es neutro, pero el
 * del paso 3 al 4 lanza «Verificando controles técnicos» y «Calculando las primas» (grabación p13 → p14) y es lo que lleva a
 * precio. Nada de eso se pulsa hasta que Alberto decida (a) si «Continuar» del paso 3 es aceptable como «tarificar» y (b) cómo
 * se pulsa sin que lo rechace el guard (el botón no casa con el patrón de emisión, pero el adaptador no pulsa nada por sí mismo).
 */
export async function avanzarPasoGuardado(_desde: IdPasoNsei): Promise<never> {
  throw new ErrorMapaIncompleto('el avance guardado entre pasos de NSEI («Continuar»; el del paso 3 calcula las primas) y la entrada al portal (menú wmediadores → Auto → Nueva Alta, sin grabar)')
}

/** Adaptador SIN registrar: existe para fijar el contrato y que el typecheck lo vea; `tarificar` para en el primer hueco. */
export const mapfreAuto = {
  compania: 'mapfre',
  ramo: 'auto',
  credencial: 'MAPFRE_WMEDIADORES',
  version: '0.1.0',
  async tarificar(): Promise<never> {
    throw new ErrorMapaIncompleto('el login de wmediadores y la entrada a NSEI (la grabación empieza ya dentro de la app)')
  },
} as const
