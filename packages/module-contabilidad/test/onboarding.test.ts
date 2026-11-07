// F6 · onboarding: CSV, plan de cuentas, saldos iniciales (apertura que cuadra), terceros con NIF validado, plantilla por CNAE.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  leerCsv, escribirCsv, detectarSeparador, importeACentimos, importarPlanCsv, asientoAperturaInicial, importarTercerosCsv, opcionesPlantilla,
  crearPlan, ejercicioNatural, refAperturaInicial, sugerenciaPorCnae,
} from '../src/index.ts'

test('CSV: BOM, CRLF, comillas con separador y salto dentro, comillas escapadas, separador autodetectado', () => {
  const t = '﻿codigo;nombre\r\n"100";"Capital; social"\r\n101;"Fondo ""social""\nlinea 2"\r\n\r\n'
  assert.equal(detectarSeparador(t), ';')
  assert.deepEqual(leerCsv(t), [['codigo', 'nombre'], ['100', 'Capital; social'], ['101', 'Fondo "social"\nlinea 2']])
  assert.equal(detectarSeparador('a,b,c\n1,2,3'), ',')
  assert.equal(detectarSeparador('a\tb\n1\t2'), '\t')
  assert.deepEqual(leerCsv(escribirCsv([['a;b', 'c"d', 'e']])), [['a;b', 'c"d', 'e']])
  assert.throws(() => leerCsv('a;"sin cerrar\n1;2'), /comilla sin cerrar/)
})

test('importes: formato español e ISO a céntimos sin float; lo ambiguo o con más de 2 decimales es null', () => {
  const casos: [string, number | null][] = [
    ['1.234,56', 123456], ['1234,56', 123456], ['1234.56', 123456], ['1,234.56', 123456], ['-12,5', -1250], ['1.234', 123400], ['12.5', 1250],
    ['0,07', 7], ['2.162,49€', 216249], ['', null], ['abc', null], ['1,234,567', null], ['1,2,3', null], ['10,999', null], ['1.2.3', null], ['-0', 0],
  ]
  for (const [t, esperado] of casos) assert.equal(importeACentimos(t), esperado, t)
  assert.equal(importeACentimos('90071992547409.93'), null) // fuera de entero seguro
})

const plan = crearPlan()

test('plan CSV: hereda la naturaleza del padre, rechaza la que no puede deducirse, omite lo existente y avisa de los padres que dejan de ser hoja', () => {
  const csv = 'Código;Nombre;Naturaleza\n4300001;Cliente Uno;\n4000002;Proveedor Dos;A\n999;Sin padre;\n430;Clientes (ya existe);D\n43;corto;D\n4000002;repetida;A\nX12;mal;D\n400100;Sub de 4001;\n'
  const r = importarPlanCsv(csv, plan)
  const porCod = Object.fromEntries(r.cuentas.map((c) => [c.codigo, c]))
  assert.equal(porCod['4300001'].naturaleza, 'deudora') // hereda de 430
  assert.equal(porCod['4000002'].naturaleza, 'acreedora')
  assert.deepEqual(r.yaExistentes, ['430'])
  assert.deepEqual(r.padresQueDejanDeSerHoja, ['400', '430'])
  const motivos = r.errores.map((e) => e.motivo).join(' | ')
  assert.match(motivos, /cuenta 999: sin naturaleza y sin cuenta padre/)
  assert.match(motivos, /código inválido «43»/)
  assert.match(motivos, /código 4000002 repetido/)
  assert.match(motivos, /código inválido «X12»/)
  assert.ok(!porCod['999'])
  assert.ok(porCod['400100'] === undefined || porCod['400100'].naturaleza === 'acreedora') // 4001 no existe: hereda de 400
})

test('plan CSV: padre y subcuenta en el mismo fichero (el padre entra como NO hoja); faltan columnas → error claro', () => {
  const r = importarPlanCsv('codigo;nombre;tipo\n4301;Clientes grupo;D\n43010;Cliente X;\n', plan)
  assert.equal(r.cuentas.find((c) => c.codigo === '4301')!.admiteApuntes, false)
  assert.equal(r.cuentas.find((c) => c.codigo === '43010')!.naturaleza, 'deudora')
  const m = importarPlanCsv('cuenta;texto\n100;x\n', plan)
  assert.match(m.errores[0].motivo, /faltan columnas obligatorias: nombre/)
  assert.equal(m.cuentas.length, 0)
})

const ej = ejercicioNatural(2026)
test('saldos iniciales: un balance que cuadra produce el asiento de apertura (origen apertura-inicial, debe = haber)', () => {
  const csv = 'cuenta;debe;haber\n572;10.000,00;\n217;5.000,50;\n100;;3.000,00\n113;;12.000,50\n'
  const r = asientoAperturaInicial(csv, plan, ej, '2026-01-01')
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.totalDebe, 1500050)
  assert.equal(r.totalHaber, 1500050)
  assert.equal(r.asiento.origen?.tipo, 'apertura')
  assert.equal(r.asiento.origen?.ref, refAperturaInicial(2026))
  assert.equal(r.asiento.apuntes.length, 4)
})

