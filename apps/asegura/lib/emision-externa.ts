// Registrar en la intranet una emisión hecha FUERA de ella —en la web de Avant2— sin volver a emitir
// (30/09/2026). Caso fundacional: la moto de Manuel Piña (proyecto 40967960), que Allianz dejó en
// «RIESGO CONDICIONADO». Lo único que se llama al vendor es `GET /insurances/{id}` (lectura, 0 €).
//
// Lo puro (leer `policyApplications[]`, decidir el estado) vive en `codeoscopic/emision-externa.ts`.
// Aquí solo hay BD y red de lectura. NO se llama a `trasEmision` ni se manda nada al cliente:
// registrar lo que ya pasó no es avisar de ello.
//
// Fail-closed: sin ramo de vehículo, sin tomador demostrado POR DOCUMENTO (hash del DNI, nunca por
// nombre) o sin solicitud de emisión en el proyecto, no se escribe nada.

import { computeDniLookupHash } from '@central/module-seguros-pii'
import { prismaAsegura } from './asegura-db'
import { catalogoCompanias, registrarPolizaEmitida } from './emision'
import { registrarErrorCartera } from './error-cartera'
import { cambiarEstadoOportunidad } from './oportunidad-seguimiento'
import { resolverConfig } from './codeoscopic/config'
import { ErrorCodeoscopic, peticion } from './codeoscopic/cliente'
import { redactarCrudoVendor } from './codeoscopic/emitir'
import { documentoTomador, fraccionamientoDeOferta, ramoDeLinea } from './codeoscopic/importar'
import { riesgoDeTarificacion } from './codeoscopic/contexto-emision'
import { coincideCompania } from './emision-externa-reglas'
import { describirEmisionExterna, estadoProyectoDe, leerEmisionExterna, resumenEmision, type EmisionResumen } from './codeoscopic/emision-externa'

/** Igual que `MARGEN_EN_VUELO_MIN` de `codeoscopic/emitir-envio.ts`: mismo candado, misma semántica. */
const MARGEN_EN_VUELO_MIN = 10

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type EstadoProyectoExterno = 'riesgo_condicionado' | 'rechazada'
export type AccionExterna = 'acunar' | 'retener' | 'rechazar' | 'nada'

export type EntradaSincronizar = {
  projectId: string
  clienteId?: string | null
  oportunidadId?: string | null
  actor: string
  /** `false` = vista previa: lee el vendor y decide, sin tocar la BD. */
  escribir: boolean
  /**
   * El `GET /insurances/{id}` YA leído (el descubrimiento lo lee para casar el tomador y no lo
   * repite). Sin él se lee aquí. Solo cambia de dónde sale el crudo: las comprobaciones son las mismas.
   */
  crudo?: unknown
}

export type ResultadoSincronizar =
  | {
      ok: true
      tipo: 'vista'
      projectId: string
      ramo: string | null
      emision: EmisionResumen
      estadoProyecto: EstadoProyectoExterno | null
      accion: AccionExterna
      oportunidadId: string | null
      bloqueos: string[]
    }
  | {
      ok: true
      tipo: 'escrito'
      estado: 'ok' | 'ya_emitida' | 'emitido_sin_acunar'
      antes: string | null
      despues: string | null
      polizaId: string | null
      numeroPoliza: string | null
      compania: string | null
      descripcion: string
      oportunidadGanada: boolean
      mensaje?: string
    }
  // `origen`: de quién es el fallo. El vendor (502) y la BD (503) no se confunden.
  | { ok: false; status: 400 | 404 | 409 | 422 | 502 | 503; origen: 'entrada' | 'vendor' | 'bd'; mensaje: string }

const fallo = (status: 400 | 404 | 409 | 422 | 502 | 503, mensaje: string, origen: 'entrada' | 'vendor' | 'bd' = 'entrada'): ResultadoSincronizar => ({ ok: false, status, origen, mensaje })

function accionDe(estado: ReturnType<typeof leerEmisionExterna>): AccionExterna {
  if (estado.estado === 'aprobada' && estado.solicitud.numeroPoliza) return 'acunar'
  const proyecto = estadoProyectoDe(estado)
  if (proyecto === 'riesgo_condicionado') return 'retener'
  if (proyecto === 'rechazada') return 'rechazar'
  return 'nada'
}

