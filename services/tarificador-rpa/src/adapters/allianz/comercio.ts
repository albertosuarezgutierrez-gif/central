// Allianz ePAC «Calcula el seguro de tu Negocio» (app 2038, subramo 0002, Struts `/drpc82`, iframe `appArea`) —
// EN CONSTRUCCIÓN (08/10/2026). NO está registrado en `adapters/index.ts`: nada de producción lo ejecuta.
//
// Hecho: paso 4 «Datos» (tomador) y LECTOR de la prima del panel de presupuesto.
// HUECO: pasos 1-3 (actividad, local/capitales, coberturas) → `ErrorMapaIncompleto`. Faltan además: pasos 5,
// ruta Venta/Nueva Alta, variante persona jurídica verificada, pantallas de error, mapeo a `OfertaNormalizada`.
//
// SEGURIDAD: el robot NUNCA emite. Aquí no hay selectores ni lógica para el botón «Siguiente» (id `idbtnAceptar`,
// handler `botonSiguienteOk()`, avanza a «5. Revisión», que puede persistir al tomador real), ni para los
// enlaces del stepper con el mismo handler, ni para «Confirmar/Editar» cuenta bancaria, «Acceder» ecliente,
// Archivar o Proyecto ampliado: los bloquea `guard-emision.ts`. Solo se pulsa con `ctx.pulsar()`; este paso solo
// ESCRIBE en campos (`fill`), no pulsa nada.
// RGPD: las tres preguntas de consentimiento (promociones, productos, perfilado) NO se tocan nunca: quedan como
// vienen. Tampoco «¿Tomador y asegurado son la misma persona?», ni «coincide la dirección con el riesgo?».
// Sin credenciales en el código (el login es el de comunidades.ts, que lee del contexto).

import type { Frame, Locator, Page } from 'playwright'
import { importeEs } from '@central/module-tarificacion'
import type { FormularioComercio, Tomador } from '@central/module-tarificacion'
import type { ContextoPortal } from '../../adaptador.ts'
import { ErrorTarificador } from '../../errores.ts'
import { abrirNuevaAlta } from './entrada.ts'
import { login, marcoCon, sesionSirve } from './comunidades.ts'

/** Flag de registro: apagado por defecto. Nada lo enciende en producción. */
export const COMERCIO_ACTIVO = false

/** Hueco declarado: falta un mapa de pantalla. NO transitorio → `error_definitivo`, no se reintenta. */
export class ErrorMapaIncompleto extends ErrorTarificador {
  constructor(que: string) {
    super('portal', `allianz/comercio: mapa incompleto: faltan ${que}`)
    this.name = 'ErrorMapaIncompleto'
  }
}

// ───────────────────────── lector de la prima (puro) ─────────────────────────

/** Selector de la prima del panel de presupuesto (junto a `.alz-presupuesto-seguro`). */
export const SEL_PRIMA_PANEL = '.alz-presupuesto-precio span'

/**
 * Textos de los `<span>` del panel → prima en euros. Fail-closed: exactamente UN texto con importe español legible
 * (los demás spans, p. ej. «€» o «/ año», no cuentan); ninguno, o más de uno, o importe ≤ 0 → error `portal`.
 */
export function primaDesdeTextos(textos: readonly string[]): number {
  const importes = textos.map((t) => importeEs(t)).filter((n): n is number => n !== null)
  if (importes.length !== 1) {
    throw new ErrorTarificador('portal', `allianz/comercio: el panel de presupuesto trae ${importes.length} importes legibles y se esperaba 1`)
  }
  if (!(importes[0] > 0)) throw new ErrorTarificador('portal', 'allianz/comercio: la prima del panel no es mayor que 0')
  return importes[0]
}

/** Lee la prima del panel (solo lectura). */
export async function leerPrimaPanel(raiz: Pick<Frame, 'locator'>): Promise<number> {
  const textos = await raiz.locator(SEL_PRIMA_PANEL).evaluateAll((els) => els.map((e) => e.textContent ?? ''))
  return primaDesdeTextos(textos)
}

// ───────────────────────── paso 4 «Datos» (tomador) ─────────────────────────

/** Ids estables del paso 4 (mapa 07/10/2026). Los hay readonly/precargados (`idNumberTom_*`): no se escriben. */
export const SEL_TOMADOR = {
  razonSocial: '#razonSocialTom',
  nombre: '#nombreTom',
  apellido1: '#apellido1Tom',
  apellido2: '#apellido2Tom',
  fechaNacimiento: '#fNaciTom',
  codigoPostal: '#Tom_address_pc',
  poblacion: '#Tom_address_town',
  direccion: '#Tom_address_street',
  email: '#mailTom',
  telefono: '#telefono1Tom',
  documento: '#idNumberTom_doc',
} as const

/** «2026-10-05» → «05/10/2026» (formato del campo). */
export function fechaDdMmAaaa(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) throw new ErrorTarificador('datos', `allianz/comercio: fecha «${iso}» no es AAAA-MM-DD`)
  return `${m[3]}/${m[2]}/${m[1]}`
}

