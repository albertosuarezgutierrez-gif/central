// Sincronización CRM → Google Contacts (05/10/2026). Lógica PURA: qué se crea, qué se
// actualiza, qué se deja y qué va a revisión. La red (People API) y la BD viven en
// `apps/asegura/lib/google-contactos*.ts`; aquí no hay `fetch` ni Prisma.
//
// Reglas (decididas por Alberto, no se reabren aquí):
//   · El CRM es la FUENTE DE VERDAD. Un campo gestionado que se edita en Google se vuelve a
//     pisar con lo del CRM, pero lo que había en Google se guarda en la cola de revisión: no se
//     pierde en silencio.
//   · Solo se tocan contactos del grupo «Grupo ASegura». Jamás uno personal. ÚNICA excepción, la
//     ADOPCIÓN: lo que Alberto volcó con el .vcf (fuera del grupo, sin nuestro id), si casa por
//     teléfono y por nombre (o lleva el sufijo «· AS …» del .vcf), se mete en el grupo y se vincula.
//   · Un contacto NUEVO en Google dentro del grupo es una PROPUESTA de lead, nunca un alta.
//   · Antes de crear, se busca el mismo teléfono (E.164, CUALQUIERA de los del contacto), primero en
//     el grupo y luego en la agenda entera: si hay uno y solo uno, se vincula/adopta en vez de
//     duplicar; si hay más de uno (o dos fichas lo comparten), o fuera del grupo el nombre es OTRO
//     (probable contacto personal), se para y va a revisión — sin crear.
//   · La misma selección que el .vcf del móvil (`contactosMovil` de apps/asegura), sin fichas
//     fusionadas. Límite de Google: 25.000 contactos por cuenta → se aborta con error claro.
//
// 🚨 NULL = «no se sabe». Un teléfono/correo que llega CIFRADO (`v1:…`) es que la clave no lo
// abrió: esa ficha NO se toca (ni se crea, ni se actualiza, ni se retira). Pisar Google con un
// hueco que en realidad es «no se pudo leer» borraría el teléfono de un cliente del móvil.
// Y si la selección vino incompleta (una consulta caída), NO se retira nada: «no está en la
// lista» no significa «ya no es cliente» si la lista está a medias.

import { createHash } from 'node:crypto'

import { etiquetaRamo } from './filtro-cartera.ts'
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
/**
 * Los únicos campos que se ESCRIBEN. 🚨 La People API sustituye cada lista de la máscara ENTERA:
 * dentro de ellas el CRM gestiona solo SU entrada (el primer teléfono/correo, la organization
 * «Grupo ASegura», el externalId `asegura`, la URL de la ficha, el BLOQUE delimitado de la nota y
 * el cumpleaños si el CRM lo sabe); las demás entradas de Google se reenvían tal cual
 * (`conservandoDeGoogle`) o se perderían en silencio. Una persona a ACTUALIZAR lleva siempre los
 * ocho campos: uno ausente con la máscara puesta = Google lo vacía.
 */
export const MASCARA_GESTIONADA = 'names,phoneNumbers,emailAddresses,organizations,externalIds,biographies,urls,birthdays'
/** Un barrido que retiraría más que esto se BLOQUEA (y se avisa): huele a selección rota. */
export const MAX_RETIRADA_POR_PASADA = 50

/** Además de clientes y leads, los contactos de las COMPAÑÍAS (`compania_contactos`, 🔵). */
export type GrupoGoogle = GrupoContacto | 'compania'
/** La clave de un contacto de compañía en vínculos/externalId: `compania:<uuid>` (un cliente va por su uuid). */
export const PREFIJO_CLAVE_COMPANIA = 'compania:'
export function esClaveCompania(clave: string): boolean {
  return clave.startsWith(PREFIJO_CLAVE_COMPANIA)
}

/**
 * Lo que la sincronización recibe por contacto: lo del .vcf más lo que solo va a Google. Los
 * extras ausentes valen `null` = «no se sabe»: el campo de Google no se toca.
 */
export type ContactoGoogle = Omit<ContactoMovil, 'grupo'> & {
  grupo: GrupoGoogle
  /** Contenido del bloque «— Grupo ASegura —» de la nota (`notaCliente`/`notaLead`). */
  nota?: string | null
  /** Ficha en plataforma (`/correduria/cliente/<id>`). */
  url?: string | null
  /** Fecha de nacimiento (ISO o dd/mm/aaaa; se normaliza). */
  cumpleanos?: string | null
  /** Alguna póliza en vigor vence en ≤30 días (`avisoVencimiento`): prefijo «🟢⏰ ». Solo clientes. */
  aviso?: boolean
}

