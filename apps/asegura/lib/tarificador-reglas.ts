// Tarificador RPA — reglas PURAS del orquestador (05/10/2026). Sin BD ni red: `node --test`.
//
// El canal: apps/asegura encola en `seguros.tarificacion_trabajos`, lanza una máquina EFÍMERA de Fly
// (app `asegura-tarificador`, auto_destroy) por trabajo, y el worker le pide el riesgo y le devuelve
// el resultado por HTTP con su propio Bearer (`TARIFICADOR_WORKER_SECRET`). TARIFICAR ≠ EMITIR.

import { MOTIVOS_FIN, type MotivoFin } from './tarificador-explorador-reglas.ts'
import { leerVehiculoWorker, type VehiculoEncadenado } from './tarificador-espera-vehiculo.ts'
import { nombreUtil, partirApellidos } from './nombre-ficha.ts'
import {
  claveCompania, envDeMaquina, esCif, faltanParaTarificar, mensajeFaltan, leerAtascoWorker, esDniNie, esTipoError, normalizarDocumento, esVersionBot, referenciaPresupuestoValida, sanearInventarioDom, sanearRecorrido, faltaCompaniaAnterior, validarFormularioAuto, validarFormularioHogar, validarFormularioHogarSinTomador, validarOfertas, validarOpcionesPoblacion, validarOpcionesVersion, validarRiesgoComunidad, validarTraza,
  type AtascoWorker, type CandidatoVersion, type DatosTomadorFicha, type Faltante, type FormularioAuto, type FormularioHogarSinTomador, type InventarioDom, type TomadorHogar, type OfertaNormalizada, type OpcionPoblacion, type PasoTraza, type Recorrido, type RiesgoComunidad, type TipoError,
} from '@central/module-tarificacion'

/**
 * Entrada de `POST /encolar` ya validada: el ramo discrimina el riesgo (13/10/2026: comunidades o moto; 14/10/2026: auto;
 * 19/10/2026: hogar, SIN el bloque `tomador`: el DNI y el nacimiento los pone asegura desde la ficha al entregar el trabajo).
 */
export type EntradaRamo = { ramo: 'comunidades'; riesgo: RiesgoComunidad } | { ramo: 'moto' | 'auto'; riesgo: FormularioAuto } | { ramo: 'hogar'; riesgo: FormularioHogarSinTomador }
export type ValidacionEntradaRamo = { ok: true; entrada: EntradaRamo } | { ok: false; mensaje: string; errores?: string[]; faltan?: Faltante[] }

/** Cada ramo con SU validador (el worker repite la misma validación antes de abrir el navegador). */
/**
 * Ramos con adaptador de TARIFICACIÓN (lo que acepta `validarEntradaRamo`). Hogar (19/10/2026) solo para las compañías de
 * `COMPANIAS_HOGAR_RPA`: la fila `mapfre/hogar` u `occident/hogar` sigue habilitando solo la EXPLORACIÓN.
 */
export const RAMOS_TARIFICABLES_RPA = ['comunidades', 'moto', 'auto', 'hogar'] as const

/** Compañías con bot de TARIFICACIÓN de Hogar. Hoy solo Allianz (Mapfre hogar pide datos del tomador que asegura no inyecta; Occident, sin bot). */
export const COMPANIAS_HOGAR_RPA = ['allianz'] as const

/** ¿Esta compañía puede tarificar este ramo por RPA? Todo ramo salvo Hogar (solo `COMPANIAS_HOGAR_RPA`). PURA. */
export function companiaAdmiteRamoRpa(compania: string, ramo: string): boolean {
  return ramo !== 'hogar' || (COMPANIAS_HOGAR_RPA as readonly string[]).includes(claveCompania(compania))
}

/**
 * Con `compania` (15/10/2026), además de la FORMA del ramo, lo que el bot de esa compañía necesita para llegar a precio
 * (`faltanParaTarificar`, fuente única de module-tarificacion) SIN lo que asegura pone desde la ficha (eso lo comprueba
 * `riesgoParaEncolar` con la ficha leída). Una compañía sin declaración no se rechaza AQUÍ: lo hace `riesgoParaEncolar`.
 */
export function validarEntradaRamo(ramo: unknown, riesgo: unknown, compania?: string): ValidacionEntradaRamo {
  const v = validarFormaRamo(ramo, riesgo)
  if (!v.ok || compania === undefined) return v
  if (!companiaAdmiteRamoRpa(compania, v.entrada.ramo)) return { ok: false, mensaje: `ramo_no_admitido: el bot de ${claveCompania(compania)} no tarifica ${v.entrada.ramo} (hogar: solo ${COMPANIAS_HOGAR_RPA.join(', ')})` }
  const faltan = faltanParaTarificar(compania, v.entrada.ramo, v.entrada.riesgo, { sinFicha: true })
  if (faltan && faltan.length) return { ok: false, mensaje: mensajeFaltan(faltan), errores: faltan.map((f) => f.etiqueta), faltan }
  return v
}

function validarFormaRamo(ramo: unknown, riesgo: unknown): ValidacionEntradaRamo {
  if (ramo === 'comunidades') {
    const v = validarRiesgoComunidad(riesgo)
    return v.ok ? { ok: true, entrada: { ramo, riesgo: v.riesgo } } : { ok: false, mensaje: 'riesgo inválido', errores: v.errores }
  }
  // Vehículo (moto 13/10/2026; auto/coche 14/10/2026, Mapfre NSEI): el MISMO validador, y el formulario tiene que ser del
  // ramo del trabajo (un formulario de coche no es un trabajo de moto ni al revés: el worker lo repite en `prepararTrabajo`).
  if (ramo === 'moto' || ramo === 'auto') {
    const v = validarFormularioAuto(riesgo)
    if (!v.ok) return { ok: false, mensaje: 'riesgo inválido', errores: v.errores }
    if (v.formulario.ramo !== ramo) return { ok: false, mensaje: 'riesgo inválido', errores: [`ramo: el formulario de un trabajo ${ramo} tiene que ser de ${ramo}`] }
    return { ok: true, entrada: { ramo, riesgo: v.formulario } }
  }
  // Hogar (19/10/2026): el formulario SIN tomador. Un `tomador` que venga se DESCARTA (no se valida ni se guarda): el DNI y el
  // nacimiento del tomador salen siempre de la ficha, nunca de plataforma (no cruzan el puerto).
  if (ramo === 'hogar') {
    const v = validarFormularioHogarSinTomador(riesgo)
    return v.ok ? { ok: true, entrada: { ramo, riesgo: v.formulario } } : { ok: false, mensaje: 'riesgo inválido', errores: v.errores }
  }
  return { ok: false, mensaje: 'ramo no soportado por el tarificador RPA (comunidades, moto, auto u hogar)' }
}

