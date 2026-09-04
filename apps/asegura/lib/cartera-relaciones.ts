// Relaciones entre clientes (`seguros.cliente_relaciones`) y la AUTORIZACIÓN
// para ver los seguros del otro. Reglas puras de las relaciones en
// `@central/module-seguros` (relaciones.ts) y de la autorización en
// `@central/module-seguros-portal` (autorizacion.ts); aquí solo BD, con
// `correduriaId` explícito en todo.
//
// Forma de la tabla de relaciones (heredada del CRM): DOS filas por vínculo,
// una por sentido. Fila A→B: `tipo` = «B es <tipo> de A».
//
// 🚨 El consentimiento YA NO vive aquí (03/09/2026). `cliente_relaciones
// .puede_ver_polizas` es DATO MUERTO —apagado en las 1.706 filas y sin nadie
// que lo escriba— porque un booleano no dice quién lo dio, cuándo, con qué
// texto ni hasta cuándo (art. 7.1 RGPD: hay que poder DEMOSTRARLO). Lo
// sustituye `seguros.portal_autorizacion`, y de ahí sale todo lo que esta capa
// afirma sobre quién ve qué:
//
//   · `RelacionFila.puedeVerPolizas` (el contrato de `@central/module-seguros`)
//     se pasa CALCULADO: `true` solo si hay una autorización VIGENTE de A a B.
//     No se lee de la columna.
//   · Una autorización que la correduría anota (`origen = 'corredor'`) NO abre
//     nada hasta que el autorizado la ACEPTE en el portal. Ese hueco es el
//     estado `pendiente`, y es la diferencia entre «no hay» y «hay, pero
//     todavía no ve nada».

import {
  clientesVisiblesPara,
  permiteAutorizar,
  relacionesDeFicha,
  tipoInverso,
  tipoRelacion,
  type RelacionFicha,
  type RelacionFila,
} from '@central/module-seguros'
import { WHERE_CARTERA_VIVA } from '@central/module-seguros'
import {
  alcanceConcedible,
  autorizacionVigente,
  caducidadPorDefecto,
  esAlcance,
  estadoAutorizacion,
  tituloRepresentacion,
  type Alcance,
  type EstadoAutorizacion,
  type TipoOtorgante,
  type TituloRepresentacion,
} from '@central/module-seguros-portal'
import { prismaAsegura } from './asegura-db'

/**
 * El texto que la correduría dice haber leído al cliente cuando anota por
 * teléfono o en papel. Sin versión de texto no se puede demostrar QUÉ consintió.
 */
export const TEXTO_AUTORIZACION_CORREDOR_V1 = 'v1-2026-09-03-corredor'

/** El alcance que se anota si no se dice otro: el más pequeño. */
export const ALCANCE_POR_DEFECTO: Alcance = 'ver'

/** Los dos alcances que son ACTUAR en nombre de otro. Solo los delega una SOCIEDAD. */
const APODERAMIENTO: readonly Alcance[] = ['partes', 'documentos']

function esApoderamiento(a: Alcance): boolean {
  return APODERAMIENTO.includes(a)
}

/**
 * Qué es la ficha que cede, leído de `clientes.tipo_persona`.
 *
 * 🚨 `null` = **no consta**, y se trata como `'fisica'`, que es el lado
 * restrictivo: de una persona solo se delega mirar. Tratar el hueco como
 * sociedad repartiría apoderamientos por una columna vacía — y hoy la mayoría de
 * la cartera la tiene a NULL. Al PINTAR sí se distingue (`tipoOtorgante` viaja
 * como `null`): no es lo mismo «es una persona» que «no lo hemos podido leer».
 */
function tipoDeFicha(v: string | null | undefined): TipoOtorgante {
  return v === 'juridica' ? 'juridica' : 'fisica'
}

/** El tipo de persona de una ficha de ESTA correduría. `null` = no existe o está fusionada. */
async function tipoPersonaDe(correduriaId: string, clienteId: string): Promise<TipoOtorgante | null> {
  const f = await prismaAsegura().cliente.findFirst({
    where: { id: clienteId, correduriaId, mergedIntoClienteId: null },
    select: { tipoPersona: true },
  })
  return f === null ? null : tipoDeFicha(f.tipoPersona)
}

