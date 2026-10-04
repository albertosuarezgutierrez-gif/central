import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  actividadesVida,
  decesosDePoliza,
  etiquetaPapel,
  figuraDeCima,
  figurasDePoliza,
  personasDePoliza,
  PAPELES_FIGURA_CIMA,
  terceroDeCima,
  tercerosDeSiniestro,
  textoBeneficiario,
  textoDomicilio,
  vidaDePoliza,
} from './figuras-cima.ts'

// Cifrado de juguete: `v1:` + texto al revés. `v1:roto` lanza (clave equivocada).
const descifrar = (v: string): string => {
  if (v === 'v1:roto') throw new Error('no abre')
  return v.slice(3).split('').reverse().join('')
}
const c = (t: string) => `v1:${t.split('').reverse().join('')}`

const FIGURA = {
  papel: 'conductor_habitual',
  claseFigura: null,
  tipoPersona: 'fisica',
  nombre: c('Ana Pérez Ruiz'),
  documentoCifrado: c('12345678Z'),
  tipoDocumento: 'NI',
  domicilio: { direccion: c('Socorro 24'), claseVia: 'Calle', cp: '41003', localidad: 'Sevilla', provincia: '41', pais: 'ESP' },
  telefono: c('600111222'),
  email: c('ana@example.com'),
}

test('etiquetas de papel: estructurales a mano, las de claves_figura de la norma (§13.3.22)', () => {
  assert.equal(etiquetaPapel('tomador'), 'Tomador')
  assert.equal(etiquetaPapel('conductor_ocasional'), 'Conductor ocasional')
  assert.equal(etiquetaPapel('conductor_contrario'), 'Conductor del contrario')
  // Texto de la norma sin su paréntesis de uso.
  assert.equal(etiquetaPapel('pagador'), 'Pagador')
  assert.equal(etiquetaPapel('asegurado_dependiente'), 'Asegurado dependiente')
  assert.equal(etiquetaPapel('tercero'), 'Tercero')
  assert.equal(etiquetaPapel('testigo'), 'Testigo')
  assert.equal(etiquetaPapel('otro', 'ZZ'), 'Otra figura (clave ZZ)')
  assert.equal(etiquetaPapel('otro'), 'Otra figura')
  assert.equal(etiquetaPapel(null), 'Figura')
  // Todo papel que escribe la ingesta tiene etiqueta legible (sin guiones bajos).
  for (const p of PAPELES_FIGURA_CIMA) assert.doesNotMatch(etiquetaPapel(p), /_/, p)
})

test('una figura se descifra; del documento solo sale «consta» (ni entero ni sus últimos caracteres)', () => {
  const f = figuraDeCima(FIGURA, descifrar)!
  assert.equal(f.nombre, 'Ana Pérez Ruiz')
  assert.equal(f.telefono, '600111222')
  assert.equal(f.email, 'ana@example.com')
  assert.equal(f.domicilio?.direccion, 'Socorro 24')
  assert.equal(f.documentoConsta, true)
  assert.ok(!('documentoFinal' in f))
  assert.ok(!JSON.stringify(f).includes('678Z'))
  assert.equal(f.etiqueta, 'Conductor habitual')
  assert.equal(f.ilegible, false)
  assert.ok(!JSON.stringify(f).includes('12345678Z'))
  assert.ok(!('documentoCifrado' in f))
})

test('nunca sale un «v1:»: sin clave, o con un cifrado que no abre, el campo es null y la figura «ilegible»', () => {
  const sinClave = figuraDeCima(FIGURA)!
  assert.equal(sinClave.nombre, null)
  assert.equal(sinClave.documentoConsta, true)
  assert.equal(sinClave.ilegible, true)
  assert.ok(!JSON.stringify(sinClave).includes('v1:'))

  const rota = figuraDeCima({ ...FIGURA, nombre: 'v1:roto' }, descifrar)!
  assert.equal(rota.nombre, null)
  assert.equal(rota.ilegible, true)

  // Un `v1:` colado en un campo EN CLARO también se tapa.
  const colado = figuraDeCima({ ...FIGURA, domicilio: { cp: 'v1:xx', localidad: 'Sevilla' } }, descifrar)!
  assert.equal(colado.domicilio?.cp, null)
  // Y si el descifrado devuelve OTRO cifrado (clave sin cargar), tampoco.
  const doble = figuraDeCima({ ...FIGURA, email: 'v1:otro' }, () => 'v1:sigue')!
  assert.equal(doble.email, null)
})

test('null = no consta: no se inventa nada y una fila sin nadie no es figura', () => {
  assert.equal(figuraDeCima({ papel: 'pagador', nombre: null, documentoCifrado: null, domicilio: null, telefono: null, email: null }), null)
  const f = figuraDeCima({ papel: 'pagador', nombre: c('X SL') }, descifrar)!
  assert.equal(f.domicilio, null)
  assert.equal(f.telefono, null)
  assert.equal(f.documentoConsta, false)
  assert.equal(f.orden, null)
})

test('figuras de la póliza: clave ausente (antes de #880) = null; lista vacía = []', () => {
  assert.equal(figurasDePoliza({}), null)
  assert.equal(figurasDePoliza(null), null)
  assert.equal(figurasDePoliza({ figuras: 'x' }), null)
  assert.deepEqual(figurasDePoliza({ figuras: [] }), [])
  const l = figurasDePoliza({ figuras: [FIGURA, 3, null, { papel: 'beneficiario', nombre: c('Luis'), orden: '1', porcentaje: '50.00' }] }, descifrar)!
  assert.equal(l.length, 2)
  assert.equal(l[1].etiqueta, 'Beneficiario')
  assert.equal(textoBeneficiario(l[1]), 'Orden 1 · 50%')
})