// ─── NIF del tomador para Mapfre (14/10/2026, decisión de Alberto) ──────────
// Mapfre NSEI busca al tomador por NIF en el paso 1. Lo rellena ASEGURA en el servidor desde la ficha del cliente
// (descifrada aquí), solo en trabajos de Mapfre y solo si el riesgo no lo trae. El DNI entero NUNCA cruza a plataforma:
// ni en la respuesta del encolado ni en un motivo de rechazo.
// 🔒 14/10/2026 (revisión de seguridad): el NIF descifrado NO se GUARDA en `tarificacion_trabajos.riesgo` (la cartera lo
// guarda cifrado; aquí quedaría en claro bajo un rol BYPASSRLS hasta la purga). Al ENCOLAR solo se COMPRUEBA que la ficha
// lo tiene legible y válido y se guarda el riesgo sin él (`riesgoParaEncolar`); se descifra e inyecta al ENTREGAR el
// trabajo `en_curso` al worker (`trabajoParaWorker` → `aplicarNifTomador`), solo en la respuesta, nunca escrito en BD.

/** Compañías cuyo bot busca al tomador por NIF (hoy solo Mapfre). */
export const COMPANIAS_CON_NIF_TOMADOR = ['mapfre'] as const

/** Lectura del NIF de la ficha: `sin_nif` = la ficha no lo tiene; `ilegible` = cifrado que no abre (no se ha podido mirar). */
export type LecturaNifFicha = { estado: 'ok'; documento: string } | { estado: 'sin_nif' } | { estado: 'ilegible' } | { estado: 'no_valido' }

/**
 * NIF de la ficha → lectura. `v1:` se descifra con `descifrar` (la clave de la cartera); si lanza → `ilegible` (nunca
 * «no hay»). En claro (legado) → tal cual. Tiene que ser DNI/NIE/CIF válido (letra de control incluida). PURA.
 */
export function lecturaNifFicha(guardado: string | null | undefined, descifrar: (v: string) => string): LecturaNifFicha {
  if (typeof guardado !== 'string' || guardado.trim() === '') return { estado: 'sin_nif' }
  let claro: string
  if (guardado.startsWith('v1:')) {
    try {
      claro = descifrar(guardado)
    } catch {
      return { estado: 'ilegible' }
    }
  } else claro = guardado
  if (typeof claro !== 'string' || claro.trim() === '') return { estado: 'sin_nif' }
  const d = normalizarDocumento(claro.trim())
  return esDniNie(d) || esCif(d) ? { estado: 'ok', documento: d } : { estado: 'no_valido' }
}

const esObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** ¿Este trabajo necesita que asegura ponga el NIF del tomador? Mapfre + auto/moto + el riesgo no trae documento. PURA. */
export function necesitaNifTomador(compania: string, ramo: string, riesgo: unknown): boolean {
  if (!(COMPANIAS_CON_NIF_TOMADOR as readonly string[]).includes(claveCompania(compania))) return false
  if (ramo !== 'auto' && ramo !== 'moto') return false
  if (!esObj(riesgo)) return true
  const doc = (v: unknown) => typeof v === 'string' && v.trim() !== ''
  return !doc(riesgo.documentoTomador) && !(esObj(riesgo.tomador) && doc(riesgo.tomador.documentoIdentidad))
}

export type NifTomadorAplicado = { ok: true; riesgo: unknown } | { ok: false; status: 422 | 503; motivo: string }

/**
 * Aplica la regla al riesgo que se va a encolar. PURA (la lectura de la ficha la trae quien llama, solo si hace falta):
 *   · compañía que no busca por NIF → el riesgo SIN `documentoTomador` (no se guarda un dato personal que nadie usa);
 *   · Mapfre y el riesgo ya trae documento → tal cual;
 *   · Mapfre sin documento → el de la ficha; sin NIF / ilegible / no válido → rechazo claro SIN encolar.
 * Ningún motivo lleva el documento.
 */
export function aplicarNifTomador(compania: string, ramo: string, riesgo: unknown, leer: () => LecturaNifFicha): NifTomadorAplicado {
  if (!(COMPANIAS_CON_NIF_TOMADOR as readonly string[]).includes(claveCompania(compania))) {
    if (esObj(riesgo) && 'documentoTomador' in riesgo) {
      const { documentoTomador: _fuera, ...resto } = riesgo
      return { ok: true, riesgo: resto }
    }
    return { ok: true, riesgo }
  }
  if (!necesitaNifTomador(compania, ramo, riesgo)) return { ok: true, riesgo }
  const l = leer()
  if (l.estado === 'ok') return { ok: true, riesgo: { ...(esObj(riesgo) ? riesgo : {}), documentoTomador: l.documento } }
  if (l.estado === 'ilegible') return { ok: false, status: 503, motivo: 'nif_tomador_ilegible: el NIF de la ficha del cliente no se puede descifrar (clave de la cartera); no se encola' }
  if (l.estado === 'no_valido') return { ok: false, status: 422, motivo: 'nif_tomador_no_valido: el NIF/CIF de la ficha del cliente no es válido; corrígelo en la ficha (Mapfre busca al tomador por NIF)' }
  return { ok: false, status: 422, motivo: 'falta_nif_tomador: la ficha del cliente no tiene NIF/CIF y Mapfre busca al tomador por NIF; complétalo en la ficha' }
}

/**
 * El riesgo que se GUARDA en la cola: nunca con `documentoTomador` (es el campo que pone asegura desde la ficha, y se
 * inyecta solo al entregar el trabajo al worker). Lo demás, tal cual. PURA.
 */
export function riesgoSinNifTomador<T>(riesgo: T): T {
  // Hogar (19/10/2026): el bloque `tomador` (DNI y nacimiento) lo pone asegura al entregar; en la cola nunca se guarda.
  if (esObj(riesgo) && riesgo.ramo === 'hogar' && 'tomador' in riesgo) {
    const { tomador: _fuera0, ...sinTomador } = riesgo
    return riesgoSinNifTomador(sinTomador as T)
  }
  if (!esObj(riesgo) || !('documentoTomador' in riesgo || 'datosTomador' in riesgo || 'fichaTomador' in riesgo)) return riesgo
  // También `datosTomador` (nombre, apellidos, nacimiento: mismo régimen que el NIF, se inyectan al entregar) y
  // `fichaTomador` (17/10/2026: documento, CP, localidad, dirección y fechas de la ficha; mismo régimen).
  const { documentoTomador: _fuera, datosTomador: _fuera2, fichaTomador: _fuera3, ...resto } = riesgo
  return resto as T
}

