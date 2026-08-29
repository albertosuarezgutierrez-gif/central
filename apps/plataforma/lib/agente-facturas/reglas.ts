// Motor de reglas + score de confianza. Solo importa el helper puro de formato.
// Decide si un gasto extraído se imputa solo (auto) o va a la bandeja.
import { eur } from '../dinero.ts'

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
//
// Era 2 hasta el 29/08/2026. Se baja a 1 por decisión de Alberto, y el motivo es que el supuesto
// que sostenía el 2 dejó de ser cierto: se diseñó cuando NO existía la pantalla de la bandeja y el
// refuerzo podía venir de caminos automáticos, donde exigir dos coincidencias protegía de aprender
// de un acierto casual. Desde que la bandeja tiene pantalla, cada `vistas` es un clic suyo — pedir
// dos decisiones humanas idénticas no añade seguridad, solo repite el trabajo que la pantalla
// venía a quitar. Comprobado en su bandeja: todas las reglas creadas ese día se quedaron en
// `vistas: 1`, así que la siguiente factura del mismo proveedor volvía a la bandeja.
export const MIN_VISTAS = 1

// Cuánto puede alejarse el importe del ya confirmado antes de mandar la factura a la bandeja.
//
// Era ±10 %, y ese margen está pensado para un recibo fijo (el alquiler, la comunidad). Los
// proveedores que llenan esta bandeja no lo son: Anthropic, Vercel, IONOS o Fly.io facturan
// suscripción + consumo, y un mes pueden ser 6 € y otro 180 €. Con ±10 % la regla existía pero no
// se aplicaba nunca, que es lo que Alberto veía como «no aprende».
//
// El factor multiplicativo mantiene lo único que la banda debe proteger: que un cargo
// DESPROPORCIONADO no se impute solo sin que nadie lo mire (900 € donde siempre hubo 20 € sigue
// yendo a la bandeja). Cazar subidas de precio del 15 % no es trabajo de esta guarda — de eso se
// ocupan los vigilantes de la tarjeta.
export const FACTOR_BANDA = 5

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
  const base = Number(regla.importe_esperado ?? total)
  const min = regla.importe_min ?? base / FACTOR_BANDA
  const max = regla.importe_max ?? base * FACTOR_BANDA
  if (!(total > 0) || total < min || total > max)
    return {
      decision: 'bandeja', confianza: 0.5,
      propiedad: regla.propiedad, categoria: regla.categoria,
      motivo: `Importe ${eur(total)} fuera de banda (${min}-${max})`,
    }

  return { decision: 'auto', confianza: 0.9, propiedad: regla.propiedad, categoria: regla.categoria }
}
