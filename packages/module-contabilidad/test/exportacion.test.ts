// F6 · exportación A3 / Sage / Holded. El diseño es DATO (diseno.ts): aquí se prueba que los generadores lo respetan y que lo ilegible no sale.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  exportar, exportarDiarioA3, exportarPlanA3, aLatin1, importeTexto, componerRegistroFijo, A3_REGISTRO_APUNTE, A3_LARGO_REGISTRO,
  SAGE_DISENO, HOLDED_DISENO, ESTADO_FORMATOS, AVISO_PENDIENTE_CONTRASTAR, type Asiento, type DatosExport,
} from '../src/index.ts'

const asientos: Asiento[] = [
  { numero: 2, fecha: '2026-02-10', ejercicio: 2026, concepto: 'Pago proveedor; "café" y ñandú', apuntes: [{ cuenta: '400', debe: 12100, haber: 0, documento: 'F-9' }, { cuenta: '572', debe: 0, haber: 12100 }] },
  { numero: 1, fecha: '2026-01-05', ejercicio: 2026, concepto: 'Venta', apuntes: [{ cuenta: '430', debe: 216249, haber: 0 }, { cuenta: '705', debe: 0, haber: 178718 }, { cuenta: '477', debe: 0, haber: 37531 }] },
]
const datos: DatosExport = { asientos, cuentas: [{ codigo: '400', nombre: 'Proveedores' }, { codigo: '430', nombre: 'Clientes' }, { codigo: '477', nombre: 'IVA repercutido' }, { codigo: '572', nombre: 'Bancos' }, { codigo: '705', nombre: 'Prestaciones de servicios' }] }

test('importes: céntimos enteros → texto con el decimal pedido, sin float', () => {
  assert.equal(importeTexto(216249, ','), '2162,49')
  assert.equal(importeTexto(5, '.'), '0.05')
  assert.equal(importeTexto(-1005, ','), '-10,05')
  assert.throws(() => importeTexto(1.5))
})

test('A3 diario: registros de 254 posiciones, ordenados por fecha, con los campos del diseño en SU posición', () => {
  const r = exportarDiarioA3(datos, { codigoEmpresa: '42' })
  const lineas = r.contenido.split('\r\n').filter(Boolean)
  assert.equal(lineas.length, 5)
  assert.ok(lineas.every((l) => l.length === A3_LARGO_REGISTRO))
  const l0 = lineas[0] // primer apunte del asiento 1 (5 de enero), cuenta 430 al debe
  const pos = (n: string) => { const c = A3_REGISTRO_APUNTE.campos.find((x) => x.nombre === n)!; return l0.slice(c.desde - 1, c.desde - 1 + c.ancho) }
  assert.equal(pos('tipoFormato'), '5')
  assert.equal(pos('codigoEmpresa'), '00042')
  assert.equal(pos('fecha'), '20260105')
  assert.equal(pos('cuenta'), '430000000000')
  assert.equal(pos('descripcionCuenta').trimEnd(), 'Clientes')
  assert.equal(pos('debeHaber'), 'D')
  assert.equal(pos('importe'), '00000002162.49'.slice(-14).padStart(14, '0'))
  assert.equal(lineas[1].slice(56, 57), 'H')
  assert.equal(r.pendienteContrastar, true)
  assert.equal(r.aviso, AVISO_PENDIENTE_CONTRASTAR)
  assert.equal(r.codificacion, 'latin1')
})

test('A3: la cuenta se completa con ceros, lo que no cabe NO se trunca en silencio (cuenta/empresa) y el concepto largo se recorta y se cuenta', () => {
  assert.throws(() => exportarDiarioA3(datos, { codigoEmpresa: 'ABC' }), /código de empresa de A3/)
  assert.throws(() => exportarDiarioA3(datos, { codigoEmpresa: '1', longitudCuenta: 2 }), /longitud/)
  assert.throws(() => exportarDiarioA3({ ...datos, cuentas: [...datos.cuentas, { codigo: '4000000000001', nombre: 'x' }], asientos: [{ ...asientos[0], apuntes: [{ cuenta: '4000000000001', debe: 1, haber: 0 }, { cuenta: '572', debe: 0, haber: 1 }] }] }, { codigoEmpresa: '1' }), /excede la longitud/)
  const largo = exportarDiarioA3({ ...datos, asientos: [{ ...asientos[1], concepto: 'x'.repeat(80) }] }, { codigoEmpresa: '1' })
  assert.equal(largo.recortes, 3)
  assert.throws(() => componerRegistroFijo(A3_REGISTRO_APUNTE, { documento: '12345678901' }), /ocupa 11 y el campo mide 10/)
})

