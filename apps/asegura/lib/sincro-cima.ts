import { encryptField } from '@central/module-seguros-pii'
import {
  compararConCima,
  huellaDecisionCima,
  nombrePropio,
  WHERE_CARTERA_VIVA,
  type CampoCima,
  type DatosCima,
  type DiferenciaCima,
  type FichaParaCima,
} from '@central/module-seguros'
import { prismaAsegura } from './asegura-db'
import { anadirContacto, anotarHistorialCliente, campoIlegible, coincidencias, descifrarCampo } from './cartera-edicion'

/**
 * Ficha ↔ CIMA (25/09/2026). CIMA deja los datos de la persona en el
 * interviniente de sus pólizas (casado por DNI), no en la ficha. Aquí se leen,
 * se comparan (`compararConCima`, puro) y se APLICAN.
 *
 * Dos políticas, dictadas por Alberto:
 *   - `rellenar`: lo que la ficha no tiene se copia siempre (lo corre el cron).
 *   - `volcar`:   CIMA manda también sobre lo que difiere (una vez, a mano).
 *   - automático (26/09/2026): el teléfono nuevo de CIMA se AÑADE como
 *     secundario, el nombre de CIMA que dice más que el de la ficha se toma
 *     (`completar`) y el nombre en mayúsculas se pone en «Nombre Propio», salvo
 *     que ese teléfono ya esté en OTRA ficha: entonces pregunta (`aviso`).
 *   Después, cada diferencia se AVISA y decide él: «usar CIMA» o «mantener el
 *   mío» (esto último se recuerda por huella del valor en `cima_decisiones`,
 *   así que si CIMA manda OTRO valor se vuelve a avisar).
 *
 * 🚨 Solo fichas con cartera VIVA, y la persona se casa por DNI
 * (`nif_lookup_hash` = `dni_lookup_hash`), nunca por nombre ni por
 * `cliente_id`: CIMA a veces engancha el interviniente a una ficha duplicada.
 */

type DatosCimaInterno = DatosCima & {
  nombrePartes: { nombre: string; apellidos: string } | null
  /** Ramo de la póliza de la que sale la fecha del carné (para el tipo). */
  ramoCarnet: string | null
  poliza: string | null
}

export type FichaConCima = {
  clienteId: string
  nombre: string
  diferencias: DiferenciaCima[]
  poliza: string | null
}

export type EstadoSincro = {
  estado: 'ok'
  fichas: number
  sinDatosCima: number
  /** Solo `discrepa` no decididas: lo que tiene que mirar Alberto. */
  discrepancias: FichaConCima[]
  /** Lo que el cron aplicará solo: huecos, teléfonos nuevos y nombres por formatear. */
  rellenos: number
  /** Fichas que no se pudieron leer: no es «no hay diferencias». */
  ilegibles: number
}

function descifrar(v: string | null | undefined): string | null {
  return descifrarCampo(v)
}

/**
 * Fichas con alguna póliza de cartera viva y DNI conocido, CON lo que hace falta
 * para compararlas (contactos y carnés B) en la MISMA consulta.
 *
 * 🚨 Todo va en bloque a propósito (25/09/2026): la primera versión hacía ~4
 * consultas por ficha y en serie (~400 con la cartera de hoy). La pantalla se
 * quedaba cargando sin enseñar nada y, abierta a la vez que el resto de «Hoy»,
 * ayudó a agotar las conexiones de la BD («Too many database connections»).
 */
