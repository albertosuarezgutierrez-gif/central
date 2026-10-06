/**
 * Caducidades de carné de conducir de esta identidad, para la campana de
 * avisos y su correo genérico — vía el puerto ESTRECHO de `apps/asegura`.
 *
 * `cliente_carnets_conducir.fecha_carnet` y `clientes.fecha_nacimiento` van
 * cifrados con `PII_ENCRYPTION_KEY`, que este portal NO tiene (mismo motivo
 * que `mis-datos.ts` con la dirección): asegura calcula la caducidad y solo
 * cruza el puente el resultado (tipo + fecha de caducidad), nunca las dos
 * fechas de origen.
 */
import type { CarnetParaAviso } from '@central/module-seguros-portal'

import { carnetsParaAviso, interpretarCarnets, type TitularCarnets } from './carnets-titulares'
import { PORTAL_PUENTE_TIEMPO_MS } from './puente-config'

function puente(): { base: string; secret: string } | null {
  const base = process.env.ASEGURA_PUENTE_URL
  const secret = process.env.ASEGURA_PORTAL_PUENTE_SECRET
  if (!base || !secret) return null
  return { base: base.replace(/\/+$/, ''), secret }
}

/**
 * Los carnés de esta identidad, AGRUPADOS POR TITULAR (ficha dueña + nombre). Con varias fichas
 * vinculadas ya no es «no se ha podido mirar»: vienen separados (`carnets-titulares.ts`).
 *
 * **Lanza** si no se ha podido mirar (puente caído, sin configurar, fecha de nacimiento ilegible):
 * quien llama lo declara como fuente ilegible. `sin_ficha` devuelve `[]`.
 */
export async function carnetsPorTitularDeIdentidad(identidadId: string): Promise<TitularCarnets[]> {
  const p = puente()
  if (!p) throw new Error('sin_puente')

  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), PORTAL_PUENTE_TIEMPO_MS)
  try {
    const res = await fetch(`${p.base}/api/portal/carnets?identidadId=${encodeURIComponent(identidadId)}`, {
      headers: { authorization: `Bearer ${p.secret}` },
      cache: 'no-store',
      signal: control.signal,
    })
    const j: unknown = await res.json().catch(() => null)
    const titulares = interpretarCarnets(res.status, j)
    if (titulares === null) {
      const estado = typeof j === 'object' && j !== null && typeof (j as { estado?: unknown }).estado === 'string' ? (j as { estado: string }).estado : null
      throw new Error(`puente_${res.status}_${estado ?? 'sin_estado'}`)
    }
    return titulares
  } finally {
    clearTimeout(reloj)
  }
}

/**
 * Los carnés de esta identidad, ya listos para `avisosDe()` y la precarga de recordatorios. Con varios
 * titulares cada uno lleva el nombre del suyo (`titular`), para no decir «tu carné» del de otra persona.
 * Lanza igual que `carnetsPorTitularDeIdentidad`.
 */
export async function carnetsDeIdentidad(identidadId: string): Promise<CarnetParaAviso[]> {
  return carnetsParaAviso(await carnetsPorTitularDeIdentidad(identidadId))
}
