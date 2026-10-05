// Sincronización CRM → Google Contacts (05/10/2026). Lógica PURA: qué se crea, qué se
// actualiza, qué se deja y qué va a revisión. La red (People API) y la BD viven en
// `apps/asegura/lib/google-contactos*.ts`; aquí no hay `fetch` ni Prisma.
//
// Reglas (decididas por Alberto, no se reabren aquí):
//   · El CRM es la FUENTE DE VERDAD. Un campo gestionado que se edita en Google se vuelve a
//     pisar con lo del CRM, pero lo que había en Google se guarda en la cola de revisión: no se
//     pierde en silencio.
//   · Solo se tocan contactos del grupo «Grupo ASegura». Jamás uno personal.
//   · Un contacto NUEVO en Google dentro del grupo es una PROPUESTA de lead, nunca un alta.
//   · Antes de crear, se busca en el grupo el mismo teléfono (E.164): si hay uno y solo uno, se
//     vincula en vez de duplicar; si hay más de uno (o dos fichas del CRM lo comparten) se para
//     y va a revisión — dos personas distintas no se funden por un teléfono.
//   · La misma selección que el .vcf del móvil (`contactosMovil` de apps/asegura), sin fichas
//     fusionadas. Límite de Google: 25.000 contactos por cuenta → se aborta con error claro.
//
// 🚨 NULL = «no se sabe». Un teléfono/correo que llega CIFRADO (`v1:…`) es que la clave no lo
// abrió: esa ficha NO se toca (ni se crea, ni se actualiza, ni se retira). Pisar Google con un
// hueco que en realidad es «no se pudo leer» borraría el teléfono de un cliente del móvil.
// Y si la selección vino incompleta (una consulta caída), NO se retira nada: «no está en la
// lista» no significa «ya no es cliente» si la lista está a medias.

import { createHash } from 'node:crypto'

import { aE164 } from './telefono-e164.ts'
import type { ContactoMovil, GrupoContacto } from './vcard.ts'

export const NOMBRE_GRUPO_GOOGLE = 'Grupo ASegura'
/** Tope de Google por cuenta (contactos totales, no solo los del grupo). */
export const LIMITE_CONTACTOS_GOOGLE = 25_000
/** `people:batchCreateContacts` y `people:batchUpdateContacts` admiten 200 por llamada. */
export const LOTE_ESCRITURA_GOOGLE = 200
/** `people:batchDeleteContacts` admite 500. */
export const LOTE_BORRADO_GOOGLE = 500
export const TIPO_ID_EXTERNO = 'asegura'
/** Los únicos campos que gestiona el CRM. Nada fuera de aquí se pisa en Google. */
export const MASCARA_GESTIONADA = 'names,phoneNumbers,emailAddresses,organizations,externalIds'
/** Un barrido que retiraría más que esto se BLOQUEA (y se avisa): huele a selección rota. */
export const MAX_RETIRADA_POR_PASADA = 50

const ETIQUETA: Record<GrupoContacto, string> = { cliente: 'Cliente', lead: 'Lead' }
// `(?:^|\s)`: sin apellidos el familyName es «· AS Lead» (sin espacio delante). Con ` · AS` a secas
// no casaba, el apellido leído de Google era «· AS Lead» ≠ '' y CADA HORA se reescribía (y se
// encolaba un «cambio en Google» falso) para todos los leads, que llegan sin apellidos.
const SUFIJO = /(?:^|\s)· AS (Cliente|Lead)$/
/** Lo que se escribe en Google cuando la ficha no tiene ni nombre ni apellidos; al leer vuelve a ''. */
const SIN_NOMBRE = '(sin nombre)'

export type CamposSincronizados = {
  nombre: string
  apellidos: string
  /** E.164 si es válido; si no, lo tecleado limpio; `null` = no consta. */
  telefono: string | null
  email: string | null
  grupo: GrupoContacto | null
}

