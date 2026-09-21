// Una póliza que llega DIRECTAMENTE al corredor (WhatsApp, correo, en mano) y
// que sube él mismo desde la pantalla de leer documentos.
//
// ─── Qué es, y sobre todo qué NO es ─────────────────────────────────────────
//
// Es **el mismo dato que un cliente declara en el portal**, entrando por otra
// puerta: la póliza que esa persona tiene HOY, con su compañía, su prima y su
// vencimiento. Por eso aterriza en `seguros.portal_poliza_declarada`
// (`procedencia: 'documento'`) y NO en `seguros.polizas`.
//
// 🚨 Escribirla en `seguros.polizas` sería el error caro, por dos motivos que
// se acumulan:
//   1. Una fila ahí con `import_ref` a NULL **es cartera viva** para
//      `esCarteraViva()` — o sea, contaría como póliza mediada por la casa y
//      como cliente. Las 110 vivas dejarían de significar lo que significan.
//   2. La ingesta de CIMA empareja por número de póliza + nombre de compañía y
//      **pisa**. Una póliza que el corredor aún no ha mediado, guardada con su
//      número real, es exactamente la fila con la que un pull futuro colisiona.
//      Y la compañía del documento no dice nada: el corredor trabaja con varias
//      y puede recolocar esa póliza en cualquier otra.
//
// ─── Lo que este módulo decide, y lo que se niega a decidir ─────────────────
//
// Decide el mapeo de lo leído a los dos destinos (ficha y póliza declarada).
// **No inventa lo que el documento no trae**: cada hueco sale como `null` y,
// cuando ese hueco cambia lo que el corredor puede hacer después, sale además
// como un AVISO con nombre. Un `null` silencioso aquí se pintaría luego como
// «esta póliza no tiene vencimiento», que es una afirmación, no una ausencia.

import { MARCADORES_SIN_DATO } from './documento-auto.ts'
import { normalizarMatricula } from './matricula.ts'
import type { Coincidencia } from './cliente-edicion.ts'

const SIN_DATO = new Set(MARCADORES_SIN_DATO)

export type TipoLecturaDocumento = 'auto' | 'hogar' | 'contrato_solo'

/** Lo que devuelve el lector de pólizas, sin tocar. */
export type LecturaPoliza = {
  ramo: string | null
  tipoLectura: TipoLecturaDocumento
  datos: Record<string, string | number | null>
}

/**
 * Por qué el corredor tendrá que mirar antes de guardar. Cada uno cambia algo
 * que puede hacer después, así que ninguno se calla:
 *
 * - `sin_nombre`     → no hay a quién abrirle ficha. Bloquea el alta.
 * - `sin_dni`        → la ficha se casará por teléfono/email o por nada. El DNI
 *                      es lo único que identifica a una persona: dos parientes
 *                      homónimos se funden sin él.
 * - `nombre_partido` → el corte nombre/apellidos lo ha hecho una heurística
 *                      sobre un texto corrido, no el documento.
 * - `sin_vencimiento`→ es el dato por el que se sube la póliza: sin él no se
 *                      sabe cuándo entrar, y no habrá aviso que dispare.
 * - `sin_compania` / `sin_numero` → no se podrá cotejar contra la cartera para
 *                      saber si esa póliza ya la lleva la casa.
 */
export type AvisoDocumento =
  | 'sin_nombre'
  | 'sin_dni'
  | 'nombre_partido'
  | 'sin_vencimiento'
  | 'sin_compania'
  | 'sin_numero'
  | 'vencimiento_proyectado'
  | 'sin_clave_de_riesgo'

export type TipoPersonaDocumento = 'fisica' | 'juridica'

/**
 * Las claves por las que se sabe si ESE riesgo ya lo lleva la casa. El número de
 * póliza no basta y por eso están todas: una misma persona con el mismo coche
 * cambia de número cada vez que cambia de compañía, y es el mismo riesgo.
 *
 * Orden de fuerza, que es el de la regla «por identidad, nunca por la etiqueta»:
 *   1. `dni`       — quién es. Dos DNI distintos no se funden jamás.
 *   2. `matricula` — qué coche (auto y moto). Identifica el riesgo aunque cambie
 *                    de dueño, de compañía y de número de póliza.
 *   3. `direccion` — qué vivienda (hogar). Es texto, así que solo sirve para
 *                    mirar, nunca para fundir dos fichas.
 *   4. `numeroPoliza` — la etiqueta de ESTE contrato. La más débil de las cuatro:
 *                    cambia con cada renovación y con cada compañía.
 */
