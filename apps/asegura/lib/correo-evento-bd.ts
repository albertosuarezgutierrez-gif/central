// apps/asegura/lib/correo-evento-bd.ts
//
// La mitad con BD de los eventos de correo de compañías (14/10/2026). Lo que se DECIDE está en
// `correo-evento.ts` (puro, con test); aquí solo se lee el contexto, se aplica el plan y se deja rastro.
//
//   1. Reserva: fila en `correo_evento_entrante` con la llave única (correduría, Message-ID, tipo, clave)
//      ANTES de escribir nada. Si ya existía, el triaje está releyendo el correo: se devuelve lo que se
//      hizo la primera vez y no se escribe nada (idempotencia).
//   2. Contexto: póliza por nº + compañía entre la cartera VIVA (el plan exige EN VIGOR para escribir),
//      siniestro con ese nº, expediente de anulación abierto, tarea abierta de la misma póliza/recibo.
//   3. Plan → escrituras: siniestro (`abrirSiniestro`, la MISMA lógica que el POST /siniestro), nota en
//      `historial_interno`, tarea en `gestiones` (colgada de la oportunidad abierta de la póliza con
//      `crearTarea` de `oportunidad-seguimiento.ts`; si no hay, tarea SUELTA de Mi mesa).
//   4. La fila pasa a su desenlace. Si algo revienta a mitad, se queda `procesando` con el error: NO se
//      reintenta sola (un siniestro ya creado se duplicaría) y la bandeja lo enseña para mirarlo a mano.
//
// El SQL crudo NO prefija el schema: la conexión ya trae `?schema=seguros`.

import { WHERE_CARTERA_VIVA } from '@central/module-seguros'
import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'
import { anotarCambio } from './auditoria'
import { abrirSiniestro } from './cartera-siniestros'
import { crearTarea } from './oportunidad-seguimiento'
import { esTablaInexistente } from './correo-avisos-intranet'
import {
  ACTOR_CORREO, ORIGEN_TAREA_CORREO, campoFechaDedupe, planSolicitud, type OportunidadSolicitud, claveNumero, claveTareaDe, elegirSiniestroAcotado, esCheckTipoEventoCorreo, importeDeItem,
  TOPE_SINIESTROS_CANDIDATOS, decidirReevaluacionEmision, planItem, resolverPolizaEvento,
  tareaValida, type EleccionSiniestro, type EntradaEvento, type EstadoEventoCorreo, type ExpedienteAbierto, type ItemEvento, type Plan,
  type PolizaCandidata,
} from './correo-evento'

export type ResultadoItemCorreo = {
  tipo: ItemEvento['tipo']
  clave: string
  subtipo: string | null
  numeroPoliza: string | null
  estado: EstadoEventoCorreo
  /** `true` = el correo ya se había procesado: no se ha escrito nada ahora. */
  repetido: boolean
  resumen: string
  motivo: string | null
  clienteId: string | null
  /** Nombre del tomador para el aviso de Telegram (no se guarda en la tabla). */
  cliente: string | null
  polizaId: string | null
  siniestroId: string | null
  /** Vencimiento de la tarea creada (aaaa-mm-dd), si se creó. */
  tareaVence: string | null
}

export type ResultadoEventoCorreo =
  | { ok: true; resultados: ResultadoItemCorreo[] }
  | { ok: false; estado: 'sin_migracion'; motivo: string }

const ABIERTAS = ['competencia', 'en_negociacion', 'pendiente_cliente']
const ANULACION_ABIERTA = ['solicitada', 'firmada', 'comunicada']

type Db = ReturnType<typeof prismaAsegura>

function hoyMadrid(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
}

function numeroDe(i: ItemEvento): string | null {
  return i.tipo === 'solicitud' ? null : i.numeroPoliza
}

async function polizasCandidatas(db: Db, correduriaId: string): Promise<(PolizaCandidata & { cliente: string | null })[]> {
  // La cartera viva son unas pocas centenas: se lee una vez por correo y se resuelve en memoria (mismo
  // criterio que `resolverPolizasDeCorreo`). El volcado histórico (leads) ni se lee.
  const filas = await db.poliza.findMany({
    where: { AND: [{ correduriaId }, WHERE_CARTERA_VIVA, { mergedIntoPolizaId: null }, { numeroPoliza: { not: null } }, { cliente: { activo: true } }] },
    orderBy: { id: 'asc' },
    select: {
      id: true, clienteId: true, numeroPoliza: true, codigoEntidadDgs: true, aseguradora: true, importRef: true, eiacXmlHash: true,
      estado: true, sustituidaAt: true, cliente: { select: { nombre: true, apellidos: true } },
    },
  })
  return filas.map((p) => ({
    id: p.id, clienteId: p.clienteId, numeroPoliza: p.numeroPoliza, codigoDgs: p.codigoEntidadDgs, aseguradora: p.aseguradora,
    importRef: p.importRef, eiacXmlHash: p.eiacXmlHash, estado: String(p.estado), sustituidaAt: p.sustituidaAt,
    cliente: [p.cliente?.nombre, p.cliente?.apellidos].filter(Boolean).join(' ') || null,
  }))
}

