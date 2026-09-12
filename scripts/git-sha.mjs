// SHA con el que se estampan el mapa de funciones (mapa_arquitectura) y el grafo de código
// (grafo_nodos/grafo_aristas). UNA regla para los dos: en CI manda GITHUB_SHA — el commit de main
// que disparó el run — porque auditoria.yml commitea la radiografía en una rama ANTES de inyectar
// el grafo y `git rev-parse HEAD` deja de ser main (medido el 12/09/2026: grafo con ea311fe, main en
// 5bf8913, y la comprobación «sha del grafo = origin/main» fallando siempre por un commit).
import { execSync } from 'node:child_process'

const ejecutarHead = (root) =>
  execSync('git rev-parse HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()

/** @param {NodeJS.ProcessEnv} env  @param {string} root  @param {(root: string) => string} exec inyectable en tests */
export function gitSha(env = process.env, root = process.cwd(), exec = ejecutarHead) {
  if (env.GITHUB_SHA) return env.GITHUB_SHA
  try { return exec(root) } catch { return '' }
}
