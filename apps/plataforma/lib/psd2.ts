// Orquestación PSD2 (Fase 6): tras el consentimiento, vuelca las cuentas y movimientos
// de GoCardless en las MISMAS tablas que la importación manual (cuentas_bancarias /
// movimientos_bancarios), con dedupe por el transactionId del banco. Scoped por cuenta_id.

import { createHash } from 'node:crypto'
import { prisma } from './db'
import { getRequisition, getDetalleCuenta, getSaldo, getMovimientos } from './gocardless'

function hashMov(accountId: string, m: { transactionId?: string; bookingDate?: string; transactionAmount: { amount: string } }): string {
  // El banco da un transactionId estable → dedupe perfecto. Fallback a fecha+importe.
  const base = m.transactionId || `${accountId}|${m.bookingDate ?? ''}|${m.transactionAmount.amount}`
  return createHash('sha1').update(base).digest('hex')
}

// Sincroniza todas las cuentas de una requisition vinculada. Idempotente (upsert + dedupe).
export async function sincronizarRequisition(
  cuentaId: string,
  sociedadId: string,
  requisitionId: string,
): Promise<{ cuentas: number; insertados: number; duplicados: number }> {
  const req = await getRequisition(requisitionId)
  let cuentas = 0, insertados = 0, duplicados = 0

  for (const accountId of req.accounts ?? []) {
    const [detalle, saldo, movs] = await Promise.all([
      getDetalleCuenta(accountId).catch(() => null),
      getSaldo(accountId).catch(() => null),
      getMovimientos(accountId).catch(() => [] as Awaited<ReturnType<typeof getMovimientos>>),
    ])
    const iban = detalle?.account.iban || accountId
    const banco = detalle?.account.name || 'Banco (PSD2)'
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
      const importe = Number(m.transactionAmount.amount)
      if (!Number.isFinite(importe)) continue
      const concepto = (m.remittanceInformationUnstructured || m.creditorName || m.debtorName || '').trim()
      const res = await prisma.$executeRaw`
        INSERT INTO movimientos_bancarios
          (cuenta_bancaria_id, fecha_operacion, fecha_valor, importe, concepto, contraparte, referencia, origen, dedupe_hash)
        VALUES (
          ${cbId}::uuid, ${m.bookingDate || null}::date, ${m.valueDate || m.bookingDate || null}::date,
          ${importe}, ${concepto || null}, ${(m.creditorName || m.debtorName || '').trim() || null},
          ${m.transactionId || null}, 'psd2', ${hashMov(accountId, m)}
        )
        ON CONFLICT (cuenta_bancaria_id, dedupe_hash) DO NOTHING
      `
      if (Number(res) === 1) insertados += 1; else duplicados += 1
    }
  }

  await prisma.$executeRaw`
    UPDATE conexiones_banco SET estado = 'vinculada', ultimo_sync = now()
    WHERE requisition_id = ${requisitionId} AND cuenta_id = ${cuentaId}::uuid
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
    const r = await sincronizarRequisition(c.cuenta_id, c.sociedad_id, c.requisition_id).catch(() => null)
    if (r) insertados += r.insertados
  }
  return { conexiones: conns.length, insertados }
}
