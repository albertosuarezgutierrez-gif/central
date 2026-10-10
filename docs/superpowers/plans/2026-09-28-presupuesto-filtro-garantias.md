# Presupuesto con todos los precios + filtro por garantías (28/09/2026)

Dictado de Alberto: «no puedes mandarle una propuesta con dos precios sin sentido». Caso: moto de Manuel,
31 precios de 5 compañías → el presupuesto llevó 2 (Allianz), por `elegirPortada` (equivalente / más
barata / mejor cubierta) sin póliza actual.

Decisiones de Alberto (28/09): el cliente ve **todo + recomendadas arriba** (el corredor puede ocultar
antes de enviar) · el filtro va en **la parrilla del corredor y en el portal a la vez** · ramos **auto,
moto y hogar**. Botón «Comparar con IA» sobre las que elija de la lista completa.

## Entregas
1. **PR1 — datos y lógica pura.** `catalogo-garantias.ts` + `filtro-garantias.ts` en `@central/module-seguros`
   (clasificador determinista; lo no reconocido = `no_consta`, nunca `no`). Migración
   `tarificacion_precios.{oferta_id, coberturas, garantias}`; `guardarCotizacion` guarda `oferta_id`;
   `completarCoberturasTarificacion` (GET coverages por oferta, gratis, concurrencia 5, tope 15 s,
   idempotente) disparado con `after()` en las rutas de tarificar; red de seguridad al preparar; backfill.
2. **PR2 — el presupuesto congela todas las opciones.** `presupuesto_opcion.{garantias, oculta_at}`;
   portada = `papeles<>'{}'`; `ocultar` en el POST/PATCH; `oculta_at is null` en aceptación, IA, listado,
   envío; IPID deduplicado.
3. **PR3 — portal.** `TodasLasOpciones` (interruptores, lista paginada, casilla comparar) + `CompararIA`
   con preselección.
4. **PR4 — plataforma.** `FiltroGarantias` en las parrillas (retarificar, moto/auto/hogar nuevo) +
   ocultar antes de preparar.

## Reglas que no se negocian
- Una garantía sin dato es «no consta», no «no incluye». Con filtro activo, las opciones sin dato van a
  un bloque aparte declarado, no desaparecen.
- El correo y el WhatsApp siguen sin precios.
- Lo ocultado queda en el evento `preparado` (trazabilidad IDD).
