// 🪤 Leads que entran por CORREO a hola@ (19/10/2026, triaje de plataforma). hola@ es un buzón público:
// un aluvión de spam no puede llenar la cartera de fichas ni «Hoy» de tareas. Los dos topes se cuentan
// en BD dentro de la transacción del alta y bajo cerrojo; aquí no hay BD, así que se lee el FUENTE.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const edicion = readFileSync(new URL('./cartera-edicion.ts', import.meta.url), 'utf8')
const alta = edicion.slice(edicion.indexOf('export async function altaCliente('), edicion.indexOf('const CLAVES_ATRIBUCION_WEB'))

test('🪤 alta con fuente correo: tope diario contado en BD, bajo cerrojo, dentro de la transacción → 429 tope', () => {
  assert.ok(alta.length > 0, 'no encuentro altaCliente')
  const tx = alta.indexOf('db.$transaction(')
  const tope = alta.indexOf("if (a.fuente === 'correo')")
  assert.ok(tx > 0 && tope > tx, 'el tope de altas por correo no está DENTRO de la transacción del alta')
  assert.match(alta, /pg_advisory_xact_lock\(hashtext\(\$\{`tope-alta-correo:/)
  assert.match(alta, /fuente::text = 'correo'/)
  assert.match(alta, />= TOPE_DIARIO_ALTAS_CORREO\) throw new TopeAltaCorreo\(\)/)
  assert.match(alta, /e instanceof TopeAltaCorreo[\s\S]{0,200}estado: 'tope'[\s\S]{0,200}status: 429/)
  assert.match(edicion, /export const TOPE_DIARIO_ALTAS_CORREO = 20\b/)
})

test('🪤 oportunidad con fuente correo: solo del actor del triaje, con su origen y su tope diario', () => {
  const ruta = readFileSync(new URL('../app/api/operador/oportunidad/route.ts', import.meta.url), 'utf8')
  assert.match(ruta, /b\.fuente !== 'correo' \|\| actorDe\(b\) !== ACTOR_TRIAJE_CORREO\) return \{\}/)
  assert.match(ruta, /const ACTOR_TRIAJE_CORREO = 'agente:triaje-correo'/)
  assert.match(ruta, /topeDiario: TOPE_DIARIO_LEADS_CORREO/)
})
