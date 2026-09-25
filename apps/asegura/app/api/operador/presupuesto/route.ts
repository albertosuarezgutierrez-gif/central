import { NextResponse } from 'next/server'

import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { guardarNecesidades, listarPresupuestos, prepararPresupuesto, retirarPresupuesto } from '@/lib/presupuesto'
import { auditado } from '@/lib/auditoria'
import { avisarPresupuesto, confirmarWhatsapp, marcarEmitido, type FalloEnvio } from '@/lib/envio-presupuesto'
import { datosParaEmitir } from '@/lib/datos-emision'
import type { DatosParaEmitir } from '@central/module-seguros'

export const dynamic = 'force-dynamic'

// `sin_enlace`/`sin_proveedor`/`remitente` son averías nuestras (503); `rechazado`, del proveedor (502).
const STATUS_FALLO: Record<FalloEnvio, number> = {
  no_encontrado: 404, no_enviable: 409, ocupado: 409, simulado: 422, sin_email: 422, sin_acceso: 422, sin_necesidades: 422,
  sin_enlace: 503, sin_proveedor: 503, remitente_no_verificado: 503, rechazado: 502,
}

/**
 * El presupuesto al cliente, por el puerto de operador (plataforma → asegura).
 *
 *   GET   ?clienteId= | ?polizaId=  → los presupuestos ya preparados
 *   POST  { polizaId | tarificacionId, claveNivelActual?, actor } → prepara un BORRADOR
 *   PATCH { id, motivo, actor }     → lo retira (con motivo, siempre)
 *   PATCH { id, accion:'avisar', canal:'email'|'whatsapp_enlace', actor } → avisa al cliente (PR 3)
 *   PATCH { id, accion:'confirmar_whatsapp', actor } → Alberto dice que el WhatsApp ya salió
 *   PATCH { id, accion:'emitido', actor } → la compañía ya emitió la póliza del presupuesto aceptado
 *   PATCH { id, accion:'necesidades', texto, actor } → anota las exigencias y necesidades del cliente (IDD)
 *
 * 🚨 NADA DE ESTO SALE AL CLIENTE NI CUESTA UN EURO. Prepara la fila y congela
 * las opciones desde una tarificación YA PAGADA; el envío es el PR 3 y la firma
 * el 4. Es a propósito: PR 1 existe para que Alberto pueda preparar un
 * presupuesto REAL sobre una póliza REAL y mirarlo antes de que exista una sola
 * línea de la pantalla del cliente.
 *
 * 🔑 El `token` en claro viaja UNA vez, en la respuesta del POST: en la BD solo
 * vive su hash. Si se pierde, se retira el borrador y se prepara otro — que es
 * exactamente lo que se quiere de un enlace que abre la cartera de alguien.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const u = new URL(req.url)
  const clienteId = u.searchParams.get('clienteId')
  const polizaId = u.searchParams.get('polizaId')
  if (!clienteId && !polizaId) {
    return NextResponse.json({ estado: 'error', motivo: 'datos_invalidos' }, { status: 400 })
  }

  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' })

    const lista = await listarPresupuestos(correduria.id, { clienteId, polizaId })
    // `null` = no se ha podido leer. NO se colapsa con «no hay ninguno»: la
    // pantalla tiene que poder decir «no lo sé» en vez de «no le has preparado».
    if (lista === null) {
      return NextResponse.json({ estado: 'error', motivo: 'no se pudo leer los presupuestos' })
    }
    // Qué le falta a cada tomador para emitir (§4bis). Por cliente, y `null` si no se pudo leer:
    // un fallo aquí no tumba la lista ni se pinta como «no falta nada».
    const datosEmision: Record<string, DatosParaEmitir | null> = {}
    for (const cid of new Set(lista.map((p) => p.clienteId))) {
      datosEmision[cid] = await datosParaEmitir(correduria.id, cid).catch((e) => {
        registrarErrorCartera('operador/presupuesto/datos-emision', e)
        return null
      })
    }
    return NextResponse.json({ estado: 'ok', presupuestos: lista, datosEmision })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/presupuesto', e) })
  }
}

export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const cuerpo = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const actor = typeof cuerpo?.actor === 'string' ? cuerpo.actor.trim() : ''
  const polizaId = typeof cuerpo?.polizaId === 'string' ? cuerpo.polizaId.trim() : ''
  const tarificacionId = typeof cuerpo?.tarificacionId === 'string' ? cuerpo.tarificacionId.trim() : ''
  // Quien llama puede saber el nivel de la póliza actual; si no, NO se adivina.
  const claveNivelActual =
    typeof cuerpo?.claveNivelActual === 'string' && cuerpo.claveNivelActual.trim() !== ''
      ? cuerpo.claveNivelActual.trim()
      : null

  if (actor === '' || (polizaId === '' && tarificacionId === '')) {
    return NextResponse.json({ estado: 'error', motivo: 'datos_invalidos' }, { status: 400 })
  }

  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' })

    const r = await prepararPresupuesto(correduria.id, {
      tarificacionId: tarificacionId || null,
      polizaId: polizaId || null,
      claveNivelActual,
      actor,
    })
    if (r.estado === 'error') {
      return NextResponse.json(r, { status: r.motivo === 'no_encontrado' ? 404 : 422 })
    }
    return NextResponse.json(r)
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/presupuesto', e) })
  }
})

export const PATCH = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const cuerpo = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const id = typeof cuerpo?.id === 'string' ? cuerpo.id.trim() : ''
  const motivo = typeof cuerpo?.motivo === 'string' ? cuerpo.motivo : ''
  const actor = typeof cuerpo?.actor === 'string' ? cuerpo.actor.trim() : ''
  if (id === '' || actor === '') {
    return NextResponse.json({ estado: 'error', motivo: 'datos_invalidos' }, { status: 400 })
  }

  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' })

    if (cuerpo?.accion === 'necesidades') {
      const r = await guardarNecesidades(correduria.id, { id, texto: cuerpo.texto, actor, respuestas: cuerpo.respuestas })
      const status = r.estado === 'ok' ? 200 : r.motivo === 'no_encontrado' ? 404 : r.motivo === 'cerrado' ? 409 : 422
      return NextResponse.json(r, { status })
    }
    if (cuerpo?.accion === 'emitido') {
      const r = await marcarEmitido(correduria.id, { id, actor })
      return NextResponse.json(r, { status: r.estado === 'error' ? (r.motivo === 'no_encontrado' ? 404 : 409) : 200 })
    }
    if (cuerpo?.accion === 'avisar' || cuerpo?.accion === 'confirmar_whatsapp') {
      const canal = cuerpo.canal === 'email' || cuerpo.canal === 'whatsapp_enlace' ? cuerpo.canal : null
      if (cuerpo.accion === 'avisar' && !canal) return NextResponse.json({ estado: 'error', motivo: 'datos_invalidos' }, { status: 400 })
      const r = cuerpo.accion === 'avisar'
        ? await avisarPresupuesto(correduria.id, { id, canal: canal!, actor })
        : await confirmarWhatsapp(correduria.id, { id, actor })
      return NextResponse.json(r, { status: r.estado === 'error' ? STATUS_FALLO[r.motivo] : 200 })
    }

    const r = await retirarPresupuesto(correduria.id, { id, motivo, actor })
    if (r.estado === 'error') {
      return NextResponse.json(r, { status: r.motivo === 'no_encontrado' ? 404 : 422 })
    }
    return NextResponse.json(r)
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/presupuesto', e) })
  }
})
