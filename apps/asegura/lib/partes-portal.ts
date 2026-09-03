/**
 * Los PARTES DE SINIESTRO que manda el cliente desde el portal, vistos desde el
 * panel del corredor: la bandeja de Alberto y el movimiento de su estado.
 *
 * La tabla la crea y la rellena el portal (`apps/asegura-portal`, rol
 * `prisma_asegura_portal`, que solo INSERTA y LEE). Aquí se corre con
 * `prisma_seguros` (BYPASSRLS), cuyos grants sobre ella son exactamente
 * `SELECT, UPDATE`: leer todos los partes y moverlos. La pantalla NO vive aquí
 * —vive en `apps/plataforma` → `/correduria`— y llega por el puerto
 * `/api/operador/partes`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🚨 LA REGLA QUE SOSTIENE ESTE FICHERO: un parte enviado NO es un siniestro
 * comunicado a la compañía. Entre que el cliente pulsa «enviar» y que Alberto
 * abre el siniestro en la entidad hay horas o días, y en ese hueco el cliente
 * cree que ya está hecho. Por eso `comunicado` sale SIEMPRE de
 * `comunicadoACompania()` del módulo puro y jamás de un `estado !== 'enviado'`:
 * `recibido` significa «lo hemos leído NOSOTROS», que es justo el estado que se
 * confunde con estar comunicado. Lo vigila
 * `test/regression-portal-parte-siniestro.test.ts`.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Y las tres ausencias que NO se rellenan (regla de la raíz: dato que NO hay ≠
 * dato que NO se ha mirado):
 *
 *   1. `cliente: null` = quien mandó el parte no tiene fila en `portal_vinculo`,
 *      o sea **no lo hemos sabido casar con ninguna ficha de la cartera**. No es
 *      «Cliente desconocido» ni motivo para ocultar el parte: es el aviso de que
 *      Alberto tiene que identificar a esa persona a mano antes de abrir nada.
 *   2. `hayHeridos` / `hayTerceros` son TRI-ESTADO. `null` = no lo ha
 *      contestado; `false` = ha dicho que no. Un `?? false` en cualquier punto
 *      de la cadena le dice a Alberto «sin heridos» de un accidente sobre el que
 *      nadie preguntó.
 *   3. `plazo.fueraDePlazo` es el art. 16 LCS (7 días) y **NO** significa
 *      pérdida de cobertura: la ley solo permite reclamar los daños del retraso,
 *      y perder el derecho exige dolo o culpa grave. Ningún texto puede decir lo
 *      contrario.
 */
import {
  PARTE_ESTADOS,
  comunicadoACompania,
  plazoComunicacion,
  type ParteEstado,
  type PlazoComunicacion,
} from '@central/module-seguros-portal'
import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'

/** La ficha de la cartera detrás de un parte. `null` en la salida = no la sabemos. */
export type ClienteDelParte = {
  id: string
  /**
   * `null` solo si la ficha existe pero su nombre no se pudo leer. Nunca un
   * relleno tipo «Cliente desconocido»: no saber quién es se dice con `cliente:
   * null` en el parte, no con un nombre inventado dentro de una ficha.
   */
  nombre: string | null
}

export type PartePortal = {
  id: string
  cliente: ClienteDelParte | null
  descripcion: string
  /** `YYYY-MM-DD`. */
  fechaHecho: string
  horaAproximada: string | null
  lugar: string | null
  hayHeridos: boolean | null
  hayTerceros: boolean | null
  estado: ParteEstado
  /** 🚨 SIEMPRE de `comunicadoACompania(estado)`. Ver la cabecera. */
  comunicado: boolean
  siniestroId: string | null
  polizaId: string | null
  polizaDeclaradaId: string | null
  /** ISO-8601. */
  creadoEn: string
  plazo: PlazoComunicacion
  /**
   * El parte va sobre una póliza que NO es de la ficha de quien lo mandó — se le
   * autorizó a VERLA (`cliente_relaciones.puede_ver_polizas`) y ha dado parte
   * desde ahí. Es el caso del que conducía el coche de su padre.
   *
   * 🚨 NO es una sospecha y no se marca como tal: es información que Alberto
   * necesita ANTES de abrir nada en la entidad, porque el tomador con quien la
   * compañía va a hablar es este, y a quien hay que llamar para que cuente lo
   * que pasó es el que mandó el parte. Los dos hacen falta.
   *
   * `null` = va sobre una póliza de su propia ficha, o no hay comparación
   * posible (sin `polizaId`, o sin vínculo — y entonces `cliente` ya vale `null`,
   * que es la señal). Lo que NUNCA es `null` es «no he podido mirarlo»: si el
   * `polizaId` está y el titular no se puede leer, esto lanza y la petición sale
   * como error, porque un `null` ahí se leería como «es suyo».
   */
  titularDistinto: ClienteDelParte | null
}

