import test from 'node:test'
import assert from 'node:assert/strict'
import { leerCorreoEventoAseguradora, type EventoSolicitud } from './evento-correo-aseguradora.ts'
import {
  estaEnCompania, normalizarNumeroSolicitud, pideDocumentacion, textoTareaDocumentacion, urlSolicitudValida, validarSolicitudCompania,
} from './solicitud-compania.ts'

// Formato copiado de correos REALES de Occident (mediadores@occidentinforma.com, jul 2025-oct 2026). Tomador,
// mediador, nº de solicitud, nota del suscriptor y fechas cambiados por otros inventados del mismo formato.
const OCC = 'mediadores@occidentinforma.com'
const AVISO = 'Aviso de confidencialidad: Esta comunicación y los documentos que en su caso lleve anexos, son para uso exclusivo del destinatario arriba indicado. Antes de imprimir este correo, valore si realmente es necesario.'
const url = (n: string) => `https://portaloccident.gco.global/Aplicacion/Paginas/default.aspx?marco=false&aplicacion=AplicacionesSCO&urlTransaccion=FE/SGE.Gestion.Proyectos.FE.AccesoProyecto/?idSubscripcio=00${n}`

// Vista de Gmail: todo el cuerpo en UNA celda.
const PTE_DOC = {
  remitente: OCC,
  asunto: 'Suscripción Acc.colec. - Solicitud 170000001 - ACADEMIA INVENTADA DE FORMACION PROFESI',
  fecha: '2026-10-19T16:10:58Z',
  cuerpoTexto: ` Suscripción Acc.colec. - Solicitud 170000001 - ACADEMIA INVENTADA DE FORMACION PROFESI

| |
| [](https://gco.quadientcloud.eu/api/query/Messenger/TrackerQuery?Uri=xxx) |
| |

| |
| Contrato mediador: M00000 - Mediador Inventado PRIMA / PROY * PTE DOCUMENTACION Buenas tardes. Pueden ver prima y proyecto. Si hay conformidad, para poder emitir con efecto retroactivo del 15/10/26 deberán aportar escrito de no siniestralidad. Gracias y un saludo. ${url('170000001')} ${AVISO} |
| |`,
}

// Por IMAP (triaje): celda por línea.
const PTE_DOC_IMAP = {
  ...PTE_DOC,
  cuerpoTexto: `Suscripción Acc.colec. - Solicitud 170000001 - ACADEMIA INVENTADA DE FORMACION PROFESI
Contrato mediador: M00000 - Mediador Inventado
PRIMA / PROY * PTE DOCUMENTACION
Buenas tardes. Pueden ver prima y proyecto.
${url('170000001')}
${AVISO}`,
}

const FINALIZADA = {
  remitente: OCC,
  asunto: 'Suscripción RC.constr. - Solicitud 170000002 - INSTALACIONES INVENTADAS SL',
  cuerpoTexto: `| Contrato mediador: M00000 - Mediador Inventado Finalización automática La petición ha sido finalizada por caducidad de ésta ${url('170000002')} ${AVISO} |`,
}

const CADUCIDAD_SIN_TOMADOR = {
  remitente: OCC,
  asunto: 'Suscripción RC.profes. - Solicitud 170000003 -',
  cuerpoTexto: `| Contrato mediador: M00000 - Mediador Inventado Caducidad de solicitud El plazo de caducidad para la finalización automática de esta petición es de 30 días. ${url('170000003')} ${AVISO} |`,
}

const RESPUESTA_LIBRE = {
  remitente: OCC,
  asunto: 'Suscripción RC.profes. - Solicitud 170000004 -',
  cuerpoTexto: `| Contrato mediador: M00000 - Mediador Inventado RE: SIN FRANQUICIA Buenos días. Incluida la cláusula: Saludos ${url('170000004')} ${AVISO} |`,
}

function solicitud(c: Parameters<typeof leerCorreoEventoAseguradora>[0]): EventoSolicitud {
  const e = leerCorreoEventoAseguradora(c)
  assert.ok(e, 'debe reconocerse')
  assert.equal(e.tipo, 'solicitud')
  return e as EventoSolicitud
}

