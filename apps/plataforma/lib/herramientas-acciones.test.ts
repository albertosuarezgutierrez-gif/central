import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ACCIONES_CUENTA, esAccionCuenta } from './herramientas-acciones.ts'

const cliente = readFileSync(new URL('../app/(usuario)/operador/empresas/EmpresasClient.tsx', import.meta.url), 'utf8')
const rutaPlataforma = readFileSync(new URL('../app/api/operador/empresas/[id]/route.ts', import.meta.url), 'utf8')
const rutaEmpresa = readFileSync(new URL('../../empresa/app/api/operador/cuentas/[id]/route.ts', import.meta.url), 'utf8')

test('I-5: rol_app se acepta (cambio de rol por herramienta) y lo desconocido no', () => {
  assert.equal(esAccionCuenta('rol_app'), true)
  assert.equal(esAccionCuenta('borrar_todo'), false)
  assert.equal(esAccionCuenta(undefined), false)
  assert.match(rutaPlataforma, /esAccionCuenta\(b\.accion\)/, 'la ruta de plataforma debe filtrar con esAccionCuenta')
})

test('CEPO toda acción que envía EmpresasClient está en la lista', () => {
  const enviadas = new Set([...cliente.matchAll(/accion: '([a-z_]+)'/g)].map((m) => m[1]))
  for (const t of cliente.matchAll(/tipo: '(reenviar)' \| '(recordatorio)'/g)) { enviadas.add(t[1]); enviadas.add(t[2]) }
  assert.ok(enviadas.has('rol_app'))
  for (const a of enviadas) assert.ok(esAccionCuenta(a), `EmpresasClient envía «${a}» y plataforma la rechazaría (400)`)
})

test('CEPO la lista = los case de la ruta del operador en apps/empresa (ni de más ni de menos)', () => {
  const casos = new Set([...rutaEmpresa.matchAll(/case '([a-z_]+)':/g)].map((m) => m[1]))
  assert.deepEqual([...casos].sort(), [...ACCIONES_CUENTA].sort())
})

test('rol_app: el cliente manda personaId + herramienta + rolApp y empresa lee esos mismos campos', () => {
  assert.match(cliente, /accion: 'rol_app', personaId: m\.persona_id, herramienta: h, rolApp: x\.target\.value/)
  const caso = rutaEmpresa.slice(rutaEmpresa.indexOf("case 'rol_app'"), rutaEmpresa.indexOf("case 'origen'"))
  assert.match(caso, /uuidONull\(b\.personaId\)/); assert.match(caso, /esHerramienta\(b\.herramienta\)/)
  assert.match(caso, /esRolApp\(b\.herramienta, b\.rolApp\)/); assert.match(caso, /opFijarRolApp\(/)
})
