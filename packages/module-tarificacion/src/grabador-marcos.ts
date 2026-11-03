/* eslint-disable */
// MARCOS del grabador del tarificador (30/10/2026): qué hacer con un <iframe> que el grabador NO puede leer, y cómo juntar
// en UNA pantalla lo que la extensión «Grabador ASegura» lee de los marcos de OTRO origen.
//
// Por qué: en Generali el marcador saltaba con alert() en bucle por los iframes de VÍDEO (player.vimeo.com) del portal,
// como si fueran el formulario; y en Mapfre el formulario va en un iframe de otro origen que, abierto en pestaña nueva,
// pierde la sesión. Ahora:
//   · `irrelevante()` descarta vídeo, mapas, publicidad, analítica, captchas, marcos ocultos, < 50×50 px y sin src http(s):
//     de esos no se avisa (y no cuentan como «sin leer»);
//   · del resto se da UN aviso agregado y NO bloqueante (nunca alert()), y se graba siempre lo que se pueda leer;
//   · `componer()` mete la captura de cada marco ajeno (hecha por la extensión DENTRO de ese marco, con la misma redacción)
//     en el hueco que el documento principal dejó para él, con su misma ruta de marco.
//
// Va como TEXTO ES5 (`FUENTE_MARCOS`), igual que el resto del grabador: lo mismo corre en el marcador, en la extensión y
// en los tests (las funciones TS de abajo compilan ESTE texto; no hay una segunda copia que pueda divergir).

/** Lado mínimo (px) para que un marco ilegible cuente como posible formulario. */
export const MIN_LADO_MARCO_PX = 50

const host = (dominios: string[]) =>
  '^https?:\\/\\/(?:[^\\/?#@]*\\.)?(?:' + dominios.map((d) => d.replace(/[.]/g, '\\.')).join('|') + ')(?::\\d+)?(?:[\\/?#]|$)'
const googleRuta = (ruta: string) =>
  '^https?:\\/\\/(?:www\\.)?google\\.[a-z]{2,3}(?:\\.[a-z]{2})?(?::\\d+)?\\/' + ruta + '(?:[\\/?#]|$)'

