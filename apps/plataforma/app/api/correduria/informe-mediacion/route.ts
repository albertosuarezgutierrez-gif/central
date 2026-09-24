import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { prisma } from '@/lib/db'
import { brutoEfectivo } from '@/lib/correduria/cuadre'
import { informeMediacionAsegura, interpretarInforme, type ComisionCompania } from '@/lib/informe-mediacion-asegura'

export const dynamic = 'force-dynamic'

/**
 * GET ?año=YYYY — base del informe anual de mediación (DGSFP): lo que sirve asegura (primas por
 * compañía y ramo según CIMA, pólizas en vigor, quejas) + las comisiones del libro de esta app.
 * `comisiones: null` = el libro no se pudo leer (≠ `[]`, «no hay periodos este año»).
 */
export async function GET(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const año = Number(new URL(req.url).searchParams.get('año'))
  if (!Number.isInteger(año) || año < 2000 || año > new Date().getFullYear()) {
    return NextResponse.json({ error: 'Año no válido.' }, { status: 422 })
  }

  const [puerto, comisiones] = await Promise.all([
    informeMediacionAsegura(año).then((r) => interpretarInforme(r.status, r.json)),
    prisma.$queryRaw<{ compania: string; compania_codigo: string; liq_bruto: number | null; liq_retencion: number | null; liq_remesa: number | null; leido_ok: boolean | null }[]>`
      SELECT compania, compania_codigo, liq_bruto::float AS liq_bruto, liq_retencion::float AS liq_retencion,
             liq_remesa::float AS liq_remesa, leido_ok
      FROM comisiones_devengo
      WHERE cuenta_id = ${guarda.session.id}::uuid AND EXTRACT(year FROM periodo_inicio) = ${año}`
      .then((filas) => {
        // Se agrupa por el CÓDIGO (la identidad), no por la etiqueta del libro.
        const por = new Map<string, ComisionCompania>()
        for (const f of filas) {
          const c = por.get(f.compania_codigo) ?? {
            codigo: f.compania_codigo, compania: f.compania, bruto: null, retencion: null,
            periodos: 0, periodosSinExtracto: 0, periodosSinComprobar: 0, periodosSinRetencion: 0,
          }
          c.periodos++
          // Si la última pasada no pudo leer, los importes pueden ser viejos: fuera del total, como hace el cuadre.
          if (f.leido_ok === false) c.periodosSinComprobar++
          else if (f.liq_bruto === null) c.periodosSinExtracto++
          else {
            // Convención de signo de Occident resuelta como en el cuadre: el negativo con remesa 0 se cobró.
            c.bruto = Math.round(((c.bruto ?? 0) + (brutoEfectivo(f.liq_bruto, f.liq_remesa) ?? 0)) * 100) / 100
            if (f.liq_retencion === null) c.periodosSinRetencion++
            else c.retencion = Math.round(((c.retencion ?? 0) + f.liq_retencion) * 100) / 100
          }
          por.set(f.compania_codigo, c)
        }
        return [...por.values()].sort((a, b) => a.compania.localeCompare(b.compania))
      })
      .catch((e) => {
        console.error('[informe-mediacion] no se pudo leer el libro de comisiones:', e instanceof Error ? e.message : e)
        return null
      }),
  ])
  return NextResponse.json({ año, puerto, comisiones })
}
