// Alta de empresa por el operador (`POST /api/operador/empresas`): Bearer del operador, validación, siembra (plan PGC +
// ejercicio abierto + dueño) e idempotencia por NIF (repetir no crea otra empresa ni un segundo dueño).
// Cepo visto fallar el 05/11/2026: vincular dueño aunque ya haya uno activo → rojo en «IDEMPOTENTE por NIF»; restaurado → verde.
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { SEMILLA_PGC_PYMES } from '@central/module-contabilidad'
import { altaEmpresa, crearManejadorAlta, formaDesdeNif, validarEntradaAlta, type DepsAlta } from '../lib/alta-empresa.ts'
import { bearerValido, ENV_OPERADOR } from '../lib/secretos.ts'
import { crearAlmacen } from './_repo-memoria.ts'

const HOY = new Date('2026-11-05T10:00:00Z')
const cuerpo = {
  razonSocial: 'Talleres Prueba SL', nif: 'b12345678', dueno: { email: 'Duena@Ejemplo.es', nombre: 'Pilar' },
  gestor: { email: 'gestor@asesoria.es', nombre: 'Asesoría' }, origenes: ['taller'], colorPrimario: '#8FFA09',
}

function deps() {
  const al = crearAlmacen()
  const empresas = new Map<string, string>()
  const usuarios = new Map<string, string>()
  let n = 0
  const d: DepsAlta = {
    async altaEmpresa(x) {
      const previo = empresas.get(x.nif)
      if (previo) return { id: previo, creado: false }
      const id = `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
      empresas.set(x.nif, id)
      return { id, creado: true }
    },
    async altaUsuario(email) {
      if (!usuarios.has(email)) usuarios.set(email, `00000000-0000-4000-9000-${String(usuarios.size + 1).padStart(12, '0')}`)
      return usuarios.get(email)!
    },
    conRepo: (id, fn) => fn(al.repo(id)),
    hoy: () => HOY,
  }
  return { d, al, empresas, usuarios }
}

beforeEach(() => { process.env[ENV_OPERADOR] = 'secreto-operador' })
afterEach(() => { delete process.env[ENV_OPERADOR] })

test('401 sin Bearer, con Bearer malo o sin la variable configurada; nunca se llega a dar de alta', async () => {
  const { d, empresas } = deps()
  const POST = crearManejadorAlta({ autorizado: (r) => bearerValido(r.headers.get('authorization'), ENV_OPERADOR), alta: (c) => altaEmpresa(d, c) })
  const req = (auth?: string) => new Request('https://c.test/api/operador/empresas', { method: 'POST', headers: auth ? { authorization: auth } : {}, body: JSON.stringify(cuerpo) })
  assert.equal((await POST(req())).status, 401)
  assert.equal((await POST(req('Bearer otro'))).status, 401)
  delete process.env[ENV_OPERADOR]
  assert.equal((await POST(req('Bearer secreto-operador'))).status, 401)
  assert.equal(empresas.size, 0)
})

test('alta nueva (201): plan PGC completo, ejercicio del año de hoy ABIERTO, dueño y gestor vinculados, origen autorizado', async () => {
  const { d, al } = deps()
  const POST = crearManejadorAlta({ autorizado: () => true, alta: (c) => altaEmpresa(d, c) })
  const r = await POST(new Request('https://c.test', { method: 'POST', body: JSON.stringify(cuerpo) }))
  assert.equal(r.status, 201)
  const j = await r.json()
  const datos = al.datos(j.empresaId)
  assert.equal(datos.plan.length, SEMILLA_PGC_PYMES.length)
  assert.deepEqual(datos.ejercicios.map((e) => [e.anio, e.inicio, e.fin, e.estado]), [[2026, '2026-01-01', '2026-12-31', 'abierto']])
  assert.deepEqual(datos.vinculos.map((v) => v.rol).sort(), ['dueno', 'gestor'])
  assert.ok(datos.origenes.has('taller'))
  assert.ok(j.duenoUsuarioId)
  assert.equal(datos.auditoria.at(-1)?.actor, 'operador')
})

test('IDEMPOTENTE por NIF: repetir no crea otra empresa, no duplica el plan ni añade un SEGUNDO dueño con otro correo', async () => {
  const { d, al, empresas } = deps()
  const r1 = await altaEmpresa(d, cuerpo)
  const r2 = await altaEmpresa(d, { ...cuerpo, nif: 'B-12345678', dueno: { email: 'intruso@ejemplo.es', nombre: 'Otro' } })
  assert.ok(r1.ok && r2.ok)
  assert.equal(empresas.size, 1)
  assert.equal(r2.ok && r2.status, 200)
  assert.equal(r2.ok && r2.creada, false)
  assert.equal(r1.ok && r2.ok && r1.empresaId === r2.empresaId, true)
  const datos = al.datos(r1.ok ? r1.empresaId : '')
  assert.equal(datos.plan.length, SEMILLA_PGC_PYMES.length)
  assert.equal(datos.vinculos.filter((v) => v.rol === 'dueno').length, 1)
  assert.equal(r2.ok && r2.duenoUsuarioId, null, 'el intruso no queda como dueño')
})

test('validación: NIF, correo del dueño, color, origen desconocido, gestor = dueño → 400 con la lista', () => {
  const malos: unknown[] = [
    { ...cuerpo, nif: '12' },
    { ...cuerpo, dueno: { email: 'sin-arroba', nombre: 'x' } },
    { ...cuerpo, colorPrimario: 'verde' },
    { ...cuerpo, origenes: ['inventada'] },
    { ...cuerpo, gestor: { email: 'duena@ejemplo.es', nombre: 'Yo' } },
    { ...cuerpo, sector: 'astronautica' },
    { ...cuerpo, logoUrl: 'http://inseguro.es/logo.png' },
  ]
  for (const m of malos) assert.equal(validarEntradaAlta(m, HOY).ok, false, JSON.stringify(m))
  const v = validarEntradaAlta(cuerpo, HOY)
  assert.ok(v.ok)
  assert.equal(v.ok && v.valor.nif, 'B12345678')
  assert.equal(v.ok && v.valor.dueno.email, 'duena@ejemplo.es')
  assert.equal(v.ok && v.valor.forma, 'sociedad', 'B… = sociedad (deducida)')
  assert.equal(v.ok && v.valor.sector, 'generico', 'sin sector: la plantilla genérica (último eslabón de la precedencia)')
})

test('forma deducida del NIF: DNI/NIE = autónomo, entidad = sociedad; si no encaja, se exige explícita', () => {
  assert.equal(formaDesdeNif('28823484E'), 'autonomo')
  assert.equal(formaDesdeNif('X1234567L'), 'autonomo')
  assert.equal(formaDesdeNif('B12345678'), 'sociedad')
  assert.equal(formaDesdeNif('ABCDEFGH1'), null)
  assert.equal(validarEntradaAlta({ ...cuerpo, nif: 'ABCDEFGH1' }, HOY).ok, false)
  assert.equal(validarEntradaAlta({ ...cuerpo, nif: 'ABCDEFGH1', forma: 'sociedad' }, HOY).ok, true)
})
