// Allianz ePAC «RC PYME» (app 1430, `/drrg01/pme1430`) — EN CONSTRUCCIÓN (07/10/2026). NO está registrado
// en `adapters/index.ts`: nada de producción lo ejecuta. Ver docs/TARIFICADOR-RPA.md «Allianz RC PYME».
//
// Flujo: login → entrada común (entrada.ts, Empresas) → Datos básicos [HUECO] → calcular [HUECO] → leer primas.
// Hecho: el LECTOR de primas de la pantalla de tarifa (puro, sin ids). Hueco: faltan las pantallas de «Datos básicos».
//
// SEGURIDAD: el robot NUNCA emite. Aquí no hay selectores ni lógica para Archivar, Proyecto ampliado, Datos
// emisión, Aceptar (#btnAccept → emision_ipid) ni Pago fraccionado (td#menu3/4/5, #btnFracciona): los bloquea
// `guard-emision.ts` (module-tarificacion) y solo se pulsa con `ctx.pulsar()`. Sin credenciales en el código.

import type { Locator, Page } from 'playwright'
import { importeEs } from '@central/module-tarificacion'
import type { FormularioRC } from '@central/module-tarificacion'
import type { ContextoPortal } from '../../adaptador.ts'
import { ErrorTarificador } from '../../errores.ts'
import { abrirNuevaAlta } from './entrada.ts'
import { login, sesionSirve } from './comunidades.ts'

/** Flag de registro: apagado por defecto. Nada lo enciende en producción. */
export const RC_PYME_ACTIVO = false

/** Hueco declarado: falta un mapa de pantalla. NO transitorio → `error_definitivo`, no se reintenta. */
export class ErrorMapaIncompleto extends ErrorTarificador {
  constructor(que: string) {
    super('portal', `allianz/rc-pyme: mapa incompleto: faltan ${que}`)
    this.name = 'ErrorMapaIncompleto'
  }
}

// ───────────────────────── lector de primas (puro) ─────────────────────────

/** Inputs readonly de `#tarifaViewForm` en orden de documento (sin id): neta 0-5 · impuestos 6-11 · total 12-17 · única 24-26. */
export const N_INPUTS_TARIFA = 27
export const IDX_PRIMA_NETA_ANUAL = 0
export const IDX_IMPUESTOS_ANUAL = 6
export const IDX_PRIMA_TOTAL_ANUAL = 12

export type PrimasTarifaRcPyme = { primaNetaAnualEur: number; impuestosAnualEur: number; primaTotalAnualEur: number }

/**
 * Valores (texto) de los 27 inputs → primas anuales. Fail-closed: otro nº de inputs (la pantalla cambió),
 * un importe no parseable o neta+impuestos ≠ total (±0,02 €) → error `portal`; nunca 0 ni «lo más parecido».
 */
export function primasDesdeValores(valores: readonly string[]): PrimasTarifaRcPyme {
  if (valores.length !== N_INPUTS_TARIFA) {
    throw new ErrorTarificador('portal', `allianz/rc-pyme: la tarifa trae ${valores.length} inputs de prima y se esperaban ${N_INPUTS_TARIFA}`)
  }
  const leer = (i: number, que: string): number => {
    const n = importeEs(valores[i])
    if (n === null) throw new ErrorTarificador('portal', `allianz/rc-pyme: ${que} ilegible en la tarifa («${String(valores[i]).slice(0, 20)}»)`)
    return n
  }
  const neta = leer(IDX_PRIMA_NETA_ANUAL, 'prima neta anual')
  const imp = leer(IDX_IMPUESTOS_ANUAL, 'impuestos anuales')
  const total = leer(IDX_PRIMA_TOTAL_ANUAL, 'prima total anual')
  if (Math.abs(neta + imp - total) > 0.02) {
    throw new ErrorTarificador('portal', `allianz/rc-pyme: la tarifa no cuadra (neta ${neta} + impuestos ${imp} ≠ total ${total})`)
  }
  return { primaNetaAnualEur: neta, impuestosAnualEur: imp, primaTotalAnualEur: total }
}

/** Locator de los inputs de prima: readonly, visibles de tipo texto, dentro de `#tarifaViewForm` (sin depender de ids). */
export function inputsTarifa(raiz: Pick<Page, 'locator'>): Locator {
  return raiz.locator('#tarifaViewForm input[readonly]:not([type="hidden"])')
}

/** Lee las primas anuales de la pantalla de tarifa YA calculada. Solo lectura. */
export async function leerPrimasTarifa(raiz: Pick<Page, 'locator'>): Promise<PrimasTarifaRcPyme> {
  const valores = await inputsTarifa(raiz).evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value ?? ''))
  return primasDesdeValores(valores)
}

// ───────────────────────── flujo (con huecos) ─────────────────────────

/** HUECO: faltan las pantallas de «Datos básicos» (td#menu1): actividad, facturación, empleados, límites, ámbito, siniestros. */
export async function rellenarDatosBasicos(_page: Page, _riesgo: FormularioRC, _ctx: ContextoPortal): Promise<never> {
  throw new ErrorMapaIncompleto('Datos básicos')
}

/**
 * HUECO tras Datos básicos: «Calcular»/retarificar. `#btnRetarifa` aparece 2 veces: hay que anclarlo por sección
 * (sin mapa de esa sección aún) y pulsarlo SOLO con `ctx.pulsar()`.
 */
export async function calcularRcPyme(_page: Page, _ctx: ContextoPortal): Promise<never> {
  throw new ErrorMapaIncompleto('la pantalla de Calcular')
}

export const allianzRcPyme = {
  compania: 'allianz',
  ramo: 'rc_pyme',
  credencial: 'ALLIANZ_EPAC',
  version: '0.1.0',
  async tarificar(page: Page, riesgo: FormularioRC, ctx: ContextoPortal): Promise<never> {
    if (!(ctx.sesionReutilizada && (await sesionSirve(page, ctx)))) await login(page, ctx)
    await ctx.trasLogin()
    // TODO(capturas): nombre exacto de la tarjeta de RC PYME en la pestaña Empresas del modal.
    await abrirNuevaAlta(page, ctx, { pestana: 'Empresas', producto: 'RC PYME' })
    await rellenarDatosBasicos(page, riesgo, ctx)
    // Siguiente (cuando haya mapa): calcularRcPyme → leerPrimasTarifa → OfertaNormalizada.
    return calcularRcPyme(page, ctx)
  },
} as const
