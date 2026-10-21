// «Precio por bot (gratis)» del cotizador de moto (13/10/2026) — lo PURO: del formulario del cotizador al `FormularioAuto`
// que valida asegura. Sin red ni envs: importable desde 'use client' y desde la ruta. El mismo formulario vale para cualquier
// compañía con bot en el ramo moto (la compañía solo viaja como clave; ver `/api/correduria/tarificador/encolar`).
//
// 🚨 TARIFICAR ≠ EMITIR: solo precio. Dato personal: nunca se escribe en un log ni en un mensaje de error; los avisos
// dicen QUÉ falta, jamás el valor. Tres estados: `null` = «no consta», nunca 0/false inventados.
import { MAX_COMPANIA_ANTERIOR, MAX_POBLACION, tieneCaracteresProhibidos, esMatriculaEspanola, normalizarMatricula, pareceDatoPersonalEnDescripcion, validarFormularioAuto } from '@central/module-tarificacion'
import { carnetMotoMasAntiguo } from '@central/module-seguros'
import { leerEncolado } from './tarificador-probar.ts'

/** Datos que NO están en el navegador (viven en la ficha del cliente en asegura) y que el servidor completa. */
export const CAMPOS_DE_FICHA = ['codigoPostal', 'fechaNacimiento', 'fechaCarne'] as const
export type CampoDeFicha = (typeof CAMPOS_DE_FICHA)[number]

/**
 * Un dato personal tal como lo ve el cotizador: el valor tecleado (`string`), `'ficha'` = lo tiene la ficha y lo pone el
 * servidor, `null` = falta (ni tecleado ni en la ficha).
 */
export type DatoPersona = string | 'ficha' | null

/**
 * Un dato personal del cotizador (moto o coche) para el bot: lo tecleado en «corrige aquí» manda; si no, `'ficha'` salvo que
 * la precalificación diga que la ficha NO lo tiene (`null` = falta). Precalificación ilegible (`faltan === null`) → `'ficha'`:
 * el servidor lee la ficha y corta sin gastar si tampoco está. PURA.
 */
export function datoDePersonaBot(campo: string, faltan: readonly { campo: string }[] | null, correcciones: Record<string, string>): DatoPersona {
  const tecleado = (correcciones[campo] ?? '').trim()
  if (tecleado !== '') return tecleado
  return faltan === null || !faltan.some((f) => f.campo === campo) ? 'ficha' : null
}

export type EntradaBotMoto = {
  matricula: string
  marca: string | null
  modelo: string | null
  /** Texto de la versión del catálogo (solo el vehículo). Opcional: ayuda al bot a elegir versión. */
  version: string | null
  /** Cilindrada en cc tal como se teclea («125», «1.000»). Vacío = falta. */
  cilindrada: string
  codigoPostal: DatoPersona
  fechaNacimiento: DatoPersona
  fechaCarne: DatoPersona
  /** `hombre` | `mujer` solo si el corredor lo ha elegido; cualquier otra cosa = no consta. */
  sexo: string | null
  /** El tomador conduce otra ficha (conductor habitual en otra ficha o tomador empresa): el bot aún no lo soporta. */
  conductorEnOtraFicha: boolean
  propietarioEnOtraFicha: boolean
  /** `true` con seguro · `false` SOLO si se ha declarado/marcado que no tiene · `null` = no se sabe (supuesto favorable). */
  tieneSeguroActual: boolean | null
  aniosAsegurado: string
  aniosSinSiniestros: string
  siniestrosUltimos5: string
  /** Nombre de la compañía anterior (texto libre, ≤80). Solo viaja con seguro actual y años asegurado ≠ 0. */
  companiaAnterior?: string | null
  /** Fecha de ADQUISICIÓN (ISO, no la de matriculación): de `datosVehiculo.fechaCompra`. Allianz moto la pide siempre. Vacío/ausente = no consta. */
  fechaAdquisicion?: string | null
  /** Fecha de MATRICULACIÓN (ISO) del vehículo: la fecha de adquisición por defecto cuando no hay una explícita. */
  fechaMatriculacion?: string | null
  /** Últimas 5 cifras de la póliza anterior (texto tecleado; se normaliza a 5 cifras). Solo viaja con seguro actual y años ≠ 0. */
  polizaAnteriorUltimos5?: string | null
  /** Nº COMPLETO de la póliza actual/anterior que ya consta (declarado o leído de la póliza subida): si las 5 últimas están vacías, por defecto sus 5 últimas cifras. */
  numeroPolizaActual?: string | null
  /** Justificante del seguro anterior (`proximo_anio` | `dos_ultimos_anios`). Solo viaja con seguro actual y años ≠ 0. */
  fotocopiaAnterior?: string | null
  /** Municipio elegido entre los del CP (nombre del catálogo): viaja como `poblacion` para que el bot elija la localidad. Vacío = no viaja. */
  poblacion?: string | null
}

