// The admin tool's own address — where Stripe and Google send the browser
// back to, and the base for absolute links to the app's own files. Set
// NEXT_PUBLIC_APP_URL in Netlify to the real deployed URL; falls back to
// https://jevca.netlify.app. (Moved here from lib/stripe.ts on
// 2026-10-09, once the Gmail connection needed it too.)
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://jevca.netlify.app";