/** `faltaCompaniaAnterior` sobre un riesgo sin validar (lectura defensiva: `aniosAseguradoAnterior` y `companiaAnterior`). PURA. */
export function faltaCompaniaAnteriorRiesgo(compania: string, ramo: string, riesgo: unknown): string | null {
  if (!esObj(riesgo)) return null
  const anios = typeof riesgo.aniosAseguradoAnterior === 'number' ? riesgo.aniosAseguradoAnterior : null
  const nombre = typeof riesgo.companiaAnterior === 'string' ? riesgo.companiaAnterior : null
  return faltaCompaniaAnterior(compania, ramo, anios, nombre)
}

/**
 * Al ENCOLAR: el riesgo que se GUARDA, tras comprobar que la ficha permitirá al worker recibir el NIF. Misma regla y
 * mismos rechazos que `aplicarNifTomador`, pero el riesgo devuelto es SIEMPRE `riesgoSinNifTomador` (el documento
 * descifrado jamás vuelve de aquí ni se persiste). PURA.
 */
export function riesgoParaEncolar<T>(
  compania: string, ramo: string, riesgo: T, leer: () => LecturaNifFicha, leerDatos: () => LecturaDatosTomador,
  /** Hogar (19/10/2026): DNI/NIE y nacimiento de la ficha. Sin función = fail-closed (503 ilegible), nunca «no hace falta». */
  leerTomadorHogar: () => LecturaTomadorHogar = () => ({ estado: 'ilegible' }),
): { ok: true; riesgo: T } | { ok: false; status: 422 | 503; motivo: string; faltan?: Faltante[] } {
  const guardado = riesgoSinNifTomador(riesgo)
  // Compañía anterior (Mapfre auto, 15/10/2026): con años asegurado > 0 el portal pide su NOMBRE en «Figuras». Se corta aquí,
  // antes de gastar máquina, igual que `falta_datos_tomador`. El motivo dice QUÉ falta, nunca un valor.
  const ca = faltaCompaniaAnteriorRiesgo(compania, ramo, guardado)
  if (ca) return { ok: false, status: 422, motivo: `falta_compania_anterior: falta ${ca}; indícala en el formulario de bots` }
  const r = aplicarNifTomador(compania, ramo, guardado, leer)
  if (!r.ok) return r
  // Nombre / apellidos / nacimiento (alta del tomador nuevo en Mapfre): se COMPRUEBAN aquí y se inyectan al entregar.
  const d = aplicarDatosTomador(compania, ramo, r.riesgo, leerDatos)
  if (!d.ok) return d
  // Datos obligatorios para llegar a precio (15/10/2026, fuente única `faltanParaTarificar`): se evalúan sobre el riesgo TAL
  // COMO LO RECIBIRÁ EL WORKER (con NIF y datos de la ficha aplicados EN MEMORIA; `d.riesgo` no sale de aquí ni se guarda).
  // Sin declaración para esa compañía/ramo → fail-closed (el worker también lo rechazaría, tras gastar máquina).
  // Tomador de Hogar (DNI/NIE y nacimiento de la ficha): igual, se COMPRUEBA aquí y se inyecta al entregar; nunca se guarda.
  const h = aplicarTomadorHogar(compania, ramo, d.riesgo, leerTomadorHogar)
  if (!h.ok) return h
  const faltan = faltanParaTarificar(compania, ramo, h.riesgo)
  if (faltan === null) return { ok: false, status: 422, motivo: `sin_obligatorios_declarados: ${claveCompania(compania)}/${ramo} no declara qué datos necesita su bot para tarificar (module-tarificacion obligatorios.ts)` }
  if (faltan.length) return { ok: false, status: 422, motivo: `faltan_datos: ${mensajeFaltan(faltan)}`, faltan }
  // Hogar: el worker valida el formulario ENTERO (edad del tomador 18-110, rangos…). Se corta aquí, antes de gastar máquina.
  // Los errores nombran el campo, nunca el valor.
  if (ramo === 'hogar') {
    const v = validarFormularioHogar(h.riesgo)
    if (!v.ok) return { ok: false, status: 422, motivo: `riesgo_invalido: ${v.errores.join('; ')}` }
  }
  return { ok: true, riesgo: guardado }
}

// ─── Tomador de HOGAR (19/10/2026) ───────────────────────────────────────────
// Allianz Hogar pide DNI/NIE y fecha de nacimiento del tomador en la pantalla 1. Mismo régimen que el NIF de Mapfre: los pone
// ASEGURA desde la ficha del cliente (descifrada aquí); al encolar solo se COMPRUEBA que la ficha los tiene legibles y válidos
// y se guarda el riesgo sin `tomador`; se inyectan al ENTREGAR el trabajo `en_curso`, solo en la respuesta, nunca en BD. Los
// motivos nombran qué falta, jamás el valor. Solo personas físicas con DNI/NIE (el formulario de hogar no admite CIF).

/** `incompleta` = la ficha se leyó y le falta o tiene mal algo (frases, nunca valores); `ilegible` = el cifrado no abre (no se ha podido mirar). */
export type LecturaTomadorHogar = { estado: 'ok'; tomador: TomadorHogar } | { estado: 'incompleta'; faltan: string[] } | { estado: 'ilegible' }

/** ¿El bot de este trabajo necesita el tomador de la ficha? Allianz + hogar. PURA. */
export function necesitaTomadorHogar(compania: string, ramo: string): boolean {
  return ramo === 'hogar' && (COMPANIAS_HOGAR_RPA as readonly string[]).includes(claveCompania(compania))
}

