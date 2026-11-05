// RENOVACIÓN CON ALTERNATIVAS (Alberto, 04/11/2026): la parte con BD, Catastro y Telegram. Las reglas (con test) en
// `renovacion-alternativas-reglas.ts`; el porqué del flujo, en su cabecera. Migración: `prisma/sql/2026-11-05b_presupuesto_renovacion.sql`.
//
// Reutiliza, no rehace: la oportunidad de la póliza (`abrirRiesgoDePoliza`), el Catastro de siempre (`catastroPorReferencia`,
// `inmueblesPorDireccion`, `inmuebleUnicoCatastro`), las ofertas de la oportunidad (bots: ya las importa `presupuesto-rpa`),
// los precios guardados de Avant2 (`cargarPrecios` + `seleccionarAvant2`), el motor de comparación (`compararOfertas`), las
// opciones congeladas (`opcionesDeOfertas`), «la más barata por nivel» (`masBarataPorNivel`), el trigger de la BD que no deja
// publicar lo no revisado y la pantalla del presupuesto del portal (ahora con un modo «renovación»).
//
// 🛡️ Todo SQL por `correduria_id`. 🚨 Nada de esto gasta (ni Avant2 ni IA: la narrativa es la determinista) ni EMITE.
// 🚨 Fail-closed: sin la migración, `sin_migracion` (503) ANTES de escribir nada.

import { calcularVencimiento, compararOfertas, esCarteraEnVigor, ofertaDeAvant2, primaConRecibos, seleccionarAvant2, vencimientoConRecibos, type ResultadoComparacion } from '@central/module-seguros'
import {
  detalleElector, duenoDeEleccion, generarTokenVista, hashTokenVista, identidadesQueEligenRenovacion,
  type ElectorRenovacion,
} from '@central/module-seguros-portal'
import { inmuebleUnicoCatastro } from '@central/module-tarificacion'
import { inmueblesPorDireccion } from '@central/core-catastro/http'
import { tgSend, tgSendButtons } from '@central/core-telegram'
import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'
import { anotarCambio } from './auditoria'
import { registrarErrorCartera } from './error-cartera'
import { abrirRiesgoDePoliza } from './oportunidad-riesgo'
import { leerOportunidadParaOfertas, ofertasDeOportunidad } from './oportunidad-ofertas'
import { AVISO_OPCION_OFERTA, caducidadOfertas, opcionesDeOfertas, type FilaOferta } from './ofertas-reglas'
import { ofertaNormalizadaDeFila } from './documentos/oferta-leida'
import { generarNarrativa } from './estudio-ia'
import { huellaComparativa } from './comparativa-guardada'
import { lineasMasBarataPorNivel, masBarataPorNivel, nivelDeOferta, SIN_CLASIFICAR } from './tarificacion-niveles'
import { autocompletarNecesidades } from './presupuesto'
import { cargarPrecios } from './codeoscopic/tarificacion-guardada'
import { catastroPorReferencia } from './codeoscopic/catastro-referencia'
import { siglaViaOportunidad } from './tarificador-explorador-catastro'
import { URL_PLATAFORMA_DEFECTO, enlaceFichaCliente } from './datos-cotizados'
import { nombreDePila } from './presupuesto-rpa-reglas'
import { fichaPropiaDeRecurso } from './contacto-portal'
import { fichaDeTokenWhatsapp } from './presupuesto-codigo-whatsapp'
import { fichaDeToken } from './presupuesto-acceso-tercero'
import { avisarPresupuesto } from './envio-presupuesto'
import { puedeOperar } from './ficha-de-poliza'
import { filasAutorizacionRenovacion } from './renovacion-autorizados'
import type { AccesoPortal } from './presupuesto-aceptacion'
import {
  ACTOR_RENOVACION, CLAVE_CATASTRO_RENOVACION, EVENTO_AVISO_FALLIDO, EVENTO_ELECCION, EVENTO_ENVIO_CANAL, EVENTO_PUBLICADO, EVENTO_REVISION_TG, MAX_AVANT2_RENOVACION, MODO_RENOVACION,
  botonesRevision, compararConRenovacion, completarViviendaConCatastro, contarVinculadasQueOperan, decidirDestinatarios, decidirEleccion, decidirElector, decidirMensajeVigente,
  decidirPreparacion, filaOfertaActual, filaOfertaAvant2, fusionarViviendaCatastro, lineaHistorialAvisoFallido, lineaHistorialEleccion, lineaHistorialPreparada,
  textoEleccion, textoRevision,
  type CanalRenovacion, type DecisionDestinatarios, type Eleccion, type EstadoCatastroRenovacion, type FichaParaElegir, type OpcionComparada, type QuienVeEnApp,
  type RenovacionActual, type ViaPublicar,
} from './renovacion-alternativas-reglas'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const db = () => prismaAsegura()
const plataforma = () => (process.env.PLATAFORMA_URL?.trim() || URL_PLATAFORMA_DEFECTO).replace(/\/$/, '')

/** URL de «Ver como el cliente» en plataforma (con sesión; genera la vista de corredor al abrirla, un uso, 10 min). */
export const urlVistaPrevia = (presupuestoId: string) => `${plataforma()}/api/correduria/presupuesto/vista-cliente/abrir?presupuestoId=${presupuestoId}`
export const urlModificar = (polizaId: string) => `${plataforma()}/correduria/poliza/${polizaId}#renovacion`

/** ¿Está la migración 2026-11-05b? Un fallo de consulta que NO es «falta la columna» se propaga (no se confunde). */
export async function migracionRenovacion(): Promise<boolean> {
  try {
    await db().$queryRaw`select modo, eleccion_cliente, eleccion_opcion_id, eleccion_at from presupuesto limit 0`
    return true
  } catch (e) {
    if (/42703|column .* does not exist|no existe la columna/i.test(e instanceof Error ? e.message : String(e))) return false
    throw e
  }
}

/**
 * ¿Está la migración 2026-11-05c (quién eligió: `eleccion_por_*`, `eleccion_via`)? Sin ella NO se elige (503): el portal no
 * podría decir «ya elegida por…» y la primera elección no quedaría atada a nadie. Otro fallo se propaga.
 */
export async function migracionQuienElige(): Promise<boolean> {
  try {
    await db().$queryRaw`select eleccion_por_papel, eleccion_por_identidad_id, eleccion_por_nombre, eleccion_via from presupuesto limit 0`
    return true
  } catch (e) {
    if (/42703|column .* does not exist|no existe la columna/i.test(e instanceof Error ? e.message : String(e))) return false
    throw e
  }
}

// ─── Lecturas ────────────────────────────────────────────────────────────────