test('Occident solicitud «PTE DOCUMENTACION» (vista Gmail): nº, ramo, tomador, estado y enlace', () => {
  const e = solicitud(PTE_DOC)
  assert.equal(e.compania, 'occident')
  assert.equal(e.codigoDgs, 'C0468')
  assert.equal(e.numeroSolicitud, '170000001')
  assert.equal(e.ramo, 'Acc.colec.')
  assert.equal(e.tomador, 'ACADEMIA INVENTADA DE FORMACION PROFESI')
  assert.equal(e.estado, 'PRIMA / PROY * PTE DOCUMENTACION')
  assert.equal(e.url, url('170000001'))
  assert.equal(e.ilegibles, 0)
  assert.equal(pideDocumentacion(e.estado), true)
  // La nota libre del suscriptor y el mediador no salen.
  assert.doesNotMatch(JSON.stringify(e), /Buenas tardes|Mediador Inventado|siniestralidad/)
})

test('Occident solicitud por IMAP (celda por línea): mismo resultado', () => {
  const e = solicitud(PTE_DOC_IMAP)
  assert.equal(e.numeroSolicitud, '170000001')
  assert.equal(e.estado, 'PRIMA / PROY * PTE DOCUMENTACION')
  assert.equal(e.url, url('170000001'))
  assert.equal(e.ilegibles, 0)
})

test('Occident solicitud: estados fijos de la plantilla y asunto sin tomador', () => {
  const f = solicitud(FINALIZADA)
  assert.equal(f.estado, 'Finalización automática')
  assert.equal(f.ramo, 'RC.constr.')
  assert.equal(pideDocumentacion(f.estado), false)
  const c = solicitud(CADUCIDAD_SIN_TOMADOR)
  assert.equal(c.estado, 'Caducidad de solicitud')
  assert.equal(c.tomador, null)
  assert.equal(c.numeroSolicitud, '170000003')
})

test('Occident solicitud con texto libre (sin estado de plantilla): se reconoce, estado null y se CUENTA ilegible', () => {
  const e = solicitud(RESPUESTA_LIBRE)
  assert.equal(e.estado, null)
  assert.equal(e.ilegibles, 1)
  assert.equal(e.url, url('170000004'))
})

test('Occident solicitud: un enlace de OTRO nº o de otro dominio no se guarda', () => {
  const e = solicitud({ ...PTE_DOC, cuerpoTexto: PTE_DOC.cuerpoTexto.replace(url('170000001'), url('170000999')) })
  assert.equal(e.url, null)
  const f = solicitud({ ...PTE_DOC, cuerpoTexto: PTE_DOC.cuerpoTexto.replace('https://portaloccident.gco.global', 'https://portaloccident.gco.global.example.com') })
  assert.equal(f.url, null)
})

test('casos negativos: otros asuntos de Occident no caen en «solicitud» y los lectores existentes siguen igual', () => {
  // «Suscripción … - Póliza …» sigue siendo SUPLEMENTO.
  const sup = leerCorreoEventoAseguradora({ remitente: OCC, asunto: 'Suscripción RC.constr. - Póliza BIDS000002 - OBRAS INVENTADAS SL', cuerpoTexto: 'Aviso Recordatorio Regularización … no han ingresado suplemento de regularización … Periodo: 18.06.2025 a 18.06.2026.' })
  assert.equal(sup?.tipo, 'suplemento')
  // Un siniestro sigue siendo siniestro.
  const sin = leerCorreoEventoAseguradora({ remitente: OCC, asunto: 'Siniestro Diversos 43000001 Persona Inventada', cuerpoTexto: 'Póliza: 806000001 Número Siniestro: 43000001 Fecha y Hora: 15.09.2026 18:40' })
  assert.equal(sin?.tipo, 'siniestro')
  // Mismo asunto desde otro dominio: no es la compañía.
  assert.equal(leerCorreoEventoAseguradora({ ...PTE_DOC, remitente: 'alguien@gmail.com' }), null)
  // Un reenvío no se lee.
  assert.equal(leerCorreoEventoAseguradora({ ...PTE_DOC, asunto: `RV: ${PTE_DOC.asunto}` }), null)
  // Un correo comercial de Occident sin «Solicitud <nº>» no se reconoce.
  assert.equal(leerCorreoEventoAseguradora({ remitente: OCC, asunto: 'Novedades en Accidentes colectivos', cuerpoTexto: 'Le informamos…' }), null)
})

