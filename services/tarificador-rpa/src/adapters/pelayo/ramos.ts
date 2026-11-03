// Pelayo — adaptadores de TARIFICACIÓN (esqueleto, 03/11/2026). Ningún ramo implementado todavía: hoy solo existe la ENTRADA del
// explorador (`pelayo/entrada.ts`). `tarificar` lanza un error claro SIN abrir el portal. NO se registran en `adapters/index.ts` todavía
// (se registrarán bajo `PELAYO_ACTIVO`, APAGADO, cuando haya un ramo real). TARIFICAR ≠ EMITIR: cuando se implementen, pasan por el guard como el resto, sin relajar nada.

import type { FormularioAuto, FormularioHogar, ResultadoAdaptador } from '@central/module-tarificacion'
import type { Page } from 'playwright'
import type { ContextoPortal } from '../../adaptador.ts'
import { ErrorTarificador } from '../../errores.ts'
import type { AdaptadorHogar, AdaptadorVehiculo } from '../../ramo.ts'

/** Flag de registro de los adaptadores de Pelayo. APAGADO: lo enciende Alberto cuando haya un ramo implementado. */
export const PELAYO_ACTIVO: boolean = false
/** Credencial: fly secrets `CRED_PELAYO_MEDIADORES_USER` / `CRED_PELAYO_MEDIADORES_PASS` (app asegura-tarificador). */
export const CREDENCIAL_PELAYO = 'PELAYO_MEDIADORES'
export const VERSION_PELAYO = '0.0.1'

/** Estado de cada ramo de Pelayo (lista cerrada). */
export const RAMOS_PELAYO: Readonly<Record<'auto' | 'hogar', 'no_implementado'>> = Object.freeze({ auto: 'no_implementado', hogar: 'no_implementado' })

/** El error de un ramo sin implementar (tipo `datos`: no reintentable, no abre el navegador). */
export function errorRamoNoImplementadoPelayo(ramo: string): ErrorTarificador {
  return new ErrorTarificador('datos', `Pelayo: ramo ${String(ramo).slice(0, 30)} aún no implementado`)
}

export const pelayoAuto: AdaptadorVehiculo = Object.freeze({
  compania: 'pelayo',
  ramo: 'auto' as const,
  credencial: CREDENCIAL_PELAYO,
  version: VERSION_PELAYO,
  async tarificar(_page: Page, _form: FormularioAuto, _ctx: ContextoPortal): Promise<ResultadoAdaptador> {
    throw errorRamoNoImplementadoPelayo('auto')
  },
})

export const pelayoHogar: AdaptadorHogar = Object.freeze({
  compania: 'pelayo',
  ramo: 'hogar' as const,
  credencial: CREDENCIAL_PELAYO,
  version: VERSION_PELAYO,
  async tarificar(_page: Page, _form: FormularioHogar, _ctx: ContextoPortal): Promise<ResultadoAdaptador> {
    throw errorRamoNoImplementadoPelayo('hogar')
  },
})