/** La renovación actual de la póliza: prima con recibos, vencimiento con recibos, compañía. `null` = no es de aquí. */
export async function leerPoliza(correduriaId: string, polizaId: string) {
  const p = await db().poliza.findFirst({
    where: { id: polizaId, correduriaId },
    select: {
      id: true, clienteId: true, tipo: true, aseguradora: true, primaAnual: true, primaBruta: true, fraccionamiento: true, datosEspecificos: true,
      fechaVencimiento: true, estado: true, importRef: true, eiacXmlHash: true, sustituidaAt: true, mergedIntoPolizaId: true,
      recibos: { where: { correduriaId }, select: { claseRecibo: true, situacion: true, primaTotal: true, fechaVencimiento: true } },
    },
  })
  if (!p) return null
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(String(v)))
  const dudosa = (p.datosEspecificos as { primaAnualDudosa?: unknown } | null)?.primaAnualDudosa === true
  const recibos = p.recibos.map((r) => ({
    claseRecibo: r.claseRecibo ?? null, situacion: r.situacion === null ? null : String(r.situacion), primaTotal: r.primaTotal,
    fechaVencimiento: r.fechaVencimiento ? r.fechaVencimiento.toISOString().slice(0, 10) : null,
  }))
  const hoy = new Date().toISOString()
  const prima = primaConRecibos({ primaAnual: dudosa ? null : n(p.primaAnual), primaBruta: dudosa ? null : n(p.primaBruta), fraccionamiento: p.fraccionamiento === null ? null : String(p.fraccionamiento) }, recibos, hoy)
  const vence = vencimientoConRecibos(p.fechaVencimiento ? p.fechaVencimiento.toISOString().slice(0, 10) : null, recibos, hoy)
  return {
    clienteId: p.clienteId,
    ramo: p.tipo === null ? null : String(p.tipo),
    fusionada: p.mergedIntoPolizaId !== null,
    enVigor: esCarteraEnVigor({ importRef: p.importRef, eiacXmlHash: p.eiacXmlHash, estado: p.estado === null ? null : String(p.estado), sustituidaAt: p.sustituidaAt }),
    actual: { polizaId: p.id, compania: p.aseguradora, prima: prima.prima, deRecibo: prima.deRecibo, vence: vence ? vence.slice(0, 10) : null } satisfies RenovacionActual,
  }
}

/**
 * Quién verá el presupuesto en la app: las identidades vinculadas a la ficha del TOMADOR con nivel de OPERAR (sin vistas de
 * corredor; quien solo ve no puede elegir, así que no cuenta para un ✅ publicable), los AUTORIZADOS por el tomador con
 * Gestión o Total sobre esta póliza (05/11/2026: lo ven y eligen), y quién ve ESTA póliza por otra vía (solo consulta o
 * figurar en ella) y NO lo verá. `null` = no se pudo mirar.
 */
export async function quienVeEnApp(correduriaId: string, clienteId: string, polizaId: string): Promise<QuienVeEnApp | null> {
  try {
    const vinculos = await db().$queryRaw<{ identidadId: string; nivel: string }[]>`
      select identidad_id::text as "identidadId", nivel::text as nivel from portal_vinculo
      where correduria_id = ${correduriaId}::uuid and cliente_id = ${clienteId}::uuid and origen <> 'corredor'`
    // Autorizados que ELIGEN (regla única con el portal). Quien ya entra con la ficha del tomador no se cuenta dos veces.
    const filasAut = await filasAutorizacionRenovacion(correduriaId, clienteId, null)
    const eligen = identidadesQueEligenRenovacion(filasAut, polizaId, new Date())
    for (const v of vinculos) if (puedeOperar(v.nivel)) eligen.delete(v.identidadId)
    const autConEleccion = new Set(filasAut.filter((f) => eligen.has(f.identidadId)).map((f) => f.autorizacionId))
    const aut = (await db().$queryRaw<{ id: string; nombre: string | null }[]>`
      select a.id::text as id, c.nombre from portal_autorizacion a
      left join clientes c on c.id = a.autorizado_cliente_id and c.correduria_id = a.correduria_id
      where a.correduria_id = ${correduriaId}::uuid and a.otorgante_cliente_id = ${clienteId}::uuid
        and (a.poliza_id is null or a.poliza_id = ${polizaId}::uuid)
        and a.revocado_en is null and a.aceptado_en is not null and (a.caduca_en is null or a.caduca_en > now())`)
      .filter((a) => !autConEleccion.has(a.id))
    const inter = await db().$queryRaw<{ nombre: string | null }[]>`
      select distinct c.nombre from poliza_intervinientes i
      join clientes c on c.id = i.cliente_id and c.correduria_id = i.correduria_id
      where i.correduria_id = ${correduriaId}::uuid and i.poliza_id = ${polizaId}::uuid and i.cliente_id <> ${clienteId}::uuid
        and exists (select 1 from portal_vinculo pv where pv.correduria_id = i.correduria_id and pv.cliente_id = i.cliente_id and pv.origen <> 'corredor')`
    return {
      vinculadasTomador: contarVinculadasQueOperan(vinculos),
      autorizadosEligen: [...eligen.values()].map((a) => ({ nombre: nombreDePila(a.nombre) })),
      otrosVenPoliza: [
        ...aut.map((a) => ({ nombre: nombreDePila(a.nombre), via: 'autorizacion' as const })),
        ...inter.map((a) => ({ nombre: nombreDePila(a.nombre), via: 'interviniente' as const })),
      ],
    }
  } catch (e) {
    registrarErrorCartera('renovacion/quien-ve', e)
    return null
  }
}

// ─── Catastro (hogar) ────────────────────────────────────────────────────────