test('A3 plan: un registro por cuenta, ordenado', () => {
  const r = exportarPlanA3(datos, { codigoEmpresa: '7' })
  const l = r.contenido.split('\r\n').filter(Boolean)
  assert.equal(l.length, 5)
  assert.ok(l[0].startsWith('1' + '00007' + '400000000000' + 'Proveedores'))
  assert.ok(l.every((x) => x.length === A3_LARGO_REGISTRO))
})

test('latin1: acentos y ñ en un byte; lo que no existe en latin1 pasa a «?»', () => {
  assert.deepEqual([...aLatin1('áñ€')], [0xe1, 0xf1, 63])
})

test('Sage: CSV ; con BOM, fecha DD/MM/AAAA, decimal coma, comillas cuando hacen falta; Holded: CSV , fecha ISO, decimal punto', () => {
  const s = exportar('sage', 'diario', datos)
  assert.ok(s.contenido.startsWith('﻿ASIENTO;FECHA;SUBCUENTA;CONCEPTO;DOCUMENTO;DEBE;HABER\r\n'))
  assert.match(s.contenido, /1;05\/01\/2026;430;Venta;;2162,49;\r\n/)
  assert.match(s.contenido, /2;10\/02\/2026;400;"Pago proveedor; ""café"" y ñandú";F-9;121,00;\r\n/)
  const h = exportar('holded', 'diario', datos)
  assert.ok(h.contenido.startsWith('Asiento,Fecha,Cuenta,Descripcion,Documento,Debe,Haber\n'))
  assert.match(h.contenido, /1,2026-01-05,430,Venta,,2162\.49,\n/)
  assert.equal(s.lineas, 5); assert.equal(h.lineas, 5)
  assert.match(exportar('sage', 'plan', datos).contenido, /SUBCUENTA;TITULO\r\n400;Proveedores\r\n/)
  assert.match(exportar('holded', 'plan', datos).contenido, /Cuenta,Nombre\n400,Proveedores\n/)
})

test('un asiento descuadrado o con cuenta fuera del plan NO se exporta en ningún formato', () => {
  const malo: DatosExport = { ...datos, asientos: [{ ...asientos[1], apuntes: [{ cuenta: '430', debe: 100, haber: 0 }, { cuenta: '705', debe: 0, haber: 99 }] }] }
  for (const f of ['a3', 'sage', 'holded'] as const) assert.throws(() => exportar(f, 'diario', malo, { codigoEmpresa: '1' }), /no cuadra/)
  const fuera: DatosExport = { ...datos, asientos: [{ ...asientos[1], apuntes: [{ cuenta: '999', debe: 100, haber: 0 }, { cuenta: '705', debe: 0, haber: 100 }] }] }
  assert.throws(() => exportar('sage', 'diario', fuera), /no está en el plan/)
  assert.throws(() => exportar('a3', 'diario', datos), /código de empresa/)
})

test('honestidad: los tres formatos están marcados «por contrastar» y ningún campo de A3 se da por documentado', () => {
  assert.equal(ESTADO_FORMATOS.a3.certeza, 'por_contrastar')
  assert.equal(SAGE_DISENO.certeza, 'por_contrastar')
  assert.equal(HOLDED_DISENO.certeza, 'por_contrastar')
  assert.ok(A3_REGISTRO_APUNTE.campos.every((c) => c.certeza === 'por_contrastar'))
  for (const f of ['a3', 'sage', 'holded'] as const) assert.equal(exportar(f, 'plan', datos, { codigoEmpresa: '1' }).pendienteContrastar, true)
})