/**
 * La autorización que gobierna un vínculo, tal y como se pinta.
 *
 * 🚨 Tres estados, no dos (y aquí son cuatro, que es el mismo principio):
 * `null` en `RelacionCartera.autorizacion` = **no hay ninguna**; `pendiente` =
 * concedida y **todavía no ve nada** porque el autorizado no la ha aceptado;
 * `vigente` = ve; `caducada`/`revocada` = la hubo y ya no vale. Colapsar
 * `pendiente` con `vigente` sería decirle a Alberto que alguien ve unos datos
 * que no ve; colapsarlo con `null`, esconderle que hay un consentimiento suyo
 * esperando.
 */
export type AutorizacionRelacion = {
  estado: EstadoAutorizacion
  /** Los alcances que están en ese estado (uno por fila; la BD deja varios). */
  alcances: Alcance[]
  /**
   * Con qué título representa a la sociedad quien la recibió. `null` = no consta
   * — lo normal cuando cede una persona, porque ahí no se representa a nadie.
   */
  tituloRepresentacion: string | null
  caducaEn: Date
  /** `portal` = lo concedió el cliente en su pantalla · `corredor` = lo anotó la correduría. */
  origen: string
}

export type RelacionCartera = RelacionFicha & {
  nombre: string
  tipoCliente: string
  /**
   * Qué es LA FICHA que cede (no el relacionado), repetido en cada fila porque es
   * lo que cruza el puerto: de él depende si desde esa ficha se puede delegar
   * solo mirar (persona) o su gestión entera (sociedad). `null` = no se pudo
   * leer; la pantalla entonces no ofrece apoderamiento, que es el lado seguro.
   */
  tipoOtorgante: TipoOtorgante | null
  /** Pólizas vivas (de CIMA) del relacionado. `null` = no se pudo contar. */
  polizasVivas: number | null
  /**
   * La autorización de LA FICHA hacia el relacionado. `null` = no hay ninguna
   * anotada — nunca «no se pudo leer»: si la consulta falla, `listarRelaciones`
   * entera devuelve `null` y la pantalla lo dice.
   */
  autorizacion: AutorizacionRelacion | null
}

type Fallo = { ok: false; estado: 'invalido' | 'conflicto' | 'no_encontrado' | 'error'; motivo: string; status: 404 | 409 | 422 | 500 }

// ─── Autorizaciones ──────────────────────────────────────────────────────────

type FilaAutorizacion = {
  otorganteClienteId: string
  autorizadoClienteId: string
  alcance: string
  tituloRepresentacion: string | null
  origen: string
  aceptadoEn: Date | null
  caducaEn: Date
  revocadoEn: Date | null
}

function clavePar(otorgante: string, autorizado: string): string {
  return `${otorgante}→${autorizado}`
}

/** Prioridad al resumir: lo que abre datos manda sobre lo que ya no vale. */
const ORDEN_ESTADO: Record<EstadoAutorizacion, number> = { vigente: 4, pendiente: 3, caducada: 2, revocada: 1 }

/**
 * Resume las autorizaciones de un par en la que gobierna. Puro (recibe `hoy`).
 * Si hay varias en el mismo estado —la BD permite un alcance por fila— se
 * juntan sus alcances y se toma la caducidad más lejana, que es la que manda.
 */
export function resumirAutorizacion(filas: readonly FilaAutorizacion[], hoy: Date): AutorizacionRelacion | null {
  if (filas.length === 0) return null
  const conEstado = filas.map((f) => ({ f, estado: estadoAutorizacion(f, hoy) }))
  const mejor = conEstado.reduce((m, x) => (ORDEN_ESTADO[x.estado] > ORDEN_ESTADO[m.estado] ? x : m))
  const delEstado = conEstado.filter((x) => x.estado === mejor.estado)
  // Un alcance que no está en el vocabulario no se inventa ni se pinta: se calla.
  const alcances = [...new Set(delEstado.map((x) => x.f.alcance).filter((a): a is Alcance => esAlcance(a)))]
  const gobierna = delEstado.reduce((m, x) => (x.f.caducaEn.getTime() > m.f.caducaEn.getTime() ? x : m))
  // El título que conste en alguna fila de ese mismo estado (una de lectura no lo
  // lleva, y una de apoderamiento sí). Si no hay ninguno es `null`: «no consta»,
  // nunca una cadena vacía que se cuele por las guardas de NULL de quien lo pinte.
  const titulo = delEstado.map((x) => x.f.tituloRepresentacion).find((t) => t !== null && t !== '') ?? null
  return {
    estado: mejor.estado,
    alcances,
    tituloRepresentacion: titulo,
    caducaEn: gobierna.f.caducaEn,
    origen: gobierna.f.origen,
  }
}

