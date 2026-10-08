import { crearRegistro } from '@central/module-tarificacion'
import type { AdaptadorPortal } from '../adaptador.ts'
import { allianzComunidades } from './allianz/comunidades.ts'

/** Los adaptadores que trae compilados esta imagen. Uno nuevo se registra AQUÍ. */
export const adaptadores = crearRegistro<AdaptadorPortal>()
adaptadores.registrar(allianzComunidades)
