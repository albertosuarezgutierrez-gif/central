/* eslint-disable */
// EXTENSIÓN de Chrome «Grabador ASegura» (MV3, 30/10/2026). Para portales con el formulario en un iframe de OTRO origen
// (Mapfre): el marcador no puede leerlo y abrirlo en otra pestaña pierde la sesión. La extensión inyecta el MISMO grabador
// (`FUENTE_GRABADOR`, `FUENTE_GRABADOR_AUTO`, `FUENTE_MARCOS`, misma redacción de PII, mismos patrones de `configGrabador()`)
// en TODOS los marcos de los portales de compañías permitidos (`all_frames`, `match_about_blank`):
//   · el marco principal hace la grabación automática de siempre (cuadro azul, «Terminar y descargar»);
//   · cada marco de otro origen se graba a sí mismo (redactado DENTRO del marco, antes de salir de él) y manda su captura,
//     etiquetada con su URL sin query, al principal por el canal interno de la extensión (runtime → fondo → pestaña; la
//     página no lo ve; nada de postMessage);
//   · el principal la mete en el hueco de ese marco (`componer`) y descarga UN `grabacion-<host>-<fecha>.html`.
// El fichero se sube en Tarificador → Grabaciones como el del marcador: MISMO endpoint, misma sesión de plataforma. La
// extensión NO tiene red, ni secretos, ni permisos (ni `downloads`, ni `storage`, ni `tabs`, ni host_permissions): solo
// content scripts en los dominios de `DOMINIOS_PORTALES_GRABADOR`. No pulsa NADA del portal: solo observa.

import { configGrabador, FUENTE_GRABADOR, FUENTE_GRABADOR_AUTO, VERSION_GRABADOR, type ConfigGrabador } from './grabador-bookmarklet.ts'
import { DOMINIOS_PORTALES_GRABADOR, FUENTE_MARCOS } from './grabador-marcos.ts'
import { zipSinComprimir } from './zip-simple.ts'

/** Versión de la extensión (sube con cada cambio de su código; Chrome la muestra en chrome://extensions). */
export const VERSION_EXTENSION_GRABADOR = '1.0.0'
/** Carpeta que crea el zip (la que se elige en «Cargar descomprimida»). */
export const CARPETA_EXTENSION_GRABADOR = 'grabador-asegura'
/** Tope de una captura de marco que el principal acepta (el fichero entero tiene su propio tope en servidor). */
export const MAX_BYTES_MARCO_EXTENSION = 8 * 1024 * 1024

/** Aviso de la extensión cuando queda un marco relevante que NO ha podido leer (dominio fuera de la lista o sin cargar). */
export const AVISO_MARCO_EXTENSION = 'Hay un marco de otro dominio que la extensión no ha podido leer (su dominio no está en la lista de portales permitidos o aún no había cargado). Lo demás se ha grabado. Marcos sin leer:'

export type ConfigExtension = ConfigGrabador & { dominios: string[]; maxBytesMarco: number }

export function configExtension(): ConfigExtension {
  return { ...configGrabador(), aviso: AVISO_MARCO_EXTENSION, dominios: [...DOMINIOS_PORTALES_GRABADOR], maxBytesMarco: MAX_BYTES_MARCO_EXTENSION }
}

/** Patrones `matches` del manifiesto: solo https y solo los dominios de compañías (y sus subdominios). */
export function matchesExtension(): string[] {
  return DOMINIOS_PORTALES_GRABADOR.map((d) => `https://*.${d}/*`)
}

