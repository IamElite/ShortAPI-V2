// =================================================================================
// VERSION 2.3 - UNIVERSAL SHORTENER SUPPORT
// Update Log:
// - Fixed "Missing https" crash issue.
// - Now supports ANY AdLinkFly based shortener (Nanolinks, GPlinks, Droplink etc).
// - Added Auto-Protocol detection (http/https).
// - FIXED: Anti-bypass logic to not block genuine users with missing referer.
// - ADDED: Secondary security check via User-Agent analysis.
// =================================================================================

// --- CONFIGURATION (EDIT HERE) ---

// 1. Admin Password
const ADMIN_PASSWORD = "MY_SECRET_PASS_123"; 

// 2. Encryption Key
const SECRET_KEY = "SUPER_SECRET_KEY_XY"; 

// 3. SHORTENER CONFIGURATION (Universal)
// Yahan apne shortener ki website dalein (e.g., nanolinks.in, gplinks.com)
// Https lagana bhool bhi gaye to code khud laga lega.
const SHORTENER_DOMAIN = 'nanolinks.in'; 
const SHORTENER_API_KEY = 'ae0271c2c57105db2fa209f5b0f20c1a965343f6';

// 4. SECURITY CONFIG (Auto-derived - DO NOT TOUCH)
// Ye automatically domain nikal lega aur https fix kar lega.
const getFixedBaseUrl = () => {
    let url = SHORTENER_DOMAIN.trim();
    if (!url.startsWith("http")) {
        url = "https://" + url;
    }
    // Remove trailing slash if exists
    if (url.endsWith("/")) {
        url = url.slice(0, -1);
    }
    return url;
};

const BASE_URL = getFixedBaseUrl(); // https://nanolinks.in
const ALLOWED_REFERER = new URL(BASE_URL).hostname; // nanolinks.in

// 5. SECURITY TOGGLE (TESTING MODE)
// Testing ke liye "YES" rakhein. Sab users ko allow karega.
// Final deploy ke liye "NO" karein. Smart check enable ho jayega.
const TEMP_DISABLE_REFERER_CHECK = "YES"; // "YES" or "NO"

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

      // Password Check
      if (pass !== ADMIN_PASSWORD) {
        return new Response(JSON.stringify({ status: "error", msg: "❌ Wrong Password" }), { status: 403 });
      }
      if (!originalUrl) {
        return new Response(JSON.stringify({ status: "error", msg: "❌ URL Missing" }), { status: 400 });
      }

      // 1. Encrypt URL
      const encrypted = xorEncrypt(originalUrl, SECRET_KEY);
      const safeWorkerLink = `${url.origin}/redirect?token=${encodeURIComponent(encrypted)}`;

      // 2. Call Shortener API (Generic Format)
      try {
        // Format: https://domain.com/api?api=KEY&url=URL
        const apiUrl = `${BASE_URL}/api?api=${SHORTENER_API_KEY}&url=${encodeURIComponent(safeWorkerLink)}`;
        
        const apiResponse = await fetch(apiUrl);
        const result = await apiResponse.json();

        // Check for specific shortener errors
        if (result.status === "error" || (result.status && result.status !== "success")) {
          return new Response(JSON.stringify({ 
              status: "error", 
              msg: `Shortener rejected request: ${result.message || 'Unknown Error'}`,
              debug_url: BASE_URL 
          }), { status: 500 });
        }

        // Success Response
        return new Response(JSON.stringify({
          status: "success",
          original: originalUrl,
          protected_link: safeWorkerLink,
          final_short_link: result.shortenedUrl // <-- Share THIS
        }, null, 2), { headers: { "Content-Type": "application/json" } });

      } catch (e) {
        return new Response(JSON.stringify({ 
            status: "error", 
            msg: `API Connection Failed. Check Domain/Key. Error: ${e.message}`,
            debug_domain: BASE_URL
        }), { status: 500 });
      }
    }

    // -----------------------------------------------------------------
    // CASE 2: USER REDIRECT (PUBLIC SIDE) - FIXED VERSION
    // -----------------------------------------------------------------
    if (path === "/redirect") {
      const token = url.searchParams.get("token");

      if (!token) {
        return new Response("Invalid Request", { status: 400 });
      }

      // --- IMPROVED ANTI-BYPASS LOGIC (STARTS HERE) ---
      const referer = requestHeaders.get('Referer') || "";
      const userAgent = requestHeaders.get('User-Agent') || "";

      // TEMPORARY TESTING MODE: "YES" = Allow all, "NO" = Enable smart checks
      if (TEMP_DISABLE_REFERER_CHECK === "NO") {
        
        // 1. SMART REFERER CHECK (Not too strict)
        try {
          if (referer) {
            const refererUrl = new URL(referer);
            if (refererUrl.hostname !== ALLOWED_REFERER) {
              // Fake referer detected (bypass attempt)
              console.log(`Bypass Attempt: Fake Referer. Got: ${refererUrl.hostname}, Expected: ${ALLOWED_REFERER}`);
              return new Response(renderRejectHtml("Security Check Failed (Invalid Source)."), {
                headers: { "Content-Type": "text/html;charset=UTF-8" },
              });
            }
          }
          // If referer is empty/missing, we ALLOW it (genuine user case)
        } catch (e) {
          // URL parsing failed (empty/malformed referer) - ALLOW it
          console.log(`Note: Referer missing for UA: ${userAgent.substring(0, 60)}`);
        }

        // 2. SECONDARY CHECK: Bypass Script Detection in User-Agent
        const bypassKeywords = [
          'bypass-all-shortlinks',
          'AdsBypasser',
          'violentmonkey',
          'tampermonkey',
          'greasemonkey',
          'bypasser',
          'linkvity'
        ];
        
        const lowerUA = userAgent.toLowerCase();
        const isSuspiciousUA = bypassKeywords.some(keyword => lowerUA.includes(keyword));

        if (isSuspiciousUA) {
          console.log(`Bypass Script Detected: ${userAgent.substring(0, 100)}`);
          return new Response(renderRejectHtml("Automated tools/scripts are not allowed."), {
            headers: { "Content-Type": "text/html;charset=UTF-8" },
          });
        }
      }
      // --- ANTI-BYPASS LOGIC ENDS HERE ---

      try {
        // Token Decrypt
        const targetUrl = xorDecrypt(token, SECRET_KEY);
        
        if (!targetUrl.startsWith("http")) {
          throw new Error("Invalid URL Structure");
        }

        // Sab sahi hai -> Loading Page Dikhao
        return new Response(renderSuccessHtml(targetUrl), {
          headers: { "Content-Type": "text/html;charset=UTF-8" },
        });

      } catch (e) {
        return new Response(renderRejectHtml("Invalid or Expired Link."), {
            headers: { "Content-Type": "text/html;charset=UTF-8" },
        });
      }
    }

    // Default Page
    return new Response("Link Guard v2.3 (Universal) Online 🟢 - Fixed Anti-Bypass", { status: 200 });
  },
};

