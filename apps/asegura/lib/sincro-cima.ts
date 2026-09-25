import { encryptField } from '@central/module-seguros-pii'
import {
  compararConCima,
  huellaDecisionCima,
  WHERE_CARTERA_VIVA,
  type CampoCima,
  type DatosCima,
  type DiferenciaCima,
  type FichaParaCima,
} from '@central/module-seguros'
import { prismaAsegura } from './asegura-db'
import { anadirContacto, anotarHistorialCliente, campoIlegible, descifrarCampo, listarContactos } from './cartera-edicion'

/**
 * Ficha ↔ CIMA (25/09/2026). CIMA deja los datos de la persona en el
 * interviniente de sus pólizas (casado por DNI), no en la ficha. Aquí se leen,
 * se comparan (`compararConCima`, puro) y se APLICAN.
 *
 * Dos políticas, dictadas por Alberto:
 *   - `rellenar`: lo que la ficha no tiene se copia siempre (lo corre el cron).
 *   - `volcar`:   CIMA manda también sobre lo que difiere (una vez, a mano).
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
  /** Huecos que el cron rellenará (o `volcar`). */
  rellenos: number
  /** Fichas que no se pudieron leer: no es «no hay diferencias». */
  ilegibles: number
}

function descifrar(v: string | null | undefined): string | null {
  return descifrarCampo(v)
}

/** Fichas con alguna póliza de cartera viva y DNI conocido. */
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
      polizas: {
        where: { mergedIntoPolizaId: null },
        select: { id: true, tipo: true, numeroPoliza: true, fechaInicio: true },
        orderBy: [{ fechaInicio: 'desc' }],
      },
    },
  })
}

type Viva = Awaited<ReturnType<typeof fichasVivas>>[number]

async function cimaDe(correduriaId: string, c: Viva): Promise<DatosCimaInterno | null> {
  if (!c.dniLookupHash || c.polizas.length === 0) return null
  const orden = new Map(c.polizas.map((p, i) => [p.id, i]))
  const filas = await prismaAsegura().polizaInterviniente.findMany({
    where: { correduriaId, polizaId: { in: c.polizas.map((p) => p.id) }, nifLookupHash: c.dniLookupHash },
    select: { polizaId: true, nombre: true, apellidos: true, fechaNacimiento: true, fechaCarnet: true, telefono: true, email: true },
  })
  if (filas.length === 0) return null
  // La póliza más reciente primero: su dato es el más fresco que ha mandado CIMA.
  filas.sort((a, b) => (orden.get(a.polizaId) ?? 99) - (orden.get(b.polizaId) ?? 99))
  const out: DatosCimaInterno = { nombre: null, fechaNacimiento: null, fechaCarnet: null, telefonos: [], emails: [], nombrePartes: null, ramoCarnet: null, poliza: null }
  for (const f of filas) {
    const p = c.polizas.find((x) => x.id === f.polizaId)
    const nom = descifrar(f.nombre)
    const ape = descifrar(f.apellidos)
    if (!out.nombre && nom) {
      out.nombre = [nom, ape].filter(Boolean).join(' ')
      out.nombrePartes = { nombre: nom.trim(), apellidos: (ape ?? '').trim() }
    }
    const nac = descifrar(f.fechaNacimiento)
    if (!out.fechaNacimiento && nac) out.fechaNacimiento = nac
    const car = descifrar(f.fechaCarnet)
    if (!out.fechaCarnet && car) { out.fechaCarnet = car; out.ramoCarnet = p ? String(p.tipo) : null }
    const tel = descifrar(f.telefono)
    if (tel) out.telefonos.push(tel)
    const em = descifrar(f.email)
    if (em) out.emails.push(em)
    out.poliza ??= p?.numeroPoliza ?? null
  }
  return out
}

async function fichaDe(correduriaId: string, c: Viva): Promise<FichaParaCima> {
  const [carnets, contactos] = await Promise.all([
    prismaAsegura().clienteCarnetConducir.findMany({ where: { clienteId: c.id, correduriaId }, select: { fechaCarnet: true } }),
    listarContactos(correduriaId, c.id),
  ])
  // Un contacto cifrado que no se abre podría ser justo el de CIMA: sin verlo no se compara.
  const lista = (xs: { valor: string | null; ilegible: boolean }[] | undefined) =>
    !xs || xs.some((x) => x.ilegible) ? null : xs.map((x) => x.valor).filter((v): v is string => v !== null)
  return {
    nombre: `${c.nombre} ${c.apellidos}`.trim() || null,
    fechaNacimiento: descifrar(c.fechaNacimiento),
    fechaNacimientoIlegible: campoIlegible(c.fechaNacimiento),
    carnets: carnets.map((k) => (campoIlegible(k.fechaCarnet) ? null : descifrar(k.fechaCarnet))),
    telefonos: contactos ? lista(contactos.telefonos) : null,
    emails: contactos ? lista(contactos.emails) : null,
  }
}