async function fichasVivas(correduriaId: string, soloCliente?: string) {
  return prismaAsegura().cliente.findMany({
    where: {
      correduriaId,
      mergedIntoClienteId: null,
      ...(soloCliente ? { id: soloCliente } : {}),
      dniLookupHash: { not: null },
      polizas: { some: { AND: [{ mergedIntoPolizaId: null }, WHERE_CARTERA_VIVA] } },
    },
    select: {
      id: true,
      nombre: true,
      apellidos: true,
      fechaNacimiento: true,
      dniLookupHash: true,
      telefono: true,
      email: true,
      telefonos: { select: { telefono: true } },
      emails: { select: { email: true } },
      // Solo los B: es el único tipo con el que se compara lo de CIMA (ver `cimaDe`).
      carnets: { where: { tipo: { equals: 'B', mode: 'insensitive' } }, select: { fechaCarnet: true } },
      polizas: {
        // Solo cartera VIVA: el volcado de 2013-2018 no es «lo que manda CIMA».
        where: { AND: [{ mergedIntoPolizaId: null }, WHERE_CARTERA_VIVA] },
        select: { id: true, tipo: true, numeroPoliza: true, fechaInicio: true },
        // Las que no traen fecha, al final: si no, una sin fecha pasaría por la más reciente.
        orderBy: [{ fechaInicio: { sort: 'desc', nulls: 'last' } }],
      },
    },
  })
}

type Viva = Awaited<ReturnType<typeof fichasVivas>>[number]

type FilaInterviniente = {
  polizaId: string
  nifLookupHash: string | null
  nombre: string | null
  apellidos: string | null
  fechaNacimiento: string | null
  fechaCarnet: string | null
  telefono: string | null
  email: string | null
}

/** Los intervinientes de TODAS las pólizas vivas, en una sola consulta. */
async function intervinientesDe(correduriaId: string, vivas: Viva[]): Promise<Map<string, FilaInterviniente[]>> {
  const ids = vivas.flatMap((c) => c.polizas.map((p) => p.id))
  const porPoliza = new Map<string, FilaInterviniente[]>()
  if (ids.length === 0) return porPoliza
  const filas = await prismaAsegura().polizaInterviniente.findMany({
    where: { correduriaId, polizaId: { in: ids }, nifLookupHash: { not: null } },
    select: { polizaId: true, nifLookupHash: true, nombre: true, apellidos: true, fechaNacimiento: true, fechaCarnet: true, telefono: true, email: true },
    orderBy: [{ polizaId: 'asc' }, { id: 'asc' }],
  })
  for (const f of filas) {
    const l = porPoliza.get(f.polizaId) ?? []
    l.push(f)
    porPoliza.set(f.polizaId, l)
  }
  return porPoliza
}

function cimaDe(c: Viva, porPoliza: Map<string, FilaInterviniente[]>): DatosCimaInterno | null {
  if (!c.dniLookupHash || c.polizas.length === 0) return null
  // Las pólizas ya vienen de la más reciente a la más vieja: su dato es el más fresco que ha mandado CIMA.
  const out: DatosCimaInterno = { nombre: null, fechaNacimiento: null, fechaCarnet: null, telefonos: [], emails: [], nombrePartes: null, ramoCarnet: null, poliza: null }
  let alguna = false
  for (const p of c.polizas) {
    for (const f of porPoliza.get(p.id) ?? []) {
      if (f.nifLookupHash !== c.dniLookupHash) continue
      alguna = true
      const nom = descifrar(f.nombre)
      const ape = descifrar(f.apellidos)
      if (!out.nombre && nom) {
        out.nombre = [nom, ape].filter(Boolean).join(' ')
        out.nombrePartes = { nombre: nom.trim(), apellidos: (ape ?? '').trim() }
      }
      const nac = descifrar(f.fechaNacimiento)
      if (!out.fechaNacimiento && nac) out.fechaNacimiento = nac
      const car = descifrar(f.fechaCarnet)
      // CIMA no dice el tipo de carné. Solo se toma el del conductor de un AUTO,
      // que es el B; el de una moto (A, o B para 125 cc) no se sabe de qué es.
      if (!out.fechaCarnet && car && String(p.tipo) === 'auto') { out.fechaCarnet = car; out.ramoCarnet = 'auto' }
      const tel = descifrar(f.telefono)
      if (tel) out.telefonos.push(tel)
      const em = descifrar(f.email)
      if (em) out.emails.push(em)
      out.poliza ??= p.numeroPoliza ?? null
    }
  }
  return alguna ? out : null
}