const ETIQUETA: Record<GrupoGoogle, string> = { cliente: 'Cliente', lead: 'Lead', compania: 'Compañía' }
/**
 * El nombre en Google EMPIEZA por el emoji del tipo (decisión de Alberto, 05/10/2026): «🟢 Juan
 * Pérez» = cliente con póliza en vigor, «🟡 María López» = lead, «🔵 Mapfre · Siniestros (Laura)» =
 * contacto de una compañía. Va al principio del `givenName` (lo primero que se ve al recibir una
 * llamada o un WhatsApp) y sustituye al antiguo sufijo «· AS Cliente/Lead» del apellido. Un cliente
 * con una póliza que vence en ≤30 días lleva además ⏰: «🟢⏰ Juan Pérez».
 * 🪤 (lección del 3a) Al LEER se quita y se reconoce con la misma regla con la que se escribe: si el
 * nombre leído conservara el emoji, ≠ CRM y CADA HORA se reescribiría (y se encolaría un «cambio en
 * Google» falso). Cubre el caso sin nombre («🟡» a secas) y el selector de variación U+FE0F.
 */
export const EMOJI_GRUPO: Record<GrupoGoogle, string> = { cliente: '🟢', lead: '🟡', compania: '🔵' }
export const EMOJI_AVISO = '⏰'
const PREFIJO = /^(🟢|🟡|🔵)\uFE0F?(⏰\uFE0F?)?\s*/u
const GRUPO_DE_EMOJI: Record<string, GrupoGoogle> = { '🟢': 'cliente', '🟡': 'lead', '🔵': 'compania' }
/** Lo que se escribe en Google cuando la ficha no tiene ni nombre ni apellidos; al leer vuelve a ''. */
const SIN_NOMBRE = '(sin nombre)'

/** `givenName` leído → el nombre sin el emoji, el tipo que el emoji dice (`null` = no lo lleva) y si lleva ⏰. */
export function quitarPrefijo(givenName: string | null | undefined): { nombre: string; grupo: GrupoGoogle | null; aviso: boolean } {
  const t = (givenName ?? '').replace(/\s+/g, ' ').trim()
  const m = t.match(PREFIJO)
  const resto = (m ? t.slice(m[0].length) : t).trim()
  return { nombre: resto === SIN_NOMBRE ? '' : resto, grupo: m ? GRUPO_DE_EMOJI[m[1]] : null, aviso: !!m?.[2] }
}

/** El `givenName` que se escribe: emoji (+⏰) + nombre; sin nombre pero con apellidos, solo el emoji. */
function givenNameConPrefijo(c: Pick<CamposSincronizados, 'nombre' | 'apellidos' | 'grupo' | 'aviso'>): string {
  const e = EMOJI_GRUPO[c.grupo ?? 'lead'] + (c.aviso ? EMOJI_AVISO : '')
  if (c.nombre !== '') return `${e} ${c.nombre}`
  return c.apellidos !== '' ? e : `${e} ${SIN_NOMBRE}`
}

/** Cómo se verá el contacto en la agenda: «🟢 Juan Pérez García». */
export function nombreEnGoogle(c: Pick<CamposSincronizados, 'nombre' | 'apellidos' | 'grupo'> & { aviso?: boolean }): string {
  return `${givenNameConPrefijo({ ...c, aviso: c.aviso ?? false })} ${c.apellidos}`.trim()
}

export type CamposSincronizados = {
  nombre: string
  apellidos: string
  /** E.164 si es válido; si no, lo tecleado limpio; `null` = no consta. */
  telefono: string | null
  email: string | null
  grupo: GrupoGoogle | null
  /** Contenido del bloque del CRM en la nota; `null` = no se sabe / no hay bloque. */
  nota: string | null
  /** URL de la ficha en plataforma; `null` = no se gestiona. */
  url: string | null
  /** `AAAA-MM-DD` (o `--MM-DD` leído de Google sin año); `null` = no consta. */
  cumpleanos: string | null
  /** ⏰ en el prefijo. */
  aviso: boolean
}

/** Subconjunto de `Person` de la People API que se lee. */
export type PersonaGoogle = {
  resourceName: string
  etag?: string
  metadata?: { deleted?: boolean }
  names?: { givenName?: string; familyName?: string; displayName?: string; unstructuredName?: string }[]
  phoneNumbers?: { value?: string; canonicalForm?: string; type?: string }[]
  emailAddresses?: { value?: string; type?: string }[]
  organizations?: { name?: string; title?: string }[]
  externalIds?: { value?: string; type?: string }[]
  memberships?: { contactGroupMembership?: { contactGroupResourceName?: string } }[]
  biographies?: { value?: string; contentType?: string }[]
  urls?: { value?: string; type?: string }[]
  birthdays?: { date?: FechaGoogle; text?: string }[]
}

export type FechaGoogle = { year?: number; month?: number; day?: number }

/** Lo que se ENVÍA a Google (create / update con `MASCARA_GESTIONADA`). */
export type PersonaParaEscribir = {
  etag?: string
  names: { givenName: string; familyName: string }[]
  /** La entrada del CRM va PRIMERA; detrás, las demás de Google tal cual llegaron (`type` incluido). */
  phoneNumbers: { value: string; type?: string }[]
  emailAddresses: { value: string; type?: string }[]
  organizations: { name?: string; title?: string }[]
  externalIds: { value: string; type?: string }[]
  /** Singleton en Google: el texto de Alberto + el bloque del CRM (`conBloque`). */
  biographies?: { value: string; contentType?: string }[]
  /** La URL de la ficha (tipo «Grupo ASegura») delante de las de Alberto. */
  urls?: { value: string; type?: string }[]
  /** Singleton en Google. Solo si el CRM sabe la fecha; si no, la de Google tal cual. */
  birthdays?: { date?: FechaGoogle; text?: string }[]
}

