// Lo que una póliza subida (ficha → Documentos, o «Subir póliza») sabe del TOMADOR y la ficha no
// (03/10/2026). Caso fundacional: dos pólizas MAPFRE de una clienta con su fecha de nacimiento,
// carné, domicilio, teléfono y email legibles, y la ficha se quedaba vacía: la oportunidad se abría
// y los datos de la persona se tiraban.
//
// Puro: sin BD, sin red, sin cifrado. Decide QUÉ se puede escribir; escribirlo es de la app.
//
// ─── La regla, entera ───────────────────────────────────────────────────────
//  - SOLO se rellenan HUECOS. Lo que la ficha ya tiene no se pisa nunca (ni un dato «peor»: quien
//    lo escribió pudo verlo en un papel más nuevo).
//  - Solo con IDENTIDAD: el documento trae DNI y es el de la ficha (o la ficha no tiene ninguno).
//    Un DNI distinto es otra persona (el padre, el cuñado: caso de 21/09/2026) → parche VACÍO.
//    Sin DNI en el documento tampoco se toca nada: el nombre no identifica.
//  - `null` = «no se sabe». Nada de `''`, `'N/A'` ni valores de cajón: se anulan aquí.
//  - Fecha de nacimiento 01/01 = casi siempre «solo sé el año» (lo hacen varias compañías y CIMA):
//    se escribe (mejor que nada para tarificar) pero marcada «a confirmar».
//  - Un dato que no se ha podido LEER de la ficha (cifrado que no abre, lista de contactos que no
//    cargó) cuenta como ocupado: el estado conservador es no escribir.

import { MARCADORES_SIN_DATO, cifCompania } from './documento-auto.ts'
import { resolverCompania, type CompaniaCatalogo } from './defensa-cartera.ts'
import { normalizarCp, normalizarDni, normalizarEmail, normalizarFechaNacimiento, normalizarTelefono } from './cliente-edicion.ts'
import { TIPOS_CARNET, claveTipoCarnet, revisarCarnet, type TipoCarnet } from './carnet-ficha.ts'

const SIN_DATO = new Set(MARCADORES_SIN_DATO)

function texto(v: unknown, max = 200): string | null {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim()
  if (t === '' || SIN_DATO.has(t.toLowerCase())) return null
  return t.slice(0, max)
}

// ─── Lo que se lee del tomador (además de nombre, DNI y fechas) ─────────────

/** Contacto y domicilio del TOMADOR, y quién media la póliza. TODO puede ser `null`. */
export type ContactoTomadorLeido = {
  telefono: string | null
  email: string | null
  /** Domicilio de la PERSONA (no la dirección del riesgo de hogar, que va aparte). */
  domicilioVia: string | null
  domicilioCp: string | null
  domicilioPoblacion: string | null
  domicilioProvincia: string | null
  /** Clase del permiso (B, A2…), si el documento la dice. */
  claseCarnet: TipoCarnet | null
  /** Agente / mediador / canal que figura en la póliza. */
  mediador: string | null
  /** `true` = la póliza tiene cesión de derechos (a un banco o financiera). `null` = no lo dice. */
  cesionDerechos: boolean | null
  /**
   * `true` = el documento dice que el TOMADOR es también el conductor habitual. La fecha de carné
   * de una póliza de auto es la del CONDUCTOR: sin esto no se sabe de quién es, y no se vuelca.
   */
  tomadorEsConductorHabitual: boolean | null
}

export function contactoTomadorVacio(): ContactoTomadorLeido {
  return {
    telefono: null,
    email: null,
    domicilioVia: null,
    domicilioCp: null,
    domicilioPoblacion: null,
    domicilioProvincia: null,
    claseCarnet: null,
    mediador: null,
    cesionDerechos: null,
    tomadorEsConductorHabitual: null,
  }
}

/** Teléfono ESPAÑOL de 9 dígitos (6-9…), sin prefijo. Uno extranjero o raro → `null`. */
export function telefonoEspanol(v: unknown): string | null {
  const t = texto(v, 40)
  if (!t) return null
  const r = normalizarTelefono(t)
  return r.ok && /^[6-9]\d{8}$/.test(r.valor) ? r.valor : null
}

