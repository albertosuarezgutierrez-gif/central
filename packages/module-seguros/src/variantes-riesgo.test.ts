import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diferenciasVariante, resumenDiferencias, limpiarFiguras, rolesDelRamo, fotoAsegurados, fotoVarianteJson, textoDiferencia, leerDiferencia } from './variantes-riesgo.ts'

const persona = (dni: string, name: string, extra: Record<string, unknown> = {}) => ({
  identificationDocument: { type: { id: 'Dni' }, id: dni }, name, surname: 'Piña', birthDate: '1980-01-01',
  drivingLicenses: [{ type: { id: 'B' }, date: '2000-01-01' }], ...extra,
})
const moto = (tomador: object, cp = '41003', garaje = 'Street') => ({
  insuranceLine: { id: 'Motorcycle' }, effectiveDate: '2026-10-01', holder: tomador,
  risk: { vehicle: { code: 'X1' }, registrationPlate: '2121NST', circulationAddress: { postalCode: cp, town: { id: 1 } },
    garageType: { id: garaje }, kilometersPerYear: 5000, owner: tomador, primaryDriver: tomador },
})

test('otra persona de tomador (otro DNI) sale como cambio de persona, con su nombre y sin DNI', () => {
  const d = diferenciasVariante(moto(persona('1A', 'Manuel')), moto(persona('2B', 'Antonio')))!
  assert.deepEqual(d.find((x) => x.campo === 'Tomador'), { campo: 'Tomador', antes: 'Manuel Piña', despues: 'Antonio Piña' })
  assert.ok(!JSON.stringify(d).includes('1A'), 'el DNI no sale en el resumen')
})

test('mismo DNI con otro carnet es una corrección, no otra persona', () => {
  const d = diferenciasVariante(moto(persona('1A', 'Manuel')), moto(persona('1A', 'Manuel', { drivingLicenses: [{ date: '2005-01-01' }] })))!
  assert.ok(d.some((x) => x.campo === 'Tomador: carnet' && x.despues === '2005-01-01'))
  assert.ok(!d.some((x) => x.campo === 'Tomador'))
})

test('CP y garaje cambian; sin cambios dice «mismos datos»', () => {
  const a = moto(persona('1A', 'Manuel'))
  const d = diferenciasVariante(a, moto(persona('1A', 'Manuel'), '11520', 'PrivateGarage'))!
  assert.deepEqual(d.map((x) => x.campo), ['CP de circulación', 'Garaje'])
  assert.equal(resumenDiferencias(diferenciasVariante(a, a)), 'Mismos datos que la anterior')
})

test('sin petición legible NO es «igual»: es no comparable', () => {
  assert.equal(diferenciasVariante(null, moto(persona('1A', 'M'))), null)
  assert.equal(resumenDiferencias(null), 'No se puede comparar con la anterior')
})

test('limpiarFiguras descarta roles y ids que no son', () => {
  const u = '11111111-2222-3333-4444-555555555555'
  assert.deepEqual(limpiarFiguras({ tomador: u, propietario: null, jefe: u, conductor_habitual: 'x' }), { tomador: u, propietario: null })
  assert.equal(limpiarFiguras({ jefe: u }), null)
  assert.deepEqual(rolesDelRamo('moto'), ['tomador', 'propietario', 'conductor_habitual'])
})

test('H1: RC, comercio, una línea inventada o ausente NO salen como «mismos datos»: son no comparables', () => {
  for (const linea of ['Funeral', 'CommercialLiability', 'Business', undefined]) {
    const p = (capital: number) => ({ ...(linea ? { insuranceLine: { id: linea } } : {}), effectiveDate: '2026-10-01', holder: persona('1A', 'M'), risk: { insured: persona('1A', 'M'), deathBenefit: capital } })
    assert.equal(diferenciasVariante(p(100000), p(200000)), null, String(linea))
    assert.equal(diferenciasVariante(p(100000), p(100000)), null, `${linea} idéntica tampoco se afirma`)
    assert.equal(resumenDiferencias(diferenciasVariante(p(1), p(2))), 'No se puede comparar con la anterior')
  }
})