/** Completa `info_riesgo.datosVivienda` de la oportunidad con el Catastro. Nunca lanza; nunca pisa lo escrito ni lo confirmado. */
export async function catastroDeOportunidad(correduriaId: string, oportunidadId: string, ahora: Date, intento = 1): Promise<EstadoCatastroRenovacion> {
  try {
    const [o] = await db().$queryRaw<{ v: Record<string, unknown> | null }[]>`
      select info_riesgo->'datosVivienda' as v from oportunidades where id = ${oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid`
    const v = o?.v && typeof o.v === 'object' && !Array.isArray(o.v) ? o.v : {}
    if (typeof v.confirmadoAt === 'string' && v.confirmadoAt.trim() !== '') return { estado: 'confirmada' }
    const txt = (k: string) => (typeof v[k] === 'string' && (v[k] as string).trim() !== '' ? (v[k] as string).trim() : typeof v[k] === 'number' ? String(v[k]) : null)
    let ref = txt('referenciaCatastral')?.replace(/[\s-]/g, '').toUpperCase() ?? null
    if (!ref || !/^[0-9A-Z]{20}$/.test(ref)) {
      const provincia = txt('provincia'), municipio = txt('municipio'), calle = txt('nombreVia'), numero = txt('numeroVia'), sigla = siglaViaOportunidad(v)
      if (!provincia || !municipio || !calle || !numero || !sigla) return { estado: 'sin_datos_para_buscar' }
      const r = await conTope(inmueblesPorDireccion({ provincia: provincia.toUpperCase(), municipio: municipio.toUpperCase(), sigla, calle, numero }), 12_000)
      if (r === 'tope') return { estado: 'error' }
      if (r === null) return { estado: 'varios' }
      const e = inmuebleUnicoCatastro(r.inmuebles, { planta: v.planta, puerta: v.puertaVivienda, codigoPostal: v.cp })
      if (e.estado !== 'unico') return { estado: e.estado === 'varios' ? 'varios' : 'ninguno' }
      ref = e.refCompleta
    }
    const c = await conTope(catastroPorReferencia(ref), 12_000)
    if (c === 'tope' || c.estado === 'error') return { estado: 'error' }
    if (c.estado !== 'ok') return { estado: 'no_encontrado' }
    const r = completarViviendaConCatastro(v, {
      referencia: c.referencia, metrosCuadrados: c.catastro.metrosCuadrados, anioConstruccion: c.catastro.anioConstruccion,
      codigoPostal: c.catastro.codigoPostal, uso: c.catastro.uso,
    }, ahora.toISOString())
    if (r.estado !== 'completada') return r
    const marca = { consultadoAt: ahora.toISOString(), anadidos: r.anadidos, distintos: r.distintos }
    // Gana el dato EXISTENTE (`fusionarViviendaCatastro`) y el UPDATE va condicionado a lo LEÍDO (compare-and-swap): si
    // alguien escribió la vivienda entre la lectura y aquí (el Catastro tarda segundos), no se pisa: se relee y se rehace
    // una vez; si vuelve a cambiar, no se escribe. `confirmadoAt` sigue vacío (el bloque confirmado no llega aquí).
    const fusion = fusionarViviendaCatastro(v, r.cambios)
    const n = await db().$executeRaw`
      update oportunidades
      set info_riesgo = jsonb_set(
            jsonb_set(coalesce(info_riesgo, '{}'::jsonb), '{datosVivienda}', ${JSON.stringify(fusion)}::jsonb),
            ${`{${CLAVE_CATASTRO_RENOVACION}}`}::text[], ${JSON.stringify(marca)}::jsonb),
          updated_at = now()
      where id = ${oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid
        and coalesce(info_riesgo->'datosVivienda', '{}'::jsonb) = ${JSON.stringify(v)}::jsonb
        and coalesce(info_riesgo->'datosVivienda'->>'confirmadoAt', '') = ''`
    if (n === 0) return intento < 2 ? catastroDeOportunidad(correduriaId, oportunidadId, ahora, intento + 1) : { estado: 'error' }
    anotarCambio({ entidad: 'oportunidad', id: oportunidadId, campo: 'datosVivienda.catastro', antes: null, despues: r.anadidos.join(',') || 'consultado' })
    return { estado: 'completada', anadidos: r.anadidos, distintos: r.distintos }
  } catch (e) {
    registrarErrorCartera('renovacion/catastro', e)
    return { estado: 'error' }
  }
}

const conTope = <T,>(p: Promise<T>, ms: number): Promise<T | 'tope'> =>
  new Promise((resolve) => {
    const t = setTimeout(() => resolve('tope'), ms)
    p.then((x) => { clearTimeout(t); resolve(x) }, () => { clearTimeout(t); resolve('tope') })
  })

// ─── Ofertas: la renovación actual y los precios de Avant2 ───────────────────

/** La oferta `actual` de la renovación (idempotente por clave). Una `actual` ya subida (PDF) no se toca. */
async function asegurarOfertaActual(correduriaId: string, oportunidadId: string, a: RenovacionActual): Promise<void> {
  const fila = filaOfertaActual(a)
  if (!fila) return
  const existentes = await db().oportunidadOferta.findMany({ where: { correduriaId, oportunidadId, rol: 'actual' }, select: { id: true, estado: true, datosExtra: true } })
  const vivas = existentes.filter((e) => e.estado !== 'descartada')
  const clave = fila.datosExtra.renovacionClave
  if (vivas.some((e) => (e.datosExtra as Record<string, unknown> | null)?.renovacionClave === clave)) return
  // Una `actual` que NO es de la cartera (PDF subido a mano) manda: no se compara dos veces lo mismo.
  if (vivas.some((e) => typeof (e.datosExtra as Record<string, unknown> | null)?.renovacionClave !== 'string')) return
  await db().$transaction(async (tx) => {
    // La de una preparación anterior con otra prima/vencimiento se descarta (queda el rastro).
    for (const e of vivas) {
      await tx.oportunidadOferta.update({ where: { id: e.id }, data: { estado: 'descartada' } })
    }
    await tx.oportunidadOferta.create({
      data: {
        correduriaId, oportunidadId, documentoId: null, rol: 'actual', compania: fila.compania, producto: fila.producto,
        primaNeta: null, primaTotal: fila.primaTotal, datosExtra: fila.datosExtra as Prisma.InputJsonValue, estado: 'extraida', creadoPor: ACTOR_RENOVACION,
      },
    })
  })
}

/** Los precios ANUALES de la última cotización real de Avant2 de la oportunidad, como ofertas (idempotente). Nº añadidas. */
async function importarAvant2(correduriaId: string, oportunidadId: string, ramoOferta: Parameters<typeof ofertaDeAvant2>[1]): Promise<number> {
  const [t] = await db().$queryRaw<{ id: string; creado_at: Date; project_id_codeoscopic: string | null; peticion: unknown; fallos: unknown }[]>`
    select id::text as id, creado_at, project_id_codeoscopic, peticion, fallos from tarificaciones
    where correduria_id = ${correduriaId}::uuid and oportunidad_id = ${oportunidadId}::uuid and simulado = false
      and coalesce(to_jsonb(tarificaciones) ->> 'canal', 'codeoscopic') = 'codeoscopic'
    order by creado_at desc limit 1`
  if (!t || !t.project_id_codeoscopic) return 0
  const av = await cargarPrecios(t)
  if (av.caducada) return 0 // fecha de efecto pasada: para emitir haría falta otra consulta (se dice en la pantalla de la oportunidad)
  const elegidos = seleccionarAvant2(av.precios, MAX_AVANT2_RENOVACION)
  const existentes = await db().oportunidadOferta.findMany({ where: { correduriaId, oportunidadId }, select: { datosExtra: true } })
  const ya = new Set(existentes.map((e) => (e.datosExtra as Record<string, unknown> | null)?.avant2Clave).filter((k): k is string => typeof k === 'string'))
  let n = 0
  for (const p of elegidos) {
    const norm = ofertaDeAvant2(p, ramoOferta)
    const fila = filaOfertaAvant2(t.id, { id: p.id, compania: p.compania, producto: p.producto, modalidad: p.modalidad, primaAnual: norm.primaTotal, franquiciaEur: p.franquiciaEur }, norm.garantias)
    if (!fila || ya.has(String(fila.datosExtra.avant2Clave))) continue
    await db().oportunidadOferta.create({
      data: {
        correduriaId, oportunidadId, documentoId: null, rol: 'oferta', compania: fila.compania, producto: fila.producto, primaNeta: null, primaTotal: fila.primaTotal,
        ...(fila.garantias ? { garantias: fila.garantias as Prisma.InputJsonValue } : {}),
        datosExtra: fila.datosExtra as Prisma.InputJsonValue, estado: 'extraida', creadoPor: ACTOR_RENOVACION,
      },
    })
    n++
  }
  return n
}

// ─── Preparar ────────────────────────────────────────────────────────────────

