// Cálculo de presupuesto del taller: paquetes × tipo de vehículo × precio hora configurable, piezas,
// aceite a granel en mililitros, IVA POR LÍNEA y redondeo a céntimos. Todo sale de `ConfigTaller`.
//
// Por qué no se usa `@central/module-presupuestos`: trabaja en euros con float + `round2` y no conoce el IVA;
// cambiarle la semántica rompe eventos/alquiler/transporte. Aquí todo es entero (céntimos, pb, minutos, ml).
//
// Regla «null ≠ 0»: si falta un dato necesario (tipo de vehículo, litros, aceite, IVA) NO se calcula con 0:
// se devuelve error y la pantalla lo pide.

import { PUNTOS_BASICOS_100, type ConfigTaller, type TipoLinea } from './config.ts'
import { dividirRedondeando } from './dinero.ts'

const MINUTOS_HORA = 60
const ML_LITRO = 1000

export type LineaSolicitada =
  | { tipo: 'paquete'; paqueteCodigo: string; aceiteCodigo?: string | null; litrosMl?: number | null }
  | { tipo: 'mano_obra'; descripcion: string; minutos: number; ivaCodigo?: string }
  | { tipo: 'pieza'; descripcion: string; referencia?: string; cantidad: number; precioUnitarioCent: number; ivaCodigo?: string }
  | { tipo: 'granel'; aceiteCodigo: string; litrosMl: number | null; ivaCodigo?: string }
  | { tipo: 'otro'; descripcion: string; cantidad: number; precioUnitarioCent: number; ivaCodigo?: string }

export interface EntradaPresupuesto {
  /** Código de `config.tiposVehiculo`. Sin tipo no hay precio de paquete: nunca se asume «turismo». */
  tipoVehiculo: string | null
  lineas: LineaSolicitada[]
}

export interface LineaCalculada {
  tipo: TipoLinea
  descripcion: string
  /** Paquete del que sale la línea (o null si es manual). */
  paqueteCodigo: string | null
  referencia?: string
  /** minutos (mano_obra), ml (granel) o unidades (pieza/otro). */
  cantidad: number
  unidad: 'min' | 'ml' | 'ud'
  /** Minutos tabulados, solo en mano de obra que sale de un paquete o de un baremo. */
  baremoMinutos: number | null
  /** true si el precio es cerrado por tipo de vehículo (no baremo × hora). */
  precioCerrado: boolean
  baseCent: number
  ivaCodigo: string
  ivaPuntosBasicos: number
  cuotaIvaCent: number
  totalCent: number
}

export interface DesgloseIva {
  ivaCodigo: string
  puntosBasicos: number
  baseCent: number
  cuotaCent: number
}

export interface PresupuestoCalculado {
  lineas: LineaCalculada[]
  baseCent: number
  cuotaIvaCent: number
  totalCent: number
  desgloseIva: DesgloseIva[]
}

export type ResultadoPresupuesto =
  | { ok: true; presupuesto: PresupuestoCalculado }
  | { ok: false; errores: string[] }

/** Importe de mano de obra: minutos × precio hora × (1 + recargo en pb), redondeado una sola vez. */
export function importeManoObraCent(minutos: number, precioHoraCent: number, recargoPuntosBasicos: number): number {
  return dividirRedondeando(
    minutos * precioHoraCent * (PUNTOS_BASICOS_100 + recargoPuntosBasicos),
    MINUTOS_HORA * PUNTOS_BASICOS_100,
  )
}

/** Importe del granel: mililitros × €/litro. */
export function importeGranelCent(litrosMl: number, precioLitroCent: number): number {
  return dividirRedondeando(litrosMl * precioLitroCent, ML_LITRO)
}

/** Cuota de IVA de UNA línea (redondeo por línea). */
export function cuotaIvaCent(baseCent: number, puntosBasicos: number): number {
  return dividirRedondeando(baseCent * puntosBasicos, PUNTOS_BASICOS_100)
}

const entero = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n)