test('H1: ramos con comparador (coche, moto, hogar) siguen comparando; mezclar vehículo y hogar no se compara', () => {
  const hogar = (cp: string) => ({ insuranceLine: { id: 'Home' }, effectiveDate: '2026-10-01', holder: persona('1A', 'M'), risk: { address: { postalCode: cp } } })
  assert.deepEqual(diferenciasVariante(hogar('41003'), hogar('11520'))!.map((x) => x.campo), ['CP de la vivienda'])
  assert.deepEqual(diferenciasVariante(hogar('41003'), hogar('41003')), [])
  const coche = { ...moto(persona('1A', 'M')), insuranceLine: { id: 'Car' } }
  assert.deepEqual(diferenciasVariante(coche, coche), [])
  assert.equal(diferenciasVariante(coche, hogar('41003')), null)
})

// ─── Salud, decesos y vida (13/10/2026) ─────────────────────────────────────

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const aseg = (name: string, extra: Record<string, unknown> = {}) => ({ name, surname: 'Ruiz', birthDate: '2010-05-05', gender: { id: 'Female' }, ...extra })
const tom = persona('1A', 'Manuel')
const personas = (linea: string, adicionales: object[], efecto = '2026-11-01') => ({
  insuranceLine: { id: linea }, effectiveDate: efecto, holder: tom, risk: { insureds: [tom, ...adicionales] },
})

test('salud/decesos: misma lista → «mismos datos»; el efecto cambia como en auto', () => {
  for (const linea of ['Health', 'Burial']) {
    const a = personas(linea, [aseg('Ana')])
    assert.deepEqual(diferenciasVariante(a, a), [], linea)
    assert.deepEqual(diferenciasVariante(a, personas(linea, [aseg('Ana')], '2026-12-01')), [{ campo: 'Fecha de efecto', antes: '2026-11-01', despues: '2026-12-01' }])
  }
})

test('salud: altas y bajas por IDENTIDAD de ficha, nunca por posición (reordenar no es cambiar)', () => {
  const a = personas('Health', [aseg('Ana'), aseg('Luis', { gender: { id: 'Male' } })])
  const reordenada = personas('Health', [aseg('Luis', { gender: { id: 'Male' } }), aseg('Ana')])
  assert.deepEqual(diferenciasVariante(a, reordenada, { antes: { tomador: U(9), asegurados: [U(1), U(2)] }, despues: { tomador: U(9), asegurados: [U(2), U(1)] } }), [])
  const d = diferenciasVariante(a, personas('Health', [aseg('Ana'), aseg('Eva')]), { antes: { asegurados: [U(1), U(2)] }, despues: { asegurados: [U(1), U(3)] } })!
  assert.deepEqual(d, [
    { campo: 'Asegurado', antes: 'Luis Ruiz', despues: null, tipo: 'baja' },
    { campo: 'Asegurado', antes: null, despues: 'Eva Ruiz', tipo: 'alta' },
  ])
  assert.equal(textoDiferencia(d[0]), 'Baja de asegurado: Luis Ruiz')
  assert.equal(textoDiferencia(d[1]), 'Alta de asegurado: Eva Ruiz')
})

test('decesos: la misma ficha con otro nacimiento/sexo es una corrección; dos fichas con el mismo nombre NO se funden', () => {
  const a = personas('Burial', [aseg('Ana')])
  const corr = diferenciasVariante(a, personas('Burial', [aseg('Ana', { birthDate: '2011-01-01', gender: { id: 'Male' } })]), { antes: { asegurados: [U(1)] }, despues: { asegurados: [U(1)] } })!
  assert.deepEqual(corr.map((x) => x.campo), ['Asegurado Ana Ruiz: nacimiento', 'Asegurado Ana Ruiz: sexo'])
  assert.deepEqual(corr[1], { campo: 'Asegurado Ana Ruiz: sexo', antes: 'mujer', despues: 'hombre' })
  const otra = diferenciasVariante(a, personas('Burial', [aseg('Ana')]), { antes: { asegurados: [U(1)] }, despues: { asegurados: [U(2)] } })!
  assert.deepEqual(otra.map((x) => x.tipo), ['baja', 'alta'], 'homónimas con ficha distinta: otra persona')
})

