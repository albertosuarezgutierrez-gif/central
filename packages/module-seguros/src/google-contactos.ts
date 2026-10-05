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

import { eurEs } from './comparativa-precios.ts'
import { etiquetaRamo } from './filtro-cartera.ts'
import type { MotivoDuplicado } from './google-contactos-revision.ts'
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

/**
 * Además de clientes y leads, los contactos de las COMPAÑÍAS (`compania_contactos`, 🔵) y los
 * EX-CLIENTES (⚪, 05/10/2026): ficha con póliza de cartera viva pero NINGUNA en vigor
 * (`esCarteraEnVigor`, nunca `clientes.tipo`). Solo los que YA tienen vínculo: no se crean contactos
 * nuevos de ex-clientes; el que ya estaba se queda con ⚪ en vez de retirarse.
 */
export type GrupoGoogle = GrupoContacto | 'compania' | 'ex_cliente'
/**
 * Estado urgente del contacto (05/10/2026): 🚨 siniestro abierto (no cerrado ni rechazado) · 💶
 * recibo DEVUELTO de una póliza en vigor. Prioridad 🚨 > 💶 > ⏰; nunca más de 2 emojis (tipo + uno).
 */
export type AlertaGoogle = 'siniestro' | 'recibo'
export const EMOJI_ALERTA: Record<AlertaGoogle, string> = { siniestro: '🚨', recibo: '💶' }

/** La más urgente: 🚨 gana a 💶. `null` = ninguna (con las consultas LEÍDAS; si fallan, el cron no escribe). */
export function alertaPrioritaria(p: { siniestroAbierto: boolean; reciboDevuelto: boolean }): AlertaGoogle | null {
  return p.siniestroAbierto ? 'siniestro' : p.reciboDevuelto ? 'recibo' : null
}
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
  /** 🚨/💶 (`alertaPrioritaria`). Gana al ⏰. Clientes y ex-clientes. */
  alerta?: AlertaGoogle | null
  /**
   * MOTE de la ficha (`seguros.cliente_mote`, 05/10/2026): «mamá», «Benito Pintor». Si lo hay, el
   * contacto se llama «<emoji> <mote>» y el nombre de la ficha va al bloque de la nota («Ficha: …»).
   * 🚨 Solo para la agenda de Alberto: nunca en correos, portal, PDF ni envíos (guardián de aislamiento).
   */
  mote?: string | null
  /**
   * «Un número, un contacto» (05/10/2026): `fisica`/`juridica` de la ficha (`clientes.tipo_persona`);
   * `null`/ausente = no consta. Solo decide quién es la PRINCIPAL de un teléfono compartido.
   */
  tipoPersona?: 'fisica' | 'juridica' | null
  /** Ramo · compañía de sus pólizas (`resumenPolizas`), para la línea «También: …» de otra ficha. */
  resumen?: string | null
  /**
   * «Enriquecer ficha»: `true` SOLO si la BD dice que la ficha no tiene NINGÚN teléfono (columna y tabla
   * hija vacías). `false`/ausente = tiene o no se sabe → nunca se propone.
   */
  fichaSinTelefono?: boolean
  /** Ídem con el correo. */
  fichaSinEmail?: boolean
  /**
   * Las OTRAS fichas que comparten su teléfono (las pone `agruparNumeros`, no la selección): van como
   * organizations gestionadas (`TIPO_ORG_TAMBIEN`) del contacto de la principal.
   */
  tambien?: readonly { nombre: string; titulo: string }[]
}

/**
 * El mote que propone «Unificar» desde el contacto de Google: el nombre COMPLETO que ve Alberto
 * (`displayName`, si no `unstructuredName`, si no nombre + apellidos: incluye segundo nombre y
 * tratamiento), limpio (`limpiarMote`). Sin contacto (no se pudo leer), lo que se encoló.
 */
export function moteDesdeAgenda(p: PersonaGoogle | null, encolado: { nombre: string; apellidos: string } | null): string | null {
  const n = p?.names?.[0]
  const candidatos = [
    n?.displayName, n?.unstructuredName,
    [n?.honorificPrefix, n?.givenName, n?.middleName, n?.familyName, n?.honorificSuffix].filter(Boolean).join(' '),
    encolado ? `${encolado.nombre} ${encolado.apellidos}` : null,
  ]
  for (const c of candidatos) {
    const m = limpiarMote(c)
    if (m) return m
  }
  return null
}

/** Línea del bloque de la nota con el nombre de la ficha cuando el contacto lleva mote. */
export const PREFIJO_FICHA = 'Ficha: '
export const MAX_MOTE = 60

/**
 * El mote que propone «Unificar» a partir del nombre con que Alberto tiene el contacto: sin ruido
 * evidente (prefijo «AA »/«AAA » para ordenar la agenda, sufijo «· AS …» del .vcf, emojis, espacios
 * dobles). `null` = no queda nada usable. Corta a 60 (CHECK en BD).
 */
export function limpiarMote(v: string | null | undefined): string | null {
  const t = (v ?? '')
    .replace(SUFIJO_VCF, '')
    .replace(/\s*·\s*AS(?:\s.*)?$/u, '')
    .replace(EMOJIS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:A{2,}\s+)+/u, '')
    .trim()
  return t === '' ? null : [...t].slice(0, MAX_MOTE).join('').trim()
}

const ETIQUETA: Record<GrupoGoogle, string> = { cliente: 'Cliente', lead: 'Lead', compania: 'Compañía', ex_cliente: 'Ex cliente' }
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
export const EMOJI_GRUPO: Record<GrupoGoogle, string> = { cliente: '🟢', lead: '🟡', compania: '🔵', ex_cliente: '⚪' }
export const EMOJI_AVISO = '⏰'
const PREFIJO = /^(🟢|🟡|🔵|⚪)\uFE0F?(?:(⏰|🚨|💶)\uFE0F?)?\s*/u
const GRUPO_DE_EMOJI: Record<string, GrupoGoogle> = { '🟢': 'cliente', '🟡': 'lead', '🔵': 'compania', '⚪': 'ex_cliente' }
const ALERTA_DE_EMOJI: Record<string, AlertaGoogle> = { '🚨': 'siniestro', '💶': 'recibo' }
/** Lo que se escribe en Google cuando la ficha no tiene ni nombre ni apellidos; al leer vuelve a ''. */
const SIN_NOMBRE = '(sin nombre)'

/** `givenName` leído → el nombre sin emojis, el tipo que dice (`null` = no lo lleva), si lleva ⏰ y su 🚨/💶. */
export function quitarPrefijo(givenName: string | null | undefined): { nombre: string; grupo: GrupoGoogle | null; aviso: boolean; alerta: AlertaGoogle | null } {
  const t = (givenName ?? '').replace(/\s+/g, ' ').trim()
  const m = t.match(PREFIJO)
  const resto = (m ? t.slice(m[0].length) : t).trim()
  return {
    nombre: resto === SIN_NOMBRE ? '' : resto, grupo: m ? GRUPO_DE_EMOJI[m[1]] : null,
    aviso: m?.[2] === EMOJI_AVISO, alerta: m?.[2] ? (ALERTA_DE_EMOJI[m[2]] ?? null) : null,
  }
}

