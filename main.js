// =================================================================================
// UNIQUE ID + TIME TRACKING SYSTEM
// Real users ke liye simple, Bots ke liye block
// =================================================================================

const ADMIN_PASSWORD = "MY_SECRET_PASS_123";
const ENCRYPTION_KEY = "SUPER_SECRET_KEY_XY"; // 32 characters
const SHORTENER_DOMAIN = 'nanolinks.in';
const SHORTENER_API_KEY = 'ae0271c2c57105db2fa209f5b0f20c1a965343f6';

// Minimum time user should spend on shortener (seconds)
const MIN_SHORTENER_TIME = 15; // 15 seconds minimum
const MAX_SHORTENER_TIME = 300; // 5 minutes maximum

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const headers = request.headers;
    const clientIP = headers.get('CF-Connecting-IP') || '';

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

      // Generate unique session data
      const sessionId = generateUniqueId();
      const startTime = Date.now();
      
      // Store in encrypted token
      const sessionData = {
        uid: sessionId,
        url: originalUrl,
        start: startTime,
        ip: clientIP.substring(0, 15)
      };
      
      // Simple encryption
      const encrypted = btoa(JSON.stringify(sessionData));
      const safeLink = `${url.origin}/start?session=${encodeURIComponent(encrypted)}`;

      // Get short link
      const apiUrl = `https://${SHORTENER_DOMAIN}/api?api=${SHORTENER_API_KEY}&url=${encodeURIComponent(safeLink)}`;
      const apiRes = await fetch(apiUrl);
      const result = await apiRes.json();

      return new Response(JSON.stringify({
        success: true,
        original: originalUrl,
        short_url: result.shortenedUrl,
        session_id: sessionId
      }), { headers: { "Content-Type": "application/json" } });
    }

    // -----------------------------------------------------------------
    // 2. START PAGE (Shortener se pehle)
    // -----------------------------------------------------------------
    if (path === "/start") {
      const session = url.searchParams.get("session");
      
      if (!session) {
        return new Response("Invalid session", { status: 400 });
      }

      try {
        const sessionData = JSON.parse(atob(session));
        
        // Create redirect token with start time
        const redirectToken = btoa(JSON.stringify({
          uid: sessionData.uid,
          url: sessionData.url,
          start_time: sessionData.start,
          end_time: Date.now() // Current time as user leaves start page
        }));
        
        // Redirect to shortener IMMEDIATELY
        return Response.redirect(`https://${SHORTENER_DOMAIN}/verify?token=${encodeURIComponent(redirectToken)}`, 302);
        
      } catch (e) {
        return new Response("Invalid session data", { status: 400 });
      }
    }

    // -----------------------------------------------------------------
    // 3. REDIRECT PAGE (Shortener ke baad)
    // -----------------------------------------------------------------
    if (path === "/redirect") {
      const token = url.searchParams.get("token");
      const now = Date.now();
      
      if (!token) {
        return renderBlocked("No token found");
      }

      try {
        const tokenData = JSON.parse(atob(token));
        
        // 🔴 CRITICAL CHECK 1: Unique ID exists?
        if (!tokenData.uid || !tokenData.start_time) {
          return renderBlocked("Invalid session ID");
        }
        
        // 🔴 CRITICAL CHECK 2: Calculate time spent
        const timeSpent = (now - tokenData.start_time) / 1000; // in seconds
        
        console.log(`User ${tokenData.uid} spent ${timeSpent.toFixed(1)} seconds`);
        
        // 🔴 CRITICAL CHECK 3: Time validation
        if (timeSpent < MIN_SHORTENER_TIME) {
          // Too fast - likely a bot/tool
          return renderBlocked(`Too fast! You spent only ${timeSpent.toFixed(1)} seconds. Minimum required: ${MIN_SHORTENER_TIME} seconds.`);
        }
        
        if (timeSpent > MAX_SHORTENER_TIME) {
          // Too slow - session expired
          return renderBlocked(`Session expired. You took ${timeSpent.toFixed(1)} seconds. Maximum allowed: ${MAX_SHORTENER_TIME} seconds.`);
        }
        
        // 🔴 CRITICAL CHECK 4: URL valid?
        if (!tokenData.url.startsWith('http')) {
          return renderBlocked("Invalid destination URL");
        }
        
        // ✅ ALL CHECKS PASSED - Real user
        return renderRedirectPage(tokenData.url, tokenData.uid, timeSpent);
        
      } catch (e) {
        return renderBlocked("Invalid token data");
      }
    }

    // -----------------------------------------------------------------
    // 4. FINAL REDIRECT (Hidden endpoint)
    // -----------------------------------------------------------------
    if (path === "/final") {
      const token = url.searchParams.get("token");
      
      if (!token) {
        return Response.redirect("https://google.com", 302);
      }
      
      try {
        const tokenData = JSON.parse(atob(token));
        return Response.redirect(tokenData.url, 302);
      } catch (e) {
        return Response.redirect("https://google.com", 302);
      }
    }

    // -----------------------------------------------------------------
    // DEFAULT PAGE
    // -----------------------------------------------------------------
    return new Response(`
      <html>
      <head><title>Link Protection</title></head>
      <body style="text-align:center;padding:50px;">
        <h1>🔗 Unique ID Protection System</h1>
        <p>Each user gets a unique ID that tracks shortener time.</p>
      </body>
      </html>
    `, { headers: { "Content-Type": "text/html" } });
  }
};

