import { after, NextResponse } from 'next/server'

import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import {
  datosCotizadosDelPresupuesto, firmarAceptacion, pedirCodigoAceptacion, prepararAceptacion, reportarDatosIncorrectos, type AccesoPortal,
} from '@/lib/presupuesto-aceptacion'
import { gastarCodigoWhatsapp } from '@/lib/presupuesto-codigo-whatsapp'
import { entregarJustificanteAnulacion } from '@/lib/justificante-anulacion'
import { pideLlamada, preguntaIA, resumenIA } from '@/lib/comparativa-ia-servicio'
import { pdfEstudioParaPortal } from '@/lib/presupuesto-pdf-portal'
import { actividadCliente } from '@/lib/presupuesto-actividad-servicio'
import { puentePortalAutorizado } from '@/lib/puente-portal'
import { auditado } from '@/lib/auditoria'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// after() envía a la compañía y el justificante al cliente: sin margen, la función muere antes de acabar.
export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HEX_64 = /^[0-9a-f]{64}$/

/**
 * /api/portal/presupuesto — el cliente elige y firma su presupuesto (spec 2026-09-21, PR 4).
 *   POST { accion:'preparar', identidadId, presupuestoId, opcionId, cuenta? } → sin `cuenta`, la de su ficha
 *        ENMASCARADA (`elegir_cuenta`); con `cuenta: { eleccion:'ficha'|'otra', iban? }`, el documento a firmar (no escribe)
 *        { accion:'codigo',   identidadId, presupuestoId, opcionId }
 *        { accion:'firmar',   identidadId, presupuestoId, opcionId, codigo, nombre, documentoHash, datosConfirmados, cuenta, ip?, userAgent? }
 *        { accion:'pdf',      identidadId, presupuestoId }          → el estudio comparativo en PDF (solo origen ofertas, ya enviado)
 *        { accion:'datos',    identidadId, presupuestoId }          → «Revisa tus datos» (no escribe)
 *        { accion:'datos_incorrectos', identidadId, presupuestoId, texto } → avisa; cierra la firma desde el portal
 *        { accion:'resumen_ia',  identidadId, presupuestoId }                          → resumen IA (cacheado)
 *        { accion:'pregunta_ia', identidadId, presupuestoId, opcionA, opcionB, pregunta } → respuesta IA (tope diario)
 *        { accion:'llamadme',    identidadId, presupuestoId }                          → «Prefiero que me llaméis»
 *        { accion:'actividad',   identidadId, presupuestoId, garantias: string[], comparadas: string[] }
 *             → telemetría: qué garantías marca y qué opciones compara (se recorta al catálogo y a las visibles)
 * Como el resto del puente: NO acepta `clienteId`, la ficha sale de `portal_vinculo`.
 *
 * 07/10/2026 — El CÓDIGO DEL WHATSAPP (`lib/presupuesto-codigo-whatsapp.ts`):
 *        { accion:'acceso_whatsapp', tokenWhatsapp, codigo } → comprueba (y gasta un intento de) el código
 *             de la carátula; con `valido` el portal pone su cookie de acceso a ESE presupuesto.
 *   `datos`, `datos_incorrectos`, `preparar`, `codigo` y `firmar` aceptan `tokenWhatsapp` EN LUGAR de
 *   `identidadId` (quien entró con el código no tiene identidad): la ficha sale entonces del PROPIO
 *   presupuesto de ese token. `firmar` con `via:'whatsapp'` firma con ese código. El resto de acciones
 *   siguen pidiendo identidad.
 */
