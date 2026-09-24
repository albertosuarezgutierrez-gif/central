// El presupuesto que se le enseña a un CLIENTE: prepararlo, verlo y retirarlo.
//
// Diseño: `docs/superpowers/specs/2026-09-21-asegura-presupuesto-al-cliente-design.md`.
// Reglas PURAS (estado derivado, caducidad, la regla de las tres) en
// `@central/module-seguros/presupuesto-cliente`. Aquí solo vive la BD.
//
// 🚨 ESTE FICHERO NO MANDA NADA NI GASTA NADA. Prepara la fila y congela las
// opciones; el envío (correo / enlace de WhatsApp) es el PR 3 y la firma el 4.
// El único botón de esta app que cuesta dinero sigue siendo `cotizar()`.
//
// 🚨 Y no se recotiza: las opciones salen de una tarificación YA PAGADA
// (`seguros.tarificaciones`). Preparar un presupuesto es gratis a propósito —
// si costara, Alberto no lo usaría para cada llamada.

import {
  agruparPrecios,
  calcularVencimiento,
  elegirPortada,
  estadoPresupuesto,
  validarNecesidades,
  type EstadoPresupuesto,
  type PapelPortada,
  type PrecioComparable,
  type SinEquivalente,
} from '@central/module-seguros'
import { generarTokenVista, hashTokenVista } from '@central/module-seguros-portal'

import { prismaAsegura } from './asegura-db'
import { anotarCambio } from './auditoria'
import { registrarErrorCartera } from './error-cartera'

/**
 * Por qué no se ha podido situar la cobertura que el cliente tiene HOY.
 *
 * 🚨 Son DOS cosas distintas y la pantalla dirá cuál, porque se arreglan en
 * sitios distintos: `sin_desglose` es la compañía (CIMA no manda las
 * coberturas de esa póliza) y `sin_clasificar` somos nosotros (las manda y
 * todavía no sabemos traducirlas a un nivel). Colapsarlas diría «la compañía
 * no lo manda» sobre un desglose que sí está guardado.
 */
export type LecturaActual = 'clasificada' | 'sin_desglose' | 'sin_clasificar'

export type OpcionPreparada = {
  orden: number
  compania: string
  producto: string
  modalidad: string | null
  categoria: string | null
  grupoCobertura: string | null
  primaEur: number
  entradaEur: number | null
  /** `null` = el producto NO declara franquicia. Jamás «sin franquicia». */
  franquiciaEur: number | null
  firmeza: string
  requiereRerate: boolean
  referenciaVendor: string | null
  avisos: string[]
  papeles: PapelPortada[]
  /** La más barata NO comparte cobertura con la actual. Se pinta. */
  coberturaDistinta: boolean
}

export type PresupuestoPreparado = {
  id: string
  estado: EstadoPresupuesto
  clienteId: string
  polizaId: string | null
  ramo: string
  tarificacionId: string
  venceEl: Date
  fuenteVencimiento: string
  creadoAt: Date
  /** 🚨 El precio NO lo ha dado ninguna compañía: no se puede enviar. */
  simulado: boolean
  lecturaActual: LecturaActual
  motivoSinEquivalente: SinEquivalente | null
  /** Cuándo los grupos NO son comparables entre sí. Si viene, se PINTA. */
  avisoEscala: string | null
  opciones: OpcionPreparada[]
  /** Cuántos precios trajo la tarificación, para poder decir «3 de 12». */
  preciosTotales: number
}

export type ResultadoPreparar =
  | { estado: 'ok'; presupuesto: PresupuestoPreparado; token: string }
  | {
      estado: 'error'
      motivo:
        | 'sin_tarificacion'
        | 'sin_precios'
        | 'no_encontrado'
        | 'ramo_no_soportado'
      detalle: string
    }

/** Los ramos con los que hoy se puede montar una comparativa de verdad. */
const RAMOS_CON_COMPARATIVA = new Set(['auto', 'moto', 'hogar'])

