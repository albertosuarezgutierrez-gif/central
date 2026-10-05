// 🛡️ Guardián: un presupuesto de origen `ofertas` (PDFs de compañías, F2 del 05/10/2026) NUNCA llega a
// Codeoscopic — ni a la emisión ni al ReRate (desde la referencia, por pantalla o por Telegram) ni a la
// comprobación de «simulado» (que lee `tarificaciones`, y él no tiene) — y lo que no está REVISADO no
// sale hacia el cliente. `node --test` (gate en CI vía `pnpm test:guardia`).
//
// Cada `test` vigila UN brazo. Para verlos en rojo (hecho al escribirlo, 05/10/2026):
//   · `admiteCodeoscopic` → devuelve `true` siempre                        → cae el brazo 1.
//   · `decidirSalida` → quita la rama `ofertas`                            → cae el brazo 2.
//   · `resolverReferenciaEmision` → quita el `if (p.origen === 'ofertas' …)` → cae el brazo 3.
//   · `enlaceEmision` → quita el primer `if`                               → cae el brazo 4.
//   · `interpretarReferencia` → quita `origen === 'codeoscopic' &&` en emitible → cae el brazo 5.
//   · SQL: borra el CHECK `presupuesto_ofertas_sin_tarificacion`           → cae el brazo 7.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { admiteCodeoscopic, decidirSalida, origenPresupuesto } from '../apps/asegura/lib/presupuesto-origen.ts'
import { enlaceEmision, interpretarReferencia, type BusquedaReferencia } from '../apps/plataforma/lib/referencia-presupuesto-asegura.ts'
import { resolverReferenciaEmision } from '../apps/plataforma/lib/correduria-emision-referencia-tg.ts'

const ROOT = join(import.meta.dirname, '..')
const leer = (f: string) => readFileSync(join(ROOT, f), 'utf8')
const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

// ─── 1. La puerta pura ───────────────────────────────────────────────────────

test('1 · solo un presupuesto de Codeoscopic CON tarificación pasa la puerta de Avant2', () => {
  assert.equal(admiteCodeoscopic({ origen: 'codeoscopic', tarificacionId: UUID(1) }), true)
  assert.equal(admiteCodeoscopic({ origen: 'ofertas', tarificacionId: null }), false)
  // Ni aunque alguien le colara una tarificación: el origen manda.
  assert.equal(admiteCodeoscopic({ origen: 'ofertas', tarificacionId: UUID(1) }), false)
  assert.equal(admiteCodeoscopic({ origen: 'codeoscopic', tarificacionId: null }), false)
  assert.equal(admiteCodeoscopic({ origen: 'otro', tarificacionId: UUID(1) }), false)
  assert.equal(admiteCodeoscopic({ origen: undefined, tarificacionId: UUID(1) }), false)
  assert.equal(origenPresupuesto('OFERTAS'), null)
})

test('2 · salir hacia el cliente: ofertas NO mira «simulado» y exige TODAS las opciones revisadas', () => {
  const p = { origen: 'ofertas', tarificacionId: null }
  // Aunque `simulado` venga a true (o falte), una de ofertas no pasa por esa comprobación…
  assert.deepEqual(decidirSalida(p, { simulado: true, opciones: [{ ofertaId: UUID(2), estadoOferta: 'revisada', mismaOportunidad: true }] }), { ok: true, via: 'ofertas' })
  // …lo que mira es la revisión.
  const sinRevisar = decidirSalida(p, { opciones: [{ ofertaId: UUID(2), estadoOferta: 'extraida', mismaOportunidad: true }] })
  assert.ok(!sinRevisar.ok && sinRevisar.motivo === 'sin_revisar')
  assert.ok(!decidirSalida(p, { opciones: [{ ofertaId: null, estadoOferta: null, mismaOportunidad: false }] }).ok)
  assert.ok(!decidirSalida(p, { opciones: [{ ofertaId: UUID(2), estadoOferta: 'revisada', mismaOportunidad: false }] }).ok, 'oferta de otra oportunidad')
  assert.ok(!decidirSalida(p, { opciones: [] }).ok, 'sin opciones no sale nada')
  // Codeoscopic sigue igual: simulado o sin comprobar = no sale.
  const c = { origen: 'codeoscopic', tarificacionId: UUID(1) }
  assert.deepEqual(decidirSalida(c, { simulado: false }), { ok: true, via: 'codeoscopic' })
  assert.ok(!decidirSalida(c, { simulado: true }).ok)
  assert.ok(!decidirSalida(c, { simulado: null }).ok)
  assert.ok(!decidirSalida({ origen: 'raro', tarificacionId: UUID(1) }, { simulado: false }).ok)
})

