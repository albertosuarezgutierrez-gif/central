import { NextResponse } from 'next/server'

import { CAMPOS_CANAL_PROPIO, CAMPOS_CONTACTO_PROPIO } from '@central/module-seguros-portal'

import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { aplicarContactoPropio, leerContactoPropio, type EntradaContactoPropio } from '@/lib/contacto-portal'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { puentePortalAutorizado } from '@/lib/puente-portal'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const esCanal = (k: string): k is (typeof CAMPOS_CANAL_PROPIO)[number] =>
  (CAMPOS_CANAL_PROPIO as readonly string[]).includes(k)

/**
 * POST /api/portal/contacto — el CLIENTE corrige sus datos de contacto desde
 * el portal. Cuerpo: `{ identidadId, libre: { direccion?, codigoPostal?,
 * ciudad?, provincia?, telefono?, email? } }`.
 *
 * GET /api/portal/contacto?identidadId= — lo que tiene la ficha de esa
 * identidad para que lo vea y lo corrija (09/09/2026), más si ha confirmado
 * que sigue siendo correcto (`confirmadoEn`/`confirmacion`). Mismo secreto,
 * misma resolución por vínculo.
 *
 * 🚨 No acepta `clienteId`, y esa ausencia es la seguridad de esta ruta: la
 * ficha la resuelve asegura por `portal_vinculo`. Si aceptara uno, el portal
 * —que es la app pública— podría escribir en cualquier ficha de la cartera.
 *
 * 🚨 Y no acepta ningún campo de IDENTIDAD. Entrar al portal es un código al
 * correo: eso acredita el correo, no a la persona, y la regla de la correduría
 * es que la identidad se cambia con un DNI recibido en la ficha. La lista
 * blanca se aplica AQUÍ, en el borde, además de en la pantalla: una pantalla no
 * es un control de acceso.
 *
 * La respuesta no lleva ni un dato de la ficha (ver la cabecera de
 * `lib/contacto-portal.ts`): solo cómo salió.
 */
export async function POST(req: Request) {
  if (!puentePortalAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ estado: 'invalido', motivo: 'cuerpo ilegible' }, { status: 422 })

    const identidadId = typeof body.identidadId === 'string' ? body.identidadId.trim() : ''
    if (identidadId === '') return NextResponse.json({ estado: 'invalido', motivo: 'sin identidad' }, { status: 422 })

    const entrante = (body.libre ?? {}) as Record<string, unknown>
    // Lista blanca dura: lo que no está en `CAMPOS_CONTACTO_PROPIO` no entra, y
    // que venga NO es un error del cliente que haya que explicarle — es un
    // cuerpo que esta ruta no ofrece. Se descarta en silencio y se sigue con lo
    // que sí es suyo.
    const libre: EntradaContactoPropio = {}
    for (const k of CAMPOS_CONTACTO_PROPIO) {
      if (!(k in entrante)) continue
      const v = entrante[k]
      // Un canal no se «borra» desde el portal (null): se cambia por otro. Sin
      // teléfono ni correo no habría por dónde avisarle, y el que tenía sigue
      // en la ficha como secundario cuando pone uno nuevo.
      if (typeof v === 'string') libre[k] = v
      else if (v === null && !esCanal(k)) libre[k] = null
      else return NextResponse.json({ estado: 'invalido', motivo: `${k} no es texto`, campo: k }, { status: 422 })
    }

    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })

    const r = await aplicarContactoPropio(correduria.id, identidadId, libre)
    // 422 solo para lo que el cliente puede arreglar reescribiendo. `sin_ficha`,
    // `varias_fichas` y `conflicto` son 409: no ha hecho nada mal, es que no hay
    // una ficha suya donde escribirlo (o el teléfono ya es el principal de otra),
    // y eso lo resuelve el corredor.
    const status =
      r.estado === 'ok' || r.estado === 'sin_cambios' ? 200
        : r.estado === 'invalido' ? 422
          : r.estado === 'error' ? 503
            : 409 // sin_ficha · varias_fichas · en_otra_ficha
    return NextResponse.json(r, { status })
  } catch (e) {
    return NextResponse.json(
      { estado: 'error', causa: registrarErrorCartera('portal/contacto', e) },
      { status: 503 },
    )
  }
}

export async function GET(req: Request) {
  if (!puentePortalAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const identidadId = (new URL(req.url).searchParams.get('identidadId') ?? '').trim()
    if (identidadId === '') return NextResponse.json({ estado: 'invalido', motivo: 'sin identidad' }, { status: 422 })

    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })

    const r = await leerContactoPropio(correduria.id, identidadId)
    const status = r.estado === 'ok' ? 200 : r.estado === 'error' ? 503 : 409
    return NextResponse.json(r, { status, headers: { 'cache-control': 'no-store' } })
  } catch (e) {
    return NextResponse.json(
      { estado: 'error', causa: registrarErrorCartera('portal/contacto', e) },
      { status: 503 },
    )
  }
}
