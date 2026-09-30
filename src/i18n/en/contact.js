// EN interface text, namespace "contact" (T-12, FE-14). Keys are used as
// t("contact.<key>"); nested objects add dotted segments.
// Status messages: `{emailMe}` is rendered as a mailto: link whose text is
// contact.emailMe (src/pages/contact).
export default {
  title: "Contact me",
  getInTouch: "Get in touch",
  emailLabel: "Email:",
  form: {
    name: "Name",
    email: "Email",
    message: "Message",
  },
  placeholder: {
    name: "Jane Doe…",
    email: "you@example.com…",
    message: "Tell me about your project…",
  },
  submit: "Send message",
  sending: "Sending…",
  success: "Message sent. I’ll reply to your email shortly.",
  error: "Your message couldn’t be sent. Please try again or {emailMe}.",
  rateLimited:
    "You can send one message every 30 seconds. Wait a moment and try again, or {emailMe}.",
  emailMe: "email me directly",
  honeypot: "Leave this field empty",
  closeAlert: "Close alert",
};
