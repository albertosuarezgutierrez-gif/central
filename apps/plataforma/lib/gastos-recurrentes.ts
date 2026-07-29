import { prisma } from '@/lib/db'
import { aiComplete } from '@/lib/ai-client'

export type PatronRecurrente = {
  concepto: string
  etiqueta: string
  destino: string
  tipo: 'ingreso' | 'gasto'
  importeMedioMensual: number
  mesesDetectado: number
  proyectable: boolean
}

export function calcularMesesRestantes(year: number, now = new Date()): number {
  const yearActual = now.getFullYear()
  if (yearActual > year) return 0
  if (yearActual < year) return 12
  const mesActual = now.getMonth() + 1
  return Math.max(0, 12 - mesActual)
}

type SqlPatron = {
  concepto_normalizado: string
  destino: string
  signo: string
  meses_detectado: unknown
  importe_medio_mensual: unknown
}

// Detección de patrones recurrentes en los últimos 3 meses cerrados (gasto/ingreso que
// aparece en ≥2 meses). Consulta pura y barata; NO llama al LLM.
//
// Nota sobre `proyectable`: se probó una heurística SQL para descartar "pagos atrasados
// en 2 plazos", pero un alquiler recurrente legítimo (p.ej. GUTIERREZ ALCALA) también
// aparece como 2 meses con importe ~igual → la marcaba como NO proyectable y perdía un
// gasto deducible real, sesgando el resultado a "a pagar". No hay señal fiable para
// distinguirlos en SQL, así que se proyectan TODOS los recurrentes (comportamiento
// histórico del fallback). El `proyectable` de la IA se cachea aparte solo como dato
// informativo; NO entra en el número (así la cifra es idéntica con caché fría o caliente).
async function detectarPatronesSQL(cuentaId: string): Promise<SqlPatron[]> {
  return prisma.$queryRaw<SqlPatron[]>`
    WITH movs_periodo AS (
      SELECT
        m.concepto_normalizado,
        m.destino,
        SIGN(m.importe)::int AS signo,
        ABS(m.importe) AS importe_abs,
        date_trunc('month', m.fecha_operacion) AS mes
      FROM v_movimientos_activos m
      JOIN cuentas_bancarias cb ON cb.id = m.cuenta_bancaria_id
      WHERE cb.cuenta_id = ${cuentaId}::uuid
        AND m.destino IN ('seguros', 'turistico_pisos', 'turistico_duplex')
        AND COALESCE(m.amortizable, false) = false
        AND m.fecha_operacion >= date_trunc('month', now()) - INTERVAL '3 months'
        AND m.fecha_operacion <  date_trunc('month', now())
    ),
    grupos AS (
      SELECT
        concepto_normalizado,
        destino,
        signo,
        COUNT(DISTINCT mes)::int AS meses_detectado,
        -- Run-rate MENSUAL = total del periodo / nº de meses distintos. (AVG(importe_abs) daba la
        -- media POR TRANSACCIÓN, que infravalora un recurrente que aparece varias veces al mes.)
        SUM(importe_abs) / COUNT(DISTINCT mes) AS importe_medio_mensual
      FROM movs_periodo
      GROUP BY concepto_normalizado, destino, signo
      HAVING COUNT(DISTINCT mes) >= 2
    )
    SELECT * FROM grupos ORDER BY importe_medio_mensual DESC
  `
}

// Etiquetas legibles cacheadas por el cron `refrescarPatronesIA` (cosmético). NO
// afecta a los números: si un concepto no está cacheado se usa el propio concepto.
async function leerEtiquetasCache(cuentaId: string): Promise<Map<string, string>> {
  const rows = await prisma.$queryRaw<Array<{ concepto_normalizado: string; etiqueta: string }>>`
    SELECT concepto_normalizado, etiqueta
    FROM patrones_recurrentes_cache
    WHERE cuenta_id = ${cuentaId}::uuid
  `
  return new Map(rows.map(r => [r.concepto_normalizado, r.etiqueta]))
}

