// Cómo se cuenta el 409 `confirmar_figuras` de asegura (29/09/2026): la variante que se emite cambia
// las personas o el CP del riesgo respecto a la primera. PURO y sin dependencias de Node: lo usan la
// pantalla de emisión (componente de cliente) y el Telegram del asistente. Una sola forma de decirlo.
import type { CambioFiguras, CampoFigura, FiguraExigida } from './retarificar-asegura.ts'

export const ETIQUETA_CAMPO_FIGURA: Record<CampoFigura, string> = {
  tomador: 'Tomador',
  propietario: 'Propietario',
  conductor_habitual: 'Conductor habitual',
  cp: 'CP de circulación',
}

/**
 * El texto de cada casilla. El nombre del conductor es el `despues` del conductor habitual; si ese
 * papel no cambia, el del tomador (en la foto de figuras, sin conductor aparte, conduce el tomador).
 * Si no se sabe el nombre, se dice sin nombre — nunca se inventa uno.
 */
export function textoCasillaFigura(exigida: FiguraExigida, cambios: CambioFiguras[]): string {
  const despues = (campo: CampoFigura) => {
    const v = cambios.find((c) => c.campo === campo)?.despues
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
  }
  if (exigida === 'conductor') {
    const nombre = despues('conductor_habitual') ?? despues('tomador')
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
