# Prompts para Claude Chrome — cierre del calendario de House Sevillana (PR #1500)

> Lo que queda del calendario **no se puede hacer desde una sesión de Claude Code**: el proxy de egress
> de este entorno bloquea `*.smoobu.com`, los `*.vercel.app` de preview y las APIs de mapas. Todo lo de
> abajo son comprobaciones de navegador. Copia cada bloque tal cual en Claude Chrome.
>
> **Antes de mirar nada:** el widget llama a `https://plataforma-ten-flame.vercel.app/api/publico/disponibilidad`,
> que es **producción** de plataforma — y ese endpoint **todavía no está desplegado** (vive en la rama del
> PR #1500, sin mergear). Así que hoy la preview de la landing enseña el **aviso de error**, no la rejilla
> con datos. No está roto: es el camino degradado. De hecho sirve para validarlo (prueba 2A).
> Cuando el PR se mergee y plataforma despliegue, la rejilla se llena sola.

---

## 1. El deep link del motor de Smoobu (lo único sin verificar del PR)

```
Abre esta URL en una pestaña nueva:

https://booking.smoobu.com/yourothercity?apartmentId=352007&arrivalDate=13/09/2026&departureDate=16/09/2026&adults=6&children=0&loadForCurrentDate=true

Dime SOLO esto:
1. ¿El motor abre con las fechas 13 y 16 de septiembre de 2026 ya seleccionadas, o abre vacío/en el mes actual?
2. Si aparecen fechas pero son OTRAS (por ejemplo 9 de diciembre, que sería leer 13/09 como mm/dd), dímelo con la fecha exacta que muestre.
3. Repite con esta variante en formato ISO y compara cuál de las dos acierta:
   https://booking.smoobu.com/yourothercity?apartmentId=352007&arrivalDate=2026-09-13&departureDate=2026-09-16&adults=6&children=0&loadForCurrentDate=true

Contexto: 13→16 de septiembre de 2026 son noches LIBRES en House Sevillana (comprobado en la BD el 20/08/2026),
así que el motor debería poder marcarlas. No reserves nada ni rellenes datos personales.
```

**Por qué importa:** el calendario abre el motor con la fecha que el huésped pulsa. La evidencia de que el
formato es `dd/mm/yyyy` (y no ISO, que es lo que usa la API de Smoobu con esos mismos nombres de campo)
viene de dos repos públicos con cuentas distintas, no de una prueba propia. Si la respuesta es «abre
vacío», se quitan los parámetros y el botón se queda como está hoy.

---

## 2. La preview de la landing con el calendario

URL de la preview: **https://house-sevillana-landing-git-cl-956d92-pisos-turisticos-projects.vercel.app**

### 2A. El camino de error (hoy es lo que se ve)

```
Abre https://house-sevillana-landing-git-cl-956d92-pisos-turisticos-projects.vercel.app y baja hasta
la sección del calendario, justo encima de "Reserva directa".

Dime:
1. ¿Qué mensaje sale? Debería avisar de que la disponibilidad no se ha podido cargar y ofrecer salida al motor de reservas.
2. ¿Se ve alguna rejilla de días VACÍA o en blanco? (Eso sería un fallo: una rejilla sin marcar se lee como "todo libre".)
3. Hazme una captura de esa sección.
```

### 2B. Móvil, 320 px

```
En la misma página, abre DevTools (F12) → icono de móvil → pon el ancho a 320 px.
Baja al calendario y dime:
1. ¿Se sale algo del ancho? ¿Hay scroll horizontal en TODA la página (no vale que lo tenga solo el calendario)?
2. ¿Las flechas de mes y las celdas se pueden pulsar con el dedo (mínimo ~44 px)?
3. Captura a 320 px.
```

### 2C. Los cuatro estados y las tres lenguas

```
Repite en /en y en /it de esa misma preview.
1. ¿Queda algún texto del calendario en castellano? (nombres de mes, días de la semana, leyenda, "actualizado el…")
2. En la leyenda deben distinguirse cuatro estados SIN mirar el color: libre (relleno macizo), ocupada
   (rayada y con el número tachado), sin dato (hueca, borde de puntos, interrogación) y pasada (sin caja).
   Ponme una captura de la leyenda de cada idioma.
```

---

## 3. Minutos a pie desde la casa (pendiente viejo de `/barrio`)

```
En Google Maps, calcula el tiempo ANDANDO desde "Calle Socorro 24, 41003 Sevilla" hasta:
- Basílica de la Macarena
- Muralla de la Macarena
- Mercado de la Feria
- Alameda de Hércules
- Catedral de Sevilla
- Setas de Sevilla (Metropol Parasol)

Dame los minutos de cada uno tal como los dé Maps, sin redondear a tu gusto.
```

**Por qué importa:** `/barrio` perdió esos minutos porque los que había salían de suponer la casa dentro
de la Macarena, y la casa está en San Julián. La regla es «mejor sin número que con el equivocado», así
que solo vuelven cuando salgan de la dirección real.

---

## 4. Mascotas: Booking está mal, hay que corregirlo allí

Comprobado el 20/08/2026 con el conector de Booking: la ficha **2039943 · «HOUSE SEVILLANA 6 habitaciones»**
(Calle Socorro 24, 8,6/10 con 51 reseñas) publica **«Admite mascotas»** entre sus servicios. La landing dice
lo contrario, dos veces: en el FAQ visible y dentro del JSON-LD.

**Decidido por Alberto el 20/08/2026: NO se admiten mascotas.** La web está bien y no se toca; el error está
en Booking, que anuncia algo que la casa no ofrece — y eso llega como reseña mala, no como cancelación.

```
Entra en la extranet de Booking (admin.booking.com), alojamiento House Sevillana (ID 2039943),
y quita "Admite mascotas" de los servicios / normas de la casa: la casa NO admite mascotas.

Antes de guardar, enséñame una captura de la pantalla con el cambio, para confirmar que es el
alojamiento correcto (Calle Socorro 24) y que no toco nada más.
Ojo: House Sevillana NO es Bustos Tavera 22 — esa es la dirección de Luxury Busto y Busto Reform,
que son otros dos pisos y tienen sus propias fichas.
```

---

## 5. Fuera del navegador: la skill `seo-house-sevillana`

Sigue atribuyendo a House Sevillana la dirección de **Bustos Tavera 22** (que son Luxury Busto y Busto Reform)
y el ID de Booking **4771238**, que es el de Busto Reform — el de House Sevillana es **2039943**, confirmado
hoy contra la ficha real. Esa skill vive fuera del repo (`/root/.claude/skills/synced/`), así que la corrección
es tuya, en tu máquina. El parche exacto, listo para pegar, está en `docs/PARCHE-skill-seo-house-sevillana.md`.
