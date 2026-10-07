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
import { MARCA_LOGIN } from './grabador.ts'
import { MARCA_PANTALLA, separarGrabacion } from './grabador.ts'
import { AVISO_MARCO_NO_LEGIBLE, FUENTE_GRABADOR, FUENTE_GRABADOR_AUTO, VERSION_GRABADOR, codigoBookmarklet, codigoBookmarkletManual, configGrabador, urlBookmarklet } from './grabador-bookmarklet.ts'

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
      ['demasiados botones', (p) => { p.botones = Array.from({ length: 251 }, () => p.botones[0]) }],
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

describe('redactarHtmlGrabacion: login y datos de personas', () => {
  const login = '<html><body><form><input type="text" name="username" autocomplete="off" maxlength="25" value="usuario-prueba" data-valor="usuario-prueba"><input type="text" name="campoLibre" value="otro-texto-prueba" data-valor="otro-texto-prueba"><input type="password" name="pw" value="Clave.Prueba.1" data-valor="Clave.Prueba.1"><input type="checkbox" name="recordar" data-valor="marcado"></form></body></html>'
  const rl = redactarHtmlGrabacion(login)
  it('pantalla de login: marca, tapa usuario y cualquier texto, deja el checkbox', () => {
    for (const crudo of ['usuario-prueba', 'otro-texto-prueba', 'Clave.Prueba.1']) expect(rl, crudo).not.toContain(crudo)
    expect(rl).toContain(MARCA_LOGIN)
    expect(rl).toContain('data-valor="marcado"')
    expect(redactarHtmlGrabacion(rl)).toBe(rl)
  })
  it('usuario por nombre aunque no haya password', () => {
    const r = redactarHtmlGrabacion('<input name="j_username" value="usuario-prueba"><input id="userId" data-valor="usuario-prueba">')
    expect(r).not.toContain('usuario-prueba')
    expect(r).not.toContain(MARCA_LOGIN)
  })
  const ficha = [
    '<div id="app-header">209-C/12/0000 - Marta Mediadora Inventada</div>',
    ...['nombre1', 'apellido1', 'apellido2', 'razonSocial1', 'fNaci1', 'tom_fullDate', 'tom_address_pc', 'tom_address_town', 'tom_address_flat', 'mail1', 'codAgente', 'sucmed'].map((n) => `<input type="text" name="${n}" value="valor-personal-prueba" data-valor="valor-personal-prueba">`),
    '<input type="text" name="importeCapital" value="150000" data-valor="150000"><input type="text" name="fechaEfecto" data-valor="15/11/2026">',
    '<select id="tipoRiesgo" name="tipoRiesgo" data-valor="piso"><option value="piso" selected>Piso</option></select>',
    '<input type="checkbox" name="cobRobo" data-valor="marcado"><input type="radio" name="nombreCobertura" data-valor="sin_marcar">',
  ].join('\n')
  const rf = redactarHtmlGrabacion(ficha)
  it('tapa nombres, nacimiento, dirección, correo, códigos de mediador y el nombre de la cabecera', () => {
    expect(rf).not.toContain('valor-personal-prueba')
    expect(rf).not.toContain('Marta Mediadora')
    expect(rf).not.toContain('209-C/12/0000')
    expect(rf).toContain('<div id="app-header">[DATO]</div>')
  })
  it('deja importes, fechas de efecto, selects y checkboxes/radios', () => {
    for (const ok of ['data-valor="150000"', 'data-valor="15/11/2026"', 'data-valor="piso"', '>Piso<', 'data-valor="marcado"', 'data-valor="sin_marcar"']) expect(rf, ok).toContain(ok)
  })
})

