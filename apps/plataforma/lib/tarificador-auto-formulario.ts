// «Bots (gratis)» del cotizador de COCHE (14/10/2026) — lo PURO: del formulario del cotizador de auto al `FormularioAuto`
// (`ramo: 'auto'`) que valida asegura. Mismo patrón que moto (`tarificador-moto-formulario.ts`): lo de la ficha (CP del
// cliente, nacimiento, carné B) lo pone el servidor; el NIF del tomador lo inyecta asegura al entregar el trabajo. Sin red ni
// envs: importable desde 'use client' y desde la ruta.
//
// 🚨 TARIFICAR ≠ EMITIR: solo precio. Dato personal: nunca en un log ni en un mensaje; los avisos dicen QUÉ falta, jamás el
// valor. Tres estados: `null` = «no consta», nunca 0/false inventados. Lo que el bot de Mapfre exige y no consta (historial,
// fechas del conductor) se ENSEÑA como falta y el botón no encola (el bot lo rechazaría como `datos` tras abrir el portal).
//
// Lo que NO viaja a propósito (el `FormularioAuto` no tiene sitio y Mapfre NSEI no lo pide en la grabación del 13/10/2026):
// fecha de matriculación (NSEI la autorrellena al confirmar el vehículo por matrícula) y km anuales.
import { esMatriculaEspanola, normalizarMatricula, pareceDatoPersonalEnDescripcion, validarFormularioAuto } from '@central/module-tarificacion'
import { historialBot, type CampoDeFicha, type DatoPersona, type FormularioBotMoto } from './tarificador-moto-formulario.ts'

export type EntradaBotAuto = {
  matricula: string
  /** Nombres del catálogo (solo el vehículo). Opcionales para el coche: Mapfre confirma el vehículo por matrícula. */
  marca: string | null
  modelo: string | null
  version: string | null
  /** CP de circulación del riesgo (`datosVehiculo.cpCirculacion`); `'ficha'` = el del cliente; `null` = falta. */
  codigoPostal: DatoPersona
  fechaNacimiento: DatoPersona
  fechaCarne: DatoPersona
  sexo: string | null
  /**
   * Código del catálogo de garajes de Codeoscopic, SOLO si es un dato (del riesgo o elegido por el corredor). El garaje por
   * defecto de la pantalla es un supuesto: entonces llega `null`.
   */
  garaje: string | null
  conductorEnOtraFicha: boolean
  propietarioEnOtraFicha: boolean
  tieneSeguroActual: boolean
  aniosAsegurado: string
  aniosSinSiniestros: string
  siniestrosUltimos5: string
}

/** Garajes del catálogo que son «duerme en garaje» (los vistos en asegura `datos-cotizados.ts`). */
const GARAJE_SI = new Set(['CommunalParking', 'Garage', 'PrivateGarage', 'IndividualGarage'])
/** Garajes que son «duerme en la calle». */
const GARAJE_NO = new Set(['PublicRoad', 'Street'])

/**
 * Código de garaje → `garajeNoche` del formulario. Calle / vía pública → `false`; garaje individual, comunitario o «Garaje» →
 * `true`; vacío o un código que no se ha visto → `null` (no se traduce a ojo: un garaje mal traducido es un precio falso).
 */
export function garajeNocheDeCodigo(codigo: string | null | undefined): boolean | null {
  const c = typeof codigo === 'string' ? codigo.trim() : ''
  if (GARAJE_SI.has(c)) return true
  if (GARAJE_NO.has(c)) return false
  return null
}

const ISO = /^\d{4}-\d{2}-\d{2}$/

/**
 * Formulario del cotizador de coche → `riesgo` de auto para asegura, o QUÉ falta (en castellano, sin valores). Lo de la ficha
 * va en `completarDesdeFicha` (lo pone el servidor; si la ficha tampoco lo tiene, corta sin gastar).
 */
