// Cepos del año/m² del CATASTRO al encolar una exploración por oportunidad (14/10/2026). `node --test`. Catastro SIMULADO:
// ninguna llamada de red; direcciones y referencias SINTÉTICAS (no son de ningún inmueble real).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { completarRiesgoConCatastro, siglaViaOportunidad, type DepsCatastroExploracion } from './tarificador-explorador-catastro.ts'

const riesgoBase = () => ({
  tomador: { nif: '00000000T', nombre: 'Ficticio', apellido1: 'Deprueba' },
  inmueble: { tipoVia: 'Calle', nombreVia: 'Inventada', numero: '0', codigoPostal: '00000', municipio: 'VILLAPRUEBA', provincia: 'PROVINCIA PRUEBA', planta: '1' } as Record<string, string | number>,
  hogar: { uso: 'MainResidence', regimen: 'Owner' } as Record<string, string | number>,
})
const vivienda = { cp: '00000', provincia: 'Provincia Prueba', municipio: 'Villaprueba', tipoViaId: 'Calle', nombreVia: 'Inventada', numeroVia: '0', planta: '1', puertaVivienda: 'A', anioConstruccion: null, metrosCuadrados: null }
const ref = (s: string) => `0000000XX0000X${s}`
const inm = (s: string, planta: string | null, puerta: string | null) => ({ refCompleta: ref(s), planta, puerta, codigoPostal: '00000' })

function simulado(inmuebles: ReturnType<typeof inm>[] | null | Error, porRef: Record<string, { anioConstruccion: number | null; metrosCuadrados: number | null }> = {}) {
  const llamadas = { inmuebles: 0, porReferencia: [] as string[] }
  const deps: DepsCatastroExploracion = {
    inmuebles: async () => {
      llamadas.inmuebles++
      if (inmuebles instanceof Error) throw inmuebles
      return inmuebles === null ? null : { via: 'INVENTADA', inmuebles }
    },
    porReferencia: async (r) => {
      llamadas.porReferencia.push(r)
      if (!/^[0-9A-Z]{20}$/.test(r)) return { estado: 'invalida' }
      return porRef[r] ? { estado: 'ok', catastro: porRef[r] } : { estado: 'no_encontrado' }
    },
  }
  return { deps, llamadas }
}

test('ÚNICO inmueble que casa con planta/puerta → año y m² al riesgo del trabajo', async () => {
  const { deps, llamadas } = simulado([inm('0001AA', '01', 'A'), inm('0002AA', '01', 'B'), inm('0003AA', '02', 'A')], { [ref('0001AA')]: { anioConstruccion: 1975, metrosCuadrados: 85 } })
  const base = riesgoBase()
  const r = await completarRiesgoConCatastro(base, vivienda, deps)
  assert.equal(r.estado, 'completado')
  assert.deepEqual(r.anadidos, ['anioConstruccion', 'superficieM2'])
  assert.equal(r.riesgo.inmueble.anioConstruccion, 1975)
  assert.equal(r.riesgo.inmueble.superficieM2, 85)
  assert.deepEqual(llamadas.porReferencia, [ref('0001AA')])
  assert.ok(!('anioConstruccion' in base.inmueble), 'no muta el riesgo de entrada')
})

test('VARIOS candidatos (sin puerta, dos pisos en la planta) → sin valor, sin consultar ninguna referencia', async () => {
  const { deps, llamadas } = simulado([inm('0001AA', '01', 'A'), inm('0002AA', '01', 'B')], { [ref('0001AA')]: { anioConstruccion: 1975, metrosCuadrados: 85 } })
  const r = await completarRiesgoConCatastro(riesgoBase(), { ...vivienda, puertaVivienda: null }, deps)
  assert.equal(r.estado, 'varios')
  assert.deepEqual(r.anadidos, [])
  assert.ok(!('anioConstruccion' in r.riesgo.inmueble) && !('superficieM2' in r.riesgo.inmueble))
  assert.deepEqual(llamadas.porReferencia, [])
})

test('NINGUNO que case (o vía ambigua) → sin valor', async () => {
  const a = await completarRiesgoConCatastro(riesgoBase(), vivienda, simulado([inm('0001AA', '03', 'C')]).deps)
  assert.equal(a.estado, 'ninguno')
  assert.ok(!('anioConstruccion' in a.riesgo.inmueble))
  const b = await completarRiesgoConCatastro(riesgoBase(), vivienda, simulado(null).deps)
  assert.equal(b.estado, 'via_ambigua')
  assert.ok(!('superficieM2' in b.riesgo.inmueble))
})