/** Email en minúsculas y con forma de email; si no, `null`. */
export function emailNormalizado(v: unknown): string | null {
  const t = texto(v, 254)
  if (!t) return null
  const r = normalizarEmail(t)
  return r.ok ? r.valor : null
}

function booleano(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v
  if (typeof v !== 'string') return null
  const t = v.trim().toLowerCase()
  if (['si', 'sí', 'true', 'yes'].includes(t)) return true
  if (['no', 'false'].includes(t)) return false
  return null
}

/** Convierte lo que devuelva el modelo en `ContactoTomadorLeido`. Nunca lanza. */
export function normalizarContactoTomador(raw: unknown): ContactoTomadorLeido {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return contactoTomadorVacio()
  const o = raw as Record<string, unknown>
  const cp = texto(o.domicilioCp, 10)
  const cpOk = cp ? normalizarCp(cp) : null
  const clase = claveTipoCarnet(texto(o.claseCarnet, 10) ?? '')
  return {
    telefono: telefonoEspanol(o.telefono),
    email: emailNormalizado(o.email),
    domicilioVia: texto(o.domicilioVia, 255),
    domicilioCp: cpOk && cpOk.ok ? cpOk.valor : null,
    domicilioPoblacion: texto(o.domicilioPoblacion, 100),
    domicilioProvincia: texto(o.domicilioProvincia, 100),
    claseCarnet: (TIPOS_CARNET as readonly string[]).includes(clase) ? (clase as TipoCarnet) : null,
    mediador: texto(o.mediador, 200),
    cesionDerechos: booleano(o.cesionDerechos),
    tomadorEsConductorHabitual: booleano(o.tomadorEsConductorHabitual),
  }
}

// ─── Póliza de concesionario / financiada ───────────────────────────────────

/**
 * Mediadores que delatan una póliza vendida con la financiación del coche: la financiera de la
 * marca (RCI / Mobilize = Renault), un banco o una «financial services». Con una de estas, cambiar
 * de compañía puede chocar con el préstamo (la cesión de derechos a favor de la financiera).
 */
const FINANCIERA = /\b(rci|mobilize|financ\w*|financial|banco|bank|banque|credit|cr[eé]dito|leasing|renting|cetelem|cofidis|santander consumer|bbva|caixabank|sabadell|bankinter|unicaja|kutxabank|ibercaja|abanca|stellantis|concesionari\w*)\b/i

/**
 * ¿Es una póliza de concesionario / financiada? `true` con su motivo; `false` si se sabe que no
 * (hay mediador y no es financiera, y no hay cesión); `null` = el documento no dice lo bastante.
 */
export function polizaFinanciada(c: Pick<ContactoTomadorLeido, 'mediador' | 'cesionDerechos'>): { financiada: boolean | null; motivo: string | null } {
  const motivos: string[] = []
  if (c.cesionDerechos === true) motivos.push('cesión de derechos')
  if (c.mediador && FINANCIERA.test(c.mediador)) motivos.push(`mediador ${c.mediador}`)
  if (motivos.length > 0) return { financiada: true, motivo: motivos.join(' y ') }
  // Sin mediador legible no se sabe quién la vendió: «no consta» no es «no es de concesionario».
  return { financiada: c.mediador !== null ? false : null, motivo: null }
}

// ─── Compañía legible ───────────────────────────────────────────────────────

/**
 * La compañía que se guarda en la oportunidad. Lo leído de la póliza manda, salvo que sea basura
 * (03/10/2026: una póliza MAPFRE dejó «P.P.» —la antefirma «por poder»— como compañía): siglas
 * sueltas o sin tres letras seguidas no son una compañía. Entonces, el nombre por su código DGS.
 */
export function companiaLegible(leida: string | null | undefined, nombrePorDgs: string | null | undefined): string | null {
  const t = texto(leida, 120)
  const valida = t !== null && /\p{L}{3,}/u.test(t) && !/^(\p{L}\.?\s*){1,4}$/u.test(t)
  if (valida) return t
  return texto(nombrePorDgs, 120)
}

