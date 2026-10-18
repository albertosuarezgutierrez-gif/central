/**
 * Subtítulo de la tarjeta «Oportunidades» de la ficha: «N abiertas · ~X€/año».
 *
 * Pura y sin JSX (test con `node --test`). La prima sale del dato que la ficha YA carga: la prima
 * de la póliza de competencia/volcado, la que paga hoy en la oportunidad anotada o la que declaró
 * el cliente. Tres estados, nunca un 0 inventado:
 *   · ninguna con prima conocida → solo «N abiertas».
 *   · todas con prima            → «~X€/año» (suma de lo conocido).
 *   · algunas sí y otras no      → «≥X€/año» (suelo: lo que falta puede sumar más).
 * Una prima 0 o negativa no es dato (un volcado sin importe se guarda como 0): cuenta como desconocida.
 */
import { eur } from '../dinero.ts'
import type { SeguroCliente } from './seguros-cliente.ts'

/** Prima anual conocida de una oportunidad, o `null` si no consta. */
export function primaDeOportunidad(s: SeguroCliente): number | null {
  const v = s.clase === 'poliza' ? (s.oportunidad?.prima ?? s.poliza.prima)
    : s.clase === 'oportunidad' ? s.oportunidad.prima
      : s.declarada.primaAnual
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null
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
