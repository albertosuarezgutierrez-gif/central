/**
 * Subtítulo de la tarjeta «Oportunidades» de la ficha: «N abiertas · ~X€/año».
 *
 * Pura y sin JSX (test con `node --test`). La prima sale del dato que la ficha YA carga: la prima
 * de la póliza de competencia/volcado, la que paga hoy en la oportunidad anotada o la que declaró
 * el cliente. Tres estados, nunca un 0 inventado:
 *   · ninguna con prima conocida → solo «N abiertas».
 *   · todas con prima            → «~X€/año» (suma de lo conocido).
 *   · algunas sí y otras no      → «≥X€/año» (suelo: lo que falta puede sumar más).
 *
 * ¿Es anual lo que se suma? Investigado el 18/10/2026 (no se anualiza NADA, y por qué):
 *   · `poliza.prima` = `primaConRecibos(prima_bruta ?? prima_anual)`: las dos columnas del EIAC son la
 *     prima ANUAL aunque la póliza se fraccione (SQL de solo lectura en `seguros.polizas`: semestrales con
 *     prima_bruta 255,22 y recibos de 128,56; trimestrales/semestrales vivas con media ≈ las anuales). El
 *     importe de un recibo solo entra si `fraccionamiento='anual'` (`vencimientos.ts::primaConRecibos`).
 *     Multiplicar por `fraccionamiento` sería contar dos veces el fraccionamiento: PROHIBIDO.
 *   · `oportunidad.prima` (`oportunidades.prima_bruta`) nace de esa misma prima de póliza, de un documento
 *     leído (`primaAnual`) o tecleada; la ficha NO recibe ninguna periodicidad suya (la columna
 *     `oportunidades.fraccionamiento` no sale por el puerto), así que no hay con qué corregirla.
 *   · `declarada.primaAnual` es lo que el cliente declara en el portal, también sin periodicidad.
 * Si algún día una fuente trae importe de recibo o periodicidad propia, se anualiza AQUÍ, en la fuente que la
 * traiga, y esa prima sin periodicidad fiable pasa a «desconocida» (cuenta para «≥», no suma).
 * Una prima 0 o negativa no es dato (un volcado sin importe se guarda como 0): cuenta como desconocida.
 */
import { eur } from '../dinero.ts'
import type { SeguroCliente } from './seguros-cliente.ts'

/** Prima anual conocida de una oportunidad, o `null` si no consta. */
export function primaDeOportunidad(s: SeguroCliente): number | null {
  const valida = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)
  // Una prima anotada 0/inválida NO tapa la conocida de la póliza: cae a la siguiente fuente válida.
  if (s.clase === 'poliza') return valida(s.oportunidad?.prima) ?? valida(s.poliza.prima)
  if (s.clase === 'oportunidad') return valida(s.oportunidad.prima)
  return valida(s.declarada.primaAnual)
}

const abiertas = (n: number) => `${n} ${n === 1 ? 'abierta' : 'abiertas'}`

/** `null` en la lista = no se pudieron leer las oportunidades: no se pinta nada (no se inventa). */
export function subtituloOportunidades(lista: readonly SeguroCliente[] | null): string | null {
  if (lista === null) return null
  if (lista.length === 0) return 'ninguna abierta'
  const primas = lista.map(primaDeOportunidad).filter((x): x is number => x !== null)
  if (primas.length === 0) return abiertas(lista.length)
  const suma = Math.round(primas.reduce((a, b) => a + b, 0) * 100) / 100
  const signo = primas.length === lista.length ? '~' : '≥'
  return `${abiertas(lista.length)} · ${signo}${eur(suma)}/año`
}
