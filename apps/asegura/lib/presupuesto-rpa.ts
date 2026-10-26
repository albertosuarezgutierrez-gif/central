// Presupuesto en BORRADOR tras el tarificador RPA (18/10/2026, Alberto: «todo con bot»). La parte con BD, IA y Telegram;
// las reglas PURAS (con test) en `presupuesto-rpa-reglas.ts`.
//
// Qué hace, cuando un trabajo RPA termina `ok` y su oportunidad ya no tiene trabajos de tarificar abiertos:
//   1. Pasa las ofertas del ÚLTIMO trabajo `ok` de cada compañía (`tarificaciones.respuesta.ofertas[]`) a
//      `oportunidad_oferta` en estado `extraida` (una fila por oferta, idempotente por `datos_extra.rpaClave`).
//   2. Comparativa DETERMINISTA (`compararOfertas` de module-seguros, la misma del presupuesto de ofertas) + el análisis
//      del recomendador de module-tarificacion (`cargarPropuestaOportunidad`) + la narrativa (`generarNarrativa`): la IA
//      solo redacta, con el tope de 12 llamadas / 0,50 € en 24 h; pasado el tope, narrativa determinista y se dice.
//   3. UN presupuesto de origen `ofertas` en BORRADOR con todas esas ofertas (coberturas en el sobre de siempre).
//   4. Telegram a Alberto (interno): nombre de pila o referencia, nº de ofertas, rango de primas y enlace a la oportunidad.
//
// 🚨 NO ENVÍA NADA AL CLIENTE. Las opciones salen de ofertas `extraida`: el trigger de la BD impide que el borrador salga
//    hasta que Alberto revise cada una, y el envío sigue siendo `accion:'avisar'` a mano.
// 🚨 Por qué NO `prepararPresupuesto()`: monta UN presupuesto por UNA tarificación de origen `codeoscopic` (la puerta
//    `admiteCodeoscopic()` dejaría pasar emisión/ReRate por Avant2 sobre un precio de portal) y aquí hay una tarificación
//    por compañía. El de ofertas es el presupuesto multicompañía que ya existe, con su trigger de revisión.
// 🚨 Todo SQL por `correduria_id`. Del cliente solo se lee `clientes.nombre` (para el nombre de pila del Telegram).
// 🚨 Nunca lanza hacia `registrarResultado`: el precio ya está guardado; un fallo aquí se registra y se devuelve.

