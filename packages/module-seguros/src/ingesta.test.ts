import test from 'node:test'
import assert from 'node:assert/strict'
import { saludIngesta, detalleSalud, DIAS_CUARENTENA_RECIENTE } from './ingesta.ts'

const f = (tipo: string, entidad: string, dias: number) => ({ tipo, entidad, dias })

test('sin poder leer NO es «está bien»: es sin_datos y lo dice', () => {
  const s = saludIngesta({ cuarentena: null })
  assert.equal(s.estado, 'sin_datos')
  assert.match(s.motivos[0], /NO significa que vaya bien/)
  assert.match(detalleSalud(s), /no se ha podido comprobar/)
})

test('lista vacía SÍ es «comprobado que no hay»', () => {
  const s = saludIngesta({ cuarentena: [] })
  assert.equal(s.estado, 'ok')
  assert.equal(s.total, 0)
  assert.match(detalleSalud(s), /sin ficheros atascados/)
})

test('un fichero atascado ESTA semana degrada y señala a la entidad', () => {
  const s = saludIngesta({ cuarentena: [f('SIN', 'C0468', 2), f('REC', 'C0468', 5)] })
  assert.equal(s.estado, 'degradada')
  assert.equal(s.recientes, 2)
  assert.equal(s.porEntidad[0].entidad, 'C0468')
  assert.match(s.motivos[0], /C0468/)
})

test('el backlog viejo se informa pero NO despierta a nadie', () => {
  const s = saludIngesta({ cuarentena: [f('REC', 'C0468', 60), f('SIN', 'C0468', 45)] })
  assert.equal(s.estado, 'ok')
  assert.equal(s.total, 2)
  assert.equal(s.recientes, 0)
  assert.match(detalleSalud(s), /backlog antiguo/)
})

test('el caso real del 01/09: 41 en cuarentena, uno de anteayer → degradada', () => {
  const viejos = Array.from({ length: 40 }, () => f('REC', 'C0468', 50))
  const s = saludIngesta({ cuarentena: [...viejos, f('SIN', 'C0468', 2)], huerfanas: 19, primaPerdida: 7721.71 })
  assert.equal(s.estado, 'degradada')
  assert.equal(s.total, 41)
  assert.equal(s.recientes, 1)
  assert.equal(s.huerfanas, 19)
  assert.equal(s.primaPerdida, 7721.71)
  assert.match(s.motivos.join(' '), /no encuentran su póliza/)
  assert.match(s.motivos.join(' '), /40 más arrastrados/)
})

test('pólizas huérfanas degradan aunque no haya nada reciente en cuarentena', () => {
  const s = saludIngesta({ cuarentena: [], huerfanas: 3 })
  assert.equal(s.estado, 'degradada')
})

test('huérfanas a cero es distinto de huérfanas sin medir', () => {
  assert.equal(saludIngesta({ cuarentena: [], huerfanas: 0 }).huerfanas, 0)
  assert.equal(saludIngesta({ cuarentena: [] }).huerfanas, null)
  assert.equal(saludIngesta({ cuarentena: [], huerfanas: null }).huerfanas, null)
})

test('un tipo que lleva más de un mes sin guardar nada se canta', () => {
  const s = saludIngesta({ cuarentena: [f('SIN', 'C0468', 1)], diasSinPersistir: { SIN: 61, REC: 3 } })
  assert.match(s.motivos.join(' '), /SIN: 61 días sin guardar/)
  assert.doesNotMatch(s.motivos.join(' '), /REC: 3/)
})

test('«no consta» en días sin persistir no inventa una alarma', () => {
  const s = saludIngesta({ cuarentena: [], diasSinPersistir: { SIN: null } })
  assert.equal(s.estado, 'ok')
  assert.deepEqual(s.motivos, [])
})

test('la ventana reciente es configurable y por defecto son 7 días', () => {
  assert.equal(DIAS_CUARENTENA_RECIENTE, 7)
  assert.equal(saludIngesta({ cuarentena: [f('REC', 'C0058', 20)] }).estado, 'ok')
  assert.equal(saludIngesta({ cuarentena: [f('REC', 'C0058', 20)] }, 30).estado, 'degradada')
})

test('el reparto por entidad ordena por volumen: dice a quién preguntar', () => {
  const s = saludIngesta({
    cuarentena: [f('REC', 'C0109', 1), f('REC', 'C0468', 1), f('SIN', 'C0468', 2), f('POL', 'C0468', 3)],
  })
  assert.deepEqual(s.porEntidad, [{ entidad: 'C0468', n: 3 }, { entidad: 'C0109', n: 1 }])
})

test('🔑 el reparto va por CLAVE DE MEDIADOR: una compañía manda por varias', () => {
  // Caso real (01/09/2026): Occident manda por `8-92361`, `M00171` y `306333`.
  // La primera tenía sus 10 SIN en cuarentena mientras la segunda iba bien.
  // Decir solo «C0468» manda a revisar una cartera que no tiene el problema.
  const s = saludIngesta({
    cuarentena: [
      { tipo: 'SIN', entidad: 'C0468', clave: '8-92361', dias: 1 },
      { tipo: 'REC', entidad: 'C0468', clave: '8-92361', dias: 2 },
      { tipo: 'SIN', entidad: 'C0468', clave: 'M00171', dias: 3 },
    ],
  })
  assert.deepEqual(s.porEntidad, [{ entidad: 'C0468', n: 3 }])
  assert.deepEqual(s.porClave, [
    { entidad: 'C0468', clave: '8-92361', n: 2 },
    { entidad: 'C0468', clave: 'M00171', n: 1 },
  ])
  assert.match(s.motivos[0], /clave 8-92361/)
})

test('🚨 una clave ausente o de cajón NO se inventa: se agrupa como «no consta»', () => {
  const s = saludIngesta({
    cuarentena: [
      { tipo: 'REC', entidad: 'C0058', dias: 1 },
      { tipo: 'REC', entidad: 'C0058', clave: '  ', dias: 1 },
      { tipo: 'REC', entidad: 'C0058', clave: 'DESCONOCIDO', dias: 1 },
    ],
  })
  assert.deepEqual(s.porClave, [{ entidad: 'C0058', clave: null, n: 3 }])
  assert.match(s.motivos[0], /clave no legible/)
})

test('🩹 las huérfanas que YA están en cartera se cuentan aparte de las que no', () => {
  // Se arreglan en casa (reprocesar) frente a pedir la carga inicial de esa
  // clave. Contarlas juntas manda a preguntar a la compañía por algo que ya
  // está en la BD.
  const s = saludIngesta({ cuarentena: [], huerfanas: 20, huerfanasResolubles: 3 })
  assert.equal(s.estado, 'degradada')
  assert.equal(s.huerfanasResolubles, 3)
  assert.match(s.motivos.join(' · '), /3 de ellas YA están en la cartera/)
  assert.match(s.motivos.join(' · '), /17 no están en la cartera/)
})

test('🚨 sin saber cuántas son resolubles NO se afirma ninguna de las dos cosas', () => {
  const s = saludIngesta({ cuarentena: [], huerfanas: 20 })
  assert.equal(s.huerfanasResolubles, null)
  assert.doesNotMatch(s.motivos.join(' · '), /YA están en la cartera|no están en la cartera/)
})
