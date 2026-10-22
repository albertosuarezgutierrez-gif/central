// Allianz ePAC · «Allianz HOGAR» — adaptador de TARIFICACIÓN (14/10/2026). ENCENDIDO por Alberto el 21/10/2026 (1.ª prueba real,
// solo tarificar): `adapters/index.ts` lo registra SOLO con el flag en `true`. Asegura ya encola hogar de Allianz (19/10/2026; puerta = su fila).
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
import { claveCampo, conRespaldoIA, normalizarTexto, registrarAtasco, type PeticionResolver } from '../../formador.ts'
import { esTextoContinuar } from '../../continuar.ts'
import { esAppHogarAllianz, etiquetaEnGrupoHogarAllianz, grupoOpcionesHogarAllianz, opcionesMarcadasHogarAllianz } from '../../guard.ts'
import { comprobarCampo } from './auto.ts'
import { login, sesionSirve } from './comunidades.ts'
import { abrirNuevaAlta, esperarMarcoApp } from './entrada.ts'
import { elegirPoblacionHogar, nucleoDeVia } from './poblacion-localidad.ts'

/**
 * Flag de registro de Allianz HOGAR. ENCENDIDO (Alberto, 21/10/2026: OK para la 1.ª prueba real de TARIFICACIÓN, no emisión).
 * Asegura acepta el ramo desde el 19/10/2026 (`validarEntradaRamo` / `companiasHogarRpa`); la puerta de BD sigue siendo la fila
 * `seguros.companias_integracion` allianz/hogar. Tras «Vivienda» el bot PARA con inventario (Valoración/Precio sin mapa).
 */
export const ALLIANZ_HOGAR_ACTIVO = true

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
const ESPERA_INFO_VIVIENDA_MS = 15_000
const ESPERA_EDICION_CATASTRO_MS = 10_000

/** 0.1.7: casilla que desbloquea año/reforma/m² rellenados por el Catastro tras «Comprobar» (`nx-checkbox`, texto visto). */
export const CONTROL_EDITAR_CATASTRO = 'enableCadastreEditing'
export const TEXTO_EDITAR_CATASTRO = 'Modificar datos del catastro.'

const selControl = (control: string) => `[formcontrolname="${control}"]`

/**
 * El input VISIBLE de ese `formcontrolname` (job 1bd6bfce, 21/10/2026: el HTML del atasco tenía TRES `town`/`postalCode`: el de
 * «Vivienda» y dos copias `disabled` de pasos posteriores, ocultas). Sin `:visible`, `count() === 1` no se cumplía nunca y
 * `inputValue` fallaba por modo estricto: la población autocompletada no se veía. Para LEER (el tipo de vía visible está deshabilitado).
 */
const inputVisible = (marco: Frame, control: string) => marco.locator(`input${selControl(control)}:visible`)

/** Exactamente UN control visible con ese `formcontrolname` (input, o el propio nodo si es un input). */
function controlFijo(marco: Frame, control: string, que: string): () => Promise<Locator> {
  return async () => {
    const loc = marco.locator(`input${selControl(control)}:visible, textarea${selControl(control)}:visible`)
    const n = await loc.count()
    if (n !== 1) throw new ErrorMapaIncompleto(`el control «${que}» de la pantalla «Vivienda» (${n} coincidencias)`)
    return loc
  }
}

/**
 * CAPA COMÚN (formador.ts): selector fijo por `formcontrolname` → lo APRENDIDO → la IA (solo un candidato de la pantalla, validado
 * por etiqueta) → ATASCO (Telegram). Sin formador/presupuesto/candidato, el error ORIGINAL (con inventario). `confirmar` solo tras
 * comprobar que el valor quedó escrito.
 */
