const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const DATABASE_ID = process.env.NOTION_STOPS_DB_ID; // bus-stopデータベースのID

export default async function handler(req, res) {
  // CORS設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  // Vercel Edge Cache（60秒間キャッシュ、バックグラウンドで更新）
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');

  try {
    let allResults = [];
    let hasMore = true;
    let nextCursor = undefined;

    // 100件制限を回避するため、全件取得するまでループ（ページネーション）
    while (hasMore) {
      const response = await notion.databases.query({
        database_id: DATABASE_ID,
        page_size: 100,
        start_cursor: nextCursor,
      });

      allResults.push(...response.results);
      hasMore = response.has_more;
      nextCursor = response.next_cursor;
    }

    const stops = allResults.map(page => ({
      id: page.properties['stop_id']?.rich_text[0]?.plain_text || null,
      name: page.properties['停留所名']?.rich_text[0]?.plain_text || '不明',
      lat: page.properties['緯度']?.number || null,
      lon: page.properties['経度']?.number || null,
      roof: page.properties['公式屋根']?.checkbox || false,
      bench: page.properties['公式ベンチ']?.checkbox || false,
      location: page.properties['設置場所']?.select?.name || '不明',
      imageId: page.properties['画像ID']?.number || null
    })).filter(stop => stop.lat && stop.lon); // 座標がないものは除外

    res.status(200).json(stops);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch stops data' });
  }
}