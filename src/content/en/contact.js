// EN page content, section "contact" (T-12, FE-14; MKT-10, MKT-12). Source:
// the brief in .agents/product-marketing.md and the marketing plan. The
// same shape lives in src/content/tr/contact.js.
//
//   responseTime  the reply promise, written once. The form intro, the
//                 success message and the hero note (src/i18n/*/cta.js) all
//                 read it through their `{time}` placeholder. Recommended
//                 default (D8): 2 business days. The owner changes it here
//                 only if the promise cannot be kept.
//   description   the text above the form; `{time}` is responseTime
//   steps         the three steps after "How it works" (MKT-10)
//   projectTypes  the project type select. The ids are language independent
//                 and equal PROJECT_TYPES in src/lib/analytics/events.js and
//                 the service ids of MKT-13 (`/contact?type=<id>`).
// The booking link is a language independent setting: src/pages/contact/config.js.
export default {
  responseTime: "2 business days",
  description: "I reply to your email within {time}. How it works:",
  steps: [
    "I read your message",
    "A 20-minute intro call",
    "Scope and next steps",
  ],
  projectTypes: [
    { id: "mobile", label: "Mobile app" },
    { id: "web", label: "Web app" },
    { id: "ai", label: "AI / LLM integration" },
    { id: "lead", label: "Technical leadership" },
    { id: "job", label: "Full-time role" },
    { id: "other", label: "Other" },
  ],
};