/**
 * `adoptado` = contacto que ya estaba en la agenda FUERA de la etiqueta (volcado del .vcf) y que la
 * sincronización metió en ella. Como `vinculado_*`, era de Alberto: nunca se borra de Google.
 */
export type OrigenVinculo = 'creado' | 'vinculado_id' | 'vinculado_telefono' | 'fusion' | 'adoptado'
export type EstadoVinculo = 'activo' | 'fuera_del_grupo'

export type Vinculo = {
  /** La CLAVE del contacto: el uuid de la ficha o `compania:<uuid>` (`PREFIJO_CLAVE_COMPANIA`). */
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
  /**
   * Solo en `duplicado_ambiguo` (también los de FUERA de la etiqueta en la adopción): por qué. `nombre_distinto` = un único contacto con ese teléfono
   * pero OTRO nombre; `telefono_compartido` = varios contactos (o varias fichas) con el mismo
   * número. No se guarda en la BD (la cola ya lo distingue por `campos`): lo usa la simulación.
   */
  motivo?: 'nombre_distinto' | 'telefono_compartido'
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
  /** Adopción: el contacto estaba FUERA de la etiqueta; tras escribirlo se mete en ella. */
  anadirAlGrupo?: boolean
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
  crm: readonly ContactoGoogle[]
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

// ─── Nota (B), cumpleaños (E), aviso (D), compañías (C): helpers puros ──────────

/** Marcas del bloque que gestiona el CRM en la nota. Lo de fuera es de Alberto y no se toca. */
export const INICIO_NOTA = '— Grupo ASegura —'
export const FIN_NOTA = '— fin Grupo ASegura —'
/** `type` de la URL de la ficha en `urls`. */
export const TIPO_URL = 'Grupo ASegura'
const RUTA_FICHA = /\/correduria\/cliente\//

/** Texto de nota normalizado (línea a línea, sin huecos): lo que se escribe es lo que se relee. */
function normNota(v: string | null | undefined): string | null {
  const t = (v ?? '').replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l !== '').join('\n')
  return t === '' ? null : t
}

/** Dónde está el bloque: el ÚLTIMO inicio y el primer fin tras él (una marca suelta no se come texto). */
function localizarBloque(t: string): { i: number; j: number } | null {
  const i = t.lastIndexOf(INICIO_NOTA)
  if (i < 0) return null
  const f = t.indexOf(FIN_NOTA, i + INICIO_NOTA.length)
  return f < 0 ? null : { i, j: f + FIN_NOTA.length }
}

/** El contenido del bloque del CRM en una nota de Google; `null` si no lo hay. */
export function extraerBloque(bio: string | null | undefined): string | null {
  const t = (bio ?? '').replace(/\r\n?/g, '\n')
  const b = localizarBloque(t)
  if (!b) return null
  return normNota(t.slice(b.i + INICIO_NOTA.length, b.j - FIN_NOTA.length)) ?? ''
}

/** La nota con el bloque del CRM puesto (al final); lo que Alberto escribió fuera, intacto. */
export function conBloque(bio: string | null | undefined, contenido: string): string {
  const t = (bio ?? '').replace(/\r\n?/g, '\n')
  const b = localizarBloque(t)
  const antes = (b ? t.slice(0, b.i) : t).trimEnd()
  const despues = b ? t.slice(b.j).trim() : ''
  const fuera = [antes.trim() === '' ? '' : antes, despues].filter((x) => x !== '').join('\n\n')
  const bloque = `${INICIO_NOTA}\n${normNota(contenido) ?? ''}\n${FIN_NOTA}`
  return fuera === '' ? bloque : `${fuera}\n\n${bloque}`
}