/**
 * Prepara un presupuesto en BORRADOR desde una tarificación ya pagada.
 *
 * `claveNivelActual` es el nivel de cobertura de la póliza que el cliente tiene
 * hoy, si quien llama lo sabe. **No se adivina aquí**: sin él, la portada no
 * ofrece «la equivalente» y lo DICE (`motivoSinEquivalente`), que es preferible
 * a poner de equivalente algo que nadie ha comparado.
 */
export async function prepararPresupuesto(
  correduriaId: string,
  entrada: {
    tarificacionId?: string | null
    polizaId?: string | null
    claveNivelActual?: string | null
    actor: string
  },
): Promise<ResultadoPreparar> {
  const db = prismaAsegura()

  const cab = await cabecera(correduriaId, entrada)
  if (cab === null) {
    return {
      estado: 'error',
      motivo: 'sin_tarificacion',
      detalle:
        'No hay ninguna tarificación guardada para eso en esta correduría. Pide precio primero: ' +
        'un presupuesto se monta sobre una cotización ya pagada, no vuelve a cotizar.',
    }
  }

  if (!RAMOS_CON_COMPARATIVA.has(cab.ramo)) {
    return {
      estado: 'error',
      motivo: 'ramo_no_soportado',
      detalle: `Todavía no se compara el ramo «${cab.ramo}»: sin niveles de cobertura no hay comparativa que enseñar.`,
    }
  }

  const filas = await db.$queryRaw<
    {
      compania: string | null
      producto: string | null
      modalidad: string | null
      categoria: string | null
      prima_eur: string | number | null
      entrada_eur: string | number | null
      franquicia_eur: string | number | null
      firmeza: string | null
      requiere_rerate: boolean | null
      referencia_vendor: string | null
      avisos: unknown
    }[]
  >`
    select compania, producto, modalidad, categoria, prima_eur, entrada_eur, franquicia_eur,
           firmeza, requiere_rerate, referencia_vendor, avisos
    from tarificacion_precios
    where tarificacion_id = ${cab.id}::uuid
    order by creado_at asc, prima_eur asc nulls last
  `

  if (filas.length === 0) {
    return {
      estado: 'error',
      motivo: 'sin_precios',
      detalle: 'Esa tarificación no tiene ningún precio guardado: no hay nada que enseñar.',
    }
  }

  // El orden de este array ES la clave estable: `FilaPrecio.indice` apunta aquí.
  const comparables: PrecioComparable[] = filas.map((f) => ({
    compania: f.compania,
    producto: f.producto,
    categoria: f.categoria,
    primaEur: numero(f.prima_eur),
    franquiciaEur: numero(f.franquicia_eur),
    firmeza: f.firmeza,
    avisos: Array.isArray(f.avisos) ? f.avisos.filter((a): a is string => typeof a === 'string') : [],
  }))

  // 🚨 `ramo` NO es opcional aquí: «Todo Riesgo» es el tope de auto Y el nombre
  // que una compañía le da a su hogar completo. Sin ramo, un hogar de 84,80€
  // cae en el grupo del todo riesgo de un coche.
  const comparativa = agruparPrecios(comparables, { ramo: cab.ramo })

  const lecturaActual = await leerNivelActual(correduriaId, cab.polizaId, entrada.claveNivelActual ?? null)
  const portada = elegirPortada(comparativa, entrada.claveNivelActual ?? null)

  // 🚨 Solo se congelan las de PORTADA. La lista larga («ver todas») se sigue
  // leyendo de la tarificación: lo que hay que poder reconstruir letra a letra
  // dentro de seis meses es lo que se le puso DELANTE, no el volcado entero.
  const aCongelar: OpcionPreparada[] = []
  let orden = 0
  for (const o of portada.opciones) {
    const cruda = filas[o.fila.indice]
    const prima = numero(cruda?.prima_eur ?? null)
    // Una opción sin prima no es una opción: no se le enseña a nadie una
    // tarjeta con el precio en blanco, y `prima_eur` es NOT NULL en la tabla.
    if (!cruda || prima === null) continue
    orden += 1
    aCongelar.push({
      orden,
      compania: cruda.compania ?? 'Sin compañía',
      producto: cruda.producto ?? 'Sin producto',
      modalidad: cruda.modalidad,
      categoria: cruda.categoria,
      grupoCobertura: o.fila.nivel.reconocido ? o.fila.nivel.clave : null,
      primaEur: prima,
      entradaEur: numero(cruda.entrada_eur),
      franquiciaEur: numero(cruda.franquicia_eur),
      firmeza: cruda.firmeza ?? 'estimado',
      requiereRerate: cruda.requiere_rerate ?? true,
      referenciaVendor: cruda.referencia_vendor,
      avisos: Array.isArray(cruda.avisos) ? cruda.avisos.filter((a): a is string => typeof a === 'string') : [],
      papeles: o.papeles,
      coberturaDistinta: o.coberturaDistinta,
    })
  }

  if (aCongelar.length === 0) {
    return {
      estado: 'error',
      motivo: 'sin_precios',
      detalle:
        'Ninguna de las opciones trae prima, así que no hay nada que poner en una tarjeta. ' +
        'El precio está en blanco en la cotización guardada.',
    }
  }

  const creadoAt = new Date()
  const { venceEl, fuente } = calcularVencimiento({
    creadoAt,
    fechaEfecto: cab.fechaEfecto,
    // `expirationDate` solo llega tras el ReRate y hoy no se guarda: no se
    // inventa una caducidad del vendor que nadie ha leído.
    expiraOferta: null,
  })

  const token = generarTokenVista()
  const tokenHash = await hashTokenVista(token)

  const creado = await db.presupuesto.create({
    data: {
      correduriaId,
      clienteId: cab.clienteId,
      polizaId: cab.polizaId,
      ramo: cab.ramo,
      tarificacionId: cab.id,
      tokenHash,
      venceEl,
      creadoAt,
      creadoPor: entrada.actor,
      opciones: {
        create: aCongelar.map((o) => ({
          orden: o.orden,
          compania: o.compania,
          producto: o.producto,
          modalidad: o.modalidad,
          categoria: o.categoria,
          grupoCobertura: o.grupoCobertura,
          primaEur: o.primaEur,
          entradaEur: o.entradaEur,
          franquiciaEur: o.franquiciaEur,
          firmeza: o.firmeza,
          requiereRerate: o.requiereRerate,
          referenciaVendor: o.referenciaVendor,
          avisos: o.avisos,
          papeles: o.papeles,
        })),
      },
      eventos: {
        create: [{ tipo: 'preparado', origen: 'corredor', detalle: { actor: entrada.actor } }],
      },
    },
    select: { id: true },
  })

  return {
    estado: 'ok',
    // 🔑 El token en claro se devuelve UNA vez y no se guarda: en la BD solo
    // vive su hash. Si se pierde, se retira el borrador y se prepara otro.
    token,
    presupuesto: {
      id: creado.id,
      estado: estadoPresupuesto({ venceEl }, creadoAt),
      clienteId: cab.clienteId,
      polizaId: cab.polizaId,
      ramo: cab.ramo,
      tarificacionId: cab.id,
      venceEl,
      fuenteVencimiento: fuente,
      creadoAt,
      simulado: cab.simulado,
      lecturaActual,
      motivoSinEquivalente: portada.motivoSinEquivalente,
      avisoEscala: portada.avisoEscala,
      opciones: aCongelar,
      preciosTotales: filas.length,
    },
  }
}