/**
 * Lo que dice la ficha, con la MISMA regla que `listarContactos`: las tablas
 * hijas mandan y, si están vacías, vale la columna espejo de `clientes`.
 * Un valor cifrado que no se abre podría ser justo el de CIMA: sin verlo, la
 * lista entera es `null` y ese campo no se compara.
 */
function fichaDe(c: Viva): FichaParaCima {
  const lista = (hijas: string[], columna: string | null): string[] | null => {
    const crudos = hijas.length > 0 ? hijas : columna && columna.trim() !== '' ? [columna] : []
    if (crudos.some((v) => campoIlegible(v))) return null
    return crudos.map((v) => descifrar(v)).filter((v): v is string => v !== null)
  }
  return {
    nombre: `${c.nombre} ${c.apellidos}`.trim() || null,
    fechaNacimiento: descifrar(c.fechaNacimiento),
    fechaNacimientoIlegible: campoIlegible(c.fechaNacimiento),
    carnets: c.carnets.map((k) => (campoIlegible(k.fechaCarnet) ? null : descifrar(k.fechaCarnet))),
    telefonos: lista(c.telefonos.map((t) => t.telefono), c.telefono),
    emails: lista(c.emails.map((e) => e.email), c.email),
  }
}

async function huellasDecididas(correduriaId: string): Promise<Set<string>> {
  const filas = await prismaAsegura().$queryRaw<{ cliente_id: string; huella: string }[]>`
    select cliente_id::text, huella from cima_decisiones where correduria_id = ${correduriaId}::uuid`
  return new Set(filas.map((f) => `${f.cliente_id}|${f.huella}`))
}

type Analisis = { c: Viva; cima: DatosCimaInterno; diferencias: DiferenciaCima[] }

/** Lo que se aplica sin preguntar (lo corre el cron). */
const AUTOMATICAS: readonly DiferenciaCima['accion'][] = ['rellenar', 'anadir', 'completar', 'formatear']

/**
 * Un teléfono que CIMA manda y que YA está en otra ficha no se copia solo: puede
 * ser el matrimonio o el padre (legítimo) o un error de CIMA, y un teléfono
 * compartido es la puerta de entrada al portal cuando el canal sea WhatsApp.
 * Pasa a `discrepa` con el nombre de la otra ficha, y decide Alberto.
 */
async function avisarTelefonosCompartidos(correduriaId: string, lista: Analisis[]): Promise<void> {
  for (const a of lista) {
    for (const d of a.diferencias) {
      if (d.campo !== 'telefono' || (d.accion !== 'anadir' && d.accion !== 'rellenar')) continue
      let otros: Awaited<ReturnType<typeof coincidencias>>
      try {
        otros = await coincidencias(correduriaId, { telefono: d.cima }, a.c.id)
      } catch (e) {
        // Sin poder comprobarlo no se copia solo: pregunta. Y el resto del análisis sigue.
        console.error('[sincro-cima] teléfono sin comprobar:', a.c.id, e instanceof Error ? e.message : e)
        d.accion = 'discrepa'
        d.aviso = 'No se ha podido comprobar si ese teléfono está en otra ficha'
        continue
      }
      if (otros.length === 0) continue
      d.accion = 'discrepa'
      d.aviso = `Ese teléfono ya está en ${otros.length === 1 ? 'la ficha' : 'las fichas'} de ${otros.map((o) => o.nombre).join(', ')}`
    }
  }
}

async function analizar(correduriaId: string, soloCliente?: string): Promise<{ lista: Analisis[]; fichas: number; sinDatos: number; ilegibles: number }> {
  const vivas = await fichasVivas(correduriaId, soloCliente)
  const porPoliza = await intervinientesDe(correduriaId, vivas)
  const lista: Analisis[] = []
  let sinDatos = 0
  let ilegibles = 0
  for (const c of vivas) {
    try {
      const cima = cimaDe(c, porPoliza)
      if (!cima) { sinDatos++; continue }
      const diferencias = compararConCima(fichaDe(c), cima)
      if (diferencias.length > 0) lista.push({ c, cima, diferencias })
    } catch (e) {
      ilegibles++
      console.error('[sincro-cima] ficha sin leer:', c.id, e instanceof Error ? e.message : e)
    }
  }
  await avisarTelefonosCompartidos(correduriaId, lista)
  return { lista, fichas: vivas.length, sinDatos, ilegibles }
}