/** El siniestro con ese nº: la consulta acota por «contiene»; compañía y póliza las decide `elegirSiniestro` (puro, con test). */
async function siniestroPorNumero(
  db: Db, correduriaId: string, compania: string, codigoDgs: string, numero: string, numeroPolizaCorreo: string | null,
): Promise<EleccionSiniestro> {
  const n = claveNumero(numero)
  if (!n) return { estado: 'ninguno' }
  const filas = await db.siniestro.findMany({
    where: {
      correduriaId, fusionadoEnSiniestroId: null,
      OR: [{ idSiniestroEntidad: { contains: n } }, { referencia: { contains: n } }],
    },
    select: {
      id: true, origen: true, clienteId: true, polizaId: true, idSiniestroEntidad: true, referencia: true, codigoEntidadDgs: true,
      poliza: { select: { numeroPoliza: true, codigoEntidadDgs: true, aseguradora: true } },
    },
    take: TOPE_SINIESTROS_CANDIDATOS + 1,
  })
  return elegirSiniestroAcotado(filas.map((s) => ({
    id: s.id, origen: String(s.origen), clienteId: s.clienteId, polizaId: s.polizaId,
    idSiniestroEntidad: s.idSiniestroEntidad, referencia: s.referencia, codigoEntidadDgs: s.codigoEntidadDgs,
    poliza: s.poliza ? { numeroPoliza: s.poliza.numeroPoliza, codigoDgs: s.poliza.codigoEntidadDgs, aseguradora: s.poliza.aseguradora } : null,
  })), TOPE_SINIESTROS_CANDIDATOS, numero, compania, codigoDgs, numeroPolizaCorreo)
}

async function expedienteAbierto(db: Db, correduriaId: string, polizaId: string): Promise<ExpedienteAbierto | null> {
  const [a] = await db.$queryRaw<{ id: string; estado: string; fechaEfecto: string | null }[]>(Prisma.sql`
    select id::text as id, estado::text as estado, to_char(fecha_efecto, 'YYYY-MM-DD') as "fechaEfecto"
    from anulacion where correduria_id = ${correduriaId}::uuid and poliza_id = ${polizaId}::uuid
      and estado::text = any(${ANULACION_ABIERTA}::text[])
    order by created_at desc limit 1`)
  return a ?? null
}

async function hayTareaAbierta(db: Db, correduriaId: string, claveTarea: string): Promise<boolean> {
  const [r] = await db.$queryRaw<{ n: number }[]>(Prisma.sql`
    select count(*)::int as n from correo_evento_entrante e
    join gestiones g on g.id = e.gestion_id and g.correduria_id = e.correduria_id
    where e.correduria_id = ${correduriaId}::uuid and e.clave_tarea = ${claveTarea} and g.estado::text <> 'cerrada'`)
  return (r?.n ?? 0) > 0
}

/**
 * ¿Ya se anotó ESTE aviso? Fila `aplicado` de la misma clave de tarea (póliza/recibo) con la misma fecha de la
 * compañía. El resumen diario de Occident («próximos a la anulación») repite el mismo recibo cada día con otro
 * Message-ID: la idempotencia por correo no lo para, y la ficha se llenaba de la misma nota.
 */
async function notaYaAnotada(
  db: Db, correduriaId: string, filaId: string, claveTarea: string, campo: string, fecha: string | null,
): Promise<boolean> {
  const [r] = await db.$queryRaw<{ n: number }[]>(Prisma.sql`
    select count(*)::int as n from correo_evento_entrante e
    where e.correduria_id = ${correduriaId}::uuid and e.id <> ${filaId}::uuid
      and e.estado = 'aplicado' and e.clave_tarea = ${claveTarea}
      and (e.detalle->>${campo}) is not distinct from ${fecha}`)
  return (r?.n ?? 0) > 0
}

async function anotar(db: Db, correduriaId: string, clienteId: string, polizaId: string | null, tipo: 'gestion' | 'siniestro', texto: string): Promise<void> {
  await db.$executeRaw(Prisma.sql`
    insert into historial_interno (correduria_id, cliente_id, poliza_id, tipo, texto)
    values (${correduriaId}::uuid, ${clienteId}::uuid, ${polizaId}::uuid, cast(${tipo} as tipo_historial_interno), ${texto.slice(0, 2000)})`)
}