/**
 * Las autorizaciones en las que interviene `clienteId`, indexadas por par.
 * Lanza si la consulta falla — a propósito: quien llama degrada a `null`, que
 * es «no se pudo leer», y NUNCA a «no hay autorización».
 */
async function autorizacionesDe(correduriaId: string, clienteId: string): Promise<Map<string, FilaAutorizacion[]>> {
  const filas = await prismaAsegura().portalAutorizacion.findMany({
    where: { correduriaId, OR: [{ otorganteClienteId: clienteId }, { autorizadoClienteId: clienteId }] },
    select: {
      otorganteClienteId: true,
      autorizadoClienteId: true,
      alcance: true,
      tituloRepresentacion: true,
      origen: true,
      aceptadoEn: true,
      caducaEn: true,
      revocadoEn: true,
    },
  })
  const por = new Map<string, FilaAutorizacion[]>()
  for (const f of filas) {
    const k = clavePar(f.otorganteClienteId, f.autorizadoClienteId)
    const ya = por.get(k)
    if (ya) ya.push(f)
    else por.set(k, [f])
  }
  return por
}

// ─── Relaciones ──────────────────────────────────────────────────────────────

/**
 * Las filas de relación de una ficha, con `puedeVerPolizas` CALCULADO desde
 * `portal_autorizacion` (la columna homónima de la tabla ya no se lee).
 */
async function vinculosDe(
  correduriaId: string,
  clienteId: string,
): Promise<{ filas: RelacionFila[]; autorizaciones: Map<string, FilaAutorizacion[]> }> {
  const db = prismaAsegura()
  const [crudas, autorizaciones] = await Promise.all([
    db.clienteRelacion.findMany({
      where: { correduriaId, OR: [{ clienteAId: clienteId }, { clienteBId: clienteId }] },
      orderBy: { createdAt: 'asc' },
    }),
    autorizacionesDe(correduriaId, clienteId),
  ])
  const hoy = new Date()
  const filas = crudas.map((f) => ({
    id: f.id,
    clienteAId: f.clienteAId,
    clienteBId: f.clienteBId,
    tipo: f.tipoRelacion,
    // A→B: «A autoriza a B a ver las pólizas de A». Solo VIGENTE abre datos:
    // una pendiente de aceptar no enseña nada todavía.
    puedeVerPolizas: (autorizaciones.get(clavePar(f.clienteAId, f.clienteBId)) ?? []).some((a) => autorizacionVigente(a, hoy)),
    observaciones: f.observaciones,
  }))
  return { filas, autorizaciones }
}

async function filasDe(correduriaId: string, clienteId: string): Promise<RelacionFila[]> {
  return (await vinculosDe(correduriaId, clienteId)).filas
}

/** Las relaciones de una ficha con nombre y pólizas vivas del otro. `null` = no se pudo consultar. */
export async function listarRelaciones(correduriaId: string, clienteId: string): Promise<RelacionCartera[] | null> {
  try {
    const db = prismaAsegura()
    const { filas, autorizaciones } = await vinculosDe(correduriaId, clienteId)
    const rel = relacionesDeFicha(filas, clienteId)
    if (rel.length === 0) return []
    const hoy = new Date()
    // Qué es la ficha que cede. Va en cada fila (es lo que cruza el puerto) y
    // `null` = no se pudo leer: la pantalla de plataforma no ofrece apoderamiento
    // sobre una ficha de la que no sabemos si es una empresa o una persona.
    const tipoOtorgante = await tipoPersonaDe(correduriaId, clienteId)
    const ids = rel.map((r) => r.relacionadoId)
    const otros = await db.cliente.findMany({
      where: { id: { in: ids }, correduriaId },
      select: { id: true, nombre: true, apellidos: true, tipo: true, mergedIntoClienteId: true, activo: true },
    })
    const vivas = await db.poliza.groupBy({
      by: ['clienteId'],
      where: { clienteId: { in: ids }, correduriaId, ...WHERE_CARTERA_VIVA, mergedIntoPolizaId: null },
      _count: { _all: true },
    })
    const nVivas = new Map(vivas.map((v) => [v.clienteId, v._count._all]))
    const porId = new Map(otros.map((o) => [o.id, o]))
    return rel
      .map((r): RelacionCartera | null => {
        const o = porId.get(r.relacionadoId)
        if (!o) return null
        // Una lápida de fusión: el vínculo sigue en la ficha superviviente, aquí no se pinta.
        if (o.mergedIntoClienteId) return null
        // Una ficha DESCARTADA tampoco se ofrece: el vínculo sigue en la base
        // (y vuelve solo si se restaura), pero no se pinta un enlace a una ficha
        // que se quitó de la vista. La ESCRITURA sí sigue admitiéndola, para
        // poder deshacer un vínculo de una ficha ya descartada.
        if (!o.activo) return null
        return {
          ...r,
          nombre: `${o.nombre} ${o.apellidos}`.trim(),
          tipoCliente: String(o.tipo),
          tipoOtorgante,
          polizasVivas: nVivas.get(o.id) ?? 0,
          autorizacion: resumirAutorizacion(autorizaciones.get(clavePar(clienteId, r.relacionadoId)) ?? [], hoy),
        }
      })
      .filter((r): r is RelacionCartera => r !== null)
  } catch {
    return null
  }
}

