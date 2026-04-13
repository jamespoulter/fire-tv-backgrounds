#!/usr/bin/env node

// Fetch a high-res company logo suitable for dark backgrounds
// Usage: node fetch-logo.js "Company Name" [domain.com]
// Also available as API: GET /api/logo?company=CompanyName&domain=domain.com

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const BACKGROUNDS_DIR = path.join(__dirname, 'backgrounds');

// Follow redirects and return final response
function fetch(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    proto.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && maxRedirects > 0) {
        const next = new URL(res.headers.location, url).href;
        resolve(fetch(next, maxRedirects - 1));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// Try to guess domain from company name
function guessDomain(company) {
  return company.toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/\s+/g, '') + '.com';
}

// Source 1: Clearbit Logo API (high-res, 512px+)
async function tryClearbit(domain) {
  try {
    const url = `https://logo.clearbit.com/${domain}?size=1024&format=png`;
    const res = await fetch(url);
    if (res.status === 200 && res.body.length > 1000) {
      return { source: 'clearbit', data: res.body, ext: 'png' };
    }
  } catch {}
  return null;
}

// Source 2: Google Favicon service (high-res)
async function tryGoogleFavicon(domain) {
  try {
    const url = `https://www.google.com/s2/favicons?domain=${domain}&sz=256`;
    const res = await fetch(url);
    if (res.status === 200 && res.body.length > 1000) {
      return { source: 'google-favicon', data: res.body, ext: 'png' };
    }
  } catch {}
  return null;
}

// Source 3: Scrape website for og:image, apple-touch-icon, or logo in HTML
async function tryScrape(domain) {
  try {
    const res = await fetch(`https://${domain}`);
    if (res.status !== 200) return null;

    const html = res.body.toString('utf8');

    // Try og:image first (often high-res brand image)
    const ogMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);

    // Try apple-touch-icon (usually 180px+ square logo)
    const appleMatch = html.match(/<link[^>]*rel=["']apple-touch-icon[^"']*["'][^>]*href=["']([^"']+)["']/i);

    // Try any SVG logo link
    const svgMatch = html.match(/<link[^>]*href=["']([^"']*logo[^"']*\.svg)["']/i)
      || html.match(/<img[^>]*src=["']([^"']*logo[^"']*\.svg)["']/i);

    // Try any PNG logo
    const pngMatch = html.match(/<img[^>]*src=["']([^"']*logo[^"']*\.png)["']/i)
      || html.match(/<link[^>]*href=["']([^"']*logo[^"']*\.png)["']/i);

    const candidates = [svgMatch, appleMatch, pngMatch, ogMatch].filter(Boolean);

    for (const match of candidates) {
      let logoUrl = match[1];
      if (logoUrl.startsWith('//')) logoUrl = 'https:' + logoUrl;
      else if (logoUrl.startsWith('/')) logoUrl = `https://${domain}${logoUrl}`;
      else if (!logoUrl.startsWith('http')) logoUrl = `https://${domain}/${logoUrl}`;

      try {
        const logoRes = await fetch(logoUrl);
        if (logoRes.status === 200 && logoRes.body.length > 500) {
          const ct = logoRes.headers['content-type'] || '';
          let ext = 'png';
          if (ct.includes('svg')) ext = 'svg';
          else if (ct.includes('jpeg') || ct.includes('jpg')) ext = 'jpg';
          else if (ct.includes('webp')) ext = 'webp';
          else if (logoUrl.match(/\.svg/i)) ext = 'svg';
          else if (logoUrl.match(/\.jpg|\.jpeg/i)) ext = 'jpg';

          return { source: 'scrape', data: logoRes.body, ext, url: logoUrl };
        }
      } catch {}
    }
  } catch {}
  return null;
}

// Source 4: Brandfetch (free tier, no API key needed for basic logos)
async function tryBrandfetch(domain) {
  try {
    const url = `https://cdn.brandfetch.io/fallback/transparent/theme/dark/h/512/w/1024/icon?c=1id&t=1&domain=${domain}`;
    const res = await fetch(url);
    if (res.status === 200 && res.body.length > 1000) {
      const ct = res.headers['content-type'] || '';
      const ext = ct.includes('svg') ? 'svg' : ct.includes('jpeg') ? 'jpg' : 'png';
      return { source: 'brandfetch', data: res.body, ext };
    }
  } catch {}
  return null;
}

async function fetchLogo(company, domain) {
  if (!domain) {
    domain = guessDomain(company);
  }
  // Clean domain
  domain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');

  console.log(`Fetching logo for "${company}" (${domain})...`);

  // Try sources in order of preference for dark backgrounds
  const sources = [
    { name: 'Brandfetch (dark)', fn: () => tryBrandfetch(domain) },
    { name: 'Website scrape', fn: () => tryScrape(domain) },
    { name: 'Clearbit', fn: () => tryClearbit(domain) },
    { name: 'Google Favicon', fn: () => tryGoogleFavicon(domain) },
  ];

  for (const source of sources) {
    console.log(`  Trying ${source.name}...`);
    const result = await source.fn();
    if (result) {
      const safeName = company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
      const filename = `${safeName}-logo.${result.ext}`;
      const filepath = path.join(BACKGROUNDS_DIR, filename);
      fs.writeFileSync(filepath, result.data);
      console.log(`  ✓ Found via ${result.source} — saved as ${filename} (${(result.data.length / 1024).toFixed(1)}KB)`);
      return { ok: true, source: result.source, filename, size: result.data.length };
    }
  }

  console.log('  ✗ No logo found from any source');
  return { ok: false, error: `No logo found for ${company} (${domain})` };
}

// CLI mode
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('Usage: node fetch-logo.js "Company Name" [domain.com]');
    process.exit(1);
  }
  fetchLogo(args[0], args[1]).then((result) => {
    if (!result.ok) process.exit(1);
  });
}

module.exports = { fetchLogo };
