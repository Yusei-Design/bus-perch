/* ============================================
   Bus Perch — main.js
   Perch next UI を踏襲したフロントエンド
   ============================================ */

// ---- 定数 ----
const CATEGORIES = [
  { key: 'すべて',           color: null },
  { key: '通常待機／公式設備', color: '#A3A3A3' },
  { key: 'おもてなし',        color: '#66bb6a' },
  { key: '黙認・境界',        color: '#bdbdbd' },
  { key: '転用',             color: '#42a5f5' },
  { key: '侵入',             color: '#ef5350' },
];
const CAT_COLOR_MAP = Object.fromEntries(
  CATEGORIES.filter(c => c.color).map(c => [c.key, c.color])
);
CAT_COLOR_MAP['未分類'] = '#2c2c2c';

// ---- State ----
let allStops = [];
let allLogs  = [];
let activeCategory = 'すべて';
let showStops = true;
let showLines = true;
let showHeat  = false;

// Marker references for toggling
const stopMarkers = [];
const logMarkers  = [];

// ---- DOM refs ----
const $filter    = document.getElementById('categoryFilter');
const $count     = document.getElementById('countBar');
const $panel     = document.getElementById('infoPanel');
const $panelBody = document.getElementById('panelContent');
const $lightbox  = document.getElementById('lightbox');
const $lbImg     = document.getElementById('lightboxImg');

// ---- Map ----
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/positron',
  center: [135.7681, 35.0116],
  zoom: 14,
  pitch: 45,
  bearing: -10,
  dragRotate: true,
  touchPitch: true,
  maxPitch: 70,
  antialias: true,
});
map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'bottom-left');

// ---- Filter Bar ----
function buildFilterBar() {
  $filter.innerHTML = '';
  CATEGORIES.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'filter-chip' + (cat.key === activeCategory ? ' is-active' : '');
    btn.type = 'button';
    if (cat.color) {
      btn.innerHTML = `<span class="chip-dot" style="background:${cat.color}"></span>${cat.key}`;
    } else {
      btn.textContent = cat.key;
    }
    btn.addEventListener('click', () => {
      activeCategory = cat.key;
      buildFilterBar();
      applyFilter();
    });
    $filter.appendChild(btn);
  });
}

// ---- Count Bar ----
function updateCount(visibleLogs) {
  const stopCount = showStops ? allStops.length : 0;
  $count.textContent = `バス停 ${stopCount} 件 ・ 観察 ${visibleLogs} 件`;
}

// ---- Apply Filter ----
function applyFilter() {
  const isAll = activeCategory === 'すべて';
  let visibleCount = 0;

  // Log markers
  logMarkers.forEach(({ marker, log }) => {
    const show = isAll || log.category === activeCategory;
    marker.getElement().style.display = show ? '' : 'none';
    if (show) visibleCount++;
  });

  // Connection lines
  updateConnectionLines();

  // Heatmap
  if (showHeat) updateHeatmapData();

  updateCount(visibleCount);
}

// ---- Draw Stops ----
function drawStops() {
  // Clear existing
  stopMarkers.forEach(({ marker }) => marker.remove());
  stopMarkers.length = 0;

  allStops.forEach(stop => {
    const el = document.createElement('div');
    el.className = 'stop-marker';

    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([stop.lon, stop.lat])
      .addTo(map);

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      openStopPanel(stop);
    });

    stopMarkers.push({ marker, stop });
  });
}

// ---- Draw Logs ----
function drawLogs() {
  logMarkers.forEach(({ marker }) => marker.remove());
  logMarkers.length = 0;

  allLogs.forEach(log => {
    const color = CAT_COLOR_MAP[log.category] || CAT_COLOR_MAP['未分類'];
    const el = document.createElement('div');
    el.className = 'log-marker';
    el.style.background = color;

    // 人数バッジ（2人以上）
    if (log.people > 1) {
      const badge = document.createElement('span');
      badge.className = 'marker-people';
      badge.textContent = log.people;
      el.appendChild(badge);
    }

    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([log.lon, log.lat])
      .addTo(map);

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      openLogPanel(log);
    });

    logMarkers.push({ marker, log });
  });
}