/** Para un portal: ids de clientes cuyas pólizas puede ver `clienteId`. `null` = no se pudo consultar. */
export async function clientesQuePuedeVer(correduriaId: string, clienteId: string): Promise<string[] | null> {
  try {
    return clientesVisiblesPara(await filasDe(correduriaId, clienteId), clienteId)
  } catch {
    return null
  }
}

export type ResultadoRelacion = { ok: true; relaciones: RelacionCartera[] } | Fallo

async function ambosDeLaCorreduria(correduriaId: string, a: string, b: string): Promise<boolean> {
  const n = await prismaAsegura().cliente.count({ where: { id: { in: [a, b] }, correduriaId, mergedIntoClienteId: null } })
  return n === 2
}

async function devolver(correduriaId: string, clienteId: string): Promise<ResultadoRelacion> {
  const relaciones = await listarRelaciones(correduriaId, clienteId)
  if (relaciones === null) return { ok: false, estado: 'error', motivo: 'No se pudieron releer las relaciones.', status: 500 }
  return { ok: true, relaciones }
}

/** Crea el vínculo en los DOS sentidos (tipo y su inverso). */
export async function crearRelacion(
  correduriaId: string,
  clienteId: string,
  entrada: { relacionadoId: string; tipo: unknown; observaciones?: unknown; actor: string },
): Promise<ResultadoRelacion> {
  const tipo = tipoRelacion(entrada.tipo)
  if (!tipo) return { ok: false, estado: 'invalido', motivo: 'Tipo de relación desconocido.', status: 422 }
  if (entrada.relacionadoId === clienteId) return { ok: false, estado: 'invalido', motivo: 'Un cliente no se relaciona consigo mismo.', status: 422 }
  try {
    if (!(await ambosDeLaCorreduria(correduriaId, clienteId, entrada.relacionadoId))) {
      return { ok: false, estado: 'no_encontrado', motivo: 'Alguna de las dos fichas no existe en esta correduría.', status: 404 }
    }
    const db = prismaAsegura()
    const ya = await db.clienteRelacion.count({
      where: { correduriaId, OR: [{ clienteAId: clienteId, clienteBId: entrada.relacionadoId }, { clienteAId: entrada.relacionadoId, clienteBId: clienteId }] },
    })
    if (ya > 0) return { ok: false, estado: 'conflicto', motivo: 'Esas dos fichas ya están relacionadas: edita o borra el vínculo que hay.', status: 409 }
    const obs = typeof entrada.observaciones === 'string' && entrada.observaciones.trim() !== '' ? entrada.observaciones.trim().slice(0, 500) : null
    await db.$transaction([
      db.clienteRelacion.create({ data: { correduriaId, clienteAId: clienteId, clienteBId: entrada.relacionadoId, tipoRelacion: tipo, observaciones: obs } }),
      db.clienteRelacion.create({ data: { correduriaId, clienteAId: entrada.relacionadoId, clienteBId: clienteId, tipoRelacion: tipoInverso(tipo), observaciones: obs } }),
    ])
    await anotar(correduriaId, clienteId, `Relación añadida desde plataforma por ${entrada.actor}: ${tipo} (ficha ${entrada.relacionadoId})`)
    await anotar(correduriaId, entrada.relacionadoId, `Relación añadida desde plataforma por ${entrada.actor}: ${tipoInverso(tipo)} (ficha ${clienteId})`)
    return devolver(correduriaId, clienteId)
  } catch (e) {
    return { ok: false, estado: 'error', motivo: e instanceof Error ? e.message : String(e), status: 500 }
  }
}

