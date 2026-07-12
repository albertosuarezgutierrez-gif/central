// apps/plataforma/lib/contable/respuestas-directas.ts
// Responde por SQL las intenciones detectadas por intencion.ts, SIN LLM. Todo scoped por cuenta_id
// (multi-tenant) y excluyendo duplicados (`duplicado_estado <> 'ignorado'`, el landmine del doble
// conteo). OJO: la columna de fecha es `fecha_operacion`, NO `fecha`. Devuelve el texto ya listo,
// o null si NO puede responder con confianza (→ el cerebro cae al LLM).
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { getResumenFinanciero } from '@/lib/finanzas'
import { getResumenSivra } from '@/lib/financiero'
import { NOMBRE_MES, type Intencion } from './intencion'
import { clavesDeSubcategoria } from '@/lib/subcategoria-keywords'
import { eur } from '@/lib/dinero'

// Euros enteros con separador de miles y € pegado (12450 → "12.450€"), sin decimales — para las cifras
// grandes de base imponible del tramo fiscal. El resto de importes usan eur() de lib/dinero (formato
// español con decimales: 2.162,49€). NUNCA "€${x.toFixed(2)}" ni el € separado por un espacio.
const e0 = (n: number) => `${Math.round(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}€`

const DESTINO_LABEL: Record<string, string> = {
  turistico_pisos: 'Pisos turísticos', turistico_duplex: 'Dúplex/Villasís',
  seguros: 'Correduría (seguros)', personal: 'Personal', traspaso_interno: 'Traspaso interno',
}

// Suma de movimientos (gasto = importe<0, ingreso = importe>0) con condiciones extra opcionales.
async function suma(
  cuentaId: string, signo: 'gasto' | 'ingreso', extra: Prisma.Sql,
): Promise<{ total: number; n: number } | null> {
  const cond = signo === 'gasto' ? Prisma.sql`mb.importe < 0` : Prisma.sql`mb.importe > 0`
  const rows = await prisma.$queryRaw<{ total: number; n: bigint }[]>(Prisma.sql`
    SELECT coalesce(sum(abs(mb.importe)), 0)::float8 AS total, count(*)::bigint AS n
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
      AND (mb.duplicado_estado IS NULL OR mb.duplicado_estado <> 'ignorado')
      AND ${cond}
      ${extra}`).catch(() => null)
  if (!rows) return null
  return { total: Number(rows[0]?.total || 0), n: Number(rows[0]?.n || 0) }
}

