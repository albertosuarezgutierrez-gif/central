// Guardián del guardián de rama. `node --test` (gate en CI vía `pnpm test:guardia`).
//
// EL FALLO QUE PREVIENE (27/08/2026, PR #1787). Reconstruido del reflog:
//
//   12:01  checkout main + reset a origin/main     (tras mergear #1784)
//   12:43  commit «nombres legibles…» -> cefa75bb  ← EN MAIN, no en la rama de trabajo
//          git push -u origin claude/reserva-…     ← empuja la rama VIEJA, no ese commit
//   12:46  PR #1787 abierto con head 8cd68ecd      ← sin el arreglo, y 12 checks en VERDE
//
// La trampa: `git push origin <rama>` empuja la rama NOMBRADA, no HEAD. Y respondió
// «* [new branch]», que se lee como éxito.
//
// Este test fija las dos decisiones del guardián. Importa las funciones REALES de
// scripts/guardian-rama.mjs: reimplementar el parser aquí haría que el test pasara
// mientras el hook falla, que es exactamente lo que no queremos.
//
// El caso que más importa es el ÚLTIMO grupo: la auditoría diaria (carril 1) commitea y
// empuja directa a `main` legítimamente. Un guardián que la bloquee es peor que no tenerlo.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decidirPush, decidirPR, ramasQueEmpuja } from '../scripts/guardian-rama.mjs'

const EN_MAIN = 'main'
const RAMA = 'claude/reserva-enero-barata-utsaam'

test('el comando EXACTO del fallo del PR #1787 se bloquea', () => {
  const d = decidirPush({ comando: `git push -u origin ${RAMA}`, ramaActual: EN_MAIN })
  assert.equal(d.bloquear, true)
  assert.match(d.motivo, /estás en «main»/)
  assert.match(d.motivo, new RegExp(RAMA))
})

test('también encadenado tras un commit, que es como se escribió de verdad', () => {
  const comando = `git add -A && git commit -q -m x && git push -u origin ${RAMA} 2>&1|tail -3`
  assert.equal(decidirPush({ comando, ramaActual: EN_MAIN }).bloquear, true)
})

test('empujar HEAD o la rama en la que estás nunca se bloquea', () => {
  for (const comando of [
    'git push',
    'git push origin',
    'git push -u origin HEAD',
    'git push origin HEAD:refs/heads/otra',
    `git push -u origin ${RAMA}`,
  ]) {
    assert.equal(decidirPush({ comando, ramaActual: RAMA }).bloquear, false, comando)
  }
})

test('borrar una rama o empujar tags no es trabajo de rama: pasa', () => {
  for (const comando of [
    'git push origin --delete claude/vieja',
    'git push origin -d claude/vieja',
    'git push --tags origin',
  ]) {
    assert.equal(decidirPush({ comando, ramaActual: EN_MAIN }).bloquear, false, comando)
  }
})

// 🚨 El guardián SE BLOQUEÓ A SÍ MISMO al ir a commitearse: su mensaje de commit, escrito con
// `git commit -F - <<'MSG'`, cita un `git push origin <rama>` como ejemplo del fallo, y el parser
// leía el texto del heredoc como si fueran comandos. Cualquier commit que MENCIONE un push habría
// disparado el guardián — la clase de ruido por la que se acaban desactivando.
test('el TEXTO dentro de un heredoc no se parsea como comando', () => {
  const comando = [
    "git commit -F - <<'MSG'",
    'guardián de rama: que el trabajo no se quede fuera del PR',
    '',
    'La cronología del fallo, citada dentro del mensaje:',
    '       git push -u origin claude/otra-rama     empuja la rama VIEJA',
    'porque `git push origin <rama>` manda la rama NOMBRADA, no HEAD.',
    'MSG',
    'git log --oneline -1',
  ].join('\n')
  assert.equal(decidirPush({ comando, ramaActual: RAMA }).bloquear, false)
})

test('pero un push REAL después del heredoc sí se ve', () => {
  const comando = ["cat > f <<'EOF'", 'texto cualquiera', 'EOF', 'git push -u origin claude/otra'].join('\n')
  assert.equal(decidirPush({ comando, ramaActual: RAMA }).bloquear, true)
})

// 🚨 Segundo autobloqueo, al ir a empujar el propio guardián: `2>&1` se leía como nombre de rama.
// Las redirecciones y las comillas son ruido de shell, no refspecs.
test('las redirecciones no son nombres de rama', () => {
  for (const comando of [
    'git push -u origin HEAD 2>&1 | tail -3',
    'git push -u origin HEAD 2>/dev/null',
    'git push -u origin HEAD > /tmp/salida.txt',
    'git push -u origin HEAD >> /tmp/salida.txt 2>&1',
    'git push -u origin HEAD &> /tmp/salida.txt',
  ]) {
    assert.equal(decidirPush({ comando, ramaActual: RAMA }).bloquear, false, comando)
  }
})

