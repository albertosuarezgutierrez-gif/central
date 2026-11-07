// F6 · onboarding en la app (casos de uso sobre repositorios en memoria que imitan 0001/0005/0006): plan, saldos iniciales y terceros.
// Cepos vistos FALLAR el 07/11/2026: (1) en `importarPlan` quitar el `if (r.errores.length) return` → rojo en «con un error de fila no se importa nada»;
// (2) en `importarSaldosIniciales` quitar la comprobación `!ej` → rojo en «balance que no cuadra… ejercicio inexistente»; (3) en `importarTerceros` pasar un validador que
// siempre acepta → rojo en «NIF mal puesto detiene la importación».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validarNifCif } from '@central/core-fiscal'
import { importarPlan, importarSaldosIniciales, importarTerceros } from '../lib/onboarding.ts'
import { crearAlmacen } from './_repo-memoria.ts'
import { f6Memoria } from './_f6-memoria.ts'

const A = '00000000-0000-4000-8000-00000000000a'
const U = '00000000-0000-4000-8000-0000000000f1'
const nuevo = (estado: 'abierto' | 'cerrado' = 'abierto') => {
  const al = crearAlmacen(); const d = al.empresaLista(A, 2026, estado)
  return { d, repo: al.repo(A), f6: f6Memoria(d) }
}

test('plan: añade las cuentas nuevas (hereda naturaleza), no pisa las existentes y el padre que recibe subcuentas deja de admitir apuntes', async () => {
  const { d, repo, f6 } = nuevo()
  const antes = d.plan.length
  const r = await importarPlan(repo, f6, 'codigo;nombre\n4300001;Cliente Uno\n4300002;Cliente Dos\n430;Clientes (otro nombre)\n')
  assert.equal(r.ok, true)
  if (r.ok) assert.deepEqual([r.nuevas, r.yaExistentes, r.padres], [2, 1, 1])
  assert.equal(d.plan.length, antes + 2)
  assert.equal(d.plan.find((c) => c.codigo === '430')!.admiteApuntes, false)
  assert.equal(d.plan.find((c) => c.codigo === '430')!.nombre, 'Clientes') // no se pisó
  assert.equal(d.plan.find((c) => c.codigo === '4300001')!.naturaleza, 'deudora')
  const otra = await importarPlan(repo, f6, 'codigo;nombre\n4300001;Cliente Uno\n')
  assert.equal(otra.ok, false) // reimportar lo mismo: nada nuevo
})

test('plan: con un error de fila no se importa NADA (ni las filas buenas)', async () => {
  const { d, repo, f6 } = nuevo()
  const antes = d.plan.length
  const r = await importarPlan(repo, f6, 'codigo;nombre;naturaleza\n9990001;Buena;D\nXX;Mala;D\n')
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.errores[0].motivo, /código inválido/)
  assert.equal(d.plan.length, antes)
})

const saldos = 'cuenta;debe;haber\n572;10.000,00;\n217;2.500,50;\n100;;3.000,00\n113;;9.500,50\n'
test('saldos iniciales: crea UN asiento de apertura que cuadra, con su origen y auditoría; repetirlo se rechaza', async () => {
  const { d, repo } = nuevo()
  const r = await importarSaldosIniciales(repo, saldos, '2026-01-01', { usuarioId: U })
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.total, 1250050)
  assert.equal(d.asientos.length, 1)
  const a = d.asientos[0] as unknown as { origen: string; origenTipo: string; origenRef: string; apuntes: { debe: number; haber: number }[] }
  assert.deepEqual([a.origen, a.origenTipo, a.origenRef], ['apertura', 'apertura', 'apertura-inicial:2026'])
  assert.equal(a.apuntes.reduce((s, p) => s + p.debe, 0), a.apuntes.reduce((s, p) => s + p.haber, 0))
  assert.equal(d.auditoria.at(-1)!.accion, 'apertura_inicial')
  // Segunda vez: se rechaza con conflicto (409 en la ruta) antes de reservar número; nunca dos aperturas.
  const otra = await importarSaldosIniciales(repo, saldos, '2026-01-01', { usuarioId: U })
  assert.equal(otra.ok, false)
  if (!otra.ok) { assert.equal(otra.conflicto, true); assert.match(otra.errores[0].motivo, /ya tiene un asiento de apertura/) }
  assert.equal(d.asientos.length, 1)
  assert.equal(d.ejercicios[0].ultimo, 1)
})

