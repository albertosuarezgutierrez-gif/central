import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { contratoCima } from './cartera-poliza-contrato.ts'

// Descifrado de mentira: `v1:ok:<texto>` se lee, cualquier otro `v1:` falla.
const descifrar = (v: string) => (v.startsWith('v1:ok:') ? v.slice('v1:ok:'.length) : null)

const IBAN_CIFRADO = 'v1:AAAAIBANCIFRADOES7621000418450200051332'

const DATOS = {
  matricula: '1234ABC', // clave vieja del riesgo principal: no es del contrato
  gestionCobro: 'CO', formaPago: 'CC', iban: IBAN_CIFRADO, ibanUltimos4: '1332', bic: 'CAIXESBBXXX',
  titularCuentaDistinto: true, duracion: 'AN', clasePoliza: 'IN', numeroSuplemento: '0003',
  mediador: { clase: 'CO', codigoInterno: '0170', nombre: 'Grupo ASegura' },
  producto: { modalidad: '12', descripcion: 'HOGAR PLUS' },
  primaAnualDudosa: true, primaTotalFichero: '190.29',
  riesgos: [
    { id: 'R1', tipo: 'hogar', descripcion: 'Piso', inicio: '2026-01-01', fin: '2027-01-01', direccion: 'v1:ok:CL SOCORRO 24', cp: '41003' },
    { id: 'R2', tipo: 'hogar', direccion: 'v1:roto' },
  ],
  beneficiarios: [{ orden: '1', prestamo: 'Préstamo hipotecario' }],
}

test('numeroSuplemento cruza el puerto; ausente = null', () => {
  assert.equal(contratoCima(DATOS, descifrar)?.numeroSuplemento, '0003')
  assert.equal(contratoCima({ ...DATOS, numeroSuplemento: undefined }, descifrar)?.numeroSuplemento, null)
})

test('convenio / nombreRiesgo / descripcionRiesgo cruzan el puerto; ausentes o cifrados = null', () => {
  const c = contratoCima({ ...DATOS, convenio: '99000123456789', nombreRiesgo: 'Taller', descripcionRiesgo: 'Obra menor' }, descifrar)!
  assert.equal(c.convenio, '99000123456789')
  assert.equal(c.nombreRiesgo, 'Taller')
  assert.equal(c.descripcionRiesgo, 'Obra menor')
  const sin = contratoCima({ ...DATOS, convenio: 'v1:x:y:z', nombreRiesgo: '  ' }, descifrar)!
  assert.equal(sin.convenio, null)
  assert.equal(sin.nombreRiesgo, null)
  assert.equal(sin.descripcionRiesgo, null)
})

test('el IBAN cifrado NUNCA sale del puerto (ni la clave ni el valor)', () => {
  const c = contratoCima(DATOS, descifrar)
  const json = JSON.stringify(c)
  assert.ok(!json.includes(IBAN_CIFRADO), 'el IBAN cifrado ha cruzado')
  assert.ok(!('iban' in (c as object)), 'la clave iban ha cruzado')
  assert.ok(!json.includes('v1:'), 'algo cifrado ha cruzado')
  assert.equal(c?.ibanUltimos4, '1332')
})

test('ibanUltimos4 solo se acepta con 4 dígitos (un IBAN entero ahí no cruza)', () => {
  const c = contratoCima({ ibanUltimos4: 'ES7621000418450200051332', formaPago: 'CC' }, descifrar)
  assert.equal(c?.ibanUltimos4, null)
})

test('la dirección del riesgo se descifra en servidor; si no se puede, null + ilegible', () => {
  const c = contratoCima(DATOS, descifrar)!
  assert.equal(c.riesgos[0].direccion, 'CL SOCORRO 24')
  assert.equal(c.riesgos[0].direccionIlegible, false)
  assert.equal(c.riesgos[1].direccion, null)
  assert.equal(c.riesgos[1].direccionIlegible, true)
})

test('sin claves de contrato → null (la ficha omite el bloque)', () => {
  assert.equal(contratoCima({ matricula: '1234ABC', iban: IBAN_CIFRADO }, descifrar), null)
  assert.equal(contratoCima(null, descifrar), null)
})

test('ausente no es «no»: titularCuentaDistinto y primaAnualDudosa quedan null', () => {
  const c = contratoCima({ formaPago: 'CC' }, descifrar)!
  assert.equal(c.titularCuentaDistinto, null)
  assert.equal(c.primaAnualDudosa, null)
})

test('fichaPoliza no presenta como anual una prima marcada primaAnualDudosa (lee el fuente)', () => {
  const fuente = readFileSync(new URL('./cartera-poliza.ts', import.meta.url), 'utf8')
  assert.match(fuente, /primaAnualDudosa === true/)
  const trasGuarda = fuente.slice(fuente.indexOf('\n', fuente.indexOf('const primaBrutaF')))
  assert.doesNotMatch(trasGuarda, /num\(p\.prima(Anual|Bruta)\)/, 'tras la guarda nadie debe volver a leer la prima cruda')
})
