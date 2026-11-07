// Cepos de «la más barata por nivel» (04/11/2026). `node --test`. Datos inventados con la FORMA real de
// `tarificacion_precios` (Avant2: categoría/modalidad; bot RPA: producto «Auto · …» + coberturas `{nombre, incluida}`).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lineasBotVsAvant2, lineasMasBarataPorNivel, masBarataPorNivel, parejasBotAvant2, MAX_LINEAS_NIVELES, nivelDeOferta, SIN_CLASIFICAR, type OfertaParaNivel } from './tarificacion-niveles.ts'
import { textoAvisoPresupuestoRpa } from './presupuesto-rpa-reglas.ts'

const av = (compania: string, categoria: string, modalidad: string, primaEur: number, extra: Partial<OfertaParaNivel> = {}): OfertaParaNivel => ({
  compania, producto: `${compania} Autos`, categoria, modalidad, primaEur, ...extra,
})
const rpa = (compania: string, producto: string, primaEur: number, extra: Partial<OfertaParaNivel> = {}): OfertaParaNivel => ({ compania, producto, primaEur, ...extra })
const cob = (si: string[], no: string[] = []) => [...si.map((nombre) => ({ nombre, incluida: true })), ...no.map((nombre) => ({ nombre, incluida: false }))]
const nivel = (ramo: string, o: OfertaParaNivel) => nivelDeOferta(ramo, o).nivel

test('Avant2: la categoría manda (terceros, ampliado, todo riesgo con/sin franquicia)', () => {
  assert.equal(nivel('auto', av('Reale', 'Terceros', 'Reale Terceros', 200)), 'Terceros básico')
  assert.equal(nivel('auto', av('Occident', 'Terceros Ampliado', 'Terceros completo', 300)), 'Terceros ampliado')
  assert.equal(nivel('auto', av('Allianz', 'Todo Riesgo Con Franquicia Media', 'Allianz Todo Riesgo con Franquicia Media', 600, { franquiciaEur: 300 })), 'Todo riesgo con franquicia')
  assert.equal(nivel('moto', av('Allianz', 'Todo Riesgo', 'ALLIANZ MOTO DAÑOS', 700)), 'Todo riesgo sin franquicia')
  // Generali llama «Terceros + Asistencia» a un ampliado: la categoría del vendor gana a la modalidad.
  assert.equal(nivel('moto', av('Generali', 'Terceros ampliado', 'Terceros + Asistencia', 150)), 'Terceros ampliado')
  // Terceros ampliado CON franquicia (de lunas/robo) sigue siendo terceros ampliado, no todo riesgo.
  assert.equal(nivel('moto', av('Occident', 'Terceros ampliado', 'Terceros ampliado con franquicia de 400', 150, { franquiciaEur: 400 })), 'Terceros ampliado')
})

test('categoría «Terceros» con modalidad «Con Lunas» → ampliado (no compite con el básico de la misma compañía)', () => {
  assert.equal(nivel('auto', av('Reale', 'Terceros', 'Reale Terceros (Con Lunas)', 230)), 'Terceros ampliado')
  assert.equal(nivel('auto', av('Allianz', 'Terceros', 'Allianz Terceros con Lunas', 240)), 'Terceros ampliado')
})

test('bot RPA: el nivel sale del producto', () => {
  assert.equal(nivel('auto', rpa('mapfre', 'Auto · TERCEROS', 238.37)), 'Terceros básico')
  assert.equal(nivel('auto', rpa('mapfre', 'Auto · TERCEROS AMPLIADO', 355.07)), 'Terceros ampliado')
  assert.equal(nivel('auto', rpa('allianz', 'Auto · Todo Riesgo con franq.', 700)), 'Todo riesgo con franquicia')
  assert.equal(nivel('moto', rpa('allianz', 'Moto · T.R. Franquicia 567€', 500)), 'Todo riesgo con franquicia')
  assert.equal(nivel('moto', rpa('allianz', 'Moto · Robo + Incendio', 180)), 'Terceros ampliado')
  assert.equal(nivel('moto', rpa('allianz', 'Moto · G. Básicas', 90)), 'Terceros básico')
})

