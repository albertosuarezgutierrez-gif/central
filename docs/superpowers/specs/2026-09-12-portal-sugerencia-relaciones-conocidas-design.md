# Portal del cliente — sugerir relaciones YA CONOCIDAS (familia y empresa) (12/09/2026)

**Petición de Alberto:** que al registrarse alguien que ya tiene relaciones cargadas en la cartera
(un hijo que ya figura como tal de su madre, un dueño de su empresa) el portal se las **sugiera** y
pueda pedir acceso sin escribir ningún correo — «como una red social, pero pidiendo permiso», nunca
un buscador de personas.

**Verificado contra la BD real (12/09/2026), no supuesto:** Manuel Antonio Piña Franco
(`94fa2f31-…`), su madre Pilar Franco Ruz (`650cccdb-…`) y su empresa GLOBAL 2 INSTALACIONES
TÉCNICAS (`2604512a-…`, `tipo_persona='juridica'`) son **tres `clienteId` distintos, sin
solapamiento de pólizas**, y `seguros.cliente_relaciones` **ya tiene** las cuatro filas del vínculo
real (Hijo/a↔Padre/Madre, Empresa↔Dueño) — cargadas del volcado, con `puede_ver_polizas = false` en
las cuatro: el dato existe desde hace tiempo y **nunca se ha traducido en ningún permiso**.

## Lo que ya existe y NO hay que reconstruir

- `packages/module-seguros/src/relaciones.ts` — `relacionesDeFicha()`, `permiteAutorizar()`,
  `clientesVisiblesPara()`. Ya excluye `Sin vínculo` de cualquier autorización.
- `seguros.portal_peticion_acceso` + `lib/peticiones.ts` — pedir acceso a un `clienteId` resuelto,
  con respuesta colapsada (`registrada`) para no convertir el portal en oráculo de la cartera.
- `seguros.portal_invitacion` (pestaña «Contactos») — el titular YA vinculado invita a otro por
  correo, ofreciendo el vocabulario de `TIPOS_RELACION`.
- El rol `prisma_asegura_portal` **ya tiene `SELECT`** sobre `cliente_relaciones` (revocado solo
  `puede_ver_polizas`, por el fallo del 03/09 — ver ese apartado del CLAUDE.md de esta app).

**El hueco es uno solo:** nada, hoy, cruza la ficha vinculada de una identidad contra
`cliente_relaciones` para **sugerirle** pedir acceso. `candidatos` de `autorizaciones.ts` ya lee esa
tabla, pero solo para el sentido «invitar» (yo ofrezco), no para «se me sugiere pedir».

## Decisiones

1. **Se sugiere, nunca se concede.** La sugerencia sale de `cliente_relaciones` filtrada por
   `permiteAutorizar(tipo)` y por `!puedeVer` (relación registrada, hoy sin autorización). El
   `puede_ver_polizas` de esa tabla **sigue sin ser un mecanismo de acceso** (decisión ya tomada el
   03/09/2026): aquí solo alimenta una tarjeta con un botón «Pedir acceso a los seguros de X».
2. **La petición no pide escribir ningún correo.** Nueva función
   `peticionDesdeRelacion(solicitanteIdentidadId, relacionadoClienteId)` en `lib/peticiones.ts`: ya
   se conoce el `clienteId` exacto por la relación, así que arma
   `destinatario_cliente_id = relacionadoClienteId` y
   `destinatario_email_hash = clientes.email_lookup_hash` de esa misma ficha (columna que el rol ya
   lee). Misma tabla `portal_peticion_acceso`, mismo índice de «ya pendiente», misma respuesta
   colapsada — cero tablas nuevas. Si esa ficha no tiene `email_lookup_hash` (sin correo cargado),
   se cae al flujo manual existente («pide acceso escribiendo el correo»).
3. **Solo se cruza la ficha PROPIA de quien pregunta, nunca una búsqueda.** La consulta a
   `cliente_relaciones` va siempre `WHERE cliente_a_id = :miClienteId OR cliente_b_id =
   :miClienteId`, con `:miClienteId` salido de `portal_vinculo` de la identidad en sesión — igual
   que ya exige el guardián de aislamiento para toda consulta de cartera. No hay ruta que reciba un
   nombre o un id ajeno.
4. **Familia y empresa se tratan con el MISMO mecanismo.** GLOBAL 2 es un `Cliente` con su propio
   `clienteId`: pedir acceso «a GLOBAL 2» abre únicamente sus 8 pólizas, nunca las personales de
   Manuel Antonio ni las de su madre — no hace falta ningún campo de "alcance societario" nuevo.
5. **Pieza nueva de UI:** una sección en `/autorizaciones` (Contactos) o en la propia `/boveda`,
   «Relaciones que ya tenemos registradas» — una tarjeta por relación con `permiteAutorizar(tipo) &&
   !puedeVer`, nombre + tipo (`relacionesDeFicha().tipo`) y el botón de pedir. Reusa
   `RegistrarPeticion`/pantalla de «Contactos» ya existente para el estado pendiente/concedida.

## Representación societaria — decisión de Alberto (12/09/2026)

**«Dueño y Administración, empieza a implementar.»** La figura que puede actuar en nombre de una
empresa es exactamente el vínculo YA existente en `cliente_relaciones` con tipo `Dueño` o
`Administración` hacia la ficha de la empresa — dato que Alberto ya mantiene desde `/correduria` →
Contactos (así está cargado, p. ej., Manuel Antonio → GLOBAL 2). No hace falta ninguna tabla ni
columna nueva, ni que la identidad tenga un `portal_vinculo` propio a la ficha de la empresa.

- Cuando la identidad de una persona (vinculada a SU ficha personal) tiene una relación `Dueño` o
  `Administración` hacia una empresa, el portal le deja **actuar como apoderado de esa empresa**:
  invitar (`portal_invitacion`) o autorizar (`portal_autorizacion`) con
  `otorganteClienteId = <empresa>`, en vez de sobre su propia ficha.
- **Sigue sin ser `APODERAMIENTO` de verdad** (`autorizacion.ts`): el alcance que puede conceder en
  nombre de la empresa es el mismo `ver`/`ver_economico` de siempre — nunca `partes`/`documentos`,
  que exige el poder real, no un dato de relación en la BD.
- Los demás tipos del vocabulario (`Empleado/a`, `Socio/a`, `Accionista`) **no** dan esta capacidad:
  gestionan el negocio o son dueños de participaciones, pero no son la figura que decide a quién se
  le enseña qué. Si el día de mañana hace falta ampliar el conjunto, es una fila más en esta lista,
  no un cambio de mecanismo.

## Piezas a tocar (fase acotada, solo puntos 1-5)

- `packages/module-seguros-portal/src/` — nuevo módulo puro `sugerencia-relacion.ts`:
  `relacionesSugeribles(filas, clienteId)` = `relacionesDeFicha().filter(r => permiteAutorizar(r.tipo)
  && !r.puedeVer)`.
- `apps/asegura-portal/lib/peticiones.ts` — `peticionDesdeRelacion()`.
- `apps/asegura-portal/app/(portal)/autorizaciones/` — tarjeta de sugerencia + botón.
- Cepos: `sugerencia-relacion.test.ts` (puro) + ampliar
  `test/regression-portal-peticion-acceso.test.ts` con el camino sin email.
