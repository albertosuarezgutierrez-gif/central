export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import {
  generarAsientoCierreDiario, periodoStr, trimestreActual,
  PGC_DEFECTO, type ConfigContabilidad,
} from '@/lib/contabilidad'

/**
 * POST /api/owner/contabilidad/cierre-diario
 * Body: { fecha?: 'YYYY-MM-DD' }
 * Calcula el arqueo del día desde facturas_verifactu y genera el asiento contable.
 */
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const body = await req.json().catch(() => ({}))
  const fecha: string = body.fecha ?? new Date().toISOString().split('T')[0]

  // 1. Comprobar si ya existe arqueo para esa fecha
  const { data: arqueoExistente } = await supabase
    .from('arqueos_caja')
    .select('id, estado')
    .eq('local_id', rid)
    .eq('fecha', fecha)
    .maybeSingle()
  if (arqueoExistente?.estado === 'cerrado') {
    return NextResponse.json({ error: 'El cierre de este día ya está confirmado.' }, { status: 409 })
  }

  // 2. Cargar ventas del día desde facturas_verifactu
  const { data: facturas } = await supabase
    .from('facturas_verifactu')
    .select('importe_total, iva_desglosado, metodo_pago')
    .eq('local_id', rid)
    .gte('fecha', `${fecha}T00:00:00`)
    .lt('fecha',  `${fecha}T23:59:59`)
    .eq('estado', 'emitida')

  let base_10 = 0, iva_10 = 0, base_21 = 0, iva_21 = 0, base_4 = 0, iva_4 = 0
  let efectivo = 0, tarjeta = 0, bizum = 0
  let num_tickets = facturas?.length ?? 0

  for (const f of facturas ?? []) {
    const dsg = f.iva_desglosado as Record<string, number> | null ?? {}
    if (dsg['10'] != null) { iva_10 += dsg['10']; base_10 += dsg['10'] / 0.1 * 0.9 }
    if (dsg['21'] != null) { iva_21 += dsg['21']; base_21 += dsg['21'] / 0.21 * 0.79 }
    if (dsg['4']  != null) { iva_4  += dsg['4'];  base_4  += dsg['4']  / 0.04 * 0.96 }
    const m = f.metodo_pago
    const total = Number(f.importe_total)
    if (m === 'efectivo') efectivo += total
    else if (m === 'tarjeta') tarjeta += total
    else if (m === 'bizum') bizum += total
    else tarjeta += total
  }

  // 3. Cargar propinas del día
  const { data: propinasData } = await supabase
    .from('propinas')
    .select('importe, canal')
    .eq('local_id', rid)
    .gte('created_at', `${fecha}T00:00:00`)
    .lt('created_at',  `${fecha}T23:59:59`)

  const propinas_efectivo = (propinasData ?? []).filter(p => p.canal === 'efectivo').reduce((s, p) => s + Number(p.importe), 0)
  const propinas_tarjeta  = (propinasData ?? []).filter(p => p.canal !== 'efectivo').reduce((s, p) => s + Number(p.importe), 0)

  // 4. Cargar config contable
  const { data: cfgData } = await supabase
    .from('config_contabilidad')
    .select('*')
    .eq('local_id', rid)
    .maybeSingle()

  const cfg: ConfigContabilidad = {
    regimen_fiscal:            (cfgData?.regimen_fiscal ?? 'irpf_directa') as ConfigContabilidad['regimen_fiscal'],
    iva_regimen:               (cfgData?.iva_regimen ?? 'general') as ConfigContabilidad['iva_regimen'],
    formato_exportacion:       (cfgData?.formato_exportacion ?? 'csv') as ConfigContabilidad['formato_exportacion'],
    ejercicio_actual:          cfgData?.ejercicio_actual ?? new Date().getFullYear(),
    cuenta_ventas_10:          cfgData?.cuenta_ventas_10          ?? PGC_DEFECTO.ventas_10,
    cuenta_ventas_21:          cfgData?.cuenta_ventas_21          ?? PGC_DEFECTO.ventas_21,
    cuenta_ventas_4:           cfgData?.cuenta_ventas_4           ?? PGC_DEFECTO.ventas_4,
    cuenta_compras_mercancias: cfgData?.cuenta_compras_mercancias ?? PGC_DEFECTO.compras_mercancias,
    cuenta_compras_materias:   cfgData?.cuenta_compras_materias   ?? PGC_DEFECTO.compras_materias,
    cuenta_compras_gastos:     cfgData?.cuenta_compras_gastos     ?? PGC_DEFECTO.compras_gastos,
    cuenta_personal_sueldos:   cfgData?.cuenta_personal_sueldos   ?? PGC_DEFECTO.personal_sueldos,
    cuenta_personal_ss:        cfgData?.cuenta_personal_ss        ?? PGC_DEFECTO.personal_ss,
    cuenta_iva_repercutido:    cfgData?.cuenta_iva_repercutido    ?? PGC_DEFECTO.iva_repercutido,
    cuenta_iva_soportado:      cfgData?.cuenta_iva_soportado      ?? PGC_DEFECTO.iva_soportado,
    cuenta_caja:               cfgData?.cuenta_caja               ?? PGC_DEFECTO.caja,
    cuenta_bancos:             cfgData?.cuenta_bancos             ?? PGC_DEFECTO.bancos,
    cuenta_propinas:           cfgData?.cuenta_propinas           ?? PGC_DEFECTO.propinas,
    email_contable:            cfgData?.email_contable,
  }

  const arqueoInput = {
    restaurante_id: rid, fecha,
    base_10: Math.round(base_10 * 100) / 100, iva_10: Math.round(iva_10 * 100) / 100,
    base_21: Math.round(base_21 * 100) / 100, iva_21: Math.round(iva_21 * 100) / 100,
    base_4:  Math.round(base_4  * 100) / 100, iva_4:  Math.round(iva_4  * 100) / 100,
    efectivo: Math.round(efectivo * 100) / 100,
    tarjeta:  Math.round(tarjeta  * 100) / 100,
    bizum:    Math.round(bizum    * 100) / 100,
    qr: 0, otros: 0,
    propinas_efectivo: Math.round(propinas_efectivo * 100) / 100,
    propinas_tarjeta:  Math.round(propinas_tarjeta  * 100) / 100,
    salidas_caja: 0, fondo_inicial: 0, fondo_final: 0, diferencia_caja: 0,
    num_comandas: num_tickets, num_tickets,
    ticket_medio: num_tickets > 0 ? Math.round((base_10 + iva_10 + base_21 + iva_21) / num_tickets * 100) / 100 : 0,
  }

  // 5. Upsert arqueo
  const { data: arqueo, error: arqueoErr } = await supabase
    .from('arqueos_caja')
    .upsert({ ...arqueoInput, estado: 'borrador' }, { onConflict: 'restaurante_id,fecha' })
    .select('id').single()
  if (arqueoErr) return NextResponse.json({ error: arqueoErr.message }, { status: 500 })

  // 6. Generar asiento contable
  const numAsiento = (await supabase.rpc('siguiente_num_asiento', { p_restaurante_id: rid })).data as number ?? 1
  const { concepto, tipo, lineas } = generarAsientoCierreDiario(arqueoInput, cfg, numAsiento)
  const { year, trimestre } = trimestreActual()

  const { data: asiento, error: asientoErr } = await supabase
    .from('asientos_contables')
    .insert({
      restaurante_id: rid,
      num_asiento: numAsiento,
      fecha,
      concepto,
      tipo,
      lineas,
      origen_tipo: 'arqueo',
      origen_id: arqueo.id,
      periodo: periodoStr(year, trimestre),
      estado: 'borrador',
    })
    .select('id').single()
  if (asientoErr) return NextResponse.json({ error: asientoErr.message }, { status: 500 })

  // Vincular asiento al arqueo
  await supabase.from('arqueos_caja').update({ asiento_id: asiento.id }).eq('id', arqueo.id)

  return NextResponse.json({
    ok: true,
    arqueo_id: arqueo.id,
    asiento_id: asiento.id,
    num_asiento: numAsiento,
    resumen: {
      total_ventas: Math.round((base_10 + iva_10 + base_21 + iva_21 + base_4 + iva_4) * 100) / 100,
      base_10: Math.round(base_10 * 100) / 100,
      iva_10:  Math.round(iva_10  * 100) / 100,
      base_21: Math.round(base_21 * 100) / 100,
      iva_21:  Math.round(iva_21  * 100) / 100,
      efectivo, tarjeta, bizum,
      num_tickets,
    },
  })
}
