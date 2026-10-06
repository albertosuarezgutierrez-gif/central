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
  deducirNecesidades,
  elegirPortada,
  estadoPresupuesto,
  nivelCobertura,
  textoNecesidades,
  validarNecesidades,
  type EstadoPresupuesto,
  type PapelPortada,
  type PrecioComparable,
  type SinEquivalente,
} from '@central/module-seguros'
import { generarTokenVista, hashTokenVista } from '@central/module-seguros-portal'

import type { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'
import { anotarCambio } from './auditoria'
import { registrarErrorCartera } from './error-cartera'
import { resolverConfig, simulacionActiva } from './codeoscopic/config'
import { peticion } from './codeoscopic/cliente'
import { refrescarProyecto } from './codeoscopic/emitir'
import { leerCoberturasDeOpciones, sobreReutilizable, type SobreCoberturas } from './codeoscopic/coberturas-presupuesto'
import { completarCoberturasTarificacion } from './codeoscopic/coberturas-tarificacion'
import { OCULTAR_VACIO, estaOculta, ordenResto, type Ocultar } from './presupuesto-ocultar'
import { conjuntoEnDocumento, elegirReutilizable } from '@central/module-seguros/referencia-presupuesto'
import { opcionesReutilizadas } from './presupuesto-reutilizado'
import { compararOfertas, type ResultadoComparacion } from '@central/module-seguros'
import { ofertaNormalizadaDeFila } from './documentos/oferta-leida'
import { generarNarrativa, type Narrativa } from './estudio-ia'
import { AVISO_OPCION_OFERTA, caducidadOfertas, opcionesDeOfertas, seleccionarParaConsolidar } from './ofertas-reglas'
import { leerOportunidadParaOfertas, ofertasDeOportunidad } from './oportunidad-ofertas'

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
  /** La fila de `tarificacion_precios` de la que sale (para ocultarla desde la parrilla). */
  precioId: string
  /** Garantías clasificadas tras tarificar. `null` = no se clasificaron (el filtro dirá «no consta»). */
  garantias: unknown
  /** El corredor la quitó: se congela, pero el cliente no la ve. Nunca es portada. */
  oculta: boolean
  /** La más barata NO comparte cobertura con la actual. Se pinta. */
  coberturaDistinta: boolean
  /** Coberturas de la oferta leídas de Codeoscopic. `null` = NO SE INTENTÓ (simulada, sin
   *  proyecto o vendor apagado); el sobre dice si se leyeron, vinieron vacías o fallaron. */
  coberturas: SobreCoberturas | null
}

export type PresupuestoPreparado = {
  id: string
  /** Referencia propia `AS-AA-NNNN` (la pone la BD). `null` = la BD aún no la tiene (migración sin aplicar). */
  referencia: string | null
  /** `true` = ya había uno vigente con EXACTAMENTE las mismas opciones en documento: es ése, no otro. */
  reutilizado: boolean
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
  /** Las RECOMENDADAS (portada). El resto se congela también, pero no viaja aquí: son decenas. */
  opciones: OpcionPreparada[]
  /** Cuántos precios trajo la tarificación, para poder decir «3 de 12». */
  preciosTotales: number
  /** Cuántas opciones MÁS ve el cliente debajo de las recomendadas («ver todas»). */
  enLista: number
  /** Cuántas quitó el corredor (congeladas y ocultas). */
  ocultas: number
}

export type ResultadoPreparar =
  /** `token` = `null` al REUTILIZAR: el del enlace ya existente no se guarda en claro y rotarlo
   *  rompería un enlace que el cliente quizá ya tiene. El aviso genera uno nuevo cuando toca. */
  | { estado: 'ok'; presupuesto: PresupuestoPreparado; token: string | null }
  | {
      estado: 'error'
      motivo:
        | 'sin_tarificacion'
        | 'sin_precios'
        | 'no_encontrado'
        | 'ramo_no_soportado'
        | 'todas_ocultas'
        | 'datos_incorrectos'
      detalle: string
    }

