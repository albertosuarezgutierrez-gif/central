import assert from 'node:assert/strict'
import test from 'node:test'

import { RELATO_MAX_WHATSAPP, mensajeParteWhatsapp, type DatosParteWhatsapp } from './parte-whatsapp.ts'
import { canalDeCompania, enlaceWhatsapp, textoSoloRamos, whatsappParaRamo, type FilaCompania } from './canal-compania.ts'

const d: DatosParteWhatsapp = {
  compania: 'Generali', numeroPoliza: 'G-123', titular: 'Ana López', bien: '1234 ABC',
  fechaHecho: '2026-09-23', horaAproximada: '18:40', lugar: 'Av. de la Palmera, Sevilla',
  descripcion: 'Me han dado por detrás en un semáforo.', hayHeridos: null, hayTerceros: true, conPdf: true,
}

test('🪤 el mensaje identifica la póliza y dice «No lo sé» cuando no se contestó', () => {
  const t = mensajeParteWhatsapp(d)!
  assert.match(t, /Póliza: nº G-123 \(Generali\)/)
  assert.match(t, /Fecha: 23\/09\/2026, hacia las 18:40/)
  assert.match(t, /¿Hay heridos\?: No lo sé/)
  assert.match(t, /¿Hay otros implicados\?: Sí/)
  assert.match(t, /parte en PDF con las fotos/)
})

test('🪤 sin fecha o sin relato no hay mensaje; un relato largo se recorta', () => {
  assert.equal(mensajeParteWhatsapp({ ...d, fechaHecho: '' }), null)
  assert.equal(mensajeParteWhatsapp({ ...d, descripcion: '  ' }), null)
  const largo = mensajeParteWhatsapp({ ...d, descripcion: 'x'.repeat(RELATO_MAX_WHATSAPP + 50) })!
  assert.ok(largo.includes('x'.repeat(RELATO_MAX_WHATSAPP - 1) + '…'))
  assert.ok(!largo.includes('x'.repeat(RELATO_MAX_WHATSAPP + 1)))
})

test('🪤 el enlace lleva el texto codificado, y sin E.164 no hay enlace', () => {
  assert.equal(enlaceWhatsapp('+34654033629', 'Hola & adiós'), 'https://wa.me/34654033629?text=Hola%20%26%20adi%C3%B3s')
  assert.equal(enlaceWhatsapp('+34654033629', '  '), 'https://wa.me/34654033629')
  assert.equal(enlaceWhatsapp('654033629', 'x'), null)
})

test('🪤 un WhatsApp solo de hogar no se ofrece para auto ni para un ramo desconocido', () => {
  const fila: FilaCompania = {
    nombreComun: 'Mapfre', telefonoSiniestros: null, telefonoAsistencia: '900 822 822',
    whatsappSiniestros: '+34920750075', whatsappRamos: ['hogar'], horarioSiniestros: null, verificadoEn: '2026-09-23',
  }
  const canal = canalDeCompania('Mapfre', [fila])
  assert.equal(whatsappParaRamo(canal, 'hogar')?.numero, '+34920750075')
  assert.equal(whatsappParaRamo(canal, 'auto'), null)
  assert.equal(whatsappParaRamo(canal, null), null)
  assert.equal(textoSoloRamos(['hogar']), 'Solo para partes de hogar')
  const libre = canalDeCompania('Mapfre', [{ ...fila, whatsappRamos: null }])
  assert.equal(whatsappParaRamo(libre, null)?.soloRamos, null)
})
