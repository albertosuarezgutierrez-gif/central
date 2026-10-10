import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Entrega 2 del diseño de figuras (docs/superpowers/specs/2026-09-29-riesgo-figuras-variantes-design.md):
// moto cotiza con propietario y conductor habitual en OTRA ficha, con el mismo contrato que auto.
// Hasta el 29/09/2026 la pantalla solo mandaba `{ oportunidadId, nota }` y avisaba de que «se cotiza
// con el tomador en todos los papeles». Este cepo lee el fuente de la pantalla y de su acción.

const BASE = join(import.meta.dirname, '..', 'apps/plataforma/app/(usuario)/correduria/cliente/[id]/moto-nuevo')
const pantalla = readFileSync(join(BASE, 'CotizadorMoto.tsx'), 'utf8')
const accion = readFileSync(join(BASE, 'acciones.ts'), 'utf8')
const activas = (s: string) => s.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n')

test('🪤 la pantalla manda `figuras` y las correcciones por figura en el presupuesto nuevo', () => {
  const p = activas(pantalla)
  assert.match(p, /variante: variante \? \{ oportunidadId: variante\.oportunidadId, figuras: figs as Record<string, string>, nota \} : null/)
  assert.match(p, /correccionesDeFiguras\(figs, figCorr, ROLES_MOTO\)/)
})

test('🪤 la acción de servidor pasa `figuras` al puerto (no se queda en el camino)', () => {
  assert.match(activas(accion), /figuras: entrada\.variante\?\.figuras \?\? null/)
})

test('moto NO tiene conductor ocasional: ni se pinta ni viaja', () => {
  assert.match(pantalla, /const ROLES_MOTO: readonly RolExtra\[\] = \['propietario', 'conductor_habitual'\]/)
})

test('una figura incompleta apaga el botón, y el aviso de «misma persona» ya no está', () => {
  assert.match(activas(pantalla), /faltaHistorial \|\| kmInvalido \|\| faltaFigura/)
  assert.doesNotMatch(pantalla, /se cotiza con el tomador en todos los papeles/)
})

test('retarificando una PÓLIZA no hay figuras de variante: van las personas de la póliza', () => {
  assert.match(pantalla, /if \(variante && poliza === null\) \{/)
})