test('normalizarNumeroSolicitud: cifras sin relleno ni separadores; lo demás, null', () => {
  assert.equal(normalizarNumeroSolicitud('00170000001'), '170000001')
  assert.equal(normalizarNumeroSolicitud(' 170.000.001 '), '170000001')
  assert.equal(normalizarNumeroSolicitud('12345'), null)
  assert.equal(normalizarNumeroSolicitud('ABC123456'), null)
  assert.equal(normalizarNumeroSolicitud(null), null)
})

test('validarSolicitudCompania: apuntar, cambiar, quitar y estados cerrados', () => {
  const a = validarSolicitudCompania({ estado: 'competencia', numero: null, compania: null }, { numero: '170000001', compania: 'occident' })
  assert.deepEqual(a, { ok: true, cambio: { numero: '170000001', compania: 'occident', estado: 'en_negociacion', reiniciarEstado: true } })
  const mismo = validarSolicitudCompania({ estado: 'pendiente_cliente', numero: '170000001', compania: 'occident' }, { numero: '00170000001', compania: 'occident' })
  assert.deepEqual(mismo, { ok: true, cambio: { numero: '170000001', compania: 'occident', estado: 'pendiente_cliente', reiniciarEstado: false } })
  const quitar = validarSolicitudCompania({ estado: 'en_negociacion', numero: '170000001', compania: 'occident' }, { numero: null })
  assert.equal(quitar.ok && quitar.cambio.numero, null)
  assert.equal(validarSolicitudCompania({ estado: 'en_negociacion', numero: null, compania: null }, { numero: '' }).ok, false)
  assert.equal(validarSolicitudCompania({ estado: 'ganada', numero: null, compania: null }, { numero: '170000001', compania: 'occident' }).ok, false)
  assert.equal(validarSolicitudCompania({ estado: 'en_negociacion', numero: null, compania: null }, { numero: '170000001', compania: 'generali' }).ok, false)
  assert.equal(validarSolicitudCompania({ estado: 'en_negociacion', numero: null, compania: null }, { numero: '12', compania: 'occident' }).ok, false)
})

test('estaEnCompania: abierta y con nº; cerrada o sin nº, no', () => {
  assert.equal(estaEnCompania({ estado: 'en_negociacion', companiaSolicitudNum: '170000001' }), true)
  assert.equal(estaEnCompania({ estado: 'ganada', companiaSolicitudNum: '170000001' }), false)
  assert.equal(estaEnCompania({ estado: 'en_negociacion', companiaSolicitudNum: null }), false)
})

test('pideDocumentacion / textoTareaDocumentacion / urlSolicitudValida', () => {
  assert.equal(pideDocumentacion('PRIMA / PROY * PTE DOCUMENTACION'), true)
  assert.equal(pideDocumentacion('PRIMA / PROY * PTE. DOCUMENTACIÓN'), true)
  assert.equal(pideDocumentacion('Finalización automática'), false)
  assert.equal(pideDocumentacion(null), false)
  assert.equal(textoTareaDocumentacion('occident', '170000001'), 'Enviar documentación a Occident — Solicitud 170000001')
  assert.equal(urlSolicitudValida(url('170000001'), 'occident', '170000001'), url('170000001'))
  assert.equal(urlSolicitudValida(url('170000001'), 'occident', '170000002'), null)
  assert.equal(urlSolicitudValida('javascript:alert(1)//?idSubscripcio=00170000001', 'occident', '170000001'), null)
  assert.equal(urlSolicitudValida(url('170000001').replace('https:', 'http:'), 'occident', '170000001'), null)
  assert.equal(urlSolicitudValida(url('170000001'), 'mapfre', '170000001'), null)
})