/**
 * El `givenName` que se escribe: emoji de tipo + COMO MUCHO uno de estado (🚨 > 💶 > ⏰) + nombre; sin
 * nombre pero con apellidos, solo los emojis.
 */
function givenNameConPrefijo(c: Pick<CamposSincronizados, 'nombre' | 'apellidos' | 'grupo' | 'aviso'> & { alerta?: AlertaGoogle | null }): string {
  const e = EMOJI_GRUPO[c.grupo ?? 'lead'] + (c.alerta ? EMOJI_ALERTA[c.alerta] : c.aviso ? EMOJI_AVISO : '')
  if (c.nombre !== '') return `${e} ${c.nombre}`
  return c.apellidos !== '' ? e : `${e} ${SIN_NOMBRE}`
}

/** Cómo se verá el contacto en la agenda: «🟢 Juan Pérez García». */
export function nombreEnGoogle(c: Pick<CamposSincronizados, 'nombre' | 'apellidos' | 'grupo'> & { aviso?: boolean; alerta?: AlertaGoogle | null }): string {
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
  /** ⏰ en el prefijo. Falso si hay `alerta` (no se ve: lo que no se escribe no se compara). */
  aviso: boolean
  /** 🚨/💶 en el prefijo (`null` = ninguna). */
  alerta: AlertaGoogle | null
  /**
   * Las otras fichas del MISMO número (organizations `TIPO_ORG_TAMBIEN`), en JSON canónico
   * (`[[nombre, título], …]` ordenado). `null` = ninguna: es presentación del CRM, se compara siempre.
   */
  tambien: string | null
}

/** Subconjunto de `Person` de la People API que se lee. */
export type PersonaGoogle = {
  resourceName: string
  etag?: string
  metadata?: { deleted?: boolean }
  names?: { givenName?: string; familyName?: string; middleName?: string; honorificPrefix?: string; honorificSuffix?: string; displayName?: string; unstructuredName?: string }[]
  phoneNumbers?: { value?: string; canonicalForm?: string; type?: string }[]
  emailAddresses?: { value?: string; type?: string }[]
  organizations?: { name?: string; title?: string; type?: string }[]
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
  organizations: { name?: string; title?: string; type?: string }[]
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

/**
 * `hash_enviado` de un vínculo creado por «Unificar» en la cola (`google-contactos-revision.ts`): aún
 * NO se ha escrito nada en Google. La pasada siguiente lo trata como una ADOPCIÓN (entrada del CRM,
 * lo demás de Alberto se conserva, entra en la etiqueta) en vez de leerlo como «sacado del grupo».
 * No es un sha256 (64 hex): no puede chocar con un hash real.
 */
export const HASH_PENDIENTE_UNIFICAR = 'pendiente:unificar'
/** Línea que se añade a la nota (FUERA del bloque del CRM) con el nombre con que Alberto lo tenía guardado. */
export const PREFIJO_NOMBRE_ANTERIOR = 'Guardado antes en tu agenda como: '

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
  | 'telefono_titular' | 'telefono_muchas_fichas' | 'enriquecer_ficha'

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
   * Solo en `duplicado_ambiguo`: por qué (`MOTIVOS_DUPLICADO`). Se guarda en la columna `motivo`
   * (migración 2026-10-05d): de él depende que la cola ofrezca «Unificar» (solo si es inequívoco).
   */
  motivo?: MotivoDuplicado
  /**
   * Solo `telefono_titular` («Este número es de…») y `telefono_muchas_fichas` (informativa): el índice ciego del teléfono (`hashTelefono`,
   * nunca el número en claro) y las fichas entre las que elegir (ordenadas).
   */
  telefonoHash?: string
  candidatos?: string[]
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
  /**
   * «Un número, un contacto»: contactos de fichas SECUNDARIAS (su teléfono ya va en el de la principal)
   * que dejan de ser nuestros. NUNCA se borran: se reescribe el contacto SIN lo que puso el CRM
   * (emoji, organizations, id externo, URL, bloque de la nota) y se saca de la etiqueta; luego se
   * borra el vínculo. Lo de Alberto (teléfonos, correos, su texto, cumpleaños) se queda tal cual.
   */
  desvincular: { clienteId: string; resourceName: string; persona: PersonaParaEscribir }[]
  /** Los que se desvincularían (aunque se hayan BLOQUEADO por pasar de `MAX_DESVINCULAR_POR_PASADA`). */
  desvincularCalculados: number
  /** Números compartidos: combinados solos (titular decidido), a la cola, y con más de `MAX_FICHAS_POR_NUMERO`. */
  numerosCompartidos: { combinados: number; enCola: number; demasiadas: number }
  /** Fichas principales de los números combinados (su contacto lleva a las demás dentro). */
  principalesCombinadas: string[]
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
  /**
   * Titular ELEGIDO por Alberto para un teléfono compartido (`google_contactos_titular_telefono`):
   * índice ciego del número → ficha. Ausente = ninguno elegido.
   */
  titulares?: ReadonlyMap<string, string>
  /** Índice ciego de un E.164 (en la app, `computeTelefonoLookupHash`). Por defecto, sha256 (tests). */
  hashTelefono?: (e164: string) => string
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
/** La nota SIN el bloque del CRM: solo lo que escribió Alberto (vacía si no había nada más). */
export function sinBloque(bio: string | null | undefined): string {
  const t = (bio ?? '').replace(/\r\n?/g, '\n')
  const b = localizarBloque(t)
  if (!b) return t.trim()
  return [t.slice(0, b.i).trim(), t.slice(b.j).trim()].filter((x) => x !== '').join('\n\n')
}

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

const ESTADO_SINIESTRO: Record<string, string> = { abierto: 'abierto', en_tramitacion: 'en tramitación' }

/**
 * Líneas de estado para el bloque de la nota (05/10/2026, decisión de Alberto): 🚨 cada siniestro
 * ABIERTO (nº y estado) y 💶 cada recibo DEVUELTO (importe `2.162,49€` y ramo · compañía; el nº de
 * póliza NO: la nota se copia a otras apps). Ordenadas: el orden de la consulta no cambia el hash.
 * `importe: null` = el EIAC no lo trae legible: se dice «importe no consta», nunca 0€.
 */
export function lineasEstado(p: {
  siniestros: readonly { numero: string | null; estado: string }[]
  recibos: readonly { importe: number | null; ramo: string; compania: string | null }[]
}): string[] {
  const s = p.siniestros.map((x) => `🚨 Siniestro ${limpio(x.numero) ?? 'sin número'} · ${ESTADO_SINIESTRO[x.estado] ?? x.estado}`)
  const r = p.recibos.map((x) => `💶 Recibo devuelto: ${x.importe === null ? 'importe no consta' : eurEs(x.importe)} · ${etiquetaRamo(x.ramo)} · ${limpio(x.compania) ?? SIN_COMPANIA}`)
  return [...[...new Set(s)].sort((a, b) => a.localeCompare(b, 'es')), ...[...new Set(r)].sort((a, b) => a.localeCompare(b, 'es'))]
}

/** Nota de un EX-CLIENTE (⚪): «Ex cliente: baja mm/aaaa, compañía». Sin fecha, se dice. */
export function notaExCliente(p: { baja: string | null; compania: string | null }, estado: readonly string[] = []): string {
  const m = (p.baja ?? '').match(/^(\d{4})-(\d{2})/)
  const out = [`Ex cliente: baja ${m ? `${m[2]}/${m[1]}` : '(fecha no consta)'}, ${limpio(p.compania) ?? SIN_COMPANIA}`, ...estado]
  return normNota(out.join('\n'))!
}

/** El bloque de un cliente con sus líneas de estado debajo. */
export function conLineasEstado(nota: string, estado: readonly string[]): string {
  return estado.length ? normNota([nota, ...estado].join('\n'))! : nota
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
  // Por PUNTOS DE CÓDIGO (no unidades UTF-16): cortar a 60 con `slice` partiría un emoji en dos.
  const mote = c.grupo === 'compania' ? null : (limpio(c.mote) ? [...limpio(c.mote)!].slice(0, MAX_MOTE).join('').trim() || null : null)
  const ficha = `${limpio(c.nombre) ?? ''} ${limpio(c.apellidos) ?? ''}`.trim()
  return {
    // Con mote, el contacto se llama así (todo en el nombre, sin apellidos) y la ficha va a la nota.
    nombre: mote ?? limpio(c.nombre) ?? '',
    apellidos: mote ? '' : (limpio(c.apellidos) ?? ''),
    telefono: telefonoCanonico(c.telefono) || null,
    email: emailCanonico(c.email),
    grupo: c.grupo,
    nota: mote && ficha ? normNota(`${PREFIJO_FICHA}${ficha}\n${c.nota ?? ''}`) : normNota(c.nota),
    url: limpio(c.url),
    cumpleanos: normalizarNacimiento(c.cumpleanos),
    // Solo se cuenta lo que se VE: con 🚨/💶 el ⏰ no se escribe, así que tampoco se compara (si no,
    // releído sin ⏰ diferiría del CRM y se reescribiría cada hora).
    aviso: c.grupo === 'cliente' && c.aviso === true && !alertaDe(c),
    alerta: alertaDe(c),
    tambien: tambienCanonico((c.tambien ?? []).map((t) => [t.nombre, t.titulo])),
  }
}

/** Organization gestionada «también»: otra ficha con el mismo teléfono. Se reconoce por su `type`. */
export const TIPO_ORG_TAMBIEN = 'Grupo ASegura · también'

function esOrgTambien(o: { type?: string }): boolean {
  return o.type === TIPO_ORG_TAMBIEN
}

/** `[[nombre, título], …]` limpio, sin repetir y ordenado → JSON; `null` si no hay ninguna. */
function tambienCanonico(xs: readonly (readonly [string | null | undefined, string | null | undefined])[]): string | null {
  const limpios = xs.flatMap(([n, t]) => (limpio(n) ? [[limpio(n)!, limpio(t) ?? ''] as [string, string]] : []))
  const unicos = [...new Map(limpios.map((x) => [JSON.stringify(x), x])).values()]
    .sort((a, b) => a[0].localeCompare(b[0], 'es') || a[1].localeCompare(b[1], 'es') || (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1))
  return unicos.length ? JSON.stringify(unicos) : null
}

function orgsTambien(tambien: string | null): { name: string; title?: string; type: string }[] {
  if (tambien === null) return []
  const xs = JSON.parse(tambien) as [string, string][]
  return xs.map(([name, title]) => ({ name, ...(title ? { title } : {}), type: TIPO_ORG_TAMBIEN }))
}

function alertaDe(c: ContactoGoogle): AlertaGoogle | null {
  return (c.grupo === 'cliente' || c.grupo === 'ex_cliente') && (c.alerta === 'siniestro' || c.alerta === 'recibo') ? c.alerta : null
}

const GRUPO_DE_TITULO: Record<string, GrupoGoogle> = { Cliente: 'cliente', Lead: 'lead', 'Compañía': 'compania', 'Ex cliente': 'ex_cliente' }

function esNuestraUrl(u: { value?: string; type?: string }): boolean {
  return u.type === TIPO_URL || RUTA_FICHA.test(u.value ?? '')
}

/** Lo mismo leído de Google, con la misma normalización (si no, cada hora sería un «cambio»). */
export function camposDeGoogle(p: PersonaGoogle): CamposSincronizados {
  const n = p.names?.[0]
  const { nombre, grupo: grupoPrefijo, aviso, alerta } = quitarPrefijo(n?.givenName)
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
    alerta,
    tambien: tambienCanonico((p.organizations ?? []).filter(esOrgTambien).map((o) => [o.name, o.title])),
  }
}

