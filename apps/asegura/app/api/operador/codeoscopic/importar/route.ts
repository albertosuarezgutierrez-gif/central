import { NextResponse } from 'next/server'
import { computeDniLookupHash } from '@central/module-seguros-pii'
import { operadorAutorizado } from '@/lib/operador'
import { prisma } from '@/lib/tenant'
import { correduriaUnica } from '@/lib/cartera'
import { auditado } from '@/lib/auditoria'
import { peticion } from '@/lib/codeoscopic/cliente'
import { resolverConfigEmision, leerOferta } from '@/lib/codeoscopic/emitir'
import { cuentaDeFicha, describirOrigenCuenta } from '@/lib/codeoscopic/cuenta-ficha'
import { ibanEnmascarado } from '@/lib/codeoscopic/emitir-iban'
import { hoyEnMadrid } from '@/lib/codeoscopic/fecha-efecto'
import { FRASE_SIN_CONFIRMACION } from '@/lib/codeoscopic/reintento-emision'
import {
  documentoTomador, matriculaProyecto, normalizarMatricula, ofertasDelProyecto, quoteCrudo, ramoDeLinea,
} from '@/lib/codeoscopic/importar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Importar un proyecto hecho A MANO en la web de Avant2 para emitirlo desde la
 * intranet (fila 13 del plan, 26/09/2026; spec
 * `docs/superpowers/specs/2026-09-26-importar-avant2-y-emitir-telegram-design.md`).
 *
 * `GET ?projectId=&polizaId=` → vista previa (gratis: una lectura del vendor).
 * `POST { projectId, polizaId, quoteId, confirmado: true }` → enlaza el proyecto a
 * la póliza que sustituye y deja la oferta como aceptada. **No llama a ReRate ni a
 * Submit**: la emisión sigue por `/emitir`, con sus guardas de siempre.
 *
 * El tomador se comprueba por el HASH del DNI (blind index de la ficha), nunca por
 * nombre: dos homónimos no se funden, y un DNI no cruza el puerto.
 */

type Contexto =
  | { ok: false; res: NextResponse }
  | {
      ok: true
      correduriaId: string
      poliza: { id: string; tipo: string; cliente_id: string; dni_lookup_hash: string | null; matricula: string | null }
      crudo: unknown
    }

async function cargar(projectId: string | null, polizaId: string | null): Promise<Contexto> {
  const error = (status: number, mensaje: string, causa = 'otro') => ({
    ok: false as const,
    res: NextResponse.json({ estado: 'error', causa, mensaje }, { status }),
  })
  if (!projectId || !/^\d{1,12}$/.test(projectId)) return error(400, 'projectId tiene que ser el número del proyecto de Avant2')
  if (!polizaId || !/^[0-9a-f-]{36}$/i.test(polizaId)) return error(400, 'falta polizaId (uuid)')

  const correduria = await correduriaUnica().catch(() => null)
  if (!correduria) return error(503, 'no se ha podido resolver la correduría')

  const filas = await prisma.$queryRaw<{ id: string; tipo: string; cliente_id: string; dni_lookup_hash: string | null; matricula: string | null }[]>`
    select p.id::text as id, p.tipo::text as tipo, p.cliente_id::text as cliente_id, c.dni_lookup_hash,
           p.datos_especificos->>'matricula' as matricula
    from polizas p join clientes c on c.id = p.cliente_id
    where p.id = ${polizaId}::uuid and p.correduria_id = ${correduria.id}::uuid
  `
  const poliza = filas[0]
  if (!poliza) return error(404, 'esa póliza no es de la cartera')

  const r = resolverConfigEmision()
  if (r.estado !== 'lista') {
    return error(503, r.estado === 'apagado' ? r.motivo : `faltan variables: ${r.faltan.join(', ')}`, 'apagado')
  }
  try {
    const crudo = await peticion(r.config, {
      metodo: 'GET',
      path: `/insurances/${encodeURIComponent(projectId)}`,
      timeoutMs: r.config.timeoutGenericoMs,
    })
    return { ok: true, correduriaId: correduria.id, poliza, crudo }
  } catch (e) {
    return error(502, `Avant2 no devuelve el proyecto ${projectId}: ${e instanceof Error ? e.message : String(e)}`, 'vendor')
  }
}

/**
 * Qué impide el enlace ANTES de elegir precio. Tres estados en tomador y vehículo: sí, no, no se
 * sabe — y «no se sabe» también bloquea: la póliza nueva se acuña con el riesgo de la que sustituye
 * (`registrarPolizaEmitida`), así que un proyecto de OTRO coche dejaría la matrícula equivocada y
 * marcaría como sustituida la póliza de un coche que sigue asegurado.
 */
