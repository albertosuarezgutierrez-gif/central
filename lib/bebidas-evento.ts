// lib/bebidas-evento.ts
// Lógica de cálculo para bebidas en eventos de catering

export type TipoBebida =
  | 'barra_libre_horas'
  | 'por_botellas'
  | 'por_copas'
  | 'incluido_persona'
  | 'descorche'

export interface BebidaBotella {
  id?: string
  nombre: string
  marca?: string
  cantidad: number
  precio_unitario: number
  es_del_cliente: boolean
  orden?: number
}

export interface BebidaEvento {
  id?: string
  menu_id?: string
  tipo: TipoBebida
  nombre: string
  precio_por_persona?: number
  horas_incluidas?: number
  precio_hora_extra?: number
  copas_incluidas?: number
  precio_copa_extra?: number
  precio_descorche?: number
  exceso_contrato: 'facturar_auto' | 'parar_servicio' | 'pactado'
  devolucion_botellas: 'si' | 'no' | 'pactado'
  aplica_a: 'adultos' | 'todos'
  notas?: string
  orden?: number
  activo?: boolean
  botellas?: BebidaBotella[]
}

export interface BloqueBebidaCalculo {
  nombre: string
  subtotal: number
  detalle: string
}

export interface PresupuestoBebidas {
  bloques: BloqueBebidaCalculo[]
  total: number
  notas_exceso: string[]
}

export function calcularBebidas(
  bebidas: BebidaEvento[],
  adultos: number,
  ninos: number = 0,
  horasExtra: number = 0,
  copasExtra: number = 0
): PresupuestoBebidas {
  const bloques: BloqueBebidaCalculo[] = []
  const notas_exceso: string[] = []

  for (const b of bebidas) {
    const comensales = b.aplica_a === 'todos' ? adultos + ninos : adultos
    let subtotal = 0
    let detalle = ''

    switch (b.tipo) {
      case 'incluido_persona': {
        subtotal = (b.precio_por_persona ?? 0) * comensales
        detalle = `${comensales} pers. × ${fmt(b.precio_por_persona)}`
        break
      }
      case 'barra_libre_horas': {
        const base = (b.precio_por_persona ?? 0) * comensales
        const extra = (b.precio_hora_extra ?? 0) * comensales * horasExtra
        subtotal = base + extra
        detalle = `${comensales} pers. × ${fmt(b.precio_por_persona)} (${b.horas_incluidas ?? 0}h incluidas)`
        if (horasExtra > 0) {
          detalle += ` + ${horasExtra}h extra × ${fmt(b.precio_hora_extra)}/pers.`
        }
        if (b.exceso_contrato === 'pactado') {
          notas_exceso.push(`${b.nombre}: hora extra sujeta a acuerdo con el cliente`)
        }
        break
      }
      case 'por_botellas': {
        subtotal = (b.botellas ?? []).reduce(
          (s, bt) => s + bt.cantidad * bt.precio_unitario, 0
        )
        const lineas = (b.botellas ?? [])
          .map(bt => `${bt.cantidad}× ${bt.nombre}${bt.marca ? ` (${bt.marca})` : ''} ${fmt(bt.precio_unitario)}`)
        detalle = lineas.join(' · ')
        if (b.devolucion_botellas === 'pactado') {
          notas_exceso.push(`${b.nombre}: devolución de botellas no abiertas según contrato`)
        } else if (b.devolucion_botellas === 'si') {
          notas_exceso.push(`${b.nombre}: botellas no abiertas se devuelven al cliente`)
        }
        break
      }
      case 'por_copas': {
        subtotal = (b.copas_incluidas ?? 0) * (b.precio_copa_extra ?? 0) + copasExtra * (b.precio_copa_extra ?? 0)
        detalle = `${b.copas_incluidas ?? 0} copas incluidas`
        if (copasExtra > 0) {
          detalle += ` + ${copasExtra} copas extra × ${fmt(b.precio_copa_extra)}`
        }
        if (b.exceso_contrato === 'pactado') {
          notas_exceso.push(`${b.nombre}: copas adicionales sujetas a acuerdo`)
        }
        break
      }
      case 'descorche': {
        const totalBotellas = (b.botellas ?? []).reduce((s, bt) => s + bt.cantidad, 0)
        subtotal = totalBotellas * (b.precio_descorche ?? 0)
        detalle = `${totalBotellas} botellas del cliente × ${fmt(b.precio_descorche)} descorche`
        break
      }
    }

    bloques.push({ nombre: b.nombre, subtotal, detalle })
  }

  return {
    bloques,
    total: bloques.reduce((s, b) => s + b.subtotal, 0),
    notas_exceso,
  }
}

export function calcularPresupuestoEvento(opts: {
  precio_adulto: number
  precio_infantil: number
  precio_servicio_persona?: number
  adultos: number
  ninos: number
  bebidas: BebidaEvento[]
  horasExtra?: number
  copasExtra?: number
}) {
  const {
    precio_adulto, precio_infantil, precio_servicio_persona = 0,
    adultos, ninos, bebidas, horasExtra = 0, copasExtra = 0,
  } = opts

  const food_adultos  = precio_adulto * adultos
  const food_ninos    = precio_infantil * ninos
  const servicio      = precio_servicio_persona * (adultos + ninos)
  const bebidasCalc   = calcularBebidas(bebidas, adultos, ninos, horasExtra, copasExtra)

  return {
    food_adultos,
    food_ninos,
    food_total:  food_adultos + food_ninos,
    bebidas:     bebidasCalc,
    servicio,
    total:       food_adultos + food_ninos + bebidasCalc.total + servicio,
  }
}

function fmt(n?: number): string {
  return `${(n ?? 0).toFixed(2)}€`
}
