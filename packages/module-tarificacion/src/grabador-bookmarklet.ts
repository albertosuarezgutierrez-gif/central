/* eslint-disable */
// BOOKMARKLET «Grabar pantalla ASegura» del grabador del tarificador RPA (07/10/2026).
//
// Alberto hace un presupuesto FICTICIO a mano en el portal de la compañía y en cada pantalla pulsa este
// marcador. Serializa el DOM de la página y de TODOS sus marcos del mismo origen (recursivo, con la marca
// `<!-- tarificador:marco ruta="…" -->` de services/tarificador-rpa/src/evidencia.ts), anota el valor
// actual de cada control en `data-valor` (los <select> llevan sus <option> y la elegida con `selected`),
// REDACTA antes de salir y DESCARGA un `pantalla-<host>-<fecha>.html`.
//
// v3 (07/10/2026): MODO AUTOMÁTICO (`FUENTE_GRABADOR_AUTO`, el marcador por defecto): una pulsación y graba sola
// cada pantalla nueva; al terminar baja UN `grabacion-<host>-<fecha>.html`. El manual de siempre sigue (`codigoBookmarkletManual`).
//
// 🔒 Sin red a propósito: los portales pueden bloquear peticiones externas por CSP, y lo que no sale no se
//    filtra. Ni fetch, ni XHR, ni beacons, ni cookies, ni storage (lo vigila grabador.test.ts).
// 🔒 No pulsa NADA del portal: el único `click()` es el del <a download> que crea él mismo, sin colgarlo del
//    documento (así ni siquiera burbujea a los manejadores del portal).
// 🔒 Redacción (la misma que repite asegura en servidor, `redactarHtmlGrabacion`): fuera <script>/<style>/
//    <noscript>/<template>; contraseñas, ocultos, campos cuyo name/id/autocomplete casa con
//    PATRON_CAMPO_SENSIBLE o PATRON_CAMPO_USUARIO (usuario/login) → [REDACTADO]; si la página (o un marco) tiene un
//    input password es una PANTALLA DE LOGIN: se marca en la cabecera (MARCA_LOGIN) y TODOS sus campos de texto se tapan; DNI/NIE/CIF, IBAN, correo, teléfono… (PATRONES_PERSONALES del
//    formador) → [DATO] en textos, valores y atributos; parámetros de sesión de las URL tapados; atributos de
//    sesión (session, token, auth, csrf…) y cualquier UUID en un atributo → [DATO]; el TEXTO de los elementos
//    cuyo id/class/aria-label dice usuario/login/cuenta/perfil (cabecera del portal) → [DATO].
// 🔒 Marcos de OTRO origen (no legibles): la cabecera lista su URL SIN query ni #; y se avisa con un alert() que lleva
//    la URL completa (solo en pantalla, nunca en el fichero) para abrirla en pestaña nueva y grabar desde ahí.
//
// La función va como TEXTO (`FUENTE_GRABADOR`), no como función serializada con `toString()`: los
// compiladores inyectan ayudantes (`__name` de esbuild, visto en rojo el 07/10/2026) que en el portal no
// existen. ES5 a propósito (var, for, sin spread ni `?.`) y sin nada de fuera (todo llega en `cfg`).

import { PATRONES_PERSONALES, MARCA_DATO_PERSONAL } from './formador.ts'
import { MARCA_REDACTADO } from './redactar.ts'
import { FIN_MARCA_MARCO, MARCA_PANTALLA, MARCA_LOGIN, MARCA_MARCO, PATRON_CAMPO_SENSIBLE, PATRON_CAMPO_PERSONAL, PATRON_CAMPO_USUARIO, PATRON_MEDIADOR, PATRON_PARAM_SENSIBLE, PATRON_ATRIBUTO_SESION, PATRON_UUID, PATRON_ELEMENTO_USUARIO, MAX_TEXTO_ELEMENTO_USUARIO } from './grabador.ts'

export const VERSION_GRABADOR = 3

/** Modo automático: nodos añadidos/quitados que cuentan como «mutación grande», espera (debounce) y sondeo de URL. */
export const UMBRAL_NODOS_GRABADOR = 20
export const ESPERA_CAPTURA_MS = 1500
export const SONDEO_MS = 600