// ---- Connection Lines (ズレ線) ----
function updateConnectionLines() {
  const isAll = activeCategory === 'すべて';
  const features = [];

  allLogs.forEach(log => {
    if (!showLines) return;
    if (!isAll && log.category !== activeCategory) return;
    if (!log.stopId) return;
    const stop = allStops.find(s => s.id === log.stopId);
    if (!stop) return;

    const color = CAT_COLOR_MAP[log.category] || CAT_COLOR_MAP['未分類'];
    features.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [[stop.lon, stop.lat], [log.lon, log.lat]],
      },
      properties: { color },
    });
  });

  const data = { type: 'FeatureCollection', features };
  if (map.getSource('connections')) {
    map.getSource('connections').setData(data);
  }
}

function initConnectionLayer() {
  map.addSource('connections', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });
  map.addLayer({
    id: 'connection-lines',
    type: 'line',
    source: 'connections',
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 2,
      'line-dasharray': [4, 4],
      'line-opacity': 0.55,
    },
  });
}

// ---- Heatmap Layer ----
function initHeatmapLayer() {
  map.addSource('heat-source', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });
  map.addLayer({
    id: 'heat-layer',
    type: 'heatmap',
    source: 'heat-source',
    layout: { visibility: 'none' },
    paint: {
      'heatmap-weight': ['get', 'weight'],
      'heatmap-intensity': 1.2,
      'heatmap-radius': [
        'interpolate', ['linear'], ['zoom'],
        10, 15,
        16, 40,
      ],
      'heatmap-color': [
        'interpolate', ['linear'], ['heatmap-density'],
        0,   'rgba(0,0,0,0)',
        0.2, 'rgba(189,189,189,0.4)',
        0.4, 'rgba(66,165,245,0.5)',
        0.6, 'rgba(102,187,106,0.6)',
        0.8, 'rgba(221,90,15,0.7)',
        1,   'rgba(239,83,80,0.85)',
      ],
      'heatmap-opacity': 0.7,
    },
  });
}

function updateHeatmapData() {
  const isAll = activeCategory === 'すべて';
  const features = allLogs
    .filter(l => isAll || l.category === activeCategory)
    .map(l => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [l.lon, l.lat] },
      properties: { weight: l.people || 1 },
    }));
  if (map.getSource('heat-source')) {
    map.getSource('heat-source').setData({ type: 'FeatureCollection', features });
  }
}

function toggleHeatmap(on) {
  showHeat = on;
  map.setLayoutProperty('heat-layer', 'visibility', on ? 'visible' : 'none');
  if (on) updateHeatmapData();
}

// ---- Info Panel: Stop ----
function openStopPanel(stop) {
  const imgHtml = stop.imageId
    ? `<img class="panel-image" src="/images/${stop.imageId}.jpg"
           onerror="this.style.display='none'"
           onclick="openLightbox(this.src)" />`
    : '';

  $panelBody.innerHTML = `
    <div class="panel-category-badge" style="background:#2c2c2c">公式バス停</div>
    <h2 class="panel-title">${stop.name}</h2>
    ${imgHtml}
    <div class="panel-meta">
      <div class="panel-meta-row"><span class="meta-label">屋根</span><span class="meta-value">${stop.roof ? 'あり' : 'なし'}</span></div>
      <div class="panel-meta-row"><span class="meta-label">ベンチ</span><span class="meta-value">${stop.bench ? 'あり' : 'なし'}</span></div>
      <div class="panel-meta-row"><span class="meta-label">設置場所</span><span class="meta-value">${stop.location}</span></div>
      <div class="panel-meta-row"><span class="meta-label">stop_id</span><span class="meta-value">${stop.id || '—'}</span></div>
    </div>
    <div class="panel-divider"></div>
    <p style="font-size:12px;color:var(--muted)">観察ログはマーカーをタップして確認できます。</p>
  `;
  $panel.classList.add('is-open');
}

