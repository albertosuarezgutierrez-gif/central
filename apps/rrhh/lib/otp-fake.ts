// Repo de códigos EN MEMORIA (solo tests) con la semántica atómica del SQL de `acceso-email-repo.ts`.
// No lleva `.test.` en el nombre para poder importarlo desde varios tests.
import type { OtpFila, RepoOtp } from './acceso-email'

export type FilaFake = OtpFila & { email_hash: string; ip: string }

export function fakeOtp(inicio = new Date()) {
  const filas: FilaFake[] = []
  let n = 0
  let reloj = new Date(inicio)
  const repo: RepoOtp = {
    async contarRecientesPorEmail(h, desde) { return filas.filter(f => f.email_hash === h && f.creada_at >= desde).length },
    async contarRecientesPorIp(ip, desde) { return filas.filter(f => f.ip === ip && f.creada_at >= desde).length },
    async crearOtp(f) { filas.push({ id: `otp-${++n}`, ...f, creada_at: new Date(reloj), intentos: 0, usado_at: null }) },
    async ultimoOtp(h) {
      const f = filas.filter(x => x.email_hash === h).sort((a, b) => +b.creada_at - +a.creada_at || b.id.localeCompare(a.id))[0]
      return f ? { ...f } : null
    },
    async reservarIntento(id, max) {
      const f = filas.find(x => x.id === id && x.usado_at === null && x.intentos < max)
      if (!f) return false
      f.intentos++; return true
    },
    async gastarOtp(id) {
      const f = filas.find(x => x.id === id && x.usado_at === null)
      if (!f) return false
      f.usado_at = new Date(reloj); return true
    },
  }
  return { repo, filas, ahora: () => new Date(reloj), avanzar: (ms: number) => { reloj = new Date(+reloj + ms) } }
}
