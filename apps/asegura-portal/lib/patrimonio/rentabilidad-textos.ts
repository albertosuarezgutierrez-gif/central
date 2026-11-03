// Textos de los avisos de la rentabilidad (la pantalla de rentabilidad y el informe fiscal dicen lo mismo).
import type { AvisoRentabilidad } from '@central/module-patrimonio'

/** Cada aviso dice el HECHO y lo que no sabemos: ninguno se calla para que el número parezca limpio. */
export const AVISO: Record<AvisoRentabilidad, string> = {
  seguros_sin_leer: 'Ahora no hemos podido leer tus seguros: este número NO incluye el coste de los seguros.',
  sin_seguro_conocido: 'No tiene ningún seguro enlazado. Si lo tiene, enlázalo en la ficha del inmueble; si no, pídenos precio desde allí.',
  prima_sin_dato: 'Hay un seguro enlazado del que no conocemos la prima (o no lo ves tú): su coste no está incluido.',
  posible_doble_seguro: 'Hay una factura de seguro y además un seguro enlazado: puede que el coste esté contado dos veces. Revísalo.',
  iva_sin_dato: 'No sabemos si deduces el IVA: los gastos se cuentan con IVA incluido.',
  gasto_sin_importe: 'Hay gastos confirmados sin importe: no se han contado.',
  sin_contrato: 'No tiene contrato anotado: no hay ingresos que contar.',
  reparto_edificio_pendiente: 'Los gastos del edificio todavía no se reparten entre los pisos (falta elegir el criterio o la superficie/porcentaje de algún piso): este número NO incluye su parte del edificio.',
}
