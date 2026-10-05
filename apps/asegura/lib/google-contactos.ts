/**
 * Sincronización CRM ↔ Google Contacts: la parte con BD y red (05/10/2026).
 *
 * El QUÉ (plan de diff, conflictos, dedup por E.164, límite de 25.000) es puro y vive en
 * `@central/module-seguros/google-contactos`. Aquí solo: leer la selección y los vínculos,
 * hablar con Google (`lib/google-people.ts`) y apuntar el resultado.
 *
 * 🔐 El refresh token se guarda CIFRADO (`encryptField`, PII_ENCRYPTION_KEY) y la BD lo exige
 * (`CHECK … LIKE 'v1:%'`). Sin la clave NO se guarda (en desarrollo `encryptField` devolvería el
 * texto en claro: aquí se comprueba y se lanza). Nunca en env, nunca en logs.
 *
 * 🛡️ Ámbito: cada consulta lleva `correduriaId` (Prisma con BYPASSRLS: el filtro es el código).
 */
import { requireSecret } from '@central/core-identity'
import {
  aBorrarAlDesconectar, comprobarLimite, planificarSync, trocear, LOTE_BORRADO_GOOGLE, LOTE_ESCRITURA_GOOGLE, TIPO_ID_EXTERNO,
  type CamposSincronizados, type EstadoVinculo, type OrigenVinculo, type PersonaGoogle, type Plan, type Vinculo,
} from '@central/module-seguros/google-contactos'
import { decryptField, encryptField } from '@central/module-seguros-pii'

import { prismaAsegura } from './asegura-db'
import { contactosMovil } from './contactos-movil'
import {
  accesoDesdeRefresh, People, revocar, SyncTokenCaducado, TokenRevocado,
  type Credenciales, type TokensIniciales,
} from './google-people'
import { estadoClavePii } from './pii-estado'

/** Tope de lotes de escritura por pasada (maxDuration del cron). Lo que quede, la hora siguiente. */
const MAX_LOTES_POR_PASADA = 25

export function credencialesGoogle(): Credenciales {
  return {
    clientId: requireSecret('GOOGLE_CONTACTOS_CLIENT_ID'),
    clientSecret: requireSecret('GOOGLE_CONTACTOS_CLIENT_SECRET'),
    redirectUri: requireSecret('GOOGLE_CONTACTOS_REDIRECT_URI'),
  }
}

export function secretoEstadoGoogle(): string {
  return requireSecret('GOOGLE_CONTACTOS_STATE_SECRET')
}

function cifrar(texto: string): string {
  requireSecret('PII_ENCRYPTION_KEY')
  const c = encryptField(texto)
  if (!c.startsWith('v1:')) throw new Error('El cifrado no se aplicó: no se guarda nada en claro')
  return c
}

function descifrarToken(c: string): string {
  if (!c.startsWith('v1:')) throw new Error('Refresh token sin cifrar en la BD: se rechaza')
  return decryptField(c)
}

/** Mensaje de error apto para la BD: sin nada que parezca un token. */
function saneado(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  return m.replace(/(ya29\.|1\/\/)[\w.-]+/g, '[token]').slice(0, 500)
}

// ─── Conexión ─────────────────────────────────────────────────────────────────

export async function guardarConexion(correduriaId: string, t: TokensIniciales, conectadoPor: string): Promise<void> {
  const db = prismaAsegura()
  const previa = await db.googleContactosConexion.findUnique({ where: { correduriaId } })
  const otraCuenta = !!previa && previa.cuentaGoogle !== t.cuentaGoogle
  if (otraCuenta) {
    // Otra cuenta de Google: los vínculos apuntan a contactos que esta cuenta no tiene.
    await db.googleContactosVinculo.deleteMany({ where: { correduriaId } })
  }
  const datos = {
    cuentaGoogle: t.cuentaGoogle,
    refreshTokenCifrado: cifrar(t.refreshToken),
    scopes: t.scopes,
    syncToken: null,
    estado: 'conectada',
    ultimoError: null,
    conectadoPor,
    conectadoEn: new Date(),
    actualizadoEn: new Date(),
    ...(otraCuenta ? { grupoResourceName: null } : {}),
  }
  await db.googleContactosConexion.upsert({ where: { correduriaId }, create: { correduriaId, ...datos }, update: datos })
  // El token anterior, si lo había, se revoca: no se deja uno vivo sin dueño.
  if (previa) {
    try {
      const viejo = descifrarToken(previa.refreshTokenCifrado)
      if (viejo !== t.refreshToken) await revocar(viejo)
    } catch {
      // Best effort: el nuevo ya está guardado.
    }
  }
}

