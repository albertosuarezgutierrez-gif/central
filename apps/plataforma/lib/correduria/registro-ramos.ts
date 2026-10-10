// Registro PURO de ramos del riesgo (fase 0 de docs/superpowers/specs/2026-10-10-riesgo-unificado-todos-los-ramos-design.md).
// Dice, por ramo, cómo se pide precio HOY. No cambia conducta: refleja lo que ya hay y un guardián
// (registro-ramos.test.ts) lo cruza con `ramoVariante()`/`ramoCotizadorEmbebido()`/`claveDatosDeRamo()`/`rolesDelRamo()`.
// Los roles y la clave de datos NO se copian: se leen de module-seguros (fuente única).

import { claveDatosDeRamo, rolesDelRamo, type ClaveDatosRiesgo, type RolFigura } from '@central/module-seguros'

export const RAMOS_RIESGO = ['auto', 'moto', 'hogar', 'vida', 'salud', 'decesos', 'comercio', 'rc', 'comunidades', 'otros'] as const
export type RamoRiesgo = (typeof RAMOS_RIESGO)[number]

/** Cómo se pide precio: `embebido` en la propia pantalla; `pantalla` (transitorio) `…-nuevo`; `bots` y `fuera` sin tarifa CDS. */
export type TipoCotizador = 'embebido' | 'pantalla' | 'bots' | 'fuera'

export interface DefinicionRamo {
  ramo: RamoRiesgo
  roles: readonly RolFigura[]
  claveObjeto: ClaveDatosRiesgo
  cotizador: TipoCotizador
  /**
   * ¿`diferenciasVariante` tiene comparador para el ramo? `false` = «No se puede comparar con la anterior»
   * (null), nunca «Mismos datos» (H1). Espejo de `lineaComparable()` en module-seguros/variantes-riesgo.ts.
   */
  comparable: boolean
}

// Prioridad de cotización (Alberto, 10/10/2026): BOT primero (gratis); Avant2/CDS solo como respaldo y con OK de coste (0,50 €).
// Metadato, no conducta: `cotizador` sigue diciendo lo que hay HOY. Ver docs/TARIFICADOR-MATRIZ.md.
const COTIZADOR: Record<RamoRiesgo, TipoCotizador> = {
  auto: 'embebido', moto: 'embebido', hogar: 'embebido', vida: 'pantalla', salud: 'pantalla', decesos: 'pantalla',
  comercio: 'fuera', rc: 'fuera', comunidades: 'bots', otros: 'fuera',
}
const COMPARABLE: Record<RamoRiesgo, boolean> = {
  auto: true, moto: true, hogar: true, vida: false, salud: false, decesos: false, comercio: false, rc: false, comunidades: false, otros: false,
}

export const REGISTRO_RAMOS: Readonly<Record<RamoRiesgo, DefinicionRamo>> = Object.fromEntries(
  RAMOS_RIESGO.map((ramo) => [ramo, { ramo, roles: rolesDelRamo(ramo), claveObjeto: claveDatosDeRamo(ramo), cotizador: COTIZADOR[ramo], comparable: COMPARABLE[ramo] }]),
) as Record<RamoRiesgo, DefinicionRamo>

/** El ramo del registro, o `null` si es un tipo que no conocemos (nunca se inventa una definición). */
export function definicionDeRamo(ramo: string | null | undefined): DefinicionRamo | null {
  return typeof ramo === 'string' && (RAMOS_RIESGO as readonly string[]).includes(ramo) ? REGISTRO_RAMOS[ramo as RamoRiesgo] : null
}
