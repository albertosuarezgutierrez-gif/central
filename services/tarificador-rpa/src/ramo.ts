// Runner tipado por ramo (13/10/2026). El registro guarda adaptadores de CUALQUIER ramo; este módulo (puro, sin
// Playwright ni red) los estrecha por su `ramo` declarado y valida el riesgo del trabajo con el validador DE ESE RAMO:
//   · comunidades → `validarRiesgoComunidad`  · auto / moto → `validarFormularioAuto`  · hogar → `validarFormularioHogar`.
// Sin casts: el `switch` sobre `adaptador.ramo` estrecha la unión discriminada. Un ramo sin validador es un error de
// compilación (exhaustividad), no un trabajo que se cuela con otra forma de riesgo.
import {
  faltanParaTarificar,
  mensajeFaltan,
  validarFormularioAuto,
  validarFormularioHogar,
  validarRiesgoComunidad,
  type FormularioAuto,
  type FormularioHogar,
  type ResultadoAdaptador,
  type RiesgoComunidad,
  type TarificadorAdapter,
} from '@central/module-tarificacion'
import type { Page } from 'playwright'
import type { AdaptadorPortal, ContextoPortal } from './adaptador.ts'

/** Lo común a todo adaptador del worker (credencial, versión, sesión, emisión), sin atar el tipo de riesgo. */
type ExtrasAdaptador = Pick<AdaptadorPortal, 'credencial' | 'version' | 'sesion' | 'codigoSms' | 'emision'>

export type AdaptadorComunidades = AdaptadorPortal
export type AdaptadorVehiculo = TarificadorAdapter<Page, FormularioAuto, ContextoPortal> & ExtrasAdaptador & { readonly ramo: 'auto' | 'moto' }
/** Hogar (14/10/2026): riesgo `FormularioHogar`. Primer adaptador: Allianz ePAC, tras `ALLIANZ_HOGAR_ACTIVO` (apagado). */
export type AdaptadorHogar = TarificadorAdapter<Page, FormularioHogar, ContextoPortal> & ExtrasAdaptador & { readonly ramo: 'hogar' }
/** Lo que guarda el registro del worker. */
export type AdaptadorRegistrado = AdaptadorComunidades | AdaptadorVehiculo | AdaptadorHogar

export type TrabajoPreparado =
  | {
      ok: true
      /** Solo comunidades: la emisión asistida (`emision.ts`) trabaja con `RiesgoComunidad`. `null` = ramo sin emisión. */
      comunidad: { adaptador: AdaptadorComunidades; riesgo: RiesgoComunidad } | null
      /** Tarificar con el riesgo ya validado y del tipo que pide el adaptador. */
      tarificar: (page: Page, ctx: ContextoPortal) => Promise<ResultadoAdaptador>
    }
  | { ok: false; errores: string[] }

/**
 * Valida el riesgo (crudo, de asegura) con el validador del ramo del adaptador y lo deja listo para tarificar. Red FINAL
 * (15/10/2026): tras la forma, los datos obligatorios del bot (`faltanParaTarificar`, la misma fuente que el encolado de
 * asegura) sobre el riesgo YA con lo de la ficha; si falta algo, o el bot no declara qué necesita, no se abre el navegador.
 */
export function prepararTrabajo(adaptador: AdaptadorRegistrado, crudo: unknown, hoy: Date = new Date()): TrabajoPreparado {
  const p = prepararForma(adaptador, crudo, hoy)
  if (!p.ok) return p
  const faltan = faltanParaTarificar(adaptador.compania, adaptador.ramo, crudo)
  if (faltan === null) return { ok: false, errores: [`${adaptador.compania}/${adaptador.ramo} no declara qué datos necesita para tarificar (module-tarificacion obligatorios.ts)`] }
  if (faltan.length) return { ok: false, errores: [mensajeFaltan(faltan)] }
  return p
}

function prepararForma(adaptador: AdaptadorRegistrado, crudo: unknown, hoy: Date): TrabajoPreparado {
  switch (adaptador.ramo) {
    case 'comunidades': {
      const v = validarRiesgoComunidad(crudo)
      if (!v.ok) return { ok: false, errores: v.errores }
      return { ok: true, comunidad: { adaptador, riesgo: v.riesgo }, tarificar: (page, ctx) => adaptador.tarificar(page, v.riesgo, ctx) }
    }
    case 'auto':
    case 'moto': {
      const v = validarFormularioAuto(crudo, hoy)
      if (!v.ok) return { ok: false, errores: v.errores }
      // El adaptador de un ramo solo acepta formularios de ese ramo (el de Allianz lo repite en su `tarificar`).
      if (v.formulario.ramo !== adaptador.ramo) return { ok: false, errores: [`el formulario es de ${v.formulario.ramo} y el adaptador de ${adaptador.ramo}`] }
      return { ok: true, comunidad: null, tarificar: (page, ctx) => adaptador.tarificar(page, v.formulario, ctx) }
    }
    case 'hogar': {
      const v = validarFormularioHogar(crudo, hoy)
      if (!v.ok) return { ok: false, errores: v.errores }
      return { ok: true, comunidad: null, tarificar: (page, ctx) => adaptador.tarificar(page, v.formulario, ctx) }
    }
  }
}
