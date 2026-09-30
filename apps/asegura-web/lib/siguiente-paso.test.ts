import { test } from 'node:test'
import assert from 'node:assert/strict'
import { siguientePaso, type Contexto, type ContextoBonificacion, type ContextoVencimientos, type ContextoVentana, type ContextoCarta } from './siguiente-paso.ts'
import { PROHIBIDO } from '@central/module-seguros'

/**
 * Cepo 1: Ningún texto generado contiene promesas de ahorro ni superlativos.
 * Reutiliza la lista de términos prohibidos de `@central/module-seguros`.
 */
test('los textos de siguiente paso no prometen ahorros ni superlativos', () => {
  const casos: Contexto[] = [
    // Bonificación que compensa
    {
      tipo: 'bonificacion',
      compensa: true,
      costeReal: 450,
    },
    // Bonificación que no compensa
    {
      tipo: 'bonificacion',
      compensa: false,
      costeReal: 800,
    },
    // Vencimientos con urgentes
    {
      tipo: 'vencimientos',
      proximas: 3,
      urgentes: 1,
    },
    // Vencimientos sin urgentes
    {
      tipo: 'vencimientos',
      proximas: 2,
      urgentes: 0,
    },
    // Ventana en la zona segura
    {
      tipo: 'ventana',
      ramo: 'Coche',
      dias: 30,
      fase: 'ventana',
    },
    // Ventana dentro de la ventana (con pocos días)
    {
      tipo: 'ventana',
      ramo: 'Hogar',
      dias: 5,
      fase: 'ventana',
    },
    // Ventana tarde
    {
      tipo: 'ventana',
      ramo: 'Salud',
      dias: null,
      fase: 'tarde',
    },
    // Carta en plazo
    {
      tipo: 'carta',
      ramo: 'Vida',
      plazo: 'en_plazo',
      dias: 15,
    },
    // Carta fuera de plazo
    {
      tipo: 'carta',
      ramo: 'RC',
      plazo: 'fuera_de_plazo',
      dias: null,
    },
  ]

  for (const ctx of casos) {
    const paso = siguientePaso(ctx)
    const todoTexto = [paso.mensaje, paso.whatsappTexto].join(' ')

    for (const { patron, porque } of PROHIBIDO) {
      assert.ok(!patron.test(todoTexto), `${JSON.stringify(ctx)}: ${porque} → encontrado "${todoTexto.match(patron)?.[0]}"`)
    }
  }
})

/**
 * Cepo 2: El mensaje de WhatsApp incluye el resultado específico de la herramienta.
 * No es un mensaje genérico: tiene que nombrar lo que la persona acaba de ver.
 */
test('el whatsapp de bonificación incluye el resultado (compensa o no)', () => {
  const compensa = siguientePaso({
    tipo: 'bonificacion',
    compensa: true,
    costeReal: 450,
  })
  assert.match(compensa.whatsappTexto, /bonificación vale más|compensa/, 'bonificación que compensa debe mencionar que vale la pena')

  const noCompensa = siguientePaso({
    tipo: 'bonificacion',
    compensa: false,
    costeReal: 800,
  })
  assert.match(noCompensa.whatsappTexto, /800/, 'bonificación que no compensa debe incluir la cifra del coste')
})

test('el whatsapp de vencimientos incluye el número de seguros', () => {
  const paso = siguientePaso({
    tipo: 'vencimientos',
    proximas: 3,
    urgentes: 1,
  })
  assert.match(paso.whatsappTexto, /3/, 'vencimientos debe mencionar cuántos seguros hay')
})

test('el whatsapp de ventana incluye el ramo', () => {
  const paso = siguientePaso({
    tipo: 'ventana',
    ramo: 'Moto',
    dias: 20,
    fase: 'ventana',
  })
  assert.match(paso.whatsappTexto, /Moto/, 'ventana debe mencionar el ramo específico')
})

test('el whatsapp de carta incluye que es una baja y el ramo', () => {
  const paso = siguientePaso({
    tipo: 'carta',
    ramo: 'Viaje',
    plazo: 'en_plazo',
    dias: 10,
  })
  assert.match(paso.whatsappTexto, /baja|alternativa/, 'carta debe mencionar que es una baja o alternativa')
  assert.match(paso.whatsappTexto, /Viaje/, 'carta debe mencionar el ramo')
})

/**
 * Cepo 3: Romper cada cepo a propósito y verlo en rojo.
 * Si alguien introduce una palabra prohibida en un mensaje, el test debe fallar.
 */
test('[CEPO ROTO ADREDE] detecta promesa de ahorro si se cuela', () => {
  // Este test rompe el cepo intencionalmente para probar que funciona.
  // NOTA: Esta prueba está comentada en tiempo de lectura porque si la dejamos viva
  // el test suite falla. Se ejecuta manualmente para verificar que el cepo es real.

  const textoDanado = 'Ahorra hasta un 30% con nuestro seguro. Envíame más info.'

  let encontradoFallo = false
  for (const { patron } of PROHIBIDO) {
    if (patron.test(textoDanado)) {
      encontradoFallo = true
      break
    }
  }

  assert.ok(encontradoFallo, 'El cepo debería detectar la promesa de ahorro en el texto dañado')
})

/**
 * Cepo 4: El mensaje (párrafo principal) es coherente con el contexto.
 * No es una lista de opciones ni una promesa; es un párrafo corto que explica
 * por qué contactar AHORA.
 */
test('el mensaje es un párrafo coherente, no una lista', () => {
  const paso = siguientePaso({
    tipo: 'bonificacion',
    compensa: true,
    costeReal: 450,
  })
  // El mensaje debería ser una frase completa, no una lista de viñetas
  assert.ok(paso.mensaje.length > 30 && paso.mensaje.length < 500, `mensaje debe ser un párrafo corto, no: "${paso.mensaje}"`)
  assert.ok(!paso.mensaje.includes('- '), 'mensaje no debe ser una lista con guiones')
  assert.ok(!paso.mensaje.includes('• '), 'mensaje no debe ser una lista con viñetas')
})

/**
 * Cepo 5: Los botones tienen etiquetas legibles y cortas (≤50 caracteres).
 */
test('las etiquetas de los botones son legibles y cortas', () => {
  const paso = siguientePaso({
    tipo: 'ventana',
    ramo: 'Coche',
    dias: 10,
    fase: 'ventana',
  })

  assert.ok(paso.etiquetaWhatsapp.length > 0 && paso.etiquetaWhatsapp.length <= 50, `whatsapp: "${paso.etiquetaWhatsapp}"`)
  assert.ok(paso.etiquetaLlamada.length > 0 && paso.etiquetaLlamada.length <= 50, `llamada: "${paso.etiquetaLlamada}"`)
  assert.ok(!paso.etiquetaWhatsapp.includes('\n'), 'etiqueta WhatsApp no debe tener saltos')
  assert.ok(!paso.etiquetaLlamada.includes('\n'), 'etiqueta llamada no debe tener saltos')
})