/** Los ramos con los que hoy se puede montar una comparativa de verdad. */
const RAMOS_CON_COMPARATIVA = new Set(['auto', 'moto', 'hogar', 'decesos', 'salud', 'vida'])

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
    /** Lo que el corredor quita antes de preparar (compañías enteras o precios sueltos). */
    ocultar?: Ocultar
    actor: string
  },
): Promise<ResultadoPreparar> {
  const ocultar = entrada.ocultar ?? OCULTAR_VACIO
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

  // Si el cliente ya dijo en el portal que un dato de ESTA tarificación está mal, sus precios no
  // valen: se retarifica con el dato bueno, no se le vuelve a mandar lo mismo (28/09/2026).
  // El tipo va en literal a propósito: importar TIPO_DATOS_INCORRECTOS arrastra presupuesto-aceptacion
  // (y con él Prisma) a los tests que cargan este módulo. El test comprueba que coinciden.
  const [marcada] = await db.$queryRaw<{ n: number }[]>`
    select count(*)::int as n from presupuesto_evento e
    join presupuesto p on p.id = e.presupuesto_id
    where p.tarificacion_id = ${cab.id}::uuid and p.correduria_id = ${correduriaId}::uuid
      and e.tipo = 'datos_incorrectos'`
  if ((marcada?.n ?? 0) > 0) {
    return {
      estado: 'error',
      motivo: 'datos_incorrectos',
      detalle:
        'El cliente avisó desde el portal de que un dato de esta tarificación no es correcto: ' +
        'pide precio otra vez con el dato bueno y prepara el presupuesto sobre esa tarificación nueva.',
    }
  }

  if (!RAMOS_CON_COMPARATIVA.has(cab.ramo)) {
    return {
      estado: 'error',
      motivo: 'ramo_no_soportado',
      detalle: `Todavía no se compara el ramo «${cab.ramo}»: sin niveles de cobertura no hay comparativa que enseñar.`,
    }
  }

  // Red de seguridad (29/09/2026): las coberturas de cada precio se leen tras tarificar, en
  // `after()`. Si aquella pasada no llegó (se cortó, o la tarificación es anterior), se completa
  // AQUÍ, antes de leer los precios, con parte del presupuesto de tiempo de las coberturas. Nunca
  // lanza; lo que no dé tiempo sigue por el camino de siempre más abajo.
  const inicioCoberturas = Date.now()
  await completarCoberturasTarificacion(
    { correduriaId, tarificacionId: cab.id },
    { topeMs: TOPE_RED_SEGURIDAD_MS },
  )

  const filas = await db.$queryRaw<
    {
      id: string
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
      coberturas: unknown
      garantias: unknown
    }[]
  >`
    select id::text as id, compania, producto, modalidad, categoria, prima_eur, entrada_eur, franquicia_eur,
           firmeza, requiere_rerate, referencia_vendor, avisos, coberturas, garantias
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

  // 🚨 Lo oculto NO entra en la comparativa: si entrara, la portada podría recomendar justo lo que
  // el corredor ha quitado. `visibles[k]` es el índice en `filas` de la fila k de la comparativa.
  const oculta = filas.map((f) => estaOculta(f, ocultar))
  const visibles = filas.map((_, i) => i).filter((i) => !oculta[i])
  if (visibles.length === 0) {
    return {
      estado: 'error',
      motivo: 'todas_ocultas',
      detalle: 'Has ocultado todas las opciones: no queda nada que enseñarle al cliente.',
    }
  }

  // El orden de este array ES la clave estable: `FilaPrecio.indice` apunta aquí (y `visibles` a `filas`).
  const comparables: PrecioComparable[] = visibles.map((i) => filas[i]).map((f) => ({
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

  // Desde el 29/09/2026 se congelan TODAS (antes solo la portada: la moto de Manuel trajo 31 precios
  // y el cliente vio 2). Portada primero —`papeles <> '{}'`—, después el resto de la más barata a la
  // más cara, y al final lo oculto, que se guarda para poder reconstruir también lo que NO se enseñó.
  const aCongelar: OpcionPreparada[] = []
  let orden = 0
  const congelar = (i: number, papeles: PapelPortada[], coberturaDistinta: boolean, grupo: string | null) => {
    const cruda = filas[i]
    const prima = numero(cruda?.prima_eur ?? null)
    // Una opción sin prima no es una opción: no se le enseña a nadie una
    // tarjeta con el precio en blanco, y `prima_eur` es NOT NULL en la tabla.
    if (!cruda || prima === null) return
    orden += 1
    aCongelar.push({
      orden,
      compania: cruda.compania ?? 'Sin compañía',
      producto: cruda.producto ?? 'Sin producto',
      modalidad: cruda.modalidad,
      categoria: cruda.categoria,
      grupoCobertura: grupo,
      primaEur: prima,
      entradaEur: numero(cruda.entrada_eur),
      franquiciaEur: numero(cruda.franquicia_eur),
      firmeza: cruda.firmeza ?? 'estimado',
      requiereRerate: cruda.requiere_rerate ?? true,
      referenciaVendor: cruda.referencia_vendor,
      avisos: Array.isArray(cruda.avisos) ? cruda.avisos.filter((a): a is string => typeof a === 'string') : [],
      papeles,
      precioId: cruda.id,
      garantias: cruda.garantias ?? null,
      oculta: oculta[i],
      coberturaDistinta,
      // Las ya leídas tras tarificar se reutilizan tal cual (`null` = hay que pedirlas).
      coberturas: sobreReutilizable(cruda.coberturas),
    })
  }
  const enPortada = new Set<number>()
  for (const o of portada.opciones) {
    const i = visibles[o.fila.indice]
    if (i === undefined) continue
    enPortada.add(i)
    congelar(i, o.papeles, o.coberturaDistinta, o.fila.nivel.reconocido ? o.fila.nivel.clave : null)
  }
  const nPortada = aCongelar.length
  const resto = ordenResto(
    filas.map((f, i) => ({ compania: f.compania, prima: numero(f.prima_eur), oculta: oculta[i] })),
    enPortada,
  )
  for (const i of resto) {
    const nivel = nivelCobertura(filas[i].categoria, cab.ramo)
    congelar(i, [], false, nivel.reconocido ? nivel.clave : null)
  }

  if (nPortada === 0) {
    return {
      estado: 'error',
      motivo: 'sin_precios',
      detalle:
        'Ninguna de las opciones trae prima, así que no hay nada que poner en una tarjeta. ' +
        'El precio está en blanco en la cotización guardada.',
    }
  }

  // 🔁 ¿Ya hay uno vigente con EXACTAMENTE lo mismo en documento? Entonces es ése (misma
  // referencia): preparar dos veces lo mismo no crea dos presupuestos (caso Antonio Cruz, 29 y
  // 30/09/2026). Se mira aquí, antes de leer coberturas, y otra vez bajo cerrojo al insertar.
  const enDocumento = conjuntoEnDocumento(aCongelar.map((o) => ({ precioId: o.precioId, oculta: o.oculta })))
  const nOcultasPrevio = aCongelar.filter((o) => o.oculta).length
  // 🔁 Al REUTILIZAR, lo que se devuelve es lo que ESE presupuesto congeló (portada, papeles, lista y
  // ocultas), leído de la BD: recalcularlo podría no coincidir con el documento que ya tiene el cliente.
  const respuestaReutilizada = async (previo: { id: string; referencia: string | null; venceEl: Date; creadoAt: Date; sellos: Parameters<typeof estadoPresupuesto>[0] }): Promise<ResultadoPreparar> => {
    const guardadas = await db.presupuestoOpcion.findMany({
      // oculta-exenta: se leen también las ocultas para CONTARLAS; la portada solo toma `ocultaAt === null`.
      where: { presupuestoId: previo.id },
      orderBy: { orden: 'asc' },
    })
    const leidas = opcionesReutilizadas(guardadas)
    return {
      estado: 'ok',
      token: null,
      presupuesto: {
        id: previo.id,
        referencia: previo.referencia,
        reutilizado: true,
        estado: estadoPresupuesto(previo.sellos, new Date()),
        clienteId: cab.clienteId,
        polizaId: cab.polizaId,
        ramo: cab.ramo,
        tarificacionId: cab.id,
        venceEl: previo.venceEl,
        fuenteVencimiento: 'guardado',
        creadoAt: previo.creadoAt,
        simulado: cab.simulado,
        lecturaActual,
        motivoSinEquivalente: portada.motivoSinEquivalente,
        avisoEscala: portada.avisoEscala,
        opciones: leidas.opciones,
        preciosTotales: filas.length,
        enLista: leidas.enLista,
        ocultas: leidas.ocultas,
      },
    }
  }
  const previo = await buscarReutilizable(db, correduriaId, cab.id, enDocumento)
  if (previo) {
    await anotarReutilizado(db, previo.id, entrada.actor)
    return respuestaReutilizada(previo)
  }

  const creadoAt = new Date()
  const { venceEl, fuente } = calcularVencimiento({
    creadoAt,
    fechaEfecto: cab.fechaEfecto,
    // `expirationDate` solo llega tras el ReRate y hoy no se guarda: no se
    // inventa una caducidad del vendor que nadie ha leído.
    expiraOferta: null,
  })

  // Las coberturas de cada opción (fase 2): GRATIS y best-effort. Si fallan, el presupuesto sale
  // igual y el sobre de cada opción dice «no se han podido leer» — nunca un `[]` mudo.
  // Solo se piden las que no venían ya leídas de la tarificación (filas sin `oferta_id`, o cuya
  // lectura falló), con lo que quede del presupuesto de tiempo.
  // Solo las de PORTADA: el resto las trae la pasada de después de tarificar, y pedir 30 aquí haría
  // esperar a Alberto en pantalla por opciones que el cliente quizá ni despliega.
  const faltan = aCongelar.slice(0, nPortada).filter((o) => o.coberturas === null)
  if (faltan.length > 0) {
    const restanteMs = Math.max(0, PRESUPUESTO_COBERTURAS_MS - (Date.now() - inicioCoberturas))
    const sobres = await coberturasDeLasOpciones(cab, faltan, restanteMs)
    faltan.forEach((o, i) => { o.coberturas = sobres?.[i] ?? null })
  }

  const nOcultas = nOcultasPrevio
  const token = generarTokenVista()
  const tokenHash = await hashTokenVista(token)

  // Bajo cerrojo por tarificación: dos «Preparar» a la vez con lo mismo no crean dos presupuestos.
  const hecho = await db.$transaction(async (tx) => {
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${`presupuesto:${correduriaId}:${cab.id}`}))`
    const otro = await buscarReutilizable(tx, correduriaId, cab.id, enDocumento)
    if (otro) return { tipo: 'otro' as const, otro }
    const creado = await tx.presupuesto.create({
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
            precioId: o.precioId,
            ...(o.garantias !== null ? { garantias: o.garantias as object } : {}),
            ocultaAt: o.oculta ? creadoAt : null,
            // Sin intento se deja el default (`[]` desnudo = «no se intentó»); con intento, el SOBRE.
            ...(o.coberturas ? { coberturas: o.coberturas } : {}),
          })),
        },
        eventos: {
          // Lo ocultado queda en el evento (trazabilidad IDD): qué se decidió no enseñar y cuánto.
          create: [{
            tipo: 'preparado',
            origen: 'corredor',
            detalle: {
              actor: entrada.actor,
              ...(nOcultas > 0 ? { ocultas: { n: nOcultas, companias: ocultar.companias, precios: ocultar.precios } } : {}),
            },
          }],
        },
      },
      select: { id: true, referencia: true },
    })
    return { tipo: 'creado' as const, creado }
    // El tope por defecto de Prisma (5 s) se queda corto con 30+ opciones y la espera del cerrojo.
  }, { timeout: 20_000, maxWait: 10_000 })
  if (hecho.tipo === 'otro') {
    await anotarReutilizado(db, hecho.otro.id, entrada.actor)
    return respuestaReutilizada(hecho.otro)
  }
  const creado = hecho.creado

  // El cuestionario IDD sale ya contestado con lo que se deduce de lo presupuestado (29/09/2026).
  await autocompletarNecesidades(correduriaId, creado.id, entrada.actor)

  return {
    estado: 'ok',
    // 🔑 El token en claro se devuelve UNA vez y no se guarda: en la BD solo
    // vive su hash. Si se pierde, se retira el borrador y se prepara otro.
    token,
    presupuesto: {
      id: creado.id,
      referencia: creado.referencia,
      reutilizado: false,
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
      opciones: aCongelar.slice(0, nPortada),
      preciosTotales: filas.length,
      enLista: aCongelar.length - nPortada - nOcultas,
      ocultas: nOcultas,
    },
  }
}

