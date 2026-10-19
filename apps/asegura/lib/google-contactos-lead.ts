/**
 * Lead de correo → Google Contacts AL MOMENTO (19/10/2026, Alberto amplía el alcance de la skill
 * `google-contactos`). Lo llama `POST /api/operador/google-contactos/lead` justo tras el alta del lead de
 * hola@ (plataforma, triaje de correo) y, a mano, el RELLENO de los leads de correo antiguos.
 *
 * Las reglas NO se duplican: se arma EL MISMO plan que el cron (`planificarSync`, agenda completa, vínculos,
 * fusiones, titulares; selección + las fichas pedidas) y `accionesParaFichas` (puro, con test) se queda SOLO
 * con lo de esas fichas: crear, adoptar/vincular (E.164 + nombre) o encolar la duda. Lo demás del plan
 * (otras fichas: actualizar, retirar, desvincular, propuestas) es del cron y aquí NO se ejecuta.
 *
 * 🚨 Compuerta, LO PRIMERO (antes de cualquier escritura, también la etiqueta): sin conexión viva y sin
 * `sync_activada_en` no se escribe NADA (`sin_conexion` / `no_activada`). Si la clave PII no abre la
 * cartera, tampoco (regla 7). El vínculo se guarda igual que el cron (`guardarVinculo`), así que el cron
 * horario lo mantiene (la selección incluye los leads de correo con vínculo) y ni lo duplica ni lo borra.
 *
 * 🛡️ Ámbito: todo con `correduriaId`. Sin PII en la respuesta ni en logs (solo códigos y `e.name`).
 */
import { comprobarLimite, planificarSync, puertaSync, trocear, LOTE_ESCRITURA_GOOGLE, TIPO_ID_EXTERNO } from '@central/module-seguros/google-contactos'
import {
  accionesParaFichas, MAX_FICHAS_CONTACTO_LEAD,
  type MotivoContactoLead, type ResultadoFichaContacto,
} from '@central/module-seguros/google-contactos-lead'

import { prismaAsegura } from './asegura-db'
import { hoyMadrid, seleccionGoogle } from './contactos-google'
import {
  credencialesGoogle, descifrarToken, encolarRevisiones, fusionesDe, guardarVinculo, leerVinculos, titularesGoogle,
} from './google-contactos'
import { accesoDesdeRefresh, People, TokenRevocado } from './google-people'
import { Prisma } from './generated/asegura-client'
import { estadoClavePii } from './pii-estado'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ResultadoContactosLead =
  | { estado: 'no_activada' | 'sin_conexion' | 'error'; motivo: MotivoContactoLead }
  | { estado: 'ok'; ensayo: boolean; resultados: ({ clienteId: string } & ResultadoFichaContacto)[] }

/**
 * Añade a Google Contacts SOLO las fichas pedidas (máx. `MAX_FICHAS_CONTACTO_LEAD`). Idempotente: una
 * ficha con vínculo responde `ya_estaba` sin escribir; la cola deduplica por huella. Con `ensayo`, dice
 * qué pasaría sin escribir nada (ni la etiqueta).
 */