import { calcularVencimiento, compararOfertas, type ResultadoComparacion } from '@central/module-seguros'
import { generarTokenVista, hashTokenVista } from '@central/module-seguros-portal'
import { tgSend } from '@central/core-telegram'
import type { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'
import { registrarErrorCartera } from './error-cartera'
import { iaTexto } from './ia'
import { generarNarrativa, type Narrativa } from './estudio-ia'
import { conResumenCoberturas, resumenCoberturasCliente } from './resumen-coberturas-cliente'
import { huellaComparativa, narrativaConReutilizacion } from './comparativa-guardada'
import { ofertaNormalizadaDeFila } from './documentos/oferta-leida'
import { caducidadOfertas, type FilaOferta } from './ofertas-reglas'
import { leerOportunidadParaOfertas } from './oportunidad-ofertas'
import { autocompletarNecesidades } from './presupuesto'
import { gastoIaAuto } from './ia-tope-estudio'
import { cargarPropuestaOportunidad, referenciaOportunidad } from './propuesta-oportunidad'
import { trabajosVigentes, type TrabajoParaPropuesta } from './propuesta-oportunidad-reglas'
import { URL_PLATAFORMA_DEFECTO } from './datos-cotizados'
import {
  ACTOR_RPA, EUR_ESTIMADO_NARRATIVA, alertasDeAvisos, avisosOpcionRpa, claveRpaDeFila, decidirDisparo, decidirIaAuto, decidirSustitucion, enlaceOportunidad,
  filaOfertaRpa, mismoConjunto, nombreDePila, ofertasDeRespuesta, sobreCoberturasRpa, textoAvisoCorteRpa, textoAvisoPresupuestoRpa, type OfertaRpaLeida,
} from './presupuesto-rpa-reglas'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_TRABAJOS = 30

export type ResultadoPresupuestoRpa =
  | { estado: 'creado'; presupuestoId: string; referencia: string | null; ofertas: number; narrativa: 'ia' | 'determinista'; sinIa: string | null; avisado: boolean; sustituidos: number; conservados: number }
  /** Otra ejecución más nueva ya dejó su borrador: esta no crea ni retira nada. */
  | { estado: 'superado' }
  | { estado: 'ya_existe'; presupuestoId: string; ofertas: number }
  | { estado: 'esperando'; motivo: 'abiertos' | 'sin_ok' }
  | { estado: 'nada'; motivo: string }
  | { estado: 'error'; motivo: string }

type Opciones = {
  /** `true` (lo del bot): solo si no queda ningún trabajo de tarificar abierto. El operador puede forzarlo con `false`. */
  esperarAbiertos?: boolean
  /** Telegram a Alberto al CREAR (no al reutilizar). */
  avisar?: boolean
  actor?: string
  ahora?: Date
}

/**
 * Lo que llama la ruta del resultado del worker (en `after`) con el trabajo recién cerrado. NUNCA lanza.
 * Solo trabajos de tarificar `ok` con oportunidad: el resto no tiene nada que presupuestar.
 */
export async function presupuestoTrasTrabajoRpa(trabajoId: string): Promise<ResultadoPresupuestoRpa> {
  try {
    if (!UUID.test(trabajoId)) return { estado: 'nada', motivo: 'trabajo_invalido' }
    const [t] = await prismaAsegura().$queryRaw<{ correduria_id: string; oportunidad_id: string | null; estado: string; modo: string | null }[]>`
      select t.correduria_id::text as correduria_id, t.oportunidad_id::text as oportunidad_id, t.estado,
             to_jsonb(t)->>'modo' as modo
      from tarificacion_trabajos t where t.id = ${trabajoId}::uuid`
    if (!t) return { estado: 'nada', motivo: 'trabajo_no_encontrado' }
    if (t.estado !== 'ok' || (t.modo ?? 'tarificar') !== 'tarificar') return { estado: 'nada', motivo: 'no_es_tarificar_ok' }
    if (!t.oportunidad_id) return { estado: 'nada', motivo: 'sin_oportunidad' }
    return await prepararPresupuestoRpa(t.correduria_id, t.oportunidad_id, { esperarAbiertos: true, avisar: true })
  } catch (e) {
    return { estado: 'error', motivo: registrarErrorCartera('presupuesto/auto-rpa', e) }
  }
}

/**
 * El presupuesto en borrador de las ofertas RPA de una oportunidad. Idempotente: si ya hay un borrador del bot (vivo)
 * con EXACTAMENTE las mismas ofertas, devuelve ése y no avisa. Un borrador anterior DEL BOT con otras ofertas que no ha
 * salido se retira (con motivo); los que preparó Alberto a mano no se tocan nunca. NUNCA lanza.
 */
export async function prepararPresupuestoRpa(correduriaId: string, oportunidadId: string, opts: Opciones = {}): Promise<ResultadoPresupuestoRpa> {
  try {
    return await preparar(correduriaId, oportunidadId, opts)
  } catch (e) {
    return { estado: 'error', motivo: registrarErrorCartera('presupuesto/rpa', e) }
  }
}

async function preparar(correduriaId: string, oportunidadId: string, opts: Opciones): Promise<ResultadoPresupuestoRpa> {
  if (!UUID.test(oportunidadId)) return { estado: 'nada', motivo: 'oportunidad_invalida' }
  const actor = opts.actor ?? ACTOR_RPA
  const ahora = opts.ahora ?? new Date()
  const db = prismaAsegura()
  const op = await leerOportunidadParaOfertas(correduriaId, oportunidadId)
  if (!op) return { estado: 'nada', motivo: 'oportunidad_no_encontrada' }

  // Los trabajos de la oportunidad con su respuesta (solo `respuesta`: el riesgo ni se lee).
  const filas = await db.$queryRaw<{ id: string; compania: string; estado: string; modo: string | null; created_at: Date; tarificacion_id: string | null; respuesta: unknown }[]>`
    select t.id::text as id, t.compania, t.estado, to_jsonb(t)->>'modo' as modo, t.created_at,
           t.tarificacion_id::text as tarificacion_id, x.respuesta
    from tarificacion_trabajos t
    left join tarificaciones x on x.id = t.tarificacion_id and x.correduria_id = t.correduria_id
    where t.correduria_id = ${correduriaId}::uuid and t.oportunidad_id = ${op.id}::uuid
    order by t.created_at desc
    limit ${MAX_TRABAJOS}`
  if (opts.esperarAbiertos !== false) {
    const d = decidirDisparo(filas.map((f) => ({ estado: f.estado, modo: f.modo, tarificacionId: f.tarificacion_id })))
    if (!d.disparar) return { estado: 'esperando', motivo: d.motivo }
  }
  const deTarificar: TrabajoParaPropuesta[] = filas
    .filter((f) => (f.modo ?? 'tarificar') === 'tarificar')
    .map((f) => ({ trabajoId: f.id, compania: f.compania, estado: f.estado, creadoEn: f.created_at.toISOString(), tarificacionId: f.tarificacion_id, respuesta: f.respuesta }))
  const leidas: OfertaRpaLeida[] = []
  const descartadas: string[] = []
  for (const t of trabajosVigentes(deTarificar)) {
    const o = ofertasDeRespuesta(t.respuesta, { tarificacionId: t.tarificacionId as string, trabajoId: t.trabajoId })
    if (o) leidas.push(...o)
    else descartadas.push(t.compania)
  }
  if (leidas.length === 0) return { estado: 'nada', motivo: 'sin_ofertas' }

  // 1. Las ofertas en la oportunidad (bajo el MISMO cerrojo que «Generar presupuesto» a mano).
  const claves = leidas.map((l) => l.clave)
  const ofertas = await db.$transaction(async (tx) => {
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${`presupuesto-ofertas:${correduriaId}:${op.id}`}))`
    const existentes = await tx.oportunidadOferta.findMany({ where: { correduriaId, oportunidadId: op.id }, select: { id: true, datosExtra: true } })
    const porClave = new Map<string, string>()
    for (const e of existentes) { const k = claveRpaDeFila(e.datosExtra); if (k && !porClave.has(k)) porClave.set(k, e.id) }
    for (const l of leidas) {
      if (porClave.has(l.clave)) continue
      const f = filaOfertaRpa(l)
      const creada = await tx.oportunidadOferta.create({
        data: {
          correduriaId, oportunidadId: op.id, documentoId: l.documentoId, rol: 'oferta',
          compania: f.compania, producto: f.producto, primaNeta: f.primaNeta, primaTotal: f.primaTotal,
          ...(f.garantias ? { garantias: f.garantias as Prisma.InputJsonValue } : {}),
          datosExtra: f.datosExtra as Prisma.InputJsonValue,
          estado: 'extraida', creadoPor: actor,
        },
        select: { id: true },
      })
      porClave.set(l.clave, creada.id)
    }
    return tx.oportunidadOferta.findMany({
      where: { correduriaId, oportunidadId: op.id, id: { in: claves.map((k) => porClave.get(k)!).filter(Boolean) } },
      select: { id: true, oportunidadId: true, documentoId: true, rol: true, compania: true, producto: true, primaNeta: true, primaTotal: true, garantias: true, datosExtra: true, estado: true, recomendada: true, revisadaAt: true, revisadaPor: true, createdAt: true },
    })
  }, { timeout: 20_000, maxWait: 10_000 })
  // Una que Alberto ya DESCARTÓ no vuelve a un presupuesto.
  const vivas: FilaOferta[] = ofertas.filter((f) => f.estado !== 'descartada')
  if (vivas.length === 0) {
    if (opts.avisar) await avisarAlberto(correduriaId, op, (base) => textoAvisoCorteRpa({ ...base, motivo: 'todas_descartadas', sinLeer: descartadas }))
    return { estado: 'nada', motivo: 'todas_descartadas' }
  }
  const idsOfertas = vivas.map((f) => f.id)

  const previo = await borradorDelBotIgual(correduriaId, op.id, idsOfertas)
  if (previo) return { estado: 'ya_existe', presupuestoId: previo, ofertas: idsOfertas.length }

  const hoy = ahora.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
  const cad = caducidadOfertas(vivas, hoy)
  if (cad.caducadas.length > 0) {
    if (opts.avisar) await avisarAlberto(correduriaId, op, (base) => textoAvisoCorteRpa({ ...base, motivo: 'caducada', companias: cad.caducadas, sinLeer: descartadas }))
    return { estado: 'nada', motivo: `caducada: ${cad.caducadas.join(', ')}` }
  }

  // 2. Comparativa determinista + análisis del recomendador + narrativa (IA con tope).
  const comparacion: ResultadoComparacion = compararOfertas({ ramo: op.ramoOferta, ofertas: vivas.map((f) => ofertaNormalizadaDeFila(f, { ramo: op.ramoOferta })), superficieM2: op.superficieM2 })
  const huella = huellaComparativa({ ramo: op.ramoOferta, ofertas: comparacion.ofertas, superficieM2: op.superficieM2, recomendadaId: null })
  const tope = decidirIaAuto(await gastoIaAuto(correduriaId))
  // Mismas ofertas y cifras que un estudio ya escrito → se reutiliza su resumen (no gasta el tope de IA).
  const { narrativa: narrativaBase, reutilizadaDe } = await narrativaConReutilizacion(
    correduriaId, op.id, huella, false, (): Promise<Narrativa> => generarNarrativa(comparacion, null, tope.usar ? iaTexto : null),
  )
  // 26/10/2026: resumen de 3 líneas de las coberturas (solo lo que la matriz prueba; sin diferencias → se omite). No envía nada.
  const narrativa = { ...narrativaBase, resumen: conResumenCoberturas(narrativaBase.resumen, resumenCoberturasCliente(comparacion)) }
  const sinIa = reutilizadaDe ? null : !tope.usar ? tope.motivo : narrativa.fuente === 'ia' ? null : narrativa.descartada ?? 'la IA no dio un resumen válido'
  const analisis = await analisisRecomendador(correduriaId, op.id, ahora)

  const leidaDe = new Map(leidas.map((l) => [l.clave, l]))
  const opciones = vivas
    .map((f) => ({ f, l: leidaDe.get(claveRpaDeFila(f.datosExtra) ?? '') }))
    .filter((x): x is { f: (typeof vivas)[number]; l: OfertaRpaLeida } => !!x.l)
    .sort((a, b) => a.l.oferta.primaAnualEur - b.l.oferta.primaAnualEur || a.f.createdAt.getTime() - b.f.createdAt.getTime())
    .map(({ f, l }, i) => {
      const fila = filaOfertaRpa(l)
      const sobre = sobreCoberturasRpa(l.oferta.coberturas, ahora.toISOString())
      return {
        orden: i + 1,
        compania: l.oferta.compania,
        producto: l.oferta.producto,
        modalidad: null, categoria: null, grupoCobertura: null,
        primaEur: l.oferta.primaAnualEur,
        entradaEur: null,
        franquiciaEur: (fila.datosExtra.franquiciaGeneral as number | null) ?? null,
        // Precio de portal: una OFERTA estimada (la compañía confirma al emitir). Nunca ReRate por Avant2.
        firmeza: 'estimado',
        requiereRerate: false,
        referenciaVendor: null,
        avisos: avisosOpcionRpa(l.oferta.avisos, l.oferta.compania),
        papeles: [] as string[],
        ofertaId: f.id,
        ...(fila.garantias ? { garantias: { origen: 'ofertas', ramo: op.ramoOferta, valores: fila.garantias } as Prisma.InputJsonValue } : {}),
        // Sin coberturas legibles se deja el default (`[]` desnudo = «no constan»), nunca un sobre `vacias`.
        ...(sobre ? { coberturas: sobre as unknown as Prisma.InputJsonValue } : {}),
      }
    })
  if (opciones.length === 0) return { estado: 'nada', motivo: 'sin_opciones' }
  // Datos que una compañía usó DISTINTOS de la ficha (CP/localidad fijados por su portal): alerta en el Telegram.
  const alertas = [...new Set(vivas.flatMap((f) => {
    const l = leidaDe.get(claveRpaDeFila(f.datosExtra) ?? '')
    return l ? alertasDeAvisos(l.oferta.avisos, l.oferta.compania) : []
  }))]

  const { venceEl } = calcularVencimiento({ creadoAt: ahora, fechaEfecto: null, expiraOferta: cad.expira })
  // El token en claro no se guarda ni se devuelve: es un borrador; el aviso (`accion:'avisar'`) genera el enlace.
  const tokenHash = await hashTokenVista(generarTokenVista())
  const tarificaciones = [...new Set(leidas.map((l) => l.tarificacionId))].sort()
  const trabajos = [...new Set(leidas.map((l) => l.trabajoId))].sort()
  const estudio = {
    version: 2,
    generadoAt: ahora.toISOString(),
    huella,
    ...(reutilizadaDe ? { narrativaReutilizadaDe: reutilizadaDe } : {}),
    recomendadaId: null,
    actualId: null,
    comparacion,
    narrativa,
    rpa: { tarificaciones, trabajos, sinIa, ...(descartadas.length ? { companiasSinLeer: descartadas } : {}), analisis },
  }

  // 3. El borrador (bajo cerrojo: dos trabajos que acaban a la vez no dejan dos).
  const hecho = await db.$transaction(async (tx) => {
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${`presupuesto-ofertas:${correduriaId}:${op.id}`}))`
    const otro = await borradorDelBotIgual(correduriaId, op.id, idsOfertas, tx)
    if (otro) return { tipo: 'otro' as const, id: otro }
    // Solo se sustituyen borradores DEL BOT que no han salido y que Alberto NO ha tocado (`decidirSustitucion`). Los
    // hechos a mano no entran ni en la consulta. Uno más nuevo que esta ejecución → esta abandona (carrera).
    const vivosBot = await tx.presupuesto.findMany({
      where: { correduriaId, origen: 'ofertas', oportunidadId: op.id, creadoPor: ACTOR_RPA, retiradoAt: null, enviadoAt: null, enlaceGeneradoAt: null, aceptadoAt: null },
      // oculta-exenta: se cuentan las ocultas precisamente para saber si Alberto ha tocado el borrador.
      select: { id: true, creadoAt: true, opciones: { select: { ocultaAt: true } }, eventos: { select: { tipo: true, origen: true, detalle: true } } },
    })
    const decision = decidirSustitucion(ahora, vivosBot.map((p) => ({
      id: p.id, creadoAt: p.creadoAt, ocultas: p.opciones.filter((o) => o.ocultaAt !== null).length, eventos: p.eventos,
    })))
    if (decision.accion === 'abandonar') return { tipo: 'superado' as const }
    const previos = decision.retirar.map((id) => ({ id }))
    for (const p of previos) {
      const motivo = 'Sustituido por un borrador nuevo del tarificador con las ofertas más recientes (sin haberse enviado).'
      await tx.presupuesto.update({
        where: { id: p.id },
        data: { retiradoAt: ahora, retiradoMotivo: motivo, eventos: { create: [{ tipo: 'retirado', origen: 'sistema', detalle: { actor, motivo } }] } },
      })
    }
    const creado = await tx.presupuesto.create({
      data: {
        correduriaId, clienteId: op.clienteId, polizaId: null, ramo: op.ramo ?? 'otros', origen: 'ofertas', tarificacionId: null,
        oportunidadId: op.id, estudio: estudio as unknown as Prisma.InputJsonValue, tokenHash, venceEl, creadoAt: ahora, creadoPor: ACTOR_RPA,
        opciones: { create: opciones },
        eventos: {
          create: [{
            tipo: 'preparado',
            origen: 'sistema',
            detalle: {
              actor, origen: 'ofertas', via: 'rpa_auto', tarificaciones, trabajos, ofertas: idsOfertas, narrativa: narrativa.fuente,
              // Lo que cuenta para el tope de 24 h: se anota ANTES de saber si la IA respondió (intentarlo ya gasta).
              iaAuto: reutilizadaDe ? 'reutilizada' : tope.usar ? 'intentada' : 'omitida_tope', eurEstimados: !reutilizadaDe && tope.usar ? EUR_ESTIMADO_NARRATIVA : 0,
              ...(reutilizadaDe ? { narrativaReutilizadaDe: reutilizadaDe } : {}),
              ...(sinIa ? { sinIa } : {}),
              ...(previos.length > 0 ? { sustituye: previos.map((p) => p.id) } : {}),
            },
          }],
        },
      },
      select: { id: true, referencia: true },
    })
    return { tipo: 'creado' as const, creado, sustituidos: previos.length, conservados: decision.conservar.length }
  }, { timeout: 20_000, maxWait: 10_000 })
  if (hecho.tipo === 'otro') return { estado: 'ya_existe', presupuestoId: hecho.id, ofertas: idsOfertas.length }
  if (hecho.tipo === 'superado') return { estado: 'superado' }

  await autocompletarNecesidades(correduriaId, hecho.creado.id, actor).catch((e: unknown) => { registrarErrorCartera('presupuesto/rpa/necesidades', e) })

  // 4. Aviso INTERNO a Alberto. Best effort: si no sale, el borrador ya está y se dice en el resultado.
  const avisado = opts.avisar
    ? await avisarAlberto(correduriaId, op, (base) => textoAvisoPresupuestoRpa({
        ...base,
        companias: opciones.map((o) => o.compania),
        primas: opciones.map((o) => o.primaEur),
        narrativa: narrativa.fuente,
        sinIa,
        sinLeer: descartadas,
        conservados: hecho.conservados,
        alertas,
      }))
    : false
  return { estado: 'creado', presupuestoId: hecho.creado.id, referencia: hecho.creado.referencia ?? null, ofertas: opciones.length, narrativa: narrativa.fuente, sinIa, avisado, sustituidos: hecho.sustituidos, conservados: hecho.conservados }
}

