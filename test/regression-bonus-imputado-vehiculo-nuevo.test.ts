// Cepo del bonus imputado a un vehículo NUEVO (03/10/2026, Alberto): «el vehículo es nuevo, el
// historial es del conductor». Vigila el CABLEADO que los tests puros no ven:
//   1. auto-nuevo y moto-nuevo (y sus precalificar-*) imputan el seguro anterior del cliente — ya no
//      cotizan de calle por defecto — y dejan anotado si el bonus fue supuesto;
//   2. emitir corta con 422 un bonus supuesto sin verificar ANTES de cualquier llamada al vendor.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const leer = (f: string) => readFileSync(join(ROOT, f), 'utf8')
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')

const LIB = 'apps/asegura/lib/retarificar-cartera.ts'

test('auto/moto nuevo imputan el seguro anterior antes de las correcciones del corredor', () => {
  const src = sinComentarios(leer(LIB))
  for (const fn of ['prepararRetarificacionNuevaAuto', 'prepararRetarificacionNuevaMoto']) {
    const i = src.indexOf(`export async function ${fn}(`)
    assert.ok(i >= 0, fn)
    const cuerpo = src.slice(i, src.indexOf('\nexport ', i + 10))
    assert.match(cuerpo, /imputarSeguroAnterior\(/, `${fn} debe imputar el seguro anterior`)
    assert.match(cuerpo, /\.\.\.pre\.datos,\s*\.\.\.\(imp\.historial\?\.datos \?\? \{\}\),\s*\.\.\.limpiarCorrecciones/, `${fn}: precalificación < imputado < correcciones`)
    assert.match(cuerpo, /bonusSupuestoFinal\(datos, cuerpo\.correcciones/, `${fn}: el bonus supuesto se decide con los datos FINALES`)
  }
})

test('las rutas que pagan pasan el override y anotan el bonus tras guardar', () => {
  for (const r of ['auto-nuevo', 'moto-nuevo']) {
    const src = sinComentarios(leer(`apps/asegura/app/api/operador/codeoscopic/${r}/route.ts`))
    assert.match(src, /seguroAnteriorId:/, `${r}: override del corredor`)
    assert.match(src, /sinSeguroAnterior: true/, `${r}: apagar el seguro anterior`)
    const cot = src.indexOf('await cotizar(')
    const anota = src.indexOf('anotarBonusTarificacion(')
    assert.ok(cot > 0 && anota > cot, `${r}: la marca se escribe DESPUÉS de cotizar (con la tarificación guardada)`)
  }
  for (const r of ['precalificar-auto-nuevo', 'precalificar-moto-nuevo']) {
    const src = sinComentarios(leer(`apps/asegura/app/api/operador/codeoscopic/${r}/route.ts`))
    assert.match(src, /imputarSeguroAnterior\(/, `${r}: propone la póliza imputada`)
    assert.match(src, /seguroAnterior,\n/, `${r}: la devuelve en la respuesta`)
  }
})

test('emitir: el bonus supuesto se comprueba ANTES de llamar al vendor y corta con 422', () => {
  const src = sinComentarios(leer('apps/asegura/app/api/operador/codeoscopic/emitir/route.ts'))
  const corte = src.indexOf('decidirBloqueoBonus(')
  assert.ok(corte > 0, 'emitir debe decidir el bloqueo del bonus')
  for (const vendor of ['leerProyectoCrudo(', 'enviarEmision(', 'camposDeEmision(', 'completarPersonas(']) {
    const i = src.indexOf(vendor, src.indexOf('export const POST'))
    assert.ok(i > corte, `el corte del bonus debe ir antes de ${vendor}`)
  }
  const tramo = src.slice(corte, src.indexOf('if (deCuerpo', corte))
  assert.match(tramo, /status: 422/, 'un bonus sin verificar es 422')
})

test('la matrícula solo se relaja en vehículo NUEVO: retarificar una póliza sigue exigiéndola', () => {
  const src = sinComentarios(leer(LIB))
  const tramo = (ini: string, fin: string) => src.slice(src.indexOf(ini), src.indexOf(fin, src.indexOf(ini) + 10))
  assert.match(tramo('export async function prepararRetarificacionNuevaAuto(', '\nexport '), /revisarDatosAuto\(datos, \{ vehiculoNuevo: true \}\)/)
  assert.match(tramo('export async function prepararRetarificacionNuevaMoto(', '\nexport '), /revisarDatosMoto\(datos, \{ vehiculoNuevo: true \}\)/)
  for (const f of ['async function prepararAuto(', 'async function prepararMoto(']) {
    assert.doesNotMatch(tramo(f, '\n}\n'), /vehiculoNuevo/, `${f} no debe relajar la matrícula`)
  }
})
