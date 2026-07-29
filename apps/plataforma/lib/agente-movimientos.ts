import { prisma } from '@/lib/db'
import { tgSend, tgSendButtons } from '@central/core-telegram'
import { aiComplete } from '@/lib/ai-client'
import { detectarDeduccionCuotaTipo } from '@/lib/categorizar'
import { claveReglaValida } from '@/lib/correduria'
import { eur } from '@/lib/dinero'

export const PROP_LABELS: Record<string, string> = {
  prop_house_sevillana: 'House Sevillana',
  prop_busto_reform:    'Busto Reform',
  prop_luxury_busto:    'Luxury Busto',
  prop_duplex_center:   'Dúplex Center',
}

type MovDudoso = {
  id: string
  fecha: string
  concepto: string | null
  importe: number
  destino: string | null
}

type MovContexto = {
  concepto: string | null
  importe: number
  destino: string
  fecha: string
}

type Sugerencia = {
  destino: 'turistico_pisos' | 'seguros' | 'personal'
  confianza: number
  explicacion: string
}

// Limpia el concepto de prefijos bancarios para usar como clave de regla.
function limpiarConcepto(concepto: string): string {
  return concepto
    .replace(/^COMPRA EN\s+/i, '')
    .replace(/^PAYPAL \*/i, '')
    .toUpperCase()
    .trim()
    .slice(0, 40)
}

// Devuelve los movimientos dudosos de las cuentas del extracto recién importado.
export async function getMovimientosDudosos(
  cuentaBancariaIds: string[],
  mes: string, // YYYY-MM
): Promise<MovDudoso[]> {
  if (!cuentaBancariaIds.length) return []
  const [anio, numMes] = mes.split('-').map(Number)
  const inicio = `${mes}-01`
  const fin = new Date(anio, numMes, 0).toISOString().slice(0, 10)
  const ids = cuentaBancariaIds
  const rows = await prisma.$queryRaw<MovDudoso[]>`
    SELECT mb.id,
           mb.fecha_operacion::text AS fecha,
           coalesce(mb.concepto_normalizado, mb.concepto) AS concepto,
           mb.importe::float AS importe,
           mb.destino
    FROM movimientos_bancarios mb
    WHERE mb.cuenta_bancaria_id = ANY(${ids}::uuid[])
      AND mb.fecha_operacion BETWEEN ${inicio}::date AND ${fin}::date
      AND coalesce(mb.duplicado_estado, '') <> 'ignorado'
      AND mb.importe < 0
      AND NOT mb.destino_confirmado
      AND (
        mb.requiere_revision = true
        OR (mb.destino = 'seguros' AND mb.banco <> 'BBVA')
      )
    ORDER BY abs(mb.importe) DESC
    LIMIT 15
  `
  return rows
}

// Usa IA + movimientos del mes con destino confirmado para sugerir destino.
export async function sugerirDestinoConContexto(
  mov: MovDudoso,
  movsMes: MovContexto[],
): Promise<Sugerencia> {
  // Filtro de contexto: confirmados, importe > 20€, ±10 días
  const fechaMov = new Date(mov.fecha)
  const contexto = movsMes.filter(m => {
    const d = new Date(m.fecha)
    const diff = Math.abs(d.getTime() - fechaMov.getTime()) / 86400000
    return diff <= 10 && Math.abs(m.importe) > 20 && m.destino !== 'traspaso_interno'
  }).slice(0, 6)

  if (!contexto.length) {
    return { destino: 'personal', confianza: 0, explicacion: '' }
  }

  const prompt = [
    'Eres un asistente fiscal español. Clasifica el siguiente movimiento bancario.',
    '',
    `Movimiento a clasificar: ${mov.concepto} (${mov.fecha}, ${mov.importe}€)`,
    '',
    'Movimientos cercanos del mismo mes ya clasificados:',
    ...contexto.map(m => `- ${m.concepto} (${m.fecha}, ${m.importe}€) → ${m.destino}`),
    '',
    'Opciones de destino:',
    '- turistico_pisos: gasto directo de apartamentos turísticos (deducible renta)',
    '- seguros: gasto de la correduría de seguros (deducible negocio)',
    '- personal: gasto personal (no deducible)',
    '',
    'Responde SOLO con JSON: {"destino":"...","confianza":0.0-1.0,"explicacion":"frase corta en español"}',
  ].join('\n')

  try {
    const raw = await aiComplete([{ role: 'user', content: prompt }])
    const match = raw.match(/\{[\s\S]*?\}/)
    if (!match) throw new Error('no json')
    const parsed = JSON.parse(match[0]) as Sugerencia
    if (!['turistico_pisos', 'seguros', 'personal'].includes(parsed.destino)) throw new Error('destino invalido')
    return parsed
  } catch {
    return { destino: 'personal', confianza: 0, explicacion: '' }
  }
}

