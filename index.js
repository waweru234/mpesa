const express = require("express");

const app = express();
app.use(express.json({ limit: "1mb" }));

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_KEY ||
  "";
const MPESA_CALLBACK_TOKEN = process.env.MPESA_CALLBACK_TOKEN || "";
const USING_ANON_SUPABASE_KEY =
  !process.env.SUPABASE_SERVICE_ROLE_KEY && !!(process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY);

function normalize(value) {
  return String(value ?? "").trim();
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractStkCallback(payload) {
  if (payload?.Body?.stkCallback) return payload.Body.stkCallback;
  if (payload?.body?.stkCallback) return payload.body.stkCallback;
  if (payload?.stkCallback) return payload.stkCallback;
  return null;
}

function metadataValue(items, name) {
  if (!Array.isArray(items)) return null;
  const target = name.toLowerCase();
  const match = items.find((item) => normalize(item?.Name).toLowerCase() === target);
  return match?.Value ?? null;
}

async function recordCallbackInSupabase(params) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Missing SUPABASE_URL and Supabase key in Render environment. Set SUPABASE_SERVICE_ROLE_KEY (preferred) or SUPABASE_ANON_KEY."
    );
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/record_mpesa_stk_callback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(params),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase RPC failed (${response.status}): ${text}`);
  }

  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_error) {
    return text;
  }
}

app.post("/mpesa/callback", async (req, res) => {
  try {
    if (MPESA_CALLBACK_TOKEN) {
      const providedToken = normalize(req.query.token) || normalize(req.header("x-callback-token"));
      if (!providedToken || providedToken !== MPESA_CALLBACK_TOKEN) {
        return res.status(401).json({
          ResultCode: 1,
          ResultDesc: "Unauthorized callback",
        });
      }
    }

    const payload = req.body ?? {};
    const callback = extractStkCallback(payload);
    if (!callback) {
      return res.status(400).json({
        ResultCode: 1,
        ResultDesc: "Missing stkCallback payload",
      });
    }

    const merchantRequestId = normalize(callback.MerchantRequestID);
    const checkoutRequestId = normalize(callback.CheckoutRequestID);
    const resultCodeRaw = toNumber(callback.ResultCode);
    const resultCode = resultCodeRaw === null ? null : Math.trunc(resultCodeRaw);
    const resultDesc = normalize(callback.ResultDesc);

    const items = callback?.CallbackMetadata?.Item;
    const amount = toNumber(metadataValue(items, "Amount"));
    const mpesaReceiptNumber = normalize(metadataValue(items, "MpesaReceiptNumber"));
    const phoneNumber = normalize(metadataValue(items, "PhoneNumber"));
    const transactionDate = normalize(metadataValue(items, "TransactionDate"));

    const tracking = await recordCallbackInSupabase({
      p_checkout_request_id: checkoutRequestId || null,
      p_merchant_request_id: merchantRequestId || null,
      p_result_code: resultCode,
      p_result_desc: resultDesc || null,
      p_phone_number: phoneNumber || null,
      p_mpesa_receipt_number: mpesaReceiptNumber || null,
      p_transaction_date: transactionDate || null,
      p_amount: amount,
      p_payload: payload,
    });

    console.log("M-Pesa callback processed", {
      checkoutRequestId,
      merchantRequestId,
      resultCode,
      receipt: mpesaReceiptNumber || null,
      phoneNumber: phoneNumber || null,
      tracking,
    });

    return res.json({
      ResultCode: 0,
      ResultDesc: "Accepted",
    });
  } catch (error) {
    console.error("M-Pesa callback processing error:", error);
    return res.status(500).json({
      ResultCode: 1,
      ResultDesc: "Callback processing failed",
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  if (USING_ANON_SUPABASE_KEY) {
    console.warn(
      "Using SUPABASE_ANON_KEY/SUPABASE_KEY for callback writes. Use SUPABASE_SERVICE_ROLE_KEY for production reliability."
    );
  }
  console.log("Server running on port " + PORT);
});