type FilaProyecto = { estado: string; poliza_id: string | null; cliente_id: string | null; oportunidad_id: string | null; aseguradora: string | null }

export async function sincronizarEmisionExterna(correduriaId: string, entrada: EntradaSincronizar): Promise<ResultadoSincronizar> {
  const projectId = (entrada.projectId ?? '').trim()
  if (!/^\d{1,12}$/.test(projectId)) return fallo(400, 'projectId tiene que ser el número del proyecto de Avant2')
  if (entrada.clienteId && !UUID.test(entrada.clienteId)) return fallo(400, 'clienteId no es un uuid')
  if (entrada.oportunidadId && !UUID.test(entrada.oportunidadId)) return fallo(400, 'oportunidadId no es un uuid')

  // ── BD: la fila, el cliente y la oportunidad ─────────────────────────────
  let fila: FilaProyecto | null
  let clienteId: string
  let hashFicha: string | null
  let oportunidad: { id: string; estado: string } | null = null
  const bloqueos: string[] = []
  try {
    const db = prismaAsegura()
    const [f] = await db.$queryRaw<FilaProyecto[]>`
      select estado::text as estado, poliza_id::text as poliza_id, cliente_id::text as cliente_id,
             oportunidad_id::text as oportunidad_id, aseguradora
      from codeoscopic_projects
      where correduria_id = ${correduriaId}::uuid and project_id_codeoscopic = ${projectId}
      limit 1`
    fila = f ?? null

    if (fila?.estado === 'emitida') {
      const ya = await yaEmitida(correduriaId, projectId, fila)
      return entrada.escribir ? ya : vistaDeYaEmitida(projectId, ya)
    }

    const delCliente = entrada.clienteId ?? null
    if (delCliente && fila?.cliente_id && delCliente.toLowerCase() !== fila.cliente_id.toLowerCase()) {
      return fallo(409, 'ese proyecto ya está enlazado a OTRO cliente: no se reasigna solo')
    }
    const elegido = delCliente ?? fila?.cliente_id ?? null
    if (!elegido) return fallo(400, 'falta clienteId: el proyecto no está enlazado a ningún cliente')
    const [c] = await db.$queryRaw<{ id: string; dni_lookup_hash: string | null }[]>`
      select id::text as id, dni_lookup_hash from clientes
      where id = ${elegido}::uuid and correduria_id = ${correduriaId}::uuid and merged_into_cliente_id is null
      limit 1`
    if (!c) return fallo(404, 'ese cliente no es de la cartera')
    clienteId = c.id
    hashFicha = c.dni_lookup_hash

    // La oportunidad: la pasada, la de la fila o la de la tarificación de ese proyecto.
    let oportunidadId = entrada.oportunidadId ?? fila?.oportunidad_id ?? null
    if (!oportunidadId) {
      const [t] = await db.$queryRaw<{ oportunidad_id: string }[]>`
        select oportunidad_id::text as oportunidad_id from tarificaciones
        where correduria_id = ${correduriaId}::uuid and project_id_codeoscopic = ${projectId} and oportunidad_id is not null
        order by creado_at limit 1`
      oportunidadId = t?.oportunidad_id ?? null
    }
    if (oportunidadId) {
      const [o] = await db.$queryRaw<{ id: string; estado: string; cliente_id: string }[]>`
        select id::text as id, estado::text as estado, cliente_id::text as cliente_id from oportunidades
        where id = ${oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid limit 1`
      if (!o) bloqueos.push('la oportunidad no es de esta correduría')
      else if (o.cliente_id.toLowerCase() !== clienteId.toLowerCase()) bloqueos.push('la oportunidad es de OTRO cliente')
      else oportunidad = { id: o.id, estado: o.estado }
    }
  } catch (e) {
    return fallo(503, registrarErrorCartera('emision-externa/lectura', e), 'bd')
  }

  // ── Vendor: SOLO lectura (0 €). No exige el interruptor de gasto. ──
  const cfg = resolverConfig(process.env, { ignorarInterruptor: true })
  if (cfg.estado !== 'lista') return fallo(503, 'Codeoscopic no está configurado', 'vendor')
  let crudo: unknown
  try {
    crudo = entrada.crudo !== undefined ? entrada.crudo : await peticion(cfg.config, { metodo: 'GET', path: `/insurances/${projectId}`, timeoutMs: cfg.config.timeoutGenericoMs })
  } catch (e) {
    const causa = e instanceof ErrorCodeoscopic ? `vendor:${e.clase}${e.status ? ` ${e.status}` : ''}` : `vendor: ${e instanceof Error ? e.message : String(e)}`
    return fallo(502, causa, 'vendor')
  }

  // ── Bloqueos (fail-closed) ──
  const ramo = ramoDeLinea(crudo)
  if (!ramo) bloqueos.push('solo se registran emisiones de auto y moto')
  const doc = documentoTomador(crudo)
  const hashTomador = doc ? computeDniLookupHash(doc) : null
  if (!hashTomador) bloqueos.push('el proyecto no trae documento del tomador: no se demuestra de quién es')
  else if (!hashFicha) bloqueos.push('la ficha del cliente no tiene DNI: no se puede comprobar el tomador')
  else if (hashTomador !== hashFicha) bloqueos.push('el tomador del proyecto NO es este cliente (documento distinto)')

  const emision = leerEmisionExterna(crudo)
  if (emision.estado === 'sin_solicitud') bloqueos.push('el proyecto no cuenta ninguna emisión (sin solicitud): no hay nada que registrar')
  const estadoProyecto = estadoProyectoDe(emision)
  const accion = accionDe(emision)

  if (!entrada.escribir) {
    return { ok: true, tipo: 'vista', projectId, ramo, emision: resumenEmision(emision), estadoProyecto, accion, oportunidadId: oportunidad?.id ?? null, bloqueos }
  }
  if (bloqueos.length > 0 || emision.estado === 'sin_solicitud' || !ramo) return fallo(422, `no se registra: ${bloqueos.join('; ')}`)
  // Un estado que no se reconoce no inventa filas: sin fila previa no se escribe nada.
  if (accion === 'nada' && !fila) return fallo(422, 'Avant2 da un estado que no se reconoce: se mira allí')

  const compania = emision.compania
  const descripcion = describirEmisionExterna(emision)
  const numeroPoliza = emision.solicitud.numeroPoliza
  const antes = fila?.estado ?? null

  try {
    const db = prismaAsegura()
    // 🚨 Nunca el crudo sin redactar: trae IBAN/DNI/email del tomador y `quote_data` es jsonb sin cifrar.
    const quoteData = JSON.stringify(redactarCrudoVendor(crudo))
    const insercion = estadoProyecto ?? 'preemision'
    const filas = await db.$queryRaw<{ estado: string }[]>`
      insert into codeoscopic_projects (correduria_id, project_id_codeoscopic, producto, cliente_id, oportunidad_id, aseguradora, estado, quote_data)
      values (${correduriaId}::uuid, ${projectId}, ${ramo}::tipo_seguro, ${clienteId}::uuid, ${oportunidad?.id ?? null}::uuid,
              ${compania}, ${insercion}::codeoscopic_project_estado, ${quoteData}::jsonb)
      on conflict (correduria_id, project_id_codeoscopic) do update set
        cliente_id = excluded.cliente_id,
        oportunidad_id = coalesce(excluded.oportunidad_id, codeoscopic_projects.oportunidad_id),
        producto = excluded.producto,
        aseguradora = coalesce(excluded.aseguradora, codeoscopic_projects.aseguradora),
        quote_data = excluded.quote_data,
        estado = case when ${estadoProyecto}::text is null then codeoscopic_projects.estado else ${estadoProyecto}::codeoscopic_project_estado end,
        updated_at = case when ${estadoProyecto}::text is not null and codeoscopic_projects.estado::text is distinct from ${estadoProyecto}::text
                          then now() else codeoscopic_projects.updated_at end
      where codeoscopic_projects.estado <> 'emitida'
        and (codeoscopic_projects.cliente_id is null or codeoscopic_projects.cliente_id = excluded.cliente_id)
      returning estado::text as estado`
    if (filas.length === 0) {
      // Otra petición la acuñó, o la enlazó a OTRO cliente, entre la lectura y aquí: no se pisa.
      const [otra] = await db.$queryRaw<FilaProyecto[]>`
        select estado::text as estado, poliza_id::text as poliza_id, cliente_id::text as cliente_id, oportunidad_id::text as oportunidad_id, aseguradora
        from codeoscopic_projects where correduria_id = ${correduriaId}::uuid and project_id_codeoscopic = ${projectId} limit 1`
      if (otra && otra.estado !== 'emitida') return fallo(409, 'ese proyecto se ha enlazado a otro cliente mientras tanto')
      return await yaEmitida(correduriaId, projectId, otra ?? { estado: 'emitida', poliza_id: null, cliente_id: null, oportunidad_id: null, aseguradora: null })
    }
    let despues: string = filas[0].estado
    let polizaId: string | null = null
    let estado: 'ok' | 'emitido_sin_acunar' = 'ok'
    let mensaje: string | undefined
    let oportunidadGanada = false

    if (accion === 'acunar') {
      const catalogo = await catalogoCompanias()
      const codigoDgs = compania ? catalogo?.find((c) => coincideCompania(c.nombreComun, compania))?.codigoDgs ?? null : null
      if (!codigoDgs) {
        estado = 'emitido_sin_acunar'
        mensaje = compania
          ? `«${compania}» no tiene código DGS en companias_dgs: acuña la póliza nº ${numeroPoliza} a mano.`
          : `el proyecto no dice la compañía: acuña la póliza nº ${numeroPoliza} a mano.`
      } else {
        // Candado de `/emitir` (`submit_in_flight_at`). La exclusión del acuñado la da ya la BD
        // (compuerta atómica de `registrarPolizaEmitida`, `lib/acunado-unico.ts`); el candado sirve para
        // que, si `/emitir` está a medias, acuñe ÉL (con su póliza de origen y su correo al cliente).
        const reclamada = await db.$queryRaw<{ id: string }[]>`
          update codeoscopic_projects set submit_in_flight_at = now()
          where correduria_id = ${correduriaId}::uuid and project_id_codeoscopic = ${projectId}
            and estado <> 'emitida'
            and (submit_in_flight_at is null or submit_in_flight_at < now() - (${MARGEN_EN_VUELO_MIN}::int * interval '1 minute'))
          returning id::text as id`
        if (reclamada.length === 0) {
          // ¿La acuñó otra operación que ya terminó? Entonces no hay conflicto: ya está.
          const [ahora] = await db.$queryRaw<FilaProyecto[]>`
            select estado::text as estado, poliza_id::text as poliza_id, cliente_id::text as cliente_id, oportunidad_id::text as oportunidad_id, aseguradora
            from codeoscopic_projects where correduria_id = ${correduriaId}::uuid and project_id_codeoscopic = ${projectId} limit 1`
          if (ahora?.estado === 'emitida') return await yaEmitida(correduriaId, projectId, ahora)
          return fallo(409, 'otra operación está registrando este proyecto ahora mismo: vuelve a mirarlo en un minuto')
        }
        try {
          const acunado = await registrarPolizaEmitida(correduriaId, {
            clienteId,
            actor: entrada.actor,
            catalogo: catalogo ?? undefined,
            proyecto: {
              projectIdCodeoscopic: projectId,
              producto: ramo,
              codigoDgs,
              numeroPoliza,
              primaAnual: emision.primaEur,
              emitidaEn: emision.solicitud.creadaEn ?? new Date().toISOString(),
              riesgo: riesgoDeTarificacion(ramo, crudo),
              fraccionamiento: fraccionamientoDeOferta(crudo, emision.quoteId),
            },
          })
          if (!acunado.ok && acunado.estado === 'ya_acunada') {
            // Otra operación (botón, webhook, otra pasada) lo acuñó mientras tanto: idempotente, ya está.
            const [ahora] = await db.$queryRaw<FilaProyecto[]>`
              select estado::text as estado, poliza_id::text as poliza_id, cliente_id::text as cliente_id, oportunidad_id::text as oportunidad_id, aseguradora
              from codeoscopic_projects where correduria_id = ${correduriaId}::uuid and project_id_codeoscopic = ${projectId} limit 1`
            return await yaEmitida(correduriaId, projectId, ahora ?? { estado: 'emitida', poliza_id: acunado.polizaId, cliente_id: null, oportunidad_id: null, aseguradora: null })
          }
          if (!acunado.ok) {
            estado = 'emitido_sin_acunar'
            mensaje = `La compañía ya tiene la póliza nº ${numeroPoliza} pero no se ha podido registrar en la cartera: ${acunado.motivo}`
          } else {
            polizaId = acunado.polizaId
            despues = 'emitida'
            if (oportunidad && oportunidad.estado !== 'ganada' && oportunidad.estado !== 'perdida') {
              const g = await cambiarEstadoOportunidad(correduriaId, oportunidad.id, { accion: 'ganar', polizaGanadaId: polizaId }, entrada.actor)
              oportunidadGanada = g.ok
              if (!g.ok) mensaje = `póliza acuñada, pero la oportunidad no se ha podido marcar ganada: ${g.motivo}`
            }
          }
        } finally {
          await db.$executeRaw`
            update codeoscopic_projects set submit_in_flight_at = null
            where correduria_id = ${correduriaId}::uuid and project_id_codeoscopic = ${projectId}`.catch(() => undefined)
        }
      }
    }

    if (antes !== despues) {
      const texto = `Emisión hecha fuera de la intranet (Avant2, proyecto ${projectId}): ${descripcion}. Estado del proyecto: ${antes ?? 'sin registrar'} → ${despues}. Por ${entrada.actor}`
      await db.$executeRaw`
        insert into historial_interno (correduria_id, cliente_id, tipo, texto)
        values (${correduriaId}::uuid, ${clienteId}::uuid, cast('gestion' as tipo_historial_interno), ${texto})`
    }
    return { ok: true, tipo: 'escrito', estado, antes, despues, polizaId, numeroPoliza, compania, descripcion, oportunidadGanada, ...(mensaje ? { mensaje } : {}) }
  } catch (e) {
    return fallo(503, registrarErrorCartera('emision-externa/escritura', e), 'bd')
  }
}

