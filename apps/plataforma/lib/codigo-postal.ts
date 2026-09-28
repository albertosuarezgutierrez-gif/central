/**
 * Código postal → municipio(s). Para que al teclear el CP la ciudad salga sola
 * y, si el CP lo comparten varios municipios, se elija entre ellos.
 *
 * Tabla `municipios-por-cp.json` (11.254 CP, ~300 KB, SOLO servidor: el cliente
 * pregunta a `/api/correduria/codigo-postal`). Fuente: listado CP↔municipio INE
 * (github.com/inigoflores/ds-codigos-postales-ine-es) + 206 CP que solo trae el
 * de CNIG (inigoflores/ds-codigos-postales, nombre por codeforspain/
 * ds-organizacion-administrativa). Artículos pospuestos ya reordenados
 * («Pobla de Massaluca, La» → «La Pobla de Massaluca»).
 *
 * `null` = el CP no está en la tabla (o no es un CP): «no lo sé», y la ciudad
 * se escribe a mano. Nunca `[]`.
 */
import tabla from './municipios-por-cp.json'

const TABLA = tabla as Record<string, string>

export function municipiosPorCp(cp: string | null | undefined): string[] | null {
  const s = (cp ?? '').trim()
  if (!/^\d{5}$/.test(s)) return null
  const v = TABLA[s]
  return v ? v.split('|') : null
}
