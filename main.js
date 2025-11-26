// =================================================================================
// VERSION 2.3 - GENUINE USER FIX (SMART CHECK)
// Update Log:
// - Fixed "Genuine User Blocked" issue.
// - Added "Manual Verify" button for empty referers (instead of blocking).
// - Strict blocking only for confirmed wrong referers.
// =================================================================================

// --- CONFIGURATION (EDIT HERE) ---

// 1. Admin Password
const ADMIN_PASSWORD = "MY_SECRET_PASS_123"; 

// 2. Encryption Key
const SECRET_KEY = "SUPER_SECRET_KEY_XY"; 

// 3. SHORTENER CONFIGURATION
const SHORTENER_DOMAIN = 'nanolinks.in'; 
const SHORTENER_API_KEY = 'ae0271c2c57105db2fa209f5b0f20c1a965343f6';

// 4. SECURITY LEVEL
// true = Agar referer gayab hai to "Click to Verify" button dikhao (Safe & Secure)
// false = Agar referer gayab hai to seedha Jane do (Less Secure but User Friendly)
const SHOW_VERIFY_BUTTON_ON_EMPTY = true; 

// 5. AUTO SETUP (DO NOT TOUCH)
const getFixedBaseUrl = () => {
    let url = SHORTENER_DOMAIN.trim();
    if (!url.startsWith("http")) url = "https://" + url;
    if (url.endsWith("/")) url = url.slice(0, -1);
    return url;
};
const BASE_URL = getFixedBaseUrl();
const ALLOWED_REFERER = new URL(BASE_URL).hostname;

// =================================================================================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const requestHeaders = request.headers;

    // -----------------------------------------------------------------
    // CASE 1: LINK GENERATE KARNA (ADMIN SIDE)
    // -----------------------------------------------------------------
    if (path === "/encrypt") {
      const originalUrl = url.searchParams.get("url");
      const pass = url.searchParams.get("pass");

      if (pass !== ADMIN_PASSWORD) return new Response(JSON.stringify({ status: "error", msg: "❌ Wrong Password" }), { status: 403 });
      if (!originalUrl) return new Response(JSON.stringify({ status: "error", msg: "❌ URL Missing" }), { status: 400 });

      const encrypted = xorEncrypt(originalUrl, SECRET_KEY);
      const safeWorkerLink = `${url.origin}/redirect?token=${encodeURIComponent(encrypted)}`;

      try {
        const apiUrl = `${BASE_URL}/api?api=${SHORTENER_API_KEY}&url=${encodeURIComponent(safeWorkerLink)}`;
        const apiResponse = await fetch(apiUrl);
        const result = await apiResponse.json();

        if (result.status === "error" || (result.status && result.status !== "success")) {
          return new Response(JSON.stringify({ status: "error", msg: `Shortener Error: ${result.message}` }), { status: 500 });
        }

        return new Response(JSON.stringify({
          status: "success",
          original: originalUrl,
          protected_link: safeWorkerLink,
          final_short_link: result.shortenedUrl
        }, null, 2), { headers: { "Content-Type": "application/json" } });

      } catch (e) {
        return new Response(JSON.stringify({ status: "error", msg: `API Failed: ${e.message}` }), { status: 500 });
      }
    }

    // -----------------------------------------------------------------
    // CASE 2: USER REDIRECT (PUBLIC SIDE)
    // -----------------------------------------------------------------
    if (path === "/redirect") {
      const token = url.searchParams.get("token");
      if (!token) return new Response("Invalid Request", { status: 400 });

      // --- SMART SECURITY CHECK ---
      const referer = requestHeaders.get('Referer') || "";
      const isMissingReferer = referer === "";
      const isWrongReferer = !isMissingReferer && !referer.includes(ALLOWED_REFERER);

      try {
        const targetUrl = xorDecrypt(token, SECRET_KEY);
        if (!targetUrl.startsWith("http")) throw new Error("Invalid URL");

        // 1. Agar Referer GALAT hai (Kisi aur site se aaya hai) -> BLOCK
        if (ALLOWED_REFERER !== "SKIP" && isWrongReferer) {
           return new Response(renderRejectHtml(referer), { headers: { "Content-Type": "text/html;charset=UTF-8" } });
        }

        // 2. Agar Referer GAYAB hai (Empty) -> Show Button or Redirect based on config
        if (ALLOWED_REFERER !== "SKIP" && isMissingReferer && SHOW_VERIFY_BUTTON_ON_EMPTY) {
            // "Manual Verify" Page dikhao (Genuine users click kar lenge, bots atak jayenge)
            return new Response(renderManualVerifyHtml(targetUrl), { headers: { "Content-Type": "text/html;charset=UTF-8" } });
        }

        // 3. Agar Referer SAHI hai -> Direct Redirect
        return new Response(renderSuccessHtml(targetUrl), { headers: { "Content-Type": "text/html;charset=UTF-8" } });

      } catch (e) {
        return new Response(renderRejectHtml("Corrupted Data"), { headers: { "Content-Type": "text/html;charset=UTF-8" } });
      }
    }

    return new Response("Link Guard v2.3 Online 🟢", { status: 200 });
  },
};

