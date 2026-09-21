import {
  DIAS_ANUALIDAD,
  DIAS_HORIZONTE_RENOVACION,
  DIAS_PREAVISO_TOMADOR,
  POLIZA_ESTADOS_VIGENTES,
  WHERE_CARTERA_VIVA,
  sqlCarteraEnVigor,
  diasHastaVencimiento,
  inicioVentanaRecuperacion,
  objetoAsegurado,
  primaReferencia,
  retarificabilidad,
  urgenciaRenovacion,
  type ObjetoAsegurado,
  type Retarificabilidad,
  type UrgenciaRenovacion,
} from '@central/module-seguros'
import { decryptField } from '@central/module-seguros-pii'
import { aseguraConfigurada, prismaAsegura } from './asegura-db'
import { Prisma } from './generated/asegura-client'
import { registrarErrorCartera, type CausaErrorCartera } from './error-cartera'
import { contactosDe, type Contacto } from './cartera-busqueda'
import { LIMITE_VENCIMIENTOS, cribaTruncada } from './cartera-techos.ts'
import { ultimosContactosRenovacion } from './cartera-renovaciones-contacto.ts'

/**
 * Lecturas de la Fase 1 sobre la cartera real. Reglas que no se negocian:
 * - `correduriaId` SIEMPRE explícito en el WHERE (la BD se consulta con
 *   permisos amplios; el aislamiento es del código — ADR-013 del CRM origen).
 * - Filas fusionadas (merged_into_* != null) son lápidas: se excluyen SIEMPRE.
 * - «Vigente» es la regla de @central/module-seguros, nunca la etiqueta del
 *   enum, y el vencimiento NULL cuenta como PENDIENTE, no como vigente.
 */

export type ResumenCartera = {
  estado: 'sin_configurar' | 'error' | 'ok'
  /** Solo con `estado: 'error'`: por qué no se pudo leer (cada causa se arregla en un sitio). */
  causa?: CausaErrorCartera
  clientes?: number
  leads?: number
  polizasVigentes?: number
  polizasPendientesFecha?: number
  polizasNoVigentes?: number
  siniestrosAbiertos?: number
  /** Vigentes que vencen dentro del mes de preaviso (LCS art. 22): la prórroga
   *  ya no se puede evitar en plazo. */
  vence30?: number
  /** Vigentes que vencen en 60 días: incluye las anteriores. */
  vence60?: number
}

/**
 * Una póliza a renovar. El criterio de qué sale de aquí es «lo que hace falta
 * para llamar al cliente y saber de qué póliza le hablas», no «todo lo que hay
 * en la fila»:
 *
 * - Sale el nombre del tomador (en claro en la BD; sin él no se llama a nadie)
 *   y el **objeto asegurado** ya derivado — vehículo y matrícula, localidad del
 *   inmueble, modalidades de la RC. Sin eso, un tomador con tres pólizas de
 *   auto es indistinguible.
 * - NO sale NUNCA `datos_especificos` en bruto: ahí conviven campos cifrados
 *   (la dirección del riesgo, `v1:iv:cipher:tag`) y ruido de la ingesta. Solo
 *   viaja el resumen que produce `objetoAsegurado`.
 * - NO salen DNI, teléfono, email ni IBAN — van cifrados y aquí no pintan.
 *
 * La matrícula SÍ es dato personal: este puerto está detrás de Bearer y solo lo
 * consume el cuadro de mando de Alberto. No se vuelca a informes ni a chats.
 */