/**
 * Cambia el TIPO de un vínculo que ya existe, en los dos sentidos.
 *
 * 🚨 Por qué existe (Alberto, 04/09/2026, «¿cómo podría cambiar la relación?»):
 * hasta hoy solo se podía CREAR y BORRAR. Corregir un vínculo mal anotado —el
 * conductor de la furgoneta es «Empleado/a», no «Socio/a»— obligaba a quitarlo
 * y volver a ponerlo, y eso REVOCA de paso la autorización del portal que
 * hubiera (`borrarRelacion` lo hace a propósito, para dejar constancia). O sea:
 * arreglar una etiqueta costaba el consentimiento. Peor todavía, el 409 de
 * `crearRelacion` ya prometía por escrito «edita o borra el vínculo que hay» y
 * la mitad de esa frase no existía.
 *
 * Lo que NO hace, a propósito: tocar la autorización. Si hay una viva y el tipo
 * nuevo no admite autorizar («Sin vínculo»), se RECHAZA y se pide revocarla
 * antes — dejar el consentimiento colgando de un vínculo que ya no lo soporta
 * es exactamente el estado que nadie sabría leer después.
 */
export async function cambiarTipoRelacion(
  correduriaId: string,
  clienteId: string,
  entrada: { relacionadoId: string; tipo: unknown; actor: string },
): Promise<ResultadoRelacion> {
  const tipo = tipoRelacion(entrada.tipo)
  if (!tipo) return { ok: false, estado: 'invalido', motivo: 'Tipo de relación desconocido.', status: 422 }
  if (entrada.relacionadoId === clienteId) return { ok: false, estado: 'invalido', motivo: 'Un cliente no se relaciona consigo mismo.', status: 422 }
  try {
    const db = prismaAsegura()
    const idas = await db.clienteRelacion.findMany({
      where: { correduriaId, clienteAId: clienteId, clienteBId: entrada.relacionadoId },
      select: { id: true, tipoRelacion: true },
    })
    // «No hay vínculo» y «no se pudo mirar» no son lo mismo: el catch de abajo
    // devuelve `error`, no este 404.
    if (idas.length === 0) {
      return { ok: false, estado: 'no_encontrado', motivo: 'Esas dos fichas no están relacionadas: anota el vínculo en vez de cambiarlo.', status: 404 }
    }
    if (idas.every((i) => i.tipoRelacion === tipo)) {
      return { ok: false, estado: 'invalido', motivo: `El vínculo ya está anotado como «${tipo}».`, status: 422 }
    }
    if (!permiteAutorizar(tipo)) {
      const vivas = await db.portalAutorizacion.count({
        where: {
          correduriaId,
          revocadoEn: null,
          OR: [
            { otorganteClienteId: clienteId, autorizadoClienteId: entrada.relacionadoId },
            { otorganteClienteId: entrada.relacionadoId, autorizadoClienteId: clienteId },
          ],
        },
      })
      if (vivas > 0) {
        return {
          ok: false,
          estado: 'conflicto',
          status: 409,
          motivo: 'Hay una autorización del portal viva entre esas dos fichas, y «Sin vínculo» no admite autorizar. Revócala primero: así queda constancia de que la hubo y hasta cuándo.',
        }
      }
    }
    const inverso = tipoInverso(tipo)
    const antes = idas[0].tipoRelacion
    await db.$transaction([
      db.clienteRelacion.updateMany({
        where: { correduriaId, clienteAId: clienteId, clienteBId: entrada.relacionadoId },
        data: { tipoRelacion: tipo },
      }),
      db.clienteRelacion.updateMany({
        where: { correduriaId, clienteAId: entrada.relacionadoId, clienteBId: clienteId },
        data: { tipoRelacion: inverso },
      }),
    ])
    await anotar(correduriaId, clienteId, `Relación cambiada desde plataforma por ${entrada.actor}: ${antes} → ${tipo} (ficha ${entrada.relacionadoId})`)
    await anotar(correduriaId, entrada.relacionadoId, `Relación cambiada desde plataforma por ${entrada.actor}: ${tipoInverso(antes)} → ${inverso} (ficha ${clienteId})`)
    return devolver(correduriaId, clienteId)
  } catch (e) {
    return { ok: false, estado: 'error', motivo: e instanceof Error ? e.message : String(e), status: 500 }
  }
}

/**
 * Por qué no se puede anotar ese alcance, y la razón depende de QUIÉN cede.
 *
 * 🚨 Desde el 03/09/2026 esto ya no es una regla sobre el alcance: es una regla
 * sobre el otorgante. Una PERSONA solo delega mirar —dar partes en su nombre es
 * un poder, y un tick en una pantalla no lo es (art. 16 LCS: si el parte va mal,
 * hay que poder decir quién firmó)—. Una SOCIEDAD no tiene datos personales, así
 * que lo que delega no es consentimiento sino REPRESENTACIÓN mercantil, y esa se
 * delega entera. Decir «hoy solo ver» sobre una empresa sería falso.
 */
