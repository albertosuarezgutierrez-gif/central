// Cepo de cableado (13/10/2026): los lectores de `seguros.tarificacion_trabajos` que asumen una TARIFICACIÓN de cliente
// excluyen `modo = 'exploracion'` (que puede ir sin cliente: 2026-10-13_tarificador_explorador.sql). `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { bloqueaDuplicado, COMPANIAS_HOGAR_RPA, RAMOS_TARIFICABLES_RPA, validarEntradaRamo } from './tarificador-reglas.ts'
import { planEleccionVersion } from './tarificador-eleccion-reglas.ts'

const APP = join(import.meta.dirname, '..')
const leer = (r: string) => readFileSync(join(APP, r), 'utf8')
// 15/10/2026: los lectores de tarificaciones excluyen también la prueba nocturna de humo (`not in ('exploracion', 'humo')`).
const SIN_EXPLORACION = /coalesce\(to_jsonb\(t\)->>'modo', 'tarificar'\) (<> 'exploracion'|not in \('exploracion', 'humo'\))/

/** Trozo de `fichero` desde `desde` hasta `hasta` (o el final). */
function trozo(fichero: string, desde: string, hasta?: string): string {
  const s = leer(fichero)
  const i = s.indexOf(desde)
  assert.ok(i >= 0, `${fichero}: no está «${desde}»`)
  const j = hasta ? s.indexOf(hasta, i + desde.length) : -1
  return s.slice(i, j > i ? j : undefined)
}

// Un brazo por lector: cada uno se rompe por separado.
const LECTORES: [string, string, string, string | undefined][] = [
  ['bandeja: lista', 'lib/tarificador-bandeja.ts', 'export async function listarBandeja', 'const t = await prisma'],
  ['bandeja: total', 'lib/tarificador-bandeja.ts', 'const t = await prisma', 'return { total'],
  ['avisos de verificación humana', 'lib/tarificador-verificacion.ts', 'export async function pendientesVerificacion', 'export async function marcarAvisados'],
  ['dedupe de encolar', 'lib/tarificador.ts', 'const previos = await tx.$queryRaw', 'const vivo ='],
  ['último riesgo del cliente (modal)', 'lib/tarificador-lectura.ts', 'export async function leerUltimoRiesgo', 'type FilaTrabajo'],
  ['«Probar tarificación» (riesgo a reencolar)', 'lib/tarificador-lectura.ts', 'export async function leerRiesgoParaReencolar', undefined],
  ['ops: trabajos de las renovaciones', 'lib/tarificador-ops.ts', 'const trabajos = await prisma', 'const desdeRecientes'],
  ['ops: métricas y coste del panel', 'lib/tarificador-ops.ts', 'export async function leerPanelTarificador', 'prisma.$queryRaw<{ id: string; terminado_at'],
  ['presupuestos de la oportunidad', 'lib/tarificador-oportunidad.ts', 'export async function leerPresupuestosOportunidad', 'const guardado ='],
  ['riesgo previo del cliente en la oportunidad', 'lib/tarificador-oportunidad.ts', 'const guardado =', 'return {'],
  ['propuesta de la oportunidad', 'lib/propuesta-oportunidad.ts', 'export async function cargarPropuestaOportunidad', 'const trabajos: TrabajoParaPropuesta'],
]

for (const [nombre, fichero, desde, hasta] of LECTORES) {
  test(`exploración fuera: ${nombre}`, () => {
    assert.match(trozo(fichero, desde, hasta), SIN_EXPLORACION, `${nombre} no excluye modo='exploracion'`)
  })
}

test('«Probar tarificación»: solo integraciones de un ramo con adaptador (Hogar solo de Allianz; el resto de Hogar solo explora)', () => {
  const lec = trozo('lib/tarificador-lectura.ts', 'export async function leerIntegracionesActivas', 'export async function leerRiesgoParaReencolar')
  assert.match(lec, /ramo = any\(\$\{\[\.\.\.RAMOS_TARIFICABLES_RPA\]\}::text\[\]\)/)
  // 19/10/2026: Hogar entra en la lista, pero la consulta lo limita a las compañías con bot de tarificación de Hogar.
  assert.match(lec, /and \(ramo <> 'hogar' or compania = any\(\$\{\[\.\.\.COMPANIAS_HOGAR_RPA\]\}::text\[\]\)\)/)
  assert.deepEqual([...COMPANIAS_HOGAR_RPA], ['allianz'])
  // Lista FIJADA (14/10/2026: + auto, coche de Mapfre NSEI; 19/10/2026: + hogar, solo Allianz). Un ramo nuevo aquí abre «Probar tarificación» e integraciones.
  assert.deepEqual([...RAMOS_TARIFICABLES_RPA], ['comunidades', 'moto', 'auto', 'hogar'])
  for (const r of RAMOS_TARIFICABLES_RPA) {
    const v = validarEntradaRamo(r, {})
    assert.ok(v.ok || !v.mensaje.startsWith('ramo no soportado'), `${r} sin adaptador`)
  }
})

test('bandeja: una exploración no se reintenta ni se cancela desde ahí (regla del módulo cableada)', () => {
  assert.match(trozo('lib/tarificador-bandeja.ts', 'export async function aplicarAccionBandeja', 'export type TrazaTrabajo'), /decidirAccionBandeja\(accion, f\.estado, tipoDeError\(f\.error\), f\.modo\)/)
})

test('dedupe: una exploración viva no hace duplicado a una tarificación', () => {
  const ahora = new Date()
  assert.equal(bloqueaDuplicado({ estado: 'pendiente', leaseHasta: null, intentos: 0, modo: 'exploracion' }, ahora, 2), false)
  assert.equal(bloqueaDuplicado({ estado: 'pendiente', leaseHasta: null, intentos: 0, modo: 'tarificar' }, ahora, 2), true)
})

test('elección de versión con IA: nunca sobre una exploración', () => {
  const p = planEleccionVersion({ id: 'x', correduria_id: 'c', compania: 'allianz', ramo: 'moto', estado: 'requiere_humano', modo: 'exploracion', riesgo: {}, error: { tipo: 'captcha' } })
  assert.deepEqual(p, { intentar: false, motivo: 'trabajo de exploración' })
})