/** Texto del alert() cuando hay marcos de otro origen; se le pega la URL completa del marco. */
export const AVISO_MARCO_NO_LEGIBLE = 'Esta pantalla tiene el formulario en un marco que no se puede leer. Abre este enlace en una pestaña nueva y vuelve a pulsar el marcador: '

export type ConfigGrabador = {
  version: number
  patrones: [string, string][]
  sensible: [string, string]
  usuario: [string, string]
  login: string
  personal: [string, string]
  mediador: [string, string]
  param: [string, string]
  sesion: [string, string]
  uuid: [string, string]
  elemUsuario: [string, string]
  maxTextoUsuario: number
  aviso: string
  marca: string
  finMarca: string
  sepPantalla: string
  umbralNodos: number
  esperaMs: number
  sondeoMs: number
  redactado: string
  dato: string
}

export function configGrabador(): ConfigGrabador {
  return {
    version: VERSION_GRABADOR,
    patrones: PATRONES_PERSONALES.map((r) => [r.source, r.flags] as [string, string]),
    sensible: [PATRON_CAMPO_SENSIBLE.source, PATRON_CAMPO_SENSIBLE.flags],
    usuario: [PATRON_CAMPO_USUARIO.source, PATRON_CAMPO_USUARIO.flags],
    login: MARCA_LOGIN,
    personal: [PATRON_CAMPO_PERSONAL.source, PATRON_CAMPO_PERSONAL.flags],
    mediador: [PATRON_MEDIADOR.source, PATRON_MEDIADOR.flags],
    param: [PATRON_PARAM_SENSIBLE.source, PATRON_PARAM_SENSIBLE.flags],
    sesion: [PATRON_ATRIBUTO_SESION.source, PATRON_ATRIBUTO_SESION.flags],
    uuid: [PATRON_UUID.source, PATRON_UUID.flags],
    elemUsuario: [PATRON_ELEMENTO_USUARIO.source, PATRON_ELEMENTO_USUARIO.flags],
    maxTextoUsuario: MAX_TEXTO_ELEMENTO_USUARIO,
    aviso: AVISO_MARCO_NO_LEGIBLE,
    marca: MARCA_MARCO,
    finMarca: FIN_MARCA_MARCO,
    sepPantalla: MARCA_PANTALLA,
    umbralNodos: UMBRAL_NODOS_GRABADOR,
    esperaMs: ESPERA_CAPTURA_MS,
    sondeoMs: SONDEO_MS,
    redactado: MARCA_REDACTADO,
    dato: MARCA_DATO_PERSONAL,
  }
}

/** Fuente JS (ES5, sin tipos: no pasa por ningún compilador) de `grabarPantalla(win, cfg, descargar)` →
 *  `{ nombre, html, marcosSinLeer, urlsSinLeer, aviso }`. Si `descargar`, además lo descarga. Corre EN EL NAVEGADOR del portal. */