export async function estadoSincroCima(correduriaId: string): Promise<EstadoSincro> {
  const { lista, fichas, sinDatos, ilegibles } = await analizar(correduriaId)
  const decididas = await huellasDecididas(correduriaId)
  const discrepancias: FichaConCima[] = []
  let rellenos = 0
  for (const a of lista) {
    rellenos += a.diferencias.filter((d) => AUTOMATICAS.includes(d.accion)).length
    const abiertas = a.diferencias.filter(
      (d) => d.accion === 'discrepa' && !decididas.has(`${a.c.id}|${huellaDecisionCima(d.campo, d.cima)}`),
    )
    if (abiertas.length > 0) {
      discrepancias.push({ clienteId: a.c.id, nombre: `${a.c.nombre} ${a.c.apellidos}`.trim(), diferencias: abiertas, poliza: a.cima.poliza })
    }
  }
  discrepancias.sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'))
  return { estado: 'ok', fichas, sinDatosCima: sinDatos, discrepancias, rellenos, ilegibles }
}

export type ResultadoAplicar = { campo: CampoCima; ok: boolean; motivo?: string }

/** Escribe en la ficha el valor de CIMA de UN campo. No decide si debe: eso lo hace quien llama. */
async function aplicarCampo(correduriaId: string, a: Analisis, d: DiferenciaCima, actor: string): Promise<ResultadoAplicar> {
  const db = prismaAsegura()
  const clienteId = a.c.id
  const quien = `CIMA (${actor})`
  switch (d.campo) {
    case 'nombre': {
      // `formatear` reescribe lo que YA tiene la ficha; los demás, lo de CIMA. Siempre en «Nombre Propio».
      const p = d.accion === 'formatear' ? { nombre: a.c.nombre ?? '', apellidos: a.c.apellidos ?? '' } : a.cima.nombrePartes
      if (!p || !p.nombre.trim()) return { campo: d.campo, ok: false, motivo: 'CIMA no separa nombre y apellidos' }
      await db.cliente.update({
        where: { id: clienteId },
        data: { nombre: nombrePropio(p.nombre), apellidos: p.apellidos.trim() ? nombrePropio(p.apellidos) : '', updatedAt: new Date() },
      })
      break
    }
    case 'fechaNacimiento':
      await db.cliente.update({ where: { id: clienteId }, data: { fechaNacimiento: encryptField(d.cima), updatedAt: new Date() } })
      break
    case 'fechaCarnet': {
      // Solo el carné B (la fecha viene del conductor de un auto). Nunca se toca otro tipo.
      const b = await db.clienteCarnetConducir.findFirst({
        where: { clienteId, correduriaId, tipo: { equals: 'B', mode: 'insensitive' } },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      })
      if (b) await db.clienteCarnetConducir.update({ where: { id: b.id }, data: { fechaCarnet: encryptField(d.cima) } })
      else await db.clienteCarnetConducir.create({ data: { clienteId, correduriaId, tipo: 'B', fechaCarnet: encryptField(d.cima) } })
      break
    }
    case 'telefono':
    case 'email': {
      // `anadir` = secundario y sin forzar; solo «Usar CIMA» (discrepa) lo hace principal a sabiendas.
      const r = await anadirContacto(correduriaId, clienteId, {
        tipo: d.campo,
        valor: d.cima,
        principal: d.accion !== 'anadir',
        forzar: d.accion === 'discrepa',
        actor: quien,
      })
      if (!r.ok) return { campo: d.campo, ok: false, motivo: r.motivo }
      return { campo: d.campo, ok: true }
    }
  }
  await anotarHistorialCliente(
    correduriaId, clienteId, 'gestion',
    `${d.accion === 'rellenar' ? 'Completado' : d.accion === 'formatear' ? 'Nombre en formato propio' : 'Actualizado'} desde CIMA: ${d.campo}${a.cima.poliza ? ` (póliza ${a.cima.poliza})` : ''} — ${actor}`,
  ).catch(() => undefined)
  return { campo: d.campo, ok: true }
}

