import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { prisma } from '@/lib/tenant'
import { correduriaUnica } from '@/lib/cartera'
import { catalogoCompanias, registrarPolizaEmitida } from '@/lib/emision'
import { resolverConfigEmision, camposDeEmision } from '@/lib/codeoscopic/emitir'
import { enviarEmision } from '@/lib/codeoscopic/emitir-envio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * `POST /api/operador/codeoscopic/emitir` — el Submit de verdad
 * (`POST /insurances/{id}/policy-applications`), y el acuñado en nuestra BD
 * si el vendor lo acepta.
 *
 * 🚨 **Construida el 11/09/2026, sin sandbox y sin fixture del fabricante.**
 * El propio portal avisa de que esta operación puede aceptar el producto
 * principal y fallar en los addons, sin decir cómo reanudarlo — por eso
 * `crudo` (la respuesta ENTERA del vendor) viaja siempre en la respuesta,
 * salga bien o mal. Detrás de `CODEOSCOPIC_EMISION_ACTIVA` y con un candado
 * de un solo intento por proyecto (`lib/codeoscopic/emitir.ts::enviarEmision`).
 *
 * ── Cuerpo ──────────────────────────────────────────────────────────────────
 *   { projectId, confirmado: true, campos?: Record<string, unknown> }
 *
 * `projectId` tiene que tener ya una oferta confirmada por
 * `POST .../oferta` (ReRate) — si no, se corta con 409 antes de llamar a
 * nadie. `campos` son los datos que pida `policy-application-fields` (se
 * consulta aquí mismo, gratis, y viaja en la respuesta de error si faltan).
 */
