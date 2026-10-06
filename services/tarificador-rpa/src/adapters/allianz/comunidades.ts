// Allianz ePAC — «Comunidades 2020» (05/10/2026). Escrito sobre la CAPTURA del formulario real
// (pestañas «Datos Básicos» / «Tarificar»); el LOGIN sigue con selectores TODO (sin captura).
//
// Autorizado por Alberto el 05/10/2026, SIN confirmación escrita de Allianz
// (`seguros.companias_integracion`, modo rpa_autorizada). Ritmo humano: una sesión a la vez con esta
// credencial (max_concurrencia 1) y `ctx.pausa()` entre pasos.
//
// Reglas para quien toque este fichero:
//   · Pulsar SIEMPRE con `ctx.pulsar(locator)`, nunca `locator.click()` (lo vigila el guardián de la raíz).
//     Los campos se rellenan con `fill`/`selectOption`/`setChecked`, no pulsando botones.
//   · 🚨 El formulario tiene «Aceptar» y el radio «ELIJA UNA OPCIÓN»: dan de ALTA. Dentro del formulario el
//     bot solo pulsa «Calcular». El guard los bloquea (TEXTOS_BLOQUEADOS_ALTA) y este fichero ni los
//     nombra en código (lo vigila test/regression-tarificador-rpa.test.ts). El radio NO se toca nunca.
//     («NUEVA ALTA» es solo la navegación hasta el formulario.)
//   · Tras el login y tras calcular: `await ctx.exigirSinCaptcha()`.
//   · Un dato que el portal exige y el riesgo no trae (`null`) → `ErrorTarificador('datos', …)`,
//     NUNCA se inventa un valor por defecto.
//   · Los campos se localizan por el TEXTO de la etiqueta de su fila (`campoPorEtiqueta`), no por id,
//     y DENTRO del iframe `appArea` (`marcoFormulario`), no en `page`. Tabla de campos: `CAMPOS`;
//     harness offline sin pulsar nada: `npx tsx scripts/probar-formulario.ts <html-de-evidencia>`.

import type { Frame, Locator, Page } from 'playwright'
import { comprobarUrl, importeEs, importePuntoDecimal } from '@central/module-tarificacion'
import type { CoberturaOferta, DesglosePrima, FranquiciaOferta, ModalidadPortal, OfertaNormalizada, PdfRef, RiesgoComunidad } from '@central/module-tarificacion'
import type { AdaptadorPortal, ContextoPortal } from '../../adaptador.ts'
import { ErrorTarificador } from '../../errores.ts'

/**
 * Selectores del LOGIN y de la ruta de menú. `null` = PENDIENTE DE CAPTURAS: el adaptador falla en
 * ese paso con `portal` (error_definitivo, no se reintenta) en vez de adivinar.
 * El formulario en sí NO usa selectores: va por etiqueta (ver `campoPorEtiqueta`).
 */
const SEL = {
  // URL pública de entrada de ePAC (dada por Alberto, 05/10/2026; no es secreta).
  urlLogin: 'https://www.e-pacallianz.com/ngx-azs-epac/public/home' as string | null,
}

function sel(clave: keyof typeof SEL): string {
  const s = SEL[clave]
  if (!s) throw new ErrorTarificador('portal', `allianz/comunidades: selector «${clave}» pendiente de capturas`)
  return s
}

/** Etiqueta visible del formulario que confirma que estamos en la pantalla correcta. */
const TITULO_FORMULARIO = 'Comunidades 2020'

// ───────────────────────── marco del formulario ─────────────────────────
//
// 🚨 (06/10/2026, trabajo a063e84e) El formulario NO está en la página: ePAC es una carcasa Angular
// (ndbx: cabecera, migas «Comunidades 2020») que carga la aplicación de cotización en el
// `<iframe id="appArea" name="appArea">` (un `<form target="appArea">` la manda al servlet de
// tarificación). Buscar «Fecha Inicio» en `page` esperaba 30 s y fallaba. Todo lo del formulario se
// busca en el MARCO que lo contiene, entre TODOS los marcos de la página (puede haber marcos anidados).

/** Lo que el adaptador necesita de una raíz de búsqueda: vale `Page` o `Frame`. */
export type Raiz = Pick<Frame, 'locator' | 'getByText'>

/** Marco preferente donde ePAC carga la aplicación. Solo orienta el orden de búsqueda. */
const NOMBRE_MARCO_APP = 'appArea'

/**
 * Primer marco (los hijos antes que la carcasa; `appArea` el primero) en el que `sonda` encuentra al
 * menos un elemento. Sondea hasta `timeoutMs`; si no aparece en ninguno → `ErrorTarificador('portal')`.
 */
export async function marcoCon(page: Page, sonda: (r: Raiz) => Locator, que: string, timeoutMs = 30_000): Promise<Frame> {
  const fin = Date.now() + timeoutMs
  for (;;) {
    const marcos = page.frames().slice().sort((a, b) => peso(b, page) - peso(a, page))
    for (const f of marcos) {
      if (f.isDetached()) continue
      if ((await sonda(f).count().catch(() => 0)) > 0) return f
    }
    if (Date.now() >= fin) {
      throw new ErrorTarificador('portal', `allianz/comunidades: «${que}» no aparece en ningún marco de la página (${marcos.length} marcos)`)
    }
    await page.waitForTimeout(500)
  }
}