/**
 * Fecha de adquisición cuando NO hay una explícita (vacía): la de matriculación si es una fecha ISO válida; si tampoco, `null`
 * (sigue faltando). Una explícita siempre gana: esto solo se consulta cuando está vacía. PURA.
 */
export function fechaAdquisicionPorDefecto(fechaMatriculacion: string | null | undefined): string | null {
  const t = (fechaMatriculacion ?? '').trim()
  return t === '' ? null : fechaIsoValida(t)
}

/**
 * ¿La fecha de adquisición que viaja es la de POR DEFECTO? (marca `fechaAdquisicionPorDefecto` del bot Allianz moto 0.7.18). Sí si
 * el campo va vacío (sale de la matriculación) O si es IGUAL a nuestra fecha de matriculación: el campo del bot se precarga con lo
 * guardado en `datosVehiculo.fechaCompra` (p. ej. en la oportunidad, «#pedir-precio»), y guardar la matriculación como compra no
 * la vuelve un dato distinto. No depende de cómo llegó el valor al navegador. Una explícita DISTINTA no es por defecto. PURA.
 */
export function adquisicionEsPorDefecto(adquisicionTecleada: string | null | undefined, fechaAdquisicion: string | null, fechaMatriculacion: string | null | undefined): boolean {
  if ((adquisicionTecleada ?? '').trim() === '') return true
  const mat = fechaAdquisicionPorDefecto(fechaMatriculacion)
  return fechaAdquisicion !== null && mat !== null && fechaAdquisicion === mat
}

/**
 * Últimas 5 cifras de la póliza anterior cuando NO hay una explícita (vacía): las 5 últimas cifras (solo dígitos) del nº completo que
 * ya consta; con menos de 5 dígitos o sin nº, `null` (sigue faltando). Una explícita siempre gana: esto solo se consulta cuando está vacía. PURA.
 */
export function polizaAnteriorUltimos5PorDefecto(numeroCompleto: string | null | undefined): string | null {
  return ultimos5CifrasPoliza(numeroCompleto)
}

export type FormularioBotMoto =
  | { ok: true; riesgo: Record<string, unknown>; completarDesdeFicha: CampoDeFicha[] }
  | { ok: false; faltan: string[] }

const ISO = /^\d{4}-\d{2}-\d{2}$/
const entero = (s: string): number | null => (/^\d{1,4}$/.test(s.trim()) ? Number(s.trim()) : null)

/** Lo del historial que el cotizador (moto o coche) le da al bot: «¿tiene seguro ahora?» y los años/siniestros tecleados. */
export type HistorialBotEntrada = { tieneSeguroActual: boolean | null; aniosAsegurado: string; aniosSinSiniestros: string; siniestrosUltimos5: string }

/**
 * Historial que viaja al bot (moto y coche, el MISMO criterio): solo lo que el corredor ha declarado. SIN seguro actual
 * declarado = 0 años asegurado (19/10/2026, regla de Alberto: no hay compañía anterior que nombrar; sin esto el supuesto
 * favorable de 5 años hacía pedir la compañía a Mapfre); siniestros `null` (no consta). Con seguro y años sin teclear: `null`
 * (no se sabe → supuesto favorable declarado por el bot). `tieneSeguroActual === null` (NO se sabe si tiene seguro, 19/10/2026: dato que
 * no hay ≠ dato que dice «no») NO es «sin seguro»: años `null` como con seguro sin años (supuesto favorable), nunca 0 / novel. Un texto que no es un entero → `null`. 5 o más años sin siniestros ⇒ 0 siniestros en los
 * últimos 5 (deducción, no suposición); si no, solo el dato declarado. PURA.
 */
