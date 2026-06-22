import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { detectarCompania, motivoSeguros, claveReferencia, COMPANIA_OTRAS } from '@/lib/correduria'

export const dynamic = 'force-dynamic'

// GET /api/correduria/detalle?año=2026&compania=Mapfre&mes=2026-02
// Devuelve los movimientos individuales que componen una celda de la matriz, para que el dueño
// audite de dónde sale el importe y confirme/reclasifique cada uno.
//   - compania: nombre de compañía, o '__TOTAL__' (todas, p.ej. total de un mes/fila),
//               o '__PENDIENTE__' (solo lo que entró por descarte y sin confirmar).
//   - mes: opcional 'YYYY-MM'. Sin él, todo el año (caso "total de fila").
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const año = parseInt(searchParams.get('año') || '') || new Date().getFullYear()
  const compania = searchParams.get('compania') || '__TOTAL__'
  const mes = searchParams.get('mes') || ''

  const rows = await prisma.$queryRaw<Array<{
    id: string
    fecha_operacion: Date | null
    concepto: string | null
    concepto_normalizado: string | null
    contraparte: string | null
    banco: string | null
    destino_confirmado: boolean | null
    compania_seguros: string | null
    importe: unknown
    mes: string
  }>>`
    SELECT mb.id, mb.fecha_operacion, mb.concepto, mb.concepto_normalizado, mb.contraparte,
           cb.banco, mb.destino_confirmado, mb.compania_seguros, mb.importe,
           to_char(date_trunc('month', mb.fecha_operacion), 'YYYY-MM') AS mes
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${session.id}::uuid
      AND mb.destino = 'seguros'
      AND mb.importe > 0
      AND coalesce(mb.duplicado_estado, '') <> 'ignorado'
      AND EXTRACT(year FROM mb.fecha_operacion) = ${año}
    ORDER BY mb.fecha_operacion DESC
  `

  // Reglas aprendidas (clave → compañía) de la cuenta.
  const reglasRows = await prisma.$queryRaw<Array<{ clave: string; compania: string }>>`
    SELECT clave, compania FROM correduria_reglas WHERE cuenta_id = ${session.id}::uuid
  `
  const reglas = new Map(reglasRows.map(r => [r.clave, r.compania]))

  const movimientos = rows
    .filter(r => !mes || r.mes === mes)
    .map(r => {
      const motivo = motivoSeguros(r.banco, r.concepto, r.contraparte)
      const reglaCompania = reglas.get(claveReferencia(r.concepto) ?? '')
      // Prioridad: override manual → regla aprendida → detección automática.
      const compania = r.compania_seguros || reglaCompania
        || detectarCompania(r.concepto ?? '', r.concepto_normalizado ?? '', r.contraparte ?? '')
      return {
        id: r.id,
        fecha: r.fecha_operacion ? r.fecha_operacion.toISOString().slice(0, 10) : '',
        concepto: r.concepto_normalizado || r.concepto || '',
        contraparte: r.contraparte || '',
        banco: r.banco || '',
        importe: Math.round(Number(r.importe) * 100) / 100,
        confirmado: !!r.destino_confirmado,
        compania,
        companiaManual: !!r.compania_seguros,
        companiaRegla: !r.compania_seguros && !!reglaCompania,
        motivo,
      }
    })
    .filter(m => {
      if (compania === '__TOTAL__') return true
      if (compania === '__PENDIENTE__') return m.motivo === 'descarte' && !m.confirmado && m.compania === COMPANIA_OTRAS
      return m.compania === compania
    })

  return NextResponse.json({ movimientos })
}
