const { Client } = require('@notionhq/client');
const fs = require('fs');
const path = require('path');

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const DB_ID = process.env.NOTION_STOPS_DB_ID;

async function main() {
  const results = [];
  let hasMore = true;
  let cursor;

  while (hasMore) {
    const res = await notion.databases.query({
      database_id: DB_ID,
      page_size: 100,
      start_cursor: cursor,
    });
    for (const page of res.results) {
      const p = page.properties;
      const lat = p['緯度']?.number;
      const lon = p['経度']?.number;
      if (!lat || !lon) continue; // 座標なしは除外

      results.push({
        id:       p.stop_id?.rich_text?.[0]?.plain_text || '',
        name:     p['停留所名']?.rich_text?.[0]?.plain_text || '不明',
        lat,
        lon,
        roof:     p['公式屋根']?.checkbox || false,
        bench:    p['公式ベンチ']?.checkbox || false,
        location: p['設置場所']?.select?.name || '不明',
        memo:     p['メモ']?.rich_text?.[0]?.plain_text || '',
        imageId:  p['画像ID']?.number || null,
      });
    }
    hasMore = res.has_more;
    cursor = res.next_cursor;
  }

  const outDir = path.join(__dirname, '..', 'public', 'data');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'stops.json'),
    JSON.stringify(results, null, 2)
  );
  console.log(`[build-stops] Generated stops.json: ${results.length} stops`);
}

main().catch(err => {
  console.error('[build-stops] Error:', err);
  process.exit(1);
});