test('sin nivel en el nombre: mandan las coberturas AFIRMADAS', () => {
  const base = { compania: 'X', producto: 'X Autos' }
  assert.equal(nivel('auto', { ...base, primaEur: 700, franquiciaEur: 300, coberturas: cob(['RC Obligatoria', 'Daños propios']) }), 'Todo riesgo con franquicia')
  assert.equal(nivel('auto', { ...base, primaEur: 900, franquiciaEur: 0, coberturas: cob(['RC Obligatoria', 'Daños propios']) }), 'Todo riesgo sin franquicia')
  assert.equal(nivel('auto', { ...base, primaEur: 300, coberturas: cob(['RC Obligatoria', 'Cristales', 'Robo'], ['Daños propios']) }), 'Terceros ampliado')
  assert.equal(nivel('auto', { ...base, primaEur: 200, coberturas: cob(['RC Obligatoria'], ['Daños propios', 'Cristales', 'Robo']) }), 'Terceros básico')
})

test('datos insuficientes → sin clasificar (nunca se inventa)', () => {
  const base = { compania: 'X', producto: 'X Autos' }
  // Ni nombre ni coberturas.
  assert.equal(nivel('auto', { ...base, primaEur: 300 }), SIN_CLASIFICAR)
  // Coberturas sin daños propios: puede ser terceros o todo riesgo.
  assert.equal(nivel('auto', { ...base, primaEur: 300, coberturas: cob(['RC Obligatoria', 'Cristales']) }), SIN_CLASIFICAR)
  // Todo riesgo sin saber si lleva franquicia (franquicia null ≠ 0).
  assert.equal(nivel('auto', { ...base, primaEur: 700, coberturas: cob(['Daños propios']) }), SIN_CLASIFICAR)
  assert.equal(nivel('moto', rpa('allianz', 'Moto · Todo Riesgo', 700)), SIN_CLASIFICAR)
  // Ramo sin reglas.
  assert.equal(nivel('decesos', rpa('Ocaso', 'Decesos', 120)), SIN_CLASIFICAR)
  // Sin prima válida: fuera, a sin clasificar.
  const r = masBarataPorNivel('auto', [av('Reale', 'Terceros', 'Reale Terceros', 0), av('Mapfre', 'Terceros', 'Terceros', 210)])
  assert.equal(r.niveles.length, 1)
  assert.deepEqual(r.sinClasificar.map((s) => [s.compania, s.motivo]), [['Reale', 'sin prima válida']])
})

test('el caso de Reale: la barata sin daños propios NO es la más barata del todo riesgo', () => {
  const r = masBarataPorNivel('auto', [
    av('Allianz', 'Todo Riesgo Con Franquicia Media', 'Allianz TR Franquicia Media', 610.5, { franquiciaEur: 300 }),
    av('Reale', 'Terceros', 'Reale Terceros', 212.4),
    av('Reale', 'Todo Riesgo Con Franquicia Media', 'Reale Todo Riesgo Franquicia 300 Euros', 590, { franquiciaEur: 300 }),
    av('Mapfre', 'Terceros', 'Terceros', 230),
  ])
  assert.deepEqual(r.niveles.map((n) => [n.nivel, n.masBarata.compania, n.masBarata.primaEur, n.ofertas.length]), [
    ['Terceros básico', 'Reale', 212.4, 2],
    ['Todo riesgo con franquicia', 'Reale', 590, 2],
  ])
  assert.deepEqual(r.niveles[1]!.ofertas.map((o) => o.primaEur), [590, 610.5])
})

test('empate: mismo precio → orden estable por compañía y se avisa', () => {
  const r = masBarataPorNivel('auto', [av('Mapfre', 'Terceros', 'Terceros', 250), av('Allianz', 'Terceros', 'Terceros', 250), av('Reale', 'Terceros', 'Terceros', 260)])
  const n = r.niveles[0]!
  assert.equal(n.masBarata.compania, 'Allianz')
  assert.deepEqual(n.empatadas.map((e) => e.compania), ['Mapfre'])
  assert.match(lineasMasBarataPorNivel(r)[0]!, /empate con Mapfre/)
})

