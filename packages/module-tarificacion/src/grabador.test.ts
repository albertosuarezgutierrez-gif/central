// Grabador del tarificador RPA (07/10/2026): clasificación de botones, validador del mapa, re-redacción en
// servidor, recorte para la IA y la forma del bookmarklet (sin red, sin cookies, sin pulsar el portal). El
// bookmarklet de verdad, en un Chromium con marcos, se prueba en services/tarificador-rpa/test/grabador-bookmarklet.test.ts.
import { describe, it, expect } from 'vitest'
import {
  BLOQUEO_GRABADOR,
  MARCA_MARCO,
  clasificarBoton,
  extraerJsonIA,
  fusionarPantalla,
  leerMapaGuardado,
  nombrePantallaValido,
  recortarHtmlParaIA,
  redactarHtmlGrabacion,
  redactarUrl,
  separarMarcosGrabacion,
  validarPantallaMapa,
} from './grabador.ts'
import { FUENTE_GRABADOR, codigoBookmarklet, configGrabador, urlBookmarklet } from './grabador-bookmarklet.ts'

describe('clasificarBoton', () => {
  it('PROHIBIDO: emitir, contratar, formalizar, grabar, archivar, aceptar definitivo, firmar, pagar…', () => {
    for (const t of ['Emitir', 'EMITIR PÓLIZA', 'Emisión', 'Contratar', 'Formalizar', 'Grabar', 'Archivar', 'Aceptar definitivo', 'Aceptar', 'Firmar', 'Pagar', 'Confirmar contratación', 'Tramitar', 'Pago con tarjeta']) {
      expect(clasificarBoton([t]).clase, t).toBe('prohibido')
    }
  })
  it('PROHIBIDO aunque el texto sea inocente si el selector lo delata', () => {
    expect(clasificarBoton(['Siguiente', '#btnEmitir']).clase).toBe('prohibido')
    expect(clasificarBoton(['>', 'a[onclick*="formalizar"]']).clase).toBe('prohibido')
  })
  it('seguro: navegar, calcular, pestañas de datos', () => {
    for (const t of ['Calcular', 'Siguiente', 'Volver', 'Datos del riesgo', 'Coberturas', 'Nueva cotización']) expect(clasificarBoton([t]).clase, t).toBe('seguro')
  })
  it('BLOQUEO_GRABADOR nombra las palabras del encargo', () => {
    for (const p of ['emitir', 'contratar', 'formalizar', 'grabar', 'archivar', 'firmar', 'pagar', 'definitiv']) expect(BLOQUEO_GRABADOR).toContain(p)
  })
})

const pantallaBuena = () => ({
  titulo: 'Datos del riesgo',
  campos: [
    { etiqueta: 'Código postal', selector: '#cp', tipo: 'texto', obligatorio: true, opciones: null, marco: 'appArea' },
    { etiqueta: 'Tipo de vivienda', selector: 'select[name="tipoViv"]', tipo: 'select', obligatorio: false, opciones: ['Piso', 'Chalet'], marco: null },
  ],
  botones: [
    { texto: 'Calcular', selector: '#btnCalcular', clase: 'seguro', funcion: 'calcular la prima', marco: 'appArea' },
    { texto: 'Emitir', selector: '#btnEmitir', clase: 'seguro', funcion: 'siguiente paso', marco: 'appArea' },
  ],
  primas: [{ etiqueta: 'Prima total anual', selector: '#primaTotal', marco: 'appArea' }],
  notas: null,
})

