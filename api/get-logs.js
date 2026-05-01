const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const DATABASE_ID = process.env.NOTION_LOGS_DB_ID; // observation_logデータベースのID

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');

  try {
    const response = await notion.databases.query({
      database_id: DATABASE_ID,
      page_size: 100,
    });

    const logs = response.results.map(page => ({
      id: page.id,
      title: page.properties['記録名']?.title[0]?.plain_text || '無題',
      stopId: page.properties['stop_id']?.rollup?.array[0]?.rich_text[0]?.plain_text || null, // ロールアップ経由で取得したバス停のID
      lat: page.properties['緯度']?.number || null,
      lon: page.properties['経度']?.number || null,
      category: page.properties['カテゴリー']?.select?.name || '未分類',
      behavior: page.properties['ふるまい']?.multi_select.map(s => s.name) || [],
      elements: page.properties['使われた場所・要素']?.multi_select.map(s => s.name) || [],
      people: page.properties['人数']?.number || 1,
      weather: page.properties['天気']?.select?.name || '不明',
      memo: page.properties['メモ']?.rich_text[0]?.plain_text || '',
      imageId: page.properties['画像ID']?.number || null
    })).filter(log => log.lat && log.lon);

    res.status(200).json(logs);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch logs data' });
  }
}