export type FiltrosPartes = {
  estado?: string | null
  clienteId?: string | null
  /** Texto (viene de un query param) o número. Se acota en `limiteParte`. */
  limite?: number | string | null
}

export const LIMITE_PARTES_DEFECTO = 50
export const LIMITE_PARTES_MAX = 200

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function esUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID.test(v)
}

export function esParteEstado(v: unknown): v is ParteEstado {
  return typeof v === 'string' && (PARTE_ESTADOS as readonly string[]).includes(v)
}

/** `limite` acotado. Un `0` o un `-1` que se colara traería la lista vacía y se leería como «no hay partes». */
export function limiteParte(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  if (!Number.isFinite(n)) return LIMITE_PARTES_DEFECTO
  return Math.min(LIMITE_PARTES_MAX, Math.max(1, Math.trunc(n)))
}

/** Nombre visible de una ficha. Vacío ⇒ `null`: una cadena en blanco no es un nombre. */
function nombreCompleto(c: { nombre: string | null; apellidos: string | null }): string | null {
  const t = `${c.nombre ?? ''} ${c.apellidos ?? ''}`.replace(/\s+/g, ' ').trim()
  return t === '' ? null : t
}

type FilaVinculo = { identidad_id: string; cliente_id: string }

/**
 * `portal_vinculo` de esta correduría para esas identidades → ficha de la cartera.
 *
 * ⚠️ Decisión sobre los vínculos MÚLTIPLES (una identidad casada con dos fichas):
 * se devuelve **el más antiguo** (`creado_en`, y el `id` como desempate para que
 * el resultado no dependa del orden en que la BD devuelva las filas) y se deja
 * constancia en el log del servidor. No se adivina «la buena» y tampoco se
 * devuelve `null`: `null` significa en toda esta capa «no lo hemos casado con
 * nadie», y usarlo aquí borraría la diferencia entre no saber quién es y saberlo
 * de más — que se arreglan en sitios distintos (identificar a la persona vs.
 * fusionar dos fichas). El vínculo extra sí queda dicho, en el log, con ids y sin
 * un solo dato personal.
 */
async function vinculosPorIdentidad(correduriaId: string, identidadIds: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  if (identidadIds.length === 0) return mapa
  const filas = await prismaAsegura().$queryRaw<FilaVinculo[]>`
    select identidad_id, cliente_id
    from portal_vinculo
    where correduria_id = ${correduriaId}::uuid
      and identidad_id in (${Prisma.join(identidadIds.map((i) => Prisma.sql`${i}::uuid`))})
    order by identidad_id, creado_en asc, id asc`
  for (const f of filas) {
    const ya = mapa.get(f.identidad_id)
    if (ya === undefined) mapa.set(f.identidad_id, f.cliente_id)
    else if (ya !== f.cliente_id) {
      console.warn(
        `[partes-portal] identidad ${f.identidad_id} vinculada a más de una ficha ` +
          `(${ya} y ${f.cliente_id}); se usa la más antigua. Puede ser una fusión pendiente.`,
      )
    }
  }
  return mapa
}

/** Las identidades vinculadas a una ficha. Lista vacía = esa ficha no tiene a nadie en el portal. */
async function identidadesDeCliente(correduriaId: string, clienteId: string): Promise<string[]> {
  const filas = await prismaAsegura().$queryRaw<{ identidad_id: string }[]>`
    select identidad_id
    from portal_vinculo
    where correduria_id = ${correduriaId}::uuid and cliente_id = ${clienteId}::uuid`
  return [...new Set(filas.map((f) => f.identidad_id))]
}

