// Allianz ePAC · «Allianz HOGAR» — adaptador de TARIFICACIÓN (14/10/2026). APAGADO (`ALLIANZ_HOGAR_ACTIVO = false`):
// `adapters/index.ts` lo registra SOLO con el flag en `true`, y asegura aún no acepta trabajos de hogar (`validarEntradaRamo`).
//
// Fuente: las 6 exploraciones IA reales de Allianz Hogar (13-14/10/2026, tabla `seguros.tarificador_exploracion_pasos`; la
// última, 14/10 ~09:33). TODAS se quedaron en la PANTALLA 1; nada de lo que viene después se ha visto. Lo visto (estructura,
// sin valores):
//   · Entrada: Nueva Alta → «Particulares» → tesela «Allianz HOGAR» → iframe `appArea` con la app Angular de OTRO origen
//     `https://cloud.e-pacallianz.com/ngx-allianzhogar2053/` (no es el servlet legado de Comunidades/Moto).
//   · Asistente (`nx-multi-step-item`, role=tab): Vivienda · Valoración de bienes · Precio · Datos · Revisión · Pago ·
//     Confirmación. En la pantalla 1 solo «Vivienda» está habilitado.
//   · Pantalla 1 (títulos «¿Quién es el tomador?» + «Datos de la vivienda»), controles por `formcontrolname`: idType
//     (nx-dropdown «Tipo de documento»), idNumber, dateOfBirth, country (deshabilitado), postalCode, province (deshab.,
//     se autocompleta), town (combobox), streetType (deshab., se autocompleta), streetName (combobox), streetNumber, block,
//     stair, floor, flat, extraAddress, botón «Comprobar», yearOfConstruction, yearOfRefurbishment, surfaceAreaLiving,
//     surfaceAreaOutbuilding (deshab.); radios «Sin madera/Con madera», tipo de vivienda (8 opciones), régimen (toggle
//     «Propietario/Inquilino») y uso (Habitual, Alquiler, En venta y/o deshabitada, Secundaria, Turístico o vacacional);
//     avance `button#NextPageFromRisk` «SIGUIENTE», deshabilitado hasta completar los obligatorios.
//   · Problema visto en las exploraciones: «Año de construcción» y «Superficie de la vivienda» quedaban INVÁLIDOS (Angular
//     repinta el formulario tras el autocompletado de la dirección). Aquí se rellenan los ÚLTIMOS, por `formcontrolname`
//     (nada de refs viejos) y se comprueba que el valor quedó y que el control no está inválido.
//
// HUECOS (→ `ErrorMapaIncompleto` con inventario de estructura de todos los marcos, `pideInventarioDom`):
//   · la etiqueta exacta del «Tipo de documento» (el robot NO lo cambia: lee lo que muestra y solo sigue si es el del doc.);
//   · un CP con varias poblaciones, una vía que el autocompletado no resuelve, cualquier obligatorio que siga inválido o un
//     «SIGUIENTE» que siga deshabilitado (incluido el caso en que haga falta «Comprobar», que NO se pulsa: no está visto);
//   · TODO lo que hay tras «SIGUIENTE»: «Valoración de bienes» y la pantalla de PRECIO. Se llega, se reconoce el paso y se
//     para ahí pidiendo el inventario, para mapearlo en la 1.ª prueba real.
//
// SEGURIDAD: pulsar SOLO con `ctx.pulsar()` (guard de emisión: «SIGUIENTE»); las opciones del riesgo (madera, tipo, régimen,
// uso) SOLO con `ctx.marcarOpcionHogar` (guard.ts: lista cerrada de etiquetas exactas); cambiar un
// campo SOLO tras `comprobarCampo()` (manejadores + frontera de cuenta bancaria). Aquí no hay «Aceptar» (Hogar no tiene
// «Datos básicos»), ni Guardar/Archivar/Emitir/Contratar/Pagar. Si el asistente está en «Datos», «Revisión», «Pago» o
// «Confirmación» el robot para sin tocar nada (es territorio de emisión). Documento y fecha de nacimiento: solo en su
// campo; nunca en logs ni mensajes.