describe('validarPantallaMapa', () => {
  it('un «Emitir» que la IA llama seguro sale PROHIBIDO (forzado)', () => {
    const r = validarPantallaMapa(pantallaBuena(), 2)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const emitir = r.pantalla.botones.find((b) => b.texto === 'Emitir')!
    expect(emitir.clase).toBe('prohibido')
    expect(emitir.forzado).toBe(true)
    expect(r.forzados).toBe(1)
    expect(r.pantalla.botones.find((b) => b.texto === 'Calcular')!.clase).toBe('seguro')
    expect(r.pantalla.pantalla).toBe(2)
  })
  it('la IA puede SUBIR a prohibido, nunca bajar', () => {
    const p = pantallaBuena()
    p.botones[0].clase = 'prohibido'
    p.botones[1].clase = 'prohibido'
    const r = validarPantallaMapa(p, 1)
    expect(r.ok && r.pantalla.botones.every((b) => b.clase === 'prohibido' && !b.forzado)).toBe(true)
  })
  it('esquema estricto: claves de más, tipos raros, clase inventada, selector con llaves → error', () => {
    const casos: [string, (p: any) => void][] = [
      ['clave extra', (p) => { p.extra = 1 }],
      ['campo con clave extra', (p) => { p.campos[0].valor = 'x' }],
      ['tipo de campo', (p) => { p.campos[0].tipo = 'fichero' }],
      ['obligatorio no booleano', (p) => { p.campos[0].obligatorio = 'si' }],
      ['clase', (p) => { p.botones[0].clase = 'quizá' }],
      ['selector', (p) => { p.botones[0].selector = 'a{color:red}' }],
      ['javascript:', (p) => { p.botones[0].selector = 'javascript:alert(1)' }],
      ['sin título', (p) => { delete p.titulo }],
      ['campos no lista', (p) => { p.campos = {} }],
      ['demasiados botones', (p) => { p.botones = Array.from({ length: 101 }, () => p.botones[0]) }],
    ]
    for (const [nombre, romper] of casos) {
      const p = pantallaBuena()
      romper(p)
      expect(validarPantallaMapa(p, 1).ok, nombre).toBe(false)
    }
    expect(validarPantallaMapa('no', 1).ok).toBe(false)
    expect(validarPantallaMapa(null, 1).ok).toBe(false)
  })
  it('tapa datos personales que la IA copie en etiquetas/notas', () => {
    const p = pantallaBuena() as any
    p.notas = 'Tomador 12345678Z, ana@correo.es'
    const r = validarPantallaMapa(p, 1)
    expect(r.ok && !/12345678Z|ana@correo/.test(JSON.stringify(r.pantalla))).toBe(true)
  })
  it('leerMapaGuardado re-valida y re-clasifica; fusionarPantalla ordena', () => {
    const r = validarPantallaMapa(pantallaBuena(), 2)
    if (!r.ok) throw new Error('debería validar')
    const otra = { ...r.pantalla, pantalla: 1, titulo: 'Acceso' }
    const mapa = fusionarPantalla(fusionarPantalla(null, r.pantalla), otra)
    expect(mapa.pantallas.map((p) => p.pantalla)).toEqual([1, 2])
    // Alguien «arregla» el jsonb a mano y pone Emitir como seguro: al leer vuelve a PROHIBIDO.
    const tocado = JSON.parse(JSON.stringify(mapa))
    tocado.pantallas[1].botones[1].clase = 'seguro'
    tocado.pantallas[1].botones[1].forzado = false
    const leido = leerMapaGuardado(tocado)!
    expect(leido.pantallas[1].botones[1].clase).toBe('prohibido')
    expect(leerMapaGuardado({ version: 2, pantallas: [] })).toBeNull()
  })
})

