// Formulario CANÓNICO de AUTO (turismo) / MOTO (10/10/2026). PURO: ni BD, ni red.
//
// Lo que un robot necesita para cotizar un vehículo en un portal de compañía. La ficha del vehículo NO va aquí: la
// rellena el robot con la consulta por matrícula del propio portal (`vehiculo.ts`). Solo la `eleccionVersion` (código de
// catálogo o etiqueta exacta) que una persona escoge en la bandeja cuando el catálogo ofrece varias.
// Ramo sin compañía registrada: el primer robot (Allianz ePAC Autos) está en construcción e INACTIVO.
//
// 🚨 Tres estados: `null` = «no consta», nunca 0/false. 0 siniestros es un DATO. La matrícula es dato personal: solo
// vive aquí y en el campo del portal; nunca en logs, trazas ni mensajes.
import { esMatriculaEspanola, normalizarMatricula, type EleccionVersion } from './vehiculo.ts'
import { esCif, esDniNie, normalizarDocumento, validarTomador, type Tomador } from './tomador.ts'
import { tieneCaracteresProhibidos } from './poblacion.ts'
import { validarVehiculoConfirmado, type VehiculoConfirmado } from './vehiculo-confirmado.ts'

export const RAMOS_VEHICULO = ['auto', 'moto'] as const
export type RamoVehiculo = (typeof RAMOS_VEHICULO)[number]
export const SEXOS_CONDUCTOR = ['hombre', 'mujer'] as const
export type SexoConductor = (typeof SEXOS_CONDUCTOR)[number]

/**
 * Datos que el bot de Mapfre NSEI pide en `mat-select` del paso 2 (14/10/2026). Claves CERRADAS = las de `MAPEO_MAPFRE_AUTO`
 * del servicio RPA (uso → `particular`; ámbito → `espana`; clase del permiso → `b`, `a`, `a1`, `a2`). Una clave nueva se añade
 * AQUÍ y allí a la vez.
 */
export const USOS_VEHICULO = ['particular'] as const
export type UsoVehiculo = (typeof USOS_VEHICULO)[number]
export const AMBITOS_CIRCULACION = ['espana'] as const
export type AmbitoCirculacion = (typeof AMBITOS_CIRCULACION)[number]
export const CLASES_PERMISO = ['b', 'a', 'a1', 'a2'] as const
export type ClasePermiso = (typeof CLASES_PERMISO)[number]
/** Por defecto en AUTO (turismo; un encolado antiguo sin ellos sigue valiendo). En moto NO hay defecto: no consta. */
export const USO_VEHICULO_POR_DEFECTO: UsoVehiculo = 'particular'
export const AMBITO_CIRCULACION_POR_DEFECTO: AmbitoCirculacion = 'espana'
export const CLASE_PERMISO_POR_DEFECTO: ClasePermiso = 'b'
/** Máximo de `companiaAnterior` (el adaptador la ignora por encima de 80). */
export const MAX_COMPANIA_ANTERIOR = 80

export type ConductorHabitual = {
  /** ISO AAAA-MM-DD. */
  fechaNacimiento: string
  /** Fecha del carné (ISO). */
  fechaCarne: string
  /** `null` = no consta (algunos portales lo piden; el robot no lo inventa). */
  sexo: SexoConductor | null
}