type Cabecera = {
  id: string
  clienteId: string
  polizaId: string | null
  ramo: string
  simulado: boolean
  fechaEfecto: Date | null
}

/**
 * La tarificación de la que sale el presupuesto: la pedida por id, o la ÚLTIMA
 * de esa póliza.
 *
 * 🚨 Se admite una SIMULADA a propósito, y no es un descuido: sirve para
 * recorrer la pantalla sin gastar 0,50€, viaja marcada (`simulado: true`) y el
 * trigger de la BD impide que llegue a salir de casa. Filtrarla aquí en
 * silencio daría un «no hay tarificación» sobre una que sí está.
 */
async function cabecera(correduriaId: string, e: { tarificacionId?: string | null; polizaId?: string | null }): Promise<Cabecera | null> {
  const db = prismaAsegura()
  const filas = e.tarificacionId
    ? await db.$queryRaw<FilaCabecera[]>`
        select id::text as id, cliente_id::text as cliente_id, poliza_id::text as poliza_id,
               ramo, simulado, peticion
        from tarificaciones
        where correduria_id = ${correduriaId}::uuid and id = ${e.tarificacionId}::uuid
        limit 1
      `
    : e.polizaId
      ? await db.$queryRaw<FilaCabecera[]>`
          select id::text as id, cliente_id::text as cliente_id, poliza_id::text as poliza_id,
                 ramo, simulado, peticion
          from tarificaciones
          where correduria_id = ${correduriaId}::uuid and poliza_id = ${e.polizaId}::uuid
          order by creado_at desc
          limit 1
        `
      : []

  const t = filas[0]
  if (!t) return null

  // El tomador: la tarificación no siempre lo trae (las de la web nacen sin
  // cliente), y entonces se saca de la póliza. Sin ninguno de los dos no hay
  // presupuesto: `cliente_id` es NOT NULL porque un presupuesto es DE alguien.
  let clienteId = t.cliente_id
  if (!clienteId && t.poliza_id) {
    const p = await db.poliza.findFirst({
      where: { id: t.poliza_id, correduriaId },
      select: { clienteId: true },
    })
    clienteId = p?.clienteId ?? null
  }
  if (!clienteId) return null

  return {
    id: t.id,
    clienteId,
    polizaId: t.poliza_id,
    ramo: t.ramo,
    simulado: t.simulado,
    fechaEfecto: fechaEfectoDe(t.peticion),
  }
}