async function nombresDeClientes(correduriaId: string, ids: string[]): Promise<Map<string, string | null>> {
  const mapa = new Map<string, string | null>()
  if (ids.length === 0) return mapa
  const filas = await prismaAsegura().cliente.findMany({
    where: { id: { in: ids }, correduriaId },
    select: { id: true, nombre: true, apellidos: true },
  })
  for (const c of filas) mapa.set(c.id, nombreCompleto(c))
  return mapa
}

type FilaParte = {
  id: string
  identidadId: string
  polizaId: string | null
  polizaDeclaradaId: string | null
  descripcion: string
  fechaHecho: Date
  horaAproximada: string | null
  lugar: string | null
  hayHeridos: boolean | null
  hayTerceros: boolean | null
  estado: ParteEstado
  siniestroId: string | null
  creadoEn: Date
}

const SELECT_PARTE = {
  id: true,
  identidadId: true,
  polizaId: true,
  polizaDeclaradaId: true,
  descripcion: true,
  fechaHecho: true,
  horaAproximada: true,
  lugar: true,
  hayHeridos: true,
  hayTerceros: true,
  estado: true,
  siniestroId: true,
  creadoEn: true,
} as const

/** Las columnas `date` de Postgres llegan a medianoche UTC. */
function fechaIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Monta la salida del puerto. `titulares` trae el dueño de cada `polizaId` que
 * había que comparar; que falte una que se pidió es un error de quien llama, no
 * un `null` (ver `listarPartes`).
 */
function aParte(
  p: FilaParte,
  ctx: { vinculos: Map<string, string>; titulares: Map<string, string>; nombres: Map<string, string | null>; hoy: Date },
): PartePortal {
  const clienteId = ctx.vinculos.get(p.identidadId) ?? null
  const cliente: ClienteDelParte | null =
    clienteId === null ? null : { id: clienteId, nombre: ctx.nombres.get(clienteId) ?? null }

  // Solo hay comparación que hacer si sabemos de quién es el parte Y sobre qué
  // póliza va. Sin vínculo el `cliente: null` ya dice lo que hay que decir.
  let titularDistinto: ClienteDelParte | null = null
  if (clienteId !== null && p.polizaId !== null) {
    const titularId = ctx.titulares.get(p.polizaId)
    if (titularId === undefined) {
      // No es «es suyo»: es que no se ha podido determinar. Se grita.
      throw new Error(`titular_indeterminado: la póliza ${p.polizaId} del parte ${p.id} no está en esta correduría`)
    }
    if (titularId !== clienteId) titularDistinto = { id: titularId, nombre: ctx.nombres.get(titularId) ?? null }
  }

  return {
    id: p.id,
    cliente,
    descripcion: p.descripcion,
    fechaHecho: fechaIso(p.fechaHecho),
    horaAproximada: p.horaAproximada,
    lugar: p.lugar,
    // Los dos van tal cual: `null` es «no lo ha contestado» y viaja como `null`.
    hayHeridos: p.hayHeridos,
    hayTerceros: p.hayTerceros,
    estado: p.estado,
    comunicado: comunicadoACompania(p.estado),
    siniestroId: p.siniestroId,
    polizaId: p.polizaId,
    polizaDeclaradaId: p.polizaDeclaradaId,
    creadoEn: p.creadoEn.toISOString(),
    plazo: plazoComunicacion({ fechaHecho: p.fechaHecho, hoy: ctx.hoy }),
    titularDistinto,
  }
}

/** Resuelve el contexto (vínculos, titulares, nombres) de un lote de partes y los monta. */
async function completar(correduriaId: string, filas: FilaParte[], hoy: Date): Promise<PartePortal[]> {
  if (filas.length === 0) return []
  const db = prismaAsegura()
  const vinculos = await vinculosPorIdentidad(correduriaId, [...new Set(filas.map((f) => f.identidadId))])

  // El titular solo se busca donde hay comparación que hacer. Se lee con
  // `prisma_seguros` (BYPASSRLS) filtrando SIEMPRE por `correduriaId`: sin ese
  // filtro un id ajeno no daría error, daría los datos de otra correduría.
  const polizaIds = [
    ...new Set(
      filas
        .filter((f) => f.polizaId !== null && vinculos.has(f.identidadId))
        .map((f) => f.polizaId as string),
    ),
  ]
  const titulares = new Map<string, string>()
  if (polizaIds.length > 0) {
    const polizas = await db.poliza.findMany({
      where: { id: { in: polizaIds }, correduriaId },
      select: { id: true, clienteId: true },
    })
    for (const p of polizas) titulares.set(p.id, p.clienteId)
  }

  const idsFicha = [...new Set([...vinculos.values(), ...titulares.values()])]
  const nombres = await nombresDeClientes(correduriaId, idsFicha)
  return filas.map((f) => aParte(f, { vinculos, titulares, nombres, hoy }))
}