test('extras: qué tiene cada una que otra del nivel no (solo estados afirmados)', () => {
  const r = masBarataPorNivel('auto', [
    rpa('mapfre', 'Auto · TERCEROS AMPLIADO', 355.07, { coberturas: cob(['R. C. OBLIGATORIA', 'ROBO DEL VEHÍCULO', 'ROTURA DE PARABRISAS Y LUNAS'], ['INCENDIO DEL VEHÍCULO']) }),
    rpa('allianz', 'Auto · Tercero Ampliado', 330, { coberturas: cob(['RC Obligatoria', 'Robo', 'Incendio'], ['Cristales']) }),
    rpa('reale', 'Auto · Terceros con lunas', 400),
  ])
  const n = r.niveles[0]!
  assert.equal(n.masBarata.compania, 'allianz')
  assert.deepEqual(n.ofertas.find((o) => o.compania === 'allianz')!.extras, ['Incendio'])
  assert.deepEqual(n.ofertas.find((o) => o.compania === 'mapfre')!.extras, ['Lunas'])
  assert.equal(n.ofertas.find((o) => o.compania === 'reale')!.extras, null)
  assert.deepEqual(n.faltanEnLaMasBarata, ['Lunas'])
  assert.match(lineasMasBarataPorNivel(r)[0]!, /le falta Lunas/)
})

test('hogar: continente/contenido + RC + daños eléctricos; si falta algo, sin clasificar', () => {
  const completa = cob(['Continente', 'Contenido', 'Responsabilidad civil', 'Daños eléctricos'])
  assert.equal(nivel('hogar', rpa('A', 'Hogar', 300, { coberturas: completa })), 'Continente y contenido · con RC · con daños eléctricos')
  assert.equal(nivel('hogar', rpa('B', 'Hogar', 200, { coberturas: cob(['Contenido', 'Responsabilidad civil'], ['Continente', 'Daños eléctricos']) })), 'Solo contenido · con RC · sin daños eléctricos')
  // «DAÑOS VIVIENDA» (Mapfre) es el continente.
  assert.equal(nivel('hogar', rpa('mapfre', 'Hogar · HOGAR FAMILIAR', 250, { coberturas: cob(['DAÑOS VIVIENDA', 'DAÑOS MOBILIARIO', 'RESPONSABILIDAD CIVIL', 'Daños eléctricos']) })), 'Continente y contenido · con RC · con daños eléctricos')
  // Sin daños eléctricos en la lista: no consta → sin clasificar.
  assert.equal(nivel('hogar', rpa('mapfre', 'Hogar · HOGAR FAMILIAR', 250, { coberturas: cob(['DAÑOS VIVIENDA', 'DAÑOS MOBILIARIO', 'RESPONSABILIDAD CIVIL']) })), SIN_CLASIFICAR)
  assert.equal(nivel('hogar', rpa('allianz', 'Allianz HOGAR · COMPLETO', 250)), SIN_CLASIFICAR)
  const r = masBarataPorNivel('hogar', [rpa('A', 'Hogar', 300, { coberturas: completa }), rpa('C', 'Hogar', 280, { coberturas: completa }), rpa('D', 'Hogar', 100)])
  assert.deepEqual([r.niveles.length, r.niveles[0]!.masBarata.compania, r.sinClasificar.length], [1, 'C', 1])
})

