// =================================================================================
// FIXED VERSION - SHORTENER REFERRAL ERROR SOLVED
// =================================================================================

const ADMIN_PASSWORD = "MY_SECRET_PASS_123";
const SHORTENER_DOMAIN = 'nanolinks.in';
const MIN_SHORTENER_TIME = 15; // 15 seconds minimum

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const headers = request.headers;
    const referer = headers.get('Referer') || '';

    // -----------------------------------------------------------------
    // 1. ADMIN LINK GENERATE (NO API CALL)
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

      // Generate unique session
      const sessionId = 'uid_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
      const startTime = Date.now();
      
      // Create session data
      const sessionData = {
        uid: sessionId,
        url: originalUrl,
        start: startTime
      };
      
      // Encode session
      const encodedSession = btoa(JSON.stringify(sessionData));
      
      // Return intermediate link (NOT short link)
      return new Response(JSON.stringify({
        success: true,
        original_url: originalUrl,
        intermediate_link: `${url.origin}/s?sid=${encodeURIComponent(encodedSession)}`,
        note: "Use this link with your shortener manually"
      }), { headers: { "Content-Type": "application/json" } });
    }

    // -----------------------------------------------------------------
    // 2. START PAGE (User directly isse click karega)
    // -----------------------------------------------------------------
    if (path === "/s") {
      const session = url.searchParams.get("sid");
      
      if (!session) {
        return new Response("Invalid session", { status: 400 });
      }

      try {
        const sessionData = JSON.parse(atob(session));
        
        // Create redirect data
        const redirectData = {
          uid: sessionData.uid,
          url: sessionData.url,
          start_time: Date.now() // Start time yahan se
        };
        
        const redirectToken = btoa(JSON.stringify(redirectData));
        
        // Simple page jo user ko shortener pe redirect kare
        return new Response(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Processing...</title>
            <meta http-equiv="refresh" content="2;url=https://${SHORTENER_DOMAIN}/?url=${encodeURIComponent(sessionData.url)}&ref=${encodeURIComponent(redirectToken)}">
            <style>
              body { font-family: Arial; text-align: center; padding: 50px; }
              .loader { border: 5px solid #f3f3f3; border-top: 5px solid #3498db; border-radius: 50%; width: 50px; height: 50px; animation: spin 1s linear infinite; margin: 20px auto; }
              @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            </style>
          </head>
          <body>
            <div class="loader"></div>
            <h3>Processing your request...</h3>
            <p>Redirecting to shortener...</p>
          </body>
          </html>
        `, { headers: { "Content-Type": "text/html" } });
        
      } catch (e) {
        return new Response("Invalid session data", { status: 400 });
      }
    }

    // -----------------------------------------------------------------
    // 3. VERIFY PAGE (Shortener se aane ke baad)
    // -----------------------------------------------------------------
    if (path === "/verify") {
      // Shortener se parameters
      const token = url.searchParams.get("ref") || url.searchParams.get("token");
      const now = Date.now();
      
      if (!token) {
        return renderBlocked("No verification token");
      }

      try {
        const tokenData = JSON.parse(atob(token));
        
        // Check time spent
        const timeSpent = (now - tokenData.start_time) / 1000;
        
        console.log(`User ${tokenData.uid} spent ${timeSpent.toFixed(1)}s`);
        
        if (timeSpent < MIN_SHORTENER_TIME) {
          return renderBlocked(`Too fast! Only ${timeSpent.toFixed(1)} seconds spent. Need ${MIN_SHORTENER_TIME}+ seconds.`);
        }
        
        if (timeSpent > 300) { // 5 minutes max
          return renderBlocked("Session expired (5 minute limit)");
        }
        
        // All checks passed
        return renderSuccessPage(tokenData.url, tokenData.uid, timeSpent);
        
      } catch (e) {
        return renderBlocked("Invalid token");
      }
    }

    // -----------------------------------------------------------------
    // 4. FINAL REDIRECT
    // -----------------------------------------------------------------
    if (path === "/go") {
      const target = url.searchParams.get("to");
      if (target && target.startsWith('http')) {
        return Response.redirect(target, 302);
      }
      return Response.redirect("https://google.com", 302);
    }

    // -----------------------------------------------------------------
    // DEFAULT PAGE
    // -----------------------------------------------------------------
    return new Response(`
      <html>
      <head><title>Link Protection</title></head>
      <body style="text-align:center;padding:50px;">
        <h1>🔗 Time-Based Protection</h1>
        <p>System active. No referral errors.</p>
      </body>
      </html>
    `, { headers: { "Content-Type": "text/html" } });
  }
};

function renderBlocked(reason) {
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
        <h1 style="color:#d32f2f;">🚫 Blocked</h1>
        <p>${reason}</p>
        <p><small>Time verification failed</small></p>
      </div>
    </body>
    </html>
  `, { headers: { "Content-Type": "text/html" } });
}

function renderSuccessPage(targetUrl, uid, timeSpent) {
  return new Response(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Verified ✅</title>
      <style>
        body { font-family: Arial; text-align: center; padding: 50px; background: #f5f5f5; }
        .box { background: white; padding: 40px; border-radius: 10px; display: inline-block; }
        .loader { border: 5px solid #f3f3f3; border-top: 5px solid #4CAF50; border-radius: 50%; width: 50px; height: 50px; animation: spin 1s linear infinite; margin: 20px auto; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      </style>
    </head>
    <body>
      <div class="box">
        <div class="loader"></div>
        <h3>✅ Verification Passed</h3>
        <p>Time spent: <strong>${timeSpent.toFixed(1)} seconds</strong></p>
        <p>ID: ${uid.substring(0, 15)}...</p>
        <p>Redirecting to destination...</p>
      </div>
      <script>
        setTimeout(() => {
          window.location.href = '/go?to=${encodeURIComponent(targetUrl)}';
        }, 2000);
      </script>
    </body>
    </html>
  `, { headers: { "Content-Type": "text/html" } });
}