/** La tarea: colgada de la oportunidad abierta de la póliza si la hay (dos listas sobre el mismo cliente se pisan); si no, suelta. */
async function crearTareaCorreo(
  db: Db, correduriaId: string, clienteId: string, polizaId: string, t: NonNullable<Plan['tarea']>,
): Promise<string> {
  const [op] = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    select o.id::text as id from oportunidades o
    where o.correduria_id = ${correduriaId}::uuid and o.estado::text = any(${ABIERTAS}::text[])
      and (o.poliza_id = ${polizaId}::uuid or o.info_riesgo->>'polizaId' = ${polizaId})
    order by o.created_at desc limit 1`)
  if (op) {
    const r = await crearTarea(correduriaId, op.id, t, ACTOR_CORREO)
    if (r.ok) return r.tareaId
    // Cerrada entre medias o rechazada: se cae a la suelta, no se pierde la tarea.
  }
  const [g] = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    insert into gestiones (correduria_id, tipo, prioridad, estado, observaciones, fecha_limite, cliente_id, poliza_id, origen_trigger)
    values (${correduriaId}::uuid, cast(${t.tipo} as gestion_tipo), cast(${t.prioridad} as gestion_prioridad), 'pendiente',
            ${t.observaciones}, (${t.fechaLimite}::date + time '23:59:59') at time zone 'Europe/Madrid',
            ${clienteId}::uuid, ${polizaId}::uuid, ${ORIGEN_TAREA_CORREO})
    returning id::text as id`)
  anotarCambio({ entidad: 'gestion', id: g.id, campo: 'estado', antes: null, despues: 'pendiente' })
  return g.id
}

type FilaGuardada = {
  estado: EstadoEventoCorreo; resumen: string | null; motivo: string | null; clienteId: string | null
  polizaId: string | null; siniestroId: string | null; fechaLimite: string | null
}