/** Ficha → tomador de hogar, con TRES estados por campo. Lo cifrado (`v1:`) se abre con `descifrar`; si lanza → `ilegible`. PURA. */
export function lecturaTomadorHogar(fila: FilaTomadorFicha | null, descifrar: (v: string) => string): LecturaTomadorHogar {
  if (!fila) return { estado: 'incompleta', faltan: ['la ficha'] }
  const abrir = (v: string | null): string | null => {
    if (typeof v !== 'string' || v.trim() === '') return null
    const claro = v.startsWith('v1:') ? descifrar(v) : v
    return typeof claro === 'string' && claro.trim() !== '' ? claro.trim() : null
  }
  let dni: string | null, nac: string | null
  try {
    dni = abrir(fila.dni)
    nac = abrir(fila.fechaNacimiento)
  } catch {
    return { estado: 'ilegible' }
  }
  if (fila.tipoPersona === 'juridica' || (dni !== null && esCif(normalizarDocumento(dni)))) {
    return { estado: 'incompleta', faltan: ['un tomador persona física con DNI/NIE (el hogar de Allianz no admite empresas)'] }
  }
  const faltan: string[] = []
  const doc = dni === null ? null : normalizarDocumento(dni)
  if (dni === null) faltan.push('el DNI/NIE')
  else if (doc === null || !esDniNie(doc)) faltan.push('un DNI/NIE válido')
  const fecha = nac === null ? null : fechaIsoDeFicha(nac)
  if (nac === null) faltan.push('la fecha de nacimiento')
  else if (fecha === null) faltan.push('una fecha de nacimiento válida')
  if (faltan.length || doc === null || fecha === null) return { estado: 'incompleta', faltan }
  return { estado: 'ok', tomador: { documentoIdentidad: doc, fechaNacimiento: fecha } }
}

/** Pone `tomador` (de la ficha) en el riesgo de Hogar de Allianz; otro ramo o compañía, tal cual. 422 `falta_datos_tomador` / 503 `datos_tomador_ilegibles`. PURA. */
export function aplicarTomadorHogar(compania: string, ramo: string, riesgo: unknown, leer: () => LecturaTomadorHogar): NifTomadorAplicado {
  if (!necesitaTomadorHogar(compania, ramo)) return { ok: true, riesgo }
  const l = leer()
  if (l.estado === 'ok') return { ok: true, riesgo: { ...(esObj(riesgo) ? riesgo : {}), tomador: l.tomador } }
  if (l.estado === 'ilegible') return { ok: false, status: 503, motivo: 'datos_tomador_ilegibles: los datos de la ficha del cliente no se pueden descifrar (clave de la cartera); no se encola' }
  return { ok: false, status: 422, motivo: `falta_datos_tomador: falta ${enumerar(l.faltan)} en la ficha del cliente (Allianz Hogar los pide en la pantalla del tomador); complétalo en la ficha` }
}

// ─── Datos del tomador para el ALTA en Mapfre (14/10/2026, revisión del PR #4710) ──────────
// Mapfre NSEI, si el NIF no está en su base, da de alta al tomador en el propio formulario con nombre, apellidos y fecha
// de nacimiento (o razón social). Mismo régimen que el NIF: se COMPRUEBAN al encolar (sin máquina si faltan) y se
// descifran e inyectan como `datosTomador` SOLO al entregar el trabajo; nunca se guardan en `riesgo`.

/** Fila de la ficha tal cual está en BD (lo que se cifra, cifrado). */
export type FilaTomadorFicha = { dni: string | null; nombre: string | null; apellidos: string | null; fechaNacimiento: string | null; tipoPersona: string | null }

/** `incompleta` = la ficha se leyó y le falta algo (nombres de campo, nunca valores); `ilegible` = no se pudo mirar. */
export type LecturaDatosTomador =
  | { estado: 'ok'; datos: DatosTomadorFicha }
  | { estado: 'incompleta'; faltan: string[] }
  | { estado: 'ilegible' }

/** «2026-10-05» o «05/10/2026» → ISO real; cualquier otra cosa → `null` (no se adivina un orden). PURA. */
export function fechaIsoDeFicha(v: string): string | null {
  const t = v.trim()
  let a: string, m: string, d: string
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t)
  const es = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t)
  if (iso) [a, m, d] = [iso[1], iso[2], iso[3]]
  else if (es) [a, m, d] = [es[3], es[2], es[1]]
  else return null
  const f = new Date(Date.UTC(Number(a), Number(m) - 1, Number(d)))
  return f.getUTCFullYear() === Number(a) && f.getUTCMonth() === Number(m) - 1 && f.getUTCDate() === Number(d) ? `${a}-${m}-${d}` : null
}

/**
 * Ficha → datos del tomador para el alta. PURA. Lo cifrado (`v1:`) se abre con `descifrar`; si lanza → `ilegible`
 * (nunca «falta»). Empresa = `tipo_persona = juridica`, o sin tipo y con CIF: razón social = nombre + apellidos (así la
 * guarda la cartera). Persona: nombre, primer apellido (de `apellidos`, `partirApellidos`) y nacimiento obligatorios.
 */
export function lecturaTomadorFicha(fila: FilaTomadorFicha | null, descifrar: (v: string) => string): LecturaDatosTomador {
  if (!fila) return { estado: 'incompleta', faltan: ['la ficha'] }
  const abrir = (v: string | null): string | null => {
    if (typeof v !== 'string' || v.trim() === '') return null
    const claro = v.startsWith('v1:') ? descifrar(v) : v
    return typeof claro === 'string' && claro.trim() !== '' ? claro.replace(/\s+/g, ' ').trim() : null
  }
  let nombre: string | null, apellidos: string | null, nac: string | null, dni: string | null
  try {
    nombre = abrir(fila.nombre)
    apellidos = abrir(fila.apellidos)
    nac = abrir(fila.fechaNacimiento)
    dni = abrir(fila.dni)
  } catch {
    return { estado: 'ilegible' }
  }
  // Un valor de cajón («lead», «cliente», «-») es «no consta», nunca un nombre.
  nombre = nombreUtil(nombre)
  apellidos = nombreUtil(apellidos)
  const empresa = fila.tipoPersona === 'juridica' || (fila.tipoPersona == null && dni !== null && esCif(normalizarDocumento(dni)))
  if (empresa) {
    const razon = [nombre, apellidos].filter(Boolean).join(' ').trim()
    return razon ? { estado: 'ok', datos: { tipo: 'juridica', razonSocial: razon } } : { estado: 'incompleta', faltan: ['la razón social'] }
  }
  const { primero, segundo } = partirApellidos(apellidos)
  const fecha = nac === null ? null : fechaIsoDeFicha(nac)
  const faltan: string[] = []
  if (!nombre) faltan.push('el nombre')
  if (!primero) faltan.push('el primer apellido')
  if (nac === null) faltan.push('la fecha de nacimiento')
  else if (fecha === null) faltan.push('una fecha de nacimiento válida')
  if (faltan.length || !nombre || !primero || !fecha) return { estado: 'incompleta', faltan }
  return { estado: 'ok', datos: { tipo: 'fisica', nombre, apellido1: primero, apellido2: segundo, fechaNacimiento: fecha } }
}

