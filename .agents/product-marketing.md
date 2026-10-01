# Product marketing context: cengizhankose.com

Read this before writing or editing any copy for the site. The `copywriting` skill looks for this file first.
It is one page of decisions, not a brochure. The facts behind it live in the content inputs file
(`claudedocs/audit-2026-09-30/plans/00-icerik-girdileri.md`, kept locally and not in git); section numbers
below (§) point into it. Every number or date that reaches the site must be traceable to a § there.

Status: these are the recommended defaults of the 2026-09 audit. The owner has not yet confirmed the open
points at the bottom; change this file first when an answer arrives, then the copy. English and Turkish went
live together in W11 (MKT-14): the Turkish voice below is the one the strict parity test and the voice test
(`tests/frontend/i18n/`) enforce.

## What this site is

The personal site of Cengizhan Köse, Senior Fullstack Engineer. It is a portfolio, an About page, a blog
and one contact form. English is the default language, Turkish lives under `/tr` (T-12). The page has one
job: turn a visitor who is deciding whether to hire or work with him into a message through the contact form.

## Audience

- Primary: hiring teams (engineering managers, recruiters, founders hiring a first fullstack or mobile
  engineer) and startups that are building a product and need someone to own web, mobile and backend.
- Secondary: peers who reach the site through a blog post or a hackathon result.
- What they are trying to decide: can this person own the whole feature, from the screen to the pipeline,
  and is there evidence for it?
- Objections to answer on the page: "Is the seniority real?" (dated roles with outcomes, named awards),
  "Is this a hobby developer?" (current role at a fleet-technology company, six years of dated work),
  "Can he work in my language and timezone?" (EN and TR, Istanbul).
- Their words: "end to end", "owns the product", "ships", "mobile and backend", "hackathon winner".
  Not: "passionate", "rockstar", "guru".

## Primary action

One action per page: send a message through the contact form.

- EN: "Tell me what you're building". TR: "Ne geliştirdiğini anlat". Target: `/contact` (`/tr/contact`).
- The project type field in the form separates the two segments (hiring vs. project).
- Secondary paths are evidence, never competing buttons: "See selected work" / "Seçili işleri gör".
- Every page that can end a visit (Home, About, each blog post) ends with this action.

## Offer

- Design and build web and mobile products end to end: TypeScript, React, Node.js, React Native.
- Add AI features to an existing product (LLM integrations, agentic workflows).
- Technical leadership for a small team (led six- and five-person teams at MakasApp and Profo).
- Not offered: design-only work, agency-style management of other people's projects.

## Differentiation

- One owner from product design through frontend architecture, APIs and deployment (§2.2, CV summary).
- Built the SafeCall mobile app from scratch as its sole developer (§3.1, employer permission needed for
  anything beyond the fact itself, see Proof).
- Fast AI prototypes under pressure: ten hackathon podiums since 2021, four of them first place (§5).
- Crosses the usual split: fleet technology, e-commerce and AI in the same six years (§2.2).

## Proof

Usable (each with its source; the site shows the label, not the score):

| Claim | Source | Note |
| --- | --- | --- |
| 6+ years building web and mobile products | §2.3, CV summary | "6+ years" only, never a finer number |
| 10 hackathon podiums, 4 first places | §5 | Count includes one podium that is not shown on the page yet (see Open points) |
| SalesGym: built alone in 8 hours, first place | §2.3, §4.1 | Event name as in the awards list |
| Farmin: first place, Open Innovation Track | §5 (organizer post) | Never "among 25 teams": the organizer says 24 projects in two tracks |
| MakasApp: led a six-person team through a rewrite | §3.1 | |
| Profo: led a five-person team | §3.1 | |
| SafeCall: sole developer | §3.1 | Fact only, no usage numbers |

Not usable until the owner gets written permission (never paraphrase around it):

