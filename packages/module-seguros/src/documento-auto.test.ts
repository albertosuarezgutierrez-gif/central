import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizarAutoLeido,
  autoLeidoVacio,
  seLeyoAlgo,
  camposLeidos,
  MARCADORES_SIN_DATO,
  CAMPOS_PERSONALES,
} from './documento-auto.ts'

// ─── Lo que no se pudo leer sale entero a null, nunca a medias ──────────────

test('una respuesta ilegible NO produce media póliza: todo a null', () => {
  for (const raw of [null, undefined, 42, 'texto', [], [{ matricula: '1234BCD' }]]) {
    assert.deepEqual(normalizarAutoLeido(raw), autoLeidoVacio())
  }
})

test('«no se ha leído nada» se distingue de «se leyó algo»', () => {
  assert.equal(seLeyoAlgo(autoLeidoVacio()), false)
  assert.equal(seLeyoAlgo(normalizarAutoLeido({ matricula: '1234BCD' })), true)
})

test('TODOS los marcadores de cajón se anulan — ninguno pasa como dato', () => {
  for (const m of MARCADORES_SIN_DATO) {
    const d = normalizarAutoLeido({ compania: m, marca: m.toUpperCase(), numeroPoliza: ` ${m} ` })
    assert.equal(d.compania, null, `«${m}» coló como compañía`)
    assert.equal(d.marca, null, `«${m}» coló como marca`)
    assert.equal(d.numeroPoliza, null, `«${m}» coló con espacios`)
  }
})

// ─── Matrícula: identificar OTRO coche es el fallo caro ─────────────────────

test('acepta los dos formatos españoles vivos y normaliza', () => {
  assert.equal(normalizarAutoLeido({ matricula: '1234 BCD' }).matricula, '1234BCD')
  assert.equal(normalizarAutoLeido({ matricula: 'se-1234-ab' }).matricula, 'SE1234AB')
  assert.equal(normalizarAutoLeido({ matricula: 'm1234ab' }).matricula, 'M1234AB')
})

test('lo que no es una matrícula NO se guarda como matrícula', () => {
  for (const m of ['1234', 'ABCDEF', '12345ABC', '1234AEI', 'X', '1234-BCD-X']) {
    assert.equal(normalizarAutoLeido({ matricula: m }).matricula, null, `«${m}» no es matrícula`)
  }
})

test('las vocales no se usan en las matrículas nuevas, y se rechazan', () => {
  // El alfabeto real excluye A, E, I, O, U y Q/Ñ: si el OCR lee una vocal,
  // ha leído mal — y una matrícula mal leída identifica a otro coche.
  assert.equal(normalizarAutoLeido({ matricula: '1234ABC' }).matricula, null)
})

// ─── DNI: la letra se comprueba, porque un DNI mal leído es otra persona ────

test('valida la letra del DNI y del NIE', () => {
  assert.equal(normalizarAutoLeido({ dni: '12345678Z' }).dni, '12345678Z')
  assert.equal(normalizarAutoLeido({ dni: ' 12345678-z ' }).dni, '12345678Z')
  assert.equal(normalizarAutoLeido({ dni: 'X1234567L' }).dni, 'X1234567L')
})

test('un DNI con la letra cambiada se ANULA, no se guarda', () => {
  for (const d of ['12345678A', '12345678', 'ABCDEFGHI', 'X1234567Z']) {
    assert.equal(normalizarAutoLeido({ dni: d }).dni, null, `«${d}» no debería pasar`)
  }
})

// ─── Fechas e importes ──────────────────────────────────────────────────────

test('solo acepta fechas aaaa-mm-dd que existan de verdad', () => {
  assert.equal(normalizarAutoLeido({ fechaEfecto: '2026-10-15' }).fechaEfecto, '2026-10-15')
  for (const f of ['15/10/2026', '2026-02-31', '2026-13-01', 'octubre', '2026-10']) {
    assert.equal(normalizarAutoLeido({ fechaEfecto: f }).fechaEfecto, null, `«${f}»`)
  }
})

test('la prima admite formato español y símbolo, pero 0 no es una prima', () => {
  assert.equal(normalizarAutoLeido({ primaAnual: '1.234,56 €' }).primaAnual, 1234.56)
  assert.equal(normalizarAutoLeido({ primaAnual: 380 }).primaAnual, 380)
  assert.equal(normalizarAutoLeido({ primaAnual: 0 }).primaAnual, null)
  assert.equal(normalizarAutoLeido({ primaAnual: -5 }).primaAnual, null)
})

// ─── 🚨 El cero de siniestros SÍ es un dato ─────────────────────────────────

test('CERO siniestros es una respuesta válida, no un hueco', () => {
  const d = normalizarAutoLeido({ siniestrosUltimos5: 0, aniosSinSiniestros: 0 })
  assert.equal(d.siniestrosUltimos5, 0)
  assert.equal(d.aniosSinSiniestros, 0)
  assert.ok(seLeyoAlgo(d), 'un 0 leído es haber leído algo')
})

test('pero un número imposible se anula', () => {
  for (const n of [-1, 1.5, 200, 'muchos']) {
    assert.equal(normalizarAutoLeido({ siniestrosUltimos5: n }).siniestrosUltimos5, null, `${n}`)
  }
})

// ─── Código DGS: es la clave del bonus, y tiene forma fija ──────────────────

test('el código DGS solo pasa con su forma C+4 dígitos', () => {
  assert.equal(normalizarAutoLeido({ codigoEntidadDgs: 'c0058' }).codigoEntidadDgs, 'C0058')
  for (const c of ['0058', 'C58', 'MAPFRE', 'C00588']) {
    assert.equal(normalizarAutoLeido({ codigoEntidadDgs: c }).codigoEntidadDgs, null, `«${c}»`)
  }
})

// ─── Contrato con el resto del sistema ──────────────────────────────────────

test('camposLeidos lista exactamente lo que NO es null', () => {
  const d = normalizarAutoLeido({ matricula: '1234BCD', compania: 'Mapfre', primaAnual: 0 })
  assert.deepEqual(camposLeidos(d).sort(), ['compania', 'matricula'])
  assert.deepEqual(camposLeidos(autoLeidoVacio()), [])
})

test('los campos personales están declarados y existen en el tipo', () => {
  const d = autoLeidoVacio()
  for (const c of CAMPOS_PERSONALES) {
    assert.ok(c in d, `${c} no existe en AutoLeido`)
  }
})

test('un objeto vacío devuelve todo a null sin lanzar', () => {
  assert.deepEqual(normalizarAutoLeido({}), autoLeidoVacio())
})

test('🚨 un texto NO numérico jamás se convierte en CERO siniestros', () => {
  // Regresión: limpiar «muchos» dejaba '' y Number('') es 0, o sea que
  // «muchos siniestros» se guardaba como «ninguno» — el error más caro posible,
  // porque abarata la prima sobre un historial que no es el que dice.
  for (const v of ['muchos', 'varios', 'sí', 'x', '--', 'tres']) {
    assert.equal(normalizarAutoLeido({ siniestrosUltimos5: v }).siniestrosUltimos5, null, `«${v}»`)
    assert.equal(normalizarAutoLeido({ aniosSinSiniestros: v }).aniosSinSiniestros, null, `«${v}»`)
  }
})

test('un entero escrito como texto sí se acepta', () => {
  assert.equal(normalizarAutoLeido({ siniestrosUltimos5: '2' }).siniestrosUltimos5, 2)
  assert.equal(normalizarAutoLeido({ siniestrosUltimos5: ' 0 ' }).siniestrosUltimos5, 0)
})