export function historialBot(e: HistorialBotEntrada): { aniosAseguradoAnterior: number | null; siniestrosUltimos5Anios: number | null } {
  if (e.tieneSeguroActual === false) return { aniosAseguradoAnterior: 0, siniestrosUltimos5Anios: null }
  let siniestrosUltimos5Anios = entero(e.siniestrosUltimos5)
  const sinSin = entero(e.aniosSinSiniestros)
  if (siniestrosUltimos5Anios === null && sinSin !== null && sinSin >= 5) siniestrosUltimos5Anios = 0
  return { aniosAseguradoAnterior: entero(e.aniosAsegurado), siniestrosUltimos5Anios }
}

/**
 * Tres estados del «seguro actual» que viaja al bot de moto (19/10/2026): con seguro → `true`; sin seguro → `false` SOLO si hay
 * una declaración explícita (arriba, o la casilla tocada por el corredor); sin dato y casilla sin tocar → `null` (no se sabe).
 * `tiene` = estado de la casilla; `sinDato` = ni el riesgo ni la póliza leída dicen nada (`tieneSeguroSinDato`); `tocado` = el
 * corredor ha pulsado la casilla. PURA.
 */
export function tieneSeguroParaBots(a: { tiene: boolean; sinDato: boolean; tocado: boolean }): boolean | null {
  if (a.tiene) return true
  return a.sinDato && !a.tocado ? null : false
}

/** Clase de Allianz Moto por cilindrada (tramos del portal). `null` = ≤50 cc (ciclomotor) o sin dato. */
export function claseMotoPorCilindrada(cc: number | null): 1 | 2 | 3 | 4 | null {
  if (cc === null || !Number.isInteger(cc) || cc <= 50) return null
  return cc <= 125 ? 1 : cc <= 350 ? 2 : cc <= 750 ? 3 : 4
}

/** Fecha ISO real (aaaa-mm-dd, existente) → la misma; cualquier otra cosa → `null`. */
export function fechaIsoValida(s: string | null | undefined): string | null {
  const t = (s ?? '').trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t)
  if (!m) return null
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).toISOString().slice(0, 10) === t ? t : null
}

/** Texto tecleado → últimas 5 cifras de la póliza (si se pega el número entero, sus 5 últimas cifras); menos de 5 cifras → `null`. */
export function ultimos5CifrasPoliza(s: string | null | undefined): string | null {
  const cifras = (s ?? '').replace(/\D/g, '')
  return cifras.length >= 5 ? cifras.slice(-5) : null
}

/** Justificantes del seguro anterior que acepta Allianz (mismos valores que `JUSTIFICANTES_SEGURO_ANTERIOR`). */
export const OPCIONES_JUSTIFICANTE_ANTERIOR = [
  { valor: '', etiqueta: 'Elegir…' },
  { valor: 'proximo_anio', etiqueta: 'Recibo del próximo año / certificado' },
  { valor: 'dos_ultimos_anios', etiqueta: 'Recibos de los 2 últimos años' },
] as const

/** «1.000» / «1000» / «125 cc» → 1000 / 1000 / 125. Lo que no es un número entero inequívoco → `null`. */
export function cilindradaDeTexto(s: string): number | null {
  const t = s.replace(/\s*cc\s*$/i, '').trim()
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ''))
  return /^\d{1,4}$/.test(t) ? Number(t) : null
}

/**
 * Formulario del cotizador → `riesgo` de moto para asegura. Si falta algo obligatorio devuelve QUÉ falta (en castellano, sin
 * valores); el botón se deshabilita con esa lista. Lo de la ficha (CP, nacimiento, carné) no se inventa: va en
 * `completarDesdeFicha` y lo pone el servidor leyendo la ficha; si la ficha tampoco lo tiene, el servidor corta sin gastar.
 */