const DEST_LABEL: Record<string, string> = {
  turistico_pisos: 'Pisos',
  seguros:         'Correduría',
  personal:        'Personal',
}

// Envía por Telegram un mensaje con botones para clasificar un movimiento dudoso.
export async function enviarMensajeDudoso(mov: MovDudoso, sugerencia: Sugerencia): Promise<void> {
  const concepto = (mov.concepto ?? 'Sin concepto').slice(0, 40).toUpperCase()
  const fecha = mov.fecha.slice(0, 10)
  const importe = Math.abs(mov.importe)

  if (sugerencia.confianza >= 0.8) {
    const destLabel = DEST_LABEL[sugerencia.destino] ?? sugerencia.destino
    await tgSendButtons(
      `❓ <b>${concepto}</b> · ${fecha} · -${eur(importe)}\n\n🤖 ${sugerencia.explicacion}`,
      [[
        { texto: `✅ Sí, ${destLabel}`, callback: `mov_confirmar_ia:${mov.id}:${sugerencia.destino}` },
        { texto: '✏️ Cambiar', callback: `mov_cambiar:${mov.id}` },
        { texto: '⏭️ Saltar', callback: `mov_saltar:${mov.id}` },
      ]],
    )
  } else {
    await tgSendButtons(
      `❓ <b>${concepto}</b> · ${fecha} · -${eur(importe)}`,
      [[
        { texto: '✅ Pisos — deducible',       callback: `mov_pisos:${mov.id}` },
        { texto: '✅ Correduría — deducible',   callback: `mov_correduria:${mov.id}` },
      ], [
        { texto: '❌ Personal — no deducible', callback: `mov_personal:${mov.id}` },
        { texto: '⏭️ Saltar',                  callback: `mov_saltar:${mov.id}` },
      ]],
    )
  }
}

// Aprende la regla: inserta/actualiza banca_destino_reglas con el comercio como clave.
export async function aprenderReglaMovimiento(
  cuentaId: string,
  concepto: string,
  destino: string,
): Promise<void> {
  const clave = limpiarConcepto(concepto)
  // Guardia contra reglas-trampa: no aprender claves genéricas (TRANSF/TOTAL/…) que colisionarían
  // por substring con casi cualquier concepto del banco.
  if (!claveReglaValida(clave)) return
  await prisma.$executeRaw`
    INSERT INTO banca_destino_reglas (cuenta_id, clave, destino)
    VALUES (${cuentaId}::uuid, ${clave}, ${destino})
    ON CONFLICT (cuenta_id, clave) DO UPDATE SET destino = EXCLUDED.destino
  `
}

const CUOTA_LABEL: Record<string, string> = {
  mecenazgo: '🏛️ Mecenazgo (Ley 49/2002)',
  guarderia: '👶 Guardería (Art.81bis)',
  deportiva_and: '⚽ Deportiva And. (15%)',
}

type MovPersonal = {
  id: string
  fecha: string
  concepto: string | null
  contraparte: string | null
  importe: number
}

// Busca movimientos personales del año actual que podrían tener deducción de cuota IRPF.
export async function getMovimientosPersonalesConPotencialCuota(
  cuentaId: string,
  year: number,
): Promise<MovPersonal[]> {
  const inicio = `${year}-01-01`
  const fin = `${year}-12-31`
  const rows = await prisma.$queryRaw<MovPersonal[]>`
    SELECT mb.id,
           mb.fecha_operacion::text AS fecha,
           coalesce(mb.concepto_normalizado, mb.concepto) AS concepto,
           mb.contraparte,
           mb.importe::float AS importe
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
      AND mb.destino = 'personal'
      AND mb.deduccion_cuota_tipo IS NULL
      AND mb.importe < 0
      AND mb.fecha_operacion BETWEEN ${inicio}::date AND ${fin}::date
      AND coalesce(mb.duplicado_estado, '') <> 'ignorado'
    ORDER BY ABS(mb.importe) DESC
    LIMIT 30
  `
  // Filtrar solo los que el detector heurístico reconoce como potencial deducción
  return rows.filter(m => detectarDeduccionCuotaTipo(m.concepto, m.contraparte) !== null)
}

