// Validación de los botones opcionales de /api/internal/alerta — módulo PURO (sin @/, sin Prisma).
//
// Por qué es restrictivo: ese endpoint lo abren tokens de BAJO privilegio (ALERTA_TOKEN /
// `rutina_tokens`), pensados para que filtrarlos solo permita "mandar un Telegram". Si un token
// filtrado pudiera adjuntar CUALQUIER callback, podría fabricar botones `pago_aprobar:*` o
// `mov_confirmar_*` y convertir un aviso en una acción real al primer toque de Alberto. Por eso:
//   - callbacks SOLO con prefijo `trd_` (propuestas de trading: descartar, nada más),
//   - URLs SOLO https,
//   - tamaño acotado (el teclado de Telegram tampoco admite más).
export type BotonAlerta = { texto: string; url?: string; callback?: string }

const RE_CALLBACK = /^trd_[a-z]{2,12}:[A-Za-z0-9_-]{1,48}$/

/** Devuelve los botones saneados, o null si el payload no es válido (el aviso sale SIN botones). */
export function validarBotones(raw: unknown): BotonAlerta[][] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 3) return null
  const filas: BotonAlerta[][] = []
  for (const fila of raw) {
    if (!Array.isArray(fila) || fila.length === 0 || fila.length > 3) return null
    const botones: BotonAlerta[] = []
    for (const b of fila) {
      if (typeof b !== 'object' || b === null) return null
      const { texto, url, callback } = b as Record<string, unknown>
      if (typeof texto !== 'string' || !texto.trim() || texto.length > 48) return null
      const tieneUrl = typeof url === 'string' && url.length > 0
      const tieneCallback = typeof callback === 'string' && callback.length > 0
      if (tieneUrl === tieneCallback) return null // exactamente uno de los dos
      if (tieneUrl) {
        if (!/^https:\/\/[^\s]+$/.test(url as string) || (url as string).length > 512) return null
        botones.push({ texto, url: url as string })
      } else {
        if (!RE_CALLBACK.test(callback as string)) return null
        botones.push({ texto, callback: callback as string })
      }
    }
    filas.push(botones)
  }
  return filas
}
