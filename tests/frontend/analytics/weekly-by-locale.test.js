// @vitest-environment node
//
// ANL-18 step 5c: claudedocs/analytics/weekly-by-locale.sql runs and answers
// per language. The schema below is a minimal stand-in for Umami 3.x
// (website_event, event_data, session: only the columns the queries read), in
// PGlite. It proves the SQL parses and aggregates as documented; the real
// Umami column names are checked by the owner on the first run ("local-db-gate":
// needs the live Umami database).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const SQL = readFileSync(
  join(ROOT, "claudedocs/analytics/weekly-by-locale.sql"),
  "utf8",
);

const SCHEMA = `
  CREATE TABLE session (session_id uuid PRIMARY KEY, language text);
  CREATE TABLE website_event (
    event_id uuid PRIMARY KEY, session_id uuid, created_at timestamptz,
    url_path text, event_type int, event_name text);
  CREATE TABLE event_data (
    website_event_id uuid, data_key text, string_value text, number_value numeric);
`;

let db;
let counter = 0;
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

async function addSession(id, language) {
  await db.query("INSERT INTO session VALUES ($1, $2)", [uuid(id), language]);
}

// A native page view (event_type 1) and/or a custom event with its data.
async function addEvent({
  session,
  path = "/",
  type = 2,
  name = null,
  hoursAgo = 1,
  data = {},
}) {
  counter += 1;
  const id = uuid(1000 + counter);
  await db.query(
    `INSERT INTO website_event VALUES
       ($1, $2, now() - ($3 || ' hours')::interval, $4, $5, $6)`,
    [id, uuid(session), String(hoursAgo), path, type, name],
  );
  for (const [key, value] of Object.entries(data)) {
    const isNumber = typeof value === "number";
    await db.query("INSERT INTO event_data VALUES ($1, $2, $3, $4)", [
      id,
      key,
      isNumber ? null : value,
      isNumber ? value : null,
    ]);
  }
}

const pageView = (session, path, locale, extra = {}) =>
  Promise.all([
    addEvent({ session, path, type: 1 }),
    addEvent({
      session,
      path,
      name: "page_view",
      data: { page_type: "home", ui_locale: locale, ...extra },
    }),
  ]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SCHEMA);

  await addSession(1, "tr-TR");
  await addSession(2, "en-US");
  await addSession(3, "tr-TR");
  await addSession(4, "en-GB");

  // s1: TR browser, TR pages, successful form
  await pageView(1, "/tr", "tr", { content_language: "tr" });
  await pageView(1, "/tr/contact", "tr", { content_language: "tr" });
  await addEvent({
    session: 1,
    name: "contact_form_submitted",
    data: { result: "success", ui_locale: "tr" },
  });
  // s2: EN, failed form then mailto
  await pageView(2, "/about", "en", { content_language: "en" });
  await addEvent({
    session: 2,
    name: "contact_form_submitted",
    data: { result: "error", ui_locale: "en" },
  });
  await addEvent({
    session: 2,
    name: "email_link_clicked",
    data: { location: "contact_page", ui_locale: "en" },
  });
  // s3: TR browser on the EN home page, reads a TR post (EN interface), CV
  await pageView(3, "/", "en", { content_language: "en" });
  await pageView(3, "/blog/merhaba", "en", { content_language: "tr" });
  await addEvent({
    session: 3,
    name: "blog_read_progress",
    data: { post_slug: "merhaba", percent: 50, ui_locale: "en" },
  });
  await addEvent({
    session: 3,
    name: "blog_read_progress",
    data: { post_slug: "merhaba", percent: 75, ui_locale: "en" },
  });
  await addEvent({
    session: 3,
    name: "cv_downloaded",
    data: { cv_language: "en", ui_locale: "en" },
  });
  // s4: EN, enters on /, TR read of a TR post under /tr
  await pageView(4, "/", "en", { content_language: "en" });
  await pageView(4, "/tr/blog/merhaba", "tr", { content_language: "tr" });
  await addEvent({
    session: 4,
    name: "blog_read_progress",
    data: { post_slug: "merhaba", percent: 100, ui_locale: "tr" },
  });
  // older than the window: must not count
  await addEvent({
    session: 4,
    path: "/tr",
    type: 1,
    hoursAgo: 24 * 30,
  });
  await addEvent({
    session: 4,
    name: "page_view",
    hoursAgo: 24 * 30,
    data: { ui_locale: "tr" },
  });
});

