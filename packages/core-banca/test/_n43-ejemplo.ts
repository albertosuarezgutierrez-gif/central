// Fichero Norma 43 SINTÉTICO (datos inventados) construido por posiciones, para que el test no dependa de espacios tecleados a mano.
const pad = (s: string, n: number) => s.padEnd(n, ' ').slice(0, n)
const num = (n: number, largo: number) => String(n).padStart(largo, '0')

export function reg11(o: { entidad: string; oficina: string; cuenta: string; ini: string; fin: string; dh: '1' | '2'; saldo: number; nombre: string }): string {
  return '11' + o.entidad + o.oficina + o.cuenta + o.ini + o.fin + o.dh + num(o.saldo, 14) + '978' + '3' + pad(o.nombre, 26) + '   '
}
export function reg22(o: { fop: string; fval: string; comun: string; dh: '1' | '2'; importe: number; doc?: string; ref1?: string; ref2?: string }): string {
  return '22' + '    ' + '0000' + o.fop + o.fval + o.comun + '000' + o.dh + num(o.importe, 14) + pad(o.doc ?? '', 10) + pad(o.ref1 ?? '', 12) + pad(o.ref2 ?? '', 16)
}
export function reg23(c1: string, c2 = ''): string {
  return '23' + '01' + pad(c1, 38) + pad(c2, 38)
}
export function reg33(o: { entidad: string; oficina: string; cuenta: string; dh: '1' | '2'; saldo: number }): string {
  return '33' + o.entidad + o.oficina + o.cuenta + num(0, 5) + num(0, 14) + num(0, 5) + num(0, 14) + o.dh + num(o.saldo, 14) + '978'
}
export const reg88 = () => '88' + '9'.repeat(18) + num(0, 6)

/** Cuenta ficticia 0000-0000-0000000000: saldo inicial 1.000,00; cargo 45,50 (luz); abono 1.210,00 (cobro cliente); cargo 3,25 (comisión). */
export const N43_EJEMPLO = [
  reg11({ entidad: '0000', oficina: '0001', cuenta: '0000012345', ini: '261101', fin: '261130', dh: '2', saldo: 100000, nombre: 'BANCO DE PRUEBA' }),
  reg22({ fop: '261103', fval: '261103', comun: '02', dh: '1', importe: 4550, doc: '0000000001', ref1: 'RECIBO LUZ' }),
  reg23('ENDESA ENERGIA SA', 'FACTURA 2026-10 CLIENTE 123'),
  reg22({ fop: '261110', fval: '261111', comun: '04', dh: '2', importe: 121000, doc: '0000000002' }),
  reg23('TRANSF. TALLER MARTINEZ SL', 'FRA 2026/0045'),
  reg22({ fop: '261120', fval: '261120', comun: '12', dh: '1', importe: 325 }),
  reg23('COMISION MANTENIMIENTO CUENTA'),
  reg33({ entidad: '0000', oficina: '0001', cuenta: '0000012345', dh: '2', saldo: 216125 }),
  reg88(),
].join('\r\n')