/**
 * La compañía del catálogo DGS a la que corresponde el nombre leído, por la MISMA normalización
 * que la defensa de cartera (`resolverCompania`: igualdad exacta tras quitar forma jurídica,
 * «España», «seguros»…; nunca subcadena). `seguros.companias_dgs` no tiene CIF (03/10/2026), así
 * que el nombre es la única llave. Varias entidades posibles o ninguna → `null`: no se elige.
 */
export function companiaPorNombre(leida: string | null | undefined, catalogo: readonly CompaniaCatalogo[]): { codigoDgs: string; nombre: string } | null {
  if (!companiaLegible(leida, null)) return null // «P.P.», «S.A.»: siglas de firma, no un nombre
  const r = resolverCompania(catalogo, leida)
  return r.estado === 'resuelta' ? { codigoDgs: r.codigoDgs, nombre: r.nombre } : null
}

// ─── Urgencia ───────────────────────────────────────────────────────────────

/** Días de vencimiento por debajo de los cuales la llamada es URGENTE (prioridad `alta`). */
export const DIAS_VENCIMIENTO_URGENTE = 15

/** ¿Vence en ≤15 días (y no ha vencido ya)? Sin fecha no se sabe → `false` (no se inventa prisa). */
export function vencimientoUrgente(vence: string | null, hoyIso: string, dias = DIAS_VENCIMIENTO_URGENTE): boolean {
  if (!vence || !/^\d{4}-\d{2}-\d{2}$/.test(vence) || !/^\d{4}-\d{2}-\d{2}$/.test(hoyIso)) return false
  const ms = Date.parse(`${vence}T00:00:00Z`) - Date.parse(`${hoyIso}T00:00:00Z`)
  if (!Number.isFinite(ms)) return false
  const d = Math.round(ms / 86_400_000)
  return d >= 0 && d <= dias
}

// ─── El parche ──────────────────────────────────────────────────────────────

/**
 * Lo que la ficha YA tiene. Booleanos sobre la COLUMNA en bruto (un cifrado que no abre también es
 * «tiene»). `telefonos`/`emails`: los valores normalizados de la ficha (columna + tablas); `null` =
 * no se pudieron leer → no se añade ninguno. `carnets`: cuántos tiene; `null` = no se pudo mirar.
 */
export type FichaActual = {
  tieneDni: boolean
  tieneFechaNacimiento: boolean
  tieneDireccion: boolean
  tieneCodigoPostal: boolean
  tieneCiudad: boolean
  tieneProvincia: boolean
  telefonos: readonly string[] | null
  emails: readonly string[] | null
  carnets: number | null
}

/** Lo leído de la póliza que puede ir a la ficha. */
export type ExtraccionFicha = {
  ramo: string | null
  dni: string | null
  fechaNacimiento: string | null
  fechaCarnet: string | null
  contacto: ContactoTomadorLeido
}

/** Cada campo: el valor a ESCRIBIR, o `null` = no se toca. */
export type ParcheFicha = {
  dni: string | null
  fechaNacimiento: string | null
  /** La fecha escrita es 01/01: solo se sabe el año. Va con nota «a confirmar». */
  fechaNacimientoAConfirmar: boolean
  direccion: string | null
  codigoPostal: string | null
  ciudad: string | null
  provincia: string | null
  telefono: string | null
  email: string | null
  carnet: { tipo: TipoCarnet; fecha: string } | null
}

export type MotivoParche = 'ok' | 'dni_distinto' | 'sin_dni_documento' | 'dni_ficha_ilegible'

export type ResultadoParche = {
  parche: ParcheFicha
  /** Qué se rellenaría, en palabras, para la nota del historial. Vacío = nada. */
  rellenado: string[]
  motivo: MotivoParche
}

export function parcheVacio(): ParcheFicha {
  return {
    dni: null,
    fechaNacimiento: null,
    fechaNacimientoAConfirmar: false,
    direccion: null,
    codigoPostal: null,
    ciudad: null,
    provincia: null,
    telefono: null,
    email: null,
    carnet: null,
  }
}