export type ClavesCotejo = {
  dni: string | null
  matricula: string | null
  direccion: string | null
  cp: string | null
  numeroPoliza: string | null
}

export type AltaDesdeDocumento = {
  nombre: string
  apellidos: string
  dni: string | null
  tipoPersona: TipoPersonaDocumento
  fechaNacimiento: string | null
  /** El canal: llegó directamente al corredor, no por un formulario. */
  fuente: 'venta_directa'
}

export type DeclaradaDesdeDocumento = {
  compania: string | null
  numeroPoliza: string | null
  ramo: string | null
  primaAnual: number | null
  /** `aaaa-mm-dd`, tal y como lo normaliza el lector. */
  fechaVencimiento: string | null
  matricula: string | null
  fechaMatriculacion: string | null
  referenciaCatastral: string | null
  /** Todo lo demás que se leyó, sin perder nada: es lo que se le enseña luego. */
  datosRamo: Record<string, string | number> | null
}

function texto(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (!t || SIN_DATO.has(t.toLowerCase())) return null
  return t
}

function numero(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/**
 * Formas societarias que hacen que un tomador NO sea una persona. La lista es
 * corta a propósito: ante la duda se dice `fisica`, que es lo que hace que el
 * nombre se parta — y partir mal un nombre se ve en pantalla, mientras que dar
 * una empresa por persona se cuela entero.
 */
const FORMAS_SOCIETARIAS =
  /\b(s\.?l\.?u?\.?|s\.?a\.?u?\.?|s\.?c\.?|s\.?coop\.?|c\.?b\.?|a\.?i\.?e\.?|sociedad|asociacion|asociación|comunidad|fundacion|fundación|ayuntamiento)\b/i

export function tipoPersonaDeNombre(nombre: string): TipoPersonaDocumento {
  return FORMAS_SOCIETARIAS.test(nombre) ? 'juridica' : 'fisica'
}

/**
 * Parte «MARIA DEL CARMEN LOPEZ RUIZ» en nombre y apellidos. Es una HEURÍSTICA
 * (un documento trae el tomador en un solo campo), así que quien la use está
 * obligado a enseñar el resultado antes de guardarlo: el aviso `nombre_partido`
 * existe para eso. Las partículas se pegan a lo que siguen, que es como se
 * escriben los nombres compuestos en español.
 */
export function partirNombre(completo: string): { nombre: string; apellidos: string } {
  const limpio = completo.replace(/\s+/g, ' ').trim()
  if (!limpio) return { nombre: '', apellidos: '' }
  // Un nombre con coma viene ya partido por el documento: «LOPEZ RUIZ, MARIA».
  const coma = limpio.indexOf(',')
  if (coma > 0) {
    return {
      nombre: limpio.slice(coma + 1).trim(),
      apellidos: limpio.slice(0, coma).trim(),
    }
  }
  const trozos = limpio.split(' ')
  if (trozos.length === 1) return { nombre: trozos[0]!, apellidos: '' }
  const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'da', 'do', 'van', 'von'])
  // El nombre son los tokens hasta el primero que empieza apellido: con 2 o 3
  // tokens, uno; con 4 o más, dos (el compuesto típico: «Juan Carlos Pérez Gil»).
  let corte = trozos.length >= 4 ? 2 : 1
  // Una partícula NUNCA cierra el nombre: si el corte cae justo detrás de una
  // («María del | Carmen de la Rosa»), el compuesto sigue y el corte avanza.
  while (corte < trozos.length - 1 && PARTICULAS.has(trozos[corte - 1]!.toLowerCase())) corte++
  return {
    nombre: trozos.slice(0, corte).join(' '),
    apellidos: trozos.slice(corte).join(' '),
  }
}

/**
 * La ficha que se abriría con lo leído. `alta: null` cuando el documento no
 * trae tomador: sin nombre no hay ficha, y **inventarse uno** («Titular del
 * documento», el número de póliza…) crearía una persona que no existe.
 */
export function prepararAltaDesdeDocumento(l: LecturaPoliza): {
  alta: AltaDesdeDocumento | null
  avisos: AvisoDocumento[]
} {
  const avisos: AvisoDocumento[] = []
  const tomador = texto(l.datos.tomador)
  const dni = texto(l.datos.dni)
  if (!dni) avisos.push('sin_dni')
  if (!tomador) {
    avisos.push('sin_nombre')
    return { alta: null, avisos }
  }
  const tipoPersona = tipoPersonaDeNombre(tomador)
  if (tipoPersona === 'juridica') {
    return {
      alta: {
        nombre: tomador,
        apellidos: '',
        dni,
        tipoPersona,
        fechaNacimiento: null,
        fuente: 'venta_directa',
      },
      avisos,
    }
  }
  const { nombre, apellidos } = partirNombre(tomador)
  if (apellidos) avisos.push('nombre_partido')
  return {
    alta: {
      nombre,
      apellidos,
      dni,
      tipoPersona,
      fechaNacimiento: texto(l.datos.fechaNacimiento),
      fuente: 'venta_directa',
    },
    avisos,
  }
}