export async function responderDirecto(cuentaId: string, intn: Intencion): Promise<string | null> {
  const palabra = (s: 'gasto' | 'ingreso') => (s === 'gasto' ? 'gastado' : 'ingresado')

  if (intn.tipo === 'movimientos_mes') {
    const r = await suma(cuentaId, intn.signo, Prisma.sql`
      AND EXTRACT(year FROM mb.fecha_operacion) = ${intn.anio}
      AND EXTRACT(month FROM mb.fecha_operacion) = ${intn.mes}`)
    if (!r) return null
    const per = `${NOMBRE_MES[intn.mes]} de ${intn.anio}`
    return r.n === 0
      ? `No veo ${intn.signo === 'gasto' ? 'gastos' : 'ingresos'} en ${per}.`
      : `En ${per} llevas ${eur(r.total)} ${palabra(intn.signo)} (${r.n} movimiento${r.n === 1 ? '' : 's'}).`
  }

  if (intn.tipo === 'movimientos_anio') {
    const r = await suma(cuentaId, intn.signo, Prisma.sql`AND EXTRACT(year FROM mb.fecha_operacion) = ${intn.anio}`)
    if (!r) return null
    return r.n === 0
      ? `No veo ${intn.signo === 'gasto' ? 'gastos' : 'ingresos'} en ${intn.anio}.`
      : `En ${intn.anio} llevas ${eur(r.total)} ${palabra(intn.signo)} (${r.n} movimiento${r.n === 1 ? '' : 's'}).`
  }

  // Gasto de CONSUMO por subcategoría (super, bares, gasolina…). Fuente: la columna `subcategoria`
  // (mismo eje que la pestaña Categorías) O las palabras clave del diccionario (así acierta aunque el
  // movimiento aún esté sin auto-clasificar). SOLO personal (no negocio) — es análisis de consumo.
  if (intn.tipo === 'subcategoria') {
    const texto = Prisma.sql`(coalesce(mb.concepto_normalizado,'') || ' ' || coalesce(mb.concepto,'') || ' ' || coalesce(mb.contraparte,''))`
    const claves = clavesDeSubcategoria(intn.subcategoria)
    const kw = claves.length
      ? Prisma.join(claves.map(c => Prisma.sql`${texto} ILIKE ${'%' + c + '%'}`), ' OR ')
      : Prisma.sql`false`
    const mesCond = intn.mes ? Prisma.sql`AND EXTRACT(month FROM mb.fecha_operacion) = ${intn.mes}` : Prisma.empty
    const r = await suma(cuentaId, 'gasto', Prisma.sql`
      AND coalesce(mb.destino, 'personal') = 'personal'
      AND (mb.subcategoria = ${intn.subcategoria} OR (${kw}))
      AND EXTRACT(year FROM mb.fecha_operacion) = ${intn.anio}
      ${mesCond}`)
    if (!r) return null
    const per = intn.mes ? `${NOMBRE_MES[intn.mes]} de ${intn.anio}` : `${intn.anio}`
    return r.n === 0
      ? `No veo gasto en ${intn.etiqueta} en ${per}.`
      : `En ${intn.etiqueta} llevas ${eur(r.total)} gastado en ${per} (${r.n} movimiento${r.n === 1 ? '' : 's'}).`
  }

  // Gasto/ingreso de un SEGMENTO de negocio (correduría=seguros, pisos=turistico_*): se suma por la
  // columna `destino` (mismo eje que la pestaña Gastos y que `por_destino`, pero para UN segmento).
  if (intn.tipo === 'gasto_destino') {
    const mesCond = intn.mes ? Prisma.sql`AND EXTRACT(month FROM mb.fecha_operacion) = ${intn.mes}` : Prisma.empty
    const r = await suma(cuentaId, intn.signo, Prisma.sql`
      AND coalesce(mb.destino, 'personal') IN (${Prisma.join(intn.destinos)})
      AND EXTRACT(year FROM mb.fecha_operacion) = ${intn.anio}
      ${mesCond}`)
    if (!r) return null
    const per = intn.mes ? `${NOMBRE_MES[intn.mes]} de ${intn.anio}` : `${intn.anio}`
    return r.n === 0
      ? `No veo ${intn.signo === 'gasto' ? 'gastos' : 'ingresos'} de ${intn.etiqueta} en ${per}.`
      : `En ${intn.etiqueta} llevas ${eur(r.total)} ${palabra(intn.signo)} en ${per} (${r.n} movimiento${r.n === 1 ? '' : 's'}).`
  }

  // Ingreso de un PISO turístico concreto. Fuente: la tabla `incomes` (por reserva; NETO `amount`),
  // la MISMA que pinta el dashboard por negocio. Para el año reutiliza getResumenSivra (idéntico al
  // dashboard: `ingresosHoy` = reservas ya cerradas a día de hoy, `ingresosYtd` = año completo con las
  // futuras). Para un mes concreto suma `incomes` de ese mes (por check-in). El banco NO sirve aquí:
  // agrega todos los pisos en `turistico_pisos` sin separar por piso.
  if (intn.tipo === 'ingresos_piso') {
    if (intn.mes) {
      const rows = await prisma.$queryRaw<{ total: number; n: bigint }[]>(Prisma.sql`
        SELECT coalesce(sum(amount), 0)::float8 AS total, count(*)::bigint AS n
        FROM incomes
        WHERE "propertyId" = ${intn.propertyId}
          AND EXTRACT(year FROM date) = ${intn.anio}
          AND EXTRACT(month FROM date) = ${intn.mes}`).catch(() => null)
      if (!rows) return null
      const total = Number(rows[0]?.total || 0), n = Number(rows[0]?.n || 0)
      const per = `${NOMBRE_MES[intn.mes]} de ${intn.anio}`
      return n === 0
        ? `No veo ingresos de ${intn.etiqueta} en ${per}.`
        : `En ${intn.etiqueta} ingresaste ${eur(total)} en ${per} (${n} reserva${n === 1 ? '' : 's'}).`
    }
    const r = await getResumenSivra(intn.anio, intn.propertyId).catch(() => null)
    if (!r || !r.disponible) return null
    const realizado = r.ingresosHoy ?? r.ingresosYtd
    const proy = r.ingresosYtd
    // Nº de reservas ya cerradas (mismo criterio que ingresosHoy de getResumenSivra: checkout pasado).
    const nrows = await prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`
      SELECT count(*)::bigint AS n
      FROM incomes
      WHERE "propertyId" = ${intn.propertyId}
        AND EXTRACT(year FROM date) = ${intn.anio}
        AND (("checkOut" IS NOT NULL AND "checkOut"::date <= CURRENT_DATE)
             OR ("checkOut" IS NULL AND date::date <= CURRENT_DATE))`).catch(() => null)
    const n = nrows ? Number(nrows[0]?.n || 0) : 0
    const reservas = n ? ` (${n} reserva${n === 1 ? '' : 's'})` : ''
    const cola = proy > realizado + 0.5 ? ` · proyección con reservas futuras: ${eur(proy)}` : ''
    return `${intn.etiqueta} lleva ${eur(realizado)} ingresado en ${intn.anio}${reservas}${cola}.`
  }

  if (intn.tipo === 'concepto') {
    const likes = intn.terminos.map(term =>
      Prisma.sql`(coalesce(mb.concepto_normalizado,'') || ' ' || coalesce(mb.concepto,'') || ' ' || coalesce(mb.contraparte,'')) ILIKE ${'%' + term + '%'}`)
    const mesCond = intn.mes ? Prisma.sql`AND EXTRACT(month FROM mb.fecha_operacion) = ${intn.mes}` : Prisma.empty
    // Concepto acotado por NEGOCIO ("comunidad del dúplex"): filtra por `destino` además del ILIKE, y
    // el rótulo compone concepto + segmento ("En comunidad del Dúplex llevas…"). Sin negocio → como antes.
    const destCond = intn.destinos && intn.destinos.length
      ? Prisma.sql`AND coalesce(mb.destino, 'personal') IN (${Prisma.join(intn.destinos)})`
      : Prisma.empty
    const r = await suma(cuentaId, intn.signo, Prisma.sql`
      AND EXTRACT(year FROM mb.fecha_operacion) = ${intn.anio}
      ${mesCond}
      ${destCond}
      AND (${Prisma.join(likes, ' OR ')})`)
    if (!r) return null
    const per = intn.mes ? `${NOMBRE_MES[intn.mes]} de ${intn.anio}` : `${intn.anio}`
    const etq = intn.destinoEtiqueta ? `${intn.etiqueta} ${intn.destinoEtiqueta}` : intn.etiqueta
    return r.n === 0
      ? `No encuentro cargos de ${etq} en ${per}. (Puede que estén con otro nombre — dímelo y lo afino.)`
      : `En ${etq} llevas ${eur(r.total)} ${palabra(intn.signo)} en ${per} (${r.n} cargo${r.n === 1 ? '' : 's'}).`
  }

  if (intn.tipo === 'por_destino') {
    const rows = await prisma.$queryRaw<{ destino: string; gastos: number; ingresos: number }[]>(Prisma.sql`
      SELECT coalesce(mb.destino, 'personal') AS destino,
             sum(CASE WHEN mb.importe < 0 THEN -mb.importe ELSE 0 END)::float8 AS gastos,
             sum(CASE WHEN mb.importe > 0 THEN  mb.importe ELSE 0 END)::float8 AS ingresos
      FROM movimientos_bancarios mb
      JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
      WHERE cb.cuenta_id = ${cuentaId}::uuid
        AND (mb.duplicado_estado IS NULL OR mb.duplicado_estado <> 'ignorado')
        AND EXTRACT(year FROM mb.fecha_operacion) = ${intn.anio}
      GROUP BY 1 ORDER BY 2 DESC`).catch(() => null)
    if (!rows) return null
    if (!rows.length) return `No veo movimientos en ${intn.anio}.`
    const lineas = rows.map(x => `• ${DESTINO_LABEL[x.destino] || x.destino}: ${eur(x.gastos)} gasto · ${eur(x.ingresos)} ingreso`)
    return `Desglose ${intn.anio} por destino:\n${lineas.join('\n')}`
  }

  if (intn.tipo === 'facturas_pendientes') {
    const rows = await prisma.$queryRaw<{ proveedor: string; importe: number; estado: string }[]>(Prisma.sql`
      SELECT proveedor, importe::float8 AS importe, estado
      FROM facturas_proveedor
      WHERE cuenta_id = ${cuentaId}::uuid AND estado NOT IN ('pagada', 'rechazada')
      ORDER BY fecha_factura DESC NULLS LAST LIMIT 15`).catch(() => null)
    if (!rows) return null
    if (!rows.length) return 'No tienes facturas de proveedor pendientes 🎉'
    const total = rows.reduce((s, x) => s + Math.abs(Number(x.importe) || 0), 0)
    const lineas = rows.map(x => `• ${x.proveedor} · ${eur(Math.abs(Number(x.importe) || 0))} · ${x.estado}`)
    return `Tienes ${rows.length} factura${rows.length === 1 ? '' : 's'} de proveedor sin cerrar (${eur(total)}):\n${lineas.join('\n')}`
  }

  if (intn.tipo === 'tramo_fiscal') {
    // Mismo cálculo que /finanzas (tramos IRPF sobre la base imponible estimada del año).
    const resumen = await getResumenFinanciero(cuentaId, intn.anio).catch(() => null)
    const f = resumen?.fiscal
    if (!f || !f.tramoActual) return null
    const pct = (x: number) => `${Math.round((x || 0) * 100)}%`
    const ta = f.tramoActual
    const rango = ta.hasta != null ? `de ${e0(ta.desde)} a ${e0(ta.hasta)}` : `a partir de ${e0(ta.desde)}`
    const margen = f.margenHastaProximoTramo != null
      ? ` Te faltan ${e0(f.margenHastaProximoTramo)} de base para saltar al siguiente tramo.`
      : ' Ya estás en el tramo más alto.'
    return `Ahora mismo tu tramo marginal de IRPF es el **${pct(ta.tipo)}** (${rango}), con una base imponible estimada de ${e0(f.baseImponibleEstimada)} para ${intn.anio} y un tipo medio efectivo del ${pct(f.tipoEfectivo)}.${margen}\n\n(Estimación con lo declarado en la app hasta hoy; el detalle está en 💶 Finanzas.)`
  }

  return null
}