type BaseAviso = { cliente: string | null; referencia: string; ramo: string; enlace: string }

/** Telegram INTERNO a Alberto. Del cliente solo `clientes.nombre` → nombre de pila. Best effort: `false` si no salió. */
async function avisarAlberto(correduriaId: string, op: { id: string; ramo: string | null }, texto: (base: BaseAviso) => string): Promise<boolean> {
  try {
    const [c] = await prismaAsegura().$queryRaw<{ nombre: string | null; import_ref: string | null }[]>`
      select c.nombre, o.import_ref
      from oportunidades o left join clientes c on c.id = o.cliente_id and c.correduria_id = o.correduria_id
      where o.id = ${op.id}::uuid and o.correduria_id = ${correduriaId}::uuid`
    return (await tgSend(texto({
      cliente: nombreDePila(c?.nombre),
      referencia: referenciaOportunidad(c?.import_ref ?? null, op.id),
      ramo: op.ramo ?? 'otros',
      enlace: enlaceOportunidad(op.id, process.env.PLATAFORMA_URL?.trim() || URL_PLATAFORMA_DEFECTO),
    }))) !== null
  } catch (e) {
    registrarErrorCartera('presupuesto/rpa/telegram', e)
    return false
  }
}

type Db = ReturnType<typeof prismaAsegura>
type Tx = Parameters<Parameters<Db['$transaction']>[0]>[0]

