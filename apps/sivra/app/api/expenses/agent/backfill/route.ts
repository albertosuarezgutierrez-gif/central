// Puesta al día del año: alquileres recurrentes + barrido de Gmail/Drive de 2026.
// Lanzar a mano. `?dryRun=1` cuenta sin escribir; `?commit=1` ejecuta.
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { listarCandidatos } from '@/lib/agente-facturas/gmail'
import { listNuevos, getContenido, archivar } from '@/lib/agente-facturas/drive'
import { extraerDesdeBuffer } from '@/lib/agente-facturas/extraer'
import { procesarFactura, type ProcesarResult } from '@/lib/agente-facturas/procesar'
import { existeDuplicado, insertarGasto, type DatosGasto } from '@/lib/agente-facturas/imputar'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Recibos de alquiler de Bustos Tavera 22 (importe fijo en 2026).
const ALQUILERES = [
  { fingerprint: 'gutierrez alcala maria:derecha', propiedad: 'prop_luxury_busto', concepto: 'Alquiler Bajo Derecha Bustos Tavera 22', base_imponible: 303.31, iva: 63.70, irpf: 57.63, total: 309.38 },
  { fingerprint: 'gutierrez alcala maria:izquierda', propiedad: 'prop_busto_reform', concepto: 'Alquiler Bajo Izquierda Bustos Tavera 22', base_imponible: 254.08, iva: 53.36, irpf: 48.28, total: 259.16 },
]

export async function GET(req: NextRequest) {
  if (!(await isCronAuthorized(req))) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  const dryRun = req.nextUrl.searchParams.get('commit') !== '1'
  const year = parseInt(req.nextUrl.searchParams.get('year') || String(new Date().getFullYear()))
  const hastaMes = year === new Date().getFullYear() ? new Date().getMonth() + 1 : 12

  const alquileres = { creados: 0, existentes: 0, detalle: [] as string[] }

  // ── 1) Alquileres faltantes ene→hoy ──────────────────────────────────────────
  for (let m = 1; m <= hastaMes; m++) {
    const fecha = `${year}-${String(m).padStart(2, '0')}-08`
    for (const a of ALQUILERES) {
      const existe = await existeDuplicado({ fingerprint: a.fingerprint, numero_factura: null, fecha, total: a.total })
      if (existe) { alquileres.existentes++; continue }
      alquileres.detalle.push(`${fecha} · ${a.propiedad} · ${a.total}€`)
      if (!dryRun) {
        const datos: DatosGasto = {
          fecha, proveedor: 'GUTIERREZ ALCALA, MARIA', nif_proveedor: null, numero_factura: null,
          concepto: a.concepto, categoria: 'ALQUILER', propiedad: a.propiedad,
          base_imponible: a.base_imponible, iva: a.iva, iva_porcentaje: 21, irpf: a.irpf, irpf_porcentaje: 19,
          total: a.total, fingerprint: a.fingerprint, raw_extraction: { origen: 'backfill-alquiler' },
        }
        await insertarGasto(datos, { revisado: true, origen: 'backfill', confianza: 0.95 })
      }
      alquileres.creados++
    }
  }

  // ── 2) Barrido de Gmail/Drive del año (modo mixto) ───────────────────────────
  const stats = { auto: 0, bandeja: 0, duplicados: 0, errores: 0 }
  let emailCandidatos = 0
  let driveCandidatos = 0
  const acumula = (r: ProcesarResult) => {
    if (r.decision === 'auto') stats.auto++
    else if (r.decision === 'duplicado') stats.duplicados++
    else if (r.decision === 'error') stats.errores++
    else stats.bandeja++
  }

  try {
    const correos = await listarCandidatos({ desde: new Date(`${year}-01-01`), etiqueta: process.env.GMAIL_FACTURAS_LABEL || undefined })
    emailCandidatos = correos.length
    if (!dryRun) {
      for (const c of correos) {
        for (const adj of c.adjuntos) {
          try {
            const { data } = await extraerDesdeBuffer(adj.buffer, adj.mime, adj.nombre)
            acumula(await procesarFactura({ ...data, fecha: data.fecha || c.fecha }, { fuente: 'backfill' }))
          } catch { stats.errores++ }
        }
      }
    }
  } catch (e) { console.error('[backfill] Gmail:', e) }

  try {
    const files = await listNuevos()
    driveCandidatos = files.length
    if (!dryRun) {
      for (const f of files) {
        try {
          const { buffer, mimeType, nombre } = await getContenido(f.id)
          const { data } = await extraerDesdeBuffer(buffer, mimeType, nombre)
          const fecha = data.fecha || `${year}-01-01`
          const carpeta = await archivar(f.id, fecha).catch(() => null)
          acumula(await procesarFactura({ ...data, fecha }, { fuente: 'backfill', drive: { url: `https://drive.google.com/file/d/${f.id}/view`, carpeta, nombre } }))
        } catch { stats.errores++ }
      }
    }
  } catch (e) { console.error('[backfill] Drive:', e) }

  return NextResponse.json({
    ok: true, dryRun, year,
    alquileres,
    candidatos: { email: emailCandidatos, drive: driveCandidatos },
    stats: dryRun ? 'no procesado (dry-run)' : stats,
    nota: dryRun ? 'Repite con ?commit=1&secret=... para escribir.' : 'Procesado.',
  })
}