async function procesarItem(
  db: Db, correduriaId: string, entrada: EntradaEvento, item: ItemEvento,
  candidatas: Awaited<ReturnType<typeof polizasCandidatas>>, fechaCorreo: string | null, hoy: string, instanteCorreo: Date | null,
): Promise<ResultadoItemCorreo> {
  const subtipo = item.tipo === 'siniestro' ? item.subtipo : null
  const numeroPoliza = numeroDe(item)
  const salida = (f: FilaGuardada, repetido: boolean, cliente: string | null): ResultadoItemCorreo => ({
    tipo: item.tipo, clave: item.clave, subtipo, numeroPoliza, estado: f.estado, repetido,
    resumen: f.resumen ?? (f.estado === 'procesando' ? 'sin desenlace confirmado: míralo' : ''), motivo: f.motivo,
    clienteId: f.clienteId, cliente, polizaId: f.polizaId, siniestroId: f.siniestroId, tareaVence: f.fechaLimite,
  })

  // 1. Reserva (idempotencia).
  const reservada = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    insert into correo_evento_entrante (correduria_id, mensaje_id, tipo, subtipo, clave, compania, codigo_entidad_dgs, numero_poliza, estado, detalle)
    values (${correduriaId}::uuid, ${entrada.mensajeId}, ${item.tipo}, ${subtipo}, ${item.clave}, ${entrada.compania}, ${entrada.codigoDgs},
            ${numeroPoliza}, 'procesando', ${JSON.stringify(item)}::jsonb)
    on conflict (correduria_id, mensaje_id, tipo, clave) do nothing
    returning id::text as id`)
  if (reservada.length === 0) {
    const [f] = await db.$queryRaw<FilaGuardada[]>(Prisma.sql`
      select estado, resumen, motivo, cliente_id::text as "clienteId", poliza_id::text as "polizaId", siniestro_id::text as "siniestroId",
             to_char(fecha_limite, 'YYYY-MM-DD') as "fechaLimite"
      from correo_evento_entrante
      where correduria_id = ${correduriaId}::uuid and mensaje_id = ${entrada.mensajeId} and tipo = ${item.tipo} and clave = ${item.clave}`)
    const cliente = f?.polizaId ? candidatas.find((p) => p.id === f.polizaId)?.cliente ?? null : null
    return salida(f ?? { estado: 'procesando', resumen: null, motivo: null, clienteId: null, polizaId: null, siniestroId: null, fechaLimite: null }, true, cliente)
  }
  const filaId = reservada[0].id
  // Una solicitud no tiene póliza: se casa con la OPORTUNIDAD por su nº (camino propio).
  if (item.tipo === 'solicitud') return procesarSolicitud(db, correduriaId, entrada.compania, item, filaId, fechaCorreo, instanteCorreo, hoy)

  try {
    // 2. Contexto.
    const eleccion = item.tipo === 'siniestro'
      ? await siniestroPorNumero(db, correduriaId, entrada.compania, entrada.codigoDgs, item.numeroSiniestro, item.numeroPoliza)
      : null
    const siniestro = eleccion?.estado === 'casa' ? eleccion.siniestro : null
    const siniestroPolizaDistinta = eleccion?.estado === 'poliza_distinta'
    // Si el siniestro ya está en la cartera, la nota va a SU ficha (el plan no mira la póliza).
    const resolucion = resolverPolizaEvento(numeroPoliza, entrada.compania, entrada.codigoDgs, candidatas)
    const poliza = resolucion.estado === 'sin_resolver' ? null : (resolucion.poliza as (typeof candidatas)[number])
    const expediente = item.tipo === 'anulacion' && poliza && resolucion.estado === 'en_vigor' ? await expedienteAbierto(db, correduriaId, poliza.id) : null
    // Una emisión nunca crea tarea ni nota: no lleva clave de tarea.
    const claveProvisional = poliza && item.tipo !== 'siniestro' && item.tipo !== 'emision' ? claveTareaDe(item, poliza.id) : null
    const tareaAbierta = claveProvisional ? await hayTareaAbierta(db, correduriaId, claveProvisional) : false

    const plan = planItem(item, entrada.compania, { resolucion, siniestro, siniestroPolizaDistinta, expediente, tareaAbierta, fechaCorreo, hoy })

    // 3. Escrituras. NINGUNA si no hay póliza en vigor resuelta (o siniestro ya en cartera).
    const clienteId = siniestro ? siniestro.clienteId : poliza?.clienteId ?? null
    const polizaId = siniestro ? siniestro.polizaId : poliza?.id ?? null
    let estado = plan.estado
    let resumen = plan.resumen
    let motivo = plan.motivo
    let siniestroId = plan.siniestroId
    let gestionId: string | null = null
    let fechaLimite: string | null = null
    // La clave de «una tarea por póliza/recibo» se guarda en toda fila con póliza (también la de solo nota),
    // para que el mismo aviso repetido otro día la encuentre.
    const claveGuardada = plan.claveTarea ?? claveProvisional
    const campoFecha = campoFechaDedupe(item.tipo)
    const fechaAviso = campoFecha ? ((item as Record<string, unknown>)[campoFecha] as string | null | undefined) ?? null : null

    if (plan.estado !== 'sin_resolver' && clienteId) {
      if (plan.abrirSiniestro && polizaId) {
        const r = await abrirSiniestro(correduriaId, {
          polizaId, tipo: plan.abrirSiniestro.tipo, fechaHora: plan.abrirSiniestro.fechaHora, descripcion: plan.abrirSiniestro.descripcion,
          referencia: plan.abrirSiniestro.referencia, lugarCp: null, lugarCiudad: null, lugarProvincia: null, lugarDireccion: null,
          seConsideraCulpable: null, gravedad: null, fechaDeclaracion: null, actor: ACTOR_CORREO,
        })
        if (r.ok) {
          siniestroId = r.siniestro.id
        } else if (r.estado === 'duplicado') {
          // Ya lo mandó la compañía por CIMA (casó por nº o por fecha): no se crea otro ni se toca su estado.
          siniestroId = r.siniestroId
          estado = 'duplicado_cima'
          motivo = 'el siniestro ya vino por CIMA: su estado lo fija la compañía'
          resumen = `siniestro ${item.clave} ya en CIMA: nota de seguimiento en la ficha`
          if (plan.notaSiDuplicado) await anotar(db, correduriaId, clienteId, polizaId, 'siniestro', plan.notaSiDuplicado)
        } else {
          // No se pudo abrir (fecha imposible, póliza que ya no vale…): queda escrito, no se inventa.
          resumen = `nota en la ficha: no se abrió el siniestro ${item.clave} (${r.motivo})`
          if (plan.notaSiDuplicado) await anotar(db, correduriaId, clienteId, polizaId, 'siniestro', `${plan.notaSiDuplicado}. No se abrió solo: ${r.motivo}.`)
        }
      }
      // Solo nota (sin tarea nueva) de un aviso ya anotado con la misma fecha: no se repite.
      const notaRepetida = !!(plan.nota && !plan.tarea && claveGuardada && campoFecha && plan.estado === 'aplicado')
        && await notaYaAnotada(db, correduriaId, filaId, claveGuardada, campoFecha, fechaAviso)
      if (notaRepetida) resumen = 'el mismo aviso ya está anotado en la ficha: nada nuevo'
      if (plan.nota && !notaRepetida) await anotar(db, correduriaId, clienteId, polizaId, plan.tipoNota, plan.nota)
      if (plan.tarea && polizaId) {
        const v = tareaValida(plan.tarea, new Date(`${hoy}T12:00:00Z`))
        if (v.ok) {
          gestionId = await crearTareaCorreo(db, correduriaId, clienteId, polizaId, plan.tarea)
          fechaLimite = plan.tarea.fechaLimite
        } else {
          resumen = `nota en la ficha; tarea NO creada (${v.motivo})`
        }
      }
    }

    await db.$executeRaw(Prisma.sql`
      update correo_evento_entrante set estado = ${estado}, motivo = ${motivo}, resumen = ${resumen.slice(0, 300)},
             clave_tarea = ${claveGuardada}, poliza_id = ${polizaId}::uuid, cliente_id = ${clienteId}::uuid,
             siniestro_id = ${siniestroId}::uuid, gestion_id = ${gestionId}::uuid, fecha_limite = ${fechaLimite}::date,
             importe = ${importeDeItem(item)}::numeric, updated_at = now()
      where id = ${filaId}::uuid and correduria_id = ${correduriaId}::uuid`)
    const cliente = polizaId ? candidatas.find((p) => p.id === polizaId)?.cliente ?? null : null
    return salida({ estado, resumen, motivo, clienteId, polizaId, siniestroId, fechaLimite }, false, cliente)
  } catch (e) {
    const causa = e instanceof Error ? e.message.slice(0, 200) : 'error'
    console.error('[correo-evento] elemento a medias:', causa)
    await db.$executeRaw(Prisma.sql`
      update correo_evento_entrante set motivo = ${`error a mitad: ${causa}`}, updated_at = now()
      where id = ${filaId}::uuid and correduria_id = ${correduriaId}::uuid`).catch(() => undefined)
    return salida({ estado: 'procesando', resumen: 'error a mitad: puede haberse escrito una parte, míralo', motivo: causa, clienteId: null, polizaId: null, siniestroId: null, fechaLimite: null }, false, null)
  }
}

// ── Solicitud en la compañía (20/10/2026) ────────────────────────────────────
//
// El correo de estado de una solicitud (Occident «Suscripción … - Solicitud <nº>») se casa con la OPORTUNIDAD que lleva
// ese nº (`compania_solicitud_num` + `compania_solicitud_compania`; índice único → una como mucho). Escrituras:
//   · `oportunidades.compania_solicitud_estado/url/at` — SOLO si el correo no es más viejo que el último aplicado
//     (`at`): releer un correo antiguo no pisa un estado nuevo;
//   · fila en `oportunidad_historial` (accion `correo_compania`; NO cuenta como contacto con el cliente);
//   · «PTE DOCUMENTACION» con la oportunidad abierta y el estado recién aplicado → tarea «Enviar documentación a
//     <compañía> — Solicitud N» para hoy, salvo que ya haya una abierta con ese texto.
// Sin oportunidad → `sin_resolver` (bandeja). Al apuntar el nº en la oportunidad, `vincularSolicitudesPendientes`
// engancha las que quedaron sin resolver (releer el correo no sirve: la idempotencia por Message-ID devuelve lo hecho).

type ItemSolicitud = Extract<ItemEvento, { tipo: 'solicitud' }>

async function oportunidadDeSolicitud(db: Db | Tx, correduriaId: string, compania: string, numero: string): Promise<OportunidadSolicitud | null> {
  const [o] = await db.$queryRaw<OportunidadSolicitud[]>(Prisma.sql`
    select o.id::text as id, o.cliente_id::text as "clienteId", o.estado::text as estado, o.tipo::text as ramo,
           nullif(trim(concat_ws(' ', c.nombre, c.apellidos)), '') as cliente
    from oportunidades o
    left join clientes c on c.id = o.cliente_id and c.correduria_id = o.correduria_id
    where o.correduria_id = ${correduriaId}::uuid and o.compania_solicitud_compania = ${compania}
      and o.compania_solicitud_num = ${numero}
    limit 1`)
  return o ?? null
}

type Tx = Parameters<Parameters<Db['$transaction']>[0]>[0]

/**
 * Aplica UN estado de solicitud a su oportunidad (nota + estado + tarea). Devuelve la tarea creada (si la hay). La
 * tarea se crea DESPUÉS de la transacción con `crearTarea` (la misma vía que una tarea a mano: su historial y su nota).
 */
async function aplicarSolicitud(
  db: Db, correduriaId: string, compania: string, item: ItemSolicitud, op: OportunidadSolicitud,
  plan: Extract<ReturnType<typeof planSolicitud>, { estado: 'aplicado' }>, instante: Date | null,
): Promise<{ gestionId: string | null; fechaLimite: string | null; resumen: string }> {
  const cuando = instante ?? new Date()
  const actualizado = await db.$transaction(async (tx) => {
    const n = await tx.$executeRaw(Prisma.sql`
      update oportunidades set
        compania_solicitud_estado = coalesce(${item.estado}, compania_solicitud_estado),
        compania_solicitud_url = coalesce(${item.url}, compania_solicitud_url),
        compania_solicitud_at = ${cuando},
        updated_at = now()
      where id = ${op.id}::uuid and correduria_id = ${correduriaId}::uuid
        and (compania_solicitud_at is null or compania_solicitud_at <= ${cuando})`)
    await tx.$executeRaw(Prisma.sql`
      insert into oportunidad_historial (correduria_id, oportunidad_id, accion, estado_antes, estado_despues, detalle, actor)
      values (${correduriaId}::uuid, ${op.id}::uuid, 'correo_compania',
              cast(${op.estado} as estado_comercial), cast(${op.estado} as estado_comercial),
              ${JSON.stringify({ ...plan.detalleHistorial, estadoAplicado: n > 0 })}::jsonb, ${ACTOR_CORREO})`)
    return n > 0
  })
  let resumen = actualizado ? plan.resumen : `${plan.resumen} (correo más antiguo que el último estado: solo nota)`
  const t = plan.tareaDocumentacion
  if (!actualizado || !t) return { gestionId: null, fechaLimite: null, resumen }
  const [ya] = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    select id::text as id from gestiones
    where correduria_id = ${correduriaId}::uuid and oportunidad_id = ${op.id}::uuid and estado::text <> 'cerrada'
      and observaciones = ${t.observaciones}
    limit 1`)
  if (ya) return { gestionId: null, fechaLimite: null, resumen: `${resumen}; ya había tarea de enviar documentación abierta` }
  const r = await crearTarea(correduriaId, op.id, t, ACTOR_CORREO)
  if (!r.ok) return { gestionId: null, fechaLimite: null, resumen: `${resumen}; tarea NO creada (${r.motivo})` }
  resumen = `${resumen}; tarea «enviar documentación» para hoy`
  return { gestionId: r.tareaId, fechaLimite: t.fechaLimite, resumen }
}

