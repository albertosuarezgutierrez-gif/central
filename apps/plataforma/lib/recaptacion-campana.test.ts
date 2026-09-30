// apps/plataforma/lib/recaptacion-campana.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  AVISO_FIN_CAMPANA, DIAS_SIN_REPETIR_FIN, decidirAvisoFinCampana, lineaAperturas, textoFinCampana,
  vaciaLaColaDePrimeros, type EntradaCampana,
} from './recaptacion-campana.ts'
import { AVISOS_POR_ID } from './telegram/catalogo.ts'

function lote(p: Partial<EntradaCampana> = {}): EntradaCampana {
  return {
    enviados: 5,
    primerosEnviados: 5,
    fallidos: 0,
    pendientesPrimerEnvio: 0,
    emailEnviadosTotal: 95,
    emailAbiertosTotal: 25,
    enEsperaVentanaSoloCorreo: 0,
    ...p,
  }
}

/** Texto del aviso si la decisión es avisar (la bitácora dice que no ha salido). */
function aviso(p: Partial<EntradaCampana> = {}): string {
  const d = decidirAvisoFinCampana(lote(p), false)
  assert.equal(d.estado, 'avisar')
  return d.estado === 'avisar' ? d.texto : ''
}

// ── Cuándo toca ──────────────────────────────────────────────────────────────

test('la pasada que vacía la cola, sin aviso previo en la bitácora, avisa con el titular', () => {
  assert.match(aviso(), /^📧 \*Recaptación por email: ya se ha escrito a todos los leads solo-correo que hoy están en ventana\.\*/)
})

test('CASO REAL: cola vacía y esta pasada solo mandó SEGUIMIENTOS → no avisa', () => {
  // `enviados` > 0 porque tras el cooldown se vuelve a escribir a los ya contactados,
  // pero ningún primer correo: la cola no se ha vaciado HOY.
  const r = lote({ enviados: 7, primerosEnviados: 0 })
  assert.equal(vaciaLaColaDePrimeros(r), false)
  assert.deepEqual(decidirAvisoFinCampana(r, false), { estado: 'no_toca' })
})

test('primerosEnviados null («no se sabe») NO avisa aunque haya enviados', () => {
  assert.deepEqual(decidirAvisoFinCampana(lote({ primerosEnviados: null }), false), { estado: 'no_toca' })
})

test('quedan pendientes de primer envío: no se avisa', () => {
  assert.deepEqual(decidirAvisoFinCampana(lote({ pendientesPrimerEnvio: 3 }), false), { estado: 'no_toca' })
})

test('pendientesPrimerEnvio null («no se sabe») NO avisa', () => {
  assert.deepEqual(decidirAvisoFinCampana(lote({ pendientesPrimerEnvio: null }), false), { estado: 'no_toca' })
})

test('cola ya vacía y hoy no se envió nada: no avisa', () => {
  assert.deepEqual(decidirAvisoFinCampana(lote({ enviados: 0, primerosEnviados: 0 }), false), { estado: 'no_toca' })
})

// ── Dedupe con la bitácora ───────────────────────────────────────────────────

test('ya salió en la ventana de 60 días (leads nuevos vacían la cola otra vez): no se repite', () => {
  assert.deepEqual(decidirAvisoFinCampana(lote(), true), { estado: 'ya_avisado' })
})

test('bitácora ilegible: NO se avisa a ciegas', () => {
  assert.deepEqual(decidirAvisoFinCampana(lote(), null), { estado: 'bitacora_ilegible' })
})

test('la ventana del dedupe es de 60 días', () => {
  assert.equal(DIAS_SIN_REPETIR_FIN, 60)
})

// ── El id del aviso: el mismo en el catálogo, en tgAviso y en la consulta ────

test('el id propio está catalogado en la categoría correduría', () => {
  assert.equal(AVISO_FIN_CAMPANA, 'correduria.recaptacion-fin')
  assert.equal(AVISOS_POR_ID.get(AVISO_FIN_CAMPANA)?.categoria, 'correduria')
})

