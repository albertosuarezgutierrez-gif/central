// Registro PURO de ramos del riesgo (fase 0 de docs/superpowers/specs/2026-10-10-riesgo-unificado-todos-los-ramos-design.md).
// Dice, por ramo, cómo se pide precio HOY. No cambia conducta: refleja lo que ya hay y un guardián
// (registro-ramos.test.ts) lo cruza con `ramoVariante()`/`ramoCotizadorEmbebido()`/`claveDatosDeRamo()`/`rolesDelRamo()`.
// Los roles y la clave de datos NO se copian: se leen de module-seguros (fuente única).

import { claveDatosDeRamo, rolesDelRamo, type ClaveDatosRiesgo, type RolFigura } from '@central/module-seguros'

export const RAMOS_RIESGO = ['auto', 'moto', 'hogar', 'vida', 'salud', 'decesos', 'comercio', 'rc', 'comunidades', 'patinete', 'otros'] as const
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
// 13/10/2026: los SEIS ramos con cotizador Avant2 en el repo (auto, moto, hogar, decesos, salud, vida) ya son `embebido`.
// Comercio y RC: `fuera` (Avant2 no tiene endpoint y no hay bot activo); comunidades: `bots` (RPA Allianz). Sin Avant2,
// la pantalla pinta figuras + datos del riesgo + Parrilla (lado bot) y el aviso `AVISO_SIN_AVANT2`.
const COTIZADOR: Record<RamoRiesgo, TipoCotizador> = {
  auto: 'embebido', moto: 'embebido', hogar: 'embebido', vida: 'embebido', salud: 'embebido', decesos: 'embebido',
  comercio: 'fuera', rc: 'fuera', comunidades: 'bots', otros: 'fuera',
  // Patinete / VMP (28/10/2026): ni Avant2 ni bot activo. Se cotiza fuera; datos en `datosRiesgoLibre`.
  patinete: 'fuera',
}
const COMPARABLE: Record<RamoRiesgo, boolean> = {
  auto: true, moto: true, hogar: true, vida: true, salud: true, decesos: true, comercio: false, rc: false, comunidades: false, patinete: false, otros: false,
}

export const REGISTRO_RAMOS: Readonly<Record<RamoRiesgo, DefinicionRamo>> = Object.fromEntries(
  RAMOS_RIESGO.map((ramo) => [ramo, { ramo, roles: rolesDelRamo(ramo), claveObjeto: claveDatosDeRamo(ramo), cotizador: COTIZADOR[ramo], comparable: COMPARABLE[ramo] }]),
) as Record<RamoRiesgo, DefinicionRamo>

/** El ramo del registro, o `null` si es un tipo que no conocemos (nunca se inventa una definición). */
export function definicionDeRamo(ramo: string | null | undefined): DefinicionRamo | null {
  return typeof ramo === 'string' && (RAMOS_RIESGO as readonly string[]).includes(ramo) ? REGISTRO_RAMOS[ramo as RamoRiesgo] : null
}

/** ¿El ramo tiene cotizador Avant2 en el repo? (= `embebido` o `pantalla` en el registro; un tipo desconocido, no). */
export function tieneAvant2(ramo: string | null | undefined): boolean {
  const d = definicionDeRamo(ramo)
  return d !== null && (d.cotizador === 'embebido' || d.cotizador === 'pantalla')
}

/**
 * PURA (13/10/2026). El aviso del bloque «Pedir precio» de un ramo SIN cotizador Avant2 (comercio, RC, comunidades,
 * otros y cualquier tipo de oportunidad fuera del registro: accidentes, empresas…). `null` = el ramo sí tiene Avant2.
 * Codeoscopic confirmó (21/09/2026, docs/TARIFICADOR-MATRIZ.md) que RC, comercio y comunidades no existen en su API:
 * aquí no se inventa cotizador. `hayBots` = la pantalla tiene algún bot de compañía para el ramo (`companiasDisponibles`).
 */
export function avisoSinAvant2(ramo: string | null | undefined, e: { hayBots: boolean }): string | null {
  if (tieneAvant2(ramo)) return null
  return e.hayBots
    ? 'Sin precio automático por Avant2: Codeoscopic no tiene tarifa de este ramo. El precio lo piden los bots de compañía («Presupuestos de compañías», más abajo) y la parrilla lo compara.'
    : 'Sin precio automático por Avant2: Codeoscopic no tiene tarifa de este ramo y no hay bot de compañía activo. Se cotiza fuera y el precio se anota como oferta; intervinientes y datos del riesgo quedan en el expediente.'
}
