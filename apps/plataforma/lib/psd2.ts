// Orquestación PSD2 (Fase 6): tras el consentimiento, vuelca las cuentas y movimientos
// de Enable Banking en las MISMAS tablas que la importación manual (cuentas_bancarias /
// movimientos_bancarios), con dedupe por el entry_reference del banco. Scoped por cuenta_id.
//
// El identificador persistido en conexiones_banco.requisition_id es:
//   - al crear el consentimiento: el authorization_id devuelto por POST /auth (estado pendiente);
//   - tras el callback: el session_id devuelto por POST /sessions (estado vinculada), que es
//     lo que el re-sync diario reutiliza para releer cuentas/movimientos.

import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from './db'
import { getSesion, getDetalleCuenta, getSaldo, getMovimientos, type MovEB } from './enablebanking'

function hashMov(cbId: string, m: MovEB): string {
  // Dedupe ESTABLE entre pasadas, por CONTENIDO. Ni el entry_reference ni el accountUid de
  // Enable Banking sirven como clave: el banco (BBVA/Kutxa) los ROTA entre sesiones, así que
  // un mismo movimiento reaparece con otro hash y burla el ON CONFLICT (duplicados jun-2026:
  // cuota PTMO, recibos de tarjeta, seguros…). Clave = cuenta_bancaria_id (persistente) + fecha
  // + importe + concepto. Mismo criterio que el dedupe en-memoria de abajo.
  // ⚠️ Debe coincidir BYTE A BYTE con el backfill SQL de
  // prisma/sql/2026-06-25_psd2_dedupe_contenido.sql (verificado node↔postgres).
  const canon = `${cbId}|${m.bookingDate ?? ''}|${m.importe.toFixed(2)}|${(m.concepto || '').trim().toUpperCase()}`
  return createHash('sha1').update(canon).digest('hex')
}

// Sincroniza todas las cuentas de una sesión vinculada. Idempotente (upsert + dedupe).
// dateFrom: override opcional para importar histórico (p. ej. "2026-01-01"). Por defecto 89 días.
export async function sincronizarSesion(
  cuentaId: string,
  sociedadId: string,
  sessionId: string,
  dateFrom?: string,
): Promise<{ cuentas: number; insertados: number; duplicados: number }> {
  const ses = await getSesion(sessionId)
  let cuentas = 0, insertados = 0, duplicados = 0

  for (const accountUid of ses.accounts ?? []) {
    const [detalle, saldo, movs] = await Promise.all([
      getDetalleCuenta(accountUid).catch(() => null),
      getSaldo(accountUid).catch(() => null),
      getMovimientos(accountUid, dateFrom).catch(() => [] as MovEB[]),
    ])
    const iban = detalle?.iban || accountUid
    const banco = ses.aspsp || detalle?.nombre || 'Banco (PSD2)'
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

    // Inserción EN BLOQUE (un solo INSERT por cuenta) — antes era uno a uno y con cuentas
    // grandes (p. ej. Kutxa) el callback superaba el timeout de la función serverless.
    // Dedup EN MEMORIA por hash de contenido (ON CONFLICT no cubre filas repetidas en el mismo
    // INSERT). El hash ya es por contenido (cuenta+fecha+importe+concepto), así que cubre el caso
    // de BBVA/Kutxa devolviendo la misma transacción dos veces con entry_reference rotado.
    const vistos = new Set<string>()
    const validos = movs.filter(m => {
      if (!Number.isFinite(m.importe)) return false
      const h = hashMov(cbId, m)
      if (vistos.has(h)) return false
      vistos.add(h)
      return true
    })
    if (validos.length) {
      const filasMov = validos.map(m => Prisma.sql`(
        ${cbId}::uuid, ${m.bookingDate || null}::date, ${m.valueDate || m.bookingDate || null}::date,
        ${m.importe}, ${m.concepto || null}, ${m.contraparte || null},
        ${m.entryReference || null}, 'psd2', ${hashMov(cbId, m)}
      )`)
      const res = await prisma.$executeRaw(Prisma.sql`
        INSERT INTO movimientos_bancarios
          (cuenta_bancaria_id, fecha_operacion, fecha_valor, importe, concepto, contraparte, referencia, origen, dedupe_hash)
        VALUES ${Prisma.join(filasMov)}
        ON CONFLICT (cuenta_bancaria_id, dedupe_hash) DO NOTHING
      `)
      const ins = Number(res)
      insertados += ins
      duplicados += validos.length - ins
    }
  }

  await prisma.$executeRaw`
    UPDATE conexiones_banco SET estado = 'vinculada', ultimo_sync = now()
    WHERE requisition_id = ${sessionId} AND cuenta_id = ${cuentaId}::uuid
  `
  return { cuentas, insertados, duplicados }
}

// Re-sincroniza todas las conexiones vinculadas de todas las cuentas (cron diario).
// dateFrom: override para importar histórico (p. ej. "2026-01-01"). Por defecto 89 días.
export async function sincronizarTodas(dateFrom?: string): Promise<{ conexiones: number; insertados: number }> {
  const conns = await prisma.$queryRaw<Array<{ cuenta_id: string; sociedad_id: string; requisition_id: string }>>`
    SELECT cuenta_id, sociedad_id, requisition_id FROM conexiones_banco WHERE estado = 'vinculada'
  `
  let insertados = 0
  for (const c of conns) {
    const r = await sincronizarSesion(c.cuenta_id, c.sociedad_id, c.requisition_id, dateFrom).catch(() => null)
    if (r) insertados += r.insertados
  }
  return { conexiones: conns.length, insertados }
}