export type FormularioAuto = {
  ramo: RamoVehiculo
  /** Normalizada (sin espacios ni guiones). */
  matricula: string
  /** CP de circulación/pernocta (5 dígitos, provincia 01-52). */
  codigoPostal: string
  conductor: ConductorHabitual
  /** ¿Tomador = conductor habitual = propietario? `null` = no consta. */
  tomadorEsConductor: boolean | null
  tomadorEsPropietario: boolean | null
  /** Años asegurado en la compañía anterior y siniestros con culpa en los últimos 5 años. `null` = no consta. */
  aniosAseguradoAnterior: number | null
  siniestrosUltimos5Anios: number | null
  garajeNoche: boolean | null
  tomador?: Tomador | null
  /** Elección de versión hecha por una persona (bandeja). Ausente = el robot no elige si hay varias. */
  eleccionVersion?: EleccionVersion | null
  /**
   * Portales que NO buscan por matrícula (Allianz MOTO, grabación 13/10/2026: el vehículo se elige en cascada
   * marca → clase → modelo → versión) necesitan marca, modelo y, en moto, la CLASE (1-4, tramos de cilindrada del
   * portal: 1 ≤125 cc · 2 ≤350 · 3 351-750 · 4 >750). Nombres de catálogo, no datos personales. Ausente = no consta.
   */
  seleccionVehiculo?: SeleccionVehiculo | null
  /**
   * Población del CP (13/10/2026): un CP puede tener VARIAS poblaciones y el portal pide escoger una (Allianz Moto: buscador
   * de poblaciones). `poblacion` = nombre de la localidad (texto libre, ≤80; el robot la casa EXACTA salvo mayúsculas/tildes/
   * espacios); `eleccionPoblacion` = texto EXACTO de la celda del portal que una persona escogió en la bandeja (≤120).
   * Ausentes = no consta: con varias poblaciones el robot para y pide una persona (nunca adivina).
   */
  poblacion?: string | null
  eleccionPoblacion?: string | null
  /**
   * Vehículo de catálogo CONFIRMADO por matrícula en Mapfre (14/10/2026, `vehiculo-confirmado.ts`): denominación, CV, CC,
   * puertas y fecha de inicio. SIN matrícula ni bastidor (se conserva en la purga). Lo usan los demás bots para elegir
   * versión (solo si casa exactamente una). Ausente = no consta.
   */
  vehiculoConfirmado?: VehiculoConfirmado | null
  /**
   * DNI/NIE/CIF del TOMADOR para buscarlo en el portal (Mapfre NSEI paso 1, lupa del NIF; 14/10/2026). Normalizado
   * (mayúsculas, sin separadores). Lo RELLENA ASEGURA en el servidor desde la ficha del cliente (descifrada), solo en
   * trabajos de Mapfre y solo si el riesgo no trae ya `tomador.documentoIdentidad`. Dato personal: nunca en logs,
   * mensajes, IA ni resultado; NO está en la lista blanca de la purga (se borra al cerrar el trabajo). Ausente = no consta.
   */
  documentoTomador?: string | null
  /** Uso del vehículo (`USOS_VEHICULO`). En auto, por defecto `particular`; en moto, ausente = no consta. */
  usoVehiculo?: UsoVehiculo | null
  /** Ámbito de circulación (`AMBITOS_CIRCULACION`). En auto, por defecto `espana`. */
  ambitoCirculacion?: AmbitoCirculacion | null
  /** Clase del permiso del conductor (`CLASES_PERMISO`). En auto, por defecto `b`. */
  clasePermiso?: ClasePermiso | null
  /** Nombre de la compañía anterior (texto corto, ≤80). Ausente = no consta (el bot la deja como hueco, nunca la inventa). */
  companiaAnterior?: string | null
}

/**
 * Documento del tomador que el robot teclea en el portal: `documentoTomador` (lo pone asegura) o, si no, el del bloque
 * `tomador`. `null` = no consta. PURO; nunca se loguea.
 */
export function documentoTomadorDe(f: Pick<FormularioAuto, 'documentoTomador' | 'tomador'> | null | undefined): string | null {
  const d = f?.documentoTomador ?? f?.tomador?.documentoIdentidad ?? null
  return typeof d === 'string' && d.trim() !== '' ? d : null
}

/**
 * Formas en que el documento del tomador puede aparecer en un texto o en el HTML del portal (tal cual, con guion o espacio
 * antes de la letra de control): el worker las trata como SECRETOS del trabajo (redactor de mensajes y de HTML). PURO.
 * Riesgo crudo (sin validar): lee `documentoTomador` y `tomador.documentoIdentidad` si son texto.
 */
export function secretosDelRiesgo(riesgo: unknown): string[] {
  if (typeof riesgo !== 'object' || riesgo === null || Array.isArray(riesgo)) return []
  const r = riesgo as Record<string, unknown>
  const t = typeof r.tomador === 'object' && r.tomador !== null && !Array.isArray(r.tomador) ? (r.tomador as Record<string, unknown>) : null
  const out = new Set<string>()
  for (const v of [r.documentoTomador, t?.documentoIdentidad]) {
    if (typeof v !== 'string') continue
    const d = normalizarDocumento(v)
    if (d.length < 4) continue
    out.add(d)
    const cuerpo = d.slice(0, -1)
    const control = d.slice(-1)
    out.add(`${cuerpo}-${control}`)
    out.add(`${cuerpo} ${control}`)
    if (/^[XYZ]/.test(d)) out.add(`${d[0]}-${d.slice(1, -1)}-${control}`)
  }
  return [...out].sort((a, b) => b.length - a.length)
}

