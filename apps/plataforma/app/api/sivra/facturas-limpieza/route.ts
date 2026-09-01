// Facturas de limpieza (Si que Brilla) con su desglose REAL por piso.
//
// El P&L por piso infiere el desglose de cada pago por mejor ajuste al importe; la factura lo
// dice. Aquí se aporta: un PDF (lo lee la IA) o el desglose a mano. En ambos casos pasa por la
// MISMA validación aritmética (`validarFactura`): si las líneas no suman el total, no se guarda.
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { requireEmpresaId } from '@/lib/tenant'
import { LIMPIEZA_TARIFAS } from '@/lib/sivra/pl-mensual'
import { validarFactura, type FacturaCruda } from '@/lib/sivra/factura-limpieza'
import {
  MAX_BYTES_FACTURA,
  PROVEEDOR_LIMPIEZA,
  guardarFactura,
  procesarFacturaLimpieza,
} from '@/lib/sivra/factura-limpieza-lectura'

export const dynamic = 'force-dynamic'
// Leer una factura escaneada por visión se come minutos.
export const maxDuration = 300

async function cuenta(): Promise<string | null> {
  try { return await requireEmpresaId() } catch { return null }
}

export async function GET() {
  const cuentaId = await cuenta()
  if (!cuentaId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const filas = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT id, numero, periodo, fecha::text AS fecha, total, lavanderia, limpieza, fuente,
           nombre_fichero, avisos, creada_at
    FROM limpieza_facturas
    WHERE cuenta_id = ${cuentaId} AND proveedor = ${PROVEEDOR_LIMPIEZA}
    ORDER BY COALESCE(periodo, '') DESC, creada_at DESC
    LIMIT 50
  `)
  return NextResponse.json({ facturas: filas })
}

export async function POST(req: NextRequest) {
  const cuentaId = await cuenta()
  if (!cuentaId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  try {
    const tipo = req.headers.get('content-type') ?? ''

    // ── Vía A: PDF/foto → lo lee la IA ─────────────────────────────────────────
    if (tipo.includes('multipart/form-data')) {
      const form = await req.formData()
      const fichero = form.get('fichero')
      if (!(fichero instanceof File)) {
        return NextResponse.json({ error: 'Falta el fichero de la factura' }, { status: 400 })
      }
      if (fichero.size > MAX_BYTES_FACTURA) {
        return NextResponse.json({ error: 'El fichero pesa demasiado (máx. 15 MB)' }, { status: 413 })
      }
      const res = await procesarFacturaLimpieza(cuentaId, {
        pdf: Buffer.from(await fichero.arrayBuffer()),
        mediaType: fichero.type || 'application/pdf',
        nombreFichero: fichero.name || null,
      }, LIMPIEZA_TARIFAS)

      // 200 aunque no se guarde: «no he sabido leerla» es una respuesta, no un error del cliente.
      return NextResponse.json({
        guardada: res.guardada,
        via: res.via,
        motivo: res.motivo,
        avisos: res.avisos,
        factura: res.factura,
      })
    }

    // ── Vía B: el desglose a mano (la factura delante) ─────────────────────────
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })
    }
    const { factura, avisos } = validarFactura(body as FacturaCruda, LIMPIEZA_TARIFAS)
    if (!factura) {
      return NextResponse.json({ guardada: false, motivo: avisos[0] ?? 'El desglose no cuadra con el total', avisos })
    }
    await guardarFactura(cuentaId, factura, 'manual', avisos)
    return NextResponse.json({ guardada: true, factura, avisos, motivo: null })
  } catch (err) {
    console.error('[facturas-limpieza]', err)
    return NextResponse.json({ error: 'Error procesando la factura' }, { status: 500 })
  }
}
