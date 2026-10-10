# Tarificador — matriz (compañía × ramo) y checklist de grabaciones (actualizada 10/10/2026)

> **Prioridad (decisión de Alberto, 10/10/2026): BOT primero; Avant2 solo como respaldo y siempre con OK explícito del coste.**
> Los bots (RPA que entran en el portal de la compañía) son GRATIS: se crearon para ahorrar el coste de Avant2/Codeoscopic
> (0,50 €/cotización). Orden: bot de la compañía → Avant2 (solo si el bot no sirve y Alberto da el OK de coste).

Regla (superada en lo que contradiga la prioridad de arriba): lo que tarifica Codeoscopic/Avant2 se queda allí; robot propio solo donde Codeoscopic NO cubre.
Fuentes: `docs/CODEOSCOPIC-PLAN-RAMOS-2026-09.md` (RC, comercio y comunidades «no existen en la API», confirmado por Codeoscopic 21/09),
`docs/CODEOSCOPIC-PENDIENTES.md` (auto/moto/hogar con Allianz, Generali y Occident), `docs/TARIFICADOR-RPA.md` y
`services/tarificador-rpa/src/adapters/*`. Ramos de oportunidad: `RAMOS_OPORTUNIDAD` (23 valores; aquí los 9 relevantes).

| Ramo | Allianz | Occident (Catalana Occidente) | Generali |
|---|---|---|---|
| Auto | Avant2 + robot: en construcción (`allianz/auto.ts`, `AUTO_ACTIVO=false`, sin registrar; consulta por matrícula → vehículo canónico hecha; falta el formulario de Turismos y el avance a Tarificar; objetivo: bot, hoy Avant2 como respaldo) | Avant2 (respaldo); bot sin grabar: ninguna grabación llega a precio | Avant2 (respaldo); bot sin grabar: ninguna grabación llega a precio |
| Moto | Avant2 + robot: en construcción (`allianz/auto.ts` → `allianzMoto`, mismo estado; lector de primas hecho con la grabación del 09/10; objetivo: bot, hoy Avant2 como respaldo) | Avant2 (respaldo); bot sin grabar | Avant2 (respaldo); bot sin grabar |
| Hogar | objetivo: bot Allianz (grabación incompleta, regrabar Nueva Alta→HOGAR→precio); hoy: Avant2 como respaldo | Avant2 (respaldo); bot sin grabar | Avant2 (respaldo); bot sin grabar |
| Vida riesgo | sin confirmar (el ejemplo oficial lista Allianz Vida-Riesgo; la cuenta real no está medida) | sin confirmar | sin confirmar |
| Salud | sin confirmar | sin confirmar | sin confirmar |
| Decesos | sin confirmar | sin confirmar | sin confirmar |
| Comunidades | robot: activo (`allianz/comunidades.ts`; falta cotización real de punta a punta) | robot: en construcción (`occident/comunidades.ts`, HUECO: rellenar/calcular/leer prima; la grabación del 07/10 llegó con 0 pantallas) | robot: no empezado (sesión manual lista, sin adaptador) |
| Comercio | robot: en construcción (`allianz/comercio.ts`, `COMERCIO_ACTIVO=false`; pasos 1-3 huecos) | robot: no empezado | robot: no empezado |
| RC (pyme/general) | robot: en construcción (`allianz/rc-pyme.ts`, `RC_PYME_ACTIVO=false`; falta Datos básicos) | robot: no empezado (primer objetivo del plan tras comunidades) | robot: no empezado |

Recuento (27 celdas): Avant2 = 9 (2 de ellas con robot propio en construcción: Allianz auto y moto) · robot activo = 1 · robot en construcción = 3 (+2 sobre Avant2) · robot no empezado = 5 · sin confirmar = 9.
Nota (10/10/2026): auto/moto de Allianz tienen como objetivo el bot (prioridad de arriba) y hoy siguen por Avant2 como respaldo; el robot propio existe porque Alberto grabó el flujo y es el banco para el vehículo canónico (`module-tarificacion/src/vehiculo.ts`), reutilizable por otras compañías.
Nota: Avant2 en vida/salud/decesos: la petición existe en código (`peticion-vida/salud/decesos.ts`, sin estrenar) pero qué compañía responde no consta; confirmar con la lista de `GET /insurance-lines/*/products` de la cuenta. Resto de ramos de oportunidad (accidentes, empresas, rc_profesional, dyo, flotas, ciberriesgos...): fuera de alcance, sin confirmar.

## Grabaciones recibidas (07-09/10/2026)

