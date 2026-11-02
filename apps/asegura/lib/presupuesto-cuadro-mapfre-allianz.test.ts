// 🪤 02/11/2026: el cuadro de 3 Allianz + 2 Mapfre (auto) salía con 19 celdas «No figura». Claves REALES del PDF del proyecto de
// Mapfre (sin datos personales). Para verlo en rojo: en el catálogo quita `rc (suplementaria|ampliada|complementaria)` → falla «claves»;
// en `compararOfertas` pon `ausente = false` → falla «0 No figura»; en `garantiasLeidasDeDocumento` devuelve false → idem.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compararOfertas, ofertaDeBot, normalizarGarantia, type OfertaBot } from '@central/module-seguros'
import { NO_FIGURA, textoCelda } from './presupuesto-pdf-cuadro.ts'

type Cob = OfertaBot['coberturas'][number]
const cob = (literal: string, estado: Cob['estado'] = 'incluida', limite: number | null = null): Cob => ({ clave: literal, literal, estado, capital: null, limite, franquicia: null })

const MAPFRE = [
  cob('R. C. OBLIGATORIA'), cob('R. C. SUPLEMENTARIA', 'incluida', 50000000), cob('*R. C. Ampliada', 'incluida', 60200),
  cob('DEFENSA JURÍDICA', 'incluida', 3000), cob('*R. D. Ampliada'), cob('SEGURO DEL CONDUCTOR'), cob('- FALLECIMIENTO', 'incluida', 40000),
  cob('*Peatón o ciclista', 'incluida', 20000), cob('- INVALIDEZ PERMANENTE', 'incluida', 40000), cob('- ASISTENCIA SANITARIA', 'incluida', 40000),
  cob('DEFENSA EN MULTAS Y ASESORAMIENTO'), cob('ASISTENCIA EN VIAJE'), cob('INCENDIO DEL VEHÍCULO'), cob('ROBO DEL VEHÍCULO'),
  cob('ROTURA DE PARABRISAS Y LUNAS'), cob('DAÑOS A. CINEGÉTICOS'), cob('*Indemnización', 'incluida', 1200), cob('DAÑOS F. ATMOSFÉRICOS'),
  cob('SUBSIDIO PRIVACIÓN PERMISO'),
]
const ALLIANZ = [
  cob('Responsabilidad civil'), cob('RC Complementaria', 'incluida', 50000000), cob('Daños propios (todo riesgo)'), cob('Lunas'),
  cob('Robo'), cob('Incendio'), cob('Fenómenos de la naturaleza'), cob('Siempre en marcha'), cob('Intereses préstamos'),
]
const bot = (compania: string, producto: string, coberturas: Cob[], avisos: string[]): OfertaBot => ({
  compania, producto, primaAnualEur: 400, primaNetaEur: null, fraccionamiento: 'anual', importeReciboEur: null, coberturas, franquicias: [], avisos,
})
const AVISO_MAPFRE = 'Garantías leídas del PDF del proyecto de Mapfre.'

test('🪤 claves Mapfre reales caen en las garantías canónicas de Allianz (catálogo de auto)', () => {
  const esperado: Record<string, string> = {
    'R. C. OBLIGATORIA': 'rc_obligatoria', 'R. C. SUPLEMENTARIA': 'rc_voluntaria', '*R. C. Ampliada': 'rc_voluntaria', 'DEFENSA JURÍDICA': 'defensa_juridica',
    '*R. D. Ampliada': 'defensa_juridica', 'SEGURO DEL CONDUCTOR': 'conductor', '- FALLECIMIENTO': 'conductor', '*Peatón o ciclista': 'conductor',
    '- INVALIDEZ PERMANENTE': 'conductor', '- ASISTENCIA SANITARIA': 'conductor', 'DEFENSA EN MULTAS Y ASESORAMIENTO': 'defensa_multas',
    'ASISTENCIA EN VIAJE': 'asistencia_viaje', 'INCENDIO DEL VEHÍCULO': 'incendio', 'ROBO DEL VEHÍCULO': 'robo', 'ROTURA DE PARABRISAS Y LUNAS': 'lunas',
    'DAÑOS A. CINEGÉTICOS': 'colision_animales', 'DAÑOS F. ATMOSFÉRICOS': 'fenomenos_atmosfericos', 'SUBSIDIO PRIVACIÓN PERMISO': 'retirada_carnet',
    'Responsabilidad civil': 'rc_obligatoria', 'RC Complementaria': 'rc_voluntaria', 'Daños propios (todo riesgo)': 'danos_propios', 'Fenómenos de la naturaleza': 'fenomenos_atmosfericos',
  }
  for (const [k, v] of Object.entries(esperado)) assert.equal(normalizarGarantia('auto', k), v, k)
})