/** ¿Hacen falta los datos del tomador de la ficha? Mapfre + auto/moto + el riesgo no trae su bloque `tomador`. PURA. */
export function necesitaDatosTomador(compania: string, ramo: string, riesgo: unknown): boolean {
  if (!(COMPANIAS_CON_NIF_TOMADOR as readonly string[]).includes(claveCompania(compania))) return false
  if (ramo !== 'auto' && ramo !== 'moto') return false
  return !(esObj(riesgo) && esObj(riesgo.tomador))
}

/** Texto «el nombre, el primer apellido y la fecha de nacimiento». PURA. */
function enumerar(l: readonly string[]): string {
  return l.length <= 1 ? (l[0] ?? '') : `${l.slice(0, -1).join(', ')} y ${l[l.length - 1]}`
}

/**
 * Como `aplicarNifTomador` para nombre, apellidos y nacimiento (`datosTomador`). PURA. Otra compañía → el riesgo SIN
 * `datosTomador`; Mapfre auto/moto sin bloque `tomador` → los de la ficha, o rechazo 422 `falta_datos_tomador` («falta X en
 * la ficha»), o 503 `datos_tomador_ilegibles`. Ningún motivo lleva valores.
 */
export function aplicarDatosTomador(compania: string, ramo: string, riesgo: unknown, leer: () => LecturaDatosTomador): NifTomadorAplicado {
  if (!necesitaDatosTomador(compania, ramo, riesgo)) {
    if (esObj(riesgo) && 'datosTomador' in riesgo && !(COMPANIAS_CON_NIF_TOMADOR as readonly string[]).includes(claveCompania(compania))) {
      const { datosTomador: _fuera, ...resto } = riesgo
      return { ok: true, riesgo: resto }
    }
    return { ok: true, riesgo }
  }
  const l = leer()
  if (l.estado === 'ok') return { ok: true, riesgo: { ...(esObj(riesgo) ? riesgo : {}), datosTomador: l.datos } }
  if (l.estado === 'ilegible') return { ok: false, status: 503, motivo: 'datos_tomador_ilegibles: los datos de la ficha del cliente no se pueden descifrar (clave de la cartera); no se encola' }
  return { ok: false, status: 422, motivo: `falta_datos_tomador: falta ${enumerar(l.faltan)} en la ficha del cliente (Mapfre da de alta al tomador nuevo con ellos); complétalo en la ficha` }
}

/** Al ENTREGAR: un NIF que ya no se puede poner es fallo `datos` (la ficha) o `infra` si es ilegible (la clave: «no se sabe»). */
export function tipoFalloNifTomador(status: 422 | 503): 'datos' | 'infra' {
  return status === 503 ? 'infra' : 'datos'
}

/** Interruptor general. APAGADO salvo `TARIFICADOR_RPA_ACTIVO=1` exacto (fail-closed). */
export function rpaActivo(env: Record<string, string | undefined>): boolean {
  return env.TARIFICADOR_RPA_ACTIVO === '1'
}

/** Región de Fly del worker (París, la más cercana con buena latencia a los portales españoles). */
export const REGION_FLY = 'cdg'
/** Lease de un trabajo `en_curso`: el worker tiene 4 min de tope global; 6 min dan margen al arranque. */
export const LEASE_MS = 6 * 60_000
// ─── Cola: lease, huecos y duplicados (13/10/2026) ───────────────────────────
// La decisión vive aquí (pura); `tarificador.ts` solo trae las filas y aplica lo decidido.

/**
 * ¿El lease de un trabajo `en_curso` ya venció? `null` (no debería existir: CHECK `trabajo_en_curso_con_lease`)
 * = «no se sabe» → NO vencido: el estado conservador es seguir contándolo como ocupado antes que lanzar un
 * segundo bot con la misma credencial.
 */
export function leaseVencido(leaseHasta: Date | null, ahora: Date): boolean {
  if (!leaseHasta || Number.isNaN(leaseHasta.getTime())) return false
  return leaseHasta.getTime() <= ahora.getTime()
}

/** Reparte los `en_curso` de una compañía: los vivos ocupan hueco; los vencidos se dan por fallo de infra. */
export function repartirEnCurso<T extends { leaseHasta: Date | null }>(filas: readonly T[], ahora: Date): { vivos: T[]; vencidos: T[] } {
  const vivos: T[] = []
  const vencidos: T[] = []
  for (const f of filas) (leaseVencido(f.leaseHasta, ahora) ? vencidos : vivos).push(f)
  return { vivos, vencidos }
}

/** Huecos libres bajo `max_concurrencia`. Sin integración autorizada (`null`) o con un tope raro → 0 (fail-closed). */
export function huecosLibres(max: number | null, vivos: number): number {
  if (max === null || !Number.isInteger(max) || max < 1) return 0
  return Math.max(0, max - Math.max(0, vivos))
}

/**
 * Clave de deduplicación al ENCOLAR: un mismo cliente no pide dos veces el mismo riesgo a la misma compañía y ramo.
 * El riesgo NO va en la clave (se compara en SQL como `jsonb`, que ya es igualdad semántica: no importa el orden de
 * las claves); la clave solo serializa a los que encolan lo mismo (`pg_advisory_xact_lock(hashtext(clave))`).
 */
export function claveEncolar(p: { correduriaId: string; clienteId: string; compania: string; ramo: string }): string {
  return ['tarificador:encolar', p.correduriaId, p.clienteId, p.compania, p.ramo].join(':')
}

/** Estados en los que un trabajo previo cuenta como «ese mismo encargo sigue vivo» y el nuevo es duplicado. */
export const ESTADOS_DUPLICADO = ['pendiente', 'en_curso', 'error_reintentable', 'atascado', 'ok'] as const

/** Ventana (15/10/2026) en la que un trabajo terminado `ok` CON PRECIO sigue contando como «ya tarificado»: segundo clic o dos comerciales. */
export const VENTANA_OK_DUPLICADO_MS = 10 * 60_000

/** Un trabajo `atascado` solo bloquea relanzar el mismo encargo durante este tiempo (19/10/2026): luego cuenta como abandonado. */
export const UMBRAL_ATASCADO_BLOQUEA_MS = 24 * 60 * 60_000

/** Una pausa (`tarificador_pausas`) sin reanudar deja de bloquear pasado este plazo (19/10/2026); la fila no se borra. */
export const PAUSA_CADUCA_HORAS = 24

/** ¿Esta pausa sin reanudar ya caducó? Hora ilegible/futura → NO caducada (conservador: sigue bloqueando). */
export function pausaCaducada(pausadaAt: Date | null | undefined, ahora: Date): boolean {
  if (!pausadaAt || Number.isNaN(pausadaAt.getTime())) return false
  const edad = ahora.getTime() - pausadaAt.getTime()
  return edad >= PAUSA_CADUCA_HORAS * 3_600_000
}

