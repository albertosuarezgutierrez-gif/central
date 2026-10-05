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
//   · Los campos se localizan por el TEXTO de la etiqueta de su fila (`campoPorEtiqueta`), no por id.

import type { Locator, Page } from 'playwright'
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

// ───────────────────────── helpers por etiqueta ─────────────────────────

function literalXPath(t: string): string {
  if (!t.includes('"')) return `"${t}"`
  if (!t.includes("'")) return `'${t}'`
  throw new Error(`etiqueta con ambos tipos de comillas: ${t}`)
}

const CONTROLES = `*[self::input[not(@type="hidden")] or self::select or self::textarea]`

/**
 * Localiza el control de una fila del formulario por el TEXTO de su etiqueta (patrón tabla
 * etiqueta → input; ePAC no ofrece ids estables). Ignora el asterisco de obligatorio y los espacios.
 * `indice` (0 por defecto) elige el control siguiente N-ésimo en orden de documento: sirve para filas
 * con varios controles tras la etiqueta («Nº Edificios *» → input, luego el select «Contiguos»).
 * Ojo: «siguiente control en el documento» — si la fila no tiene control propio, devolvería el de la
 * fila siguiente: por eso se usa solo con etiquetas cuyo control está en su misma fila.
 */
export function campoPorEtiqueta(page: Page, etiqueta: string, indice = 0): Locator {
  const e = literalXPath(etiqueta)
  const celda = `(//*[self::td or self::th or self::label or self::span][not(.//td)][normalize-space(translate(string(.),"*:",""))=${e}])[1]`
  return page.locator(`xpath=${celda}/following::${CONTROLES}[${indice + 1}]`)
}