export const FUENTE_GRABADOR = String.raw`function grabarPantalla(win, cfg, descargar) {
  var PII = []
  for (var p = 0; p < cfg.patrones.length; p++) PII.push(new RegExp(cfg.patrones[p][0], cfg.patrones[p][1]))
  var SENS = new RegExp(cfg.sensible[0], cfg.sensible[1].replace('g', ''))
  var USU = new RegExp(cfg.usuario[0], cfg.usuario[1].replace('g', ''))
  var PERS = new RegExp(cfg.personal[0], cfg.personal[1].replace('g', ''))
  var MED = new RegExp(cfg.mediador[0], cfg.mediador[1])
  var SIN_TEXTO = { checkbox: 1, radio: 1, submit: 1, button: 1, reset: 1, image: 1, file: 1, range: 1, color: 1 }
  var hayLogin = false
  var PARAM = new RegExp(cfg.param[0], cfg.param[1].replace('g', ''))
  var SESION = new RegExp(cfg.sesion[0], cfg.sesion[1].replace('g', ''))
  var UUID = new RegExp(cfg.uuid[0], cfg.uuid[1].indexOf('g') >= 0 ? cfg.uuid[1] : cfg.uuid[1] + 'g')
  var ELEM_USU = new RegExp(cfg.elemUsuario[0], cfg.elemUsuario[1].replace('g', ''))
  var NO_USU = { html: 1, body: 1, head: 1, main: 1, form: 1, table: 1, script: 1, style: 1, input: 1, select: 1, textarea: 1, option: 1, button: 1 }
  var urlsSinLeer = []
  var urlsCompletas = []
  var ATR_SELECTOR = { id: 1, name: 1, 'class': 1, 'for': 1, type: 1, role: 1, style: 1 }
  var ATR_URL = { href: 1, src: 1, action: 1, formaction: 1 }
  var sinLeer = 0

  function red(s) {
    var o = String(s)
    for (var k = 0; k < PII.length; k++) {
      PII[k].lastIndex = 0
      o = o.replace(PII[k], function (m) { return /\d/.test(m) || m.indexOf('@') >= 0 ? cfg.dato : m })
    }
    return o.replace(MED, function (m, cod) { return cod + ' - ' + cfg.dato })
  }
  function redUrl(u) {
    return red(u)
      .replace(/([?&#;])([^=&#?;]*)=([^&#?;]*)/g, function (m, sep, k) { return PARAM.test(k) ? sep + k + '=' + cfg.redactado : m })
  }
  function sinParametros(u) {
    return red(String(u || '').replace(/[?#].*$/, '').replace(/;[^\/]*/g, '')).replace(UUID, cfg.dato)
  }
  function sensible(el, login) {
    var t = String(el.getAttribute('type') || '').toLowerCase()
    if (t === 'password' || t === 'hidden') return true
    if (login && String(el.tagName).toLowerCase() !== 'select' && !SIN_TEXTO[t]) return true
    var a = [el.getAttribute('name'), el.getAttribute('id'), el.getAttribute('autocomplete')]
    for (var j = 0; j < a.length; j++) if (a[j] && SENS.test(a[j])) return true
    a.push(el.getAttribute('aria-label'), el.getAttribute('placeholder'))
    for (var k = 0; k < a.length; k++) if (a[k] && USU.test(a[k])) return true
    // Datos de personas, direcciones y códigos de mediador: solo en campos de texto (no selects, checkboxes ni radios).
    var tg = String(el.tagName).toLowerCase()
    if (tg !== 'select' && !SIN_TEXTO[t]) for (var m = 0; m < a.length; m++) if (a[m] && PERS.test(a[m])) return true
    return false
  }
  function anotar(o, c, login) {
    var tag = String(o.tagName).toLowerCase()
    if (sensible(o, login)) {
      c.setAttribute('data-valor', cfg.redactado)
      if (c.hasAttribute('value') || tag === 'input') c.setAttribute('value', cfg.redactado)
      if (tag === 'textarea') c.textContent = cfg.redactado
      return
    }
    if (tag === 'select') {
      var elegidas = []
      for (var i = 0; i < o.options.length; i++) {
        var co = c.options ? c.options[i] : null
        if (o.options[i].selected) { elegidas.push(o.options[i].value); if (co) co.setAttribute('selected', '') }
        else if (co) co.removeAttribute('selected')
      }
      c.setAttribute('data-valor', red(elegidas.join('|')))
      return
    }
    var t = String(o.getAttribute('type') || '').toLowerCase()
    if (t === 'checkbox' || t === 'radio') {
      c.setAttribute('data-valor', o.checked ? 'marcado' : 'sin_marcar')
      if (o.checked) c.setAttribute('checked', ''); else c.removeAttribute('checked')
      return
    }
    var v = red(o.value == null ? '' : o.value)
    c.setAttribute('data-valor', v)
    if (tag === 'textarea') c.textContent = v
    else c.setAttribute('value', v)
  }
  function limpiar(doc, clon) {
    var fuera = clon.querySelectorAll('script,noscript,style,template')
    for (var i = fuera.length - 1; i >= 0; i--) if (fuera[i].parentNode) fuera[i].parentNode.removeChild(fuera[i])
    var todos = clon.querySelectorAll('*')
    for (var e = -1; e < todos.length; e++) {
      var el = e < 0 ? clon : todos[e]
      var tag = String(el.tagName).toLowerCase()
      var esCampo = tag === 'input' || tag === 'select' || tag === 'textarea'
      var attrs = []
      for (var a = 0; a < el.attributes.length; a++) attrs.push(el.attributes[a])
      for (var b = 0; b < attrs.length; b++) {
        var n = String(attrs[b].name).toLowerCase()
        if (ATR_SELECTOR[n]) continue
        if (esCampo && (n === 'value' || n === 'data-valor')) continue
        var val = attrs[b].value
        if (SESION.test(n)) { if (val !== '' && val !== cfg.dato) el.setAttribute(attrs[b].name, cfg.dato); continue }
        var nuevo = (ATR_URL[n] ? redUrl(val) : red(val)).replace(UUID, cfg.dato)
        if (nuevo !== val) el.setAttribute(attrs[b].name, nuevo)
      }
    }
    // Texto de la cabecera con el usuario/cuenta: elementos cortos, sin controles dentro.
    var usu = clon.querySelectorAll('*')
    for (var u = 0; u < usu.length; u++) {
      var eu = usu[u]
      var tu = String(eu.tagName).toLowerCase()
      if (NO_USU[tu]) continue
      var ad = [eu.getAttribute('id'), eu.getAttribute('class'), eu.getAttribute('aria-label')]
      var marcado = false
      for (var z = 0; z < ad.length; z++) if (ad[z] && ELEM_USU.test(ad[z])) marcado = true
      if (!marcado || eu.querySelector('input,select,textarea,form,table,button')) continue
      if (String(eu.textContent || '').replace(/^\s+|\s+$/g, '').length > cfg.maxTextoUsuario) continue
      var wu = doc.createTreeWalker(eu, 4, null)
      var nu = []
      while (wu.nextNode()) nu.push(wu.currentNode)
      for (var y = 0; y < nu.length; y++) if (/\S/.test(nu[y].nodeValue)) nu[y].nodeValue = cfg.dato
    }
    var textos = []
    var w = doc.createTreeWalker(clon, 4, null)
    while (w.nextNode()) textos.push(w.currentNode)
    for (var t = 0; t < textos.length; t++) {
      var r = red(textos[t].nodeValue)
      if (r !== textos[t].nodeValue) textos[t].nodeValue = r
    }
  }
  function serializar(doc, ruta, partes) {
    var raiz = doc.documentElement
    if (!raiz) return
    var origs = doc.querySelectorAll('input,select,textarea')
    var clon = raiz.cloneNode(true)
    var clons = clon.querySelectorAll('input,select,textarea')
    var login = false
    for (var q = 0; q < origs.length; q++) if (String(origs[q].getAttribute('type') || '').toLowerCase() === 'password') login = true
    if (login) hayLogin = true
    for (var i = 0; i < origs.length && i < clons.length; i++) anotar(origs[i], clons[i], login)
    var panel = clon.querySelectorAll('[data-asegura-grabador]')
    for (var pn = 0; pn < panel.length; pn++) if (panel[pn].parentNode) panel[pn].parentNode.removeChild(panel[pn])
    var marcos = doc.querySelectorAll('iframe,frame')
    var marcosClon = clon.querySelectorAll('iframe,frame')
    var rutas = []
    for (var m = 0; m < marcos.length; m++) {
      var nombre = String(marcos[m].getAttribute('name') || marcos[m].getAttribute('id') || '#' + m).replace(/["\/]/g, '_')
      rutas.push(ruta ? ruta + '/' + nombre : nombre)
      if (marcosClon[m]) {
        marcosClon[m].setAttribute('data-grabador-marco', rutas[m]); marcosClon[m].removeAttribute('srcdoc')
        var srcMarco = marcosClon[m].getAttribute('src')
        if (srcMarco) marcosClon[m].setAttribute('src', sinParametros(srcMarco))
      }
    }
    limpiar(doc, clon)
    var html = String(clon.outerHTML).split(cfg.marca).join('<!-- (marco) ').split(cfg.sepPantalla).join('<!-- (pantalla) ')
    partes.push(ruta === null ? html : cfg.marca + ruta + cfg.finMarca + '\n' + html)
    for (var f = 0; f < marcos.length; f++) {
      var d = null
      try { d = marcos[f].contentDocument } catch (e) { d = null }
      if (d && d.documentElement) serializar(d, rutas[f], partes)
      else {
        sinLeer++
        var srcCompleta = String(marcos[f].src || '')
        if (srcCompleta && srcCompleta.indexOf('about:') !== 0) { urlsSinLeer.push(sinParametros(srcCompleta)); urlsCompletas.push(srcCompleta) }
        partes.push(cfg.marca + rutas[f] + cfg.finMarca + '\n<!-- grabador: marco de otro origen o vacío; no se ha podido leer -->')
      }
    }
  }

  var partes = []
  serializar(win.document, null, partes)
  var loc = win.location
  var host = String(loc.hostname || 'local').replace(/[^a-z0-9.-]/gi, '_')
  var d = new Date()
  var dos = function (x) { return (x < 10 ? '0' : '') + x }
  var sello = d.getFullYear() + dos(d.getMonth() + 1) + dos(d.getDate()) + '-' + dos(d.getHours()) + dos(d.getMinutes()) + dos(d.getSeconds())
  var titulo = red(String(win.document.title || '')).replace(/--/g, '- -')
  var cabecera = '<!-- grabador ASegura v' + cfg.version + ' · ' + d.toISOString() + ' · ' + host + redUrl(String(loc.pathname || '')).replace(/--/g, '- -') +
    ' · «' + titulo + '» · marcos sin leer: ' + sinLeer + ' -->\n' + (urlsSinLeer.length ? '<!-- grabador: marcos sin leer (sin query ni tokens): ' + urlsSinLeer.join(' | ').replace(/--/g, '- -').replace(/>/g, '%3E') + ' -->\n' : '') + (hayLogin ? cfg.login + '\n' : '')
  var cuerpo = partes.join('\n')
  var html = cabecera + cuerpo
  var nombre = 'pantalla-' + host + '-' + sello + '.html'
  if (descargar) {
    var blob = new win.Blob([html], { type: 'text/html;charset=utf-8' })
    var url = win.URL.createObjectURL(blob)
    var a = win.document.createElement('a')
    a.href = url
    a.download = nombre
    a.click()
    win.setTimeout(function () { win.URL.revokeObjectURL(url) }, 5000)
  }
  // Aviso EN PANTALLA (con la URL completa, que NO va al fichero) para abrir el marco en una pestaña nueva.
  var aviso = ''
  for (var v = 0; v < urlsCompletas.length; v++) aviso += (aviso ? '\n\n' : '') + cfg.aviso + urlsCompletas[v]
  if (descargar && aviso) { try { win.alert(aviso) } catch (e) { } }
  return { nombre: nombre, html: html, cuerpo: cuerpo, host: host, sello: sello, marcosSinLeer: sinLeer, urlsSinLeer: urlsSinLeer, aviso: aviso }
}`

