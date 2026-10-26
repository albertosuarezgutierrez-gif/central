// Tomador de la FICHA para Allianz Turismos/Moto (17/10/2026). PURO: sin BD ni red (`node --test`).
//
// Vive aparte de `tarificador-reglas.ts` porque reutiliza los TROCEADORES puros de la ficha que ya usa Codeoscopic
// (`partirDireccion`, `carnetBDeFicha`/`carnetMotoDeFicha`): el orquestador (`tarificador*.ts`) no importa nada de
// `codeoscopic/` (guardián «el orquestador no toca Codeoscopic ni emite»). Aquí solo hay parseo de texto: ni red, ni env,
// ni consumo del vendor.

import { partirDireccion } from './codeoscopic/direccion.ts'
import { carnetBDeFicha } from './codeoscopic/desde-cartera.ts'
import { carnetMotoMasAntiguo } from '@central/module-seguros'
import { fechaIsoDeFicha } from './tarificador-reglas.ts'
import { claveCompania, esCif, esDniNie, normalizarDocumento, tieneCaracteresProhibidos, validarFichaTomadorAuto, type FichaTomadorAuto } from '@central/module-tarificacion'

const esObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

// «Datos del vehículo» de Allianz pide tipo de tomador (Individual/Empresa), «Número de documento», «Código postal»,
// «Localidad» y la dirección desglosada. Salen de la ficha del cliente (las MISMAS columnas que lee Codeoscopic:
// `clienteOrigenDe`/`personaDeFicha` + `ciudad`/`provincia`; la calle troceada con `partirDireccion`, el carné con
// `carnetBDeFicha`/`carnetMotoDeFicha`). Mismo régimen que `datosTomador`: se descifran e inyectan como `fichaTomador` SOLO
// al ENTREGAR (nunca en BD) y no bloquean nada: lo que no consta va `null` y el bot lo deja como hueco.

/** Compañías cuyo bot recibe `fichaTomador` (auto y moto). Otra compañía no ve la ficha (minimización). */
export const COMPANIAS_CON_FICHA_TOMADOR = ['allianz', 'mapfre'] as const

/**
 * Compañías a las que SOLO se les manda el contacto del tomador (`email` + `telefono` móvil) dentro de `fichaTomador`, con el resto
 * de campos a `null` (minimización RGPD: el NIF y los datos de alta de Mapfre ya salen por `documentoTomador`/`datosTomador`).
 * Mapfre (26/10/2026, autorizado por Alberto): su formulario del proyecto no deja guardarlo sin móvil y correo del tomador.
 */
export const COMPANIAS_FICHA_SOLO_CONTACTO = ['mapfre'] as const

/** Fila de la ficha TAL CUAL está en BD (lo cifrado, cifrado) + sus carnés (`cliente_carnets_conducir`, fecha cifrada; `null` = no se pudieron leer). */
export type FilaFichaTomadorAuto = {
  dni: string | null
  direccion: string | null
  codigoPostal: string | null
  ciudad: string | null
  provincia: string | null
  fechaNacimiento: string | null
  tipoPersona: string | null
  carnets: { tipo: string; fechaCarnet: string | null }[] | null
  /** Teléfonos de la ficha TAL CUAL (cifrados), el principal primero (columna + `cliente_telefonos`). Ausente = no se pidieron. */
  telefonos?: string[]
  /** Correos de la ficha TAL CUAL (cifrados), el principal primero (columna + `cliente_emails`). Ausente = no se pidieron. */
  emails?: string[]
}

/** ¿Este trabajo recibe `fichaTomador`? Allianz o Mapfre + auto/moto. PURA. */
export function necesitaFichaTomador(compania: string, ramo: string): boolean {
  return (COMPANIAS_CON_FICHA_TOMADOR as readonly string[]).includes(claveCompania(compania)) && (ramo === 'auto' || ramo === 'moto')
}

/**
 * Correo y MÓVIL del tomador de la ficha (el primero legible y válido de cada lista, el principal primero). Un teléfono fijo
 * (8/9…) no sirve para el campo «Teléfono móvil» de Mapfre: solo 6 o 7. Lo que no se puede abrir o no es válido → `null`
 * («no se sabe»), nunca un relleno. PURA.
 */
function contactoDeFicha(fila: FilaFichaTomadorAuto, abrir: (v: string | null) => string | null): { email: string | null; telefono: string | null } {
  let email: string | null = null
  for (const crudo of fila.emails ?? []) {
    const m = abrir(crudo)
    if (m !== null && m.length <= 200 && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(m)) { email = m.toLowerCase(); break }
  }
  let telefono: string | null = null
  for (const crudo of fila.telefonos ?? []) {
    const t = abrir(crudo)?.replace(/[\s.\-()]/g, '').replace(/^(\+34|0034)/, '') ?? null
    if (t !== null && /^[67]\d{8}$/.test(t)) { telefono = t; break }
  }
  return { email, telefono }
}

/**
 * Ficha → `fichaTomador`, campo a campo con TRES estados. PURA. Lo cifrado (`v1:`) se abre con `descifrar`; si lanza o
 * devuelve el cifrado (sin clave) → ese campo `null` («no se sabe»), nunca vacío ni inventado. Un valor que no pasa la
 * validación del worker (DNI con letra mal, CP raro…) también `null`: no se manda lo que el portal rechazaría. Empresa =
 * `tipo_persona = juridica`; sin tipo, el que diga el documento (CIF → juridica, DNI/NIE → fisica); sin ninguno, `null`.
 * Una empresa no lleva nacimiento ni carné. `null` = no hay ficha.
 */