/** Subconjunto de `Person` de la People API que se lee. */
export type PersonaGoogle = {
  resourceName: string
  etag?: string
  metadata?: { deleted?: boolean }
  names?: { givenName?: string; familyName?: string }[]
  phoneNumbers?: { value?: string; canonicalForm?: string; type?: string }[]
  emailAddresses?: { value?: string; type?: string }[]
  organizations?: { name?: string; title?: string }[]
  externalIds?: { value?: string; type?: string }[]
  memberships?: { contactGroupMembership?: { contactGroupResourceName?: string } }[]
}

/** Lo que se ENVÍA a Google (create / update con `MASCARA_GESTIONADA`). */
export type PersonaParaEscribir = {
  etag?: string
  names: { givenName: string; familyName: string }[]
  phoneNumbers: { value: string; type: string }[]
  emailAddresses: { value: string; type: string }[]
  organizations: { name: string; title: string }[]
  externalIds: { value: string; type: string }[]
}

export type OrigenVinculo = 'creado' | 'vinculado_id' | 'vinculado_telefono' | 'fusion'
export type EstadoVinculo = 'activo' | 'fuera_del_grupo'

export type Vinculo = {
  clienteId: string
  resourceName: string
  etag: string | null
  hashEnviado: string
  origen: OrigenVinculo
  estado: EstadoVinculo
}

export type TipoRevision = 'cambio_en_google' | 'borrado_en_google' | 'sacado_del_grupo' | 'propuesta_lead' | 'duplicado_ambiguo'

export type Revision = {
  tipo: TipoRevision
  clienteId: string | null
  resourceName: string
  /** Nombres de campo que difieren (nunca valores: los valores van en `propuesta`, cifrada al guardar). */
  campos: (keyof CamposSincronizados)[]
  propuesta: CamposSincronizados | null
  /** Idempotencia: la misma situación detectada cada hora no se encola dos veces. */
  huella: string
}

export type Escritura = {
  clienteId: string
  persona: PersonaParaEscribir
  hash: string
}

export type Actualizacion = Escritura & {
  resourceName: string
  origen: OrigenVinculo
  /** Si el vínculo venía de OTRA ficha (fusionada en esta), su clienteId: se borra ese vínculo. */
  revinculaDe: string | null
}

export type Plan = {
  crear: Escritura[]
  actualizar: Actualizacion[]
  /** Vínculos cuyo hash/etag se refresca sin escribir en Google (Google ya coincide con el CRM). */
  refrescar: { clienteId: string; etag: string | null; hash: string }[]
  /** Contactos que CREAMOS y ya no están en la selección: se borran de Google. */
  retirar: { clienteId: string; resourceName: string }[]
  /** Vínculos que se olvidan sin tocar Google. */
  olvidar: string[]
  /** Vínculos que pasan a `fuera_del_grupo` (Alberto lo sacó del grupo a mano: ya no es nuestro). */
  apartar: string[]
  /**
   * Vínculos de una ficha ABSORBIDA que pasan tal cual a su superviviente sin tocar Google (hoy:
   * el contacto estaba `fuera_del_grupo`; la decisión de Alberto sobre esa persona se hereda).
   */
  reasignar: { de: string; a: string }[]
  revisiones: Revision[]
  omitidos: number
  ilegibles: number
  avisos: string[]
  /** En modo delta no se ve el grupo entero: para crear sin duplicar hace falta el listado completo. */
  necesitaListadoCompleto: boolean
}

export type EntradaPlan = {
  crm: readonly ContactoMovil[]
  /** `false` si alguna parte de la selección no se pudo leer: entonces NO se retira nada. */
  seleccionCompleta: boolean
  vinculos: readonly Vinculo[]
  /** absorbido → superviviente (`merged_into_cliente_id`). Las absorbidas nunca se sincronizan. */
  fusiones: ReadonlyMap<string, string>
  /** Personas devueltas por `connections.list` en esta pasada (todas o solo las cambiadas). */
  google: readonly PersonaGoogle[]
  modo: 'completo' | 'delta'
  grupoResourceName: string
}

function limpio(v: string | null | undefined): string | null {
  const t = (v ?? '').replace(/\s+/g, ' ').trim()
  return t === '' ? null : t
}

function cifrado(v: string | null | undefined): boolean {
  return typeof v === 'string' && v.trim().startsWith('v1:')
}

