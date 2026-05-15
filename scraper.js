const axios = require('axios');
const cheerio = require('cheerio');
const Parser = require('rss-parser');

const parser = new Parser();

// ─── Scraping Configuration ───
const SOURCES = {
  timesOfIndia: {
    name: 'Times of India',
    rss: 'https://timesofindia.indiatimes.com/rssfeeds/69748329.cms',
    baseUrl: 'https://timesofindia.indiatimes.com'
  },
  sakal: {
    name: 'Sakal',
    url: 'https://www.sakal.com/',
    selectors: {
      headlines: '.headline, .article-title, h2 a',
      links: 'a[href*="kumbh"], a[href*="nashik"]'
    }
  },
  lokmat: {
    name: 'Lokmat',
    url: 'https://www.lokmat.com/nashik/',
    selectors: {
      headlines: '.headline, .title, h2',
      links: 'a[href*="kumbh"], a[href*="nashik"]'
    }
  }
};

// ─── RSS Scraper ───
async function scrapeRSS(sourceKey) {
  const source = SOURCES[sourceKey];
  if (!source || !source.rss) return [];

  try {
    const feed = await parser.parseURL(source.rss);
    return feed.items.slice(0, 10).map(item => ({
      headline: item.title,
      summary: item.contentSnippet || item.content?.substring(0, 300) || '',
      url: item.link,
      date: item.pubDate ? new Date(item.pubDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      newspaper: source.name,
      sourceType: 'Digital',
      scraped: true
    }));
  } catch (err) {
    console.error('RSS scrape failed for', sourceKey, err.message);
    return [];
  }
}

// ─── Web Scraper (with permission check) ───
async function scrapeWeb(url, selectors) {
  try {
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': process.env.USER_AGENT || 'NTKMA-MediaBot/1.0'
      },
      timeout: 10000
    });

    const $ = cheerio.load(data);
    const results = [];

    $(selectors.headlines).each((i, el) => {
      const headline = $(el).text().trim();
      const link = $(el).closest('a').attr('href') || $(el).find('a').attr('href');

      if (headline && headline.length > 20) {
        results.push({
          headline,
          url: link ? (link.startsWith('http') ? link : url + link) : url,
          date: new Date().toISOString().split('T')[0],
          scraped: true
        });
      }
    });

    return results.slice(0, 10);
  } catch (err) {
    console.error('Web scrape failed for', url, err.message);
    return [];
  }
}

// ─── Main Scraper Function ───
async function runScraper(enabled = false) {
  if (!enabled) {
    console.log('Scraping disabled. Enable via API or env var.');
    return { status: 'disabled', articles: [] };
  }

  console.log('Starting media scraping...');
  const allArticles = [];

  // Scrape RSS feeds
  for (const [key, source] of Object.entries(SOURCES)) {
    if (source.rss) {
      const articles = await scrapeRSS(key);
      allArticles.push(...articles);
      console.log(`Scraped ${articles.length} from ${source.name} (RSS)`);
    }
  }

  // Scrape web pages (only if explicitly permitted)
  for (const [key, source] of Object.entries(SOURCES)) {
    if (source.selectors && source.url) {
      const articles = await scrapeWeb(source.url, source.selectors);
      allArticles.push(...articles.map(a => ({
        ...a,
        newspaper: source.name,
        sourceType: 'Digital'
      })));
      console.log(`Scraped ${articles.length} from ${source.name} (Web)`);
    }
  }

  console.log(`Total scraped: ${allArticles.length} articles`);
  return { status: 'success', articles: allArticles, count: allArticles.length };
}

module.exports = { runScraper, scrapeRSS, scrapeWeb, SOURCES };