/** Máximos de `poblacion` y `eleccionPoblacion`. */
export const MAX_POBLACION = 80
export const MAX_ELECCION_POBLACION = 120

/**
 * `cilindradaCc`: Allianz separa los productos Moto y Ciclomotor (≤50 cc); sin cilindrada no se puede saber cuál es.
 * `descripcion` (13/10/2026): DESCRIPCIÓN DEL VEHÍCULO tal como viene en la póliza o la ficha (p. ej. «BMW F 800 S 85 CV»),
 * máx. 200. Es lo único libre que se manda a la IA que elige la versión del catálogo: SOLO el vehículo, nunca matrícula,
 * bastidor, nombres ni documentos. Se rechaza si contiene algo con forma de matrícula, NIF/NIE, email, teléfono, IBAN o bastidor (ver `pareceDatoPersonalEnDescripcion`).
 */
export type SeleccionVehiculo = { marca: string; modelo: string; clase?: number | null; cilindradaCc?: number | null; descripcion?: string | null }

/** Máximo de `seleccionVehiculo.descripcion`. */
export const MAX_DESCRIPCION_VEHICULO = 200

/**
 * ¿La descripción lleva algo con forma de dato personal o de contacto? Comprueba (sobre el texto en mayúsculas):
 * matrícula ACTUAL (0000BBB) o de ciclomotor (C0000BBB); NIF (8 dígitos + letra); NIE (X/Y/Z + 7 dígitos + letra);
 * email (algo@algo.algo); teléfono español (9 dígitos que empiezan por 6, 7, 8 o 9, con espacios o guiones opcionales
 * y prefijo +34 o 0034 opcional); IBAN (ES + 22 dígitos, con o sin espacios); y bastidor/VIN (17 alfanuméricos sin I, O ni Q).
 * La matrícula provincial antigua (SE-1234-AB) NO se mira a propósito: «R1250GS» o «S1000RR» son modelos de moto con esa forma.
 */
export function pareceDatoPersonalEnDescripcion(texto: string): boolean {
  const t = texto.toUpperCase()
  return (
    /(^|[^A-Z0-9])C?\d{4}[\s-]?[BCDFGHJKLMNPRSTVWXYZ]{3}(?![A-Z0-9])/.test(t) ||
    /(^|[^A-Z0-9])\d{8}-?[A-Z](?![A-Z0-9])/.test(t) ||
    /(^|[^A-Z0-9])[XYZ]-?\d{7}-?[A-Z](?![A-Z0-9])/.test(t) ||
    /[A-Z0-9._%+-]+@[A-Z0-9-]+(\.[A-Z0-9-]+)+/.test(t) ||
    /(?<!\d)(?:(?:\+|00)34[\s-]?)?[6-9](?:[\s-]?\d){8}(?!\d)/.test(t) ||
    /(^|[^A-Z0-9])ES\d{2}(?:\s?\d){20}(?![A-Z0-9])/.test(t) ||
    /(^|[^A-Z0-9])[A-HJ-NPR-Z0-9]{17}(?![A-Z0-9])/.test(t)
  )
}

/** Tramos de cilindrada de la clase de Allianz Moto (cc mínimo y máximo, ambos inclusivos). */
const TRAMOS_CLASE_MOTO: Record<number, readonly [number, number]> = { 1: [51, 125], 2: [126, 350], 3: [351, 750], 4: [751, 3000] }

export type ValidacionFormularioAuto = { ok: true; formulario: FormularioAuto } | { ok: false; errores: string[] }

const vacio = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '')

function fechaIso(v: unknown, campo: string, errores: string[]): string | null {
  if (vacio(v)) return null
  const s = typeof v === 'string' ? v.trim() : ''
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  const f = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null
  if (!m || !f || f.toISOString().slice(0, 10) !== s) {
    errores.push(`${campo}: tiene que ser una fecha AAAA-MM-DD`)
    return null
  }
  return s
}

function entero(v: unknown, campo: string, errores: string[], min: number, max: number): number | null {
  if (vacio(v)) return null
  const n = typeof v === 'number' ? v : NaN
  if (!Number.isInteger(n) || n < min || n > max) {
    errores.push(`${campo}: tiene que ser un entero entre ${min} y ${max}`)
    return null
  }
  return n
}