function motivoAlcanceNoConcedible(tipo: TipoOtorgante): string {
  return tipo === 'juridica'
    ? 'Ese alcance no existe: «ver», «ver_economico», «partes» y «documentos» son los únicos.'
    : 'Esa ficha es una PERSONA, y de una persona solo se puede anotar que deja MIRAR («ver» o «ver_economico»). Dar partes o manejar documentos en su nombre es un apoderamiento, no una autorización de lectura: eso solo lo delega una sociedad en quien la representa.'
}

const MOTIVO_TITULO_REQUERIDO =
  'Falta el título con el que se representa a la sociedad («administrador», «apoderado» o «empleado_autorizado»). Sin él no se anota: lo que esa persona declare obliga a la empresa, y «alguien de la empresa» no es un título que oponerle a la compañía.'

/** Texto del estado en el que ya está una autorización, para el motivo del 409. */
function porQueYaHay(estado: EstadoAutorizacion): string {
  switch (estado) {
    case 'vigente':
      return 'ya hay una autorización EN VIGOR con ese alcance. Si quieres cambiarla, revócala primero: así queda constancia de las dos'
    case 'pendiente':
      return 'ya hay una autorización anotada con ese alcance, pendiente de que la acepte el autorizado'
    default:
      return 'ya hay una autorización con ese alcance entre esas dos fichas'
  }
}

/**
 * `clienteId` AUTORIZA (o revoca) a `relacionadoId` a ver sus pólizas.
 *
 * 🚨 Lo que se escribe es una fila de `portal_autorizacion` con
 * `origen = 'corredor'`: Alberto **no autoriza en nombre del cliente**, ANOTA
 * el consentimiento que el cliente le dio por teléfono o en papel. Por eso
 * lleva `otorgado_por_actor` (quién lo anotó) y NO `otorgado_por_identidad_id`
 * (que es la identidad del cliente en el portal; un CHECK de la BD obliga a
 * que sea uno u otro, nunca los dos).
 *
 * Y por eso **no abre nada todavía**: nace sin `aceptado_en`, o sea
 * `pendiente`, hasta que el autorizado entre al portal y la acepte. Eso es a
 * propósito y no se salta desde aquí.
 *
 * Queda en el historial de las dos fichas: es un consentimiento, y se tiene que
 * poder ver quién lo dio y cuándo.
 *
 * 🚨 Y desde el 03/09/2026 lo que se puede anotar depende de QUIÉN cede
 * (`clientes.tipo_persona`): de una PERSONA solo «ver»/«ver_economico»; de una
 * SOCIEDAD también «partes» y «documentos», y entonces hace falta el TÍTULO con
 * el que se la representa. No es un permiso más fino: es que ahí no hay
 * consentimiento de datos personales sino representación mercantil.
 */
