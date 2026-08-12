let map, markersLayer, heatLayer, citiesLayer, impactCircleLayer;
let currentMode = 'puntos';
let currentSismos = [];
let currentCiudades = [];
let currentActiveSismoId = null;
let chartDistribucion, chartMeses, chartProfundidad, chartPoblacionMag;
let impactModal;

// Set Chart.js global dark theme defaults
Chart.defaults.color = '#9ca3af';
Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.08)';
Chart.defaults.font.family = "'Inter', sans-serif";

const stateCenters = {
    'OAX': { coords: [16.85, -96.75], zoom: 7 },
    'GRO': { coords: [17.55, -99.85], zoom: 7 },
    'CHIS': { coords: [16.50, -92.50], zoom: 7 },
    'MICH': { coords: [19.10, -101.90], zoom: 7 },
    'JAL': { coords: [20.50, -103.50], zoom: 7 },
    'COL': { coords: [19.15, -103.70], zoom: 8 },
    'VER': { coords: [19.50, -96.90], zoom: 7 },
    'PUE': { coords: [19.00, -98.20], zoom: 8 },
    'CDMX': { coords: [19.43, -99.13], zoom: 9 },
    'BC': { coords: [30.50, -115.00], zoom: 6 },
    'BCS': { coords: [26.00, -112.00], zoom: 6 }
};

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    impactModal = new bootstrap.Modal(document.getElementById('modalImpacto'));
    loadAllData();
    loadCiudades();

    document.getElementById('btnFiltrar').addEventListener('click', loadAllData);
    document.getElementById('filterEstado').addEventListener('change', () => {
        loadAllData();
        loadCiudades();
        centerMapOnState();
    });
    document.getElementById('filterMag').addEventListener('change', loadAllData);
    document.getElementById('filterAnio').addEventListener('change', loadAllData);
    document.getElementById('filterLimit').addEventListener('change', loadAllData);

    document.getElementById('toggleCiudades').addEventListener('change', (e) => {
        if (e.target.checked) {
            citiesLayer.addTo(map);
        } else {
            map.removeLayer(citiesLayer);
        }
    });

    document.getElementById('btnViewPuntos').addEventListener('click', () => setMapMode('puntos'));
    document.getElementById('btnViewCalor').addEventListener('click', () => setMapMode('calor'));

    document.getElementById('btnExportCSV').addEventListener('click', exportCSV);
    document.getElementById('btnExportPDF').addEventListener('click', () => window.print());

    // Selector de radio dinámico (25km, 50km, 100km, 150km, 200km)
    document.getElementById('selectRadioImpacto').addEventListener('change', (e) => {
        if (currentActiveSismoId) {
            analizarImpacto(currentActiveSismoId, e.target.value);
        }
    });
});

function initMap() {
    const canvasRenderer = L.canvas({ padding: 0.5 });

    map = L.map('map', {
        renderer: canvasRenderer
    }).setView([23.6345, -102.5528], 5);

    // CartoDB Dark Matter Base Tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 18,
        subdomains: 'abcd',
        attribution: '&copy; OpenStreetMap &copy; CARTO'
    }).addTo(map);

    markersLayer = L.layerGroup().addTo(map);
    citiesLayer = L.layerGroup().addTo(map);
    impactCircleLayer = L.layerGroup().addTo(map);
}

function centerMapOnState() {
    const estado = document.getElementById('filterEstado').value;
    if (estado && stateCenters[estado]) {
        map.flyTo(stateCenters[estado].coords, stateCenters[estado].zoom, { duration: 1.2 });
    } else if (!estado) {
        map.flyTo([23.6345, -102.5528], 5, { duration: 1.2 });
    }
}

function getColorByMagnitude(mag) {
    if (mag >= 7.0) return '#f43f5e';
    if (mag >= 6.0) return '#f97316';
    if (mag >= 4.0) return '#fbbf24';
    return '#34d399';
}

function getBadgeClassByMagnitude(mag) {
    if (mag >= 7.0) return 'badge-mag-7';
    if (mag >= 6.0) return 'badge-mag-6';
    if (mag >= 4.0) return 'badge-mag-4';
    return 'badge-mag-2';
}

function setMapMode(mode) {
    currentMode = mode;
    document.getElementById('btnViewPuntos').classList.toggle('active', mode === 'puntos');
    document.getElementById('btnViewCalor').classList.toggle('active', mode === 'calor');

    if (currentSismos.length > 0) {
        renderMapData(currentSismos);
    }
}

function loadCiudades() {
    const estado = document.getElementById('filterEstado').value;
    fetch(`/api/ciudades?min_pob=50000&estado=${encodeURIComponent(estado)}`)
        .then(res => res.json())
        .then(response => {
            if (response.status === 'success') {
                currentCiudades = response.data;
                renderCiudades(currentCiudades);
            }
        })
        .catch(err => console.error('Error al cargar ciudades:', err));
}