import type { Frame, Locator, Page } from 'playwright'
import { EmisionBloqueadaError, importeEs, type FormularioHogar, type OfertaNormalizada, type ResultadoAdaptador } from '@central/module-tarificacion'
import type { ContextoPortal } from '../../adaptador.ts'
import { ErrorTarificador } from '../../errores.ts'
import { esAppHogarAllianz } from '../../guard.ts'
import { comprobarCampo } from './auto.ts'
import { login, sesionSirve } from './comunidades.ts'
import { abrirNuevaAlta, esperarMarcoApp } from './entrada.ts'

/**
 * Flag de registro de Allianz HOGAR. APAGADO: lo enciende Alberto (en código, como `MOTO_ACTIVO`) cuando quiera la 1.ª prueba
 * real. Además hace falta que asegura acepte el ramo (`validarEntradaRamo` / `RAMOS_TARIFICABLES_RPA`, ver docs).
 */
export const ALLIANZ_HOGAR_ACTIVO = false

export const ADAPTADOR = 'allianz/hogar'

/** Hueco declarado: falta mapa. NO transitorio. Pide SIEMPRE el inventario de estructura (es como se mapeará la pantalla). */
export class ErrorMapaIncompleto extends ErrorTarificador {
  readonly pideInventarioDom: boolean
  constructor(que: string, pideInventarioDom = true) {
    super('portal', `${ADAPTADOR}: mapa incompleto: faltan ${que}`)
    this.pideInventarioDom = pideInventarioDom
    this.name = 'ErrorMapaIncompleto'
  }
}

// ───────────────────────── mapa VISTO (exploraciones 13-14/10/2026) ─────────────────────────

export const PRODUCTO_MENU = 'Allianz HOGAR'
/** ¿Es `url` la app de Allianz Hogar vista (iframe `appArea`)? Origen EXACTO + ruta `/ngx-allianzhogar…/` (guard.ts). Pura. */
export const esAppHogar = esAppHogarAllianz

/** Pasos del asistente, en orden (texto visible de `nx-multi-step-item`). */
export const PASOS_HOGAR = ['Vivienda', 'Valoración de bienes', 'Precio', 'Datos', 'Revisión', 'Pago', 'Confirmación'] as const
export type PasoHogar = (typeof PASOS_HOGAR)[number]
/** Pasos de EMISIÓN: el robot nunca debe estar ahí; si lo está, para sin tocar nada. */
export const PASOS_EMISION: readonly PasoHogar[] = ['Datos', 'Revisión', 'Pago', 'Confirmación']

/** Títulos de la pantalla 1 (h1-h6/legend), vistos. */
export const TITULOS_PANTALLA_VIVIENDA = ['¿Quién es el tomador?', 'Datos de la vivienda'] as const

/** `formcontrolname` de la pantalla 1. */
export const CONTROLES = {
  tipoDocumento: 'idType',
  documento: 'idNumber',
  fechaNacimiento: 'dateOfBirth',
  codigoPostal: 'postalCode',
  provincia: 'province',
  poblacion: 'town',
  tipoVia: 'streetType',
  nombreVia: 'streetName',
  numero: 'streetNumber',
  bloque: 'block',
  escalera: 'stair',
  planta: 'floor',
  puerta: 'flat',
  anioConstruccion: 'yearOfConstruction',
  anioReforma: 'yearOfRefurbishment',
  superficie: 'surfaceAreaLiving',
} as const

/** El avance de la pantalla 1 (id y texto vistos). Se pulsa SOLO con `ctx.pulsar()`. */
export const SEL_SIGUIENTE = 'button#NextPageFromRisk'
export const TEXTO_SIGUIENTE = 'SIGUIENTE'

/**
 * Etiquetas EXACTAS de las opciones del riesgo (vistas). Todas tienen que estar en `OPCIONES_RIESGO_HOGAR_ALLIANZ` (guard.ts,
 * lista cerrada; lo comprueba el test). La de planta baja llegó recortada en el inventario: ver guard.ts.
 */
export const ETIQUETAS_USO: Readonly<Record<FormularioHogar['hogar']['uso'], string>> = {
  habitual: 'Habitual',
  secundaria: 'Secundaria',
  alquiler: 'Alquiler',
  turistico: 'Turístico o vacacional',
}
export const ETIQUETAS_REGIMEN: Readonly<Record<FormularioHogar['hogar']['regimen'], string>> = {
  propietario: 'Propietario',
  inquilino: 'Inquilino',
}
export const ETIQUETAS_TIPO_VIVIENDA: Readonly<Record<FormularioHogar['hogar']['tipoVivienda'], string>> = {
  piso: 'Piso en alto',
  planta_baja: 'Planta Baja o piso con ventanas a menos de 3 metros del suelo',
  atico: 'Ático',
  adosada: 'Unifamiliar Adosada / Pareada',
  independiente: 'Unifamiliar Independiente',
}
export const ETIQUETAS_MADERA = { con: 'Con madera', sin: 'Sin madera' } as const