const fechaReal = (v: string | null): v is string => {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

/**
 * El parche que rellena los HUECOS de la ficha con lo leído de la póliza, y nada más.
 *
 * `dniFicha`: el DNI de la ficha descifrado; `null` = la ficha no tiene; `undefined` = no se ha
 * podido leer (cifrado que no abre) → parche vacío. Si `ficha.tieneDni` pero `dniFicha` es null,
 * también es «no se ha podido leer».
 */
export function parcheFichaDesdePoliza(
  ficha: FichaActual,
  ext: ExtraccionFicha,
  dniFicha: string | null | undefined,
  hoyIso: string,
): ResultadoParche {
  const vacio = (motivo: MotivoParche): ResultadoParche => ({ parche: parcheVacio(), rellenado: [], motivo })
  const dniDoc = ext.dni ? normalizarDni(ext.dni) : null
  if (!dniDoc || !dniDoc.ok) return vacio('sin_dni_documento')
  if (dniFicha === undefined || (ficha.tieneDni && !dniFicha)) return vacio('dni_ficha_ilegible')
  if (dniFicha) {
    const f = normalizarDni(dniFicha)
    const clave = f.ok ? f.valor.valor : dniFicha.toUpperCase().replace(/[^0-9A-Z]/g, '')
    if (clave !== dniDoc.valor.valor) return vacio('dni_distinto')
  }

  const p = parcheVacio()
  const rellenado: string[] = []
  const c = ext.contacto

  if (!ficha.tieneDni) {
    p.dni = dniDoc.valor.valor
    rellenado.push('DNI')
  }

  if (!ficha.tieneFechaNacimiento && ext.fechaNacimiento) {
    const r = normalizarFechaNacimiento(ext.fechaNacimiento, new Date(`${hoyIso}T23:59:59Z`))
    if (r.ok) {
      p.fechaNacimiento = r.valor
      p.fechaNacimientoAConfirmar = r.valor.endsWith('-01-01')
      rellenado.push(p.fechaNacimientoAConfirmar ? 'fecha de nacimiento (01/01, a confirmar)' : 'fecha de nacimiento')
    }
  }

  // El domicilio va en BLOQUE: una calle nueva con el CP de otra dirección sería una dirección que
  // no existe. Solo si la ficha no tiene calle; CP, población y provincia rellenan su hueco detrás.
  if (!ficha.tieneDireccion && c.domicilioVia) {
    p.direccion = c.domicilioVia
    rellenado.push('domicilio')
    if (!ficha.tieneCodigoPostal && c.domicilioCp) {
      p.codigoPostal = c.domicilioCp
      rellenado.push('código postal')
    }
    if (!ficha.tieneCiudad && c.domicilioPoblacion) {
      p.ciudad = c.domicilioPoblacion
      rellenado.push('población')
    }
    if (!ficha.tieneProvincia && c.domicilioProvincia) {
      p.provincia = c.domicilioProvincia
      rellenado.push('provincia')
    }
  }

  const tel = telefonoEspanol(c.telefono)
  if (tel && ficha.telefonos !== null && !ficha.telefonos.includes(tel)) {
    p.telefono = tel
    rellenado.push('teléfono')
  }
  const mail = emailNormalizado(c.email)
  if (mail && ficha.emails !== null && !ficha.emails.map((e) => e.toLowerCase()).includes(mail)) {
    p.email = mail
    rellenado.push('email')
  }

  // Carné: solo si la ficha no tiene NINGUNO (lo que hay lo trajo CIMA o lo tecleó Alberto) y solo
  // si el documento dice que el tomador ES el conductor habitual: la fecha de carné de la póliza es
  // la del conductor, que puede ser el hijo. Sin clase en el documento, una póliza de AUTO es el B
  // (la misma regla que la sincro de CIMA); de otro ramo (moto: A, A2, A1…) no se adivina.
  if (ficha.carnets === 0 && c.tomadorEsConductorHabitual === true && fechaReal(ext.fechaCarnet)) {
    const tipo: TipoCarnet | null = c.claseCarnet ?? (ext.ramo === 'auto' ? 'B' : null)
    if (tipo) {
      const r = revisarCarnet({ tipo, fecha: ext.fechaCarnet, fechaNacimiento: p.fechaNacimiento ?? ext.fechaNacimiento, hoy: hoyIso })
      if (r.ok) {
        p.carnet = { tipo: r.tipo, fecha: r.fecha }
        rellenado.push(`carné ${r.tipo}`)
      }
    }
  }

  return { parche: p, rellenado, motivo: 'ok' }
}

// ─── Lo que se guarda con el documento ──────────────────────────────────────

/**
 * LISTA BLANCA de claves de la lectura que NO son datos de una persona: el contrato, el vehículo
 * (sin matrícula) y la vivienda (sin dirección, CP ni localidad). Solo estas se guardan con el
 * documento (`documentos.extraccion`, 03/10/2026). Todo lo demás —tomador, DNI, contactos, fechas
 * de nacimiento y carné, domicilio, matrícula, mediador, y CUALQUIER clave nueva que invente el
 * modelo— se queda fuera: un jsonb es un campo SQL consultable, y en `clientes` esos datos van
 * cifrados. Una clave nueva entra aquí a mano, sabiendo qué es.
 */
export const CLAVES_EXTRACCION_GUARDABLES = [
  'ramo',
  'compania',
  'cifCompania',
  'codigoEntidadDgs',
  'numeroPoliza',
  'fechaEfecto',
  'fechaVencimiento',
  'primaAnual',
  'marca',
  'modelo',
  'version',
  'fechaMatriculacion',
  'aniosSinSiniestros',
  'siniestrosUltimos5',
  'metrosCuadrados',
  'anioConstruccion',
  'capitalContinente',
  'capitalContenido',
  'cesionDerechos',
  'tomadorEsConductorHabitual',
] as const

/** Claves personales conocidas: de estas solo consta SI se leyeron (`leidos`), nunca el valor. */
export const CLAVES_PERSONALES_EXTRACCION = [
  'tomador',
  'dni',
  'fechaNacimiento',
  'fechaCarnet',
  'claseCarnet',
  'telefono',
  'email',
  'domicilioVia',
  'domicilioCp',
  'domicilioPoblacion',
  'domicilioProvincia',
  'direccion',
  'cp',
  'localidad',
  'matricula',
  'mediador',
] as const

/**
 * Lo leído, listo para guardar: solo las claves de la lista blanca (`datos`) y, de las personales
 * conocidas, si el documento las traía (`leidos`, booleanos). `null` si no hay nada que guardar.
 */
export function extraccionSinPii(
  bruto: Record<string, unknown> | null | undefined,
): { datos: Record<string, unknown>; leidos: Record<(typeof CLAVES_PERSONALES_EXTRACCION)[number], boolean> } | null {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return null
  const datos: Record<string, unknown> = {}
  for (const k of CLAVES_EXTRACCION_GUARDABLES) {
    const v = bruto[k]
    // El CIF de la aseguradora solo con forma de CIF de SOCIEDAD: un DNI o NIE metido ahí por la IA
    // sería PII en claro en un jsonb consultable (revisión PR 4160).
    if (k === 'cifCompania') { if (v !== undefined) datos[k] = cifCompania(v); continue }
    // Solo valores planos: un objeto anidado podría esconder cualquier cosa.
    if (v === null || typeof v === 'number' || typeof v === 'boolean') datos[k] = v
    else if (typeof v === 'string') datos[k] = texto(v)
  }
  const leidos = Object.fromEntries(
    CLAVES_PERSONALES_EXTRACCION.map((k) => {
      const v = bruto[k]
      return [k, typeof v === 'string' ? texto(v) !== null : v !== null && v !== undefined]
    }),
  ) as Record<(typeof CLAVES_PERSONALES_EXTRACCION)[number], boolean>
  return { datos, leidos }
}
