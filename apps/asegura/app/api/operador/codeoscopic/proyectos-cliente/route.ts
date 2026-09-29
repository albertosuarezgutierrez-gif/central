import { NextResponse, after } from 'next/server'
import { randomUUID } from 'node:crypto'
import { operadorAutorizado } from '@/lib/operador'
import { prisma } from '@/lib/tenant'
import { correduriaUnica } from '@/lib/cartera'
import { auditado } from '@/lib/auditoria'
import { descifrarCampo } from '@/lib/cartera-edicion'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { resolverConfig } from '@/lib/codeoscopic/config'
import { ErrorCodeoscopic, peticion } from '@/lib/codeoscopic/cliente'
import { leerCotizacion } from '@/lib/codeoscopic/respuesta'
import { guardarCotizacion } from '@/lib/codeoscopic/cotizaciones'
import { anotarImportadaWeb } from '@/lib/codeoscopic/consumo'
import { enlazarPresupuestoConOportunidad } from '@/lib/codeoscopic/oportunidad-presupuesto'
import { completarCoberturasTarificacion } from '@/lib/codeoscopic/coberturas-tarificacion'
import { esDelTomador, peticionDeProyecto, proyectosDeCliente, resumenProyecto } from '@/lib/codeoscopic/proyectos-cliente'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Los presupuestos del cliente en Avant2, hechos en la web o desde plataforma (29/09/2026).
 * Alberto: «para ser indiferente hacerlo en ambos lados».
 *
 * `GET ?clienteId=` → los proyectos del tomador (último año, 10 más recientes), cada uno marcado
 *   con si ya está en la intranet y con qué tarificación. GRATIS: solo lecturas del vendor.
 * `POST { clienteId, projectId }` → trae un proyecto de la web como una tarificación más, con su
 *   oportunidad, para compararlo, mandarlo y emitirlo igual que uno de plataforma. **No vuelve a
 *   tarificar**: guarda lo que la web ya pagó. Idempotente: si ya está, devuelve el que hay.
 *
 * El tomador se comprueba por DOCUMENTO, nunca por nombre, y el DNI no sale del puerto.
 */

const SOLICITADO_WEB = 'avant2-web'

type Cliente = { correduriaId: string; clienteId: string; dni: string }

async function cliente(clienteId: string): Promise<{ ok: true; c: Cliente } | { ok: false; res: NextResponse }> {
  const fallo = (status: number, mensaje: string) => ({ ok: false as const, res: NextResponse.json({ estado: 'error', mensaje }, { status }) })
  if (!/^[0-9a-f-]{36}$/i.test(clienteId)) return fallo(400, 'falta clienteId (uuid)')
  const correduria = await correduriaUnica().catch(() => null)
  if (!correduria) return fallo(503, 'no se ha podido resolver la correduría')
  const [f] = await prisma.$queryRaw<{ dni: string | null }[]>`
    select dni from seguros.clientes
    where id = ${clienteId}::uuid and correduria_id = ${correduria.id}::uuid and merged_into_cliente_id is null`
  if (!f) return fallo(404, 'ese cliente no es de la cartera')
  const dni = descifrarCampo(f.dni)
  if (!dni) return fallo(422, 'la ficha no tiene DNI legible: sin documento no se buscan sus proyectos (no se adivina por nombre)')
  return { ok: true, c: { correduriaId: correduria.id, clienteId, dni } }
}

/** Un fallo del vendor dice qué le pasó al vendor; el clasificador de cartera es para la BD. */
function causa(e: unknown): string {
  if (e instanceof ErrorCodeoscopic) return `vendor:${e.clase}${e.status ? ` ${e.status}` : ''}`
  return registrarErrorCartera('operador/codeoscopic/proyectos-cliente', e)
}

function config() {
  // Solo lecturas: no exige el interruptor de gasto.
  const r = resolverConfig(process.env, { ignorarInterruptor: true })
  return r.estado === 'lista' ? r.config : null
}

export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const c = await cliente(new URL(req.url).searchParams.get('clienteId')?.trim() ?? '')
    if (!c.ok) return c.res
    const cfg = config()
    if (!cfg) return NextResponse.json({ estado: 'error', mensaje: 'Codeoscopic no está configurado' }, { status: 503 })

    const crudos = await proyectosDeCliente(cfg, c.c.dni)
    const ids = crudos.map((p) => p.projectId)
    const enIntranet = ids.length
      ? await prisma.$queryRaw<{ project_id: string; tarificacion_id: string; oportunidad_id: string | null; solicitado_por: string }[]>`
          select distinct on (project_id_codeoscopic) project_id_codeoscopic as project_id, id::text as tarificacion_id, oportunidad_id::text as oportunidad_id, solicitado_por
          from seguros.tarificaciones
          where correduria_id = ${c.c.correduriaId}::uuid and project_id_codeoscopic = any(${ids}::text[])
          order by project_id_codeoscopic, creado_at`
      : []
    const porId = new Map(enIntranet.map((f) => [f.project_id, f]))

    const proyectos = crudos.map((p) => {
      const ya = porId.get(p.projectId)
      // `origen`: dónde se TARIFICÓ. Uno traído de la web entra por la puerta del corredor, así que lo
      // delata su `solicitado_por`, que es el que escribe el POST de aquí abajo.
      const intranet = ya
        ? { tarificacionId: ya.tarificacion_id, oportunidadId: ya.oportunidad_id, origen: ya.solicitado_por.startsWith(SOLICITADO_WEB) ? 'web' : 'plataforma' }
        : null
      if (!p.crudo) return { projectId: p.projectId, error: p.error, intranet }
      try {
        // Un proyecto de otra persona no sale en esta ficha aunque la búsqueda lo devuelva.
        if (!esDelTomador(p.crudo, c.c.dni)) return null
        return { ...resumenProyecto(p.crudo), error: null, intranet }
      } catch (e) {
        return { projectId: p.projectId, error: e instanceof Error ? e.message : String(e), intranet }
      }
    })
    return NextResponse.json({ estado: 'ok', proyectos: proyectos.filter((p) => p !== null) })
  } catch (e) {
    return NextResponse.json({ estado: 'error', mensaje: causa(e) }, { status: 502 })
  }
}