type Db = ReturnType<typeof prismaAsegura>
type Tx = Parameters<Parameters<Db['$transaction']>[0]>[0]

/**
 * El presupuesto ya preparado sobre ESTA tarificación que se reutiliza (ni retirado ni emitido,
 * vigente y con el mismo conjunto de opciones en documento = `oculta_at IS NULL`). `null` = no hay.
 * La decisión es PURA (`elegirReutilizable` de @central/module-seguros, con test).
 */
async function buscarReutilizable(db: Db | Tx, correduriaId: string, tarificacionId: string, enDocumento: string[] | null) {
  if (enDocumento === null) return null
  // 🚨 Desde que `tarificacion_id` admite NULL (presupuestos de ofertas, 05/10/2026), un `where` con
  // un id vacío casaría con TODOS los de ofertas. Sin tarificación no hay nada que reutilizar.
  if (!tarificacionId) return null
  // oculta-exenta: se leen también las ocultas para saber EXACTAMENTE qué quedó fuera del documento.
  const candidatos = await db.presupuesto.findMany({
    where: { correduriaId, origen: 'codeoscopic', tarificacionId, retiradoAt: null, emitidoAt: null, venceEl: { gte: new Date() } },
    orderBy: { creadoAt: 'desc' },
    take: 20,
    include: { opciones: { select: { precioId: true, ocultaAt: true } } },
  })
  const elegido = elegirReutilizable(
    candidatos.map((c) => ({ ...c, opciones: c.opciones.map((o) => ({ precioId: o.precioId, oculta: o.ocultaAt !== null })) })),
    enDocumento,
    new Date(),
  )
  if (!elegido) return null
  return { id: elegido.id, referencia: elegido.referencia, venceEl: elegido.venceEl, creadoAt: elegido.creadoAt, sellos: elegido }
}

