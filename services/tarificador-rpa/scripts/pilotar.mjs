#!/usr/bin/env node
// MODO PILOTADO del tarificador RPA (03/11/2026): mandos mínimos por el puerto de operador de asegura.
//
//   ASEGURA_OPERADOR_SECRET=… [ASEGURA_URL=https://central-asegura.vercel.app] node scripts/pilotar.mjs <orden> …
//
//   abrir   <entrada>                      encola una sesión SINTÉTICA (p. ej. pelayo:presupuestos:auto) → trabajoId
//   ver     <trabajoId> [limite]           última(s) pantalla(s): nº, estado, URL, refs con texto/etiqueta y URL FIRMADA (10 min) de la captura
//   pulsar  <trabajoId> <n> <ref> [efecto] efecto: siguiente_pantalla (defecto) | calcular | abrir_seccion | ver_resultado
//   rellenar <trabajoId> <n> <ref> <valor>        texto FICTICIO literal (el worker rechaza NIF/IBAN/tarjeta/correo/teléfono)
//   dato    <trabajoId> <n> <ref> <clave>          clave del catálogo (p. ej. vivienda.codigoPostal): el valor sintético lo pone el worker
//   seleccionar <trabajoId> <n> <ref> <valor>     valor o texto exacto de la opción
//   esperar <trabajoId> <n> [ms]  ·  volver <trabajoId> <n>  ·  fin <trabajoId> <n>
//
// El comando solo se acepta mientras la pantalla `n` ESPERA; el worker lo revalida y lo ejecuta SOLO por la puerta del guard
// (TARIFICAR ≠ EMITIR). El secreto va en la cabecera, nunca en la línea de órdenes ni en la salida. Sin dependencias.

const [orden, ...args] = process.argv.slice(2)
const base = (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/+$/, '')
const secreto = process.env.ASEGURA_OPERADOR_SECRET || ''
if (!/^https:\/\//.test(base)) salir('ASEGURA_URL tiene que ser https')
if (secreto.length < 16) salir('falta ASEGURA_OPERADOR_SECRET')

function salir(m) {
  console.error(m)
  process.exit(1)
}

async function llamar(metodo, ruta, cuerpo) {
  const r = await fetch(`${base}/api/operador/tarificador/${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${secreto}`, 'content-type': 'application/json', 'x-actor': 'agente:pilotar' },
    ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
    signal: AbortSignal.timeout(60_000),
  })
  const j = await r.json().catch(() => ({ estado: 'respuesta_no_json' }))
  return { status: r.status, j }
}

/** Resumen legible de un inventario (refs y descripción corta; el inventario ya va saneado y redactado). */
function resumen(inv) {
  const out = []
  for (const m of inv?.marcos ?? []) {
    for (const e of m.elementos ?? []) {
      const d = [e.etiqueta, e.texto, e.ariaLabel, e.placeholder, e.name].find((x) => typeof x === 'string' && x.trim()) ?? ''
      const op = Array.isArray(e.opciones) && e.opciones.length ? ` [${e.opciones.slice(0, 8).map((o) => o.texto ?? o.valor).join(' | ')}]` : ''
      out.push(`  ${e.ref.padEnd(7)} ${e.tag}${e.type ? `/${e.type}` : ''}${e.deshabilitado ? ' (deshab.)' : ''}  ${String(d).slice(0, 60)}${op}`)
    }
    for (const i of m.importes ?? []) out.push(`  ${i.ref.padEnd(7)} importe ${i.eur}€ ${i.etiqueta ?? ''}`)
  }
  return out.join('\n')
}

const comando = (accion, extra = {}) => ({ accion, ...extra })
const [id, nTxt, ref, x] = args
const n = Number(nTxt)

let res
switch (orden) {
  case 'abrir':
    res = await llamar('POST', 'pilotaje', { entrada: args[0] })
    break
  case 'ver': {
    res = await llamar('GET', `pilotaje/${encodeURIComponent(id)}?limite=${Number(nTxt) || 1}`)
    if (res.status === 200) {
      console.log(`sesión ${id}: ${JSON.stringify(res.j.sesion)}`)
      for (const p of res.j.pasos) {
        console.log(`\n#${p.n} · ${p.estado} · ${p.url ?? ''}`)
        if (p.comando) console.log(`  comando: ${JSON.stringify(p.comando)}`)
        if (p.resultado) console.log(`  resultado: ${JSON.stringify(p.resultado)}`)
        console.log(`  captura: ${p.capturaUrl ?? '(sin captura)'}`)
        console.log(resumen(p.inventario))
      }
      process.exit(0)
    }
    break
  }
  case 'pulsar':
    res = await llamar('POST', `pilotaje/${encodeURIComponent(id)}`, { n, comando: comando('pulsar', { ref, ...(x ? { efecto: x } : {}) }) })
    break
  case 'rellenar':
    res = await llamar('POST', `pilotaje/${encodeURIComponent(id)}`, { n, comando: comando('rellenar', { ref, valor: x }) })
    break
  case 'dato':
    res = await llamar('POST', `pilotaje/${encodeURIComponent(id)}`, { n, comando: comando('rellenar', { ref, dato: x }) })
    break
  case 'seleccionar':
    res = await llamar('POST', `pilotaje/${encodeURIComponent(id)}`, { n, comando: comando('seleccionar', { ref, valor: x }) })
    break
  case 'esperar':
    res = await llamar('POST', `pilotaje/${encodeURIComponent(id)}`, { n, comando: comando('esperar', ref ? { ms: Number(ref) } : {}) })
    break
  case 'volver':
  case 'fin':
    res = await llamar('POST', `pilotaje/${encodeURIComponent(id)}`, { n, comando: comando(orden) })
    break
  default:
    salir('orden: abrir | ver | pulsar | rellenar | dato | seleccionar | esperar | volver | fin')
}
console.log(`HTTP ${res.status} ${JSON.stringify(res.j)}`)
process.exit(res.status >= 200 && res.status < 300 ? 0 : 1)
