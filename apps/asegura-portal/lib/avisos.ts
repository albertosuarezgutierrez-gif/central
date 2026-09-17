/**
 * El catálogo de la campana se MUDÓ a `@central/module-seguros-portal`
 * (15/09/2026): lo comparte ahora `apps/asegura`, que deriva de él los correos
 * de «tienes algo esperándote en tu área de clientes» — dos copias serían dos
 * listas de avisos que se separan sin que nada falle.
 *
 * Esto se queda como re-exportación para que las pantallas de aquí sigan
 * importando `@/lib/avisos`, que es donde su cepo las busca.
 */
export {
  TIPOS_AVISO,
  FUENTES_AVISO,
  HREF_POR_TIPO,
  textoGlobo,
  avisosDe,
  type TipoAviso,
  type Aviso,
  type FuenteAviso,
  type AutorizacionParaAviso,
  type ObligacionParaAviso,
  type PeticionParaAviso,
  type ReparoParaAviso,
  type EntradaAvisos,
  type Avisos,
} from '@central/module-seguros-portal'
