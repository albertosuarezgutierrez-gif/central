export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import {
  generarAsientoCierreDiario, periodoStr, trimestreActual,
  PGC_DEFECTO, type ConfigContabilidad,
} from '@/lib/contabilidad'
import { calcularCuadreCaja, calcularCuadrePorEmpleado, resumirDescuadresEmpleado, type MovimientoCaja, type FilaArqueoEmpleado } from '@central/module-contabilidad'
import { enviarPushARoles } from '@/lib/push'

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
  // Conteo físico opcional del arqueo (desde la UI). Si no llega, el cuadre se
  // calcula con el último arqueo/cierre registrado en movimientos_caja.
  const desgloseManual: Record<string, number> | null = body.desglose_monedas ?? null
  const fondoFinalManual: number | null = body.fondo_final ?? null
  const notas: string | null = body.notas ?? null
  // Motivo por empleado (clave = camarero_id; 'general' para la caja sin asignar).
  const notasPorEmpleado: Record<string, string> = body.notas_por_empleado ?? {}
  // Conciliación de tarjeta: importe liquidado por el datáfono/banco (opcional).
  const tarjetaLiquidada: number | null = body.tarjeta_liquidada != null ? Number(body.tarjeta_liquidada) : null

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

  // 3b. Cuadre de caja: reconstruir el saldo teórico del cajón desde el libro de
  // movimientos (apertura, cobros efectivo, retiros, gastos) y compararlo con el
  // conteo físico (desglose manual de la UI o el último arqueo/cierre del día).
  const { data: movsCaja } = await supabase
    .from('movimientos_caja')
    .select('tipo, importe, desglose_monedas, camarero_id, camarero_nombre, turno_id, created_at')
    .eq('local_id', rid)
    .gte('created_at', `${fecha}T00:00:00`)
    .lt('created_at',  `${fecha}T23:59:59`)
    .order('created_at', { ascending: true })

  const movs = (movsCaja ?? []) as (MovimientoCaja & { turno_id?: string | null })[]

  // Cruce con turno: los movimientos sin camarero asignado se atribuyen al titular
  // de su turno (para que no caigan en "Caja general" en el cuadre por empleado).
  const turnoIds = [...new Set(movs.filter(m => !m.camarero_id && m.turno_id).map(m => m.turno_id!))]
  if (turnoIds.length) {
    const { data: turnos } = await supabase.from('turnos').select('id, camarero_id').in('id', turnoIds)
    const turnoCam = new Map((turnos ?? []).map(t => [t.id, t.camarero_id as string | null]))
    const camIds = [...new Set((turnos ?? []).map(t => t.camarero_id).filter(Boolean) as string[])]
    const { data: cams } = camIds.length
      ? await supabase.from('camareros').select('id, nombre').in('id', camIds)
      : { data: [] as { id: string; nombre: string }[] }
    const camNombre = new Map((cams ?? []).map(c => [c.id, c.nombre as string]))
    for (const m of movs) {
      if (!m.camarero_id && m.turno_id) {
        const cid = turnoCam.get(m.turno_id)
        if (cid) { m.camarero_id = cid; m.camarero_nombre = camNombre.get(cid) ?? m.camarero_nombre ?? null }
      }
    }
  }

  // Modo caja única: cuadre global (se persiste en arqueos_caja).
  const cuadre = calcularCuadreCaja(movs, { fondoFinalManual, desgloseManual })
  // Modo caja por empleado: cuadre individual (se persiste en arqueos_caja_empleado).
  const cuadre_por_empleado = calcularCuadrePorEmpleado(movs)

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
    local_id: rid, fecha,
    base_10: Math.round(base_10 * 100) / 100, iva_10: Math.round(iva_10 * 100) / 100,
    base_21: Math.round(base_21 * 100) / 100, iva_21: Math.round(iva_21 * 100) / 100,
    base_4:  Math.round(base_4  * 100) / 100, iva_4:  Math.round(iva_4  * 100) / 100,
    efectivo: Math.round(efectivo * 100) / 100,
    tarjeta:  Math.round(tarjeta  * 100) / 100,
    bizum:    Math.round(bizum    * 100) / 100,
    qr: 0, otros: 0,
    propinas_efectivo: Math.round(propinas_efectivo * 100) / 100,
    propinas_tarjeta:  Math.round(propinas_tarjeta  * 100) / 100,
    fondo_inicial: cuadre.fondo_inicial,
    salidas_caja:  cuadre.salidas_caja,
    fondo_final:   cuadre.fondo_final,
    diferencia_caja: cuadre.diferencia_caja,
    tarjeta_liquidada: tarjetaLiquidada,
    diferencia_tarjeta: tarjetaLiquidada != null ? Math.round((tarjetaLiquidada - tarjeta) * 100) / 100 : null,
    num_comandas: num_tickets, num_tickets,
    ticket_medio: num_tickets > 0 ? Math.round((base_10 + iva_10 + base_21 + iva_21) / num_tickets * 100) / 100 : 0,
  }

  // 4b. Motivo obligatorio: si un empleado supera el umbral debe llevar justificación
  // (en notas_por_empleado[camarero_id|'general'] o, como respaldo, en las notas globales).
  const umbral = Number(cfgData?.umbral_descuadre ?? 5)
  const pendientes = cuadre_por_empleado
    .filter(e => e.cuadre.conteo_realizado && Math.abs(e.cuadre.diferencia_caja) > umbral)
    .filter(e => {
      const k = e.camarero_id ?? 'general'
      return !(notasPorEmpleado[k]?.trim()) && !(notas?.trim())
    })
    .map(e => ({ camarero_id: e.camarero_id, camarero_nombre: e.camarero_nombre ?? 'Caja general' }))
  if (pendientes.length) {
    return NextResponse.json(
      { error: 'Falta el motivo del descuadre para algún empleado.', pendientes }, { status: 400 },
    )
  }

  // 5. Upsert arqueo
  const { data: arqueo, error: arqueoErr } = await supabase
    .from('arqueos_caja')
    .upsert({ ...arqueoInput, estado: 'borrador', cerrado_por: session.id, notas }, { onConflict: 'local_id,fecha' })
    .select('id').single()
  if (arqueoErr) return NextResponse.json({ error: arqueoErr.message }, { status: 500 })

  // 5b. Persistir el cuadre POR EMPLEADO (auditoría individual).
  // delete-then-insert por arqueo_id → idempotente al recerrar el mismo día.
  await supabase.from('arqueos_caja_empleado').delete().eq('arqueo_id', arqueo.id)
  if (cuadre_por_empleado.length) {
    await supabase.from('arqueos_caja_empleado').insert(
      cuadre_por_empleado.map(e => ({
        arqueo_id: arqueo.id,
        local_id: rid,
        fecha,
        camarero_id: e.camarero_id,
        camarero_nombre: e.camarero_nombre,
        fondo_inicial:   e.cuadre.fondo_inicial,
        cobros_efectivo: e.cuadre.cobros_efectivo,
        salidas_caja:    e.cuadre.salidas_caja,
        saldo_teorico:   e.cuadre.saldo_teorico,
        fondo_final:     e.cuadre.fondo_final,
        diferencia_caja: e.cuadre.diferencia_caja,
        conteo_realizado: e.cuadre.conteo_realizado,
        notas: notasPorEmpleado[e.camarero_id ?? 'general']?.trim() || null,
      })),
    )
  }

  // 5c. Alertas: empleados que superan el umbral de descuadre → push al owner/gestor.
  const alertas = cuadre_por_empleado
    .filter(e => e.cuadre.conteo_realizado && Math.abs(e.cuadre.diferencia_caja) > umbral)
    .map(e => ({ camarero_id: e.camarero_id, camarero_nombre: e.camarero_nombre, diferencia_caja: e.cuadre.diferencia_caja, recurrente: false }))

  if (alertas.length) {
    // Patrón recurrente: mirar el histórico reciente (60 días) de esos empleados.
    const ids = alertas.map(a => a.camarero_id).filter(Boolean) as string[]
    if (ids.length) {
      const desde60 = new Date(Date.now() - 60 * 864e5).toISOString().split('T')[0]
      const { data: hist } = await supabase
        .from('arqueos_caja_empleado')
        .select('camarero_id, camarero_nombre, fecha, diferencia_caja, conteo_realizado')
        .eq('local_id', rid).in('camarero_id', ids).gte('fecha', desde60)
        .order('fecha', { ascending: true })
      const recurrentes = new Set(
        resumirDescuadresEmpleado((hist ?? []) as FilaArqueoEmpleado[])
          .filter(r => r.patron_recurrente).map(r => r.camarero_id),
      )
      for (const a of alertas) if (recurrentes.has(a.camarero_id)) a.recurrente = true
    }

    const lineas = alertas.map(a =>
      `${a.camarero_nombre ?? 'Caja general'}: ${a.diferencia_caja > 0 ? '+' : ''}${a.diferencia_caja.toFixed(2)}€${a.recurrente ? ' ⚠️recurrente' : ''}`,
    )
    await enviarPushARoles({
      supabase, localId: rid, roles: ['owner', 'gestor'],
      title: `⚠️ Descuadre de caja (${fecha})`,
      body: lineas.join(' · '),
      data: { tipo: 'descuadre_caja', fecha },
    })
  }

  // 5d. Alerta de conciliación de tarjeta (sistema vs liquidado por banco).
  const difTarjeta = tarjetaLiquidada != null ? Math.round((tarjetaLiquidada - tarjeta) * 100) / 100 : null
  if (difTarjeta != null && Math.abs(difTarjeta) > umbral) {
    await enviarPushARoles({
      supabase, localId: rid, roles: ['owner', 'gestor'],
      title: `⚠️ Descuadre de tarjeta (${fecha})`,
      body: `Sistema ${tarjeta.toFixed(2)}€ vs liquidado ${tarjetaLiquidada!.toFixed(2)}€ (${difTarjeta > 0 ? '+' : ''}${difTarjeta.toFixed(2)}€)`,
      data: { tipo: 'descuadre_tarjeta', fecha },
    })
  }

  // 5e. Abastecimiento de cambio: avisar si el conteo final baja de los mínimos por denominación.
  const minMonedas: Record<string, number> = (cfgData?.min_monedas as Record<string, number> | null) ?? {}
  const ctrlMovs = movs.filter(m => (m.tipo === 'arqueo' || m.tipo === 'cierre') && m.desglose_monedas)
  const desgloseFinal: Record<string, number> = desgloseManual
    ?? (ctrlMovs.length ? (ctrlMovs[ctrlMovs.length - 1].desglose_monedas as Record<string, number>) : {})
  const aviso_cambio = Object.entries(minMonedas)
    .map(([denom, min]) => {
      const tiene = Number(desgloseFinal[denom] ?? 0)
      const m = Number(min) || 0
      return tiene < m ? { denom, faltan: m - tiene } : null
    })
    .filter((x): x is { denom: string; faltan: number } => x != null)

  // 6. Generar asiento contable
  const numAsiento = (await supabase.rpc('siguiente_num_asiento', { p_restaurante_id: rid })).data as number ?? 1
  const { concepto, tipo, lineas } = generarAsientoCierreDiario(arqueoInput, cfg, numAsiento)
  const { year, trimestre } = trimestreActual()

  const { data: asiento, error: asientoErr } = await supabase
    .from('asientos_contables')
    .insert({
      local_id: rid,
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
    cuadre,
    cuadre_por_empleado,
    umbral_descuadre: umbral,
    conteo_ciego: !!cfgData?.conteo_ciego,
    tarjeta_liquidada: tarjetaLiquidada,
    diferencia_tarjeta: difTarjeta,
    aviso_cambio,
    alertas,
  })
}
