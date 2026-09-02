// Constructor del cuerpo de una cotización de AUTO para Codeoscopic / Avant2.
// PURO: entran los datos de la ficha, sale el JSON que viaja. Sin red, sin BD.
//
// ─── Por qué esto es una pieza aparte y probada ─────────────────────────────
// `POST /insurances` cuesta 0,50€ y NO es idempotente: si el cuerpo va mal, el
// vendor lo rechaza (400) y hay que volver a pagar para reintentar. Así que cada
// regla que sabemos se comprueba ANTES de gastar, no después.
//
// Las reglas no son adivinadas: salen del builder de Manuel, verificado por él
// contra el entorno real, y están transcritas en docs/CODEOSCOPIC-TRASPASO-MANUEL.md §3.

import { construirPersona, revisarPersona, type DatosPersona } from './persona.ts'

/** Lo que recoge el formulario. Nombres en castellano: es nuestro dominio. */
export type DatosAuto = DatosPersona & {
  // ── Persona (va tres veces: tomador, propietario y conductor) ──
  // dni, nombre, apellidos, nacimiento, sexo, estado civil, teléfono y
  // residencia vienen de `DatosPersona` (compartido con hogar).
  fechaCarnet: string

  // ── Vehículo ──
  codigoVehiculo: string // el código Base7 de la VERSIÓN, del catálogo
  matricula: string
  fechaMatriculacion: string
  fechaCompra?: string | null
  kmAnuales: number
  remolqueLigero?: boolean

  // ── Circulación ──
  cpCirculacion: string
  municipioCirculacionId: number
  garaje: string // id del catálogo

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
export type Reparo = { campo: keyof DatosAuto; motivo: string }

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/

/**
 * Comprueba los datos ANTES de gastar los 0,50€.
 *
 * Devuelve la lista de reparos: vacía significa que se puede cotizar. No lanza,
 * porque la UI tiene que poder pintar TODOS los problemas a la vez y no uno a uno.
 */
export function revisarDatosAuto(d: Partial<DatosAuto>): Reparo[] {
  const r: Reparo[] = []
  const falta = (c: keyof DatosAuto, m = 'hace falta para poder cotizar') => r.push({ campo: c, motivo: m })

  // ── La persona: reglas compartidas con hogar ──
  for (const x of revisarPersona(d)) r.push(x)

  // ── Obligatorios sin matiz ──
  for (const c of ['codigoVehiculo', 'matricula', 'garaje'] as const) {
    if (!texto(d[c])) falta(c)
  }
  for (const c of ['fechaCarnet', 'fechaMatriculacion', 'fechaEfecto'] as const) {
    if (!texto(d[c])) falta(c)
    else if (!RE_FECHA.test(String(d[c]))) r.push({ campo: c, motivo: 'la fecha tiene que ser aaaa-mm-dd' })
  }

  // Kilómetros: obligatorio para el vendor aunque parezca un detalle.
  if (d.kmAnuales === undefined || d.kmAnuales === null) falta('kmAnuales')
  else if (!Number.isFinite(d.kmAnuales) || d.kmAnuales < 0)
    r.push({ campo: 'kmAnuales', motivo: 'tiene que ser un número de kilómetros' })

  // ── Circulación: el municipio es un ID del catálogo, no un nombre ──
  if (!texto(d.cpCirculacion)) falta('cpCirculacion')
  if (!numero(d.municipioCirculacionId))
    falta('municipioCirculacionId', 'hay que resolver el municipio por código postal antes de cotizar')

  // ── Historial: todo condicional al interruptor ──
  if (d.aseguradoAntes) {
    if (!texto(d.companiaAnteriorCodigo)) falta('companiaAnteriorCodigo')
    if (!texto(d.polizaAnterior)) falta('polizaAnterior')
    for (const c of ['aniosAsegurado', 'aniosEnCompania', 'aniosSinSiniestros'] as const) {
      if (!numero(d[c])) falta(c)
    }

    // La regla más fácil de incumplir sin enterarse, y la que devuelve un 400
    // que ya se ha pagado: si no llegan a 5 años limpios y ese número no coincide
    // con los años asegurado, el vendor EXIGE el detalle de siniestros.
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
 * Construye el cuerpo `CreateInsuranceRequest_V1`.
 *
 * Lanza si los datos no pasan `revisarDatosAuto`: preferimos fallar aquí, gratis,
 * a mandar una petición que el vendor rechazará después de facturarla.
 */
export function construirPeticionAuto(d: DatosAuto): Record<string, unknown> {
  const reparos = revisarDatosAuto(d)
  if (reparos.length > 0) {
    throw new Error(
      `codeoscopic_datos_incompletos: ${reparos.map((x) => `${x.campo} (${x.motivo})`).join(' · ')}`,
    )
  }

  // 🚨 LA MISMA persona, proyectada IDÉNTICA en los tres papeles. El vendor cruza
  // por DNI y rechaza con «Two persons have been declared with the same
  // identification by different data» si un solo campo difiere entre ellos — y
  // tampoco deja omitir ninguno. Por eso se construye UNA vez y se reutiliza el
  // mismo objeto, en lugar de escribirlo tres veces y confiar en no equivocarse.
  const persona = construirPersona(d, { fechaCarnet: d.fechaCarnet })

  const riesgo: Record<string, unknown> = {
    vehicle: { code: d.codigoVehiculo },
    registrationPlate: d.matricula.toUpperCase().replace(/\s/g, ''),
    registrationDate: d.fechaMatriculacion,
    // El vendor la exige. Por defecto, la de matriculación: es lo cierto salvo
    // que el coche sea de segunda mano, y en ese caso lo dice el formulario.
    purchaseDate: d.fechaCompra || d.fechaMatriculacion,
    kilometersPerYear: d.kmAnuales,
    circulationAddress: {
      postalCode: d.cpCirculacion,
      town: { id: d.municipioCirculacionId },
    },
    garageType: { id: d.garaje },
    lightTrailer: d.remolqueLigero ?? false,
    owner: persona,
    primaryDriver: persona,
    previouslyInsured: d.aseguradoAntes ?? false,
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
    if (exigeDetalleDeSiniestros(d)) previa.lastFiveYearsAccidents = d.siniestrosUltimos5
    riesgo.previousInsurance = previa
  }

  const cuerpo: Record<string, unknown> = {
    insuranceLine: { id: 'Car' },
    effectiveDate: d.fechaEfecto,
    holder: persona,
    risk: riesgo,
  }
  // Nuestra referencia, para poder casar después la cotización con el cliente.
  if (texto(d.referenciaExterna)) cuerpo.externalId = d.referenciaExterna

  return cuerpo
}

/** ¿El vendor exige el detalle de siniestros de los últimos 5 años? */
export function exigeDetalleDeSiniestros(d: Partial<DatosAuto>): boolean {
  if (!d.aseguradoAntes) return false
  if (!numero(d.aniosSinSiniestros)) return false
  return d.aniosSinSiniestros! < 5 && d.aniosSinSiniestros !== d.aniosAsegurado
}
