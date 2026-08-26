# House Sevillana — Datos del apartamento y entorno

> Fuente: `apps/housesevillana/CLAUDE.md` del monorepo `central` (dato fijado) + ficha pública de
> Booking.com de "HOUSE Sevillana Parking".
> Última actualización: 26/08/2026.
> Si encuentras un dato marcado `[POR CONFIRMAR]` y lo necesitas para un output, pregúntale a Alberto antes de inventar.

> 🚨 **La dirección es Calle Socorro 24, 41003 Sevilla (barrio de San Julián).**
> **NO es Bustos Tavera 22**: esa es la de OTROS DOS pisos del grupo — *Luxury Busto* y *Busto
> Reform*, bajo dcha y bajo izda, alquilados a Gutiérrez Alcalá. El error venía de asignarle el ID
> de Booking `4771238` (que es el de Busto Reform) y arrastrar con él dirección y coordenadas.
> Publicar ese `streetAddress` en el JSON-LD le daría a Google una dirección falsa para el negocio
> y, encima, la de dos competidores propios en la misma búsqueda local de Sevilla.
> La fuente de verdad es `apps/housesevillana/CLAUDE.md`; si algún día se contradicen, manda ese.

## Identidad

- **Nombre comercial**: House Sevillana
- **Variante registrada en Booking**: HOUSE Sevillana Parking
- **Otra unidad relacionada**: House Sevillana - Patio (apartamento separado, otro listing)
- **Propietario / titular**: Alberto Suárez Gutiérrez
- **NIF (en facturas Booking)**: 28823484E
- **Número de licencia VFT (Andalucía)**: `VFT/SE/01179` — obligatoria y visible en la landing (Andalucía)
- **ID Booking**: 2039943 — https://www.booking.com/hotel/es/house-sevillana.html ⚠️ NO es `4771238`: ese es el de *Busto Reform*, otro piso del grupo

## Ubicación

- **Dirección**: Calle Socorro 24, 41003 Sevilla, España
- **Barrio**: **San Julián**, distrito Casco Antiguo. La calle va de la Plaza de San Román a la Plaza de San Marcos
- **Coordenadas**: 37.395904° N, -5.987431° W (fuente: ficha de Booking, 19/08/2026)
- **Distrito municipal**: Casco Antiguo, Sevilla

## Características de la vivienda

| Dato | Valor |
|---|---|
| Superficie | 290 m² |
| Dormitorios | 6 |
| Baños | 4 |
| Capacidad de huéspedes | 12 personas (6 dormitorios dobles) — grupos grandes y familias |
| Tipo de inmueble | Casa-apartamento reformada |
| Plantas | `[POR CONFIRMAR]` |
| Año de reforma | Reciente (recién reformada según ficha) |

## Amenities y equipamiento

**Diferenciadores principales** (USPs para SEO):
- ⭐ **Parking privado en el propio alojamiento** (rarísimo en casco antiguo de Sevilla — usar siempre como gancho)
- ⭐ Terraza con vistas a la ciudad
- ⭐ Jardín y patio interior
- ⭐ Capacidad para grupos grandes en pleno centro

**Equipamiento estándar**:
- Aire acondicionado / climatización
- WiFi gratis
- Cocina totalmente equipada (horno, microondas, nevera, cafetera, hervidor, utensilios)
- TV pantalla plana con canales vía satélite
- Ropa de cama y toallas incluidas
- Secador de pelo

## Puntos de interés cercanos (para schema TouristAttraction y copy local)

| Punto de interés | Distancia/tiempo |
|---|---|
| Iglesia de San Luis de los Franceses | 300 m |
| Palacio de las Dueñas | "a unos metros" / muy cerca |
| Iglesia Santa María La Blanca | Casco antiguo, cercana |
| Catedral de Sevilla y Giralda | ~10 min andando |
| Real Alcázar de Sevilla | ~20 min andando |
| Barrio de Santa Cruz | ~15 min andando |
| Torre del Oro | ~25 min andando |
| Plaza de toros de la Real Maestranza | A poca distancia |
| Setas de Sevilla (Metropol Parasol) | `[POR CONFIRMAR]` — estimar 5–8 min andando, verificar |
| Estación Santa Justa | 10 min en coche |
| Aeropuerto Sevilla SVQ | 10–11 km / ~16 min en coche |
| Plaza Ponce de León (parada bus) | A pocos minutos |
| Exposición Iberoamericana / Plaza España | ~2 km |
| Isla Mágica | Norte de la ciudad, ~15 min en coche |

**Restaurantes/bares mencionados en ficha** (útil para copy "lo que hay alrededor"):
- La Parcería Café
- Ojalá Tapas y Vinos
- Restaurante Condendê (200 m)

## Reglas de la casa (para FAQ y schema)

- ✅ Niños permitidos (todas las edades)
- ❌ No se permiten despedidas de soltero/a ni fiestas similares
- ❌ Silencio obligatorio de 21:00 a 09:00
- 💳 Depósito por daños hasta 150 € post-checkout si hay desperfectos
- 🚭 No fumar (asumido — confirmar con Alberto)
- 🐕 Mascotas: `[POR CONFIRMAR]`

## Posicionamiento en portales (para benchmarking)

- **Booking**: 8.1/10 puntuación
- **Reviews destacados** (parafrasear, no copiar literal):
  - "Está muy bien situado, fácil moverse por Sevilla"
  - "Camas cómodas"
  - "Casa cuidada y puesta pensando en agradar"
  - "Great for a family, loved walking to Santa Cruz"
  - "Loved the tiles" (azulejos típicos)

## Audiencia objetivo (clarísima por la distribución)

**Sí**:
- 👨‍👩‍👧‍👦 Familias multigeneracionales (abuelos + hijos + nietos)
- 👯 Grupos de amigos grandes (8–12 personas)
- 🎓 Bodas/eventos donde varias parejas viajan juntas
- 🚗 Viajeros que llegan en coche (parking propio)

**No**:
- 💑 Parejas solas (sobra espacio, mejor portales para nichos pequeños)
- 🎉 Despedidas de soltero (prohibido)
- 💼 Business travelers individuales

## Ventajas competitivas vs apartamentos similares en Sevilla centro

1. **Parking propio**: la mayoría de casas históricas en casco antiguo no lo tienen. Aparcar en zona azul/SARE en Sevilla es caos.
2. **Capacidad real para grupos grandes**: 6 dorms es poco frecuente en pisos turísticos del centro (la media es 2–3).
3. **Casa palacio reformada**: suelos de azulejos, patio sevillano, encanto auténtico vs hoteles modernos.
4. **Barrio menos saturado**: San Julián / Plaza San Marcos es más tranquilo que Santa Cruz/Alfalfa, pero igualmente céntrico.

## Nichos de búsqueda potenciales (entrada para keyword research)

- "alojamiento Sevilla con parking centro"
- "apartamento Sevilla 12 personas"
- "casa Sevilla familias grupos"
- "alquiler vacacional Sevilla casco antiguo"
- "casa palacio Sevilla turismo"
- Equivalentes en EN/FR/DE/IT — ver `keywords.md`