export async function autorizarVer(
  correduriaId: string,
  clienteId: string,
  entrada: { relacionadoId: string; autoriza: boolean; alcance?: unknown; tituloRepresentacion?: unknown; actor: string },
): Promise<ResultadoRelacion> {
  try {
    if (!(await ambosDeLaCorreduria(correduriaId, clienteId, entrada.relacionadoId))) {
      return { ok: false, estado: 'no_encontrado', motivo: 'Alguna de las dos fichas no existe en esta correduría.', status: 404 }
    }
    // 🚨 Qué ES la ficha que cede, y con eso qué se puede anotar. Ya no se puede
    // decidir antes de tocar la BD: de una persona solo se delega mirar, de una
    // sociedad su gestión entera. `null` no llega aquí (`ambosDeLaCorreduria` ya
    // ha confirmado que la ficha existe y no está fusionada) y, si llegara, cae
    // a `'fisica'`, el lado que no abre nada de más.
    const tipoOtorgante = (await tipoPersonaDe(correduriaId, clienteId)) ?? 'fisica'
    const alcance =
      entrada.alcance === undefined || entrada.alcance === null
        ? ALCANCE_POR_DEFECTO
        : alcanceConcedible(entrada.alcance, tipoOtorgante)
    // Con una razón, nunca en silencio. Revocar no mira el alcance.
    if (entrada.autoriza && alcance === null) {
      return { ok: false, estado: 'invalido', motivo: motivoAlcanceNoConcedible(tipoOtorgante), status: 422 }
    }
    // El título solo tiene sentido en una sociedad: en una ficha de persona no se
    // representa a nadie, así que se descarta en vez de guardarlo.
    const titulo: TituloRepresentacion | null =
      tipoOtorgante === 'juridica' ? tituloRepresentacion(entrada.tituloRepresentacion) : null
    // Apoderamiento sin título no entra. La BD lo repite con un CHECK, pero
    // llegar hasta allí devolvería un error de Postgres en vez de decir qué falta.
    if (entrada.autoriza && alcance !== null && esApoderamiento(alcance) && titulo === null) {
      return { ok: false, estado: 'invalido', motivo: MOTIVO_TITULO_REQUERIDO, status: 422 }
    }
    const db = prismaAsegura()
    const idas = await db.clienteRelacion.findMany({ where: { correduriaId, clienteAId: clienteId, clienteBId: entrada.relacionadoId } })
    // «Sin vínculo» = revisado y no son nada el uno del otro. Autorizar ahí sería
    // abrir las pólizas de la ficha a quien solo conduce su coche. Se corta aquí,
    // no solo escondiendo el botón: el puerto es lo que escribe el consentimiento.
    if (entrada.autoriza && idas.some((i) => !permiteAutorizar(i.tipoRelacion))) {
      return { ok: false, estado: 'invalido', motivo: 'Ese vínculo está anotado como «Sin vínculo»: para autorizar a ver las pólizas hace falta antes una relación de verdad.', status: 422 }
    }

    if (!entrada.autoriza) {
      // Revocar es revocar del todo: se cierran TODAS las vivas de ese par, sea
      // cual sea su alcance. El botón de Alberto dice «deja de ver mis seguros».
      const r = await db.portalAutorizacion.updateMany({
        where: { correduriaId, otorganteClienteId: clienteId, autorizadoClienteId: entrada.relacionadoId, revocadoEn: null },
        data: { revocadoEn: new Date(), revocadoPor: 'corredor', revocadoPorActor: entrada.actor },
      })
      if (r.count === 0) {
        return { ok: false, estado: 'no_encontrado', motivo: 'No hay ninguna autorización que revocar entre esas dos fichas.', status: 404 }
      }
      await anotar(correduriaId, clienteId, `REVOCA la autorización de la ficha ${entrada.relacionadoId} a ver sus pólizas (${r.count} autorización(es)) — anotado desde plataforma por ${entrada.actor}`)
      await anotar(correduriaId, entrada.relacionadoId, `La ficha ${clienteId} le retira la autorización a ver sus pólizas — anotado desde plataforma por ${entrada.actor}`)
      return devolver(correduriaId, clienteId)
    }

    // Ya cortado arriba cuando `autoriza`; aquí solo estrecha el tipo (revocar
    // ya ha vuelto con su `return`, así que a partir de esta línea se concede).
    if (alcance === null) return { ok: false, estado: 'invalido', motivo: motivoAlcanceNoConcedible(tipoOtorgante), status: 422 }

    if (idas.length === 0) {
      const vuelta = await db.clienteRelacion.findFirst({ where: { correduriaId, clienteAId: entrada.relacionadoId, clienteBId: clienteId } })
      if (!vuelta) return { ok: false, estado: 'no_encontrado', motivo: 'Esas fichas no están relacionadas: añade primero la relación.', status: 404 }
      if (!permiteAutorizar(tipoInverso(vuelta.tipoRelacion))) {
        return { ok: false, estado: 'invalido', motivo: 'Ese vínculo está anotado como «Sin vínculo»: para autorizar a ver las pólizas hace falta antes una relación de verdad.', status: 422 }
      }
    }

    // El índice único parcial de la BD (una viva por otorgante+autorizado+alcance)
    // impide dos iguales. Se comprueba antes para poder decir POR QUÉ, en vez de
    // devolver el error crudo de Postgres.
    const viva = await db.portalAutorizacion.findFirst({
      where: { correduriaId, otorganteClienteId: clienteId, autorizadoClienteId: entrada.relacionadoId, alcance, revocadoEn: null },
      select: { id: true, aceptadoEn: true, caducaEn: true, revocadoEn: true },
    })
    const ahora = new Date()
    if (viva) {
      const estado = estadoAutorizacion(viva, ahora)
      // Una CADUCADA sí se puede renovar: se cierra con `revocado_por = 'caducidad'`
      // —que no es una revocación, es liberar el sitio del índice único— y se
      // anota una nueva. Las dos quedan en la tabla, que es la prueba.
      if (estado !== 'caducada') {
        return { ok: false, estado: 'conflicto', motivo: `No se ha anotado: ${porQueYaHay(estado)}.`, status: 409 }
      }
      await db.portalAutorizacion.update({
        where: { id: viva.id },
        data: { revocadoEn: ahora, revocadoPor: 'caducidad', revocadoPorActor: entrada.actor },
      })
    }

    try {
      await db.portalAutorizacion.create({
        data: {
          correduriaId,
          otorganteClienteId: clienteId,
          autorizadoClienteId: entrada.relacionadoId,
          alcance,
          tituloRepresentacion: titulo,
          origen: 'corredor',
          otorgadoPorActor: entrada.actor,
          caducaEn: caducidadPorDefecto(new Date()),
          versionTexto: TEXTO_AUTORIZACION_CORREDOR_V1,
        },
      })
    } catch (e) {
      // Carrera contra el índice único: mismo caso, mismo mensaje.
      if (esViolacionDeUnico(e)) {
        return { ok: false, estado: 'conflicto', motivo: 'No se ha anotado: ya hay una autorización con ese alcance entre esas dos fichas.', status: 409 }
      }
      throw e
    }

    const pendiente = 'Queda PENDIENTE: no verá nada hasta que la acepte en el portal.'
    // El alcance Y el título van en el historial: un apoderamiento anotado sin
    // decir con qué título se ejerce es media prueba, y la mitad que falta es la
    // que hace falta el día que la compañía discuta un parte.
    const detalle = `alcance «${alcance}»${titulo ? `, como ${titulo}` : ''}`
    await anotar(
      correduriaId,
      clienteId,
      `AUTORIZA a la ficha ${entrada.relacionadoId} a ver sus pólizas (${detalle}) — consentimiento recibido por la correduría y anotado desde plataforma por ${entrada.actor}. ${pendiente}`,
    )
    await anotar(
      correduriaId,
      entrada.relacionadoId,
      `La ficha ${clienteId} le autoriza a ver sus pólizas (${detalle}) — anotado desde plataforma por ${entrada.actor}. ${pendiente}`,
    )
    return devolver(correduriaId, clienteId)
  } catch (e) {
    return { ok: false, estado: 'error', motivo: e instanceof Error ? e.message : String(e), status: 500 }
  }
}