- Drivee usage metrics of any kind, SafeCall screenshots, and details of Drivee internal systems.
- Logos of employers (company names are written as plain text).
- Any testimonial: no named reference exists yet (§6). Never invent or edit one. A quote needs a name, a role,
  a company, a concrete result and written permission; the permission record stays outside the repo.
- Private view or follower counts, and anything from a private repository.

## Voice

- Plain, concrete, first person on About ("I"), second person for the visitor in calls to action.
- A number always comes with its label and year; no rounding up.
- Confident without adjectives. Banned in both languages: cool, modern, beautiful, high quality,
  passionate, innovative, cutting-edge, and their Turkish equivalents (havalı, modern, güzel, yüksek kaliteli,
  tutkulu, yenilikçi, son teknoloji).
- No exclamation marks in page copy. No buzzwords without a thing behind them.
- Headlines state the thing ("Senior Fullstack Engineer"), not a mood.

## Language

- English is the default and is written first; Turkish is written for a Turkish reader with the same facts,
  not translated word for word (T-12).
- Both languages ship together: a string, a content field or a page that exists in one language and not
  in the other is a bug. The parity test in `tests/frontend/i18n/` enforces it once `/tr` is live.
- The next three sections are the contract for every content package. MKT-14 finalised them when `/tr` opened.

## Dil ve hitap

- Turkish copy addresses the visitor as "sen". Buttons and cards use the short imperative: "İncele", "İzle",
  "Projeni anlat", "Ne geliştirdiğini anlat". Never "siz" forms ("iletişime geçin", "gönderin", "inceleyin",
  "izleyin", "okuyun", "bakın").
- About and blog copy is first person singular in both languages: "Bir ürünü uçtan uca üstlenmeyi
  seviyorum", "I like owning a product end to end".
- English stays plain and concrete; contractions are fine ("I’m", "let’s") and the apostrophe is typographic (’).
- Turkish is usually longer than English. Write short: the hero line fits two lines at 375 px, card titles two
  lines at card width. If a Turkish line overflows, shorten the translation; do not clip it with CSS.
- Sentence case for headings in both languages; no trailing full stop on a heading.

## Terim sözlüğü

| Term | EN | TR | Rule |
| --- | --- | --- | --- |
| Role | Senior Fullstack Engineer | Senior Fullstack Engineer | Stays English on TR pages (hero marks it `lang="en"`). The timeline shows the formal title "Fullstack Engineer" at Drivee. |
| Job titles in the timeline | as written | Kurucu Ortak, Mobil Ekip Lideri, Yazılım Mühendisliği Lisans; engineering titles stay English | Titles the market uses in English are not translated |
| Technology and product names | React Native, Next.js, MCP, LLM, AI agent | unchanged | Never translated. In Turkish, suffixes attach with an apostrophe ("Next.js’te", "React Native’de") or the name takes a noun ("React Native projesi") |
| Artificial intelligence | AI | "yapay zekâ" in running text, "AI" in short labels | "AI / LLM entegrasyonu" as a label |
| Hackathon results | podium, first place, hackathon | podyum, birincilik, hackathon | "1st place" is "Birincilik", "2nd" "İkincilik", "3rd" "Üçüncülük" |
| Company and event names | original spelling | original spelling | Drivee Teknoloji, Monster Notebook, AlgoHack Istanbul, ConvoAI World Istanbul |
| Dates | `Intl.DateTimeFormat(locale)` | same | Year ranges are written "2021 – 2024" (en dash, spaces) in both languages; "present" is "günümüz" |
| Currency | $2,500 | 2.500 $ | |
| Name | Cengizhan Köse | Cengizhan Köse | Always "Köse", never capitals |
| Contact action | Tell me what you’re building | Ne geliştirdiğini anlat | One label for the primary action everywhere |

## Çeviri akışı

Interface text and page copy are written in both languages by the package that owns them (dictionary
namespaces in `src/i18n/{en,tr}/`, content sections in `src/content/{en,tr}/`). Blog posts are translated
through this flow:

1. The source post is published and carries a `translationKey` (added with the publish CLI if missing).
2. AI draft: the source Markdown is translated. Code blocks, numbers, units and proper names do not change;
   internal links are rewritten to the target language path (`/blog/...` to `/tr/blog/...`); terms follow the
   glossary above; the slug is written in the target language. Mermaid diagrams: the labels are visible text and
   are translated, node ids and syntax are not. Both files carry the same `translationKey`.
3. Owner review: Cengizhan reads and corrects the draft; technical claims are compared with the source.
4. The post ends with the standard note. EN: "Translated from Turkish with AI assistance and reviewed by
   Cengizhan." TR: "İngilizceden yapay zekâ desteğiyle çevrildi, Cengizhan tarafından gözden geçirildi."
5. Publish with the CLI (`content:publish ... --lang <lang> --translation-key <key>`, see CLAUDE.md); the pull
   request states "owner approval: <date>". Nothing is translated and published without that approval.

First translation: the Atlas Steward post, `content/posts/atlas-steward-system-that-catches-unfinished-work.en.md`
(`translationKey: atlas-steward`, shared with the Turkish file). It is an AI draft: it waits for the owner's
review (step 3) and has no cover image yet (MKT-20); the translation note at its end is true only after that review.

## Template strings that stay replaced

The site started from a public portfolio template (MIT, 550 forks). Its visible strings must not come back in
either language (MKT-08); the owner keeps the licence notice. The voice test fails on any of them.

| Template string | EN now | TR now |
| --- | --- | --- |
| "Follow Me" (social rail) | Find me elsewhere | Beni başka yerlerde bul |
| "Get in touch" (contact) | Reach me directly | Doğrudan ulaş |
| "Contact Me" (contact heading) | Let’s work together | Birlikte çalışalım |
| "About me" (about heading) | About Cengizhan Köse | Cengizhan Köse hakkında |
| "abit about my self" (about subheading) | My story | Hikâyem |
| "Work Timline", "copyright __" | Work timeline, © {year} Cengizhan Köse | İş deneyimi, © {year} Cengizhan Köse |
| "SUCCESS! Thankyou for your messege", "Faild…" | the contact status messages in `src/i18n/en/contact.js` | `src/i18n/tr/contact.js` |

Generic words (Home, Blog, About, Contact, Portfolio) are not fingerprints and stay.

## What stays out of the copy

- "Gamer Pair" as an employer (it appears only as the hackathon project "Game Pair"), "React Native Bootcamp
  Student" as a job, and the "Product Manager" title at MakasApp (the CV says "Mobile Team Lead").
- "Part time Entrepreneur", "I won two hackathons", "CTO of another one" (2022 positioning, replaced).
- Flutter and Figma as skills (not on the CV).
- Percent bars for skills; dates that say "current" for roles that ended.
- Trinqa and CYCASE, until the owner and the co-founders confirm them.

## Open points (defaults used until the owner answers)

1. Title: "Senior Fullstack Engineer" in the hero and headings, formal "Fullstack Engineer" in the Drivee timeline
   row; the role stays English on TR pages.
2. Fitmondo: years only, because the CV (Mar 2020) and LinkedIn (Nov 2020) disagree on the start month.
3. HyperCut, Courline and 777senselabs: shown undated under "Additional ventures" / "Ek girişimler". Courline
   is another company's product and has no role in the CV; the owner confirms the wording and permission.
4. IstanHack 2024 (second place): hidden, because no independent record exists. The "10 podiums" claim is the
   CV's; the list shows nine until a record turns up.
5. Farmin: "Open Innovation Track, first place". SalesGym: "ConvoAI World Istanbul (Agora Voice AI Hackathon)".
   MultiversX project name: "Avenrise".
6. References: the section stays hidden until at least two named, permitted references exist.
7. Drivee: text only, no screenshots, no metrics.
