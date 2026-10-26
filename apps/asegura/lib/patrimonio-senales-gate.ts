// Interruptor de las señales de patrimonio (P16, 26/10/2026): UNA puerta para el cron y el puerto del operador.
//
// 🚨 APAGADO por defecto: solo `PATRIMONIO_SENALES_ACTIVAS=1` enciende (`patrimonioSenalesActivas`). Apagado NO se toca la BD
// —ni para calcular, ni para escribir, ni para LEER la cola—: el ejecutor ni se llama. Sin dependencias (ni Prisma ni red) para
// que el cepo lo pruebe en frío.
import { patrimonioSenalesActivas } from '@central/module-patrimonio'

export type Apagado = { estado: 'apagado' }

export function senalesPatrimonioActivas(): boolean {
  return patrimonioSenalesActivas(process.env.PATRIMONIO_SENALES_ACTIVAS)
}

/** Ejecuta `f` solo con el interruptor encendido; si no, `{estado:'apagado'}` sin haberla llamado. */
export async function soloConInterruptor<T>(f: () => Promise<T>, activo: boolean = senalesPatrimonioActivas()): Promise<T | Apagado> {
  if (!activo) return { estado: 'apagado' }
  return f()
}
