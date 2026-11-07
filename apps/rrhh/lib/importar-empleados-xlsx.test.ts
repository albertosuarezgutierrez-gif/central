import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { leerXlsx } from './importar-empleados-xlsx'
import { tablaDesdeMatriz, prepararImportacion } from './importar-empleados'
import { existentesVacios } from './alta-empleado'

describe('XLSX', () => {
  it('fechas de Excel (serie) y NAF de texto con 0 llegan bien a la validación', () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Apellidos', 'Nombre', 'DNI/NIE', 'Email', 'Nº afiliación SS', 'Fecha nacimiento'],
      ['García', 'Ana', '12345678Z', 'ana@x.es', '080123456774', 32874],
    ])
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'E')
    const bytes = new Uint8Array(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer)
    const { altas } = prepararImportacion(tablaDesdeMatriz(leerXlsx(bytes)), { hoy: '2026-11-07', tablas: null }, existentesVacios())
    expect(altas[0].alta).toMatchObject({ nss: '080123456774', fecha_nacimiento: '1990-01-01' })
  })
  it('rechaza lo que no es un .xlsx', () => {
    expect(() => leerXlsx(new TextEncoder().encode('a;b'))).toThrow(/xlsx/)
  })
})
