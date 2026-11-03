// Marcos del grabador (30/10/2026): filtro de marcos ilegibles irrelevantes (Generali: alert en bucle por vídeos de Vimeo),
// aviso único, composición de capturas de marcos ajenos (extensión, Mapfre) y la forma de la extensión MV3.
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { configGrabador } from './grabador-bookmarklet.ts'
import { MARCA_MARCO, separarMarcosGrabacion } from './grabador.ts'
import { componerMarcos, hostPermitidoGrabador, MARCA_MARCO_SIN_LEER, motivoMarcoIrrelevante, textoAvisoMarcos } from './grabador-marcos.ts'
import { archivosExtension, configExtension, FUENTE_CONTENIDO, FUENTE_FONDO, fuenteGrabadorExtension, manifestExtension, zipExtension } from './grabador-extension.ts'
import { crc32Zip } from './zip-simple.ts'

const cfg = configGrabador()
const grande = (src: string) => ({ src, ancho: 800, alto: 600, oculto: false })

describe('motivoMarcoIrrelevante: un brazo por caso', () => {
  it('vídeo de Vimeo (Generali, 30/10/2026) → video', () => {
    expect(motivoMarcoIrrelevante(grande('https://player.vimeo.com/video/123456789?h=abc&badge=0'), cfg)).toBe('video')
  })
  it('YouTube (también youtube-nocookie y youtu.be) → video', () => {
    expect(motivoMarcoIrrelevante(grande('https://www.youtube.com/embed/xyz'), cfg)).toBe('video')
    expect(motivoMarcoIrrelevante(grande('https://www.youtube-nocookie.com/embed/xyz'), cfg)).toBe('video')
    expect(motivoMarcoIrrelevante(grande('https://youtu.be/xyz'), cfg)).toBe('video')
  })
  it('Google Maps → mapa', () => {
    expect(motivoMarcoIrrelevante(grande('https://www.google.com/maps/embed?pb=1'), cfg)).toBe('mapa')
    expect(motivoMarcoIrrelevante(grande('https://maps.google.es/maps?q=x'), cfg)).toBe('mapa')
  })
  it('publicidad (doubleclick, googlesyndication) → publicidad', () => {
    expect(motivoMarcoIrrelevante(grande('https://tpc.googlesyndication.com/safeframe/1-0-40/html/container.html'), cfg)).toBe('publicidad')
    expect(motivoMarcoIrrelevante(grande('https://8812.fls.doubleclick.net/activityi;src=1'), cfg)).toBe('publicidad')
  })
  it('analítica (googletagmanager, google-analytics) → analitica', () => {
    expect(motivoMarcoIrrelevante(grande('https://www.googletagmanager.com/ns.html?id=GTM-X'), cfg)).toBe('analitica')
    expect(motivoMarcoIrrelevante(grande('https://www.google-analytics.com/x'), cfg)).toBe('analitica')
  })
  it('oculto (display:none / hidden) → oculto', () => {
    expect(motivoMarcoIrrelevante({ src: 'https://formularios.mapfre.com/app', ancho: 800, alto: 600, oculto: true }, cfg)).toBe('oculto')
  })
  it('menor de 50×50 px (en cualquiera de los dos lados) → pequeno; 50×50 ya cuenta', () => {
    expect(motivoMarcoIrrelevante({ src: 'https://formularios.mapfre.com/app', ancho: 49, alto: 600, oculto: false }, cfg)).toBe('pequeno')
    expect(motivoMarcoIrrelevante({ src: 'https://formularios.mapfre.com/app', ancho: 600, alto: 0, oculto: false }, cfg)).toBe('pequeno')
    expect(motivoMarcoIrrelevante({ src: 'https://formularios.mapfre.com/app', ancho: 50, alto: 50, oculto: false }, cfg)).toBeNull()
  })
  it('sin src http(s) (vacío, about:, javascript:, data:) → sin_src', () => {
    for (const src of ['', 'about:blank', 'javascript:void(0)', 'data:text/html,hola']) expect(motivoMarcoIrrelevante(grande(src), cfg), src).toBe('sin_src')
  })
  it('el formulario de otro origen (Mapfre) SÍ es relevante', () => {
    expect(motivoMarcoIrrelevante(grande('https://formularios.mapfre.com/hogar/paso1?sid=1'), cfg)).toBeNull()
  })
  it('dominios parecidos no se cuelan como vídeo (sufijo exacto, sin userinfo)', () => {
    for (const src of ['https://vimeo.com.evil.test/form', 'https://notvimeo.com/form', 'https://vimeo.com@portal.test/form', 'https://www.google.com/mapsx/form'])
      expect(motivoMarcoIrrelevante(grande(src), cfg), src).toBeNull()
  })
})

