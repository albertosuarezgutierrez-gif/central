# Tarificador — matriz (compañía × ramo) y checklist de grabaciones (08/10/2026)

Regla: lo que tarifica Codeoscopic/Avant2 se queda allí; robot propio solo donde Codeoscopic NO cubre.
Fuentes: `docs/CODEOSCOPIC-PLAN-RAMOS-2026-09.md` (RC, comercio y comunidades «no existen en la API», confirmado por Codeoscopic 21/09),
`docs/CODEOSCOPIC-PENDIENTES.md` (auto/moto/hogar con Allianz, Generali y Occident), `docs/TARIFICADOR-RPA.md` y
`services/tarificador-rpa/src/adapters/*`. Ramos de oportunidad: `RAMOS_OPORTUNIDAD` (23 valores; aquí los 9 relevantes).

| Ramo | Allianz | Occident (Catalana Occidente) | Generali |
|---|---|---|---|
| Auto | Avant2 | Avant2 | Avant2 |
| Moto | Avant2 | Avant2 | Avant2 |
| Hogar | Avant2 | Avant2 | Avant2 |
| Vida riesgo | sin confirmar (el ejemplo oficial lista Allianz Vida-Riesgo; la cuenta real no está medida) | sin confirmar | sin confirmar |
| Salud | sin confirmar | sin confirmar | sin confirmar |
| Decesos | sin confirmar | sin confirmar | sin confirmar |
| Comunidades | robot: activo (`allianz/comunidades.ts`; falta cotización real de punta a punta) | robot: en construcción (`occident/comunidades.ts`, HUECO: rellenar/calcular/leer prima) | robot: no empezado (sesión manual lista, sin adaptador) |
| Comercio | robot: en construcción (`allianz/comercio.ts`, `COMERCIO_ACTIVO=false`; pasos 1-3 huecos) | robot: no empezado | robot: no empezado |
| RC (pyme/general) | robot: en construcción (`allianz/rc-pyme.ts`, `RC_PYME_ACTIVO=false`; falta Datos básicos) | robot: no empezado (primer objetivo del plan tras comunidades) | robot: no empezado |

Recuento (27 celdas): Avant2 = 9 · robot activo = 1 · robot en construcción = 3 · robot no empezado = 5 · sin confirmar = 9.
Nota: Avant2 en vida/salud/decesos: la petición existe en código (`peticion-vida/salud/decesos.ts`, sin estrenar) pero qué compañía responde no consta; confirmar con la lista de `GET /insurance-lines/*/products` de la cuenta. Resto de ramos de oportunidad (accidentes, empresas, rc_profesional, dyo, flotas, ciberriesgos...): fuera de alcance, sin confirmar.

## Checklist de grabaciones para Alberto (priorizada)

Instrucción común: usar un marcador nuevo del grabador, NO pulsar emitir/aceptar/archivar/proyecto ampliado, y subir el .html en `/correduria/tarificador/grabaciones`.

1. [ ] Occident → Comunidades (el más cercano a producción; ~46 pólizas Occident en cartera). El formulario está en un iframe de `catalanaaplicaciones.gco.global`: abrir el marco directamente. Pantallas: (a) menú/entrada hasta «nueva tarificación» de Comunidades; (b) formulario de datos del riesgo completo (dirección, m2, año, plantas, ascensor, piscina, capitales); (c) coberturas/opciones; (d) resultado con las primas tras calcular; (e) pantalla de error o bloqueo (p. ej. dejando un campo obligatorio vacío); (f) pantalla de proyecto/PDF si existe (solo ver, sin emitir).
2. [ ] Allianz → RC PYME (app 1430): (a) «Nueva Alta» pestaña Empresas con la tarjeta RC PYME visible en el modal; (b) «Datos básicos» (`td#menu1`: actividad con tabla de códigos, facturación, empleados, límites, ámbito, siniestros); (c) el paso que lleva a Calcular (`#btnRetarifa`); (d) «Proyecto» / IPID (PDF); (e) pantalla de bloqueos. Ya mapeada la de resultado.
3. [ ] Allianz → Comercio / Negocio Plus (app 2038, subramo 0002): (a) Venta > Nueva Alta > Particulares > Negocio Plus; (b) paso 1 actividad; (c) paso 2 local/capitales (continente, contenido, existencias); (d) paso 3 coberturas; (e) variante persona jurídica del paso 4; (f) panel de presupuesto y pantallas de error. No avanzar a «5. Revisión» (puede persistir al tomador).
4. [ ] Occident → RC (general/actividad): entrada, formulario de actividad y límites, resultado, error.
5. [ ] Generali → Comunidades: primero el ALTA de la sesión manual (SMS; pendiente aplicar `2026-10-07e_tarificador_sesiones.sql` y el fly secret `TARIFICADOR_SESION_KEY`); luego entrada, formulario, resultado, error.
6. [ ] Occident → Comercio. 7. [ ] Generali → RC. 8. [ ] Generali → Comercio (mismas pantallas que el punto de su ramo en otra compañía).
9. [ ] Sin grabación, a confirmar: pedir a Codeoscopic/Manuel la lista de productos de vida, salud y decesos por compañía antes de decidir si hace falta robot.
