# Parche para la skill sincronizada `seo-house-sevillana`

> **Por qué existe este fichero.** La skill vive FUERA del repo
> (`/root/.claude/skills/synced/seo-house-sevillana/`, sin git), así que ninguna sesión puede
> corregirla ni versionarla: **la tiene que editar Alberto en su cuenta de Claude**. Aquí queda
> el parche exacto —fichero, línea, valor viejo y valor bueno— para que sea copiar y pegar.
>
> Fuente de los datos buenos: el **conector de Booking.com** (consultado el 19/08/2026) y la
> confirmación de Alberto. Ver `apps/housesevillana/CLAUDE.md`, que es el que manda mientras
> esto siga sin arreglarse.
>
> Cuando esté aplicado, **borra este fichero** y quita la fila de `docs/FUENTES-DE-VERDAD.md`
> y la de `docs/SKILLS.md`.

## El fallo, en una frase

La skill no tiene un dato suelto mal: tiene **la ficha de otro piso**. Le asigna a House
Sevillana el **ID de Booking `4771238`, que es el de Busto Reform**, y con él arrastra su
dirección (Bustos Tavera 22) y sus coordenadas. De ahí salen los siete sitios de abajo.

Lo caro son los **dos JSON-LD**: si ese schema se publica, Google recibe una dirección falsa
para el negocio y, encima, la de dos competidores propios (Luxury Busto y Busto Reform) en la
misma búsqueda local de Sevilla.

## Datos buenos

| Campo | Valor correcto | Valor que tiene la skill |
|---|---|---|
| ID Booking | **2039943** (`hotel/es/house-sevillana.html`) | `4771238` (= Busto Reform) |
| Dirección | **Calle Socorro 24, 41003 Sevilla** | Calle Bustos Tavera 22 |
| Barrio | **San Julián**, distrito Casco Antiguo | (correcto, pero mezclado) |
| Coordenadas | **37.395904, -5.987431** | 37.3936, -5.9886 |
| Nota Booking | **8,6/10 con 51 reseñas** (19/08/2026) | — |

## Los siete cambios

**1. `references/property-data.md:15`**
```diff
-- **ID Booking**: 4771238
+- **ID Booking**: 2039943   (https://www.booking.com/hotel/es/house-sevillana.html)
```

**2. `references/property-data.md:19`**
```diff
-- **Dirección**: Calle Bustos Tavera 22, 41003 Sevilla, España
+- **Dirección**: Calle Socorro 24, 41003 Sevilla, España
```

**3. `references/property-data.md:21`**
```diff
-- **Coordenadas aproximadas**: 37.3936° N, -5.9886° W (verificar con Maps al generar JSON-LD)
+- **Coordenadas**: 37.395904° N, -5.987431° W (fuente: ficha de Booking, 19/08/2026)
```

**4. `references/technical-audit.md:64`**
```diff
-| 5.1 | Todas las imágenes con `alt` descriptivo | Añadir `alt="patio interior de House Sevillana en Calle Bustos Tavera"` |
+| 5.1 | Todas las imágenes con `alt` descriptivo | Añadir `alt="patio interior de House Sevillana en Calle Socorro, barrio de San Julián"` |
```

**5. `references/keywords.md:9`** — «Bustos Tavera» como keyword de House Sevillana no solo es
falso: la pone a competir con los otros dos pisos del grupo.
```diff
-- **Búsquedas locales por barrio**: San Marcos, San Julián, Bustos Tavera
+- **Búsquedas locales por barrio**: San Marcos, San Julián, San Román, Santa Marina
```
Y en `references/keywords.md:48`, quitar la línea `- alojamiento bustos tavera sevilla`.

**6. `assets/jsonld/lodging-business.json:22` y `:30-31`**
```diff
-    "streetAddress": "Calle Bustos Tavera 22",
+    "streetAddress": "Calle Socorro 24",
...
-    "latitude": 37.3936,
-    "longitude": -5.9886
+    "latitude": 37.395904,
+    "longitude": -5.987431
```

**7. `assets/jsonld/organization.json:25`**
```diff
-    "streetAddress": "Calle Bustos Tavera 22",
+    "streetAddress": "Calle Socorro 24",
```

**Y en `SKILL.md`:** en la `description:` (línea 3), `Calle Bustos Tavera 22` → `Calle Socorro
24, barrio de San Julián`; en la regla 3 (línea 43), sustituir `Calle Bustos Tavera` por `Calle
Socorro` y `Plaza de San Román`.

## De paso, dos cosas más que vi en la ficha de Booking

- **`telephone` está sin rellenar** en `lodging-business.json`
  (`"+34_PENDIENTE_CONFIRMAR"`). El de la landing es el `+34 637 349 990`.
- **Booking anuncia «Admite mascotas» y la landing dice que NO se admiten.** No sé cuál es la
  política real, así que no toqué ninguna de las dos — pero un huésped que reserve con perro
  por Booking y se presente en la puerta es un problema, y de los caros. Decide y alinea los
  dos canales.