/**
 * Por qué claves se puede preguntar «¿esto ya lo llevo yo?» con lo que trae el
 * documento. Devuelve `hayClaveDeRiesgo: false` cuando lo único que queda es el
 * número de póliza: entonces una respuesta vacía significa «esta póliza concreta
 * no la tengo», que NO es lo mismo que «este riesgo no lo tengo», y quien la
 * pinte tiene que poder decir la diferencia.
 */
export function clavesCotejo(l: LecturaPoliza): {
  claves: ClavesCotejo
  hayClaveDeRiesgo: boolean
} {
  const esVehiculo = l.ramo === 'auto' || l.ramo === 'moto' || l.tipoLectura === 'auto'
  const esVivienda = l.ramo === 'hogar' || l.tipoLectura === 'hogar'
  const claves: ClavesCotejo = {
    dni: texto(l.datos.dni),
    matricula: esVehiculo ? matriculaCotejable(texto(l.datos.matricula)) : null,
    direccion: esVivienda ? texto(l.datos.direccion) : null,
    cp: esVivienda ? texto(l.datos.cp) : null,
    numeroPoliza: texto(l.datos.numeroPoliza),
  }
  return {
    claves,
    hayClaveDeRiesgo: claves.dni !== null || claves.matricula !== null || claves.direccion !== null,
  }
}

/**
 * La matrícula lista para comparar. `normalizarMatricula` (de `matricula.ts`) es
 * el normalizador ÚNICO del repo; aquí solo se le añade el tercer estado, porque
 * para cotejar «no hay matrícula» y «matrícula vacía» no son lo mismo.
 */
function matriculaCotejable(v: string | null): string | null {
  if (!v) return null
  return normalizarMatricula(v) || null
}

/**
 * El vencimiento que sirve para saber CUÁNDO ENTRAR, no el que imprime el papel.
 *
 * 🚨 Un documento que llega hoy con el vencimiento en el pasado casi nunca es una
 * póliza muerta: es una póliza PRORROGADA. El contrato de seguro se renueva de
 * año en año salvo denuncia (art. 22 LCS), y la gente manda el último papel que
 * tiene a mano, que puede ser de hace tres renovaciones.
 *
 * Guardar esa fecha tal cual tiene un efecto concreto y silencioso: el calendario
 * la da por pasada y **no avisa nunca**, justo de la póliza que se acaba de subir
 * para poder entrar a tiempo.
 *
 * Así que se proyecta al próximo aniversario y se DECLARA con un aviso: es una
 * fecha derivada, no leída. Si el cliente denunció el contrato, la proyección
 * sobra — pero eso se ve llamando, y para llamar hace falta que salga en la lista.
 *
 * El 29 de febrero se proyecta al 28 en los años no bisiestos, no al 1 de marzo:
 * adelantar un día una fecha de preaviso es conservador; atrasarla, no.
 */
export function proyectarVencimiento(
  fecha: string | null,
  hoy: Date = new Date(),
): { fecha: string | null; proyectado: boolean } {
  if (!fecha) return { fecha: null, proyectado: false }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha)
  if (!m) return { fecha, proyectado: false }
  const [, anio, mes, dia] = m
  const hoyIso = `${hoy.getUTCFullYear()}-${String(hoy.getUTCMonth() + 1).padStart(2, '0')}-${String(
    hoy.getUTCDate(),
  ).padStart(2, '0')}`
  if (fecha >= hoyIso) return { fecha, proyectado: false }

  const mesN = Number(mes)
  const diaN = Number(dia)
  let candidato = Number(anio)
  // Se avanza de año en año hasta pasar de hoy: un papel de hace tres
  // renovaciones no puede quedarse a mitad de camino.
  let salida = ''
  do {
    candidato += 1
    const ultimo = new Date(Date.UTC(candidato, mesN, 0)).getUTCDate()
    const diaReal = Math.min(diaN, ultimo)
    salida = `${candidato}-${mes}-${String(diaReal).padStart(2, '0')}`
  } while (salida < hoyIso)
  return { fecha: salida, proyectado: true }
}

