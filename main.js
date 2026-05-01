// 1. カテゴリーごとの色定義
const CATEGORY_COLORS = {
  '通常待機／公式設備': '#A3A3A3',
  'おもてなし': '#4CAF50',
  '黙認・境界': '#757575',
  '転用': '#2196F3',
  '侵入': '#F44336',
  '未分類': '#000000'
};

// 2. マップの初期化
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/liberty', // OpenFreeMap
  center: [135.7681, 35.0116], // 京都市中心部
  zoom: 14
});

// 3. メイン処理：データ取得と描画
async function initApp() {
  try {
    const [stopsRes, logsRes] = await Promise.all([
      fetch('/api/get-stops'),
      fetch('/api/get-logs')
    ]);
    
    const stops = await stopsRes.json();
    const logs = await logsRes.json();

    // MapLibreのスタイル読み込み完了を待つ
    map.on('load', () => {
      drawStops(stops);
      drawLogsAndConnections(logs, stops);
    });

  } catch (error) {
    console.error('データの取得に失敗しました:', error);
  }
}

// 4. 公式バス停の描画
function drawStops(stops) {
  stops.forEach(stop => {
    const el = document.createElement('div');
    el.className = 'stop-marker';

    const imageHtml = stop.imageId ? `<img src="/images/${stop.imageId}.jpg" class="popup-image" onerror="this.style.display='none'">` : '';

    const popupContent = `
      <strong>${stop.name}</strong><br>
      屋根: ${stop.roof ? 'あり' : 'なし'}<br>
      ベンチ: ${stop.bench ? 'あり' : 'なし'}<br>
      設置場所: ${stop.location}
      ${imageHtml}
    `;

    new maplibregl.Marker(el)
      .setLngLat([stop.lon, stop.lat])
      .setPopup(new maplibregl.Popup({ offset: 10 }).setHTML(popupContent))
      .addTo(map);
  });
}

// 5. 観察ログの描画とズレ線
function drawLogsAndConnections(logs, stops) {
  const lineFeatures = [];

  logs.forEach(log => {
    const color = CATEGORY_COLORS[log.category] || CATEGORY_COLORS['未分類'];
    
    const imageHtml = log.imageId ? `<img src="/images/${log.imageId}.jpg" class="popup-image" onerror="this.style.display='none'">` : '';

    // マーカーの作成
    new maplibregl.Marker({ color: color })
      .setLngLat([log.lon, log.lat])
      .setPopup(new maplibregl.Popup({ offset: 15 }).setHTML(`
        <strong>${log.title}</strong><br>
        分類: ${log.category}<br>
        ふるまい: ${log.behavior.join(', ')}<br>
        要素: ${log.elements.join(', ')}<br>
        人数: ${log.people}人<br>
        ${log.memo ? `<p style="margin: 8px 0 0; font-size: 12px;">${log.memo}</p>` : ''}
        ${imageHtml}
      `))
      .addTo(map);

    // 関連するバス停があれば、そこへの線をGeoJSONに追加
    if (log.stopId) {
      const parentStop = stops.find(s => s.id === log.stopId);
      if (parentStop && parentStop.lon && parentStop.lat) {
        lineFeatures.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [parentStop.lon, parentStop.lat], // 始点：公式バス停
              [log.lon, log.lat]                // 終点：観察ログ
            ]
          },
          properties: {
            color: color
          }
        });
      }
    }
  });

  // ズレを示す線を一括で描画
  if (lineFeatures.length > 0) {
    map.addSource('connections', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: lineFeatures
      }
    });

    map.addLayer({
      id: 'connection-lines',
      type: 'line',
      source: 'connections',
      paint: {
        'line-color': ['get', 'color'], // 観察ログの色に合わせる
        'line-width': 2,
        'line-dasharray': [2, 2], // 破線
        'line-opacity': 0.6
      }
    });
  }
}

// アプリケーション起動
initApp();