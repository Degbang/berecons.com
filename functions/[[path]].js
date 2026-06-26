const MAINTENANCE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
    <meta http-equiv="Pragma" content="no-cache" />
    <meta http-equiv="Expires" content="0" />
    <title>Website Under Maintenance</title>
    <style>
      :root {
        --navy: #0c1e36;
        --navy-deep: #070d1e;
        --cream: #f5f4f0;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        min-height: 100%;
      }

      body {
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 2rem;
        color: var(--cream);
        background:
          radial-gradient(ellipse at 20% 15%, rgba(200, 169, 106, 0.12), transparent 42%),
          radial-gradient(circle at 82% 78%, rgba(11, 70, 240, 0.14), transparent 34%),
          linear-gradient(160deg, var(--navy) 0%, #111827 52%, var(--navy-deep) 100%);
        font-family: Manrope, "IBM Plex Sans", system-ui, sans-serif;
      }

      main {
        width: 100%;
        min-height: calc(100vh - 4rem);
        display: grid;
        place-items: center;
      }

      h1 {
        margin: 0;
        width: auto;
        max-width: 100%;
        text-align: center;
        font-family: "Playfair Display", Georgia, serif;
        font-size: clamp(2.15rem, 4.8vw, 4.25rem);
        font-weight: 600;
        line-height: 1;
        letter-spacing: -0.035em;
        color: var(--cream);
        text-wrap: balance;
      }

      @media (max-width: 640px) {
        body {
          padding: 1rem;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Website under maintenance.</h1>
    </main>
  </body>
</html>
`;

function isAssetRequest(pathname) {
  return /\.[a-z0-9]+$/i.test(pathname);
}

function maintenanceResponse(method) {
  const headers = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Retry-After": "3600",
  };

  if (method === "HEAD") {
    return new Response(null, { status: 503, headers });
  }

  return new Response(MAINTENANCE_HTML, { status: 503, headers });
}

export async function onRequest(context) {
  const { request, next } = context;
  const { pathname } = new URL(request.url);

  if (pathname.startsWith("/api/")) {
    return next();
  }

  if (isAssetRequest(pathname)) {
    return next();
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return next();
  }

  return maintenanceResponse(request.method);
}