/** Campos de la lectura que ya tienen columna propia y no se repiten en `datosRamo`. */
const CON_COLUMNA_PROPIA = new Set([
  'compania',
  'numeroPoliza',
  'primaAnual',
  'fechaVencimiento',
  'matricula',
  'fechaMatriculacion',
  'referenciaCatastral',
  'tomador',
  'dni',
])

/**
 * La póliza declarada. Lo que no tiene columna propia (marca, modelo, capital
 * de continente, años sin siniestros…) va entero a `datosRamo`: se lee del
 * documento una vez y no se vuelve a tener.
 *
 * `datosRamo: null` cuando no quedó nada, que **no es** `{}` («se miró y el
 * documento no traía más»).
 */
export function prepararDeclaradaDesdeDocumento(
  l: LecturaPoliza,
  hoy: Date = new Date(),
): {
  declarada: DeclaradaDesdeDocumento
  avisos: AvisoDocumento[]
} {
  const avisos: AvisoDocumento[] = []
  const compania = texto(l.datos.compania)
  const numeroPoliza = texto(l.datos.numeroPoliza)
  const leido = texto(l.datos.fechaVencimiento)
  const { fecha: fechaVencimiento, proyectado } = proyectarVencimiento(leido, hoy)
  if (!compania) avisos.push('sin_compania')
  if (!numeroPoliza) avisos.push('sin_numero')
  if (!fechaVencimiento) avisos.push('sin_vencimiento')
  if (proyectado) avisos.push('vencimiento_proyectado')
  if (!clavesCotejo(l).hayClaveDeRiesgo) avisos.push('sin_clave_de_riesgo')

  const resto: Record<string, string | number> = {}
  for (const [k, v] of Object.entries(l.datos)) {
    if (CON_COLUMNA_PROPIA.has(k)) continue
    const t = typeof v === 'number' ? numero(v) : texto(v)
    if (t !== null) resto[k] = t
  }

  return {
    declarada: {
      compania,
      numeroPoliza,
      ramo: texto(l.ramo),
      primaAnual: numero(l.datos.primaAnual),
      fechaVencimiento,
      matricula: matriculaCotejable(texto(l.datos.matricula)),
      fechaMatriculacion: texto(l.datos.fechaMatriculacion),
      referenciaCatastral: texto(l.datos.referenciaCatastral),
      datosRamo: Object.keys(resto).length > 0 ? resto : null,
    },
    avisos,
  }
}


// ─── Qué se puede hacer con una ficha que ya tiene ese dato ─────────────────
//
// 🚨 Caso fundacional (21/09/2026, lo contó Alberto): una persona le escribe
// por WhatsApp y le manda DOS pólizas, **ninguna suya** — una de su padre y
// otra de su cuñado. Quien trae el documento no es de quien es la póliza, y el
// trámite lo hace él, así que en esos papeles aparece SU teléfono.
//
// El alta busca por DNI, teléfono y email, y las tres coincidencias llegaban
// a la pantalla con el mismo botón: «usar esta ficha». Pulsarlo sobre una
// coincidencia de TELÉFONO cuelga la póliza del padre de la ficha del hijo, y
// si además se llaman igual no lo nota nadie. Es la regla que el portal ya
// tenía escrita —un móvil identifica un HOGAR, no a una persona: 740 números
// compartidos por 1.599 fichas— incumplida en este flujo.
//
// Duplicar una ficha se ve y molesta; fundir dos personas no se ve y mezcla
// sus teléfonos, sus pólizas y sus papeles. Por eso la asimetría:
//
//   · por DNI               → es la misma persona. Se enlaza.
//   · por teléfono o email  → puede ser otra persona de la misma casa. NO se
//                             enlaza: se crea su ficha y se deja dicho de quién
//                             es el contacto que comparten.

export type Cotejo = {
  /** Misma persona, sin discusión: la póliza va a esta ficha. */
  mismaPersona: Coincidencia[]
  /** Comparte teléfono o email. NO es «la misma»: es su casa. */
  mismoContacto: Coincidencia[]
}

export function clasificarCoincidencias(cs: readonly Coincidencia[]): Cotejo {
  const mismaPersona: Coincidencia[] = []
  const mismoContacto: Coincidencia[] = []
  for (const c of cs) (c.por === 'dni' ? mismaPersona : mismoContacto).push(c)
  return { mismaPersona, mismoContacto }
}

/**
 * Si la pantalla puede ofrecer «esta póliza es de esta ficha». SOLO por DNI:
 * es el único dato que identifica a una persona y no a un domicilio.
 */
export function puedeEnlazarse(c: Coincidencia): boolean {
  return c.por === 'dni'
}
