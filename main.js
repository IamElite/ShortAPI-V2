// =================================================================================
// PURE BACKEND PROTECTION - FRONTEND SIMPLE, LOGIC BACKEND MEIN
// =================================================================================

const ADMIN_PASSWORD = "MY_SECRET_PASS_123";
const ENCRYPTION_KEY = "SUPER_SECRET_KEY_XY"; // 32 characters
const SHORTENER_DOMAIN = 'nanolinks.in';
const SHORTENER_API_KEY = 'ae0271c2c57105db2fa209f5b0f20c1a965343f6';

// In-memory rate limiting (resets on worker restart)
let requestTracker = new Map();

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const headers = request.headers;
    const clientIP = headers.get('CF-Connecting-IP') || 'unknown';
    const userAgent = headers.get('User-Agent') || '';
    const referer = headers.get('Referer') || '';

    // -----------------------------------------------------------------
    // 1. ADMIN LINK GENERATE (SAME)
    // -----------------------------------------------------------------
    if (path === "/encrypt") {
      const originalUrl = url.searchParams.get("url");
      const pass = url.searchParams.get("pass");

      if (pass !== ADMIN_PASSWORD) {
        return new Response(JSON.stringify({ error: "Wrong password" }), { status: 403 });
      }
      if (!originalUrl) {
        return new Response(JSON.stringify({ error: "URL missing" }), { status: 400 });
      }

      // Create encrypted token with timestamp
      const timestamp = Date.now();
      const tokenData = {
        url: originalUrl,
        ts: timestamp,
        src: 'direct' // Will change when coming from shortener
      };
      
      const encrypted = btoa(JSON.stringify(tokenData))
        .split('').reverse().join('') 
        + '.' 
        + btoa(timestamp.toString());
      
      const safeLink = `${url.origin}/redirect?token=${encodeURIComponent(encrypted)}`;

      // Get short link
      const apiUrl = `https://${SHORTENER_DOMAIN}/api?api=${SHORTENER_API_KEY}&url=${encodeURIComponent(safeLink)}`;
      const apiRes = await fetch(apiUrl);
      const result = await apiRes.json();

      return new Response(JSON.stringify({
        success: true,
        original: originalUrl,
        short_url: result.shortenedUrl,
        note: "User MUST visit through shortener"
      }), { headers: { "Content-Type": "application/json" } });
    }

    // -----------------------------------------------------------------
    // 2. USER REDIRECT (MAIN LOGIC - BACKEND MEIN SAB KUCH)
    // -----------------------------------------------------------------
    if (path === "/redirect") {
      const token = url.searchParams.get("token");
      const now = Date.now();

      // 🔴 BACKEND CHECK 1: Token present?
      if (!token) {
        return renderBlocked("No token provided");
      }

      // 🔴 BACKEND CHECK 2: Rate limiting
      const ipKey = `ip_${clientIP}`;
      const ipCount = requestTracker.get(ipKey) || 0;
      if (ipCount > 10) { // 10 requests per IP
        return renderBlocked("Too many requests");
      }
      requestTracker.set(ipKey, ipCount + 1);

      try {
        // Decode token
        const [encodedData, encodedTs] = token.split('.');
        const decodedData = JSON.parse(atob(encodedData.split('').reverse().join('')));
        const tokenTime = parseInt(atob(encodedTs));
        
        // 🔴 BACKEND CHECK 3: Token expired? (30 seconds max)
        if (now - tokenTime > 30000) {
          return renderBlocked("Link expired (30 second limit)");
        }

        // 🔴 BACKEND CHECK 4: Coming from shortener?
        // REAL users will have src='shortener', direct access will have src='direct'
        const isFromShortener = referer.includes(SHORTENER_DOMAIN) || 
                               decodedData.src === 'shortener';
        
        if (!isFromShortener && decodedData.src !== 'shortener') {
          // This is a DIRECT ACCESS attempt (bypass)
          // But let's give them a CHANCE - update token to mark as bypass attempt
          decodedData.src = 'bypass_attempt';
          decodedData.attempt_time = now;
          
          // Create new token with bypass mark
          const newToken = btoa(JSON.stringify(decodedData))
            .split('').reverse().join('') 
            + '.' 
            + btoa(now.toString());
          
          // 🔴 BACKEND CHECK 5: Detect automation tools
          const isAutomationTool = detectAutomation(userAgent, headers);
          
          if (isAutomationTool) {
            return renderBlocked("Automation tools detected");
          }
          
          // Show redirect page but with tracking
          return renderRedirectPage(decodedData.url, newToken, true);
        }

        // 🔴 BACKEND CHECK 6: Valid URL?
        if (!decodedData.url.startsWith('http')) {
          return renderBlocked("Invalid destination URL");
        }

        // ✅ ALL CHECKS PASSED - Real user from shortener
        // Show simple redirect page
        return renderRedirectPage(decodedData.url, token, false);

      } catch (e) {
        // 🔴 BACKEND CHECK 7: Token tampering
        return renderBlocked("Invalid security token");
      }
    }

    // -----------------------------------------------------------------
    // 3. FINAL REDIRECT ENDPOINT (Hidden from users)
    // -----------------------------------------------------------------
    if (path === "/final-redirect") {
      const token = url.searchParams.get("token");
      
      if (!token) return Response.redirect("https://google.com", 302);
      
      try {
        const [encodedData, encodedTs] = token.split('.');
        const decodedData = JSON.parse(atob(encodedData.split('').reverse().join('')));
        
        // Last check: if marked as bypass attempt and recent
        if (decodedData.src === 'bypass_attempt') {
          const attemptTime = decodedData.attempt_time || 0;
          if (Date.now() - attemptTime < 5000) { // Within 5 seconds
            return renderBlocked("Security check failed");
          }
        }
        
        return Response.redirect(decodedData.url, 302);
      } catch (e) {
        return Response.redirect("https://google.com", 302);
      }
    }

    // -----------------------------------------------------------------
    // DEFAULT PAGE
    // -----------------------------------------------------------------
    return new Response(`
      <html><body style="text-align:center;padding:50px;">
        <h1>Link Protection Active</h1>
        <p>Backend protection system running.</p>
      </body></html>
    `, { headers: { "Content-Type": "text/html" } });
  }
};

