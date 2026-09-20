import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Fallo real de Alberto (20/09/2026): el presupuesto de auto para un LEAD
// (sin póliza en la cartera) cotizaba SIEMPRE «de calle» (`aseguradoAntes:
// false` fijo en `precalificarAutoNueva()`, asegura) — nunca se preguntaba si
// el cliente tiene seguro en vigor, así que la compañía no podía hacer el
// control de antecedentes y el precio no era confirmable como real. Para un
// cliente YA en la cartera esto no hacía falta (`polizaAnterior` sale de su
// póliza real, ver `desde-cartera.ts`); el hueco era solo en LEADS.
//
// El backend ya aceptaba estos campos por el mecanismo GENÉRICO de
// `correcciones` (`limpiarCorrecciones<DatosAuto>`, `retarificar-cartera.ts`):
// no hizo falta tocar asegura, solo faltaba la pantalla. Este guardián vigila
// que la pantalla siga ofreciendo el bloque — es UI pura, sin lib que testear
// con `node --test`, así que se lee el FUENTE (ni tsc ni el build lo cazan).

const RUTA = join(
  import.meta.dirname,
  '..',
  'apps/plataforma/app/(usuario)/correduria/cliente/[id]/auto-nuevo/AutoNuevo.tsx',
)
const fuente = readFileSync(RUTA, 'utf8')

test('el bloque de "seguro en vigor" existe y es OPT-IN (apagado por defecto)', () => {
  assert.match(fuente, /tieneSeguroActual, setTieneSeguroActual\] = useState\(false\)/)
  assert.match(fuente, /Sí, tiene un seguro de auto en vigor ahora mismo/)
})

test('activarlo manda los CINCO campos que el vendor exige juntos, nunca aseguradoAntes suelto', () => {
  const cotizar = fuente.slice(fuente.indexOf('async function cotizar()'), fuente.indexOf('return (\n    <div'))
  assert.match(cotizar, /if \(tieneSeguroActual\) \{/)
  // Líneas activas dentro del cuerpo del `if`, sin comentarios: una asignación
  // comentada («// correccionesFinal.x = …») sigue conteniendo la subcadena y
  // pasaría el `assert.match` de abajo si no se filtra — visto fallar en real
  // al probar este cepo (comentar la línea NO puso el test en rojo la 1ª vez).
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