/**
 * La bandeja. Lanza si la cartera no se puede leer o si un parte apunta a una
 * póliza que no está en esta correduría: quien llama lo convierte en
 * `{ estado:'error', causa }`, nunca en una lista vacía.
 *
 * `clienteId` filtra por **quién mandó el parte** (su vínculo), no por el titular
 * de la póliza: un parte sobre una póliza autorizada sale bajo quien lo escribió.
 */
export async function listarPartes(correduriaId: string, f: FiltrosPartes = {}, hoy: Date = new Date()): Promise<PartePortal[]> {
  const db = prismaAsegura()
  const where: { estado?: ParteEstado; identidadId?: { in: string[] } } = {}
  if (esParteEstado(f.estado)) where.estado = f.estado
  if (esUuid(f.clienteId)) {
    const ids = await identidadesDeCliente(correduriaId, f.clienteId)
    // Sin identidades vinculadas a esa ficha no hay partes suyos. Es una
    // ausencia comprobada, no un fallo: la consulta se hizo.
    if (ids.length === 0) return []
    where.identidadId = { in: ids }
  }
  const filas: FilaParte[] = await db.portalParteSiniestro.findMany({
    where,
    select: SELECT_PARTE,
    orderBy: { creadoEn: 'desc' },
    take: limiteParte(f.limite),
  })
  return completar(correduriaId, filas, hoy)
}

// ─── Movimiento de estado ────────────────────────────────────────────────────

/**
 * Las transiciones permitidas, y solo esas.
 *
 * - `abierto_en_compania` es TERMINAL: el siniestro ya existe en la entidad y el
 *   portal se lo ha contado al cliente. Deshacerlo desde aquí convertiría en
 *   mentira algo que ya se dijo; si hubo un error, es una llamada, no un PATCH.
 * - `descartado` puede volver a `recibido` (rectificar un descarte y volver a
 *   mirarlo), pero **nunca a `enviado`**: «nadie lo ha mirado todavía» es falso
 *   en cuanto alguien lo miró.
 * - Repetir el estado actual tampoco es una transición: devolvería un 200 tras
 *   reescribir en silencio el siniestro enlazado o el motivo del descarte.
 */
export const TRANSICIONES: Record<ParteEstado, readonly ParteEstado[]> = {
  enviado: ['recibido', 'abierto_en_compania', 'descartado'],
  recibido: ['abierto_en_compania', 'descartado'],
  abierto_en_compania: [],
  descartado: ['recibido'],
}

export function transicionValida(de: ParteEstado, a: ParteEstado): boolean {
  return TRANSICIONES[de].includes(a)
}

export type EntradaMoverParte = {
  id: unknown
  estado: unknown
  siniestroId?: unknown
  motivoDescarte?: unknown
  actor?: unknown
}

export type ResultadoMoverParte =
  | { ok: true; parte: PartePortal }
  | { ok: false; error: 'datos_invalidos' | 'no_encontrado' | 'siniestro_requerido' | 'motivo_requerido' | 'transicion_invalida'; status: 400 | 404 | 409 }

const fallo = (error: Exclude<ResultadoMoverParte, { ok: true }>['error'], status: 400 | 404 | 409): ResultadoMoverParte => ({ ok: false, error, status })

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

/**
 * Anota el movimiento en la bitácora de la ficha (`historial_interno`, tipo
 * `siniestro`) — la misma que pinta la carpeta «Historial» de la ficha.
 *
 * Best-effort **pero no mudo**: si falla, el cambio de estado NO se deshace (ya
 * está en la BD y es lo que importa) y el motivo se registra en el log del
 * servidor, como en `lib/cartera-siniestros.ts`. Sin cliente vinculado no hay
 * ficha de la que colgarlo: no se anota nada y se dice por qué.
 *
 * No se copia la descripción del hecho ni ningún dato personal.
 */