const CAMPOS: readonly (keyof CamposSincronizados)[] = ['nombre', 'apellidos', 'telefono', 'email', 'grupo', 'nota', 'url', 'cumpleanos', 'aviso']
/**
 * Campos que, editados en Google, el CRM repone SIN encolar: el bloque de la nota y la URL son
 * del CRM, y el ⏰ es derivado de las fechas (decisión de Alberto, 05/10/2026).
 */
const SIN_COLA = new Set<keyof CamposSincronizados>(['nota', 'url', 'aviso', 'alerta', 'tambien'])

/**
 * `alerta` entra en el hash SOLO cuando hay una: así los hashes de antes del 05/10/2026 (sin
 * alerta) no cambian y el despliegue no reescribe la agenda entera.
 */
export function hashCampos(c: CamposSincronizados): string {
  const valores: unknown[] = CAMPOS.map((k) => c[k])
  if (c.alerta) valores.push(c.alerta)
  // Igual «también»: solo cuando lo hay (los hashes de las fichas que no comparten número no cambian).
  if (c.tambien !== null && c.tambien !== undefined) valores.push({ tambien: c.tambien })
  return createHash('sha256').update(JSON.stringify(valores)).digest('hex')
}

/** Solo lo que identifica a la persona: la huella de un ambiguo no cambia porque cambie su nota o su ⏰. */
function hashIdentidad(c: CamposSincronizados): string {
  return createHash('sha256').update(JSON.stringify([c.nombre, c.apellidos, c.telefono])).digest('hex')
}