/** `AAAA-MM-DD` → `dd/mm/aaaa`. */
export function fechaEs(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

const SIN_COMPANIA = 'compañía sin identificar'

/**
 * La ficha rápida de un CLIENTE: sus pólizas en vigor (ramo + compañía) y el próximo vencimiento.
 * 🚨 Sin NIF, sin importes y sin nº de póliza: la nota se ve en el móvil y se copia a otras apps.
 * Líneas ordenadas y sin repetir: el orden de la consulta no debe cambiar el hash.
 */
export function notaCliente(p: { polizas: readonly { ramo: string; compania: string | null }[]; proximoVencimiento: string | null }): string {
  const lineas = [...new Set(p.polizas.map((x) => `· ${etiquetaRamo(x.ramo)} · ${limpio(x.compania) ?? SIN_COMPANIA}`))].sort((a, b) => a.localeCompare(b, 'es'))
  const out = lineas.length ? ['Pólizas en vigor:', ...lineas] : ['Pólizas en vigor: ninguna']
  if (p.proximoVencimiento) out.push(`Próximo vencimiento: ${fechaEs(p.proximoVencimiento)}`)
  return normNota(out.join('\n'))!
}

/** La de un LEAD: la póliza que tiene en otra compañía y cuándo vence (estimado). */
export function notaLead(p: { ramo: string; compania: string | null; vencimiento: string | null }): string {
  const out = [`Lead (póliza en otra compañía): ${etiquetaRamo(p.ramo)} · ${limpio(p.compania) ?? SIN_COMPANIA}`]
  if (p.vencimiento) out.push(`Vence (estimado): ${fechaEs(p.vencimiento)}`)
  return normNota(out.join('\n'))!
}

function sumarDias(iso: string, dias: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** Días de antelación del ⏰. */
export const DIAS_AVISO_VENCIMIENTO = 30

/** ¿Alguna vence entre hoy y hoy+30 (ambos incluidos)? `null` = no se sabe: no cuenta. Fechas ISO. */
export function avisoVencimiento(vencimientos: readonly (string | null)[], hoy: string): boolean {
  const tope = sumarDias(hoy, DIAS_AVISO_VENCIMIENTO)
  return vencimientos.some((v) => v !== null && v.slice(0, 10) >= hoy.slice(0, 10) && v.slice(0, 10) <= tope)
}

/** El vencimiento más cercano a partir de hoy (incluido); `null` si no hay ninguno conocido. */
export function proximoVencimiento(vencimientos: readonly (string | null)[], hoy: string): string | null {
  const futuros = vencimientos.flatMap((v) => (v !== null && v.slice(0, 10) >= hoy.slice(0, 10) ? [v.slice(0, 10)] : [])).sort()
  return futuros[0] ?? null
}

/** Fecha de nacimiento → `AAAA-MM-DD` válida, o `null` (vacía, cifrada sin abrir o imposible). */
export function normalizarNacimiento(v: string | null | undefined): string | null {
  const t = (v ?? '').trim()
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  const es = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  const [y, m, d] = iso ? [iso[1], iso[2], iso[3]] : es ? [es[3], es[2], es[1]] : []
  if (!y) return null
  const f = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)))
  if (f.getUTCFullYear() !== Number(y) || f.getUTCMonth() !== Number(m) - 1 || f.getUTCDate() !== Number(d)) return null
  if (Number(y) < 1900 || Number(y) > 2100) return null
  return `${y}-${m}-${d}`
}

function fechaGoogleDe(iso: string): FechaGoogle | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) } : null
}

function cumpleanosDeGoogle(b: { date?: FechaGoogle } | undefined): string | null {
  const d = b?.date
  if (!d?.month || !d.day) return null
  const mm = String(d.month).padStart(2, '0')
  const dd = String(d.day).padStart(2, '0')
  return d.year ? `${String(d.year).padStart(4, '0')}-${mm}-${dd}` : `--${mm}-${dd}`
}

const AREA: Record<string, string> = { comercial: 'Comercial', siniestros: 'Siniestros', administracion: 'Administración', tecnico: 'Técnico', general: 'General' }

/** «Mapfre · Siniestros (Laura)»: compañía, área si consta y la persona entre paréntesis. */
export function nombreCompaniaContacto(c: { compania: string; area: string | null; nombre: string | null }): string {
  const area = c.area ? (AREA[c.area] ?? c.area) : null
  const nombre = limpio(c.nombre)
  return `${limpio(c.compania) ?? SIN_COMPANIA}${area ? ` · ${area}` : ''}${nombre ? ` (${nombre})` : ''}`
}

/** Los campos gestionados de una ficha del CRM, o `null` si algo viene sin descifrar. */
export function camposDeCrm(c: ContactoGoogle): CamposSincronizados | null {
  if (cifrado(c.telefono) || cifrado(c.email) || cifrado(c.nombre) || cifrado(c.apellidos)) return null
  return {
    nombre: limpio(c.nombre) ?? '',
    apellidos: limpio(c.apellidos) ?? '',
    telefono: telefonoCanonico(c.telefono) || null,
    email: emailCanonico(c.email),
    grupo: c.grupo,
    nota: normNota(c.nota),
    url: limpio(c.url),
    cumpleanos: normalizarNacimiento(c.cumpleanos),
    aviso: c.grupo === 'cliente' && c.aviso === true,
  }
}

const GRUPO_DE_TITULO: Record<string, GrupoGoogle> = { Cliente: 'cliente', Lead: 'lead', 'Compañía': 'compania' }

function esNuestraUrl(u: { value?: string; type?: string }): boolean {
  return u.type === TIPO_URL || RUTA_FICHA.test(u.value ?? '')
}