export function formularioBotAuto(e: EntradaBotAuto, hoy: Date = new Date()): FormularioBotMoto {
  const faltan: string[] = []
  const completarDesdeFicha: CampoDeFicha[] = []

  if (e.conductorEnOtraFicha) faltan.push('El conductor habitual es otra ficha (o el tomador es una empresa): el bot todavía solo tarifica al propio cliente como conductor')
  if (e.propietarioEnOtraFicha) faltan.push('El propietario es otra ficha: el bot todavía solo tarifica al cliente como propietario')

  const matricula = e.matricula.trim()
  if (matricula === '') faltan.push('Matrícula (el bot de la compañía confirma el coche con ella)')
  else if (!esMatriculaEspanola(matricula)) faltan.push('Matrícula: no tiene formato de matrícula española')

  const dato = (v: DatoPersona, etiqueta: string, campo: CampoDeFicha, valido: (s: string) => boolean): string | null => {
    if (v === null || (typeof v === 'string' && v.trim() === '')) { faltan.push(`${etiqueta} (ni en el formulario ni en la ficha)`); return null }
    if (v === 'ficha') { completarDesdeFicha.push(campo); return null }
    if (!valido(v.trim())) { faltan.push(`${etiqueta}: formato no válido`); return null }
    return v.trim()
  }
  const codigoPostal = dato(e.codigoPostal, 'Código postal de circulación', 'codigoPostal', (s) => /^\d{5}$/.test(s))
  const fechaNacimiento = dato(e.fechaNacimiento, 'Fecha de nacimiento del conductor', 'fechaNacimiento', (s) => ISO.test(s))
  const fechaCarne = dato(e.fechaCarne, 'Fecha del carné B del conductor', 'fechaCarne', (s) => ISO.test(s))

  // Historial (Mapfre «Historial de siniestralidad»): el portal no admite «sin dato» y el bot no lo inventa. Mismo criterio
  // que moto (`historialBot`); lo que no consta se enseña aquí en vez de encolar un trabajo que fallaría.
  const { aniosAseguradoAnterior, siniestrosUltimos5Anios } = historialBot(e)
  if (!e.tieneSeguroActual) faltan.push('Seguro actual: el bot necesita saber si tiene compañía anterior (márcalo y completa años asegurado y siniestros en «Historial y bonificaciones»)')
  else {
    if (aniosAseguradoAnterior === null) faltan.push('Años asegurado en la compañía anterior')
    if (siniestrosUltimos5Anios === null) faltan.push('Siniestros con culpa en los últimos 5 años')
  }

  if (faltan.length) return { ok: false, faltan }

  const marca = e.marca?.trim() ?? ''
  const modelo = e.modelo?.trim() ?? ''
  const version = e.version?.replace(/\s+/g, ' ').trim() ?? ''
  const descripcionOk = version !== '' && version.length <= 200 && !pareceDatoPersonalEnDescripcion(version)
  const riesgo: Record<string, unknown> = {
    ramo: 'auto',
    matricula: normalizarMatricula(matricula),
    ...(codigoPostal ? { codigoPostal } : {}),
    conductor: {
      ...(fechaNacimiento ? { fechaNacimiento } : {}),
      ...(fechaCarne ? { fechaCarne } : {}),
      sexo: e.sexo === 'hombre' || e.sexo === 'mujer' ? e.sexo : null,
    },
    // Tomador = conductor = propietario salvo que haya otra ficha (arriba ya se ha cortado).
    tomadorEsConductor: true,
    tomadorEsPropietario: true,
    aniosAseguradoAnterior,
    siniestrosUltimos5Anios,
    garajeNoche: garajeNocheDeCodigo(e.garaje),
    // Marca/modelo solo si están los dos (nombres de catálogo; ayudan a otros bots a elegir versión). Sin ellos, ausente.
    ...(marca !== '' && modelo !== '' ? { seleccionVehiculo: { marca, modelo, ...(descripcionOk ? { descripcion: version } : {}) } } : {}),
  }

  // Todo lo que viaja desde el navegador pasa por el MISMO validador que asegura (salvo lo de la ficha, que aún no está).
  if (completarDesdeFicha.length === 0) {
    const v = validarFormularioAuto(riesgo, hoy)
    if (!v.ok) return { ok: false, faltan: v.errores }
  }
  return { ok: true, riesgo, completarDesdeFicha }
}
