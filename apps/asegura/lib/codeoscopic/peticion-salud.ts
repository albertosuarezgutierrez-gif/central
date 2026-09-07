// Constructor del cuerpo de una cotización de SALUD (`/health/*` en el portal
// de Codeoscopic) para Codeoscopic / Avant2. PURO: entran los datos del
// formulario, sale el JSON que viaja. Sin red, sin BD.
//
// 🚧 **ESQUEMA `HealthRisk` SIN VERIFICAR CONTRA EL FABRICANTE.** El repo solo
// sabe que el prefijo `/health/*` existe y que el índice cuenta **1+1
// operaciones en total** (Health/Burial) para los dos ramos juntos
// (`docs/CODEOSCOPIC-API-PORTAL.md` § «Segunda pasada»). Cero pólizas en
// cartera de este ramo. Ver la cabecera de `peticion-vida.ts` para el porqué
// completo de por qué se construye igualmente (dictado de Alberto, 07/09/2026).
//
// Salud no encaja tan bien en «capital asegurado» como vida/decesos (un seguro
// de salud es una modalidad/plan, no una suma a pagar), pero sin catálogo de
// modalidades que ofrecer en un desplegable, `capital` es el único dato
// numérico con el que se puede construir un formulario mínimo hoy. El primer
// intento real dirá qué campo falta de verdad.
//
// `POST /insurances` cuesta 0,50€ y NO es idempotente.

import { construirPersona, revisarPersona, type DatosPersona } from './persona.ts'

/** Lo que recoge el formulario. Nombres en castellano: es nuestro dominio. */
export type DatosSalud = DatosPersona & {
  /** 🚧 Capital / importe de referencia de la cobertura. Ver cabecera: salud no
   * es naturalmente un «capital», pero es el único dato mínimo disponible hoy. */
  capital: number

  /** Texto libre del corredor sobre la modalidad deseada. NO viaja al vendor
   * (no hay catálogo confirmado de modalidades): es una nota para el humano. */
  modalidadDeseada?: string | null

  fechaEfecto: string
  referenciaExterna?: string | null
}

export type ReparoSalud = { campo: keyof DatosSalud; motivo: string }

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/

function texto(v: unknown): boolean {
  return typeof v === 'string' && v.trim() !== ''
}
function numero(v: unknown): boolean {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0
}

export function revisarDatosSalud(d: Partial<DatosSalud>): ReparoSalud[] {
  const r: ReparoSalud[] = []
  const falta = (c: keyof DatosSalud, m = 'hace falta para poder cotizar') => r.push({ campo: c, motivo: m })

  for (const x of revisarPersona(d)) r.push(x as ReparoSalud)

  if (d.capital === undefined || d.capital === null) falta('capital')
  else if (!numero(d.capital) || d.capital <= 0)
    r.push({ campo: 'capital', motivo: 'tiene que ser un importe en euros mayor que 0' })

  if (!texto(d.fechaEfecto)) falta('fechaEfecto')
  else if (!RE_FECHA.test(String(d.fechaEfecto)))
    r.push({ campo: 'fechaEfecto', motivo: 'la fecha tiene que ser aaaa-mm-dd' })

  return r
}

/**
 * 🚧 La forma de `risk` es una SUPOSICIÓN (ver cabecera del fichero).
 * `modalidadDeseada` NUNCA viaja al vendor: no hay campo confirmado donde
 * ponerla, así que mandarla sería inventar un nombre de campo más.
 *
 * Lanza si los datos no pasan `revisarDatosSalud`.
 */
export function construirPeticionSalud(d: DatosSalud, lineaId: string): Record<string, unknown> {
  const reparos = revisarDatosSalud(d)
  if (reparos.length > 0) {
    throw new Error(
      `codeoscopic_datos_incompletos: ${reparos.map((x) => `${x.campo} (${x.motivo})`).join(' · ')}`,
    )
  }

  const persona = construirPersona(d)

  const riesgo: Record<string, unknown> = {
    insured: persona,
    capital: d.capital,
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