export type PolizaVencimiento = {
  id: string
  /** El id del TOMADOR, no el de la póliza. Es lo que convierte el nombre de la
   *  lista en un enlace a su ficha: sin esto, «Jose Suárez» es texto muerto y
   *  hay que volver a buscarlo a mano. */
  clienteId: string
  cliente: string
  tipo: string
  aseguradora: string
  numeroPoliza: string | null
  fechaVencimiento: string
  dias: number
  urgencia: UrgenciaRenovacion
  /** `null` = la compañía no ha informado la prima (pasa con Allianz por EIAC). */
  prima: number | null
  fraccionamiento: string | null
  /** Qué asegura la póliza, ya derivado y con su propio estado (conocido /
   *  no informado / cifrado / sin objeto). Nunca es una cadena vacía. */
  objeto: ObjetoAsegurado
  /**
   * El mismo veredicto que la ficha del cliente y la de la póliza —solo un
   * helper, `retarificabilidad()`—, para que el botón «Retarificar» pueda salir
   * ya en la lista de renovaciones y no obligue a abrir la ficha para lo único
   * que se hace todos los días. Sin `datosGemela` (esta consulta no la trae):
   * puede subestimar hogar cuando el riesgo solo vive en la copia del volcado,
   * nunca al revés — es el lado conservador, no un dato inventado.
   */
  retarificacion: Retarificabilidad
  /**
   * Para llamar sin abrir la ficha. Es la MISMA pieza que el buscador
   * (`contactosDe` de `cartera-busqueda.ts`), no una copia: el contrato de los
   * tres estados —dato / «no consta» / «cifrado y no abre»— tiene que ser uno
   * solo, o el mismo cliente sale contactable en una pantalla y no en otra.
   *
   * 🚨 `null` = no se pudo preguntar, NO «no tiene». Medido el 05/09/2026 sobre
   * los próximos 90 días: 15 fichas, 9 con teléfono (60%) y 8 con email. Aquí
   * el icono sale la mayoría de las veces —al revés que en el buscador, donde
   * el 83% son leads muertos—, porque una póliza que vence es de un cliente.
   */
  contacto: Contacto | null
  /**
   * Cuándo se abrió por última vez el WhatsApp de renovación de ESTA póliza
   * (ISO `yyyy-mm-dd`), o `null` si nunca se registró un contacto. Alimenta
   * el cooldown de 14 días y el "contactado hace N días" de la pantalla —
   * ver `@central/module-seguros` `enCooldownRenovacion()` y
   * `renovacion_contactos` en `cartera-renovaciones-contacto.ts`.
   */
  ultimoContactoEn: string | null
}

/**
 * La lista de renovaciones MÁS su techo.
 *
 * 🚨 Devolver un array pelado era el problema: quien lo recibía no tenía forma
 * de distinguir «estas son todas» de «estas son las primeras N». Ahora el
 * recorte viaja con la lista, y por eso son un objeto y no dos valores sueltos:
 * nadie puede leer las filas sin tener delante el campo que dice si están todas.
 */
export type ListaVencimientos = {
  polizas: PolizaVencimiento[]
  /**
   * `true` = la criba tocó `LIMITE_VENCIMIENTOS` y puede haber MÁS pólizas que
   * renovar en la ventana que esta lectura no ha visto. NO significa «hay
   * exactamente 1.000».
   */
  truncado: boolean
}

/**
 * Ramos cuyo objeto NO vive en `datos_especificos`: una RC o un comercio se
 * describen por las coberturas contratadas. Se consultan solo para esos, que
 * son pocos — un auto trae 25 coberturas que no dicen nada del vehículo.
 */
export const RAMOS_DESCRITOS_POR_COBERTURAS = ['responsabilidad_civil', 'comercio', 'otros'] as const