function comprobar(ctx: Extract<Contexto, { ok: true }>) {
  const ramo = ramoDeLinea(ctx.crudo)
  const doc = documentoTomador(ctx.crudo)
  const hash = doc ? computeDniLookupHash(doc) : null
  const tomador: 'coincide' | 'distinto' | 'sin_dato' =
    !hash || !ctx.poliza.dni_lookup_hash ? 'sin_dato' : hash === ctx.poliza.dni_lookup_hash ? 'coincide' : 'distinto'
  const bloqueos: string[] = []
  if (!ramo) bloqueos.push('por ahora solo se importan proyectos de auto y moto')
  else if (ramo !== ctx.poliza.tipo) bloqueos.push(`el proyecto es de ${ramo} y la póliza de ${ctx.poliza.tipo}`)
  if (tomador === 'distinto') bloqueos.push('el tomador del proyecto no es el cliente de esta póliza (DNI distinto)')
  if (tomador === 'sin_dato') bloqueos.push('no se puede comprobar el tomador: falta el DNI en el proyecto o en la ficha')
  const matProyecto = matriculaProyecto(ctx.crudo)
  const matPoliza = normalizarMatricula(ctx.poliza.matricula)
  const vehiculo: 'coincide' | 'distinto' | 'sin_dato' =
    !matProyecto || !matPoliza ? 'sin_dato' : matProyecto === matPoliza ? 'coincide' : 'distinto'
  if (vehiculo === 'distinto') bloqueos.push('el vehículo del proyecto no es el de esta póliza (matrícula distinta)')
  if (vehiculo === 'sin_dato') bloqueos.push('no se puede comprobar el vehículo: falta la matrícula en el proyecto o en la póliza')
  return { ramo, tomador, vehiculo, bloqueos }
}

async function filaExistente(correduriaId: string, projectId: string) {
  const f = await prisma.$queryRaw<{ poliza_id: string | null; estado: string }[]>`
    select poliza_id::text as poliza_id, estado::text as estado
    from codeoscopic_projects
    where correduria_id = ${correduriaId}::uuid and project_id_codeoscopic = ${projectId}
  `
  return f[0] ?? null
}

function conflictoFila(fila: { poliza_id: string | null; estado: string } | null, polizaId: string): string | null {
  if (!fila) return null
  if (fila.estado === 'emitida') return 'este proyecto ya está emitido'
  if (fila.estado === 'riesgo_condicionado' || fila.estado === 'rechazada') {
    return `este proyecto está «${fila.estado}» en la intranet: se resuelve allí, no se reimporta`
  }
  if (fila.poliza_id && fila.poliza_id !== polizaId) return 'este proyecto ya está enlazado a otra póliza'
  return null
}

/**
 * 🚨 Otro proyecto de ESTA póliza con un intento de emisión sin aclarar. Soltarle la póliza (como
 * hace el enlace) le quitaría a `/emitir` el camino de acuñar o reintentar ese proyecto, y se
 * emitiría el importado encima: dos contratos reales sobre el mismo riesgo. Sin aclarar = Submit en
 * vuelo, Submit que salió bien y no se acuñó (`preemision` con intento), o fallo 5xx / sin
 * confirmación (la misma regla que `bloquearEnvio` de `emitir-envio.ts`). Un 4xx es un rechazo
 * limpio del vendor y no bloquea.
 */
async function intentoSinAclarar(correduriaId: string, polizaId: string, projectId: string): Promise<string | null> {
  const f = await prisma.$queryRaw<{ project_id_codeoscopic: string }[]>`
    select project_id_codeoscopic from codeoscopic_projects
    where correduria_id = ${correduriaId}::uuid and poliza_id = ${polizaId}::uuid
      and project_id_codeoscopic <> ${projectId} and estado <> 'emitida'
      and (submit_in_flight_at is not null
           or (submit_attempt_id is not null and estado = 'preemision')
           or error_mensaje ~ '^5[0-9]{2}([^0-9]|$)'
           or error_mensaje ilike ${'%' + FRASE_SIN_CONFIRMACION + '%'})
    limit 1
  `
  return f[0]
    ? `el proyecto ${f[0].project_id_codeoscopic} de esta póliza tiene un intento de emisión sin aclarar: ` +
        'ábrelo en la intranet y acúñalo o descártalo antes de importar otro'
    : null
}

export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  const url = new URL(req.url)
  const projectId = url.searchParams.get('projectId')?.trim() ?? null
  const ctx = await cargar(projectId, url.searchParams.get('polizaId')?.trim() ?? null)
  if (!ctx.ok) return ctx.res

  const { ramo, tomador, vehiculo, bloqueos } = comprobar(ctx)
  const conflicto = conflictoFila(await filaExistente(ctx.correduriaId, projectId!), ctx.poliza.id)
  if (conflicto) bloqueos.push(conflicto)
  const pendiente = await intentoSinAclarar(ctx.correduriaId, ctx.poliza.id, projectId!)
  if (pendiente) bloqueos.push(pendiente)
  const ofertas = ofertasDelProyecto(ctx.crudo, hoyEnMadrid())
  return NextResponse.json({
    estado: 'ok',
    projectId,
    ramo,
    tomador,
    vehiculo,
    bloqueos,
    ofertas: ofertas.filter((o) => o.emitible),
    otras: ofertas.filter((o) => !o.emitible).length,
  })
}

