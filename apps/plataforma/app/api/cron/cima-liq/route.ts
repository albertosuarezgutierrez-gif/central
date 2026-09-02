// /api/cron/cima-liq — libro de comisiones de la correduría.
//
// Tres ejes por (compañía, periodo): DEVENGADO (recibos cobrados) → LIQUIDADO
// (extracto de la compañía) → COBRADO (BBVA). Cada salto tiene su propio fallo,
// y llamarlos a todos «descuadre» impedía saber a quién reclamar.
//
// 🚨 Antes esto hablaba SOAP directo contra `ws.cimaseg.es` con un parser del
// fichero LIQ adivinado y un mapa de compañías equivocado (códigos numéricos
// cuando los reales son C0058/C0109/C0468/C0613). Nunca se validó —el endpoint
// devolvía 404— y por eso vivía apagado. Ahora lee el puerto de central-asegura,
// que sirve lo que el JAR oficial de TIREA ya dejó parseado, con la comisión,
// la retención y la remesa SEPARADAS.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { eur } from '@/lib/dinero'
import { tgAviso } from '@/lib/telegram/avisos'
import { comisionesAsegura, nombreCompania } from '@/lib/comisiones-asegura'
import { describirCausaAsegura } from '@/lib/correduria-puerto'
import { estadoCuadre, mesEnPeriodo, finDeMes, ESTADOS_PENDIENTES, type EstadoCuadre } from '@/lib/correduria/cuadre'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Días tras el cierre del periodo en los que aún se acepta el ingreso. */
const VENTANA_COBRO_DIAS = 45

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  const ok =
    (!!secret && auth === `Bearer ${secret}`) ||
    (!!secret && req.nextUrl.searchParams.get('secret') === secret)
  if (!ok) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const cuenta = await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM cuentas LIMIT 1`
  if (!cuenta.length) return NextResponse.json({ ok: true, msg: 'Sin cuentas' })
  const cuentaId = cuenta[0].id

  const anio = new Date().getFullYear()
  const com = await comisionesAsegura(`${anio}-01-01`)

  if (com.estado === 'sin_configurar') {
    // El puerto no está conectado. NO es «no hay comisiones»: no se escribe nada
    // ni se avisa, porque no hay nada que reclamar todavía.
    return NextResponse.json({ ok: true, msg: 'Puerto de asegura sin configurar' })
  }

  if (com.estado === 'error') {
    // 🚨 No se ha podido mirar ≠ no hay. Se marca el libro como NO comprobado
    // (en vez de dejar importes viejos pasando por vigentes) y se dice.
    await prisma.$executeRaw`
      UPDATE comisiones_devengo SET leido_ok = false, actualizado_at = now()
      WHERE cuenta_id = ${cuentaId}::uuid`
    await tgAviso(
      'correduria.cima-liq',
      `⚪ <b>Comisiones</b> — no se ha podido leer la cartera (<code>${com.motivo}</code>).\n` +
        // La causa es la mitad útil del aviso: `asegura_error` sin ella no dice
        // si hay que tocar la contraseña, los permisos o el schema. Si asegura no
        // la manda se DICE que no se sabe, no se deja el hueco en blanco.
        `Causa: ${describirCausaAsegura(com.causa) ?? '<i>sin causa — asegura no la manda</i>'}\n` +
        `El libro queda marcado como <b>no comprobado</b>, no a cero.`,
      { html: true },
    )
    return NextResponse.json({ ok: false, motivo: com.motivo, causa: com.causa ?? null }, { status: 502 })
  }

  // ── Cobertura por compañía ────────────────────────────────────────────────
  // Sin esto, el total anual parecería completo estando ciego a las compañías
  // que no tienen ninguna fuente.
  for (const k of com.cobertura) {
    await prisma.$executeRaw`
      INSERT INTO comisiones_cobertura
        (cuenta_id, compania_codigo, compania, tiene_recibos_cima, desde_recibos, tiene_liq_cima, actualizado_at)
      VALUES (${cuentaId}::uuid, ${k.companiaCodigo}, ${nombreCompania(k.companiaCodigo)},
              ${k.recibos > 0}, ${k.primerRecibo}::date, ${k.liquidaciones > 0}, now())
      ON CONFLICT (cuenta_id, compania_codigo) DO UPDATE SET
        compania = EXCLUDED.compania,
        tiene_recibos_cima = EXCLUDED.tiene_recibos_cima,
        desde_recibos = EXCLUDED.desde_recibos,
        tiene_liq_cima = EXCLUDED.tiene_liq_cima,
        actualizado_at = now()`
  }
  const conCobertura = new Set(
    com.cobertura.filter(k => k.recibos > 0 || k.liquidaciones > 0).map(k => k.companiaCodigo),
  )

  // ── Un periodo por liquidación, más los meses que SOLO tienen devengo ──────
  // Los segundos son justo el caso Mapfre: devenga comisión y no manda extracto.
  type Fila = {
    codigo: string
    inicio: string
    fin: string
    bruto: number | null
    ret: number | null
    remesa: number | null
    hash: string | null
  }
  const filas: Fila[] = com.periodos.map(p => ({
    codigo: p.companiaCodigo,
    inicio: p.periodoInicio,
    fin: p.periodoFin,
    bruto: p.liqBruto,
    ret: p.liqRetencion,
    remesa: p.liqRemesa,
    hash: p.liqHash,
  }))
  for (const d of com.devengos) {
    const yaEsta = filas.some(f => f.codigo === d.companiaCodigo && mesEnPeriodo(d.mes, f.inicio, f.fin))
    if (!yaEsta) {
      filas.push({
        codigo: d.companiaCodigo,
        inicio: `${d.mes}-01`,
        fin: finDeMes(d.mes),
        bruto: null,
        ret: null,
        remesa: null,
        hash: null,
      })
    }
  }

  const avisos: string[] = []
  let pendientes = 0

  for (const f of filas) {
    const delPeriodo = com.devengos.filter(
      d => d.companiaCodigo === f.codigo && mesEnPeriodo(d.mes, f.inicio, f.fin),
    )
    const recibos = delPeriodo.reduce((s, d) => s + d.recibos, 0)
    const esperado = recibos > 0 ? Math.round(delPeriodo.reduce((s, d) => s + d.bruto, 0) * 100) / 100 : null

    // Ingreso en el BBVA de ESA compañía. Solo cuenta lo identificado: un
    // movimiento sin compañía asignada no se atribuye a nadie a la ligera.
    const hasta = new Date(new Date(`${f.fin}T00:00:00Z`).getTime() + VENTANA_COBRO_DIAS * 864e5)
    const banco = await prisma.$queryRaw<Array<{ total: number | null; ids: string[] | null }>>`
      SELECT sum(mb.importe)::float AS total, array_agg(mb.id) AS ids
      FROM movimientos_bancarios mb
      JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
      WHERE cb.cuenta_id = ${cuentaId}::uuid
        AND mb.destino = 'seguros'
        AND mb.importe > 0
        AND coalesce(mb.duplicado_estado, '') <> 'ignorado'
        AND mb.compania_seguros = ${nombreCompania(f.codigo)}
        AND mb.fecha_operacion >= ${new Date(`${f.inicio}T00:00:00Z`)}
        AND mb.fecha_operacion <= ${hasta}`
    const bancoTotal = banco[0]?.total ?? null
    const bancoIds = banco[0]?.ids ?? []

    await prisma.$executeRaw`
      INSERT INTO comisiones_devengo
        (cuenta_id, compania_codigo, compania, periodo_inicio, periodo_fin,
         esperado_bruto, esperado_recibos, liq_bruto, liq_retencion, liq_remesa,
         liq_origen, liq_hash, banco_total, banco_movimiento_ids, leido_ok, actualizado_at)
      VALUES (${cuentaId}::uuid, ${f.codigo}, ${nombreCompania(f.codigo)},
              ${f.inicio}::date, ${f.fin}::date,
              ${esperado}, ${recibos > 0 ? recibos : null},
              ${f.bruto}, ${f.ret}, ${f.remesa},
              ${f.bruto == null ? null : 'cima'}, ${f.hash},
              ${bancoTotal}, ${bancoIds}::uuid[], true, now())
      ON CONFLICT (cuenta_id, compania_codigo, periodo_inicio, periodo_fin) DO UPDATE SET
        compania = EXCLUDED.compania,
        esperado_bruto = EXCLUDED.esperado_bruto,
        esperado_recibos = EXCLUDED.esperado_recibos,
        -- coalesce: lo que ya se confirmó a mano (Mapfre) no lo pisa un NULL
        -- de CIMA, que sigue sin mandar extracto.
        liq_bruto = coalesce(EXCLUDED.liq_bruto, comisiones_devengo.liq_bruto),
        liq_retencion = coalesce(EXCLUDED.liq_retencion, comisiones_devengo.liq_retencion),
        liq_remesa = coalesce(EXCLUDED.liq_remesa, comisiones_devengo.liq_remesa),
        liq_origen = coalesce(EXCLUDED.liq_origen, comisiones_devengo.liq_origen),
        liq_hash = coalesce(EXCLUDED.liq_hash, comisiones_devengo.liq_hash),
        banco_total = EXCLUDED.banco_total,
        banco_movimiento_ids = EXCLUDED.banco_movimiento_ids,
        leido_ok = true,
        actualizado_at = now()`

    const estado: EstadoCuadre = estadoCuadre({
      leidoOk: true,
      tieneCobertura: conCobertura.has(f.codigo),
      esperadoBruto: esperado,
      liqBruto: f.bruto,
      liqRetencion: f.ret,
      liqRemesa: f.remesa,
      bancoTotal,
    })

    if (ESTADOS_PENDIENTES.includes(estado)) pendientes++
    if (estado === 'esperado-sin-liquidar' || estado === 'liquidado-sin-cobrar' || estado === 'descuadra') {
      avisos.push(
        `• <b>${nombreCompania(f.codigo)}</b> ${f.inicio} → ${f.fin} — <b>${ETIQUETA[estado]}</b>\n` +
          `  devengado ${esperado == null ? '—' : eur(esperado)} · ` +
          `liquidado ${f.bruto == null ? '—' : eur(f.bruto)} · ` +
          `banco ${bancoTotal == null ? '—' : eur(bancoTotal)}`,
      )
    }
  }

  if (avisos.length) {
    await tgAviso(
      'correduria.cima-liq',
      `🔴 <b>Comisiones — hay dinero que no cuadra</b>\n\n${avisos.join('\n\n')}\n\n` +
        (pendientes ? `⚪ Y ${pendientes} periodo(s) sin dato o sin fuente todavía.\n` : '') +
        `Revisa en <b>/correduria</b>.`,
      { html: true },
    )
  }

  return NextResponse.json({ ok: true, periodos: filas.length, avisos: avisos.length, pendientes })
}

const ETIQUETA: Record<string, string> = {
  'esperado-sin-liquidar': 'devengado y sin liquidar',
  'liquidado-sin-cobrar': 'liquidado y sin ingresar',
  descuadra: 'descuadra',
}