const STATUS: Record<string, number> = {
  ok: 200, codigo_enviado: 200, aceptado: 200, no_encontrado: 404, no_admite: 409, sin_precio: 409,
  sin_email: 422, sin_correo_configurado: 503,
  // El código del WhatsApp en la carátula.
  valido: 200, incorrecto: 422, bloqueado: 429, caducado: 410, sin_codigo_whatsapp: 409, fallo_envio: 502, espera: 429, limite_codigos: 429,
  documento_cambiado: 409, sin_codigo: 409, codigo_caducado: 410, demasiados_intentos: 429, codigo_incorrecto: 422,
  nombre_no_coincide: 422, sin_ficha: 409, varias_fichas: 409, sin_permiso: 403, error: 503,
  sin_datos: 409, datos_en_revision: 409, sin_confirmar_datos: 422, invalido: 422, limite: 429,
  // La cuenta: elegirla es un paso más (200); sin ella o con un IBAN que no cuadra, no se firma.
  elegir_cuenta: 200, sin_cuenta: 422, iban_invalido: 422, sin_cifrado: 503,
  // `no_disponible` de la IA es una respuesta completa (el portal dice «no está disponible ahora»), no un fallo.
  no_disponible: 200,
}

export const POST = auditado(async (req: Request) => {
  if (!puentePortalAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const s = (k: string) => (typeof b?.[k] === 'string' ? (b[k] as string).trim() : '')
    const identidadId = s('identidadId'), presupuestoId = s('presupuestoId'), opcionId = s('opcionId')
    const tokenWhatsapp = s('tokenWhatsapp')
    if (b?.accion === 'acceso_whatsapp') {
      if (!HEX_64.test(tokenWhatsapp)) return NextResponse.json({ estado: 'invalido' }, { status: 422 })
      const correduria = await correduriaUnica()
      if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })
      const r = await gastarCodigoWhatsapp(correduria.id, tokenWhatsapp, s('codigo'))
      // `sin_codigo` aquí es «este enlace no salió por WhatsApp»: no es un fallo del puente.
      const alPortal = r.estado === 'valido' ? { estado: 'valido', presupuestoId: r.presupuestoId } : r
      return NextResponse.json(alPortal, { status: r.estado === 'sin_codigo' ? STATUS.sin_codigo_whatsapp : r.estado === 'no_encontrado' ? 404 : STATUS[r.estado] ?? 500 })
    }
    // `datos` y `datos_incorrectos` son del presupuesto, no de una opción: no piden `opcionId`.
    const sinOpcion = b?.accion === 'datos' || b?.accion === 'datos_incorrectos' || b?.accion === 'resumen_ia' ||
      b?.accion === 'pregunta_ia' || b?.accion === 'llamadme' || b?.accion === 'actividad' || b?.accion === 'pdf'
    // Quien entró con el código del WhatsApp llega con el token y SIN identidad: solo para estas acciones.
    const admiteWhatsapp = b?.accion === 'datos' || b?.accion === 'datos_incorrectos' || b?.accion === 'preparar' ||
      b?.accion === 'codigo' || b?.accion === 'firmar'
    const acceso: AccesoPortal | null = UUID.test(identidadId)
      ? { identidadId }
      : admiteWhatsapp && HEX_64.test(tokenWhatsapp) ? { tokenWhatsapp } : null
    if (!acceso || !UUID.test(presupuestoId) || (!sinOpcion && !UUID.test(opcionId))) {
      return NextResponse.json({ estado: 'invalido' }, { status: 422 })
    }
    // El IBAN llega en claro: se valida en `presupuesto-cuenta.ts` y no se registra en ningún log.
    const c = b?.cuenta && typeof b.cuenta === 'object' ? (b.cuenta as Record<string, unknown>) : null
    const cuenta = c
      ? { eleccion: c.eleccion, iban: typeof c.iban === 'string' ? c.iban.slice(0, 64) : null }
      : null
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })
    if (b?.accion === 'datos') {
      const r = await datosCotizadosDelPresupuesto(correduria.id, acceso, presupuestoId)
      // `sin_datos` es una respuesta completa (el portal la pinta y cierra la firma), no un fallo.
      return NextResponse.json(r, { status: r.estado === 'sin_datos' ? 200 : STATUS[r.estado] ?? 500 })
    }
    if (b?.accion === 'pdf') {
      // El estudio comparativo de un presupuesto de ofertas, ya enviado y de SU ficha (bytes, no JSON).
      const r = await pdfEstudioParaPortal(correduria.id, identidadId, presupuestoId)
      if (r.estado === 'ok') {
        return new Response(Buffer.from(r.bytes), {
          headers: { 'content-type': 'application/pdf', 'x-nombre-fichero': r.nombre, 'cache-control': 'private, no-store' },
        })
      }
      return NextResponse.json(r, { status: r.estado === 'no_encontrado' ? 404 : r.estado === 'no_disponible' ? 409 : STATUS[r.estado] ?? 409 })
    }
    if (b?.accion === 'datos_incorrectos') {
      const r = await reportarDatosIncorrectos(correduria.id, acceso, presupuestoId, s('texto'))
      return NextResponse.json(r, { status: STATUS[r.estado] ?? 500 })
    }
    if (b?.accion === 'resumen_ia') {
      const r = await resumenIA(correduria.id, identidadId, presupuestoId)
      return NextResponse.json(r, { status: STATUS[r.estado] ?? 500 })
    }
    if (b?.accion === 'pregunta_ia') {
      const r = await preguntaIA(correduria.id, identidadId, presupuestoId, {
        opcionA: s('opcionA'), opcionB: s('opcionB'), pregunta: b.pregunta,
      })
      return NextResponse.json(r, { status: STATUS[r.estado] ?? 500 })
    }
    if (b?.accion === 'llamadme') {
      const r = await pideLlamada(correduria.id, identidadId, presupuestoId)
      return NextResponse.json(r, { status: STATUS[r.estado] ?? 500 })
    }
    if (b?.accion === 'actividad') {
      const r = await actividadCliente(correduria.id, identidadId, presupuestoId, { garantias: b.garantias, comparadas: b.comparadas })
      return NextResponse.json(r, { status: STATUS[r.estado] ?? 500 })
    }
    if (b?.accion === 'preparar') {
      const r = await prepararAceptacion(correduria.id, acceso, presupuestoId, opcionId, cuenta)
      return NextResponse.json(r, { status: STATUS[r.estado] ?? 500 })
    }
    if (b?.accion === 'codigo') {
      const r = await pedirCodigoAceptacion(correduria.id, acceso, presupuestoId, opcionId)
      return NextResponse.json(r, { status: STATUS[r.estado] ?? 500 })
    }
    if (b?.accion === 'firmar') {
      const codigo = s('codigo'), nombre = s('nombre'), documentoHash = s('documentoHash')
      if (!/^\d{6}$/.test(codigo) || !nombre || !/^[0-9a-f]{64}$/.test(documentoHash)) return NextResponse.json({ estado: 'invalido' }, { status: 422 })
      const r = await firmarAceptacion(correduria.id, acceso, presupuestoId, opcionId, {
        codigo, nombre, documentoHash,
        // Qué código es: el del correo (por defecto) o el de acceso del WhatsApp.
        via: b.via === 'whatsapp' ? 'whatsapp' : 'correo',
        // Solo un `true` literal: un «sí», un 1 o un campo ausente NO confirman los datos.
        datosConfirmados: b.datosConfirmados === true,
        // Sin cuenta válida, `firmarAceptacion` corta ANTES de gastar el código (fail-closed).
        cuenta,
        ip: typeof b.ip === 'string' ? b.ip.slice(0, 100) : null,
        userAgent: typeof b.userAgent === 'string' ? b.userAgent.slice(0, 300) : null,
      })
      if (r.estado === 'aceptado') {
        const { anulacionId, ...alPortal } = r
        // La baja firmada junto con el presupuesto también se archiva en su póliza y le llega por correo.
        if (anulacionId) {
          after(async () => {
            try {
              const j = await entregarJustificanteAnulacion(correduria.id, anulacionId)
              console.log(`[portal/presupuesto] ${anulacionId} justificante al cliente: ${JSON.stringify(j)}`)
            } catch (e) {
              console.error('[portal/presupuesto] el justificante al cliente falló:', e instanceof Error ? e.message : e)
            }
          })
        }
        return NextResponse.json(alPortal, { status: 200 })
      }
      return NextResponse.json(r, { status: STATUS[r.estado] ?? 500 })
    }
    return NextResponse.json({ estado: 'invalido' }, { status: 422 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('portal/presupuesto', e) }, { status: 503 })
  }
})
