// Cepo: dos pólizas de la MISMA compañía y ramo no pueden salir idénticas.
//
// ─── Qué protege ────────────────────────────────────────────────────────────
// Visto el 06/09/2026 en el portal, en «Seguros que te han autorizado a ver»:
// dos hogar de Occident con el mismo título («Occident · Hogar»), la misma
// etiqueta de titular y la misma segunda línea. Solo se distinguían por la
// fecha de vencimiento, que nadie se sabe.
//
// No era un fallo de datos: es que `tituloDePoliza` se cae a `compañía · ramo`
// cuando no hay bien que enseñar, y a un TERCERO la dirección del hogar se le
// capa a propósito (`NUNCA_A_UN_TERCERO.direccionRiesgo`, porque la casa donde
// duerme quien te autorizó no es un dato del contrato). Con el título y la
// segunda línea repitiendo lo mismo, la fila deja de identificar nada.
//
// El desempate es el número de póliza, que YA se sirve desde el nivel más bajo
// (`TARJETA.numeroPoliza === true`): no abre ningún dato nuevo.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const RAIZ = new URL('..', import.meta.url).pathname
const FILA = readFileSync(`${RAIZ}apps/asegura-portal/app/(portal)/boveda/FilaPoliza.tsx`, 'utf8')
const ACCESO = readFileSync(`${RAIZ}packages/module-seguros-portal/src/acceso.ts`, 'utf8')

/** Sin comentarios: la explicación de arriba contiene los propios literales. */
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const CODIGO = sinComentarios(FILA)

test('🚨 cuando el titulo NO es el bien, la fila se distingue por el numero de poliza', () => {
  // La rama que importa es la del `else` de `tituloEsBien`: ahí el título ya es
  // «compañía · ramo», así que la segunda línea tiene que aportar otra cosa.
  assert.match(
    CODIGO,
    /tituloEsBien\(p\)\s*\?[^\n]*:\s*p\.numeroPoliza\s*\?/,
    'sin bien que enseñar, la fila necesita el número de póliza para no salir idéntica a su hermana',
  )
})

test('🚨 el numero de poliza se sirve desde el nivel MAS BAJO (si no, esto seria un hueco)', () => {
  // Si algún día `numeroPoliza` dejara de estar en TARJETA, el desempate de
  // arriba sería `null` justo para quien más lo necesita —el tercero, que es
  // quien no ve la dirección— y volveríamos a dos filas iguales sin que nada
  // fallara. El cepo mira el nivel, no la fila.
  const i = ACCESO.indexOf('const TARJETA')
  assert.notEqual(i, -1, 'TARJETA tiene que seguir siendo el suelo de visibilidad')
  const cuerpo = ACCESO.slice(i, ACCESO.indexOf('\n}', i))
  assert.match(cuerpo, /numeroPoliza:\s*true/, 'el número de póliza es el desempate: no puede caparse')
})

test('🚨 y el desempate NO puede ser la direccion del riesgo', () => {
  // Sería lo más legible y es justo lo que NO se puede hacer: a un tercero la
  // dirección del hogar del otorgante se le capa a propósito.
  assert.doesNotMatch(
    CODIGO,
    /direccionRiesgo|bien\.ubicacion/,
    'la fila no puede desempatar con la dirección: está capada para un tercero',
  )
})