function hoyUtc(): Date {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

export async function resumenCartera(correduriaId: string): Promise<ResumenCartera> {
  if (!aseguraConfigurada()) return { estado: 'sin_configurar' }
  try {
    const db = prismaAsegura()
    const hoy = hoyUtc()
    const estadosVigentes = [...POLIZA_ESTADOS_VIGENTES]
    // «Vigente» aquí exige ADEMÁS ser cartera VIVA (origen CIMA): sin esto, una
    // póliza del volcado histórico con estado 'vigente' (aunque su vencimiento
    // ya haya pasado hace años) podría colarse en los recuentos de abajo.
    const basePoliza = { correduriaId, mergedIntoPolizaId: null, ...WHERE_CARTERA_VIVA }
    const limite = (dias: number) => {
      const d = new Date(hoy)
      d.setUTCDate(d.getUTCDate() + dias)
      return d
    }
    const [
      clientesGrupos, polizasVigentes, polizasPendientesFecha, totalPolizas, siniestrosAbiertos,
      vence30, vence60,
    ] =
      await Promise.all([
        // 🚨 «Cliente» / «lead» NO es `clientes.tipo` (campo del volcado que nadie
        // mantiene: 2.742 «cliente» / 29.860 «lead» sobre una cartera viva de 72).
        // Es la MISMA pregunta que `cartera-filtro.ts` (LATERAL_VIVAS): un cliente
        // es cartera EN VIGOR si tiene ≥1 póliza que cumple `esCarteraEnVigor()`.
        db.$queryRaw<{ clientes: bigint; leads: bigint }[]>(Prisma.sql`
          select
            count(*) filter (where v.polizas_en_vigor > 0)::bigint as clientes,
            count(*) filter (where v.polizas_en_vigor = 0)::bigint as leads
          from clientes c
          join lateral (
            select count(*)::int as polizas_en_vigor
            from polizas p
            where p.cliente_id = c.id
              and p.correduria_id = c.correduria_id
              and p.merged_into_poliza_id is null
              and ${Prisma.raw(sqlCarteraEnVigor('p'))}
          ) v on true
          where c.correduria_id = ${correduriaId}
            and c.merged_into_cliente_id is null
            and c.activo = true
        `),
        db.poliza.count({
          where: { ...basePoliza, estado: { in: estadosVigentes }, fechaVencimiento: { gte: hoy } },
        }),
        db.poliza.count({
          where: { ...basePoliza, estado: { in: estadosVigentes }, fechaVencimiento: null },
        }),
        db.poliza.count({ where: basePoliza }),
        db.siniestro.count({ where: { correduriaId, estado: { in: ['abierto', 'en_tramitacion'] } } }),
        db.poliza.count({
          where: {
            ...basePoliza, estado: { in: estadosVigentes },
            fechaVencimiento: { gte: hoy, lte: limite(DIAS_PREAVISO_TOMADOR) },
          },
        }),
        db.poliza.count({
          where: {
            ...basePoliza, estado: { in: estadosVigentes },
            fechaVencimiento: { gte: hoy, lte: limite(2 * DIAS_PREAVISO_TOMADOR) },
          },
        }),
      ])
    const { clientes, leads } = clientesGrupos[0] ?? { clientes: BigInt(0), leads: BigInt(0) }
    return {
      estado: 'ok',
      clientes: Number(clientes),
      leads: Number(leads),
      polizasVigentes,
      polizasPendientesFecha,
      polizasNoVigentes: totalPolizas - polizasVigentes - polizasPendientesFecha,
      siniestrosAbiertos,
      vence30,
      vence60,
    }
  } catch (e) {
    // Un fallo de red/credencial NO se pinta como cartera vacía (regla global),
    // y su causa se registra y viaja: sin esto la pantalla solo sabía decir «no pudo leer».
    return { estado: 'error', causa: registrarErrorCartera('resumenCartera', e) }
  }
}

/**
 * Pólizas vigentes de la ventana de renovación, ordenadas por urgencia real
 * (la fecha, no la etiqueta del estado). Es la lista de llamadas de la semana.
 *
 * 🚨 LA VENTANA EMPIEZA EN EL PASADO, y el día que no lo hizo costó dinero.
 * Hasta el 20/09/2026 el filtro era `fechaVencimiento >= hoy`: una póliza que
 * venció ayer sin que nadie la gestionara DEJABA DE EXISTIR para la pantalla,
 * para el cron de Telegram y para el contador de «Hoy» — justo cuando más
 * urgía. Y se notaba aguas abajo: la urgencia `'vencida'` de
 * `@central/module-seguros` y su insignia en `Renovaciones.tsx` no podían
 * renderizarse NUNCA desde este origen, así que eran código muerto que parecía
 * cobertura. Medido ese día: 9 pólizas de Mapfre (C0058) vencidas entre el
 * 05/06 y el 10/08/2026, 4.377,51 € de prima, invisibles.
 *
 * Hacia atrás se mira UNA ANUALIDAD (`DIAS_ANUALIDAD`, LCS art. 22) y no más:
 * una fila cuyo último vencimiento es anterior a eso no describe la anualidad
 * en curso —aunque se hubiera prorrogado sola, la fecha ya se habría movido— y
 * meterla en la cola de hoy enterraría las recuperables bajo dato viejo (las
 * hay: 8 pólizas con vencimiento de 2013 a 2019 y prima 0). Esas NO se
 * esconden: las cuenta `vencidasFueraDeVentana()` y la pantalla lo declara.
 *
 * Las que tienen `fechaVencimiento` NULL NO salen aquí y eso no significa que no
 * venzan: significa que no se sabe cuándo. El resumen las cuenta aparte
 * (`polizasPendientesFecha`) para que la ausencia se vea en vez de desaparecer.
 */
export async function vencimientosProximos(
  correduriaId: string,
  dias: number = DIAS_HORIZONTE_RENOVACION,
  hoyRef: Date = hoyUtc(),
  diasAtras: number = DIAS_ANUALIDAD,
): Promise<ListaVencimientos> {
  // `truncado: false` aquí es correcto y no es un «no se sabe» disfrazado: sin
  // conexión no se ha leído NADA, así que no hay recorte del que avisar. Lo que
  // dice «no hay cartera» es el `estado` de la ruta, no este campo.
  if (!aseguraConfigurada()) return { polizas: [], truncado: false }
  const db = prismaAsegura()
  const hasta = new Date(hoyRef)
  hasta.setUTCDate(hasta.getUTCDate() + dias)
  // El borde izquierdo NO es `hoyRef`: es hoy menos una anualidad.
  const desde = inicioVentanaRecuperacion(hoyRef, diasAtras)
  const filas = await db.poliza.findMany({
    where: {
      correduriaId,
      mergedIntoPolizaId: null,
      estado: { in: [...POLIZA_ESTADOS_VIGENTES] },
      fechaVencimiento: { gte: desde, lte: hasta },
      // Una ficha descartada no genera llamadas de renovación. (Hoy no puede
      // haber ninguna aquí —no se descarta lo que tiene pólizas vivas—, pero
      // «vigente con fecha futura» no es exactamente «cartera viva», así que el
      // filtro se pone donde se lee, no se deduce.)
      cliente: { activo: true },
    },
    orderBy: { fechaVencimiento: 'asc' },
    // El techo NO es decorativo aunque hoy sobren 900 filas: sin él, el día que
    // la cartera crezca esta lista se sirve entera contra el `maxDuration` de
    // la función y el timeout de 15 s con que plataforma la pide.
    take: LIMITE_VENCIMIENTOS,
    select: {
      id: true, tipo: true, aseguradora: true, numeroPoliza: true, fechaVencimiento: true,
      primaAnual: true, primaBruta: true, fraccionamiento: true, datosEspecificos: true,
      cliente: { select: { id: true, nombre: true, apellidos: true } },
    },
  })

  // El techo se DECLARA. Recortar en silencio presentaría el recorte como «todo
  // lo que hay que renovar», que es la afirmación sobre la que se llama o no se
  // llama a un cliente antes de que se le prorrogue la póliza sola.
  const truncado = cribaTruncada(filas.length, LIMITE_VENCIMIENTOS)

  // Coberturas SOLO de los ramos que las necesitan para identificarse.
  //
  // No lleva techo propio A PROPÓSITO: es una consulta DERIVADA de la lista de
  // arriba (solo los ids de los 3 ramos que se describen por coberturas), así
  // que ya está acotada por `LIMITE_VENCIMIENTOS`. Medido el 20/09/2026: 176
  // filas para 16 pólizas, ≈11 coberturas por póliza. Si algún día se recortara
  // aquí, el síntoma sería otro (un objeto asegurado incompleto, no una póliza
  // que falta), y mezclarlo en el mismo `truncado` haría que la pantalla dijera
  // lo que no es.
  const idsPorCoberturas = filas
    .filter(f => (RAMOS_DESCRITOS_POR_COBERTURAS as readonly string[]).includes(String(f.tipo)))
    .map(f => f.id)
  const coberturasPorPoliza = new Map<string, string[]>()
  if (idsPorCoberturas.length > 0) {
    const cobs = await db.polizaCobertura.findMany({
      where: { correduriaId, polizaId: { in: idsPorCoberturas } },
      select: { polizaId: true, descripcion: true },
      orderBy: { numeroOrden: 'asc' },
    })
    for (const c of cobs) {
      if (!c.descripcion) continue
      const lista = coberturasPorPoliza.get(c.polizaId) ?? []
      lista.push(c.descripcion)
      coberturasPorPoliza.set(c.polizaId, lista)
    }
  }

  // Una sola consulta para toda la lista: las fichas se repiten (un cliente con
  // tres pólizas que vencen sale tres veces) y descifrar por fila sería pagar
  // tres veces por el mismo teléfono.
  const contactos = await contactosDe(
    correduriaId,
    [...new Set(filas.map(f => f.cliente.id))],
  )

  // `null` general = no se pudo consultar el historial de contactos: no se
  // distingue de "sin ninguno" fila a fila, pero tampoco inventa una fecha —
  // simplemente ninguna póliza sale con `ultimoContactoEn`, que es el lado
  // conservador (el cooldown nunca oculta una fila por error).
  const ultimosContactos = await ultimosContactosRenovacion(
    correduriaId,
    filas.map(f => f.id),
  ).catch(() => new Map<string, Date>())

  const polizas = filas.map(f => {
    const vencimiento = f.fechaVencimiento as Date
    const diasRestantes = diasHastaVencimiento(vencimiento, hoyRef)
    return {
      id: f.id,
      clienteId: f.cliente.id,
      cliente: `${f.cliente.nombre} ${f.cliente.apellidos}`.trim(),
      tipo: String(f.tipo),
      aseguradora: f.aseguradora,
      numeroPoliza: f.numeroPoliza ?? null,
      fechaVencimiento: vencimiento.toISOString().slice(0, 10),
      dias: diasRestantes,
      urgencia: urgenciaRenovacion(diasRestantes),
      prima: primaReferencia({
        primaAnual: f.primaAnual === null ? null : Number(f.primaAnual),
        primaBruta: f.primaBruta === null ? null : Number(f.primaBruta),
      }),
      fraccionamiento: f.fraccionamiento === null ? null : String(f.fraccionamiento),
      objeto: objetoAsegurado({
        tipo: String(f.tipo),
        datos: descifrarDireccion(f.datosEspecificos),
        coberturas: coberturasPorPoliza.get(f.id) ?? null,
      }),
      retarificacion: retarificabilidad({
        tipo: String(f.tipo),
        datos: descifrarDireccion(f.datosEspecificos),
        datosGemela: null,
      }),
      // Si la consulta falló, `null` para todas: «no se ha podido mirar».
      contacto: contactos?.get(f.cliente.id) ?? null,
      ultimoContactoEn: ultimosContactos.get(f.id)?.toISOString().slice(0, 10) ?? null,
    }
  })

  return { polizas, truncado }
}

/**
 * Cuántas pólizas de la CARTERA VIVA figuran VIGENTES arrastrando un
 * vencimiento anterior a la ventana de recuperación (más de una anualidad en el
 * pasado).
 *
 * No son trabajo de hoy y por eso no entran en la lista; pero tampoco se
 * borran de la pantalla: son dato a depurar, y esconderlas es exactamente el
 * fallo que este módulo arregla un piso más arriba.
 *
 * 🚨 EL FILTRO DE CARTERA VIVA NO ES DECORATIVO — medido el 20/09/2026 contra
 * la BD real: sin él esta consulta devuelve **979**, y solo **8** son cartera
 * viva. Las otras 971 son el volcado histórico con el estado sin actualizar
 * (la más antigua vence el **08/12/1900**). El comentario que había aquí decía
 * «son 8 filas» y era cierto de la CARTERA, no de lo que contaba la función:
 * el número que salía por el puerto era 979.
 *
 * Y el agujero estaba tapado por CASUALIDAD, no por diseño: su hermana
 * `vencimientosProximos` tampoco filtra cartera viva, pero su ventana
 * —[hoy−365, hoy+90]— no alcanza a un volcado que vence entre 2013 y 2018
 * (medido el mismo día: 29 de 29 en ventana son cartera viva, 0 del volcado).
 * Esta función no tiene borde derecho, así que se lo lleva todo. El día que el
 * dato llegue a la pantalla —hasta hoy `interpretarVencimientos` ni lo leía—
 * habría dicho «979 pólizas figuran vigentes con vencimiento anterior…» sobre
 * una cartera de 8.
 *
 * 🚨 `null` = NO SE HA PODIDO CONTAR, nunca «no hay». Un 0 aquí afirmaría que
 * la cartera está limpia, que es una afirmación sobre la que se decide.
 */
export async function vencidasFueraDeVentana(
  correduriaId: string,
  hoyRef: Date = hoyUtc(),
  diasAtras: number = DIAS_ANUALIDAD,
): Promise<number | null> {
  if (!aseguraConfigurada()) return null
  try {
    return await prismaAsegura().poliza.count({
      where: {
        correduriaId,
        mergedIntoPolizaId: null,
        estado: { in: [...POLIZA_ESTADOS_VIGENTES] },
        fechaVencimiento: { lt: inicioVentanaRecuperacion(hoyRef, diasAtras) },
        cliente: { activo: true },
        // El volcado histórico NO es cartera: son leads de 2013-2018 con el
        // estado sin actualizar. Contarlos aquí multiplica la cifra por 122.
        ...WHERE_CARTERA_VIVA,
      },
    })
  } catch (e) {
    registrarErrorCartera('vencidasFueraDeVentana', e)
    return null
  }
}

/** La única correduría de la base (medido: 1 fila). Lanza si hubiera más de una. */
export async function correduriaUnica(): Promise<{ id: string; nombre: string } | null> {
  if (!aseguraConfigurada()) return null
  const filas = await prismaAsegura().correduria.findMany({ select: { id: true, nombre: true }, take: 2 })
  if (filas.length > 1) throw new Error('Más de una correduría en la base: el ámbito ya no puede ser implícito')
  return filas[0] ?? null
}

/** `datos_especificos` es JSON libre: puede llegar como array, número o null.
 *  Solo se mira si de verdad es un objeto. */
function esObjetoPlano(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * La dirección del riesgo (hogar) viaja CIFRADA en `datos_especificos`
 * (`v1:iv:cipher:tag`). Se intenta descifrar con la clave del propio proyecto:
 *
 * - con `PII_ENCRYPTION_KEY` puesta → sale la calle en claro;
 * - sin clave, o con una clave que no abre ese registro → `objetoAsegurado`
 *   verá el `v1:` intacto y lo dirá como **«cifrado»**, que NO es «sin dato».
 *
 * Lo que no puede pasar nunca es que un fallo de descifrado se convierta en un
 * hueco silencioso: por eso el `catch` deja el valor tal cual en vez de borrarlo.
 */
function descifrarDireccion(datos: unknown): Record<string, unknown> | null {
  if (!esObjetoPlano(datos)) return null
  const direccion = datos.direccion
  if (typeof direccion !== 'string' || !direccion.startsWith('v1:')) return datos
  try {
    return { ...datos, direccion: decryptField(direccion) }
  } catch {
    return datos
  }
}