async function enriquecerConIA(
  candidatos: SqlPatron[]
): Promise<Map<string, { etiqueta: string; proyectable: boolean }>> {
  const prompt = `Eres un asistente fiscal español. Analiza estos movimientos bancarios recurrentes detectados automáticamente y para cada uno indica si es proyectable como gasto/ingreso futuro fijo.

Responde ÚNICAMENTE con un array JSON con este formato exacto (sin texto extra):
[{"idx":0,"etiqueta":"Nombre legible","proyectable":true},...]

Candidatos:
${candidatos.map((c, i) => `${i}. concepto="${c.concepto_normalizado}" destino="${c.destino}" importe_medio=${Number(c.importe_medio_mensual).toFixed(2)}€ tipo=${Number(c.signo) > 0 ? 'ingreso' : 'gasto'}`).join('\n')}

Reglas:
- proyectable=false solo si parece un pago atrasado en 2 plazos, no un gasto fijo real
- etiqueta: nombre corto y descriptivo ("Alquiler Luxury Busto", "Comisiones Generali", etc.)
- Responde solo el array JSON`

  const resultado = await aiComplete([{ role: 'user', content: prompt }], { timeoutMs: 30_000 })
  const jsonStr = resultado.trim().replace(/^```json?\n?/, '').replace(/\n?```$/, '')
  const parsed: Array<{ idx: number; etiqueta: string; proyectable: boolean }> = JSON.parse(jsonStr)
  const mapa = new Map<string, { etiqueta: string; proyectable: boolean }>()
  for (const item of parsed) {
    const c = candidatos[item.idx]
    if (c) mapa.set(c.concepto_normalizado, { etiqueta: item.etiqueta, proyectable: item.proyectable })
  }
  return mapa
}

// Ruta de LECTURA (peticiones de UI): rápida, SIN IA. Los números salen de SQL y la
// etiqueta legible de la caché (si existe). Nunca bloquea en una llamada al LLM.
export async function detectarPatronesRecurrentes(
  cuentaId: string,
  year: number
): Promise<{
  patrones: PatronRecurrente[]
  ingresosProyectados: number
  gastosProyectados: number
  mesesRestantes: number
}> {
  const mesesRestantes = calcularMesesRestantes(year)

  const [candidatos, etiquetas] = await Promise.all([
    detectarPatronesSQL(cuentaId),
    leerEtiquetasCache(cuentaId),
  ])
  if (candidatos.length === 0) {
    return { patrones: [], ingresosProyectados: 0, gastosProyectados: 0, mesesRestantes }
  }

  const patrones: PatronRecurrente[] = candidatos.map(c => ({
    concepto: c.concepto_normalizado,
    etiqueta: etiquetas.get(c.concepto_normalizado) ?? c.concepto_normalizado,
    destino: c.destino,
    tipo: Number(c.signo) > 0 ? 'ingreso' : 'gasto',
    importeMedioMensual: Number(c.importe_medio_mensual),
    mesesDetectado: Number(c.meses_detectado),
    proyectable: true, // determinista: todos los recurrentes se proyectan (ver nota en detectarPatronesSQL)
  }))

  const ingresosProyectados = patrones
    .filter(p => p.tipo === 'ingreso')
    .reduce((s, p) => s + p.importeMedioMensual * mesesRestantes, 0)
  const gastosProyectados = patrones
    .filter(p => p.tipo === 'gasto')
    .reduce((s, p) => s + p.importeMedioMensual * mesesRestantes, 0)

  return { patrones, ingresosProyectados, gastosProyectados, mesesRestantes }
}

// Ruta de ESCRITURA (cron diario): corre la IA (con timeout) y cachea la etiqueta
// legible por concepto. Best-effort: si la IA falla, no cachea nada (la UI seguirá
// mostrando el concepto crudo). NO se llama desde ninguna petición de UI.
export async function refrescarPatronesIA(
  cuentaId: string
): Promise<{ refrescados: number }> {
  const candidatos = await detectarPatronesSQL(cuentaId)
  if (candidatos.length === 0) return { refrescados: 0 }

  const enriquecido = await enriquecerConIA(candidatos)

  let refrescados = 0
  for (const c of candidatos) {
    const ia = enriquecido.get(c.concepto_normalizado)
    const etiqueta = ia?.etiqueta ?? c.concepto_normalizado
    const proyectable = ia?.proyectable ?? true
    await prisma.$executeRaw`
      INSERT INTO patrones_recurrentes_cache
        (cuenta_id, concepto_normalizado, destino, etiqueta, proyectable, updated_at)
      VALUES (${cuentaId}::uuid, ${c.concepto_normalizado}, ${c.destino}, ${etiqueta}, ${proyectable}, now())
      ON CONFLICT (cuenta_id, concepto_normalizado)
      DO UPDATE SET etiqueta = EXCLUDED.etiqueta,
                    destino = EXCLUDED.destino,
                    proyectable = EXCLUDED.proyectable,
                    updated_at = now()
    `
    refrescados++
  }
  return { refrescados }
}
