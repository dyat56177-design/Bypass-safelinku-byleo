const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Tampilkan halaman utama (index.html)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Helper mendekode Base64
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

// Endpoint utama unshorten/bypass
app.post('/api/unshorten', async (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    return res.status(400).json({ success: false, error: 'URL tidak valid.' });
  }

  try {
    let currentUrl = url;
    let redirectChain = [];

    // 1. Coba lewatkan ke API pemintas khusus (Support sfl.gl, safelinkku, adf.ly, dll)
    try {
      const bypassApiUrl = `https://unshorten.me/json/${encodeURIComponent(url)}`;
      const apiRes = await fetch(bypassApiUrl);
      const apiData = await apiRes.json();

      if (apiData && apiData.success && apiData.resolved_url && apiData.resolved_url !== url) {
        currentUrl = apiData.resolved_url;
        redirectChain.push(`[Bypass Engine]: ${currentUrl}`);
      }
    } catch (e) {
      // Jika API eksternal sibuk, lanjut ke pencarian manual
    }

    // 2. Jika belum ketemu link akhir (seperti MediaFire), pelacak manual berjalan
    let maxSteps = 10;
    while (maxSteps > 0 && !currentUrl.includes('mediafire.com') && !currentUrl.includes('drive.google.com') && !currentUrl.includes('mega.nz')) {
      
      // Cek parameter Base64 di URL
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
      } catch (e) {}

      // Lakukan HTTP GET
      const response = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        }
      });

      const location = response.headers.get('location');

      if (location) {
        currentUrl = new URL(location, currentUrl).href;
        redirectChain.push(currentUrl);
        maxSteps--;
      } else {
        const html = await response.text();
        
        // Cari tautan MediaFire / Drive langsung dari dalam tag HTML/JS
        const matchMediafire = html.match(/https?:\/\/(www\.)?mediafire\.com\/[^\s"']+/i);
        const matchDrive = html.match(/https?:\/\/drive\.google\.com\/[^\s"']+/i);
        const matchMega = html.match(/https?:\/\/mega\.nz\/[^\s"']+/i);

        const targetFound = matchMediafire?.[0] || matchDrive?.[0] || matchMega?.[0];

        if (targetFound) {
          currentUrl = targetFound;
          redirectChain.push(`[Target Extracted]: ${currentUrl}`);
        }
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server berjalan di port ${PORT}`);
});
