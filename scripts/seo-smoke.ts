// Post-deploy check of the server-written SEO layer (SEO-01 step 12).
//
//   bun run scripts/seo-smoke.ts https://www.cengizhankose.com
//   bun run scripts/seo-smoke.ts http://127.0.0.1:3000 --post my-slug --min-words 1500
//
// It fetches the pages the way a crawler does (no JavaScript) and checks the
// raw HTML, exactly what `curl | grep -c` would count:
//   - the five static pages, one post per language and, when the TR pages are
//     open (/tr answers 200), their TR versions: status 200, one <title>, one
//     description, one canonical (none on a noindex page), og:url equal to the
//     canonical, <html lang> equal to the language of the URL (of the post for a
//     post), a filled <div id="root">;
//   - titles that differ from page to page within one language;
//   - hreflang pairs that point back (page A lists B, B lists A and itself);
//   - a post's #root holds its article: word count, one <h1>;
//   - the old address of a post (the other language's prefix) is one 301;
//   - two made-up addresses (one under /tr/) are 404 with noindex and no
//     canonical.
// Exit code 1 when any check fails. Run it after every deploy; to see what the
// crawler sees on a page, `curl -s <url>` and look at <head> and #root.
//
// `runSmoke` takes the fetch function, so tests run it against an in-process
// app with no port (tests/server/ssr/smoke.test.ts).
const SITE_PATHS = ["/", "/about", "/portfolio", "/contact", "/blog"] as const;
const FAKE_PATH = "/seo-smoke-not-a-page-7f3";

export interface SmokeOptions {
  /** Fetch to use (default: global fetch); tests pass one that calls the app. */
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
  /** Check this post as well (its language is read from the API). */
  post?: string;
  /** Fewest words the snapshot of a post must hold (default 100). */
  minWords?: number;
  /** Per-request timeout in ms (default 15 000). */
  timeoutMs?: number;
}

export interface SmokeResult {
  ok: boolean;
  failures: string[];
  lines: string[];
}

interface Page {
  url: string;
  path: string;
  status: number;
  headers: Headers;
  html: string;
  location: string | null;
}

const count = (text: string, pattern: RegExp) =>
  (text.match(pattern) ?? []).length;

/** The `content` of the first `<meta>` whose `attribute` is `key`, or null. */
function metaContent(html: string, attribute: string, key: string) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (!new RegExp(`\\b${attribute}="${key}"`, "i").test(tag)) continue;
    const content = /\bcontent="([^"]*)"/i.exec(tag);
    return content ? decodeEntities(content[1]) : null;
  }
  return null;
}

function linkHref(html: string, rel: string): string[] {
  const out: string[] = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    if (!new RegExp(`\\brel="${rel}"`, "i").test(tag)) continue;
    const href = /\bhref="([^"]*)"/i.exec(tag);
    if (href) out.push(decodeEntities(href[1]));
  }
  return out;
}

function alternates(html: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    if (!/\brel="alternate"/i.test(tag)) continue;
    const lang = /\bhreflang="([^"]*)"/i.exec(tag);
    const href = /\bhref="([^"]*)"/i.exec(tag);
    if (lang && href) out.set(lang[1], decodeEntities(href[1]));
  }
  return out;
}

const decodeEntities = (value: string) =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

const titleOf = (html: string) =>
  decodeEntities(/<title\b[^>]*>([^<]*)<\/title>/i.exec(html)?.[1] ?? "");

/** Text inside <div id="root">, up to the data block or </body>. */
function rootHtml(html: string): string {
  const start = html.indexOf('<div id="root">');
  if (start === -1) return "";
  const from = start + '<div id="root">'.length;
  const dataAt = html.indexOf('<script id="__SEO_DATA__"', from);
  const bodyAt = html.search(/<\/body>/i);
  const end = dataAt !== -1 ? dataAt : bodyAt !== -1 ? bodyAt : html.length;
  return html.slice(from, end);
}