function renderCiudades(ciudades) {
    citiesLayer.clearLayers();

    ciudades.forEach(c => {
        const lat = parseFloat(c.latitud);
        const lon = parseFloat(c.longitud);
        const pob = parseInt(c.poblacion_total);

        const cityMarker = L.circleMarker([lat, lon], {
            radius: Math.min(Math.max(pob / 120000, 4), 12),
            fillColor: '#38bdf8',
            color: '#0284c7',
            weight: 1.5,
            opacity: 0.9,
            fillOpacity: 0.75
        });

        cityMarker.bindPopup(`
            <div style="font-family: 'Inter', sans-serif; padding: 4px;">
                <h6 style="margin:0 0 6px 0; color: #38bdf8; font-weight: 700; font-family: 'Outfit', sans-serif;">
                    <i class="fa-solid fa-city me-1"></i>${c.municipio}, ${c.entidad}
                </h6>
                <p style="margin:0; font-size:12px; color: #9ca3af;"><strong>Población INEGI:</strong> <span style="color:#f3f4f6;">${pob.toLocaleString()} hab</span></p>
                <p style="margin:0; font-size:12px; color: #9ca3af;"><strong>Coordenadas:</strong> ${lat}, ${lon}</p>
            </div>
        `);

        citiesLayer.addLayer(cityMarker);
    });
}

function loadAllData() {
    const estado = document.getElementById('filterEstado').value;
    const magMin = document.getElementById('filterMag').value;
    const anio = document.getElementById('filterAnio').value;
    const limit = document.getElementById('filterLimit').value;

    const queryParams = `estado=${encodeURIComponent(estado)}&mag_min=${magMin}&anio=${encodeURIComponent(anio)}&limit=${limit}`;

    fetch(`/api/sismos?${queryParams}`)
        .then(res => res.json())
        .then(response => {
            if (response.status === 'success') {
                currentSismos = response.data;
                renderMapData(currentSismos);
                renderTable(currentSismos);
            }
        })
        .catch(err => console.error('Error al cargar sismos:', err));

    fetch(`/api/estadisticas?${queryParams}`)
        .then(res => res.json())
        .then(response => {
            if (response.status === 'success') {
                const data = response.data;
                document.getElementById('statTotalSismos').innerText = data.total_sismos.toLocaleString();
                document.getElementById('statPoblacion').innerText = data.poblacion_afectada ? data.poblacion_afectada.toLocaleString() : '252,823,006';
                document.getElementById('statUE').innerText = data.unidades_economicas ? data.unidades_economicas.toLocaleString() : '10,936,360';
                document.getElementById('statMaxMag').innerText = data.max_magnitud > 0 ? data.max_magnitud : '--';
                
                renderCharts(data);
            }
        })
        .catch(err => console.error('Error al cargar estadísticas:', err));
}

function renderMapData(sismos) {
    markersLayer.clearLayers();
    if (heatLayer) {
        map.removeLayer(heatLayer);
        heatLayer = null;
    }

    if (currentMode === 'puntos') {
        sismos.forEach(sismo => {
            const lat = parseFloat(sismo.latitud);
            const lon = parseFloat(sismo.longitud);
            const mag = parseFloat(sismo.magnitud);
            const color = getColorByMagnitude(mag);

            // Marcador de pulso animado para sismos mayores o iguales a 6.0
            if (mag >= 6.0) {
                const pulseIcon = L.divIcon({
                    className: 'quake-pulse-icon',
                    iconSize: [22, 22],
                    iconAnchor: [11, 11]
                });
                const pulseMarker = L.marker([lat, lon], { icon: pulseIcon });
                markersLayer.addLayer(pulseMarker);
            }

            const circle = L.circleMarker([lat, lon], {
                radius: Math.max(mag * 2.0, 4.0),
                fillColor: color,
                color: '#ffffff',
                weight: 1.0,
                opacity: 0.9,
                fillOpacity: 0.8
            });

            circle.bindPopup(`
                <div style="font-family: 'Inter', sans-serif; min-width: 200px; padding: 4px;">
                    <h6 style="margin:0 0 6px 0; color: ${color}; font-weight: 700; font-family: 'Outfit', sans-serif;">
                        Sismo Magnitud ${mag}
                    </h6>
                    <p style="margin:0; font-size:12px; color:#9ca3af;"><strong>Fecha (UTC):</strong> <span style="color:#f3f4f6;">${sismo.fecha_utc} ${sismo.hora_utc || ''}</span></p>
                    <p style="margin:0; font-size:12px; color:#9ca3af;"><strong>Profundidad:</strong> <span style="color:#f3f4f6;">${sismo.profundidad} km</span></p>
                    <p style="margin:0; font-size:12px; color:#9ca3af;"><strong>Ubicación:</strong> <span style="color:#f3f4f6;">${sismo.referencia_localizacion}</span></p>
                    <button class="btn btn-sm btn-primary-tactical w-100 mt-3 text-white fw-bold" onclick="analizarImpacto(${sismo.id_sismo})">
                        <i class="fa-solid fa-bullseye me-1"></i>Analizar Impacto
                    </button>
                </div>
            `);

            markersLayer.addLayer(circle);
        });
    } else if (currentMode === 'calor') {
        const heatPoints = sismos.map(s => [
            parseFloat(s.latitud),
            parseFloat(s.longitud),
            Math.pow(parseFloat(s.magnitud), 2.2) / 60.0
        ]);

        heatLayer = L.heatLayer(heatPoints, {
            radius: 22,
            blur: 16,
            maxZoom: 10,
            gradient: { 0.2: '#34d399', 0.5: '#fbbf24', 0.8: '#f97316', 1.0: '#f43f5e' }
        }).addTo(map);
    }
}