export type EstadoGoogleContactos =
  | { conectada: false }
  | {
      conectada: true
      estado: string
      cuentaGoogle: string | null
      conectadoEn: string
      ultimaSyncEn: string | null
      ultimaSyncCompletaEn: string | null
      ultimoError: string | null
      vinculados: number
      revisionesPendientes: number
    }

export async function estadoGoogleContactos(correduriaId: string): Promise<EstadoGoogleContactos> {
  const db = prismaAsegura()
  const c = await db.googleContactosConexion.findUnique({ where: { correduriaId } })
  if (!c) return { conectada: false }
  const [vinculados, revisionesPendientes] = await Promise.all([
    db.googleContactosVinculo.count({ where: { correduriaId, estado: 'activo' } }),
    db.googleContactosRevision.count({ where: { correduriaId, estado: 'pendiente' } }),
  ])
  return {
    conectada: true,
    estado: c.estado,
    cuentaGoogle: c.cuentaGoogle,
    conectadoEn: c.conectadoEn.toISOString(),
    ultimaSyncEn: c.ultimaSyncEn?.toISOString() ?? null,
    ultimaSyncCompletaEn: c.ultimaSyncCompletaEn?.toISOString() ?? null,
    ultimoError: c.ultimoError,
    vinculados,
    revisionesPendientes,
  }
}

// ─── Sincronización ───────────────────────────────────────────────────────────

export type ResultadoSync =
  | { estado: 'sin_conexion' | 'revocada' | 'error_previo' }
  | { estado: 'pii_no_descifra'; clave: string }
  | {
      estado: 'ok'
      modo: 'completo' | 'delta'
      completo: boolean
      creados: number
      actualizados: number
      retirados: number
      omitidos: number
      ilegibles: number
      revisionesNuevas: number
      fallidos: number
      avisos: string[]
    }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * absorbida → en quién se fusionó, siguiendo las CADENAS (A→B y después B→C): sin el segundo
 * salto, el vínculo de A no lo heredaba C y se creaba un contacto duplicado.
 */
async function fusionesDe(correduriaId: string, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  let pendientes = [...new Set(ids.filter((id) => UUID.test(id)))]
  for (let salto = 0; salto < 10 && pendientes.length > 0; salto++) {
    const siguientes: string[] = []
    for (const tanda of trocear(pendientes, 5000)) {
      const filas = await prismaAsegura().cliente.findMany({
        where: { correduriaId, id: { in: tanda }, mergedIntoClienteId: { not: null } },
        select: { id: true, mergedIntoClienteId: true },
      })
      for (const f of filas) {
        if (!f.mergedIntoClienteId) continue
        out.set(f.id, f.mergedIntoClienteId)
        if (!out.has(f.mergedIntoClienteId)) siguientes.push(f.mergedIntoClienteId)
      }
    }
    pendientes = [...new Set(siguientes)]
  }
  return out
}

async function guardarVinculo(correduriaId: string, v: { clienteId: string; resourceName: string; etag: string | null; hash: string; origen: OrigenVinculo }): Promise<void> {
  const datos = { resourceName: v.resourceName, etag: v.etag, hashEnviado: v.hash, origen: v.origen, estado: 'activo' as EstadoVinculo, lastSyncedAt: new Date() }
  await prismaAsegura().googleContactosVinculo.upsert({
    where: { correduriaId_clienteId: { correduriaId, clienteId: v.clienteId } },
    create: { correduriaId, clienteId: v.clienteId, ...datos },
    update: datos,
  })
}

