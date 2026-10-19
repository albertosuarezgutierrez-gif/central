// 🪤 Cepo del contrato de datos (19/10/2026, spec lead → propuesta §1.1, hueco H1).
//
// `contratoDatos(ramo)` (@central/module-seguros) es la fuente ÚNICA de lo que se le pide al cliente. Aquí se ata a los
// validadores que de verdad deciden si se puede tarificar: `revisarDatos<Ramo>()` de Codeoscopic y `obligatoriosPara()`
// de los bots RPA. Si alguien añade un obligatorio a un validador y no le da entrada (y pregunta) en el contrato, esto
// falla: la petición al cliente nunca lo pediría y el lead se quedaría sin tarificar sin que nadie supiera por qué.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clavesCubiertas, contratoDatos } from '@central/module-seguros'
import { capacidadesConObligatorios, obligatoriosPara } from '@central/module-tarificacion'
import { revisarDatosAuto } from './codeoscopic/peticion-auto.ts'
import { revisarDatosMoto } from './codeoscopic/peticion-moto.ts'
import { revisarDatosHogar } from './codeoscopic/peticion-hogar.ts'
import { revisarDatosVida } from './codeoscopic/peticion-vida.ts'
import { revisarDatosSalud } from './codeoscopic/peticion-salud.ts'
import { revisarDatosDecesos } from './codeoscopic/peticion-decesos.ts'

type Reparo = { campo: PropertyKey }
const campos = (xs: readonly Reparo[]) => [...new Set(xs.map((x) => String(x.campo)))]

/** Riesgos vacíos y a medias: cada uno despierta reglas condicionales distintas (NIE, emisión, historial, figuras). */
const NIE = { dni: 'X1234567L' }
const casos: Array<[ramo: string, reparos: () => readonly Reparo[]]> = [
  ['auto', () => revisarDatosAuto({})],
  ['auto', () => revisarDatosAuto({ ...NIE, cpResidencia: '41001', municipioResidenciaId: 1, aseguradoAntes: true, aniosAsegurado: 0, aniosSinSiniestros: 2 } as never, { paraEmitir: true })],
  ['auto', () => revisarDatosAuto({ conductor: {}, propietario: {}, conductorOcasional: {} } as never)],
  ['auto', () => revisarDatosAuto({ tomadorEsEmpresa: true } as never)],
  ['moto', () => revisarDatosMoto({})],
  ['moto', () => revisarDatosMoto({ ...NIE, conductor: {}, propietario: {}, aseguradoAntes: true, aniosSinSiniestros: 2, experienciaConduccion: 'OtherMotorcycle' } as never)],
  ['hogar', () => revisarDatosHogar({})],
  ['hogar', () => revisarDatosHogar({ ...NIE, capitalContenido: -1, anioUltimaReforma: 1, joyasEnCajaFuerte: -1, joyasFueraDeCaja: -1, objetosDeValor: -1, perrosPeligrosos: -1 } as never)],
  ['vida', () => revisarDatosVida({})],
  ['vida', () => revisarDatosVida({ ...NIE, asegurado: {}, duracionAnios: 'x', profesion: 'x', fumador: 'x' } as never)],
  ['salud', () => revisarDatosSalud({})],
  ['salud', () => revisarDatosSalud({ aseguradosAdicionales: [{}] } as never)],
  ['decesos', () => revisarDatosDecesos({})],
  ['decesos', () => revisarDatosDecesos({ aseguradosAdicionales: [{}] } as never)],
]

test('🪤 todo campo que exige Codeoscopic tiene entrada en el contrato de su ramo', () => {
  const huecos: string[] = []
  for (const [ramo, reparos] of casos) {
    const cubiertas = clavesCubiertas(contratoDatos(ramo))
    for (const c of campos(reparos())) if (!cubiertas.has(c)) huecos.push(`${ramo}.${c}`)
  }
  assert.deepEqual([...new Set(huecos)], [], 'campos exigidos por revisarDatos* sin entrada en contratoDatos (module-seguros/contrato-datos.ts)')
})

test('🪤 todo obligatorio de un bot RPA tiene entrada en el contrato de su ramo', () => {
  const huecos: string[] = []
  const capacidades = capacidadesConObligatorios()
  assert.ok(capacidades.length > 0, 'sin declaraciones de bots: el cepo no mira nada')
  for (const { compania, ramo } of capacidades) {
    const cubiertas = clavesCubiertas(contratoDatos(ramo))
    for (const o of obligatoriosPara(compania, ramo) ?? []) if (!cubiertas.has(o.clave)) huecos.push(`${compania}/${ramo}.${o.clave}`)
  }
  assert.deepEqual(huecos, [], 'obligatorios de los bots sin entrada en contratoDatos (module-seguros/contrato-datos.ts)')
})