/** Lo mismo leído de Google, con la misma normalización (si no, cada hora sería un «cambio»). */
export function camposDeGoogle(p: PersonaGoogle): CamposSincronizados {
  const n = p.names?.[0]
  const { nombre, grupo: grupoPrefijo, aviso } = quitarPrefijo(n?.givenName)
  const org = p.organizations?.find((o) => limpio(o.name) === NOMBRE_GRUPO_GOOGLE)
  const titulo = limpio(org?.title)
  const grupoTitulo: GrupoGoogle | null = titulo ? (GRUPO_DE_TITULO[titulo] ?? null) : null
  // El tipo cuenta si el emoji y la organization dicen LO MISMO (es lo que se escribe siempre). Si
  // alguien quita el emoji o cambia uno de los dos a mano, `null` → difiere del CRM → se reescribe.
  const grupo = grupoPrefijo !== null && grupoPrefijo === grupoTitulo ? grupoPrefijo : null
  const tel = p.phoneNumbers?.[0]
  return {
    nombre,
    apellidos: limpio(n?.familyName) ?? '',
    telefono: limpio(tel?.canonicalForm) ?? (telefonoCanonico(tel?.value) || null),
    email: emailCanonico(p.emailAddresses?.[0]?.value),
    grupo,
    nota: extraerBloque(p.biographies?.[0]?.value),
    url: limpio(p.urls?.find(esNuestraUrl)?.value),
    cumpleanos: cumpleanosDeGoogle(p.birthdays?.[0]),
    aviso,
  }
}

const CAMPOS: readonly (keyof CamposSincronizados)[] = ['nombre', 'apellidos', 'telefono', 'email', 'grupo', 'nota', 'url', 'cumpleanos', 'aviso']
/**
 * Campos que, editados en Google, el CRM repone SIN encolar: el bloque de la nota y la URL son
 * del CRM, y el ⏰ es derivado de las fechas (decisión de Alberto, 05/10/2026).
 */
const SIN_COLA = new Set<keyof CamposSincronizados>(['nota', 'url', 'aviso'])

export function hashCampos(c: CamposSincronizados): string {
  return createHash('sha256').update(JSON.stringify(CAMPOS.map((k) => c[k]))).digest('hex')
}

/** Solo lo que identifica a la persona: la huella de un ambiguo no cambia porque cambie su nota o su ⏰. */
function hashIdentidad(c: CamposSincronizados): string {
  return createHash('sha256').update(JSON.stringify([c.nombre, c.apellidos, c.telefono])).digest('hex')
}

export function diferencias(a: CamposSincronizados, b: CamposSincronizados): (keyof CamposSincronizados)[] {
  return CAMPOS.filter((k) => a[k] !== b[k])
}

/**
 * El contacto tal como se escribe en Google. El nombre empieza por 🟢 (cliente) o 🟡 (lead) para
 * que la pantalla de llamada diga quién es; la organization «Grupo ASegura» lleva lo mismo en texto.
 */
