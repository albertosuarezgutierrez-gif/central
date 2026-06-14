// Orquestación PSD2 (Fase 6): tras el consentimiento, vuelca las cuentas y movimientos
// de Enable Banking en las MISMAS tablas que la importación manual (cuentas_bancarias /
// movimientos_bancarios), con dedupe por el entry_reference del banco. Scoped por cuenta_id.
//
// El identificador persistido en conexiones_banco.requisition_id es:
//   - al crear el consentimiento: el authorization_id devuelto por POST /auth (estado pendiente);
//   - tras el callback: el session_id devuelto por POST /sessions (estado vinculada), que es
//     lo que el re-sync diario reutiliza para releer cuentas/movimientos.

import { createHash } from 'node:crypto'
import { prisma } from './db'
import { getSesion, getDetalleCuenta, getSaldo, getMovimientos, type MovEB } from './enablebanking'

function hashMov(accountUid: string, m: MovEB): string {
  // El banco da un entry_reference estable → dedupe perfecto. Fallback a fecha+importe.
  const base = m.entryReference || `${accountUid}|${m.bookingDate ?? ''}|${m.importe}`
  return createHash('sha1').update(base).digest('hex')
}

// Sincroniza todas las cuentas de una sesión vinculada. Idempotente (upsert + dedupe).
export async function sincronizarSesion(
  cuentaId: string,
  sociedadId: string,
  sessionId: string,
): Promise<{ cuentas: number; insertados: number; duplicados: number }> {
  const ses = await getSesion(sessionId)
  let cuentas = 0, insertados = 0, duplicados = 0

  for (const accountUid of ses.accounts ?? []) {
    const [detalle, saldo, movs] = await Promise.all([
      getDetalleCuenta(accountUid).catch(() => null),
      getSaldo(accountUid).catch(() => null),
      getMovimientos(accountUid).catch(() => [] as MovEB[]),
    ])
    const iban = detalle?.iban || accountUid
    const banco = detalle?.nombre || 'Banco (PSD2)'
    const mascara = iban.length >= 4 ? `****${iban.slice(-4)}` : iban

    const filas = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO cuentas_bancarias (cuenta_id, sociedad_id, banco, iban, iban_mascara, divisa, saldo_actual, saldo_fecha)
      VALUES (${cuentaId}::uuid, ${sociedadId}::uuid, ${banco}, ${iban}, ${mascara}, 'EUR', ${saldo}, now()::date)
      ON CONFLICT (sociedad_id, iban) DO UPDATE SET
        banco = COALESCE(EXCLUDED.banco, cuentas_bancarias.banco),
        saldo_actual = COALESCE(EXCLUDED.saldo_actual, cuentas_bancarias.saldo_actual),
        saldo_fecha = now()::date
      RETURNING id
    `
    const cbId = filas[0]?.id
    if (!cbId) continue
    cuentas += 1

    for (const m of movs) {
      if (!Number.isFinite(m.importe)) continue
      const res = await prisma.$executeRaw`
        INSERT INTO movimientos_bancarios
          (cuenta_bancaria_id, fecha_operacion, fecha_valor, importe, concepto, contraparte, referencia, origen, dedupe_hash)
        VALUES (
          ${cbId}::uuid, ${m.bookingDate || null}::date, ${m.valueDate || m.bookingDate || null}::date,
          ${m.importe}, ${m.concepto || null}, ${m.contraparte || null},
          ${m.entryReference || null}, 'psd2', ${hashMov(accountUid, m)}
        )
        ON CONFLICT (cuenta_bancaria_id, dedupe_hash) DO NOTHING
      `
      if (Number(res) === 1) insertados += 1; else duplicados += 1
    }
  }

  await prisma.$executeRaw`
    UPDATE conexiones_banco SET estado = 'vinculada', ultimo_sync = now()
    WHERE requisition_id = ${sessionId} AND cuenta_id = ${cuentaId}::uuid
  `
  return { cuentas, insertados, duplicados }
}

// Re-sincroniza todas las conexiones vinculadas de todas las cuentas (cron diario).
export async function sincronizarTodas(): Promise<{ conexiones: number; insertados: number }> {
  const conns = await prisma.$queryRaw<Array<{ cuenta_id: string; sociedad_id: string; requisition_id: string }>>`
    SELECT cuenta_id, sociedad_id, requisition_id FROM conexiones_banco WHERE estado = 'vinculada'
  `
  let insertados = 0
  for (const c of conns) {
    const r = await sincronizarSesion(c.cuenta_id, c.sociedad_id, c.requisition_id).catch(() => null)
    if (r) insertados += r.insertados
  }
  return { conexiones: conns.length, insertados }
}