export async function anadirFichasAGoogle(
  correduriaId: string,
  clienteIds: readonly string[],
  opciones: { ensayo?: boolean } = {},
): Promise<ResultadoContactosLead> {
  const db = prismaAsegura()
  const conexion = await db.googleContactosConexion.findUnique({ where: { correduriaId } })
  // 🚨 La compuerta del cron, LO PRIMERO.
  const puerta = puertaSync(conexion)
  if (puerta === 'pendiente_activar') return { estado: 'no_activada', motivo: 'pendiente_activar' }
  if (puerta === 'revocada') return { estado: 'sin_conexion', motivo: 'revocada' }
  if (puerta !== 'adelante' || !conexion) return { estado: 'sin_conexion', motivo: 'sin_conexion' }

  const objetivos = [...new Set(clienteIds.filter((id) => UUID.test(id)))].slice(0, MAX_FICHAS_CONTACTO_LEAD)
  const ensayo = opciones.ensayo === true
  if (objetivos.length === 0) return { estado: 'ok', ensayo, resultados: [] }

  // Regla 7: si la clave PII no abre la cartera, los teléfonos saldrían «vacíos»: no se escribe nada.
  const muestra = await db.cliente.findFirst({ where: { correduriaId, telefono: { startsWith: 'v1:' } }, select: { telefono: true } })
  if (estadoClavePii(muestra?.telefono) !== 'ok') return { estado: 'error', motivo: 'pii_no_descifra' }

  let acceso: string
  try {
    acceso = await accesoDesdeRefresh(credencialesGoogle(), descifrarToken(conexion.refreshTokenCifrado))
  } catch (e) {
    // Sin marcar la conexión: eso lo hace el cron. Aquí solo se informa.
    if (e instanceof TokenRevocado) return { estado: 'sin_conexion', motivo: 'revocada' }
    throw e
  }
  const people = new People(acceso)
  // En ensayo la etiqueta solo se BUSCA (no se crea); si no existe, nada está dentro de ella.
  const grupo = conexion.grupoResourceName ?? (ensayo ? ((await people.buscarGrupo()) ?? '') : await people.asegurarGrupo())
  if (!ensayo && !conexion.grupoResourceName) {
    await db.googleContactosConexion.update({ where: { correduriaId }, data: { grupoResourceName: grupo } })
  }

  const sel = await seleccionGoogle(correduriaId, hoyMadrid(), { leadsCorreo: objetivos })
  const vinculos = await leerVinculos(correduriaId)
  const listado = await people.listar(null)
  const idsExternos = listado.personas.flatMap((p) => (p.externalIds ?? []).filter((x) => x.type === TIPO_ID_EXTERNO && x.value).map((x) => x.value!))
  const fusiones = await fusionesDe(correduriaId, [...sel.contactos.map((c) => c.clienteId), ...vinculos.map((v) => v.clienteId), ...idsExternos])
  const plan = planificarSync({
    crm: sel.contactos, seleccionCompleta: false, vinculos, fusiones, google: listado.personas, modo: 'completo',
    grupoResourceName: grupo, ...(await titularesGoogle(correduriaId)),
  })
  const acc = accionesParaFichas({ plan, objetivos, vinculos, seleccion: sel.contactos })
  const resultados = new Map(acc.resultados)
  const salida = () => ({ estado: 'ok' as const, ensayo, resultados: objetivos.map((clienteId) => ({ clienteId, ...resultados.get(clienteId)! })) })
  if (ensayo) return salida()

  try {
    comprobarLimite({ aSincronizar: acc.crear.length + vinculos.length, vinculados: vinculos.length, totalCuenta: listado.totalCuenta })
  } catch {
    return { estado: 'error', motivo: 'limite' }
  }

  await encolarRevisiones(correduriaId, { revisiones: acc.revisiones })
  const fallo = (clienteId: string) => resultados.set(clienteId, { estado: 'error', motivo: 'fallo_google' })

  // ADOPTAR / VINCULAR (ya estaba en la agenda): igual que el cron. Primero se escribe; si era de fuera de
  // la etiqueta, se mete en ella ANTES de guardar el vínculo (sin eso no se guarda: lo repetiría el cron).
  for (const lote of trocear(acc.actualizar, LOTE_ESCRITURA_GOOGLE)) {
    const res = await people.actualizarLote(Object.fromEntries(lote.map((a) => [a.resourceName, a.persona])))
    const escritos = lote.flatMap((a) => (res[a.resourceName] ? [{ a, p: res[a.resourceName]! }] : []))
    for (const a of lote) if (!res[a.resourceName]) fallo(a.clienteId)
    const adoptados = escritos.filter((x) => x.a.anadirAlGrupo).map((x) => x.a.resourceName)
    let adopcionOk = true
    if (adoptados.length) {
      try {
        await people.anadirAlGrupo(grupo, adoptados)
      } catch {
        adopcionOk = false
      }
    }
    for (const { a, p } of escritos) {
      if (a.anadirAlGrupo && !adopcionOk) { fallo(a.clienteId); continue }
      await guardarVinculo(correduriaId, { clienteId: a.clienteId, resourceName: a.resourceName, etag: p.etag ?? null, hash: a.hash, origen: a.origen }, a.revinculaDe ? [a.revinculaDe] : [])
    }
  }

  // CREAR: dentro de la etiqueta o nada (un contacto creado fuera sería «personal»: se deshace).
  for (const lote of trocear(acc.crear, LOTE_ESCRITURA_GOOGLE)) {
    const res = await people.crearLote(lote.map((c) => c.persona))
    const hechos = lote.flatMap((c, i) => (res[i] ? [{ c, p: res[i]! }] : []))
    lote.forEach((c, i) => { if (!res[i]) fallo(c.clienteId) })
    if (hechos.length === 0) continue
    try {
      await people.anadirAlGrupo(grupo, hechos.map((h) => h.p.resourceName))
    } catch {
      await people.borrarLote(hechos.map((h) => h.p.resourceName)).catch(() => undefined)
      for (const h of hechos) fallo(h.c.clienteId)
      continue
    }
    for (const { c, p } of hechos) {
      await guardarVinculo(correduriaId, { clienteId: c.clienteId, resourceName: p.resourceName, etag: p.etag ?? null, hash: c.hash, origen: 'creado' })
    }
  }
  return salida()
}

/** Condición común del relleno: leads de correo activos, sin fusionar, sin vínculo y sin duda en la cola. */
const SIN_CONTACTO = Prisma.sql`c.fuente::text = 'correo' and c.activo and c.merged_into_cliente_id is null
      and not exists (select 1 from google_contactos_vinculo v where v.correduria_id = c.correduria_id and v.cliente_id = c.id)
      -- Ya con una duda en la cola (pendiente o resuelta): la decide Alberto, el relleno no la repite.
      and not exists (select 1 from google_contactos_revision r where r.correduria_id = c.correduria_id and r.cliente_id = c.id)`