/** Deja rastro de que se volvió a preparar lo mismo (append-only). */
async function anotarReutilizado(db: Db, presupuestoId: string, actor: string): Promise<void> {
  await db.presupuestoEvento
    .create({ data: { presupuestoId, tipo: 'preparado_reutilizado', origen: 'corredor', detalle: { actor } } })
    .catch((e: unknown) => registrarErrorCartera('presupuesto/reutilizado', e))
}

type Cabecera = {
  id: string
  clienteId: string
  polizaId: string | null
  ramo: string
  simulado: boolean
  fechaEfecto: Date | null
  projectId: string | null
}

/** Tope de tiempo TOTAL para leer las coberturas: Alberto está esperando en pantalla. */
const PRESUPUESTO_COBERTURAS_MS = 8_000
/** De ese tope, lo que puede gastar la red de seguridad de `completarCoberturasTarificacion`. */
const TOPE_RED_SEGURIDAD_MS = 5_000

/**
 * Las coberturas de las opciones congeladas, leídas de Codeoscopic. `null` = no se intenta:
 * tarificación simulada (su proyecto no existe en el vendor), sin `project_id`, modo simulación o
 * sin credenciales. Son LECTURAS gratis (`GET`), por eso no exigen el interruptor de tarificar —
 * el mismo criterio que la sonda del token (`ignorarInterruptor`).
 */
