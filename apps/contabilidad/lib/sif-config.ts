// Configuración NO secreta del productor del SIF, leída de variables de entorno `SIF_*` (nombres, no valores). Lo que falte queda `null` y la pantalla lo dice.
import { configSifDesdeEntorno, type ConfiguracionSif } from '@central/module-contabilidad'

export const VARIABLES_SIF = [
  'SIF_PRODUCTOR_RAZON_SOCIAL', 'SIF_PRODUCTOR_NIF', 'SIF_PRODUCTOR_DOMICILIO', 'SIF_PRODUCTOR_EMAIL', 'SIF_SISTEMA_NOMBRE', 'SIF_SISTEMA_ID',
  'SIF_SISTEMA_VERSION', 'SIF_SOLO_VERIFACTU', 'SIF_MULTIUSUARIO', 'SIF_LUGAR_DECLARACION',
] as const

export const configSif = (env: Readonly<Record<string, string | undefined>> = process.env): ConfiguracionSif => configSifDesdeEntorno(env)
