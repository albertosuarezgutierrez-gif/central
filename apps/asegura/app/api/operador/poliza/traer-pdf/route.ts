import { NextResponse } from 'next/server'

import { aseguraConfigurada, prismaAsegura } from '@/lib/asegura-db'
import { auditado } from '@/lib/auditoria'
import { correduriaUnica } from '@/lib/cartera'
import { proyectosDelTomador } from '@/lib/codeoscopic/buscar-proyectos'
import { resolverConfigEmision } from '@/lib/codeoscopic/emitir'
import { traerPdfEmitido, type PdfTraido } from '@/lib/codeoscopic/traer-pdf-emitido'
import { descifrarCampo } from '@/lib/cartera-edicion'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { operadorAutorizado } from '@/lib/operador'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_CANDIDATOS = 15
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST /api/operador/poliza/traer-pdf { polizaId, projectId? } — trae de Codeoscopic el PDF de una póliza
 * ya emitida (gratis: solo GET) y lo archiva visible para el cliente. Para las emitidas en Avant2 a mano o
 * antes de que esto fuera automático (Alberto, 26/09/2026: «buscarla en Codeoscopic, lo he emitido con
 * ellos»). Sin `projectId` se usa el proyecto enlazado, y si no hay, se buscan los proyectos del tomador
 * por su DNI en el último año y se prueba cada uno. 🚨 El número de póliza de la solicitud aprobada
 * tiene que ser el de ESTA póliza: si no, 422 y no se guarda nada — el cliente vería un PDF ajeno.
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const polizaId = typeof b?.polizaId === 'string' ? b.polizaId.trim() : ''
  if (!UUID.test(polizaId)) return NextResponse.json({ estado: 'invalido', motivo: 'polizaId no válido' }, { status: 422 })
  const pedido = typeof b?.projectId === 'string' || typeof b?.projectId === 'number' ? String(b.projectId).trim() : ''
  if (pedido && !/^\d{4,12}$/.test(pedido)) return NextResponse.json({ estado: 'invalido', motivo: 'el nº de proyecto son solo cifras' }, { status: 422 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })
    const [p] = await prismaAsegura().$queryRaw<{ numero: string | null; projectId: string | null; dniCifrado: string | null }[]>`
      select numero_poliza as numero,
        (select c.dni from clientes c where c.id = p.cliente_id) as "dniCifrado",
        (select cp.project_id_codeoscopic::text from codeoscopic_projects cp where cp.poliza_id = p.id limit 1) as "projectId"
      from polizas p where p.id = ${polizaId}::uuid and p.correduria_id = ${correduria.id}::uuid and p.merged_into_poliza_id is null`
    if (!p) return NextResponse.json({ estado: 'no_encontrado' }, { status: 404 })
    if (!p.numero?.trim()) return NextResponse.json({ estado: 'sin_numero', motivo: 'la póliza no tiene número: no se puede comprobar que el PDF sea suyo' }, { status: 422 })
    const responder = (t: PdfTraido, projectId: string) => {
      const status = t.estado === 'archivado' ? 200 : t.estado === 'aun_no' ? 409 : t.estado === 'no_coincide' ? 422 : 502
      return NextResponse.json({ ...t, projectId }, { status })
    }
    const projectId = pedido || p.projectId
    if (projectId) return responder(await traerPdfEmitido(correduria.id, projectId, polizaId, { numeroPolizaEsperado: p.numero }), projectId)

    // Sin proyecto: buscar por el DNI del tomador. Cada candidato pasa la MISMA comprobación del número.
    const dni = descifrarCampo(p.dniCifrado)
    if (!dni) return NextResponse.json({ estado: 'sin_proyecto', motivo: 'la póliza no tiene proyecto enlazado ni DNI del tomador legible: indica el nº de proyecto de Avant2' }, { status: 422 })
    const cfg = resolverConfigEmision()
    if (cfg.estado !== 'lista') return NextResponse.json({ estado: 'error', motivo: 'Codeoscopic no está configurado' }, { status: 502 })
    const candidatos = (await proyectosDelTomador(cfg.config, dni)).slice(0, MAX_CANDIDATOS)
    let pendiente: { t: PdfTraido; id: string } | null = null
    for (const id of candidatos) {
      const t = await traerPdfEmitido(correduria.id, id, polizaId, { numeroPolizaEsperado: p.numero })
      if (t.estado === 'archivado') return responder(t, id)
      // Proyecto correcto pero la compañía aún no lo ha generado (o falló la descarga): se informa ese.
      if (t.estado === 'error' || (t.estado === 'aun_no' && !pendiente)) pendiente = { t, id }
    }
    if (pendiente) return responder(pendiente.t, pendiente.id)
    return NextResponse.json({
      estado: 'no_encontrado_en_codeoscopic',
      motivo: candidatos.length
        ? `revisados ${candidatos.length} proyecto(s) del tomador en el último año: ninguno emitió la póliza ${p.numero}. Indica el nº de proyecto o súbela a mano`
        : 'el tomador no tiene proyectos con solicitud de emisión en Codeoscopic en el último año. Si no se emitió por ahí, súbela a mano como «Póliza»',
      revisados: candidatos.length,
    }, { status: 404 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/poliza/traer-pdf', e) }, { status: 503 })
  }
})