describe('textoAvisoMarcos: UN aviso agregado', () => {
  it('sin marcos → cadena vacía (no hay aviso)', () => {
    expect(textoAvisoMarcos([], cfg)).toBe('')
  })
  it('varios marcos (y repetidos) → un solo texto con una línea por URL distinta', () => {
    const t = textoAvisoMarcos(['https://a.test/x', 'https://b.test/y', 'https://a.test/x'], cfg)
    expect(t.startsWith(cfg.aviso)).toBe(true)
    expect(t.split('\n')).toEqual([cfg.aviso, '· https://a.test/x', '· https://b.test/y'])
  })
})

describe('hostPermitidoGrabador', () => {
  it('el dominio y sus subdominios sí; parecidos no', () => {
    expect(hostPermitidoGrabador('wmediadores.mapfre.com')).toBe(true)
    expect(hostPermitidoGrabador('mapfre.com')).toBe(true)
    expect(hostPermitidoGrabador('www.generali.es')).toBe(true)
    for (const h of ['evilmapfre.com', 'mapfre.com.evil.test', 'player.vimeo.com', '']) expect(hostPermitidoGrabador(h), h).toBe(false)
  })
})

describe('componerMarcos: la captura de un marco ajeno va a SU hueco', () => {
  const hueco = (ruta: string) => `${MARCA_MARCO}${ruta}" -->\n${MARCA_MARCO_SIN_LEER}`
  const base = `<html><body><iframe name="appArea"></iframe></body></html>\n${hueco('appArea')}\n${hueco('#1')}`
  const ilegibles = [{ ruta: 'appArea', nombre: 'appArea', url: 'https://formularios.mapfre.com/hogar' }, { ruta: '#1', nombre: '', url: 'https://otra.mapfre.com/x' }]
  it('por nombre del marco, con su ruta y sus marcos anidados colgando de ella', () => {
    const cap = { nombre: 'appArea', url: 'https://formularios.mapfre.com/hogar/2', cuerpo: `<html><form id="f"></form></html>\n${MARCA_MARCO}interno" -->\n<html>i</html>`, ilegibles: [] }
    const r = componerMarcos(base, ilegibles, [cap], cfg)
    expect(r.leidos).toBe(1)
    expect(r.cuerpo).not.toContain(hueco('appArea'))
    const rutas = separarMarcosGrabacion(r.cuerpo).marcos.map((m) => m.ruta)
    expect(rutas).toEqual(['appArea', 'appArea/interno', '#1'])
    expect(r.cuerpo).toContain('marco leído por la extensión · origen: https://formularios.mapfre.com/hogar/2 -->')
    expect(r.sinCubrir).toEqual(['https://otra.mapfre.com/x'])
  })
  it('por URL cuando el marco no tiene nombre', () => {
    const cap = { nombre: '', url: 'https://otra.mapfre.com/x', cuerpo: '<html>OTRA</html>', ilegibles: [] }
    const r = componerMarcos(base, ilegibles, [cap], cfg)
    expect(separarMarcosGrabacion(r.cuerpo).marcos.find((m) => m.ruta === '#1')!.html).toContain('OTRA')
    expect(r.sinCubrir).toEqual(['https://formularios.mapfre.com/hogar'])
  })
  it('marco ajeno DENTRO de otro marco ajeno: se resuelve en cadena', () => {
    const exterior = { nombre: 'appArea', url: 'https://formularios.mapfre.com/hogar', cuerpo: `<html>EXT</html>\n${hueco('hondo')}`, ilegibles: [{ ruta: 'hondo', nombre: 'hondo', url: 'https://tercero.mapfre.com/z' }] }
    const interior = { nombre: 'hondo', url: 'https://tercero.mapfre.com/z', cuerpo: '<html>HONDO</html>', ilegibles: [] }
    const r = componerMarcos(base, ilegibles, [interior, exterior], cfg)
    expect(r.leidos).toBe(2)
    expect(separarMarcosGrabacion(r.cuerpo).marcos.find((m) => m.ruta === 'appArea/hondo')!.html).toContain('HONDO')
  })
  it('sin hueco que le case → al final como «otro-origen-N» (no se pierde)', () => {
    const r = componerMarcos(base, ilegibles, [{ nombre: 'raro', url: 'https://nada.mapfre.com/', cuerpo: '<html>SUELTO</html>', ilegibles: [] }], cfg)
    expect(separarMarcosGrabacion(r.cuerpo).marcos.find((m) => m.ruta === 'otro-origen-1')!.html).toContain('SUELTO')
    expect(r.sinCubrir.length).toBe(2)
  })
  it('una URL con «-->» o comillas no rompe el comentario', () => {
    const r = componerMarcos(base, ilegibles, [{ nombre: 'appArea', url: 'https://x.mapfre.com/a-->"<b>', cuerpo: '<html></html>', ilegibles: [] }], cfg)
    expect(r.cuerpo).toContain('origen: https://x.mapfre.com/a- -___b_ -->')
  })
})

