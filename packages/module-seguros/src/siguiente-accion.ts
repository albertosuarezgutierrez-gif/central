// «Siguiente acción» de la ficha del cliente (Fase 6 de ASegura OS). PURO.
//
// Una sola acción, la que más vale hoy, con su porqué. La decide un ORDEN FIJO de reglas, no un
// modelo: primero lo que cuesta cobertura (recibo devuelto), después lo que caduca (renovación,
// presupuesto sin cerrar), después lo que vende (comparativa de una póliza de fuera, venta cruzada).
//
// 🚨 Tres desenlaces, no dos: una acción · «nada pendiente de lo que se ha podido mirar» · y
// `sin_comprobar` cuando no hay acción PERO faltaba algún dato (recibos o declaradas sin leer).
// Decir «nada pendiente» sobre recibos que no se han leído es exactamente el «todo al día» que no
// hay que pintar.

import { clasificarPolizaFicha, type PolizaResumible } from './ficha-resumen.ts'
import { retencion } from './retencion.ts'

export type PolizaAccion = PolizaResumible & {
  tipo: string
  aseguradora: string
  recibos: (PolizaResumible['recibos'] & { ultimo: { situacion: string; fechaVencimiento: string | null } | null }) | null
}

export type DeclaradaAccion = { ramo: string | null; compania: string | null; fechaVencimiento: string | null }

export type EntradaSiguienteAccion = {
  polizas: PolizaAccion[]
  /** Pólizas de otras compañías que el cliente declaró en su portal. `null` = no se pudieron leer. */
  declaradas: DeclaradaAccion[] | null
  /** Presupuestos enviados sin cerrar. `null` = no se pudo contar. */
  cotizacionesVivas: number | null
  /** ¿Hay un teléfono o un correo con el que avisarle? `null` = no se pudo leer (cifrado sin clave). */
  tieneCanal: boolean | null
  hoy: Date
}

export type TipoSiguienteAccion =
  | 'recibo_sin_cobertura'
  | 'recibo_devuelto'
  | 'renovacion'
  | 'presupuesto_pendiente'
  | 'comparativa_declarada'
  | 'sin_canal'
  | 'venta_cruzada'

export type SiguienteAccion =
  | { estado: 'accion'; tipo: TipoSiguienteAccion; titulo: string; porque: string; urgente: boolean; polizaId: string | null }
  | { estado: 'nada' }
  | { estado: 'sin_comprobar'; falta: string[] }

/** Días que se mira hacia delante para renovaciones y pólizas declaradas. */
export const VENTANA_DIAS = 60

const DIA = 86_400_000

