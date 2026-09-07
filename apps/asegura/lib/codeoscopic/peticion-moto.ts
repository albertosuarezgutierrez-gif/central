// Constructor del cuerpo de una cotización de MOTO para Codeoscopic / Avant2.
// PURO: entran los datos de la ficha, sale el JSON que viaja. Sin red, sin BD.
//
// `MotorcycleRisk` es `CarRisk` con cuatro diferencias (docs/CODEOSCOPIC-API-PORTAL.md
// § «El ramo MOTO, contrato completo»): `drivingExperience` es OBLIGATORIO y no
// existe en auto; `previousMotorcycle.code` es obligatorio si esa experiencia es
// «otra moto»; no existen `secondaryDriver` ni `lightTrailer`. Todo lo demás —
// persona, vehículo, circulación, historial— es literalmente lo mismo, así que
// este fichero es un espejo de `peticion-auto.ts` con esas cuatro diferencias.
//
// `POST /insurances` cuesta 0,50€ y NO es idempotente: cada regla que sabemos se
// comprueba ANTES de gastar, no después.

import { construirPersona, revisarPersona, type DatosPersona } from './persona.ts'

export type ExperienciaConduccion = 'ThisMotorcycle' | 'OtherMotorcycle'

/** Lo que recoge el formulario. Nombres en castellano: es nuestro dominio. */
export type DatosMoto = DatosPersona & {
  // dni, nombre, apellidos, nacimiento, sexo, estado civil, teléfono y
  // residencia vienen de `DatosPersona` (compartido con auto y hogar).
  fechaCarnet: string

  // ── Vehículo ──
  codigoVehiculo: string // el código Base7 de la VERSIÓN, del catálogo
  matricula: string
  fechaMatriculacion: string
  fechaCompra?: string | null
  kmAnuales: number

  // ── Circulación ──
  cpCirculacion: string
  municipioCirculacionId: number
  garaje: string // id del catálogo, compartido con auto

  // ── Específico de moto: EXIGIDO por el vendor, no existe en auto ──
  experienciaConduccion: string // id de `/motorcycle/driving-experience-options`
  motoAnteriorCodigo?: string | null // `previousMotorcycle.code`, obligatorio si experienciaConduccion = 'OtherMotorcycle'

  // ── Historial ──
  aseguradoAntes?: boolean
  companiaAnteriorCodigo?: string | null // código DGS
  polizaAnterior?: string | null
  aniosAsegurado?: number | null
  aniosEnCompania?: number | null
  aniosSinSiniestros?: number | null
  siniestrosUltimos5?: number | null

  // ── Cotización ──
  fechaEfecto: string
  referenciaExterna?: string | null
}

/** Un problema concreto del formulario, señalando el campo. */
export type ReparoMoto = { campo: keyof DatosMoto; motivo: string }

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/

/**
 * Comprueba los datos ANTES de gastar los 0,50€.
 *
 * Devuelve la lista de reparos: vacía significa que se puede cotizar. No lanza,
 * porque la UI tiene que poder pintar TODOS los problemas a la vez y no uno a uno.
 */
export function revisarDatosMoto(d: Partial<DatosMoto>): ReparoMoto[] {
  const r: ReparoMoto[] = []
  const falta = (c: keyof DatosMoto, m = 'hace falta para poder cotizar') => r.push({ campo: c, motivo: m })

  // ── La persona: reglas compartidas con auto y hogar ──
  for (const x of revisarPersona(d)) r.push(x as ReparoMoto)

  // ── Obligatorios sin matiz ──
  for (const c of ['codigoVehiculo', 'matricula', 'garaje', 'experienciaConduccion'] as const) {
    if (!texto(d[c])) falta(c)
  }
  for (const c of ['fechaCarnet', 'fechaMatriculacion', 'fechaEfecto'] as const) {
    if (!texto(d[c])) falta(c)
    else if (!RE_FECHA.test(String(d[c]))) r.push({ campo: c, motivo: 'la fecha tiene que ser aaaa-mm-dd' })
  }

  if (d.kmAnuales === undefined || d.kmAnuales === null) falta('kmAnuales')
  else if (!Number.isFinite(d.kmAnuales) || d.kmAnuales < 0)
    r.push({ campo: 'kmAnuales', motivo: 'tiene que ser un número de kilómetros' })

  // ── Circulación: el municipio es un ID del catálogo, no un nombre ──
  if (!texto(d.cpCirculacion)) falta('cpCirculacion')
  if (!numero(d.municipioCirculacionId))
    falta('municipioCirculacionId', 'hay que resolver el municipio por código postal antes de cotizar')

  // ── Específico de moto: si la experiencia es «otra moto», hace falta su código ──
  if (d.experienciaConduccion === 'OtherMotorcycle' && !texto(d.motoAnteriorCodigo)) {
    falta('motoAnteriorCodigo', 'con experiencia en OTRA moto, el vendor exige el código de esa moto')
  }

  // ── Historial: todo condicional al interruptor ──
  if (d.aseguradoAntes) {
    if (!texto(d.companiaAnteriorCodigo)) falta('companiaAnteriorCodigo')
    if (!texto(d.polizaAnterior)) falta('polizaAnterior')
    for (const c of ['aniosAsegurado', 'aniosEnCompania', 'aniosSinSiniestros'] as const) {
      if (!numero(d[c])) falta(c)
    }
    if (
      numero(d.aniosSinSiniestros) &&
      d.aniosSinSiniestros! < 5 &&
      d.aniosSinSiniestros !== d.aniosAsegurado &&
      !numero(d.siniestrosUltimos5) &&
      d.siniestrosUltimos5 !== 0
    ) {
      r.push({
        campo: 'siniestrosUltimos5',
        motivo:
          'con menos de 5 años sin siniestros (y distintos de los años asegurado), la compañía exige ' +
          'cuántos hubo en los últimos 5 años',
      })
    }
  }

  return r
}