export function fichaTomadorAutoDeFicha(fila: FilaFichaTomadorAuto | null, descifrar: (v: string) => string, ramo: string, hoy: Date = new Date(), compania: string = 'allianz'): FichaTomadorAuto | null {
  if (!fila) return null
  const abrir = (v: string | null): string | null => {
    if (typeof v !== 'string' || v.trim() === '') return null
    let claro: string
    try {
      claro = v.startsWith('v1:') ? descifrar(v) : v
    } catch {
      return null
    }
    if (typeof claro !== 'string' || claro.startsWith('v1:')) return null
    const t = claro.replace(/\s+/g, ' ').trim()
    return t === '' ? null : t
  }
  if ((COMPANIAS_FICHA_SOLO_CONTACTO as readonly string[]).includes(claveCompania(compania))) {
    const contacto = contactoDeFicha(fila, abrir)
    if (contacto.email === null && contacto.telefono === null) return null
    const v = validarFichaTomadorAuto({ tipo: null, documento: null, codigoPostal: null, localidad: null, direccion: null, fechaNacimiento: null, fechaCarnet: null, tipoCarnet: null, ...contacto }, hoy)
    return v.ok ? v.valor : null
  }
  const corto = (v: string | null | undefined, max: number): string | null => {
    const t = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : ''
    return t !== '' && t.length <= max && !tieneCaracteresProhibidos(t) ? t : null
  }
  const dniClaro = abrir(fila.dni)
  const doc = dniClaro === null ? null : normalizarDocumento(dniClaro)
  const documento = doc !== null && (esDniNie(doc) || esCif(doc)) ? doc : null
  const tipo: FichaTomadorAuto['tipo'] =
    fila.tipoPersona === 'juridica' ? 'juridica'
      : fila.tipoPersona === 'fisica' ? 'fisica'
        : documento === null ? null : esCif(documento) ? 'juridica' : 'fisica'
  const cpCrudo = (fila.codigoPostal ?? '').trim()
  const prov = Number(cpCrudo.slice(0, 2))
  const codigoPostal = /^\d{5}$/.test(cpCrudo) && prov >= 1 && prov <= 52 ? cpCrudo : null
  const calle = abrir(fila.direccion)
  const provincia = corto(fila.provincia, 60)
  let direccion: FichaTomadorAuto['direccion'] = null
  if (calle !== null) {
    const p = partirDireccion(calle)
    direccion = { provincia, tipoVia: corto(p.tipoVia, 30), nombreVia: corto(p.nombre, 120), numero: corto(p.numero, 10), planta: corto(p.planta, 10), puerta: corto(p.puerta, 10) }
  } else if (provincia !== null) {
    direccion = { provincia, tipoVia: null, nombreVia: null, numero: null, planta: null, puerta: null }
  }
  let fechaNacimiento: string | null = null
  let fechaCarnet: string | null = null
  let tipoCarnet: string | null = null
  if (tipo !== 'juridica') {
    const nac = abrir(fila.fechaNacimiento)
    fechaNacimiento = nac === null ? null : fechaIsoDeFicha(nac)
    const carnets = fila.carnets === null ? null : fila.carnets.map((k) => {
      const f = abrir(k.fechaCarnet)
      return { tipo: k.tipo, fechaExpedicion: f === null ? null : fechaIsoDeFicha(f) }
    })
    const deMoto = ramo === 'moto' ? carnetMotoMasAntiguo(carnets) : null
    const fB = carnetBDeFicha(carnets)
    const fecha = deMoto ? deMoto.fecha : fB === null ? null : fechaIsoDeFicha(fB)
    if (fecha !== null) { fechaCarnet = fecha; tipoCarnet = deMoto ? deMoto.tipo : 'B' }
  }
  const candidato: FichaTomadorAuto = { tipo, documento, codigoPostal, localidad: corto(fila.ciudad, 80), direccion, fechaNacimiento, fechaCarnet, tipoCarnet }
  // La MISMA validación que repite el worker. Los textos ya van acotados arriba; lo único que puede no pasar son las FECHAS
  // (nacimiento o carné futuros, carné anterior al nacimiento): fechas que se contradicen no se sabe cuál está mal → las dos
  // `null` (estado conservador), nunca se elige una.
  const v = validarFichaTomadorAuto(candidato, hoy)
  if (v.ok) return v.valor
  const sinFechas = validarFichaTomadorAuto({ ...candidato, fechaNacimiento: null, fechaCarnet: null, tipoCarnet: null }, hoy)
  return sinFechas.ok ? sinFechas.valor : null
}

/**
 * Al ENTREGAR: el riesgo con `fichaTomador` (Allianz auto/moto) o SIN él (otra compañía, o la ficha no se pudo leer:
 * la clave ausente = «no se miró»). Nunca falla el trabajo: lo que falta lo deja el bot como hueco. PURA.
 */
export function aplicarFichaTomador(compania: string, ramo: string, riesgo: unknown, leer: () => FichaTomadorAuto | null): unknown {
  const sin = (): unknown => {
    if (!esObj(riesgo) || !('fichaTomador' in riesgo)) return riesgo
    const { fichaTomador: _fuera, ...resto } = riesgo
    return resto
  }
  if (!necesitaFichaTomador(compania, ramo) || !esObj(riesgo)) return sin()
  const f = leer()
  return f ? { ...riesgo, fichaTomador: f } : sin()
}
