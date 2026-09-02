import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { abrirSiniestro, cambiarEstadoSiniestro, leerSiniestro, seguirSiniestro, type ResultadoSiniestro } from '@/lib/cartera-siniestros'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Siniestros desde la ficha, por el puerto de operador (plataforma → asegura).
 *
 *   GET   ?id=<siniestroId>                     → { estado:'ok', siniestro }
 *   POST  { polizaId, tipo, fechaHora, descripcion, lugar*?, seConsideraCulpable?,
 *           gravedad?, referencia?, actor }     → abre uno (origen gestionado_correduria)
 *   PATCH { siniestroId, estado, actor }        → cambia el estado (solo los nuestros)
 *   PATCH { siniestroId, referencia?, gravedad?, tramitador*?, perito*?,
 *           reservaImporte?, indemnizacionImporte?, nota?, actor } → seguimiento
 *
 * Reglas en `@central/module-seguros` (`siniestros.ts`) y BD en
 * `lib/cartera-siniestros.ts`. Respuesta de escritura: `{ estado:'ok', siniestro,
 * aviso, ignorados }` — `aviso` es el del art. 16 LCS (fuera de plazo, no
 * bloquea); `ignorados`, los campos que no se aplican en uno de CIMA.
 * 422 `invalido` trae el motivo; 404 `no_encontrado` si la póliza o el
 * siniestro no son de esta correduría.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const id = (new URL(req.url).searchParams.get('id') ?? '').trim()
  if (id === '') return NextResponse.json({ estado: 'error', motivo: 'falta id' }, { status: 400 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' })
    const siniestro = await leerSiniestro(correduria.id, id)
    if (siniestro === null) return NextResponse.json({ estado: 'no_encontrado' }, { status: 404 })
    return NextResponse.json({ estado: 'ok', siniestro })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/siniestro', e) })
  }
}

export async function POST(req: Request) {
  return escribir(req, (correduriaId, b) =>
    abrirSiniestro(correduriaId, {
      polizaId: cadena(b.polizaId) ?? '',
      tipo: cadena(b.tipo) ?? '',
      fechaHora: cadena(b.fechaHora) ?? '',
      descripcion: typeof b.descripcion === 'string' ? b.descripcion : '',
      lugarCp: cadena(b.lugarCp),
      lugarCiudad: cadena(b.lugarCiudad),
      lugarProvincia: cadena(b.lugarProvincia),
      lugarDireccion: cadena(b.lugarDireccion),
      seConsideraCulpable: typeof b.seConsideraCulpable === 'boolean' ? b.seConsideraCulpable : null,
      gravedad: cadena(b.gravedad),
      referencia: cadena(b.referencia),
      actor: cadena(b.actor) ?? 'plataforma',
    }),
  )
}

const CAMPOS_SEGUIMIENTO = [
  'referencia', 'gravedad', 'tramitadorNombre', 'tramitadorTelefono', 'tramitadorEmail',
  'peritoNombre', 'peritoTelefono', 'peritoEmail', 'reservaImporte', 'indemnizacionImporte', 'nota',
] as const

export async function PATCH(req: Request) {
  return escribir(req, (correduriaId, b) => {
    const siniestroId = cadena(b.siniestroId) ?? ''
    const actor = cadena(b.actor) ?? 'plataforma'
    if (typeof b.estado === 'string') return cambiarEstadoSiniestro(correduriaId, { siniestroId, estado: b.estado, actor })
    const seguimiento: Record<string, unknown> = {}
    for (const k of CAMPOS_SEGUIMIENTO) {
      if (!(k in b)) continue
      const v = b[k]
      if (k === 'reservaImporte' || k === 'indemnizacionImporte') seguimiento[k] = v === null ? null : typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.replace(',', '.')) : undefined
      else seguimiento[k] = v === null ? null : typeof v === 'string' ? v : undefined
    }
    return seguirSiniestro(correduriaId, { ...seguimiento, siniestroId, actor })
  })
}

async function escribir(req: Request, accion: (correduriaId: string, body: Record<string, unknown>) => Promise<ResultadoSiniestro>) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ estado: 'invalido', motivo: 'cuerpo no válido' }, { status: 422 })
    const r = await accion(correduria.id, body)
    if (!r.ok) {
      const { ok: _ok, status, ...resto } = r
      void _ok
      return NextResponse.json(resto, { status })
    }
    return NextResponse.json({ estado: 'ok', siniestro: r.siniestro, aviso: r.aviso, ignorados: r.ignorados })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/siniestro', e) }, { status: 500 })
  }
}

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}
