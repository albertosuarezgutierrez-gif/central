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

test('el bloque de "seguro en vigor" existe y es OPT-IN (apagado por defecto)', () => {
  assert.match(fuente, /tieneSeguroActual, setTieneSeguroActual\] = useState\(false\)/)
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