afterAll(() => db.close());

async function report(name) {
  const results = await db.exec(SQL);
  const rows = results.flatMap((result) => result.rows);
  return rows.filter((row) => row.report === name);
}

describe("weekly-by-locale.sql (ANL-18 step 5c)", () => {
  it("runs as one script: eight result sets, SELECTs only", async () => {
    const results = await db.exec(SQL);
    expect(results).toHaveLength(8);
    expect(SQL).not.toMatch(/\b(insert|update|delete|drop|alter|truncate)\b/i);
  });

  it("sessions and page views per ui_locale", async () => {
    const rows = await report("sessions");
    expect(rows).toEqual([
      { report: "sessions", ui_locale: "en", sessions: 3, page_views: 4 },
      { report: "sessions", ui_locale: "tr", sessions: 2, page_views: 3 },
    ]);
  });

  it("cross-check by URL prefix agrees with the events", async () => {
    const rows = await report("crosscheck_pageviews_by_path");
    expect(rows).toEqual([
      {
        report: "crosscheck_pageviews_by_path",
        path_locale: "en",
        page_views: 4,
        sessions: 3,
      },
      {
        report: "crosscheck_pageviews_by_path",
        path_locale: "tr",
        page_views: 3,
        sessions: 2,
      },
    ]);
  });

  it("top entry pages: first native page view of each session", async () => {
    const rows = await report("top_entry_pages");
    expect(
      rows.map((r) => [r.path_locale, r.rank, r.url_path, r.sessions]),
    ).toEqual([
      ["en", 1, "/", 2],
      ["en", 2, "/about", 1],
      ["tr", 1, "/tr", 1],
    ]);
  });

  it("qualified contacts per language", async () => {
    const rows = await report("qualified_contacts");
    expect(rows).toEqual([
      {
        report: "qualified_contacts",
        ui_locale: "en",
        form_success: 0,
        email_clicks: 1,
        cv_downloads: 1,
        qualified_contacts: 2,
      },
      {
        report: "qualified_contacts",
        ui_locale: "tr",
        form_success: 1,
        email_clicks: 0,
        cv_downloads: 0,
        qualified_contacts: 1,
      },
    ]);
  });

  it("form error rate per language", async () => {
    const rows = await report("form_error_rate");
    expect(rows.map((r) => [r.ui_locale, r.errors, r.submitted])).toEqual([
      ["en", 1, 1],
      ["tr", 0, 1],
    ]);
    expect(Number(rows[0].error_rate_percent)).toBe(100);
    expect(Number(rows[1].error_rate_percent)).toBe(0);
  });

  it("average read depth: deepest step per session and post", async () => {
    const rows = await report("avg_read_depth");
    expect(
      rows.map((r) => [r.ui_locale, Number(r.avg_max_percent), r.reads]),
    ).toEqual([
      ["en", 75, 1],
      ["tr", 100, 1],
    ]);
  });

  it("content_language against ui_locale", async () => {
    const rows = await report("content_language_by_ui_locale");
    expect(
      rows.map((r) => [r.ui_locale, r.content_language, r.page_views]),
    ).toEqual([
      ["en", "en", 3],
      ["en", "tr", 1],
      ["tr", "tr", 3],
    ]);
  });

  it("browser language against ui_locale", async () => {
    const rows = await report("browser_language_by_ui_locale");
    expect(
      rows.map((r) => [r.browser_language, r.ui_locale, r.sessions]),
    ).toEqual([
      ["other browser", "en", 2],
      ["other browser", "tr", 1],
      ["tr browser", "en", 1],
      ["tr browser", "tr", 1],
    ]);
  });
});
