// EN page content, section "services" (T-12, FE-14; MKT-13). Source: the CV
// and 00-icerik-girdileri.md (§3, §4); the rules of MKT-14: benefits over
// features, no banned adjectives. src/content/tr/services.js has the same
// shape, the same ids in the same order and the same `to` values.
//
//   id        stable and identical in every language. It is also the project
//             type of the contact form (PROJECT_TYPES in
//             src/lib/analytics/events.js, MKT-10) and the `project_type` of
//             the service_contact event (ANL-02).
//   title     the service, as a short noun phrase
//   outcome   what the client gets, in one or two sentences
//   proof     { label, to }: one earlier piece of work. `to` is language
//             independent: a site path (the page adds the language prefix) or
//             an https URL (opens in a new tab). The employer's app is named
//             with its store listing only, no figures and no images, until
//             Drivee's written permission is on record (§4.2-A).
//   cta       { label, to }: `to` is always "/contact?type=<id>"; the contact
//             form preselects that project type.
export default [
  {
    id: "mobile",
    title: "Mobile apps with React Native",
    outcome:
      "A React Native app your team can ship and maintain: auth, live data, notifications and automated test builds, from first screen to store release.",
    proof: {
      label: "Drivee SafeCall, built as sole developer",
      to: "https://apps.apple.com/tr/app/drivee-safecall/id6741858026",
    },
    cta: { label: "Write to me about this", to: "/contact?type=mobile" },
  },
  {
    id: "web",
    title: "Fullstack web products",
    outcome:
      "Next.js front ends and Node.js APIs designed, built and deployed by one owner, so decisions don’t get lost between layers.",
    proof: {
      label: "Farmin: 1st place, Open Innovation Track",
      to: "/portfolio#project-farmin",
    },
    cta: { label: "Write to me about this", to: "/contact?type=web" },
  },
  {
    id: "ai",
    title: "AI features in your product",
    outcome:
      "Voice, chat and agent features built into your web or mobile app: LLM integrations, real-time audio and video, and MCP-based tools.",
    proof: {
      label: "SalesGym: 1st place, built solo in eight hours",
      to: "/portfolio#project-salesgym",
    },
    cta: { label: "Write to me about this", to: "/contact?type=ai" },
  },
  {
    id: "lead",
    title: "Technical leadership",
    outcome:
      "I led a six-person mobile rewrite and a five-person product team; on your team I own the work from architecture to release.",
    proof: {
      label: "See the timeline",
      to: "/about#timeline",
    },
    cta: { label: "Write to me about this", to: "/contact?type=lead" },
  },
];
