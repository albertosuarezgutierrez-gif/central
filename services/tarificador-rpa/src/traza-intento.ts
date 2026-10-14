// Traza de UN intento del runner (14/10/2026). Congela lo que un adaptador sigue haciendo en segundo plano tras un
// timeout (un `ctx.paso` tardío ya no añade pasos) y cubre al adaptador que no instrumenta pasos con `login` + `formulario`.
import type { NombrePasoTraza, Traza } from '@central/module-tarificacion'

export type TrazaIntento = {
  /** El `ctx.paso` del adaptador: igual que el de la traza, pero NO anota si el intento ya está cerrado. */
  paso: <T>(nombre: NombrePasoTraza, fn: () => Promise<T>) => Promise<T>
  /** `ctx.trasLogin` pasó: fin del paso `login` del cubrimiento grueso. */
  marcarLogin: () => void
  /** Cierra el intento: desde aquí nada nuevo entra en la traza. Idempotente. */
  cerrar: () => void
  /** Si el adaptador no dejó pasos, anota `login` + `formulario` (o uno solo). `codigo` = código FINAL del intento. Idempotente. */
  cubrir: (resultado: { ok: true } | { ok: false; codigo: string }) => void
}

export function crearTrazaIntento(base: Traza, ahora: () => number = Date.now): TrazaIntento {
  const inicio = ahora()
  let cerrado = false
  let cubierto = false
  let anotados = 0
  let finLogin: number | null = null
  return {
    async paso(nombre, fn) {
      const t0 = ahora()
      try {
        const r = await fn()
        if (!cerrado) { base.anotar(nombre, t0); anotados++ }
        return r
      } catch (e) {
        if (!cerrado) { base.anotar(nombre, t0, { e }); anotados++ }
        throw e
      }
    },
    marcarLogin: () => { if (finLogin === null) finLogin = ahora() },
    cerrar: () => { cerrado = true },
    cubrir(res) {
      cerrado = true
      if (cubierto || anotados > 0) { cubierto = true; return }
      cubierto = true
      const fin = ahora()
      const err = res.ok ? undefined : { e: null, codigo: res.codigo }
      if (finLogin !== null) {
        base.anotar('login', inicio, undefined, finLogin)
        base.anotar('formulario', finLogin, err, fin)
      } else if (err) base.anotar('login', inicio, err, fin) // falló sin llegar a pasar el login
      else base.anotar('formulario', inicio, undefined, fin)
    },
  }
}
