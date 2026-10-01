// @vitest-environment node
//
// MKT-10 and MKT-12 (copy and data half): project types, the reply promise,
// the booking link setting, the contact address and the grep criteria. The
// rendered half is in contact-conversion.test.jsx.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONTENT } from "../../../src/content/index.js";
import { email } from "../../../src/content/shared.js";
import { DICTIONARIES } from "../../../src/i18n/translate.js";
import { PROJECT_TYPES } from "../../../src/lib/analytics/events.js";
import { BOOKING_URL, bookingHref } from "../../../src/pages/contact/config.js";

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), "utf8");

function files(dir) {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap(
    (entry) => {
      const path = `${dir}/${entry.name}`;
      return entry.isDirectory() ? files(path) : [path];
    },
  );
}

const EN = CONTENT.en.contact;
const TR = CONTENT.tr.contact;

describe("project types (MKT-10 step 1)", () => {
  it("has the six ids of the analytics catalogue, in its order, in both languages", () => {
    expect(EN.projectTypes.map((type) => type.id)).toEqual([...PROJECT_TYPES]);
    expect(TR.projectTypes.map((type) => type.id)).toEqual([...PROJECT_TYPES]);
  });

  it("EN labels", () => {
    expect(EN.projectTypes.map((type) => type.label)).toEqual([
      "Mobile app",
      "Web app",
      "AI / LLM integration",
      "Technical leadership",
      "Full-time role",
      "Other",
    ]);
  });

  it("TR labels", () => {
    expect(TR.projectTypes.map((type) => type.label)).toEqual([
      "Mobil uygulama",
      "Web uygulaması",
      "AI / LLM entegrasyonu",
      "Teknik liderlik",
      "Tam zamanlı pozisyon",
      "Diğer",
    ]);
  });
});

describe("reply promise and process (MKT-10 step 3)", () => {
  it("the promise is written once per language: 2 business days (D8 default)", () => {
    expect(EN.responseTime).toBe("2 business days");
    expect(TR.responseTime).toBe("2 iş günü");
  });

  it("the texts take the promise through {time}, never a copy of it", () => {
    for (const [lang, content] of [
      ["en", EN],
      ["tr", TR],
    ]) {
      expect(content.description).toContain("{time}");
      expect(DICTIONARIES[lang]["cta.note"]).toContain("{time}");
      expect(DICTIONARIES[lang]["contact.success"]).toContain("{time}");
      expect(content.description).not.toContain(content.responseTime);
    }
  });

  it("has three steps in each language", () => {
    expect(EN.steps).toEqual([
      "I read your message",
      "A 20-minute intro call",
      "Scope and next steps",
    ]);
    expect(TR.steps).toEqual([
      "Mesajını okurum",
      "20 dakikalık tanışma görüşmesi",
      "Kapsam ve sonraki adımlar",
    ]);
  });
});

describe("form texts (MKT-10 steps 2, 4, 5)", () => {
  it("the submit button says what is sent, not 'Send'", () => {
    expect(DICTIONARIES.en["contact.submit"]).toBe("Send details");
    expect(DICTIONARIES.tr["contact.submit"]).toBe("Detayları gönder");
    expect(DICTIONARIES.en["contact.sending"]).toBe("Sending…");
    expect(DICTIONARIES.tr["contact.sending"]).toBe("Gönderiliyor…");
  });

  it("labels the project type field", () => {
    expect(DICTIONARIES.en["contact.form.projectType"]).toBe("Project type");
    expect(DICTIONARIES.en["contact.form.projectTypeChoose"]).toBe(
      "Choose one",
    );
    expect(DICTIONARIES.tr["contact.form.projectType"]).toBe("Proje tipi");
    expect(DICTIONARIES.tr["contact.form.projectTypeChoose"]).toBe(
      "Birini seç",
    );
  });

  it("the success message sets the expectation and points to the latest post", () => {
    expect(DICTIONARIES.en["contact.success"]).toBe(
      "Got it. I’ll reply to your email within {time}. Meanwhile, have a look at {latestPost}.",
    );
    expect(DICTIONARIES.en["contact.latestPost"]).toBe("my latest post");
    expect(DICTIONARIES.tr["contact.success"]).toBe(
      "Mesajın ulaştı. {time} içinde e-postana dönüyorum. Bu arada {latestPost} göz atabilirsin.",
    );
    expect(DICTIONARIES.tr["contact.latestPost"]).toBe("son yazıma");
  });
});

describe("ways in besides the form (MKT-12)", () => {
  it("the column heading and the two links, in both languages", () => {
    expect(DICTIONARIES.en["contact.reachMe"]).toBe("Reach me directly");
    expect(DICTIONARIES.en["contact.bookCall"]).toBe(
      "Book a 20-minute intro call",
    );
    expect(DICTIONARIES.en["contact.linkedin"]).toBe("Message me on LinkedIn");
    expect(DICTIONARIES.tr["contact.reachMe"]).toBe("Doğrudan ulaş");
    expect(DICTIONARIES.tr["contact.bookCall"]).toBe(
      "20 dakikalık tanışma görüşmesi planla",
    );
    expect(DICTIONARIES.tr["contact.linkedin"]).toBe("LinkedIn’den yaz");
  });

  it("the public address is on the site's own domain", () => {
    expect(email).toBe("me@cengizhankose.com");
    expect(email.endsWith("@cengizhankose.com")).toBe(true);
  });

  it("criterion 1: no gmail.com anywhere in the content or the pages", () => {
    const hits = [...files("src/content"), ...files("src/pages")].filter(
      (file) => /gmail\.com/i.test(read(file)),
    );
    expect(hits).toEqual([]);
  });

  it("criterion 5: no YOUR_FONE (the phone number's placeholder) in src/", () => {
    expect(
      files("src").filter((file) => read(file).includes("YOUR_FONE")),
    ).toEqual([]);
  });

  it("no phone number is written in the contact or content files", () => {
    const phone = /\+?\d[\d\s().-]{8,}\d/;
    const hits = [...files("src/content"), ...files("src/pages/contact")]
      .filter((file) => file.endsWith(".js") || file.endsWith(".jsx"))
      .filter((file) => phone.test(read(file).replace(/\/\/.*$/gm, "")));
    expect(hits).toEqual([]);
  });
});

describe("booking link setting (MKT-12 step 3)", () => {
  it("is empty until the owner has a booking page, so the row stays hidden", () => {
    expect(BOOKING_URL).toBe("");
    expect(bookingHref()).toBe("");
  });

  it("accepts an https URL", () => {
    expect(bookingHref("https://cal.com/cengizhankose/intro")).toBe(
      "https://cal.com/cengizhankose/intro",
    );
    expect(bookingHref("  https://cal.com/x  ")).toBe("https://cal.com/x");
  });

  it("treats anything else as not set", () => {
    for (const value of [
      "",
      "   ",
      "cal.com/x",
      "http://cal.com/x",
      "javascript:alert(1)",
      "mailto:a@b.c",
      null,
      undefined,
      42,
    ]) {
      expect(bookingHref(value)).toBe("");
    }
  });
});