/** Qué decirle a quien pide algo que ya existe: el estado REAL del trabajo que bloquea (no siempre «en marcha»). */
export function mensajeDuplicado(estado: string): string {
  switch (estado) {
    case 'pendiente': return 'Ya había un trabajo pendiente en la cola con estos datos: se muestra ese.'
    case 'en_curso': return 'Ya había un trabajo en curso con estos datos: se muestra ese.'
    case 'error_reintentable': return 'Ya había un trabajo que falló y está pendiente de reintento automático: se muestra ese.'
    case 'atascado': return 'Ya había un trabajo atascado esperando una elección tuya (pantalla «Bots atascados»): respóndela o espera a que caduque.'
    case 'ok': return 'Ese presupuesto ya se calculó hace pocos minutos: se muestra ese resultado.'
    case 'requiere_humano': return 'Ya había un trabajo que requiere una persona (captcha/código): resuélvelo desde la bandeja.'
    default: return `Ya había un trabajo con estos datos (estado: ${estado}): se muestra ese.`
  }
}

/**
 * ¿Un trabajo previo con el MISMO riesgo hace que el nuevo sea duplicado? `pendiente` sí; `en_curso` solo con lease
 * vivo (uno colgado no bloquea pedirlo otra vez); `error_reintentable` solo bajo el tope de intentos (el barrido lo
 * devolverá a `pendiente`: sería el mismo encargo dos veces). Lo terminado, cancelado o pendiente de una persona, no.
 * Un trabajo de EMISIÓN, de EXPLORACIÓN o de HUMO (prueba nocturna, 15/10/2026) nunca cuenta (es otro encargo, aunque lleve el mismo riesgo).
 * `ok` (15/10/2026): solo si salió CON PRECIO (`conPrecio`) y terminó hace menos de `VENTANA_OK_DUPLICADO_MS`; sin hora de
 * fin legible, en el futuro o sin dato de precio → NO bloquea (se vuelve a tarificar antes que servir un resultado dudoso).
 */
export function bloqueaDuplicado(
  f: { estado: string; leaseHasta: Date | null; intentos: number; modo: string | null; terminadoAt?: Date | null; conPrecio?: boolean; actualizadoAt?: Date | null },
  ahora: Date,
  maxIntentos: number,
): boolean {
  if (f.modo === 'emision' || f.modo === 'exploracion' || f.modo === 'humo') return false
  if (f.estado === 'pendiente') return true
  if (f.estado === 'en_curso') return !leaseVencido(f.leaseHasta, ahora)
  if (f.estado === 'error_reintentable') return Number.isInteger(f.intentos) && f.intentos < maxIntentos
  // ATASCO (F2): espera la elección de Alberto y volverá a la cola: pedir lo mismo otra vez sería el mismo encargo dos veces.
  // Solo mientras es reciente (`updated_at` = cuando se atascó): pasado el umbral el atasco caduca solo (`caducarAtascos`) y,
  // si el barrido no llegó, no puede impedir relanzar para siempre. Sin hora legible o futura (dato dudoso) → bloquea (conservador).
  if (f.estado === 'atascado') {
    if (!f.actualizadoAt || Number.isNaN(f.actualizadoAt.getTime())) return true
    const edad = ahora.getTime() - f.actualizadoAt.getTime()
    return edad < 0 || edad < UMBRAL_ATASCADO_BLOQUEA_MS
  }
  if (f.estado === 'ok') {
    if (f.conPrecio !== true || !f.terminadoAt || Number.isNaN(f.terminadoAt.getTime())) return false
    const edad = ahora.getTime() - f.terminadoAt.getTime()
    return edad >= 0 && edad < VENTANA_OK_DUPLICADO_MS
  }
  return false
}

/** Techo de cada PDF/captura (la tabla `documentos` admite 10 MB; el cuerpo de Vercel, ~4,5 MB). */
export const MAX_BYTES_ADJUNTO = 4 * 1024 * 1024
/** Techo del HTML de evidencia (se guarda como documento; más es ruido). */
export const MAX_BYTES_HTML = 2 * 1024 * 1024

export type ConfigFly = { token: string; app: string; imagen: string; apiUrl: string }

export function configFly(env: Record<string, string | undefined>): { ok: true; cfg: ConfigFly } | { ok: false; faltan: string[] } {
  const leer = (k: string) => (env[k] ?? '').trim()
  const faltan = ['FLY_API_TOKEN', 'TARIFICADOR_FLY_APP', 'TARIFICADOR_FLY_IMAGE', 'TARIFICADOR_API_URL'].filter((k) => !leer(k))
  if (faltan.length) return { ok: false, faltan }
  return {
    ok: true,
    cfg: { token: leer('FLY_API_TOKEN'), app: leer('TARIFICADOR_FLY_APP'), imagen: leer('TARIFICADOR_FLY_IMAGE'), apiUrl: leer('TARIFICADOR_API_URL') },
  }
}

/**
 * La petición a la API de Fly Machines que crea la máquina de UN trabajo. El `env` sale de la lista
 * blanca de `envDeMaquina` (JOB_ID + URL + `TARIFICADOR_EXPLORADOR_VISTA` si vale dom|aria|ambas, que recibe el llamador del env del servidor): ni DATABASE_URL, ni CODEOSCOPIC_*, ni el Bearer, ni
 * credenciales de portal (esas son fly secrets de la app del worker).
 */