/** Content script (ES5). Usa `__aseguraGrabador` (lo define `grabador.js`, mismo mundo aislado: la página no lo ve). */
export const FUENTE_CONTENIDO = String.raw`;(function () {
  var G = typeof __aseguraGrabador === 'undefined' ? null : __aseguraGrabador
  if (!G || G.cargado) return
  G.cargado = true
  var cfg = G.cfg
  var M = G.marcos
  // Defensa en profundidad (además de los «matches» del manifiesto): solo portales de compañías.
  if (!M.hostPermitido(location.hostname, cfg.dominios)) return
  var esPrincipal = window.top === window
  var ajeno = false
  if (!esPrincipal) { try { ajeno = window.frameElement === null } catch (e) { ajeno = true } }
  // Un marco del MISMO origen que su padre ya lo lee el padre: no hace nada.
  if (!esPrincipal && !ajeno) return

  function huella(s) {
    var h = 5381
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
    return h + ':' + s.length
  }
  function cadena(x, max) { return typeof x === 'string' && x.length <= max }

  // ── Marco principal: la grabación automática de siempre + los marcos ajenos que le llegan ──
  var api = null
  var capturas = {}
  function grabarCompuesto(win, c) {
    var r = G.grabar(win, c, false)
    var lista = []
    var login = r.login
    for (var k in capturas) if (Object.prototype.hasOwnProperty.call(capturas, k)) { lista.push(capturas[k]); if (capturas[k].login) login = true }
    var comp = M.componer(r.cuerpo, r.ilegibles, lista, c)
    var cab = r.cabecera + (comp.leidos ? '<!-- grabador: marcos de otro origen leídos por la extensión: ' + comp.leidos + ' -->\n' : '') + (login && !r.login ? c.login + '\n' : '')
    r.cuerpo = comp.cuerpo
    r.html = cab + comp.cuerpo
    r.aviso = M.textoAviso(comp.sinCubrir, c)
    return r
  }
  function recibir(msg) {
    if (typeof msg.frameId !== 'number' || !cadena(msg.cuerpo, cfg.maxBytesMarco) || !cadena(msg.url, 4000) || !cadena(msg.nombre, 500)) return
    var ils = []
    if (msg.ilegibles && msg.ilegibles.length) for (var i = 0; i < msg.ilegibles.length && i < 100; i++) {
      var x = msg.ilegibles[i]
      if (x && cadena(x.ruta, 500) && cadena(x.nombre, 500) && cadena(x.url, 4000)) ils.push({ ruta: x.ruta, nombre: x.nombre, url: x.url })
    }
    capturas[msg.frameId] = { nombre: msg.nombre, url: msg.url, cuerpo: msg.cuerpo, ilegibles: ils, login: msg.login === true }
    api.programar('cambio en un marco')
  }
  function activarPrincipal() {
    if (api) { api.ahora(); return }
    api = G.auto(window, cfg, grabarCompuesto, {
      etiqueta: 'extensión',
      inicioDiferido: true,
      alDetener: function () {
        api = null
        capturas = {}
        try { chrome.runtime.sendMessage({ tipo: 'parar' }) } catch (e) { }
      },
    })
  }

  // ── Marco de OTRO origen: se graba a sí mismo (redactado aquí dentro) y manda la captura al principal ──
  var obs = null
  var temp = null
  var intervalo = null
  var firmaPrev = ''
  var ultima = ''
  var pend = 0
  function firma() {
    var f = [String(location.href)]
    var ms = document.querySelectorAll('iframe,frame')
    for (var i = 0; i < ms.length; i++) { try { f.push(String(ms[i].contentDocument.location.href)) } catch (e) { f.push('x') } }
    return f.join('|')
  }
  function enviar() {
    temp = null
    pend = 0
    var r
    try { r = G.grabar(window, cfg, false) } catch (e) { return }
    var h = huella(r.cuerpo)
    if (h === ultima) return
    ultima = h
    try { chrome.runtime.sendMessage({ tipo: 'marco', nombre: String(window.name || '').slice(0, 500), url: r.url, cuerpo: r.cuerpo, ilegibles: r.ilegibles, login: !!r.login }) } catch (e) { }
  }
  function programarMarco() {
    if (!obs) return
    if (temp) clearTimeout(temp)
    temp = setTimeout(enviar, cfg.esperaMs)
  }
  function alCambiar() { programarMarco() }
  function activarMarco() {
    if (obs) { enviar(); return }
    var motivo = M.irrelevante({ src: String(location.href), ancho: window.innerWidth, alto: window.innerHeight, oculto: false }, cfg)
    if (motivo) return
    try {
      obs = new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) pend += muts[i].addedNodes.length + muts[i].removedNodes.length
        if (pend >= cfg.umbralNodos) programarMarco()
      })
      obs.observe(document.documentElement, { childList: true, subtree: true })
    } catch (e) { return }
    // Solo ESCUCHA (fase de captura, sin preventDefault): que lo tecleado llegue a la captura del marco.
    document.addEventListener('change', alCambiar, true)
    document.addEventListener('input', alCambiar, true)
    firmaPrev = firma()
    intervalo = setInterval(function () { var f = firma(); if (f !== firmaPrev) { firmaPrev = f; programarMarco() } }, cfg.sondeoMs)
    enviar()
  }
  function pararMarco() {
    if (!obs) return
    obs.disconnect()
    obs = null
    if (temp) clearTimeout(temp)
    temp = null
    clearInterval(intervalo)
    document.removeEventListener('change', alCambiar, true)
    document.removeEventListener('input', alCambiar, true)
    ultima = ''
  }

  chrome.runtime.onMessage.addListener(function (msg, sender, responder) {
    if (!msg || typeof msg.tipo !== 'string' || !sender || sender.id !== chrome.runtime.id) return
    if (msg.tipo === 'activar') {
      if (esPrincipal) { activarPrincipal(); responder({ ok: true }) } else activarMarco()
    } else if (msg.tipo === 'marco') {
      if (esPrincipal && api) recibir(msg)
    } else if (msg.tipo === 'parar') {
      if (!esPrincipal) pararMarco()
    }
  })
})()`

