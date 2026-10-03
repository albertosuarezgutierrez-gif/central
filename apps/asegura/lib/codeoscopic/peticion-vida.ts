// Constructor del cuerpo de una cotización de VIDA (vida temporal, `/term-life/*`
// en el portal de Codeoscopic) para Codeoscopic / Avant2. PURO: entran los datos
// del formulario, sale el JSON que viaja. Sin red, sin BD.
//
// 🚧 **ESQUEMA `TermLifeRisk` SIN VERIFICAR CONTRA EL FABRICANTE.** A diferencia de
// auto/hogar/moto (cuyo `risk` salió del snapshot MHTML del portal, campo por
// campo), de vida/salud/decesos el repo solo sabe que el prefijo `/term-life/*`
// existe y que el índice cuenta **2 operaciones en total** para todo el ramo
// (`docs/CODEOSCOPIC-API-PORTAL.md` § «Segunda pasada»). Cero pólizas en cartera
// de este ramo, así que no hay ni un ejemplo real de qué pide el vendor.
//
// Lo que aquí se manda es el MÍNIMO razonable por analogía con el resto de ramos
// (misma persona en `holder`/`risk.insured`, capital asegurado como único dato
// del riesgo): construido a propósito de Alberto («hazlo con lo que tengas», el
// 07/09/2026), sabiendo que el primer intento real puede devolver un 400 que
// nombre campos que hoy no se mandan — como pasó con `engine` en auto. Ese 400
// se lee, se corrige AQUÍ, y no se reintenta a ciegas.
//
// `POST /insurances` cuesta 0,50€ y NO es idempotente: la validación gratis
// (`revisarDatosVida`) para lo que SÍ se puede comprobar sin llamar al vendor.

import { construirPersona, revisarPersona, type DatosPersona } from './persona.ts'

/** Lo que recoge el formulario. Nombres en castellano: es nuestro dominio. */
export type DatosVida = DatosPersona & {
  // dni, nombre, apellidos, nacimiento, sexo, estado civil, teléfono y
  // residencia vienen de `DatosPersona` (compartido con auto/hogar/moto).

  /** Capital asegurado / suma garantizada, en euros. Único dato del riesgo del
   * que hay certeza conceptual (no de campo): es lo que el cliente quiere que
   * cubra la póliza si fallece dentro del plazo. */
  capital: number

  /** Duración del seguro temporal, en años. ⚠️ NOTA del corredor: NO viaja (`TermLifeRisk_V1` no
   * documenta campo de duración). Se conserva en el tipo solo por compatibilidad con lo ya anotado
   * en el riesgo de la oportunidad; la pantalla ya no lo pide. */
  duracionAnios?: number | null

  /** Profesión del asegurado: código CNO-11 (`GET /economic-occupations`, ej. `2612`). Viaja como
   * `insured.economicOccupation.code`. `null`/ausente = no se sabe: no se manda nada. */
  profesion?: string | null

  /** ¿Fuma? Viaja como `insured.smoker` (boolean). `null`/ausente = no se sabe: no se manda nada
   * (jamás `false` por defecto: un «no fuma» inventado abarata el precio). 🚧 `smoker` es un id de
   * campo de rol documentado; su TIPO (boolean) no lo está: si el vendor contesta otra cosa, se
   * corrige aquí. */
  fumador?: boolean | null

  fechaEfecto: string
  referenciaExterna?: string | null
}

export type ReparoVida = { campo: keyof DatosVida; motivo: string }

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/
const RE_CNO = /^\d{1,4}$/

function texto(v: unknown): boolean {
  return typeof v === 'string' && v.trim() !== ''
}
function numero(v: unknown): boolean {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0
}

/**
 * Comprueba los datos ANTES de gastar los 0,50€. Solo valida lo que se puede
 * validar SIN el contrato del vendor: la persona (compartida) y que el capital
 * y la fecha de efecto tengan forma. No puede validar reglas que no conocemos.
 */
export function revisarDatosVida(d: Partial<DatosVida>): ReparoVida[] {
  const r: ReparoVida[] = []
  const falta = (c: keyof DatosVida, m = 'hace falta para poder cotizar') => r.push({ campo: c, motivo: m })

  for (const x of revisarPersona(d)) r.push(x as ReparoVida)

  if (d.capital === undefined || d.capital === null) falta('capital')
  else if (!numero(d.capital) || d.capital <= 0)
    r.push({ campo: 'capital', motivo: 'tiene que ser un importe en euros mayor que 0' })

  if (!texto(d.fechaEfecto)) falta('fechaEfecto')
  else if (!RE_FECHA.test(String(d.fechaEfecto)))
    r.push({ campo: 'fechaEfecto', motivo: 'la fecha tiene que ser aaaa-mm-dd' })

  if (d.duracionAnios !== undefined && d.duracionAnios !== null && !numero(d.duracionAnios)) {
    r.push({ campo: 'duracionAnios', motivo: 'tiene que ser un número de años' })
  }

  // CNO-11: el catálogo `/economic-occupations` tiene niveles 1-4, o sea códigos de 1 a 4 cifras.
  if (texto(d.profesion) && !RE_CNO.test(String(d.profesion).trim()))
    r.push({ campo: 'profesion', motivo: 'tiene que ser el código CNO-11 de la profesión (de 1 a 4 cifras, p. ej. 2612)' })
  if (d.fumador !== undefined && d.fumador !== null && typeof d.fumador !== 'boolean')
    r.push({ campo: 'fumador', motivo: 'tiene que ser sí o no' })

  return r
}

/**
 * Construye el cuerpo de la petición. `lineaId` viene SIEMPRE de
 * `GET /insurance-lines` (`vidaDisponible()`), nunca se escribe a mano.
 *
 * 🚧 La forma de `risk` es una SUPOSICIÓN (ver cabecera del fichero): un
 * `insured` con la misma proyección de persona que `holder`, y `capital` como
 * único dato del riesgo. Corregir aquí en cuanto el vendor responda con el
 * nombre real de los campos que falten.
 *
 * Lanza si los datos no pasan `revisarDatosVida`.
 */
export function construirPeticionVida(d: DatosVida, lineaId: string): Record<string, unknown> {
  const reparos = revisarDatosVida(d)
  if (reparos.length > 0) {
    throw new Error(
      `codeoscopic_datos_incompletos: ${reparos.map((x) => `${x.campo} (${x.motivo})`).join(' · ')}`,
    )
  }

  const persona = construirPersona(d)

  // Forma de `TermLifeRisk_V1` según la referencia oficial (23/09/2026):
  // `insured` + `deathBenefit` (obligatorio). El capital va en euros como
  // número [Probable: la referencia no fija el tipo]; si el vendor quiere otra
  // forma contesta 400, que no se cobra. La duración NO viaja: no hay campo
  // documentado y mandar uno inventado es lo que tenía bloqueado el ramo.
  // El asegurado lleva además lo que SOLO tiene sentido en él (profesión y tabaco); el tomador
  // (`holder`) sigue siendo la persona básica, así que con estos datos ya no son idénticos.
  const asegurado: Record<string, unknown> = { ...persona }
  if (texto(d.profesion)) asegurado.economicOccupation = { code: String(d.profesion).trim() }
  if (typeof d.fumador === 'boolean') asegurado.smoker = d.fumador
  // 🔒 Peso y altura NO viajan: el vendor los conoce (`weight`, `height` en `person-roles`) pero ni
  // su unidad ni su forma están documentadas. Si el rol los exige, salen como «dato que falta».

  const riesgo: Record<string, unknown> = {
    insured: asegurado,
    deathBenefit: d.capital,
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