/** Aborta la transacción sin que parezca avería: el proyecto ya estaba en la intranet. */
class YaImportado extends Error {
  constructor(readonly tarificacionId: string) {
    super('ya importado')
  }
}

export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const cuerpo = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const projectId = typeof cuerpo.projectId === 'string' ? cuerpo.projectId.trim() : ''
  if (!/^\d{1,12}$/.test(projectId)) {
    return NextResponse.json({ estado: 'error', mensaje: 'projectId tiene que ser el número del proyecto de Avant2' }, { status: 400 })
  }
  const solicitadoPor = typeof cuerpo.solicitadoPor === 'string' && cuerpo.solicitadoPor.trim() !== '' ? cuerpo.solicitadoPor.trim() : 'plataforma'
  try {
    const c = await cliente(typeof cuerpo.clienteId === 'string' ? cuerpo.clienteId.trim() : '')
    if (!c.ok) return c.res
    const { correduriaId, clienteId, dni } = c.c

    const [ya] = await prisma.$queryRaw<{ id: string }[]>`
      select id::text as id from seguros.tarificaciones
      where correduria_id = ${correduriaId}::uuid and project_id_codeoscopic = ${projectId}
        and cliente_id = ${clienteId}::uuid
      order by creado_at limit 1`
    if (ya) return NextResponse.json({ estado: 'ya_estaba', tarificacionId: ya.id })

    const cfg = config()
    if (!cfg) return NextResponse.json({ estado: 'error', mensaje: 'Codeoscopic no está configurado' }, { status: 503 })
    const crudo = await peticion(cfg, { metodo: 'GET', path: `/insurances/${projectId}`, timeoutMs: cfg.timeoutGenericoMs })

    if (!esDelTomador(crudo, dni)) {
      return NextResponse.json({ estado: 'error', mensaje: 'el tomador de ese proyecto no es este cliente (o el proyecto no trae documento)' }, { status: 409 })
    }
    const resumen = resumenProyecto(crudo)
    if (!resumen.ramo) {
      return NextResponse.json({ estado: 'error', mensaje: `por ahora solo se traen auto, moto y hogar (este es «${resumen.lineaNombre ?? '?'}»)` }, { status: 422 })
    }
    const cotizacion = leerCotizacion(crudo)
    if (cotizacion.precios.length === 0) {
      return NextResponse.json({ estado: 'error', mensaje: 'el proyecto no trae ningún precio: no hay nada que comparar' }, { status: 422 })
    }

    const contexto = { ramo: resumen.ramo, puerta: 'corredor' as const, clienteId }
    const intentoId = randomUUID()
    let tarificacionId: string
    try {
      tarificacionId = await guardarCotizacion(
        { correduriaId, contexto, intentoId, simulado: false, peticion: peticionDeProyecto(crudo), cotizacion, solicitadoPor: `${SOLICITADO_WEB} (traído por ${solicitadoPor})` },
        // La línea del libro va en la MISMA transacción que la tarificación (la FK la exige). Coste 0 y
        // motivo propio: lo pagó la web, y `consumoActual` no lo cuenta contra el tope de cotizar.
        (fn) =>
          prisma.$transaction(async (tx) => {
            await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${`importar-web:${correduriaId}:${projectId}`}))`
            const [otro] = await tx.$queryRaw<{ id: string }[]>`
              select id::text as id from seguros.tarificaciones
              where correduria_id = ${correduriaId}::uuid and project_id_codeoscopic = ${projectId} limit 1`
            if (otro) throw new YaImportado(otro.id)
            await anotarImportadaWeb(tx, { correduriaId, intentoId, solicitadoPor, projectId })
            const id = await fn(tx)
            // La fecha es la del PROYECTO, no la de hoy: un presupuesto viejo traído ahora no puede
            // pasar por «la última tarificación» del cliente (la pantalla de tarificar retoma esa).
            if (resumen.creadoEn) {
              await tx.$executeRaw`
                update seguros.tarificaciones set creado_at = ${resumen.creadoEn}::timestamptz
                where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid`
            }
            return id
          }),
      )
    } catch (e) {
      if (e instanceof YaImportado) return NextResponse.json({ estado: 'ya_estaba', tarificacionId: e.tarificacionId })
      throw e
    }

    // Su oportunidad, igual que un presupuesto de plataforma. No tumba el guardado.
    const oportunidad = await enlazarPresupuestoConOportunidad({ correduriaId, contexto, cotizacionId: tarificacionId, solicitadoPor }).catch(
      (e: unknown) => ({ estado: 'no_enlazada' as const, motivo: e instanceof Error ? e.message : String(e) }),
    )
    after(() => completarCoberturasTarificacion({ correduriaId, tarificacionId }).then(() => undefined))
    return NextResponse.json({ estado: 'importada', tarificacionId, ramo: resumen.ramo, oportunidad })
  } catch (e) {
    return NextResponse.json({ estado: 'error', mensaje: causa(e) }, { status: 502 })
  }
})