export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  const cuerpo = (await req.json().catch(() => ({}))) as Record<string, unknown>
  if (cuerpo.confirmado !== true) {
    return NextResponse.json(
      { estado: 'error', causa: 'sin_confirmar', mensaje: 'hay que mandar `confirmado: true`' },
      { status: 400 },
    )
  }
  const projectId = typeof cuerpo.projectId === 'string' ? cuerpo.projectId.trim() : null
  const quoteId = typeof cuerpo.quoteId === 'string' ? cuerpo.quoteId.trim() : null
  const ctx = await cargar(projectId, typeof cuerpo.polizaId === 'string' ? cuerpo.polizaId.trim() : null)
  if (!ctx.ok) return ctx.res

  const { ramo, bloqueos } = comprobar(ctx)
  if (bloqueos.length > 0) {
    return NextResponse.json({ estado: 'error', causa: 'bloqueado', mensaje: bloqueos.join(' · ') }, { status: 422 })
  }
  const oferta = ofertasDelProyecto(ctx.crudo, hoyEnMadrid()).find((o) => o.quoteId === quoteId)
  const crudoQuote = quoteId ? quoteCrudo(ctx.crudo, quoteId) : null
  if (!oferta || !crudoQuote) {
    return NextResponse.json({ estado: 'error', causa: 'otro', mensaje: 'ese precio no está en el proyecto' }, { status: 404 })
  }
  const categoria = oferta.categoria ?? oferta.modalidad
  if (!oferta.emitible || !oferta.compania || !categoria) {
    return NextResponse.json(
      { estado: 'error', causa: 'bloqueado', mensaje: `no se puede emitir ese precio: ${oferta.motivo ?? 'el proyecto no dice su compañía o su modalidad'}` },
      { status: 422 },
    )
  }

  const conflicto = conflictoFila(await filaExistente(ctx.correduriaId, projectId!), ctx.poliza.id)
  if (conflicto) return NextResponse.json({ estado: 'error', causa: 'otro', mensaje: conflicto }, { status: 409 })
  const pendiente = await intentoSinAclarar(ctx.correduriaId, ctx.poliza.id, projectId!)
  if (pendiente) return NextResponse.json({ estado: 'error', causa: 'otro', mensaje: pendiente }, { status: 409 })

  // Igual que `/oferta`: `uq_codeoscopic_projects_poliza` deja UN proyecto por póliza, así
  // que se suelta la póliza de cualquier otro proyecto suyo que no haya llegado a emitirse.
  await prisma.$executeRaw`
    update codeoscopic_projects set poliza_id = null
    where correduria_id = ${ctx.correduriaId}::uuid and poliza_id = ${ctx.poliza.id}::uuid
      and project_id_codeoscopic <> ${projectId!} and estado <> 'emitida'
  `
  // La condición va DENTRO del upsert (no solo en `conflictoFila`): dos imports a la vez del mismo
  // proyecto a pólizas distintas, o uno que se emite entre la lectura y aquí, no escriben nada.
  const escritas = await prisma.$queryRaw<{ id: string }[]>`
    insert into codeoscopic_projects (
      correduria_id, project_id_codeoscopic, producto, poliza_id, aseguradora,
      accepted_offer_id_codeoscopic, estado
    ) values (
      ${ctx.correduriaId}::uuid, ${projectId!}, ${ramo}::tipo_seguro, ${ctx.poliza.id}::uuid,
      ${oferta.compania}, ${oferta.quoteId}, 'preemision'
    )
    on conflict (correduria_id, project_id_codeoscopic) do update
      set poliza_id = excluded.poliza_id,
          producto = excluded.producto,
          aseguradora = excluded.aseguradora,
          accepted_offer_id_codeoscopic = excluded.accepted_offer_id_codeoscopic,
          estado = 'preemision'::codeoscopic_project_estado
      where codeoscopic_projects.estado not in ('emitida', 'riesgo_condicionado', 'rechazada')
        and codeoscopic_projects.submit_in_flight_at is null
        and (codeoscopic_projects.poliza_id is null or codeoscopic_projects.poliza_id = excluded.poliza_id)
    returning id::text as id
  `
  if (escritas.length === 0) {
    return NextResponse.json(
      { estado: 'error', causa: 'otro', mensaje: 'el proyecto ha cambiado mientras se enlazaba (otra pestaña o una emisión en curso): vuelve a leerlo' },
      { status: 409 },
    )
  }

  // Misma forma que la respuesta de `/oferta`: la pantalla de emisión ya sabe pintarla.
  const cuenta = await cuentaDeFicha(ctx.correduriaId, ctx.poliza.id, ctx.poliza.cliente_id)
  return NextResponse.json({
    estado: 'ok',
    projectId,
    compania: oferta.compania,
    categoria,
    oferta: leerOferta(crudoQuote),
    cuenta: cuenta.iban
      ? { enmascarada: ibanEnmascarado(cuenta.iban), origen: cuenta.origen, descripcion: cuenta.origen ? describirOrigenCuenta(cuenta.origen) : null }
      : cuenta.aviso
        ? { aviso: cuenta.aviso }
        : null,
  })
})
