// =================================================================================
// SIMPLE BYPASS PROTECTION - REAL USERS KE LIYE EASY
// =================================================================================

const ADMIN_PASSWORD = "MY_SECRET_PASS_123";
const ENCRYPTION_KEY = "SUPER_SECRET_KEY_XY"; 
const SHORTENER_DOMAIN = 'nanolinks.in';
const SHORTENER_API_KEY = 'ae0271c2c57105db2fa209f5b0f20c1a965343f6';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const headers = request.headers;
    const userAgent = headers.get('User-Agent') || '';

    // -----------------------------------------------------------------
    // 1. ADMIN LINK GENERATE
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

      // Simple XOR encryption
      const xorEncrypt = (text, key) => {
        let result = "";
        for (let i = 0; i < text.length; i++) {
          result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        return btoa(result);
      };

      const encrypted = xorEncrypt(originalUrl, ENCRYPTION_KEY);
      const safeLink = `${url.origin}/redirect?token=${encodeURIComponent(encrypted)}`;

      // Shortener API call
      const apiUrl = `https://${SHORTENER_DOMAIN}/api?api=${SHORTENER_API_KEY}&url=${encodeURIComponent(safeLink)}`;
      const apiRes = await fetch(apiUrl);
      const result = await apiRes.json();

      return new Response(JSON.stringify({
        success: true,
        original: originalUrl,
        short_url: result.shortenedUrl
      }), { headers: { "Content-Type": "application/json" } });
    }

    // -----------------------------------------------------------------
    // 2. USER REDIRECT (MAIN PAGE)
    // -----------------------------------------------------------------
    if (path === "/redirect") {
      const token = url.searchParams.get("token");

      if (!token) {
        return new Response("Invalid link", { status: 400 });
      }

      // Decrypt token
      const xorDecrypt = (encoded, key) => {
        let text = atob(encoded);
        let result = "";
        for (let i = 0; i < text.length; i++) {
          result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        return result;
      };

      try {
        const targetUrl = xorDecrypt(token, ENCRYPTION_KEY);

        // SIMPLE HONEYPOT TRAP FOR BOTS
        // Real users will NOT see/interact with this
        
        const isLikelyBot = () => {
          const ua = userAgent.toLowerCase();
          
          // Common bot/tool indicators
          const botKeywords = [
            'bypass', 'bot', 'crawler', 'spider', 'scraper',
            'curl', 'wget', 'python', 'java', 'phantom',
            'selenium', 'headless', 'automation'
          ];
          
          // Check for automation tools
          for (const keyword of botKeywords) {
            if (ua.includes(keyword)) return true;
          }
          
          // Check for common bypass extensions
          if (headers.get('X-Bypass') || headers.get('X-Tool')) return true;
          
          return false;
        };

        // If bot detected, show blocked page
        if (isLikelyBot()) {
          return new Response(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>Access Blocked</title>
              <style>
                body { font-family: Arial; text-align: center; padding: 50px; background: #ffebee; }
                .box { background: white; padding: 30px; border-radius: 10px; max-width: 500px; margin: auto; }
              </style>
            </head>
            <body>
              <div class="box">
                <h1>🚫 Access Blocked</h1>
                <p>Automated tools are not allowed.</p>
                <p>Please use a regular browser.</p>
              </div>
            </body>
            </html>
          `, { headers: { "Content-Type": "text/html" } });
        }

        // FOR REAL USERS: Simple redirect page with honeypot trap
        return new Response(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Redirecting...</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              /* HIDDEN HONEYPOT TRAP - Only bots will interact with this */
              .honeypot-trap {
                opacity: 0;
                position: absolute;
                top: -100px;
                left: -100px;
                height: 1px;
                width: 1px;
                overflow: hidden;
              }
              
              /* Main page styling */
              body {
                font-family: Arial, sans-serif;
                text-align: center;
                padding: 50px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
              }
              .container {
                background: rgba(255,255,255,0.95);
                padding: 40px;
                border-radius: 15px;
                display: inline-block;
                color: #333;
              }
              .loader {
                border: 5px solid #f3f3f3;
                border-top: 5px solid #667eea;
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
            </style>
          </head>
          <body>
            <!-- HONEYPOT TRAP: Bots will try to click/focus this -->
            <div class="honeypot-trap">
              <a href="#" id="bot-trap-link" onclick="blockAccess()">Bypass Link</a>
              <input type="hidden" id="bot-trap-input" onfocus="blockAccess()">
            </div>
            
            <!-- MAIN CONTENT: Real users see only this -->
            <div class="container">
              <div class="loader"></div>
              <h2>Redirecting...</h2>
              <p>Please wait while we redirect you to the destination.</p>
              <p id="countdown">Redirecting in 3 seconds</p>
            </div>
            
            <script>
              // Trap function - if triggered, user is likely a bot
              let trapTriggered = false;
              function blockAccess() {
                trapTriggered = true;
                document.body.innerHTML = '<div class="container"><h1>🚫</h1><p>Access blocked by security system.</p></div>';
                return false;
              }
              
              // Auto-redirect for real users
              let seconds = 3;
              const countdownEl = document.getElementById('countdown');
              const countdownInterval = setInterval(() => {
                seconds--;
                countdownEl.textContent = 'Redirecting in ' + seconds + ' second' + (seconds !== 1 ? 's' : '');
                
                if (seconds <= 0) {
                  clearInterval(countdownInterval);
                  // Only redirect if trap wasn't triggered
                  if (!trapTriggered) {
                    window.location.replace("${targetUrl.replace(/"/g, '\\"')}");
                  }
                }
              }, 1000);
              
              // Redirect faster if user clicks anywhere (real user behavior)
              document.body.addEventListener('click', function() {
                if (!trapTriggered) {
                  window.location.replace("${targetUrl.replace(/"/g, '\\"')}");
                }
              });
              
              // Auto-redirect after max 5 seconds (safety net)
              setTimeout(() => {
                if (!trapTriggered) {
                  window.location.replace("${targetUrl.replace(/"/g, '\\"')}");
                }
              }, 5000);
            </script>
          </body>
          </html>
        `, { headers: { "Content-Type": "text/html" } });

      } catch (e) {
        return new Response("Invalid or expired link", { status: 400 });
      }
    }

    // -----------------------------------------------------------------
    // DEFAULT PAGE
    // -----------------------------------------------------------------
    return new Response(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Link Protector</title>
        <style>
          body { font-family: Arial; text-align: center; padding: 50px; }
        </style>
      </head>
      <body>
        <h1>🔗 Link Protection System</h1>
        <p>Simple bypass protection for shorteners</p>
        <p><strong>Admin:</strong> <code>/encrypt?pass=PASSWORD&url=YOUR_URL</code></p>
      </body>
      </html>
    `, { headers: { "Content-Type": "text/html" } });
  }
};