| Grabación | Fecha | Pantallas | Qué trae | Estado |
|---|---|---|---|---|
| Allianz · Moto (048df73c) | 09/10 | 12 | Tarificar con primas, Riesgo municipio y Datos básicos (ya rellenos, solo lectura), Referencia, «Proyecto archivado» (se pulsó Archivar) | mapeada; lector de primas y selectores en `allianz/auto.ts` |
| Allianz · Auto (0896c5a7) | 08/10 | 6 | home + modal «Nueva Alta» (tarjetas de Autos); el formulario quedó en un iframe NO legible | mapeada la entrada; FALTA el formulario |
| Allianz · RC (83761611) | 07/10 | 1 | pantalla de tarifa de RC PYME (ya mapeada el 07/10) | sin novedades: sigue faltando Datos básicos |
| Occident · Comunidad (82246a37) | 07/10 | 0 | vacía | hay que volver a subirla |

Fugas: Moto p07 traía `fechaMatriculacion` sin tapar → el redactor del grabador ahora tapa matrícula/fecha de matriculación/bastidor (`PATRON_CAMPO_PERSONAL`). Resto, limpio.

## Checklist de grabaciones para Alberto (priorizada)

Instrucción común: usar un marcador nuevo del grabador, NO pulsar emitir/aceptar/archivar/proyecto ampliado, y subir el .html en `/correduria/tarificador/grabaciones`.

0. [ ] **Allianz → Auto (Turismos)** — para cerrar `allianz/auto.ts`. Si el formulario sale como «marco sin leer», abrir el iframe `appArea` en su propia pestaña y grabar ahí. Con una matrícula de PRUEBA o la de un vehículo propio:
   (a) Nueva Alta → Autos → Turismos, primera pantalla VACÍA (antes de escribir nada); (b) la misma tras teclear la matrícula y salir del campo (que se vea lo que rellena el portal: marca, modelo, versión, combustible, potencia, fecha de matriculación); (c) si se puede, una matrícula/modelo con VARIAS versiones y el desplegable de versión ABIERTO; (d) Riesgo municipio y Datos básicos EDITABLES (antes de calcular), con los desplegables de sexo, uso y años en la compañía anterior abiertos; (e) la pestaña Tarificar con precios; (f) una pantalla de error (p. ej. sin fecha de carné). NO pulsar Archivar, Emitir ni el botón del pie de Tarificar.
0b. [ ] **Allianz → Moto**: lo mismo que (a), (b), (d) y (f) de Auto (la grabación del 09/10 empezó con todo ya relleno y en solo lectura).
0c. [ ] **Occident → Comunidades**: la grabación del 07/10 llegó con 0 pantallas: volver a subirla (pantallas del punto 1).

1. [ ] Occident → Comunidades (el más cercano a producción; ~46 pólizas Occident en cartera). El formulario está en un iframe de `catalanaaplicaciones.gco.global`: abrir el marco directamente. Pantallas: (a) menú/entrada hasta «nueva tarificación» de Comunidades; (b) formulario de datos del riesgo completo (dirección, m2, año, plantas, ascensor, piscina, capitales); (c) coberturas/opciones; (d) resultado con las primas tras calcular; (e) pantalla de error o bloqueo (p. ej. dejando un campo obligatorio vacío); (f) pantalla de proyecto/PDF si existe (solo ver, sin emitir).
2. [ ] Allianz → RC PYME (app 1430): (a) «Nueva Alta» pestaña Empresas con la tarjeta RC PYME visible en el modal; (b) «Datos básicos» (`td#menu1`: actividad con tabla de códigos, facturación, empleados, límites, ámbito, siniestros); (c) el paso que lleva a Calcular (`#btnRetarifa`); (d) «Proyecto» / IPID (PDF); (e) pantalla de bloqueos. Ya mapeada la de resultado.
3. [ ] Allianz → Comercio / Negocio Plus (app 2038, subramo 0002): (a) Venta > Nueva Alta > Particulares > Negocio Plus; (b) paso 1 actividad; (c) paso 2 local/capitales (continente, contenido, existencias); (d) paso 3 coberturas; (e) variante persona jurídica del paso 4; (f) panel de presupuesto y pantallas de error. No avanzar a «5. Revisión» (puede persistir al tomador).
4. [ ] Occident → RC (general/actividad): entrada, formulario de actividad y límites, resultado, error.
5. [ ] Generali → Comunidades: primero el ALTA de la sesión manual (SMS; pendiente aplicar `2026-10-07e_tarificador_sesiones.sql` y el fly secret `TARIFICADOR_SESION_KEY`); luego entrada, formulario, resultado, error.
6. [ ] Occident → Comercio. 7. [ ] Generali → RC. 8. [ ] Generali → Comercio (mismas pantallas que el punto de su ramo en otra compañía).
9. [ ] Sin grabación, a confirmar: pedir a Codeoscopic/Manuel la lista de productos de vida, salud y decesos por compañía antes de decidir si hace falta robot.
