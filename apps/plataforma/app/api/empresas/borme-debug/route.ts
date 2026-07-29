import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

// TEMPORAL: diagnóstico de la estructura real del sumario BORME (se elimina tras ajustar el parser).
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const fecha = sp.get('fecha') || new Date().toISOString().slice(0, 10)
  const yyyymmdd = fecha.replace(/-/g, '')
  const out: Record<string, unknown> = { fecha, yyyymmdd }

  try {
    const r = await fetch(`https://www.boe.es/datosabiertos/api/borme/sumario/${yyyymmdd}`, {
      headers: { Accept: 'application/json' },
    })
    out.httpStatus = r.status
    const txt = await r.text()
    out.rawLength = txt.length
    let j: any = null
    try {
      j = JSON.parse(txt)
    } catch {
      out.notJson = true
      out.rawHead = txt.slice(0, 2000)
      return NextResponse.json(out)
    }

    out.topKeys = Object.keys(j || {})
    const sumario = j?.data?.sumario ?? j?.sumario
    out.sumarioKeys = sumario ? Object.keys(sumario) : null
    const diario = sumario?.diario
    out.diarioType = Array.isArray(diario) ? `array(${diario.length})` : typeof diario
    const d0 = Array.isArray(diario) ? diario[0] : diario
    out.diario0Keys = d0 ? Object.keys(d0) : null

    const secciones = d0?.seccion
    const secArr = Array.isArray(secciones) ? secciones : secciones ? [secciones] : []
    out.secciones = secArr.map((s: any) => ({
      keys: Object.keys(s || {}),
      codigo: s?.codigo,
      nombre: s?.nombre,
      hasItem: !!s?.item,
      hasDepartamento: !!s?.departamento,
    }))

    function firstItems(sec: any): any[] {
      if (Array.isArray(sec?.item)) return sec.item
      const deps = sec?.departamento ? (Array.isArray(sec.departamento) ? sec.departamento : [sec.departamento]) : []
      const acc: any[] = []
      for (const dep of deps) {
        if (Array.isArray(dep?.item)) acc.push(...dep.item)
        const eps = dep?.epigrafe ? (Array.isArray(dep.epigrafe) ? dep.epigrafe : [dep.epigrafe]) : []
        for (const ep of eps) if (Array.isArray(ep?.item)) acc.push(...ep.item)
      }
      return acc
    }
    const items = secArr.flatMap(firstItems)
    out.itemsEncontrados = items.length
    out.itemSample = items.slice(0, 2)

    const conXml = items.find((it: any) => it?.url_xml || it?.urlXml || it?.url_pdf)
    if (conXml) {
      const xmlUrl: string = conXml.url_xml || conXml.urlXml || ''
      out.xmlUrl = xmlUrl
      if (xmlUrl) {
        try {
          const rx = await fetch(xmlUrl.startsWith('http') ? xmlUrl : `https://www.boe.es${xmlUrl}`)
          out.xmlStatus = rx.status
          out.xmlHead = (await rx.text()).slice(0, 3500)
        } catch (e) {
          out.xmlError = String(e)
        }
      }
    }
  } catch (e) {
    out.error = String(e)
  }
  return NextResponse.json(out)
}
