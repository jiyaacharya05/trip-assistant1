import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@22.6.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});
const json = (data: unknown, status = 200, origin = "") =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } });
const allowedOrigins = () => {
  const configured = (Deno.env.get("APP_ALLOWED_ORIGINS") || "").split(",").map(v => v.trim()).filter(Boolean);
  return new Set(["https://tripassistant.ai.studio","https://aistudio.google.com","https://trip-assistant-dusky.vercel.app","http://localhost:8080","http://127.0.0.1:8080","http://localhost:3000","http://127.0.0.1:3000",...configured]);
};
function isAllowedOrigin(origin: string, allowed: Set<string>) {
  if (allowed.has(origin)) return true;
  try {
    const url = new URL(origin);
    // Google AI Studio can serve previews from a generated subdomain.
    return url.protocol === "https:" && (url.hostname.endsWith(".aistudio.google.com") || url.hostname.endsWith(".aistudio.googleusercontent.com"));
  } catch {
    return false;
  }
}
function safeDetails(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const parsed = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  for (const key of Object.keys(parsed)) if (/card|cvc|cvv|password|bank.?account|upi.?pin|payment.?token/i.test(key)) delete parsed[key];
  return parsed;
}
const bookingReference = () => "TA-" + crypto.randomUUID().slice(0, 8).toUpperCase();

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  const allowed = allowedOrigins();
  const isWebhook = req.headers.has("stripe-signature");
  if (req.method === "OPTIONS") {
    if (!isAllowedOrigin(origin, allowed)) {
      console.warn("Blocked Stripe checkout preflight origin:", origin || "(missing)");
      return new Response("Origin not allowed", { status: 403 });
    }
    return new Response("ok", { headers: corsHeaders(origin) });
  }
  if (origin && !isAllowedOrigin(origin, allowed)) return json({ error: "This website origin is not allowed for checkout." }, 403, origin);
  if (!isWebhook && req.method !== "POST") return json({ error: "Method not allowed." }, 405, origin);

  const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeSecret) return json({ error: "Stripe is not configured. Add STRIPE_SECRET_KEY in Supabase Edge Function secrets." }, 503, origin);
  const stripe = new Stripe(stripeSecret, { apiVersion: "2026-08-26.dahlia", httpClient: Stripe.createFetchHttpClient() });
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Supabase server configuration is missing." }, 503, origin);
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  async function recordPaid(session: Stripe.Checkout.Session, expectedUserId?: string) {
    const bookingId = session.metadata?.booking_id || session.client_reference_id;
    const userId = session.metadata?.user_id;
    if (!bookingId || !userId || (expectedUserId && userId !== expectedUserId)) throw new Error("Checkout session is not linked to this account.");
    if (session.payment_status !== "paid") return { paid: false, status: session.payment_status };
    const { data: booking, error: readError } = await admin.from("bookings")
      .select("id,user_id,booking_ref,total_inr,details_json").eq("id", bookingId).eq("user_id", userId).maybeSingle();
    if (readError) throw readError;
    if (!booking) throw new Error("The pending booking could not be found.");
    const storedCurrency = String((booking.details_json as Record<string, unknown>)?.currency || "INR").toLowerCase();
    const expectedMinor = Number((booking.details_json as Record<string, unknown>)?.stripe_amount_minor || Number(booking.total_inr) * 100);
    if (session.currency !== storedCurrency || Number(session.amount_total) !== expectedMinor) throw new Error("The paid amount does not match the booking total.");
    const previous = booking.details_json && typeof booking.details_json === "object" ? booking.details_json as Record<string, unknown> : {};
    const intent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null;
    const updated = { ...previous, status: "Confirmed", payment_status: "paid", payment_provider: "Stripe", currency: storedCurrency.toUpperCase(),
      stripe_session_id: session.id, stripe_payment_intent_id: intent, paid_at: new Date().toISOString() };
    const { error: updateError } = await admin.from("bookings").update({ details_json: updated }).eq("id", booking.id).eq("user_id", userId);
    if (updateError) throw updateError;
    return { paid: true, booking_ref: booking.booking_ref, details: updated };
  }

  try {
    if (isWebhook) {
      const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
      if (!webhookSecret) return new Response("Webhook secret is not configured.", { status: 503 });
      const signature = req.headers.get("stripe-signature") || "";
      const bodyText = await req.text();
      let event: Stripe.Event;
      try {
        event = await stripe.webhooks.constructEventAsync(bodyText, signature, webhookSecret, undefined, Stripe.createSubtleCryptoProvider());
      } catch (error) {
        console.error("Stripe webhook signature check failed:", error);
        return new Response("Invalid Stripe signature.", { status: 400 });
      }
      if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.payment_status === "paid") await recordPaid(session);
      } else if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
        const session = event.data.object as Stripe.Checkout.Session;
        const bookingId = session.metadata?.booking_id || session.client_reference_id;
        const userId = session.metadata?.user_id;
        if (bookingId && userId) {
          const { data: booking } = await admin.from("bookings").select("id,details_json").eq("id", bookingId).eq("user_id", userId).maybeSingle();
          if (booking) {
            const previous = booking.details_json && typeof booking.details_json === "object" ? booking.details_json as Record<string, unknown> : {};
            await admin.from("bookings").update({ details_json: { ...previous, status: event.type === "checkout.session.expired" ? "Payment expired" : "Payment failed",
              payment_status: event.type === "checkout.session.expired" ? "expired" : "failed" } }).eq("id", bookingId).eq("user_id", userId);
          }
        }
      }
      return new Response("ok", { status: 200 });
    }

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Sign in before starting checkout." }, 401, origin);
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    if (!anonKey) return json({ error: "Supabase Auth configuration is missing." }, 503, origin);
    const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: "Bearer " + token } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !user) return json({ error: "Your session expired. Please sign in again." }, 401, origin);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    if (action === "create_checkout") {
      const total = Number(body.total_inr);
      if (!Number.isSafeInteger(total) || total < 1 || total > 10000000) return json({ error: "The booking amount is invalid." }, 422, origin);
      const currency = String(body.currency || "INR").toUpperCase();
      const currencyFactors: Record<string, number> = { INR:1, USD:.012, EUR:.011, GBP:.0094, AUD:.018, CAD:.016, NZD:.020, AED:.044, SAR:.045, QAR:.044, SGD:.016, MYR:.050, THB:.44, IDR:185, JPY:1.78, KRW:16.6, CNY:.086, HKD:.094, CHF:.010, ZAR:.22 };
      const factor = currencyFactors[currency];
      if (!factor) return json({ error: "This display currency is not supported for Stripe checkout." }, 422, origin);
      const displayMajor = Math.round(total * factor);
      const zeroDecimal = new Set(["JPY", "KRW"]);
      const stripeAmountMinor = zeroDecimal.has(currency) ? displayMajor : displayMajor * 100;
      if (!Number.isSafeInteger(stripeAmountMinor) || stripeAmountMinor < 1) return json({ error: "The converted booking amount is too small for Stripe." }, 422, origin);
      const details = safeDetails(body.details);
      const idempotencyKey = String(body.idempotency_key || details.idempotency_key || crypto.randomUUID()).slice(0, 120);
      let itineraryId = typeof body.itinerary_id === "string" ? body.itinerary_id : null;
      if (itineraryId) {
        const { data: itinerary, error } = await admin.from("itineraries").select("id").eq("id", itineraryId).eq("user_id", user.id).maybeSingle();
        if (error) throw error;
        if (!itinerary) itineraryId = null;
      }
      const { data: recent, error: recentError } = await admin.from("bookings").select("id,booking_ref,total_inr,details_json")
        .eq("user_id", user.id).order("created_at", { ascending: false }).limit(40);
      if (recentError) throw recentError;
      const prior = (recent || []).find((row: any) => row.details_json?.idempotency_key === idempotencyKey);
      let pending: any;
      if (prior) {
        if (Number(prior.total_inr) !== total || String(prior.details_json?.currency || "INR").toUpperCase() !== currency) return json({ error: "This checkout key is already linked to a different amount or currency." }, 409, origin);
        const priorSessionId = prior.details_json?.stripe_session_id;
        if (priorSessionId) {
          const priorSession = await stripe.checkout.sessions.retrieve(String(priorSessionId));
          if (priorSession.payment_status === "paid") {
            const paid = await recordPaid(priorSession, user.id);
            return json({ ...paid, already_paid: true }, 200, origin);
          }
          if (priorSession.status === "open" && priorSession.url) {
            return json({ url: priorSession.url, session_id: priorSession.id, booking_ref: prior.booking_ref }, 200, origin);
          }
          return json({ error: "The previous checkout expired. Start the booking again to create a fresh payment." }, 409, origin);
        }
        pending = prior;
      } else {
        const { data, error: insertError } = await admin.from("bookings").insert({
          user_id: user.id, itinerary_id: itineraryId, booking_ref: bookingReference(), total_inr: total,
          details_json: { ...details, idempotency_key: idempotencyKey, status: "Payment pending", payment_status: "pending", payment_provider: "Stripe", currency, stripe_amount_minor: stripeAmountMinor }, 
        }).select("id,booking_ref,total_inr,details_json").single();
        if (insertError) throw insertError;
        pending = data;
      }
      const siteOrigin = origin || Deno.env.get("APP_BASE_URL") || "";
      if (!siteOrigin || !isAllowedOrigin(siteOrigin, allowed)) {
        await admin.from("bookings").delete().eq("id", pending.id).eq("user_id", user.id);
        return json({ error: "Add your published website origin to APP_ALLOWED_ORIGINS in Supabase secrets." }, 400, origin);
      }
      const productName = String(details.service || details.destination || details.to || details.name || "Trip Assistant booking").slice(0, 100);
      const productDescription = String(details.room || details.trip_summary || details.category || "Travel booking").slice(0, 400);
      const successUrl = siteOrigin + "/?stripe_checkout=success&session_id={CHECKOUT_SESSION_ID}";
      const cancelUrl = siteOrigin + "/?stripe_checkout=cancelled";
      let session: Stripe.Checkout.Session;
      try {
        session = await stripe.checkout.sessions.create({
          mode: "payment", client_reference_id: pending.id, customer_email: user.email || undefined,
          line_items: [{ quantity: 1, price_data: { currency: currency.toLowerCase(), unit_amount: stripeAmountMinor, product_data: { name: productName, description: productDescription } } }],
          success_url: successUrl, cancel_url: cancelUrl, payment_method_types: currency === "INR" ? ["card", "upi"] : ["card"], wallet_options: { link: { display: "never" } }, metadata: { booking_id: pending.id, user_id: user.id, currency, stripe_amount_minor: String(stripeAmountMinor) },
          integration_identifier: "trip-assistant-" + idempotencyKey.replace(/[^a-z0-9]/gi, "").slice(-8).toLowerCase().padStart(8, "x"),
        }, { idempotencyKey });
      } catch (error) {
        await admin.from("bookings").delete().eq("id", pending.id).eq("user_id", user.id);
        throw error;
      }
      const { error: updateError } = await admin.from("bookings").update({
        details_json: { ...pending.details_json, stripe_session_id: session.id },
      }).eq("id", pending.id).eq("user_id", user.id);
      if (updateError) throw updateError;
      if (!session.url) throw new Error("Stripe did not return a Checkout URL.");
      return json({ url: session.url, session_id: session.id, booking_ref: pending.booking_ref }, 200, origin);
    }
    if (action === "verify_checkout") {
      const sessionId = String(body.session_id || "");
      if (!sessionId.startsWith("cs_")) return json({ error: "Invalid Checkout session." }, 422, origin);
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const result = await recordPaid(session, user.id);
      if (!result.paid) return json({ paid: false, message: "Stripe is still confirming this payment." }, 200, origin);
      return json(result, 200, origin);
    }
    return json({ error: "Unknown Stripe payment action." }, 400, origin);
  } catch (error) {
    console.error("stripe-payments failed:", error);
    const message = error instanceof Stripe.errors.StripeError
      ? "Stripe could not start checkout. Check that the account supports INR and that your Stripe key is configured."
      : error instanceof Error ? error.message : "Payment request failed.";
    return json({ error: message }, 500, origin);
  }
});
