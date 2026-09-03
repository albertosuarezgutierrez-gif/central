import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { listarPartes, moverParte } from '@/lib/partes-portal'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Los PARTES DE SINIESTRO del portal, por el puerto de operador
 * (plataforma → asegura). La pantalla es `plataforma` → `/correduria`; aquí solo
 * está el dato.
 *
 *   GET   ?estado=&clienteId=&limite=   → { estado:'ok', partes: [...] }
 *   PATCH { id, estado, siniestroId?, motivoDescarte?, actor? }
 *                                        → { estado:'ok', parte }
 *
 * Reglas y ausencias en `lib/partes-portal.ts`. Tres que se ven desde fuera:
 *
 *   · `cliente: null` = a quien mandó el parte NO lo hemos casado con ninguna
 *     ficha de la cartera. El parte sale igual y no se rellena con un «Cliente
 *     desconocido»: Alberto tiene que identificar a esa persona a mano.
 *   · `comunicado` sale de `comunicadoACompania(estado)`, nunca de
 *     `estado !== 'enviado'`: solo `abierto_en_compania` significa que la entidad
 *     lo sabe.
 *   · `plazo.fueraDePlazo` (art. 16 LCS) NO es pérdida de cobertura y ningún
 *     texto de la pantalla puede decir eso.
 *
 * Errores del PATCH: `400 siniestro_requerido` (abrir en compañía sin un
 * siniestro que exista en esta correduría) · `400 motivo_requerido` (descartar
 * sin motivo) · `400 datos_invalidos` · `404 no_encontrado` ·
 * `409 transicion_invalida`. Un fallo de lectura de la cartera nunca sale pelado:
 * `{ estado:'error', causa }` con el clasificador compartido.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const q = new URL(req.url).searchParams
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' })
    const partes = await listarPartes(correduria.id, {
      estado: q.get('estado'),
      clienteId: q.get('clienteId'),
      limite: q.get('limite'),
    })
    return NextResponse.json({ estado: 'ok', partes })
  } catch (e) {
    // Sin `partes` en la respuesta a propósito: un `partes: []` aquí se leería
    // como «no hay ninguno», que es justo lo contrario de lo que ha pasado.
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/partes', e) }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ error: 'datos_invalidos' }, { status: 400 })

    const r = await moverParte(correduria.id, {
      id: body.id,
      estado: body.estado,
      siniestroId: body.siniestroId,
      motivoDescarte: body.motivoDescarte,
      actor: body.actor,
    })
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    return NextResponse.json({ estado: 'ok', parte: r.parte })
  } catch (e) {
    // Aquí cae también el CHECK `portal_parte_abierto_con_sello` de la BD, que es
    // la última red del «abierto_en_compania sin siniestro». Si salta, sale como
    // error: tragárselo dejaría el parte diciendo que la compañía lo sabe.
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/partes', e) }, { status: 500 })
  }
}
