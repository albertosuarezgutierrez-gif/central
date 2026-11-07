/**
 * Cepo del lead «Quiero que Grupo ASegura me lo revise» (07/11/2026):
 *  1. Consentimiento EXPLÍCITO: la acción exige `consentimiento === true` ANTES de reservar/enviar, y la casilla de la UI
 *     nace DESMARCADA (RGPD: nada premarcado).
 *  2. Ningún envío automático: ni la acción ni el emisor importan correo, Telegram, push o WhatsApp (regla de comunicaciones
 *     salientes); el único destino es el puerto de leads de plataforma.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const APP = join(__dirname, '..')
const leer = (r: string) => readFileSync(join(APP, r), 'utf8')
const ACCION = leer('app/admin/nominas/convenio/seguro/actions.ts')
const CLIENTE = leer('app/admin/nominas/convenio/seguro/SeguroConvenioClient.tsx')
const EMISOR = leer('lib/lead-correduria.ts')

describe('lead a la correduría', () => {
  it('la acción exige consentimiento === true antes de reservar y de enviar', () => {
    const cuerpo = ACCION.slice(ACCION.indexOf('export async function pedirRevisionAccion'))
    const i = cuerpo.indexOf('datos.consentimiento !== true')
    expect(i).toBeGreaterThan(0)
    expect(i).toBeLessThan(cuerpo.indexOf('reservarLead('))
    expect(i).toBeLessThan(cuerpo.indexOf('enviarLeadCorreduria('))
  })
  it('la casilla de consentimiento nace desmarcada y el botón no envía sin ella', () => {
    expect(CLIENTE).toMatch(/const \[acepto, setAcepto\] = useState\(false\)/)
    expect(CLIENTE).toMatch(/disabled=\{pendiente \|\| !acepto\}/)
    expect(CLIENTE).toMatch(/consentimiento: acepto/)
  })
  it('ningún correo/mensaje sale de aquí: solo el puerto de leads de plataforma', () => {
    for (const src of [ACCION, EMISOR]) {
      expect(src).not.toMatch(/core-email|core-telegram|core-push|whatsapp|sendMail|enviarCorreo|tgAviso|\/lib\/avisos/i)
    }
    expect(EMISOR).toMatch(/\/api\/publico\/correduria\/lead/)
  })
})
