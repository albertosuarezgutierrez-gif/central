// Actividad (CNAE) → plantilla sugerida; el dueño/gestor confirma o cambia; cuentas de otra plantilla; alta por el operador con CNAE.
// Cepo visto fallar el 05/11/2026: ignorar el CNAE en `validarEntradaAlta` (sector siempre «generico») → rojo en «sugiere la plantilla».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { altaEmpresa, validarEntradaAlta, type DepsAlta } from '../lib/alta-empresa.ts'
import { anadirCuentasDePlantilla, guardarActividad } from '../lib/actividad.ts'
import { Revertir, capturarReversion, revirtiendo } from '../lib/revertir.ts'
import { crearAlmacen } from './_repo-memoria.ts'

const A = '00000000-0000-4000-8000-00000000000a'
const HOY = new Date('2026-11-05T10:00:00Z')
const base = { razonSocial: 'Talleres Prueba SL', nif: 'B12345678', dueno: { email: 'd@e.es', nombre: 'D' } }

test('alta: con CNAE y sin sector SUGIERE la plantilla; un sector explícito manda; CNAE desconocido → genérica; inválido → 400', () => {
  const v = (extra: object) => validarEntradaAlta({ ...base, ...extra }, HOY)
  const ok = (extra: object) => { const r = v(extra); assert.ok(r.ok, JSON.stringify(r)); return r.valor }
  assert.deepEqual([ok({ cnae: '45.20' }).sector, ok({ cnae: '45.20' }).cnae], ['taller', '4520'])
  assert.equal(ok({ cnae: '5630' }).sector, 'hosteleria')
  assert.equal(ok({ cnae: '8121' }).sector, 'limpieza')
  assert.equal(ok({ cnae: '7739' }).sector, 'alquiler')
  assert.equal(ok({ cnae: '6201' }).sector, 'generico')
  assert.equal(ok({ cnae: '4520', sector: 'limpieza' }).sector, 'limpieza')
  assert.deepEqual([ok({}).sector, ok({}).cnae], ['generico', null])
  assert.equal(ok({ cnae: '' }).cnae, null)
  const mal = v({ cnae: 'abc' })
  assert.ok(!mal.ok && /cnae/.test(mal.errores.join(' ')))
})

test('alta con CNAE: queda guardado una vez y repetir el alta con otro CNAE NO pisa lo confirmado', async () => {
  const al = crearAlmacen()
  const ids = new Map<string, string>()
  const d: DepsAlta = {
    async altaEmpresa(x) { const previo = ids.get(x.nif); if (previo) return { id: previo, creado: false }; ids.set(x.nif, A); return { id: A, creado: true } },
    async altaUsuario() { return '00000000-0000-4000-9000-000000000001' },
    conRepo: (id, fn) => { al.empresaLista(id); return fn(al.repo(id)) },
    hoy: () => HOY,
  }
  const r1 = await altaEmpresa(d, { ...base, cnae: '4520' })
  assert.ok(r1.ok && r1.completado.includes('CNAE 4520'))
  assert.equal(al.datos(A).f3.cnae, '4520')
  const dd = { ...d, conRepo: (id: string, fn: Parameters<DepsAlta['conRepo']>[1]) => fn(al.repo(id)) } as DepsAlta
  const r2 = await altaEmpresa(dd, { ...base, cnae: '5630' })
  assert.ok(r2.ok && !r2.completado.some((x) => x.startsWith('CNAE')))
  assert.equal(al.datos(A).f3.cnae, '4520')
  // sin CNAE en el alta no se toca nada (ni se llama a una columna que quizá aún no exista)
  const sinCnae = crearAlmacen(); sinCnae.empresaLista(A)
  const repo = sinCnae.repo(A)
  repo.cnaeEmpresa = async () => { throw new Error('0003 sin aplicar') }
  const r3 = await altaEmpresa({ ...d, conRepo: (_id, fn) => fn(repo) }, { ...base, nif: 'B87654321' })
  assert.ok(r3.ok)
})

test('Ajustes → Actividad: guarda CNAE y plantilla; la sugerencia se devuelve pero NO se impone; vacío borra el CNAE', async () => {
  const al = crearAlmacen(); al.empresaLista(A)
  const repo = al.repo(A)
  const r = await guardarActividad(repo, { cnae: '56.10' }, null)
  assert.ok(r.ok && r.cnae === '5610' && r.sugerencia.sector === 'hosteleria' && r.sector === null)
  assert.equal((await repo.empresa())?.sector, 'generico', 'solo CNAE: la plantilla no cambia sola')
  const r2 = await guardarActividad(repo, { cnae: '5610', sector: 'hosteleria' }, null)
  assert.ok(r2.ok)
  assert.equal((await repo.empresa())?.sector, 'hosteleria')
  const r3 = await guardarActividad(repo, { cnae: '5610', sector: 'taller' }, null) // el dueño decide otra cosa
  assert.ok(r3.ok && (await repo.empresa())?.sector === 'taller')
  assert.ok((await guardarActividad(repo, { cnae: '' }, null)).ok)
  assert.equal(al.datos(A).f3.cnae, null)
  assert.ok(al.datos(A).auditoria.some((x) => x.accion === 'cambiar_actividad'))
  for (const mal of [{ cnae: 'xx' }, { cnae: '4520', sector: 'astronauta' }, { cnae: '12' }]) assert.equal((await guardarActividad(repo, mal, null)).ok, false, JSON.stringify(mal))
})

test('cuentas de otra plantilla: se AÑADEN las que faltan, sin quitar ni duplicar; plantilla inválida, rechazada', async () => {
  const al = crearAlmacen(); al.empresaLista(A, 2026, 'abierto', 'generico')
  const repo = al.repo(A)
  const antes = (await repo.planCuentas()).length
  assert.ok(!(await repo.planCuentas()).some((c) => c.codigo === '754'))
  const r = await anadirCuentasDePlantilla(repo, 'taller', null)
  assert.ok(r.ok && r.anadidas.includes('754'))
  const despues = await repo.planCuentas()
  assert.equal(despues.length, antes + r.anadidas.length)
  assert.equal(new Set(despues.map((c) => c.codigo)).size, despues.length)
  const otra = await anadirCuentasDePlantilla(repo, 'taller', null)
  assert.ok(otra.ok && otra.anadidas.length === 0, 'idempotente')
  assert.equal((await anadirCuentasDePlantilla(repo, 'marte', null)).ok, false)
})

test('revertir: un resultado ok:false lanza para deshacer la transacción y se recupera como resultado', async () => {
  const fallo = revirtiendo(async () => ({ ok: false as const, errores: ['x'] }))
  await assert.rejects(fallo(null as never), Revertir)
  assert.deepEqual(await capturarReversion(fallo(null as never)), { ok: false, errores: ['x'] })
  const bien = revirtiendo(async () => ({ ok: true as const }))
  assert.deepEqual(await bien(null as never), { ok: true })
  await assert.rejects(capturarReversion(Promise.reject(new Error('otro'))), /otro/)
})
