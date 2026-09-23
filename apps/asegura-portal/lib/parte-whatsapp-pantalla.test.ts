// Cepos del «mándaselo también a tu compañía» (PR 7). Leen el FUENTE: lo que vigilan es qué
// función decide el WhatsApp y qué frases salen, donde ni tsc ni el build miran.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const parte = readFileSync(new URL('../app/(portal)/boveda/ParteSiniestro.tsx', import.meta.url), 'utf8')
const boton = readFileSync(new URL('../app/(portal)/boveda/EnviarACompania.tsx', import.meta.url), 'utf8')
const pdf = readFileSync(new URL('./parte-pdf.ts', import.meta.url), 'utf8')

test('🪤 el WhatsApp del parte sale de whatsappParaRamo (Mapfre hogar no se ofrece a auto)', () => {
  assert.match(parte, /whatsappParaRamo\(polizaSeleccionada\.canal, polizaSeleccionada\.ramo\)/)
  assert.doesNotMatch(parte, /vias\.find\([^)]*whatsapp/)
})

test('🪤 nunca se afirma que el parte llegó a la compañía: el cliente lo manda y no lo vemos', () => {
  assert.doesNotMatch(boton, /enviado a|se ha enviado|ya lo tiene|te confirmamos/i)
  assert.match(boton, /nosotros no vemos esa conversación/)
})

test('🪤 un fichero que no cabe en el PDF se dice, no se pierde en silencio', () => {
  // Las dos salidas: una foto que el navegador no sabe leer y un PDF que no se deja copiar.
  assert.match(pdf, /if \(!jpeg\) \{ omitidos\.push\(nombre\); continue \}/)
  assert.match(pdf, /\} catch \{\n\s+omitidos\.push\(nombre\)\n\s+\}/)
  assert.match(pdf, /Ficheros que no se han podido incluir/)
  assert.match(boton, /r\.omitidos\.length > 0/)
})

test('🪤 «ya se lo he mandado» solo anota partes de ESA identidad, y el botón lo manda al parte creado', () => {
  const lib = readFileSync(new URL('./parte-compania.ts', import.meta.url), 'utf8')
  assert.match(lib, /where: \{ id: parteId, identidadId \}/)
  assert.ok(lib.indexOf("if (!parte) return { estado: 'no_encontrado' }") < lib.indexOf('/api/portal/nota'))
  assert.match(boton, /fetch\(`\/api\/siniestros\/\$\{parteId\}\/whatsapp`/)
})