async function controlUnico(marco: Frame, ctx: Pick<ContextoPortal, 'formador'>, control: string, que: string): Promise<{ loc: Locator; confirmar: () => Promise<void> }> {
  const r = await conRespaldoIA(marco.page(), ctx.formador, controlFijo(marco, control, que), {
    clave: claveCampo(que),
    tipo: 'campo',
    etiqueta: que,
    descripcion: `Campo editable «${que}» de la pantalla «Vivienda» de Allianz Hogar (solo se escribe el dato del riesgo; NUNCA cuenta bancaria ni nada de emisión o pago)`,
  })
  return { loc: r.locator, confirmar: r.confirmar }
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
async function escribir(marco: Frame, ctx: Pick<ContextoPortal, 'pausaAccion' | 'formador'>, op: Extract<OperacionVivienda, { tipo: 'escribir' }>, fijo?: Locator): Promise<Locator> {
  // `fijo` (0.1.9, «Valoración de bienes»): control ya localizado y único en su pantalla; sin capa común (no se aprende nada).
  const { loc, confirmar } = fijo ? { loc: fijo, confirmar: async () => undefined } : await controlUnico(marco, ctx, op.control, op.que)
  if (await loc.isDisabled()) throw new ErrorMapaIncompleto(`por qué «${op.que}» está deshabilitado (${await diagnosticoCampoCatastro(marco, loc)})`)
  await comprobarCampo(loc)
  await ctx.pausaAccion()
  await loc.fill(op.valor, { timeout: 10_000 })
  await loc.blur({ timeout: 5_000 }).catch(() => undefined)
  if (valorQuedo(op.valor, await leer(loc))) {
    await confirmar().catch(() => undefined)
    return loc
  }
  await comprobarCampo(loc)
  await loc.clear({ timeout: 5_000 })
  await loc.pressSequentially(op.valor, { delay: 60, timeout: 15_000 })
  await loc.blur({ timeout: 5_000 }).catch(() => undefined)
  if (!valorQuedo(op.valor, await leer(loc))) throw new ErrorMapaIncompleto(`cómo acepta el portal el valor de «${op.que}» (no quedó escrito)`)
  await confirmar().catch(() => undefined)
  return loc
}

/** Espera a que un control autocompletado (población, tipo de vía) tenga valor. `false` si no llega. */
async function esperarValor(marco: Frame, control: string, page: Pick<Page, 'waitForTimeout'>, ms: number): Promise<boolean> {
  const fin = Date.now() + ms
  for (;;) {
    const loc = inputVisible(marco, control)
    if ((await loc.count()) === 1 && ((await leer(loc)) ?? '').trim() !== '') return true
    if (Date.now() >= fin) return false
    await page.waitForTimeout(250)
  }
}

/** Contexto que usa la pantalla «Vivienda»: `ctx.pulsar` (SIGUIENTE) y `ctx.marcarOpcionHogar` (opciones, guard.ts). */
export type CtxVivienda = Pick<ContextoPortal, 'pulsar' | 'pausaAccion' | 'marcarOpcionHogar' | 'marcarOpcionHogarResuelta' | 'formador'>

/** Marca la opción del riesgo SOLO por la puerta guardada (`ctx.marcarOpcionHogar`); lo que no casa EXACTO → hueco. */
async function marcarOpcion(marco: Frame, ctx: CtxVivienda, op: Extract<OperacionVivienda, { tipo: 'opcion' }>): Promise<void> {
  if (typeof ctx.marcarOpcionHogar !== 'function') throw new ErrorMapaIncompleto('la puerta guardada de opciones de Hogar en el contexto del worker', false)
  const r = await ctx.marcarOpcionHogar(marco, op.etiqueta)
  if (r.estado === 'no_unica') return opcionPorCapaComun(marco, ctx, op, `la opción «${op.etiqueta}» (${op.que}) de la pantalla «Vivienda» (${r.coincidencias} coincidencias exactas)`)
  if (r.estado === 'no_quedo') return opcionPorCapaComun(marco, ctx, op, `cómo se marca «${op.etiqueta}» (${op.que}): tras pulsar no quedó marcada${r.caja ? ` (${r.caja})` : ''}`)
}

const slug = (t: string) => normalizarTexto(t).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'x'

/**
 * La etiqueta exacta no casó: CAPA COMÚN. Fijo (ya falló) → aprendido → IA (índice entre las etiquetas visibles de la pantalla,
 * acción `elegir_opcion`, validada por forma y sin palabras de emisión) → ATASCO (Telegram). Se marca por la puerta guardada
 * `ctx.marcarOpcionHogarResuelta` (label único + radio único + `comprobarBoton`). La clave lleva la OPCIÓN pedida: lo aprendido
 * de «Habitual» nunca se usa para «Alquiler».
 */
async function opcionPorCapaComun(marco: Frame, ctx: CtxVivienda, op: Extract<OperacionVivienda, { tipo: 'opcion' }>, hueco: string): Promise<void> {
  const peticion: PeticionResolver = {
    clave: `elegir_opcion_${slug(op.etiqueta)}`,
    tipo: 'accion',
    descripcion: `Etiqueta (label) de la opción «${op.etiqueta}» (${op.que}) en la pantalla «Vivienda» de Allianz Hogar. Solo marca un dato del riesgo; NUNCA emitir, contratar, grabar ni pagar.`,
  }
  // Fijo real: UNA sola etiqueta visible con el texto ENTERO pedido (nunca «contiene»: sería elegir «la más parecida»).
  const fijo = async () => {
    const exacto = new RegExp(`^\\s*${op.etiqueta.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\\s*$`, 'i')
    const l = marco.locator('label[for]:visible').filter({ hasText: exacto })
    const n = await l.count()
    if (n !== 1) throw new ErrorMapaIncompleto(hueco)
    return l
  }
  const r = await conRespaldoIA(marco.page(), ctx.formador, fijo, peticion)
  // ANTES de pulsar: el texto de la etiqueta elegida (fijo, aprendido, IA o persona) debe ser el de la opción del riesgo (plano).
  // Si no, NO se marca (daría precio con un dato falso): atasco con inventario, sin aprender.
  const textoElegido = await r.locator.evaluate((el) => (el as HTMLElement).innerText || el.textContent || '').catch(() => null)
  if (textoElegido === null || plano(textoElegido) !== plano(op.etiqueta)) {
    await registrarAtasco(marco.page(), ctx.formador, peticion).catch(() => undefined)
    throw new ErrorMapaIncompleto(hueco)
  }
  const res = typeof ctx.marcarOpcionHogarResuelta === 'function' ? await ctx.marcarOpcionHogarResuelta(marco, r.locator) : null
  if (!res || res.estado === 'no_unica' || res.estado === 'no_quedo') {
    await registrarAtasco(marco.page(), ctx.formador, peticion).catch(() => undefined)
    throw new ErrorMapaIncompleto(hueco)
  }
  // Se aprende SOLO si el radio concreto de ESA etiqueta quedó marcado (el texto ya se contrastó antes de pulsar).
  const marcada = await r.locator
    .evaluate((el) => {
      const para = el.getAttribute('for')
      const c = para ? document.getElementById(para) : null
      return { texto: (el as HTMLElement).innerText || el.textContent || '', marcado: !!c && (c as HTMLInputElement).checked === true }
    })
    .catch(() => null)
  if (marcada && marcada.marcado && plano(marcada.texto) === plano(op.etiqueta)) await r.confirmar().catch(() => undefined)
  else throw new ErrorMapaIncompleto(hueco)
}

/**
 * ¿La vía que dejó el portal (tipo + nombre) es la del riesgo? Por `plano()`: el nombre solo, o «tipo nombre». PURA: es lo que
 * decide si una elección POSICIONAL de la lista de vías se confirma como aprendida.
 */
export function viaCoincide(tipoLeido: string | null, nombreLeido: string | null, nombreRiesgo: string): boolean {
  const esperado = plano(nombreRiesgo)
  const nombre = plano(nombreLeido)
  if (!esperado || !nombre) return false
  return nombre === esperado || `${plano(tipoLeido)} ${nombre}`.trim() === esperado
}

/**
 * Autocompletado que no rellenó el valor (CP con varias poblaciones, vía sin resolver): CAPA COMÚN con `elegir_opcion_<que>`.
 * Se pulsa por `ctx.pulsar` (guard) SOLO una opción de lista (nunca una etiqueta de casilla) y se espera a que el control tenga valor.
 * `true` = quedó con valor (el llamante valida y, si procede, confirma lo aprendido).
 */
async function opcionAutocompletada(page: Page, marco: Frame, ctx: CtxVivienda, control: string, que: string, hueco: string, contrastable: boolean): Promise<{ ok: boolean; confirmar: () => Promise<void> }> {
  const peticion: PeticionResolver = {
    clave: `elegir_opcion_${slug(que)}`,
    tipo: 'accion',
    descripcion: `Opción de la lista desplegable de «${que}» (pantalla «Vivienda» de Allianz Hogar) que corresponde a la del riesgo. Solo elige un valor de la lista; NUNCA emitir, contratar, grabar ni pagar.`,
  }
  // Lo aprendido de una lista es un selector POSICIONAL (#mat-option-N): sin dato del riesgo con que contrastar el resultado no se
  // usa lo aprendido ni se aprende ni se pregunta a la IA (no se podría verificar): atasco directo.
  if (!contrastable) {
    await registrarAtasco(page, ctx.formador, peticion).catch(() => undefined)
    return { ok: false, confirmar: async () => undefined }
  }
  // Fijo real: si la lista desplegada tiene UNA sola opción visible, esa es (sin ambigüedad).
  const fijo = async () => {
    const l = marco.locator('mat-option:visible, [role=option]:visible')
    const n = await l.count()
    if (n !== 1) throw new ErrorMapaIncompleto(hueco)
    return l
  }
  const r = await conRespaldoIA(page, ctx.formador, fijo, peticion)
  const tag = await r.locator.evaluate((el) => el.tagName).catch(() => '')
  if (tag === 'LABEL' || tag === '') {
    await registrarAtasco(page, ctx.formador, peticion).catch(() => undefined)
    throw new ErrorMapaIncompleto(hueco)
  }
  await ctx.pausaAccion()
  await ctx.pulsar(r.locator)
  if (await esperarValor(marco, control, page, ESPERA_AUTOCOMPLETADO_MS)) return { ok: true, confirmar: r.confirmar }
  await registrarAtasco(page, ctx.formador, peticion).catch(() => undefined)
  return { ok: false, confirmar: r.confirmar }
}

/** Resultado de `elegirPoblacionDeLista`: cómo se eligió, o `null` + diagnóstico SIN datos personales (para el mensaje del hueco). */
type ResultadoLista = { por: 'nucleo' | 'municipio' | 'unica' } | { por: null; diag: string }

/**
 * Abre la lista de `town` y lee sus opciones (21/10/2026, trabajos 229b2fc5/b5089267: la lista NO se desplegaba con foco + flecha;
 * el `nx-autocomplete` de NDBX filtra y abre al ESCRIBIR). Orden, parando en el primer intento que muestre opciones: foco →
 * flecha abajo → clic → escribir en `town` una ficha del núcleo de la vía (la más larga) y luego del municipio. Las opciones se
 * limitan al listbox de `town` (`aria-controls`/`aria-owns`, que Angular rellena AL ABRIR: se relee tras cada intento); sin ese
 * enlace, solo valen opciones que no estaban visibles antes de tocar `town` (si ya había, no se sabe de quién son: `null`).
 * Se elige con `elegirPoblacionHogar` (núcleo → municipio → opción única) y SOLO si es única (fail-closed). Con opciones y SIN
 * coincidencia → hueco que LISTA. Escribir en `town` no elige nada: sin opción pulsada el campo no queda con valor y se vacía.
 */
async function elegirPoblacionDeLista(page: Page, marco: Frame, ctx: CtxVivienda, municipio: string | null, nombreVia: string | null): Promise<ResultadoLista> {
  if (municipio === null && nombreVia === null) return { por: null, diag: 'sin municipio ni vía en el riesgo' }
  // Solo el `town` visible y habilitado del paso actual (hay copias `disabled` ocultas de otros pasos).
  const campo = marco.locator(`input${selControl(CONTROLES.poblacion)}:visible:not([disabled])`)
  const nCampo = await campo.count()
  if (nCampo !== 1) return { por: null, diag: `campo town visible y habilitado: ${nCampo} coincidencias (en el DOM: ${await marco.locator(`input${selControl(CONTROLES.poblacion)}`).count()})` }
  const SEL_OPC = '[role=option]:visible, nx-autocomplete-option:visible, mat-option:visible'
  const previas = await marco.locator(SEL_OPC).count()
  let enlaceVisto = false
  let intentos = 0
  const abierta = () => {
    // El enlace se relee cada vez: Angular pone aria-controls/aria-owns al abrir el panel, no antes.
    return campo.evaluate((el) => (el.getAttribute('aria-controls') ?? el.getAttribute('aria-owns') ?? '').trim().split(/\s+/)[0]).catch(() => '')
  }
  // Texto + posición ORIGINAL en el locator (los vacíos se descartan sin desplazar los índices).
  const leer = async (): Promise<{ opciones: Locator; items: { i: number; t: string }[] } | null> => {
    const enlace = await abierta()
    if (enlace) enlaceVisto = true
    if (!enlace && previas > 0) return null
    const opciones = enlace && /^[\w-]+$/.test(enlace) ? marco.locator(`#${enlace}`).locator(SEL_OPC) : marco.locator(SEL_OPC)
    const items = (await opciones.evaluateAll((els) => els.map((el, i) => ({ i, t: ((el as HTMLElement).innerText || el.textContent || '').replace(/\s+/g, ' ').trim() })))).filter((x) => x.t !== '')
    return items.length > 0 ? { opciones, items } : null
  }
  const nucleo = nucleoDeVia(nombreVia)
  const fichasLargas = (t: string | null) =>
    (t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().split(/[^A-Z0-9Ñ]+/).filter((w) => w.length >= 4 && !['DEL', 'LAS', 'LOS'].includes(w)).sort((x, y) => y.length - x.length)
  const aEscribir = [...new Set([...fichasLargas(nucleo).slice(0, 1), ...fichasLargas(municipio).slice(0, 1)])]
  const intentosApertura: Array<() => Promise<void>> = [
    async () => void (await campo.focus({ timeout: 5_000 }).catch(() => undefined)),
    async () => void (await campo.press('ArrowDown', { timeout: 5_000 }).catch(() => undefined)),
    ...aEscribir.map((ficha) => async () => {
      await campo.fill('', { timeout: 5_000 }).catch(() => undefined)
      await campo.pressSequentially(ficha, { delay: 80, timeout: 8_000 }).catch(() => undefined)
    }),
  ]
  let hallado: { opciones: Locator; items: { i: number; t: string }[] } | null = null
  for (const abrir of intentosApertura) {
    intentos++
    await abrir()
    await page.waitForTimeout(700)
    hallado = await leer()
    if (hallado) break
  }
  if (!hallado) {
    // Nada elegido: se deja `town` vacío (lo escrito no es una elección) y sigue la capa común.
    if (aEscribir.length > 0) await campo.fill('', { timeout: 5_000 }).catch(() => undefined)
    return { por: null, diag: `sin opciones tras ${intentos} intentos (foco, flecha${aEscribir.length > 0 ? ', escribir' : ''}); enlace aria-controls/owns ${enlaceVisto ? 'visto' : 'ausente'}; opciones visibles antes: ${previas}` }
  }
  const { opciones, items } = hallado
  const textos = items.map((x) => x.t)
  const r = elegirPoblacionHogar(textos, municipio, nombreVia)
  if (r.tipo === 'sin_opciones' || r.tipo === 'sin_municipio') return { por: null, diag: 'sin municipio ni opciones utilizables' }
  if (r.tipo === 'sin_coincidencia') {
    throw new ErrorMapaIncompleto(`la elección de población del CP (ninguna opción coincide de forma única con la del riesgo; el portal ofrece: ${textos.slice(0, 15).join(' | ')})`)
  }
  await ctx.pausaAccion()
  await ctx.pulsar(opciones.nth(items[r.indice].i))
  if (await esperarValor(marco, CONTROLES.poblacion, page, ESPERA_AUTOCOMPLETADO_MS)) return { por: r.por }
  throw new ErrorMapaIncompleto('el efecto de la opción de población elegida (tras pulsarla, la población no quedó rellena)')
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
 * Pantalla 1 «Vivienda»: rellena con el plan puro y comprueba cada autocompletado. Pulsa «Comprobar» (0.1.5) solo si la información de la vivienda sigue oculta; no
 * cambia el «Tipo de documento» (lista no vista): si hace falta, hueco con inventario.
 */
export async function rellenarPantallaVivienda(page: Page, marco: Frame, f: FormularioHogar, ctx: CtxVivienda): Promise<void> {
  await exigirPaso(marco, 'Vivienda')
  // Solo se LEE (el robot no cambia el tipo): fijo por `formcontrolname` → aprendido → IA → atasco (capa común).
  const { loc: tipoDoc, confirmar: confirmarTipoDoc } = (await conRespaldoIA(
    page,
    ctx.formador,
    async () => {
      const l = marco.locator(`nx-dropdown${selControl(CONTROLES.tipoDocumento)}`)
      if ((await l.count()) !== 1) throw new ErrorMapaIncompleto('el desplegable «Tipo de documento»')
      return l
    },
    { clave: 'tipo_documento', tipo: 'campo', etiqueta: 'Tipo de documento', descripcion: 'Desplegable «Tipo de documento» del tomador en la pantalla «Vivienda» de Allianz Hogar (solo se lee)' },
  ).then((r) => ({ loc: r.locator, confirmar: r.confirmar })))
  const mostrado = await tipoDoc.evaluate((el) => ((el as HTMLElement).innerText || el.textContent || '').replace(/\s+/g, ' ').trim())
  if (!tipoDocumentoCasa(mostrado, f.tomador.documentoIdentidad)) {
    // Lo que muestra el desplegable es una etiqueta de catálogo (no un dato personal); recortada por si acaso.
    throw new ErrorMapaIncompleto(`la opción de «Tipo de documento» para un ${claseDocumento(f.tomador.documentoIdentidad).toUpperCase()} (el desplegable muestra «${mostrado.slice(0, 30)}»)`)
  }
  await confirmarTipoDoc().catch(() => undefined)
  for (const op of planPantallaVivienda(f)) {
    if (op.tipo === 'opcion') {
      await marcarOpcion(marco, ctx, op)
      continue
    }
    if (op.control === CONTROLES.anioConstruccion) {
      await destaparInformacionVivienda(page, marco, ctx)
      await habilitarEdicionCatastro(page, marco, ctx)
      // 0.1.8: con la edición del Catastro marcada el portal NO deja cambiar el año (sigue `disabled` con el del Catastro): se acepta
      // ese año si es razonable (no se teclea); si no lo es, hueco con el estado observado.
      const anio = marco.locator(`#buildingInformation input${selControl(CONTROLES.anioConstruccion)}:visible`)
      if ((await anio.count()) === 1 && (await anio.isDisabled())) {
        if ((await estadoCasillaCatastro(marco)) === 'marcada' && anioCatastroAceptable(await leer(anio))) continue
        throw new ErrorMapaIncompleto(`por qué «Año de construcción» sigue deshabilitado sin un año del Catastro aceptable (${await diagnosticoCampoCatastro(marco, anio)})`)
      }
    }
    const loc = await escribir(marco, ctx, op)
    if (op.autocompleta === 'poblacion') {
      let confirmarPob: (() => Promise<void>) | null = null
      let elegidaPor: 'nucleo' | 'municipio' | 'unica' | null = null
      if (!(await esperarValor(marco, CONTROLES.poblacion, page, ESPERA_AUTOCOMPLETADO_MS))) {
        const hueco0 = 'la elección de población del CP (el portal no la autocompletó: CP con varias poblaciones o buscador sin mapear)'
        // 21/10/2026: antes de la capa común, elección determinista por el municipio del riesgo (exacta o palabras enteras, UNA sola).
        const lista = await elegirPoblacionDeLista(page, marco, ctx, f.inmueble.municipio, f.inmueble.nombreVia)
        const hueco = lista.por === null ? `${hueco0} [${lista.diag}]` : hueco0
        if (lista.por !== null) elegidaPor = lista.por
        else {
          const e = await opcionAutocompletada(page, marco, ctx, CONTROLES.poblacion, 'poblacion', hueco, f.inmueble.municipio !== null)
          if (!e.ok) throw new ErrorMapaIncompleto(hueco)
          confirmarPob = e.confirmar
        }
      }
      // Elegida por núcleo de la vía u opción única: el municipio del riesgo (Castillo de Locubín) puede NO ser la población del CP
      // (Ventas del Carrizal); ni se contrasta ni se aprende. Solo la vía por municipio / lo autocompletado se contrasta con él.
      if (f.inmueble.municipio !== null && (elegidaPor === null || elegidaPor === 'municipio')) {
        const pob = await leer(inputVisible(marco, CONTROLES.poblacion))
        if (plano(pob) !== plano(f.inmueble.municipio)) {
          // 0.1.3 (21/10/2026): el portal autocompleta el ÚNICO núcleo del CP (Ventas del Carrizal) y el municipio del riesgo (Castillo de
          // Locubín) es otro. Se acepta solo si casa con el núcleo entre paréntesis de la vía del riesgo (nunca por «única»); sin núcleo, estricto.
          const r = elegirPoblacionHogar([pob ?? ''], f.inmueble.municipio, f.inmueble.nombreVia)
          if (r.tipo !== 'elegida' || r.por === 'unica') throw new ErrorMapaIncompleto('la elección de población del CP (el portal autocompletó otra distinta de la del riesgo)')
          if (r.por === 'nucleo') confirmarPob = null // población distinta del municipio: ni se contrasta ni se aprende
        }
        await confirmarPob?.().catch(() => undefined)
      }
    } else if (op.autocompleta === 'via') {
      if (!(await esperarValor(marco, CONTROLES.tipoVia, page, ESPERA_AUTOCOMPLETADO_MS))) {
        const hueco = 'la elección de la vía en el autocompletado (el tipo de vía no se rellenó)'
        const e = await opcionAutocompletada(page, marco, ctx, CONTROLES.tipoVia, 'via', hueco, true)
        if (!e.ok) throw new ErrorMapaIncompleto(hueco)
        // Se confirma como aprendido SOLO si la vía que quedó es la del riesgo (tipo + nombre, plano).
        const tipo = await leer(inputVisible(marco, CONTROLES.tipoVia))
        const nombre = await leer(inputVisible(marco, CONTROLES.nombreVia))
        if (!viaCoincide(tipo, nombre, f.inmueble.nombreVia)) throw new ErrorMapaIncompleto('la elección de la vía en el autocompletado (el portal dejó una vía distinta de la del riesgo)')
        await e.confirmar().catch(() => undefined)
      }
    } else if (await esInvalido(loc)) {
      throw new ErrorMapaIncompleto(`por qué el portal marca inválido «${op.que}» tras rellenarlo`)
    }
  }
  const invalidos = await obligatoriosInvalidos(marco)
  if (invalidos.length) throw new ErrorMapaIncompleto(`por qué siguen inválidos estos obligatorios: ${invalidos.join(', ')}`)
}

/**
 * 0.1.6 (job a1282d9e): el portal repite `#check-address` (id duplicado: «Comprobar» habilitado + copias `disabled` ocultas/«Comprobada») → solo el visible y habilitado.
 * 0.1.5 (21/10/2026, job bef8bd1f): «Año de construcción», «Año de la reforma» y «Superficie» viven en
 * `#buildingInformation`, que el portal deja con `hidden` hasta validar la dirección con «Comprobar» (`#check-address button`).
 * Sin ese clic el año daba «0 coincidencias». Se pulsa SOLO por `ctx.pulsar` (guard) y SOLO si el año aún no se ve; luego se
 * espera a que se destape. Si no se destapa: hueco (con el texto del overlay/diálogo visible, sin cerrarlo a ciegas).
 */
async function destaparInformacionVivienda(page: Page, marco: Frame, ctx: Pick<ContextoPortal, 'pulsar' | 'pausaAccion'>): Promise<void> {
  const anio = marco.locator(`#buildingInformation input${selControl(CONTROLES.anioConstruccion)}:visible`)
  if ((await anio.count()) > 0) return
  const boton = marco.locator('#check-address button:visible:not([disabled])')
  const n = await boton.count()
  if (n !== 1) throw new ErrorMapaIncompleto(`el botón «Comprobar» de la dirección visible y habilitado (${n} coincidencias; en el DOM: ${await marco.locator('#check-address button').count()}) para destapar la información de la vivienda`)
  await ctx.pausaAccion()
  await ctx.pulsar(boton)
  const fin = Date.now() + ESPERA_INFO_VIVIENDA_MS
  while ((await anio.count()) === 0) {
    if (Date.now() >= fin) {
      const overlay = await marco
        .locator('.cdk-overlay-pane, [role="dialog"], [role="alertdialog"]')
        .evaluateAll((els) => els.map((e) => ((e as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim()).filter((t) => t !== '').join(' | '))
        .catch(() => '')
      throw new ErrorMapaIncompleto(`tras pulsar Comprobar la información de la vivienda no se destapó${overlay ? ` (diálogo visible: «${overlay.slice(0, 120)}»)` : ''}`)
    }
    await page.waitForTimeout(250)
  }
}

/**
 * ¿Es `valor` un año de construcción razonable que el Catastro dejó en el portal? 4 cifras, entre 1700 y el año de `hoy`. Pura
 * (`hoy` inyectable: nada de reloj real en los tests).
 */
export function anioCatastroAceptable(valor: string | null | undefined, hoy: Date = new Date()): boolean {
  const t = (valor ?? '').trim()
  if (!/^\d{4}$/.test(t)) return false
  const n = Number(t)
  return n >= 1700 && n <= hoy.getFullYear()
}

type EstadoCasillaCatastro = 'marcada' | 'sin_marcar' | 'ausente' | `${number} casillas`

/** Estado de la casilla «Modificar datos del catastro.» de `#buildingInformation` (solo lectura). */
async function estadoCasillaCatastro(marco: Frame): Promise<EstadoCasillaCatastro> {
  const casilla = marco.locator(`#buildingInformation nx-checkbox${selControl(CONTROL_EDITAR_CATASTRO)} input[type="checkbox"]`)
  const n = await casilla.count()
  if (n === 0) return 'ausente'
  if (n > 1) return `${n} casillas`
  return (await casilla.isChecked().catch(() => false)) ? 'marcada' : 'sin_marcar'
}

/** Diagnóstico SIN datos personales de un control de `#buildingInformation`: casilla del Catastro + habilitado + con/sin valor. */
async function diagnosticoCampoCatastro(marco: Frame, loc: Locator): Promise<string> {
  const casilla = await estadoCasillaCatastro(marco)
  const deshabilitado = await loc.isDisabled().catch(() => null)
  const valor = await leer(loc)
  return `casilla «${TEXTO_EDITAR_CATASTRO}»: ${casilla.replace('_', ' ')}; campo: ${deshabilitado === null ? 'estado desconocido' : deshabilitado ? 'deshabilitado' : 'habilitado'}, ${valor === null ? 'valor ilegible' : valor.trim() === '' ? 'vacío' : 'con valor del portal'}`
}

/**
 * 0.1.7 (22/10/2026): tras «Comprobar» el portal rellena año/reforma/m²/anexos con el CATASTRO y los deja `disabled`; la casilla
 * `nx-checkbox[formcontrolname="enableCadastreEditing"]` «Modificar datos del catastro.» los desbloquea. Se marca SOLO si el año
 * está deshabilitado, por `ctx.pulsar` (guard) sobre su etiqueta visible de texto EXACTO, y se exige que QUEDE marcada.
 * 0.1.8 (job 95454433, HTML del atasco): con la casilla YA marcada (input `value="true"`, `ng-dirty`) el portal solo habilita
 * «Superficie de la vivienda»; «Año de construcción» sigue `disabled` con el año del Catastro (y reforma/anexos también). Aquí ya
 * no se espera al año: se espera a que la casilla quede marcada y a que algo se habilite (m² o año). Qué hacer con el año lo decide
 * `rellenarPantallaVivienda` (acepta el del Catastro si es razonable). Estados desconocidos → hueco con el estado observado.
 */
async function habilitarEdicionCatastro(page: Page, marco: Frame, ctx: Pick<ContextoPortal, 'pulsar' | 'pausaAccion'>): Promise<void> {
  const anio = marco.locator(`#buildingInformation input${selControl(CONTROLES.anioConstruccion)}:visible`)
  if ((await anio.count()) !== 1 || !(await anio.isDisabled())) return // un año único y habilitado: nada que hacer (el resto, `escribir`)
  const estado = await estadoCasillaCatastro(marco)
  if (estado === 'marcada') return
  if (estado !== 'sin_marcar') throw new ErrorMapaIncompleto(`por qué «Año de construcción» está deshabilitado (${await diagnosticoCampoCatastro(marco, anio)})`)
  const etiqueta = marco.locator(`#buildingInformation nx-checkbox${selControl(CONTROL_EDITAR_CATASTRO)} label:visible`)
  if ((await etiqueta.count()) !== 1 || plano(await etiqueta.innerText()) !== plano(TEXTO_EDITAR_CATASTRO)) {
    throw new ErrorMapaIncompleto(`la etiqueta visible de la casilla «${TEXTO_EDITAR_CATASTRO}» que habilita «Año de construcción» (${await diagnosticoCampoCatastro(marco, anio)})`)
  }
  await ctx.pausaAccion()
  await ctx.pulsar(etiqueta)
  const m2 = marco.locator(`#buildingInformation input${selControl(CONTROLES.superficie)}:visible`)
  const fin = Date.now() + ESPERA_EDICION_CATASTRO_MS
  for (;;) {
    const marcada = (await estadoCasillaCatastro(marco)) === 'marcada'
    const algoHabilitado = !(await anio.isDisabled()) || ((await m2.count()) === 1 && !(await m2.isDisabled()))
    if (marcada && algoHabilitado) return
    if (Date.now() >= fin) throw new ErrorMapaIncompleto(`el efecto de marcar «${TEXTO_EDITAR_CATASTRO}» (${await diagnosticoCampoCatastro(marco, anio)}; «Superficie de la vivienda»: ${(await m2.count()) === 1 ? ((await m2.isDisabled()) ? 'deshabilitada' : 'habilitada') : 'no única'})`)
    await page.waitForTimeout(250)
  }
}

/** «SIGUIENTE» de la pantalla 1 por `ctx.pulsar` (guard de emisión) y espera a que el asistente cambie de paso. */
export async function avanzarDesdeVivienda(page: Page, marco: Frame, ctx: CtxVivienda, esperaMs = ESPERA_PASO_MS): Promise<PasoHogar> {
  // Capa común: fijo (`#NextPageFromRisk`, texto «SIGUIENTE») → aprendido → IA (acción `continuar`, texto ENTERO Continuar/Siguiente)
  // → atasco. Se pulsa SIEMPRE por `ctx.pulsar` (guard de emisión), venga de donde venga.
  const r = await conRespaldoIA(
    page,
    ctx.formador,
    async () => {
      const b = marco.locator(SEL_SIGUIENTE)
      if ((await b.count()) !== 1) throw new ErrorMapaIncompleto('el botón «SIGUIENTE» de la pantalla «Vivienda»')
      if (plano(await b.innerText()) !== plano(TEXTO_SIGUIENTE)) throw new ErrorMapaIncompleto('el botón «SIGUIENTE» (texto distinto del visto)')
      return b
    },
    { clave: 'continuar', tipo: 'accion', textoEsperado: TEXTO_SIGUIENTE, descripcion: 'Botón «SIGUIENTE» de la pantalla «Vivienda» de Allianz Hogar que lleva al paso siguiente del asistente (NUNCA emitir, contratar, grabar ni pagar)' },
  )
  const boton = r.locator
  if (r.origen !== 'fijo' && !esTextoContinuar(await boton.innerText().catch(() => ''))) throw new ErrorMapaIncompleto('el botón «SIGUIENTE» (el candidato no muestra «Continuar»/«Siguiente»)')
  if (await boton.isDisabled()) throw new ErrorMapaIncompleto('por qué «SIGUIENTE» sigue deshabilitado con todo relleno (¿hace falta «Comprobar» la dirección?)')
  await ctx.pausaAccion()
  await ctx.pulsar(boton)
  const paso = await esperarCambioDePaso(page, marco, 'Vivienda', esperaMs)
  await r.confirmar().catch(() => undefined)
  return paso
}

/** Tras pulsar el avance de `desde`: espera a que el asistente cambie de paso. Un paso de EMISIÓN → para sin tocar nada. */
async function esperarCambioDePaso(page: Page, marco: Frame, desde: PasoHogar, esperaMs: number): Promise<PasoHogar> {
  const fin = Date.now() + esperaMs
  for (;;) {
    const paso = pasoActual(await leerPasos(marco).catch(() => []))
    if (paso !== null && PASOS_EMISION.includes(paso)) throw new EmisionBloqueadaError('fase', `${ADAPTADOR}: tras «Siguiente» de «${desde}» el asistente está en «${paso}» (emisión): el robot no toca nada`)
    if (paso !== null && paso !== desde) return paso
    if (Date.now() >= fin) throw new ErrorMapaIncompleto(`el efecto de «Siguiente» en «${desde}» (el asistente no cambió de paso)`)
    await page.waitForTimeout(300)
  }
}

// ───────────────────────── pantalla 2 «Valoración de bienes» (0.1.9) ─────────────────────────
//
// Mapa del HTML real del job 399d86c2 (22/10/2026), dentro de `epac-goods-page` (panel «Step 2/7: Valoración de bienes»):
//   · aviso «No se ha podido obtener la información del Catastro con los valores introducidos» (informativo, no bloquea);
//   · «Bienes asegurados»: radios «Caja fuerte» Si/No (de serie «No»); `sumInsuredBuilding` «Inmueble» (€, obligatorio, RELLENO por
//     el portal); casilla `firstRisk` «Asegurar a valor máximo cubierto» (sin marcar; NO se toca); `sumInsuredContent` «Mobiliario»
//     (€, oblig., relleno); «Joyas fuera de caja fuerte» → `sumInsuredValuablesNoSafe` (€, oblig., relleno); `sumInsuredSpecialObjects`
//     «Objetos especiales» (€, oblig., relleno). Con «Caja fuerte = Si» aparece algo más (filas vacías en el DOM): SIN VER;
//   · «Medidas de seguridad»: radios «Alarma conectada» y «Puerta blindada» Si/No (de serie «No»);
//   · «Fecha de inicio del seguro»: `startDate` (no obligatorio, relleno con hoy; NO se toca);
//   · botones «Anterior» y «Siguiente» (sin id) al pie.
// Política: dato del formulario → se escribe; sin dato → se acepta el valor de serie del portal SI es razonable y se anota
// (`supuestos`, sin importes); nada razonable → hueco con el estado observado. Nunca se adivina un obligatorio.

export const SEL_PANTALLA_VALORACION = 'epac-goods-page'
export const TEXTO_SIGUIENTE_VALORACION = 'Siguiente'

export type OperacionValoracion =
  | { tipo: 'importe'; control: string; que: string; valor: number | null; minimo: number }
  | { tipo: 'grupo'; pregunta: string; valor: 'Si' | 'No' | null }

/** Plan de «Valoración de bienes» (orden incluido). Pura. Joyas EN caja fuerte > 0 → hueco (su campo no está visto). */
export function planValoracionBienes(f: FormularioHogar): OperacionValoracion[] {
  const ov = f.hogar.objetosValor
  if (ov && ov.joyasCajaFuerteEur !== null && ov.joyasCajaFuerteEur > 0) {
    throw new ErrorMapaIncompleto('el campo de joyas EN caja fuerte de «Valoración de bienes» (con «Caja fuerte = Si»; sin explorar)')
  }
  const pb = f.hogar.protecciones?.puertaBlindada ?? null
  return [
    // «Caja fuerte» no consta en el formulario: se deja la de serie (solo se exige que haya una marcada).
    { tipo: 'grupo', pregunta: 'Caja fuerte', valor: null },
    { tipo: 'importe', control: 'sumInsuredBuilding', que: 'Inmueble', valor: f.hogar.capitalContinenteEur, minimo: 1 },
    { tipo: 'importe', control: 'sumInsuredContent', que: 'Mobiliario', valor: f.hogar.capitalContenidoEur, minimo: 1 },
    { tipo: 'importe', control: 'sumInsuredValuablesNoSafe', que: 'Joyas fuera de caja fuerte', valor: ov?.joyasFueraCajaEur ?? null, minimo: 0 },
    // HIPÓTESIS (a confirmar con Alberto): «Objetos especiales» de Allianz = `objetosValorEur` del formulario.
    { tipo: 'importe', control: 'sumInsuredSpecialObjects', que: 'Objetos especiales', valor: ov?.objetosValorEur ?? null, minimo: 0 },
    // La alarma NO está en el formulario (id de catálogo sin traducir): se deja la de serie.
    { tipo: 'grupo', pregunta: 'Alarma conectada', valor: null },
    { tipo: 'grupo', pregunta: 'Puerta blindada', valor: pb === null ? null : pb ? 'Si' : 'No' },
  ]
}

/** Euros → texto del campo (`dironlynumberscomma`): entero sin miles; decimales con coma. Pura. */
export function importeCampo(eur: number): string {
  return Number.isInteger(eur) ? String(eur) : eur.toFixed(2).replace('.', ',')
}

/** ¿El importe que el portal dejó de serie es razonable? Número legible ≥ `minimo`. Pura. */
export function importeDeSerieAceptable(leido: string | null | undefined, minimo: number): boolean {
  const n = importeEs((leido ?? '').trim())
  return n !== null && n >= minimo
}

async function fijarGrupoValoracion(marco: Frame, ctx: CtxVivienda, op: Extract<OperacionValoracion, { tipo: 'grupo' }>, supuestos: string[]): Promise<void> {
  const grupo = grupoOpcionesHogarAllianz(marco, SEL_PANTALLA_VALORACION, op.pregunta)
  const n = await grupo.count()
  if (n !== 1) throw new ErrorMapaIncompleto(`el grupo «${op.pregunta}» de «Valoración de bienes» (${n} coincidencias)`)
  const marcadas = await opcionesMarcadasHogarAllianz(grupo)
  if (op.valor === null) {
    if (marcadas.length !== 1) throw new ErrorMapaIncompleto(`«${op.pregunta}» de «Valoración de bienes» sin dato en el formulario y sin una opción de serie (${marcadas.length} marcadas)`)
    supuestos.push(`${op.pregunta}: «${marcadas[0]}» (de serie)`)
    return
  }
  if (marcadas.length === 1 && plano(marcadas[0]) === plano(op.valor)) return
  if (typeof ctx.marcarOpcionHogarResuelta !== 'function') throw new ErrorMapaIncompleto('la puerta guardada de opciones de Hogar en el contexto del worker', false)
  const etiqueta = etiquetaEnGrupoHogarAllianz(grupo, op.valor)
  const r = await ctx.marcarOpcionHogarResuelta(marco, etiqueta)
  if (r.estado === 'no_unica' || r.estado === 'no_quedo') {
    throw new ErrorMapaIncompleto(`cómo se marca «${op.valor}» en «${op.pregunta}» de «Valoración de bienes» (${r.estado === 'no_unica' ? `${r.coincidencias} coincidencias` : 'tras pulsar no quedó marcada'}; marcadas antes: ${marcadas.length})`)
  }
}

async function fijarImporteValoracion(marco: Frame, ctx: CtxVivienda, op: Extract<OperacionValoracion, { tipo: 'importe' }>, supuestos: string[]): Promise<void> {
  const campo = marco.locator(`${SEL_PANTALLA_VALORACION} input${selControl(op.control)}:visible`)
  const n = await campo.count()
  if (n !== 1) throw new ErrorMapaIncompleto(`el campo «${op.que}» (${op.control}) de «Valoración de bienes» (${n} coincidencias visibles; en el DOM: ${await marco.locator(`input${selControl(op.control)}`).count()})`)
  const deshabilitado = await campo.isDisabled()
  const leido = await leer(campo)
  const estado = `campo: ${deshabilitado ? 'deshabilitado' : 'habilitado'}, ${leido === null ? 'valor ilegible' : leido.trim() === '' ? 'vacío' : importeDeSerieAceptable(leido, op.minimo) ? 'con importe del portal' : 'con un valor no razonable'}`
  if (op.valor === null) {
    if (!importeDeSerieAceptable(leido, op.minimo) || (await esInvalido(campo))) throw new ErrorMapaIncompleto(`«${op.que}» de «Valoración de bienes» sin dato en el formulario y sin un importe de serie aceptable (${estado})`)
    supuestos.push(`${op.que}: el importe de serie del portal`)
    return
  }
  if (deshabilitado) throw new ErrorMapaIncompleto(`por qué «${op.que}» de «Valoración de bienes» está deshabilitado (${estado})`)
  const loc = await escribir(marco, ctx, { tipo: 'escribir', control: op.control, que: op.que, valor: importeCampo(op.valor) }, campo)
  if (await esInvalido(loc)) throw new ErrorMapaIncompleto(`por qué el portal marca inválido «${op.que}» de «Valoración de bienes» tras rellenarlo`)
}

/**
 * Pantalla 2 «Valoración de bienes»: aplica `planValoracionBienes` (importes por `formcontrolname` dentro de `epac-goods-page`; radios
 * por la puerta guardada `ctx.marcarOpcionHogarResuelta`). Devuelve los valores de serie aceptados (`supuestos`, sin importes).
 */
export async function rellenarValoracionBienes(page: Page, marco: Frame, f: FormularioHogar, ctx: CtxVivienda): Promise<string[]> {
  await exigirPaso(marco, 'Valoración de bienes')
  const pantalla = marco.locator(`${SEL_PANTALLA_VALORACION}:visible`)
  if ((await pantalla.count()) !== 1) throw new ErrorMapaIncompleto(`la pantalla «Valoración de bienes» (${SEL_PANTALLA_VALORACION} visible: ${await pantalla.count()})`)
  const supuestos: string[] = []
  for (const op of planValoracionBienes(f)) {
    if (op.tipo === 'grupo') await fijarGrupoValoracion(marco, ctx, op, supuestos)
    else await fijarImporteValoracion(marco, ctx, op, supuestos)
  }
  const invalidos = await obligatoriosInvalidos(marco)
  if (invalidos.length) throw new ErrorMapaIncompleto(`por qué siguen inválidos estos obligatorios de «Valoración de bienes»: ${invalidos.join(', ')}`)
  void page
  return supuestos
}

/** «Siguiente» de «Valoración de bienes» (UNO visible con ese texto ENTERO dentro de `epac-goods-page`) por `ctx.pulsar` (guard). */
export async function avanzarDesdeValoracion(page: Page, marco: Frame, ctx: CtxVivienda, esperaMs = ESPERA_PASO_MS): Promise<PasoHogar> {
  const boton = marco.locator(`${SEL_PANTALLA_VALORACION} button:visible`).filter({ hasText: /^\s*siguiente\s*$/i })
  const n = await boton.count()
  if (n !== 1) throw new ErrorMapaIncompleto(`el botón «${TEXTO_SIGUIENTE_VALORACION}» de «Valoración de bienes» (${n} coincidencias)`)
  if (await boton.isDisabled()) {
    const inv = await obligatoriosInvalidos(marco)
    throw new ErrorMapaIncompleto(`por qué «${TEXTO_SIGUIENTE_VALORACION}» de «Valoración de bienes» sigue deshabilitado (obligatorios inválidos: ${inv.length ? inv.join(', ') : 'ninguno visible'})`)
  }
  await ctx.pausaAccion()
  await ctx.pulsar(boton)
  return esperarCambioDePaso(page, marco, 'Valoración de bienes', esperaMs)
}

/**
 * Tras «Vivienda»: «Valoración de bienes» y «Precio» NO están vistos. Se para ahí pidiendo el inventario de estructura
 * (lo captura el runner) para mapearlas en la 1.ª prueba real. Nada se rellena ni se pulsa a ciegas.
 * TODO(grabación) «Valoración de bienes»: capitales (`hogar.capitalContinenteEur/ContenidoEur`), joyas/objetos de valor
 * (`hogar.objetosValor`) y medidas de seguridad (`hogar.protecciones`) ya viajan en el formulario; falta el DOM.
 * TODO(grabación) «Precio»: lector de primas por modalidad + referencia → `ofertasDesdePrecios` (ya escrito y probado).
 */
export function huecoTrasVivienda(paso: PasoHogar, supuestos: readonly string[] = []): never {
  const sup = supuestos.length > 0 ? `; valores del portal aceptados en «Valoración de bienes»: ${supuestos.join(' · ')}` : ''
  if (paso === 'Precio') throw new ErrorMapaIncompleto(`el lector de la pantalla «Precio» (sin explorar: primas, modalidades y referencia)${sup}`)
  throw new ErrorMapaIncompleto(`la pantalla «${paso}» del asistente (sin explorar; después viene «Precio», tampoco explorada)${sup}`)
}

/**
 * «Valoración de bienes» y «Precio» NO están mapeadas: ya no se lanza un error mudo. Se pide por la CAPA COMÚN el botón que
 * sigue (en Valoración, «Continuar»/«Siguiente»; en Precio, «Calcular») → aprendido → IA → ATASCO con candidatos (Telegram);
 * lo resuelto se pulsa por `ctx.pulsar` (guard) y NO se confirma (no se sabe si era lo correcto). Después, hueco con inventario.
 */
export async function pasoSinMapa(page: Page, marco: Frame, ctx: CtxVivienda, paso: PasoHogar, supuestos: readonly string[] = []): Promise<never> {
  const clave = paso === 'Precio' ? 'calcular' : 'continuar'
  try {
    const nombre = clave === 'calcular' ? /^\s*calcular\s*$/i : /^\s*(continuar|siguiente)\s*$/i
    // Fijo real: UN solo botón visible con ese texto ENTERO en la app de Hogar.
    const fijo = async () => {
      const b = marco.getByRole('button', { name: nombre })
      const n = await b.count()
      if (n !== 1) throw new ErrorMapaIncompleto(`el botón «${clave}» de la pantalla «${paso}» (sin explorar)`)
      return b
    }
    const r = await conRespaldoIA(page, ctx.formador, fijo, {
      clave,
      tipo: 'accion',
      descripcion: `Botón «${clave === 'calcular' ? 'Calcular' : 'Continuar/Siguiente'}» de la pantalla «${paso}» del asistente de Allianz Hogar (NUNCA emitir, contratar, grabar ni pagar)`,
    })
    await ctx.pausaAccion()
    await ctx.pulsar(r.locator)
  } catch (e) {
    if (!(e instanceof ErrorMapaIncompleto)) throw e
  }
  return huecoTrasVivienda(paso, supuestos)
}

export const allianzHogar = {
  compania: 'allianz',
  ramo: 'hogar',
  credencial: 'ALLIANZ_EPAC',
  version: '0.1.9',
  async tarificar(page: Page, f: FormularioHogar, ctx: ContextoPortal): Promise<ResultadoAdaptador> {
    if (f.ramo !== 'hogar') throw new ErrorTarificador('datos', `${ADAPTADOR}: el formulario no es de hogar`)
    if (!(ctx.sesionReutilizada && (await sesionSirve(page, ctx)))) await login(page, ctx)
    await ctx.trasLogin()
    await ctx.paso('navegacion', () => abrirNuevaAlta(page, ctx, { pestana: 'Particulares', producto: PRODUCTO_MENU }))
    const marco = await marcoHogar(page)
    await ctx.paso('formulario', () => rellenarPantallaVivienda(page, marco, f, ctx))
    const paso = await ctx.paso('tarificar', () => avanzarDesdeVivienda(page, marco, ctx))
    if (paso !== 'Valoración de bienes') return pasoSinMapa(page, marco, ctx, paso)
    // 0.1.9: «Valoración de bienes» mapeada; «Precio» sigue SIN mapa (se para ahí con inventario).
    const supuestos = await ctx.paso('formulario', () => rellenarValoracionBienes(page, marco, f, ctx))
    const paso2 = await ctx.paso('tarificar', () => avanzarDesdeValoracion(page, marco, ctx))
    return pasoSinMapa(page, marco, ctx, paso2, supuestos)
  },
} as const