describe('extraerJsonIA / nombrePantallaValido', () => {
  it('tolera vallas y texto alrededor', () => {
    expect(extraerJsonIA('Aquí va:\n```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(extraerJsonIA('nada')).toBeNull()
    expect(extraerJsonIA('{roto')).toBeNull()
  })
  it('solo .html sin rutas', () => {
    expect(nombrePantallaValido('pantalla-epac.allianz.es-20261007-101010.html')).toBe(true)
    expect(nombrePantallaValido('../x.html')).toBe(false)
    expect(nombrePantallaValido('x.exe')).toBe(false)
  })
})

describe('redactarHtmlGrabacion (servidor)', () => {
  const html = [
    '<html><head><script>var token="SECRETO_JS"</script></head><body>',
    '<input type="password" name="contrasena" value="Clave.Muy.Secreta" data-valor="Clave.Muy.Secreta">',
    '<input type="hidden" name="__VIEWSTATE" value="dDwtMTA4MzE0MjEyNDs7Pg==">',
    '<input type="text" name="otpCode" value="123987">',
    '<input type="text" id="dni" value="12345678Z" data-valor="12345678Z">',
    '<input type="text" id="iban" data-valor="ES91 2100 0418 4502 0005 1332">',
    '<textarea name="pinSms">998877</textarea>',
    '<p>Correo: ana.p@correo.es · Tlf 612 345 678</p>',
    '<a href="/cotizar?jsessionid=ABCDEF&amp;paso=2&token=XYZ123">Seguir</a>',
    '<select id="tipoViv" data-valor="piso"><option value="piso" selected>Piso</option></select>',
    '</body></html>',
  ].join('\n')
  const r = redactarHtmlGrabacion(html)
  it('tapa contraseñas, ocultos, campos sensibles por nombre, DNI, IBAN, correo, teléfono y tokens de URL', () => {
    for (const crudo of ['SECRETO_JS', 'Clave.Muy.Secreta', 'dDwtMTA4MzE0MjEyNDs7Pg==', '123987', '12345678Z', 'ES91 2100', 'ana.p@correo.es', '612 345 678', 'XYZ123', 'ABCDEF', '998877']) {
      expect(r, crudo).not.toContain(crudo)
    }
  })
  it('deja los selectores y lo que no es personal', () => {
    for (const ok of ['id="dni"', 'id="tipoViv"', 'name="contrasena"', 'data-valor="piso"', 'paso=2', '>Piso<', '>Seguir<']) expect(r, ok).toContain(ok)
  })
  it('es idempotente', () => expect(redactarHtmlGrabacion(r)).toBe(r))
  it('redactarUrl', () => {
    expect(redactarUrl('https://p.es/a;jsessionid=99?x=1&sessionId=abc&auth_token=q')).toBe('https://p.es/a;jsessionid=[REDACTADO]?x=1&sessionId=[REDACTADO]&auth_token=[REDACTADO]')
  })
})

describe('recortarHtmlParaIA', () => {
  const html = `<html><head><style>.x{}</style></head><body><div class="carcasa"><span>Menú</span></div>
${MARCA_MARCO}appArea" -->
<html><body><form id="f"><label for="cp">Código postal</label><input id="cp" name="cp" type="text" value="41003" data-valor="41003" style="width:9px" onchange="x()">
<select id="tv"><option value="1">Piso</option><option value="2">Chalet</option></select>
<input type="submit" value="Calcular"><button id="btnEmitir" onclick="emitir()">Emitir</button>
<table><tr><td>Prima total</td><td id="prima">1.234,56 €</td></tr></table><script>x()</script></form></body></html>`
  const r = recortarHtmlParaIA(html)
  it('quita scripts, estilos y VALORES de los campos; deja ids, etiquetas, opciones, botones y la prima', () => {
    expect(r).not.toMatch(/<script|<style|41003|style=|onchange/)
    for (const s of ['id="cp"', 'Código postal', '>Piso<', '>Chalet<', 'value="Calcular"', 'id="btnEmitir"', 'onclick="emitir()"', 'id="prima"', '1.234,56']) expect(r, s).toContain(s)
    expect(r.indexOf('marco «appArea»')).toBeLessThan(r.indexOf('página principal'))
  })
  it('respeta el tope', () => expect(recortarHtmlParaIA(html.repeat(50), 2000).length).toBeLessThan(2100))
  it('separarMarcosGrabacion', () => {
    const s = separarMarcosGrabacion(html)
    expect(s.marcos.map((m) => m.ruta)).toEqual(['appArea'])
  })
})

describe('bookmarklet: forma', () => {
  const codigo = codigoBookmarklet()
  it('sin red, sin cookies, sin storage, sin eval', () => {
    for (const prohibido of [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /\.cookie\b/, /localStorage|sessionStorage|indexedDB/, /WebSocket|EventSource/, /postMessage/, /\beval\s*\(/, /new Function/, /\bimport\s*\(/, /\.submit\s*\(/]) {
      expect(codigo, String(prohibido)).not.toMatch(prohibido)
    }
  })
  it('el único click() es el del <a download> que crea él mismo', () => {
    const fuente = FUENTE_GRABADOR
    expect(fuente.match(/\.click\s*\(/g)?.length).toBe(1)
    expect(fuente).toMatch(/a\.download = nombre;?\s*a\.click\(\)/)
    expect(fuente).not.toMatch(/appendChild\(a\)/)
  })
  it('es autocontenido: lleva los patrones del formador y la marca de marcos', () => {
    const cfg = configGrabador()
    expect(cfg.patrones.length).toBeGreaterThan(5)
    expect(codigo).toContain(JSON.stringify(cfg.marca))
    expect(urlBookmarklet().startsWith('javascript:')).toBe(true)
    // Se puede compilar como JS suelto (lo que hace el navegador al pulsar el marcador).
    expect(() => new Function(codigo)).not.toThrow()
    // Sin ayudantes de compilador (`__name`, `_to_consumable_array`…): en el portal no existen.
    expect(codigo).not.toMatch(/__name|_to_consumable|_object_spread|__spreadArray/)
  })
})