// Envía un mensaje Telegram con botones para clasificar un movimiento personal con deducción de cuota.
export async function enviarMensajeCuotaDeduccion(mov: MovPersonal): Promise<void> {
  const tipo = detectarDeduccionCuotaTipo(mov.concepto, mov.contraparte)
  const concepto = (mov.concepto ?? 'Sin concepto').slice(0, 40).toUpperCase()
  const importe = Math.abs(mov.importe)
  const fecha = mov.fecha.slice(0, 10)

  if (tipo) {
    const tipoLabel = CUOTA_LABEL[tipo] ?? tipo
    await tgSendButtons(
      `💡 <b>${concepto}</b> · ${fecha} · -${eur(importe)}\n\n¿Es una deducción de cuota IRPF?\n🤖 Parece: <b>${tipoLabel}</b>`,
      [[
        { texto: `✅ ${tipoLabel}`, callback: `deduccion_${tipo}:${mov.id}` },
        { texto: '🚫 No, es personal', callback: `deduccion_ninguna:${mov.id}` },
        { texto: '⏭️ Saltar', callback: `mov_saltar:${mov.id}` },
      ]],
    ).catch(() => {})
  } else {
    await tgSendButtons(
      `💡 <b>${concepto}</b> · ${fecha} · -${eur(importe)}\n\n¿Tiene deducción de cuota IRPF?`,
      [[
        { texto: '🏛️ Mecenazgo', callback: `deduccion_mecenazgo:${mov.id}` },
        { texto: '👶 Guardería', callback: `deduccion_guarderia:${mov.id}` },
      ], [
        { texto: '⚽ Deportiva And.', callback: `deduccion_deportiva_and:${mov.id}` },
        { texto: '🚫 No', callback: `deduccion_ninguna:${mov.id}` },
      ]],
    ).catch(() => {})
  }
}

// Envía resumen por Telegram de las deducciones de cuota acumuladas en el año.
export async function enviarResumenCuotaDeducciones(cuentaId: string, year: number): Promise<void> {
  const rows = await prisma.$queryRaw<{ tipo: string; total: unknown; count: unknown }[]>`
    SELECT mb.deduccion_cuota_tipo AS tipo,
           SUM(ABS(mb.importe)) AS total,
           COUNT(*) AS count
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
      AND mb.deduccion_cuota_tipo IS NOT NULL
      AND mb.importe < 0
      AND EXTRACT(year FROM mb.fecha_operacion) = ${year}
      AND coalesce(mb.duplicado_estado, '') <> 'ignorado'
    GROUP BY mb.deduccion_cuota_tipo
  `
  if (!rows.length) return

  const lineas = rows.map(r => {
    const total = Number(r.total)
    const count = Number(r.count)
    const label = CUOTA_LABEL[r.tipo] ?? r.tipo
    let cuota = 0
    if (r.tipo === 'mecenazgo') cuota = Math.round(Math.min(total, 150) * 0.8 + Math.max(0, total - 150) * 0.4)
    else if (r.tipo === 'guarderia') cuota = Math.min(total, 1000)
    else if (r.tipo === 'deportiva_and') cuota = Math.round(Math.min(total, 100) * 0.15)
    return `• ${label}: ${eur(total)} gastado → <b>−${eur(cuota)} en cuota</b> (${count} mov.)`
  })

  await tgSend(`📊 <b>Deducciones de cuota IRPF ${year}</b>\n\n${lineas.join('\n')}`).catch(() => {})
}

// Recupera la cuenta_id y concepto de un movimiento (para los callbacks del webhook).
export async function getMovParaCallback(movId: string): Promise<{
  cuentaId: string; concepto: string | null
} | null> {
  const rows = await prisma.$queryRaw<{ cuenta_id: string; concepto: string | null }[]>`
    SELECT cb.cuenta_id, mb.concepto
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE mb.id = ${movId}::uuid
    LIMIT 1
  `
  const r = rows[0]
  if (!r) return null
  return { cuentaId: r.cuenta_id, concepto: r.concepto }
}
