// EN interface text, namespace "contact" (T-12, FE-14). Keys are used as
// t("contact.<key>"); nested objects add dotted segments.
// Status messages: `{time}` is the reply promise (content contact.responseTime),
// `{emailMe}` is rendered as a mailto: link whose text is contact.emailMe and
// `{latestPost}` as a link to the blog whose text is contact.latestPost
// (src/pages/contact).
export default {
  title: "Let’s work together",
  reachMe: "Reach me directly",
  emailLabel: "Email:",
  bookCall: "Book a 20-minute intro call",
  linkedin: "Message me on LinkedIn",
  newTab: "(opens in a new tab)",
  form: {
    name: "Name",
    email: "Email",
    projectType: "Project type",
    projectTypeChoose: "Choose one",
    message: "Message",
  },
  placeholder: {
    name: "Jane Doe…",
    email: "you@example.com…",
    message: "Tell me about your project…",
  },
  submit: "Send details",
  sending: "Sending…",
  success:
    "Got it. I’ll reply to your email within {time}. Meanwhile, have a look at {latestPost}.",
  latestPost: "my latest post",
  error: "Your message couldn’t be sent. Please try again or {emailMe}.",
  rateLimited:
    "You can send one message every 30 seconds. Wait a moment and try again, or {emailMe}.",
  emailMe: "email me directly",
  honeypot: "Leave this field empty",
  closeAlert: "Close alert",
};