describe('redactarHtmlGrabacion: formularios de alta (tomador/asegurado/propietario)', () => {
  const nombres = ['nombreTom', 'apellido1Tom', 'fNaciTom', 'fNacAseg', 'telefono1Tom', 'movilProp', 'telfAseg', 'mailTom', 'idNumberTom_doc', 'dniProp', 'nifTom', 'cifAseg', 'ibanTom', 'cuentaProp', 'Empresa_address_pc', 'Prop_address_town', 'Prop_address_street', 'cpAseg', 'codAgenteTom', 'codigoProp', 'nombreAgente']
  const html = nombres.map((n) => `<input type="text" id="${n}" name="${n}" value="valor-inventado-xyz" data-valor="valor-inventado-xyz">`).join('\n') +
    '\n<a href="/ep/alta?pfestate-uid=ESTADO-INV-123&amp;paso=2">ir</a><a href="https://p.es/x#pfestate-uid=ESTADO-INV-456">y</a>' +
    '\n<input type="text" id="specsTeLlamamos" name="specsTeLlamamos" value="valor-ok-abc" data-valor="valor-ok-abc"><input type="text" name="hotelReserva" value="valor-ok-def"><input type="text" name="importeCapital" value="valor-ok-ghi">'
  const r = redactarHtmlGrabacion(html)
  it('tapa value y data-valor de cada campo personal, con sufijos Tom/Aseg/Prop', () => {
    expect(r).not.toContain('valor-inventado-xyz')
    for (const n of nombres) expect(r, n).toContain(`id="${n}"`)
  })
  it('tapa pfestate-uid en URLs (query y fragmento) y no toca el resto', () => {
    expect(r).not.toContain('ESTADO-INV')
    expect(r).toContain('pfestate-uid=[REDACTADO]')
    expect(r).toContain('paso=2')
  })
  it('no tapa campos que no son personales (falsos positivos de «tel», «cuenta»…)', () => {
    for (const ok of ['valor-ok-abc', 'valor-ok-def', 'valor-ok-ghi']) expect(r, ok).toContain(ok)
  })
  it('es idempotente', () => expect(redactarHtmlGrabacion(r)).toBe(r))
})

