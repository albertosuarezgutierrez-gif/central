import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizarHogarLeido,
  hogarLeidoVacio,
  seLeyoAlgoHogar,
  camposLeidosHogar,
  CAMPOS_PERSONALES_HOGAR,
} from './documento-hogar.ts'
import { MARCADORES_SIN_DATO } from './documento-auto.ts'

// ─── Lo que no se pudo leer sale entero a null, nunca a medias ──────────────

test('una respuesta ilegible NO produce media póliza: todo a null', () => {
  for (const raw of [null, undefined, 42, 'texto', [], [{ direccion: 'Calle Mayor 1' }]]) {
    assert.deepEqual(normalizarHogarLeido(raw), hogarLeidoVacio())
  }
})

test('«no se ha leído nada» se distingue de «se leyó algo»', () => {
  assert.equal(seLeyoAlgoHogar(hogarLeidoVacio()), false)
  assert.equal(seLeyoAlgoHogar(normalizarHogarLeido({ direccion: 'Calle Mayor 1' })), true)
})

test('TODOS los marcadores de cajón se anulan — ninguno pasa como dato', () => {
  for (const m of MARCADORES_SIN_DATO) {
    const d = normalizarHogarLeido({ compania: m, direccion: m.toUpperCase(), numeroPoliza: ` ${m} ` })
    assert.equal(d.compania, null, `«${m}» coló como compañía`)
    assert.equal(d.direccion, null, `«${m}» coló como dirección`)
    assert.equal(d.numeroPoliza, null, `«${m}» coló con espacios`)
  }
})

// ─── El código postal es texto, nunca número (Álava/Albacete/Alicante) ──────

test('el CP exige 5 dígitos y conserva el cero inicial', () => {
  assert.equal(normalizarHogarLeido({ cp: '01001' }).cp, '01001')
  assert.equal(normalizarHogarLeido({ cp: '41003' }).cp, '41003')
  for (const c of ['1001', '410030', 'ABCDE', '410 3']) {
    assert.equal(normalizarHogarLeido({ cp: c }).cp, null, `«${c}»`)
  }
})

// ─── Metros y año: rangos plausibles, no cualquier número ───────────────────

test('metros cuadrados y año de construcción exigen rango', () => {
  assert.equal(normalizarHogarLeido({ metrosCuadrados: 90 }).metrosCuadrados, 90)
  assert.equal(normalizarHogarLeido({ metrosCuadrados: 0 }).metrosCuadrados, null)
  assert.equal(normalizarHogarLeido({ metrosCuadrados: -5 }).metrosCuadrados, null)
  assert.equal(normalizarHogarLeido({ anioConstruccion: 1994 }).anioConstruccion, 1994)
  assert.equal(normalizarHogarLeido({ anioConstruccion: 1500 }).anioConstruccion, null)
  assert.equal(normalizarHogarLeido({ anioConstruccion: 3000 }).anioConstruccion, null)
})

// ─── Capitales: un 0 no es una respuesta, es un «no lo he leído» ────────────

test('un capital a 0€ se anula, como la prima', () => {
  assert.equal(normalizarHogarLeido({ capitalContinente: 0 }).capitalContinente, null)
  assert.equal(normalizarHogarLeido({ capitalContinente: '150.000 €' }).capitalContinente, 150000)
  assert.equal(normalizarHogarLeido({ capitalContenido: '12.500,50' }).capitalContenido, 12500.5)
})

// ─── DNI y código DGS: mismas reglas que auto ───────────────────────────────

test('valida la letra del DNI y del NIE', () => {
  assert.equal(normalizarHogarLeido({ dni: '12345678Z' }).dni, '12345678Z')
  assert.equal(normalizarHogarLeido({ dni: '12345678A' }).dni, null)
})

test('el código DGS solo pasa con su forma C+4 dígitos', () => {
  assert.equal(normalizarHogarLeido({ codigoEntidadDgs: 'c0058' }).codigoEntidadDgs, 'C0058')
  assert.equal(normalizarHogarLeido({ codigoEntidadDgs: 'MAPFRE' }).codigoEntidadDgs, null)
})

// ─── Fechas ───────────────────────────────────────────────────────────────

test('solo acepta fechas aaaa-mm-dd que existan de verdad', () => {
  assert.equal(normalizarHogarLeido({ fechaEfecto: '2026-10-15' }).fechaEfecto, '2026-10-15')
  for (const f of ['15/10/2026', '2026-02-31', 'octubre']) {
    assert.equal(normalizarHogarLeido({ fechaEfecto: f }).fechaEfecto, null, `«${f}»`)
  }
})

// ─── Contrato con el resto del sistema ──────────────────────────────────────

test('camposLeidosHogar lista exactamente lo que NO es null', () => {
  const d = normalizarHogarLeido({ direccion: 'Calle Mayor 1', compania: 'Mapfre', capitalContinente: 0 })
  assert.deepEqual(camposLeidosHogar(d).sort(), ['compania', 'direccion'])
  assert.deepEqual(camposLeidosHogar(hogarLeidoVacio()), [])
})

test('los campos personales están declarados y existen en el tipo', () => {
  const d = hogarLeidoVacio()
  for (const c of CAMPOS_PERSONALES_HOGAR) {
    assert.ok(c in d, `${c} no existe en HogarLeido`)
  }
})

test('un objeto vacío devuelve todo a null sin lanzar', () => {
  assert.deepEqual(normalizarHogarLeido({}), hogarLeidoVacio())
})
