// Sello del ALTA DE UN LEAD leído de un documento (27/09/2026).
//
// Caso: Alberto sube por Telegram la póliza que un lead tiene con otra compañía y dice «ábrele
// oportunidad». Plataforma necesita crear la ficha con el DNI del tomador, pero el DNI NO cruza los
// puertos de operador (ver `leer-documento` y `cliente`). Solución: `leer-documento?tomador=1` devuelve
// el nombre y un SELLO opaco —el alta cifrada con la clave PII de asegura— y plataforma lo devuelve tal
// cual a `POST /api/operador/cliente`. El DNI solo existe en claro dentro de asegura.
import { decryptField, encryptField } from '@central/module-seguros-pii'
import type { AltaDesdeDocumento } from '@central/module-seguros'

/** Lo que tarda en caducar: el botón de Telegram dura 15 minutos; un día da margen sin dejarlo vivo. */
export const HORAS_SELLO = 24
const PROPOSITO = 'alta-lead'

type Contenido = { p: string; v: 1; t: number; a: AltaDesdeDocumento }

export function sellarAltaLead(a: AltaDesdeDocumento, ahora = Date.now()): string {
  const c: Contenido = { p: PROPOSITO, v: 1, t: ahora, a }
  const s = encryptField(JSON.stringify(c))
  // Sin clave PII `encryptField` devuelve el texto tal cual: eso sería el DNI en claro camino de plataforma.
  if (!s.startsWith('v1:')) throw new Error('sin clave PII: no se sella')
  return s
}

/** El contenido ya descifrado → el alta, o `null` si no es un sello de alta, está mal o caducó. */
export function leerContenidoSello(json: string, ahora = Date.now()): AltaDesdeDocumento | null {
  let c: unknown
  try { c = JSON.parse(json) } catch { return null }
  if (typeof c !== 'object' || c === null) return null
  const o = c as Partial<Contenido>
  if (o.p !== PROPOSITO || o.v !== 1 || typeof o.t !== 'number') return null
  if (o.t > ahora + 60_000 || ahora - o.t > HORAS_SELLO * 3_600_000) return null
  const a = o.a
  if (!a || typeof a.nombre !== 'string' || a.nombre.trim() === '') return null
  return a
}

export function abrirSelloAltaLead(sello: string, ahora = Date.now()): AltaDesdeDocumento | null {
  // `decryptField` devuelve tal cual lo que no empieza por `v1:`: un JSON en claro pasaría por sello.
  if (!sello.startsWith('v1:')) return null
  let json: string
  try { json = decryptField(sello) } catch { return null }
  return leerContenidoSello(json, ahora)
}