describe('redactarHtmlGrabacion: atributos de sesión y texto del usuario', () => {
  const html = [
    '<button id="b1" type="button" session="3f2b8c1e-4d5a-4b6c-9d7e-1a2b3c4d5e6f" sessionid="SID-INV-1" data-token="TKN-INV-2" auth="AUT-INV-3" csrf="CSR-INV-4" jsessionid="JS-INV-5">Calcular</button>',
    '<div data-ref="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" title="op 11111111-2222-3333-4444-555555555555 fin">x</div>',
    '<a href="/p?op=99999999-8888-7777-6666-555555555555">ir</a>',
    '<span id="nombreUsuario">Fulano Inventado</span>',
    '<div class="cuenta-activa"><b>COD-INV-9911</b></div>',
    '<span aria-label="Perfil del agente">Perfil-Inv-X</span>',
    '<div class="login-page"><h1>Bienvenido al portal</h1><form><input name="q"></form></div>',
    '<div class="account-wrap"><p>Texto largo de maquetación ' + 'x'.repeat(250) + '</p></div>',
    '<p>Otro texto normal</p>',
  ].join('\n')
  const r = redactarHtmlGrabacion(html)
  it('atributos session/sessionid/token/auth/csrf/jsessionid y cualquier UUID → [DATO]', () => {
    for (const crudo of ['3f2b8c1e', 'SID-INV-1', 'TKN-INV-2', 'AUT-INV-3', 'CSR-INV-4', 'JS-INV-5', 'aaaaaaaa-bbbb', '11111111-2222', '99999999-8888']) expect(r, crudo).not.toContain(crudo)
    expect(r).toContain('session="[DATO]"')
    expect(r).toContain('title="op [DATO] fin"')
    expect(r).toContain('id="b1"')
    expect(r).toContain('>Calcular<')
  })
  it('texto de elementos de usuario/cuenta/perfil → [DATO]; maquetación y contenedores grandes no', () => {
    for (const crudo of ['Fulano Inventado', 'COD-INV-9911', 'Perfil-Inv-X']) expect(r, crudo).not.toContain(crudo)
    expect(r).toContain('<span id="nombreUsuario">[DATO]</span>')
    expect(r).toContain('<b>[DATO]</b>')
    for (const ok of ['Bienvenido al portal', 'Texto largo de maquetación', 'Otro texto normal']) expect(r, ok).toContain(ok)
  })
  it('es idempotente', () => expect(redactarHtmlGrabacion(r)).toBe(r))
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
  it('lleva el aviso de marcos ilegibles en español y la URL completa solo en el alert', () => {
    expect(AVISO_MARCO_NO_LEGIBLE).toBe('Esta pantalla tiene el formulario en un marco que no se puede leer. Abre este enlace en una pestaña nueva y vuelve a pulsar el marcador: ')
    expect(configGrabador().aviso).toBe(AVISO_MARCO_NO_LEGIBLE)
    expect(FUENTE_GRABADOR).toMatch(/win\.alert\(aviso\)/)
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
  it('modo manual y automático: sin red ni storage, sin ayudantes de compilador, ES5 y un solo click() propio', () => {
    expect(VERSION_GRABADOR).toBe(3)
    for (const c of [codigoBookmarkletManual(), codigo]) {
      expect(() => new Function(c)).not.toThrow()
      expect(c).not.toMatch(/__name|_to_consumable|_object_spread|__spreadArray/)
    }
    expect(FUENTE_GRABADOR_AUTO.match(/\.click\s*\(/g)?.length).toBe(1)
    expect(FUENTE_GRABADOR_AUTO).toMatch(/a\.download = 'grabacion-'/)
    // ES5 a propósito: ni flechas, ni let/const, ni plantillas, ni `?.`.
    expect(FUENTE_GRABADOR_AUTO).not.toMatch(/=>|\blet\b|\bconst\b|`|\?\./)
    // El indicador queda fuera de la captura.
    expect(FUENTE_GRABADOR).toMatch(/data-asegura-grabador/)
  })
})

describe('separarGrabacion (fichero multipantalla)', () => {
  const sep = (n: number, t = 'inicio') => `${MARCA_PANTALLA}${n}/3 · ${t} · 10:00:0${n} -->`
  it('un fichero sin separadores es UNA pantalla (modo manual)', () => {
    expect(separarGrabacion('<html>a</html>')).toEqual({ multipantalla: false, pantallas: ['<html>a</html>'] })
  })
  it('separa en orden, descarta la cabecera del fichero y las pantallas vacías', () => {
    const t = `<!-- grabacion ASegura v3 -->\n${sep(1)}\n<!-- grabador ASegura v3 -->\n<html>uno</html>\n${sep(2)}\n<html>dos</html>\n${sep(3)}\n\n`
    const r = separarGrabacion(t)
    expect(r.multipantalla).toBe(true)
    expect(r.pantallas).toEqual(['<!-- grabador ASegura v3 -->\n<html>uno</html>', '<html>dos</html>'])
  })
  it('el separador solo cuenta al principio de línea', () => {
    expect(separarGrabacion(`<p>${MARCA_PANTALLA}1/1 --></p>`).multipantalla).toBe(false)
  })
})

describe('redactarHtmlGrabacion: rendimiento con tramos largos sin espacios', () => {
  it('1,6 MB con un data: URI de 500 KB seguidos se redacta en menos de 1 s (no cuadrático)', () => {
    const b64 = 'iVBORw0KGgoAAAANSUhEUgAA'.repeat(Math.ceil(500_000 / 24)).slice(0, 500_000)
    const relleno = '<div><p>Texto normal 123 456</p></div>\n'.repeat(Math.ceil(1_150_000 / 36))
    const html = `${relleno}<img src="data:image/png;base64,${b64}">`
    expect(html.length).toBeGreaterThan(1_600_000)
    const t = Date.now()
    const out = redactarHtmlGrabacion(html)
    expect(Date.now() - t).toBeLessThan(1000)
    expect(out.length).toBeGreaterThan(1_000_000)
    // Y sigue redactando el correo pegado a un tramo largo.
    expect(redactarHtmlGrabacion(`<p>${'a'.repeat(50_000)} juan.perez@correo.es</p>`)).not.toContain('juan.perez@')
  })
})

describe('redactarHtmlGrabacion: titular, ids de portal, firmas e imágenes (fugas de ePAC, 07/10/2026)', () => {
  const html = [
    '<span class="nx-dropdown">999-Z/[DATO]/0000 - Zulema Inventada Prueba</span>',
    '<div id="cdk-describedby-message-1">Zulema Inventada Prueba</div>',
    '<span>999-Z/77/0001</span>',
    '<div class="mediador-box">Texto-Inv-Med</div>',
    '<form action="https://p.test/srv?action=start&amp;version=WM&amp;pfestate-uid=ZZ987654&amp;pfestate-agente7=77&amp;customerId=C-INV-1">',
    '<input hidden="" name="uid" data-valor="ZZ987654" value="ZZ987654">',
    '<input hidden="" name="otro" data-valor="OCULTO-INV-1" value="OCULTO-INV-1">',
    '<input type="text" name="checksum" data-valor="CHK-INV-2" value="CHK-INV-2">',
    '<input type="text" name="firma" data-valor="FIRMA-INV-3" value="FIRMA-INV-3">',
    '<input name="signature" data-valor="SIGN-INV-4" value="SIGN-INV-4"><input id="hash" data-valor="HASH-INV-5" value="HASH-INV-5">',
    '<input name="importe" data-valor="150000" value="150000">',
    '</form>',
    '<a href="/p?user=USR-INV-6&sid=SID-INV-7&usuario=USU-INV-8&paso=2" data-uid="UID-INV-9" data-userref="REF-INV-10">ir</a>',
    '<div data-extra="ref ZZ111222 fin">Portal ZZ333444 abierto</div>',
    '<img class="broker-logo" src="data:image/jpg;base64,/9j/4Qo1RXhpZgAATU0AKgAAAAgABwEAAAQAAAABAAAAAA==">',
    '<div style="background:url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==)">x</div>',
    '<div>Tiempo sesión: 29:51<br>Último acceso: <br>3/4/2098 7:05</div>',
    '<p>Ultimo acceso: 1/2/2098 9:07</p><p>Última conexión <b>5/6/2097 6:08</b></p>',
  ].join('\n')
  const r = redactarHtmlGrabacion(html)
  it('nombre del titular (aprendido del mediador) y código de mediador, también en descripciones ocultas', () => {
    for (const crudo of ['Zulema', 'Inventada Prueba', '999-Z', '0001', 'Texto-Inv-Med']) expect(r, crudo).not.toContain(crudo)
    expect(r).toContain('<div id="cdk-describedby-message-1">[DATO]</div>')
  })
  it('ids de usuario de portal (AA000000) en atributos, URLs y texto; parámetros de identidad/sesión de las URL', () => {
    for (const crudo of ['ZZ987654', 'ZZ111222', 'ZZ333444', 'C-INV-1', 'USR-INV-6', 'SID-INV-7', 'USU-INV-8', 'agente7=77']) expect(r, crudo).not.toContain(crudo)
    expect(r).toContain('paso=2')
    expect(r).toContain('version=WM')
  })
  it('ocultos (atributo hidden), uid, checksum, firma, signature, hash: value Y data-valor tapados; data-* de usuario/sesión', () => {
    for (const crudo of ['OCULTO-INV-1', 'CHK-INV-2', 'FIRMA-INV-3', 'SIGN-INV-4', 'HASH-INV-5', 'UID-INV-9', 'REF-INV-10']) expect(r, crudo).not.toContain(crudo)
    expect(r).toContain('data-valor="150000"')
  })
  it('imágenes base64 fuera (también en style) y fecha/hora de «Último acceso» tapada', () => {
    expect(r).not.toMatch(/base64,/)
    expect(r).toContain('src="data:image/omitida"')
    for (const crudo of ['3/4/2098', '7:05', '1/2/2098', '9:07', '5/6/2097', '6:08']) expect(r, crudo).not.toContain(crudo)
    expect(r).toContain('Tiempo sesión: 29:51')
  })
  it('es idempotente y lineal (500 KB de base64 y de texto, < 1 s)', () => {
    expect(redactarHtmlGrabacion(r)).toBe(r)
    const grande = '<img src="data:image/jpg;base64,' + 'QUJD'.repeat(60000) + '">' + '<p>texto 1234567 abcdef</p>'.repeat(6000)
    const t0 = Date.now()
    redactarHtmlGrabacion(grande)
    expect(Date.now() - t0).toBeLessThan(1000)
  })
})