function telefonoCanonico(v: string | null | undefined): string | null {
  const t = limpio(v)
  if (t === null) return null
  return aE164(t) ?? t.replace(/[^\d+]/g, '') ?? null
}

function emailCanonico(v: string | null | undefined): string | null {
  const t = limpio(v)
  return t === null ? null : t.toLowerCase()
}

/** Los campos gestionados de una ficha del CRM, o `null` si algo viene sin descifrar. */
export function camposDeCrm(c: ContactoMovil): CamposSincronizados | null {
  if (cifrado(c.telefono) || cifrado(c.email) || cifrado(c.nombre) || cifrado(c.apellidos)) return null
  return {
    nombre: limpio(c.nombre) ?? '',
    apellidos: limpio(c.apellidos) ?? '',
    telefono: telefonoCanonico(c.telefono) || null,
    email: emailCanonico(c.email),
    grupo: c.grupo,
  }
}

/** Lo mismo leído de Google, con la misma normalización (si no, cada hora sería un «cambio»). */
export function camposDeGoogle(p: PersonaGoogle): CamposSincronizados {
  const n = p.names?.[0]
  const familia = limpio(n?.familyName) ?? ''
  const sufijo = familia.match(SUFIJO)
  const org = p.organizations?.find((o) => limpio(o.name) === NOMBRE_GRUPO_GOOGLE)
  const titulo = limpio(org?.title)
  const grupo: GrupoContacto | null =
    titulo === 'Cliente' ? 'cliente' : titulo === 'Lead' ? 'lead' : sufijo ? (sufijo[1] === 'Cliente' ? 'cliente' : 'lead') : null
  const tel = p.phoneNumbers?.[0]
  return {
    nombre: limpio(n?.givenName) === SIN_NOMBRE ? '' : (limpio(n?.givenName) ?? ''),
    apellidos: familia.replace(SUFIJO, '').trim(),
    telefono: limpio(tel?.canonicalForm) ?? (telefonoCanonico(tel?.value) || null),
    email: emailCanonico(p.emailAddresses?.[0]?.value),
    grupo,
  }
}

export function hashCampos(c: CamposSincronizados): string {
  return createHash('sha256').update(JSON.stringify([c.nombre, c.apellidos, c.telefono, c.email, c.grupo])).digest('hex')
}

export function diferencias(a: CamposSincronizados, b: CamposSincronizados): (keyof CamposSincronizados)[] {
  return (['nombre', 'apellidos', 'telefono', 'email', 'grupo'] as const).filter((k) => a[k] !== b[k])
}

/**
 * El contacto tal como se escribe en Google. El apellido lleva « · AS Cliente/Lead» para que
 * la pantalla de llamada diga quién es (igual que el .vcf: `nombreVisible`).
 */
export function personaDesdeCampos(c: CamposSincronizados, clienteId: string, etag?: string | null): PersonaParaEscribir {
  const etiqueta = ETIQUETA[c.grupo ?? 'lead']
  const nombreVacio = c.nombre === '' && c.apellidos === ''
  return {
    ...(etag ? { etag } : {}),
    names: [{ givenName: nombreVacio ? SIN_NOMBRE : c.nombre, familyName: `${c.apellidos} · AS ${etiqueta}`.trim() }],
    phoneNumbers: c.telefono ? [{ value: c.telefono, type: 'mobile' }] : [],
    emailAddresses: c.email ? [{ value: c.email, type: 'other' }] : [],
    organizations: [{ name: NOMBRE_GRUPO_GOOGLE, title: etiqueta }],
    externalIds: [{ value: clienteId, type: TIPO_ID_EXTERNO }],
  }
}

export function enGrupo(p: PersonaGoogle, grupoResourceName: string): boolean {
  return (p.memberships ?? []).some((m) => m.contactGroupMembership?.contactGroupResourceName === grupoResourceName)
}

function idExterno(p: PersonaGoogle): string | null {
  return limpio(p.externalIds?.find((e) => e.type === TIPO_ID_EXTERNO)?.value)
}

function huella(tipo: TipoRevision, resourceName: string, hashGoogle: string): string {
  return createHash('sha256').update(`${tipo}|${resourceName}|${hashGoogle}`).digest('hex')
}