test('🪤 sub-garantías: el conductor las agrupa en su detalle y «*Indemnización» no crea fila propia', () => {
  const o = ofertaDeBot(bot('Mapfre', 'Terceros Ampliado', MAPFRE, [AVISO_MAPFRE]), 'm1', 'auto')
  assert.equal(o.garantias['conductor']?.estado, 'incluida')
  assert.match(o.garantias['conductor']?.evidencia?.texto ?? '', /FALLECIMIENTO 40000/)
  assert.match(o.garantias['colision_animales']?.evidencia?.texto ?? '', /Indemnización 1200/)
  assert.equal(Object.keys(o.garantias).some((k) => /indemniz/i.test(k)), false)
  assert.equal(o.garantiasDeDocumento, true)
})

test('🪤 3 Allianz + 2 Mapfre: 0 celdas «No figura»; lo que un documento completo no nombra es «No incluida»', () => {
  const ofertas = [
    ...[1, 2, 3].map((i) => ofertaDeBot(bot('Allianz', `Allianz Auto ${i}`, ALLIANZ, []), `a${i}`, 'auto')),
    ...[1, 2].map((i) => ofertaDeBot(bot('Mapfre', `Mapfre Auto ${i}`, MAPFRE, [AVISO_MAPFRE]), `m${i}`, 'auto')),
  ]
  const r = compararOfertas({ ramo: 'auto', ofertas })
  const celdas = r.filas.flatMap((f) => f.celdas.map((c) => ({ fila: f.etiqueta, ofertaId: c.ofertaId, t: textoCelda(c) })))
  assert.ok(celdas.length >= 5 * 10)
  assert.deepEqual(celdas.filter((c) => c.t.texto === NO_FIGURA), [])
  const mapfreRobo = r.filas.find((f) => f.clave === 'robo')!.celdas.find((c) => c.ofertaId === 'm1')!
  assert.equal(textoCelda(mapfreRobo).texto, 'Incluida')
  const allianzMultas = r.filas.find((f) => f.clave === 'defensa_multas')!.celdas.find((c) => c.ofertaId === 'a1')!
  assert.equal(textoCelda(allianzMultas).texto, 'No incluida')
  assert.equal(allianzMultas.estado3, 'no_incluida')
})

test('🪤 sin documento completo (pantalla «Coberturas») sigue siendo «No figura»; una columna entera vacía no se disfraza de «No incluida»', () => {
  const pantalla = ofertaDeBot(bot('Mapfre', 'Pantalla', MAPFRE, ['Garantías leídas de la pantalla «Coberturas» de Mapfre (el PDF del proyecto no se pudo leer).']), 'p1', 'auto')
  assert.equal(pantalla.garantiasDeDocumento, undefined)
  const vacia = ofertaDeBot(bot('Mapfre', 'Vacía', [], [AVISO_MAPFRE]), 'v1', 'auto')
  const llena = ofertaDeBot(bot('Allianz', 'Allianz Auto', ALLIANZ, []), 'a1', 'auto')
  const r = compararOfertas({ ramo: 'auto', ofertas: [llena, pantalla, vacia] })
  const celda = (clave: string, id: string) => textoCelda(r.filas.find((f) => f.clave === clave)!.celdas.find((c) => c.ofertaId === id))
  assert.equal(celda('robo', 'v1').texto, NO_FIGURA)
  assert.equal(celda('defensa_multas', 'a1').texto, 'No incluida')
  assert.equal(celda('danos_propios', 'p1').texto, NO_FIGURA)
})
