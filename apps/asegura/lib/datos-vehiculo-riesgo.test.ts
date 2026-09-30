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
  const i = src.search(new RegExp(`(export )?async function ${nombre}\\b`))
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

test('editarDatosRiesgo: acotada a la correduría, fila bloqueada, usa la función pura y deja historial', () => {
  const c = cuerpoDe(leer('lib/oportunidad-riesgo.ts'), 'editarDatosRiesgo')
  assert.match(c, /correduria_id = \$\{correduriaId\}::uuid/)
  assert.match(c, /for update/, 'lectura y escritura en una transacción con la fila bloqueada')
  assert.match(c, /calcularEdicionRiesgo\(/, 'la lógica que se testea (validar, aplicar, sello, fusión) es la que se escribe')
  assert.match(c, /r\.infoNueva/, 'se escribe el info_riesgo que devuelve la función pura')
  assert.match(c, /oportunidad_historial/)
  assert.match(c, /precargaDePolizaDeOportunidad\(/, 'sin nada guardado se parte de la precarga de la póliza')
})

test('el PATCH del riesgo va con auditado(), correduría única, 403 si el cuerpo trae otra y UNA clave de datos', () => {
  const r = leer('app/api/operador/oportunidad/riesgo/route.ts')
  assert.match(r, /export const PATCH = auditado\(/)
  assert.match(r, /operadorAutorizado\(req\)/)
  assert.match(r, /correduriaUnica\(\)/)
  assert.match(r, /status: 403/)
  assert.match(r, /editarDatosRiesgo\(correduria\.id/)
  assert.match(r, /CLAVES_DATOS_RIESGO\.filter/, 'el discriminante sale de la lista cerrada de claves')
  assert.match(r, /claves\.length !== 1/, 'ni sin clave ni con dos')
})

test('el write-back nunca lanza y se hace tras guardar la tarificación, sin repetir la cotización', () => {
  const c = cuerpoDe(leer('lib/oportunidad-riesgo.ts'), 'anotarBloqueDeCotizacion')
  assert.match(c, /try \{[\s\S]*\} catch/)
  assert.match(c, /console\.error/)
  assert.match(c, /confirmar: false/, 'una cotización no confirma nada')
  const anotadores: Record<string, string> = {
    'auto-nuevo': 'anotarVehiculoDeCotizacion', 'moto-nuevo': 'anotarVehiculoDeCotizacion', 'hogar-nuevo': 'anotarViviendaDeCotizacion',
    'vida-nuevo': 'anotarCapitalDeCotizacion', 'salud-nuevo': 'anotarCapitalDeCotizacion', 'decesos-nuevo': 'anotarCapitalDeCotizacion',
  }
  for (const [ruta, anotador] of Object.entries(anotadores)) {
    const r = leer(`app/api/operador/codeoscopic/${ruta}/route.ts`)
    const iCotizar = r.indexOf('await cotizar(p.peticion)')
    const iAnotar = r.indexOf(`${anotador}(`, iCotizar)
    assert.ok(iCotizar > 0 && iAnotar > iCotizar, `${ruta}: el write-back va DESPUÉS de cotizar`)
    assert.equal((r.match(/await cotizar\(/g) ?? []).length, 1, `${ruta}: una sola llamada que cuesta dinero`)
    assert.match(r.slice(iCotizar, iAnotar + 200), /guardado\.estado === 'guardada'/, `${ruta}: solo con la tarificación ya guardada`)
  }
})

// Regla 9 (29/09/2026): una oportunidad sin sus tarificaciones enlazadas es una a la que no se puede emitir. Las seis
// pantallas de «pedir precio» del riesgo cuelgan la tarificación de la oportunidad con `contexto.oportunidadId`.
test('CEPO regla 9: hogar, vida, salud y decesos también cuelgan la tarificación de la oportunidad (como auto y moto)', () => {
  for (const [ruta, ramo] of [['auto-nuevo', 'auto'], ['moto-nuevo', 'moto'], ['hogar-nuevo', 'hogar'], ['vida-nuevo', 'vida'], ['salud-nuevo', 'salud'], ['decesos-nuevo', 'decesos']] as const) {
    const r = leer(`app/api/operador/codeoscopic/${ruta}/route.ts`)
    assert.match(r, new RegExp(`prepararVariante\\(correduria\\.id, \\{[\\s\\S]*?ramo: '${ramo}'`), `${ruta}: prepara la variante con su ramo`)
    assert.match(r, /p\.peticion\.contexto = \{ \.\.\.p\.peticion\.contexto, \.\.\.variante\.v\.contexto \}/, `${ruta}: la oportunidad viaja en el contexto de la cotización`)
    assert.ok(r.indexOf('p.peticion.contexto = ') < r.indexOf('await cotizar(p.peticion)'), `${ruta}: el contexto se completa ANTES de pagar`)
    assert.match(r, /correcciones: variante\.v\.correcciones/, `${ruta}: las correcciones son las de la variante`)
  }
  // Y la variante solo se cuelga de una oportunidad de su ramo.
  assert.match(cuerpoDe(leer('lib/oportunidad-riesgo.ts'), 'validarVariante'), /tipo::text = \$\{e\.ramo/, 'el ramo de la variante es el de la oportunidad')
})

test('la clave del bloque es la del ramo: una sola fuente de verdad (module-seguros)', () => {
  const c = cuerpoDe(leer('lib/oportunidad-riesgo.ts'), 'editarDatosRiesgo')
  assert.doesNotMatch(c, /datosVehiculo|datosVivienda|datosCapital|datosRiesgoLibre/, 'la ruta no decide qué clave toca a cada ramo: lo hace claveDatosDeRamo')
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
  for (const f of ['editarDatosRiesgo', 'anotarVehiculoDeCotizacion']) {
    const c = cuerpoDe(nuevo, f)
    if (/(?<![\w.])vehiculo\s*:/.test(c) || /['"`]vehiculo['"`]/.test(c)) culpables.push(`lib/oportunidad-riesgo.ts ${f}: escribe la clave vehiculo`)
  }
  assert.deepEqual(culpables, [], `escriben info_riesgo.vehiculo (texto): ${culpables.join('; ')}`)
})