async function coberturasDeLasOpciones(cab: Cabecera, opciones: OpcionPreparada[], presupuestoMs: number): Promise<SobreCoberturas[] | null> {
  if (cab.simulado || !cab.projectId || simulacionActiva(process.env)) return null
  const r = resolverConfig(process.env, { ignorarInterruptor: true })
  if (r.estado !== 'lista') return null
  const config = r.config
  const projectId = cab.projectId
  try {
    return await leerCoberturasDeOpciones(
      opciones,
      {
        refrescar: () => refrescarProyecto(config, projectId),
        coberturas: (ofertaId) =>
          peticion(config, {
            metodo: 'GET',
            path: `/insurances/${encodeURIComponent(projectId)}/offers/${encodeURIComponent(ofertaId)}/coverages`,
            timeoutMs: config.timeoutGenericoMs,
          }),
      },
      presupuestoMs,
    )
  } catch (e) {
    // `leerCoberturasDeOpciones` no lanza; esto es el cinturón. Sin sobre = «no se intentó».
    registrarErrorCartera('presupuesto/coberturas', e)
    return null
  }
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
               ramo, simulado, peticion, project_id_codeoscopic::text as project_id
        from tarificaciones
        where correduria_id = ${correduriaId}::uuid and id = ${e.tarificacionId}::uuid
        limit 1
      `
    : e.polizaId
      ? await db.$queryRaw<FilaCabecera[]>`
          select id::text as id, cliente_id::text as cliente_id, poliza_id::text as poliza_id,
                 ramo, simulado, peticion, project_id_codeoscopic::text as project_id
          from tarificaciones
          where correduria_id = ${correduriaId}::uuid and poliza_id = ${e.polizaId}::uuid
            -- Solo Avant2: una tarificación del bot RPA (#4310) no puede colgar un presupuesto.
            and coalesce(to_jsonb(tarificaciones) ->> 'canal', 'codeoscopic') = 'codeoscopic'
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
    projectId: t.project_id,
  }
}

type FilaCabecera = {
  id: string
  cliente_id: string | null
  poliza_id: string | null
  ramo: string
  simulado: boolean
  peticion: unknown
  project_id: string | null
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
  /** `codeoscopic` | `ofertas` (PDFs de compañías: se emite en la compañía, no por Avant2). */
  origen: string
  /** Referencia propia `AS-AA-NNNN`. `null` = la BD aún no la tiene. */
  referencia: string | null
  /** Primer PDF descargado. NO es «enviado». `null` = no consta. */
  documentoDescargadoAt: Date | null
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
  /** Las opciones VISIBLES, para que el corredor revise qué cubre cada una antes de enviar. */
  detalle: OpcionEnLista[]
}

/** Una opción visible del presupuesto. `garantias` = `porClave` guardado; `null` = no se clasificó (≠ «no cubre»). */
export type OpcionEnLista = {
  id: string
  compania: string
  modalidad: string | null
  primaEur: number | null
  garantias: Record<string, string> | null
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
      include: { opciones: { where: { ocultaAt: null }, orderBy: { orden: 'asc' }, select: { id: true, compania: true, modalidad: true, primaEur: true, garantias: true } } },
    })
    // Los que se prepararon antes del autorrelleno (o en los que falló): se completan al listarlos.
    for (const p of filas) {
      if (p.necesidades === null && p.aceptadoAt === null && p.retiradoAt === null) {
        p.necesidades = await autocompletarNecesidades(correduriaId, p.id, 'sistema')
      }
    }
    return filas.map((p) => ({
      id: p.id,
      origen: p.origen,
      referencia: p.referencia ?? null,
      documentoDescargadoAt: p.documentoDescargadoAt ?? null,
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
      detalle: p.opciones.map((o) => ({
        id: o.id,
        compania: o.compania,
        modalidad: o.modalidad,
        primaEur: numero(o.primaEur as never),
        garantias: porClaveDe(o.garantias),
      })),
    }))
  } catch (e) {
    registrarErrorCartera('presupuesto/listar', e)
    return null
  }
}

/** El `porClave` de `presupuesto_opcion.garantias`, o `null` si no tiene la forma esperada. */
function porClaveDe(v: unknown): Record<string, string> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const pc = (v as Record<string, unknown>).porClave
  if (!pc || typeof pc !== 'object' || Array.isArray(pc)) return null
  const r: Record<string, string> = {}
  for (const [k, e] of Object.entries(pc as Record<string, unknown>)) if (e === 'si' || e === 'no' || e === 'no_consta') r[k] = e
  return r
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

/**
 * Las respuestas del cuestionario IDD, solo para la auditoría del evento: claves y valores
 * cortos de texto (son ids de opción, nunca texto libre del cliente). Lo que no cuadra no se guarda.
 */