/**
 * Error claro si la cuenta se pasaría del tope de Google. `totalCuenta` = contactos que hay HOY
 * en la cuenta (todos, también los personales); `null` = no se sabe → solo se mira lo nuestro.
 */
export function comprobarLimite(p: { aSincronizar: number; vinculados: number; totalCuenta: number | null }): void {
  const tras = p.totalCuenta === null ? p.aSincronizar : p.totalCuenta - p.vinculados + p.aSincronizar
  if (p.aSincronizar > LIMITE_CONTACTOS_GOOGLE || tras > LIMITE_CONTACTOS_GOOGLE) {
    throw new Error(
      `Google Contacts admite ${LIMITE_CONTACTOS_GOOGLE} contactos por cuenta y la sincronización dejaría ${tras} ` +
        `(${p.aSincronizar} del CRM). No se ha escrito nada: hay que reducir la selección o usar otra cuenta.`,
    )
  }
}

/** Cliente gana a lead si la misma ficha sale dos veces (como en el .vcf); fuera las fusionadas. */
export function seleccionUnica(crm: readonly ContactoMovil[], fusiones: ReadonlyMap<string, string>): ContactoMovil[] {
  const porId = new Map<string, ContactoMovil>()
  for (const c of crm) {
    if (fusiones.has(c.clienteId)) continue
    const ya = porId.get(c.clienteId)
    if (!ya || (ya.grupo === 'lead' && c.grupo === 'cliente')) porId.set(c.clienteId, c)
  }
  return [...porId.values()]
}

/** La superviviente FINAL de una cadena de fusiones (A→B y luego B→C: la de A es C). */
export function superviviente(clienteId: string, fusiones: ReadonlyMap<string, string>): string {
  let x = clienteId
  const vistos = new Set<string>()
  while (fusiones.has(x) && !vistos.has(x)) {
    vistos.add(x)
    x = fusiones.get(x)!
  }
  return x
}

/**
 * Lo de Google VISTO con los ojos del CRM. Un teléfono/correo que el CRM no tiene (`null`) NO es
 * «el CRM dice que no hay»: un lead con baja de WhatsApp llega de `leadsCompetencia` sin teléfono, y
 * pisar Google con ese hueco le borraría el número del móvil. Ese campo ni se compara ni se pisa.
 */
function vistaGestionada(cg: CamposSincronizados, cc: CamposSincronizados): CamposSincronizados {
  return { ...cg, telefono: cc.telefono === null ? null : cg.telefono, email: cc.email === null ? null : cg.email }
}

/** La persona a escribir, conservando TAL CUAL el teléfono/correo de Google que el CRM no trae. */
function conservandoDeGoogle(persona: PersonaParaEscribir, cc: CamposSincronizados, g: PersonaGoogle): PersonaParaEscribir {
  const tels = (g.phoneNumbers ?? []).flatMap((t) => (limpio(t.value) ? [{ value: t.value!, type: t.type ?? 'mobile' }] : []))
  const mails = (g.emailAddresses ?? []).flatMap((m) => (limpio(m.value) ? [{ value: m.value!, type: m.type ?? 'other' }] : []))
  return {
    ...persona,
    phoneNumbers: cc.telefono === null ? tels : persona.phoneNumbers,
    emailAddresses: cc.email === null ? mails : persona.emailAddresses,
  }
}

