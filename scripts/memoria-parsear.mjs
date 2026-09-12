#!/usr/bin/env node
// Parsea la memoria (docs/CONTEXTO-SESIONES.md + docs/memoria/*.md) en entradas para la búsqueda
// semántica propia (memoria_buscar — sustituto de recall/memories_about de Graphify).
//
// Reutiliza el troceador de scripts/rotar-memoria.mjs (`trocear`): es el mismo criterio ya
// probado que separa entradas (bullet `- **` fechado vs heading `### `, con el caso especial de
// sub-bullets dentro de una entrada `### `) — reimplementarlo aquí divergiría del que usa la
// rotación mensual y las dos lecturas del mismo archivo acabarían discrepando.
//
// Uso: node scripts/memoria-parsear.mjs --out /tmp/memoria.json
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { trocear, esInicioEntrada, ultimaFecha, textoFechaDe } from './rotar-memoria.mjs'
import { gitSha } from './git-sha.mjs'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')

// Tope de caracteres por trozo embebible: generoso bajo el límite de contexto del modelo de
// embeddings (text-embedding-3-small, 8191 tokens ≈ 30.000+ caracteres incluso en el peor caso),
// pero deliberadamente bajo — sin margen no haría falta.
//
// 🐛 Por qué existe (medido 12/09/2026): `trocear` de rotar-memoria.mjs NO separa por `## ` a
// propósito (es un límite ya documentado y probado ahí, para la rotación mensual — no se toca
// aquí). Cuando el mes vivo tiene una racha de encabezados `## ` seguidos, esas "entradas" se
// funden en UNA sola al archivarse, y `docs/memoria/2026-08.md` quedó con un bloque de 40.518
// caracteres mezclando temas sin relación. Mandado tal cual a `grafo_embed_textos`, el modelo
// devuelve HTTP 400 (excede su contexto) — y como el lote entero (hasta 96 filas) se manda en UNA
// llamada, el 400 tumba TAMBIÉN a las ~95 filas sanas del mismo lote, y como el lote se repite
// (mismo `ORDER BY id LIMIT n` con la fila envenenada siempre primera) los 6 reintentos gastan su
// presupuesto entero contra la MISMA fila sin avanzar nunca. Un solo bloque mal troceado basta
// para dejar la búsqueda semántica de la memoria sin ningún embedding.
export const MAX_LEN_TROZO = 8000

// Divide un cuerpo demasiado largo en trozos embebibles. NO reimplementa `trocear`
// (`esInicioEntrada` rechaza `## ` a propósito, ver rotar-memoria.mjs) — actúa DESPUÉS, solo sobre
// lo que de verdad revienta el embedding, con degradación en cascada y sin descartar texto nunca:
// 1) por la cabecera secundaria real que causó el fundido (`## `, línea a línea);
// 2) si un trozo AÚN excede el tope, por párrafo (línea en blanco);
// 3) si un párrafo suelto AÚN excede el tope (caso patológico sin ninguna separación), corte duro.
export function partirGrande(cuerpo, maxLen = MAX_LEN_TROZO) {
  if (cuerpo.length <= maxLen) return [cuerpo]
  const porH2 = cuerpo.split(/\n(?=## )/)
  const piezas = porH2.length > 1 ? porH2 : [cuerpo]
  const trozos = []
  for (const pieza of piezas) {
    if (pieza.length <= maxLen) {
      trozos.push(pieza)
      continue
    }
    const parrafos = pieza.split(/\n\n+/)
    let actual = ''
    for (const p of parrafos) {
      const candidato = actual ? `${actual}\n\n${p}` : p
      if (candidato.length > maxLen && actual) {
        trozos.push(actual)
        actual = p
      } else {
        actual = candidato
      }
    }
    if (actual) trozos.push(actual)
  }
  return trozos.flatMap((t) => {
    if (t.length <= maxLen) return [t]
    const partes = []
    for (let i = 0; i < t.length; i += maxLen) partes.push(t.slice(i, i + maxLen))
    return partes
  })
}

function parsearArchivo(rutaAbs, fuente) {
  const texto = readFileSync(rutaAbs, 'utf8')
  const lineas = texto.split('\n')
  const primeraEntrada = lineas.findIndex(esInicioEntrada)
  if (primeraEntrada === -1) return []
  const entradas = trocear(lineas.slice(primeraEntrada))
  return entradas.flatMap((lineasEntrada) => {
    const cuerpo = lineasEntrada.join('\n').replace(/\n+$/, '')
    // Sin año en la cabecera (p. ej. «(30/06)») no se INVENTA: `clasificar()` de rotar-memoria.mjs
    // sabe inferirlo heredándolo de la entrada de arriba, pero aquí `fecha` es metadato accesorio
    // de búsqueda, no una clave de troceo — mejor NULL ("no se pudo extraer", como dice la
    // columna) que un valor a medias tipo '30/06/' que parece fecha y no lo es.
    const m = ultimaFecha(textoFechaDe(lineasEntrada))
    const fecha = m && m[3] ? `${m[1].padStart(2, '0')}/${m[2]}/${m[3]}` : null
    const hash = createHash('md5').update(cuerpo).digest('hex').slice(0, 16)
    const trozos = partirGrande(cuerpo)
    if (trozos.length === 1) return [{ id: `${fuente}#${hash}`, fuente, fecha, texto: cuerpo }]
    return trozos.map((texto, i) => ({ id: `${fuente}#${hash}-p${i + 1}`, fuente, fecha, texto }))
  })
}

function main() {
  const args = process.argv.slice(2)
  const iOut = args.indexOf('--out')
  const salida = iOut !== -1 ? args[iOut + 1] : null
  if (!salida) { console.error('Uso: node memoria-parsear.mjs --out <ruta.json>'); process.exit(1) }

  const entradas = []
  entradas.push(...parsearArchivo(join(raiz, 'docs/CONTEXTO-SESIONES.md'), 'docs/CONTEXTO-SESIONES.md'))
  const dirMemoria = join(raiz, 'docs/memoria')
  for (const f of readdirSync(dirMemoria).filter((f) => f.endsWith('.md')).sort()) {
    entradas.push(...parsearArchivo(join(dirMemoria, f), `docs/memoria/${f}`))
  }

  // Dos entradas con el mismo id (mismo fuente+texto exacto) se colapsan: no aporta nada
  // embeber el mismo texto dos veces y confundiría el borrado por "no está en este run".
  const porId = new Map()
  for (const e of entradas) porId.set(e.id, e)

  const resultado = { sha: gitSha(process.env, raiz), generado: new Date().toISOString(), entradas: [...porId.values()] }
  writeFileSync(salida, JSON.stringify(resultado))
  console.log(`Memoria parseada: ${resultado.entradas.length} entradas (de ${entradas.length} brutas) → ${salida}`)
}

// Solo ejecuta el CLI si se invoca directamente, no cuando memoria-parsear.test.mjs importa
// las funciones puras de aquí (mismo patrón que rotar-memoria.mjs).
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
