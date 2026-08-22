const html = (orderId: string) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:;" />
    <title>KopiPow payment</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #c9c7a7; color: #153f32; font-family: system-ui, sans-serif; }
      main { width: min(82vw, 420px); padding: 32px; border-radius: 28px; background: #eeebcb; text-align: center; }
      h1 { margin: 10px 0; font-family: Georgia, serif; font-style: italic; font-size: 36px; }
      p { line-height: 1.5; color: #526659; }
      a { display: block; margin-top: 22px; padding: 16px; border-radius: 18px; background: #204c3b; color: #eeebcb; text-decoration: none; font-weight: 800; }
    </style>
  </head>
  <body>
    <main>
      <div>⚡</div>
      <h1>Payment received!</h1>
      <p>Return to KopiPow so we can verify the latest payment status.</p>
      <a href="kopipow://payment/complete?order_id=${orderId}">Return to KopiPow</a>
    </main>
  </body>
</html>`;

Deno.serve((request) => {
  const orderId = new URL(request.url).searchParams.get("order_id") ?? "";
  const safeOrderId = /^[0-9a-f-]{36}$/i.test(orderId) ? orderId : "";
  return new Response(html(safeOrderId), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
});