export function planificarSync(e: EntradaPlan): Plan {
  const plan: Plan = {
    crear: [], actualizar: [], refrescar: [], retirar: [], olvidar: [], apartar: [], reasignar: [], revisiones: [],
    omitidos: 0, ilegibles: 0, avisos: [], necesitaListadoCompleto: false,
  }
  const crm = seleccionUnica(e.crm, e.fusiones)
  comprobarLimite({ aSincronizar: crm.length, vinculados: e.vinculos.length, totalCuenta: null })

  const google = new Map(e.google.map((p) => [p.resourceName, p]))
  const vinculoDe = new Map(e.vinculos.map((v) => [v.clienteId, v]))
  const vinculadoRN = new Set(e.vinculos.map((v) => v.resourceName))
  const reclamados = new Set<string>() // resourceNames que esta pasada ya asigna a una ficha
  const ambiguos = new Set<string>() // resourceNames con el teléfono de MÁS de una ficha (o al revés)
  const intocables = new Set<string>() // fichas de la selección que NO se pueden retirar
  const enSeleccion = new Set(crm.map((c) => c.clienteId))
  const vivaEnGrupo = (p: PersonaGoogle | undefined) => !!p && !p.metadata?.deleted && enGrupo(p, e.grupoResourceName)

  // Fichas del CRM (sin vínculo) por E.164, para saber si un teléfono lo comparten dos personas.
  const campos = new Map<string, CamposSincronizados | null>(crm.map((c) => [c.clienteId, camposDeCrm(c)]))
  const crmPorTel = new Map<string, number>()
  for (const c of crm) {
    const t = campos.get(c.clienteId)?.telefono
    if (t && !vinculoDe.has(c.clienteId)) crmPorTel.set(t, (crmPorTel.get(t) ?? 0) + 1)
  }
  // Personas del grupo SIN vínculo, por E.164 y por id externo.
  const libresPorTel = new Map<string, PersonaGoogle[]>()
  const libresPorId = new Map<string, PersonaGoogle>()
  for (const p of e.google) {
    if (!vivaEnGrupo(p) || vinculadoRN.has(p.resourceName)) continue
    const t = camposDeGoogle(p).telefono
    if (t) libresPorTel.set(t, [...(libresPorTel.get(t) ?? []), p])
    const id = idExterno(p)
    if (id) libresPorId.set(id, p)
  }
  // Un contacto sin vínculo que lleva el id de una ficha ABSORBIDA es de su superviviente (el
  // vínculo se perdió al fusionar): se recupera por ahí en vez de crear otro.
  const libresPorSuperviviente = new Map<string, PersonaGoogle>()
  for (const [id, p] of libresPorId) {
    const sup = superviviente(id, e.fusiones)
    if (sup !== id && !libresPorSuperviviente.has(sup)) libresPorSuperviviente.set(sup, p)
  }
  // Vínculos de fichas absorbidas, por superviviente FINAL (las cadenas A→B→C también): el
  // contacto se hereda, no se duplica. Si hay varios, gana uno activo; uno `fuera_del_grupo` se
  // hereda tal cual (Alberto sacó a esa persona del grupo: no se le vuelve a meter).
  const heredable = new Map<string, Vinculo>()
  for (const v of e.vinculos) {
    if (!e.fusiones.has(v.clienteId)) continue
    const sup = superviviente(v.clienteId, e.fusiones)
    if (vinculoDe.has(sup)) continue
    const ya = heredable.get(sup)
    if (!ya || (ya.estado !== 'activo' && v.estado === 'activo')) heredable.set(sup, v)
  }

  const actualizar = (c: CamposSincronizados, clienteId: string, resourceName: string, etag: string | null, origen: OrigenVinculo, revinculaDe: string | null, g: PersonaGoogle | undefined) => {
    reclamados.add(resourceName)
    let persona = personaDesdeCampos(c, clienteId, etag)
    if (g) persona = conservandoDeGoogle(persona, c, g)
    else if (e.modo === 'delta' && (c.telefono === null || c.email === null)) {
      // Sin ver el contacto no se sabe qué teléfono/correo conservar: escribir a ciegas lo vaciaría.
      plan.necesitaListadoCompleto = true
      plan.omitidos++
      return
    }
    plan.actualizar.push({ clienteId, resourceName, origen, revinculaDe, hash: hashCampos(c), persona })
  }

  for (const c of crm) {
    const cc = campos.get(c.clienteId)
    if (!cc) {
      plan.ilegibles++
      intocables.add(c.clienteId)
      continue
    }
    const hash = hashCampos(cc)
    const v = vinculoDe.get(c.clienteId)

    if (v) {
      if (v.estado === 'fuera_del_grupo') {
        plan.omitidos++
        continue
      }
      const g = google.get(v.resourceName)
      const borrado = g?.metadata?.deleted === true || (e.modo === 'completo' && !g)
      if (borrado) {
        plan.revisiones.push({ tipo: 'borrado_en_google', clienteId: c.clienteId, resourceName: v.resourceName, campos: [], propuesta: null, huella: huella('borrado_en_google', v.resourceName, v.hashEnviado) })
        plan.olvidar.push(c.clienteId)
        plan.crear.push({ clienteId: c.clienteId, hash, persona: personaDesdeCampos(cc, c.clienteId) })
        continue
      }
      if (g && !enGrupo(g, e.grupoResourceName)) {
        const cg = camposDeGoogle(g)
        plan.revisiones.push({ tipo: 'sacado_del_grupo', clienteId: c.clienteId, resourceName: v.resourceName, campos: [], propuesta: cg, huella: huella('sacado_del_grupo', v.resourceName, hashCampos(cg)) })
        plan.apartar.push(c.clienteId)
        continue
      }
      reclamados.add(v.resourceName)
      if (g) {
        const cg = camposDeGoogle(g)
        const vista = vistaGestionada(cg, cc)
        const hg = hashCampos(vista)
        if (hg !== v.hashEnviado && hg !== hash) {
          // Alguien lo cambió en Google y no coincide con el CRM: CRM gana, Google a revisión.
          plan.revisiones.push({ tipo: 'cambio_en_google', clienteId: c.clienteId, resourceName: v.resourceName, campos: diferencias(cc, vista), propuesta: cg, huella: huella('cambio_en_google', v.resourceName, hashCampos(cg)) })
          actualizar(cc, c.clienteId, v.resourceName, g.etag ?? v.etag, v.origen, null, g)
          continue
        }
        if (hg === hash) {
          if (hash !== v.hashEnviado || (g.etag ?? null) !== v.etag) plan.refrescar.push({ clienteId: c.clienteId, etag: g.etag ?? v.etag, hash })
          else plan.omitidos++
          continue
        }
      }
      if (hash !== v.hashEnviado) actualizar(cc, c.clienteId, v.resourceName, g?.etag ?? v.etag, v.origen, null, g)
      else plan.omitidos++
      continue
    }

    // Sin vínculo. 1) Heredado de una ficha fusionada en esta.
    const h = heredable.get(c.clienteId)
    if (h) {
      reclamados.add(h.resourceName)
      if (h.estado === 'fuera_del_grupo') {
        plan.reasignar.push({ de: h.clienteId, a: c.clienteId })
        plan.omitidos++
        continue
      }
      // Se conserva el ORIGEN del contacto (quién lo creó): de él depende si se puede borrar.
      const gh = google.get(h.resourceName)
      actualizar(cc, c.clienteId, h.resourceName, gh?.etag ?? h.etag, h.origen, h.clienteId, gh)
      continue
    }
    // 2) Ya está en el grupo con nuestro id externo, o con el de una ficha fusionada en esta
    //    (vínculo perdido): se recupera.
    const porId = libresPorId.get(c.clienteId) ?? libresPorSuperviviente.get(c.clienteId)
    if (porId && !reclamados.has(porId.resourceName)) {
      actualizar(cc, c.clienteId, porId.resourceName, porId.etag ?? null, 'vinculado_id', null, porId)
      continue
    }
    // 3) Mismo teléfono en el grupo: uno y solo uno a cada lado → se vincula.
    const candidatos = cc.telefono
      ? (libresPorTel.get(cc.telefono) ?? []).filter((p) => !idExterno(p) && (!reclamados.has(p.resourceName) || ambiguos.has(p.resourceName)))
      : []
    if (candidatos.length === 1 && (crmPorTel.get(cc.telefono!) ?? 0) === 1) {
      actualizar(cc, c.clienteId, candidatos[0].resourceName, candidatos[0].etag ?? null, 'vinculado_telefono', null, candidatos[0])
      continue
    }
    if (candidatos.length > 0) {
      const p = candidatos[0]
      plan.revisiones.push({ tipo: 'duplicado_ambiguo', clienteId: c.clienteId, resourceName: p.resourceName, campos: ['telefono'], propuesta: camposDeGoogle(p), huella: huella('duplicado_ambiguo', p.resourceName, `${c.clienteId}|${hash}`) })
      for (const x of candidatos) {
        reclamados.add(x.resourceName)
        ambiguos.add(x.resourceName)
      }
      plan.omitidos++
      continue
    }
    plan.crear.push({ clienteId: c.clienteId, hash, persona: personaDesdeCampos(cc, c.clienteId) })
  }

  if (e.modo === 'delta' && plan.crear.length > 0) plan.necesitaListadoCompleto = true

  // Fichas que ya no están en la selección.
  const heredados = new Set([...plan.actualizar.filter((a) => a.revinculaDe).map((a) => a.revinculaDe!), ...plan.reasignar.map((r) => r.de)])
  const fuera = e.vinculos.filter((v) => !enSeleccion.has(v.clienteId) && !intocables.has(v.clienteId) && !heredados.has(v.clienteId))
  if (fuera.length > 0 && !e.seleccionCompleta) {
    plan.avisos.push(`selección incompleta: no se retira ninguno de los ${fuera.length} contactos que no aparecen`)
  } else if (fuera.length > MAX_RETIRADA_POR_PASADA && fuera.length > e.vinculos.length * 0.1) {
    plan.avisos.push(`retirada masiva BLOQUEADA: ${fuera.length} contactos saldrían de Google de golpe; revisa la selección`)
  } else {
    for (const v of fuera) {
      if (v.origen === 'creado' && v.estado === 'activo') plan.retirar.push({ clienteId: v.clienteId, resourceName: v.resourceName })
      else plan.olvidar.push(v.clienteId)
    }
  }

  // Contactos del grupo que nadie reclama: propuesta de lead (nunca alta automática).
  for (const p of e.google) {
    if (!vivaEnGrupo(p) || vinculadoRN.has(p.resourceName) || reclamados.has(p.resourceName)) continue
    if (idExterno(p)) continue // nuestro, de una ficha que ya no está: ni propuesta ni alta
    const cg = camposDeGoogle(p)
    plan.revisiones.push({ tipo: 'propuesta_lead', clienteId: null, resourceName: p.resourceName, campos: [], propuesta: cg, huella: huella('propuesta_lead', p.resourceName, hashCampos(cg)) })
  }

  return plan
}