type FilaCabecera = {
  id: string
  cliente_id: string | null
  poliza_id: string | null
  ramo: string
  simulado: boolean
  peticion: unknown
}

/**
 * Qué se sabe de la cobertura que el cliente tiene HOY.
 *
 * Hoy solo se distingue «la compañía no manda el desglose» de «lo manda y no
 * sabemos clasificarlo»: traducir las coberturas EIAC a un nivel es la tabla de
 * garantías del PR 2. Devolver `sin_clasificar` en vez de `sin_desglose` es lo
 * que impide echarle la culpa a la compañía de un hueco que es nuestro.
 */
async function leerNivelActual(
  correduriaId: string,
  polizaId: string | null,
  claveNivelActual: string | null,
): Promise<LecturaActual> {
  if (claveNivelActual !== null) return 'clasificada'
  if (polizaId === null) return 'sin_desglose'
  try {
    const n = await prismaAsegura().polizaCobertura.count({ where: { correduriaId, polizaId } })
    return n > 0 ? 'sin_clasificar' : 'sin_desglose'
  } catch (e) {
    registrarErrorCartera('presupuesto/leerNivelActual', e)
    // Un fallo de lectura NO se convierte en «la compañía no lo manda».
    return 'sin_clasificar'
  }
}

export function fechaEfectoDe(peticion: unknown): Date | null {
  if (!peticion || typeof peticion !== 'object') return null
  const v = (peticion as Record<string, unknown>).effectiveDate
  if (typeof v !== 'string' || v.trim() === '') return null
  const t = Date.parse(v)
  return Number.isFinite(t) ? new Date(t) : null
}

/** Prisma devuelve `numeric` como string. Se convierte en UN solo sitio. */
function numero(v: string | number | null | { toString(): string }): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : Number(v.toString())
  return Number.isFinite(n) ? n : null
}

