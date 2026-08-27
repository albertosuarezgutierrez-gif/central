#!/usr/bin/env node
// Guardián de rama — hook `PreToolUse`. Impide que el trabajo de una sesión se quede FUERA
// del PR por haberse commiteado o empujado desde la rama equivocada.
//
// ─── EL FALLO QUE PREVIENE (27/08/2026, PR #1787) ───────────────────────────────────────
// Reconstruido del reflog, no de memoria:
//
//   12:01  checkout main + reset a origin/main        (tras mergear #1784)
//   12:43  commit «nombres legibles…» -> cefa75bb     ← EN MAIN, no en la rama de trabajo
//          git push -u origin claude/reserva-…        ← empuja la RAMA VIEJA (8cd68ecd)
//   12:46  PR #1787 abierto con head 8cd68ecd         ← SIN el arreglo
//
// La trampa está en el push: **`git push origin <rama>` empuja la rama NOMBRADA, no HEAD.**
// Estando en `main`, ese push mandó la rama tal y como estaba —sin el commit recién hecho— y
// respondió `* [new branch]` (el remoto se había borrado al mergear #1784). Ese «[new branch]»
// se lee como éxito y no lo es: el trabajo seguía solo en `main` local.
//
// Después los 12 checks salieron VERDES sobre ese head. Verde no dice que el diff sea el tuyo:
// dice que lo que hay en el head compila y pasa los tests. Aquí lo que había era el PR anterior.
//
// ⚠️ Lo que este guardián NO previene, porque NO llegó a pasar: aquel PR **no** iba a borrar
// nada. Su diff de tres puntos (el que GitHub aplica) era «34 inserciones, 0 borrados», y el
// merge simulado sobre el `main` de aquel momento da diff VACÍO. La alarma de «casi borra el
// botón 👁» salió de leer un diff de DOS puntos (`origin/main..HEAD`), que muestra como
// borrados los commits que `main` tiene y la rama no. Es un artefacto de la forma del diff.
// Queda escrito aquí para que nadie vuelva a perseguir ese fantasma.
//
// ─── LOS DOS CONTROLES ──────────────────────────────────────────────────────────────────
//  1) `git push` que nombra una rama distinta de donde estás  -> BLOQUEA.
//     No rompe la auditoría diaria (carril 1), que empuja `main` ESTANDO en `main`.
//  2) Abrir/mergear un PR con commits locales que no están en NINGÚN remoto -> BLOQUEA.
//     Medido contra el repo el 27/08/2026: 0 falsos positivos hoy, y en el escenario del
//     #1787 marca exactamente `cefa75bb`, el commit que se quedó huérfano.
//
// Decisiones PURAS y separadas del git/stdin para poder testearlas (mismo patrón que
// `autorizaCron` en apps/plataforma/lib/cron-auth.ts). Guardián en test/regression-guardian-rama.test.ts.
//
// FAIL-OPEN: ante cualquier duda (comando no parseable, no es un repo git, HEAD desprendido,
// sustitución de comandos) DEJA PASAR. Un guardián que bloquea por ruido se acaba desactivando.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

// Flags de `git push` que consumen el token siguiente.
const FLAGS_CON_VALOR = new Set(['--repo', '-o', '--push-option', '--receive-pack', '--exec'])
// Flags que hacen el push inofensivo para este control (borrar ramas, tags, espejo).
const FLAGS_PERMISIVAS = new Set(['--delete', '-d', '--all', '--mirror', '--tags', '--prune', '--follow-tags'])
// Redirecciones. Sin esto, `git push -u origin HEAD 2>&1 | tail -3` lee «2>&1» como nombre de rama
// y bloquea — pasó al ir a empujar este mismo guardián.
const REDIRECCION = /^&?\d*(?:>>?|<<?|>&|<&)/
const REDIRECCION_SOLA = /^&?\d*(?:>>?|<<?|>&|<&)$/