/** Un borrador del bot, vivo y sin salir, con EXACTAMENTE estas ofertas (`null` = no hay). */
async function borradorDelBotIgual(correduriaId: string, oportunidadId: string, ofertaIds: string[], db: Db | Tx = prismaAsegura()): Promise<string | null> {
  const candidatos = await db.presupuesto.findMany({
    where: { correduriaId, origen: 'ofertas', oportunidadId, creadoPor: ACTOR_RPA, retiradoAt: null, emitidoAt: null },
    orderBy: { creadoAt: 'desc' },
    take: 10,
    // oculta-exenta: se comparan TODAS las opciones congeladas (también las que Alberto haya ocultado).
    select: { id: true, opciones: { select: { ofertaId: true } } },
  })
  const igual = candidatos.find((c) => mismoConjunto(c.opciones.map((o) => o.ofertaId ?? ''), ofertaIds))
  return igual?.id ?? null
}

/** El análisis del recomendador (control de calidad + ranking) para el estudio. `null` = no se pudo (se dice, no se inventa). */
async function analisisRecomendador(correduriaId: string, oportunidadId: string, ahora: Date): Promise<Record<string, unknown> | null> {
  try {
    const c = await cargarPropuestaOportunidad(correduriaId, oportunidadId, ahora)
    if (c.estado !== 'cargada' || c.resultado.estado !== 'ok') return null
    const r = c.resultado
    return {
      ofertas: r.ofertas.map((o) => ({ clave: o.ofertaId, compania: o.compania, producto: o.producto, primaAnualEur: o.primaAnualEur, recomendable: o.recomendable, errores: o.calidad.errores.map((x) => x.mensaje) })),
      ranking: r.ranking.map((x) => ({ clave: x.ofertaId, compania: x.compania, producto: x.producto, puntos: x.puntos, motivos: x.motivos, reservas: x.reservas })),
      avisos: r.avisos,
    }
  } catch (e) {
    registrarErrorCartera('presupuesto/rpa/analisis', e)
    return null
  }
}
