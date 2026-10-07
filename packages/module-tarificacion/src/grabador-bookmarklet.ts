/* eslint-disable */
// BOOKMARKLET «Grabar pantalla ASegura» del grabador del tarificador RPA (07/10/2026).
//
// Alberto hace un presupuesto FICTICIO a mano en el portal de la compañía y en cada pantalla pulsa este
// marcador. Serializa el DOM de la página y de TODOS sus marcos del mismo origen (recursivo, con la marca
// `<!-- tarificador:marco ruta="…" -->` de services/tarificador-rpa/src/evidencia.ts), anota el valor
// actual de cada control en `data-valor` (los <select> llevan sus <option> y la elegida con `selected`),
// REDACTA antes de salir y DESCARGA un `pantalla-<host>-<fecha>.html`.
//
// 🔒 Sin red a propósito: los portales pueden bloquear peticiones externas por CSP, y lo que no sale no se
//    filtra. Ni fetch, ni XHR, ni beacons, ni cookies, ni storage (lo vigila grabador.test.ts).
// 🔒 No pulsa NADA del portal: el único `click()` es el del <a download> que crea él mismo, sin colgarlo del
//    documento (así ni siquiera burbujea a los manejadores del portal).
// 🔒 Redacción (la misma que repite asegura en servidor, `redactarHtmlGrabacion`): fuera <script>/<style>/
//    <noscript>/<template>; contraseñas, ocultos, campos cuyo name/id/autocomplete casa con
//    PATRON_CAMPO_SENSIBLE o PATRON_CAMPO_USUARIO (usuario/login) → [REDACTADO]; si la página (o un marco) tiene un
//    input password es una PANTALLA DE LOGIN: se marca en la cabecera (MARCA_LOGIN) y TODOS sus campos de texto se tapan; DNI/NIE/CIF, IBAN, correo, teléfono… (PATRONES_PERSONALES del
//    formador) → [DATO] en textos, valores y atributos; parámetros de sesión de las URL tapados.
//
// La función va como TEXTO (`FUENTE_GRABADOR`), no como función serializada con `toString()`: los
// compiladores inyectan ayudantes (`__name` de esbuild, visto en rojo el 07/10/2026) que en el portal no
// existen. ES5 a propósito (var, for, sin spread ni `?.`) y sin nada de fuera (todo llega en `cfg`).

import { PATRONES_PERSONALES, MARCA_DATO_PERSONAL } from './formador.ts'
import { MARCA_REDACTADO } from './redactar.ts'
import { FIN_MARCA_MARCO, MARCA_LOGIN, MARCA_MARCO, PATRON_CAMPO_SENSIBLE, PATRON_CAMPO_PERSONAL, PATRON_CAMPO_USUARIO, PATRON_MEDIADOR, PATRON_PARAM_SENSIBLE } from './grabador.ts'

export const VERSION_GRABADOR = 1

export type ConfigGrabador = {
  version: number
  patrones: [string, string][]
  sensible: [string, string]
  usuario: [string, string]
  login: string
  personal: [string, string]
  mediador: [string, string]
  param: [string, string]
  marca: string
  finMarca: string
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
    marca: MARCA_MARCO,
    finMarca: FIN_MARCA_MARCO,
    redactado: MARCA_REDACTADO,
    dato: MARCA_DATO_PERSONAL,
  }
}

/** Fuente JS (ES5, sin tipos: no pasa por ningún compilador) de `grabarPantalla(win, cfg, descargar)` →
 *  `{ nombre, html, marcosSinLeer }`. Si `descargar`, además lo descarga. Corre EN EL NAVEGADOR del portal. */
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
        var nuevo = ATR_URL[n] ? redUrl(val) : red(val)
        if (nuevo !== val) el.setAttribute(attrs[b].name, nuevo)
      }
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
    var marcos = doc.querySelectorAll('iframe,frame')
    var marcosClon = clon.querySelectorAll('iframe,frame')
    var rutas = []
    for (var m = 0; m < marcos.length; m++) {
      var nombre = String(marcos[m].getAttribute('name') || marcos[m].getAttribute('id') || '#' + m).replace(/["\/]/g, '_')
      rutas.push(ruta ? ruta + '/' + nombre : nombre)
      if (marcosClon[m]) { marcosClon[m].setAttribute('data-grabador-marco', rutas[m]); marcosClon[m].removeAttribute('srcdoc') }
    }
    limpiar(doc, clon)
    var html = String(clon.outerHTML).split(cfg.marca).join('<!-- (marco) ')
    partes.push(ruta === null ? html : cfg.marca + ruta + cfg.finMarca + '\n' + html)
    for (var f = 0; f < marcos.length; f++) {
      var d = null
      try { d = marcos[f].contentDocument } catch (e) { d = null }
      if (d && d.documentElement) serializar(d, rutas[f], partes)
      else { sinLeer++; partes.push(cfg.marca + rutas[f] + cfg.finMarca + '\n<!-- grabador: marco de otro origen o vacío; no se ha podido leer -->') }
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
    ' · «' + titulo + '» · marcos sin leer: ' + sinLeer + ' -->\n' + (hayLogin ? cfg.login + '\n' : '')
  var html = cabecera + partes.join('\n')
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
  return { nombre: nombre, html: html, marcosSinLeer: sinLeer }
}`

/** Código JS (sin `javascript:`) que ejecuta el marcador. */
export function codigoBookmarklet(): string {
  // Sin sangrías (ninguna cadena del fuente cruza líneas): el marcador pesa menos.
  return '(function(){var g=' + FUENTE_GRABADOR.replace(/\n\s+/g, '\n') + ';try{g(window,' + JSON.stringify(configGrabador()) +
    ',true)}catch(e){alert("Grabar pantalla ASegura: no se ha podido grabar ("+(e&&e.message)+")")}})();void 0'
}

/** La URL `javascript:` del marcador (para el <a> que se arrastra a favoritos). */
export function urlBookmarklet(): string {
  return 'javascript:' + encodeURIComponent(codigoBookmarklet())
}
