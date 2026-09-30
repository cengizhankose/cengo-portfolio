// EN interface text, namespace "privacy" (T-12, FE-14). Keys are used as
// t("privacy.<key>"); nested objects add dotted segments.
// Written for the privacy notice (W9, SEC-25/ANL-04). The long text of the
// page (sections, processors, retention, rights) lives in
// src/content/en/privacy.js; this file holds the headings, the labels, the
// note under the contact form and the Umami statements.
//
// updated: `{date}` is LAST_UPDATED (src/pages/privacy/updated.js) written in
// the page language.
//
// formNote / formLink: the note under the contact form (src/pages/contact).
// The note names EmailJS and the retention period (SEC-25). Keep the period
// equal to content privacy.retention (12 months, schedule default).
export default {
  title: "Privacy",
  updated: "Last updated: {date}",
  disclaimer: "This page describes how the site works. It is not legal advice.",
  formNote:
    "The name, email, project type and message you send here reach me through EmailJS (USA), only so I can reply to you, and are kept for 12 months at most. Details:",
  formLink: "Privacy",
  section: {
    controller: "Who is responsible",
    data: "What data is handled",
    purposes: "Why, and on what basis",
    recipients: "Who else receives data",
    analytics: "Visit statistics",
    retention: "How long it is kept",
    rights: "Your rights",
    changes: "Changes to this page",
  },
  processor: {
    purpose: "What for",
    data: "Data",
    location: "Where",
  },
  umami: {
    noCookies: "Umami uses no cookies.",
    noIpStorage: "Your IP address is not stored.",
    salt: "The visitor identifier is a hash made with a salt that changes every month, so it cannot be followed from one month to the next or traced back to you.",
    noThirdParty:
      "The statistics stay in my own database and are not passed to anyone else.",
    dnt: "Do Not Track is honoured: if your browser sends it, nothing is recorded.",
    optOutLead: "You can also switch statistics off for this browser:",
    optOut: "stop statistics",
    optIn: "turn them back on",
  },
};
