// Auto-categorización IA de movimientos bancarios (Fase 2). Usa el núcleo gratis
// @central/core-ai (NVIDIA NIM); si no hay NVIDIA_API_KEY o falla, degrada limpio
// (los movimientos quedan sin categorizar, el import no se rompe).
//
// La IA SOLO decide la categoría y normaliza el concepto críptico. La cuenta del
// plan contable (PGC) se deriva en código desde la categoría (determinista, sin
// alucinación). Reanalizar es idempotente (marca analizado_at).

import { aiComplete, cleanJSON } from '@central/core-ai'
import { prisma } from './db'

// Taxonomía cerrada de categorías (la IA debe elegir una de estas).
export const CATEGORIAS = [
  'nomina', 'proveedor', 'impuestos', 'suministros', 'alquiler',
  'comision_bancaria', 'cobro_cliente', 'transferencia', 'tarjeta',
  'prestamo', 'seguro', 'otros',
] as const
export type Categoria = typeof CATEGORIAS[number]

// Mapa categoría → cuenta PGC orientativa (Plan General Contable español).
const PGC: Record<Categoria, string> = {
  nomina: '640', proveedor: '600', impuestos: '475', suministros: '628',
  alquiler: '621', comision_bancaria: '626', cobro_cliente: '700',
  transferencia: '572', tarjeta: '572', prestamo: '170', seguro: '625', otros: '629',
}

function pgcDe(cat: string): string {
  return (CATEGORIAS as readonly string[]).includes(cat) ? PGC[cat as Categoria] : PGC.otros
}

export type MovParaCategorizar = { id: string; concepto: string | null; contraparte: string | null; importe: number }
export type Categorizacion = { id: string; categoria: Categoria; conceptoNormalizado: string; categoriaPgc: string }

// Clasifica un lote en una sola llamada IA. Devuelve [] si no hay IA o falla.
export async function categorizarLote(movs: MovParaCategorizar[]): Promise<Categorizacion[]> {
  if (movs.length === 0) return []

  const lista = movs.map((m, i) =>
    `${i}. [${m.importe >= 0 ? 'ABONO' : 'CARGO'} ${Math.abs(m.importe).toFixed(2)}€] ${(m.concepto || m.contraparte || '').slice(0, 140)}`,
  ).join('\n')

  const system = `Eres un contable español. Clasificas movimientos bancarios.
Para cada uno devuelve su categoría (UNA de: ${CATEGORIAS.join(', ')}) y un "concepto" legible
y breve (máx 60 chars, en español, sin códigos crípticos). Un CARGO suele ser proveedor, nómina,
impuestos, suministros, alquiler, comisión, tarjeta, préstamo o seguro; un ABONO suele ser
cobro_cliente o transferencia. Responde SOLO un array JSON: [{"i":0,"categoria":"...","concepto":"..."}].`

  try {
    const raw = await aiComplete(lista, { system, maxTokens: 1200, temperature: 0.1, timeoutMs: 20_000 })
    const parsed = JSON.parse(cleanJSON(raw)) as Array<{ i: number; categoria: string; concepto: string }>
    if (!Array.isArray(parsed)) return []
    const out: Categorizacion[] = []
    for (const p of parsed) {
      const mov = movs[p.i]
      if (!mov) continue
      const categoria = ((CATEGORIAS as readonly string[]).includes(p.categoria) ? p.categoria : 'otros') as Categoria
      out.push({
        id: mov.id,
        categoria,
        conceptoNormalizado: (p.concepto || mov.concepto || '').slice(0, 80),
        categoriaPgc: pgcDe(categoria),
      })
    }
    return out
  } catch {
    return []
  }
}

// Analiza los movimientos sin categorizar de una cuenta (scoped por cuenta_id).
// Idempotente: solo toca los que tienen analizado_at NULL. Devuelve cuántos categorizó.
export async function analizarMovimientos(cuentaId: string, limite = 60): Promise<{ categorizados: number }> {
  const pendientes = await prisma.$queryRaw<Array<{ id: string; concepto: string | null; contraparte: string | null; importe: unknown }>>`
    SELECT mb.id, mb.concepto, mb.contraparte, mb.importe
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid AND mb.analizado_at IS NULL
    ORDER BY mb.fecha_operacion DESC NULLS LAST
    LIMIT ${limite}
  `
  if (pendientes.length === 0) return { categorizados: 0 }

  const cats = await categorizarLote(
    pendientes.map(p => ({ id: p.id, concepto: p.concepto, contraparte: p.contraparte, importe: Number(p.importe) })),
  )
  if (cats.length === 0) return { categorizados: 0 }

  // Persistencia: un UPDATE por movimiento (lote pequeño), scoped por cuenta vía la subconsulta.
  let n = 0
  for (const c of cats) {
    const res = await prisma.$executeRaw`
      UPDATE movimientos_bancarios
      SET categoria = ${c.categoria}, concepto_normalizado = ${c.conceptoNormalizado},
          categoria_pgc = ${c.categoriaPgc}, analizado_at = now()
      WHERE id = ${c.id}::uuid
        AND cuenta_bancaria_id IN (SELECT id FROM cuentas_bancarias WHERE cuenta_id = ${cuentaId}::uuid)
    `
    n += Number(res)
  }
  return { categorizados: n }
}