/** Fuente JS (ES5) del MODO AUTOMÁTICO `grabadorAuto(win, cfg, grabar)`: un indicador flotante (shadow DOM abierto, fuera de
 *  toda captura) y una captura por cada cambio de pantalla (URL/hash/marcos del mismo origen, o mutación grande del DOM con
 *  debounce). Dedupe por huella del HTML ya redactado. El estado vive SOLO en memoria de la pestaña (nada de almacenamiento
 *  que el portal pudiera leer): si la página se recarga entera, se pierde y el indicador lo avisa. Al terminar descarga UN
 *  fichero con todas las pantallas. Sin red, sin cookies; el único click() es el del <a download> propio. */
export const FUENTE_GRABADOR_AUTO = String.raw`function grabadorAuto(win, cfg, grabar) {
  var doc = win.document
  var previo = doc.querySelector('[data-asegura-grabador]')
  if (previo && previo.__ahora) { previo.__ahora(); return }
  var pantallas = []
  var vistas = {}
  var activo = true
  var temporizador = null
  var pendientes = 0
  var firmaPrev = null
  var observadores = []
  var avisado = false
  var ocupado = false
  var host = String(win.location.hostname || 'local').replace(/[^a-z0-9.-]/gi, '_')

  function huella(s) {
    var h = 5381
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
    return h + ':' + s.length
  }
  function dos(x) { return (x < 10 ? '0' : '') + x }
  function hora(d) { return dos(d.getHours()) + ':' + dos(d.getMinutes()) + ':' + dos(d.getSeconds()) }

  var caja = doc.createElement('div')
  caja.setAttribute('data-asegura-grabador', '1')
  caja.style.cssText = 'all:initial;position:fixed;right:12px;bottom:12px;z-index:2147483647'
  var raiz = caja.attachShadow ? caja.attachShadow({ mode: 'open' }) : caja
  var marco = doc.createElement('div')
  marco.style.cssText = 'font:12px/1.35 system-ui,sans-serif;background:#fff;color:#111;border:2px solid #3364ee;border-radius:10px;padding:8px 10px;width:230px;box-shadow:0 2px 10px rgba(0,0,0,.3)'
  function linea(css, texto) { var e = doc.createElement('div'); e.style.cssText = css; e.textContent = texto; marco.appendChild(e); return e }
  var titulo = linea('font-weight:700;font-size:13px', '')
  var estado = linea('margin:2px 0 4px;color:#444', 'Navega con normalidad: cada pantalla nueva se guarda sola.')
  linea('margin:0 0 6px;color:#8a5a00;font-size:11px', 'Si la pagina se recarga entera se pierde lo grabado: pulsa Terminar antes de salir, o vuelve a pulsar el marcador despues (se juntan por nombre y fecha).')
  function boton(texto, fn) {
    var b = doc.createElement('button')
    b.type = 'button'
    b.textContent = texto
    b.style.cssText = 'display:block;width:100%;margin:3px 0 0;padding:6px 8px;font:12px system-ui,sans-serif;border:1px solid #3364ee;border-radius:6px;background:#3364ee;color:#fff;cursor:pointer'
    b.addEventListener('click', fn)
    marco.appendChild(b)
    return b
  }
  function pintar(msg) {
    titulo.textContent = '\u25CF Grabando \u00B7 ' + pantallas.length + ' pantalla' + (pantallas.length === 1 ? '' : 's')
    if (msg) estado.textContent = msg
  }

  function capturar(motivo) {
    if (!activo || ocupado) return false
    ocupado = true
    var r
    try { r = grabar(win, cfg, false) } finally { ocupado = false }
    pendientes = 0
    if (r.aviso && !avisado) { avisado = true; try { win.alert(r.aviso) } catch (e) { } }
    var h = huella(r.cuerpo)
    if (vistas[h]) { pintar('Esta pantalla ya estaba guardada.'); return false }
    vistas[h] = 1
    pantallas.push({ html: r.html, motivo: motivo, hora: hora(new Date()) })
    pintar('Guardada: ' + motivo + '.')
    return true
  }
  function programar(motivo) {
    if (!activo) return
    if (temporizador) win.clearTimeout(temporizador)
    temporizador = win.setTimeout(function () { temporizador = null; capturar(motivo) }, cfg.esperaMs)
  }

  function recorrer(d, firmas, ruta) {
    var href = ''
    try { href = String(d.location.href) } catch (e) { href = '?' }
    firmas.push(ruta + '=' + href)
    if (!d.__asegObs) {
      d.__asegObs = true
      try {
        var mo = new win.MutationObserver(function (muts) {
          for (var i = 0; i < muts.length; i++) {
            var m = muts[i]
            if (m.target === caja) continue
            var n = 0
            for (var a = 0; a < m.addedNodes.length; a++) if (m.addedNodes[a] !== caja) n++
            pendientes += n + m.removedNodes.length
          }
          if (pendientes >= cfg.umbralNodos) programar('cambio de pantalla')
        })
        mo.observe(d.documentElement, { childList: true, subtree: true })
        observadores.push(mo)
      } catch (e) { }
    }
    var marcos = d.querySelectorAll('iframe,frame')
    for (var f = 0; f < marcos.length; f++) {
      var hijo = null
      try { hijo = marcos[f].contentDocument } catch (e) { hijo = null }
      if (hijo && hijo.documentElement) recorrer(hijo, firmas, ruta + '/' + f)
      else firmas.push(ruta + '/' + f + '=ilegible')
    }
  }
  function sondear() {
    if (!activo) return
    var firmas = []
    recorrer(doc, firmas, 'p')
    var firma = firmas.join('|')
    if (firmaPrev !== null && firma !== firmaPrev) programar('navegacion')
    firmaPrev = firma
  }

  function detener() {
    activo = false
    if (temporizador) win.clearTimeout(temporizador)
    win.clearInterval(intervalo)
    for (var i = 0; i < observadores.length; i++) observadores[i].disconnect()
    if (caja.parentNode) caja.parentNode.removeChild(caja)
  }
  function terminar() {
    capturar('final')
    var n = pantallas.length
    var d = new Date()
    var sello = d.getFullYear() + dos(d.getMonth() + 1) + dos(d.getDate()) + '-' + dos(d.getHours()) + dos(d.getMinutes()) + dos(d.getSeconds())
    var texto = '<!-- grabacion ASegura v' + cfg.version + ' \u00B7 multipantalla \u00B7 ' + host + ' \u00B7 ' + d.toISOString() + ' \u00B7 pantallas: ' + n + ' -->\n'
    for (var i = 0; i < n; i++) texto += cfg.sepPantalla + (i + 1) + '/' + n + ' \u00B7 ' + pantallas[i].motivo + ' \u00B7 ' + pantallas[i].hora + ' -->\n' + pantallas[i].html + '\n'
    detener()
    if (!n) return
    var blob = new win.Blob([texto], { type: 'text/html;charset=utf-8' })
    var url = win.URL.createObjectURL(blob)
    var a = doc.createElement('a')
    a.href = url
    a.download = 'grabacion-' + host + '-' + sello + '.html'
    a.click()
    win.setTimeout(function () { win.URL.revokeObjectURL(url) }, 5000)
  }

  boton('Guardar pantalla ahora', function () { capturar('guardada a mano') })
  boton('Terminar y descargar', terminar)
  raiz.appendChild(marco)
  var stop = function (e) { e.stopPropagation() }
  var evs = ['click', 'mousedown', 'mouseup', 'keydown', 'keyup', 'pointerdown', 'pointerup']
  for (var k = 0; k < evs.length; k++) caja.addEventListener(evs[k], stop)
  caja.__ahora = function () { capturar('guardada a mano') }
  ;(doc.body || doc.documentElement).appendChild(caja)
  var intervalo = win.setInterval(sondear, cfg.sondeoMs)
  sondear()
  capturar('inicio')
}`

