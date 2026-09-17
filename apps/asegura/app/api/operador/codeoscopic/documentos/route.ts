import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { correduriaUnica } from '@/lib/cartera'
import { prisma } from '@/lib/tenant'
import { resolverConfigEmision, leerProyectoCrudo, redactarCrudoVendor } from '@/lib/codeoscopic/emitir'
import { peticion } from '@/lib/codeoscopic/cliente'
import { solicitudesEmision } from '@/lib/codeoscopic/reintento-emision'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `GET ?projectId=` — lo que Codeoscopic devuelve de la SOLICITUD DE EMISIÓN
 * de un proyecto, en crudo, incluido `issuedDocuments[]` si lo manda.
 *
 * 🚨 17/09/2026: la forma exacta del tag `File` dentro de `issuedDocuments[]`
 * NO está documentada en el portal (solo en el OpenAPI vivo, bloqueado desde
 * este contenedor por el proxy — hay que leerlo desde Vercel o Chrome). Este
 * endpoint NO adivina esa forma: lee el `GET /insurances/{id}` (gratis, ya
 * cableado en `/proyecto`) para encontrar el `id` de la solicitud, hace el
 * `GET .../policy-applications/{id}` (Retrieve, también gratis) y devuelve
 * la respuesta TAL CUAL — y la persiste en `quote_data` para no perderla
 * otra vez. Ver esa respuesta real es lo que permite diseñar la extracción
 * del PDF sin inventar el nombre de un campo.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) {
    return NextResponse.json({ estado: 'error', mensaje: 'no autorizado' }, { status: 401 })
  }

  const projectId = new URL(req.url).searchParams.get('projectId')?.trim()
  if (!projectId) {
    return NextResponse.json({ estado: 'error', mensaje: 'falta projectId' }, { status: 400 })
  }

  const r = resolverConfigEmision()
  if (r.estado !== 'lista') {
    return NextResponse.json(
      { estado: 'error', mensaje: r.estado === 'apagado' ? r.motivo : `faltan variables: ${r.faltan.join(', ')}` },
      { status: 503 },
    )
  }

  let proyectoCrudo: unknown
  try {
    proyectoCrudo = await leerProyectoCrudo(r.config, projectId)
  } catch (e) {
    return NextResponse.json(
      { estado: 'error', mensaje: `no se pudo leer el proyecto: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    )
  }

  const solicitudes = solicitudesEmision(proyectoCrudo)
  if (solicitudes.length === 0) {
    return NextResponse.json({
      estado: 'ok',
      encontrada: false,
      mensaje: 'el proyecto no cuenta ninguna solicitud de emisión (`policyApplications[]` vacío)',
      proyectoCrudo: redactarCrudoVendor(proyectoCrudo),
    })
  }
  // La solicitud viva: aprobada si hay alguna, si no la primera con id.
  const solicitud = solicitudes.find((s) => s.veredicto === 'aprobada' && s.id) ?? solicitudes.find((s) => s.id) ?? solicitudes[0]
  if (!solicitud.id) {
    return NextResponse.json({
      estado: 'ok',
      encontrada: true,
      solicitud,
      mensaje: 'la solicitud no trae `id`: no se puede pedir el Retrieve individual',
    })
  }

  let policyApplication: unknown
  try {
    policyApplication = await peticion(r.config, {
      metodo: 'GET',
      path: `/insurances/${encodeURIComponent(projectId)}/policy-applications/${encodeURIComponent(solicitud.id)}`,
      timeoutMs: r.config.timeoutGenericoMs,
    })
  } catch (e) {
    return NextResponse.json({
      estado: 'ok',
      encontrada: true,
      solicitud,
      mensaje: `no se pudo hacer el Retrieve individual: ${e instanceof Error ? e.message : String(e)}`,
    })
  }

  // Best-effort: guarda la respuesta cruda para no perderla otra vez. SIEMPRE
  // redactada — `policyApplication` trae IBAN/DNI/email/teléfono del tomador
  // y `quote_data` es jsonb sin cifrar (a diferencia de `clientes.iban/dni`).
  const policyApplicationRedactado = redactarCrudoVendor(policyApplication)
  const correduria = await correduriaUnica().catch(() => null)
  if (correduria) {
    await prisma.$executeRaw`
      update codeoscopic_projects set quote_data = ${JSON.stringify(policyApplicationRedactado)}::jsonb
      where correduria_id = ${correduria.id}::uuid and project_id_codeoscopic = ${projectId}
    `.catch(() => {})
  }

  const issuedDocuments = (policyApplicationRedactado as Record<string, unknown> | null)?.issuedDocuments ?? null

  return NextResponse.json({
    estado: 'ok',
    encontrada: true,
    solicitud,
    issuedDocuments,
    policyApplication: policyApplicationRedactado,
  })
}