/** Fila (`tr`) de una garantía de la tabla de partidas, por el texto de su etiqueta (y su grupo, si lo hay). */
export function filaPorEtiqueta(page: Page, etiqueta: string, grupo: string | null = null): Locator {
  const e = literalXPath(etiqueta)
  const celda = `td[normalize-space(translate(string(.),"*:",""))=${e}]`
  if (grupo === null) return page.locator(`xpath=(//tr[${celda}])[1]`)
  const g = literalXPath(grupo)
  return page.locator(`xpath=(//tr[td[normalize-space(translate(string(.),"*:",""))=${g}]]/following-sibling::tr[${celda}])[1]`)
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

async function poner(page: Page, etiqueta: string, valor: string | number, indice = 0): Promise<void> {
  await campoPorEtiqueta(page, etiqueta, indice).fill(String(valor))
}

/**
 * Select por etiqueta, con el valor como string LIBRE (TODO(valores admitidos): lista que solo tiene
 * Alberto). Se intenta por texto visible y, si no, por `value`; si ninguno casa, error de datos
 * (no se elige «lo más parecido»).
 */
async function elegir(page: Page, etiqueta: string, valor: string, indice = 0): Promise<void> {
  const s = campoPorEtiqueta(page, etiqueta, indice)
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

// ───────────────────────── login y navegación ─────────────────────────

async function login(page: Page, ctx: ContextoPortal): Promise<void> {
  await page.goto(sel('urlLogin'))
  await ctx.exigirSinCaptcha()
  // Login por etiqueta/rol (captura del 05/10/2026). Tracing apagado: lo vigila el guardián de la raíz.
  const usuario = page.getByLabel('Usuario', { exact: true })
  await usuario.fill(ctx.credenciales.usuario)
  await ctx.pausa()
  // exact: la frase «Contraseña sensible a mayúsculas…» no es la etiqueta del campo.
  await page.getByLabel('Contraseña', { exact: true }).fill(ctx.credenciales.contrasena)
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
  // Ruta dada por Alberto: botón naranja «NUEVA ALTA» (cabecera de la home) → modal «Nueva Alta» con
  // acordeones → «Particulares» → tarjeta «Comunidades» → «Comunidades 2020».
  // «Nueva alta» es NAVEGACIÓN para cotizar, no emisión (el guard ya no la bloquea). Alternativa en el
  // menú: «Venta» → «Nueva Alta». El modal también tiene «CERRAR» (tampoco se bloquea).
  await ctx.pulsar(page.getByText('NUEVA ALTA', { exact: true }).first())
  await ctx.pausa()
  const modal = page.getByRole('dialog').filter({ hasText: 'Nueva Alta' }).first()
  await ctx.pulsar(modal.getByText('Particulares', { exact: true }).first())
  await ctx.pausa()
  await ctx.pulsar(modal.getByText('Comunidades', { exact: true }).first())
  await page.getByText(TITULO_FORMULARIO, { exact: true }).first().waitFor()
  await ctx.exigirSinCaptcha()
}

// ───────────────────────── formulario ─────────────────────────

async function rellenarRiesgo(page: Page, r: RiesgoComunidad, ctx: ContextoPortal): Promise<void> {
  // TODO(capturas): confirmar si «Tarificar» es otra pestaña o la misma página con scroll (en la captura
  // se ve todo en «Datos Básicos»). De momento no se cambia de pestaña.

  // DATOS
  if (r.polizaAReemplazar) await poner(page, 'Póliza a Reemplazar', r.polizaAReemplazar)
  if (r.documentoIdentidad) await poner(page, 'DNI/NIF/NIE/CIF', r.documentoIdentidad)
  // El select de tipo de documento va justo tras el campo de DNI; no tiene etiqueta propia.
  if (r.tipoDocumento) await elegir(page, 'DNI/NIF/NIE/CIF', r.tipoDocumento, 1)
  await poner(page, 'Fecha Inicio', fechaEs(dato(r.fechaEfecto, 'Fecha Inicio')))
  await poner(page, 'Fecha Término', fechaEs(dato(r.fechaTermino, 'Fecha Término')))
  await ctx.pausa()

  // DESCRIPCIÓN RIESGO
  await poner(page, 'Metros Cuadrados', dato(r.m2Construidos, 'Metros Cuadrados'))
  await poner(page, 'Año Construcción', dato(r.anioConstruccion, 'Año Construcción'))
  if (r.anioRehabilitacion !== null && r.anioRehabilitacion !== undefined) await poner(page, 'Año Reforma', r.anioRehabilitacion)
  await elegir(page, 'Tipo Vivienda', dato(r.tipoVivienda, 'Tipo Vivienda'))
  await elegir(page, 'Uso', dato(r.uso, 'Uso'))
  await poner(page, 'Plantas sobre N. Calle', dato(r.plantas, 'Plantas sobre N. Calle'))
  if (r.plantasBajoRasante !== null && r.plantasBajoRasante !== undefined) await poner(page, 'Plantas bajo Nivel Calle', r.plantasBajoRasante)
  if (r.sotanos !== null && r.sotanos !== undefined) await poner(page, 'Sótanos', r.sotanos)
  const nEdificios = dato(r.numEdificios, 'Nº Edificios')
  await poner(page, 'Nº Edificios', nEdificios)
  // «Contiguos» es un select deshabilitado hasta que hay varios edificios: solo se toca si viene.
  if (r.contiguos) await elegir(page, 'Nº Edificios', r.contiguos, 1)
  await poner(page, 'Nº Viv. y Locales', dato(r.numViviendasYLocales, 'Nº Viv. y Locales'))
  await elegir(page, 'Lista Propietarios / Arrendatarios', dato(r.listaPropietarios, 'Lista Propietarios / Arrendatarios'))
  if (r.instalacionesAnexas !== null && r.instalacionesAnexas !== undefined) {
    await campoPorEtiqueta(page, 'Instalaciones Anexas (Deportivas, Piscinas, etc.)').setChecked(r.instalacionesAnexas)
  }
  // C.P.: se teclea el código y se deja que el portal resuelva la población.
  // TODO(capturas): la lupa de «C.P./Población» abre un buscador; no se sabe si basta con teclear el CP
  // (aquí no se pulsa la lupa: si la población no se rellena sola, el cálculo fallará con `portal`).
  await poner(page, 'C.P./Población', r.direccion.codigoPostal)
  await ctx.pausa()

  // FORMA PAGO / % COMISIÓN: solo si el riesgo lo pide; si no, se respeta el valor por defecto del portal.
  if (r.formaPagoPrimerRecibo) await elegir(page, 'Primer Recibo', r.formaPagoPrimerRecibo)
  if (r.formaPagoSucesivos) await elegir(page, 'Sucesivos', r.formaPagoSucesivos)
  if (r.comision) await elegir(page, '% Comisión', r.comision)

  // PARTIDAS ASEGURABLES
  if (r.capitalContinente !== null) await poner(page, 'Edificación Valor Reposición', r.capitalContinente)
  const checks: [string, boolean | null | undefined][] = [
    ['Asistencia y Control de Plagas', r.asistenciaPlagas],
    ['Asesoramiento Jurídico', r.asesoramientoJuridico],
    ['Impago Cuotas Comunitarias', r.impagoCuotas],
    ['ITE:Inspección Técnica Edificios', r.ite],
  ]
  for (const [etiqueta, valor] of checks) {
    if (valor === null || valor === undefined) continue
    await campoPorEtiqueta(page, etiqueta).setChecked(valor)
  }
  await ctx.pausa()
}

/** El ÚNICO botón que el bot pulsa en este formulario. */
function botonCalcular(page: Page): Locator {
  // TODO(capturas): confirmar el elemento real (enlace, botón o input) y si el texto lleva el «>» inicial.
  return page.locator(
    ['a', 'button'].map((t) => `${t}:text-matches("^\\\\s*>?\\\\s*Calcular\\\\s*$", "i")`).join(', ') + ', input[value="Calcular"]',
  ).first()
}

async function calcular(page: Page, ctx: ContextoPortal): Promise<void> {
  await ctx.pulsar(botonCalcular(page))
  await ctx.exigirSinCaptcha()
  // Espera a que «COSTE ANUAL DEL SEG. SEGÚN OPCIÓN» traiga el importe de Estándar (sondeo, máx. ~45 s).
  const coste = filaPorEtiqueta(page, 'COSTE ANUAL DEL SEG. SEGÚN OPCIÓN').locator('input')
  for (let i = 0; i < 90; i++) {
    const v = await coste.first().inputValue().catch(() => '')
    if (importeEs(v) !== null) return
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

async function leerEstadosAsistencia(page: Page, fila: string): Promise<['incluida' | 'excluida' | null, 'incluida' | 'excluida' | null]> {
  const textos = await filaPorEtiqueta(page, fila).locator('td').allInnerTexts().catch(() => [] as string[])
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

async function leerFila(page: Page, p: Partida): Promise<{ estandar: Celda; personalizado: Celda; franquicia: Celda | null }> {
  const fila = filaPorEtiqueta(page, p.fila, p.grupo)
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
async function leerCalculo(page: Page, ctx: ContextoPortal, modalidad: ModalidadPortal): Promise<LecturaCalculo> {
  const costes = filaPorEtiqueta(page, 'COSTE ANUAL DEL SEG. SEGÚN OPCIÓN').locator('input:not([type=radio]):not([type=hidden])')
  const columna = modalidad === 'estandar' ? 0 : 1
  const costeDatosBasicos = importeEs(await costes.nth(columna).inputValue().catch(() => ''))

  const coberturas: CoberturaOferta[] = []
  const franquicias: FranquiciaOferta[] = []
  for (const a of ASISTENCIAS) {
    const estados = await leerEstadosAsistencia(page, a.fila)
    coberturas.push({ clave: a.clave, literal: a.literal, estado: estados[columna], capital: null, limite: null, franquicia: null })
  }
  for (const p of PARTIDAS) {
    try {
      const f = await leerFila(page, p)
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
async function leerPrimas(page: Page): Promise<{ anual: DesglosePrima; sucesivos: DesglosePrima }> {
  const fila = async (etiqueta: string): Promise<[number | null, number | null]> => {
    const textos = await filaPorEtiqueta(page, etiqueta).locator('td').allInnerTexts().catch(() => [] as string[])
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
async function descargarProyecto(page: Page, ctx: ContextoPortal, nombre: string): Promise<PdfRef | null> {
  const pestana = page.getByText('Proyecto', { exact: true }).first()
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
    await rellenarRiesgo(page, riesgo, ctx)
    await calcular(page, ctx)
    const calculo = await leerCalculo(page, ctx, modalidad)
    // Datos Básicos → elegir modalidad → «Aceptar» (SOLO avanza a Tarificar; guardado por fases).
    await ctx.elegirOpcion(modalidad)
    await ctx.pausa()
    await ctx.avanzarATarificar()
    await ctx.exigirSinCaptcha()
    const primas = await leerPrimas(page)
    if (primas.anual.primaTotalEur === null) {
      throw new ErrorTarificador('portal', 'allianz/comunidades: la pestaña Tarificar no trajo «Prima Total» anual legible')
    }
    const pdf = await descargarProyecto(page, ctx, `proyecto-comunidades-2020-${modalidad}.pdf`)
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