export function trocear<T>(xs: readonly T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n))
  return out
}

/** ¿Se reintenta esta respuesta de Google? Cuota (429) y fallos transitorios del servidor. */
export function esReintentable(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504
}

/** Espera antes del reintento `intento` (0, 1, 2…): `Retry-After` si viene, si no exponencial con techo. */
export function esperaReintento(intento: number, retryAfter: string | null, azar: number = Math.random()): number {
  const ra = retryAfter !== null ? Number(retryAfter) : NaN
  if (Number.isFinite(ra) && ra >= 0) return Math.min(ra * 1000, 60_000)
  const base = Math.min(1000 * 2 ** intento, 32_000)
  return Math.round(base + base * 0.25 * azar)
}

/** El `syncToken` de People caduca (7 días): 410, o 400 con `EXPIRED_SYNC_TOKEN`. */
export function syncTokenCaducado(status: number, cuerpo: string): boolean {
  return status === 410 || (status === 400 && /EXPIRED_SYNC_TOKEN|sync token.*expired/i.test(cuerpo))
}

/**
 * Qué contactos se borran de Google al desconectar con `borrarContactos`: solo los que CREÓ el CRM
 * (`origen: 'creado'`), siguen activos y siguen en el grupo. Uno vinculado por teléfono o por id
 * era un contacto de Alberto antes de la sincronización (o pudo serlo): se queda. Uno apartado
 * (`fuera_del_grupo`) ya no es nuestro. Misma regla que la retirada horaria (`retirar`).
 */
export function aBorrarAlDesconectar(
  miembros: readonly string[],
  vinculos: readonly { resourceName: string; origen: string; estado: string }[],
): string[] {
  const creados = new Set(vinculos.filter((v) => v.origen === 'creado' && v.estado === 'activo').map((v) => v.resourceName))
  return miembros.filter((rn) => creados.has(rn))
}