test('ERROR o tiempo agotado del Catastro → se sigue sin valor y NUNCA lanza', async () => {
  const a = await completarRiesgoConCatastro(riesgoBase(), vivienda, simulado(new Error('ECONNRESET')).deps)
  assert.equal(a.estado, 'error')
  assert.ok(!('anioConstruccion' in a.riesgo.inmueble))
  const colgado: DepsCatastroExploracion = { inmuebles: () => new Promise(() => {}), porReferencia: () => new Promise(() => {}), timeoutMs: 30 }
  const b = await completarRiesgoConCatastro(riesgoBase(), vivienda, colgado)
  assert.equal(b.estado, 'error')
  const porRefFalla: DepsCatastroExploracion = { inmuebles: async () => null, porReferencia: async () => ({ estado: 'error', motivo: 'caído' }) }
  const c = await completarRiesgoConCatastro(riesgoBase(), { ...vivienda, referenciaCatastral: ref('0001AA') }, porRefFalla)
  assert.equal(c.estado, 'error')
})

test('con REFERENCIA catastral del piso: va directa (sin buscar por dirección); la de 14 cae a la dirección', async () => {
  const s = simulado([inm('0002AA', '01', 'A')], { [ref('0001AA')]: { anioConstruccion: 1990, metrosCuadrados: 70 }, [ref('0002AA')]: { anioConstruccion: 2000, metrosCuadrados: 60 } })
  const a = await completarRiesgoConCatastro(riesgoBase(), { ...vivienda, referenciaCatastral: ref('0001AA') }, s.deps)
  assert.equal(a.riesgo.inmueble.anioConstruccion, 1990)
  assert.equal(s.llamadas.inmuebles, 0)
  const b = await completarRiesgoConCatastro(riesgoBase(), { ...vivienda, referenciaCatastral: '0000000XX0000X' }, s.deps)
  assert.equal(b.riesgo.inmueble.anioConstruccion, 2000)
  assert.equal(s.llamadas.inmuebles, 1)
})

test('solo completa lo que FALTA; si no falta nada, ni consulta', async () => {
  const s = simulado([inm('0001AA', '01', 'A')], { [ref('0001AA')]: { anioConstruccion: 1975, metrosCuadrados: 85 } })
  const conAnio = riesgoBase()
  conAnio.inmueble.anioConstruccion = 2010
  const a = await completarRiesgoConCatastro(conAnio, vivienda, s.deps)
  assert.equal(a.riesgo.inmueble.anioConstruccion, 2010)
  assert.deepEqual(a.anadidos, ['superficieM2'])
  const completo = riesgoBase()
  completo.inmueble.anioConstruccion = 2010
  completo.inmueble.superficieM2 = 50
  const s2 = simulado(new Error('no debía llamarse'))
  const b = await completarRiesgoConCatastro(completo, vivienda, s2.deps)
  assert.equal(b.estado, 'no_hacia_falta')
  assert.equal(s2.llamadas.inmuebles + s2.llamadas.porReferencia.length, 0)
})

test('sin tipo de vía reconocible o sin número: no se busca (sin_datos_para_buscar)', async () => {
  const s = simulado([inm('0001AA', '01', 'A')])
  const a = await completarRiesgoConCatastro(riesgoBase(), { ...vivienda, tipoViaId: '123', direccion: null }, s.deps)
  assert.equal(a.estado, 'sin_datos_para_buscar')
  const b = await completarRiesgoConCatastro(riesgoBase(), { ...vivienda, numeroVia: null }, s.deps)
  assert.equal(b.estado, 'sin_datos_para_buscar')
  assert.equal(s.llamadas.inmuebles, 0)
})

test('siglaViaOportunidad: palabra, sigla o id atestiguado del vendor; si no, el texto libre; nunca se adivina', () => {
  assert.equal(siglaViaOportunidad({ tipoViaId: 'Calle' }), 'CL')
  assert.equal(siglaViaOportunidad({ tipoViaId: 'AV' }), 'AV')
  assert.equal(siglaViaOportunidad({ tipoViaId: 'Street' }), 'CL')
  assert.equal(siglaViaOportunidad({ tipoViaId: '123', direccion: 'Plaza Inventada 1' }), 'PZ')
  assert.equal(siglaViaOportunidad({ tipoViaId: 'Boulevard' }), null)
})

test('🪤 planta «1» + puerta «Izquierda» casa con el «01»/«IZ» del Catastro (14/10/2026 daba `ninguno`)', async () => {
  const { deps, llamadas } = simulado(
    [inm('0001AA', '01', 'IZ'), inm('0002AA', '01', 'DR'), inm('0003AA', '02', 'IZ')],
    { [ref('0001AA')]: { anioConstruccion: 1975, metrosCuadrados: 85 } },
  )
  const r = await completarRiesgoConCatastro(riesgoBase(), { ...vivienda, planta: '1', puertaVivienda: 'Izquierda' }, deps)
  assert.equal(r.estado, 'completado')
  assert.deepEqual(llamadas.porReferencia, [ref('0001AA')])
})
