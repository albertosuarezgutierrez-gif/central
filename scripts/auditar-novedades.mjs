// Extrae los titulares de sesión de `docs/CONTEXTO-SESIONES.md` para el bloque `novedades`
// del panel de arquitectura (/admin → 🗺️ Estructura) y de `docs/ARQUITECTURA.generated.md`.
//
// 🚨 QUÉ ARREGLA (02/09/2026). El auditor los sacaba con `^[-*] \*\*(.+?)\*\*`, que casa
// con CUALQUIER bullet en negrita — y el cuerpo de cada entrada está lleno de ellos. Lo que
// se pintaba como «novedades» no eran entradas, sino fragmentos sueltos de argumentación:
// «La reimplementación era real, no un falso positivo:», «Cablear un valor es lo que deja una
// primitiva sin adoptar:»… todos con la fecha vacía, porque un sub-bullet no la lleva. Y las
// entradas en formato `### ` —el que usan casi todas las sesiones— no salían NUNCA.
//
// El criterio de qué es una entrada y de dónde sale su fecha NO se reimplementa aquí: se
// importa de `rotar-memoria.mjs`, que es quien trocea ese mismo archivo para archivarlo. Dos
// lecturas distintas del mismo documento acaban discrepando, y la que se ve en pantalla sería
// la equivocada.
import { RE_FECHA, textoFechaDe, trocear, ultimaFecha } from './rotar-memoria.mjs'

/** Título legible de una entrada, sin adornos de formato ni la fecha entre paréntesis. */
export function tituloDeEntrada(entrada) {
  const primera = entrada[0]
  if (primera.startsWith('### ')) {
    return primera
      .slice(4)
      .replace(/\((?:[0-3]?\d\/[01]\d(?:\/20\d\d)?)[^)]*\)/, '') // (dd/mm/aaaa) y (…, noche)
      .replace(/\s{2,}/g, ' ')
      .trim()
  }
  // `- **Título (dd/mm/aaaa).** cuerpo…` — la negrita puede envolver a la línea siguiente.
  const bloque = entrada.join('\n')
  const cierre = bloque.indexOf('**', 4)
  const negrita = cierre === -1 ? primera.slice(4) : bloque.slice(4, cierre)
  return negrita
    .replace(/\s*\((?:[0-3]?\d\/[01]\d(?:\/20\d\d)?)[^)]*\)\s*\.?\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Fecha `dd/mm/aaaa` de la cabecera, o '' si no la trae (nunca se mira el cuerpo). */
export function fechaDeEntrada(entrada) {
  const m = ultimaFecha(textoFechaDe(entrada))
  if (!m || !m[3]) return ''
  return `${String(m[1]).padStart(2, '0')}/${m[2]}/${m[3]}`
}

/**
 * Titulares de las `limite` entradas más recientes (el archivo es cronológico descendente).
 * Solo cabeceras de entrada reales: los sub-bullets del cuerpo se ignoran.
 */
export function extraerNovedades(texto, limite = 15) {
  return trocear(texto.split('\n'))
    .slice(0, limite)
    .map(e => ({ titulo: tituloDeEntrada(e), fecha: fechaDeEntrada(e) }))
}

export { RE_FECHA }
