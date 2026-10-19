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
import {
  AMBITOS_CIRCULACION, AMBITO_CIRCULACION_POR_DEFECTO, CLASES_PERMISO, CLASE_PERMISO_POR_DEFECTO, MAX_COMPANIA_ANTERIOR, USOS_VEHICULO, USO_VEHICULO_POR_DEFECTO,
  esMatriculaEspanola, normalizarMatricula, pareceDatoPersonalEnDescripcion, validarFormularioAuto,
} from '@central/module-tarificacion'
import { historialBot, type CampoDeFicha, type DatoPersona, type FormularioBotMoto } from './tarificador-moto-formulario.ts'
import { duermeEnGaraje, GARAJES_CONOCIDOS } from '@central/module-seguros/garajes'

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
  /**
   * Mat-select del paso 2 de Mapfre (14/10/2026). Claves cerradas de `module-tarificacion` (uso `particular`; ámbito `espana`;
   * permiso `b`/`a`/`a1`/`a2`). Ausente o vacío = el defecto de coche (particular / espana / b): la ficha del vehículo y la del
   * riesgo NO guardan uso, ámbito ni clase del permiso, así que no hay de dónde leerlos (no se inventa nada personal).
   */
  usoVehiculo?: string | null
  ambitoCirculacion?: string | null
  clasePermiso?: string | null
  /** Nombre de la compañía anterior tal como lo ve el corredor (catálogo o texto libre). Vacío = no consta (el bot lo deja como hueco). */
  companiaAnterior?: string | null
  /**
   * 15/10/2026 — lo que Allianz Turismos SUPONE si no viene (y lo declara junto al precio): 1ª matriculación del vehículo (ISO),
   * vencimiento de la póliza actual (ISO) y si hay conductor ocasional (`true` ficha · `false` confirmado que no · `null` sin
   * preguntar). Ausente o sin forma válida = no viaja (el bot supone y lo dice). Nunca bloquea el botón.
   */
  fechaMatriculacion?: string | null
  fechaVencimiento?: string | null
  conductorOcasional?: boolean | null
}

/** Opciones de los selectores de la pantalla (etiqueta para la persona, clave para el bot). */
export const OPCIONES_USO_VEHICULO: readonly { valor: string; etiqueta: string }[] = [{ valor: 'particular', etiqueta: 'Particular' }]
export const OPCIONES_AMBITO_CIRCULACION: readonly { valor: string; etiqueta: string }[] = [{ valor: 'espana', etiqueta: 'España' }]
export const OPCIONES_CLASE_PERMISO: readonly { valor: string; etiqueta: string }[] = [
  { valor: 'b', etiqueta: 'B · turismos' }, { valor: 'a', etiqueta: 'A · motos' }, { valor: 'a1', etiqueta: 'A1 · motos hasta 125 cc' }, { valor: 'a2', etiqueta: 'A2 · motos hasta 35 kW' },
]

/** Valor del selector → clave cerrada (o el defecto si viene vacío). `undefined` = valor que no está en la lista. PURA. */
export function claveCerrada(v: string | null | undefined, lista: readonly string[], porDefecto: string): string | undefined {
  const k = typeof v === 'string' ? v.trim().toLowerCase() : ''
  if (k === '') return porDefecto
  return lista.includes(k) ? k : undefined
}

/**
 * Código de garaje → `garajeNoche` del formulario. Calle / vía pública → `false`; garaje individual, comunitario o «Garaje» →
 * `true`; vacío o un código que no se ha visto → `null` (no se traduce a ojo: un garaje mal traducido es un precio falso).
 * La tabla es la ÚNICA del monorepo (`@central/module-seguros/garajes`, 15/10/2026).
 */
export function garajeNocheDeCodigo(codigo: string | null | undefined): boolean | null {
  return duermeEnGaraje(codigo)
}

/**
 * Código de garaje → `tipoGaraje` del formulario (15/10/2026): calle · colectivo (comunitario) · individual. «Garaje» a secas,
 * vacío o un código no visto → `null` (el bot supone «colectivo» y lo DECLARA; aquí no se traduce a ojo). Misma tabla única.
 */
export function tipoGarajeDeCodigo(codigo: string | null | undefined): 'calle' | 'colectivo' | 'individual' | null {
  const clase = GARAJES_CONOCIDOS[typeof codigo === 'string' ? codigo.trim() : '']?.clase
  return clase === 'calle' ? 'calle' : clase === 'comunitario' ? 'colectivo' : clase === 'individual' ? 'individual' : null
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

  // Historial: mismo criterio que moto (`historialBot`). Lo que no consta viaja `null` y NO bloquea (18/10/2026, «supuesto favorable
  // en todo»): el checklist lo pinta «supuesto» (`supuestosFavorablesPara`) y el bot lo declara en «Precio con supuestos». Nunca se
  // escribe un número inventado en el riesgo. Solo «¿tiene seguro actual?» sigue pidiéndose: sin él no hay compañía anterior.
  const { aniosAseguradoAnterior, siniestrosUltimos5Anios } = historialBot(e)
  if (!e.tieneSeguroActual) faltan.push('Seguro actual: el bot necesita saber si tiene compañía anterior (márcalo y completa años asegurado y siniestros en «Historial y bonificaciones»)')

  const usoVehiculo = claveCerrada(e.usoVehiculo, USOS_VEHICULO, USO_VEHICULO_POR_DEFECTO)
  const ambitoCirculacion = claveCerrada(e.ambitoCirculacion, AMBITOS_CIRCULACION, AMBITO_CIRCULACION_POR_DEFECTO)
  const clasePermiso = claveCerrada(e.clasePermiso, CLASES_PERMISO, CLASE_PERMISO_POR_DEFECTO)
  if (usoVehiculo === undefined) faltan.push('Uso del vehículo: valor no válido')
  if (ambitoCirculacion === undefined) faltan.push('Ámbito de circulación: valor no válido')
  if (clasePermiso === undefined) faltan.push('Clase del permiso: valor no válido')
  // La compañía anterior solo tiene sentido con seguro actual; sin nombre (o demasiado largo) no viaja (no consta).
  const companiaTxt = e.tieneSeguroActual ? (e.companiaAnterior ?? '').replace(/\s+/g, ' ').trim() : ''
  const companiaAnterior = companiaTxt !== '' && companiaTxt.length <= MAX_COMPANIA_ANTERIOR ? companiaTxt : null
  // Supuestos de Allianz Turismos: solo viajan si tienen forma válida (si no, el bot supone y lo declara; nunca bloquea).
  const isoValida = (v: string | null | undefined): string | null => {
    const t = typeof v === 'string' ? v.trim().slice(0, 10) : ''
    return ISO.test(t) && new Date(`${t}T00:00:00Z`).toISOString().slice(0, 10) === t ? t : null
  }
  const fechaMatriculacion = isoValida(e.fechaMatriculacion)
  const fechaVencimiento = isoValida(e.fechaVencimiento)
  const tipoGaraje = tipoGarajeDeCodigo(e.garaje)

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
    usoVehiculo,
    ambitoCirculacion,
    clasePermiso,
    ...(companiaAnterior !== null ? { companiaAnterior } : {}),
    ...(fechaMatriculacion !== null && fechaMatriculacion <= hoy.toISOString().slice(0, 10) ? { fechaMatriculacion } : {}),
    ...(fechaVencimiento !== null ? { fechaVencimiento } : {}),
    ...(tipoGaraje !== null ? { tipoGaraje } : {}),
    ...(typeof e.conductorOcasional === 'boolean' ? { conductorOcasional: e.conductorOcasional } : {}),
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