export function formularioBotMoto(e: EntradaBotMoto, hoy: Date = new Date()): FormularioBotMoto {
  const faltan: string[] = []
  const completarDesdeFicha: CampoDeFicha[] = []

  if (e.conductorEnOtraFicha) faltan.push('El conductor habitual es otra ficha (o el tomador es una empresa): el bot todavía solo tarifica al propio cliente como conductor')
  if (e.propietarioEnOtraFicha) faltan.push('El propietario es otra ficha: el bot todavía solo tarifica al cliente como propietario')

  const matricula = e.matricula.trim()
  if (matricula === '') faltan.push('Matrícula (el formato del bot la exige; una moto sin matricular aún no se puede tarificar por bot)')
  else if (!esMatriculaEspanola(matricula)) faltan.push('Matrícula: no tiene formato de matrícula española')

  const marca = e.marca?.trim() ?? ''
  const modelo = e.modelo?.trim() ?? ''
  if (marca === '' || modelo === '') faltan.push('Marca y modelo de la moto (elígelos del catálogo)')

  const cc = cilindradaDeTexto(e.cilindrada)
  if (e.cilindrada.trim() === '' || cc === null) faltan.push('Cilindrada en cc (el bot separa Moto y Ciclomotor)')
  else if (cc <= 50) faltan.push('Cilindrada: un ciclomotor (hasta 50 cc) no se tarifica por bot')
  else if (cc > 3000) faltan.push('Cilindrada: tiene que estar entre 51 y 3.000 cc')

  const dato = (v: DatoPersona, etiqueta: string, campo: CampoDeFicha, valido: (s: string) => boolean): string | null => {
    if (v === null || (typeof v === 'string' && v.trim() === '')) { faltan.push(`${etiqueta} (ni en el formulario ni en la ficha)`); return null }
    if (v === 'ficha') { completarDesdeFicha.push(campo); return null }
    if (!valido(v.trim())) { faltan.push(`${etiqueta}: formato no válido`); return null }
    return v.trim()
  }
  const codigoPostal = dato(e.codigoPostal, 'Código postal', 'codigoPostal', (s) => /^\d{5}$/.test(s))
  const fechaNacimiento = dato(e.fechaNacimiento, 'Fecha de nacimiento del conductor', 'fechaNacimiento', (s) => ISO.test(s))
  const fechaCarne = dato(e.fechaCarne, 'Fecha del carné del conductor', 'fechaCarne', (s) => ISO.test(s))

  if (faltan.length) return { ok: false, faltan }

  const { aniosAseguradoAnterior, siniestrosUltimos5Anios } = historialBot(e)

  // La compañía anterior solo tiene sentido con seguro actual y años ≠ 0; sin nombre (o demasiado largo) no viaja (no consta).
  const companiaTxt = e.tieneSeguroActual !== false && aniosAseguradoAnterior !== 0 ? (e.companiaAnterior ?? '').replace(/\s+/g, ' ').trim() : ''
  const companiaAnterior = companiaTxt !== '' && companiaTxt.length <= MAX_COMPANIA_ANTERIOR ? companiaTxt : null

  // Allianz moto (bot 0.7.11): fecha de adquisición (siempre) y, si estuvo asegurado, póliza anterior y justificante. Lo que no consta
  // NO viaja (nunca un valor de cajón); la fecha mal formada es un hueco que se dice, no se descarta en silencio.
  const adqTxt = (e.fechaAdquisicion ?? '').trim()
  const fechaAdquisicion = adqTxt === '' ? fechaAdquisicionPorDefecto(e.fechaMatriculacion) : fechaIsoValida(adqTxt)
  if (adqTxt !== '' && fechaAdquisicion === null) return { ok: false, faltan: ['Fecha de adquisición: tiene que ser una fecha válida'] }
  const conSeguroAnterior = e.tieneSeguroActual !== false && aniosAseguradoAnterior !== 0
  const polizaAnteriorUltimos5 = conSeguroAnterior ? ((e.polizaAnteriorUltimos5 ?? '').trim() === '' ? polizaAnteriorUltimos5PorDefecto(e.numeroPolizaActual) : ultimos5CifrasPoliza(e.polizaAnteriorUltimos5)) : null
  const fotocopiaAnterior = conSeguroAnterior && (e.fotocopiaAnterior === 'proximo_anio' || e.fotocopiaAnterior === 'dos_ultimos_anios') ? e.fotocopiaAnterior : null

  // Población elegida por el corredor (CP con varias): mismo filtro que `validarFormularioAuto`; inválida = no viaja (el servidor
  // cae a la ciudad de la ficha si el CP casa, `poblacionDesdeFicha`).
  const poblacionTxt = (e.poblacion ?? '').replace(/\s+/g, ' ').trim()
  const poblacion = poblacionTxt !== '' && poblacionTxt.length <= MAX_POBLACION && !tieneCaracteresProhibidos(poblacionTxt) ? poblacionTxt : null

  const version = e.version?.replace(/\s+/g, ' ').trim() ?? ''
  const descripcionOk = version !== '' && version.length <= 200 && !pareceDatoPersonalEnDescripcion(version)
  const riesgo: Record<string, unknown> = {
    ramo: 'moto',
    matricula: normalizarMatricula(matricula),
    ...(codigoPostal ? { codigoPostal } : {}),
    ...(poblacion !== null ? { poblacion } : {}),
    conductor: {
      ...(fechaNacimiento ? { fechaNacimiento } : {}),
      ...(fechaCarne ? { fechaCarne } : {}),
      sexo: e.sexo === 'hombre' || e.sexo === 'mujer' ? e.sexo : null,
    },
    // Tomador = conductor = propietario salvo que haya otra ficha (arriba ya se ha cortado): es la estructura del cotizador.
    tomadorEsConductor: true,
    tomadorEsPropietario: true,
    aniosAseguradoAnterior,
    siniestrosUltimos5Anios,
    ...(companiaAnterior !== null ? { companiaAnterior } : {}),
    // v0.7.18 del bot: `fechaAdquisicionPorDefecto` = no la tecleó Alberto (salió de `fechaAdquisicionPorDefecto`, la matriculación,
    // que puede ser estimada): Allianz moto la sube a la 1ª matriculación de su portal si es posterior. Mapfre/Generali lo ignoran.
    // 21/10/2026: también si la tecleada/guardada es IGUAL a la matriculación (`adquisicionEsPorDefecto`): en la oportunidad el campo
    // llega precargado desde `fechaCompra` y nunca iba vacío, así que la marca no viajaba.
    ...(fechaAdquisicion !== null ? { fechaAdquisicion, fechaAdquisicionPorDefecto: adquisicionEsPorDefecto(adqTxt, fechaAdquisicion, e.fechaMatriculacion) } : {}),
    ...(polizaAnteriorUltimos5 !== null ? { polizaAnteriorUltimos5 } : {}),
    ...(fotocopiaAnterior !== null ? { fotocopiaAnterior } : {}),
    // El garaje del cotizador es un SUPUESTO (dato de emisión, no de precio): no se manda como si fuera un dato.
    garajeNoche: null,
    seleccionVehiculo: { marca, modelo, clase: claseMotoPorCilindrada(cc), cilindradaCc: cc, ...(descripcionOk ? { descripcion: version } : {}) },
  }

  // Si ya está todo lo que viaja desde el navegador, se pasa por el MISMO validador que asegura (menos lo de la ficha, que aún
  // no está): así los errores de forma se ven aquí, gratis, antes de encolar.
  if (completarDesdeFicha.length === 0) {
    const v = validarFormularioAuto(riesgo, hoy)
    if (!v.ok) return { ok: false, faltan: v.errores }
  }
  return { ok: true, riesgo, completarDesdeFicha }
}

