/**
 * Marca un dispositivo como tráfico INTERNO de GA4 (Alberto y su equipo), sin depender de la
 * IP: Alberto navega detrás de Cloudflare WARP/Private Relay (medido 29/09/2026), así que un
 * filtro por IP ni le excluye a él ni es seguro para los demás.
 *
 * Se activa una vez por navegador visitando `grupoasegura.es/?interno=1` y se quita con
 * `?interno=0`. Vive en localStorage de ESE navegador: no viaja a ningún servidor y solo
 * cambia un parámetro (`traffic_type`) que GA4 usa para su filtro «Internal Traffic».
 */
export const CLAVE_INTERNO = 'asegura_trafico_interno'

type Almacen = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** Aplica el `?interno=` de la URL (si lo hay) y devuelve si este navegador es interno. Nunca lanza. */
export function esDispositivoInterno(search: string, almacen: Almacen | null): boolean {
  if (!almacen) return false
  try {
    const orden = new URLSearchParams(search).get('interno')
    if (orden === '1') almacen.setItem(CLAVE_INTERNO, '1')
    else if (orden === '0') almacen.removeItem(CLAVE_INTERNO)
    return almacen.getItem(CLAVE_INTERNO) === '1'
  } catch {
    return false
  }
}