export type ResultadoPreparar =
  | {
      estado: 'creado' | 'ya_existe'
      presupuestoId: string
      referencia: string | null
      oportunidadId: string
      actual: RenovacionActual
      opciones: OpcionComparada[]
      niveles: string[]
      catastro: EstadoCatastroRenovacion
      destinatarios: DecisionDestinatarios
      sinRevisar: number
      telegram: boolean
      urlVista: string
    }
  | { estado: 'sin_migracion' | 'sin_ofertas' | 'caducada' | 'invalido' | 'no_encontrado' | 'no_admite'; status: number; motivo: string }

export async function prepararRenovacion(correduriaId: string, e: { polizaId: string; actor: string; avisar?: boolean }, ahora: Date = new Date()): Promise<ResultadoPreparar> {
  if (!UUID.test(e.polizaId)) return { estado: 'invalido', status: 422, motivo: 'polizaId no válido' }
  if (!(await migracionRenovacion())) return { estado: 'sin_migracion', status: 503, motivo: 'Falta aplicar la migración 2026-11-05b_presupuesto_renovacion.sql.' }
  const pol = await leerPoliza(correduriaId, e.polizaId)
  const d = decidirPreparacion(pol)
  if (!d.ok || !pol) return { estado: d.ok ? 'no_encontrado' : d.status === 404 ? 'no_encontrado' : 'no_admite', status: d.ok ? 404 : d.status, motivo: d.ok ? 'póliza no encontrada' : d.motivo }

  // 1. La oportunidad de la póliza (la abierta o una nueva, gratis, con la vivienda precargada de la póliza).
  const ab = await abrirRiesgoDePoliza(correduriaId, { polizaId: e.polizaId, actor: e.actor })
  if (!ab.ok) return { estado: 'no_encontrado', status: ab.status, motivo: ab.motivo }
  const op = await leerOportunidadParaOfertas(correduriaId, ab.oportunidadId)
  if (!op) return { estado: 'no_encontrado', status: 404, motivo: 'oportunidad no encontrada' }

  // 2. Hogar: el Catastro ANTES de comparar (y de cualquier tarificación posterior), sin pisar nada.
  const catastro: EstadoCatastroRenovacion = pol.ramo === 'hogar' ? await catastroDeOportunidad(correduriaId, op.id, ahora) : { estado: 'no_aplica' }

  // 3. La renovación actual (prima con recibos) como `actual` + los precios de Avant2 como ofertas. Los de los bots ya están.
  await asegurarOfertaActual(correduriaId, op.id, pol.actual)
  await importarAvant2(correduriaId, op.id, op.ramoOferta).catch((x: unknown) => { registrarErrorCartera('renovacion/avant2', x) })

  const filas = (await ofertasDeOportunidad(correduriaId, op.id)).filter((f) => f.estado !== 'descartada')
  const actualFila = filas.find((f) => f.rol === 'actual') ?? null
  const vivas = filas.filter((f) => f.rol === 'oferta')
  const hoy = ahora.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
  const cad = caducidadOfertas(vivas, hoy)
  const vigentes = vivas.filter((f) => !cad.caducadas.includes(f.compania ?? ''))
  const opcionesBase = opcionesDeOfertas(op.ramoOferta, vigentes.map((f) => ({ ...f, recomendada: false })), ahora)
  if (opcionesBase.length === 0) {
    return { estado: 'sin_ofertas', status: 409, motivo: 'No hay alternativas con precio: lanza los bots (gratis) o una cotización de Avant2 desde la póliza y vuelve a prepararla.' }
  }

  // 4. Comparación (el único motor) + niveles + diferencia con la renovación.
  const comparacion: ResultadoComparacion = compararOfertas({
    ramo: op.ramoOferta,
    ofertas: [...(actualFila ? [actualFila] : []), ...vigentes].map((f) => ofertaNormalizadaDeFila(f, { ramo: op.ramoOferta })),
    superficieM2: op.superficieM2,
  })
  const huella = huellaComparativa({ ramo: op.ramoOferta, ofertas: comparacion.ofertas, superficieM2: op.superficieM2, recomendadaId: null })
  const narrativa = await generarNarrativa(comparacion, null, null) // determinista: no gasta IA
  const paraNivel = opcionesBase.map((o) => ({ id: o.ofertaId, compania: o.compania, producto: o.producto, primaEur: o.primaEur, franquiciaEur: o.franquiciaEur, coberturas: o.coberturas?.lista ?? null }))
  const niveles = masBarataPorNivel(pol.ramo, paraNivel)
  const nivelDe = new Map(paraNivel.map((o) => { const n = nivelDeOferta(pol.ramo, o).nivel; return [o.id, n === SIN_CLASIFICAR ? null : n] }))
  const opciones = compararConRenovacion(pol.actual.prima, opcionesBase.map((o) => ({
    id: o.ofertaId, compania: o.compania, producto: o.producto, primaEur: o.primaEur, franquiciaEur: o.franquiciaEur, nivel: nivelDe.get(o.ofertaId) ?? null,
  })))
  const sinRevisar = vigentes.filter((f) => f.estado !== 'revisada').length

  // 5. El borrador (bajo el MISMO cerrojo que «Generar presupuesto»): uno vivo por oportunidad; el anterior sin salir se retira.
  const { venceEl } = calcularVencimiento({ creadoAt: ahora, fechaEfecto: null, expiraOferta: cad.expira })
  const tokenHash = await hashTokenVista(generarTokenVista())
  const estudio = {
    version: 2, generadoAt: ahora.toISOString(), huella, recomendadaId: null, actualId: actualFila?.id ?? null, comparacion, narrativa,
    renovacion: { actual: pol.actual, niveles, catastro },
  }
  const ofertaIds = opcionesBase.map((o) => o.ofertaId).sort()
  const hecho = await db().$transaction(async (tx) => {
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${`presupuesto-ofertas:${correduriaId}:${op.id}`}))`
    const previos = await tx.$queryRaw<{ id: string; ofertas: string[] }[]>`
      select p.id::text as id, coalesce(array_agg(o.oferta_id::text order by o.oferta_id) filter (where o.oferta_id is not null), '{}') as ofertas
      from presupuesto p left join presupuesto_opcion o on o.presupuesto_id = p.id
      -- oculta-exenta: se comparan TODAS las opciones congeladas (también las ocultas) para saber si es el mismo borrador.
      where p.correduria_id = ${correduriaId}::uuid and p.oportunidad_id = ${op.id}::uuid and p.modo = ${MODO_RENOVACION}
        and p.retirado_at is null and p.enviado_at is null and p.enlace_generado_at is null and p.aceptado_at is null
      group by p.id`
    const igual = previos.find((p) => p.ofertas.length === ofertaIds.length && p.ofertas.every((x, i) => x === ofertaIds[i]))
    if (igual) return { nuevo: false as const, id: igual.id }
    for (const p of previos) {
      const motivo = 'Sustituido por una preparación nueva de la renovación con otros precios (sin haberse enviado).'
      await tx.presupuesto.update({ where: { id: p.id }, data: { retiradoAt: ahora, retiradoMotivo: motivo, eventos: { create: [{ tipo: 'retirado', origen: 'corredor', detalle: { actor: e.actor, motivo } }] } } })
    }
    const creado = await tx.presupuesto.create({
      data: {
        correduriaId, clienteId: op.clienteId, polizaId: e.polizaId, ramo: op.ramo ?? pol.ramo ?? 'otros', origen: 'ofertas', tarificacionId: null,
        oportunidadId: op.id, estudio: estudio as unknown as Prisma.InputJsonValue, tokenHash, venceEl, creadoAt: ahora, creadoPor: e.actor,
        opciones: {
          create: opcionesBase.map((o) => ({
            orden: o.orden, compania: o.compania, producto: o.producto, modalidad: null, categoria: null, grupoCobertura: null,
            primaEur: o.primaEur, entradaEur: null, franquiciaEur: o.franquiciaEur, firmeza: o.firmeza, requiereRerate: false, referenciaVendor: null,
            avisos: [AVISO_OPCION_OFERTA], papeles: [], ofertaId: o.ofertaId, garantias: o.garantias as unknown as Prisma.InputJsonValue,
            ...(o.coberturas ? { coberturas: o.coberturas as unknown as Prisma.InputJsonValue } : {}),
          })),
        },
        eventos: { create: [{ tipo: 'preparado', origen: 'corredor', detalle: { actor: e.actor, origen: 'ofertas', via: 'renovacion_alternativas', ofertas: ofertaIds, narrativa: narrativa.fuente, sustituye: previos.map((p) => p.id) } }] },
      },
      select: { id: true },
    })
    await tx.$executeRaw`update presupuesto set modo = ${MODO_RENOVACION} where id = ${creado.id}::uuid and correduria_id = ${correduriaId}::uuid`
    await tx.$executeRaw`
      insert into historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${op.clienteId}::uuid, cast('gestion' as tipo_historial_interno),
              ${lineaHistorialPreparada(op.ramo ?? pol.ramo ?? 'otros', opcionesBase.length)})`
    return { nuevo: true as const, id: creado.id }
  }, { timeout: 20_000, maxWait: 10_000 })

  if (hecho.nuevo) {
    await autocompletarNecesidades(correduriaId, hecho.id, e.actor).catch((x: unknown) => { registrarErrorCartera('renovacion/necesidades', x) })
    anotarCambio({ entidad: 'presupuesto', id: hecho.id, campo: 'modo', antes: null, despues: MODO_RENOVACION })
  }
  const [cab] = await db().$queryRaw<{ referencia: string | null; nombre: string | null; necesidades: string | null }[]>`
    select p.referencia, c.nombre, p.necesidades from presupuesto p left join clientes c on c.id = p.cliente_id and c.correduria_id = p.correduria_id
    where p.id = ${hecho.id}::uuid and p.correduria_id = ${correduriaId}::uuid`
  const base = decidirDestinatarios(await quienVeEnApp(correduriaId, op.clienteId, e.polizaId))
  // Sin exigencias y necesidades no se publica (art. 175.1 RDL 3/2020): se dice YA, no al pulsar ✅.
  const destinatarios: DecisionDestinatarios = cab?.necesidades?.trim()
    ? base
    : { publicable: false, motivo: 'no_consta', lineas: [...base.lineas, '📝 Faltan sus exigencias y necesidades: escríbelas en el presupuesto (✏️) y vuelve a prepararlo.'] }
  const lineasNiveles = lineasMasBarataPorNivel(niveles)

  // 6. Telegram de revisión (interno). Best effort: el borrador ya está; si no sale, se dice.
  let telegram = false
  if (e.avisar !== false) {
    try {
      const texto = textoRevision({ cliente: nombreDePila(cab?.nombre), referencia: cab?.referencia ?? null, ramo: op.ramo ?? 'otros', actual: pol.actual, opciones, niveles: lineasNiveles, catastro, destinatarios, sinRevisar })
      const id = await tgSendButtons(texto, botonesRevision(hecho.id, { vista: urlVistaPrevia(hecho.id), modificar: urlModificar(e.polizaId) }, destinatarios))
      if (id !== null) {
        telegram = true
        await db().presupuestoEvento.create({ data: { presupuestoId: hecho.id, tipo: EVENTO_REVISION_TG, origen: 'sistema', detalle: { messageId: id } } })
      }
    } catch (x) {
      registrarErrorCartera('renovacion/telegram', x)
    }
  }
  return {
    estado: hecho.nuevo ? 'creado' : 'ya_existe', presupuestoId: hecho.id, referencia: cab?.referencia ?? null, oportunidadId: op.id, actual: pol.actual,
    opciones, niveles: lineasNiveles, catastro, destinatarios, sinRevisar, telegram, urlVista: urlVistaPrevia(hecho.id),
  }
}

// ─── Publicar en la app (el ✅ de Alberto) ───────────────────────────────────

export type ResultadoPublicar =
  | { estado: 'publicado' | 'ya_publicado'; presupuestoId: string }
  /** Por correo: salió (el enlace de siempre; elige desde ahí). */
  | { estado: 'enviado'; presupuestoId: string }
  /** Por WhatsApp: el `wa.me` que abre Alberto en SU móvil (aquí no sale nada). Lleva el móvil del tomador y el código: solo para él. */
  | { estado: 'enlace'; presupuestoId: string; whatsapp: string }
  | { estado: 'sin_migracion' | 'canal_no_disponible' | 'no_vigente' | 'caducado' | 'retirado' | 'no_encontrado' | 'invalido' | 'sin_necesidades' | 'error' | 'envio_fallido'; status: number; motivo: string }

/**
 * Publica el borrador de renovación (el ✅ de Alberto). `canal` (05/11/2026): `app` (lo preferido: la app del tomador o de
 * su autorizado con Gestión/Total) o, si nadie puede elegir allí, `email` / `whatsapp_enlace` con el ENLACE de siempre
 * (`avisarPresupuesto`: token + código, carátula del portal) desde el que el cliente elige sin firma.
 * Desde Telegram (`via` ≠ 'pantalla') es OBLIGATORIO el `telegramMessageId` del botón y tiene que ser el del ÚLTIMO
 * mensaje de revisión de ese borrador. Al publicar, Alberto da por REVISADAS las ofertas de las opciones visibles (el
 * trigger de la BD lo vuelve a exigir). Un solo uso: dos pulsaciones = una publicación (CAS sobre `enviado_at`; por
 * correo/WhatsApp, lo ya salido o enlazado no se repite desde aquí).
 */
export async function publicarRenovacion(correduriaId: string, e: { presupuestoId: string; actor: string; via: ViaPublicar; telegramMessageId?: number | null; canal?: CanalRenovacion }, ahora: Date = new Date()): Promise<ResultadoPublicar> {
  const canal: CanalRenovacion = e.canal ?? 'app'
  if (!UUID.test(e.presupuestoId)) return { estado: 'invalido', status: 422, motivo: 'presupuestoId no válido' }
  if (canal !== 'app' && canal !== 'email' && canal !== 'whatsapp_enlace') return { estado: 'invalido', status: 422, motivo: 'canal no válido' }
  if (!(await migracionRenovacion())) return { estado: 'sin_migracion', status: 503, motivo: 'Falta aplicar la migración 2026-11-05b.' }
  const [p] = await db().$queryRaw<{ id: string; cliente_id: string; poliza_id: string | null; oportunidad_id: string | null; ramo: string; modo: string | null; enviado_at: Date | null; enlace_generado_at: Date | null; retirado_at: Date | null; vence_el: Date; necesidades: string | null }[]>`
    select id::text as id, cliente_id::text as cliente_id, poliza_id::text as poliza_id, oportunidad_id::text as oportunidad_id, ramo, modo, enviado_at, enlace_generado_at, retirado_at, vence_el, necesidades
    from presupuesto where id = ${e.presupuestoId}::uuid and correduria_id = ${correduriaId}::uuid`
  if (!p || p.modo !== MODO_RENOVACION || !p.poliza_id || !p.oportunidad_id) return { estado: 'no_encontrado', status: 404, motivo: 'No es un borrador de renovación de esta correduría.' }
  if (p.enviado_at !== null || (canal !== 'app' && p.enlace_generado_at !== null)) return { estado: 'ya_publicado', presupuestoId: p.id }
  if (p.retirado_at !== null) return { estado: 'retirado', status: 409, motivo: 'Ese borrador se retiró.' }
  if (p.vence_el.getTime() < ahora.getTime()) return { estado: 'caducado', status: 409, motivo: 'Los precios han caducado.' }
  // Exigencias y necesidades (art. 175.1 RDL 3/2020): la misma puerta que el envío por correo/WhatsApp (`envio-presupuesto`).
  if (!p.necesidades?.trim()) return { estado: 'sin_necesidades', status: 409, motivo: 'Antes de publicarlo, escribe sus exigencias y necesidades en el presupuesto (ficha de la póliza → Presupuestos).' }
  // Desde Telegram, SIEMPRE el message_id del botón y el del último mensaje de revisión (sin él no se publica).
  if (e.via !== 'pantalla') {
    const ultimo = await db().presupuestoEvento.findFirst({ where: { presupuestoId: p.id, tipo: EVENTO_REVISION_TG }, orderBy: { ocurridoAt: 'desc' }, select: { detalle: true } })
    const idUltimo = (ultimo?.detalle as { messageId?: unknown } | undefined)?.messageId
    const vig = decidirMensajeVigente({ via: 'telegram', pedido: e.telegramMessageId ?? null, ultimo: typeof idUltimo === 'number' ? idUltimo : null })
    if (!vig.ok) return { estado: 'no_vigente', status: 409, motivo: vig.motivo }
  }
  if (canal !== 'app') return enviarRenovacionPorEnlace(correduriaId, { id: p.id, clienteId: p.cliente_id, oportunidadId: p.oportunidad_id, ramo: p.ramo }, e.actor, canal, ahora)
  const dest = decidirDestinatarios(await quienVeEnApp(correduriaId, p.cliente_id, p.poliza_id))
  // 503 `canal_no_disponible`: no hay a quién publicarlo. NO es «el envío falló» (502).
  if (!dest.publicable) return { estado: 'canal_no_disponible', status: 503, motivo: dest.lineas[0] ?? 'El tomador no usa la app.' }

  const r = await db().$transaction(async (tx) => {
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${`presupuesto-ofertas:${correduriaId}:${p.oportunidad_id}`}))`
    // Las ofertas de las opciones VISIBLES pasan a revisadas por quien pulsa (nunca las de otro presupuesto).
    await marcarRevisadas(tx, correduriaId, p.id, p.oportunidad_id!, e.actor, ahora)
    const n = await tx.$executeRaw`
      update presupuesto set enviado_at = ${ahora}, canal_aviso = 'app'
      where id = ${p.id}::uuid and correduria_id = ${correduriaId}::uuid and enviado_at is null and retirado_at is null and modo = ${MODO_RENOVACION}`
    if (n === 0) return 'ya' as const
    await tx.presupuestoEvento.create({ data: { presupuestoId: p.id, tipo: EVENTO_PUBLICADO, origen: 'corredor', detalle: { actor: e.actor, canal: 'app' } } })
    await tx.presupuestoEvento.create({ data: { presupuestoId: p.id, tipo: 'enviado', origen: 'corredor', detalle: { actor: e.actor, canal: 'app' } } })
    await tx.$executeRaw`
      insert into historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${p.cliente_id}::uuid, cast('gestion' as tipo_historial_interno),
              ${`Renovación con alternativas de ${p.ramo} publicada en la app del cliente (no emite nada).`})`
    return 'ok' as const
  })
  if (r === 'ya') return { estado: 'ya_publicado', presupuestoId: p.id }
  anotarCambio({ entidad: 'presupuesto', id: p.id, campo: 'enviado_at', antes: null, despues: 'app' })
  return { estado: 'publicado', presupuestoId: p.id }
}