test('saldos iniciales: formato saldo (+deudor/−acreedor) y una cuenta repetida se netea en su lado mayor', () => {
  const r = asientoAperturaInicial('cuenta;saldo\n572;1000,00\n100;-1000,00\n', plan, ej, '2026-01-01')
  assert.equal(r.ok, true)
  const n = asientoAperturaInicial('cuenta;debe;haber\n572;100;\n572;;30\n100;;70\n', plan, ej, '2026-01-01')
  assert.equal(n.ok, true)
  if (n.ok) assert.deepEqual(n.asiento.apuntes.map((a) => [a.cuenta, a.debe, a.haber]), [['100', 0, 7000], ['572', 7000, 0]])
})

test('saldos iniciales: si NO cuadra no hay asiento ni se planchan diferencias; importe roto, cuenta fuera del plan y fecha mala también fallan', () => {
  const d = asientoAperturaInicial('cuenta;debe;haber\n572;100,00;\n100;;99,99\n', plan, ej, '2026-01-01')
  assert.equal(d.ok, false)
  if (!d.ok) { assert.equal(d.diferencia, 1); assert.match(d.errores.map((e) => e.motivo).join(), /no cuadra/) }
  assert.equal(asientoAperturaInicial('cuenta;debe;haber\n572;1x;\n100;;1\n', plan, ej, '2026-01-01').ok, false)
  assert.equal(asientoAperturaInicial('cuenta;debe;haber\n999;1;\n100;;1\n', plan, ej, '2026-01-01').ok, false) // 999 no está en el plan
  assert.equal(asientoAperturaInicial('cuenta;debe;haber\n572;1;\n100;;1\n', plan, ej, '2026-02-30').ok, false)
  assert.equal(asientoAperturaInicial('cuenta;debe;haber\n572;0;0\n', plan, ej, '2026-01-01').ok, false) // todo a cero: no hay nada que abrir
  assert.equal(asientoAperturaInicial('cuenta;debe;haber\n572;1;\n100;;1\n', plan, ejercicioNatural(2026, false), '2026-01-01').ok, false) // ejercicio cerrado
})

// Validador de prueba (la app inyecta el de core-fiscal): acepta lo que termina en la letra «Z» salvo la lista de inválidos.
const nifFalso = (n: string) => (n.endsWith('Z') ? { ok: true } : { ok: false, motivo: 'La letra del NIF no es correcta' })
test('terceros CSV: el NIF se valida con el validador inyectado; vacío, mal formado, tipo raro, email malo y repetidos se rechazan por línea', () => {
  const csv = [
    'NIF;Nombre;Tipo;Email', '12345678Z;Ana Pérez;cliente;ANA@Correo.es', '12.345.678-z;Ana otra vez;cliente;', '12345678Z;Ana como proveedora;Proveedor;',
    ';Sin NIF;cliente;', '12345678A;NIF malo;cliente;', 'AB;corto;cliente;', '87654321Z;Tipo raro;socio;', '87654321Z;Email malo;acreedor;no-es-email',
  ].join('\n')
  const r = importarTercerosCsv(csv, nifFalso)
  assert.deepEqual(r.terceros.map((t) => [t.nif, t.tipo, t.email]), [['12345678Z', 'cliente', 'ana@correo.es'], ['12345678Z', 'proveedor', null]])
  const m = r.errores.map((e) => `${e.linea}:${e.motivo}`).join('\n')
  assert.match(m, /3:NIF 12345678Z repetido como cliente/)
  assert.match(m, /5:NIF vacío/)
  assert.match(m, /6:NIF 12345678A: La letra del NIF no es correcta/)
  assert.match(m, /7:NIF «AB» con formato no válido/)
  assert.match(m, /8:tipo «socio»/)
  assert.match(m, /9:NIF 87654321Z: email no válido/)
})

test('plantilla por CNAE: sugiere, marca la sugerida y ofrece todas las plantillas', () => {
  const o = opcionesPlantilla('5610')
  assert.equal(o.sugerencia.sector, 'hosteleria')
  assert.deepEqual(o.opciones.filter((x) => x.sugerida).map((x) => x.sector), ['hosteleria'])
  assert.equal(o.opciones.length, 5)
  assert.ok(o.opciones.find((x) => x.sector === 'hosteleria')!.cuentasExtra >= 0)
  assert.equal(opcionesPlantilla('9999').opciones.find((x) => x.sugerida)!.sector, 'generico')
  assert.equal(sugerenciaPorCnae('9999').motivo, 'cnae_sin_plantilla')
})

test('escribirCsv: neutraliza fórmulas SOLO en columnas de texto (= + - @ tab CR → «\'»); las columnas numéricas no se tocan', () => {
  const filas = [['=HYPERLINK("x")', '-5,00', 'ok'], ['+cmd', '-12,50', '@sum'], ['\tx', '3', '\rx'], ['-texto', '1', 'a-b']]
  const t = escribirCsv(filas, { numericas: [1] })
  const leido = leerCsv(t)
  assert.deepEqual(leido[0], ['\'=HYPERLINK("x")', '-5,00', 'ok'])
  assert.deepEqual(leido[1], ["'+cmd", '-12,50', "'@sum"])
  assert.equal(leido[2][0], "'\tx")
  assert.equal(leido[2][2], "'\rx")
  assert.deepEqual(leido[3], ["'-texto", '1', 'a-b'])
  // sin declarar columnas numéricas, un importe negativo es texto y se prefija (decide el tipo de columna, no el contenido)
  assert.equal(leerCsv(escribirCsv([['-5,00']]), ';')[0][0], "'-5,00")
})
