// Cepo de coherencia ENTRE paquetes (26/10/2026): las opciones del enlace de datos de hogar casan con las claves del bot
// (`@central/module-tarificacion`) y los ids que se escriben en `datosVivienda` son los que Codeoscopic ya ha dado
// (`DEFECTOS_HOGAR`) o el bot conoce (`ETIQUETAS_ID_HOGAR`). El cepo de dentro de module-seguros no puede mirar aquí.
import test from 'node:test'
import assert from 'node:assert/strict'
import { ALARMA_ID_CODEOSCOPIC, IDS_CODEOSCOPIC_HOGAR_ATESTIGUADOS, OPCIONES_HOGAR_A_VIVIENDA } from '@central/module-seguros'
import { ETIQUETAS_ID_HOGAR, REGIMENES_VIVIENDA, TIPOS_VIVIENDA, USOS_VIVIENDA } from '@central/module-tarificacion'
import { DEFECTOS_HOGAR } from './codeoscopic/catalogos.ts'

test('cada opción de hogar va a una clave canónica del bot', () => {
  const del: Record<string, readonly string[]> = { regimen: REGIMENES_VIVIENDA, usoVivienda: USOS_VIVIENDA, tipoVivienda: TIPOS_VIVIENDA }
  for (const [clave, m] of Object.entries(OPCIONES_HOGAR_A_VIVIENDA)) {
    for (const [valor, canonica] of Object.entries(m.canonica)) {
      assert.ok(del[clave].includes(canonica), `${clave}=${valor} → «${canonica}» no es clave del bot`)
    }
  }
})

test('los ids de Codeoscopic que se escriben están atestiguados en el código (no de memoria)', () => {
  const conocidos = new Set<string>([
    ...Object.values(DEFECTOS_HOGAR).filter((x): x is string => typeof x === 'string'),
    ...Object.values(ETIQUETAS_ID_HOGAR).flatMap((m) => Object.keys(m)),
  ])
  for (const id of IDS_CODEOSCOPIC_HOGAR_ATESTIGUADOS) assert.ok(conocidos.has(id), `id ${id} sin atestiguar`)
  for (const m of Object.values(OPCIONES_HOGAR_A_VIVIENDA)) for (const id of Object.values(m.idCodeoscopic)) assert.ok(conocidos.has(id), id)
  for (const id of Object.values(ALARMA_ID_CODEOSCOPIC)) assert.ok(conocidos.has(id), id)
  // Y van al catálogo correcto: régimen = `uses`, uso = `occupancy-types`, tipo = `property-types`, alarma = `alarm-types`.
  assert.equal(DEFECTOS_HOGAR.uses, OPCIONES_HOGAR_A_VIVIENDA.regimen.idCodeoscopic.propietario)
  assert.equal(DEFECTOS_HOGAR['occupancy-types'], OPCIONES_HOGAR_A_VIVIENDA.usoVivienda.idCodeoscopic.habitual)
  assert.equal(DEFECTOS_HOGAR['property-types'], OPCIONES_HOGAR_A_VIVIENDA.tipoVivienda.idCodeoscopic.piso)
  assert.equal(DEFECTOS_HOGAR['alarm-types'], ALARMA_ID_CODEOSCOPIC.no)
})