export function personaDesdeCampos(c: CamposSincronizados, clienteId: string, etag?: string | null): PersonaParaEscribir {
  const etiqueta = ETIQUETA[c.grupo ?? 'lead']
  return {
    ...(etag ? { etag } : {}),
    names: [{ givenName: givenNameConPrefijo(c), familyName: c.apellidos }],
    phoneNumbers: c.telefono ? [{ value: c.telefono, type: 'mobile' }] : [],
    emailAddresses: c.email ? [{ value: c.email, type: 'other' }] : [],
    organizations: [{ name: NOMBRE_GRUPO_GOOGLE, title: etiqueta }],
    externalIds: [{ value: clienteId, type: TIPO_ID_EXTERNO }],
    ...(c.nota !== null ? { biographies: [{ value: conBloque('', c.nota), contentType: 'TEXT_PLAIN' }] } : {}),
    ...(c.url !== null ? { urls: [{ value: c.url, type: TIPO_URL }] } : {}),
    ...(c.cumpleanos !== null && fechaGoogleDe(c.cumpleanos) ? { birthdays: [{ date: fechaGoogleDe(c.cumpleanos)! }] } : {}),
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
  const { tras, supera } = excesoLimite(p)
  if (supera) {
    throw new Error(
      `Google Contacts admite ${LIMITE_CONTACTOS_GOOGLE} contactos por cuenta y la sincronización dejaría ${tras} ` +
        `(${p.aSincronizar} del CRM). No se ha escrito nada: hay que reducir la selección o usar otra cuenta.`,
    )
  }
}

/** Lo mismo que `comprobarLimite` sin lanzar: cuántos contactos quedarían y si se pasa del tope. */
export function excesoLimite(p: { aSincronizar: number; vinculados: number; totalCuenta: number | null }): { tras: number; supera: boolean } {
  const tras = p.totalCuenta === null ? p.aSincronizar : p.totalCuenta - p.vinculados + p.aSincronizar
  return { tras, supera: p.aSincronizar > LIMITE_CONTACTOS_GOOGLE || tras > LIMITE_CONTACTOS_GOOGLE }
}

/** Cliente gana a lead si la misma ficha sale dos veces (como en el .vcf); fuera las fusionadas. */
export function seleccionUnica<T extends { clienteId: string; grupo: string }>(crm: readonly T[], fusiones: ReadonlyMap<string, string>): T[] {
  const porId = new Map<string, T>()
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
 * Lo de Google VISTO con los ojos del CRM. Un teléfono/correo (o nota, URL, cumpleaños) que el CRM no tiene (`null`) NO es
 * «el CRM dice que no hay»: un lead con baja de WhatsApp llega de `leadsCompetencia` sin teléfono, y
 * pisar Google con ese hueco le borraría el número del móvil. Ese campo ni se compara ni se pisa.
 */
function vistaGestionada(cg: CamposSincronizados, cc: CamposSincronizados): CamposSincronizados {
  // Igual con la nota, la URL y el cumpleaños: si el CRM no los sabe, lo de Google ni se mira.
  const si = <K extends 'telefono' | 'email' | 'nota' | 'url' | 'cumpleanos'>(k: K) => (cc[k] === null ? null : cg[k])
  return { ...cg, telefono: si('telefono'), email: si('email'), nota: si('nota'), url: si('url'), cumpleanos: si('cumpleanos') }
}

/**
 * Una lista de Google con la entrada del CRM dentro. Si el valor del CRM ya está, se usa esa
 * entrada; si no, sustituye a la PRIMERA (la que el CRM escribió y que `camposDeGoogle` lee; su
 * valor anterior queda en la revisión `cambio_en_google`) — o, con `pisaPrimera: false` (contacto
 * que no creamos y que se vincula ahora), se pone delante sin pisar nada. Va siempre primera; el
 * resto de entradas, tal cual y en su orden. `nuestra: null` = el CRM no trae dato: no se toca nada.
 */
function conNuestraEntrada<T extends { value?: string }>(
  deGoogle: readonly T[] | undefined, nuestra: { value: string; type: string } | null,
  igual: (x: T) => boolean, pisaPrimera: boolean,
): { value: string; type?: string }[] {
  const resto = (deGoogle ?? []).flatMap((x) => (limpio(x.value) ? [{ ...x, value: x.value! }] : []))
  if (nuestra === null) return resto
  const i = resto.findIndex(igual)
  if (i >= 0) return [resto[i], ...resto.filter((_, j) => j !== i)]
  return [nuestra, ...(pisaPrimera ? resto.slice(1) : resto)]
}

/**
 * La persona a escribir SOBRE un contacto que existe en Google: el CRM pone su entrada y conserva
 * TAL CUAL las demás (otro teléfono, otro correo, la empresa del cliente que Alberto añadió…), y
 * también el teléfono/correo que el CRM no trae (`null` = no se sabe, no «no hay»).
 */
function conservandoDeGoogle(persona: PersonaParaEscribir, cc: CamposSincronizados, g: PersonaGoogle, pisaPrimera: boolean): PersonaParaEscribir {
  const nuestroTel = persona.phoneNumbers[0] ? { value: persona.phoneNumbers[0].value, type: persona.phoneNumbers[0].type ?? 'mobile' } : null
  const nuestroMail = persona.emailAddresses[0] ? { value: persona.emailAddresses[0].value, type: persona.emailAddresses[0].type ?? 'other' } : null
  const nuestraOrg = persona.organizations[0]
  const deOtros = (g.organizations ?? []).filter((o) => limpio(o.name) !== NOMBRE_GRUPO_GOOGLE)
  const iOrg = (g.organizations ?? []).findIndex((o) => limpio(o.name) === NOMBRE_GRUPO_GOOGLE)
  // La nuestra en su sitio si ya estaba (no se reordena la empresa de Alberto); si no, detrás.
  const organizations = iOrg >= 0
    ? (g.organizations ?? []).map((o, j) => (j === iOrg ? nuestraOrg : o)).filter((o, j) => j === iOrg || limpio(o.name) !== NOMBRE_GRUPO_GOOGLE)
    : [...deOtros, nuestraOrg]
  return {
    ...persona,
    phoneNumbers: conNuestraEntrada(g.phoneNumbers, cc.telefono === null ? null : nuestroTel,
      (t) => (limpio(t.canonicalForm) ?? telefonoCanonico(t.value)) === cc.telefono, pisaPrimera),
    emailAddresses: conNuestraEntrada(g.emailAddresses, cc.email === null ? null : nuestroMail,
      (m) => emailCanonico(m.value) === cc.email, pisaPrimera),
    organizations,
    externalIds: [...persona.externalIds, ...(g.externalIds ?? []).flatMap((x) => (x.type !== TIPO_ID_EXTERNO && limpio(x.value) ? [{ ...x, value: x.value! }] : []))],
    // Nota: solo el BLOQUE es del CRM; sin nota en el CRM (`null`), la de Google tal cual.
    biographies: cc.nota === null
      ? (g.biographies ?? []).flatMap((b) => (limpio(b.value) ? [{ value: b.value!, contentType: b.contentType ?? 'TEXT_PLAIN' }] : []))
      : [{ value: conBloque(g.biographies?.[0]?.value, cc.nota), contentType: 'TEXT_PLAIN' }],
    // URL: la de la ficha delante; las de Alberto detrás, tal cual.
    urls: [
      ...(cc.url === null ? [] : (persona.urls ?? [])),
      ...(g.urls ?? []).flatMap((u) => (limpio(u.value) && (cc.url === null || !esNuestraUrl(u)) ? [{ value: u.value!, ...(u.type ? { type: u.type } : {}) }] : [])),
    ],
    // Cumpleaños (singleton): el del CRM si lo sabe; si no, el de Google sin tocar.
    birthdays: cc.cumpleanos === null || !persona.birthdays
      ? (g.birthdays ?? []).flatMap((b) => (b.date || b.text ? [{ ...(b.date ? { date: b.date } : {}), ...(b.text ? { text: b.text } : {}) }] : []))
      : persona.birthdays,
  }
}

// ─── Nombres para emparejar (vínculo por teléfono y adopción) ─────────────────

/** El sufijo que el .vcf ponía al nombre visible: «Ana Pérez · AS Cliente». */
const SUFIJO_VCF = /\s*·\s*AS\s+(Cliente|Lead)\b.*$/iu
const EMOJIS = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\uFE0F\u200D]/gu

/** Nombre comparable: sin sufijo del .vcf, emojis, tildes, mayúsculas ni espacios de más. */
function normNombre(v: string): string {
  return v.replace(SUFIJO_VCF, '').replace(EMOJIS, ' ').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function nombreCrm(c: CamposSincronizados): string {
  return normNombre(`${c.nombre} ${c.apellidos}`)
}

/** Los nombres con que la persona está en la agenda (estructurado, visible y sin estructurar). */
function nombresDeAgenda(p: PersonaGoogle): Set<string> {
  const n = p.names?.[0]
  return new Set([`${n?.givenName ?? ''} ${n?.familyName ?? ''}`, n?.displayName ?? '', n?.unstructuredName ?? ''].map(normNombre).filter((x) => x !== ''))
}

/** ¿Lleva el sufijo «· AS Cliente/Lead» del .vcf en alguno de sus nombres? Señal de que lo volcó el CRM. */
function llevaSufijoVcf(p: PersonaGoogle): boolean {
  const n = p.names?.[0]
  return [n?.givenName, n?.familyName, n?.displayName, n?.unstructuredName].some((x) => /·\s*AS\s+(Cliente|Lead)\b/iu.test(x ?? ''))
}

/** TODOS los teléfonos del contacto, canónicos y sin repetir (se empareja por cualquiera). */
function telefonosDe(p: PersonaGoogle): string[] {
  return [...new Set((p.phoneNumbers ?? []).flatMap((t) => {
    const x = limpio(t.canonicalForm) ?? telefonoCanonico(t.value)
    return x ? [x] : []
  }))]
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
  // Personas SIN vínculo por CADA uno de sus teléfonos (E.164): las de la etiqueta (`libresPorTel`)
  // y las de FUERA (`fueraPorTel`, candidatas a adopción: el volcado del .vcf). Las del grupo, también
  // por id externo. Una con vínculo (también `fuera_del_grupo`: Alberto la sacó) no es candidata.
  const libresPorTel = new Map<string, PersonaGoogle[]>()
  const fueraPorTel = new Map<string, PersonaGoogle[]>()
  const libresPorId = new Map<string, PersonaGoogle>()
  for (const p of e.google) {
    if (p.metadata?.deleted || vinculadoRN.has(p.resourceName)) continue
    const dentro = enGrupo(p, e.grupoResourceName)
    const destino = dentro ? libresPorTel : fueraPorTel
    for (const t of telefonosDe(p)) destino.set(t, [...(destino.get(t) ?? []), p])
    const id = dentro ? idExterno(p) : null
    if (id) libresPorId.set(id, p)
  }
  /** Cuántas fichas sin vínculo casan con ALGUNO de sus teléfonos: más de una = no se sabe de quién es. */
  const fichasDe = (p: PersonaGoogle) => telefonosDe(p).reduce((n, t) => n + (crmPorTel.get(t) ?? 0), 0)
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

  const actualizar = (c: CamposSincronizados, clienteId: string, resourceName: string, etag: string | null, origen: OrigenVinculo, revinculaDe: string | null, g: PersonaGoogle | undefined, anadirAlGrupo = false) => {
    reclamados.add(resourceName)
    let persona = personaDesdeCampos(c, clienteId, etag)
    // Un contacto que se vincula/adopta AHORA por teléfono no lo escribimos nunca: no se pisa su primera entrada.
    const nuevoDeAlberto = (origen === 'vinculado_telefono' || origen === 'adoptado') && revinculaDe === null && !vinculoDe.has(clienteId)
    if (g) persona = conservandoDeGoogle(persona, c, g, !nuevoDeAlberto)
    else if (e.modo === 'delta') {
      // Sin ver el contacto no se sabe qué entradas tiene: la escritura sustituye listas enteras y
      // se llevaría por delante el 2.º teléfono/correo o la empresa que hubiera en Google.
      plan.necesitaListadoCompleto = true
      plan.omitidos++
      return
    }
    plan.actualizar.push({ clienteId, resourceName, origen, revinculaDe, hash: hashCampos(c), persona, ...(anadirAlGrupo ? { anadirAlGrupo: true } : {}) })
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
          // Alguien lo cambió en Google y no coincide con el CRM: CRM gana, Google a revisión (salvo
          // lo que es solo del CRM —bloque de la nota, URL, ⏰—, que se repone sin encolar).
          const campos = diferencias(cc, vista).filter((k) => !SIN_COLA.has(k))
          if (campos.length > 0) plan.revisiones.push({ tipo: 'cambio_en_google', clienteId: c.clienteId, resourceName: v.resourceName, campos, propuesta: cg, huella: huella('cambio_en_google', v.resourceName, hashCampos(cg)) })
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
    // 3) Por teléfono (CUALQUIERA de los del contacto). Primero la etiqueta; si ahí no hay nadie, la
    //    agenda ENTERA: ADOPCIÓN de lo volcado a mano con el .vcf (sin nuestro id, fuera de la etiqueta).
    //    Uno y solo uno a cada lado; si no, a la cola. Fuera de la etiqueta, además, el nombre manda:
    //    mismo teléfono y OTRO nombre es probablemente un contacto PERSONAL de Alberto → ni se adopta
    //    ni se crea (se crearía un segundo contacto con su número): a la cola.
    if (!cc.telefono) {
      plan.crear.push({ clienteId: c.clienteId, hash, persona: personaDesdeCampos(cc, c.clienteId) })
      continue
    }
    if (e.modo === 'delta') {
      // El delta no enseña la agenda entera: sin ella no se sabe si hay que vincular, adoptar,
      // encolar o crear (ni si hay un segundo contacto con ese número).
      plan.necesitaListadoCompleto = true
      plan.omitidos++
      continue
    }
    const tel = cc.telefono
    const disponible = (p: PersonaGoogle) => !reclamados.has(p.resourceName) || ambiguos.has(p.resourceName)
    const deEtiqueta = (libresPorTel.get(tel) ?? []).filter((p) => !idExterno(p) && disponible(p))
    const adopcion = deEtiqueta.length === 0
    // Fuera de la etiqueta: sin id externo, o con el de ESTA ficha (escrito por una adopción a medias).
    const candidatos = adopcion
      ? (fueraPorTel.get(tel) ?? []).filter((p) => { const id = idExterno(p); return (id === null || id === c.clienteId) && disponible(p) })
      : deEtiqueta
    if (candidatos.length === 1 && fichasDe(candidatos[0]) === 1) {
      const p = candidatos[0]
      const nombres = nombresDeAgenda(p)
      const mismo = nombres.has(nombreCrm(cc))
      const vale = adopcion ? mismo || llevaSufijoVcf(p) || idExterno(p) === c.clienteId : nombres.size === 0 || mismo
      const cg = camposDeGoogle(p)
      if (!vale) {
        // Mismo teléfono, OTRO nombre: puede ser otra persona (o el nombre con que Alberto la
        // guardó). Ni se pisa su nombre ni se crea un duplicado: lo decide Alberto en la cola.
        const campos = diferencias(cc, { ...cc, nombre: cg.nombre, apellidos: cg.apellidos })
        plan.revisiones.push({ tipo: 'duplicado_ambiguo', clienteId: c.clienteId, resourceName: p.resourceName, campos: ['telefono', ...campos], propuesta: cg, huella: huella('duplicado_ambiguo', p.resourceName, `${c.clienteId}|${hashIdentidad(cc)}|nombre`), motivo: 'nombre_distinto' })
        reclamados.add(p.resourceName)
        plan.omitidos++
        continue
      }
      // El cumpleaños que Alberto tuviera y el CRM pisa no se pierde en silencio.
      if (cc.cumpleanos !== null && cg.cumpleanos !== null && cg.cumpleanos !== cc.cumpleanos) {
        plan.revisiones.push({ tipo: 'cambio_en_google', clienteId: c.clienteId, resourceName: p.resourceName, campos: ['cumpleanos'], propuesta: cg, huella: huella('cambio_en_google', p.resourceName, hashCampos(cg)) })
      }
      actualizar(cc, c.clienteId, p.resourceName, p.etag ?? null, adopcion ? 'adoptado' : 'vinculado_telefono', null, p, adopcion)
      continue
    }
    if (candidatos.length > 0) {
      const p = candidatos[0]
      plan.revisiones.push({ tipo: 'duplicado_ambiguo', clienteId: c.clienteId, resourceName: p.resourceName, campos: ['telefono'], propuesta: camposDeGoogle(p), huella: huella('duplicado_ambiguo', p.resourceName, `${c.clienteId}|${hashIdentidad(cc)}`), motivo: 'telefono_compartido' })
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

/**
 * ¿Puede el cron ESCRIBIR? Solo con conexión viva y la sincronización ACTIVADA a mano tras revisar la
 * simulación (`sync_activada_en`). Sin esa marca, nada: ni crear la etiqueta, ni tocar contactos, ni
 * vínculos, ni cola. Antes de la primera pasada hay que ver qué haría (la agenda de Alberto ya
 * tiene clientes volcados a mano por el .vcf: sin simular, se duplicarían).
 */
export type PuertaSync = 'sin_conexion' | 'revocada' | 'pendiente_activar' | 'adelante'
export function puertaSync(c: { estado: string; syncActivadaEn: Date | string | null } | null): PuertaSync {
  if (!c) return 'sin_conexion'
  if (c.estado === 'revocada') return 'revocada'
  if (c.syncActivadaEn === null) return 'pendiente_activar'
  return 'adelante'
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