// ─── Leer y retirar ──────────────────────────────────────────────────────────

export type PresupuestoEnLista = {
  id: string
  estado: EstadoPresupuesto
  clienteId: string
  polizaId: string | null
  ramo: string
  creadoAt: Date
  venceEl: Date
  /** 🚨 `enlazado` NO es `enviado`: se abrió WhatsApp, no consta que saliera. */
  enlaceGeneradoAt: Date | null
  enviadoAt: Date | null
  /** `null` = NO CONSTA que lo haya abierto. No es «no lo ha abierto». */
  vistoAt: Date | null
  elegidoAt: Date | null
  aceptadoAt: Date | null
  emitidoAt: Date | null
  retiradoAt: Date | null
  retiradoMotivo: string | null
  /** Exigencias y necesidades escritas por el corredor. `null` = aún no constan (y no se avisa). */
  necesidades: string | null
  opciones: number
  desdeEur: number | null
}

/**
 * Los presupuestos de un cliente o de una póliza.
 *
 * `null` = **no se ha podido leer**, nunca `[]`. Un fallo de consulta pintado
 * como lista vacía diría «no le has preparado ninguno» sobre una cartera que
 * sí los tiene, que es la regla raíz del repo en su forma más barata de
 * incumplir.
 */
export async function listarPresupuestos(
  correduriaId: string,
  filtro: { clienteId?: string | null; polizaId?: string | null },
  hoy: Date = new Date(),
): Promise<PresupuestoEnLista[] | null> {
  try {
    const filas = await prismaAsegura().presupuesto.findMany({
      where: {
        correduriaId,
        ...(filtro.clienteId ? { clienteId: filtro.clienteId } : {}),
        ...(filtro.polizaId ? { polizaId: filtro.polizaId } : {}),
      },
      orderBy: { creadoAt: 'desc' },
      take: 50,
      include: { opciones: { select: { primaEur: true } } },
    })
    return filas.map((p) => ({
      id: p.id,
      estado: estadoPresupuesto(p, hoy),
      clienteId: p.clienteId,
      polizaId: p.polizaId,
      ramo: p.ramo,
      creadoAt: p.creadoAt,
      venceEl: p.venceEl,
      enlaceGeneradoAt: p.enlaceGeneradoAt,
      enviadoAt: p.enviadoAt,
      vistoAt: p.vistoAt,
      elegidoAt: p.elegidoAt,
      aceptadoAt: p.aceptadoAt,
      emitidoAt: p.emitidoAt,
      retiradoAt: p.retiradoAt,
      retiradoMotivo: p.retiradoMotivo,
      necesidades: p.necesidades,
      opciones: p.opciones.length,
      desdeEur: masBarataDeLaLista(p.opciones),
    }))
  } catch (e) {
    registrarErrorCartera('presupuesto/listar', e)
    return null
  }
}

/** La prima más baja de las congeladas. `null` si no hay ninguna legible. */
function masBarataDeLaLista(opciones: { primaEur: unknown }[]): number | null {
  let mejor: number | null = null
  for (const o of opciones) {
    const n = numero(o.primaEur as never)
    if (n === null) continue
    if (mejor === null || n < mejor) mejor = n
  }
  return mejor
}

export type ResultadoNecesidades =
  | { estado: 'ok' }
  | { estado: 'error'; motivo: 'no_encontrado' | 'cerrado' | 'invalida'; detalle: string }

/**
 * Anota (o corrige) las exigencias y necesidades del cliente. Solo mientras no esté aceptado ni
 * retirado: lo que el cliente firmó cita el texto de ese momento y no se reescribe después.
 */
