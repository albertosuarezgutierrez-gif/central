import Anthropic from '@anthropic-ai/sdk'
import { prisma } from './db'

const anthropic = new Anthropic()

export function normalizarContraparte(raw: string | null): string {
  if (!raw) return ''
  return raw
    .toUpperCase()
    .replace(/\b\d{3,}\b/g, '')
    .replace(/\bS\.?A\.?\b/g, '')
    .replace(/\bSL\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export type MovParaCategoria = {
  id: string
  concepto: string | null
  contraparte: string | null
  importe: number
  destino: string | null
}

async function buscarRegla(cuentaBancariaId: string, clave: string): Promise<string | null> {
  if (!clave) return null
  const rows = await prisma.$queryRaw<{ subcategoria: string }[]>`
    SELECT r.subcategoria
    FROM banca_destino_reglas r
    JOIN cuentas_bancarias cb ON cb.cuenta_id = r.cuenta_id
    WHERE cb.id = ${cuentaBancariaId}::uuid
      AND r.subcategoria IS NOT NULL
      AND ${clave} ILIKE '%' || r.clave || '%'
    ORDER BY length(r.clave) DESC
    LIMIT 1
  `
  return rows[0]?.subcategoria ?? null
}

async function categorizarConIA(mov: MovParaCategoria): Promise<{ subcategoria: string; confianza: number }> {
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      temperature: 0.1,
      messages: [{
        role: 'user',
        content: `Clasifica este movimiento bancario con la subcategoría más precisa posible.
Concepto: ${mov.concepto ?? ''}
Comercio: ${mov.contraparte ?? ''}
Importe: ${mov.importe}€ (${mov.importe < 0 ? 'gasto' : 'ingreso'})
Destino general: ${mov.destino ?? 'desconocido'}

Responde SOLO con JSON válido, sin texto adicional:
{"subcategoria":"<categoría>","confianza":<0.0-1.0>}

Categorías de gasto: supermercado, restaurante_bar, gasolina, farmacia, ropa, colegio, deporte, suscripcion, hogar, suministros_piso, reforma, seguro, transporte, ocio, otros_gasto
Categorías de ingreso: alquiler_booking, alquiler_airbnb, alquiler_transferencia, comision_seguro, nomina, transferencia_familiar, otros_ingreso`,
      }],
    })
    const text = (msg.content[0] as { type: string; text: string }).text.trim()
    return JSON.parse(text) as { subcategoria: string; confianza: number }
  } catch {
    return { subcategoria: mov.importe < 0 ? 'otros_gasto' : 'otros_ingreso', confianza: 0.5 }
  }
}

async function persistirRegla(cuentaBancariaId: string, clave: string, subcategoria: string) {
  await prisma.$executeRaw`
    INSERT INTO banca_destino_reglas (cuenta_id, clave, destino, subcategoria)
    SELECT cb.cuenta_id, ${clave}, 'personal', ${subcategoria}
    FROM cuentas_bancarias cb WHERE cb.id = ${cuentaBancariaId}::uuid
    ON CONFLICT (cuenta_id, clave) DO UPDATE SET subcategoria = EXCLUDED.subcategoria
  `
}

export async function categorizarMovimiento(
  cuentaBancariaId: string,
  mov: MovParaCategoria,
): Promise<string> {
  if (mov.destino === 'actividad_pilar') return mov.subcategoria ?? 'gasto_profesional'

  const clave = normalizarContraparte(mov.contraparte)

  const reglaSub = await buscarRegla(cuentaBancariaId, clave)
  if (reglaSub) {
    await prisma.$executeRaw`
      UPDATE movimientos_bancarios SET subcategoria = ${reglaSub}
      WHERE id = ${mov.id}::uuid
    `
    return reglaSub
  }

  const { subcategoria, confianza } = await categorizarConIA(mov)
  const requiereRevision = confianza < 0.85

  await prisma.$executeRaw`
    UPDATE movimientos_bancarios
    SET subcategoria = ${subcategoria},
        requiere_revision = ${requiereRevision} OR requiere_revision
    WHERE id = ${mov.id}::uuid
  `

  if (!requiereRevision && clave) {
    await persistirRegla(cuentaBancariaId, clave, subcategoria)
  }

  return subcategoria
}

export async function categorizarLoteSinSubcategoria(
  cuentaBancariaId?: string,
  limite = 200,
): Promise<{ procesados: number }> {
  type Row = { id: string; concepto: string | null; contraparte: string | null; importe: number; destino: string | null; cuenta_bancaria_id: string }
  const rows: Row[] = cuentaBancariaId
    ? await prisma.$queryRaw<Row[]>`
        SELECT m.id, m.concepto, m.contraparte, m.importe::float, m.destino, m.cuenta_bancaria_id
        FROM movimientos_bancarios m
        WHERE m.subcategoria IS NULL
          AND COALESCE(m.duplicado_estado, '') <> 'ignorado'
          AND COALESCE(m.destino, '') <> 'actividad_pilar'
          AND m.cuenta_bancaria_id = ${cuentaBancariaId}::uuid
        ORDER BY m.fecha_operacion DESC
        LIMIT ${limite}
      `
    : await prisma.$queryRaw<Row[]>`
        SELECT m.id, m.concepto, m.contraparte, m.importe::float, m.destino, m.cuenta_bancaria_id
        FROM movimientos_bancarios m
        WHERE m.subcategoria IS NULL
          AND COALESCE(m.duplicado_estado, '') <> 'ignorado'
          AND COALESCE(m.destino, '') <> 'actividad_pilar'
        ORDER BY m.fecha_operacion DESC
        LIMIT ${limite}
      `

  let procesados = 0
  for (let i = 0; i < rows.length; i += 20) {
    const lote = rows.slice(i, i + 20)
    await Promise.allSettled(
      lote.map(r => categorizarMovimiento(r.cuenta_bancaria_id, r))
    )
    procesados += lote.length
  }
  return { procesados }
}
