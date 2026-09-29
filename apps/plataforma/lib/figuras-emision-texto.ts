// Cómo se cuenta el 409 `confirmar_figuras` de asegura (29/09/2026): la variante que se emite cambia
// las personas o el CP del riesgo respecto a la primera. PURO y sin dependencias de Node: lo usan la
// pantalla de emisión (componente de cliente) y el Telegram del asistente. Una sola forma de decirlo.
import type { CambioFiguras, CampoFigura, FiguraExigida } from './retarificar-asegura.ts'

export const ETIQUETA_CAMPO_FIGURA: Record<CampoFigura, string> = {
  tomador: 'Tomador',
  propietario: 'Propietario',
  conductor_habitual: 'Conductor habitual',
  conductor_ocasional: 'Conductor ocasional',
  cp: 'CP de circulación',
}

/**
 * El texto de cada casilla. El conductor es el conductor habitual REAL de la variante que se emite
 * (`conductorHabitual`, lo manda asegura aunque ese papel no cambie): con otro tomador y el mismo
 * conductor, «el nuevo tomador conduce» sería confirmar algo falso. Sin nombre, se dice sin nombre.
 */
export function textoCasillaFigura(exigida: FiguraExigida, cambios: CambioFiguras[], conductorHabitual: string | null = null): string {
  const despues = (campo: CampoFigura) => {
    const v = cambios.find((c) => c.campo === campo)?.despues
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
  }
  if (exigida === 'conductor') {
    const nombre = conductorHabitual?.trim() || despues('conductor_habitual')
    return nombre
      ? `${nombre} conduce el vehículo de forma habitual.`
      : 'La persona declarada como conductor habitual conduce el vehículo de forma habitual.'
  }
  if (exigida === 'cp') {
    const cp = despues('cp')
    return cp
      ? `El vehículo duerme y circula habitualmente en el CP ${cp}.`
      : 'El vehículo duerme y circula habitualmente en el CP declarado.'
  }
  return 'Se lo he explicado al cliente y lo confirma.'
}

/** ¿Están marcadas TODAS las exigidas? Sin exigidas no hay nada que confirmar → false (no se emite a ciegas). */
export function figurasCompletas(exigidas: FiguraExigida[], marcadas: ReadonlySet<string>): boolean {
  return exigidas.length > 0 && exigidas.every((e) => marcadas.has(e))
}