async function encolarRevisiones(correduriaId: string, plan: Plan): Promise<number> {
  if (plan.revisiones.length === 0) return 0
  const filas = plan.revisiones.map((r) => ({
    correduriaId,
    clienteId: r.clienteId,
    resourceName: r.resourceName,
    tipo: r.tipo,
    campos: r.campos,
    propuestaCifrada: r.propuesta ? cifrar(JSON.stringify(r.propuesta satisfies CamposSincronizados)) : null,
    huella: r.huella,
  }))
  const { count } = await prismaAsegura().googleContactosRevision.createMany({ data: filas, skipDuplicates: true })
  return count
}

export async function sincronizarGoogleContactos(correduriaId: string): Promise<ResultadoSync> {
  const db = prismaAsegura()
  const conexion = await db.googleContactosConexion.findUnique({ where: { correduriaId } })
  if (!conexion) return { estado: 'sin_conexion' }
  if (conexion.estado === 'revocada') return { estado: 'revocada' }

  // 🚨 Si la clave PII no abre la cartera, todos los teléfonos saldrían «vacíos» y el CRM
  // «ganaría» borrándolos de Google. Sin clave que abra, no se sincroniza nada.
  const muestra = await db.cliente.findFirst({ where: { correduriaId, telefono: { startsWith: 'v1:' } }, select: { telefono: true } })
  const clave = estadoClavePii(muestra?.telefono)
  if (clave !== 'ok') return { estado: 'pii_no_descifra', clave }

  try {
    let acceso: string
    try {
      acceso = await accesoDesdeRefresh(credencialesGoogle(), descifrarToken(conexion.refreshTokenCifrado))
    } catch (e) {
      if (e instanceof TokenRevocado) {
        await db.googleContactosConexion.update({ where: { correduriaId }, data: { estado: 'revocada', ultimoError: saneado(e), actualizadoEn: new Date() } })
        return { estado: 'revocada' }
      }
      throw e
    }
    const people = new People(acceso)
    const grupo = conexion.grupoResourceName ?? (await people.asegurarGrupo())
    if (!conexion.grupoResourceName) {
      await db.googleContactosConexion.update({ where: { correduriaId }, data: { grupoResourceName: grupo } })
    }

    // La MISMA selección que el .vcf del móvil.
    const sel = await contactosMovil(correduriaId)
    const filasVinculo = await db.googleContactosVinculo.findMany({ where: { correduriaId } })
    const vinculos: Vinculo[] = filasVinculo.map((v) => ({
      clienteId: v.clienteId, resourceName: v.resourceName, etag: v.etag, hashEnviado: v.hashEnviado,
      origen: v.origen as OrigenVinculo, estado: v.estado as EstadoVinculo,
    }))

    let modo: 'completo' | 'delta' = conexion.syncToken ? 'delta' : 'completo'
    let listado: Awaited<ReturnType<People['listar']>>
    try {
      listado = await people.listar(conexion.syncToken)
    } catch (e) {
      if (!(e instanceof SyncTokenCaducado)) throw e
      modo = 'completo'
      listado = await people.listar(null)
    }
    // Las fusiones se miran también para los ids externos que hay en Google: un contacto huérfano
    // con el id de una ficha absorbida es de su superviviente (vínculo perdido al fusionar).
    const idsExternos = (ps: PersonaGoogle[]) => ps.flatMap((p) => (p.externalIds ?? []).filter((x) => x.type === TIPO_ID_EXTERNO && x.value).map((x) => x.value!))
    const baseIds = [...sel.contactos.map((c) => c.clienteId), ...vinculos.map((v) => v.clienteId)]
    const planificar = async (google: PersonaGoogle[]) => planificarSync({
      crm: sel.contactos, seleccionCompleta: sel.clientesSinLeer === 0, vinculos,
      fusiones: await fusionesDe(correduriaId, [...baseIds, ...idsExternos(google)]),
      google, modo, grupoResourceName: grupo,
    })
    let plan = await planificar(listado.personas)
    if (plan.necesitaListadoCompleto) {
      // Hay que crear (o conservar un teléfono que no se ve): sin el grupo entero no es fiable.
      modo = 'completo'
      listado = await people.listar(null)
      plan = await planificar(listado.personas)
    }
    if (modo === 'completo') {
      comprobarLimite({ aSincronizar: plan.crear.length + vinculos.length, vinculados: vinculos.length, totalCuenta: listado.totalCuenta })
    }

    const revisionesNuevas = await encolarRevisiones(correduriaId, plan)
    if (plan.olvidar.length) await db.googleContactosVinculo.deleteMany({ where: { correduriaId, clienteId: { in: plan.olvidar } } })
    if (plan.apartar.length) await db.googleContactosVinculo.updateMany({ where: { correduriaId, clienteId: { in: plan.apartar } }, data: { estado: 'fuera_del_grupo' } })
    for (const r of plan.reasignar) {
      // El vínculo apartado de una absorbida pasa a su superviviente: no se recrea el contacto.
      await db.googleContactosVinculo.updateMany({ where: { correduriaId, clienteId: r.de }, data: { clienteId: r.a } })
    }
    for (const r of plan.refrescar) {
      await db.googleContactosVinculo.updateMany({ where: { correduriaId, clienteId: r.clienteId }, data: { etag: r.etag, hashEnviado: r.hash, lastSyncedAt: new Date() } })
    }

    let lotes = 0
    let fallidos = 0
    let actualizados = 0
    let creados = 0
    let retirados = 0

    for (const lote of trocear(plan.actualizar, LOTE_ESCRITURA_GOOGLE)) {
      if (lotes++ >= MAX_LOTES_POR_PASADA) break
      const res = await people.actualizarLote(Object.fromEntries(lote.map((a) => [a.resourceName, a.persona])))
      for (const a of lote) {
        const p = res[a.resourceName]
        // Si Google no lo escribió, el vínculo de la absorbida SE QUEDA: borrarlo antes (como se
        // hacía) perdía el contacto y la hora siguiente se creaba un duplicado.
        if (!p) { fallidos++; continue }
        const v = { clienteId: a.clienteId, resourceName: a.resourceName, etag: p.etag ?? null, hash: a.hash, origen: a.origen }
        if (a.revinculaDe) {
          // Mismo resourceName (UNIQUE): fuera el de la absorbida y dentro el de la superviviente, a la vez.
          await db.$transaction(async (tx) => {
            await tx.googleContactosVinculo.deleteMany({ where: { correduriaId, clienteId: { in: [a.revinculaDe!, v.clienteId] } } })
            await tx.googleContactosVinculo.create({
              data: { correduriaId, clienteId: v.clienteId, resourceName: v.resourceName, etag: v.etag, hashEnviado: v.hash, origen: v.origen, estado: 'activo', lastSyncedAt: new Date() },
            })
          })
        } else {
          await guardarVinculo(correduriaId, v)
        }
        actualizados++
      }
    }

    for (const lote of trocear(plan.crear, LOTE_ESCRITURA_GOOGLE)) {
      if (lotes++ >= MAX_LOTES_POR_PASADA) break
      const res = await people.crearLote(lote.map((c) => c.persona))
      const hechos = lote.flatMap((c, i) => (res[i] ? [{ c, p: res[i]! }] : []))
      fallidos += lote.length - hechos.length
      try {
        await people.anadirAlGrupo(grupo, hechos.map((h) => h.p.resourceName))
      } catch (e) {
        // Un contacto creado FUERA del grupo sería «personal»: se deshace antes de seguir.
        await people.borrarLote(hechos.map((h) => h.p.resourceName)).catch(() => undefined)
        throw e
      }
      for (const { c, p } of hechos) {
        await db.googleContactosVinculo.deleteMany({ where: { correduriaId, clienteId: c.clienteId } })
        await guardarVinculo(correduriaId, { clienteId: c.clienteId, resourceName: p.resourceName, etag: p.etag ?? null, hash: c.hash, origen: 'creado' })
        creados++
      }
    }

    if (plan.retirar.length && lotes < MAX_LOTES_POR_PASADA) {
      // Solo se borra lo que SIGUE en el grupo: lo que Alberto sacó a mano ya no es nuestro.
      const miembros = new Set(await people.miembrosGrupo(grupo))
      const borrables = plan.retirar.filter((r) => miembros.has(r.resourceName))
      for (const lote of trocear(borrables, LOTE_BORRADO_GOOGLE)) {
        lotes++
        await people.borrarLote(lote.map((r) => r.resourceName))
        retirados += lote.length
      }
      await db.googleContactosVinculo.deleteMany({ where: { correduriaId, clienteId: { in: plan.retirar.map((r) => r.clienteId) } } })
    }

    const completo = lotes <= MAX_LOTES_POR_PASADA && fallidos === 0
    await db.googleContactosConexion.update({
      where: { correduriaId },
      data: {
        // Sin terminar, el syncToken NO avanza: lo pendiente se vuelve a ver la hora siguiente.
        syncToken: completo ? listado.nextSyncToken : modo === 'completo' ? null : conexion.syncToken,
        ultimaSyncEn: new Date(),
        ...(completo ? { ultimaSyncCompletaEn: new Date() } : {}),
        ultimoError: null,
        estado: 'conectada',
        actualizadoEn: new Date(),
      },
    })
    return {
      estado: 'ok', modo, completo, creados, actualizados, retirados, omitidos: plan.omitidos, ilegibles: plan.ilegibles,
      revisionesNuevas, fallidos, avisos: plan.avisos,
    }
  } catch (e) {
    await db.googleContactosConexion
      .update({ where: { correduriaId }, data: { ultimoError: saneado(e), actualizadoEn: new Date() } })
      .catch(() => undefined)
    throw e
  }
}

