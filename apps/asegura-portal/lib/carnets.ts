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

import { PORTAL_PUENTE_TIEMPO_MS } from './puente-config'

function puente(): { base: string; secret: string } | null {
  const base = process.env.ASEGURA_PUENTE_URL
  const secret = process.env.ASEGURA_PORTAL_PUENTE_SECRET
  if (!base || !secret) return null
  return { base: base.replace(/\/+$/, ''), secret }
}

/**
 * Los carnés en ventana de esta identidad, ya listos para `avisosDe()`.
 *
 * **Lanza** si no se ha podido mirar (puente caído, sin configurar, varias
 * fichas, fecha de nacimiento ilegible): quien llama lo declara en
 * `fuentesIlegibles`, igual que `reparosDeMisDatos()`. `sin_ficha` devuelve
 * `[]` — no es que no se sepa, es que no hay ficha nuestra con carnés que mirar.
 */
export async function carnetsDeIdentidad(identidadId: string): Promise<CarnetParaAviso[]> {
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
    const j = (await res.json().catch(() => null)) as Record<string, unknown> | null
    const estado = typeof j?.estado === 'string' ? j.estado : null
    if (res.ok && estado === 'ok') {
      const crudo = Array.isArray(j?.carnets) ? j!.carnets : []
      return crudo
        .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
        .filter((c) => typeof c.id === 'string' && typeof c.tipo === 'string' && typeof c.fechaCaducidad === 'string')
        .map((c) => ({ id: c.id as string, tipo: c.tipo as string, fechaCaducidad: c.fechaCaducidad as string }))
    }
    if (estado === 'sin_ficha') return []
    throw new Error(`puente_${res.status}_${estado ?? 'sin_estado'}`)
  } finally {
    clearTimeout(reloj)
  }
}
