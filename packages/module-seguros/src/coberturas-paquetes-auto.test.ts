import test from 'node:test'
import assert from 'node:assert/strict'
import { PAQUETES_AUTO, coberturasDePaquete } from './coberturas-paquetes-auto.ts'
import { CATALOGO_GARANTIAS } from './catalogo-garantias.ts'

const valor = (c: string, p: string, clave: string) => coberturasDePaquete(c, p)?.coberturas.find((x) => x.clave === clave)?.valor

test('casa los nombres tal y como los devuelve el bot', () => {
  assert.equal(coberturasDePaquete('Allianz', 'Terceros con lunas')?.nombre, 'Terceros con lunas')
  assert.equal(coberturasDePaquete('ALLIANZ SEGUROS', 'Todo Riesgo con franq.')?.nombre, 'Todo Riesgo con franq.')
  assert.equal(coberturasDePaquete('Mapfre', 'TERCEROS AMPLIADO')?.compania, 'mapfre')
  assert.equal(coberturasDePaquete('mapfre españa', 'Terceros')?.nombre, 'TERCEROS')
  assert.equal(coberturasDePaquete('Generali', 'Terceros Ampliado')?.compania, 'generali')
})

test('el mismo nombre en otra compañía es otro paquete', () => {
  assert.notEqual(coberturasDePaquete('Mapfre', 'TERCEROS AMPLIADO'), coberturasDePaquete('Generali', 'TERCEROS AMPLIADO'))
})

test('desconocido o vacío = null (no «cubre nada»)', () => {
  assert.equal(coberturasDePaquete('Allianz', 'Paquete inventado'), null)
  assert.equal(coberturasDePaquete('Zurich', 'Terceros'), null)
  assert.equal(coberturasDePaquete(null, 'Terceros'), null)
  assert.equal(coberturasDePaquete('Mapfre', ''), null)
  assert.equal(coberturasDePaquete('Mapfre', undefined), null)
})

test('sin parecidos: «Terceros» no casa con «Terceros con lunas»', () => {
  assert.equal(coberturasDePaquete('Allianz', 'Terceros'), null)
})

test('Allianz Direct no hereda el catálogo de Allianz', () => {
  assert.equal(coberturasDePaquete('Allianz Direct', 'Tercero Ampliado'), null)
})

test('tres estados: true, false y null conviven y no se mezclan', () => {
  assert.equal(valor('Allianz', 'Tercero Ampliado', 'robo'), true)
  assert.equal(valor('Allianz', 'Tercero Ampliado', 'danos_propios'), false)
  assert.equal(valor('Allianz', 'Tercero Ampliado', 'vehiculo_sustitucion'), null)
  assert.equal(valor('Allianz', 'Tercero Ampliado', 'clave_que_no_existe'), undefined)
})

test('lo dudoso es null, no false (fuentes contradictorias)', () => {
  assert.equal(valor('Generali', 'TERCEROS AMPLIADO', 'conductor'), null)
  assert.equal(valor('Generali', 'TERCEROS AMPLIADO', 'fenomenos_atmosfericos'), null)
})

test('todo dato true/false lleva fuente con url y fecha; todo null no', () => {
  for (const p of PAQUETES_AUTO) for (const c of p.coberturas) {
    if (c.valor === null) assert.equal(c.fuente, undefined, `${p.nombre}/${c.clave}: null con fuente`)
    else {
      assert.ok(c.fuente?.url.startsWith('https://'), `${p.compania}/${p.nombre}/${c.clave}: falta fuente`)
      assert.match(c.fuente!.fecha, /^\d{4}-\d{2}-\d{2}$/)
    }
  }
})

test('las claves son las del catálogo de vehículo, sin repetir, y todo es borrador', () => {
  const claves = new Set(CATALOGO_GARANTIAS.auto.map((g) => g.clave))
  for (const p of PAQUETES_AUTO) {
    const vistas = new Set<string>()
    for (const c of p.coberturas) {
      assert.ok(claves.has(c.clave), `${p.nombre}: clave fuera de catálogo ${c.clave}`)
      assert.ok(!vistas.has(c.clave), `${p.nombre}: clave repetida ${c.clave}`)
      vistas.add(c.clave)
    }
    assert.equal(p.revisado, false)
  }
})

test('no hay dos paquetes de una compañía con el mismo alias', () => {
  const vistos = new Set<string>()
  for (const p of PAQUETES_AUTO) for (const a of p.alias) {
    const k = `${p.compania}|${a}`
    assert.ok(!vistos.has(k), k)
    vistos.add(k)
  }
})