async function procesarSolicitud(
  db: Db, correduriaId: string, compania: string, item: ItemSolicitud, filaId: string,
  fechaCorreo: string | null, instanteCorreo: Date | null, hoy: string,
): Promise<ResultadoItemCorreo> {
  const salida = (estado: EstadoEventoCorreo, resumen: string, motivo: string | null, op: OportunidadSolicitud | null, gestion: { fechaLimite: string | null }): ResultadoItemCorreo => ({
    tipo: 'solicitud', clave: item.clave, subtipo: null, numeroPoliza: null, estado, repetido: false, resumen, motivo,
    clienteId: op?.clienteId ?? null, cliente: op?.cliente ?? null, polizaId: null, siniestroId: null, tareaVence: gestion.fechaLimite,
  })
  try {
    const op = await oportunidadDeSolicitud(db, correduriaId, compania, item.numeroSolicitud)
    const plan = planSolicitud(item, compania, op, { fechaCorreo, hoy })
    if (plan.estado === 'sin_resolver' || !op) {
      await db.$executeRaw(Prisma.sql`
        update correo_evento_entrante set estado = 'sin_resolver', motivo = ${plan.motivo}, resumen = ${plan.resumen.slice(0, 300)}, updated_at = now()
        where id = ${filaId}::uuid and correduria_id = ${correduriaId}::uuid`)
      return salida('sin_resolver', plan.resumen, plan.motivo, null, { fechaLimite: null })
    }
    const r = await aplicarSolicitud(db, correduriaId, compania, item, op, plan, instanteCorreo)
    await db.$executeRaw(Prisma.sql`
      update correo_evento_entrante set estado = 'aplicado', motivo = null, resumen = ${r.resumen.slice(0, 300)},
             cliente_id = ${op.clienteId}::uuid, oportunidad_id = ${op.id}::uuid, gestion_id = ${r.gestionId}::uuid,
             fecha_limite = ${r.fechaLimite}::date, updated_at = now()
      where id = ${filaId}::uuid and correduria_id = ${correduriaId}::uuid`)
    return salida('aplicado', r.resumen, null, op, r)
  } catch (e) {
    const causa = e instanceof Error ? e.message.slice(0, 200) : 'error'
    console.error('[correo-evento] solicitud a medias:', causa)
    await db.$executeRaw(Prisma.sql`
      update correo_evento_entrante set motivo = ${`error a mitad: ${causa}`}, updated_at = now()
      where id = ${filaId}::uuid and correduria_id = ${correduriaId}::uuid`).catch(() => undefined)
    return salida('procesando', 'error a mitad: puede haberse escrito una parte, míralo', causa, null, { fechaLimite: null })
  }
}