function texto(v: unknown): boolean {
  return typeof v === 'string' && v.trim() !== ''
}
function numero(v: unknown): boolean {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0
}

/**
 * Construye el cuerpo `CreateInsuranceRequest_V1` de moto.
 *
 * `lineaId` viene SIEMPRE de `GET /insurance-lines` (`motoDisponible()`), nunca
 * se escribe a mano: adivinar el id del ramo es un 400 pagado en vano (mismo
 * criterio que hogar, que tampoco hardcodea el suyo).
 *
 * Lanza si los datos no pasan `revisarDatosMoto`.
 */
export function construirPeticionMoto(d: DatosMoto, lineaId: string): Record<string, unknown> {
  const reparos = revisarDatosMoto(d)
  if (reparos.length > 0) {
    throw new Error(
      `codeoscopic_datos_incompletos: ${reparos.map((x) => `${x.campo} (${x.motivo})`).join(' · ')}`,
    )
  }

  // 🚨 LA MISMA persona, proyectada IDÉNTICA en holder/owner/primaryDriver — ver
  // el motivo en `peticion-auto.ts`.
  const persona = construirPersona(d, { fechaCarnet: d.fechaCarnet })

  const riesgo: Record<string, unknown> = {
    vehicle: { code: d.codigoVehiculo },
    registrationPlate: d.matricula.toUpperCase().replace(/\s/g, ''),
    registrationDate: d.fechaMatriculacion,
    purchaseDate: d.fechaCompra || d.fechaMatriculacion,
    kilometersPerYear: d.kmAnuales,
    circulationAddress: {
      postalCode: d.cpCirculacion,
      town: { id: d.municipioCirculacionId },
    },
    garageType: { id: d.garaje },
    owner: persona,
    primaryDriver: persona,
    drivingExperience: { id: d.experienciaConduccion },
    previouslyInsured: d.aseguradoAntes ?? false,
  }

  if (d.experienciaConduccion === 'OtherMotorcycle') {
    riesgo.previousMotorcycle = { code: d.motoAnteriorCodigo }
  }

  if (d.aseguradoAntes) {
    const previa: Record<string, unknown> = {
      policyNumber: d.polizaAnterior,
      previousCompany: { code: d.companiaAnteriorCodigo },
      registrationPlate: riesgo.registrationPlate,
      totalYearsInsured: d.aniosAsegurado,
      yearsInPreviousCompany: d.aniosEnCompania,
      yearsWithoutAccidents: d.aniosSinSiniestros,
    }
    if (exigeDetalleDeSiniestrosMoto(d)) previa.lastFiveYearsAccidents = d.siniestrosUltimos5
    riesgo.previousInsurance = previa
  }

  const cuerpo: Record<string, unknown> = {
    insuranceLine: { id: lineaId },
    effectiveDate: d.fechaEfecto,
    holder: persona,
    risk: riesgo,
  }
  if (texto(d.referenciaExterna)) cuerpo.externalId = d.referenciaExterna

  return cuerpo
}

/** ¿El vendor exige el detalle de siniestros de los últimos 5 años? */
export function exigeDetalleDeSiniestrosMoto(d: Partial<DatosMoto>): boolean {
  if (!d.aseguradoAntes) return false
  if (!numero(d.aniosSinSiniestros)) return false
  return d.aniosSinSiniestros! < 5 && d.aniosSinSiniestros !== d.aniosAsegurado
}
