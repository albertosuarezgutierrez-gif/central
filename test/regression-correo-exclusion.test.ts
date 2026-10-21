// 🛡️ Cepo de la CAPA 0 del triaje de correo (21/10/2026, docs/CORREDURIA-AGENTE-CORREO.md §5 y F0).
//
// Los hilos de TIREA (alta de CIMA) y los tickets de Codeoscopic traen CREDENCIALES EN CLARO. Hasta hoy `tirea.es` no
// estaba en ninguna regla: el clasificador mandaba remitente + asunto + 1.500 chars del cuerpo a la IA (Groq/NIM). Este
// cepo FALLA si:
//   · `exclusionSeguridad` deja de excluir TIREA / tickets de Codeoscopic / credenciales del sector;
//   · `clasificar()` deja de evaluarla LO PRIMERO (antes de correo_reglas, de la BD del lead y de la IA);
//   · la categoría pasa a enrutar a la cartera, avisar o ser elegible por la IA;
//   · el triaje deja de truncar el asunto guardado del excluido.
// `node --test` (gate en CI vía `pnpm test`).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CATEGORIA_EXCLUIDA, asuntoExcluido, clasificarPorKeyword, exclusionSeguridad } from '../apps/plataforma/lib/correo/keywords.ts'
import { CATEGORIAS_IA, rutaDe } from '../apps/plataforma/lib/correo/rutas.ts'

const ROOT = join(import.meta.dirname, '..')
const leer = (p: string) => readFileSync(join(ROOT, p), 'utf8')

test('🪤 cepo (1): TODO el correo de TIREA (y su Jira) queda excluido, con o sin cuerpo', () => {
  for (const from of ['soporte@tirea.es', 'cima@tirea.es', 'noreply@soporte.tirea.es', 'jira@tirea.atlassian.net']) {
    assert.equal(exclusionSeguridad(from, 'Alta de mediador en CIMA'), 'tirea', from)
    assert.equal(exclusionSeguridad(from, 'RE: Alta', 'Usuario: M00000 Contraseña: Inventada123'), 'tirea', from)
    // También quien llame a la capa keyword sin cuerpo: nunca sale como correduría ni cae a la IA (null).
    assert.equal(clasificarPorKeyword(from, 'Alta de mediador en CIMA')?.categoria, CATEGORIA_EXCLUIDA, from)
  }
  // Un dominio parecido no es TIREA (ni se excluye ni se le da categoría).
  assert.equal(exclusionSeguridad('alguien@tirea.es.example.com', 'Hola'), null)
})

test('Codeoscopic: tickets y alta/recuperación de contraseña fuera; newsletter, facturas y avisos Avant2 de emisión no', () => {
  assert.equal(exclusionSeguridad('soporte@codeoscopic.com', 'Ticket soporte Codeoscopic [##12345##]'), 'codeoscopic')
  assert.equal(exclusionSeguridad('avant@codeoscopic.com', 'Avant: recuperación de contraseña'), 'asunto_credenciales')
  assert.equal(exclusionSeguridad('juan@codeoscopic.com', 'Webhook de emisiones en producción: credenciales y avisos pendientes'), 'asunto_credenciales')
  assert.equal(exclusionSeguridad('avant2@codeoscopic.com', 'Avant2: Póliza aceptada 123456'), null)
  assert.equal(exclusionSeguridad('avant2@codeoscopic.com', 'Avant2: Documentos de la emisión 123456'), null)
  assert.equal(exclusionSeguridad('newsletter@codeoscopic.com', 'Novedades'), null)
  assert.equal(exclusionSeguridad('facturacion@codeoscopic.com', 'Su factura de octubre'), null)
  // …salvo que el cuerpo traiga un secreto: entonces fuera aunque sea un aviso Avant2.
  assert.equal(exclusionSeguridad('avant2@codeoscopic.com', 'Avant2: Póliza aceptada 123456', 'Usuario: alberto Password: Inventada123'), 'secreto_en_cuerpo')
})