// ─── 2. Plataforma: emitir desde la referencia ──────────────────────────────

const PRESUPUESTO_OFERTAS = {
  id: UUID(10), referencia: 'AS-26-0099', clienteId: UUID(11), cliente: 'Comunidad Ejemplo', ramo: 'auto', polizaId: null,
  tarificacionId: null, origen: 'ofertas', oportunidadId: UUID(12), estado: 'aceptado', emitible: true,
  venceEl: '2026-12-01T00:00:00Z', opciones: [{ id: UUID(13), compania: 'Compañía B', producto: 'Plus', primaEur: 600, precioId: null }],
}

function busqueda(p: Record<string, unknown>): BusquedaReferencia {
  return interpretarReferencia('AS-26-0099', 200, { estado: 'ok', presupuesto: p })
}

test('3 · Telegram: «emite AS-…» de un presupuesto de ofertas se NIEGA (aunque el ramo sea coche)', () => {
  const b = busqueda(PRESUPUESTO_OFERTAS)
  assert.equal(b.estado, 'ok')
  const r = resolverReferenciaEmision(b, { compania: null, modalidad: null, primaEur: null })
  assert.equal(r.tipo, 'no')
  assert.match(r.tipo === 'no' ? r.motivo : '', /compañía/)
})

test('4 · pantalla: el enlace de un presupuesto de ofertas NUNCA es la pantalla que emite por Avant2', () => {
  for (const p of [
    { ramo: 'auto', clienteId: UUID(11), oportunidadId: UUID(12), tarificacionId: null, origen: 'ofertas' as const },
    { ramo: 'moto', clienteId: UUID(11), oportunidadId: UUID(12), tarificacionId: UUID(1), origen: 'ofertas' as const },
    { ramo: 'auto', clienteId: UUID(11), oportunidadId: null, tarificacionId: null, origen: 'ofertas' as const },
  ]) {
    const e = enlaceEmision(p)
    assert.equal(e.tipo, 'compania', JSON.stringify(p))
    assert.doesNotMatch(e.href, /-nuevo\?|tarificacion=/)
  }
  // Y el de Avant2 sigue llevando a emitir.
  assert.equal(enlaceEmision({ ramo: 'auto', clienteId: UUID(11), oportunidadId: UUID(12), tarificacionId: UUID(1), origen: 'codeoscopic' }).tipo, 'emitir')
})

test('5 · plataforma no se cree un «emitible: true» de asegura para un presupuesto de ofertas', () => {
  const b = busqueda(PRESUPUESTO_OFERTAS)
  assert.ok(b.estado === 'ok' && b.presupuesto.emitible === false && b.presupuesto.tarificacionId === null)
  // Un origen desconocido no se pinta como si fuera de Avant2.
  assert.equal(busqueda({ ...PRESUPUESTO_OFERTAS, origen: 'raro' }).estado, 'error')
  // Uno de Avant2 sin tarificación es un contrato roto, no «de ofertas».
  assert.equal(busqueda({ ...PRESUPUESTO_OFERTAS, origen: 'codeoscopic' }).estado, 'error')
})

// ─── 3. Asegura: los caminos que leen `tarificaciones` pasan por la puerta ──────