export function diferencias(a: CamposSincronizados, b: CamposSincronizados): (keyof CamposSincronizados)[] {
  return [...CAMPOS, 'alerta' as const, 'tambien' as const].filter((k) => (a[k] ?? null) !== (b[k] ?? null))
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
    // Las otras fichas del número DELANTE: es la «empresa» que se ve al recibir la llamada.
    organizations: [...orgsTambien(c.tambien ?? null), { name: NOMBRE_GRUPO_GOOGLE, title: etiqueta }],
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
  // La entrada «Grupo ASegura» es la ÚLTIMA de las nuestras; delante, las «también» (si las hay).
  const nuestraOrg = persona.organizations[persona.organizations.length - 1]
  const tambienOrgs = persona.organizations.filter(esOrgTambien)
  // Las «también» que hubiera en Google se sustituyen enteras por las del CRM (son solo nuestras).
  const deGoogle = (g.organizations ?? []).filter((o) => !esOrgTambien(o))
  const deOtros = deGoogle.filter((o) => limpio(o.name) !== NOMBRE_GRUPO_GOOGLE)
  const iOrg = deGoogle.findIndex((o) => limpio(o.name) === NOMBRE_GRUPO_GOOGLE)
  // La nuestra en su sitio si ya estaba (no se reordena la empresa de Alberto); si no, detrás.
  const organizations = iOrg >= 0
    ? deGoogle.flatMap((o, j) => (j === iOrg ? [...tambienOrgs, nuestraOrg] : limpio(o.name) !== NOMBRE_GRUPO_GOOGLE ? [o] : []))
    : [...deOtros, ...tambienOrgs, nuestraOrg]
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
export function normNombre(v: string): string {
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
export function telefonosDe(p: PersonaGoogle): string[] {
  return [...new Set((p.phoneNumbers ?? []).flatMap((t) => {
    const x = limpio(t.canonicalForm) ?? telefonoCanonico(t.value)
    return x ? [x] : []
  }))]
}

/** TODOS los correos del contacto, canónicos y sin repetir. */
function emailsDe(p: PersonaGoogle): string[] {
  return [...new Set((p.emailAddresses ?? []).flatMap((m) => { const x = emailCanonico(m.value); return x ? [x] : [] }))]
}

/** El nombre con que Alberto ve el contacto en su agenda (tal cual, sin espacios de más). */
export function nombreVisible(p: PersonaGoogle): string | null {
  const n = p.names?.[0]
  return limpio(n?.displayName) ?? limpio(`${n?.givenName ?? ''} ${n?.familyName ?? ''}`) ?? limpio(n?.unstructuredName)
}

/**
 * La nota con «Guardado antes en tu agenda como: X» DELANTE (fuera del bloque del CRM, así que se
 * conserva para siempre y no entra en el hash). Idempotente: si la línea ya está, no se repite.
 */
export function conNombreAnterior(bio: string | null | undefined, nombre: string): string {
  const linea = `${PREFIJO_NOMBRE_ANTERIOR}${nombre.replace(/\s+/g, ' ').trim()}`
  const t = (bio ?? '').replace(/\r\n?/g, '\n')
  if (t.split('\n').some((l) => l.trim() === linea)) return t
  return t.trim() === '' ? linea : `${linea}\n\n${t}`
}

// ─── «Un número, un contacto» (05/10/2026, decisión de Alberto) ─────────────────
//
// Varias fichas con el MISMO teléfono E.164 (la empresa y la persona que la lleva, un matrimonio…)
// son UN contacto en Google: el de la PRINCIPAL (la persona). Las demás no tienen contacto propio:
// van como organizations gestionadas (`TIPO_ORG_TAMBIEN`) y en el bloque de la nota («También: …»).
// 🚨 Es SOLO presentación en Google: las fichas del CRM NO se fusionan (NIF distintos; regla de
// agrupar por identidad). Principal: la elegida por Alberto en la cola («Este número es de…»); si no
// hay elección, la única `fisica` frente a `juridica`; si no es inequívoco, a la cola y no se crea
// nada para las fichas de ese número que aún no tienen contacto.

const ESTADO_FICHA: Record<GrupoGoogle, string> = { cliente: 'cliente', lead: 'lead', compania: 'compañía', ex_cliente: 'ex cliente' }

/** Tipo del contacto de un número compartido: 🟢 si ALGUNA ficha está en vigor; si no 🟡 lead; si no ⚪. */
export function grupoCombinado(gs: readonly GrupoGoogle[]): GrupoGoogle {
  return gs.includes('cliente') ? 'cliente' : gs.includes('lead') ? 'lead' : gs.includes('ex_cliente') ? 'ex_cliente' : (gs[0] ?? 'lead')
}

/** «Hogar · Mapfre, Auto · Allianz» (sin repetir, ordenado: el orden de la consulta no cambia el hash). */
export function resumenPolizas(ps: readonly { ramo: string; compania: string | null }[]): string | null {
  const xs = [...new Set(ps.map((x) => `${etiquetaRamo(x.ramo)} · ${limpio(x.compania) ?? SIN_COMPANIA}`))].sort((a, b) => a.localeCompare(b, 'es'))
  return xs.length ? xs.join(', ') : null
}

function nombreFicha(c: Pick<ContactoGoogle, 'nombre' | 'apellidos'>): string {
  return `${limpio(c.nombre) ?? ''} ${limpio(c.apellidos) ?? ''}`.trim() || SIN_NOMBRE
}

/** La línea del bloque de la nota de la principal por cada OTRA ficha del número. */
export function lineaTambien(s: ContactoGoogle): string {
  const det = [ESTADO_FICHA[s.grupo], limpio(s.resumen)].filter(Boolean).join(', ')
  const a = alertaDe(s)
  return `También: ${nombreFicha(s)} (${det})${a === 'siniestro' ? ' · 🚨 siniestro abierto' : a === 'recibo' ? ' · 💶 recibo devuelto' : ''}`
}

/**
 * Más fichas que esto con el MISMO número (centralita, gestoría…) → ni titular automático ni combinación:
 * cada ficha sigue como estaba y UNA revisión informativa por número. Nada de 30 organizations en un contacto.
 */
export const MAX_FICHAS_POR_NUMERO = 3
/** Tope ABSOLUTO de desvinculaciones por pasada: por encima, no se ejecuta NINGUNA y se avisa. */
export const MAX_DESVINCULAR_POR_PASADA = 10

export type DecisionTitular = { titular: string; por: 'elegido' | 'tipo_persona' } | { titular: null }

/**
 * ¿De quién es el número? 1) la ficha que eligió Alberto, si sigue entre las que lo comparten; 2) la
 * ÚNICA persona física cuando TODAS las demás son jurídicas (`tipo_persona` NULL = no se sabe: no
 * decide); 3) nadie → cola.
 */
export function titularDeNumero(miembros: readonly Pick<ContactoGoogle, 'clienteId' | 'tipoPersona'>[], elegido: string | null): DecisionTitular {
  if (miembros.length > MAX_FICHAS_POR_NUMERO) return { titular: null }
  if (elegido && miembros.some((m) => m.clienteId === elegido)) return { titular: elegido, por: 'elegido' }
  const fisicas = miembros.filter((m) => m.tipoPersona === 'fisica')
  const juridicas = miembros.filter((m) => m.tipoPersona === 'juridica')
  if (fisicas.length === 1 && juridicas.length === miembros.length - 1) return { titular: fisicas[0].clienteId, por: 'tipo_persona' }
  return { titular: null }
}

function hashTelefonoPorDefecto(e164: string): string {
  return createHash('sha256').update(`tel|${e164}`).digest('hex')
}

export type Agrupacion = {
  /** La selección con UNA ficha por número compartido (la principal, ya combinada). */
  crm: ContactoGoogle[]
  /** secundaria → principal. */
  secundarias: Map<string, string>
  /** Fichas de un número SIN titular decidido y sin vínculo: no se crea nada para ellas. */
  retenidas: Set<string>
  /** Los números (E.164) sin titular decidido: sus contactos de la etiqueta no son «propuesta de lead». */
  telefonosRetenidos: Set<string>
  revisiones: Revision[]
  combinados: number
  enCola: number
  demasiadas: number
}

/**
 * Agrupa por teléfono E.164 (solo fichas: los contactos de compañía 🔵 no entran) y combina cada
 * número compartido en su principal: tipo combinado (`grupoCombinado`), la alerta más urgente
 * (🚨 > 💶), ⏰ si alguna en vigor vence pronto, la nota con «También: …» y las organizations.
 * `tieneVinculo` = la ficha ya tiene contacto (sin titular decidido, esa sigue como estaba).
 */
export function agruparNumeros(p: {
  crm: readonly ContactoGoogle[]
  campos: ReadonlyMap<string, CamposSincronizados | null>
  titulares: ReadonlyMap<string, string>
  hashTelefono: (e164: string) => string
  tieneVinculo: (clienteId: string) => boolean
}): Agrupacion {
  const porTel = new Map<string, ContactoGoogle[]>()
  for (const c of p.crm) {
    if (c.grupo === 'compania') continue
    const t = p.campos.get(c.clienteId)?.telefono
    if (!t || !t.startsWith('+')) continue // sin E.164 no se agrupa (no se sabe si es el mismo número)
    porTel.set(t, [...(porTel.get(t) ?? []), c])
  }
  const sustituta = new Map<string, ContactoGoogle>()
  const secundarias = new Map<string, string>()
  const retenidas = new Set<string>()
  const telefonosRetenidos = new Set<string>()
  const revisiones: Revision[] = []
  let combinados = 0
  let enCola = 0
  let demasiadas = 0
  for (const [tel, ms0] of porTel) {
    if (ms0.length < 2) continue
    const ms = [...ms0].sort((a, b) => (a.clienteId < b.clienteId ? -1 : 1))
    const h = p.hashTelefono(tel)
    const d = titularDeNumero(ms, p.titulares.get(h) ?? null)
    if (d.titular === null) {
      const candidatos = ms.map((m) => m.clienteId)
      // Con más de 3 fichas no se pregunta «de quién es» (no es de nadie): solo se informa.
      const tipo: TipoRevision = ms.length > MAX_FICHAS_POR_NUMERO ? 'telefono_muchas_fichas' : 'telefono_titular'
      if (tipo === 'telefono_muchas_fichas') demasiadas++
      else enCola++
      revisiones.push({
        tipo, clienteId: null, resourceName: `telefono:${h}`, campos: [], propuesta: null,
        huella: huella(tipo, `telefono:${h}`, candidatos.join(',')), telefonoHash: h, candidatos,
      })
      for (const m of ms) if (!p.tieneVinculo(m.clienteId)) retenidas.add(m.clienteId)
      telefonosRetenidos.add(tel)
      continue
    }
    const principal = ms.find((m) => m.clienteId === d.titular)!
    const otras = ms.filter((m) => m.clienteId !== d.titular)
    const alertas = ms.map(alertaDe)
    const alerta: AlertaGoogle | null = alertas.includes('siniestro') ? 'siniestro' : alertas.includes('recibo') ? 'recibo' : null
    const lineas = otras.map(lineaTambien).sort((a, b) => a.localeCompare(b, 'es'))
    sustituta.set(principal.clienteId, {
      ...principal,
      grupo: grupoCombinado(ms.map((m) => m.grupo)),
      alerta,
      aviso: ms.some((m) => m.grupo === 'cliente' && m.aviso === true),
      nota: normNota([principal.nota ?? '', ...lineas].join('\n')),
      tambien: otras.map((s) => ({ nombre: nombreFicha(s), titulo: ETIQUETA[s.grupo] })),
    })
    for (const s of otras) secundarias.set(s.clienteId, principal.clienteId)
    combinados++
  }
  const crm = p.crm.flatMap((c) => (secundarias.has(c.clienteId) || retenidas.has(c.clienteId) ? [] : [sustituta.get(c.clienteId) ?? c]))
  return { crm, secundarias, retenidas, telefonosRetenidos, revisiones, combinados, enCola, demasiadas }
}

/**
 * El contacto de una ficha SECUNDARIA sin nada de lo que puso el CRM: sin emoji, sin la organization
 * «Grupo ASegura» ni las «también», sin nuestro id externo, sin la URL de la ficha y sin el bloque de
 * la nota. Teléfonos, correos, cumpleaños, su texto y su empresa: tal cual. Lleva los OCHO campos de
 * la máscara (uno ausente = Google lo vaciaría).
 */
export function personaSinGestion(g: PersonaGoogle, quitar: { telefono: string | null; email: string | null } = { telefono: null, email: null }): PersonaParaEscribir {
  const n = g.names?.[0]
  // Contacto que CREÓ el CRM: también fuera NUESTRA entrada de teléfono/correo (si no, quedarían dos
  // contactos con el mismo número). Lo que Alberto añadió a mano (otros valores) se queda.
  const esNuestroTel = (t: { value?: string; canonicalForm?: string }) => quitar.telefono !== null && (limpio(t.canonicalForm) ?? telefonoCanonico(t.value)) === quitar.telefono
  const esNuestroMail = (m: { value?: string }) => quitar.email !== null && emailCanonico(m.value) === quitar.email
  const nota = sinBloque(g.biographies?.[0]?.value)
  return {
    ...(g.etag ? { etag: g.etag } : {}),
    names: [{ givenName: quitarPrefijo(n?.givenName).nombre, familyName: limpio(n?.familyName) ?? '' }],
    phoneNumbers: (g.phoneNumbers ?? []).flatMap((t) => (limpio(t.value) && !esNuestroTel(t) ? [{ value: t.value!, ...(t.type ? { type: t.type } : {}) }] : [])),
    emailAddresses: (g.emailAddresses ?? []).flatMap((m) => (limpio(m.value) && !esNuestroMail(m) ? [{ value: m.value!, ...(m.type ? { type: m.type } : {}) }] : [])),
    organizations: (g.organizations ?? []).filter((o) => !esOrgTambien(o) && limpio(o.name) !== NOMBRE_GRUPO_GOOGLE),
    externalIds: (g.externalIds ?? []).flatMap((x) => (x.type !== TIPO_ID_EXTERNO && limpio(x.value) ? [{ value: x.value!, ...(x.type ? { type: x.type } : {}) }] : [])),
    biographies: nota === '' ? [] : [{ value: nota, contentType: g.biographies?.[0]?.contentType ?? 'TEXT_PLAIN' }],
    urls: (g.urls ?? []).flatMap((u) => (limpio(u.value) && !esNuestraUrl(u) ? [{ value: u.value!, ...(u.type ? { type: u.type } : {}) }] : [])),
    birthdays: (g.birthdays ?? []).flatMap((b) => (b.date || b.text ? [{ ...(b.date ? { date: b.date } : {}), ...(b.text ? { text: b.text } : {}) }] : [])),
  }
}

const EMAIL_VALIDO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/u

export function planificarSync(e: EntradaPlan): Plan {
  const plan: Plan = {
    crear: [], actualizar: [], refrescar: [], retirar: [], olvidar: [], apartar: [], reasignar: [], desvincular: [], revisiones: [],
    desvincularCalculados: 0, numerosCompartidos: { combinados: 0, enCola: 0, demasiadas: 0 }, principalesCombinadas: [],
    omitidos: 0, ilegibles: 0, avisos: [], necesitaListadoCompleto: false,
  }
  const crm0 = seleccionUnica(e.crm, e.fusiones)
  const vinculoDe = new Map(e.vinculos.map((v) => [v.clienteId, v]))
  // «Un número, un contacto»: UNA ficha por teléfono compartido (la principal, combinada).
  const campos0 = new Map<string, CamposSincronizados | null>(crm0.map((c) => [c.clienteId, camposDeCrm(c)]))
  const conHerencia = new Set(e.vinculos.filter((v) => e.fusiones.has(v.clienteId)).map((v) => superviviente(v.clienteId, e.fusiones)))
  const agr = agruparNumeros({
    crm: crm0, campos: campos0, titulares: e.titulares ?? new Map(), hashTelefono: e.hashTelefono ?? hashTelefonoPorDefecto,
    tieneVinculo: (id) => vinculoDe.has(id) || conHerencia.has(id),
  })
  plan.revisiones.push(...agr.revisiones)
  plan.numerosCompartidos = { combinados: agr.combinados, enCola: agr.enCola, demasiadas: agr.demasiadas }
  plan.principalesCombinadas = [...new Set(agr.secundarias.values())].sort()
  plan.omitidos += agr.retenidas.size
  const crm = agr.crm
  comprobarLimite({ aSincronizar: crm.length, vinculados: e.vinculos.length, totalCuenta: null })

  const google = new Map(e.google.map((p) => [p.resourceName, p]))
  const vinculadoRN = new Set(e.vinculos.map((v) => v.resourceName))
  const reclamados = new Set<string>() // resourceNames que esta pasada ya asigna a una ficha
  const ambiguos = new Set<string>() // resourceNames con el teléfono de MÁS de una ficha (o al revés)
  const intocables = new Set<string>() // fichas de la selección que NO se pueden retirar
  // Las secundarias y las retenidas SIGUEN en la selección: su vínculo no se retira (ver abajo).
  const enSeleccion = new Set([...crm.map((c) => c.clienteId), ...agr.secundarias.keys(), ...agr.retenidas])
  const vivaEnGrupo = (p: PersonaGoogle | undefined) => !!p && !p.metadata?.deleted && enGrupo(p, e.grupoResourceName)

  // Fichas del CRM (sin vínculo) por E.164, para saber si un teléfono lo comparten dos personas.
  const campos = new Map<string, CamposSincronizados | null>(crm.map((c) => [c.clienteId, camposDeCrm(c)]))
  // Nombres con que se reconoce a cada ficha al emparejar: el de la ficha y, si lo hay, su mote.
  const nombresFicha = new Map(crm.map((c) => [c.clienteId, [...new Set([
    normNombre(`${c.nombre ?? ''} ${c.apellidos ?? ''}`), ...(c.mote && c.grupo !== 'compania' ? [normNombre(c.mote)] : []),
  ])].filter((n) => n !== '')]))
  const conMote = new Set(crm.filter((c) => c.grupo !== 'compania' && limpio(c.mote)).map((c) => c.clienteId))
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
  // Fuera de la etiqueta y SIN id externo, por correo y por nombre completo normalizado: el último
  // filtro antes de CREAR una ficha cuyo teléfono no casa (Alberto la tiene guardada con su nombre).
  const fueraPorEmail = new Map<string, PersonaGoogle[]>()
  const fueraPorNombre = new Map<string, PersonaGoogle[]>()
  for (const p of e.google) {
    if (p.metadata?.deleted || vinculadoRN.has(p.resourceName)) continue
    const dentro = enGrupo(p, e.grupoResourceName)
    const destino = dentro ? libresPorTel : fueraPorTel
    for (const t of telefonosDe(p)) destino.set(t, [...(destino.get(t) ?? []), p])
    const id = dentro ? idExterno(p) : null
    if (id) libresPorId.set(id, p)
    if (!dentro && !idExterno(p)) {
      for (const m of emailsDe(p)) fueraPorEmail.set(m, [...(fueraPorEmail.get(m) ?? []), p])
      for (const n of nombresDeAgenda(p)) fueraPorNombre.set(n, [...(fueraPorNombre.get(n) ?? []), p])
    }
  }
  // Un número sin titular decidido: sus contactos sin vínculo esperan a la elección (no son leads nuevos).
  for (const t of agr.telefonosRetenidos) for (const p of [...(libresPorTel.get(t) ?? []), ...(fueraPorTel.get(t) ?? [])]) reclamados.add(p.resourceName)
  // Fichas SIN vínculo por correo y por nombre: un contacto que casa con DOS fichas no es de nadie.
  const crmPorEmail = new Map<string, Set<string>>()
  const crmPorNombre = new Map<string, Set<string>>()
  for (const c of crm) {
    const x = campos.get(c.clienteId)
    if (!x || vinculoDe.has(c.clienteId)) continue
    if (x.email) crmPorEmail.set(x.email, new Set([...(crmPorEmail.get(x.email) ?? []), c.clienteId]))
    for (const n of nombresFicha.get(c.clienteId) ?? []) crmPorNombre.set(n, new Set([...(crmPorNombre.get(n) ?? []), c.clienteId]))
  }
  const fichasPorEmailONombre = (p: PersonaGoogle) => new Set([
    ...emailsDe(p).flatMap((m) => [...(crmPorEmail.get(m) ?? [])]),
    ...[...nombresDeAgenda(p)].flatMap((n) => [...(crmPorNombre.get(n) ?? [])]),
  ]).size
  /** Cuántas fichas sin vínculo casan con ALGUNO de sus teléfonos: más de una = no se sabe de quién es. */
  const fichasDe = (p: PersonaGoogle) => telefonosDe(p).reduce((n, t) => n + (crmPorTel.get(t) ?? 0), 0)
  // Un contacto sin vínculo que lleva el id de una ficha ABSORBIDA es de su superviviente (el
  // vínculo se perdió al fusionar): se recupera por ahí en vez de crear otro.
  const libresPorSuperviviente = new Map<string, PersonaGoogle>()
  for (const [id, p] of libresPorId) {
    const sup = superviviente(id, e.fusiones)
    if (sup !== id && !libresPorSuperviviente.has(sup)) libresPorSuperviviente.set(sup, p)
  }
  const disponible = (p: PersonaGoogle) => !reclamados.has(p.resourceName) || ambiguos.has(p.resourceName)
  // Vínculos de fichas absorbidas, por superviviente FINAL (las cadenas A→B→C también): el
  // contacto se hereda, no se duplica. Si hay varios, gana uno activo; uno `fuera_del_grupo` se
  // hereda tal cual (Alberto sacó a esa persona del grupo: no se le vuelve a meter).
  const heredable = new Map<string, Vinculo>()
  for (const v of e.vinculos) {
    if (!e.fusiones.has(v.clienteId)) continue
    // Un «Unificar» pendiente de una ficha absorbida NO se hereda: se olvida (no está en la
    // selección) y la superviviente pasa otra vez por la cola. Heredarlo pisaría la primera
    // entrada de Alberto y dejaría el contacto fuera de la etiqueta.
    if (v.hashEnviado === HASH_PENDIENTE_UNIFICAR) continue
    const sup = superviviente(v.clienteId, e.fusiones)
    if (vinculoDe.has(sup)) continue
    const ya = heredable.get(sup)
    if (!ya || (ya.estado !== 'activo' && v.estado === 'activo')) heredable.set(sup, v)
  }

  // «Un número, un contacto»: los vínculos de las fichas SECUNDARIAS. 1) Si la principal aún no tiene
  // contacto, HEREDA el de una secundaria (activo, ya escrito y vivo en la etiqueta): no se crea otro
  // con el mismo número. 2) El resto se DESVINCULA sin borrar nada en Google (`personaSinGestion` +
  // fuera de la etiqueta); si ya no está en la etiqueta, borrado o a medio unificar, solo se olvida.
  const secundariasDe = new Map<string, string[]>()
  for (const [sec, pr] of agr.secundarias) secundariasDe.set(pr, [...(secundariasDe.get(pr) ?? []), sec])
  for (const [pr, ss] of secundariasDe) {
    if (vinculoDe.has(pr) || heredable.has(pr)) continue
    for (const sec of [...ss].sort()) {
      const v = vinculoDe.get(sec)
      if (!v || v.estado !== 'activo' || v.hashEnviado === HASH_PENDIENTE_UNIFICAR) continue
      const g = google.get(v.resourceName)
      // En delta un contacto que no cambió no viene: el camino de la herencia ya pide el listado completo.
      if (e.modo === 'completo' ? !vivaEnGrupo(g) : g !== undefined && !vivaEnGrupo(g)) continue
      heredable.set(pr, v)
      break
    }
  }
  const heredadaDe = new Set([...heredable.values()].map((v) => v.clienteId))
  const desvincular: Plan['desvincular'] = []
  for (const sec of [...agr.secundarias.keys()].sort()) {
    const v = vinculoDe.get(sec)
    if (!v || heredadaDe.has(sec)) continue
    const g = google.get(v.resourceName)
    const borrado = g?.metadata?.deleted === true || (e.modo === 'completo' && !g)
    if (v.estado !== 'activo' || v.hashEnviado === HASH_PENDIENTE_UNIFICAR || borrado || (g && !enGrupo(g, e.grupoResourceName))) {
      plan.olvidar.push(sec)
      continue
    }
    if (!g) {
      plan.necesitaListadoCompleto = true
      continue
    }
    reclamados.add(v.resourceName)
    const cs = campos0.get(sec)
    desvincular.push({
      clienteId: sec, resourceName: v.resourceName,
      persona: personaSinGestion(g, v.origen === 'creado' ? { telefono: cs?.telefono ?? null, email: cs?.email ?? null } : undefined),
    })
  }
  plan.desvincularCalculados = desvincular.length
  if (desvincular.length > MAX_DESVINCULAR_POR_PASADA) {
    // Umbral ABSOLUTO (p. ej. la primera pasada tras el despliegue): no se ejecuta NINGUNA.
    plan.avisos.push(`desvinculación BLOQUEADA: ${desvincular.length} contactos de números compartidos dejarían de ser del CRM de golpe (máx. ${MAX_DESVINCULAR_POR_PASADA}); revisa los titulares`)
  } else {
    plan.desvincular = desvincular
  }

  // «Enriquecer ficha»: el contacto vinculado tiene un teléfono/correo que la ficha NO tiene (la BD
  // dice que está vacía, no «no se sabe») → propuesta en la cola. Nunca uno que ya es de OTRA ficha
  // de la selección (p. ej. el correo de la empresa que quedó en el contacto heredado).
  const valoresCrm = new Set<string>()
  for (const x of campos0.values()) {
    if (x?.telefono) valoresCrm.add(x.telefono)
    if (x?.email) valoresCrm.add(x.email)
  }
  const original = new Map(crm0.map((c) => [c.clienteId, c]))
  const enriquecer = (clienteId: string, g: PersonaGoogle | undefined) => {
    const c = original.get(clienteId)
    if (!c || !g || g.metadata?.deleted || c.grupo === 'compania' || esClaveCompania(clienteId)) return
    const tel = c.fichaSinTelefono === true ? telefonosDe(g).find((t) => t.startsWith('+') && !valoresCrm.has(t)) : undefined
    const mail = c.fichaSinEmail === true ? emailsDe(g).find((m) => EMAIL_VALIDO.test(m) && !valoresCrm.has(m)) : undefined
    const cg = camposDeGoogle(g)
    for (const [campo, valor] of [['telefono', tel], ['email', mail]] as const) {
      if (!valor) continue
      plan.revisiones.push({
        tipo: 'enriquecer_ficha', clienteId, resourceName: g.resourceName, campos: [campo],
        propuesta: { ...cg, telefono: campo === 'telefono' ? valor : null, email: campo === 'email' ? valor : null },
        huella: huella('enriquecer_ficha', g.resourceName, `${clienteId}|${campo}|${valor}`),
      })
    }
  }

  const actualizar = (c: CamposSincronizados, clienteId: string, resourceName: string, etag: string | null, origen: OrigenVinculo, revinculaDe: string | null, g: PersonaGoogle | undefined, anadirAlGrupo = false, unificar = false) => {
    reclamados.add(resourceName)
    let persona = personaDesdeCampos(c, clienteId, etag)
    // Un contacto que se vincula/adopta/unifica AHORA no lo escribimos nunca: no se pisa su primera entrada.
    const nuevoDeAlberto = unificar || ((origen === 'vinculado_telefono' || origen === 'adoptado') && revinculaDe === null && !vinculoDe.has(clienteId))
    if (g) {
      persona = conservandoDeGoogle(persona, c, g, !nuevoDeAlberto)
      // Unificar: el nombre con que Alberto lo tenía guardado no se pierde en silencio (va a la nota,
      // fuera del bloque del CRM). Si ya es el del CRM (p. ej. un reintento tras escribirlo), nada.
      // Con mote no hace falta: el contacto se sigue llamando como Alberto lo llama.
      const anterior = unificar && !conMote.has(clienteId) ? nombreVisible(g) : null
      if (anterior && normNombre(anterior) !== nombreCrm(c)) {
        persona = { ...persona, biographies: [{ value: conNombreAnterior(persona.biographies?.[0]?.value, anterior), contentType: persona.biographies?.[0]?.contentType ?? 'TEXT_PLAIN' }] }
      }
    } else if (e.modo === 'delta') {
      // Sin ver el contacto no se sabe qué entradas tiene: la escritura sustituye listas enteras y
      // se llevaría por delante el 2.º teléfono/correo o la empresa que hubiera en Google.
      plan.necesitaListadoCompleto = true
      plan.omitidos++
      return
    }
    plan.actualizar.push({ clienteId, resourceName, origen, revinculaDe, hash: hashCampos(c), persona, ...(anadirAlGrupo ? { anadirAlGrupo: true } : {}) })
  }

  /**
   * Antes de CREAR una ficha cuyo teléfono no casa: ¿la tiene Alberto ya guardada FUERA de la
   * etiqueta (sin id externo) con el mismo correo o el mismo nombre completo (sin tildes,
   * mayúsculas, emojis ni sufijo «· AS …»)? Entonces NO se crea: a la cola (`mismo_email` /
   * `mismo_nombre`, unificable) o, con varios contactos o varias fichas posibles,
   * `varios_candidatos` (sin «Unificar»). Solo con el listado completo: en delta no se ve la
   * agenda entera, y el `crear` ya fuerza a repetir el plan en completo.
   */
  const encolarSiYaEsta = (cc: CamposSincronizados, clienteId: string): boolean => {
    if (e.modo !== 'completo') return false
    const porEmail = cc.email ? (fueraPorEmail.get(cc.email) ?? []).filter(disponible) : []
    const porNombre = (nombresFicha.get(clienteId) ?? []).flatMap((n) => fueraPorNombre.get(n) ?? []).filter(disponible)
    const todos = [...new Map([...porEmail, ...porNombre].map((p) => [p.resourceName, p])).values()]
    if (todos.length === 0) return false
    const p = todos[0]
    const motivo: MotivoDuplicado = todos.length > 1 || fichasPorEmailONombre(p) > 1
      ? 'varios_candidatos'
      : porEmail.length > 0 ? 'mismo_email' : 'mismo_nombre'
    const cg = camposDeGoogle(p)
    const campos = diferencias(cc, { ...cc, nombre: cg.nombre, apellidos: cg.apellidos, telefono: cg.telefono, email: cg.email })
    plan.revisiones.push({ tipo: 'duplicado_ambiguo', clienteId, resourceName: p.resourceName, campos, propuesta: cg, huella: huella('duplicado_ambiguo', p.resourceName, `${clienteId}|${hashIdentidad(cc)}|${motivo}`), motivo })
    for (const x of todos) {
      reclamados.add(x.resourceName)
      if (motivo === 'varios_candidatos') ambiguos.add(x.resourceName)
    }
    plan.omitidos++
    return true
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
      if (v.hashEnviado === HASH_PENDIENTE_UNIFICAR) {
        // «Unificar» de la cola: aún no se ha escrito nada. Se ADOPTA ese contacto (aunque esté fuera
        // de la etiqueta: NO es «sacado del grupo»). Si ya no existe, el vínculo se olvida y la ficha
        // se vuelve a evaluar la pasada siguiente (sin crear nada en esta).
        const gu = google.get(v.resourceName)
        if (gu?.metadata?.deleted === true || (e.modo === 'completo' && !gu)) {
          plan.olvidar.push(c.clienteId)
          plan.omitidos++
          continue
        }
        enriquecer(c.clienteId, gu)
        if (gu) {
          const cg = camposDeGoogle(gu)
          if (cc.cumpleanos !== null && cg.cumpleanos !== null && cg.cumpleanos !== cc.cumpleanos) {
            plan.revisiones.push({ tipo: 'cambio_en_google', clienteId: c.clienteId, resourceName: v.resourceName, campos: ['cumpleanos'], propuesta: cg, huella: huella('cambio_en_google', v.resourceName, hashCampos(cg)) })
          }
        }
        actualizar(cc, c.clienteId, v.resourceName, gu?.etag ?? v.etag, 'adoptado', null, gu, gu ? !enGrupo(gu, e.grupoResourceName) : false, true)
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
      enriquecer(c.clienteId, g)
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
      enriquecer(c.clienteId, gh)
      actualizar(cc, c.clienteId, h.resourceName, gh?.etag ?? h.etag, h.origen, h.clienteId, gh)
      continue
    }
    // 2) Ya está en el grupo con nuestro id externo, o con el de una ficha fusionada en esta
    //    (vínculo perdido): se recupera.
    const porId = libresPorId.get(c.clienteId) ?? libresPorSuperviviente.get(c.clienteId)
    if (porId && !reclamados.has(porId.resourceName)) {
      enriquecer(c.clienteId, porId)
      actualizar(cc, c.clienteId, porId.resourceName, porId.etag ?? null, 'vinculado_id', null, porId)
      continue
    }
    // 3) Por teléfono (CUALQUIERA de los del contacto). Primero la etiqueta; si ahí no hay nadie, la
    //    agenda ENTERA: ADOPCIÓN de lo volcado a mano con el .vcf (sin nuestro id, fuera de la etiqueta).
    //    Uno y solo uno a cada lado; si no, a la cola. Fuera de la etiqueta, además, el nombre manda:
    //    mismo teléfono y OTRO nombre es probablemente un contacto PERSONAL de Alberto → ni se adopta
    //    ni se crea (se crearía un segundo contacto con su número): a la cola.
    if (!cc.telefono) {
      if (!encolarSiYaEsta(cc, c.clienteId)) plan.crear.push({ clienteId: c.clienteId, hash, persona: personaDesdeCampos(cc, c.clienteId) })
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
    const deEtiqueta = (libresPorTel.get(tel) ?? []).filter((p) => !idExterno(p) && disponible(p))
    const adopcion = deEtiqueta.length === 0
    // Fuera de la etiqueta: sin id externo, o con el de ESTA ficha (escrito por una adopción a medias).
    const candidatos = adopcion
      ? (fueraPorTel.get(tel) ?? []).filter((p) => { const id = idExterno(p); return (id === null || id === c.clienteId) && disponible(p) })
      : deEtiqueta
    if (candidatos.length === 1 && fichasDe(candidatos[0]) === 1) {
      const p = candidatos[0]
      const nombres = nombresDeAgenda(p)
      const mismo = (nombresFicha.get(c.clienteId) ?? []).some((n) => nombres.has(n))
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
      enriquecer(c.clienteId, p)
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
    if (!encolarSiYaEsta(cc, c.clienteId)) plan.crear.push({ clienteId: c.clienteId, hash, persona: personaDesdeCampos(cc, c.clienteId) })
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
