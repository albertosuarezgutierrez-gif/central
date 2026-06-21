// ────────────────────────────────────────────────────────────────────────────
// Checklist — PURO. Deriva la lista accionable de documentos por sobre a partir
// de la ficha. Determinista: misma ficha → mismo checklist.
// ────────────────────────────────────────────────────────────────────────────

import type { FichaConcurso, ItemChecklist, TipoSobre } from './types'

/** Orden canónico de los sobres en la presentación. */
const ORDEN_SOBRE: Record<TipoSobre, number> = { administrativo: 0, tecnico: 1, economico: 2 }

/**
 * Documentos administrativos que casi todo procedimiento abierto exige y que el
 * pliego a veces no enumera explícitamente. Se añaden si faltan (no se duplican).
 */
const BASE_ADMINISTRATIVO: { nombre: string; modelo?: string }[] = [
  { nombre: 'Declaración responsable (DEUC o modelo del pliego)', modelo: 'DEUC' },
  { nombre: 'Certificado de estar al corriente con la Agencia Tributaria (AEAT)' },
  { nombre: 'Certificado de estar al corriente con la Seguridad Social' },
]

function clave(nombre: string): string {
  return nombre.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Construye el checklist por sobre. Incluye los documentos detectados en el
 * pliego más los administrativos base que no estuvieran ya presentes. Si hay
 * criterios de juicio de valor, añade el recordatorio de la memoria técnica.
 */
export function derivarChecklist(ficha: FichaConcurso): ItemChecklist[] {
  const items: ItemChecklist[] = []
  const vistos = new Set<string>()

  const add = (sobre: TipoSobre, documento: string, obligatorio: boolean, modelo?: string) => {
    const k = `${sobre}|${clave(documento)}`
    if (vistos.has(k)) return
    vistos.add(k)
    const item: ItemChecklist = { sobre, documento, obligatorio, hecho: false }
    if (modelo) item.modelo = modelo
    items.push(item)
  }

  // 1) Documentos extraídos del pliego.
  for (const d of ficha.documentos) add(d.sobre, d.nombre, d.obligatorio, d.modelo)

  // 2) Administrativos base (si el pliego no los enumeró).
  for (const b of BASE_ADMINISTRATIVO) add('administrativo', b.nombre, true, b.modelo)

  // 3) Memoria técnica: si hay criterios de juicio de valor y no se listó ya.
  const hayJuicioValor = ficha.criterios.some(c => c.tipo === 'juicio_valor')
  if (hayJuicioValor) add('tecnico', 'Memoria técnica (criterios de juicio de valor)', true)

  // 4) Oferta económica: si hay criterio económico/automático y no se listó.
  const hayEconomico = ficha.criterios.some(c => c.sobre === 'economico' || c.tipo === 'automatico')
  if (hayEconomico) add('economico', 'Oferta económica (modelo del pliego)', true)

  // Orden estable: por sobre y, dentro, obligatorios primero.
  return items.sort((a, b) =>
    ORDEN_SOBRE[a.sobre] - ORDEN_SOBRE[b.sobre] ||
    Number(b.obligatorio) - Number(a.obligatorio),
  )
}
