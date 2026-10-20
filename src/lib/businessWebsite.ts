// The business website's addresses (2026-09-29) — jetenvoieca.com, served
// by this app (see middleware.ts). The bare domain redirects to the www
// address, the site's main address.
export const BUSINESS_WEBSITE_DOMAIN = "jetenvoieca.com";
export const BUSINESS_WEBSITE_HOST = `www.${BUSINESS_WEBSITE_DOMAIN}`;

// The Home page's contact form (2026-10-20): the longest name and message
// it takes — checked in the browser and again on sending.
export const CONTACT_MAX_NAME = 100;
export const CONTACT_MAX_MESSAGE = 5000;