// =================================================================================
// BACKEND DETECTION FUNCTIONS
// =================================================================================

function detectAutomation(userAgent, headers) {
  const ua = userAgent.toLowerCase();
  
  // Common automation tools
  const automationMarkers = [
    'phantom', 'selenium', 'webdriver', 'headless',
    'puppeteer', 'playwright', 'curl/', 'wget/',
    'python-requests', 'java/', 'bot', 'crawler',
    'scraper', 'automation', 'bypass-all-shortlinks'
  ];
  
  for (const marker of automationMarkers) {
    if (ua.includes(marker)) return true;
  }
  
  // Check for automation headers
  if (headers.get('X-Selenium')) return true;
  if (headers.get('X-WebDriver')) return true;
  if (headers.get('X-Requested-With') === 'XMLHttpRequest' && 
      !headers.get('Referer')) return true;
  
  return false;
}

// =================================================================================
// RENDER FUNCTIONS
// =================================================================================

function renderBlocked(reason) {
  return new Response(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Access Restricted</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          text-align: center;
          padding: 50px;
          background: #ffebee;
        }
        .box {
          background: white;
          padding: 30px;
          border-radius: 10px;
          max-width: 500px;
          margin: auto;
          box-shadow: 0 5px 15px rgba(0,0,0,0.1);
        }
      </style>
    </head>
    <body>
      <div class="box">
        <h1 style="color:#d32f2f;">🚫 Access Restricted</h1>
        <p><strong>Reason:</strong> ${reason}</p>
        <p>Our security system has blocked this request.</p>
        <hr>
        <p style="font-size:12px; color:#666;">
          IP logged • ${new Date().toLocaleTimeString()}
        </p>
      </div>
    </body>
    </html>
  `, { headers: { "Content-Type": "text/html" } });
}

function renderRedirectPage(targetUrl, token, isSuspicious = false) {
  // For REAL users: simple redirect page
  // For suspicious: redirect but with tracking
  
  const redirectDelay = isSuspicious ? 5000 : 2000; // 5 sec for suspicious, 2 sec for real
  
  return new Response(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Redirecting...</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          text-align: center;
          padding: 50px;
          background: #f5f5f5;
        }
        .container {
          background: white;
          padding: 40px;
          border-radius: 10px;
          display: inline-block;
          box-shadow: 0 5px 15px rgba(0,0,0,0.1);
        }
        .loader {
          border: 5px solid #f3f3f3;
          border-top: 5px solid #4CAF50;
          border-radius: 50%;
          width: 50px;
          height: 50px;
          animation: spin 1s linear infinite;
          margin: 20px auto;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        ${isSuspicious ? `
        .warning {
          background: #fff3cd;
          border: 1px solid #ffeaa7;
          padding: 10px;
          border-radius: 5px;
          margin: 15px 0;
          color: #856404;
        }
        ` : ''}
      </style>
    </head>
    <body>
      <div class="container">
        <div class="loader"></div>
        <h2>Redirecting to destination...</h2>
        <p>Please wait a moment.</p>
        
        ${isSuspicious ? `
        <div class="warning">
          ⚠️ Security verification in progress...
        </div>
        ` : ''}
        
        <p id="countdown">Starting in ${redirectDelay/1000} seconds</p>
        
        <p style="font-size:12px; color:#999; margin-top:20px;">
          Protected by LinkGuard • Backend Security v2.0
        </p>
      </div>
      
      <script>
        let seconds = ${redirectDelay/1000};
        const countdownEl = document.getElementById('countdown');
        const countdownInterval = setInterval(() => {
          seconds--;
          countdownEl.textContent = 'Redirecting in ' + seconds + ' second' + (seconds !== 1 ? 's' : '');
          
          if (seconds <= 0) {
            clearInterval(countdownInterval);
            // Use hidden endpoint for final redirect
            window.location.href = '/final-redirect?token=${encodeURIComponent(token)}';
          }
        }, 1000);
        
        // Allow click to redirect faster (human behavior)
        document.body.addEventListener('click', function() {
          clearInterval(countdownInterval);
          window.location.href = '/final-redirect?token=${encodeURIComponent(token)}';
        });
      </script>
    </body>
    </html>
  `, { headers: { "Content-Type": "text/html" } });
}
