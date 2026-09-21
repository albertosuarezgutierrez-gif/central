import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizarCompania,
  resolverCompania,
  defensaDeCartera,
  bloqueaEmision,
  etiquetaDefensa,
  fraseDefensa,
  polizaDefiende,
  type CompaniaCatalogo,
  type PolizaCliente,
} from './defensa-cartera.ts'

/**
 * El catálogo real de `seguros.companias_dgs`, medido el 21/09/2026. Se copia
 * aquí tal cual (no se inventa) para que el test hable del dato que hay.
 */
const CATALOGO: CompaniaCatalogo[] = [
  { codigoDgs: 'C0058', nombreComun: 'Mapfre', nombreCima: 'Mapfre' },
  { codigoDgs: 'C0109', nombreComun: 'Allianz', nombreCima: 'Allianz' },
  { codigoDgs: 'C0468', nombreComun: 'Occident', nombreCima: 'Occident' },
  { codigoDgs: 'C0613', nombreComun: 'Reale', nombreCima: null },
  { codigoDgs: 'C0072', nombreComun: 'Generali', nombreCima: null },
  { codigoDgs: 'E0118', nombreComun: 'Fidelidade', nombreCima: null },
  { codigoDgs: 'M0083', nombreComun: 'Mutua Madrileña', nombreCima: null },
]

const poliza = (p: Partial<PolizaCliente>): PolizaCliente => ({
  codigoEntidadDgs: null,
  aseguradora: null,
  estado: 'activa',
  viva: true,
  ...p,
})

// ─── Normalización ───────────────────────────────────────────────────────────

test('la razón social de CIMA y la marca del vendor normalizan igual', () => {
  assert.equal(
    normalizarCompania('MAPFRE ESPAÑA COMPAÑIA DE SEGUROS Y REASEGUROS SA'),
    normalizarCompania('Mapfre'),
  )
  assert.equal(normalizarCompania('Mutua Madrileña'), 'madrilena')
})

test('un nombre que es TODO ruido no se queda en cadena vacía', () => {
  // Dos vacías se emparejarían entre sí: es la forma silenciosa de fundir dos
  // compañías distintas.
  assert.notEqual(normalizarCompania('Seguros, S.A.'), '')
  assert.equal(normalizarCompania(null), '')
  assert.equal(normalizarCompania('   '), '')
})

// ─── Resolver identidad ──────────────────────────────────────────────────────

test('el nombre del vendor resuelve al código DGS del catálogo', () => {
  assert.deepEqual(resolverCompania(CATALOGO, 'Reale'), {
    estado: 'resuelta',
    codigoDgs: 'C0613',
    nombre: 'Reale',
  })
})

test('🚨 «Fiatc» NO está en el catálogo: sin_resolver, nunca una compañía cualquiera', () => {
  // Medido el 21/09/2026: de los 7 nombres de vendor vistos en
  // `tarificacion_precios`, este es el único que no tiene fila.
  const r = resolverCompania(CATALOGO, 'Fiatc')
  assert.equal(r.estado, 'sin_resolver')
})

test('🚨 dos filas candidatas = AMBIGUA, no la primera', () => {
  const conGemela: CompaniaCatalogo[] = [
    ...CATALOGO,
    { codigoDgs: 'C9999', nombreComun: 'Reale Seguros', alias: ['Reale'] },
  ]
  const r = resolverCompania(conGemela, 'Reale')
  assert.equal(r.estado, 'ambigua')
  assert.deepEqual(r.estado === 'ambigua' ? r.codigos.sort() : [], ['C0613', 'C9999'])
})

// ─── La regla ────────────────────────────────────────────────────────────────

test('caso de Alberto: el cliente ya tiene póliza ahí → ocupada y no emitible', () => {
  const d = defensaDeCartera({
    compania: 'Mapfre',
    catalogo: CATALOGO,
    polizas: [poliza({ codigoEntidadDgs: 'C0058', aseguradora: 'Mapfre', ramo: 'hogar', numeroPoliza: '123' })],
  })
  assert.equal(d.estado, 'ocupada')
  assert.equal(d.coincidencia, 'dgs')
  assert.equal(d.polizas.length, 1)
  assert.equal(bloqueaEmision(d), true)
  assert.match(etiquetaDefensa(d), /no emitible/)
})

test('la defensa de cartera es de CUALQUIER ramo, no solo del que se cotiza', () => {
  // «Si José Suárez tiene póliza en una compañía no puedo hacérsela en la
  // misma»: la relación es cliente↔compañía, no producto↔producto.
  const d = defensaDeCartera({
    compania: 'Occident',
    catalogo: CATALOGO,
    polizas: [poliza({ codigoEntidadDgs: 'C0468', aseguradora: 'Occident', ramo: 'comunidades' })],
  })
  assert.equal(d.estado, 'ocupada')
})

test('compañía distinta → libre, y la frase NO dice que el cliente no tenga nada ahí', () => {
  const d = defensaDeCartera({
    compania: 'Allianz',
    catalogo: CATALOGO,
    polizas: [poliza({ codigoEntidadDgs: 'C0058', aseguradora: 'Mapfre' })],
  })
  assert.equal(d.estado, 'libre')
  assert.equal(bloqueaEmision(d), false)
  assert.match(d.motivo, /ninguna póliza NUESTRA/)
})

