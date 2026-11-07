import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { EJEMPLO_COSTE, RUTA_COSTE_TRABAJADOR, avisoTablasAñoAnterior, fechaHoyMadrid, leerDatosCoste, situacionDesdeFormulario, textosAvisos, type DatosCoste } from './coste-trabajador.ts'
import { NAV } from './sitio.ts'
import { EVENTOS } from './medir.ts'

const leer = (ruta: string) => readFileSync(new URL(`../${ruta}`, import.meta.url), 'utf8')
const con = (p: Partial<DatosCoste>): DatosCoste => ({ ...EJEMPLO_COSTE, ...p })

test('el ejemplo se traduce a la entrada del simulador en céntimos, con el seguro flexible', () => {
  const l = leerDatosCoste(EJEMPLO_COSTE, '2026-06-01')
  assert.ok(l.ok)
  assert.equal(l.entrada.brutoAnual, 2_400_000)
  assert.equal(l.entrada.pagas, 14)
  assert.equal(l.entrada.prorrataExtras, false)
  assert.deepEqual(l.entrada.retribucionFlexible, { seguroSaludAnual: 60_000, beneficiarios: 1, discapacidad: 0 })
  assert.equal(l.entrada.situacion, undefined, 'sin situación familiar no se inventa una: art. 88.2 en el simulador')
})

test('un dato obligatorio sin poner no da 0: dice qué falta', () => {
  assert.deepEqual(leerDatosCoste(con({ bruto: '' }), '2026-06-01'), { ok: false, falta: 'el salario bruto anual' })
  assert.equal(leerDatosCoste(con({ jornada: '120' }), '2026-06-01').ok, false)
  assert.equal(leerDatosCoste(con({ cnae: '56' }), '2026-06-01').ok, false)
  assert.equal(leerDatosCoste(con({ seguro: { ...EJEMPLO_COSTE.seguro, prima: '' } }), '2026-06-01').ok, false)
  assert.equal(leerDatosCoste(con({ seguro: { ...EJEMPLO_COSTE.seguro, prima: '30.000' } }), '2026-06-01').ok, false)
  assert.equal(leerDatosCoste(con({ seguro: { ...EJEMPLO_COSTE.seguro, beneficiarios: '1', discapacidad: '2' } }), '2026-06-01').ok, false)
})

test('temporal con «no lo sé» NO manda duración (el simulador lo marca aproximado); con respuesta, sí', () => {
  const nose = leerDatosCoste(con({ contrato: 'temporal', menosDeUnAño: null }), '2026-06-01')
  assert.ok(nose.ok && !('duracionInferiorAño' in nose.entrada))
  const si = leerDatosCoste(con({ contrato: 'temporal', menosDeUnAño: true }), '2026-06-01')
  assert.ok(si.ok && si.entrada.duracionInferiorAño === true)
})

test('situación familiar: hijos con su edad; monoparental por entero, el resto a medias', () => {
  const s = situacionDesdeFormulario({ activa: true, situacion: '2', añoNacimiento: '1985', hijos: '2', hijosMenores3: '1' }, 2026)
  assert.ok(s.ok)
  assert.equal(s.situacion.descendientes.length, 2)
  assert.equal(s.situacion.descendientes[0].fechaNacimiento, '2025-06-01')
  assert.equal(s.situacion.descendientes[0].porEntero, false)
  const m = situacionDesdeFormulario({ activa: true, situacion: '1', añoNacimiento: '1985', hijos: '1', hijosMenores3: '0' }, 2026)
  assert.ok(m.ok && m.situacion.descendientes[0].porEntero === true)
  assert.equal(situacionDesdeFormulario({ activa: true, situacion: '3', añoNacimiento: '1985', hijos: '1', hijosMenores3: '2' }, 2026).ok, false)
})

test('una cifra pendiente sin texto propio no se calla: frase genérica de «aproximado»', () => {
  const t = textosAvisos({ avisos: ['irpf:limite_art_85_3_aplicado'], cifrasPendientes: ['regla:algo_nuevo'] })
  assert.deepEqual(t, ['Alguna cifra legal está pendiente de verificar: el resultado es aproximado.'])
})

test('la página existe, está en el sitemap y en el pie, y el lead va por el formulario de siempre', () => {
  assert.ok(existsSync(new URL(`../app${RUTA_COSTE_TRABAJADOR}/page.tsx`, import.meta.url)), 'falta la página')
  const pagina = leer(`app${RUTA_COSTE_TRABAJADOR}/page.tsx`)
  assert.match(pagina, /<Formulario ramoPorDefecto="salud" \/>/, 'el CTA debe reutilizar <Formulario> (→ /api/lead → plataforma)')
  assert.match(pagina, /orientativ/i, 'falta el aviso de que es orientativo')
  assert.match(leer('app/sitemap.ts'), /url\('\/calculadora-coste-trabajador'\)/, 'el sitemap no lista la calculadora')
  assert.ok(NAV.some((n) => n.href === RUTA_COSTE_TRABAJADOR), 'el pie no enlaza la calculadora')
})

test('la calculadora usa el motor de nóminas y no manda nada a ningún sitio', () => {
  const comp = leer('components/CalculadoraCosteTrabajador.tsx')
  assert.match(comp, /import \{[^}]*simularCosteContratacion[^}]*\} from '@central\/module-nominas'/)
  assert.doesNotMatch(comp, /fetch\(/, 'la calculadora no debe enviar los datos: la cuenta va en el navegador')
  const llamada = comp.split('\n').find((l) => l.includes("medir('coste_trabajador_calculo'"))
  assert.ok(llamada && EVENTOS.coste_trabajador_calculo)
  assert.doesNotMatch(llamada!.replace('coste_trabajador_calculo', ''), /bruto|neto|coste|irpf|prima/i, 'el evento no lleva cifras de la persona')
})

test('año de las tablas no fijo: la fecha de hoy (Madrid, inyectable) va al simulador y el aviso de tablas antiguas se pinta', () => {
  assert.equal(fechaHoyMadrid(new Date('2026-12-31T23:30:00Z')), '2027-01-01', 'Madrid, no UTC')
  const l = leerDatosCoste(EJEMPLO_COSTE, '2027-01-02')
  assert.ok(l.ok && l.entrada.fechaCalculo === '2027-01-02' && !('año' in l.entrada))
  assert.equal(avisoTablasAñoAnterior({ año: 2026, añoCalculo: 2026, tablasDeAñoAnterior: false }), null)
  assert.match(avisoTablasAñoAnterior({ año: 2026, añoCalculo: 2027, tablasDeAñoAnterior: true }) ?? '', /tablas oficiales de 2027.*las de 2026/)
  assert.ok(textosAvisos({ avisos: [], cifrasPendientes: ['regla:tablas_de_año_anterior'] })[0].includes('año anterior'))
  const comp = leer('components/CalculadoraCosteTrabajador.tsx')
  assert.match(comp, /leerDatosCoste\(d, fechaHoyMadrid\(\)\)/)
  assert.match(comp, /avisoTablasAñoAnterior\(r\)/)
  assert.doesNotMatch(comp, /AÑO_SIMULADOR_POR_DEFECTO/)
})
