import type { PrintPayload, TicketCuentaParams } from '../src/renderers/thermal.ts'

// Instante fijo para congelar el reloj. `generarEscPosCuenta` lee `new Date()` (reloj de
// pared, no tiene fecha en su payload), así que sin congelar el reloj su salida cambia
// cada minuto y el golden no sería reproducible. Los otros 3 generadores leen la hora de
// su payload, así que congelar no les afecta.
export const FIXED_NOW = Date.parse('2026-06-16T13:45:00.000Z')

// Ejecuta `fn` con `new Date()`/`Date.now()` congelados en FIXED_NOW. Las llamadas con
// argumentos (p. ej. `new Date(payload.ts)`) siguen funcionando igual.
export function withFrozenClock<T>(fn: () => T): T {
  const RealDate = globalThis.Date
  class FrozenDate extends RealDate {
    constructor(...args: ConstructorParameters<typeof Date>) {
      if (args.length === 0) super(FIXED_NOW)
      else super(...(args as []))
    }
    static now() { return FIXED_NOW }
  }
  ;(globalThis as { Date: DateConstructor }).Date = FrozenDate as unknown as DateConstructor
  try {
    return fn()
  } finally {
    ;(globalThis as { Date: DateConstructor }).Date = RealDate
  }
}

// `ts`/`fecha` fijos para que la salida sea determinista (las funciones leen la hora del payload).
export const FIXTURES: {
  comanda: PrintPayload
  ticketCuenta: TicketCuentaParams
} = {
  comanda: {
    mesa: '12',
    camarero: 'ana',
    ticket_num: 7,
    seccion: 'cocina',
    zona_nombre: 'terraza',
    nota_general: 'sin gluten',
    items: [
      { nombre: 'Croquetas', cantidad: 2, notas: 'extra crujiente', formato_nombre: 'Ración' },
      { nombre: 'Tortilla', cantidad: 1 },
    ],
    tipo: 'comanda',
    ts: '2026-06-16T13:45:00.000Z',
  },
  ticketCuenta: {
    mesa_label: 'MESA 12',
    razon_social: 'ia.rest SL',
    nif_emisor: 'B00000000',
    direccion: 'Calle Falsa 123, Sevilla',
    numero_factura: 123,
    numero_serie: 'F',
    fecha: '2026-06-16T13:45:00.000Z',
    items: [
      { nombre: 'Croquetas', cantidad: 2, precio_unit: 6, formato: 'Ración' },
      { nombre: 'Tortilla', cantidad: 1, precio_unit: 5 },
    ],
    base_imponible: 15.45,
    cuota_iva: 1.55,
    tipo_iva: 10,
    importe_total: 17,
    qr_data: 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=B00000000&numserie=F123',
    primer_registro: true,
  },
}
