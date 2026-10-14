import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok");
  return new Response(JSON.stringify({
    error: "This legacy checkout endpoint is retired. Use the authenticated stripe-payments function."
  }), {
    status: 410,
    headers: { "Content-Type": "application/json" }
  });
});