// =================================================================================
// HELPER FUNCTIONS & HTML
// =================================================================================

function xorEncrypt(text, key) {
  let result = "";
  for (let i = 0; i < text.length; i++) { result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length)); }
  return btoa(result);
}

function xorDecrypt(encoded, key) {
  let text = atob(encoded);
  let result = "";
  for (let i = 0; i < text.length; i++) { result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length)); }
  return result;
}

// 1. REJECT PAGE
function renderRejectHtml(debugInfo = "") {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Access Denied</title><style>body{background:#ffebee;font-family:sans-serif;text-align:center;padding:50px 20px;color:#c62828}.box{background:white;padding:30px;border-radius:15px;box-shadow:0 10px 25px rgba(0,0,0,0.1);max-width:400px;margin:0 auto;border:2px solid #ef5350}.btn{background:#c62828;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;display:inline-block;margin-top:15px}</style></head><body><div class="box"><h1>🚫</h1><h2>Bypass Detected!</h2><p>Our system detected an invalid traffic source.</p><small style="color:#999">Ref: ${debugInfo}</small><br><a href="javascript:history.back()" class="btn">Go Back</a></div></body></html>`;
}

// 2. MANUAL VERIFY PAGE (For Empty Referers)
function renderManualVerifyHtml(destination) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Security Check</title><style>body{background:#fff3e0;font-family:sans-serif;text-align:center;padding:50px 20px;display:flex;align-items:center;justify-content:center;height:80vh}.box{background:white;padding:40px;border-radius:15px;box-shadow:0 10px 25px rgba(0,0,0,0.1);max-width:400px;width:100%;border-top:5px solid #ff9800}h2{color:#ef6c00}.btn{background:#ef6c00;color:white;padding:12px 25px;font-size:16px;border:none;border-radius:5px;cursor:pointer;margin-top:20px;transition:0.3s}.btn:hover{background:#e65100}</style></head><body><div class="box"><h2>Security Check 🔒</h2><p>We could not verify your traffic source automatically.</p><p>Please click below to confirm you are human.</p><button onclick="window.location.replace('${destination}')" class="btn">I am Human (Continue)</button></div></body></html>`;
}

// 3. SUCCESS PAGE
function renderSuccessHtml(destination) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Redirecting...</title><style>body{background:#e8f5e9;font-family:sans-serif;text-align:center;padding:50px 20px;display:flex;align-items:center;justify-content:center;height:80vh}.loader{border:4px solid #f3f3f3;border-top:4px solid #4caf50;border-radius:50%;width:40px;height:40px;animation:spin 1s linear infinite;margin:0 auto 20px} @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }h2{color:#2e7d32}</style></head><body><div class="box"><div class="loader"></div><h2>Verifying...</h2><p>Redirecting you safely.</p></div><script>setTimeout(function(){window.location.replace("${destination}");}, 1500);</script></body></html>`;
}
