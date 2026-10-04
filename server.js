const express = require('express');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Serve static frontend files if served together
app.use(express.static('.'));
const path = require('path');

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});


// Helper to decode base64 strings if they form a valid HTTP URL
function decodeBase64IfUrl(str) {
  try {
    const decoded = Buffer.from(str, 'base64').toString('utf-8');
    if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
      return decoded;
    }
  } catch (e) {
    return null;
  }
  return null;
}

// API endpoint to unshorten/bypass links
app.post('/api/unshorten', async (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    return res.status(400).json({ success: false, error: 'URL tidak valid. Masukkan URL lengkap dengan http:// atau https://' });
  }

  try {
    let currentUrl = url;
    let redirectChain = [];
    let maxSteps = 15; // Batas maksimum pengalihan untuk cegah infinite loop

    while (maxSteps > 0) {
      // 1. Periksa apakah URL mengandung parameter Base64 yang menyembunyikan link asli
      try {
        const parsedUrl = new URL(currentUrl);
        for (const [_, val] of parsedUrl.searchParams.entries()) {
          const decodedVal = decodeBase64IfUrl(val);
          if (decodedVal) {
            currentUrl = decodedVal;
            redirectChain.push(`[Base64 Decoded]: ${currentUrl}`);
            break;
          }
        }
      } catch (e) {
        // Abaikan error parsing URL
      }

      // 2. Kirim HTTP GET Request tanpa otomatis mengikuti redirect (redirect: 'manual')
      const response = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5'
        }
      });

      // 3. Periksa header Location (HTTP 301, 302, 303, 307, 308)
      const location = response.headers.get('location');

      if (location) {
        currentUrl = new URL(location, currentUrl).href;
        redirectChain.push(currentUrl);
        maxSteps--;
      } else {
        // 4. Jika tidak ada header Location, baca body HTML untuk mencari JS redirect atau Meta Refresh
        const html = await response.text();

        // Regex untuk mencari window.location / location.href / location.replace
        const matchJs = html.match(/(?:window\.location(?:\.href)?|location\.href|location\.replace)\s*=\s*["']([^"']+)["']/i);
        // Regex untuk meta refresh tag
        const matchMeta = html.match(/<meta[^>]*http-equiv=["']refresh["'][^>]*content=["'][^"']*url=([^"']+)["']/i);

        let foundUrl = matchJs?.[1] || matchMeta?.[1];

        if (foundUrl) {
          foundUrl = foundUrl.replace(/&amp;/g, '&');
          
          if (!foundUrl.startsWith('http')) {
            foundUrl = new URL(foundUrl, currentUrl).href;
          }

          if (foundUrl !== currentUrl) {
            currentUrl = foundUrl;
            redirectChain.push(`[JS/Meta Redirect]: ${currentUrl}`);
            maxSteps--;
            continue;
          }
        }

        // Jalur pengalihan selesai
        break;
      }
    }

    return res.json({
      success: true,
      originalUrl: url,
      finalUrl: currentUrl,
      chain: redirectChain
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'Gagal mengekstrak URL tujuan: ' + err.message
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Safelink Unshortener API is running' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server Safelink Unshortener berjalan di http://localhost:${PORT}`);
});