test('6 · asegura: envío, PDF y referencia solo leen `tarificaciones` detrás de `admiteCodeoscopic` (alias `esDeAvant2`)', () => {
  const envio = leer('apps/asegura/lib/envio-presupuesto.ts')
  const avisar = envio.slice(envio.indexOf('export async function avisarPresupuesto'), envio.indexOf('export async function confirmarWhatsapp'))
  const puerta = avisar.indexOf('if (admiteCodeoscopic(p))')
  const consulta = avisar.indexOf('from tarificaciones')
  assert.ok(puerta > 0 && consulta > puerta && consulta < avisar.indexOf('} else if (p.origen === \'ofertas\')'), 'envío: la consulta de simulado va DENTRO de la rama de Avant2')
  assert.match(avisar, /const salida = decidirSalida\(p,/)
  assert.ok(avisar.indexOf('if (!salida.ok) return error(salida.motivo, salida.detalle)') < avisar.indexOf('updateMany('), 'la decisión va antes de la primera escritura')

  const pdf = leer('apps/asegura/lib/presupuesto-pdf-datos.ts')
  assert.match(pdf, /esDeAvant2\(p\)\s*\?\s*await db\.\$queryRaw[\s\S]{0,120}from tarificaciones/)

  const ref = leer('apps/asegura/lib/presupuesto-referencia.ts')
  assert.match(ref, /emitible: deAvant2 && admiteEmitir\(estado\)/)
  assert.match(ref, /const \[tarif\] = deAvant2\s*\?/)

  const acept = leer('apps/asegura/lib/presupuesto-aceptacion.ts')
  const datosDe = acept.slice(acept.indexOf('function datosDe('), acept.indexOf('/** Lo que el portal puede saber de la cuenta'))
  assert.ok(datosDe.indexOf("origen === 'ofertas'") > 0 && datosDe.indexOf("origen === 'ofertas'") < datosDe.indexOf('leerDatosCotizados('), 'aceptación: ofertas no lee la petición de Avant2')
  assert.match(datosDe, /if \(origen !== 'codeoscopic'\) return \{ estado: 'sin_datos'/, 'un origen desconocido no se firma')

  const presupuesto = leer('apps/asegura/lib/presupuesto.ts')
  const reutil = presupuesto.slice(presupuesto.indexOf('async function buscarReutilizable'), presupuesto.indexOf('/** Deja rastro de que se volvió a preparar'))
  assert.match(reutil, /if \(!tarificacionId\) return null/)
  assert.match(reutil, /origen: 'codeoscopic', tarificacionId/)
  // La vía de ofertas crea SIN tarificación y nunca llama a Codeoscopic.
  const ofertas = presupuesto.slice(presupuesto.indexOf('export async function prepararPresupuestoDeOfertas'))
  assert.match(ofertas, /origen: 'ofertas',\s*tarificacionId: null,/)
  assert.doesNotMatch(ofertas, /refrescarProyecto|peticion\(config|cotizar\(|rerate\(|emitir\(|codeoscopic\//i)
  assert.match(ofertas, /requiereRerate: o\.requiereRerate/)
})

// ─── 4. La BD: el cinturón ───────────────────────────────────────────────────

test('7 · SQL: CHECKs de origen y trigger con rama de ofertas ANTES de mirar tarificaciones', () => {
  const sql = leer('apps/asegura/prisma/sql/2026-10-05_oportunidad_ofertas.sql')
  assert.match(sql, /ADD CONSTRAINT presupuesto_codeoscopic_con_tarificacion CHECK \(origen <> 'codeoscopic' OR tarificacion_id IS NOT NULL\)/)
  assert.match(sql, /ADD CONSTRAINT presupuesto_ofertas_sin_tarificacion CHECK \(origen <> 'ofertas' OR tarificacion_id IS NULL\)/)
  assert.match(sql, /ADD CONSTRAINT presupuesto_origen_valido CHECK \(origen IN \('codeoscopic', 'ofertas'\)\)/)
  const funcion = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION seguros.presupuesto_no_enviar_simulado()'))
  const ramaOfertas = funcion.indexOf("IF NEW.origen = 'ofertas' THEN")
  const consultaTarif = funcion.indexOf('FROM seguros.tarificaciones t')
  assert.ok(ramaOfertas > 0 && consultaTarif > ramaOfertas, 'la rama de ofertas sale antes de leer tarificaciones')
  assert.match(funcion.slice(ramaOfertas, consultaTarif), /f\.estado <> 'revisada'/)
  assert.match(funcion.slice(ramaOfertas, consultaTarif), /RETURN NEW;\s*END IF;/)
  // El atajo del portal (UPDATE de visto_at sin tocar los sellos) sigue intacto.
  assert.match(funcion, /IF TG_OP = 'UPDATE'\s+AND NEW\.enviado_at IS NOT DISTINCT FROM OLD\.enviado_at\s+AND NEW\.enlace_generado_at IS NOT DISTINCT FROM OLD\.enlace_generado_at THEN\s+RETURN NEW;/)
})
