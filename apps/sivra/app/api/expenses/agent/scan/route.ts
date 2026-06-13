// Cron diario del agente de facturas: lee Gmail + Drive, imputa/encola y avisa.
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { listarCandidatos, marcarProcesado } from '@/lib/agente-facturas/gmail'
import { listNuevos, getContenido, archivar, subir } from '@/lib/agente-facturas/drive'
import { extraerDesdeBuffer } from '@/lib/agente-facturas/extraer'
import { esPresupuesto } from '@/lib/agente-facturas/clasificar'
import { procesarFactura, type ProcesarResult } from '@/lib/agente-facturas/procesar'
import { recurrentesQueFaltan } from '@/lib/agente-facturas/anomalias'
import { avisaBandeja, avisaSinAdjunto, avisaRecurrentesQueFaltan, resumen, type PendienteAviso } from '@/lib/agente-facturas/avisos'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (!(await isCronAuthorized(req))) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })

  const stats = { auto: 0, bandeja: 0, duplicados: 0, omitidos: 0, errores: 0 }
  const pendientes: PendienteAviso[] = []
  const sinAdjunto: { from: string; subject: string }[] = []

  const acumula = (r: ProcesarResult, proveedorFallback?: string) => {
    if (r.decision === 'auto') stats.auto++
    else if (r.decision === 'duplicado') stats.duplicados++
    else if (r.decision === 'omitido') stats.omitidos++
    else if (r.decision === 'error') stats.errores++
    else { stats.bandeja++; pendientes.push({ proveedor: r.proveedor || proveedorFallback || null, total: r.total, motivo: r.motivo }) }
  }

  // ── 1) Gmail: candidatos de las últimas 36h ──────────────────────────────────
  try {
    const desde = new Date(Date.now() - 36 * 3600_000)
    const etiqueta = process.env.GMAIL_FACTURAS_LABEL || undefined
    const correos = await listarCandidatos({ desde, etiqueta })
    for (const c of correos) {
      if (c.sinAdjunto) { sinAdjunto.push({ from: c.from, subject: c.subject }); continue }
      let imputadoAlguno = false
      for (const adj of c.adjuntos) {
        try {
          const { data, texto } = await extraerDesdeBuffer(adj.buffer, adj.mime, adj.nombre)
          const fecha = data.fecha || c.fecha
          const presup = esPresupuesto(texto || '', adj.nombre)
          const drive = presup ? null : await subir(adj.buffer, adj.nombre, adj.mime, fecha).catch(() => null)
          const r = await procesarFactura({ ...data, fecha }, { fuente: 'agente-email', drive: drive || undefined, esPresupuesto: presup })
          acumula(r, c.from)
          if (r.decision !== 'error') imputadoAlguno = true
        } catch (e) {
          stats.errores++
          console.error('[scan] adjunto email error:', e)
        }
      }
      if (imputadoAlguno) await marcarProcesado(c.uid).catch(() => {})
    }
  } catch (e) {
    console.error('[scan] Gmail error:', e)
  }

  // ── 2) Drive: PDFs nuevos en la raíz de la carpeta ───────────────────────────
  try {
    const files = await listNuevos()
    for (const f of files) {
      try {
        const { buffer, mimeType, nombre } = await getContenido(f.id)
        const { data, texto } = await extraerDesdeBuffer(buffer, mimeType, nombre)
        const fecha = data.fecha || new Date().toISOString().slice(0, 10)
        const presup = esPresupuesto(texto || '', nombre)
        // La carpeta es "ALBERTO 2026 PERSONAL" → lo no-pisos va a "Personal".
        const carpeta = presup ? null : await archivar(f.id, fecha).catch(() => null)
        const url = `https://drive.google.com/file/d/${f.id}/view`
        const r = await procesarFactura({ ...data, fecha }, { fuente: 'agente-drive', drive: { url, carpeta, nombre }, propiedadPorDefecto: 'prop_personal', esPresupuesto: presup })
        acumula(r)
      } catch (e) {
        stats.errores++
        console.error('[scan] fichero Drive error:', e)
      }
    }
  } catch (e) {
    console.error('[scan] Drive error:', e)
  }

  // ── 3) Avisos ────────────────────────────────────────────────────────────────
  try {
    const now = new Date()
    const faltan = await recurrentesQueFaltan(now.getFullYear(), now.getMonth() + 1)
    await avisaSinAdjunto(sinAdjunto)
    await avisaBandeja(pendientes)
    await avisaRecurrentesQueFaltan(faltan)
    await resumen({ fuente: 'diario', ...stats })
  } catch (e) {
    console.error('[scan] avisos error:', e)
  }

  return NextResponse.json({ ok: true, stats, pendientes: pendientes.length, sinAdjunto: sinAdjunto.length })
}