/** Código JS del marcador MANUAL de siempre (una pantalla por pulsación → `pantalla-….html`). */
export function codigoBookmarkletManual(): string {
  // Sin sangrías (ninguna cadena del fuente cruza líneas): el marcador pesa menos.
  return '(function(){var g=' + FUENTE_GRABADOR.replace(/\n\s+/g, '\n') + ';try{g(window,' + JSON.stringify(configGrabador()) +
    ',true)}catch(e){alert("Grabar pantalla ASegura: no se ha podido grabar ("+(e&&e.message)+")")}})();void 0'
}

/** La URL `javascript:` del marcador (para el <a> que se arrastra a favoritos). */
export function urlBookmarkletManual(): string {
  return 'javascript:' + encodeURIComponent(codigoBookmarkletManual())
}

/** Código JS (sin `javascript:`) del marcador AUTOMÁTICO: una pulsación → graba sola cada pantalla nueva. */
export function codigoBookmarklet(): string {
  return '(function(){var g=' + FUENTE_GRABADOR.replace(/\n\s+/g, '\n') + ';var a=' + FUENTE_GRABADOR_AUTO.replace(/\n\s+/g, '\n') + ';try{a(window,' + JSON.stringify(configGrabador()) +
    ',g)}catch(e){alert("Grabar pantalla ASegura: no se ha podido grabar ("+(e&&e.message)+")")}})();void 0'
}

/** La URL `javascript:` del marcador automático (para el <a> que se arrastra a favoritos). */
export function urlBookmarklet(): string {
  return 'javascript:' + encodeURIComponent(codigoBookmarklet())
}