export async function guardarNecesidades(
  correduriaId: string,
  entrada: { id: string; texto: unknown; actor: string },
): Promise<ResultadoNecesidades> {
  const v = validarNecesidades(entrada.texto)
  if (!v.ok) return { estado: 'error', motivo: 'invalida', detalle: v.motivo }
  const db = prismaAsegura()
  const fila = await db.presupuesto.findFirst({ where: { id: entrada.id, correduriaId }, select: { id: true, necesidades: true } })
  if (!fila) return { estado: 'error', motivo: 'no_encontrado', detalle: 'Ese presupuesto no existe en esta correduría.' }
  const n = await db.presupuesto.updateMany({
    where: { id: fila.id, correduriaId, aceptadoAt: null, retiradoAt: null },
    data: { necesidades: v.valor, necesidadesAt: new Date() },
  })
  if (n.count === 0) return { estado: 'error', motivo: 'cerrado', detalle: 'Ya está aceptado o retirado: lo que se firmó no se reescribe.' }
  await db.presupuestoEvento.create({
    data: { presupuestoId: fila.id, tipo: 'necesidades', origen: 'corredor', detalle: { actor: entrada.actor, antes: fila.necesidades === null ? 'vacío' : 'escrito' } },
  })
  anotarCambio({ entidad: 'presupuesto', id: fila.id, campo: 'necesidades', antes: fila.necesidades, despues: v.valor })
  return { estado: 'ok' }
}

export type ResultadoRetirar =
  | { estado: 'ok' }
  | { estado: 'error'; motivo: 'no_encontrado' | 'ya_retirado' | 'sin_motivo'; detalle: string }

/**
 * Retira un presupuesto. **Exige motivo**, igual que la BD (`retirado_con_motivo`):
 * una fila retirada sin decir por qué no explica nada el día que el cliente
 * pregunte por qué su enlace ya no abre.
 *
 * No borra: deja la lápida con su motivo y su evento. Lo que se le enseñó a
 * alguien no se hace desaparecer — es justo el rastro que hay que conservar.
 */
export async function retirarPresupuesto(
  correduriaId: string,
  entrada: { id: string; motivo: string; actor: string },
): Promise<ResultadoRetirar> {
  const motivo = entrada.motivo.trim()
  if (motivo === '') {
    return { estado: 'error', motivo: 'sin_motivo', detalle: 'Retirar un presupuesto exige decir por qué.' }
  }

  const db = prismaAsegura()
  const fila = await db.presupuesto.findFirst({
    where: { id: entrada.id, correduriaId },
    select: { id: true, retiradoAt: true },
  })
  if (!fila) {
    return { estado: 'error', motivo: 'no_encontrado', detalle: 'Ese presupuesto no existe en esta correduría.' }
  }
  if (fila.retiradoAt !== null) {
    return { estado: 'error', motivo: 'ya_retirado', detalle: 'Ese presupuesto ya estaba retirado.' }
  }

  // Si el cliente ya lo había aceptado firmando la anulación de su póliza vieja, esa anulación esperaba
  // a la emisión, que ya no llegará: se desiste en el mismo paso. Si no, quedaría `firmada` para
  // siempre, bloqueando otro expediente de esa póliza y pidiendo un «márcalo emitido» imposible.
  const desistidas = await db.$transaction(async (tx) => {
    await tx.presupuesto.update({
      where: { id: fila.id },
      data: {
        retiradoAt: new Date(),
        retiradoMotivo: motivo,
        eventos: { create: [{ tipo: 'retirado', origen: 'corredor', detalle: { actor: entrada.actor, motivo } }] },
      },
    })
    return tx.$queryRaw<{ id: string }[]>`
      update anulacion set estado = 'desistida', desistida_at = now(), updated_at = now()
      where presupuesto_id = ${fila.id}::uuid and correduria_id = ${correduriaId}::uuid and estado in ('solicitada', 'firmada')
      returning id::text as id`
  })
  for (const a of desistidas) anotarCambio({ entidad: 'anulacion', id: a.id, campo: 'estado', antes: 'firmada', despues: 'desistida' })
  return { estado: 'ok' }
}
