// Puesta al día del año: alquileres recurrentes + barrido de Gmail/Drive de 2026.
// Lanzar a mano. `?dryRun=1` cuenta sin escribir; `?commit=1` ejecuta.
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { listarCandidatos } from '@/lib/agente-facturas/gmail'
import { listNuevos, getContenido, archivar } from '@/lib/agente-facturas/drive'
import { extraerDesdeBuffer } from '@/lib/agente-facturas/extraer'
import { procesarFactura, clasificarDocumento, type ProcesarResult } from '@/lib/agente-facturas/procesar'
import { generarGastosFijos, sincronizarReglasFijas } from '@/lib/agente-facturas/gastos-fijos'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (!(await isCronAuthorized(req))) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  const dryRun = req.nextUrl.searchParams.get('commit') !== '1'
  const year = parseInt(req.nextUrl.searchParams.get('year') || String(new Date().getFullYear()))
  const hastaMes = year === new Date().getFullYear() ? new Date().getMonth() + 1 : 12

  // ── 1) Gastos fijos (alquileres, comunidades…) ene→hoy ───────────────────────
  // Las plantillas viven en `gastos_fijos` (ver /gastos-fijos). Aquí solo se
  // backfillean los meses pasados del año; el día 1 de cada mes el cron los crea solo.
  const alquileres = { creados: 0, existentes: 0, detalle: [] as string[] }
  if (!dryRun) await sincronizarReglasFijas()
  for (let m = 1; m <= hastaMes; m++) {
    const r = await generarGastosFijos(year, m, { commit: !dryRun, sincronizar: false })
    alquileres.creados += r.creados
    alquileres.existentes += r.existentes
    alquileres.detalle.push(...r.detalle)
  }

  // ── 2) Barrido de Gmail/Drive del año (modo mixto) ───────────────────────────
  const stats = { auto: 0, bandeja: 0, duplicados: 0, omitidos: 0, errores: 0 }
  let emailCandidatos = 0
  let driveCandidatos = 0
  const acumula = (r: ProcesarResult) => {
    if (r.decision === 'auto') stats.auto++
    else if (r.decision === 'duplicado') stats.duplicados++
    else if (r.decision === 'omitido') stats.omitidos++
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
            const { data, texto } = await extraerDesdeBuffer(adj.buffer, adj.mime, adj.nombre)
            const doc = clasificarDocumento(data, texto || '', adj.nombre)
            acumula(await procesarFactura({ ...doc.factura, fecha: doc.factura.fecha || c.fecha }, {
              fuente: 'backfill', esPresupuesto: doc.esPresupuesto, fingerprintOverride: doc.fingerprintOverride,
            }))
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
          const { data, texto } = await extraerDesdeBuffer(buffer, mimeType, nombre)
          const doc = clasificarDocumento(data, texto || '', nombre)
          const fecha = doc.factura.fecha || `${year}-01-01`
          const carpeta = doc.archivar ? await archivar(f.id, fecha).catch(() => null) : null
          acumula(await procesarFactura({ ...doc.factura, fecha }, {
            fuente: 'backfill', drive: { url: `https://drive.google.com/file/d/${f.id}/view`, carpeta, nombre },
            propiedadPorDefecto: doc.esBooking ? undefined : 'prop_personal',
            esPresupuesto: doc.esPresupuesto, fingerprintOverride: doc.fingerprintOverride,
          }))
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