const VENTANA_VINCULAR_DIAS = 90

/**
 * Tras apuntar (o cambiar) el nº de solicitud en una oportunidad: los correos `solicitud` de ese nº y compañía que
 * quedaron `sin_resolver` (y sin marcar como mirados) en los últimos 90 días se aplican a ella, del más viejo al más
 * nuevo (el guardia de `at` deja el estado del último; la tarea solo nace si el estado aplicado la pide). El UPDATE
 * de la fila exige aún `sin_resolver`: dos vinculaciones a la vez no aplican dos veces. Sin la migración → 0.
 */
export async function vincularSolicitudesPendientes(
  correduriaId: string, oportunidadId: string, compania: string, numero: string, hoy: string = hoyMadrid(),
): Promise<{ vinculados: number }> {
  const db = prismaAsegura()
  const filas = await db.$queryRaw<{ id: string; detalle: unknown; creado: Date }[]>(Prisma.sql`
    select id::text as id, detalle, created_at as creado from correo_evento_entrante
    where correduria_id = ${correduriaId}::uuid and tipo = 'solicitud' and estado = 'sin_resolver' and revisado_at is null
      and compania = ${compania} and clave = ${numero}
      and created_at > now() - make_interval(days => ${VENTANA_VINCULAR_DIAS}::int)
    order by created_at asc
    limit 20`)
  let vinculados = 0
  for (const f of filas) {
    const item = f.detalle as ItemSolicitud | null
    if (!item || item.tipo !== 'solicitud' || item.numeroSolicitud !== numero) continue
    // Se reserva la fila ANTES de escribir nada (procesando): otra vinculación simultánea ya no la coge.
    const reservada = await db.$executeRaw(Prisma.sql`
      update correo_evento_entrante set estado = 'procesando', updated_at = now()
      where id = ${f.id}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'sin_resolver'`)
    if (reservada === 0) continue
    const op = await oportunidadDeSolicitud(db, correduriaId, compania, numero)
    if (!op || op.id !== oportunidadId) {
      await db.$executeRaw(Prisma.sql`update correo_evento_entrante set estado = 'sin_resolver', updated_at = now() where id = ${f.id}::uuid and correduria_id = ${correduriaId}::uuid`)
      continue
    }
    const plan = planSolicitud(item, compania, op, { fechaCorreo: f.creado.toISOString().slice(0, 10), hoy })
    if (plan.estado !== 'aplicado') {
      await db.$executeRaw(Prisma.sql`update correo_evento_entrante set estado = 'sin_resolver', updated_at = now() where id = ${f.id}::uuid and correduria_id = ${correduriaId}::uuid`)
      continue
    }
    try {
      const r = await aplicarSolicitud(db, correduriaId, compania, item, op, plan, f.creado)
      await db.$executeRaw(Prisma.sql`
        update correo_evento_entrante set estado = 'aplicado', motivo = null, resumen = ${`vinculada a mano: ${r.resumen}`.slice(0, 300)},
               cliente_id = ${op.clienteId}::uuid, oportunidad_id = ${op.id}::uuid, gestion_id = ${r.gestionId}::uuid,
               fecha_limite = ${r.fechaLimite}::date, updated_at = now()
        where id = ${f.id}::uuid and correduria_id = ${correduriaId}::uuid`)
      vinculados++
    } catch (e) {
      const causa = e instanceof Error ? e.message.slice(0, 200) : 'error'
      await db.$executeRaw(Prisma.sql`
        update correo_evento_entrante set motivo = ${`error a mitad al vincular: ${causa}`}, updated_at = now()
        where id = ${f.id}::uuid and correduria_id = ${correduriaId}::uuid`).catch(() => undefined)
    }
  }
  return { vinculados }
}

