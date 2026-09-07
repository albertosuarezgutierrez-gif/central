// Constructor del cuerpo de una cotización de DECESOS (`/burial/*` en el
// portal de Codeoscopic) para Codeoscopic / Avant2. PURO: entran los datos del
// formulario, sale el JSON que viaja. Sin red, sin BD.
//
// 🚧 **ESQUEMA `BurialRisk` SIN VERIFICAR CONTRA EL FABRICANTE.** El repo solo
// sabe que el prefijo `/burial/*` existe y que el índice cuenta **1+1
// operaciones en total** (Health/Burial) para los dos ramos juntos
// (`docs/CODEOSCOPIC-API-PORTAL.md` § «Segunda pasada»). Cero pólizas en
// cartera de este ramo. Ver la cabecera de `peticion-vida.ts` para el porqué
// completo de por qué se construye igualmente (dictado de Alberto, 07/09/2026).
//
// Un decesos real suele cubrir a TODA la familia, no solo al tomador — pero sin
// el contrato del vendor no se sabe si eso es un array `insuredFamilyMembers`,
// varias pólizas o un capital por cabeza. Se construye aquí SOLO el caso
// individual (el tomador es el único asegurado); la cobertura familiar queda
// como hueco conocido, no como algo resuelto en silencio.
//
// `POST /insurances` cuesta 0,50€ y NO es idempotente.

import { construirPersona, revisarPersona, type DatosPersona } from './persona.ts'

/** Lo que recoge el formulario. Nombres en castellano: es nuestro dominio. */
export type DatosDecesos = DatosPersona & {
  /** Capital / prestación garantizada, en euros. */
  capital: number

  fechaEfecto: string
  referenciaExterna?: string | null
}

export type ReparoDecesos = { campo: keyof DatosDecesos; motivo: string }

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/

function texto(v: unknown): boolean {
  return typeof v === 'string' && v.trim() !== ''
}
function numero(v: unknown): boolean {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0
}

export function revisarDatosDecesos(d: Partial<DatosDecesos>): ReparoDecesos[] {
  const r: ReparoDecesos[] = []
  const falta = (c: keyof DatosDecesos, m = 'hace falta para poder cotizar') => r.push({ campo: c, motivo: m })

  for (const x of revisarPersona(d)) r.push(x as ReparoDecesos)

  if (d.capital === undefined || d.capital === null) falta('capital')
  else if (!numero(d.capital) || d.capital <= 0)
    r.push({ campo: 'capital', motivo: 'tiene que ser un importe en euros mayor que 0' })

  if (!texto(d.fechaEfecto)) falta('fechaEfecto')
  else if (!RE_FECHA.test(String(d.fechaEfecto)))
    r.push({ campo: 'fechaEfecto', motivo: 'la fecha tiene que ser aaaa-mm-dd' })

  return r
}

/**
 * 🚧 La forma de `risk` es una SUPOSICIÓN (ver cabecera del fichero): solo
 * cubre al TOMADOR como único asegurado. Lanza si los datos no pasan
 * `revisarDatosDecesos`.
 */
export function construirPeticionDecesos(d: DatosDecesos, lineaId: string): Record<string, unknown> {
  const reparos = revisarDatosDecesos(d)
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