// =================================================================================
// HELPER FUNCTIONS
// =================================================================================

function generateUniqueId() {
  return 'uid_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
}

function renderBlocked(reason) {
  return new Response(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Access Blocked</title>
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
          border-left: 10px solid #f44336;
        }
      </style>
    </head>
    <body>
      <div class="box">
        <h1 style="color:#d32f2f;">🚫 Access Blocked</h1>
        <p><strong>Security Check Failed:</strong></p>
        <p>${reason}</p>
        <hr>
        <p style="color:#666; font-size:14px;">
          System detected unusual activity.<br>
          Unique ID verification failed.
        </p>
      </div>
    </body>
    </html>
  `, { headers: { "Content-Type": "text/html" } });
}

function renderRedirectPage(targetUrl, uid, timeSpent) {
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
        .success-badge {
          background: #4CAF50;
          color: white;
          padding: 5px 15px;
          border-radius: 20px;
          display: inline-block;
          margin: 10px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="loader"></div>
        <h2>✅ Verification Successful!</h2>
        
        <div class="success-badge">
          User ID: ${uid.substring(0, 10)}...
        </div>
        
        <p>Time spent on shortener: <strong>${timeSpent.toFixed(1)} seconds</strong></p>
        <p>Redirecting to destination...</p>
        
        <p id="countdown">Starting in 3 seconds</p>
        
        <p style="font-size:12px; color:#999; margin-top:20px;">
          Unique ID verified • Time validation passed
        </p>
      </div>
      
      <script>
        // Create final redirect token
        const finalToken = btoa(JSON.stringify({
          url: "${targetUrl.replace(/"/g, '\\"')}",
          uid: "${uid}"
        }));
        
        let seconds = 3;
        const countdownEl = document.getElementById('countdown');
        const countdownInterval = setInterval(() => {
          seconds--;
          countdownEl.textContent = 'Redirecting in ' + seconds + ' second' + (seconds !== 1 ? 's' : '');
          
          if (seconds <= 0) {
            clearInterval(countdownInterval);
            window.location.href = '/final?token=' + encodeURIComponent(finalToken);
          }
        }, 1000);
        
        // Allow click to redirect faster
        document.body.addEventListener('click', function() {
          clearInterval(countdownInterval);
          window.location.href = '/final?token=' + encodeURIComponent(finalToken);
        });
      </script>
    </body>
    </html>
  `, { headers: { "Content-Type": "text/html" } });
}