/**
 * Aplica un evento de correo ya validado. `fechaCorreo` (aaaa-mm-dd) solo se usa en los textos.
 * `sin_migracion` = falta `2026-10-14_correo_evento_entrante.sql`: no se ha escrito NADA.
 */
export async function registrarEventoCorreo(
  correduriaId: string, entrada: EntradaEvento, fechaCorreo: string | null, hoy: string = hoyMadrid(), instanteCorreo: Date | null = null,
): Promise<ResultadoEventoCorreo> {
  const db = prismaAsegura()
  try {
    await db.$queryRaw(Prisma.sql`select 1 from correo_evento_entrante where false`)
  } catch (e) {
    if (esTablaInexistente(e)) return { ok: false, estado: 'sin_migracion', motivo: 'falta aplicar 2026-10-14_correo_evento_entrante.sql: no se ha escrito nada' }
    throw e
  }
  // Una solicitud no se resuelve por póliza: no hace falta leer la cartera.
  const candidatas = entrada.tipo === 'solicitud' ? [] : await polizasCandidatas(db, correduriaId)
  const resultados: ResultadoItemCorreo[] = []
  // En serie: dos filas del mismo correo pueden ser del mismo recibo/póliza y la segunda debe ver la tarea de la primera.
  try {
    for (const item of entrada.items) resultados.push(await procesarItem(db, correduriaId, entrada, item, candidatas, fechaCorreo, hoy, instanteCorreo))
  } catch (e) {
    // Un tipo nuevo cuyo SQL no se ha aplicado (`emision` → 2026-10-14d_correo_evento_emision.sql): el CHECK de
    // `tipo` rechaza la RESERVA, que es la primera escritura. Todos los elementos de un correo son del mismo
    // tipo, así que cae el primero y no se ha escrito nada: 503 `sin_migracion`, no 500.
    if (resultados.length === 0 && esCheckTipoEventoCorreo(e)) {
      const sql = entrada.tipo === 'solicitud' ? '2026-10-20_oportunidad_solicitud_compania.sql' : '2026-10-14d_correo_evento_emision.sql'
      return { ok: false, estado: 'sin_migracion', motivo: `falta aplicar ${sql} (tipo «${entrada.tipo}»): no se ha escrito nada` }
    }
    throw e
  }
  return { ok: true, resultados }
}

// ── Lectura para la bandeja y la cola de avisos ──────────────────────────────

export type EventoCorreoFila = {
  id: string
  creado: string
  tipo: string
  subtipo: string | null
  clave: string
  compania: string
  numeroPoliza: string | null
  estado: EstadoEventoCorreo
  motivo: string | null
  resumen: string | null
  clienteId: string | null
  cliente: string | null
  fechaLimite: string | null
  importe: number | null
  /** `true` = alguien lo marcó como mirado (`revisado_at` no nulo). */
  revisado: boolean
}

const TECHO_LISTA = 300