test('salud sin foto (variante antigua): empareja por DNI y, sin él, por nombre; el DNI no sale nunca', () => {
  const conDni = (n: string, dni: string) => aseg(n, { identificationDocument: { type: { id: 'Dni' }, id: dni } })
  const d = diferenciasVariante(personas('Health', [conDni('Ana', '00000000T')]), personas('Health', [conDni('Ana María', '00000000T')]))!
  assert.deepEqual(d, [{ campo: 'Asegurado Ana Ruiz: nombre', antes: 'Ana Ruiz', despues: 'Ana María Ruiz' }])
  assert.ok(!JSON.stringify(d).includes('00000000T'))
  assert.deepEqual(diferenciasVariante(personas('Health', [aseg('Ana')]), personas('Health', [aseg('Ana')])), [])
})

test('salud: lista ilegible, foto que no cuadra o emparejamiento ambiguo → null («no se puede comparar»), nunca «igual»', () => {
  const sinLista = { insuranceLine: { id: 'Health' }, effectiveDate: '2026-11-01', holder: tom, risk: {} }
  assert.equal(diferenciasVariante(sinLista, sinLista), null)
  const dosAna = personas('Health', [aseg('Ana'), aseg('Ana')])
  assert.equal(diferenciasVariante(dosAna, dosAna), null, 'dos «Ana» sin ficha: no se sabe quién es quién')
  // Foto con un id de menos: se ignora (no se reparte por posición) y se cae al nombre.
  assert.deepEqual(diferenciasVariante(personas('Health', [aseg('Ana')]), personas('Health', [aseg('Ana')]), { antes: { asegurados: [] } }), [])
  const sinNombre = personas('Health', [{ birthDate: '2010-05-05' }])
  assert.equal(diferenciasVariante(sinNombre, sinNombre), null, 'sin ningún dato de identidad no se empareja')
})

const vida = (insured: object, extra: Record<string, unknown> = {}) => ({
  insuranceLine: { id: 'TermLife' }, effectiveDate: '2026-11-01', holder: tom, risk: { insured, deathBenefit: 100000, ...extra },
})

test('vida: capital, profesión y fumador; fumador ausente = sin dato, nunca «no»', () => {
  const a = vida({ ...tom, economicOccupation: { code: '2612' } })
  assert.deepEqual(diferenciasVariante(a, a), [])
  const d = diferenciasVariante(a, vida({ ...tom, economicOccupation: { code: '2611' }, smoker: true }, { deathBenefit: 150000 }))!
  assert.deepEqual(d, [
    { campo: 'Capital de fallecimiento', antes: '100000', despues: '150000' },
    { campo: 'Profesión (CNO)', antes: '2612', despues: '2611' },
    { campo: 'Fumador', antes: null, despues: 'sí' },
  ])
  assert.equal(textoDiferencia(d[2]), 'Fumador: sin dato → sí')
})

test('vida: otro asegurado por ficha es otra persona; la misma ficha es corrección', () => {
  const hija = aseg('Ana')
  const d = diferenciasVariante(vida(tom), vida(hija), { antes: { tomador: U(9), asegurados: [] }, despues: { tomador: U(9), asegurados: [U(1)] } })!
  assert.deepEqual(d, [{ campo: 'Asegurado', antes: 'Manuel Piña', despues: 'Ana Ruiz' }])
  const c = diferenciasVariante(vida(hija), vida({ ...hija, birthDate: '2009-01-01' }), { antes: { asegurados: [U(1)] }, despues: { asegurados: [U(1)] } })!
  assert.deepEqual(c.map((x) => x.campo), ['Asegurado: nacimiento'])
  assert.equal(diferenciasVariante(vida(tom), { ...vida(tom), risk: { deathBenefit: 1 } }), null, 'sin asegurado legible: null')
})