async function yaEmitida(correduriaId: string, projectId: string, fila: FilaProyecto): Promise<ResultadoSincronizar> {
  let numeroPoliza: string | null = null
  if (fila.poliza_id) {
    const [p] = await prismaAsegura().$queryRaw<{ numero_poliza: string | null }[]>`
      select numero_poliza from polizas where id = ${fila.poliza_id}::uuid and correduria_id = ${correduriaId}::uuid limit 1`
    numeroPoliza = p?.numero_poliza ?? null
  }
  return {
    ok: true,
    tipo: 'escrito',
    estado: 'ya_emitida',
    antes: 'emitida',
    despues: 'emitida',
    polizaId: fila.poliza_id,
    numeroPoliza,
    compania: fila.aseguradora,
    descripcion: `el proyecto ${projectId} ya está emitido en la intranet: no se toca`,
    oportunidadGanada: false,
  }
}

/**
 * Vista previa de un proyecto que YA está emitido en la intranet: no se llama al vendor (no hace falta
 * y cuesta una petición). `emision` es un resumen mínimo coherente con `EmisionResumen`: estado
 * 'aprobada' y el nº de la póliza acuñada; lo que solo diría el vendor (modalidad, prima, solicitud)
 * va a null.
 */
function vistaDeYaEmitida(projectId: string, ya: ResultadoSincronizar): ResultadoSincronizar {
  if (!ya.ok || ya.tipo !== 'escrito') return ya
  const descripcion = ya.descripcion
  return {
    ok: true,
    tipo: 'vista',
    projectId,
    ramo: null,
    emision: { estado: 'aprobada', compania: ya.compania, modalidad: null, primaEur: null, numeroPoliza: ya.numeroPoliza, solicitudId: null, estadoVendor: null, descripcion },
    estadoProyecto: null,
    accion: 'nada',
    oportunidadId: null,
    bloqueos: ['este proyecto ya está emitido en la intranet'],
  }
}