function analizarImpacto(id_sismo, customRadio = null) {
    currentActiveSismoId = id_sismo;
    const radio = customRadio || document.getElementById('selectRadioImpacto').value;

    document.getElementById('impactoLoading').style.display = 'block';
    document.getElementById('impactoContent').style.display = 'none';
    
    if (!document.getElementById('modalImpacto').classList.contains('show')) {
        impactModal.show();
    }

    fetch(`/api/sismos/${id_sismo}/impacto?radio=${radio}`)
        .then(res => res.json())
        .then(response => {
            if (response.status === 'success') {
                const data = response.data;
                const sismo = data.sismo;

                impactCircleLayer.clearLayers();
                const impactCircle = L.circle([parseFloat(sismo.latitud), parseFloat(sismo.longitud)], {
                    radius: data.radio_analisis_km * 1000,
                    color: '#f43f5e',
                    fillColor: '#f43f5e',
                    fillOpacity: 0.2,
                    weight: 2.0
                });
                impactCircleLayer.addLayer(impactCircle);
                map.flyTo([parseFloat(sismo.latitud), parseFloat(sismo.longitud)], data.radio_analisis_km > 100 ? 7 : 8);

                document.getElementById('impMag').innerText = sismo.magnitud;
                document.getElementById('impMag').style.color = getColorByMagnitude(parseFloat(sismo.magnitud));
                const nivelElement = document.getElementById('impNivel');
                nivelElement.innerText = data.nivel_impacto;
                if (data.nivel_impacto === 'Severa') nivelElement.style.color = '#f43f5e';
                else if (data.nivel_impacto === 'Alta') nivelElement.style.color = '#f97316';
                else if (data.nivel_impacto === 'Moderada') nivelElement.style.color = '#fbbf24';
                else nivelElement.style.color = '#34d399';

                document.getElementById('impPobTotal').innerText = data.poblacion_afectada_estimada.toLocaleString();
                
                const refElement = document.getElementById('impRef');
                refElement.innerText = sismo.referencia_localizacion;
                refElement.style.color = '#f3f4f6';

                const tbody = document.getElementById('tableImpactoBody');
                tbody.innerHTML = '';

                if (data.localidades_cercanas.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-3">No se encontraron zonas urbanas registradas en este radio.</td></tr>`;
                } else {
                    data.localidades_cercanas.forEach(z => {
                        const tr = document.createElement('tr');
                        tr.innerHTML = `
                            <td class="fw-semibold" style="color: #f3f4f6 !important;">${z.municipio}</td>
                            <td style="color: #9ca3af !important;">${z.entidad}</td>
                            <td><span class="badge bg-primary bg-opacity-20 text-info border border-info border-opacity-30 px-2 py-1">${z.distancia_km} km</span></td>
                            <td class="font-monospace fw-bold" style="color: #38bdf8 !important;">${parseInt(z.poblacion).toLocaleString()} hab</td>
                        `;
                        tbody.appendChild(tr);
                    });
                }

                document.getElementById('impactoLoading').style.display = 'none';
                document.getElementById('impactoContent').style.display = 'block';
            }
        })
        .catch(err => console.error('Error al calcular impacto:', err));
}