export function calcularPresupuesto(config: ConfigTaller, entrada: EntradaPresupuesto): ResultadoPresupuesto {
  const errores: string[] = []
  const lineas: LineaCalculada[] = []
  const ivas = new Map(config.ivas.map((i) => [i.codigo, i.puntosBasicos]))
  const tipoVeh = entrada.tipoVehiculo == null
    ? null
    : config.tiposVehiculo.find((t) => t.codigo === entrada.tipoVehiculo && t.activo) ?? null

  if (entrada.lineas.length === 0) errores.push('el presupuesto no tiene líneas')

  const resolverIva = (tipo: TipoLinea, codigo: string | undefined, donde: string): [string, number] | null => {
    const cod = codigo ?? config.ivaPorDefecto[tipo]
    const pb = ivas.get(cod)
    if (pb === undefined) {
      errores.push(`${donde}: IVA «${cod}» no configurado`)
      return null
    }
    return [cod, pb]
  }

  const empujar = (l: Omit<LineaCalculada, 'ivaCodigo' | 'ivaPuntosBasicos' | 'cuotaIvaCent' | 'totalCent'>, ivaSolicitado: string | undefined, donde: string) => {
    const iva = resolverIva(l.tipo, ivaSolicitado, donde)
    if (!iva) return
    const cuota = cuotaIvaCent(l.baseCent, iva[1])
    lineas.push({ ...l, ivaCodigo: iva[0], ivaPuntosBasicos: iva[1], cuotaIvaCent: cuota, totalCent: l.baseCent + cuota })
  }

  const lineaGranel = (aceiteCodigo: string | null | undefined, litrosMl: number | null | undefined, ivaCodigo: string | undefined, paqueteCodigo: string | null, donde: string) => {
    if (aceiteCodigo == null) return errores.push(`${donde}: falta elegir el aceite`)
    const aceite = config.aceites.find((a) => a.codigo === aceiteCodigo && a.activo)
    if (!aceite) return errores.push(`${donde}: aceite «${aceiteCodigo}» no configurado`)
    if (litrosMl == null) return errores.push(`${donde}: faltan los litros del vehículo (no se asume 0)`)
    if (!entero(litrosMl) || litrosMl <= 0) return errores.push(`${donde}: litros inválidos`)
    empujar({
      tipo: 'granel', descripcion: aceite.nombre, paqueteCodigo, cantidad: litrosMl, unidad: 'ml',
      baremoMinutos: null, precioCerrado: false, baseCent: importeGranelCent(litrosMl, aceite.precioLitroCent),
    }, ivaCodigo ?? aceite.ivaCodigo, donde)
  }

  entrada.lineas.forEach((sol, i) => {
    const donde = `línea ${i + 1}`
    switch (sol.tipo) {
      case 'paquete': {
        const p = config.paquetes.find((x) => x.codigo === sol.paqueteCodigo && x.activo)
        if (!p) { errores.push(`${donde}: paquete «${sol.paqueteCodigo}» no configurado`); return }
        if (!tipoVeh) { errores.push(`${donde}: falta el tipo de vehículo para el precio del paquete`); return }
        const cerrado = p.precioCerradoPorTipo[tipoVeh.codigo]
        empujar({
          tipo: 'mano_obra', descripcion: p.nombre, paqueteCodigo: p.codigo, cantidad: p.baremoMinutos, unidad: 'min',
          baremoMinutos: p.baremoMinutos, precioCerrado: cerrado !== undefined,
          baseCent: cerrado !== undefined
            ? cerrado
            : importeManoObraCent(p.baremoMinutos, config.precioHoraCent, tipoVeh.recargoPuntosBasicos),
        }, undefined, donde)
        for (const pz of p.piezas) {
          empujar({
            tipo: 'pieza', descripcion: pz.descripcion, referencia: pz.referencia, paqueteCodigo: p.codigo,
            cantidad: pz.cantidad, unidad: 'ud', baremoMinutos: null, precioCerrado: false,
            baseCent: pz.cantidad * pz.precioUnitarioCent,
          }, pz.ivaCodigo, donde)
        }
        if (p.requiereAceite) lineaGranel(sol.aceiteCodigo, sol.litrosMl, undefined, p.codigo, donde)
        return
      }
      case 'mano_obra': {
        if (!entero(sol.minutos) || sol.minutos <= 0) { errores.push(`${donde}: minutos inválidos`); return }
        // Mano de obra suelta: precio hora × recargo del tipo. Sin tipo no se asume recargo 0.
        if (!tipoVeh) { errores.push(`${donde}: falta el tipo de vehículo para la mano de obra`); return }
        const recargo = tipoVeh.recargoPuntosBasicos
        empujar({
          tipo: 'mano_obra', descripcion: sol.descripcion, paqueteCodigo: null, cantidad: sol.minutos, unidad: 'min',
          baremoMinutos: null, precioCerrado: false,
          baseCent: importeManoObraCent(sol.minutos, config.precioHoraCent, recargo),
        }, sol.ivaCodigo, donde)
        return
      }
      case 'pieza':
      case 'otro': {
        if (!entero(sol.cantidad) || sol.cantidad <= 0) { errores.push(`${donde}: cantidad inválida`); return }
        if (!entero(sol.precioUnitarioCent) || sol.precioUnitarioCent < 0) { errores.push(`${donde}: precio inválido`); return }
        empujar({
          tipo: sol.tipo, descripcion: sol.descripcion, referencia: sol.tipo === 'pieza' ? sol.referencia : undefined,
          paqueteCodigo: null, cantidad: sol.cantidad, unidad: 'ud', baremoMinutos: null, precioCerrado: false,
          baseCent: sol.cantidad * sol.precioUnitarioCent,
        }, sol.ivaCodigo, donde)
        return
      }
      case 'granel':
        lineaGranel(sol.aceiteCodigo, sol.litrosMl, sol.ivaCodigo, null, donde)
        return
    }
  })

  if (errores.length > 0) return { ok: false, errores }

  const desglose = new Map<string, DesgloseIva>()
  for (const l of lineas) {
    const d = desglose.get(l.ivaCodigo) ?? { ivaCodigo: l.ivaCodigo, puntosBasicos: l.ivaPuntosBasicos, baseCent: 0, cuotaCent: 0 }
    d.baseCent += l.baseCent
    d.cuotaCent += l.cuotaIvaCent
    desglose.set(l.ivaCodigo, d)
  }
  const baseCent = lineas.reduce((s, l) => s + l.baseCent, 0)
  const cuota = lineas.reduce((s, l) => s + l.cuotaIvaCent, 0)
  return {
    ok: true,
    presupuesto: { lineas, baseCent, cuotaIvaCent: cuota, totalCent: baseCent + cuota, desgloseIva: [...desglose.values()] },
  }
}
