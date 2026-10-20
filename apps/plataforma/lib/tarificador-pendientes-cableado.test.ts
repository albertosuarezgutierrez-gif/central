// Cepo de cableado (20/10/2026): lee el FUENTE de lo que tsc no ve. Los tres bloques de motor, los chips por compañía y el aviso
// de guardado fallido tienen que seguir enchufados.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const base = join(import.meta.dirname, '..', 'app', '(usuario)', 'correduria')
const leer = (...p: string[]) => readFileSync(join(base, ...p), 'utf8')
const bots = leer('cliente', '[id]', 'PrecioBots.tsx')
const riesgo = leer('oportunidad', '[id]', 'RiesgoPantalla.tsx')
const piezas = leer('cliente', '[id]', 'PendientesMotor.tsx')

test('RiesgoPantalla: Personas, Riesgo y Póliza van en BloqueMotor dentro del proveedor', () => {
  assert.match(riesgo, /<PendientesMotorProvider>/)
  for (const b of ['personas', 'riesgo', 'poliza']) assert.match(riesgo, new RegExp(`<BloqueMotor bloque="${b}" activo=\\{motor\\}>`), b)
  assert.match(riesgo, /const motor = op\.ramo === 'auto' \|\| op\.ramo === 'moto'/)
})

test('PrecioBots (motor): sin campos sueltos ni inventario por compañía; chips + pendientes por bloque + guardado con motivo', () => {
  assert.match(bots, /\{!esMotor && adaptador\.campos\.map/, 'los campos sueltos solo se pintan en ramos que no son de motor')
  assert.match(bots, /checklist=\{esMotor \? undefined : check\}/, 'el inventario «Datos que pide…» no sale en motor')
  assert.match(bots, /<ChipsCompanias panel=\{panel\} \/>/)
  assert.match(bots, /pendientesConGenerales\(pendientesPorBloque\(/)
  assert.match(bots, /textoErrorGuardado\(r\.status, r\.json\)/, 'el motivo del servidor se muestra')
  assert.match(bots, /cuerpoGuardarCompania\(/, 'compañía anterior: UNA sola función de guardado')
  assert.match(bots, /integ\.estado === 'ok' && lista\.length > 0/, 'sin la lista de compañías leída NO se publica «todo listo»')
})

test('PendientesMotor: lo completo plegado, fallido = «No guardado» + campo marcado, y la ficha no pinta valores', () => {
  assert.match(piezas, /<details id=\{`\$\{idBloqueMotor\(bloque\)\}-completo`\}/)
  assert.match(piezas, /No guardado: /)
  assert.match(piezas, /aria-invalid=\{mal \|\| undefined\}/)
  assert.match(piezas, /Se toma de la ficha: \{v\.deLaFicha\.map\(\(p\) => p\.etiqueta\)/)
  assert.match(piezas, /minHeight: 44/)
  assert.match(piezas, /gridTemplateColumns: 'minmax\(0, 1fr\)'/)
})
