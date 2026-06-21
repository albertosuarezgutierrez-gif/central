// Motor de reglas + score de confianza. Módulo PURO (sin imports).
// Decide si un gasto extraído se imputa solo (auto) o va a la bandeja.

export interface Regla {
  fingerprint: string
  propiedad?: string | null
  categoria?: string | null
  iva_porcentaje?: number | null
  irpf_porcentaje?: number | null
  importe_esperado?: number | null
  importe_min?: number | null
  importe_max?: number | null
  vistas: number
  activa: boolean
}

export interface Extraido {
  total?: number | null
  base_imponible?: number | null
  iva?: number | null
  irpf?: number | null
}

export interface Veredicto {
  decision: 'auto' | 'bandeja'
  confianza: number
  propiedad?: string | null
  categoria?: string | null
  motivo?: string
}

// Nº de confirmaciones del usuario antes de fiarse de una regla para auto-imputar.
export const MIN_VISTAS = 2

export function evaluar(g: Extraido, regla: Regla | null): Veredicto {
  if (!regla || !regla.activa)
    return { decision: 'bandeja', confianza: 0.3, motivo: 'Proveedor nuevo, sin regla aprendida' }

  if (regla.vistas < MIN_VISTAS)
    return {
      decision: 'bandeja', confianza: 0.5,
      propiedad: regla.propiedad, categoria: regla.categoria,
      motivo: 'Regla aún sin historial confirmado',
    }

  const total = Number(g.total ?? 0)
  const min = regla.importe_min ?? Number(regla.importe_esperado ?? total) * 0.9
  const max = regla.importe_max ?? Number(regla.importe_esperado ?? total) * 1.1
  if (!(total > 0) || total < min || total > max)
    return {
      decision: 'bandeja', confianza: 0.5,
      propiedad: regla.propiedad, categoria: regla.categoria,
      motivo: `Importe ${total}€ fuera de banda (${min}-${max})`,
    }

  return { decision: 'auto', confianza: 0.9, propiedad: regla.propiedad, categoria: regla.categoria }
}