describe('extensión MV3: forma y seguridad', () => {
  const man = manifestExtension() as any
  it('MV3, content scripts en TODOS los marcos y about:blank, solo https de compañías, sin permisos', () => {
    expect(man.manifest_version).toBe(3)
    const cs = man.content_scripts[0]
    expect(cs.all_frames).toBe(true)
    expect(cs.match_about_blank).toBe(true)
    expect(cs.js).toEqual(['grabador.js', 'contenido.js'])
    expect(cs.matches).toContain('https://*.mapfre.com/*')
    expect(cs.matches).toContain('https://*.generali.es/*')
    for (const m of cs.matches) expect(m, m).toMatch(/^https:\/\/\*\.[a-z0-9.-]+\/\*$/)
    expect(man.permissions).toBeUndefined()
    expect(man.host_permissions).toBeUndefined()
    expect(man.externally_connectable).toBeUndefined()
  })
  it('sin red, sin storage, sin cookies, sin eval, sin postMessage y SIN pulsar nada del portal', () => {
    const todo = archivosExtension().map((a) => a.contenido).join('\n')
    for (const p of [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /\.cookie\b/, /localStorage|sessionStorage|indexedDB|chrome\.storage/, /WebSocket|EventSource/, /postMessage/, /\beval\s*\(/, /new Function/, /\bimport\s*\(/, /\.submit\s*\(/, /dispatchEvent|\.focus\s*\(/, /chrome\.downloads/])
      expect(todo, String(p)).not.toMatch(p)
    // El único click() de todo el código es el del <a download> propio del grabador (el de FUENTE_GRABADOR y el de AUTO).
    expect(FUENTE_CONTENIDO).not.toMatch(/\.click\s*\(/)
    expect(FUENTE_FONDO).not.toMatch(/\.click\s*\(/)
    expect(todo).not.toMatch(/alert\s*\(/)
  })
  it('reutiliza el MISMO grabador y la misma redacción que el marcador (no hay copia)', () => {
    const g = fuenteGrabadorExtension()
    const c = configExtension()
    expect(g).toContain(JSON.stringify(c))
    for (const k of ['patrones', 'sensible', 'usuario', 'personal', 'mediador', 'param', 'sesion', 'uuid'] as const) expect(c[k]).toEqual(cfg[k])
    expect(g).toContain('function grabarPantalla(win, cfg, descargar)')
    expect(g).toContain('function grabadorAuto(win, cfg, grabar, ganchos)')
    expect(() => new Function(g + '\n' + FUENTE_CONTENIDO)).not.toThrow()
    expect(() => new Function(FUENTE_FONDO)).not.toThrow()
    expect(FUENTE_CONTENIDO).not.toMatch(/=>|\blet\b|\bconst\b|`|\?\./)
  })
  it('solo acepta mensajes de la propia extensión y solo con forma y tamaño válidos', () => {
    expect(FUENTE_CONTENIDO).toMatch(/sender\.id !== chrome\.runtime\.id/)
    expect(FUENTE_FONDO).toMatch(/sender\.id !== chrome\.runtime\.id/)
    expect(FUENTE_CONTENIDO).toMatch(/cadena\(msg\.cuerpo, cfg\.maxBytesMarco\)/)
    expect(FUENTE_CONTENIDO).toMatch(/M\.hostPermitido\(location\.hostname, cfg\.dominios\)/)
  })
  it('el zip es válido (lo abre `unzip -t`) y lleva la carpeta con los 5 ficheros', () => {
    const z = zipExtension()
    expect(crc32Zip(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
    const dir = mkdtempSync(join(tmpdir(), 'zipext-'))
    const f = join(dir, 'x.zip')
    writeFileSync(f, z)
    let salida = ''
    try { salida = execFileSync('unzip', ['-t', f], { encoding: 'utf8' }) } catch (e: any) { if (e?.code === 'ENOENT') return; throw e }
    expect(salida).toMatch(/No errors detected/)
    for (const n of ['manifest.json', 'grabador.js', 'contenido.js', 'fondo.js', 'LEEME.txt']) expect(salida).toContain(`grabador-asegura/${n}`)
    expect(zipExtension()).toEqual(z) // reproducible
  })
})