function esViolacionDeUnico(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'P2002'
}

/** Borra el vínculo entero (los dos sentidos). */
export async function borrarRelacion(
  correduriaId: string,
  clienteId: string,
  entrada: { relacionadoId: string; actor: string },
): Promise<ResultadoRelacion> {
  try {
    const db = prismaAsegura()
    // Quitar la relación no borra el consentimiento: se revoca, que es lo que
    // deja constancia de que lo hubo y hasta cuándo. Borrarlo sería perder la
    // prueba justo cuando más falta hace.
    await db.portalAutorizacion.updateMany({
      where: {
        correduriaId,
        revocadoEn: null,
        OR: [
          { otorganteClienteId: clienteId, autorizadoClienteId: entrada.relacionadoId },
          { otorganteClienteId: entrada.relacionadoId, autorizadoClienteId: clienteId },
        ],
      },
      data: { revocadoEn: new Date(), revocadoPor: 'corredor', revocadoPorActor: entrada.actor },
    })
    const r = await db.clienteRelacion.deleteMany({
      where: { correduriaId, OR: [{ clienteAId: clienteId, clienteBId: entrada.relacionadoId }, { clienteAId: entrada.relacionadoId, clienteBId: clienteId }] },
    })
    if (r.count === 0) return { ok: false, estado: 'no_encontrado', motivo: 'No había ningún vínculo entre esas fichas.', status: 404 }
    await anotar(correduriaId, clienteId, `Relación con la ficha ${entrada.relacionadoId} borrada desde plataforma por ${entrada.actor} (las autorizaciones vivas entre las dos fichas quedan revocadas)`)
    return devolver(correduriaId, clienteId)
  } catch (e) {
    return { ok: false, estado: 'error', motivo: e instanceof Error ? e.message : String(e), status: 500 }
  }
}

async function anotar(correduriaId: string, clienteId: string, texto: string): Promise<void> {
  try {
    await prismaAsegura().$executeRaw`
      insert into historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${clienteId}::uuid, cast('gestion' as tipo_historial_interno), ${texto})`
  } catch (e) {
    console.error('[cartera-relaciones] historial_interno no se pudo anotar:', e instanceof Error ? e.message : e)
  }
}
