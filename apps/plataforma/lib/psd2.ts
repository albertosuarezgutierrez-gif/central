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
//
// `avisos` distingue «el banco no devolvió nada» de «no se pudo preguntar»: un fallo del
// endpoint de transacciones aquí NO puede colapsar a lista vacía en silencio — con el saldo
// actualizándose a diario, insertar 0 parecería «no hay movimientos» durante semanas
// (pasó del 11 al 16/08/2026: 6 días secos con la sesión viva y ni un error visible).
export async function sincronizarSesion(
  cuentaId: string,
  sociedadId: string,
  sessionId: string,
  dateFrom?: string,
): Promise<{ cuentas: number; insertados: number; duplicados: number; avisos: string[] }> {
  const ses = await getSesion(sessionId)
  let cuentas = 0, insertados = 0, duplicados = 0
  const avisos: string[] = []

  for (const accountUid of ses.accounts ?? []) {
    let movsFallo: string | null = null
    const [detalle, saldo, movs] = await Promise.all([
      getDetalleCuenta(accountUid).catch((e: unknown) => {
        avisos.push(`detalle de cuenta …${accountUid.slice(-6)} (${ses.aspsp ?? '?'}): ${String(e).slice(0, 160)}`)
        return null
      }),
      getSaldo(accountUid).catch(() => null),
      getMovimientos(accountUid, dateFrom).catch((e: unknown) => {
        movsFallo = String(e).slice(0, 160)
        return [] as MovEB[]
      }),
    ])
    const iban = detalle?.iban || accountUid
    // Si getDetalleCuenta falló, accountUid es un UUID opaco (no un IBAN real). Insertar
    // ese UUID como IBAN crea una cuenta_bancaria fantasma que burla el dedupe cross-sesión.
    // Se salta esta cuenta: el siguiente sync obtendrá el IBAN real y la creará correctamente.
    if (!/^[A-Z]{2}[0-9]{2}/.test(iban)) continue
    const banco = ses.aspsp || detalle?.nombre || 'Banco (PSD2)'
    const mascara = iban.length >= 4 ? `****${iban.slice(-4)}` : iban

    // Saldo ANTES del upsert: si luego cambia con 0 transacciones devueltas, el feed está roto
    // (el upsert pisa saldo_actual y pone saldo_fecha=hoy siempre, así que no se puede mirar después).
    const previa = await prisma.$queryRaw<Array<{ saldo: string | null }>>`
      SELECT saldo_actual::text AS saldo FROM cuentas_bancarias
      WHERE sociedad_id = ${sociedadId}::uuid AND iban = ${iban}
    `
    const saldoPrevio = previa.length ? (previa[0].saldo != null ? Number(previa[0].saldo) : null) : undefined

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
      const nuevas = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO movimientos_bancarios
          (cuenta_bancaria_id, fecha_operacion, fecha_valor, importe, concepto, contraparte, referencia, origen, dedupe_hash)
        VALUES ${Prisma.join(filasMov)}
        ON CONFLICT (cuenta_bancaria_id, dedupe_hash) DO NOTHING
        RETURNING id
      `)
      const ins = nuevas.length
      insertados += ins
      duplicados += validos.length - ins

      // Guarda anti-drift del concepto: BBVA re-sirve a veces el MISMO movimiento con la
      // puntuación del concepto mutilada entre sesiones («LIQ. OP. Nº» ↔ «LIQ. OP. N»), y como
      // el dedupe_hash incluye el concepto literal, el ON CONFLICT no lo caza (pares reales:
      // 16/06, 25/06 y 22/07/2026). Si un recién insertado tiene un gemelo psd2 MÁS ANTIGUO
      // con mismos (fecha, importe) y el mismo concepto una vez quitado todo lo no alfanumérico,
      // el nuevo es el duplicado — se conserva siempre la fila que el P&L ya contó. Dos
      // movimientos legítimos distintos del mismo día no colisionan: con concepto idéntico ya
      // los colapsa el hash (matiz aceptado), y si difieren en algo más que puntuación no casan.
      if (ins > 0) {
        await prisma.$executeRaw(Prisma.sql`
          UPDATE movimientos_bancarios n
          SET duplicado_estado = 'ignorado',
              comentario = COALESCE(n.comentario || ' | ', '') || 'auto-dedup: mismo movimiento psd2 con el concepto re-servido distinto'
          WHERE n.id = ANY(${nuevas.map(f => f.id)}::uuid[])
            AND coalesce(n.duplicado_estado, '') <> 'ignorado'
            AND EXISTS (
              SELECT 1 FROM movimientos_bancarios v
              WHERE v.origen = 'psd2'
                AND v.cuenta_bancaria_id = n.cuenta_bancaria_id
                AND v.fecha_operacion IS NOT DISTINCT FROM n.fecha_operacion
                AND v.importe = n.importe
                AND v.id <> n.id
                AND v.created_at < n.created_at
                AND coalesce(v.duplicado_estado, '') <> 'ignorado'
                AND regexp_replace(upper(coalesce(v.concepto, '')), '[^A-Z0-9]', '', 'g')
                    = regexp_replace(upper(coalesce(n.concepto, '')), '[^A-Z0-9]', '', 'g')
            )
        `)
      }

      // Categorizar con IA los movimientos recién insertados
      if (ins > 0) {
        const { categorizarYAlertar } = await import('./alertas-categoria')
        const nuevos = await prisma.$queryRaw<{ id: string; concepto: string | null; contraparte: string | null; importe: number; destino: string | null }[]>`
          SELECT id, concepto, contraparte, importe::float, destino
          FROM movimientos_bancarios
          WHERE cuenta_bancaria_id = ${cbId}::uuid
            AND subcategoria IS NULL
            AND fecha_operacion >= now() - interval '3 days'
        `
        await Promise.allSettled(nuevos.map(m => categorizarYAlertar(cbId, m)))
      }
    }

    if (movsFallo) {
      avisos.push(`${banco} ${mascara}: /transactions falló — ${movsFallo}`)
    } else if (movs.length === 0 && previa.length > 0) {
      // Ventana de 89 días VACÍA en una cuenta ya conocida: aunque hoy no hubiera nada nuevo,
      // el banco devolvería el histórico reciente (que saldría como duplicados). Cero absoluto
      // = el consentimiento sirve saldos pero ya no transacciones (SCA/renovación pendiente).
      const drift = saldoPrevio != null && saldo !== null && Math.abs(saldo - saldoPrevio) > 0.005
        ? ` y el saldo SÍ cambió (${saldoPrevio.toFixed(2)} → ${saldo.toFixed(2)})`
        : ''
      avisos.push(`${banco} ${mascara}: 0 transacciones en toda la ventana${drift} — probable consentimiento degradado, re-vincular en /banca`)
    }
  }

  // Persiste el desenlace del sync en la conexión para el panel /banca (lib/psd2-estado.ts):
  // `[]` explícito = pasada limpia; con contenido = qué falló. NULL queda solo en filas que
  // ningún sync nuevo ha tocado («no se sabe», no «limpio»).
  await prisma.$executeRaw`
    UPDATE conexiones_banco SET estado = 'vinculada', ultimo_sync = now(),
      ultimo_avisos = ${JSON.stringify(avisos)}::jsonb,
      avisos_at = ${avisos.length > 0 ? new Date() : null}
    WHERE requisition_id = ${sessionId} AND cuenta_id = ${cuentaId}::uuid
  `
  return { cuentas, insertados, duplicados, avisos }
}

// Re-sincroniza todas las conexiones vinculadas de todas las cuentas (cron diario).
// dateFrom: override para importar histórico (p. ej. "2026-01-01"). Por defecto 89 días.
// Los fallos por sesión NO se tragan: van en `avisos` (y a los logs) para que el cron
// pueda avisar por Telegram — un sync que falla en silencio se lee como «no hay movimientos».
export async function sincronizarTodas(dateFrom?: string): Promise<{ conexiones: number; insertados: number; avisos: string[] }> {
  const conns = await prisma.$queryRaw<Array<{ cuenta_id: string; sociedad_id: string; requisition_id: string }>>`
    SELECT cuenta_id, sociedad_id, requisition_id FROM conexiones_banco WHERE estado = 'vinculada'
  `
  let insertados = 0
  const avisos: string[] = []
  for (const c of conns) {
    const r = await sincronizarSesion(c.cuenta_id, c.sociedad_id, c.requisition_id, dateFrom).catch((e: unknown) => {
      avisos.push(`sesión …${c.requisition_id.slice(-6)}: sync falló — ${String(e).slice(0, 160)}`)
      return null
    })
    if (r) { insertados += r.insertados; avisos.push(...r.avisos) }
    else {
      // La sesión entera falló (getSesion lanzó): deja el motivo en la conexión para el panel —
      // aquí no llega el UPDATE final de sincronizarSesion.
      await prisma.$executeRaw`
        UPDATE conexiones_banco SET ultimo_avisos = ${JSON.stringify([avisos[avisos.length - 1]])}::jsonb, avisos_at = now()
        WHERE requisition_id = ${c.requisition_id} AND cuenta_id = ${c.cuenta_id}::uuid
      `.catch(() => {})
    }
  }
  if (avisos.length) console.error('[psd2-sync] avisos:', avisos.join(' | '))
  return { conexiones: conns.length, insertados, avisos }
}