export async function POST(req: Request) {
  if (!operadorAutorizado(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const cuerpo = (await req.json().catch(() => ({}))) as Record<string, unknown>

  if (cuerpo.confirmado !== true) {
    return NextResponse.json(
      {
        estado: 'error',
        causa: 'sin_confirmar',
        mensaje:
          'Hay que mandar `confirmado: true` (booleano) para emitir de verdad: sin sandbox, esta ' +
          'llamada compromete un contrato real y no se dispara sin una confirmación explícita.',
      },
      { status: 400 },
    )
  }

  const projectId = cadena(cuerpo.projectId)
  if (!projectId) {
    return NextResponse.json({ estado: 'error', causa: 'otro', mensaje: 'falta projectId' }, { status: 400 })
  }
  const camposCliente = esObjeto(cuerpo.campos) ? cuerpo.campos : {}
  const actor = cadena(cuerpo.actor) ?? 'plataforma'

  const correduria = await correduriaUnica().catch(() => null)
  if (!correduria) {
    return NextResponse.json(
      { estado: 'error', causa: 'otro', mensaje: 'no se ha podido resolver la correduría' },
      { status: 503 },
    )
  }

  const filas = await prisma.$queryRaw<
    { poliza_id: string | null; aseguradora: string | null; accepted_offer_id_codeoscopic: string | null }[]
  >`
    select poliza_id::text as poliza_id, aseguradora, accepted_offer_id_codeoscopic
    from codeoscopic_projects
    where correduria_id = ${correduria.id}::uuid and project_id_codeoscopic = ${projectId}
  `
  const p = filas[0]
  if (!p || !p.accepted_offer_id_codeoscopic || !p.aseguradora) {
    return NextResponse.json(
      {
        estado: 'error',
        causa: 'otro',
        mensaje:
          'este proyecto no tiene una oferta confirmada todavía: primero POST .../oferta (ReRate), ' +
          'y solo con esa respuesta en la mano se llama a esto.',
      },
      { status: 409 },
    )
  }
  if (!p.poliza_id) {
    return NextResponse.json(
      {
        estado: 'error',
        causa: 'otro',
        mensaje: 'este proyecto no está enlazado a ninguna póliza de la cartera: no se sabe de quién es',
      },
      { status: 409 },
    )
  }

  const polizas = await prisma.$queryRaw<
    { cliente_id: string; tipo: string; fraccionamiento: string | null; datos_especificos: unknown }[]
  >`
    select cliente_id::text as cliente_id, tipo::text as tipo, fraccionamiento::text as fraccionamiento, datos_especificos
    from polizas where id = ${p.poliza_id}::uuid and correduria_id = ${correduria.id}::uuid
  `
  const poliza = polizas[0]
  if (!poliza) {
    return NextResponse.json(
      { estado: 'error', causa: 'otro', mensaje: 'la póliza enlazada a este proyecto ya no existe' },
      { status: 404 },
    )
  }

  const r = resolverConfigEmision()
  if (r.estado !== 'lista') {
    return NextResponse.json(
      {
        estado: 'error',
        causa: 'apagado',
        mensaje: r.estado === 'apagado' ? r.motivo : `faltan variables: ${r.faltan.join(', ')}`,
      },
      { status: 503 },
    )
  }

  // GRATIS: lo que el vendor dice que hace falta. Informativo — no bloquea el
  // Submit si no se pudo leer (un endpoint sin fixture puede tener otra forma
  // de la que se ha adivinado); lo que sí decide si algo faltaba de verdad es
  // la respuesta del propio Submit.
  const campos = await camposDeEmision(r.config, projectId, p.accepted_offer_id_codeoscopic).catch(
    () => null,
  )
  const faltan = (campos ?? [])
    .filter((c) => c.obligatorio && !(c.id in camposCliente))
    .map((c) => c.id)
  if (faltan.length > 0) {
    return NextResponse.json(
      {
        estado: 'error',
        causa: 'faltan_campos',
        mensaje: 'el vendor pide estos campos para emitir y no han llegado en `campos`',
        faltan,
        campos,
      },
      { status: 422 },
    )
  }

  const envio = await enviarEmision(r.config, {
    correduriaId: correduria.id,
    projectId,
    offerId: p.accepted_offer_id_codeoscopic,
    campos: camposCliente,
  })

  if (!envio.ok) {
    return NextResponse.json(
      { estado: 'error', causa: envio.razon, mensaje: envio.mensaje, crudo: envio.crudo ?? null },
      { status: envio.razon === 'en-vuelo' ? 409 : 502 },
    )
  }

  // ── El vendor aceptó: se acuña la póliza en NUESTRA BD ──────────────────
  const catalogo = await catalogoCompanias()
  const codigoDgs = catalogo?.find((c) => coincideCompania(c.nombreComun, p.aseguradora!))?.codigoDgs ?? null
  if (!codigoDgs) {
    // El vendor YA aceptó el Submit: esto NO se pierde. Se deja constancia del
    // aviso y de la respuesta cruda para que se acuñe a mano — un dato de
    // nuestro catálogo que falta no puede borrar una emisión real.
    return NextResponse.json({
      estado: 'emitido_sin_acunar',
      mensaje:
        `Codeoscopic aceptó la emisión pero «${p.aseguradora}» no tiene código DGS en companias_dgs: ` +
        'la póliza NO se ha acuñado sola. Añade el código y acúñala a mano con este `crudo`.',
      referenciaVendor: envio.referenciaVendor,
      crudo: envio.crudo,
    })
  }

  const acunado = await registrarPolizaEmitida(correduria.id, {
    clienteId: poliza.cliente_id,
    actor,
    proyecto: {
      projectIdCodeoscopic: projectId,
      producto: poliza.tipo,
      codigoDgs,
      numeroPoliza: envio.referenciaVendor,
      primaAnual: numero(cuerpo.primaAnual),
      emitidaEn: new Date().toISOString(),
      riesgo: esObjeto(poliza.datos_especificos) ? poliza.datos_especificos : null,
      fraccionamiento: poliza.fraccionamiento,
    },
  })

  return NextResponse.json({
    estado: acunado.ok ? 'ok' : 'emitido_sin_acunar',
    referenciaVendor: envio.referenciaVendor,
    acunado,
    crudo: envio.crudo,
  })
}

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

function numero(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function coincideCompania(nombreComun: string, aseguradora: string): boolean {
  const a = nombreComun.trim().toLowerCase()
  const b = aseguradora.trim().toLowerCase()
  return a === b || a.includes(b) || b.includes(a)
}
