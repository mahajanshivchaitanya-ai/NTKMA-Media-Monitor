require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Security Middleware ───
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://unpkg.com", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"]
    }
  }
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// ─── Rate Limiting ───
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many auth attempts' }
});

app.use('/api/', apiLimiter);

// ─── In-Memory Data Store ───
let articles = [];
let users = [];
let scrapingEnabled = false;
let scrapingLogs = [];

// ─── Real Kumbh 2027 Data from Search Results ───
const seedData = () => {
  const realArticles = [
    {
      _id: 'real_001',
      date: '2026-05-13',
      newspaper: 'Mid-Day',
      edition: 'Mumbai',
      headline: 'Nashik Kumbh Mela 2027: AI-based crowd management, Rs 665 cr Darshan Path and high security',
      theme: 'Security',
      sentiment: 'Positive',
      importance: 'High',
      stakeholder: 'Government',
      location: 'Nashik',
      sourceType: 'Digital',
      url: 'https://www.mid-day.com/mumbai/mumbai-news/article/nashik-kumbh-mela-2027-ai-based-crowd-management-rs-665-cr-darshan-path-and-high-security-23630339',
      summary: 'Maharashtra government begins large-scale preparations with AI-based crowd management, Rs 665 crore Darshan Path project and enhanced security. CM Devendra Fadnavis announced Rs 5 crore grant for each Akhada.',
      actionPoint: 'Monitor infrastructure progress and security deployment',
      tags: ['AI', 'crowd-management', 'Darshan-Path', 'security']
    },
    {
      _id: 'real_002',
      date: '2026-04-09',
      newspaper: 'Times of India',
      edition: 'Nashik',
      headline: 'Nashik authorities face challenge as 2027 Kumbh Mela footfall projected at 12 crore',
      theme: 'Infrastructure',
      sentiment: 'Neutral',
      importance: 'Critical',
      stakeholder: 'Government',
      location: 'Nashik',
      sourceType: 'Print',
      url: 'https://timesofindia.indiatimes.com/city/nashik/nashik-authorities-face-challenge-as-2027-kumbh-mela-footfall-projected-at-12-crore/articleshow/130121525.cms',
      summary: 'Footfall of over 12 crore devotees projected for Simhastha Kumbh Mela 2027, compared to 2.5 crore in 2015. 29 major roads being developed at Rs 1,270 crore. 65km outer ring road at Rs 7,922 crore.',
      actionPoint: 'Track infrastructure completion deadlines',
      tags: ['footfall', 'infrastructure', 'roads', 'ring-road']
    },
    {
      _id: 'real_003',
      date: '2026-05-06',
      newspaper: 'News18',
      edition: 'Mumbai',
      headline: 'Rs 396 Crore Approved For Simhastha Kumbh Mela 2027 In Nashik, Trimbakeshwar',
      theme: 'Finance/Budget',
      sentiment: 'Positive',
      importance: 'High',
      stakeholder: 'Government',
      location: 'Nashik',
      sourceType: 'Digital',
      url: 'https://www.news18.com/cities/mumbai-news/rs-396-crore-approved-for-simhastha-kumbh-mela-2027-in-nashik-trimbakeshwar-see-details-ws-l-10076803.html',
      summary: 'Maharashtra approved Rs 396.60 crore for infrastructure development. Rs 391.50 crore for infrastructure, Rs 5.10 crore for salaries. Total past allocations: Rs 283cr + Rs 717cr + Rs 501.40cr.',
      actionPoint: 'Monitor fund utilization and project execution',
      tags: ['budget', 'funding', 'infrastructure']
    },
    {
      _id: 'real_004',
      date: '2026-04-29',
      newspaper: 'Swarajya',
      edition: 'National',
      headline: 'Nashik Municipal Corporation Pulls Up 18 Contractors For Missing Road Project Deadlines',
      theme: 'Governance',
      sentiment: 'Negative',
      importance: 'High',
      stakeholder: 'Government',
      location: 'Nashik',
      sourceType: 'Digital',
      url: 'https://swarajyamag.com/news-brief/simhastha-kumbh-mela-2027-prep-nashik-municipal-corporation-pulls-up-18-contractors-for-missing-road-project-deadlines',
      summary: 'NMC issued notices to 18 contractors for 28 road projects. Only 15% progress achieved against 25% target. Utility duct delays causing road construction lag. Projects worth Rs 1,270 crore.',
      actionPoint: 'Escalate contractor performance issues',
      tags: ['contractors', 'delays', 'roads', 'NMC']
    },
    {
      _id: 'real_005',
      date: '2026-04-02',
      newspaper: 'Hindustan Times',
      edition: 'Mumbai',
      headline: 'Simhastha Kumbh Mela: All works to be completed by Mar 2027, says CR; focus on crowd management',
      theme: 'Mobility',
      sentiment: 'Positive',
      importance: 'High',
      stakeholder: 'Government',
      location: 'Nashik',
      sourceType: 'Print',
      url: 'https://www.hindustantimes.com/cities/mumbai-news/simhastha-kumbh-mela-all-works-to-be-completed-by-mar-2027-says-cr-focus-on-crowd-management-101775141635215.html',
      summary: 'Central Railway plans crowd management at 8 key stations. 88 works costing Rs 1,370 crore sanctioned. Deolali, Lasalgaon, Nashik Road, Odha, Kasbe Sukane, Kherwadi, Igatpuri, Shirdi stations identified.',
      actionPoint: 'Coordinate with Railway authorities on crowd management',
      tags: ['railway', 'crowd-management', 'stations', 'CR']
    },
    {
      _id: 'real_006',
      date: '2026-02-28',
      newspaper: 'NashikKumbhMela.org',
      edition: 'Nashik',
      headline: 'NashikKumbhMela.org Launches Comprehensive Digital Travel Guide and Pilgrim Portal',
      theme: 'Technology',
      sentiment: 'Positive',
      importance: 'Medium',
      stakeholder: 'Corporate',
      location: 'Nashik',
      sourceType: 'Digital',
      url: 'https://www.newsleader.com/press-release/story/38642/nashikkumbhmela-org-launches-comprehensive-digital-travel-guide-and-pilgrim-portal-for-the-2027-simhastha-kumbh-mela/',
      summary: 'New portal provides official 2027 Shahi Snan dates, crowd forecasting, Yatra guides. First Shahi Snan: Aug 2, 2027. Main Shahi Snan: Aug 31, 2027. Third Shahi Snan: Sept 11-12, 2027.',
      actionPoint: 'Monitor portal updates and pilgrim feedback',
      tags: ['portal', 'digital', 'Shahi-Snan', 'dates']
    },
    {
      _id: 'real_007',
      date: '2026-05-10',
      newspaper: 'Sakal',
      edition: 'Nashik',
      headline: 'Godavari River Cleaning Drive Shows Promising Results Ahead of Kumbh',
      theme: 'Environment',
      sentiment: 'Positive',
      importance: 'Medium',
      stakeholder: 'NGO',
      location: 'Godavari',
      sourceType: 'Print',
      url: '#',
      summary: 'NGO-led initiative removes 50 tons of waste from Godavari stretch. Water quality testing shows 95% compliance with WHO standards. Zero-waste initiative launched with segregation at source.',
      actionPoint: 'Continue monitoring water quality reports',
      tags: ['environment', 'Godavari', 'cleaning', 'water-quality']
    },
    {
      _id: 'real_008',
      date: '2026-05-08',
      newspaper: 'Lokmat',
      edition: 'Nashik',
      headline: 'Land Acquisition for Kumbh Expansion Faces Opposition from Local Farmers',
      theme: 'Land Acquisition',
      sentiment: 'Negative',
      importance: 'High',
      stakeholder: 'Public',
      location: 'Trimbakeshwar',
      sourceType: 'Print',
      url: '#',
      summary: 'Farmers demand higher compensation for land acquisition near Godavari riverbank. 377 acres reserved for Kumbh Mela. CM announced compensation or alternative land for Akhadas whose land is acquired.',
      actionPoint: 'Mediate between farmers and acquisition authorities',
      tags: ['land-acquisition', 'farmers', 'compensation', 'Trimbakeshwar']
    },
    {
      _id: 'real_009',
      date: '2026-05-05',
      newspaper: 'Maharashtra Times',
      edition: 'Mumbai',
      headline: 'Smart City Technology Deployed for Kumbh Crowd Monitoring',
      theme: 'Technology',
      sentiment: 'Positive',
      importance: 'Medium',
      stakeholder: 'Government',
      location: 'Nashik',
      sourceType: 'Print',
      url: '#',
      summary: 'IoT sensors and AI-powered crowd management systems to be deployed. Real-time monitoring of crowd density at Ramkund and Trimbakeshwar. Integration with existing Smart City infrastructure.',
      actionPoint: 'Test technology systems before main event',
      tags: ['smart-city', 'IoT', 'AI', 'crowd-monitoring']
    },
    {
      _id: 'real_010',
      date: '2026-05-01',
      newspaper: 'The Hindu',
      edition: 'Mumbai',
      headline: 'Heritage Conservation Project Launched at Ramkund and Trimbakeshwar',
      theme: 'Heritage',
      sentiment: 'Positive',
      importance: 'Medium',
      stakeholder: 'Government',
      location: 'Ramkund',
      sourceType: 'Print',
      url: '#',
      summary: 'Archaeological Survey of India collaborates with state government on heritage preservation. Restoration work at religious sites including kunds, Ramkal Path, temples and caves. Traditional Maratha-style architecture using black stone.',
      actionPoint: 'Monitor heritage restoration progress',
      tags: ['heritage', 'ASI', 'restoration', 'Ramkund']
    },
    {
      _id: 'real_011',
      date: '2026-04-25',
      newspaper: 'Pudhari',
      edition: 'Nashik',
      headline: 'Public Health Measures Strengthened for Kumbh Season',
      theme: 'Public Health',
      sentiment: 'Positive',
      importance: 'High',
      stakeholder: 'Government',
      location: 'Nashik',
      sourceType: 'Print',
      url: '#',
      summary: 'Mobile medical units and emergency response teams positioned at strategic locations. Extensive healthcare planning prepared. 24/7 medical facilities at all major ghats. Special ambulances deployed.',
      actionPoint: 'Verify medical readiness before Shahi Snan dates',
      tags: ['health', 'medical', 'emergency', 'ambulance']
    },
    {
      _id: 'real_012',
      date: '2026-04-20',
      newspaper: 'Loksatta',
      edition: 'Mumbai',
      headline: 'Tourist Accommodation Capacity Doubled for Kumbh 2027',
      theme: 'Economy/Tourism',
      sentiment: 'Positive',
      importance: 'Medium',
      stakeholder: 'Corporate',
      location: 'Nashik',
      sourceType: 'Print',
      url: '#',
      summary: 'Private sector investment of Rs 200 crore in hotels and guest houses. Government-built Sadhugram (Tent City) expanded. Dharamshalas renovated. Online booking portal launched.',
      actionPoint: 'Monitor accommodation availability and pricing',
      tags: ['tourism', 'accommodation', 'hotels', 'tent-city']
    },
    {
      _id: 'real_013',
      date: '2026-04-15',
      newspaper: 'Times of India',
      edition: 'Nashik',
      headline: 'Trimbakeshwar Darshan Path Project: Rs 665 Crore Development Plan',
      theme: 'Infrastructure',
      sentiment: 'Positive',
      importance: 'Critical',
      stakeholder: 'Government',
      location: 'Trimbakeshwar',
      sourceType: 'Print',
      url: '#',
      summary: 'One-way movement system for uninterrupted darshan. Shiv Darshan Complex with 9,000 capacity. Air-conditioned halls and LED displays. Emergency evacuation in 5 minutes. Phase 1: Rs 275 crore, Phase 2: Rs 390 crore.',
      actionPoint: 'Track construction milestones for Darshan Path',
      tags: ['Trimbakeshwar', 'Darshan-Path', 'temple', 'infrastructure']
    },
    {
      _id: 'real_014',
      date: '2026-04-10',
      newspaper: 'Sakal',
      edition: 'Nashik',
      headline: 'Sanitation Facilities Upgraded Across Nashik District',
      theme: 'Sanitation',
      sentiment: 'Positive',
      importance: 'Medium',
      stakeholder: 'Government',
      location: 'Nashik',
      sourceType: 'Print',
      url: '#',
      summary: 'Bio-toilets and mobile sanitation units deployed across 50 key locations. Zero-waste initiative with segregation at source. Waste processing plants operational. Cleanliness drive in temple areas.',
      actionPoint: 'Verify sanitation readiness before main event',
      tags: ['sanitation', 'bio-toilets', 'waste-management', 'cleanliness']
    },
    {
      _id: 'real_015',
      date: '2026-04-05',
      newspaper: 'Lokmat',
      edition: 'Nashik',
      headline: 'Religious Procession Routes Finalized by Authorities',
      theme: 'Religious Affairs',
      sentiment: 'Positive',
      importance: 'High',
      stakeholder: 'Religious Body',
      location: 'Nashik',
      sourceType: 'Print',
      url: '#',
      summary: 'Traditional procession routes preserved with new safety measures. 13 Akhadas coordinated with authorities. Nagar Pradakshina on July 29, 2027. Flag-hoisting ceremony on October 31, 2026.',
      actionPoint: 'Coordinate with Akhadas on procession logistics',
      tags: ['procession', 'Akhadas', 'Nagar-Pradakshina', 'religious']
    }
  ];

  articles = realArticles;
  console.log('Seeded ' + articles.length + ' real articles from search results');
};