// ─── Desconexión ──────────────────────────────────────────────────────────────

export type ResultadoDesconexion =
  | { estado: 'sin_conexion' }
  | { estado: 'ok'; revocado: boolean; contactosBorrados: number | null; grupoBorrado: boolean; aviso: string | null }

/**
 * Revoca en Google, borra el token y los vínculos. Con `borrarContactos`, borra antes los
 * contactos del grupo que CREÓ el CRM (`aBorrarAlDesconectar`); los vinculados por teléfono/id y los
 * que Alberto añadiera a mano se quedan (sin grupo si este se borra). La cola de revisión se conserva.
 */
export async function desconectarGoogleContactos(correduriaId: string, p: { borrarContactos: boolean }): Promise<ResultadoDesconexion> {
  const db = prismaAsegura()
  const c = await db.googleContactosConexion.findUnique({ where: { correduriaId } })
  if (!c) return { estado: 'sin_conexion' }
  let refresh: string | null = null
  try {
    refresh = descifrarToken(c.refreshTokenCifrado)
  } catch {
    refresh = null
  }

  let contactosBorrados: number | null = null
  let grupoBorrado = false
  let aviso: string | null = null
  if (p.borrarContactos) {
    if (!refresh || !c.grupoResourceName) {
      aviso = 'No se borraron contactos: sin token legible o sin grupo conocido.'
    } else {
      try {
        const people = new People(await accesoDesdeRefresh(credencialesGoogle(), refresh))
        const miembros = await people.miembrosGrupo(c.grupoResourceName)
        // Solo lo que CREÓ el CRM: lo vinculado por teléfono/id era un contacto de Alberto.
        const vinculos = await db.googleContactosVinculo.findMany({ where: { correduriaId }, select: { resourceName: true, origen: true, estado: true } })
        const borrar = aBorrarAlDesconectar(miembros, vinculos)
        for (const lote of trocear(borrar, LOTE_BORRADO_GOOGLE)) await people.borrarLote(lote)
        contactosBorrados = borrar.length
        if (borrar.length === miembros.length) {
          await people.borrarGrupo(c.grupoResourceName)
          grupoBorrado = true
        }
      } catch (e) {
        aviso = `No se pudieron borrar los contactos de Google: ${saneado(e)}`
      }
    }
  }

  let revocado = false
  if (refresh) {
    try {
      await revocar(refresh)
      revocado = true
    } catch (e) {
      aviso = [aviso, `Revocación fallida (${saneado(e)}): quita el acceso a mano en myaccount.google.com/permissions.`].filter(Boolean).join(' ')
    }
  }
  // El token se borra SIEMPRE, aunque la revocación fallara: no se guarda uno vivo sin uso.
  await db.googleContactosVinculo.deleteMany({ where: { correduriaId } })
  await db.googleContactosConexion.delete({ where: { correduriaId } })
  return { estado: 'ok', revocado, contactosBorrados, grupoBorrado, aviso }
}
