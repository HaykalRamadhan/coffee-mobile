# KopiPow payments

KopiPow currently uses Midtrans Snap through the `PaymentGateway` interface in
`lib/payments.ts`. The app opens the Midtrans-hosted `redirect_url` in a WebView;
card and wallet credentials never pass through KopiPow's UI or database.

Users can cancel an unpaid or pending payment from the secure payment screen.
Cancellation calls the authenticated `midtrans-cancel-payment` Edge Function,
which cancels the active Midtrans transaction and leaves the order retryable.
Completed payments cannot be cancelled; they require a separate refund process.

## Sandbox setup

1. In the Midtrans Dashboard, switch to **Sandbox** and open **Settings → Access Keys**.
2. Copy the Sandbox **Server Key**.
3. Add it as a Supabase Edge Function secret named `MIDTRANS_SERVER_KEY`.
4. Keep the Edge Function secret `MIDTRANS_IS_PRODUCTION` set to `false`.
5. In Midtrans **Settings → Payment**, set the notification URL to:

   `https://<your-supabase-project>.supabase.co/functions/v1/midtrans-webhook`

6. In **Settings → Snap Preferences**, configure KopiPow's display name, logo,
   colors, font, rounded controls, language, and enabled payment channels.

Never put the Server Key in `.env`, `.env.example`, an `EXPO_PUBLIC_` value, or
the mobile app. It belongs only in Supabase Edge Function secrets.

## Going live later

The Sandbox and Production payment flows use the same app code and database.
After the Midtrans production account and desired payment channels are active:

1. Replace `MIDTRANS_SERVER_KEY` with the Production Server Key.
2. Set `MIDTRANS_IS_PRODUCTION=true`.
3. Configure the same webhook URL and branding in the Production Midtrans Dashboard.
4. Run a small real payment and verify the webhook updates the order before launch.

No mobile app rewrite is required. The Edge Functions select the correct Midtrans
endpoint from `MIDTRANS_IS_PRODUCTION`.

## Changing providers later

Checkout calls the generic `PaymentGateway` contract. Midtrans-specific requests,
credentials, attempts, and webhooks are isolated behind that contract and the
Supabase Edge Functions. A future provider can be added without replacing the
cart, order creation, or order history flows.