export function respuestasAuditables(v: unknown): { respuestas?: Record<string, string> } {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  const out: Record<string, string> = {}
  for (const [k, x] of Object.entries(v as Record<string, unknown>).slice(0, 20)) {
    if (/^[a-z_]{1,30}$/.test(k) && typeof x === 'string' && /^[a-z_]{1,30}$/.test(x)) out[k] = x
  }
  return Object.keys(out).length ? { respuestas: out } : {}
}

/**
 * Rellena y GUARDA el cuestionario de exigencias y necesidades de un presupuesto que aún no lo
 * tiene, deducido de la petición que viajó a la compañía y de la opción recomendada (la primera
 * visible). Dictado de Alberto (29/09/2026): «que se autorrellene y se guarde, eso no me puede
 * salir». Solo si está vacío y no aceptado ni retirado: nunca pisa lo que escribió el corredor ni
 * lo que el cliente firmó. Best-effort: si falla, el presupuesto sigue y el cuestionario queda a
 * mano, como antes. Devuelve el texto guardado o `null`.
 */
export async function autocompletarNecesidades(correduriaId: string, presupuestoId: string, actor: string): Promise<string | null> {
  try {
    const db = prismaAsegura()
    const [fila] = await db.$queryRaw<{ ramo: string | null; peticion: unknown; categoria: string | null; franquicia_eur: string | number | null }[]>`
      select p.ramo, t.peticion, o.categoria, o.franquicia_eur
      from presupuesto p
      left join tarificaciones t on t.id = p.tarificacion_id and t.correduria_id = p.correduria_id
      left join lateral (
        select categoria, franquicia_eur from presupuesto_opcion
        where presupuesto_id = p.id and oculta_at is null order by orden asc limit 1
      ) o on true
      where p.id = ${presupuestoId}::uuid and p.correduria_id = ${correduriaId}::uuid
        and p.necesidades is null and p.aceptado_at is null and p.retirado_at is null`
    if (!fila) return null
    const d = deducirNecesidades(fila.ramo, fila.peticion, { categoria: fila.categoria, franquiciaEur: numero(fila.franquicia_eur) })
    const v = validarNecesidades(textoNecesidades(fila.ramo, d.respuestas, d.otras))
    if (!v.ok) return null
    const n = await db.presupuesto.updateMany({
      where: { id: presupuestoId, correduriaId, necesidades: null, aceptadoAt: null, retiradoAt: null },
      data: { necesidades: v.valor, necesidadesAt: new Date() },
    })
    if (n.count === 0) return null
    await db.presupuestoEvento.create({
      data: { presupuestoId, tipo: 'necesidades', origen: 'corredor', detalle: { actor, antes: 'vacío', deducido: true, ...respuestasAuditables(d.respuestas) } },
    })
    return v.valor
  } catch (e) {
    registrarErrorCartera('presupuesto/necesidades-auto', e)
    return null
  }
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
  entrada: { id: string; texto: unknown; actor: string; respuestas?: unknown },
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
    data: { presupuestoId: fila.id, tipo: 'necesidades', origen: 'corredor', detalle: { actor: entrada.actor, antes: fila.necesidades === null ? 'vacío' : 'escrito', ...respuestasAuditables(entrada.respuestas) } },
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

export type ResultadoOcultarOpcion =
  | { estado: 'ok'; oculta: boolean }
  | { estado: 'error'; motivo: 'no_encontrado' | 'ya_enviado' | 'es_portada'; detalle: string }

/**
 * Oculta (o vuelve a mostrar) UNA opción de un presupuesto en borrador. Solo antes de avisar al
 * cliente: después, lo que vio es lo que vio, y quitárselo por debajo cambiaría lo que puede firmar.
 * Una recomendada (portada) no se oculta: para eso se prepara otro presupuesto sin ella.
 */
export async function ocultarOpcion(
  correduriaId: string,
  entrada: { id: string; opcionId: string; ocultar: boolean; actor: string },
): Promise<ResultadoOcultarOpcion> {
  const db = prismaAsegura()
  const p = await db.presupuesto.findFirst({
    where: { id: entrada.id, correduriaId },
    select: { id: true, retiradoAt: true, enviadoAt: true, enlaceGeneradoAt: true },
  })
  // oculta-exenta: se busca justo para ocultarla o mostrarla, así que tiene que verla en los dos estados.
  const o = p ? await db.presupuestoOpcion.findFirst({
    where: { id: entrada.opcionId, presupuestoId: p.id },
    select: { id: true, papeles: true, ocultaAt: true },
  }) : null
  if (!p || !o) return { estado: 'error', motivo: 'no_encontrado', detalle: 'Esa opción no existe en ese presupuesto.' }
  if (p.retiradoAt !== null || p.enviadoAt !== null || p.enlaceGeneradoAt !== null) {
    return {
      estado: 'error',
      motivo: 'ya_enviado',
      detalle: 'El cliente ya tiene este presupuesto (o está retirado): no se le cambia lo que ve. Prepara otro.',
    }
  }
  if (entrada.ocultar && o.papeles.length > 0) {
    return { estado: 'error', motivo: 'es_portada', detalle: 'Es una de las recomendadas: para quitarla, prepara otro presupuesto ocultándola.' }
  }
  if ((o.ocultaAt !== null) === entrada.ocultar) return { estado: 'ok', oculta: entrada.ocultar }
  // La condición de «sin enviar» va DENTRO del UPDATE: si el aviso sale entre la lectura y aquí, no
  // se toca nada (el cliente ya tiene su lista).
  const hecho = await db.$transaction(async (tx) => {
    const r = await tx.presupuestoOpcion.updateMany({
      where: {
        id: o.id,
        presupuesto: { id: p.id, retiradoAt: null, enviadoAt: null, enlaceGeneradoAt: null },
        ...(entrada.ocultar ? { papeles: { isEmpty: true } } : {}),
      },
      data: { ocultaAt: entrada.ocultar ? new Date() : null },
    })
    if (r.count === 0) return false
    await tx.presupuestoEvento.create({
      data: {
        presupuestoId: p.id,
        tipo: entrada.ocultar ? 'opcion_oculta' : 'opcion_mostrada',
        origen: 'corredor',
        detalle: { actor: entrada.actor, opcionId: o.id },
      },
    })
    return true
  })
  if (!hecho) {
    return { estado: 'error', motivo: 'ya_enviado', detalle: 'El presupuesto acaba de salir hacia el cliente: ya no se le cambia lo que ve.' }
  }
  return { estado: 'ok', oculta: entrada.ocultar }
}


// ─── Presupuesto de OFERTAS de compañías (05/10/2026, F2) ────────────────────

export type ResultadoPrepararOfertas =
  | {
      estado: 'ok'
      /** El token en claro, UNA vez (en la BD solo vive su hash), igual que `prepararPresupuesto`. */
      token: string
      presupuesto: {
        id: string
        referencia: string | null
        origen: 'ofertas'
        oportunidadId: string
        clienteId: string
        polizaId: string | null
        ramo: string
        venceEl: Date
        fuenteVencimiento: string
        opciones: number
        recomendadaId: string | null
        narrativa: Narrativa
        /** Borradores de ofertas de esta oportunidad que se retiraron al sustituirlos (sin enviar). */
        sustituidos: number
      }
    }
  | {
      estado: 'error'
      motivo: 'no_encontrado' | 'sin_ofertas' | 'sin_revisar' | 'sin_prima' | 'no_encontrada' | 'caducada'
      detalle: string
    }

/**
 * Consolida las ofertas REVISADAS de una oportunidad en UN presupuesto de origen `ofertas` (la vía
 * nueva junto a `prepararPresupuesto`, que sigue siendo la de Avant2). Gratis y sin Codeoscopic:
 *
 *   · Exige que TODAS las ofertas que van (y la póliza actual viva, si la hay) estén REVISADAS y con
 *     prima total (`seleccionarParaConsolidar`). El trigger de la BD vuelve a exigirlo al enviar.
 *   · Una `presupuesto_opcion` por oferta (snapshot): prima total, franquicia general, coberturas con el
 *     sobre de siempre, firmeza `condicionado`, SIN ReRate, papel `recomendada` si el corredor la marcó.
 *   · `estudio` = la comparación determinista (`compararOfertas`) + la narrativa validada contra sus
 *     cifras (`generarNarrativa`; si la IA mete una cifra que no está en la matriz, va la determinista).
 *   · Un borrador ANTERIOR de ofertas de esta oportunidad que no ha salido hacia el cliente se retira
 *     (con motivo y evento): regenerar tras corregir una oferta no deja dos borradores vivos.
 */
export async function prepararPresupuestoDeOfertas(
  correduriaId: string,
  entrada: { oportunidadId: string; ofertaIds?: string[] | null; superficieM2?: number | null; actor: string },
  ahora: Date = new Date(),
): Promise<ResultadoPrepararOfertas> {
  const op = await leerOportunidadParaOfertas(correduriaId, entrada.oportunidadId)
  if (!op) return { estado: 'error', motivo: 'no_encontrado', detalle: 'Esa oportunidad no existe en esta correduría.' }
  const filas = await ofertasDeOportunidad(correduriaId, op.id)
  const sel = seleccionarParaConsolidar(filas, entrada.ofertaIds ?? null)
  if (!sel.ok) return { estado: 'error', motivo: sel.motivo, detalle: sel.detalle }

  const hoy = ahora.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
  const cad = caducidadOfertas(sel.ofertas, hoy)
  if (cad.caducadas.length > 0) {
    return { estado: 'error', motivo: 'caducada', detalle: `La oferta de ${cad.caducadas.join(', ')} ya ha caducado según la propia compañía: pide una actualizada o descártala.` }
  }

  // La póliza que se compara (y la que se anularía al aceptar otra compañía): solo si es de ESTE cliente.
  const db = prismaAsegura()
  const polizaId = op.polizaId
    ? (await db.poliza.findFirst({ where: { id: op.polizaId, correduriaId, clienteId: op.clienteId }, select: { id: true } }))?.id ?? null
    : null

  const superficie = typeof entrada.superficieM2 === 'number' && Number.isFinite(entrada.superficieM2) && entrada.superficieM2 > 0
    ? entrada.superficieM2
    : op.superficieM2
  const comparacion: ResultadoComparacion = compararOfertas({
    ramo: op.ramoOferta,
    ofertas: [...(sel.actual ? [sel.actual] : []), ...sel.ofertas].map(ofertaNormalizadaDeFila),
    superficieM2: superficie,
  })
  const recomendadaId = sel.recomendada?.id ?? null
  const narrativa = await generarNarrativa(comparacion, recomendadaId)
  const opciones = opcionesDeOfertas(op.ramoOferta, sel.ofertas, ahora)
  const { venceEl, fuente } = calcularVencimiento({ creadoAt: ahora, fechaEfecto: null, expiraOferta: cad.expira })

  const token = generarTokenVista()
  const tokenHash = await hashTokenVista(token)
  const estudio = {
    version: 1,
    generadoAt: ahora.toISOString(),
    recomendadaId,
    actualId: sel.actual?.id ?? null,
    comparacion,
    narrativa,
  }

  const hecho = await db.$transaction(async (tx) => {
    // Bajo cerrojo por oportunidad: dos «Generar presupuesto» a la vez no dejan dos borradores.
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${`presupuesto-ofertas:${correduriaId}:${op.id}`}))`
    const previos = await tx.presupuesto.findMany({
      where: { correduriaId, origen: 'ofertas', oportunidadId: op.id, retiradoAt: null, enviadoAt: null, enlaceGeneradoAt: null, aceptadoAt: null },
      select: { id: true },
    })
    for (const p of previos) {
      const motivo = 'Sustituido por un presupuesto nuevo de las ofertas de la misma oportunidad (sin haberse enviado).'
      await tx.presupuesto.update({
        where: { id: p.id },
        data: { retiradoAt: ahora, retiradoMotivo: motivo, eventos: { create: [{ tipo: 'retirado', origen: 'corredor', detalle: { actor: entrada.actor, motivo } }] } },
      })
    }
    const creado = await tx.presupuesto.create({
      data: {
        correduriaId,
        clienteId: op.clienteId,
        polizaId,
        ramo: op.ramo ?? 'otros',
        origen: 'ofertas',
        tarificacionId: null,
        oportunidadId: op.id,
        estudio: estudio as unknown as Prisma.InputJsonValue,
        tokenHash,
        venceEl,
        creadoAt: ahora,
        creadoPor: entrada.actor,
        opciones: {
          create: opciones.map((o) => ({
            orden: o.orden,
            compania: o.compania,
            producto: o.producto,
            modalidad: null,
            categoria: null,
            grupoCobertura: null,
            primaEur: o.primaEur,
            entradaEur: null,
            franquiciaEur: o.franquiciaEur,
            firmeza: o.firmeza,
            requiereRerate: o.requiereRerate,
            referenciaVendor: null,
            avisos: [AVISO_OPCION_OFERTA],
            papeles: o.papeles,
            ofertaId: o.ofertaId,
            garantias: o.garantias as unknown as Prisma.InputJsonValue,
            coberturas: o.coberturas as unknown as Prisma.InputJsonValue,
          })),
        },
        eventos: {
          create: [{
            tipo: 'preparado',
            origen: 'corredor',
            detalle: {
              actor: entrada.actor,
              origen: 'ofertas',
              ofertas: opciones.map((o) => o.ofertaId),
              recomendada: recomendadaId,
              narrativa: narrativa.fuente,
              ...(narrativa.descartada ? { narrativaDescartada: narrativa.descartada } : {}),
              ...(previos.length > 0 ? { sustituye: previos.map((p) => p.id) } : {}),
            },
          }],
        },
      },
      select: { id: true, referencia: true },
    })
    return { creado, sustituidos: previos.length }
  }, { timeout: 20_000, maxWait: 10_000 })

  await autocompletarNecesidades(correduriaId, hecho.creado.id, entrada.actor)
  anotarCambio({ entidad: 'presupuesto', id: hecho.creado.id, campo: 'origen', antes: null, despues: 'ofertas' })

  return {
    estado: 'ok',
    token,
    presupuesto: {
      id: hecho.creado.id,
      referencia: hecho.creado.referencia ?? null,
      origen: 'ofertas',
      oportunidadId: op.id,
      clienteId: op.clienteId,
      polizaId,
      ramo: op.ramo ?? 'otros',
      venceEl,
      fuenteVencimiento: fuente,
      opciones: opciones.length,
      recomendadaId,
      narrativa,
      sustituidos: hecho.sustituidos,
    },
  }
}