// ─── Servidor: completar el riesgo con la ficha ─────────────────────────────

/** Lo mínimo de la ficha que se lee (estructural: no importa `ficha-asegura` para seguir siendo puro y testeable). */
export type FichaParaBot = {
  contacto: { codigoPostal: string | null }
  identidad: { fechaNacimiento: string | null } | null
  dePolizas: { fechaNacimiento: string | null; fechaCarnet: string | null } | null
  /** Carnés de la ficha: `tipo` en mayúsculas («A», «A2», «B»…); `fechaExpedicion` ISO. */
  carnets: { tipo: string; fechaExpedicion: string | null }[] | null
}

const esIso = (s: string | null | undefined): s is string => typeof s === 'string' && ISO.test(s)

/** Ramos de vehículo con bot cuyo riesgo se completa con la ficha. */
export type RamoVehiculoBot = 'moto' | 'auto'

/** ¿Este tipo de carné de la ficha vale para el ramo? Moto: A, A1, A2. Coche: B (mismo criterio que `carnetBDeFicha` de asegura). */
function carneDelRamo(ramo: RamoVehiculoBot, tipo: string): boolean {
  const t = tipo.toUpperCase().replace(/\s/g, '')
  return ramo === 'moto' ? /^A\d?$/.test(t) : t === 'B'
}