function peso(f: Frame, page: Page): number {
  if (f === page.mainFrame()) return 0
  return f.name() === NOMBRE_MARCO_APP ? 2 : 1
}

/** Marco del formulario «Comunidades 2020» (el que tiene la etiqueta «Fecha Inicio»). */
export function marcoFormulario(page: Page, timeoutMs = 30_000): Promise<Frame> {
  return marcoCon(page, (r) => celdaEtiqueta(r, 'Fecha Inicio'), 'Fecha Inicio', timeoutMs)
}

// ───────────────────────── helpers por etiqueta ─────────────────────────

function literalXPath(t: string): string {
  if (!t.includes('"')) return `"${t}"`
  if (!t.includes("'")) return `'${t}'`
  throw new Error(`etiqueta con ambos tipos de comillas: ${t}`)
}

// Comparación de etiquetas: sin distinguir mayúsculas (el portal las pone a veces por CSS y a veces en
// el texto), con «*», «:» y el espacio duro (&nbsp;) como espacios, y espacios colapsados. Igual en XPath y en JS
// («ITE:Inspección…» casa con «ITE: Inspección…»; «Fecha Inicio *» con «Fecha Inicio»).
const MAYUS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚÜÑÀÈÌÒÙ\u00a0*:'
const MINUS = 'abcdefghijklmnopqrstuvwxyzáéíóúüñàèìòù   '
function textoNormalizadoXPath(expr: string): string {
  return `normalize-space(translate(${expr},"${MAYUS}","${MINUS}"))`
}
/** Etiqueta → forma comparable (minúsculas, «*»/«:» como espacio, espacios colapsados). */
export function normalizarEtiqueta(t: string): string {
  return t.replace(/[*:]/g, ' ').replace(/[\s\u00a0]+/g, ' ').trim().toLowerCase()
}

const ETIQUETAS = 'self::td or self::th or self::label or self::span or self::b or self::strong or self::font or self::div or self::p or self::nobr or self::nx-label'
const CONTROLES = `*[self::input[not(@type="hidden")] or self::select or self::textarea or self::nx-dropdown]`

/** La celda/etiqueta cuyo texto (normalizado) es exactamente `etiqueta`. La más externa en orden de documento. */
export function celdaEtiqueta(raiz: Raiz, etiqueta: string): Locator {
  const e = literalXPath(normalizarEtiqueta(etiqueta))
  return raiz.locator(`xpath=(//*[${ETIQUETAS}][not(.//td)][${textoNormalizadoXPath('string(.)')}=${e}])[1]`)
}

/**
 * Localiza el control de una fila del formulario por el TEXTO de su etiqueta (patrón tabla
 * etiqueta → input; sin ids estables conocidos: el DOM del marco aún no se ha capturado). Busca el
 * control DENTRO de la celda de la etiqueta y, si no, a continuación en orden de documento.
 * `indice` (0 por defecto) elige el control N-ésimo: sirve para filas con varios controles tras la
 * etiqueta («Nº Edificios *» → input, luego el select «Contiguos»).
 * Ojo: «siguiente control en el documento» — si la fila no tiene control propio, devolvería el de la
 * fila siguiente: por eso se usa solo con etiquetas cuyo control está en su misma fila.
 */
export function campoPorEtiqueta(raiz: Raiz, etiqueta: string, indice = 0): Locator {
  const e = literalXPath(normalizarEtiqueta(etiqueta))
  const celda = `(//*[${ETIQUETAS}][not(.//td)][${textoNormalizadoXPath('string(.)')}=${e}])[1]`
  return raiz.locator(`xpath=(${celda}/descendant::${CONTROLES} | ${celda}/following::${CONTROLES})[${indice + 1}]`)
}

/** Fila (`tr`) de una garantía de la tabla de partidas, por el texto de su etiqueta (y su grupo, si lo hay). */
export function filaPorEtiqueta(raiz: Raiz, etiqueta: string, grupo: string | null = null): Locator {
  const e = literalXPath(normalizarEtiqueta(etiqueta))
  const celda = `td[${textoNormalizadoXPath('string(.)')}=${e}]`
  if (grupo === null) return raiz.locator(`xpath=(//tr[${celda}])[1]`)
  const g = literalXPath(normalizarEtiqueta(grupo))
  return raiz.locator(`xpath=(//tr[td[${textoNormalizadoXPath('string(.)')}=${g}]]/following-sibling::tr[${celda}])[1]`)
}

/** «2026-10-05» → «05/10/2026» (formato de los campos de fecha de ePAC). */
export function fechaEs(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) throw new ErrorTarificador('datos', `allianz/comunidades: fecha «${iso}» no es AAAA-MM-DD`)
  return `${m[3]}/${m[2]}/${m[1]}`
}

/** Exige el dato: si el portal lo pide y no lo tenemos, NO se inventa. */
function dato<T>(v: T | null | undefined, campo: string): T {
  if (v === null || v === undefined || v === '') {
    throw new ErrorTarificador('datos', `allianz/comunidades: el portal exige «${campo}» y el riesgo no lo trae`)
  }
  return v
}

