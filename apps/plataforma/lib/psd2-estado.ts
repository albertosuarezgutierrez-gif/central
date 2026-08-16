// lib/psd2-estado.ts — estado VIVO del feed bancario PSD2 para el panel /banca.
// Junta las conexiones vinculadas (consentimiento + avisos del último sync, persistidos por
// lib/psd2.ts en conexiones_banco.ultimo_avisos) con el último movimiento importado por cuenta,
// y decide el semáforo con el helper puro lib/psd2-semaforo.ts.

import { prisma } from './db'
import { semaforoFeed, fechaCaducidadConsent, diasEntre, type EstadoFeed } from './psd2-semaforo'

export type FeedPsd2 = {
  estado: EstadoFeed
  cuentas: Array<{ banco: string | null; mascara: string | null; ultimoMov: string | null; diasSinMov: number | null }>
  consentCreada: string
  consentCaduca: string
  ultimoSync: string | null
}

export async function getEstadoFeedPsd2(cuentaId: string): Promise<FeedPsd2 | null> {
  const conns = await prisma.$queryRaw<Array<{ created_at: Date; ultimo_sync: Date | null; ultimo_avisos: unknown }>>`
    SELECT created_at, ultimo_sync, ultimo_avisos FROM conexiones_banco
    WHERE cuenta_id = ${cuentaId}::uuid AND estado = 'vinculada'
    ORDER BY created_at
  `
  if (conns.length === 0) return null

  const cuentas = await prisma.$queryRaw<Array<{ banco: string | null; iban_mascara: string | null; ultimo_mov: Date | null }>>`
    SELECT cb.banco, cb.iban_mascara, MAX(mb.fecha_operacion) AS ultimo_mov
    FROM cuentas_bancarias cb
    JOIN movimientos_bancarios mb ON mb.cuenta_bancaria_id = cb.id AND mb.origen = 'psd2'
    WHERE cb.cuenta_id = ${cuentaId}::uuid AND cb.oculta = false
    GROUP BY cb.id, cb.banco, cb.iban_mascara
    ORDER BY cb.banco, cb.iban_mascara
  `

  const hoyISO = new Date().toISOString().slice(0, 10)
  // Avisos: se juntan los de todas las conexiones. null SOLO si ninguna conexión reporta aún
  // (columna anterior al cambio) — un [] real significa «último sync limpio».
  let avisos: string[] | null = null
  for (const c of conns) {
    if (c.ultimo_avisos == null) continue
    const arr = Array.isArray(c.ultimo_avisos) ? c.ultimo_avisos.map(String) : []
    avisos = [...(avisos ?? []), ...arr]
  }

  const consentCreada = conns[0].created_at.toISOString().slice(0, 10)
  const ultimoMovMax = cuentas.reduce<string | null>((acc, c) => {
    const iso = c.ultimo_mov ? c.ultimo_mov.toISOString().slice(0, 10) : null
    return iso && (!acc || iso > acc) ? iso : acc
  }, null)
  const ultimoSyncMax = conns.reduce<Date | null>((acc, c) => (c.ultimo_sync && (!acc || c.ultimo_sync > acc) ? c.ultimo_sync : acc), null)

  return {
    estado: semaforoFeed({ hoyISO, ultimoMovISO: ultimoMovMax, avisos, consentCreadaISO: consentCreada }),
    cuentas: cuentas.map(c => {
      const iso = c.ultimo_mov ? c.ultimo_mov.toISOString().slice(0, 10) : null
      return { banco: c.banco, mascara: c.iban_mascara, ultimoMov: iso, diasSinMov: iso ? diasEntre(iso, hoyISO) : null }
    }),
    consentCreada,
    consentCaduca: fechaCaducidadConsent(consentCreada),
    ultimoSync: ultimoSyncMax ? ultimoSyncMax.toISOString() : null,
  }
}