/** Service worker (ES5): el botón de la extensión activa la grabación en la pestaña y reenvía las capturas de los marcos al principal. Sin estado ni red. */
export const FUENTE_FONDO = String.raw`function nada() { void chrome.runtime.lastError }
chrome.action.onClicked.addListener(function (tab) {
  if (!tab || tab.id == null) return
  chrome.tabs.sendMessage(tab.id, { tipo: 'activar' }, function (r) {
    if (chrome.runtime.lastError || !r || !r.ok) {
      chrome.action.setBadgeText({ tabId: tab.id, text: 'NO' })
      chrome.action.setTitle({ tabId: tab.id, title: 'Grabador ASegura: esta página no es un portal de compañía permitido (o aún no ha cargado).' })
      return
    }
    chrome.action.setBadgeText({ tabId: tab.id, text: 'REC' })
    chrome.action.setTitle({ tabId: tab.id, title: 'Grabador ASegura: grabando (pulsa para guardar la pantalla ahora)' })
  })
})
chrome.runtime.onMessage.addListener(function (msg, sender) {
  if (!msg || !sender || sender.id !== chrome.runtime.id || !sender.tab || sender.tab.id == null) return
  if (msg.tipo === 'marco' && sender.frameId !== 0) {
    chrome.tabs.sendMessage(sender.tab.id, { tipo: 'marco', frameId: sender.frameId, nombre: msg.nombre, url: msg.url, cuerpo: msg.cuerpo, ilegibles: msg.ilegibles, login: msg.login === true }, { frameId: 0 }, nada)
  } else if (msg.tipo === 'parar' && sender.frameId === 0) {
    chrome.tabs.sendMessage(sender.tab.id, { tipo: 'parar' }, nada)
    chrome.action.setBadgeText({ tabId: sender.tab.id, text: '' })
    chrome.action.setTitle({ tabId: sender.tab.id, title: 'Grabador ASegura' })
  }
})`

/** `grabador.js`: el grabador compartido (los MISMOS textos que el marcador) y su configuración, en el mundo aislado. */
export function fuenteGrabadorExtension(): string {
  return '/* Grabador ASegura v' + VERSION_GRABADOR + ' (generado desde @central/module-tarificacion; no editar a mano). */\n' +
    'var __aseguraGrabador = {\n  cfg: ' + JSON.stringify(configExtension()) + ',\n  grabar: ' + FUENTE_GRABADOR + ',\n  auto: ' + FUENTE_GRABADOR_AUTO +
    ',\n  marcos: (' + FUENTE_MARCOS + ')()\n}\n'
}

export function manifestExtension(): Record<string, unknown> {
  return {
    manifest_version: 3,
    name: 'Grabador ASegura',
    version: VERSION_EXTENSION_GRABADOR,
    description: 'Graba (solo observa, nunca pulsa) las pantallas de un presupuesto ficticio en el portal de una compañía, también los marcos de otro dominio. Redacta los datos personales antes de salir del marco y descarga un fichero para subirlo en Tarificador → Grabaciones.',
    action: { default_title: 'Grabador ASegura: pulsa para empezar a grabar esta pestaña' },
    background: { service_worker: 'fondo.js' },
    content_scripts: [{ matches: matchesExtension(), js: ['grabador.js', 'contenido.js'], all_frames: true, match_about_blank: true, run_at: 'document_idle' }],
  }
}

export const LEEME_EXTENSION = `Grabador ASegura (extensión de Chrome)

Instalación (una vez):
  1. Descomprime este zip: queda la carpeta «${CARPETA_EXTENSION_GRABADOR}».
  2. Abre chrome://extensions y activa «Modo de desarrollador» (arriba a la derecha).
  3. Pulsa «Cargar descomprimida» y elige la carpeta «${CARPETA_EXTENSION_GRABADOR}».

Uso: en el portal de la compañía (presupuesto FICTICIO), pulsa el icono de la extensión en lugar del marcador. Graba
sola cada pantalla nueva, también lo que va dentro de marcos de otro dominio (Mapfre). «Terminar y descargar» baja un
grabacion-….html: súbelo en plataforma → Correduría → Tarificador → Grabaciones.

Qué hace y qué no: solo observa (no pulsa nada del portal), tapa contraseñas, ocultos, DNI, IBAN, tarjetas, correos y
teléfonos DENTRO de cada marco antes de que el dato salga de él, no tiene acceso a red ni guarda nada, y solo actúa en
los dominios de compañías listados en manifest.json.
`

/** Ficheros de la extensión (ruta dentro de la carpeta → contenido). */
export function archivosExtension(): { ruta: string; contenido: string }[] {
  return [
    { ruta: 'manifest.json', contenido: JSON.stringify(manifestExtension(), null, 2) + '\n' },
    { ruta: 'grabador.js', contenido: fuenteGrabadorExtension() },
    { ruta: 'contenido.js', contenido: FUENTE_CONTENIDO + '\n' },
    { ruta: 'fondo.js', contenido: FUENTE_FONDO + '\n' },
    { ruta: 'LEEME.txt', contenido: LEEME_EXTENSION },
  ]
}

/** El .zip de la extensión (carpeta `grabador-asegura/`), listo para descargar. Reproducible (fecha fija). */
export function zipExtension(): Uint8Array {
  return zipSinComprimir(archivosExtension().map((a) => ({ nombre: `${CARPETA_EXTENSION_GRABADOR}/${a.ruta}`, contenido: a.contenido })))
}