/** Plan de escritura: [selector, valor] en orden. Puro (testeable sin navegador). `null` = no se escribe (no se inventa). */
export function planTomador(t: Tomador): Array<readonly [string, string]> {
  const plan: Array<readonly [string, string]> = []
  const poner = (sel: string, v: string | null) => {
    if (v !== null && v !== '') plan.push([sel, v])
  }
  if (t.tipo === 'fisica') {
    poner(SEL_TOMADOR.nombre, t.nombre)
    poner(SEL_TOMADOR.apellido1, t.apellido1)
    poner(SEL_TOMADOR.apellido2, t.apellido2)
    poner(SEL_TOMADOR.fechaNacimiento, t.fechaNacimiento === null ? null : fechaDdMmAaaa(t.fechaNacimiento))
  } else {
    poner(SEL_TOMADOR.razonSocial, t.razonSocial)
  }
  poner(SEL_TOMADOR.codigoPostal, t.codigoPostal)
  poner(SEL_TOMADOR.poblacion, t.poblacion)
  poner(SEL_TOMADOR.direccion, t.direccion)
  poner(SEL_TOMADOR.email, t.email)
  poner(SEL_TOMADOR.telefono, t.telefono)
  return plan
}

/**
 * Los selects son bootstrap-select: cada `<select>` queda oculto tras un `button.dropdown-toggle`. Se opera sobre
 * el `<select>` oculto (valor + evento `change`), sin pulsar el botón visible. Valor inexistente → error `datos`.
 */
export async function fijarSelectOculto(select: Locator, valor: string): Promise<void> {
  const ok = await select.evaluate((el, v) => {
    const s = el as HTMLSelectElement
    if (!Array.from(s.options).some((o) => o.value === v)) return false
    s.value = v
    s.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  }, valor)
  if (!ok) throw new ErrorTarificador('datos', `allianz/comercio: el desplegable no tiene la opción «${valor}»`)
}

/**
 * Rellena el paso 4 con el tomador. Solo `fill`. El documento va precargado y deshabilitado por el portal: si trae
 * valor y NO casa con el del tomador → error `datos` (no se sigue con otra persona). Consentimientos RGPD: intactos.
 */
export async function rellenarTomador(raiz: Pick<Frame, 'locator'>, tomador: Tomador): Promise<void> {
  const precargado = await raiz.locator(SEL_TOMADOR.documento).first().inputValue({ timeout: 1_000 }).catch(() => '')
  const previo = precargado.toUpperCase().replace(/[\s.\-/]/g, '')
  if (previo !== '' && previo !== tomador.documentoIdentidad) {
    throw new ErrorTarificador('datos', 'allianz/comercio: el documento precargado en el portal no casa con el del tomador')
  }
  for (const [sel, valor] of planTomador(tomador)) {
    const campo = raiz.locator(sel).first()
    if ((await campo.count()) === 0) throw new ErrorTarificador('portal', `allianz/comercio: no aparece el campo ${sel} del paso Datos`)
    await campo.fill(valor)
  }
}

// ───────────────────────── flujo (con huecos) ─────────────────────────

/** HUECO: pasos 1-3 sin grabar. */
export async function rellenarPasos1a3(_page: Page, _riesgo: FormularioComercio, _ctx: ContextoPortal): Promise<never> {
  throw new ErrorMapaIncompleto('pasos 1-3: actividad, local/capitales, coberturas')
}

/** Paso 4 «Datos»: localiza el marco y escribe el tomador. Pensado para llamarse cuando los pasos 1-3 tengan mapa. */
export async function rellenarDatos(page: Page, riesgo: FormularioComercio, ctx: Pick<ContextoPortal, 'pausa'>): Promise<void> {
  if (!riesgo.tomador) throw new ErrorTarificador('datos', 'allianz/comercio: el portal exige los datos del tomador y el riesgo no los trae')
  const marco = await marcoCon(page, (r) => r.locator(SEL_TOMADOR.nombre).or(r.locator(SEL_TOMADOR.razonSocial)), 'paso Datos (tomador)')
  await rellenarTomador(marco, riesgo.tomador)
  await ctx.pausa()
}

export const allianzComercio = {
  compania: 'allianz',
  ramo: 'comercio',
  credencial: 'ALLIANZ_EPAC',
  version: '0.1.0',
  async tarificar(page: Page, riesgo: FormularioComercio, ctx: ContextoPortal): Promise<never> {
    if (!(ctx.sesionReutilizada && (await sesionSirve(page, ctx)))) await login(page, ctx)
    await ctx.trasLogin()
    // TODO(capturas): nombre exacto de la tarjeta «Negocio» en la pestaña Empresas del modal.
    await abrirNuevaAlta(page, ctx, { pestana: 'Empresas', producto: 'Negocio' })
    // Cuando existan los pasos 1-3: rellenarDatos(page, riesgo, ctx) → leerPrimaPanel(marco) → OfertaNormalizada.
    return rellenarPasos1a3(page, riesgo, ctx)
  },
} as const
