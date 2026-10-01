// Language-independent site data (T-12, FE-14). The same value in EN and TR;
// translated page text lives in src/content/{en,tr}/, interface text in
// src/i18n/{en,tr}/. Social profiles stay in src/seo/site.js (SOCIAL_PROFILES,
// SEO-25) and are not repeated here.

// Header logo text (DSG-24: the CENGO wordmark, capitals by design).
export const logotext = "CENGO";

// Public contact address (MKT-12): the owner's mailbox on the domain
// (owner decision 2026-10-01, replaces the unused hello@ default). The
// contact form sends it to EmailJS as to_email / to_name.
export const email = "me@cengizhankose.com";

// EmailJS IDs and the public key are public by design (they ship in the
// bundle). Abuse is limited in the EmailJS panel (allowed domains) and by the
// SDK options in src/pages/contact (SEC-24).
export const emailjs = Object.freeze({
  serviceId: "service_5i3xexc",
  templateId: "template_w4youof",
  publicKey: "aPMkFJ3oavgGNOmn3",
});