const wordsOf = (fragment: string) =>
  fragment
    .replace(/<[^>]*>/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;

const pathOf = (url: string) => {
  const { pathname, search } = new URL(url);
  return pathname + search;
};

export async function runSmoke(
  baseUrl: string,
  {
    fetch: fetchImpl = (url, init) => fetch(url, init),
    post,
    minWords = 100,
    timeoutMs = 15_000,
  }: SmokeOptions = {},
): Promise<SmokeResult> {
  const base = baseUrl.replace(/\/+$/, "");
  const failures: string[] = [];
  const lines: string[] = [];
  const pages = new Map<string, Page>();

  const check = (ok: boolean, label: string, detail = "") => {
    lines.push(
      `${ok ? "ok  " : "FAIL"} ${label}${!ok && detail ? ` (${detail})` : ""}`,
    );
    if (!ok) failures.push(label);
  };

  const get = async (path: string): Promise<Page> => {
    const cached = pages.get(path);
    if (cached) return cached;
    const url = `${base}${path}`;
    const res = await fetchImpl(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const page: Page = {
      url,
      path,
      status: res.status,
      headers: res.headers,
      html: res.status === 200 || res.status === 404 ? await res.text() : "",
      location: res.headers.get("location"),
    };
    pages.set(path, page);
    return page;
  };

  const getJson = async <T>(path: string): Promise<T | null> => {
    try {
      const res = await fetchImpl(`${base}${path}`, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      return res.ok ? ((await res.json()) as T) : null;
    } catch {
      return null;
    }
  };

  // ---- which pages exist: the static ones, the newest post per language
  const trOpen = (await get("/tr")).status === 200;
  lines.push(
    trOpen
      ? "info TR static pages are open (/tr answers 200)"
      : "info TR static pages are not open (/tr is not 200): TR pages are not checked",
  );

  type PostRef = { slug: string; lang: "en" | "tr" };
  const posts: PostRef[] = [];
  for (const lang of ["en", "tr"] as const) {
    const list = await getJson<{ slug: string }[]>(`/api/posts?lang=${lang}`);
    if (list?.[0]) posts.push({ slug: list[0].slug, lang });
  }
  if (post && !posts.some((p) => p.slug === post)) {
    const one = await getJson<{ slug: string; lang: "en" | "tr" }>(
      `/api/posts/${encodeURIComponent(post)}`,
    );
    if (one) posts.push({ slug: one.slug, lang: one.lang });
    else check(false, `--post ${post} exists in the API`);
  }
  check(posts.length > 0, "the API lists at least one post to check");

  const postPath = (p: PostRef) =>
    `${p.lang === "tr" ? "/tr" : ""}/blog/${p.slug}`;
  const staticPaths = [
    ...SITE_PATHS.map((path) => path),
    ...(trOpen
      ? SITE_PATHS.map((path) => (path === "/" ? "/tr" : `/tr${path}`))
      : []),
  ];
  const indexable = (html: string) =>
    !/\bnoindex\b/i.test(metaContent(html, "name", "robots") ?? "");

  // ---- every page: status, head, language, snapshot
  async function checkPage(
    path: string,
    expectedLang: string,
    isPost: boolean,
  ) {
    const page = await get(path);
    const at = path;
    check(page.status === 200, `${at} answers 200`, `got ${page.status}`);
    if (page.status !== 200) return;

    const { html } = page;
    check(
      count(html, /<title\b/gi) === 1,
      `${at} has one <title>`,
      `found ${count(html, /<title\b/gi)}`,
    );
    check(
      count(html, /<meta\b[^>]*\bname="description"/gi) === 1,
      `${at} has one meta description`,
    );
    check(
      new RegExp(`<html[^>]*\\blang="${expectedLang}"`, "i").test(html),
      `${at} has <html lang="${expectedLang}">`,
    );

    const canonicals = linkHref(html, "canonical");
    if (indexable(html)) {
      check(
        canonicals.length === 1,
        `${at} has one canonical`,
        `found ${canonicals.length}`,
      );
      const ogUrl = metaContent(html, "property", "og:url");
      check(
        canonicals.length === 1 && ogUrl === canonicals[0],
        `${at} og:url equals the canonical`,
        `${ogUrl} vs ${canonicals[0]}`,
      );
    } else {
      check(canonicals.length === 0, `${at} is noindex and has no canonical`);
      check(
        /noindex/i.test(page.headers.get("x-robots-tag") ?? ""),
        `${at} sends X-Robots-Tag noindex`,
      );
    }

    const root = rootHtml(html);
    check(
      root !== "" && wordsOf(root) > 0,
      `${at} has a readable snapshot in #root`,
    );
    check(
      count(root, /<h1\b/gi) === 1,
      `${at} #root has one <h1>`,
      `found ${count(root, /<h1\b/gi)}`,
    );

    if (path === "/") {
      check(
        count(html, /rel="preload" as="image"/gi) === 1,
        "/ has one hero image preload",
      );
    } else if (!isPost) {
      check(
        count(html, /rel="preload" as="image"/gi) === 0,
        `${at} has no hero image preload`,
      );
    }
    if (isPost || path.endsWith("/blog")) {
      check(
        html.includes('id="__SEO_DATA__"'),
        `${at} has the first-data block`,
      );
    }
  }

  for (const path of staticPaths) {
    await checkPage(
      path,
      path === "/tr" || path.startsWith("/tr/") ? "tr" : "en",
      false,
    );
  }
  for (const p of posts) {
    await checkPage(postPath(p), p.lang, true);
    const page = pages.get(postPath(p));
    if (page?.status === 200) {
      const words = wordsOf(rootHtml(page.html));
      check(
        words >= minWords,
        `${postPath(p)} #root holds the article (${words} words)`,
        `need ${minWords}`,
      );
      check(
        count(rootHtml(page.html), /<h[23]\b/gi) >= 1,
        `${postPath(p)} #root has section headings`,
      );
    }
  }

  // ---- one title per page within a language
  for (const lang of ["en", "tr"] as const) {
    const titles = [...pages.values()]
      .filter(
        (page) =>
          page.status === 200 &&
          !page.path.startsWith("/api") &&
          (lang === "tr"
            ? page.path.startsWith("/tr")
            : !page.path.startsWith("/tr")),
      )
      // a post written in the other language is not part of this language's set
      .filter((page) =>
        new RegExp(`<html[^>]*\\blang="${lang}"`, "i").test(page.html),
      )
      .map((page) => titleOf(page.html));
    if (titles.length > 1) {
      check(
        new Set(titles).size === titles.length,
        `the ${titles.length} ${lang} titles are all different`,
      );
    }
  }

  // ---- hreflang pairs point back
  for (const page of [...pages.values()]) {
    if (page.status !== 200) continue;
    const own = alternates(page.html);
    if (own.size === 0) continue;
    const selfUrl = linkHref(page.html, "canonical")[0] ?? page.url;
    check(
      [...own.values()].includes(selfUrl),
      `${page.path} lists itself among its hreflang alternates`,
    );
    for (const [lang, href] of own) {
      if (href === selfUrl || lang === "x-default") continue;
      const other = await get(pathOf(href));
      const back =
        other.status === 200 ? [...alternates(other.html).values()] : [];
      check(
        back.includes(selfUrl),
        `${page.path} <-> ${pathOf(href)} hreflang is reciprocal`,
      );
    }
  }

  // ---- the old address of a post is one 301
  for (const p of posts) {
    const other = p.lang === "tr" ? `/blog/${p.slug}` : `/tr/blog/${p.slug}`;
    const moved = await get(other);
    check(
      moved.status === 301 && moved.location === postPath(p),
      `${other} is one 301 to ${postPath(p)}`,
      `got ${moved.status} ${moved.location ?? ""}`,
    );
  }

  // ---- made-up addresses are real 404s
  for (const path of [FAKE_PATH, `/tr${FAKE_PATH}`]) {
    const page = await get(path);
    check(page.status === 404, `${path} answers 404`, `got ${page.status}`);
    check(
      /noindex/i.test(page.headers.get("x-robots-tag") ?? "") &&
        /noindex/i.test(metaContent(page.html, "name", "robots") ?? ""),
      `${path} is noindex in the header and in the page`,
    );
    check(
      linkHref(page.html, "canonical").length === 0,
      `${path} has no canonical`,
    );
  }

  lines.push(
    failures.length === 0
      ? `SEO smoke passed (${pages.size} pages fetched)`
      : `SEO smoke FAILED: ${failures.length} check(s)`,
  );
  return { ok: failures.length === 0, failures, lines };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const at = args.indexOf(name);
    return at === -1 ? undefined : args[at + 1];
  };
  const base = args.find(
    (arg, i) => !arg.startsWith("--") && args[i - 1]?.startsWith("--") !== true,
  );
  if (!base) {
    console.error(
      "usage: bun run scripts/seo-smoke.ts <baseUrl> [--post <slug>] [--min-words <n>]",
    );
    process.exit(2);
  }
  const minWords = flag("--min-words");
  const { ok, lines } = await runSmoke(base, {
    post: flag("--post"),
    minWords: minWords === undefined ? undefined : Number(minWords),
  });
  console.log(lines.join("\n"));
  process.exit(ok ? 0 : 1);
}