test('el cron emite con ESE id literal y deduplica por la constante (si divergen, el dedupe no ve nada)', () => {
  const ruta = readFileSync(new URL('../app/api/cron/recaptacion-email-lote/route.ts', import.meta.url), 'utf8')
  assert.ok(ruta.includes(`tgAviso('${AVISO_FIN_CAMPANA}', fin.texto)`), 'tgAviso del fin de campaña con otro id')
  assert.match(ruta, /aviso_id = \$\{AVISO_FIN_CAMPANA\} AND estado = 'enviado'/)
  assert.match(ruta, /make_interval\(days => \$\{DIAS_SIN_REPETIR_FIN\}::int\)/)
})

// ── Texto ────────────────────────────────────────────────────────────────────

test('el total de enviados suma los de ESTA pasada (los totales se leen antes de enviar)', () => {
  // 95 previos + 5 de hoy = 100; 25 abiertos → 25 %.
  assert.equal(lineaAperturas(lote()), 'Aperturas acumuladas: 25 de 100 (25 %).')
  assert.match(aviso(), /25 de 100 \(25 %\)/)
})

test('porcentaje con coma decimal y miles con punto', () => {
  assert.equal(
    lineaAperturas(lote({ emailEnviadosTotal: 1_230, enviados: 4, emailAbiertosTotal: 301 })),
    'Aperturas acumuladas: 301 de 1.234 (24,4 %).',
  )
})

test('0 aperturas MEDIDAS sí es una cifra', () => {
  assert.equal(lineaAperturas(lote({ emailAbiertosTotal: 0 })), 'Aperturas acumuladas: 0 de 100 (0 %).')
})

test('sin total de enviados: «no se han podido leer», nunca 0 %', () => {
  const t = aviso({ emailEnviadosTotal: null })
  assert.match(t, /aperturas: no se han podido leer/i)
  assert.doesNotMatch(t, /%/)
})

test('sin total de abiertos: «no se han podido leer», nunca 0 %', () => {
  const t = aviso({ emailAbiertosTotal: null })
  assert.match(t, /aperturas: no se han podido leer/i)
  assert.doesNotMatch(t, /%/)
})

test('más aperturas que envíos es un dato roto, no un 120 %', () => {
  assert.equal(lineaAperturas(lote({ emailEnviadosTotal: 10, enviados: 0, emailAbiertosTotal: 12 })), 'Aperturas: no se han podido leer.')
})

test('personas solo-correo esperando su ventana: se dice cuántas y que el lote seguirá', () => {
  assert.match(aviso({ enEsperaVentanaSoloCorreo: 1_240 }), /Quedan 1\.240 personas solo-correo esperando su ventana \(se les escribe ~45 días antes de su antiguo vencimiento\), así que el lote seguirá mandando alguno\./)
  assert.match(aviso({ enEsperaVentanaSoloCorreo: 1 }), /Queda 1 persona solo-correo esperando su ventana/)
})

test('ninguna en espera: no hay línea de espera', () => {
  assert.doesNotMatch(aviso({ enEsperaVentanaSoloCorreo: 0 }), /esperando su ventana/)
})

test('espera sin leer: se dice, no se calla como si no quedara nadie', () => {
  assert.match(aviso({ enEsperaVentanaSoloCorreo: null }), /No se ha podido leer cuántas personas solo-correo esperan/)
})

test('direcciones que fallan: se dicen y se manda a la ficha', () => {
  assert.match(aviso({ fallidos: 3 }), /^3 direcciones fallan siempre \(revísalas en la ficha\)\.$/m)
  assert.match(aviso({ fallidos: 1 }), /^1 dirección falla siempre \(revísala en la ficha\)\.$/m)
})

test('sin fallidos: no hay línea de direcciones', () => {
  assert.doesNotMatch(textoFinCampana(lote({ fallidos: 0 })), /falla/)
})