/**
 * `rellenar` = lo automático (huecos, teléfonos nuevos, nombres por formatear) ·
 * `volcar` = eso + todo lo que difiere (CIMA manda, incluidas las decididas
 * antes), SALVO lo que lleva `aviso`: un teléfono de otra ficha no se fuerza en
 * bloque. Devuelve lo hecho y lo que no, con su motivo.
 */
export async function aplicarSincroCima(
  correduriaId: string,
  modo: 'rellenar' | 'volcar',
  actor: string,
): Promise<{ estado: 'ok'; aplicados: number; fallidos: { clienteId: string; campo: CampoCima; motivo: string }[] }> {
  const { lista } = await analizar(correduriaId)
  let aplicados = 0
  const fallidos: { clienteId: string; campo: CampoCima; motivo: string }[] = []
  for (const a of lista) {
    for (const d of a.diferencias) {
      if (modo === 'rellenar' && !AUTOMATICAS.includes(d.accion)) continue
      if (d.aviso) { fallidos.push({ clienteId: a.c.id, campo: d.campo, motivo: `${d.aviso}: decide a mano` }); continue }
      try {
        const r = await aplicarCampo(correduriaId, a, d, actor)
        if (r.ok) aplicados++
        else fallidos.push({ clienteId: a.c.id, campo: d.campo, motivo: r.motivo ?? 'no aplicado' })
      } catch (e) {
        fallidos.push({ clienteId: a.c.id, campo: d.campo, motivo: e instanceof Error ? e.message : 'error' })
      }
    }
  }
  return { estado: 'ok', aplicados, fallidos }
}

/** La decisión de Alberto sobre UNA diferencia de UNA ficha. */
export async function decidirDiferenciaCima(
  correduriaId: string,
  clienteId: string,
  campo: CampoCima,
  decision: 'usar_cima' | 'mantener',
  actor: string,
  /** El valor de CIMA que Alberto tenía en pantalla: se decide sobre ESE, no sobre el de ahora. */
  valorVisto: string,
): Promise<{ estado: 'ok' } | { estado: 'no_encontrado' | 'cambiado' | 'fallo'; motivo: string }> {
  const { lista } = await analizar(correduriaId, clienteId)
  const a = lista[0]
  const d = a?.diferencias.find((x) => x.campo === campo)
  if (!a || !d) return { estado: 'no_encontrado', motivo: 'Esa diferencia ya no existe (la ficha y CIMA coinciden).' }
  if (huellaDecisionCima(campo, d.cima) !== huellaDecisionCima(campo, valorVisto)) {
    return { estado: 'cambiado', motivo: 'CIMA ha mandado otro valor desde que cargaste la pantalla: recarga y vuelve a decidir.' }
  }
  if (decision === 'usar_cima') {
    const r = await aplicarCampo(correduriaId, a, d, actor)
    return r.ok ? { estado: 'ok' } : { estado: 'fallo', motivo: r.motivo ?? 'no aplicado' }
  }
  await prismaAsegura().$executeRaw`
    insert into cima_decisiones (correduria_id, cliente_id, huella, decidido_por)
    values (${correduriaId}::uuid, ${clienteId}::uuid, ${huellaDecisionCima(campo, d.cima)}, ${actor})
    on conflict do nothing`
  await anotarHistorialCliente(correduriaId, clienteId, 'gestion', `Se mantiene el dato de la ficha frente a CIMA: ${campo} — ${actor}`).catch(() => undefined)
  return { estado: 'ok' }
}