/**
 * Rellena `codigoPostal`, `conductor.fechaNacimiento` y `conductor.fechaCarne` del riesgo con la ficha, SOLO los pedidos en
 * `pedidos` y nunca pisando un valor que ya traiga. Carné: el más antiguo de la ficha del tipo del ramo (moto: A, A1, A2;
 * coche: B); si no hay, el que traen sus pólizas. Nada se inventa: lo que la ficha no tiene va en `faltan` (el servidor
 * corta sin gastar). El NIF del tomador NO va aquí: lo inyecta asegura al entregar el trabajo (`aplicarNifTomador`).
 */
export function completarRiesgoMotoDesdeFicha(
  riesgo: Record<string, unknown>,
  ficha: FichaParaBot | null,
  pedidos: readonly CampoDeFicha[],
): { riesgo: Record<string, unknown>; faltan: CampoDeFicha[] } {
  return completarRiesgoVehiculoDesdeFicha('moto', riesgo, ficha, pedidos)
}

/** Lo mismo para el COCHE (14/10/2026): carné B. */
export function completarRiesgoAutoDesdeFicha(
  riesgo: Record<string, unknown>,
  ficha: FichaParaBot | null,
  pedidos: readonly CampoDeFicha[],
): { riesgo: Record<string, unknown>; faltan: CampoDeFicha[] } {
  return completarRiesgoVehiculoDesdeFicha('auto', riesgo, ficha, pedidos)
}

export function completarRiesgoVehiculoDesdeFicha(
  ramo: RamoVehiculoBot,
  riesgo: Record<string, unknown>,
  ficha: FichaParaBot | null,
  pedidos: readonly CampoDeFicha[],
): { riesgo: Record<string, unknown>; faltan: CampoDeFicha[] } {
  const faltan: CampoDeFicha[] = []
  const salida: Record<string, unknown> = { ...riesgo }
  const conductor: Record<string, unknown> = typeof riesgo.conductor === 'object' && riesgo.conductor !== null && !Array.isArray(riesgo.conductor) ? { ...(riesgo.conductor as Record<string, unknown>) } : {}
  for (const campo of CAMPOS_DE_FICHA) {
    if (!pedidos.includes(campo)) continue
    if (campo === 'codigoPostal') {
      if (typeof salida.codigoPostal === 'string' && salida.codigoPostal.trim()) continue
      const cp = ficha?.contacto.codigoPostal?.replace(/\s+/g, '') ?? ''
      if (/^\d{5}$/.test(cp)) salida.codigoPostal = cp
      else faltan.push(campo)
    } else if (campo === 'fechaNacimiento') {
      if (typeof conductor.fechaNacimiento === 'string' && conductor.fechaNacimiento) continue
      const f = [ficha?.identidad?.fechaNacimiento, ficha?.dePolizas?.fechaNacimiento].find(esIso)
      if (f) conductor.fechaNacimiento = f
      else faltan.push(campo)
    } else {
      if (typeof conductor.fechaCarne === 'string' && conductor.fechaCarne) continue
      const delRamo = ramo === 'moto'
        ? carnetMotoMasAntiguo(ficha?.carnets)?.fecha // MISMA regla que asegura (`fichaTomador`): el más antiguo de A/A1/A2
        : (ficha?.carnets ?? []).filter((c) => carneDelRamo(ramo, c.tipo) && esIso(c.fechaExpedicion)).map((c) => c.fechaExpedicion as string).sort()[0]
      const f = delRamo ?? (esIso(ficha?.dePolizas?.fechaCarnet) ? ficha?.dePolizas?.fechaCarnet : undefined)
      if (f) conductor.fechaCarne = f
      else faltan.push(campo)
    }
  }
  salida.conductor = conductor
  return { riesgo: salida, faltan }
}