function dias(iso: string | null, hoy: Date): number | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null
  const t = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`)
  const h = Date.parse(`${hoy.toISOString().slice(0, 10)}T00:00:00Z`)
  return Number.isFinite(t) ? Math.round((t - h) / DIA) : null
}

function fecha(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}

const RAMO: Record<string, string> = {
  auto: 'coche', moto: 'moto', hogar: 'hogar', responsabilidad_civil: 'responsabilidad civil',
  vida: 'vida', salud: 'salud', decesos: 'decesos', comercio: 'comercio', comunidad: 'comunidad',
}
const ramo = (t: string | null): string => (t ? RAMO[t] ?? t.replace(/_/g, ' ') : 'seguro')

export function siguienteAccion(e: EntradaSiguienteAccion): SiguienteAccion {
  const vivas = e.polizas.filter((p) => clasificarPolizaFicha(p) === 'viva')
  const falta: string[] = []

  // 1-2. Recibo devuelto: el reloj del art. 15 LCS. Solo cuenta si la compañía AFIRMA la devolución.
  let devuelto: SiguienteAccion | null = null
  for (const p of vivas) {
    if (p.recibos === null) { falta.push(`recibos de ${ramo(p.tipo)} ${p.aseguradora}`); continue }
    const u = p.recibos.ultimo
    if (!u || u.situacion !== 'devuelto') continue
    const r = retencion(u.fechaVencimiento, 'devuelto', e.hoy)
    if (r.estado === 'suspendida') {
      return {
        estado: 'accion', tipo: 'recibo_sin_cobertura', urgente: true, polizaId: p.id,
        titulo: `Llamar hoy: recibo devuelto de ${ramo(p.tipo)} (${p.aseguradora})`,
        porque: 'Pasó el mes desde el recibo: la cobertura está suspendida y el cliente probablemente no lo sabe. Si paga, vuelve a estar cubierto en 24 horas.',
      }
    }
    if (r.estado === 'en_plazo' && !devuelto) {
      devuelto = {
        estado: 'accion', tipo: 'recibo_devuelto', urgente: true, polizaId: p.id,
        titulo: `Llamar: recibo devuelto de ${ramo(p.tipo)} (${p.aseguradora})`,
        porque: r.diasParaSuspension !== null
          ? `Si no se paga en ${r.diasParaSuspension} día(s), la cobertura se suspende.`
          : 'Si no se paga en un mes desde el recibo, la cobertura se suspende.',
      }
    }
  }
  if (devuelto) return devuelto

  // 3. Renovación en la ventana: lo que más se vende y lo que antes caduca.
  const renov = vivas
    .map((p) => ({ p, d: dias(p.fechaVencimiento, e.hoy) }))
    .filter((x): x is { p: PolizaAccion; d: number } => x.d !== null && x.d >= 0 && x.d <= VENTANA_DIAS)
    .sort((a, b) => a.d - b.d)[0]
  if (renov) {
    const v = renov.p.fechaVencimiento as string
    return {
      estado: 'accion', tipo: 'renovacion', urgente: renov.d <= 30, polizaId: renov.p.id,
      titulo: `Revisar la renovación de ${ramo(renov.p.tipo)} (${renov.p.aseguradora}), vence el ${fecha(v)}`,
      porque: renov.d > 30
        ? `Quedan ${renov.d} días: aún se puede mejorar el precio o cambiar de compañía con el preaviso de un mes.`
        : `Quedan ${renov.d} días: ya no llega el preaviso de un mes para cambiar de compañía este año; se renueva y se revisa el precio.`,
    }
  }

  // 4. Presupuesto enviado sin cerrar.
  if (e.cotizacionesVivas === null) falta.push('presupuestos')
  else if (e.cotizacionesVivas > 0) {
    return {
      estado: 'accion', tipo: 'presupuesto_pendiente', urgente: false, polizaId: null,
      titulo: e.cotizacionesVivas === 1 ? 'Seguimiento del presupuesto enviado' : `Seguimiento de ${e.cotizacionesVivas} presupuestos enviados`,
      porque: 'Tiene un presupuesto sin respuesta: una llamada ahora es lo que más cierra.',
    }
  }

  // 5. Póliza de otra compañía que declaró y vence pronto: la venta más barata.
  if (e.declaradas === null) falta.push('pólizas declaradas en el portal')
  else {
    const d = e.declaradas
      .map((x) => ({ x, d: dias(x.fechaVencimiento, e.hoy) }))
      .filter((y): y is { x: DeclaradaAccion; d: number } => y.d !== null && y.d >= 0 && y.d <= VENTANA_DIAS)
      .sort((a, b) => a.d - b.d)[0]
    if (d) {
      return {
        estado: 'accion', tipo: 'comparativa_declarada', urgente: false, polizaId: null,
        titulo: `Ofrecer comparativa de ${ramo(d.x.ramo)}: su póliza${d.x.compania ? ` de ${d.x.compania}` : ''} vence el ${fecha(d.x.fechaVencimiento as string)}`,
        porque: 'Nos la subió al portal: sabemos cuándo vence y a quién se la tiene, y todavía no es nuestra.',
      }
    }
  }

  // 6. Sin forma de avisarle.
  if (e.tieneCanal === null) falta.push('teléfono y correo')
  else if (!e.tieneCanal && vivas.length > 0) {
    return {
      estado: 'accion', tipo: 'sin_canal', urgente: false, polizaId: null,
      titulo: 'Conseguir un teléfono o un correo',
      porque: 'Hoy no hay forma de avisarle de una renovación, un recibo devuelto o un siniestro.',
    }
  }

  // 7. Venta cruzada: tiene coche y no tiene hogar (el hueco más grande medido en la cartera).
  const ramos = new Set(vivas.map((p) => p.tipo))
  if ((ramos.has('auto') || ramos.has('moto')) && !ramos.has('hogar')) {
    return {
      estado: 'accion', tipo: 'venta_cruzada', urgente: false, polizaId: null,
      titulo: 'Ofrecer el seguro de hogar',
      porque: 'Tiene el coche con nosotros y la casa no. Si su hogar está en otra compañía, pedirle la póliza para comparar.',
    }
  }

  return falta.length > 0 ? { estado: 'sin_comprobar', falta } : { estado: 'nada' }
}
