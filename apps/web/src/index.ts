import { greeting } from "@jade/utils";

const port = Number(process.env.PORT ?? 3100);

Bun.serve({
  port,
  fetch() {
    return new Response(greeting("Jade"), {
      headers: {
        "content-type": "text/plain; charset=utf-8"
      }
    });
  }
});

console.log(`@jade/web listening on http://localhost:${port}`);
