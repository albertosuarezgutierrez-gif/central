// Alarma «una compañía ha dejado de dar precio» (04/11/2026): lectura + envío. Reglas puras en ./tarificador-alarma-reglas.ts.
// Reutiliza la agregación del panel de estado (`leerEstadoTarificador`) y añade los últimos trabajos por pareja (SOLO lectura).
// Un mensaje agrupado al día: el cron corre a una hora fija de Madrid (dos entradas UTC + guarda de hora), sin tabla nueva.
import { tgSendButtons, type Boton } from '@central/core-telegram'
import { prisma } from './tenant'
import { URL_PLATAFORMA_DEFECTO } from './datos-cotizados'
import { leerEstadoTarificador } from './tarificador-estado'
import { alarmaActiva, calcularAlertas, HORA_ALARMA, textoAlarma, type TrabajoReciente } from './tarificador-alarma-reglas'
import { horaEnMadrid } from './tarificador-humo-reglas'

export type ResumenAlarma = {
  estado: 'omitido' | 'ok' | 'telegram_no_enviado'
  omitido?: 'alarma_apagada' | 'fuera_de_hora'
  alertas?: number
  avisado?: boolean
}
type EnviarAlarma = (texto: string, botones: Boton[][]) => Promise<number | null>

export async function avisarCompaniaSinPrecio(
  correduriaId: string,
  env: Record<string, string | undefined> = process.env,
  ahora: Date = new Date(),
  enviar: EnviarAlarma = (t, b) => tgSendButtons(t, b),
): Promise<ResumenAlarma> {
  if (!alarmaActiva(env)) return { estado: 'omitido', omitido: 'alarma_apagada' }
  if (horaEnMadrid(ahora) !== HORA_ALARMA) return { estado: 'omitido', omitido: 'fuera_de_hora' }

  const [panel, trabajos] = await Promise.all([
    leerEstadoTarificador(correduriaId, ahora),
    // Los 6 últimos trabajos de tarificar por pareja (30 días): bastan para la racha de errores y los trabajos de 3 días.
    prisma.$queryRaw<{ compania: string; ramo: string; estado: string; creado_at: Date }[]>`
      select compania, ramo, estado, created_at as creado_at from (
        select t.compania, t.ramo, t.estado, t.created_at,
               row_number() over (partition by t.compania, t.ramo order by t.created_at desc) as n
          from seguros.tarificacion_trabajos t
         where t.correduria_id = ${correduriaId}::uuid and coalesce(t.modo, 'tarificar') = 'tarificar'
           and t.created_at > now() - interval '30 days'
      ) x where n <= 6`,
  ])
  const recientes: TrabajoReciente[] = trabajos.map((t) => ({ compania: t.compania, ramo: t.ramo, estado: t.estado, creadoAt: t.creado_at }))
  const alertas = calcularAlertas(panel.filas, recientes, ahora)
  const texto = textoAlarma(alertas)
  if (!texto) return { estado: 'ok', alertas: 0, avisado: false }

  const base = (env.PLATAFORMA_URL?.trim() || URL_PLATAFORMA_DEFECTO).replace(/\/+$/, '')
  const id = await enviar(texto, [[{ texto: 'Abrir el panel', url: `${base}/correduria/tarificador/resumen` }]]).catch(() => null)
  return { estado: id === null ? 'telegram_no_enviado' : 'ok', alertas: alertas.length, avisado: id !== null }
}