// ---- Info Panel: Log ----
function openLogPanel(log) {
  const color = CAT_COLOR_MAP[log.category] || CAT_COLOR_MAP['未分類'];
  const imgHtml = log.imageId
    ? `<img class="panel-image" src="/images/${log.imageId}.jpg"
           onerror="this.style.display='none'"
           onclick="openLightbox(this.src)" />`
    : '';

  const tagsHtml = [...log.behavior, ...log.elements]
    .map(t => `<span class="panel-tag">${t}</span>`).join('');

  $panelBody.innerHTML = `
    <div class="panel-category-badge" style="background:${color}">${log.category}</div>
    <h2 class="panel-title">${log.title}</h2>
    ${imgHtml}
    <div class="panel-meta">
      <div class="panel-meta-row"><span class="meta-label">人数</span><span class="meta-value">${log.people}人</span></div>
      <div class="panel-meta-row"><span class="meta-label">天気</span><span class="meta-value">${log.weather}</span></div>
    </div>
    ${tagsHtml ? `<div class="panel-tags">${tagsHtml}</div>` : ''}
    ${log.memo ? `<div class="panel-memo">${log.memo}</div>` : ''}
    <div class="panel-divider"></div>
    <div class="panel-meta">
      <div class="panel-meta-row"><span class="meta-label">緯度</span><span class="meta-value">${log.lat}</span></div>
      <div class="panel-meta-row"><span class="meta-label">経度</span><span class="meta-value">${log.lon}</span></div>
    </div>
  `;
  $panel.classList.add('is-open');
}

function closePanel() {
  $panel.classList.remove('is-open');
}

// ---- Lightbox ----
function openLightbox(src) {
  $lbImg.src = src;
  $lightbox.classList.add('is-open');
}
function closeLightbox() {
  $lightbox.classList.remove('is-open');
  $lbImg.src = '';
}
// Global access for inline onclick
window.openLightbox = openLightbox;

// ---- FAB Controls ----
function setupFABs() {
  const btnStops = document.getElementById('btnStops');
  const btnLines = document.getElementById('btnLines');
  const btnHeat  = document.getElementById('btnHeat');

  btnStops.addEventListener('click', () => {
    showStops = !showStops;
    btnStops.classList.toggle('is-active', showStops);
    stopMarkers.forEach(({ marker }) => {
      marker.getElement().style.display = showStops ? '' : 'none';
    });
    applyFilter();
  });

  btnLines.addEventListener('click', () => {
    showLines = !showLines;
    btnLines.classList.toggle('is-active', showLines);
    updateConnectionLines();
  });

  btnHeat.addEventListener('click', () => {
    btnHeat.classList.toggle('is-active', !showHeat);
    toggleHeatmap(!showHeat);
  });
}

// ---- Panel / Lightbox close ----
document.getElementById('panelCloseBtn').addEventListener('click', closePanel);
document.getElementById('lightboxCloseBtn').addEventListener('click', closeLightbox);
$lightbox.addEventListener('click', (e) => {
  if (e.target === $lightbox) closeLightbox();
});

// ---- Init ----
async function initApp() {
  try {
    const [stopsRes, logsRes] = await Promise.all([
      fetch('/data/stops.json'),   // ビルド時生成の静的JSON
      fetch('/api/get-logs'),      // 観察ログはNotion APIから取得
    ]);
    allStops = await stopsRes.json();
    allLogs  = await logsRes.json();
  } catch (err) {
    console.error('データの取得に失敗しました:', err);
    $count.textContent = 'データ取得エラー';
    return;
  }

  map.on('load', () => {
    // Layers
    initConnectionLayer();
    initHeatmapLayer();

    // Markers
    drawStops();
    drawLogs();

    // Initial wiring
    buildFilterBar();
    setupFABs();
    applyFilter();
  });
}

initApp();