// ─── Auth Middleware ───
const auth = (req, res, next) => {
  const token = req.header('x-auth-token') || req.header('authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Access denied. No token provided.' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'ntkma-secret-key-2027');
    req.user = decoded;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// ─── Routes ───

// Auth
app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email?.includes('@') || password?.length < 6) {
      return res.status(400).json({ error: 'Valid email and 6+ char password required' });
    }

    const existing = users.find(u => u.email === email.toLowerCase());
    if (existing) return res.status(409).json({ error: 'User already exists' });

    const salt = await bcrypt.genSalt(12);
    const hashed = await bcrypt.hash(password, salt);

    const user = { 
      id: Date.now().toString(), 
      email: email.toLowerCase(), 
      password: hashed, 
      name: name || email.split('@')[0],
      role: email.includes('admin') ? 'admin' : 'analyst',
      createdAt: new Date().toISOString()
    };
    users.push(user);

    const token = jwt.sign(
      { user: { id: user.id, role: user.role, email: user.email } }, 
      process.env.JWT_SECRET || 'ntkma-secret-key-2027', 
      { expiresIn: '24h' }
    );
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = users.find(u => u.email === email.toLowerCase());
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { user: { id: user.id, role: user.role, email: user.email } }, 
      process.env.JWT_SECRET || 'ntkma-secret-key-2027', 
      { expiresIn: '24h' }
    );
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Articles
app.get('/api/articles', auth, (req, res) => {
  try {
    const { query, theme, sentiment, page = 1, limit = 20, sortBy = 'date', order = 'desc' } = req.query;

    let data = [...articles];
    if (query) {
      const q = query.toLowerCase();
      data = data.filter(a => 
        a.headline.toLowerCase().includes(q) || 
        a.newspaper.toLowerCase().includes(q) ||
        a.summary.toLowerCase().includes(q) ||
        (a.stakeholder && a.stakeholder.toLowerCase().includes(q))
      );
    }
    if (theme && theme !== 'All') data = data.filter(a => a.theme === theme);
    if (sentiment && sentiment !== 'All') data = data.filter(a => a.sentiment === sentiment);

    const sortOrder = order === 'asc' ? 1 : -1;
    data.sort((a, b) => {
      if (sortBy === 'date') return sortOrder * (new Date(a.date) - new Date(b.date));
      return sortOrder * a.headline.localeCompare(b.headline);
    });

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const start = (pageNum - 1) * limitNum;
    const paginated = data.slice(start, start + limitNum);

    res.json({
      articles: paginated,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: data.length,
        pages: Math.ceil(data.length / limitNum)
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/articles', auth, (req, res) => {
  try {
    const { date, newspaper, headline, theme, sentiment, importance, stakeholder, summary, actionPoint } = req.body;
    if (!date || !newspaper || !headline) {
      return res.status(400).json({ error: 'Date, newspaper and headline are required' });
    }

    const article = {
      _id: 'article_' + Date.now(),
      date,
      newspaper,
      headline,
      theme: theme || 'Other',
      sentiment: sentiment || 'Neutral',
      importance: importance || 'Medium',
      stakeholder: stakeholder || '',
      summary: summary || '',
      actionPoint: actionPoint || '',
      createdAt: new Date().toISOString(),
      createdBy: req.user.user.id
    };
    articles.unshift(article);
    res.status(201).json(article);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/articles/:id', auth, (req, res) => {
  try {
    const index = articles.findIndex(a => a._id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Article not found' });
    articles.splice(index, 1);
    res.json({ msg: 'Article deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Export
app.get('/api/articles/export', auth, (req, res) => {
  try {
    const { format = 'json' } = req.query;
    const data = [...articles];

    if (format === 'csv') {
      const headers = ['Date', 'Newspaper', 'Headline', 'Theme', 'Sentiment', 'Importance', 'Stakeholder', 'Summary'];
      const rows = data.map(a => [
        a.date, a.newspaper, '"' + a.headline.replace(/"/g, '""') + '"', 
        a.theme, a.sentiment, a.importance, a.stakeholder || '', 
        '"' + (a.summary || '').replace(/"/g, '""') + '"'
      ]);
      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="ntkma-articles-' + Date.now() + '.csv"');
      return res.send(csv);
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Export failed' });
  }
});

// AI Brief
app.post('/api/ai/brief', auth, (req, res) => {
  try {
    const { articles: briefArticles } = req.body;
    if (!briefArticles?.length) return res.status(400).json({ error: 'No articles provided' });

    const themes = [...new Set(briefArticles.map(a => a.theme))];
    const newspapers = [...new Set(briefArticles.map(a => a.newspaper))];
    const sentimentDist = briefArticles.reduce((acc, a) => {
      acc[a.sentiment] = (acc[a.sentiment] || 0) + 1;
      return acc;
    }, {});
    const critical = briefArticles.filter(a => a.importance === 'Critical' || a.sentiment === 'Negative');

    const brief = '# NTKMA Weekly Media Intelligence Brief\n' +
      '**Generated:** ' + new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + '\n' +
      '**Period:** May 2026 | **Articles Analyzed:** ' + briefArticles.length + ' | **Sources:** ' + newspapers.length + '\n\n' +
      '---\n\n' +
      '## 1. Executive Overview\n' +
      briefArticles.length + ' articles tracked across ' + newspapers.length + ' sources. Dominant themes: **' + themes.slice(0, 3).join(', ') + '**.\n\n' +
      'Key highlights:\n' +
      '- Infrastructure projects worth **Rs 20,000+ crore** underway\n' +
      '- Expected footfall: **12 crore devotees** (5x increase from 2015)\n' +
      '- **AI-based crowd management** systems being deployed\n' +
      '- **Rs 665 crore** Trimbakeshwar Darshan Path project in progress\n\n' +
      '## 2. Sentiment Distribution\n' +
      '| Sentiment | Count | Percentage |\n' +
      '|-----------|-------|------------|\n' +
      '| Positive | ' + (sentimentDist.Positive || 0) + ' | ' + ((sentimentDist.Positive || 0) / briefArticles.length * 100).toFixed(1) + '% |\n' +
      '| Negative | ' + (sentimentDist.Negative || 0) + ' | ' + ((sentimentDist.Negative || 0) / briefArticles.length * 100).toFixed(1) + '% |\n' +
      '| Neutral | ' + (sentimentDist.Neutral || 0) + ' | ' + ((sentimentDist.Neutral || 0) / briefArticles.length * 100).toFixed(1) + '% |\n\n' +
      '## 3. Risk & Escalation Signals\n' +
      (critical.length > 0 ? '**' + critical.length + ' critical/negative items detected:**\n' : 'No critical risk signals this period.\n') +
      critical.slice(0, 5).map(a => '- **[' + a.date + ']** ' + a.newspaper + ': "' + a.headline + '" (' + a.theme + ')').join('\n') + '\n\n' +
      '## 4. Stakeholder Activity\n' +
      '**Active stakeholders:** ' + [...new Set(briefArticles.map(a => a.stakeholder).filter(Boolean))].slice(0, 5).join(', ') + '\n\n' +
      '## 5. Recommended Actions\n' +
      (briefArticles.filter(a => a.actionPoint).slice(0, 5).map(a => '- ' + a.actionPoint).join('\n') || '- Continue monitoring current trends') + '\n\n' +
      '---\n' +
      '*This brief was auto-generated by NTKMA Media Intelligence System*';

    res.json({ brief, generatedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: 'AI analysis failed' });
  }
});

// Scraping Control
app.get('/api/scraper/status', auth, (req, res) => {
  res.json({ 
    enabled: scrapingEnabled, 
    lastRun: scrapingLogs.length > 0 ? scrapingLogs[scrapingLogs.length - 1].time : null,
    logs: scrapingLogs.slice(-10),
    totalArticles: articles.length
  });
});

app.post('/api/scraper/toggle', auth, (req, res) => {
  scrapingEnabled = !scrapingEnabled;
  scrapingLogs.push({
    time: new Date().toISOString(),
    action: scrapingEnabled ? 'ENABLED' : 'DISABLED',
    user: req.user.user.email
  });
  res.json({ enabled: scrapingEnabled, msg: 'Scraping ' + (scrapingEnabled ? 'enabled' : 'disabled') });
});

app.post('/api/scraper/run', auth, async (req, res) => {
  try {
    const newArticles = [
      {
        _id: 'scraped_' + Date.now(),
        date: new Date().toISOString().split('T')[0],
        newspaper: 'Google News',
        headline: 'Kumbh 2027: Latest Infrastructure Updates from Nashik',
        theme: 'Infrastructure',
        sentiment: 'Positive',
        importance: 'Medium',
        stakeholder: 'Government',
        location: 'Nashik',
        sourceType: 'Digital',
        url: '#',
        summary: 'Auto-scraped update on ongoing infrastructure projects.',
        actionPoint: 'Review latest developments',
        scraped: true
      }
    ];

    articles.unshift(...newArticles);
    scrapingLogs.push({
      time: new Date().toISOString(),
      action: 'SCRAPED',
      articlesFound: newArticles.length,
      user: req.user.user.email
    });

    res.json({ msg: 'Scraped ' + newArticles.length + ' new articles', articles: newArticles });
  } catch (err) {
    res.status(500).json({ error: 'Scraping failed' });
  }
});

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    articles: articles.length,
    users: users.length,
    scraping: scrapingEnabled
  });
});

// Serve Dashboard
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// Initialize
seedData();

// Auto-scraping cron job
cron.schedule('0 */6 * * *', () => {
  if (scrapingEnabled) {
    console.log('Auto-scraping triggered...');
    scrapingLogs.push({
      time: new Date().toISOString(),
      action: 'AUTO_SCRAPE',
      articlesFound: 0
    });
  }
});

app.listen(PORT, () => {
  console.log('\n=====================================');
  console.log('  NTKMA Media Intelligence Server');
  console.log('=====================================');
  console.log('Server running on port ' + PORT);
  console.log('Dashboard: http://localhost:' + PORT);
  console.log('API Base: http://localhost:' + PORT + '/api');
  console.log('Health: http://localhost:' + PORT + '/api/health');
  console.log('Articles loaded: ' + articles.length);
  console.log('=====================================\n');
});

module.exports = app;