/** Las ofertas de las opciones VISIBLES pasan a revisadas por quien pulsa ✅ (nunca las de otro presupuesto). */
async function marcarRevisadas(tx: Prisma.TransactionClient, correduriaId: string, presupuestoId: string, oportunidadId: string, actor: string, ahora: Date): Promise<void> {
  await tx.$executeRaw`
    update oportunidad_oferta f set estado = 'revisada', revisada_at = ${ahora}, revisada_por = ${actor}
    from presupuesto_opcion o
    where o.presupuesto_id = ${presupuestoId}::uuid and o.oculta_at is null and f.id = o.oferta_id
      and f.correduria_id = ${correduriaId}::uuid and f.oportunidad_id = ${oportunidadId}::uuid and f.estado = 'extraida'`
}

/**
 * ✅ por CORREO o WHATSAPP (05/11/2026): cuando nadie puede elegir en la app. Reutiliza el aviso de SIEMPRE
 * (`avisarPresupuesto`: token nuevo con compare-and-swap, código del WhatsApp atado a él, carátula del portal, nunca a una
 * persona de contacto: esa ve pero no elige). Lo único propio: el ✅ da por revisadas las ofertas ANTES (la puerta de
 * `decidirSalida` y el trigger lo exigen) y queda el rastro (evento + historial + auditoría). Elegir desde el enlace NO
 * emite ni firma (el puente admite el token del WhatsApp en `elegir_renovacion`; el correo abre su sesión de cliente).
 */