async function huellasDecididas(correduriaId: string): Promise<Set<string>> {
  const filas = await prismaAsegura().$queryRaw<{ cliente_id: string; huella: string }[]>`
    select cliente_id::text, huella from cima_decisiones where correduria_id = ${correduriaId}::uuid`
  return new Set(filas.map((f) => `${f.cliente_id}|${f.huella}`))
}

type Analisis = { c: Viva; cima: DatosCimaInterno; diferencias: DiferenciaCima[] }

async function analizar(correduriaId: string, soloCliente?: string): Promise<{ lista: Analisis[]; fichas: number; sinDatos: number; ilegibles: number }> {
  const vivas = await fichasVivas(correduriaId, soloCliente)
  const lista: Analisis[] = []
  let sinDatos = 0
  let ilegibles = 0
  for (const c of vivas) {
    try {
      const cima = await cimaDe(correduriaId, c)
      if (!cima) { sinDatos++; continue }
      const diferencias = compararConCima(await fichaDe(correduriaId, c), cima)
      if (diferencias.length > 0) lista.push({ c, cima, diferencias })
    } catch (e) {
      ilegibles++
      console.error('[sincro-cima] ficha sin leer:', c.id, e instanceof Error ? e.message : e)
    }
  }
  return { lista, fichas: vivas.length, sinDatos, ilegibles }
}

export async function estadoSincroCima(correduriaId: string): Promise<EstadoSincro> {
  const [{ lista, fichas, sinDatos, ilegibles }, decididas] = await Promise.all([analizar(correduriaId), huellasDecididas(correduriaId)])
  const discrepancias: FichaConCima[] = []
  let rellenos = 0
  for (const a of lista) {
    rellenos += a.diferencias.filter((d) => d.accion === 'rellenar').length
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
      const p = a.cima.nombrePartes
      if (!p || !p.nombre) return { campo: d.campo, ok: false, motivo: 'CIMA no separa nombre y apellidos' }
      await db.cliente.update({ where: { id: clienteId }, data: { nombre: p.nombre, apellidos: p.apellidos, updatedAt: new Date() } })
      break
    }
    case 'fechaNacimiento':
      await db.cliente.update({ where: { id: clienteId }, data: { fechaNacimiento: encryptField(d.cima), updatedAt: new Date() } })
      break
    case 'fechaCarnet': {
      const carnets = await db.clienteCarnetConducir.findMany({ where: { clienteId, correduriaId }, select: { id: true, tipo: true } })
      const destino = carnets.length === 1 ? carnets[0] : carnets.find((k) => k.tipo.toUpperCase() === 'B')
      if (destino) {
        await db.clienteCarnetConducir.update({ where: { id: destino.id }, data: { fechaCarnet: encryptField(d.cima) } })
      } else if (carnets.length === 0 && a.cima.ramoCarnet === 'auto') {
        // CIMA no manda el tipo. El conductor de un turismo lleva el B; en
        // cualquier otro ramo no se adivina y se deja para mano.
        await db.clienteCarnetConducir.create({ data: { clienteId, correduriaId, tipo: 'B', fechaCarnet: encryptField(d.cima) } })
      } else {
        return { campo: d.campo, ok: false, motivo: 'CIMA no dice el tipo de carné' }
      }
      break
    }
    case 'telefono':
    case 'email': {
      const r = await anadirContacto(correduriaId, clienteId, { tipo: d.campo, valor: d.cima, principal: true, forzar: true, actor: quien })
      if (!r.ok) return { campo: d.campo, ok: false, motivo: r.motivo }
      return { campo: d.campo, ok: true }
    }
  }
  await anotarHistorialCliente(
    correduriaId, clienteId, 'gestion',
    `${d.accion === 'rellenar' ? 'Completado' : 'Actualizado'} desde CIMA: ${d.campo}${a.cima.poliza ? ` (póliza ${a.cima.poliza})` : ''} — ${actor}`,
  ).catch(() => undefined)
  return { campo: d.campo, ok: true }
}

/**
 * `rellenar` = solo huecos · `volcar` = huecos + todo lo que difiere (CIMA manda,
 * incluidas las decididas antes). Devuelve lo hecho y lo que no, con su motivo.
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
      if (modo === 'rellenar' && d.accion !== 'rellenar') continue
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
): Promise<{ estado: 'ok' } | { estado: 'no_encontrado' | 'fallo'; motivo: string }> {
  const { lista } = await analizar(correduriaId, clienteId)
  const a = lista[0]
  const d = a?.diferencias.find((x) => x.campo === campo)
  if (!a || !d) return { estado: 'no_encontrado', motivo: 'Esa diferencia ya no existe (la ficha y CIMA coinciden).' }
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