test('idempotente: lo servido por el puerto se vuelve a leer igual (plataforma, sin clave)', () => {
  const servida = figuraDeCima(FIGURA, descifrar)!
  const releida = figuraDeCima(JSON.parse(JSON.stringify(servida)))!
  assert.deepEqual(releida, servida)
  const t = terceroDeCima({ ...FIGURA, papel: 'contrario', matricula: c('1234ABC'), compania: 'MAPFRE' }, descifrar)!
  assert.deepEqual(terceroDeCima(JSON.parse(JSON.stringify(t))), t)
})

test('terceros del siniestro: matrícula descifrada, compañía y responsabilidad en claro; contrario sin persona cuenta', () => {
  assert.equal(tercerosDeSiniestro(null), null)
  assert.equal(tercerosDeSiniestro({ entradas: [] }), null)
  const l = tercerosDeSiniestro({
    terceros: [
      { ...FIGURA, papel: 'contrario', matricula: c('1234ABC'), compania: 'MAPFRE', codigoEntidadDgs: 'C0058', numeroPoliza: 'P-1', responsabilidad: 'CAUSANTE' },
      { papel: 'contrario', nombre: null, documentoCifrado: null, matricula: null, compania: 'AXA' },
      { papel: 'testigo', nombre: null },
    ],
  }, descifrar)!
  assert.equal(l.length, 2)
  assert.equal(l[0].matricula, '1234ABC')
  assert.equal(l[0].compania, 'MAPFRE')
  assert.equal(l[0].responsabilidad, 'CAUSANTE')
  assert.equal(l[1].nombre, null)
  assert.equal(l[1].compania, 'AXA')
})

test('vida: persona asegurada con fecha de nacimiento, préstamo y actividades en tres estados', () => {
  const v = vidaDePoliza({
    vida: {
      persona: { ...FIGURA, papel: 'asegurado', fechaNacimiento: c('1980-05-02') },
      idAplicacion: 'A1', idEmpleado: null, convenio: null, claseSeguro: 'TE', edadJubilacion: null,
      prestamo: { numero: 'PR-9', descripcion: 'Hipoteca', importeInicial: '120000.00', duracion: '25', unidadDuracion: 'AN' },
      actividadesRiesgo: false, usoArmas: true, trabajoAltura: null,
      maquinas: [{ descripcion: 'Grúa', marca: 'Liebherr', modelo: null }],
    },
  }, descifrar)!
  assert.equal(v.persona?.fechaNacimiento, '1980-05-02')
  assert.equal(v.persona?.etiqueta, 'Asegurado')
  assert.equal(v.prestamo?.importeInicial, '120000.00')
  assert.deepEqual(actividadesVida(v), [
    { etiqueta: 'Actividades de riesgo', valor: false },
    { etiqueta: 'Uso de armas', valor: true },
  ])
  assert.deepEqual(v.maquinas, ['Grúa · Liebherr'])
  assert.equal(vidaDePoliza({}), null)
  // El bloque puede venir dentro de un riesgo.
  assert.equal(vidaDePoliza({ riesgos: [{}, { vida: { idAplicacion: 'B' } }] })?.idAplicacion, 'B')
})

test('decesos: persona y modalidad; sin bloque = null', () => {
  const d = decesosDePoliza({ decesos: { persona: FIGURA, idAplicacion: null, idEmpleado: null, modalidad: 'Prima natural' } }, descifrar)!
  assert.equal(d.modalidad, 'Prima natural')
  assert.equal(d.persona?.nombre, 'Ana Pérez Ruiz')
  assert.equal(decesosDePoliza({ decesos: { persona: null, modalidad: null } }), null)
  assert.deepEqual(personasDePoliza(undefined), { figuras: null, vida: null, decesos: null })
})

test('domicilio legible: provincia por código de la norma, sin repetir la localidad ni el país España', () => {
  assert.equal(textoDomicilio(figuraDeCima(FIGURA, descifrar)!.domicilio), 'Calle Socorro 24, 41003 Sevilla')
  assert.equal(
    textoDomicilio({ direccion: null, claseVia: null, cp: '21001', localidad: 'Huelva capital', provincia: '21', pais: 'PRT' }),
    '21001 Huelva capital (Huelva), PRT',
  )
  assert.equal(textoDomicilio(null), null)
})

test('lo servido por el puerto se relee en plataforma; asegura viejo (sin `personas`) = todo null', async () => {
  const { leerPersonasPuerto } = await import('./figuras-cima.ts')
  assert.deepEqual(leerPersonasPuerto(undefined), { figuras: null, vida: null, decesos: null })
  const servido = JSON.parse(JSON.stringify(personasDePoliza({ figuras: [FIGURA], decesos: { modalidad: 'X' } }, descifrar)))
  const r = leerPersonasPuerto(servido)
  assert.equal(r.figuras?.[0].nombre, 'Ana Pérez Ruiz')
  assert.equal(r.decesos?.modalidad, 'X')
  assert.equal(r.vida, null)
  assert.equal(leerPersonasPuerto({ figuras: [{ papel: 'tomador', nombre: 'v1:zzz' }] }).figuras?.[0].nombre, null)
})