/**
 * Quita el CUERPO de los heredocs (`<<EOF` … `EOF`), conservando la línea que los ABRE (ahí sí va
 * el comando real).
 *
 * Sin esto, el TEXTO de un heredoc se parsea como si fueran comandos. No es teórico: este guardián
 * SE BLOQUEÓ A SÍ MISMO al ir a commitearse, porque su propio mensaje de commit —escrito con
 * `git commit -F - <<'MSG'`— explica el fallo citando un `git push origin <rama>` de ejemplo.
 * Cualquier mensaje de commit, documento o script escrito con heredoc que mencione un push habría
 * disparado el guardián, que es justo la clase de ruido por la que se acaban desactivando.
 */
export function quitarHeredocs(comando) {
  const lineas = String(comando ?? '').split('\n')
  const out = []
  let delim = null
  for (const linea of lineas) {
    if (delim !== null) {                                   // dentro del cuerpo: se descarta
      if (linea.trim() === delim) delim = null
      continue
    }
    out.push(linea)
    const m = linea.match(/<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/)
    if (m) delim = m[2]
  }
  return out.join('\n')
}

/** Parte un comando de shell en segmentos ejecutables (`&&`, `||`, `;`, `|`, saltos de línea). */
export function segmentar(comando) {
  return quitarHeredocs(comando).split(/(?:&&|\|\||;|\||\n)/g).map((s) => s.trim()).filter(Boolean)
}

/**
 * ¿Qué ramas empuja este comando? `null` = no se puede saber (fail-open).
 * Devuelve [] si el push no nombra ninguna rama (empuja la actual, que siempre es correcto).
 */
export function ramasQueEmpuja(segmento) {
  // Sustitución de comandos: no se puede resolver estáticamente.
  if (/\$\(|`/.test(segmento)) return null

  const t = segmento.split(/\s+/).filter(Boolean)
  if (t[0] !== 'git') return []
  const i = t.indexOf('push')
  if (i === -1) return []

  const args = t.slice(i + 1)
  let remoto = null
  const refspecs = []
  for (let k = 0; k < args.length; k++) {
    const a = args[k]
    if (a === '--') continue
    if (REDIRECCION.test(a)) {                    // `2>&1`, `>out`, `2>/dev/null`, `<f`…
      if (REDIRECCION_SOLA.test(a)) k++           // operador suelto: se come también su destino
      continue
    }
    if (a.startsWith('-')) {
      if (FLAGS_PERMISIVAS.has(a)) return []      // borrado / tags / --all: no es trabajo de rama
      if (FLAGS_CON_VALOR.has(a)) k++             // consume su valor
      continue
    }
    if (remoto === null) { remoto = a; continue }
    refspecs.push(a)
  }
  if (refspecs.length === 0) return []            // `git push` / `git push origin`: empuja la actual

  const ramas = []
  for (const spec of refspecs) {
    // Las comillas se quitan: `git push origin "claude/x"` es la misma rama que sin ellas, y
    // compararla con comillas contra `git branch --show-current` daría un falso positivo.
    let src = spec.replace(/^['"]|['"]$/g, '').split(':')[0].replace(/^\+/, '')
    if (!src || src === 'HEAD') continue          // HEAD siempre es la rama actual
    if (src.startsWith('refs/tags/')) continue
    src = src.replace(/^refs\/heads\//, '')
    ramas.push(src)
  }
  return ramas
}

/** Decisión PURA: ¿este `git push` manda una rama que no es donde estás? */
export function decidirPush({ comando, ramaActual }) {
  if (!ramaActual) return { bloquear: false }     // HEAD desprendido o sin repo: fail-open
  for (const seg of segmentar(comando)) {
    const ramas = ramasQueEmpuja(seg)
    if (ramas === null) return { bloquear: false }
    for (const r of ramas) {
      if (r !== ramaActual) {
        return {
          bloquear: true,
          motivo:
            `🚨 Guardián de rama: estás en «${ramaActual}» y este comando empuja «${r}».\n\n` +
            `\`git push origin <rama>\` manda la rama NOMBRADA, no lo que acabas de commitear.\n` +
            `Si tu último commit está en «${ramaActual}», este push NO lo lleva — y responderá\n` +
            `«[new branch]» o «Everything up-to-date», que se leen como éxito. Fue el fallo del\n` +
            `PR #1787 (27/08/2026): el PR se abrió sin el arreglo y sus 12 checks salieron verdes.\n\n` +
            `Qué hacer:\n` +
            `  · si el trabajo está donde estás   ->  git push -u origin HEAD\n` +
            `  · si querías trabajar en «${r}»    ->  git checkout «${r}» y lleva ahí el commit\n` +
            `                                          (git cherry-pick <sha>) antes de empujar\n` +
            `Comprueba antes con:  git log --oneline -3 «${ramaActual}» «${r}»`,
        }
      }
    }
  }
  return { bloquear: false }
}

