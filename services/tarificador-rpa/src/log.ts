// Log del worker: TODA línea pasa por el redactor (credenciales CRED_*, el Bearer del worker y
// cualquier `password=`/`Authorization: Bearer` aunque no se conozca su valor). Va a stdout, que Fly
// recoge: nada de lo que se escribe aquí puede llevar un secreto.

import { crearRedactor, secretosDelEntorno } from '@central/module-tarificacion'

export type Log = (mensaje: string, datos?: Record<string, unknown>) => void

export function crearLog(env: Record<string, string | undefined>, jobId: string | null): { log: Log; redactar: (t: string) => string } {
  const redactar = crearRedactor(secretosDelEntorno(env))
  const log: Log = (mensaje, datos) => {
    const linea = JSON.stringify({ t: new Date().toISOString(), job: jobId, msg: mensaje, ...(datos ?? {}) })
    process.stdout.write(redactar(linea) + '\n')
  }
  return { log, redactar }
}