async function anotarHistorial(correduriaId: string, clienteId: string, texto: string): Promise<void> {
  try {
    await prismaAsegura().$executeRaw`
      insert into historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${clienteId}::uuid, cast('siniestro' as tipo_historial_interno), ${texto})`
  } catch (e) {
    console.error('[partes-portal] historial_interno no se pudo anotar:', e instanceof Error ? e.message : e)
  }
}

/**
 * Mueve el estado de un parte.
 *
 * `abierto_en_compania` exige un `siniestroId` que EXISTA en esta correduría: es
 * el único estado que autoriza a decirle al cliente que su compañía lo sabe, y
 * sin siniestro detrás esa frase es falsa. La BD lo respalda con el CHECK
 * `portal_parte_abierto_con_sello` (estado ⇒ sello + siniestro); si ese CHECK
 * salta, el error sube tal cual — no se traga, porque significa que la guarda de
 * aquí arriba se ha roto.
 */
export async function moverParte(correduriaId: string, entrada: EntradaMoverParte): Promise<ResultadoMoverParte> {
  const id = cadena(entrada.id)
  if (id === null || !esUuid(id)) return fallo('datos_invalidos', 400)
  if (!esParteEstado(entrada.estado)) return fallo('datos_invalidos', 400)
  const nuevo: ParteEstado = entrada.estado
  const actor = cadena(entrada.actor) ?? 'plataforma'
  const db = prismaAsegura()

  const actual: FilaParte | null = await db.portalParteSiniestro.findFirst({ where: { id }, select: SELECT_PARTE })
  if (actual === null) return fallo('no_encontrado', 404)
  if (!transicionValida(actual.estado, nuevo)) return fallo('transicion_invalida', 409)

  const data: Record<string, unknown> = { estado: nuevo, actualizadoEn: new Date() }

  if (nuevo === 'recibido') data.recibidoAt = new Date()

  if (nuevo === 'abierto_en_compania') {
    const siniestroId = cadena(entrada.siniestroId)
    // Falta o no existe: el mismo error a propósito. Desde fuera las dos cosas
    // se arreglan igual (poner el siniestro bueno) y distinguirlas diría si un
    // uuid ajeno existe o no en la cartera.
    if (siniestroId === null || !esUuid(siniestroId)) return fallo('siniestro_requerido', 400)
    const s = await db.siniestro.findFirst({ where: { id: siniestroId, correduriaId }, select: { id: true } })
    if (s === null) return fallo('siniestro_requerido', 400)
    data.siniestroId = siniestroId
    data.abiertoEnCompaniaAt = new Date()
  }

  if (nuevo === 'descartado') {
    // Un descarte sin motivo es una decisión que nadie puede revisar tres meses
    // después — ni Alberto, ni el cliente que pregunte por qué no se abrió.
    const motivo = cadena(entrada.motivoDescarte)
    if (motivo === null) return fallo('motivo_requerido', 400)
    data.motivoDescarte = motivo
    data.descartadoAt = new Date()
  }

  const fila: FilaParte = await db.portalParteSiniestro.update({ where: { id }, data, select: SELECT_PARTE })
  const [parte] = await completar(correduriaId, [fila], new Date())

  const clienteId = parte.cliente?.id ?? null
  if (clienteId === null) {
    console.warn(
      `[partes-portal] parte ${id} movido a «${nuevo}» SIN anotar en el historial: ` +
        'quien lo mandó no está vinculado a ninguna ficha de la cartera.',
    )
  } else {
    const detalle =
      nuevo === 'abierto_en_compania'
        ? ` (siniestro ${String(data.siniestroId)})`
        : nuevo === 'descartado'
          ? ` — motivo: ${String(data.motivoDescarte).slice(0, 200)}`
          : ''
    await anotarHistorial(
      correduriaId,
      clienteId,
      `Parte del portal del ${fechaIso(actual.fechaHecho)}: ${actual.estado} → ${nuevo}${detalle} por ${actor}`,
    )
  }

  return { ok: true, parte }
}