/** [motivo, fuente, flags]: URLs de marcos que NUNCA son el formulario del portal. Se prueban sobre la URL completa. */
export const MARCOS_IGNORADOS: [string, string, string][] = [
  ['video', host(['vimeo.com', 'vimeocdn.com', 'youtube.com', 'youtube-nocookie.com', 'youtu.be', 'dailymotion.com', 'wistia.com', 'wistia.net', 'brightcove.net', 'jwplayer.com']), 'i'],
  ['mapa', '^https?:\\/\\/maps\\.google\\.[a-z]{2,3}(?:\\.[a-z]{2})?(?::\\d+)?(?:[\\/?#]|$)', 'i'],
  ['mapa', googleRuta('maps'), 'i'],
  ['mapa', host(['maps.googleapis.com', 'openstreetmap.org']), 'i'],
  ['publicidad', host(['doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'adservice.google.com', 'criteo.com', 'criteo.net', 'adnxs.com', 'taboola.com', 'outbrain.com']), 'i'],
  ['analitica', host(['googletagmanager.com', 'google-analytics.com', 'analytics.google.com', 'hotjar.com', 'clarity.ms', 'bat.bing.com']), 'i'],
  ['social', host(['facebook.com', 'facebook.net', 'twitter.com', 'linkedin.com', 'instagram.com']), 'i'],
  ['captcha', host(['recaptcha.net', 'hcaptcha.com']), 'i'],
  ['captcha', googleRuta('recaptcha'), 'i'],
]

/** Dominios de los portales de compañías donde la EXTENSIÓN se inyecta (manifest `matches`) y graba. Ante la duda, fuera. */
export const DOMINIOS_PORTALES_GRABADOR = [
  'mapfre.com', 'mapfre.es', 'generali.es', 'generali.com', 'tugenerali.es', 'e-pacallianz.com', 'allianz.es',
  'fidelidade.es', 'gco.global', 'occident.com', 'catalanaoccidente.com', 'reale.es', 'zurich.es', 'axa.es',
  'libertyseguros.es', 'plusultra.es', 'caser.es', 'helvetia.es', 'santalucia.es', 'pelayo.com', 'segurcaixaadeslas.es', 'fiatc.es',
] as const

/** Texto del aviso (UNO por pantalla/grabación, no bloqueante) cuando queda algún marco relevante sin leer. Le siguen sus URL SIN query. */
export const AVISO_MARCO_NO_LEGIBLE = 'Parte de esta pantalla está en un marco de otro dominio que el marcador no puede leer (lo demás se ha grabado). Para grabarlo usa la extensión «Grabador ASegura» de Tarificador → Grabaciones. Marcos sin leer:'

/** Hueco que deja el grabador en el lugar de un marco que no pudo leer (detrás de su marca de ruta). */
export const MARCA_MARCO_SIN_LEER = '<!-- grabador: marco de otro origen o vacío; no se ha podido leer -->'
/** Comentario que precede al contenido de un marco ajeno leído por la extensión (le sigue su URL sin query). */
export const MARCA_MARCO_EXTENSION = '<!-- grabador: marco leído por la extensión · origen: '

/** Fuente JS (ES5, sin nada de fuera) de `marcosGrabador()` → `{ irrelevante, textoAviso, componer, hostPermitido }`. */
export const FUENTE_MARCOS = String.raw`function marcosGrabador() {
  function irrelevante(m, cfg) {
    var src = String((m && m.src) || '')
    if (!/^https?:\/\//i.test(src)) return 'sin_src'
    for (var i = 0; i < cfg.marcosIgnorados.length; i++) {
      var p = cfg.marcosIgnorados[i]
      if (new RegExp(p[1], p[2]).test(src)) return p[0]
    }
    if (m.oculto) return 'oculto'
    var an = Number(m.ancho)
    var al = Number(m.alto)
    if (!(an >= cfg.minLadoMarco) || !(al >= cfg.minLadoMarco)) return 'pequeno'
    return null
  }
  function textoAviso(urls, cfg) {
    var vistas = {}
    var lista = []
    for (var i = 0; i < urls.length; i++) { var u = String(urls[i] || '?'); if (!vistas[u]) { vistas[u] = 1; lista.push(u) } }
    if (!lista.length) return ''
    return cfg.aviso + '\n· ' + lista.join('\n· ')
  }
  function hostPermitido(host, dominios) {
    var h = String(host || '').toLowerCase()
    if (!h) return false
    for (var i = 0; i < dominios.length; i++) {
      var d = String(dominios[i]).toLowerCase()
      if (h === d || (h.length > d.length && h.slice(h.length - d.length - 1) === '.' + d)) return true
    }
    return false
  }
  function limpio(s) { return String(s || '').replace(/--/g, '- -').replace(/[<>"]/g, '_') }
  function seg(s) { return String(s || '').replace(/["\/]/g, '_') }
  // Mete cada captura de marco ajeno en el hueco que dejó el documento para ella (por nombre del marco y, si no, por URL),
  // con la MISMA ruta; sus marcos anidados se cuelgan de esa ruta. Lo que no encuentra hueco va al final («otro-origen-N»).
  function componer(cuerpo, ilegibles, capturas, cfg) {
    var out = String(cuerpo)
    var pendientes = []
    var i, j
    for (i = 0; i < ilegibles.length; i++) pendientes.push({ ruta: String(ilegibles[i].ruta), nombre: seg(ilegibles[i].nombre), url: String(ilegibles[i].url || '') })
    var caps = []
    for (i = 0; i < capturas.length; i++) {
      var c = capturas[i]
      if (c && typeof c.cuerpo === 'string' && c.cuerpo) caps.push({ nombre: seg(c.nombre), url: String(c.url || ''), cuerpo: c.cuerpo, ilegibles: c.ilegibles || [], hecha: false })
    }
    function bloque(ruta, cap) {
      var partes = cap.cuerpo.split(cfg.marca)
      for (var k = 1; k < partes.length; k++) partes[k] = ruta + '/' + partes[k]
      return cfg.marca + ruta + cfg.finMarca + '\n' + cfg.marcaExtension + limpio(cap.url) + ' -->\n' + partes.join(cfg.marca)
    }
    var leidos = 0
    var avance = true
    while (avance) {
      avance = false
      for (i = 0; i < caps.length; i++) {
        if (caps[i].hecha) continue
        var elegido = -1
        if (caps[i].nombre) for (j = 0; j < pendientes.length && elegido < 0; j++) if (pendientes[j].nombre === caps[i].nombre) elegido = j
        if (elegido < 0 && caps[i].url) for (j = 0; j < pendientes.length && elegido < 0; j++) if (pendientes[j].url === caps[i].url) elegido = j
        if (elegido < 0) continue
        var p = pendientes[elegido]
        var hueco = cfg.marca + p.ruta + cfg.finMarca + '\n' + cfg.sinLeer
        var at = out.indexOf(hueco)
        if (at < 0) continue
        out = out.slice(0, at) + bloque(p.ruta, caps[i]) + out.slice(at + hueco.length)
        pendientes.splice(elegido, 1)
        for (j = 0; j < caps[i].ilegibles.length; j++) {
          var hi = caps[i].ilegibles[j]
          pendientes.push({ ruta: p.ruta + '/' + String(hi.ruta), nombre: seg(hi.nombre), url: String(hi.url || '') })
        }
        caps[i].hecha = true
        leidos++
        avance = true
      }
    }
    var extra = 0
    for (i = 0; i < caps.length; i++) {
      if (caps[i].hecha) continue
      extra++
      out += '\n' + bloque('otro-origen-' + extra, caps[i])
      for (j = 0; j < caps[i].ilegibles.length; j++) pendientes.push({ ruta: '', nombre: '', url: String(caps[i].ilegibles[j].url || '') })
      leidos++
    }
    var sinCubrir = []
    for (i = 0; i < pendientes.length; i++) sinCubrir.push(pendientes[i].url || '?')
    return { cuerpo: out, leidos: leidos, sinCubrir: sinCubrir }
  }
  return { irrelevante: irrelevante, textoAviso: textoAviso, componer: componer, hostPermitido: hostPermitido }
}`

/** Lo que `FUENTE_MARCOS` necesita de la configuración (va dentro de `ConfigGrabador`). */
export type ConfigMarcos = {
  marcosIgnorados: [string, string, string][]
  minLadoMarco: number
  aviso: string
  marca: string
  finMarca: string
  sinLeer: string
  marcaExtension: string
}

export type MarcoVisto = { src: string; ancho: number; alto: number; oculto: boolean }
export type Ilegible = { ruta: string; nombre: string; url: string }
export type CapturaMarco = { nombre: string; url: string; cuerpo: string; ilegibles: Ilegible[] }

type Marcos = {
  irrelevante: (m: MarcoVisto, cfg: ConfigMarcos) => string | null
  textoAviso: (urls: string[], cfg: ConfigMarcos) => string
  componer: (cuerpo: string, ilegibles: Ilegible[], capturas: CapturaMarco[], cfg: ConfigMarcos) => { cuerpo: string; leidos: number; sinCubrir: string[] }
  hostPermitido: (host: string, dominios: readonly string[]) => boolean
}

let compilado: Marcos | null = null
/** El MISMO texto que viaja al navegador, compilado aquí (perezoso) para usarlo y probarlo desde TS. */
function marcos(): Marcos {
  if (!compilado) compilado = new Function('return (' + FUENTE_MARCOS + ')()')() as Marcos
  return compilado
}

/** Motivo por el que un marco ilegible NO es el formulario (`video`, `mapa`, `oculto`, `pequeno`, `sin_src`…) o `null` si lo puede ser. PURA. */
export function motivoMarcoIrrelevante(m: MarcoVisto, cfg: ConfigMarcos): string | null {
  return marcos().irrelevante(m, cfg)
}
/** UN aviso agregado para todos los marcos relevantes sin leer ('' si no hay). PURA. */
export function textoAvisoMarcos(urls: string[], cfg: ConfigMarcos): string {
  return marcos().textoAviso(urls, cfg)
}
/** Junta en el cuerpo de una pantalla las capturas de sus marcos ajenos (extensión). PURA. */
export function componerMarcos(cuerpo: string, ilegibles: Ilegible[], capturas: CapturaMarco[], cfg: ConfigMarcos) {
  return marcos().componer(cuerpo, ilegibles, capturas, cfg)
}
/** ¿El host es (o cuelga de) uno de los dominios permitidos? PURA. */
export function hostPermitidoGrabador(host: string, dominios: readonly string[] = DOMINIOS_PORTALES_GRABADOR): boolean {
  return marcos().hostPermitido(host, dominios)
}