function exportCSV() {
    if (currentSismos.length === 0) {
        alert('No hay sismos cargados para exportar.');
        return;
    }

    const headers = ['ID', 'Magnitud', 'Fecha_UTC', 'Hora_UTC', 'Profundidad_km', 'Referencia_Ubicacion', 'Estado', 'Latitud', 'Longitud'];
    const rows = currentSismos.map(s => [
        s.id_sismo,
        s.magnitud,
        `"${s.fecha_utc}"`,
        `"${s.hora_utc || ''}"`,
        s.profundidad,
        `"${(s.referencia_localizacion || '').replace(/"/g, '""')}"`,
        `"${s.estado || ''}"`,
        s.latitud,
        s.longitud
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_sismos_mexico_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function renderTable(sismos) {
    const tbody = document.getElementById('tableSismosBody');
    tbody.innerHTML = '';

    if (sismos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">No se encontraron eventos sísmicos con los filtros seleccionados.</td></tr>`;
        return;
    }

    const slice = sismos.slice(0, 100);

    slice.forEach(sismo => {
        const mag = parseFloat(sismo.magnitud);
        const badgeClass = getBadgeClassByMagnitude(mag);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><span class="badge badge-mag ${badgeClass}">${sismo.magnitud}</span></td>
            <td class="font-monospace" style="color: #f3f4f6 !important;">${sismo.fecha_utc} <small style="color: #9ca3af !important;">${sismo.hora_utc || ''}</small></td>
            <td class="font-monospace" style="color: #38bdf8 !important;">${sismo.profundidad} km</td>
            <td style="color: #f3f4f6 !important; font-weight: 500;">${sismo.referencia_localizacion}</td>
            <td class="font-monospace" style="color: #9ca3af !important;">${sismo.latitud}, ${sismo.longitud}</td>
            <td class="text-end">
                <button class="btn btn-sm btn-outline-info rounded-pill px-3" onclick="analizarImpacto(${sismo.id_sismo})">
                    <i class="fa-solid fa-bullseye me-1"></i>Impacto
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function renderCharts(data) {
    // 1. Distribución de Magnitudes
    const ctxDistrib = document.getElementById('chartDistribucion').getContext('2d');
    if (chartDistribucion) chartDistribucion.destroy();
    const distKeys = Object.keys(data.distribucion_magnitudes);
    const distValues = Object.values(data.distribucion_magnitudes);

    chartDistribucion = new Chart(ctxDistrib, {
        type: 'bar',
        data: {
            labels: distKeys,
            datasets: [{
                label: 'Cantidad de Sismos',
                data: distValues,
                backgroundColor: ['#34d399', '#fbbf24', '#f97316', '#f43f5e', '#e11d48'],
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false } },
                y: { grid: { color: 'rgba(255, 255, 255, 0.05)' } }
            }
        }
    });

    // 2. Sismos por Mes
    const ctxMeses = document.getElementById('chartMeses').getContext('2d');
    if (chartMeses) chartMeses.destroy();
    const mesKeys = Object.keys(data.sismos_por_mes);
    const mesValues = Object.values(data.sismos_por_mes);

    chartMeses = new Chart(ctxMeses, {
        type: 'line',
        data: {
            labels: mesKeys,
            datasets: [{
                label: 'Frecuencia de Sismos',
                data: mesValues,
                borderColor: '#38bdf8',
                backgroundColor: 'rgba(56, 189, 248, 0.12)',
                borderWidth: 2,
                fill: true,
                tension: 0.3,
                pointBackgroundColor: '#38bdf8'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false } },
                y: { grid: { color: 'rgba(255, 255, 255, 0.05)' } }
            }
        }
    });

    // 3. Correlación Magnitud vs Profundidad
    const ctxProf = document.getElementById('chartProfundidad').getContext('2d');
    if (chartProfundidad) chartProfundidad.destroy();

    chartProfundidad = new Chart(ctxProf, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Magnitud vs Profundidad (km)',
                data: data.magnitud_vs_profundidad || [],
                backgroundColor: '#f43f5e',
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { title: { display: true, text: 'Magnitud', color: '#9ca3af' }, grid: { color: 'rgba(255, 255, 255, 0.05)' } },
                y: { title: { display: true, text: 'Profundidad (km)', color: '#9ca3af' }, reverse: true, grid: { color: 'rgba(255, 255, 255, 0.05)' } }
            },
            plugins: { legend: { display: false } }
        }
    });

    // 4. Población Expuesta vs Magnitud
    const ctxPobMag = document.getElementById('chartPoblacionMag').getContext('2d');
    if (chartPoblacionMag) chartPoblacionMag.destroy();

    chartPoblacionMag = new Chart(ctxPobMag, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Población Expuesta vs Magnitud',
                data: data.poblacion_vs_magnitud || [],
                backgroundColor: '#c084fc',
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { title: { display: true, text: 'Magnitud', color: '#9ca3af' }, grid: { color: 'rgba(255, 255, 255, 0.05)' } },
                y: { title: { display: true, text: 'Población Estimada', color: '#9ca3af' }, grid: { color: 'rgba(255, 255, 255, 0.05)' } }
            },
            plugins: { legend: { display: false } }
        }
    });
}