function booleano(v: unknown, campo: string, errores: string[]): boolean | null {
  if (v === undefined || v === null) return null
  if (typeof v !== 'boolean') {
    errores.push(`${campo}: tiene que ser true/false (o no venir)`)
    return null
  }
  return v
}

const edad = (iso: string, hoy: Date) => {
  const [a, m, d] = iso.split('-').map(Number)
  let e = hoy.getUTCFullYear() - a
  if (hoy.getUTCMonth() + 1 < m || (hoy.getUTCMonth() + 1 === m && hoy.getUTCDate() < d)) e--
  return e
}

export function validarFormularioAuto(entrada: unknown, hoy: Date = new Date()): ValidacionFormularioAuto {
  if (typeof entrada !== 'object' || entrada === null || Array.isArray(entrada)) return { ok: false, errores: ['el formulario tiene que ser un objeto'] }
  const e = entrada as Record<string, unknown>
  const errores: string[] = []

  let ramo: RamoVehiculo | null = null
  if (typeof e.ramo === 'string' && (RAMOS_VEHICULO as readonly string[]).includes(e.ramo)) ramo = e.ramo as RamoVehiculo
  else errores.push(`ramo: tiene que ser uno de ${RAMOS_VEHICULO.join(', ')}`)

  // Nunca se repite el valor en el error: es dato personal.
  let matricula: string | null = null
  if (vacio(e.matricula)) errores.push('matricula: obligatoria (el robot consulta el vehículo con ella)')
  else if (typeof e.matricula !== 'string' || !esMatriculaEspanola(e.matricula)) errores.push('matricula: no tiene formato de matrícula española')
  else matricula = normalizarMatricula(e.matricula)

  let codigoPostal: string | null = null
  const cp = typeof e.codigoPostal === 'string' ? e.codigoPostal.trim() : ''
  const prov = Number(cp.slice(0, 2))
  if (/^\d{5}$/.test(cp) && prov >= 1 && prov <= 52) codigoPostal = cp
  else errores.push('codigoPostal: obligatorio, 5 dígitos de un código postal español')

  let conductor: ConductorHabitual | null = null
  const c = e.conductor
  if (typeof c !== 'object' || c === null || Array.isArray(c)) errores.push('conductor: obligatorio (fecha de nacimiento y del carné)')
  else {
    const cc = c as Record<string, unknown>
    const nac = fechaIso(cc.fechaNacimiento, 'conductor.fechaNacimiento', errores)
    const carne = fechaIso(cc.fechaCarne, 'conductor.fechaCarne', errores)
    if (vacio(cc.fechaNacimiento)) errores.push('conductor.fechaNacimiento: obligatoria')
    if (vacio(cc.fechaCarne)) errores.push('conductor.fechaCarne: obligatoria')
    let sexo: SexoConductor | null = null
    if (!vacio(cc.sexo)) {
      if (typeof cc.sexo === 'string' && (SEXOS_CONDUCTOR as readonly string[]).includes(cc.sexo)) sexo = cc.sexo as SexoConductor
      else errores.push(`conductor.sexo: tiene que ser uno de ${SEXOS_CONDUCTOR.join(', ')} (o no venir)`)
    }
    if (nac && carne) {
      if (edad(nac, hoy) < 14 || edad(nac, hoy) > 110) errores.push('conductor.fechaNacimiento: edad fuera de rango (14-110)')
      if (carne <= nac) errores.push('conductor.fechaCarne: no puede ser anterior al nacimiento')
      if (carne > hoy.toISOString().slice(0, 10)) errores.push('conductor.fechaCarne: no puede ser futura')
    }
    if (nac && carne) conductor = { fechaNacimiento: nac, fechaCarne: carne, sexo }
  }

  const tomadorEsConductor = booleano(e.tomadorEsConductor, 'tomadorEsConductor', errores)
  const tomadorEsPropietario = booleano(e.tomadorEsPropietario, 'tomadorEsPropietario', errores)
  const aniosAseguradoAnterior = entero(e.aniosAseguradoAnterior, 'aniosAseguradoAnterior', errores, 0, 80)
  const siniestrosUltimos5Anios = entero(e.siniestrosUltimos5Anios, 'siniestrosUltimos5Anios', errores, 0, 50)
  const garajeNoche = booleano(e.garajeNoche, 'garajeNoche', errores)

  let tomador: Tomador | null = null
  if (!vacio(e.tomador)) {
    const t = validarTomador(e.tomador, hoy)
    if (t.ok) tomador = t.tomador
    else errores.push(...t.errores)
  }

  let eleccionVersion: EleccionVersion | null = null
  if (!vacio(e.eleccionVersion)) {
    const ev = e.eleccionVersion as Record<string, unknown>
    const codigo = typeof ev?.codigo === 'string' && ev.codigo.trim() ? ev.codigo.trim().slice(0, 60) : null
    const etiqueta = typeof ev?.etiqueta === 'string' && ev.etiqueta.trim() ? ev.etiqueta.trim().slice(0, 200) : null
    if (codigo === null && etiqueta === null) errores.push('eleccionVersion: trae un código o una etiqueta, o no venga')
    else eleccionVersion = { codigo, etiqueta }
  }

  let seleccionVehiculo: SeleccionVehiculo | null = null
  if (!vacio(e.seleccionVehiculo)) {
    const sv = typeof e.seleccionVehiculo === 'object' && e.seleccionVehiculo !== null && !Array.isArray(e.seleccionVehiculo) ? (e.seleccionVehiculo as Record<string, unknown>) : null
    const marca = typeof sv?.marca === 'string' ? sv.marca.trim().slice(0, 80) : ''
    const modelo = typeof sv?.modelo === 'string' ? sv.modelo.trim().slice(0, 120) : ''
    const clase = sv ? entero(sv.clase, 'seleccionVehiculo.clase', errores, 1, 4) : null
    const cilindradaCc = sv ? entero(sv.cilindradaCc, 'seleccionVehiculo.cilindradaCc', errores, 1, 3000) : null
    // Nunca se repite el valor en el error: si trae un dato personal, ese dato no sale ni en el mensaje.
    let descripcion: string | null = null
    if (sv && !vacio(sv.descripcion)) {
      if (typeof sv.descripcion !== 'string') errores.push('seleccionVehiculo.descripcion: tiene que ser texto (o no venir)')
      else if (sv.descripcion.trim().length > MAX_DESCRIPCION_VEHICULO) errores.push(`seleccionVehiculo.descripcion: máximo ${MAX_DESCRIPCION_VEHICULO} caracteres`)
      else if (pareceDatoPersonalEnDescripcion(sv.descripcion)) errores.push('seleccionVehiculo.descripcion: solo la descripción del vehículo (sin matrícula, NIF, bastidor, email, teléfono, IBAN ni nombres)')
      else descripcion = sv.descripcion.replace(/\s+/g, ' ').trim()
    }
    if (!sv || marca === '' || modelo === '') errores.push('seleccionVehiculo: trae marca y modelo (nombres de catálogo), o no venga')
    else seleccionVehiculo = { marca, modelo, clase, cilindradaCc, ...(descripcion !== null ? { descripcion } : {}) }
  }

  // Población del CP (opcionales). Nunca se repite el valor en el error.
  const textoOpcional = (v: unknown, campo: string, max: number): string | null => {
    if (vacio(v)) return null
    if (typeof v !== 'string') {
      errores.push(`${campo}: tiene que ser texto (o no venir)`)
      return null
    }
    const t = v.replace(/\s+/g, ' ').trim()
    if (t.length > max) {
      errores.push(`${campo}: máximo ${max} caracteres`)
      return null
    }
    if (tieneCaracteresProhibidos(v)) {
      errores.push(`${campo}: caracteres no permitidos`)
      return null
    }
    return t
  }
  const poblacion = textoOpcional(e.poblacion, 'poblacion', MAX_POBLACION)
  const eleccionPoblacion = textoOpcional(e.eleccionPoblacion, 'eleccionPoblacion', MAX_ELECCION_POBLACION)

  // Vehículo confirmado por Mapfre (opcional). Nunca se repite el valor en el error.
  let vehiculoConfirmado: VehiculoConfirmado | null = null
  if (e.vehiculoConfirmado !== undefined && e.vehiculoConfirmado !== null) {
    const vc = validarVehiculoConfirmado(e.vehiculoConfirmado)
    if (vc.ok) vehiculoConfirmado = vc.valor
    else errores.push(...vc.errores)
  }

  // Documento del tomador para la búsqueda del portal (opcional; lo rellena asegura). Nunca se repite el valor en el error.
  let documentoTomador: string | null = null
  if (!vacio(e.documentoTomador)) {
    const d = typeof e.documentoTomador === 'string' ? normalizarDocumento(e.documentoTomador.trim()) : ''
    if (d !== '' && (esDniNie(d) || esCif(d))) documentoTomador = d
    else errores.push('documentoTomador: no es un DNI/NIE/CIF válido')
  }

  // Mat-select de Mapfre (opcionales con defecto en auto). Valor fuera de la lista cerrada = error (nunca se repite el valor).
  const cerrado = <T extends string>(v: unknown, campo: string, lista: readonly T[], porDefecto: T | null): T | null => {
    if (vacio(v)) return porDefecto
    const k = typeof v === 'string' ? v.trim().toLowerCase() : ''
    if ((lista as readonly string[]).includes(k)) return k as T
    errores.push(`${campo}: tiene que ser uno de ${lista.join(', ')} (o no venir)`)
    return null
  }
  const defectoAuto = ramo === 'auto'
  const usoVehiculo = cerrado(e.usoVehiculo, 'usoVehiculo', USOS_VEHICULO, defectoAuto ? USO_VEHICULO_POR_DEFECTO : null)
  const ambitoCirculacion = cerrado(e.ambitoCirculacion, 'ambitoCirculacion', AMBITOS_CIRCULACION, defectoAuto ? AMBITO_CIRCULACION_POR_DEFECTO : null)
  const clasePermiso = cerrado(e.clasePermiso, 'clasePermiso', CLASES_PERMISO, defectoAuto ? CLASE_PERMISO_POR_DEFECTO : null)
  const companiaAnterior = textoOpcional(e.companiaAnterior, 'companiaAnterior', MAX_COMPANIA_ANTERIOR)

  // Moto (fail-closed): Allianz tiene productos distintos «Moto» y «Ciclomotor» (≤50 cc). Solo se tarifica Moto.
  if (ramo === 'moto') {
    const cc = seleccionVehiculo?.cilindradaCc ?? null
    const claseSel = seleccionVehiculo?.clase ?? null
    if (cc === null) {
      if (!errores.some((x) => x.startsWith('seleccionVehiculo.cilindradaCc'))) errores.push('seleccionVehiculo.cilindradaCc: falta la cilindrada (Allianz separa Moto y Ciclomotor)')
    } else if (cc <= 50) errores.push('seleccionVehiculo.cilindradaCc: ciclomotor (≤50 cc): producto Ciclomotor de Allianz, no Moto; no soportado aún')
    else if (claseSel !== null) {
      const [min, max] = TRAMOS_CLASE_MOTO[claseSel]
      if (cc < min || cc > max) errores.push(`seleccionVehiculo.clase: la clase ${claseSel} no casa con la cilindrada (clase 1 ≤125 cc · 2 126-350 · 3 351-750 · 4 >750)`)
    }
  }

  // Coche: la cilindrada NO es obligatoria, pero si viene ≤50 cc es un ciclomotor (producto distinto), mismo criterio que moto.
  if (ramo === 'auto') {
    const cc = seleccionVehiculo?.cilindradaCc ?? null
    if (cc !== null && cc <= 50) errores.push('seleccionVehiculo.cilindradaCc: ciclomotor (≤50 cc): producto Ciclomotor de Allianz, no Moto; no soportado aún')
  }

  if (errores.length || !ramo || !matricula || !codigoPostal || !conductor) return { ok: false, errores }
  return {
    ok: true,
    formulario: { ramo, matricula, codigoPostal, conductor, tomadorEsConductor, tomadorEsPropietario, aniosAseguradoAnterior, siniestrosUltimos5Anios, garajeNoche, tomador, eleccionVersion, seleccionVehiculo,
      ...(poblacion !== null ? { poblacion } : {}),
      ...(eleccionPoblacion !== null ? { eleccionPoblacion } : {}),
      ...(vehiculoConfirmado !== null ? { vehiculoConfirmado } : {}),
      ...(documentoTomador !== null ? { documentoTomador } : {}),
      ...(usoVehiculo !== null ? { usoVehiculo } : {}),
      ...(ambitoCirculacion !== null ? { ambitoCirculacion } : {}),
      ...(clasePermiso !== null ? { clasePermiso } : {}),
      ...(companiaAnterior !== null ? { companiaAnterior } : {}),
    },
  }
}