test('las comillas alrededor de la rama no cuentan', () => {
  assert.equal(decidirPush({ comando: `git push origin "${RAMA}"`, ramaActual: RAMA }).bloquear, false)
  assert.equal(decidirPush({ comando: `git push origin '${RAMA}'`, ramaActual: RAMA }).bloquear, false)
  assert.equal(decidirPush({ comando: 'git push origin "claude/otra"', ramaActual: RAMA }).bloquear, true)
})

test('fail-open: sin rama (HEAD desprendido) o con sustitución de comandos, pasa', () => {
  assert.equal(decidirPush({ comando: `git push origin ${RAMA}`, ramaActual: '' }).bloquear, false)
  assert.equal(decidirPush({ comando: 'git push origin $(git branch --show-current)', ramaActual: EN_MAIN }).bloquear, false)
})

test('el parser entiende refspecs con prefijo, con + y con destino', () => {
  assert.deepEqual(ramasQueEmpuja('git push origin refs/heads/claude/x'), ['claude/x'])
  assert.deepEqual(ramasQueEmpuja('git push origin +claude/x'), ['claude/x'])
  assert.deepEqual(ramasQueEmpuja('git push origin claude/x:refs/heads/claude/x'), ['claude/x'])
  assert.deepEqual(ramasQueEmpuja('git push -o ci.skip origin claude/x'), ['claude/x'], 'flag con valor no debe comerse la rama')
  assert.deepEqual(ramasQueEmpuja('ls -la'), [])
})

test('abrir/mergear un PR con commits que no están en ningún remoto se bloquea', () => {
  const d = decidirPR({ ramasConCommitsSueltos: [{ rama: 'main', commits: ['cefa75bb sivra/eventos: nombres legibles'] }] })
  assert.equal(d.bloquear, true)
  assert.match(d.motivo, /cefa75bb/)
  assert.match(d.motivo, /TRES puntos/, 'debe recordar el diff de tres puntos: el de dos puntos generó una alarma falsa')
})

test('sin commits sueltos, abrir el PR pasa', () => {
  assert.equal(decidirPR({ ramasConCommitsSueltos: [] }).bloquear, false)
  assert.equal(decidirPR({ ramasConCommitsSueltos: [{ rama: 'main', commits: [] }] }).bloquear, false)
})

// 🚨 El caso que no se puede romper: la auditoría diaria auto-aplica a `main` sin PR
// (.claude/commands/auditoria-diaria.md, carril 1). Siempre lo hace ESTANDO en `main`.
test('la auditoría diaria (carril 1: push directo a main desde main) NO se bloquea', () => {
  for (const comando of ['git push -u origin main', 'git push origin main', 'git push origin HEAD']) {
    assert.equal(decidirPush({ comando, ramaActual: EN_MAIN }).bloquear, false, comando)
  }
})

test('pero empujar main desde una rama de trabajo sí se bloquea', () => {
  assert.equal(decidirPush({ comando: 'git push origin main', ramaActual: RAMA }).bloquear, true)
})

// ─── `push` tiene que ser el SUBCOMANDO ──────────────────────────────────────
// Falso positivo real del 01/09/2026: `git stash push -m "forense codeoscopic"`
// se bloqueó como si empujara una rama llamada «codeoscopic», porque el guardián
// buscaba la palabra `push` en cualquier posición. Un cepo que salta donde no
// debe entrena a la gente para rodearlo, así que cuenta como fallo.
test('los subcomandos que contienen «push» no son un push de rama', () => {
  for (const cmd of [
    'git stash push -q -m "forense codeoscopic"',
    'git stash push -m "arreglo rama x"',
    'git worktree push algo',
    'git config alias.push "push -u"',
  ]) {
    assert.deepEqual(ramasQueEmpuja(cmd), [], `no debería ver un push de rama en: ${cmd}`)
  }
})

test('y un push de verdad se sigue detectando, con opciones globales delante', () => {
  assert.deepEqual(ramasQueEmpuja('git push origin claude/x'), ['claude/x'])
  assert.deepEqual(ramasQueEmpuja('git -C /repo push origin claude/x'), ['claude/x'])
  assert.deepEqual(ramasQueEmpuja('git -c user.name=x push origin claude/x'), ['claude/x'])
  assert.deepEqual(ramasQueEmpuja('git --no-pager push origin claude/x'), ['claude/x'])
})