test('asunto de credenciales o secreto en el cuerpo: solo del SECTOR (un phishing de otro remitente lo sigue viendo la IA)', () => {
  assert.equal(exclusionSeguridad('mediadores@occidentinforma.com', 'Recuperación de la clave de su cuenta'), 'asunto_credenciales')
  assert.equal(exclusionSeguridad('mediador@allianz.es', 'Su usuario y contraseña de acceso'), 'asunto_credenciales')
  assert.equal(exclusionSeguridad('ccorredor@mapfre.com', 'Alta en el portal', 'Le facilitamos sus datos. Contraseña: Inventada123'), 'secreto_en_cuerpo')
  // Fuera del sector: NO se esconde (podría ser phishing → seguridad-sospechosa, aviso inmediato).
  assert.equal(exclusionSeguridad('alertas@banco-falso.com', 'Restablezca su contraseña ya'), null)
  assert.equal(exclusionSeguridad('alertas@banco-falso.com', 'Aviso', 'Usuario: x Contraseña: y123'), null)
  // …pero un reenvío (gmail de Alberto) que cita a TIREA/Codeoscopic con credenciales, sí.
  assert.equal(exclusionSeguridad('alberto@gmail.com', 'RV: Alta CIMA', '---- De: soporte@tirea.es ---- Usuario: M00000 Contraseña: Inventada123'), 'secreto_en_cuerpo')
})

test('sin falsos positivos en las plantillas REALES de compañía (Occident pone «Usuario solicitante: M…»)', () => {
  const occ = 'Le confirmamos que la solicitud de póliza referenciada ha sido emitida: Contrato mediador: M00000 - Mediador Inventado Usuario solicitante: M000000X - Mediador Inventado Póliza: 540000001'
  assert.equal(exclusionSeguridad('mediadores@occidentinforma.com', 'Suscripción Acc.colec. 170000001, ACADEMIA INVENTADA', occ), null)
  assert.equal(exclusionSeguridad('cstsoportecorredores@cst.mapfre.com', 'Clave de producción fuera de soporte / Incorrecta ID: 400000'), null)
  assert.equal(exclusionSeguridad('mediadores@occidentinforma.com', 'Recibos devueltos de banco 13-10-2026', 'Póliza Recibo Importe'), null)
})

test('lo único que se guarda del excluido es el asunto TRUNCADO (≤ 60)', () => {
  const largo = 'Alta de mediador en CIMA para la correduría con usuario y datos de acceso que no deben quedar enteros'
  assert.ok(asuntoExcluido(largo).length <= 60)
  assert.equal(asuntoExcluido('Corto'), 'Corto')
})

test('🪤 la categoría no enruta a la cartera, no avisa, no se etiqueta/archiva y la IA no la puede elegir', () => {
  const r = rutaDe(CATEGORIA_EXCLUIDA)
  assert.equal(r.categoria, CATEGORIA_EXCLUIDA, 'existe en RUTAS (si no, caería a dudoso y saldría en «Para tu ojo»)')
  assert.equal(r.aviso, 'ninguno')
  assert.equal(r.enrutarCorreduria ?? false, false)
  assert.equal(r.enrutarSivra ?? false, false)
  assert.equal(r.etiqueta, null)
  assert.equal(r.archivar, false)
  assert.equal(r.soloRegla, true)
  assert.ok(!CATEGORIAS_IA.includes(CATEGORIA_EXCLUIDA))
})

test('🪤 clasificar() evalúa la exclusión LO PRIMERO: antes de correo_reglas, de la BD del lead y de la IA', () => {
  const src = leer('apps/plataforma/lib/correo/clasificador.ts')
  const cuerpo = src.slice(src.indexOf('export async function clasificar('))
  const excl = cuerpo.indexOf('exclusionSeguridad(correo.from, correo.subject, correo.texto ?? correo.extracto)')
  assert.ok(excl > 0, 'clasificar llama a exclusionSeguridad con el cuerpo')
  for (const despues of ['parsearAvisoBooking(correo)', 'esRespuestaDeLeadBD(', 'reglaDe(correo.from)', 'clasificarPorKeyword(correo.from', 'llamarIA(system, user)']) {
    const i = cuerpo.indexOf(despues)
    assert.ok(i > excl, `la exclusión va antes de ${despues}`)
  }
  assert.match(cuerpo.slice(excl, excl + 400), /return \{ categoria: CATEGORIA_EXCLUIDA,[^}]*resumen: asuntoExcluido\(correo\.subject\)/)
})

test('🪤 el triaje guarda el asunto TRUNCADO del excluido y no lee sus eventos (solo correduria/correduria-recibo)', () => {
  const src = leer('apps/plataforma/lib/correo/triaje.ts')
  assert.match(src, /const asuntoGuardado = c\.categoria === CATEGORIA_EXCLUIDA \? asuntoExcluido\(correo\.subject\) : null/)
  assert.match(src, /asunto = COALESCE\(\$\{asuntoGuardado\}, asunto\)/)
  // El lector de eventos y el de devoluciones solo miran categorías de correduría.
  assert.match(src, /\(c\.categoria === 'correduria' \|\| c\.categoria === 'correduria-recibo'\)\s*\n\s*&& \(evento = leerCorreoEventoAseguradora/)
})