/** Decisión PURA: ¿hay trabajo commiteado que no ha llegado a ningún remoto? */
export function decidirPR({ ramasConCommitsSueltos, accion = 'abrir el PR' }) {
  const sueltas = (ramasConCommitsSueltos ?? []).filter((r) => r.commits?.length)
  if (sueltas.length === 0) return { bloquear: false }
  const detalle = sueltas
    .map((r) => `  · ${r.rama}:\n${r.commits.map((c) => `      ${c}`).join('\n')}`)
    .join('\n')
  return {
    bloquear: true,
    motivo:
      `🚨 Guardián de rama: hay commits locales que NO están en ningún remoto, y vas a ${accion}.\n\n` +
      `${detalle}\n\n` +
      `Un PR solo contiene lo que está EMPUJADO. Si alguno de esos commits es el trabajo de esta\n` +
      `sesión, el PR saldrá sin él y los checks pasarán igual (validan el head, no tu intención).\n\n` +
      `Qué hacer: lleva esos commits a la rama del PR y empújala, o confirma que sobran.\n` +
      `Para ver lo que el PR aplicará de verdad usa TRES puntos:  git diff origin/main...HEAD\n` +
      `(dos puntos, «origin/main..HEAD», muestra como borrados los commits que main tiene y tú no:\n` +
      ` es un artefacto de la forma del diff, no un borrado real).`,
  }
}

// ─── CLI (el hook) ──────────────────────────────────────────────────────────────────────

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
}

/** Ramas locales con commits que no están en ningún remoto. */
export function recogerRamasSueltas() {
  const ramas = git(['for-each-ref', '--format=%(refname:short)', 'refs/heads']).split('\n').filter(Boolean)
  const out = []
  for (const rama of ramas) {
    const commits = git(['log', rama, '--not', '--remotes', '--oneline', '--max-count=20'])
      .split('\n').filter(Boolean)
    if (commits.length) out.push({ rama, commits })
  }
  return out
}

function principal() {
  let entrada = ''
  try { entrada = readFileSync(0, 'utf8') } catch { return 0 }
  let json
  try { json = JSON.parse(entrada) } catch { return 0 }

  const herramienta = json?.tool_name ?? ''
  let decision = { bloquear: false }

  if (herramienta === 'Bash') {
    const comando = json?.tool_input?.command ?? ''
    if (!/\bgit\b/.test(comando) || !/\bpush\b/.test(comando)) return 0
    decision = decidirPush({ comando, ramaActual: git(['branch', '--show-current']) })
  } else if (/create_pull_request$/.test(herramienta) || /merge_pull_request$/.test(herramienta)) {
    const accion = /merge_pull_request$/.test(herramienta) ? 'mergear el PR' : 'abrir el PR'
    decision = decidirPR({ ramasConCommitsSueltos: recogerRamasSueltas(), accion })
  } else {
    return 0
  }

  if (decision.bloquear) { process.stderr.write(decision.motivo + '\n'); return 2 }
  return 0
}

if (process.argv[1] && process.argv[1].endsWith('guardian-rama.mjs')) {
  let codigo = 0
  try { codigo = principal() } catch { codigo = 0 }   // fail-open ante cualquier error
  process.exit(codigo)
}
