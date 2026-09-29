import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Espejo de `regression-auto-nuevo-historial.test.ts`: el mismo fallo real de
// Alberto (20/09/2026) — el presupuesto de moto para un LEAD cotizaba SIEMPRE
// «de calle» (`aseguradoAntes: false` fijo en `precalificarMotoNueva()`,
// asegura) — se replicó aquí porque `MotoNuevo.tsx` es la hermana de
// `AutoNuevo.tsx` y tenía el mismo hueco. El backend ya aceptaba estos campos
// por el mecanismo GENÉRICO de `correcciones`, así que tampoco aquí hizo
// falta tocar asegura, solo la pantalla.

const RUTA = join(
  import.meta.dirname,
  '..',
  'apps/plataforma/app/(usuario)/correduria/cliente/[id]/moto-nuevo/MotoNuevo.tsx',
)
const fuente = readFileSync(RUTA, 'utf8')

// 29/09/2026: arranca encendido SOLO si hay una póliza suya leída (`anterior`, de su oportunidad);
// sin ella sigue apagado. Nunca `useState(true)`: cotizar «asegurado antes» sin saberlo es mentir al vendor.
test('el bloque de "seguro en vigor" existe y es OPT-IN (apagado salvo póliza leída)', () => {
  assert.match(fuente, /tieneSeguroActual, setTieneSeguroActual\] = useState\(anterior !== null\)/)
  assert.match(fuente, /anterior = null,/, 'sin póliza leída, `anterior` es null → apagado')
  assert.match(fuente, /Sí, tiene un seguro de moto en vigor ahora mismo/)
})

test('activarlo manda los CINCO campos que el vendor exige juntos, nunca aseguradoAntes suelto', () => {
  const cotizar = fuente.slice(fuente.indexOf('async function cotizar()'), fuente.indexOf('return (\n    <div'))
  assert.match(cotizar, /if \(tieneSeguroActual\) \{/)
  // Líneas activas dentro del cuerpo del `if`, sin comentarios (ver el bug real
  // que cazó este mismo cepo en `regression-auto-nuevo-historial.test.ts`).
  const lineasActivas = cotizar
    .slice(cotizar.indexOf('if (tieneSeguroActual)'))
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n')
  for (const campo of [
    'aseguradoAntes',
    'companiaAnteriorCodigo',
    'polizaAnterior',
    'aniosAsegurado',
    'aniosEnCompania',
    'aniosSinSiniestros',
  ]) {
    assert.match(lineasActivas, new RegExp(`correccionesFinal\\.${campo}\\s*=`), `falta mandar ${campo} (activo, no comentado)`)
  }
})

test('sin el toggle, el botón no exige ningún dato de historial (comportamiento de antes intacto)', () => {
  assert.match(fuente, /faltaHistorial =\s*\n\s*tieneSeguroActual &&/)
})

test('el aviso de las compañías que despistan con ceros (Mapfre) sigue en la ayuda del campo de póliza', () => {
  assert.match(fuente, /Mapfre y otras compañías a veces dan dígitos con ceros a propósito/)
  assert.match(fuente, /el competidor no pueda consultar la siniestralidad/)
})

test('el desplegable de compañías degrada a texto libre si el directorio no se pudo leer', () => {
  assert.match(fuente, /companias === null \? \(/)
  assert.match(fuente, /Código DGS/)
})

test('MotoNuevo: los km al año van como corrección solo si se escriben (vacío = supuesto de la media)', () => {
  const src = readFileSync(new URL('../apps/plataforma/app/(usuario)/correduria/cliente/[id]/moto-nuevo/MotoNuevo.tsx', import.meta.url), 'utf8')
  assert.match(src, /const kmLeidos = kilometrosDesdeTexto\(kmAnuales\)/)
  assert.match(src, /\.\.\.\(kmLeidos !== null \? \{ kmAnuales: kmLeidos \} : \{\}\),/)
  // Un km mal escrito apaga el botón: no se paga un precio con un dato que no se ha entendido.
  assert.match(src, /faltaHistorial \|\| kmInvalido/)
})

test('MotoNuevo: la moto de la última tarificación se precarga sin pisar lo tecleado, y la media supuesta no pasa a km declarados', () => {
  const src = readFileSync(new URL('../apps/plataforma/app/(usuario)/correduria/cliente/[id]/moto-nuevo/MotoNuevo.tsx', import.meta.url), 'utf8')
  assert.match(src, /setCodigoVehiculo\(\(c\) => c \|\| v\.codigoVehiculo\)/)
  assert.match(src, /setMatricula\(\(m\) => m \|\| v\.matricula!\)/)
  assert.match(src, /v\.kmAnuales !== null && v\.kmAnuales !== KM_ANUALES_SUPUESTOS/)
  // Se puede volver al catálogo: la moto previa no es una trampa.
  assert.match(src, /Elegir otra moto/)
})

// 29/09/2026 (Alberto): los años no se teclean. Sin dato se declara el máximo y la compañía lo
// contrasta con SINCO por el nº de póliza. Si vuelven a nacer vacíos, el botón se apaga y hay que teclearlos.
test('los años del historial nacen en el máximo (o lo leído), no vacíos', () => {
  assert.match(fuente, /useState\(String\(historial\.aniosAsegurado\)\)/)
  assert.match(fuente, /useState\(String\(historial\.aniosSinSiniestros\)\)/)
  const lib = readFileSync(join(import.meta.dirname, '..', 'packages/module-seguros/src/historial-maximo.ts'), 'utf8')
  assert.match(lib, /HISTORIAL_MAXIMO = \{ aniosAsegurado: 10, aniosEnCompania: 10, aniosSinSiniestros: 10, siniestrosUltimos5: 0 \}/)
})