test('🚨 una CANCELADA no bloquea: es justo cuando se puede volver a entrar', () => {
  const d = defensaDeCartera({
    compania: 'Mapfre',
    catalogo: CATALOGO,
    polizas: [poliza({ codigoEntidadDgs: 'C0058', aseguradora: 'Mapfre', estado: 'cancelada' })],
  })
  assert.equal(d.estado, 'libre')
  assert.equal(d.exPolizas, 1)
  assert.match(d.motivo, /cancelada/)
})

test('🚨 el volcado histórico (lead) tampoco bloquea: una póliza de 2016 no defiende nada', () => {
  const d = defensaDeCartera({
    compania: 'Mapfre',
    catalogo: CATALOGO,
    polizas: [poliza({ codigoEntidadDgs: 'C0058', aseguradora: 'Mapfre', viva: false })],
  })
  assert.equal(d.estado, 'libre')
  assert.equal(d.exPolizas, 1)
})

test('la compañía ACTUAL de la póliza que se retarifica es un caso aparte', () => {
  const d = defensaDeCartera({
    compania: 'Allianz',
    catalogo: CATALOGO,
    polizas: [poliza({ id: 'p1', codigoEntidadDgs: 'C0109', aseguradora: 'Allianz', ramo: 'auto' })],
    polizaActualId: 'p1',
  })
  assert.equal(d.estado, 'actual')
  assert.equal(bloqueaEmision(d), true)
  assert.match(d.motivo, /renueva o se negocia/)
})

// ─── Los «no se sabe», que son el corazón del fichero ────────────────────────

test('🚨 `polizas: null` = no se ha mirado → desconocida, NUNCA libre', () => {
  // Es el caso del despliegue desacoplado: plataforma con una versión del
  // puerto de asegura que todavía no manda el campo.
  const d = defensaDeCartera({ compania: 'Mapfre', catalogo: CATALOGO, polizas: null })
  assert.equal(d.estado, 'desconocida')
  assert.match(d.motivo, /no se ha mirado/)
  assert.equal(bloqueaEmision(d), false, 'una duda no esconde un precio vendible')
})

test('🚨 `polizas: []` = mirado y no tiene ninguna → libre (y sí es distinto de null)', () => {
  const d = defensaDeCartera({ compania: 'Mapfre', catalogo: CATALOGO, polizas: [] })
  assert.equal(d.estado, 'libre')
})

test('🚨 una póliza sin identificar impide afirmar «libre»', () => {
  // La compañía del precio resuelve (Mapfre → C0058) pero la póliza no trae ni
  // código ni un nombre del catálogo: no se puede descartar que sea la misma.
  const d = defensaDeCartera({
    compania: 'Mapfre',
    catalogo: CATALOGO,
    polizas: [poliza({ aseguradora: 'Aseguradora rara del volcado' })],
  })
  assert.equal(d.estado, 'desconocida')
  assert.equal(d.sinIdentificar, 1)
})

test('🚨 la compañía del precio no está en el catálogo → desconocida, no libre', () => {
  const d = defensaDeCartera({
    compania: 'Fiatc',
    catalogo: CATALOGO,
    polizas: [poliza({ codigoEntidadDgs: 'C0058', aseguradora: 'Mapfre' })],
  })
  assert.equal(d.estado, 'desconocida')
  assert.equal(etiquetaDefensa(d), 'sin comprobar')
})

test('sin catálogo, el nombre exacto sirve — y se DECLARA que ha sido por nombre', () => {
  const d = defensaDeCartera({
    compania: 'Fiatc',
    catalogo: [],
    polizas: [poliza({ aseguradora: 'FIATC, S.A.' })],
  })
  assert.equal(d.estado, 'ocupada')
  assert.equal(d.coincidencia, 'nombre')
  assert.match(fraseDefensa(d), /por el NOMBRE, no por el código DGS/)
})

test('🚨 dos códigos DGS distintos NO se funden AUNQUE EL NOMBRE SEA EL MISMO', () => {
  // El caso que de verdad pone a prueba «identidad, no etiqueta»: la póliza de
  // CIMA se llama «Occident» igual que el precio del vendor, pero su código es
  // el de la entidad ANTERIOR (Plus Ultra, C0517, absorbida). Si el nombre
  // pudiera desempatar, esta fila se marcaría como no emitible y escondería un
  // precio vendible. Solo el código manda.
  const d = defensaDeCartera({
    compania: 'Occident',
    catalogo: [
      { codigoDgs: 'C0468', nombreComun: 'Occident' },
      { codigoDgs: 'C0517', nombreComun: 'Plus Ultra', nombreCima: 'Occident Plus Ultra' },
    ],
    polizas: [poliza({ codigoEntidadDgs: 'C0517', aseguradora: 'Occident' })],
  })
  assert.equal(d.estado, 'libre')
  assert.equal(d.sinIdentificar, 0)
})

test('un precio sin compañía no se da por libre', () => {
  const d = defensaDeCartera({ compania: null, catalogo: CATALOGO, polizas: [] })
  assert.equal(d.estado, 'desconocida')
})

test('`estado: null` no se supone vigente', () => {
  assert.equal(polizaDefiende(poliza({ estado: null })), false)
  assert.equal(polizaDefiende(poliza({ estado: 'activa' })), true)
  assert.equal(polizaDefiende(poliza({ estado: 'activa', viva: false })), false)
})