// =================================================================================
// HELPER FUNCTIONS & HTML TEMPLATES
// =================================================================================

function xorEncrypt(text, key) {
  let result = "";
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return btoa(result);
}

function xorDecrypt(encoded, key) {
  let text = atob(encoded);
  let result = "";
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return result;
}

// 1. REJECT PAGE (Funny Message)
function renderRejectHtml(errorMsg = "") {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Access Denied</title>
    <style>
        body { background-color: #ffebee; font-family: 'Arial', sans-serif; text-align: center; padding: 50px 20px; color: #c62828; }
        .box { background: white; padding: 30px; border-radius: 15px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); max-width: 400px; margin: 0 auto; border: 2px solid #ef5350; }
        h1 { font-size: 50px; margin: 0; }
        h2 { margin-top: 10px; }
        p { font-size: 18px; color: #333; margin: 20px 0; line-height: 1.5; }
        .btn { display: inline-block; background: #c62828; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold; margin-top: 10px; }
        .btn:hover { background: #b71c1c; }
    </style>
</head>
<body>
    <div class="box">
        <h1>🚫</h1>
        <h2>Bypass Rejected!</h2>
        <p>
            <b>Oye! Kya socha tha?</b> <br>
            Direct link copy karke nikal jaoge? <br><br>
            System ne pakad liya hai. Apka bypass reject kar diya gaya hai.
            <br><br>
            Please wapas jao aur <b>Good Boy</b> ki tarah process follow karke aao.
        </p>
        <p style="font-size: 12px; color: #999;">Error Code: SMART_MOVE_FAILED ${errorMsg ? '('+errorMsg+')' : ''}</p>
        <a href="javascript:history.back()" class="btn">Go Back & Try Again</a>
    </div>
</body>
</html>
  `;
}

// 2. SUCCESS PAGE (Genuine User)
function renderSuccessHtml(destination) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Redirecting...</title>
    <style>
        body { background-color: #e8f5e9; font-family: 'Arial', sans-serif; text-align: center; padding: 50px 20px; display: flex; align-items: center; justify-content: center; height: 80vh; }
        .box { background: white; padding: 40px; border-radius: 15px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); max-width: 400px; width: 100%; border-top: 5px solid #4caf50; }
        .loader { border: 4px solid #f3f3f3; border-top: 4px solid #4caf50; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 20px auto; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        h2 { color: #2e7d32; }
        p { color: #555; }
    </style>
</head>
<body>
    <div class="box">
        <div class="loader"></div>
        <h2>Success!</h2>
        <p>Link verified successfully.</p>
        <p>Redirecting you to destination...</p>
    </div>
    <script>
        setTimeout(function() {
            window.location.replace("${destination}");
        }, 2500); // 2.5 seconds delay
    </script>
</body>
</html>
  `;
}