/** Los eventos de los últimos `dias` días, los sin resolver primero. `null` en `filas` nunca: si falla, lanza. */
export async function eventosCorreoRecientes(correduriaId: string, dias = 30): Promise<{ filas: EventoCorreoFila[]; truncado: boolean }> {
  const d = Math.min(Math.max(Math.trunc(dias) || 30, 1), 90)
  const filas = await prismaAsegura().$queryRaw<(Omit<EventoCorreoFila, 'importe'> & { importe: string | null })[]>(Prisma.sql`
    select e.id::text as id, to_char(e.created_at at time zone 'Europe/Madrid', 'YYYY-MM-DD"T"HH24:MI') as creado,
           e.tipo, e.subtipo, e.clave, e.compania, e.numero_poliza as "numeroPoliza", e.estado, e.motivo, e.resumen,
           e.cliente_id::text as "clienteId", nullif(trim(concat_ws(' ', c.nombre, c.apellidos)), '') as cliente,
           to_char(e.fecha_limite, 'YYYY-MM-DD') as "fechaLimite", e.importe::text as importe,
           (e.revisado_at is not null) as revisado
    from correo_evento_entrante e
    left join clientes c on c.id = e.cliente_id and c.correduria_id = e.correduria_id
    where e.correduria_id = ${correduriaId}::uuid and e.created_at >= now() - make_interval(days => ${d}::int)
    order by (e.estado in ('sin_resolver', 'procesando') and e.revisado_at is null) desc, e.created_at desc
    limit ${TECHO_LISTA + 1}`)
  return {
    filas: filas.slice(0, TECHO_LISTA).map((f) => ({ ...f, importe: f.importe === null ? null : Number(f.importe) })),
    truncado: filas.length > TECHO_LISTA,
  }
}

/**
 * Pone (`true`) o quita (`false`) la marca de «mirado». Solo la fila de ESA correduría: `false` = no existe
 * o es de otra (la ruta responde 404). Quitarla deja la fila otra vez en la cola de avisos.
 */
export async function marcarEventoRevisado(correduriaId: string, id: string, revisado: boolean): Promise<boolean> {
  const n = await prismaAsegura().$executeRaw(Prisma.sql`
    update correo_evento_entrante
    set revisado_at = ${revisado ? Prisma.sql`now()` : Prisma.sql`null`}, updated_at = now()
    where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid`)
  return n > 0
}

const VENTANA_REEVALUACION_DIAS = 60
const TOPE_REEVALUACION = 200

/**
 * Reevaluación de emisiones (14/10/2026): las filas `emision` `sin_resolver` sin mirar de los últimos 60 días se
 * vuelven a resolver contra la cartera; si CIMA ya trae la póliza en vigor pasan a `duplicado_cima`. Nunca crea
 * pólizas, notas ni tareas. El UPDATE lleva `estado = 'sin_resolver' and revisado_at is null` en el WHERE: idempotente y a prueba de
 * dos pasadas a la vez. `sin_migracion` (falta la tabla) → ceros.
 */
export async function reevaluarEmisionesSinResolver(
  correduriaId: string, hoy: string = hoyMadrid(),
): Promise<{ revisadas: number; resueltas: number }> {
  const db = prismaAsegura()
  let filas: { id: string; compania: string; codigoDgs: string; detalle: unknown }[]
  try {
    filas = await db.$queryRaw(Prisma.sql`
      select id::text as id, compania, codigo_entidad_dgs as "codigoDgs", detalle
      from correo_evento_entrante
      where correduria_id = ${correduriaId}::uuid and tipo = 'emision' and estado = 'sin_resolver' and revisado_at is null
        and created_at > now() - make_interval(days => ${VENTANA_REEVALUACION_DIAS}::int)
      order by created_at desc
      limit ${TOPE_REEVALUACION}`)
  } catch (e) {
    if (esTablaInexistente(e)) return { revisadas: 0, resueltas: 0 }
    throw e
  }
  if (filas.length === 0) return { revisadas: 0, resueltas: 0 }
  const candidatas = await polizasCandidatas(db, correduriaId)
  let resueltas = 0
  for (const f of filas) {
    const item = f.detalle as ItemEvento | null
    if (!item || item.tipo !== 'emision') continue
    const resolucion = resolverPolizaEvento(item.numeroPoliza, f.compania, f.codigoDgs, candidatas)
    const d = decidirReevaluacionEmision(item, f.compania, resolucion, hoy)
    if (!d.resuelve) continue
    const n = await db.$executeRaw(Prisma.sql`
      update correo_evento_entrante set estado = 'duplicado_cima', poliza_id = ${d.polizaId}::uuid, cliente_id = ${d.clienteId}::uuid,
             motivo = ${d.motivo}, resumen = ${d.resumen}, updated_at = now()
      where id = ${f.id}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'sin_resolver' and revisado_at is null`)
    if (n > 0) resueltas++
  }
  return { revisadas: filas.length, resueltas }
}

/** Para la cola de avisos: los sin resolver (o a medias) de los últimos 30 días que nadie ha marcado como mirados. */
export async function eventosCorreoSinResolver(correduriaId: string): Promise<{ plazo: string | null }[]> {
  // El plazo es el de la compañía (pre-anulación/impago) si el correo lo traía; el resto no tiene plazo legal.
  return prismaAsegura().$queryRaw<{ plazo: string | null }[]>(Prisma.sql`
    select coalesce(to_char(fecha_limite, 'YYYY-MM-DD'), case when detalle->>'fechaLimite' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then detalle->>'fechaLimite' end) as plazo
    from correo_evento_entrante
    where correduria_id = ${correduriaId}::uuid and estado in ('sin_resolver', 'procesando') and revisado_at is null
      and created_at >= now() - interval '30 days'
    limit 500`)
}