const ROTULO_FICHA: Record<CampoDeFicha, string> = {
  codigoPostal: 'el código postal', fechaNacimiento: 'la fecha de nacimiento', fechaCarne: 'la fecha del carné de moto',
}
export function mensajeFaltanDeFicha(faltan: readonly CampoDeFicha[], ramo: RamoVehiculoBot = 'moto'): string {
  const rotulo = (c: CampoDeFicha) => (c === 'fechaCarne' && ramo === 'auto' ? 'la fecha del carné B (coche)' : ROTULO_FICHA[c])
  return `La ficha del cliente no tiene ${faltan.map(rotulo).join(', ')}. Complétalo en la ficha (o teclea el dato) y vuelve a pedir el precio.`
}

/** `compania` de la petición → clave limpia, o `null` si no tiene forma de clave (minúsculas, dígitos, `_`/`-`). */
export function claveDeCompania(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const c = v.trim().toLowerCase()
  return /^[a-z0-9_-]{1,40}$/.test(c) ? c : null
}

// ─── Cliente: la respuesta de encolar ───────────────────────────────────────

export type EncoladoBot = { ok: true; trabajoId: string; duplicado: boolean } | { ok: false; mensaje: string }

/**
 * Respuesta de `POST /api/correduria/tarificador/encolar` → trabajo o texto para la persona. Los `errores` de asegura son de
 * forma y no llevan el valor (el validador nunca lo repite), así que se pueden enseñar.
 */
export function leerEncoladoBot(status: number, json: unknown): EncoladoBot {
  const o = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  const lista = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  if (status === 400) {
    const errores = lista(o.errores)
    if (errores.length) return { ok: false, mensaje: `Datos no válidos para el bot: ${errores.join('; ')}` }
    if (typeof o.mensaje === 'string') return { ok: false, mensaje: o.mensaje }
  }
  if (status === 409 && o.duplicado !== true) {
    // Bot en pausa (3 fallos seguidos, p. ej. contraseña rechazada): antes salía como «no está autorizada», que despista (19/10/2026).
    if (typeof o.motivo === 'string' && o.motivo.startsWith('bot_pausado')) {
      const m = /^[a-z_]+: ([\s\S]+)$/.exec(o.motivo.trim())
      return { ok: false, mensaje: `Bot en pausa, no se ha encolado: ${m ? m[1] : 'reanúdalo en /correduria/tarificador.'}` }
    }
    const motivo = typeof o.motivo === 'string' ? ` (${o.motivo})` : ''
    return { ok: false, mensaje: typeof o.mensaje === 'string' ? o.mensaje : `Esa compañía no está autorizada para el bot${motivo}` }
  }
  if (status === 422 || status === 404) {
    if (typeof o.mensaje === 'string') return { ok: false, mensaje: o.mensaje }
    // asegura rechaza con `motivo` «codigo: explicación» (p. ej. `falta_datos_tomador: falta el nombre en la ficha…`):
    // se enseña la explicación (nunca lleva valores).
    const m = typeof o.motivo === 'string' ? /^[a-z_]+: ([\s\S]+)$/.exec(o.motivo.trim()) : null
    return { ok: false, mensaje: m ? `No se encoló: ${m[1]}` : `No se pudo encolar (HTTP ${status}).` }
  }
  return leerEncolado(status, json)
}

/**
 * «Compañía actual» del cotizador (arriba) → `companiaAnterior` del bloque de bots (19/10/2026). Antes no viajaba y Mapfre pedía
 * de nuevo el nombre aunque ya estuviera elegido. Código DGS → `nombreComun` del catálogo; sin catálogo (`null`) vale el texto libre;
 * sin elegir, la compañía leída de la póliza de la oportunidad (`poliza_competencia.aseguradora`). Sin seguro actual → `null`
 * (los años = 0 los descarta `formularioBotMoto`). PURA.
 */
export function companiaActualParaBots(a: {
  tieneSeguroActual: boolean
  companias: readonly { codigoDgs: string; nombreComun: string }[] | null
  codigo: string
  libre: string
  leida?: string | null
}): string | null {
  if (!a.tieneSeguroActual) return null
  const delCatalogo = a.codigo ? a.companias?.find((c) => c.codigoDgs === a.codigo)?.nombreComun ?? '' : ''
  const t = (delCatalogo || a.libre || a.leida || '').replace(/\s+/g, ' ').trim()
  return t === '' ? null : t
}