/**
 * Genera una RegExp para búsqueda de texto insensible a mayúsculas y tolerante con espacios.
 * Escapa metacaracteres de regex y devuelve: `^\\s*<escapado>\\s*$` (insensible a mayúsculas).
 * Sirve para localizar textos en el DOM donde las mayúsculas son solo CSS (e.g., «Nueva Alta»).
 */
function textoExacto(t: string): RegExp {
  const escapado = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^\\s*${escapado}\\s*$`, 'i')
}

/** Tipo de control resuelto: decide cómo se rellena. */
export type TipoControl = 'texto' | 'select' | 'checkbox' | 'nx-dropdown' | 'otro'

export async function tipoControl(c: Locator): Promise<TipoControl> {
  return c.evaluate((el) => {
    const tag = el.tagName.toLowerCase()
    if (tag === 'select') return 'select'
    if (tag === 'nx-dropdown' || el.closest('nx-dropdown')) return 'nx-dropdown'
    if (tag === 'textarea') return 'texto'
    if (tag === 'input') {
      const t = ((el as HTMLInputElement).type || 'text').toLowerCase()
      if (t === 'checkbox') return 'checkbox'
      if (['text', 'search', 'tel', 'number', 'date', ''].includes(t)) return 'texto'
    }
    return 'otro'
  }) as Promise<TipoControl>
}

/**
 * Texto y fechas. Las fechas (también el datepicker de ndbx, `input[nxDatefield]`) se TECLEAN con
 * `fill`: no se abre el calendario. Tras escribir se quita el foco (`blur`): las páginas del servlet
 * validan/recalculan en `onchange`/`onblur`. Si el valor no queda escrito (campo readonly) → `portal`.
 */
async function poner(raiz: Raiz, etiqueta: string, valor: string | number, indice = 0): Promise<void> {
  const c = campoPorEtiqueta(raiz, etiqueta, indice)
  const v = String(valor)
  await c.fill(v)
  await c.blur().catch(() => undefined)
  const escrito = await c.inputValue().catch(() => null)
  if (escrito !== null && escrito.trim() === '') {
    throw new ErrorTarificador('portal', `allianz/comunidades: «${etiqueta}» no aceptó el valor (¿solo lectura?)`)
  }
}

/** Control del desplegable ndbx que abre la lista (el propio `nx-dropdown`). */
function desplegableNx(c: Locator): Locator {
  return c.locator('xpath=ancestor-or-self::nx-dropdown[1]')
}

/** Opción de la lista abierta de un `nx-dropdown` (se pinta en el overlay del MISMO marco). */
function opcionNx(raiz: Raiz, valor: string): Locator {
  return raiz.locator('nx-dropdown-item, [role="option"]').filter({ hasText: textoExacto(valor) })
}

/**
 * Desplegable por etiqueta, con el valor como string LIBRE (TODO(valores admitidos): lista que solo tiene
 * Alberto). `<select>` nativo: por texto visible y, si no, por `value`. `nx-dropdown` (ndbx, no es un
 * `<select>`): se abre y se elige la opción de texto EXACTO, ambas pulsaciones por `ctx.pulsar` (guardadas).
 * Si ninguna opción casa, error de datos (no se elige «lo más parecido»).
 */
async function elegir(raiz: Raiz, ctx: ContextoPortal, etiqueta: string, valor: string, indice = 0): Promise<void> {
  const s = campoPorEtiqueta(raiz, etiqueta, indice)
  const tipo = await tipoControl(s)
  if (tipo === 'nx-dropdown') {
    await ctx.pulsar(desplegableNx(s))
    const opciones = opcionNx(raiz, valor)
    try {
      await opciones.first().waitFor({ state: 'visible', timeout: 5_000 })
    } catch {
      throw new ErrorTarificador('datos', `allianz/comunidades: «${etiqueta}» no admite el valor «${valor}»`)
    }
    if ((await opciones.count()) !== 1) throw new ErrorTarificador('datos', `allianz/comunidades: «${etiqueta}» tiene varias opciones «${valor}»`)
    await ctx.pulsar(opcionNx(raiz, valor))
    return
  }
  if (tipo !== 'select') {
    throw new ErrorTarificador('portal', `allianz/comunidades: «${etiqueta}» no es un desplegable reconocible (${tipo})`)
  }
  try {
    await s.selectOption({ label: valor }, { timeout: 5_000 })
  } catch {
    try {
      await s.selectOption({ value: valor }, { timeout: 5_000 })
    } catch {
      throw new ErrorTarificador('datos', `allianz/comunidades: «${etiqueta}» no admite el valor «${valor}»`)
    }
  }
}

async function marcar(raiz: Raiz, etiqueta: string, valor: boolean): Promise<void> {
  await campoPorEtiqueta(raiz, etiqueta).setChecked(valor)
}

// ───────────────────────── login y navegación ─────────────────────────

async function login(page: Page, ctx: ContextoPortal): Promise<void> {
  await page.goto(sel('urlLogin'))
  await ctx.exigirSinCaptcha()
  // Login por etiqueta/rol (captura del 05/10/2026). Tracing apagado: lo vigila el guardián de la raíz.
  const usuario = page.getByLabel('Usuario', { exact: true })
  await usuario.fill(ctx.credenciales.usuario)
  await ctx.pausa()
  // Por la etiqueta salen DOS inputs (06/10/2026, strict mode violation): el campo es el
  // input[type=password] VISIBLE. exact: «Contraseña sensible a mayúsculas…» no es la etiqueta.
  await page
    .getByLabel('Contraseña', { exact: true })
    .and(page.locator('input[type="password"]'))
    .filter({ visible: true })
    .first()
    .fill(ctx.credenciales.contrasena)
  await ctx.pausa()
  // NUNCA «Recuperación de contraseña» (el guard la bloquea).
  await ctx.pulsar(page.getByRole('button', { name: 'INICIAR SESIÓN' }))
  await ctx.exigirSinCaptcha()
  // Logueado = aparece «Mediador principal» en la cabecera. Si no aparece, no se reintenta el login
  // (repetir un login rechazado es como se bloquea una cuenta).
  try {
    await page.getByText('Mediador principal').first().waitFor({ state: 'visible', timeout: 25_000 })
  } catch {
    throw new ErrorTarificador('credenciales', 'allianz/comunidades: no se llegó a la cabecera de ePAC tras el login (credenciales rechazadas o portal distinto)')
  }
  ctx.log('login ok')
}

async function abrirComunidades(page: Page, ctx: ContextoPortal): Promise<void> {
  // Ruta dada por Alberto: botón id «link_new_policy» «Nueva Alta» (cabecera de la home) → modal «Nueva Alta»
  // con acordeones → «Particulares» → tarjeta «Comunidades» → «Comunidades 2020».
  // El texto del DOM es «Nueva Alta» (las mayúsculas son CSS). «Nueva alta» es NAVEGACIÓN para cotizar, no
  // emisión (el guard ya no la bloquea). Alternativa en el menú: «Venta» → «Nueva Alta». El modal tiene «CERRAR».
  await ctx.pulsar(
    page.locator('#link_new_policy').or(page.getByRole('button', { name: textoExacto('Nueva Alta') })).first(),
  )
  await ctx.pausa()
  const modal = page.getByRole('dialog').filter({ hasText: /nueva alta/i }).first()
  await ctx.pulsar(modal.getByText(textoExacto('Particulares')).first())
  await ctx.pausa()
  await ctx.pulsar(modal.getByText(textoExacto('Comunidades')).first())
  await page.getByText(textoExacto(TITULO_FORMULARIO)).first().waitFor()
  await ctx.exigirSinCaptcha()
}

// ───────────────────────── formulario ─────────────────────────

/**
 * Un campo del formulario, en el orden en que se rellena. Tabla DECLARATIVA: la usa `rellenarRiesgo`
 * y el harness offline (`scripts/probar-formulario.ts`), que comprueba que cada locator resuelve sin
 * pulsar nada. `valor` → `undefined`/`null` = el riesgo no lo trae: si `obligatorio`, error de `datos`
 * (NUNCA un valor por defecto); si no, el campo no se toca y se respeta el valor del portal.
 */
export type CampoFormulario = {
  etiqueta: string
  /** Control N-ésimo tras la etiqueta (0 = el primero). */
  indice?: number
  tipo: 'texto' | 'fecha' | 'desplegable' | 'check'
  obligatorio: boolean
  valor: (r: RiesgoComunidad) => string | number | boolean | null | undefined
  /** Pausa humana tras el campo (fin de bloque). */
  pausa?: boolean
}

export const CAMPOS: readonly CampoFormulario[] = [
  // DATOS
  { etiqueta: 'Póliza a Reemplazar', tipo: 'texto', obligatorio: false, valor: (r) => r.polizaAReemplazar },
  { etiqueta: 'DNI/NIF/NIE/CIF', tipo: 'texto', obligatorio: false, valor: (r) => r.documentoIdentidad },
  // El select de tipo de documento va justo tras el campo de DNI; no tiene etiqueta propia.
  { etiqueta: 'DNI/NIF/NIE/CIF', indice: 1, tipo: 'desplegable', obligatorio: false, valor: (r) => r.tipoDocumento },
  { etiqueta: 'Fecha Inicio', tipo: 'fecha', obligatorio: true, valor: (r) => r.fechaEfecto },
  { etiqueta: 'Fecha Término', tipo: 'fecha', obligatorio: true, valor: (r) => r.fechaTermino, pausa: true },
  // DESCRIPCIÓN RIESGO
  { etiqueta: 'Metros Cuadrados', tipo: 'texto', obligatorio: true, valor: (r) => r.m2Construidos },
  { etiqueta: 'Año Construcción', tipo: 'texto', obligatorio: true, valor: (r) => r.anioConstruccion },
  { etiqueta: 'Año Reforma', tipo: 'texto', obligatorio: false, valor: (r) => r.anioRehabilitacion },
  { etiqueta: 'Tipo Vivienda', tipo: 'desplegable', obligatorio: true, valor: (r) => r.tipoVivienda },
  { etiqueta: 'Uso', tipo: 'desplegable', obligatorio: true, valor: (r) => r.uso },
  { etiqueta: 'Plantas sobre N. Calle', tipo: 'texto', obligatorio: true, valor: (r) => r.plantas },
  { etiqueta: 'Plantas bajo Nivel Calle', tipo: 'texto', obligatorio: false, valor: (r) => r.plantasBajoRasante },
  { etiqueta: 'Sótanos', tipo: 'texto', obligatorio: false, valor: (r) => r.sotanos },
  { etiqueta: 'Nº Edificios', tipo: 'texto', obligatorio: true, valor: (r) => r.numEdificios },
  // «Contiguos» es un select deshabilitado hasta que hay varios edificios: solo se toca si viene.
  { etiqueta: 'Nº Edificios', indice: 1, tipo: 'desplegable', obligatorio: false, valor: (r) => r.contiguos },
  { etiqueta: 'Nº Viv. y Locales', tipo: 'texto', obligatorio: true, valor: (r) => r.numViviendasYLocales },
  { etiqueta: 'Lista Propietarios / Arrendatarios', tipo: 'desplegable', obligatorio: true, valor: (r) => r.listaPropietarios },
  { etiqueta: 'Instalaciones Anexas (Deportivas, Piscinas, etc.)', tipo: 'check', obligatorio: false, valor: (r) => r.instalacionesAnexas },
  // C.P.: se teclea el código y se deja que el portal resuelva la población.
  // TODO(capturas): la lupa de «C.P./Población» abre un buscador; no se sabe si basta con teclear el CP
  // (aquí no se pulsa la lupa: si la población no se rellena sola, el cálculo fallará con `portal`).
  { etiqueta: 'C.P./Población', tipo: 'texto', obligatorio: true, valor: (r) => r.direccion.codigoPostal, pausa: true },
  // FORMA PAGO / % COMISIÓN: solo si el riesgo lo pide; si no, se respeta el valor por defecto del portal.
  { etiqueta: 'Primer Recibo', tipo: 'desplegable', obligatorio: false, valor: (r) => r.formaPagoPrimerRecibo },
  { etiqueta: 'Sucesivos', tipo: 'desplegable', obligatorio: false, valor: (r) => r.formaPagoSucesivos },
  { etiqueta: '% Comisión', tipo: 'desplegable', obligatorio: false, valor: (r) => r.comision },
  // PARTIDAS ASEGURABLES
  { etiqueta: 'Edificación Valor Reposición', tipo: 'texto', obligatorio: false, valor: (r) => r.capitalContinente },
  { etiqueta: 'Asistencia y Control de Plagas', tipo: 'check', obligatorio: false, valor: (r) => r.asistenciaPlagas },
  { etiqueta: 'Asesoramiento Jurídico', tipo: 'check', obligatorio: false, valor: (r) => r.asesoramientoJuridico },
  { etiqueta: 'Impago Cuotas Comunitarias', tipo: 'check', obligatorio: false, valor: (r) => r.impagoCuotas },
  { etiqueta: 'ITE:Inspección Técnica Edificios', tipo: 'check', obligatorio: false, valor: (r) => r.ite, pausa: true },
]

async function rellenarRiesgo(raiz: Raiz, r: RiesgoComunidad, ctx: ContextoPortal): Promise<void> {
  // TODO(capturas): confirmar si «Tarificar» es otra pestaña o la misma página con scroll (en la captura
  // se ve todo en «Datos Básicos»). De momento no se cambia de pestaña.
  for (const c of CAMPOS) {
    const v = c.valor(r)
    if (v === null || v === undefined || v === '') {
      if (c.obligatorio) dato(v, c.etiqueta)
    } else if (c.tipo === 'check') {
      await marcar(raiz, c.etiqueta, Boolean(v))
    } else if (c.tipo === 'desplegable') {
      await elegir(raiz, ctx, c.etiqueta, String(v), c.indice ?? 0)
    } else {
      await poner(raiz, c.etiqueta, c.tipo === 'fecha' ? fechaEs(String(v)) : (v as string | number), c.indice ?? 0)
    }
    if (c.pausa) await ctx.pausa()
  }
}

/** El ÚNICO botón que el bot pulsa en este formulario. */
export function botonCalcular(raiz: Raiz): Locator {
  // TODO(capturas): confirmar el elemento real (enlace, botón o input) y si el texto lleva el «>» inicial.
  return raiz.locator(
    ['a', 'button'].map((t) => `${t}:text-matches("^\\\\s*>?\\\\s*Calcular\\\\s*$", "i")`).join(', ') + ', input[value="Calcular" i]',
  ).first()
}

/** Inputs de importe de la fila «COSTE ANUAL DEL SEG. SEGÚN OPCIÓN» (Estándar, Personalizado). */
export function costesAnuales(raiz: Raiz): Locator {
  return filaPorEtiqueta(raiz, 'COSTE ANUAL DEL SEG. SEGÚN OPCIÓN').locator('input:not([type=radio]):not([type=hidden])')
}

async function calcular(page: Page, raiz: Raiz, ctx: ContextoPortal): Promise<Frame> {
  await ctx.pulsar(botonCalcular(raiz))
  await ctx.exigirSinCaptcha()
  // Espera a que «COSTE ANUAL DEL SEG. SEGÚN OPCIÓN» traiga el importe de Estándar (sondeo, máx. ~45 s).
  // El servlet puede recargar el marco al calcular: se vuelve a buscar el marco en cada vuelta.
  for (let i = 0; i < 90; i++) {
    const marco = await marcoCon(page, costesAnuales, 'COSTE ANUAL DEL SEG.', 0).catch(() => null)
    if (marco) {
      const v = await costesAnuales(marco).first().inputValue({ timeout: 1_000 }).catch(() => '')
      if (importeEs(v) !== null) return marco
    }
    await page.waitForTimeout(500)
  }
  throw new ErrorTarificador('portal', 'allianz/comunidades: «Calcular» no devolvió el coste anual (¿errores de validación en el formulario?)')
}

// ───────────────────────── lectura ─────────────────────────

type Partida = {
  clave: string
  literal: string
  /** Texto del grupo bajo el que aparece la fila (`null` = la fila lleva su propio título). */
  grupo: string | null
  /** Etiqueta de la fila. */
  fila: string
  /** ¿La fila trae el select de franquicia en la 3.ª columna? (RC y Suma Asegurada: no.) */
  franquicia: boolean
}

/** Garantías de la tabla «Estándar / Personalizado / Franquicia» tal como se ven en la captura. */
export const PARTIDAS: readonly Partida[] = [
  { clave: 'cobertura_valor_estetico', literal: 'Cobertura Valor Estético', grupo: 'Edificación', fila: 'Cobertura Valor Estético', franquicia: false },
  { clave: 'accion_agua_bienes_comunes', literal: 'Acción Agua · Bienes Comunes', grupo: 'Acción Agua', fila: 'Bienes Comunes', franquicia: true },
  { clave: 'accion_agua_comunes_privativos', literal: 'Acción Agua · Bienes Comunes y Privativos', grupo: 'Acción Agua', fila: 'Bienes Comunes y Privativos', franquicia: true },
  { clave: 'desatasco_tuberias', literal: 'Desatasco Tuberías Comunitarias', grupo: null, fila: 'Desatasco Tuberías Comunitarias', franquicia: false },
  { clave: 'rc_agua_bienes_comunes', literal: 'RC por Acción del Agua · Bienes Comunes', grupo: 'Responsabilidad Civil por Acción del Agua', fila: 'Bienes Comunes', franquicia: true },
  { clave: 'rc_agua_comunes_privativos', literal: 'RC por Acción del Agua · Bienes Comunes y Privativos', grupo: 'Responsabilidad Civil por Acción del Agua', fila: 'Bienes Comunes y Privativos', franquicia: true },
  { clave: 'rc_suma_asegurada', literal: 'Responsabilidad Civil · Suma Asegurada', grupo: 'Responsabilidad Civil', fila: 'Suma Asegurada', franquicia: false },
  { clave: 'rc_contaminacion_suma_asegurada', literal: 'RC Contaminación · Suma Asegurada', grupo: 'Responsabilidad Civil Contaminación', fila: 'Suma Asegurada', franquicia: false },
  { clave: 'rotura_cristales_bienes_comunes', literal: 'Rotura Cristales · Bienes Comunes', grupo: 'Rotura Cristales', fila: 'Bienes Comunes', franquicia: true },
  { clave: 'rotura_cristales_comunes_privativos', literal: 'Rotura Cristales · Bienes Comunes y Privativos', grupo: 'Rotura Cristales', fila: 'Bienes Comunes y Privativos', franquicia: true },
  { clave: 'maquinaria_primer_riesgo', literal: 'Rotura Maquinaria / Avería Aparatos Electrónicos · Cobertura a Primer Riesgo', grupo: 'Rotura Maquinaria / Avería Aparatos Electrónicos', fila: 'Cobertura a Primer Riesgo', franquicia: true },
]

/** Filas con checkbox de asistencia: tras calcular, ePAC escribe «Incluida»/«Excluida» por columna. */
export const ASISTENCIAS: readonly { clave: string; literal: string; fila: string }[] = [
  { clave: 'asistencia_plagas', literal: 'Asistencia y Control de Plagas', fila: 'Asistencia y Control de Plagas' },
  { clave: 'asesoramiento_juridico', literal: 'Asesoramiento Jurídico', fila: 'Asesoramiento Jurídico' },
  { clave: 'impago_cuotas', literal: 'Impago Cuotas Comunitarias', fila: 'Impago Cuotas Comunitarias' },
  { clave: 'ite', literal: 'ITE: Inspección Técnica Edificios', fila: 'ITE:Inspección Técnica Edificios' },
]

/** «Incluida»/«Excluida» → estado; cualquier otra cosa → null (sin dato, no «excluida»). */
export function estadoDeTexto(t: string | null | undefined): 'incluida' | 'excluida' | null {
  const v = (t ?? '').trim().toLowerCase()
  return v === 'incluida' ? 'incluida' : v === 'excluida' ? 'excluida' : null
}

async function leerEstadosAsistencia(raiz: Raiz, fila: string): Promise<['incluida' | 'excluida' | null, 'incluida' | 'excluida' | null]> {
  const textos = await filaPorEtiqueta(raiz, fila).locator('td').allInnerTexts().catch(() => [] as string[])
  const estados = textos.map(estadoDeTexto).filter((e) => e !== null)
  // Esperado: [Estándar, Personalizado]. Si no salen exactamente dos, no se afirma nada.
  return estados.length === 2 ? [estados[0], estados[1]] : [null, null]
}

type Celda = { texto: string | null; importe: number | null }

/** Valor de un control: texto de la opción elegida (select) o contenido (input). Vacío → `null`, nunca 0. */
async function leerControl(c: Locator): Promise<Celda> {
  const texto = await c
    .evaluate((el) => {
      if (el instanceof HTMLSelectElement) return el.selectedOptions[0]?.textContent ?? ''
      return (el as HTMLInputElement).value ?? ''
    })
    .catch(() => '')
  const t = texto.trim()
  // Una opción «Seleccione…» o vacía es «sin dato», no un valor.
  if (t === '' || /^seleccione/i.test(t)) return { texto: null, importe: null }
  return { texto: t, importe: importeEs(t) }
}

async function leerFila(raiz: Raiz, p: Partida): Promise<{ estandar: Celda; personalizado: Celda; franquicia: Celda | null }> {
  const fila = filaPorEtiqueta(raiz, p.fila, p.grupo)
  const controles = fila.locator('input:not([type=checkbox]):not([type=radio]):not([type=hidden]), select')
  const n = await controles.count()
  const vacio: Celda = { texto: null, importe: null }
  // Orden en la captura: Estándar, Personalizado, [Franquicia]. Con 2 controles no hay franquicia.
  const estandar = n > 0 ? await leerControl(controles.nth(0)) : vacio
  const personalizado = n > 1 ? await leerControl(controles.nth(1)) : vacio
  const franquicia = p.franquicia && n > 2 ? await leerControl(controles.nth(2)) : null
  return { estandar, personalizado, franquicia }
}

type LecturaCalculo = {
  /** Coste anual de la modalidad elegida según «COSTE ANUAL DEL SEG.» de Datos Básicos (referencia cruzada). */
  costeDatosBasicos: number | null
  coberturas: CoberturaOferta[]
  franquicias: FranquiciaOferta[]
}

/** Lee, ANTES de avanzar, la tabla de garantías de Datos Básicos para la modalidad elegida. */
async function leerCalculo(raiz: Raiz, ctx: ContextoPortal, modalidad: ModalidadPortal): Promise<LecturaCalculo> {
  const costes = costesAnuales(raiz)
  const columna = modalidad === 'estandar' ? 0 : 1
  const costeDatosBasicos = importeEs(await costes.nth(columna).inputValue().catch(() => ''))

  const coberturas: CoberturaOferta[] = []
  const franquicias: FranquiciaOferta[] = []
  for (const a of ASISTENCIAS) {
    const estados = await leerEstadosAsistencia(raiz, a.fila)
    coberturas.push({ clave: a.clave, literal: a.literal, estado: estados[columna], capital: null, limite: null, franquicia: null })
  }
  for (const p of PARTIDAS) {
    try {
      const f = await leerFila(raiz, p)
      const celda = columna === 0 ? f.estandar : f.personalizado
      // Capital = lo que muestra la columna elegida. Estado null: la tabla no dice «incluida» en estas filas.
      coberturas.push({ clave: p.clave, literal: p.literal, estado: null, capital: celda.importe, limite: null, franquicia: f.franquicia?.importe ?? null })
      if (f.franquicia?.texto) {
        franquicias.push({ ambito: p.clave, importeEur: f.franquicia.importe, literal: f.franquicia.importe === null ? f.franquicia.texto : null })
      }
    } catch (e) {
      // Una fila ilegible no tumba la oferta (la prima se lee después): se anota y se sigue.
      ctx.log(`partida «${p.literal}» ilegible: ${e instanceof Error ? e.message.slice(0, 120) : 'error'}`)
    }
  }
  return { costeDatosBasicos, coberturas, franquicias }
}

/**
 * Pestaña «Tarificar»: tabla Anual / Sucesivos con Prima Neta, Impuestos y Prima Total. Aquí los importes
 * van con PUNTO decimal y sin miles (`importePuntoDecimal`, no `importeEs`). Lo que no se lee es `null`.
 */
async function leerPrimas(raiz: Raiz): Promise<{ anual: DesglosePrima; sucesivos: DesglosePrima }> {
  const fila = async (etiqueta: string): Promise<[number | null, number | null]> => {
    const textos = await filaPorEtiqueta(raiz, etiqueta).locator('td').allInnerTexts().catch(() => [] as string[])
    const importes = textos.slice(1).map((t) => importePuntoDecimal(t)).filter((n): n is number => n !== null)
    // Esperado: [anual, sucesivos]. Si no salen exactamente dos importes, no se afirma ninguno.
    return importes.length === 2 ? [importes[0], importes[1]] : [null, null]
  }
  const [netaA, netaS] = await fila('Prima Neta')
  const [impA, impS] = await fila('Impuestos')
  const [totA, totS] = await fila('Prima Total')
  return {
    anual: { primaNetaEur: netaA, impuestosEur: impA, primaTotalEur: totA },
    sucesivos: { primaNetaEur: netaS, impuestosEur: impS, primaTotalEur: totS },
  }
}

/**
 * PDF del proyecto: pestaña «Proyecto» (no graba nada). La descarga se captura en paralelo
 * con la pulsación de «Proyecto»; se obtiene el fichero, se verifica que sea PDF y se
 * convierte a base64.
 */
async function descargarProyecto(page: Page, raiz: Raiz, ctx: ContextoPortal, nombre: string): Promise<PdfRef | null> {
  const pestana = raiz.getByText('Proyecto', { exact: true }).first()
  const descargar = page.waitForEvent('download', { timeout: 45_000 })

  // Lanzar descarga en paralelo con la pulsación
  const [, descarga] = await Promise.all([
    ctx.abrirProyecto(pestana),
    descargar,
  ]).catch(() => [undefined, null] as const)

  if (!descarga) {
    ctx.log('pdf: no se descargó tras abrir «Proyecto»')
    return null
  }

  // Leer el fichero desde el stream
  let bytes: Buffer | null = null
  try {
    const trozos: Buffer[] = []
    const flujo = await descarga.createReadStream()
    for await (const t of flujo) {
      trozos.push(Buffer.from(t))
    }
    bytes = Buffer.concat(trozos)
  } catch (e) {
    ctx.log(`pdf: error al leer la descarga: ${e instanceof Error ? e.message : 'error'}`)
    return null
  }

  // Un PDF de verdad empieza por «%PDF»; si no, no se adjunta (no se sube cualquier cosa).
  if (!bytes || bytes.length < 5 || bytes.subarray(0, 4).toString('latin1') !== '%PDF') {
    ctx.log('pdf: lo recibido no es un PDF; se omite')
    return null
  }

  return ctx.adjuntarPdf(nombre, bytes)
}

export const allianzComunidades: AdaptadorPortal = {
  compania: 'allianz',
  ramo: 'comunidades',
  credencial: 'ALLIANZ_EPAC',
  async tarificar(page, riesgo, ctx) {
    // UNA modalidad por trabajo (por defecto estándar). Querer las dos = DOS trabajos (dos pasadas):
    // tras «Aceptar» el formulario avanza y no hay vuelta atrás sin riesgo de dejar el portal a medias.
    const modalidad: ModalidadPortal = riesgo.modalidad ?? 'estandar'
    await login(page, ctx)
    await ctx.trasLogin()
    await abrirComunidades(page, ctx)
    // El formulario vive en un iframe (`appArea`): todo lo que sigue se busca en su marco.
    const formulario = await marcoFormulario(page)
    ctx.log(`formulario en el marco «${formulario.name() || '(sin nombre)'}»`)
    await rellenarRiesgo(formulario, riesgo, ctx)
    const resultado = await calcular(page, formulario, ctx)
    const calculo = await leerCalculo(resultado, ctx, modalidad)
    // Datos Básicos → elegir modalidad → «Aceptar» (SOLO avanza a Tarificar; guardado por fases).
    await ctx.elegirOpcion(modalidad)
    await ctx.pausa()
    await ctx.avanzarATarificar()
    await ctx.exigirSinCaptcha()
    // Tras el avance el servlet puede recargar o cambiar de marco: se busca el que trae «Prima Total».
    const tarificar = await marcoCon(page, (r) => filaPorEtiqueta(r, 'Prima Total'), 'Prima Total')
    const primas = await leerPrimas(tarificar)
    if (primas.anual.primaTotalEur === null) {
      throw new ErrorTarificador('portal', 'allianz/comunidades: la pestaña Tarificar no trajo «Prima Total» anual legible')
    }
    const pdf = await descargarProyecto(page, tarificar, ctx, `proyecto-comunidades-2020-${modalidad}.pdf`)
    const avisos = [
      `Modalidad ${modalidad === 'estandar' ? 'Estándar' : 'Personalizado'} (la otra requiere otro trabajo)`,
      'Prima anual = Prima Total del primer año; los recibos sucesivos pueden diferir (ver desglose)',
      'Capitales y franquicias tal como los muestra la tabla de ePAC; «estado» solo en las asistencias (Incluida/Excluida)',
    ]
    if (pdf === null) avisos.push('PDF del proyecto no obtenido (TODO: confirmar si «Proyecto» da descarga o ventana)')
    if (calculo.costeDatosBasicos !== null && primas.sucesivos.primaTotalEur !== null && calculo.costeDatosBasicos !== primas.sucesivos.primaTotalEur) {
      avisos.push('El coste de Datos Básicos no coincide con la Prima Total de sucesivos: revisar a mano')
    }
    const oferta: OfertaNormalizada = {
      compania: 'Allianz',
      producto: `Comunidades 2020 · ${modalidad === 'estandar' ? 'Estándar' : 'Personalizado'}`,
      primaAnualEur: primas.anual.primaTotalEur,
      primaNetaEur: primas.anual.primaNetaEur,
      fraccionamiento: null,
      importeReciboEur: primas.sucesivos.primaTotalEur,
      coberturas: calculo.coberturas,
      franquicias: calculo.franquicias,
      validaHasta: null,
      referenciaPortal: null,
      pdf,
      desglose: { anual: primas.anual, sucesivos: primas.sucesivos },
      avisos,
    }
    return { ofertas: [oferta] }
  },
}
