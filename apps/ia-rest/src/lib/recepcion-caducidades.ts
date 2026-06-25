// Lógica PURA FEFO (First-Expired-First-Out): separa lo caducado de lo que caduca
// pronto. Sin dependencias → testeable con `node --test`.

export interface FilaCad { producto: string; caducidad: string | null; [k: string]: unknown }
export interface ResultadoFEFO<T> { caducados: T[]; porCaducar: T[]; total: number }

/** Clasifica filas por caducidad respecto a `hoy` (YYYY-MM-DD) y un umbral en días. */
export function clasificarCaducidades<T extends FilaCad>(filas: T[], hoy: string, dias = 3): ResultadoFEFO<T> {
  const hoyMs = Date.parse(hoy + 'T00:00:00Z')
  const umbralMs = hoyMs + dias * 86_400_000
  const ms = (f: T) => Date.parse(String(f.caducidad) + 'T00:00:00Z')
  const conFecha = filas.filter(f => f.caducidad && !isNaN(ms(f)))
  const caducados = conFecha.filter(f => ms(f) < hoyMs).sort((a, b) => ms(a) - ms(b))
  const porCaducar = conFecha.filter(f => ms(f) >= hoyMs && ms(f) <= umbralMs).sort((a, b) => ms(a) - ms(b))
  return { caducados, porCaducar, total: caducados.length + porCaducar.length }
}