test('saldos iniciales: una apertura HEREDADA del cierre (apertura:AAAA) también lo bloquea; si está rectificada, deja de bloquear', async () => {
  const { d, repo } = nuevo()
  const apuntes = [{ cuenta: '572', debe: 100, haber: 0 }, { cuenta: '100', debe: 0, haber: 100 }]
  const n = await repo.reservarNumero(2026)
  const id = await repo.insertarAsiento({ ejercicio: 2026, numero: n, fecha: '2026-01-01', concepto: 'Apertura 2026', origen: 'apertura', origenTipo: 'apertura', origenRef: 'apertura:2025', hash: 'h', apuntes })
  const r = await importarSaldosIniciales(repo, saldos, '2026-01-01', { usuarioId: U })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.conflicto, true)
  assert.equal(d.asientos.length, 1)
  const n2 = await repo.reservarNumero(2026)
  await repo.insertarAsiento({ ejercicio: 2026, numero: n2, fecha: '2026-01-01', concepto: 'Rectifica', origen: 'rectificacion', reversaDe: id, hash: 'h2', apuntes: apuntes.map((p) => ({ cuenta: p.cuenta, debe: p.haber, haber: p.debe })) })
  const ok = await importarSaldosIniciales(repo, saldos, '2026-01-01', { usuarioId: U })
  assert.equal(ok.ok, true)
})

test('saldos iniciales: un balance que no cuadra NO crea asiento ni consume número; ejercicio inexistente o cerrado también falla', async () => {
  const { d, repo } = nuevo()
  const r = await importarSaldosIniciales(repo, 'cuenta;debe;haber\n572;100,00;\n100;;99,99\n', '2026-01-01', { usuarioId: U })
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.errores.map((e) => e.motivo).join(), /no cuadra/)
  assert.equal(d.asientos.length, 0)
  assert.equal(d.ejercicios[0].ultimo, 0)
  const sinEj = await importarSaldosIniciales(repo, saldos, '2031-01-01', { usuarioId: U })
  assert.equal(sinEj.ok, false)
  const cerrado = nuevo('cerrado')
  const c = await importarSaldosIniciales(cerrado.repo, saldos, '2026-01-01', { usuarioId: U })
  assert.equal(c.ok, false)
  if (!c.ok) assert.match(c.errores[0].motivo, /cerrado/)
  assert.equal(cerrado.d.asientos.length, 0)
})

test('terceros: NIF validado con el algoritmo real de core-fiscal; un NIF mal puesto detiene la importación entera; repetir no duplica', async () => {
  const { f6 } = nuevo()
  const bueno = 'nif;nombre;tipo;email\n12345678Z;Ana Pérez;cliente;ana@x.test\nB12345674;Proveedor SL;proveedor;\nX1234567L;Extranjero;acreedor;\n'
  const r = await importarTerceros(f6, bueno, (n) => validarNifCif(n), U)
  assert.equal(r.ok, true)
  if (r.ok) assert.deepEqual([r.nuevos, r.repetidos], [3, 0])
  const otra = await importarTerceros(f6, bueno, (n) => validarNifCif(n), U)
  assert.equal(otra.ok && otra.nuevos, 0)
  assert.equal(f6.estado.terceros.length, 3)
  const malo = await importarTerceros(f6, 'nif;nombre;tipo\n12345678A;Mal NIF;cliente\n87654321X;Bien;cliente\n', (n) => validarNifCif(n), U)
  assert.equal(malo.ok, false)
  if (!malo.ok) assert.match(malo.errores[0].motivo, /letra del NIF/)
  assert.equal(f6.estado.terceros.length, 3)
})
