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
export type Categorizacion = { id: string; categoria: Categoria; conceptoNormalizado: string; categoriaPgc: string; requiereRevision: boolean }

// Clasifica un lote en una sola llamada IA. Devuelve [] si no hay IA o falla.
export async function categorizarLote(movs: MovParaCategorizar[]): Promise<Categorizacion[]> {
  if (movs.length === 0) return []

  const lista = movs.map((m, i) =>
    `${i}. [${m.importe >= 0 ? 'ABONO' : 'CARGO'} ${Math.abs(m.importe).toFixed(2)}€] ${(m.concepto || m.contraparte || '').slice(0, 140)}`,
  ).join('\n')

  const system = `Eres un contable español. Clasificas movimientos bancarios.
Para cada uno devuelve su categoría (UNA de: ${CATEGORIAS.join(', ')}), un "concepto" legible
y breve (máx 60 chars, en español, sin códigos crípticos) y "revisar": true SOLO si NO estás
seguro de la categoría (caso dudoso o ambiguo). Un CARGO suele ser proveedor, nómina,
impuestos, suministros, alquiler, comisión, tarjeta, préstamo o seguro; un ABONO suele ser
cobro_cliente o transferencia. Responde SOLO un array JSON:
[{"i":0,"categoria":"...","concepto":"...","revisar":false}].`

  try {
    // Modelo pequeño y RÁPIDO: categorizar es tarea simple y el 70B por defecto generaba
    // 1400 tokens en >20s → abortaba siempre. El 8B responde en pocos segundos.
    const raw = await aiComplete(lista, { system, model: 'meta/llama-3.1-8b-instruct', maxTokens: 1400, temperature: 0.1, timeoutMs: 45_000 })
    const parsed = JSON.parse(cleanJSON(raw)) as Array<{ i: number; categoria: string; concepto: string; revisar?: boolean }>
    if (!Array.isArray(parsed)) return []
    const out: Categorizacion[] = []
    for (const p of parsed) {
      const mov = movs[p.i]
      if (!mov) continue
      const valida = (CATEGORIAS as readonly string[]).includes(p.categoria)
      const categoria = (valida ? p.categoria : 'otros') as Categoria
      // Pedir revisión cuando la IA lo marca, cuando devolvió algo fuera de la taxonomía,
      // o cuando cayó en 'otros' (cajón de "no lo tengo claro").
      const requiereRevision = p.revisar === true || !valida || categoria === 'otros'
      out.push({
        id: mov.id,
        categoria,
        conceptoNormalizado: (p.concepto || mov.concepto || '').slice(0, 80),
        categoriaPgc: pgcDe(categoria),
        requiereRevision,
      })
    }
    return out
  } catch (e) {
    // Log temporal de diagnóstico (sin secretos): por qué no categorizó.
    console.error('[categorizar] IA falló · hasKey=', !!process.env.NVIDIA_API_KEY, '· error=', e instanceof Error ? e.message : String(e))
    return []
  }
}

// Analiza los movimientos sin categorizar de una cuenta (scoped por cuenta_id).
// Idempotente: solo toca los que tienen analizado_at NULL. Procesa en sub-lotes pequeños
// (cada llamada IA cabe holgada en el presupuesto de tokens). Devuelve cuántos categorizó.
const TAM_LOTE_IA = 25

export async function analizarMovimientos(cuentaId: string, limite = 150): Promise<{ categorizados: number }> {
  const pendientes = await prisma.$queryRaw<Array<{ id: string; concepto: string | null; contraparte: string | null; importe: unknown }>>`
    SELECT mb.id, mb.concepto, mb.contraparte, mb.importe
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid AND mb.analizado_at IS NULL
    ORDER BY mb.fecha_operacion DESC NULLS LAST
    LIMIT ${limite}
  `
  if (pendientes.length === 0) return { categorizados: 0 }

  // Trocear en sub-lotes y PERSISTIR lote a lote: cada respuesta IA cabe sin truncarse y,
  // si la función se queda sin tiempo, lo ya categorizado queda guardado (idempotente:
  // marca analizado_at, así un re-análisis o el cron continúa donde lo dejó).
  let n = 0
  for (let i = 0; i < pendientes.length; i += TAM_LOTE_IA) {
    const trozo = pendientes.slice(i, i + TAM_LOTE_IA)
    const cats = await categorizarLote(
      trozo.map(p => ({ id: p.id, concepto: p.concepto, contraparte: p.contraparte, importe: Number(p.importe) })),
    )
    for (const c of cats) {
      const res = await prisma.$executeRaw`
        UPDATE movimientos_bancarios
        SET categoria = ${c.categoria}, concepto_normalizado = ${c.conceptoNormalizado},
            categoria_pgc = ${c.categoriaPgc}, requiere_revision = ${c.requiereRevision}, analizado_at = now()
        WHERE id = ${c.id}::uuid
          AND cuenta_bancaria_id IN (SELECT id FROM cuentas_bancarias WHERE cuenta_id = ${cuentaId}::uuid)
      `
      n += Number(res)
    }
  }
  return { categorizados: n }
}

// Asignación MANUAL de categoría por el dueño (resuelve un "por revisar"). Valida la
// categoría, deriva la cuenta PGC y quita la marca de revisión. Scoped por cuenta_id.
export async function asignarCategoria(cuentaId: string, movimientoId: string, categoria: string): Promise<boolean> {
  if (!(CATEGORIAS as readonly string[]).includes(categoria)) return false
  const res = await prisma.$executeRaw`
    UPDATE movimientos_bancarios
    SET categoria = ${categoria}, categoria_pgc = ${pgcDe(categoria)},
        requiere_revision = false, analizado_at = now()
    WHERE id = ${movimientoId}::uuid
      AND cuenta_bancaria_id IN (SELECT id FROM cuentas_bancarias WHERE cuenta_id = ${cuentaId}::uuid)
  `
  return Number(res) > 0
}

// Categoriza los movimientos pendientes de TODAS las cuentas que tengan alguno sin analizar
// (lo usa el cron diario tras sincronizar los bancos). Devuelve el total categorizado.
export async function categorizarPendientesTodas(): Promise<{ cuentas: number; categorizados: number }> {
  const cuentas = await prisma.$queryRaw<Array<{ cuenta_id: string }>>`
    SELECT DISTINCT cb.cuenta_id
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE mb.analizado_at IS NULL
  `
  let categorizados = 0
  for (const c of cuentas) {
    const r = await analizarMovimientos(c.cuenta_id, 300).catch(() => ({ categorizados: 0 }))
    categorizados += r.categorizados
  }
  return { cuentas: cuentas.length, categorizados }
}
