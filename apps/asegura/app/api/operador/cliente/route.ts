import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { fichaCliente } from '@/lib/cartera-ficha'
import { altaCliente, descartarCliente, editarCliente, restaurarCliente } from '@/lib/cartera-edicion'
import type { EdicionCliente } from '@central/module-seguros'

export const dynamic = 'force-dynamic'

// GET /api/operador/cliente?id=<uuid> — la ficha completa de un cliente.
//
// Es lo que hay detrás del «pincho en el nombre y lo tengo todo»: pólizas,
// recibos y siniestros de una vez, para que la pantalla de plataforma no tenga
// que encadenar tres llamadas.
//
// 🔒 Lo que NO cruza este puerto, a propósito: **DNI, IBAN y dirección**. Para
// trabajar una renovación no hacen falta, y son justo los datos con los que se
// suplanta a alguien. Se ven en asegura, en la pantalla de retarificar, que es
// donde de verdad se usan. El teléfono y el email sí viajan: sin ellos no se
// puede llamar a nadie, que es el propósito entero de la ficha.
//
// Los cuatro estados son los de siempre: `sin_configurar` (el puerto no está
// conectado) · `error` (no se ha podido mirar) · `no_encontrado` (se miró y no
// está) · `ok`. Colapsar los dos primeros en «no existe» sería decir que un
// cliente no está cuando lo que pasa es que no se ha podido consultar.
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const id = (new URL(req.url).searchParams.get('id') ?? '').trim()
  if (id === '') return NextResponse.json({ estado: 'error' }, { status: 400 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error' })
    const ficha = await fichaCliente(correduria.id, id)
    if (!ficha) return NextResponse.json({ estado: 'no_encontrado' }, { status: 404 })
    return NextResponse.json({ estado: 'ok', ficha })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/cliente', e) })
  }
}

// POST /api/operador/cliente — ALTA manual (desde «➕ Nuevo cliente» de plataforma).
// Busca antes por DNI/teléfono/email y devuelve 409 con las fichas que ya lo
// tienen: el duplicado que se evita aquí es el que luego hay que fusionar a mano.
//
// POST /api/operador/cliente?restaurar — deshace un descarte (`{ id, actor?, motivo? }`).
// Va colgado del POST y no de un endpoint nuevo porque es la contrapartida
// exacta del DELETE de abajo, y así el par «descartar/restaurar» vive en el
// mismo fichero y con el mismo contrato.
export async function POST(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restaurar = new URL(req.url).searchParams.has('restaurar')
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ estado: 'invalido', motivo: 'cuerpo ilegible' }, { status: 422 })
    if (restaurar) {
      if (typeof body.id !== 'string') return NextResponse.json({ estado: 'invalido', motivo: 'falta id' }, { status: 422 })
      const r = await restaurarCliente(correduria.id, body.id, actorDe(body), body.motivo)
      if (!r.ok) return NextResponse.json(sinStatus(r), { status: r.status })
      return NextResponse.json({ estado: 'ok', activo: r.activo, yaEstaba: r.yaEstaba })
    }
    const r = await altaCliente(correduria.id, body, actorDe(body))
    if (!r.ok) return NextResponse.json(sinStatus(r), { status: r.status })
    return NextResponse.json({ estado: 'ok', id: r.id }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/cliente', e) }, { status: 500 })
  }
}

// DELETE /api/operador/cliente — DESCARTA la ficha (`{ id, actor?, motivo? }`).
//
// 🚨 No borra nada: pone `clientes.activo = false` y la ficha deja de salir en
// el buscador, la lista y los contadores. Se deshace con `POST ?restaurar`.
// Un DELETE duro se lo comería la ingesta de CIMA (que recrearía la ficha) y se
// llevaría por delante historial, pólizas, recibos, siniestros y documentos.
//
// Estados, los mismos del resto del puerto: `sin_configurar` (503) ·
// `invalido` (422 — aquí también `tiene_polizas_vivas`, con cuántas) ·
// `no_encontrado` (404) · `error` (500) · `ok`. El 500 incluye el caso de que
// NO se hayan podido contar las pólizas vivas: sin poder comprobarlo no se
// descarta, y se dice — no se da por bueno con un 0.
export async function DELETE(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const id = body && typeof body.id === 'string' ? body.id : (new URL(req.url).searchParams.get('id') ?? '')
    if (id.trim() === '') return NextResponse.json({ estado: 'invalido', motivo: 'falta id' }, { status: 422 })
    const r = await descartarCliente(correduria.id, id.trim(), actorDe(body ?? {}), body?.motivo)
    if (!r.ok) return NextResponse.json(sinStatus(r), { status: r.status })
    return NextResponse.json({ estado: 'ok', activo: r.activo, yaEstaba: r.yaEstaba })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/cliente', e) }, { status: 500 })
  }
}

// PATCH /api/operador/cliente — EDICIÓN. Lo libre (dirección, CP, ciudad,
// provincia, notas) entra tal cual; la identidad (DNI, nombre, apellidos,
// fecha de nacimiento) SOLO con `documentoId` de un DNI recibido de este
// cliente (422 `documento_requerido` / `documento_no_acredita` si no).
export async function PATCH(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body.id !== 'string') return NextResponse.json({ estado: 'invalido', motivo: 'falta id' }, { status: 422 })
    const edicion: EdicionCliente = {
      identidad: objeto(body.identidad) as EdicionCliente['identidad'],
      libre: objeto(body.libre) as EdicionCliente['libre'],
      documentoId: typeof body.documentoId === 'string' && body.documentoId.trim() !== '' ? body.documentoId.trim() : null,
    }
    const r = await editarCliente(correduria.id, body.id, edicion, actorDe(body))
    if (!r.ok) return NextResponse.json(sinStatus(r), { status: r.status })
    return NextResponse.json({ estado: 'ok' })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/cliente', e) }, { status: 500 })
  }
}

function actorDe(b: Record<string, unknown>): string {
  return typeof b.actor === 'string' && b.actor.trim() !== '' ? b.actor.trim().slice(0, 120) : 'plataforma'
}
function objeto(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined
}
function sinStatus<T extends { ok: false; status: number }>(r: T): Omit<T, 'ok' | 'status'> {
  const { ok: _ok, status: _status, ...resto } = r
  void _ok
  void _status
  return resto
}
