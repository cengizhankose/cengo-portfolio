// EN page content, section "privacy" (T-12, FE-14): the privacy notice of
// /privacy (SEC-25, ANL-04). src/content/tr/privacy.js has the same shape
// (same ids, same order, same list lengths), and the owner approves the text
// of both languages before the page goes live.
//
// Facts come from the code and the plans: the contact form goes through
// EmailJS; Umami runs self-hosted on Out Plane (T-13); Cloudflare Web
// Analytics stays listed until the two-week overlap ends (T-09); fonts are
// self-hosted (W8), so no font provider is listed. Retention defaults:
// contact messages 12 months (SEC-25), statistics 13 months (ANL-04).
//
//   (the "Last updated" date is LAST_UPDATED in src/pages/privacy/updated.js:
//   one value for both languages; change it together with the text)
//   controller, rights.how  `{email}` is rendered as a mailto: link
//   privacyProcessors  the one list of recipients. EN and TR keep the same ids
//                      in the same order (tests/frontend/privacy). When the
//                      Cloudflare beacon is switched off (T-09), delete the
//                      `cloudflare_web_analytics` entry in both files.
export const privacyProcessors = [
  {
    id: "emailjs",
    name: "EmailJS",
    purpose: "Delivers the contact form to my inbox.",
    data: "Name, email address, project type, message and the language of the page.",
    location: "United States.",
  },
  {
    id: "umami",
    name: "Umami (self-hosted)",
    purpose: "Privacy-friendly visit statistics.",
    data: "Page views and events as described under “Visit statistics”. No cookies, no stored IP address.",
    location:
      "Runs as my own application on Out Plane. The data sits in my own database there and is not passed to anyone else.",
  },
  {
    id: "cloudflare_web_analytics",
    name: "Cloudflare Web Analytics",
    purpose:
      "Counts visits next to Umami for a short comparison period, then it is switched off.",
    data: "Page views, referrer, browser, device and country.",
    location: "Cloudflare’s global network.",
  },
  {
    id: "cloudflare",
    name: "Cloudflare",
    purpose:
      "Content delivery network and security in front of the site. It keeps request logs.",
    data: "IP address, browser details and the addresses requested.",
    location:
      "Cloudflare’s global network. Cloudflare, Inc. is based in the United States.",
  },
  {
    id: "out_plane",
    name: "Out Plane",
    purpose:
      "Hosts this website and the Umami database. It keeps a request log for about one day.",
    data: "IP address and addresses requested (request log); the statistics Umami stores.",
    location: "The hosting provider’s data centre.",
  },
];

export default {
  intro:
    "This page explains which personal data cengizhankose.com handles, why, who else receives it and how to reach me about it. It applies to the English and the Turkish pages alike.",
  controller:
    "Cengizhan Köse is the controller of the personal data described here (veri sorumlusu under the Turkish KVKK, controller under the GDPR). For any question or request, write to {email}.",
  data: [
    {
      id: "form",
      label: "Contact form",
      text: "Name, email address, project type and the message you type, plus the language of the page you used. The form sends them through EmailJS to my inbox. Nothing else is asked, and nothing is stored on this website’s own servers.",
    },
    {
      id: "logs",
      label: "Request logs",
      text: "Like any website, the network in front of this site (Cloudflare) and the host (Out Plane) see your IP address, browser details and the addresses you request. They keep this in request logs for security and operation. I do not use it to identify visitors.",
    },
    {
      id: "statistics",
      label: "Visit statistics",
      text: "Page views and a few events, such as opening a link or sending the form. See “Visit statistics” below. Events never carry what you type.",
    },
    {
      id: "storage",
      label: "On your device",
      text: "No cookies. The site keeps up to three small items in your browser’s local storage: your light or dark theme, the time of your last form submission (so the form accepts one message every 30 seconds) and, only if you opt out of statistics, that choice. They stay on your device.",
    },
  ],
  purposes: [
    {
      id: "reply",
      label: "Replying to your message",
      text: "Taking steps at your request before a possible collaboration (GDPR art. 6(1)(b); KVKK art. 5(2)(c)) and my legitimate interest in answering enquiries.",
    },
    {
      id: "statistics",
      label: "Understanding how the site is used and keeping it secure",
      text: "Legitimate interest (GDPR art. 6(1)(f); KVKK art. 5(2)(f)): counting visits, fixing slow pages and fending off abuse, without profiling anyone.",
    },
  ],
  analytics: {
    text: "Umami records page views and a few events: the page address, the site you came from, campaign parameters in the address (utm_*), browser, operating system, device type, screen size, language and an approximate location derived from your IP address. Page-speed measurements are recorded the same way. For the contact form only three things are recorded: whether sending worked, the project type you chose and a length range of the message. Your name, email address and message text never reach the statistics.",
  },
  retention: [
    {
      id: "form",
      label: "Contact messages",
      text: "Up to 12 months. After that I delete them from my inbox and from the EmailJS history.",
    },
    {
      id: "statistics",
      label: "Visit statistics",
      text: "13 months.",
    },
    {
      id: "logs",
      label: "Request logs",
      text: "A short time at the providers: about one day at Out Plane. Cloudflare keeps its own logs under its own terms.",
    },
  ],
  rights: {
    intro: "Under article 11 of the KVKK you can ask me to:",
    items: [
      "tell you whether your personal data is processed and give you information about it,",
      "explain the purpose of the processing and whether it is used accordingly,",
      "name the third parties your data is passed to, in Türkiye or abroad,",
      "correct data that is incomplete or wrong,",
      "delete or destroy your data under the conditions of article 7,",
      "tell the third parties the data went to about those corrections and deletions,",
      "reconsider a result against you that comes solely from automated analysis,",
      "compensate damage you suffer from unlawful processing.",
    ],
    gdpr: "If the GDPR applies to you, you also have the rights to access, rectification, erasure, restriction, portability and objection (articles 15 to 21).",
    how: "Write to {email}. I answer free of charge within 30 days.",
    complaint:
      "You can also complain to the Personal Data Protection Authority (KVKK) in Türkiye or to the data protection authority of your country.",
  },
  changes:
    "If something above changes, for example when Cloudflare Web Analytics is switched off, I update this page and its date.",
  privacyProcessors,
};
