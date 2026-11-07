import { NextResponse } from 'next/server'
import { operadorAutorizado, noAutorizado, actorValido, uuidONull, textoONull } from '@/lib/http'
import { opFicha, opFijarDueno, opFijarRef, opDarAcceso, opQuitarAcceso, opFijarOrigen, opFijarRolApp, opAnular, repoOperadorBd } from '@/lib/db-operador'
import { previsualizar, activar, reenviar, statusDeErrorBd } from '@/lib/operador'
import { obtenerCanal, urlPanel } from '@/lib/canal-correo'
import { emailValido } from '@/lib/acceso'
import { esHerramienta, esTitulo, esRolApp, nifPersonaValido, normalizarHerramientas } from '@central/core-herramientas'
import { MEDIADOR } from '@central/legal-templates/encargado'

// Ficha y acciones del operador sobre UNA cuenta. `accion`:
//   dueno · ref · acceso · quitar_acceso · rol_app · origen · previa (dry-run) · activar (EMITE + ENVÍA: el clic del operador es el OK)
//   · reenviar / recordatorio (otro clic = otro OK) · anular.
export const dynamic = 'force-dynamic'

const mal = (error: string, status = 400) => NextResponse.json({ error }, { status })

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!operadorAutorizado(req)) return noAutorizado()
  const id = uuidONull((await params).id)
  if (!id) return mal('cuenta_no_valida')
  try {
    const f = await opFicha(id)
    return f ? NextResponse.json({ cuenta: f }) : mal('cuenta_no_existe', 404)
  } catch (e) {
    const s = statusDeErrorBd(e instanceof Error ? e.message : '')
    return mal(s.error, s.status)
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!operadorAutorizado(req)) return noAutorizado()
  const id = uuidONull((await params).id)
  if (!id) return mal('cuenta_no_valida')
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const actor = actorValido(b?.actor)
  if (!b || !actor) return mal('falta_actor')
  const urlContrato = `${urlPanel()}/`
  try {
    switch (b.accion) {
      case 'dueno': {
        const email = emailValido(b.email); const nombre = textoONull(b.nombre, 120)
        const nif = b.nif == null || b.nif === '' ? null : nifPersonaValido(b.nif)
        const titulo = b.titulo == null || b.titulo === '' ? null : esTitulo(b.titulo) ? b.titulo : undefined
        if (!email || !nombre || nif === null && b.nif && b.nif !== '' || titulo === undefined) return mal('datos_dueno_invalidos')
        const personaId = await opFijarDueno(id, { email, nombre, nif, titulo }, actor)
        if (b.origen && typeof b.origen === 'object') await opFijarOrigen(id, personaId, b.origen as Record<string, unknown>, actor)
        return NextResponse.json({ ok: true, personaId })
      }
      case 'ref': {
        const ref = uuidONull(b.ref)
        if (!esHerramienta(b.herramienta) || !ref) return mal('ref_invalida')
        await opFijarRef(id, b.herramienta, ref, actor)
        return NextResponse.json({ ok: true })
      }
      case 'acceso': {
        const email = emailValido(b.email); const nombre = textoONull(b.nombre, 120)
        const rol = b.rol === 'consulta' || b.rol === 'admin' || b.rol === 'empleado' ? b.rol : null
        const hs = Array.isArray(b.herramientas) && b.herramientas.length === 0 ? [] : normalizarHerramientas(b.herramientas)
        if (!email || !nombre || !rol || !hs) return mal('datos_acceso_invalidos')
        const personaId = await opDarAcceso(id, { email, nombre, rol, herramientas: hs }, actor)
        if (b.origen && typeof b.origen === 'object') await opFijarOrigen(id, personaId, b.origen as Record<string, unknown>, actor)
        return NextResponse.json({ ok: true, personaId })
      }
      case 'quitar_acceso': {
        const persona = uuidONull(b.personaId)
        const h = b.herramienta == null ? null : esHerramienta(b.herramienta) ? b.herramienta : undefined
        if (!persona || h === undefined) return mal('datos_invalidos')
        await opQuitarAcceso(id, persona, h, actor)
        return NextResponse.json({ ok: true })
      }
      case 'rol_app': {
        const persona = uuidONull(b.personaId)
        if (!persona || !esHerramienta(b.herramienta)) return mal('datos_invalidos')
        const rolApp = b.rolApp == null || b.rolApp === '' ? null : esRolApp(b.herramienta, b.rolApp) ? (b.rolApp as string) : undefined
        if (rolApp === undefined) return mal('rol_app_invalido')
        await opFijarRolApp(id, persona, b.herramienta, rolApp, actor)
        return NextResponse.json({ ok: true })
      }
      case 'origen': {
        const persona = uuidONull(b.personaId)
        if (!persona || !b.origen || typeof b.origen !== 'object') return mal('datos_invalidos')
        await opFijarOrigen(id, persona, b.origen as Record<string, unknown>, actor)
        return NextResponse.json({ ok: true })
      }
      case 'previa': {
        const p = previsualizar(await repoOperadorBd.datosEmision(id), b.herramientas, MEDIADOR, new Date())
        if (!p.ok) return NextResponse.json(p, { status: p.status })
        const { html: _html, variables: _v, ...vista } = p
        void _html; void _v
        return NextResponse.json({ ...vista, remitente: MEDIADOR.identidad.email })
      }
      case 'activar': {
        const r = await activar(repoOperadorBd, obtenerCanal(), { cuentaId: id, herramientas: b.herramientas, confirmoDestinatario: b.confirmoDestinatario, confirmoBorrador: b.confirmoBorrador, actor, urlContrato }, MEDIADOR)
        return NextResponse.json(r, { status: r.ok ? 200 : r.status })
      }
      case 'reenviar':
      case 'recordatorio': {
        const v = uuidONull(b.versionId)
        if (!v) return mal('version_no_valida')
        const r = await reenviar(repoOperadorBd, obtenerCanal(), { versionId: v, tipo: b.accion === 'reenviar' ? 'contrato' : 'recordatorio', confirmoDestinatario: b.confirmoDestinatario, actor, urlContrato })
        return NextResponse.json(r, { status: r.ok ? 200 : r.status })
      }
      case 'anular': {
        const v = uuidONull(b.versionId)
        if (!v) return mal('version_no_valida')
        await opAnular(v, actor)
        return NextResponse.json({ ok: true })
      }
      default:
        return mal('accion_desconocida')
    }
  } catch (e) {
    const s = statusDeErrorBd(e instanceof Error ? e.message : '')
    if (s.status === 500) console.error('[empresa] operador:', e instanceof Error ? e.message.slice(0, 200) : e)
    return NextResponse.json({ error: s.error }, { status: s.status })
  }
}