export function peticionMaquina(cfg: ConfigFly, jobId: string, vistaExplorador?: string | null): { url: string; init: { method: 'POST'; headers: Record<string, string>; body: string } } {
  const env = envDeMaquina({ jobId, apiUrl: cfg.apiUrl, vistaExplorador })
  const body = {
    name: `tarificar-${jobId.slice(0, 8)}`,
    region: REGION_FLY,
    config: {
      image: cfg.imagen,
      env,
      auto_destroy: true,
      restart: { policy: 'no' },
      guest: { cpu_kind: 'shared', cpus: 2, memory_mb: 2048 },
      metadata: { trabajo: jobId, canal: 'rpa' },
    },
  }
  return {
    url: `https://api.machines.dev/v1/apps/${encodeURIComponent(cfg.app)}/machines`,
    init: { method: 'POST', headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  }
}

// ─── El cuerpo del POST /api/tarificador/resultado ───────────────────────────

/** Traza y versión del bot (08/10/2026). `pasos` vacío = sin traza (o rechazada: ver `trazaRechazada`). */
export type MetaWorker = { pasos: PasoTraza[]; botVersion: string | null; trazaRechazada?: string[] }

export type ResultadoWorker =
  /** `vehiculo` (18/10/2026): catálogo confirmado por el bot (Allianz/Mapfre), ACCESORIO (inválido → `null`); se encadena a Generali. */
  | ({ tipo: 'ok'; trabajoId: string; ofertas: OfertaNormalizada[]; pdfs: { nombre: string; contenido: Buffer }[]; vehiculo: VehiculoEncadenado | null } & MetaWorker)
  | ({
      tipo: 'error'
      trabajoId: string
      /** `opcionesVersion` (13/10/2026): lista COMPLETA de versiones de un `requiere_eleccion_version`; se guarda en el
       *  `error` jsonb del trabajo y es la lista contra la que se valida cualquier elección (IA o bandeja). */
      /** `inventarioDom` (13/10/2026): ESTRUCTURA de la pantalla de un hueco de mapa (`ErrorMapaIncompleto`), saneada otra
       *  vez aquí (sin valores de campos, sin datos personales, ≤60 KB); se guarda en el `error` jsonb. Nunca se loguea. */
      /** `recorrido` (15/10/2026): capturas ligeras de TODAS las pantallas/pasos/diálogos del trabajo (sin valores ni datos personales,
       *  ≤60 KB), re-saneadas aquí; se guarda en el `error` jsonb (sin migración). Accesorio: sin forma → se descarta. Nunca se loguea. */
      /** `atasco` (F2, 14/10/2026): checkpoint de un paso que nadie resolvió, re-saneado (`leerAtascoWorker`). Accesorio:
       *  inválido → se descarta y el trabajo falla como antes. NO va al `error` jsonb: vive en `tarificador_atascos`. */
      error: { tipo: TipoError; mensaje: string; url: string | null; opcionesVersion?: CandidatoVersion[]; opcionesPoblacion?: OpcionPoblacion[]; inventarioDom?: InventarioDom; recorrido?: Recorrido; atasco?: AtascoWorker }
      captura: Buffer | null
      html: string | null
    } & MetaWorker)
  /**
   * Exploración terminada (13/10/2026): el MAPA ya está en su cabecera (cierre); aquí el desenlace del trabajo y, si se guardó
   * el presupuesto (14/10/2026), su PDF (como mucho uno) y la referencia del portal (`null` = no se vio).
   */
  | ({ tipo: 'explorado'; trabajoId: string; motivoFin: MotivoFin; presupuesto: PresupuestoExplorado | null } & MetaWorker)
  /** Prueba nocturna de humo superada (15/10/2026): login y pantalla de inicio alcanzados. Sin ofertas, sin tarificación. Un fallo va como `error`. */
  | ({ tipo: 'humo'; trabajoId: string; omitido: string | null; ramoProbado: string | null; ramosConBot: string[] | null } & MetaWorker)

/** El presupuesto GUARDADO por el explorador: PDF descargado (o `null`) y referencia (o `null`). */
export type PresupuestoExplorado = { referencia: string | null; pdf: { nombre: string; contenido: Buffer } | null }

/**
 * Traza y versión del cuerpo del worker. La traza es ACCESORIA: si trae una clave que no es de las cinco permitidas
 * (p. ej. un dato personal) se descarta ENTERA y el resultado del trabajo se guarda igual (`trazaRechazada` dice por qué,
 * sin repetir valores). Una versión que no sea semver → `null`.
 */
export function leerMetaWorker(e: Record<string, unknown>): MetaWorker {
  const v = validarTraza(e.pasos)
  const botVersion = esVersionBot(e.botVersion) ? e.botVersion : null
  return v.ok ? { pasos: v.pasos, botVersion } : { pasos: [], botVersion, trazaRechazada: v.errores.slice(0, 5) }
}

/**
 * Aviso de log de la traza (14/10/2026). La traza es accesoria y su fallo NO rompe el resultado, pero tampoco puede ser mudo:
 * `tarificacion_trabajo_pasos` estuvo vacía semanas sin una línea de log útil. Prefijo fijo para filtrar en los logs de
 * Vercel. Solo id del trabajo y el motivo (nombre de la clave/paso, nunca un valor); el motivo se recorta y se le quita
 * cualquier URL (una de BD llevaría credenciales).
 */
export const PREFIJO_TRAZA = '[tarificador-traza]'
export function avisoTraza(trabajoId: string, motivo: unknown): string {
  const m = (motivo instanceof Error ? motivo.message : typeof motivo === 'string' ? motivo : String(motivo))
    .replace(/[a-z][a-z0-9+.-]*:\/\/\S+/gi, '<url>')
    .replace(/\s+/g, ' ')
    .slice(0, 300)
  return `${PREFIJO_TRAZA} trabajo ${trabajoId}: ${m}`
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const obj = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null

function base64(v: unknown, campo: string, errores: string[], max: number): Buffer | null {
  if (v === undefined || v === null) return null
  if (typeof v !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(v)) {
    errores.push(`${campo}: no es base64`)
    return null
  }
  const b = Buffer.from(v, 'base64')
  if (b.length === 0) errores.push(`${campo}: vacío`)
  else if (b.length > max) errores.push(`${campo}: ${b.length} bytes supera el techo de ${max}`)
  return b.length && b.length <= max ? b : null
}

const esPdf = (b: Buffer) => b.subarray(0, 5).toString('latin1') === '%PDF-'
const esPng = (b: Buffer) => b.length > 8 && b[0] === 0x89 && b.subarray(1, 4).toString('latin1') === 'PNG'

export function leerResultadoWorker(entrada: unknown): { ok: true; r: ResultadoWorker } | { ok: false; errores: string[] } {
  const e = obj(entrada)
  if (!e) return { ok: false, errores: ['el cuerpo tiene que ser un objeto JSON'] }
  const trabajoId = typeof e.trabajoId === 'string' ? e.trabajoId.trim() : ''
  if (!UUID.test(trabajoId)) return { ok: false, errores: ['trabajoId no es un uuid'] }
  const errores: string[] = []

  if (e.resultado === 'ok') {
    const lista = Array.isArray(e.pdfs) ? e.pdfs : []
    if (lista.length > 10) return { ok: false, errores: ['más de 10 PDF en un resultado'] }
    const pdfs: { nombre: string; contenido: Buffer }[] = []
    lista.forEach((p, i) => {
      const o = obj(p)
      if (!o || o.base64 === undefined || o.base64 === null) {
        errores.push(`pdfs[${i}].base64: falta`)
        return
      }
      const b = base64(o.base64, `pdfs[${i}].base64`, errores, MAX_BYTES_ADJUNTO)
      if (b && !esPdf(b)) errores.push(`pdfs[${i}]: no empieza por %PDF-`)
      const nombre = typeof o.nombre === 'string' && o.nombre.trim() ? o.nombre.trim().slice(0, 120) : `oferta-${i + 1}.pdf`
      if (b) pdfs.push({ nombre, contenido: b })
    })
    const v = validarOfertas(e.ofertas, lista.length)
    if (!v.ok) errores.push(...v.errores)
    if (errores.length || !v.ok) return { ok: false, errores }
    return { ok: true, r: { tipo: 'ok', trabajoId, ofertas: v.ofertas, pdfs, vehiculo: leerVehiculoWorker(e).vehiculo, ...leerMetaWorker(e) } }
  }

  if (e.resultado === 'error') {
    const err = obj(e.error)
    if (!esTipoError(err?.tipo)) errores.push('error.tipo desconocido')
    const mensaje = typeof err?.mensaje === 'string' && err.mensaje.trim() ? err.mensaje.trim().slice(0, 2000) : null
    if (!mensaje) errores.push('error.mensaje falta')
    const captura = base64(e.capturaBase64, 'capturaBase64', errores, MAX_BYTES_ADJUNTO)
    if (captura && !esPng(captura)) errores.push('capturaBase64: no es un PNG')
    const html = typeof e.html === 'string' && e.html !== '' ? e.html : null
    if (html && Buffer.byteLength(html, 'utf8') > MAX_BYTES_HTML) errores.push('html supera el techo')
    const url = typeof err?.url === 'string' ? err.url.slice(0, 500) : null
    // Accesoria, como la traza: una lista inválida se DESCARTA (sin lista no hay elección por código) y el fallo se guarda igual.
    // `eleccion` (15/10/2026) es el tipo propio; `captcha` sigue valiendo para los workers anteriores.
    const pideEleccion = err?.tipo === 'eleccion' || err?.tipo === 'captcha'
    const opcionesVersion = pideEleccion ? validarOpcionesVersion(err.opcionesVersion) : null
    // Poblaciones de un CP ambiguo (13/10/2026): accesoria igual que la de versiones (inválida → se descarta).
    const opcionesPoblacion = pideEleccion ? validarOpcionesPoblacion(err.opcionesPoblacion) : null
    // Accesorio también: se RE-SANEA (lista blanca + filtro de datos personales + tope de bytes); sin forma → se descarta.
    const inventarioDom = err?.inventarioDom !== undefined ? sanearInventarioDom(err.inventarioDom) : null
    const recorrido = err?.recorrido !== undefined ? sanearRecorrido(err.recorrido) : null
    // Checkpoint de ATASCO (F2): solo en un hueco del portal; accesorio (inválido → se descarta).
    const atasco = err?.tipo === 'portal' && err.atasco !== undefined ? leerAtascoWorker(err.atasco) : null
    if (errores.length) return { ok: false, errores }
    return {
      ok: true,
      r: { tipo: 'error', trabajoId, error: { tipo: err!.tipo as TipoError, mensaje: mensaje!, url, ...(opcionesVersion ? { opcionesVersion } : {}), ...(opcionesPoblacion ? { opcionesPoblacion } : {}), ...(inventarioDom ? { inventarioDom } : {}), ...(recorrido && recorrido.capturas.length > 0 ? { recorrido } : {}), ...(atasco ? { atasco } : {}) }, captura, html, ...leerMetaWorker(e) },
    }
  }

  if (e.resultado === 'explorado') {
    const motivoFin = MOTIVOS_FIN.find((m) => m === e.motivoFin)
    if (!motivoFin) return { ok: false, errores: ['motivoFin fuera de lista'] }
    // Presupuesto guardado (14/10/2026): opcional; si viene, forma ESTRICTA (un PDF de verdad, referencia sin forma de dato personal).
    let presupuesto: PresupuestoExplorado | null = null
    if (e.presupuesto !== undefined && e.presupuesto !== null) {
      const pr = obj(e.presupuesto)
      if (!pr || Object.keys(pr).some((k) => !['referencia', 'pdf'].includes(k))) return { ok: false, errores: ['presupuesto con forma no válida'] }
      const referencia = pr.referencia === undefined || pr.referencia === null ? null : referenciaPresupuestoValida(pr.referencia) ? pr.referencia : undefined
      if (referencia === undefined) return { ok: false, errores: ['presupuesto.referencia no válida'] }
      let pdf: PresupuestoExplorado['pdf'] = null
      if (pr.pdf !== undefined && pr.pdf !== null) {
        const o = obj(pr.pdf)
        const b = o ? base64(o.base64, 'presupuesto.pdf.base64', errores, MAX_BYTES_ADJUNTO) : null
        if (!o) errores.push('presupuesto.pdf no es un objeto')
        else if (!b) errores.push('presupuesto.pdf.base64: falta')
        else if (!esPdf(b)) errores.push('presupuesto.pdf: no empieza por %PDF-')
        if (errores.length) return { ok: false, errores }
        const nombre = typeof o!.nombre === 'string' && /^[\w.() -]{1,120}$/.test(o!.nombre.trim()) ? o!.nombre.trim() : 'presupuesto.pdf'
        pdf = { nombre, contenido: b! }
      }
      presupuesto = { referencia, pdf }
    }
    return { ok: true, r: { tipo: 'explorado', trabajoId, motivoFin, presupuesto, ...leerMetaWorker(e) } }
  }

  if (e.resultado === 'humo') {
    // `omitido`: el worker no tiene adaptador activo de esa compañía (ni éxito ni fallo). Texto corto, sin saltos de línea.
    const omitido = typeof e.omitido === 'string' && e.omitido.trim() ? e.omitido.replace(/\s+/g, ' ').trim().slice(0, 200) : null
    // Ramos con bot activo en la imagen (accesorio: sin forma válida → null, el informe no calcula «sin bot» de esa compañía).
    const RAMO = /^[a-z0-9_]{1,30}$/
    const conBot = Array.isArray(e.ramosConBot) && e.ramosConBot.length <= 20 && e.ramosConBot.every((x) => typeof x === 'string' && RAMO.test(x)) ? (e.ramosConBot as string[]) : null
    const ramoProbado = typeof e.ramoProbado === 'string' && RAMO.test(e.ramoProbado) ? e.ramoProbado : null
    return { ok: true, r: { tipo: 'humo', trabajoId, omitido, ramoProbado, ramosConBot: conBot, ...leerMetaWorker(e) } }
  }

  return { ok: false, errores: ['resultado tiene que ser «ok», «error», «explorado» o «humo»'] }
}
