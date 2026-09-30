import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fusionarInfoRiesgo, aplicarEdicionVehiculo, datosVehiculoVacios, leerDatosVehiculo } from '@central/module-seguros'

// Datos del vehículo del riesgo (30/09/2026): `info_riesgo.datosVehiculo` es la clave NUEVA; la `vehiculo`
// de texto tiene datos viejos y NO se pisa. Lo que vigila esto vive en SQL y en una ruta que importa el
// cliente Prisma (el job de tests corre sin `prisma generate`): por eso se lee el FUENTE.

const RAIZ = new URL('..', import.meta.url).pathname
const sinComentarios = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const leer = (rel: string) => sinComentarios(readFileSync(join(RAIZ, rel), 'utf8'))
const cuerpoDe = (src: string, nombre: string) => {
  const i = src.indexOf(`export async function ${nombre}`)
  assert.ok(i >= 0, `falta ${nombre}`)
  const j = src.indexOf('\nexport ', i + 10)
  return src.slice(i, j < 0 ? undefined : j)
}
function fuentes(dir: string, salida: string[] = []): string[] {
  for (const n of readdirSync(join(RAIZ, dir))) {
    const rel = `${dir}/${n}`
    if (statSync(join(RAIZ, rel)).isDirectory()) { if (n !== 'node_modules') fuentes(rel, salida) }
    else if (/\.tsx?$/.test(n) && !/\.test\./.test(n)) salida.push(rel)
  }
  return salida
}

test('el PATCH conserva las claves ajenas y no toca la `vehiculo` de texto', () => {
  const info = { origen: 'retencion', polizaId: 'p1', vehiculo: 'SEAT Ibiza 1.0', matricula: '1234BCD' }
  const { datos } = aplicarEdicionVehiculo(leerDatosVehiculo(undefined), { marca: 'SEAT', matricula: '1234BCD' }, { confirmar: false, ahora: 'T' })
  const out = fusionarInfoRiesgo(info, datos)
  assert.equal(out.vehiculo, 'SEAT Ibiza 1.0')
  assert.equal(out.origen, 'retencion')
  assert.equal(out.polizaId, 'p1')
  assert.equal(out.matricula, '1234BCD')
})

test('editar borra confirmadoAt; confirmar lo sella', () => {
  const sellado = { ...datosVehiculoVacios(), matricula: '1234BCD', confirmadoAt: '2026-09-29T10:00:00Z' }
  assert.equal(aplicarEdicionVehiculo(sellado, { garaje: 'Garage' }, { confirmar: false, ahora: 'T' }).datos.confirmadoAt, null)
  assert.equal(aplicarEdicionVehiculo(sellado, {}, { confirmar: true, ahora: 'T' }).datos.confirmadoAt, 'T')
})

test('editarDatosVehiculo: acotada a la correduría, fila bloqueada, fusiona con la función pura y deja historial', () => {
  const c = cuerpoDe(leer('lib/oportunidad-riesgo.ts'), 'editarDatosVehiculo')
  assert.match(c, /correduria_id = \$\{correduriaId\}::uuid/)
  assert.match(c, /for update/, 'lectura y escritura en una transacción con la fila bloqueada')
  assert.match(c, /validarDatosVehiculoRiesgo\(/)
  assert.match(c, /aplicarEdicionVehiculo\(/)
  assert.match(c, /fusionarInfoRiesgo\(/, 'la fusión que se testea es la que se escribe')
  assert.match(c, /oportunidad_historial/)
  assert.match(c, /admiteDatosVehiculo\(op\.tipo\)/, 'solo auto y moto')
  assert.match(c, /status: 400/)
})

test('el PATCH del riesgo va con auditado(), correduría única y 403 si el cuerpo trae otra', () => {
  const r = leer('app/api/operador/oportunidad/riesgo/route.ts')
  assert.match(r, /export const PATCH = auditado\(/)
  assert.match(r, /operadorAutorizado\(req\)/)
  assert.match(r, /correduriaUnica\(\)/)
  assert.match(r, /status: 403/)
  assert.match(r, /editarDatosVehiculo\(correduria\.id/)
})

test('el write-back nunca lanza y se hace tras guardar la tarificación, sin repetir la cotización', () => {
  const c = cuerpoDe(leer('lib/oportunidad-riesgo.ts'), 'anotarVehiculoDeCotizacion')
  assert.match(c, /try \{[\s\S]*\} catch/)
  assert.match(c, /console\.error/)
  assert.match(c, /confirmar: false/, 'una cotización no confirma nada')
  for (const ruta of ['auto-nuevo', 'moto-nuevo']) {
    const r = leer(`app/api/operador/codeoscopic/${ruta}/route.ts`)
    const iCotizar = r.indexOf('await cotizar(p.peticion)')
    const iAnotar = r.indexOf('anotarVehiculoDeCotizacion(')
    assert.ok(iCotizar > 0 && iAnotar > iCotizar, `${ruta}: el write-back va DESPUÉS de cotizar`)
    assert.equal((r.match(/await cotizar\(/g) ?? []).length, 1, `${ruta}: una sola llamada que cuesta dinero`)
    assert.match(r.slice(iCotizar, iAnotar + 200), /guardado\.estado === 'guardada'/, `${ruta}: solo con la tarificación ya guardada`)
  }
})

// El cepo: nadie escribe la clave `vehiculo` (texto) de info_riesgo. Es el dato viejo, y los nuevos van en `datosVehiculo`.
test('CEPO: ningún fuente de asegura escribe la clave `vehiculo` de info_riesgo', () => {
  const culpables: string[] = []
  const ESCRITURAS: Array<[string, RegExp]> = [
    ['jsonb_set sobre {vehiculo}', /jsonb_set\s*\([^)]*['"{]vehiculo['"}]/],
    ['ruta {vehiculo}', /['"]\{vehiculo\}['"]/],
    ['jsonb_build_object con \'vehiculo\'', /jsonb_build_object\s*\([^)]*['"]vehiculo['"]\s*,/],
    ['literal JSON "vehiculo":', /["']vehiculo["']\s*:/],
  ]
  for (const rel of [...fuentes('lib'), ...fuentes('app')]) {
    const t = leer(rel)
    for (const [que, re] of ESCRITURAS) if (re.test(t)) culpables.push(`${rel}: ${que}`)
  }
  // En el código nuevo, ni como clave de objeto que acabe en info_riesgo.
  const nuevo = leer('lib/oportunidad-riesgo.ts')
  for (const f of ['editarDatosVehiculo', 'anotarVehiculoDeCotizacion']) {
    const c = cuerpoDe(nuevo, f)
    if (/(?<![\w.])vehiculo\s*:/.test(c) || /['"`]vehiculo['"`]/.test(c)) culpables.push(`lib/oportunidad-riesgo.ts ${f}: escribe la clave vehiculo`)
  }
  assert.deepEqual(culpables, [], `escriben info_riesgo.vehiculo (texto): ${culpables.join('; ')}`)
})
