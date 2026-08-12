# Documento de Requerimientos del Sistema (SRS)
## Sistema de Visualización de Datos Sísmicos, Demográficos y Económicos de México

---

### 1. Visión y Alcance del Proyecto
El sistema tiene como propósito transformar datos sísmicos complejos del Servicio Sismológico Nacional (SSN) y los cruza con datos demográficos y económicos del Instituto Nacional de Estadística y Geografía (INEGI) en visualizaciones interactivas y reportes analíticos accesibles a investigadores, entidades gubernamentales y público en general.

---

### 2. Fuentes de Datos
- **Servicio Sismológico Nacional (SSN):** Archivo CSV con registros históricos de sismos en México desde el año 1900 (+300,000 registros).
- **INEGI - Censo de Población y Vivienda 2020:** Archivo CSV con datos demográficos a nivel municipal/estatal.
- **INEGI - Censos Económicos:** Archivo CSV con datos de unidades económicas y producción por región.

---

### 3. Requerimientos Funcionales (RF)

#### RF-01: Módulo ETL y Limpieza de Datos
- **RF-01.1:** Leer archivos fuente en formato CSV (SSN e INEGI).
- **RF-01.2:** Validar y depurar registros (identificar campos vacíos, coordenadas inconsistentes o formatos incompatibles).
- **RF-01.3:** Generar scripts de inserción SQL optimizados para la carga masiva en la base de datos.

#### RF-02: Base de Datos y Data Warehouse
- **RF-02.1:** Implementar modelo dimensional (Data Warehouse) en PostgreSQL.
- **RF-02.2:** Mantener tablas dimensionales y de hechos:
  - `dim_sismos`: atributos del evento sísmico (magnitud, profundidad, coordenadas, fecha/hora).
  - `dim_poblacion` / `dim_zonas`: datos geográficos y demográficos INEGI 2020.
  - `dim_economia`: datos económicos INEGI.
  - `dim_tiempo`: dimensión temporal detallada.
  - `fact_impacto_sismos_imputed`: relación de impacto de sismos en zonas pobladas y actividades económicas.

#### RF-03: API Backend y Servicios de Consulta
- **RF-03.1:** Desarrollar servicios REST en **Node.js** con el framework **Express**.
- **RF-03.2:** Exponer endpoints `/api/sismos` y `/api/estadisticas` para consultar datos filtrados de sismos, estadísticas agregadas y cruces demográficos.

#### RF-04: Visualización Mapas Interactivos (Frontend)
- **RF-04.1:** Renderizar mapa interactivo mediante **OpenStreetMap** (Leaflet JS).
- **RF-04.2:** Ubicación exacta de epicentros mediante coordenadas geoespaciales.
- **RF-04.3:** Simbología por código de colores según magnitud y población:
  - **Verde:** Magnitud 2.0 a 3.9
  - **Amarillo:** Magnitud 4.0 a 5.9
  - **Rojo:** Magnitud 6.0 en adelante
  - **Azul:** Localidades/poblaciones con 50,000 o más habitantes

#### RF-05: Módulo de Reportes Estadísticos y Gráficos
- **RF-05.1:** Gráfico de distribución de magnitudes.
- **RF-05.2:** Gráfico de correlación Magnitud vs. Profundidad.
- **RF-05.3:** Histograma de sismos por mes/año.
- **RF-05.4:** Gráfico de Población Afectada vs. Magnitud.
- **RF-05.5:** KPIs resumidos: Total de sismos, Población potencialmente afectada, Sismo de mayor impacto en período seleccionado.

#### RF-06: Filtros y Reportes Personalizados
- **RF-06.1:** Filtrado dinámico por rango de fechas/años, magnitud mínima/máxima, profundidad, estado/localidad y nivel socioeconómico.
- **RF-06.2:** Generar vistas de reporte por estado y a nivel nacional.

#### RF-07: Mapa de Calor Sísmico (Heatmap)
- **RF-07.1:** Representación de densidad y alcance territorial del riesgo sísmico.

---

### 4. Requerimientos No Funcionales (RNF)

#### RNF-01: Tecnologías Abiertas y Software Libre
- Uso de componentes 100% código abierto sin costos de licenciamiento (PostgreSQL, PHP 8, Apache, HTML5/CSS3/JS, Bootstrap, OpenStreetMap, Python).

#### RNF-02: Contenerización y Facilidad de Despliegue
- El sistema debe desplegarse mediante **Docker Compose**.
- Arquitectura desacoplada en 2 contenedores independientes:
  1. Contenedor de Base de Datos PostgreSQL.
  2. Contenedor del Servidor Web (PHP 8 + Apache + Frontend).

#### RNF-03: Rendimiento
- Consultas optimizadas sobre el Data Warehouse para responder fluidamente ante volúmenes superiores a 300,000 sismos.

#### RNF-04: Usabilidad e Interfaz
- Diseño responsivo e intuitivo utilizando **Bootstrap**.
- Experiencia de usuario interactiva sin requerir manejo técnico directo de bases de datos por el usuario final.

---

### 5. Trabajo Futuro / Extensibilidad
- Incorporar visualizaciones sísmicas en 3D.
- Integración con APIs de Alerta Temprana en tiempo real.
- Incorporación de fuentes de datos oficiales adicionales.