/**
 * Texto que el desplegable «Tipo de documento» tiene que ENSEÑAR para seguir (el robot no lo cambia: su lista no está vista).
 * HIPÓTESIS a confirmar en la 1.ª prueba: si muestra otra cosa → hueco con inventario (nunca se elige a ciegas).
 */
export const TIPO_DOCUMENTO_ESPERADO: Readonly<Record<'dni' | 'nie', readonly string[]>> = {
  dni: ['NIF', 'DNI', 'NIF/DNI', 'DNI/NIF'],
  nie: ['NIE'],
}

// ───────────────────────── puros ─────────────────────────

/** Sin mayúsculas, tildes ni espacios sobrantes. */
export function plano(t: string | null | undefined): string {
  return (t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

/** Tipo de documento del tomador por su forma (el validador ya comprobó la letra). */
export function claseDocumento(doc: string): 'dni' | 'nie' {
  return /^[XYZ]/i.test(doc) ? 'nie' : 'dni'
}

/** ¿El desplegable «Tipo de documento» muestra el tipo del documento? (exacto salvo mayúsculas/espacios). */
export function tipoDocumentoCasa(mostrado: string | null | undefined, doc: string): boolean {
  const m = plano(mostrado).replace(/\s*\/\s*/g, '/')
  return m !== '' && TIPO_DOCUMENTO_ESPERADO[claseDocumento(doc)].some((x) => plano(x) === m)
}

/** ¿El portal dejó en el campo lo escrito? (mayúsculas, espacios y separadores de miles/fecha aparte). Pura. */
export function valorQuedo(escrito: string, leido: string | null): boolean {
  if (leido === null) return false
  const n = (s: string) => s.toLowerCase().replace(/\s+/g, '')
  const a = n(escrito)
  const b = n(leido)
  if (b === '') return a === ''
  const sinSep = (s: string) => s.replace(/,0+$/, '').replace(/[.,/-]/g, '')
  return a === b || sinSep(a) === sinSep(b)
}

/** AAAA-MM-DD → dd/mm/aaaa (el datepicker de ePAC). */
export function fechaPortal(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) throw new ErrorTarificador('datos', `${ADAPTADOR}: fecha de nacimiento sin forma AAAA-MM-DD`)
  return `${m[3]}/${m[2]}/${m[1]}`
}

export type ItemPaso = { texto: string; deshabilitado: boolean; seleccionado: boolean | null }

/**
 * Paso ACTUAL del asistente: el marcado como seleccionado (aria-selected/aria-current) si hay EXACTAMENTE uno; si no, el
 * último habilitado (en el asistente los pasos posteriores al actual están deshabilitados). Un texto que no es de
 * `PASOS_HOGAR` o una lista vacía → `null` (no se sabe: el que llama para). Pura.
 */
export function pasoActual(items: readonly ItemPaso[]): PasoHogar | null {
  if (items.length === 0) return null
  const conocido = (t: string): PasoHogar | null => PASOS_HOGAR.find((p) => plano(p) === plano(t)) ?? null
  if (items.some((i) => conocido(i.texto) === null)) return null
  const sel = items.filter((i) => i.seleccionado === true)
  if (sel.length === 1) return conocido(sel[0].texto)
  const habilitados = items.filter((i) => !i.deshabilitado)
  return habilitados.length ? conocido(habilitados[habilitados.length - 1].texto) : null
}

/** Plan de la pantalla 1 (orden incluido): qué control recibe qué valor. Pura; los valores no salen de aquí. */
export type OperacionVivienda =
  | { tipo: 'escribir'; control: string; que: string; valor: string; autocompleta?: 'poblacion' | 'via' }
  | { tipo: 'opcion'; que: string; etiqueta: string }
export function planPantallaVivienda(f: FormularioHogar): OperacionVivienda[] {
  const i = f.inmueble
  const ops: OperacionVivienda[] = [
    { tipo: 'escribir', control: CONTROLES.documento, que: 'Número de documento', valor: f.tomador.documentoIdentidad },
    { tipo: 'escribir', control: CONTROLES.fechaNacimiento, que: 'Fecha de nacimiento', valor: fechaPortal(f.tomador.fechaNacimiento) },
    { tipo: 'escribir', control: CONTROLES.codigoPostal, que: 'Código postal', valor: i.codigoPostal, autocompleta: 'poblacion' },
    { tipo: 'escribir', control: CONTROLES.nombreVia, que: 'Nombre de la vía', valor: i.nombreVia, autocompleta: 'via' },
    { tipo: 'escribir', control: CONTROLES.numero, que: 'Número', valor: i.numero },
  ]
  if (i.bloque !== null) ops.push({ tipo: 'escribir', control: CONTROLES.bloque, que: 'Bloque', valor: i.bloque })
  if (i.escalera !== null) ops.push({ tipo: 'escribir', control: CONTROLES.escalera, que: 'Escalera', valor: i.escalera })
  if (i.planta !== null) ops.push({ tipo: 'escribir', control: CONTROLES.planta, que: 'Piso', valor: i.planta })
  if (i.puerta !== null) ops.push({ tipo: 'escribir', control: CONTROLES.puerta, que: 'Puerta', valor: i.puerta })
  // Opciones SIEMPRE (el portal trae una marcada de serie: se fija la del formulario, nunca se deja la de serie).
  ops.push(
    { tipo: 'opcion', que: 'madera', etiqueta: f.hogar.conMadera ? ETIQUETAS_MADERA.con : ETIQUETAS_MADERA.sin },
    { tipo: 'opcion', que: 'tipo de vivienda', etiqueta: ETIQUETAS_TIPO_VIVIENDA[f.hogar.tipoVivienda] },
    { tipo: 'opcion', que: 'régimen', etiqueta: ETIQUETAS_REGIMEN[f.hogar.regimen] },
    { tipo: 'opcion', que: 'uso', etiqueta: ETIQUETAS_USO[f.hogar.uso] },
  )
  // Año y m² los ÚLTIMOS: el autocompletado de la dirección repinta el formulario (exploraciones del 14/10).
  ops.push({ tipo: 'escribir', control: CONTROLES.anioConstruccion, que: 'Año de construcción', valor: String(i.anioConstruccion) })
  if (i.anioReforma !== null) ops.push({ tipo: 'escribir', control: CONTROLES.anioReforma, que: 'Año de la reforma', valor: String(i.anioReforma) })
  ops.push({ tipo: 'escribir', control: CONTROLES.superficie, que: 'Superficie de la vivienda', valor: String(i.superficieM2) })
  return ops
}

/** Precio leído de la pantalla «Precio» (cuando esté mapeada). */
export type PrecioHogar = { modalidad: string; primaAnualEur: number }

/** Precios → ofertas (puro). Una prima no positiva no es oferta: se descarta. */
export function ofertasDesdePrecios(precios: readonly PrecioHogar[], referencia: string | null): OfertaNormalizada[] {
  return precios
    .filter((p) => Number.isFinite(p.primaAnualEur) && p.primaAnualEur > 0)
    .map((p) => ({
      compania: 'allianz',
      producto: `Allianz HOGAR · ${p.modalidad}`,
      primaAnualEur: Math.round(p.primaAnualEur * 100) / 100,
      primaNetaEur: null,
      fraccionamiento: null,
      importeReciboEur: null,
      coberturas: [],
      franquicias: [],
      validaHasta: null,
      referenciaPortal: referencia,
      pdf: null,
      avisos: ['Allianz Hogar: lector de precio pendiente de verificar contra el portal con una cotización conocida.'],
    }))
}

/** Texto de importe («1.234,56 €») → euros, o `null`. */
export function primaDeTexto(t: string | null | undefined): number | null {
  const n = importeEs(t ?? '')
  return n !== null && n > 0 ? n : null
}

// ───────────────────────── navegador ─────────────────────────

const ESPERA_AUTOCOMPLETADO_MS = 10_000
const ESPERA_PASO_MS = 30_000

const selControl = (control: string) => `[formcontrolname="${control}"]`

/** Exactamente UN control visible con ese `formcontrolname` (input, o el propio nodo si es un input). */
async function controlUnico(marco: Frame, control: string, que: string): Promise<Locator> {
  const loc = marco.locator(`input${selControl(control)}:visible, textarea${selControl(control)}:visible`)
  const n = await loc.count()
  if (n !== 1) throw new ErrorMapaIncompleto(`el control «${que}» de la pantalla «Vivienda» (${n} coincidencias)`)
  return loc
}

async function leer(loc: Locator): Promise<string | null> {
  return loc.inputValue({ timeout: 5_000 }).catch(() => null)
}

async function esInvalido(loc: Locator): Promise<boolean> {
  return loc.evaluate((el) => {
    const caja = el.closest('nx-formfield,.nx-formfield')
    return el.getAttribute('aria-invalid') === 'true'
      || /(^|\s)ng-invalid(\s|$)/.test(el.getAttribute('class') || '')
      || !!(caja && /(^|\s)[\w-]*(has-error|invalid)[\w-]*(\s|$)/.test(caja.getAttribute('class') || ''))
  }).catch(() => true)
}

/** Escribe un valor (tras `comprobarCampo`) y comprueba que QUEDÓ; si no, reintenta tecleando una vez; si no, hueco. */
async function escribir(marco: Frame, ctx: Pick<ContextoPortal, 'pausaAccion'>, op: Extract<OperacionVivienda, { tipo: 'escribir' }>): Promise<Locator> {
  const loc = await controlUnico(marco, op.control, op.que)
  if (await loc.isDisabled()) throw new ErrorMapaIncompleto(`por qué «${op.que}» está deshabilitado`)
  await comprobarCampo(loc)
  await ctx.pausaAccion()
  await loc.fill(op.valor, { timeout: 10_000 })
  await loc.blur({ timeout: 5_000 }).catch(() => undefined)
  if (valorQuedo(op.valor, await leer(loc))) return loc
  await comprobarCampo(loc)
  await loc.clear({ timeout: 5_000 })
  await loc.pressSequentially(op.valor, { delay: 60, timeout: 15_000 })
  await loc.blur({ timeout: 5_000 }).catch(() => undefined)
  if (!valorQuedo(op.valor, await leer(loc))) throw new ErrorMapaIncompleto(`cómo acepta el portal el valor de «${op.que}» (no quedó escrito)`)
  return loc
}

/** Espera a que un control autocompletado (población, tipo de vía) tenga valor. `false` si no llega. */
async function esperarValor(marco: Frame, control: string, page: Pick<Page, 'waitForTimeout'>, ms: number): Promise<boolean> {
  const fin = Date.now() + ms
  for (;;) {
    const loc = marco.locator(`input${selControl(control)}`)
    if ((await loc.count()) === 1 && ((await leer(loc)) ?? '').trim() !== '') return true
    if (Date.now() >= fin) return false
    await page.waitForTimeout(250)
  }
}

/** Contexto que usa la pantalla «Vivienda»: `ctx.pulsar` (SIGUIENTE) y `ctx.marcarOpcionHogar` (opciones, guard.ts). */
export type CtxVivienda = Pick<ContextoPortal, 'pulsar' | 'pausaAccion' | 'marcarOpcionHogar'>

/** Marca la opción del riesgo SOLO por la puerta guardada (`ctx.marcarOpcionHogar`); lo que no casa EXACTO → hueco. */
async function marcarOpcion(marco: Frame, ctx: CtxVivienda, op: Extract<OperacionVivienda, { tipo: 'opcion' }>): Promise<void> {
  if (typeof ctx.marcarOpcionHogar !== 'function') throw new ErrorMapaIncompleto('la puerta guardada de opciones de Hogar en el contexto del worker', false)
  const r = await ctx.marcarOpcionHogar(marco, op.etiqueta)
  if (r.estado === 'no_unica') throw new ErrorMapaIncompleto(`la opción «${op.etiqueta}» (${op.que}) de la pantalla «Vivienda» (${r.coincidencias} coincidencias exactas)`)
  if (r.estado === 'no_quedo') throw new ErrorMapaIncompleto(`cómo se marca «${op.etiqueta}» (${op.que}): tras pulsar no quedó marcada`)
}

/** Pasos del asistente leídos del DOM (solo lectura). */
async function leerPasos(marco: Frame): Promise<ItemPaso[]> {
  return marco.locator('nx-multi-step-item').evaluateAll((els) =>
    els.map((el) => {
      const sel = el.getAttribute('aria-selected') ?? el.getAttribute('aria-current')
      return {
        texto: ((el as HTMLElement).innerText || el.textContent || '').replace(/\s+/g, ' ').trim(),
        deshabilitado: el.getAttribute('aria-disabled') === 'true' || el.hasAttribute('disabled'),
        seleccionado: sel === null ? null : sel === 'true' || sel === 'step' || sel === 'page',
      }
    }),
  )
}

/** Paso actual o hueco; en un paso de EMISIÓN, para sin tocar nada. */
async function exigirPaso(marco: Frame, esperado: PasoHogar): Promise<void> {
  const paso = pasoActual(await leerPasos(marco))
  if (paso !== null && PASOS_EMISION.includes(paso)) throw new EmisionBloqueadaError('fase', `${ADAPTADOR}: el asistente está en «${paso}» (emisión): el robot no toca nada`)
  if (paso !== esperado) throw new ErrorMapaIncompleto(`la pantalla del asistente (se esperaba «${esperado}», el paso leído es «${paso ?? 'desconocido'}»)`)
}

/** Marco de la app de Hogar: el `appArea` con un control visible y la URL de la app vista. */
export async function marcoHogar(page: Page, timeoutMs = 30_000): Promise<Frame> {
  const marco = await esperarMarcoApp(page, timeoutMs)
  if (!esAppHogar(marco.url())) throw new ErrorMapaIncompleto('la app de Hogar en el marco «appArea» (la URL no es la vista)')
  return marco
}

/** Controles OBLIGATORIOS que el portal sigue marcando inválidos (solo su `formcontrolname`; nunca valores). */
async function obligatoriosInvalidos(marco: Frame): Promise<string[]> {
  return marco.locator('input[formcontrolname]:visible').evaluateAll((els) =>
    els
      .filter((el) => {
        const caja = el.closest('nx-formfield,.nx-formfield')
        const req = el.hasAttribute('required') || el.getAttribute('aria-required') === 'true'
        const inv = el.getAttribute('aria-invalid') === 'true'
          || /(^|\s)ng-invalid(\s|$)/.test(el.getAttribute('class') || '')
          || !!(caja && /(^|\s)[\w-]*(has-error|invalid)[\w-]*(\s|$)/.test(caja.getAttribute('class') || ''))
        return req && inv
      })
      .map((el) => el.getAttribute('formcontrolname') || '?'),
  )
}

/**
 * Pantalla 1 «Vivienda»: rellena con el plan puro y comprueba cada autocompletado. No pulsa «Comprobar» (no está visto) ni
 * cambia el «Tipo de documento» (lista no vista): si hace falta, hueco con inventario.
 */
export async function rellenarPantallaVivienda(page: Page, marco: Frame, f: FormularioHogar, ctx: CtxVivienda): Promise<void> {
  await exigirPaso(marco, 'Vivienda')
  const tipoDoc = marco.locator(`nx-dropdown${selControl(CONTROLES.tipoDocumento)}`)
  if ((await tipoDoc.count()) !== 1) throw new ErrorMapaIncompleto('el desplegable «Tipo de documento»')
  const mostrado = await tipoDoc.evaluate((el) => ((el as HTMLElement).innerText || el.textContent || '').replace(/\s+/g, ' ').trim())
  if (!tipoDocumentoCasa(mostrado, f.tomador.documentoIdentidad)) {
    // Lo que muestra el desplegable es una etiqueta de catálogo (no un dato personal); recortada por si acaso.
    throw new ErrorMapaIncompleto(`la opción de «Tipo de documento» para un ${claseDocumento(f.tomador.documentoIdentidad).toUpperCase()} (el desplegable muestra «${mostrado.slice(0, 30)}»)`)
  }
  for (const op of planPantallaVivienda(f)) {
    if (op.tipo === 'opcion') {
      await marcarOpcion(marco, ctx, op)
      continue
    }
    const loc = await escribir(marco, ctx, op)
    if (op.autocompleta === 'poblacion') {
      if (!(await esperarValor(marco, CONTROLES.poblacion, page, ESPERA_AUTOCOMPLETADO_MS))) {
        throw new ErrorMapaIncompleto('la elección de población del CP (el portal no la autocompletó: CP con varias poblaciones o buscador sin mapear)')
      }
      if (f.inmueble.municipio !== null) {
        const pob = await leer(marco.locator(`input${selControl(CONTROLES.poblacion)}`))
        if (plano(pob) !== plano(f.inmueble.municipio)) throw new ErrorMapaIncompleto('la elección de población del CP (el portal autocompletó otra distinta de la del riesgo)')
      }
    } else if (op.autocompleta === 'via') {
      if (!(await esperarValor(marco, CONTROLES.tipoVia, page, ESPERA_AUTOCOMPLETADO_MS))) {
        throw new ErrorMapaIncompleto('la elección de la vía en el autocompletado (el tipo de vía no se rellenó)')
      }
    } else if (await esInvalido(loc)) {
      throw new ErrorMapaIncompleto(`por qué el portal marca inválido «${op.que}» tras rellenarlo`)
    }
  }
  const invalidos = await obligatoriosInvalidos(marco)
  if (invalidos.length) throw new ErrorMapaIncompleto(`por qué siguen inválidos estos obligatorios: ${invalidos.join(', ')}`)
}

/** «SIGUIENTE» de la pantalla 1 por `ctx.pulsar` (guard de emisión) y espera a que el asistente cambie de paso. */
export async function avanzarDesdeVivienda(page: Page, marco: Frame, ctx: CtxVivienda, esperaMs = ESPERA_PASO_MS): Promise<PasoHogar> {
  const boton = marco.locator(SEL_SIGUIENTE)
  if ((await boton.count()) !== 1) throw new ErrorMapaIncompleto('el botón «SIGUIENTE» de la pantalla «Vivienda»')
  if (plano(await boton.innerText()) !== plano(TEXTO_SIGUIENTE)) throw new ErrorMapaIncompleto('el botón «SIGUIENTE» (texto distinto del visto)')
  if (await boton.isDisabled()) throw new ErrorMapaIncompleto('por qué «SIGUIENTE» sigue deshabilitado con todo relleno (¿hace falta «Comprobar» la dirección?)')
  await ctx.pausaAccion()
  await ctx.pulsar(boton)
  const fin = Date.now() + esperaMs
  for (;;) {
    const paso = pasoActual(await leerPasos(marco).catch(() => []))
    if (paso !== null && PASOS_EMISION.includes(paso)) throw new EmisionBloqueadaError('fase', `${ADAPTADOR}: tras «SIGUIENTE» el asistente está en «${paso}» (emisión): el robot no toca nada`)
    if (paso !== null && paso !== 'Vivienda') return paso
    if (Date.now() >= fin) throw new ErrorMapaIncompleto('el efecto de «SIGUIENTE» (el asistente no cambió de paso)')
    await page.waitForTimeout(300)
  }
}

/**
 * Tras «Vivienda»: «Valoración de bienes» y «Precio» NO están vistos. Se para ahí pidiendo el inventario de estructura
 * (lo captura el runner) para mapearlas en la 1.ª prueba real. Nada se rellena ni se pulsa a ciegas.
 */
export function huecoTrasVivienda(paso: PasoHogar): never {
  if (paso === 'Precio') throw new ErrorMapaIncompleto('el lector de la pantalla «Precio» (sin explorar: primas, modalidades y referencia)')
  throw new ErrorMapaIncompleto(`la pantalla «${paso}» del asistente (sin explorar; después viene «Precio», tampoco explorada)`)
}

export const allianzHogar = {
  compania: 'allianz',
  ramo: 'hogar',
  credencial: 'ALLIANZ_EPAC',
  version: '0.1.0',
  async tarificar(page: Page, f: FormularioHogar, ctx: ContextoPortal): Promise<ResultadoAdaptador> {
    if (f.ramo !== 'hogar') throw new ErrorTarificador('datos', `${ADAPTADOR}: el formulario no es de hogar`)
    if (!(ctx.sesionReutilizada && (await sesionSirve(page, ctx)))) await login(page, ctx)
    await ctx.trasLogin()
    await ctx.paso('navegacion', () => abrirNuevaAlta(page, ctx, { pestana: 'Particulares', producto: PRODUCTO_MENU }))
    const marco = await marcoHogar(page)
    await ctx.paso('formulario', () => rellenarPantallaVivienda(page, marco, f, ctx))
    const paso = await ctx.paso('tarificar', () => avanzarDesdeVivienda(page, marco, ctx))
    return huecoTrasVivienda(paso)
  },
} as const