test('fotoAsegurados solo acepta uuids; leerDiferencia conserva alta/baja y descarta lo que no es', () => {
  assert.deepEqual(fotoAsegurados({ tomador: U(1), asegurados: [U(2)] }), { tomador: U(1), asegurados: [U(2)] })
  assert.deepEqual(fotoAsegurados({ asegurados: [U(2), '12345678Z'] }), { tomador: null, asegurados: null })
  assert.deepEqual(fotoAsegurados(null), { tomador: null, asegurados: null })
  assert.deepEqual(leerDiferencia({ campo: 'Asegurado', antes: null, despues: 'Ana', tipo: 'alta' }), { campo: 'Asegurado', antes: null, despues: 'Ana', tipo: 'alta' })
  assert.deepEqual(leerDiferencia({ campo: 'X', antes: 'a', despues: 'b', tipo: 'otro' }), { campo: 'X', antes: 'a', despues: 'b' })
  assert.equal(leerDiferencia({ antes: 'a' }), null)
})

test('fotoVarianteJson: figuras + asegurados (solo uuids) y se lee de vuelta igual; sin nada, null (no consta)', () => {
  const j = fotoVarianteJson({ tomador: U(9) }, [U(1), U(2)])!
  assert.deepEqual(JSON.parse(j), { tomador: U(9), asegurados: [U(1), U(2)] })
  assert.deepEqual(fotoAsegurados(JSON.parse(j)), { tomador: U(9), asegurados: [U(1), U(2)] })
  assert.deepEqual(JSON.parse(fotoVarianteJson({ tomador: U(9) }, [])!), { tomador: U(9), asegurados: [] }, '[] = solo el tomador: consta')
  assert.equal(fotoVarianteJson(null, undefined), null)
  assert.deepEqual(JSON.parse(fotoVarianteJson({ tomador: U(9) }, [U(1), '12345678Z'])!), { tomador: U(9) }, 'un DNI no se guarda jamás')
})

test('revisión 13/10/2026: la clave `asegurados` convive con los lectores de figuras (no es un rol) y dos DNI distintos no se funden', async () => {
  const { esRolFiguraUnico } = await import('./variantes-riesgo.ts')
  const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  // `copiarFigurasAPoliza` y `limpiarFiguras` leen solo roles de UNA persona: la foto de asegurados no se cuela como rol.
  const guardada = JSON.parse(fotoVarianteJson({ tomador: U(9), propietario: U(8) }, [U(1)])!)
  assert.equal(esRolFiguraUnico('asegurados'), false)
  assert.deepEqual(limpiarFiguras(guardada), { tomador: U(9), propietario: U(8) })
  // Homónimos con DNI distinto (sin foto): otra persona, nunca una «corrección» de nombre.
  const tom = { name: 'Ana', surname: 'Ruiz', birthDate: '1980-01-01', identificationDocument: { id: '11111111H' } }
  const hijo = (dni: string) => ({ name: 'Luis', surname: 'Ruiz', birthDate: '2015-01-01', identificationDocument: { id: dni } })
  const p = (x: object) => ({ insuranceLine: { id: 'Burial' }, effectiveDate: '2026-11-01', holder: tom, risk: { insureds: [tom, x] } })
  const d = diferenciasVariante(p(hijo('22222222J')), p(hijo('33333333P')))
  assert.deepEqual(d?.map((x) => x.tipo), ['baja', 'alta'])
  assert.ok(!JSON.stringify(d).match(/2222|3333|1111/), 'el DNI no sale en la diferencia')
  // Misma ficha en la foto manda sobre el DNI tecleado; fichas distintas con el MISMO DNI tampoco se funden.
  const f = (id: number) => ({ tomador: U(9), asegurados: [U(id)] })
  assert.deepEqual(diferenciasVariante(p(hijo('22222222J')), p(hijo('22222222J')), { antes: f(1), despues: f(2) })?.map((x) => x.tipo), ['baja', 'alta'])
})