test('bot ↔ Avant2: pareja por compañía y nivel con diferencia en € y %, sin inventar la otra mitad', () => {
  const b = (c: string, prod: string, p: number, e: Partial<OfertaParaNivel> = {}) => rpa(c, prod, p, { origen: 'bot', ...e })
  const a = (c: string, cat: string, p: number, e: Partial<OfertaParaNivel> = {}) => av(c, cat, `${c} ${cat}`, p, { origen: 'avant2', ...e })
  const r = masBarataPorNivel('auto', [
    b('Reale', 'Auto · Terceros', 200), a('Reale', 'Terceros', 220), a('Reale', 'Terceros', 250), // pareja: Avant2 +20 (+10%)
    b('Mapfre', 'Auto · Terceros', 300), // solo bot
    a('Fiatc', 'Terceros', 180), // solo Avant2
    b('Allianz', 'Auto · Terceros', 200), a('Allianz', 'Terceros', 200), // empate exacto
    b('Pelayo', 'Auto · Terceros', 100, { origen: null }), a('Pelayo', 'Terceros', 120), // sin origen: no hay pareja
    b('Zurich', 'Auto', 100), a('Zurich', '', 90), // sin categoría: sin clasificar
  ])
  const p = parejasBotAvant2(r)
  assert.deepEqual(p.map((x) => x.compania).sort(), ['Allianz', 'Reale'])
  const reale = p.find((x) => x.compania === 'Reale')!
  assert.deepEqual([reale.nivel, reale.botEur, reale.avant2Eur, reale.diferenciaEur, reale.diferenciaPct], ['Terceros básico', 200, 220, 20, 10])
  assert.equal(p.find((x) => x.compania === 'Allianz')!.diferenciaEur, 0)
  assert.ok(r.sinClasificar.some((x) => x.compania === 'Zurich'))
  assert.equal(r.niveles[0]!.masBarata.compania, 'Pelayo')
  const l = lineasBotVsAvant2(r)
  assert.equal(l.length, 2)
  assert.match(l.find((x) => x.includes('Reale'))!, /bot 200,00€ vs Avant2 220,00€ — Avant2 \+20,00€ \(\+10%\)/)
  assert.deepEqual(lineasBotVsAvant2(null), [])
  assert.deepEqual(parejasBotAvant2(masBarataPorNivel('auto', [b('X', 'Auto · Terceros', 100)])), [])
  assert.match(textoAvisoPresupuestoRpa({ cliente: null, referencia: 'OP-1', ramo: 'auto', companias: ['Reale'], primas: [200], enlace: 'x', narrativa: 'ia', sinIa: null, niveles: r }), /🔁 Terceros básico · Reale/)
})

test('Telegram: ≤4 líneas, dinero en español, y el bloque va en el aviso sin romper coherencia', () => {
  const r = masBarataPorNivel('auto', [
    av('Reale', 'Terceros', 'Reale Terceros', 2162.49),
    av('Mapfre', 'Terceros Ampliado', 'Terceros completo', 2300),
    av('Allianz', 'Todo Riesgo Con Franquicia Media', 'TR Franquicia', 2500, { franquiciaEur: 300 }),
    av('Allianz', 'Todo Riesgo', 'TR sin franquicia', 3000),
    av('Fiatc', 'Otra', 'Otra', 100),
  ])
  const l = lineasMasBarataPorNivel(r)
  assert.equal(l.length, MAX_LINEAS_NIVELES)
  assert.match(l[0]!, /Terceros básico: Reale \(Reale Terceros\) 2\.162,49€/)
  assert.match(l[3]!, /Todo riesgo sin franquicia: Allianz.*\(\+1 sin clasificar\)$/)
  // Más niveles que líneas (hogar): los primeros y un resumen.
  const hog = (c: string, p: number, si: string[], no: string[]) => rpa(c, 'Hogar', p, { coberturas: cob(si, no) })
  const muchos = masBarataPorNivel('hogar', [
    hog('A', 100, ['Continente', 'Contenido', 'Responsabilidad civil', 'Daños eléctricos'], []),
    hog('B', 110, ['Continente', 'Contenido', 'Responsabilidad civil'], ['Daños eléctricos']),
    hog('C', 120, ['Continente', 'Responsabilidad civil', 'Daños eléctricos'], ['Contenido']),
    hog('D', 130, ['Contenido', 'Responsabilidad civil'], ['Continente', 'Daños eléctricos']),
    hog('E', 140, ['Contenido'], ['Continente', 'Responsabilidad civil', 'Daños eléctricos']),
  ])
  const lm = lineasMasBarataPorNivel(muchos)
  assert.equal(lm.length, MAX_LINEAS_NIVELES)
  assert.match(lm[3]!, /y 2 niveles más: /)
  assert.deepEqual(lineasMasBarataPorNivel(masBarataPorNivel('auto', [])), [])
  assert.match(lineasMasBarataPorNivel(masBarataPorNivel('auto', [av('X', '', '', 100)]))[0]!, /no se puede comparar \(1 oferta/)
  const base = { cliente: null, referencia: 'OP-1', ramo: 'auto', companias: ['Reale'], primas: [2162.49], enlace: 'x', narrativa: 'ia' as const, sinIa: null }
  const t = textoAvisoPresupuestoRpa({ ...base, revisar: ['⚠️ Revisar: algo'], niveles: r })
  assert.match(t, /Revisar: algo/)
  assert.match(t, /Más barata · Terceros básico/)
  assert.doesNotMatch(textoAvisoPresupuestoRpa(base), /Más barata/)
})