async function enviarRenovacionPorEnlace(
  correduriaId: string, p: { id: string; clienteId: string; oportunidadId: string; ramo: string }, actor: string, canal: Exclude<CanalRenovacion, 'app'>, ahora: Date,
): Promise<ResultadoPublicar> {
  await db().$transaction(async (tx) => {
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${`presupuesto-ofertas:${correduriaId}:${p.oportunidadId}`}))`
    await marcarRevisadas(tx, correduriaId, p.id, p.oportunidadId, actor, ahora)
    await tx.presupuestoEvento.create({ data: { presupuestoId: p.id, tipo: EVENTO_ENVIO_CANAL, origen: 'corredor', detalle: { actor, canal } } })
  })
  const r = await avisarPresupuesto(correduriaId, { id: p.id, canal, actor }, ahora)
  const ok = r.estado === 'enviado' || r.estado === 'enlace'
  const texto = canal === 'email'
    ? (ok ? `Renovación con alternativas de ${p.ramo} enviada por correo al tomador (✅ de ${actor}): elige desde el enlace, sin firma; no emite nada.` : `Renovación con alternativas de ${p.ramo}: el correo NO salió (${r.estado === 'error' ? r.motivo : r.estado}).`)
    : (ok ? `Renovación con alternativas de ${p.ramo}: enlace del WhatsApp preparado para el tomador (✅ de ${actor}); lo manda Alberto desde su móvil. Elige desde el enlace, sin firma; no emite nada.` : `Renovación con alternativas de ${p.ramo}: el enlace del WhatsApp NO se pudo preparar (${r.estado === 'error' ? r.motivo : r.estado}).`)
  try {
    await db().$executeRaw`
      insert into historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${p.clienteId}::uuid, cast('gestion' as tipo_historial_interno), ${texto})`
  } catch (x) {
    registrarErrorCartera('renovacion/historial-envio', x)
  }
  anotarCambio({ entidad: 'presupuesto', id: p.id, campo: 'renovacion_canal', antes: null, despues: ok ? canal : `${canal}:fallido` })
  if (r.estado === 'enviado') return { estado: 'enviado', presupuestoId: p.id }
  if (r.estado === 'enlace') return { estado: 'enlace', presupuestoId: p.id, whatsapp: r.whatsapp }
  if (r.estado === 'error') {
    // Lo que se arregla en la ficha (sin correo, sin móvil, sin acceso) es 409; el proveedor caído, 502 (≠ «no hay canal»).
    const status = r.motivo === 'sin_proveedor' || r.motivo === 'rechazado' || r.motivo === 'incierto' || r.motivo === 'remitente_no_verificado' ? 502 : 409
    return { estado: 'envio_fallido', status, motivo: r.detalle }
  }
  return { estado: 'error', status: 500, motivo: 'Respuesta inesperada del aviso: mira la ficha antes de repetir.' }
}

// ─── La elección del cliente (puente del portal) ─────────────────────────────

export type ResultadoEleccion =
  | { estado: 'ok'; cambio: boolean; aviso: string | null }
  /** Ya eligió OTRA persona (vale la primera): su nombre de pila, nada más. */
  | { estado: 'ya_elegida'; por: string | null }
  | { estado: 'no_encontrado' | 'no_admite' | 'caducado' | 'limite' | 'sin_migracion' | 'sin_permiso' | 'error' }

/**
 * Elige el cliente (05/11/2026): con su IDENTIDAD del portal o con el ENLACE del WhatsApp (token del cookie del portal,
 * nunca un clienteId de la petición). Quién puede: el lado del TOMADOR (vínculo con nivel de operar → `fichaPropiaDeRecurso`;
 * o su token vigente de ESTE presupuesto → `fichaDeTokenWhatsapp`, que ya exige id, token, vigencia y no retirado) o un
 * AUTORIZADO con Gestión/Total (`identidadesQueEligenRenovacion`, solo con identidad). Vale la PRIMERA elección: otra
 * persona recibe `ya_elegida` con el nombre de pila de quien eligió. NO emite ni firma: anota la elección (con quién y por
 * dónde en el evento y en el historial), deja el presupuesto «elegido» y devuelve el texto del Telegram.
 */
export async function elegirRenovacion(correduriaId: string, acceso: AccesoPortal, presupuestoId: string, eleccion: Eleccion, ahora: Date = new Date()): Promise<ResultadoEleccion> {
  if (!UUID.test(presupuestoId)) return { estado: 'no_encontrado' }
  if (!(await migracionRenovacion()) || !(await migracionQuienElige())) return { estado: 'sin_migracion' }
  const porEnlace = 'tokenWhatsapp' in acceso
  const identidadId = porEnlace ? null : acceso.identidadId

  // 1. ¿Es el lado del tomador?
  let ficha: FichaParaElegir
  if (porEnlace) {
    const t = fichaDeToken(await fichaDeTokenWhatsapp(correduriaId, acceso.tokenWhatsapp, presupuestoId, ahora))
    ficha = t.estado === 'ok' ? t : { estado: t.estado }
  } else {
    const f = await fichaPropiaDeRecurso(correduriaId, acceso.identidadId, 'presupuesto', presupuestoId)
    ficha = f.estado === 'ok' ? f : { estado: f.estado === 'ajena' ? 'ajena' : f.estado }
  }

  // 2. Si no, ¿un autorizado con Gestión/Total sobre ESTA póliza del tomador? (solo con identidad: el enlace es del tomador)
  let autorizado: { tomadorId: string; nombre: string | null } | null = null
  let autorizadoElige: boolean | null = false
  if (!porEnlace && identidadId && ficha.estado !== 'ok' && ficha.estado !== 'error') {
    try {
      const [pr] = await db().$queryRaw<{ cliente_id: string; poliza_id: string | null }[]>`
        select cliente_id::text as cliente_id, poliza_id::text as poliza_id from presupuesto
        where id = ${presupuestoId}::uuid and correduria_id = ${correduriaId}::uuid`
      if (pr) {
        const eligen = identidadesQueEligenRenovacion(await filasAutorizacionRenovacion(correduriaId, pr.cliente_id, identidadId), pr.poliza_id, ahora)
        const yo = eligen.get(identidadId)
        if (yo) autorizado = { tomadorId: pr.cliente_id, nombre: nombreDePila(yo.nombre) }
      }
      autorizadoElige = autorizado !== null
    } catch (x) {
      registrarErrorCartera('renovacion/elegir-autorizado', x)
      autorizadoElige = null
    }
  }
  const quien = decidirElector({ via: porEnlace ? 'enlace' : 'identidad', ficha, autorizadoElige })
  if (!quien.ok) return { estado: quien.estado }
  const clienteId = quien.papel === 'tomador' && ficha.estado === 'ok' ? ficha.clienteId : autorizado?.tomadorId
  if (!clienteId) return { estado: 'no_encontrado' }

  return db().$transaction(async (tx) => {
    const [p] = await tx.$queryRaw<{
      id: string; cliente_id: string; tomador: string | null; ramo: string; modo: string | null; enviado_at: Date | null; enlace_generado_at: Date | null; vence_el: Date
      retirado_at: Date | null; aceptado_at: Date | null; emitido_at: Date | null; eleccion_cliente: string | null; eleccion_opcion_id: string | null; estudio: unknown
      eleccion_por_papel: string | null; eleccion_por_identidad_id: string | null; eleccion_por_nombre: string | null
    }[]>`
      select p.id::text as id, p.cliente_id::text as cliente_id, c.nombre as tomador, p.ramo, p.modo, p.enviado_at, p.enlace_generado_at, p.vence_el,
             p.retirado_at, p.aceptado_at, p.emitido_at, p.eleccion_cliente, p.eleccion_opcion_id::text as eleccion_opcion_id, p.estudio,
             p.eleccion_por_papel, p.eleccion_por_identidad_id::text as eleccion_por_identidad_id, p.eleccion_por_nombre
      from presupuesto p left join clientes c on c.id = p.cliente_id and c.correduria_id = p.correduria_id
      where p.id = ${presupuestoId}::uuid and p.correduria_id = ${correduriaId}::uuid and p.cliente_id = ${clienteId}::uuid
      for update of p`
    if (!p) return { estado: 'no_encontrado' as const }
    const elector: ElectorRenovacion = quien.papel === 'tomador'
      ? { papel: 'tomador', via: porEnlace ? 'enlace_whatsapp' : 'app', identidadId, nombre: nombreDePila(p.tomador) }
      : { papel: 'autorizado', via: 'app', identidadId: identidadId!, nombre: autorizado?.nombre ?? null }
    const opcion = eleccion.tipo === 'opcion'
      ? await tx.presupuestoOpcion.findFirst({ where: { id: eleccion.opcionId, presupuestoId: p.id, ocultaAt: null }, select: { id: true, compania: true, producto: true, primaEur: true } })
      : null
    const dia = await tx.presupuestoEvento.count({ where: { presupuestoId: p.id, tipo: EVENTO_ELECCION, ocurridoAt: { gte: new Date(ahora.getTime() - 24 * 3_600_000) } } })
    // De quién es la elección: lo que selló la PRIMERA (bajo el `for update`, dos personas a la vez no pueden ser «la primera»).
    // Sin `papel` y con elección hecha = anterior a 2026-11-05c: del tomador (solo él podía elegir).
    const dueno = duenoDeEleccion(
      { papel: p.eleccion_por_papel ?? undefined, identidadId: p.eleccion_por_identidad_id, porNombre: p.eleccion_por_nombre },
      p.eleccion_cliente !== null,
    )
    const actual: Eleccion | null = p.eleccion_cliente === 'renovacion' ? { tipo: 'renovacion' } : p.eleccion_cliente === 'opcion' && p.eleccion_opcion_id ? { tipo: 'opcion', opcionId: p.eleccion_opcion_id } : null
    const d = decidirEleccion(
      { modo: p.modo, enviadoAt: p.enviado_at, enlaceGeneradoAt: p.enlace_generado_at, dueno, venceEl: p.vence_el, retiradoAt: p.retirado_at, aceptadoAt: p.aceptado_at, emitidoAt: p.emitido_at, eleccionActual: actual, eleccionesDia: dia },
      eleccion, opcion !== null, ahora, { papel: elector.papel, identidadId: elector.identidadId },
    )
    if (!d.ok) return d.estado === 'ya_elegida' ? { estado: 'ya_elegida' as const, por: d.por } : { estado: d.estado }
    if (!d.cambio) return { estado: 'ok' as const, cambio: false, aviso: null }
    // Quién eligió se sella SOLO con la primera elección (en el SET, `eleccion_cliente` es el valor ANTERIOR).
    const porNombre = elector.nombre ? elector.nombre.slice(0, 60) : null
    await tx.$executeRaw`
      update presupuesto set eleccion_cliente = ${eleccion.tipo}, eleccion_opcion_id = ${opcion?.id ?? null}::uuid, eleccion_at = ${ahora}, elegido_at = ${ahora},
             eleccion_por_papel = case when eleccion_cliente is null then ${elector.papel} else eleccion_por_papel end,
             eleccion_por_identidad_id = case when eleccion_cliente is null then ${elector.identidadId}::uuid else eleccion_por_identidad_id end,
             eleccion_por_nombre = case when eleccion_cliente is null then ${porNombre} else eleccion_por_nombre end,
             eleccion_via = case when eleccion_cliente is null then ${elector.via} else eleccion_via end
      where id = ${p.id}::uuid and correduria_id = ${correduriaId}::uuid`
    await tx.presupuestoOpcion.updateMany({ where: { presupuestoId: p.id }, data: { elegidaAt: null } })
    if (opcion) await tx.presupuestoOpcion.update({ where: { id: opcion.id }, data: { elegidaAt: ahora } })
    // Quién y por dónde (identidad del portal completa aquí; en el historial, abreviada). Sin DNI/IBAN/dirección.
    await tx.presupuestoEvento.create({ data: { presupuestoId: p.id, tipo: EVENTO_ELECCION, origen: 'cliente', detalle: { eleccion: eleccion.tipo, opcionId: opcion?.id ?? null, ...detalleElector(elector) } } })
    const op = opcion ? { compania: opcion.compania, producto: opcion.producto, primaEur: Number(opcion.primaEur.toString()) } : null
    await tx.$executeRaw`
      insert into historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${p.cliente_id}::uuid, cast('gestion' as tipo_historial_interno), ${lineaHistorialEleccion(eleccion, op, p.ramo, elector)})`
    const ren = (p.estudio as { renovacion?: { actual?: { prima?: unknown } } } | null)?.renovacion?.actual?.prima
    anotarCambio({ entidad: 'presupuesto', id: p.id, campo: 'eleccion_cliente', antes: p.eleccion_cliente, despues: `${eleccion.tipo}:${elector.papel}:${elector.via}` })
    return {
      estado: 'ok' as const, cambio: true,
      aviso: textoEleccion({ tomador: nombreDePila(p.tomador), ramo: p.ramo, eleccion, opcion: op, primaRenovacion: typeof ren === 'number' ? ren : null, enlace: enlaceFichaCliente(p.cliente_id, plataforma()), cambio: true, elector }),
    }
  }, { timeout: 15_000, maxWait: 8_000 })
}

/**
 * El Telegram INTERNO a Alberto con la elección (lo llama el puente en `after()`, ya respondido el portal). Si no sale
 * (sin canal o fallo), NO se pierde: evento `renovacion_eleccion_aviso_fallido` con el motivo + línea en el historial de la
 * ficha (lo que ve Alberto en plataforma) + log. No hay cron de reintento de Telegram: el historial es el rastro. Nunca lanza.
 */
export async function avisarEleccion(correduriaId: string, presupuestoId: string, aviso: string): Promise<boolean> {
  let motivo = 'sin_canal'
  try {
    const id = await tgSend(aviso)
    if (id !== null) return true
  } catch (x) {
    motivo = 'error_telegram'
    registrarErrorCartera('renovacion/aviso-eleccion', x)
  }
  console.warn(`[renovacion] ${presupuestoId}: el Telegram de la elección no salió (${motivo})`)
  try {
    await db().$transaction(async (tx) => {
      await tx.presupuestoEvento.create({ data: { presupuestoId, tipo: EVENTO_AVISO_FALLIDO, origen: 'sistema', detalle: { motivo } } })
      await tx.$executeRaw`
        insert into historial_interno (correduria_id, cliente_id, tipo, texto)
        select p.correduria_id, p.cliente_id, cast('gestion' as tipo_historial_interno), ${lineaHistorialAvisoFallido(motivo)}
        from presupuesto p where p.id = ${presupuestoId}::uuid and p.correduria_id = ${correduriaId}::uuid`
    })
  } catch (x) {
    registrarErrorCartera('renovacion/aviso-eleccion-rastro', x)
  }
  return false
}