/**
 * RELLENO: los leads de correo (`fuente='correo'`, activos, sin fusionar) que aún NO tienen vínculo, del más
 * reciente al más antiguo, sin los que ya tienen una duda en la cola. Solo lectura. Volver a llamarlo es
 * seguro: los ya añadidos (o encolados) ya no salen.
 * `rotar` (solo el relleno automático del cron): orden barajado con semilla de la HORA, para que las fichas
 * que no avanzan (sin teléfono legible, fuera de alcance…) no ocupen siempre la cabeza del lote.
 * `excluir`: ids ya intentados en esta pasada (no se reintentan dentro de ella).
 */
export async function leadsCorreoSinContacto(
  correduriaId: string, limite: number, opciones: { rotar?: boolean; excluir?: readonly string[] } = {},
): Promise<string[]> {
  const n = Math.max(1, Math.min(MAX_FICHAS_CONTACTO_LEAD, Math.floor(limite)))
  const excluir = (opciones.excluir ?? []).filter((id) => UUID.test(id))
  const semilla = opciones.rotar ? new Date().toISOString().slice(0, 13) : ''
  const filas = await prismaAsegura().$queryRaw<{ id: string }[]>(Prisma.sql`
    select c.id::text as id
    from clientes c
    where c.correduria_id = ${correduriaId}::uuid and ${SIN_CONTACTO}
      and c.id <> all(${excluir}::uuid[])
    order by ${opciones.rotar ? Prisma.sql`md5(c.id::text || ${semilla})` : Prisma.sql`c.created_at desc, c.id`}
    limit ${n}`)
  return filas.map((f) => f.id)
}

/** Cuántos leads de correo siguen sin contacto ni duda (solo un número; sin PII). Los que no avanzan cuentan. */
export async function contarLeadsCorreoSinContacto(correduriaId: string): Promise<number> {
  const f = await prismaAsegura().$queryRaw<{ n: number }[]>(Prisma.sql`
    select count(*)::int as n from clientes c where c.correduria_id = ${correduriaId}::uuid and ${SIN_CONTACTO}`)
  return f[0]?.n ?? 0
}

export const LOTE_RELLENO = 10
export const MAX_LOTES_RELLENO = 3
/** No se abre otro lote pasado este tiempo desde que arrancó el cron (maxDuration 300 s; cada lote lista la agenda). */
export const PRESUPUESTO_RELLENO_MS = 150_000

export type InformeRelleno = { estado: 'ok' | 'fin' | 'detenido'; motivo?: MotivoContactoLead; lotes: number; totales: Record<string, number>; pendientes: number | null }

/**
 * RELLENO AUTOMÁTICO (19/10/2026): lo llama el cron horario tras la sincronización. Sin tabla ni SQL nuevos:
 * lotes pequeños de `leadsCorreoSinContacto` (barajados por hora) por `anadirFichasAGoogle`, que ya es
 * idempotente (vínculo ⇒ `ya_estaba` sin escribir; huella única en la cola). Se para solo: con 0 pendientes
 * no pide ningún lote (ni toca Google) y responde `fin`. Límite conocido: una ficha que no avanza (sin
 * teléfono legible, `fuera_de_alcance`…) no deja rastro, así que cuenta como pendiente y se reintenta cada
 * hora (la baraja por hora evita que bloquee a las demás). Sin PII.
 */
export async function rellenarLeadsCorreo(
  correduriaId: string, desde: number = Date.now(),
  ajustes: { lote?: number; maxLotes?: number; presupuestoMs?: number } = {},
): Promise<InformeRelleno> {
  const lote = ajustes.lote ?? LOTE_RELLENO
  const maxLotes = ajustes.maxLotes ?? MAX_LOTES_RELLENO
  const presupuesto = ajustes.presupuestoMs ?? PRESUPUESTO_RELLENO_MS
  const totales: Record<string, number> = {}
  const intentados: string[] = []
  let lotes = 0
  while (lotes < maxLotes && Date.now() - desde < presupuesto) {
    const ids = await leadsCorreoSinContacto(correduriaId, lote, { rotar: true, excluir: intentados })
    if (ids.length === 0) break
    intentados.push(...ids)
    const r = await anadirFichasAGoogle(correduriaId, ids)
    lotes++
    // Conexión sin activar / revocada / clave PII / límite: nada que hacer ahora; se reintenta en la hora siguiente.
    if (r.estado !== 'ok') return { estado: 'detenido', motivo: r.motivo, lotes, totales, pendientes: null }
    for (const x of r.resultados) totales[x.estado] = (totales[x.estado] ?? 0) + 1
  }
  const pendientes = await contarLeadsCorreoSinContacto(correduriaId)
  return { estado: pendientes === 0 ? 'fin' : 'ok', lotes, totales, pendientes }
}
