// Cepos de negocio del calendario de vencimientos del portal de la correduría.
//
// Lo que se vigila aquí no es «que compile»: son las cuatro formas conocidas de
// convertir este calendario en una máquina de mandar mentiras a los clientes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

import { join } from 'node:path'

// Se importa el FUENTE por ruta, no por el nombre del paquete: la raíz del
// monorepo no declara `@central/*` en sus dependencias (los tests de aquí son
// guardianes del repo, no de una app) y `node --test` no resolvería el alias.
import {
  polizaGeneraObligacion,
  entraEnVentana,
  fechaAccionable,
} from '../packages/module-seguros-portal/src/obligacion.ts'

const ROOT = join(import.meta.dirname, '..')

const leer = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

test('ninguna poliza del volcado historico genera obligacion', () => {
  // 28.729 pólizas con `import_ref` y vencimientos de 2013-2018. Sin este
  // filtro, la primera pasada del cron manda miles de «se te venció el seguro»
  // sobre contratos muertos hace ocho años.
  for (const ref of ['intranet:1', 'asegura_app:2', '']) {
    assert.equal(
      polizaGeneraObligacion({ importRef: ref, fechaVencimiento: new Date(Date.UTC(2026, 5, 1)) }),
      false,
      `import_ref ${JSON.stringify(ref)} no puede generar aviso`,
    )
  }
})

test('un vencimiento NULL nunca genera obligacion: NULL es «no se sabe»', () => {
  assert.equal(polizaGeneraObligacion({ importRef: null, fechaVencimiento: null }), false)
})

test('el aviso nunca sale despues de la fecha accionable', () => {
  // Avisar de un plazo ya vencido no es un servicio: es decirle al cliente que
  // llega tarde por culpa nuestra.
  const accionable = new Date(Date.UTC(2026, 1, 10))
  assert.equal(entraEnVentana({ fechaAccionable: accionable, hoy: new Date(Date.UTC(2026, 1, 11)) }), false)
  assert.equal(entraEnVentana({ fechaAccionable: accionable, hoy: new Date(Date.UTC(2026, 1, 10)) }), true)
})

test('la fecha accionable siempre es ANTERIOR a la del evento', () => {
  const evento = new Date(Date.UTC(2026, 2, 15))
  assert.ok(fechaAccionable(evento).getTime() < evento.getTime())
})

test('el derivador del portal no deriva obligaciones sin vinculo con la cartera', () => {
  // Sin vínculo no es «esta persona no tiene vencimientos»: es «no sabemos qué
  // ficha de la cartera es la suya». Crear o borrar ahí sería afirmar algo que
  // no se ha mirado.
  const src = leer('apps/asegura-portal/lib/obligaciones.ts')
  assert.match(src, /vinculada/, 'el derivador tiene que mirar si la identidad está vinculada')
  assert.match(src, /identidadId/, 'toda consulta filtra por identidadId')
})

// ── El envío vive en el PANEL, no en el portal ────────────────────────────────
// `portal_canal` guarda solo `valor_hash` (SHA-256 con pimienta) y el
// `ClienteEmail` del portal solo `email_lookup_hash`: el rol del portal no tiene
// GRANT sobre la columna del email. No hay destinatario al que enviar, y un hash
// no se revierte. Este bloque impide que esa corrección se deshaga sola.

const AVISOS = 'apps/asegura/lib/avisos-vencimiento.ts'
const RUTA_CRON = 'apps/asegura/app/api/cron/avisos-vencimiento/route.ts'
const CRON_AUTH = 'apps/asegura/lib/cron-auth.ts'

test('el portal NO manda avisos de vencimiento: no tiene a donde', () => {
  const sospechosos = [
    'apps/asegura-portal/lib/obligaciones.ts',
    'apps/asegura-portal/app/(portal)/boveda/Calendario.tsx',
  ]
  for (const f of sospechosos) {
    const src = leer(f)
    assert.doesNotMatch(
      src,
      /core-email|createMailTransporter|sendMail/,
      `${f} no puede mandar correo: el portal solo guarda hashes del canal`,
    )
  }
})

test('los tres ficheros del envio existen', () => {
  // Un guardián que se salta a sí mismo cuando el fichero no está no es un
  // guardián: es el mismo «no lo he mirado» disfrazado de verde que persigue.
  for (const f of [AVISOS, RUTA_CRON, CRON_AUTH]) {
    assert.ok(existsSync(join(ROOT, f)), `falta ${f}: el envío del aviso no puede desaparecer sin más`)
  }
})

test('el cron de avisos saca el destinatario de la fila, no de la peticion', () => {
  const src = leer(AVISOS)
  assert.doesNotMatch(
    src,
    /searchParams|NextRequest|req\.headers|await req\.json/,
    'el selector del aviso no puede aceptar un destinatario por la petición',
  )
})

test('sin CRON_SECRET no se autoriza a nadie', () => {
  const src = leer(CRON_AUTH)
  assert.match(src, /CRON_SECRET/)
  // Dejar pasar «en desarrollo» convierte un olvido de env en producción en un
  // endpoint abierto que manda correos a clientes reales.
  assert.doesNotMatch(
    src,
    /NODE_ENV\s*!==\s*['"]production['"]\s*\)?\s*return true/,
    'no puede haber un atajo que autorice fuera de producción',
  )
})

test('el cron no manda nada mientras su interruptor este apagado', () => {
  // Un cron de avisos no se estrena a ciegas sobre una base ya cargada: primero
  // se cuenta, y solo con el número comprobado se enciende.
  assert.match(leer(RUTA_CRON), /ASEGURA_AVISOS_ACTIVOS/)
})
