// =================================================================================
// VERSION 2.0 - ANTI-BYPASS UPDATE
// Update Log:
// - Added Arolinks API Auto-Shortening
// - Added 'Referer Check' to detect direct access (Bypass attempts)
// - Added Custom "Bypass Rejected" Screen with funny message
// - Improved Encryption Security
// =================================================================================

// --- CONFIGURATION (Ise dhyan se bharein) ---

// 1. Admin Password (Link create karne ke liye)
const ADMIN_PASSWORD = "MY_SECRET_PASS_123"; 

// 2. Encryption Key (Koi bhi random text)
const SECRET_KEY = "SUPER_SECRET_KEY_XY"; 

// 3. AROLINKS API TOKEN (Apni Key yahan dalein)
const AROLINKS_API_TOKEN = "YOUR_AROLINKS_API_KEY_HERE"; 

// 4. SHORTENER DOMAIN (Jahan se user aayega)
// Important: Yahan wo domain likhe jahan se user redirect hokar aayega.
// Agar Arolinks use kar rahe ho, toh usually 'arolinks.com' hota hai.
// Agar sure nahi ho, toh ise "SKIP" likh dena (Security off ho jayegi).
const ALLOWED_REFERER = "arolinks.com"; 

// =================================================================================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const requestHeaders = request.headers;

    // -----------------------------------------------------------------
    // CASE 1: LINK GENERATE KARNA (ADMIN SIDE)
    // URL: /encrypt?pass=PASSWORD&url=YOUR_LINK
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
      // Ye wo link hai jo Arolinks ke andar jayega
      const safeWorkerLink = `${url.origin}/redirect?token=${encodeURIComponent(encrypted)}`;

      // 2. Call Arolinks API
      try {
        const apiUrl = `https://arolinks.com/api?api=${AROLINKS_API_TOKEN}&url=${encodeURIComponent(safeWorkerLink)}`;
        
        const apiResponse = await fetch(apiUrl);
        const result = await apiResponse.json();

        if (result.status === "error") {
          return new Response(JSON.stringify({ status: "error", msg: "Arolinks Error: " + result.message }), { status: 500 });
        }

        // Success Response
        return new Response(JSON.stringify({
          status: "success",
          original: originalUrl,
          protected_link: safeWorkerLink,
          final_short_link: result.shortenedUrl // <-- Share THIS with users
        }, null, 2), { headers: { "Content-Type": "application/json" } });

      } catch (e) {
        return new Response(JSON.stringify({ status: "error", msg: "API Error. Check API Key." }), { status: 500 });
      }
    }

    // -----------------------------------------------------------------
    // CASE 2: USER REDIRECT (PUBLIC SIDE)
    // URL: /redirect?token=XYZ...
    // -----------------------------------------------------------------
    if (path === "/redirect") {
      const token = url.searchParams.get("token");

      if (!token) {
        return new Response("Invalid Request", { status: 400 });
      }

      // --- ANTI-BYPASS CHECK START ---
      const referer = requestHeaders.get('Referer') || "";
      
      // Agar Referer set hai (SKIP nahi hai) aur Referer match nahi kar raha
      if (ALLOWED_REFERER !== "SKIP") {
        // Hum check kar rahe hai ki kya user Allowed Domain se aaya hai?
        // Note: Kuch legitimate browsers privacy ke liye referer hide karte hain, 
        // lekin bypass scripts aksar ise empty rakhti hain.
        
        const isSuspicious = !referer.includes(ALLOWED_REFERER) && referer !== ""; 
        // (Is logic ko strict banane ke liye `&& referer !== ""` hata sakte ho, par usse kuch real users block ho sakte hain)

        // Strict Check: Agar Referer bilkul gayab hai (Direct Copy Paste)
        if (referer === "" || !referer.includes(ALLOWED_REFERER)) {
           // BYPASS DETECTED!
           return new Response(renderRejectHtml(), {
             headers: { "Content-Type": "text/html;charset=UTF-8" },
           });
        }
      }
      // --- ANTI-BYPASS CHECK END ---

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
        return new Response(renderRejectHtml("Invalid Token Data"), {
            headers: { "Content-Type": "text/html;charset=UTF-8" },
        });
      }
    }

    // Default Page
    return new Response("Link Guard v2.0 System Online 🟢", { status: 200 });
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
