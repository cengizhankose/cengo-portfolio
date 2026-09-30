-- Weekly summary by language (ANL-18 step 5c). Read-only: SELECTs only.
--
-- Run by the owner against the self-hosted Umami database, never the
-- portfolio database:
--   outplane env run --app umami -- sh -c 'psql "$DATABASE_URL" -f weekly-by-locale.sql'
--
-- Window: the last 7 days. Change the interval in WINDOW below (one place per
-- query, all spelled `interval '7 days'`).
--
-- Language source: the custom events carry `ui_locale` (route prefix) as event
-- data; Umami's own page views (event_type = 1, no name) carry none, so the
-- sessions and entry pages are taken from the `page_view` events and cross-
-- checked against the URL prefix of the native page views.
--
-- Schema: Umami 3.4.0 (website_event, event_data, session). The column names
-- are those of the web-vitals query in tracking-plan.md section 11; check them
-- with `\d website_event` after every Umami upgrade.
--
-- One result set per query, first column `report`:
--   sessions | crosscheck_pageviews_by_path | top_entry_pages |
--   qualified_contacts | form_error_rate | avg_read_depth |
--   content_language_by_ui_locale | browser_language_by_ui_locale

-- 1. Sessions per ui_locale (sessions with >= 1 page_view event).
SELECT 'sessions' AS report,
       coalesce(l.string_value, '(no ui_locale)') AS ui_locale,
       count(DISTINCT e.session_id) AS sessions,
       count(*) AS page_views
FROM website_event e
LEFT JOIN event_data l
  ON l.website_event_id = e.event_id AND l.data_key = 'ui_locale'
WHERE e.event_name = 'page_view'
  AND e.created_at >= now() - interval '7 days'
GROUP BY 2
ORDER BY 2;

-- 2. Cross-check: Umami's native page views split by the URL prefix (/tr).
--    Should be close to query 1; a large gap means a missing ui_locale.
SELECT 'crosscheck_pageviews_by_path' AS report,
       CASE WHEN e.url_path = '/tr' OR e.url_path LIKE '/tr/%'
            THEN 'tr' ELSE 'en' END AS path_locale,
       count(*) AS page_views,
       count(DISTINCT e.session_id) AS sessions
FROM website_event e
WHERE e.event_type = 1
  AND e.created_at >= now() - interval '7 days'
GROUP BY 2
ORDER BY 2;

-- 3. Top 5 entry pages per language (first native page view of each session,
--    language by URL prefix).
WITH first_view AS (
  SELECT DISTINCT ON (e.session_id)
         e.session_id,
         e.url_path,
         CASE WHEN e.url_path = '/tr' OR e.url_path LIKE '/tr/%'
              THEN 'tr' ELSE 'en' END AS path_locale
  FROM website_event e
  WHERE e.event_type = 1
    AND e.created_at >= now() - interval '7 days'
  ORDER BY e.session_id, e.created_at
),
counted AS (
  SELECT path_locale, url_path, count(*) AS sessions
  FROM first_view
  GROUP BY 1, 2
),
ranked AS (
  SELECT counted.*,
         row_number() OVER (
           PARTITION BY path_locale ORDER BY sessions DESC, url_path
         ) AS rank
  FROM counted
)
SELECT 'top_entry_pages' AS report, path_locale, rank, url_path, sessions
FROM ranked
WHERE rank <= 5
ORDER BY path_locale, rank;

-- 4. Qualified contacts per language (the north star of tracking-plan.md
--    section 5): successful form + mailto click + CV download.
SELECT 'qualified_contacts' AS report,
       l.string_value AS ui_locale,
       count(*) FILTER (WHERE e.event_name = 'contact_form_submitted') AS form_success,
       count(*) FILTER (WHERE e.event_name = 'email_link_clicked') AS email_clicks,
       count(*) FILTER (WHERE e.event_name = 'cv_downloaded') AS cv_downloads,
       count(*) AS qualified_contacts
FROM website_event e
JOIN event_data l
  ON l.website_event_id = e.event_id AND l.data_key = 'ui_locale'
LEFT JOIN event_data r
  ON r.website_event_id = e.event_id AND r.data_key = 'result'
WHERE e.created_at >= now() - interval '7 days'
  AND (
    (e.event_name = 'contact_form_submitted' AND r.string_value = 'success')
    OR e.event_name IN ('email_link_clicked', 'cv_downloaded')
  )
GROUP BY 2
ORDER BY 2;

-- 5. Form error rate per language (contact_form_submitted, result = error).
SELECT 'form_error_rate' AS report,
       l.string_value AS ui_locale,
       count(*) FILTER (WHERE r.string_value = 'error') AS errors,
       count(*) AS submitted,
       round(100.0 * count(*) FILTER (WHERE r.string_value = 'error') / count(*), 1)
         AS error_rate_percent
FROM website_event e
JOIN event_data l
  ON l.website_event_id = e.event_id AND l.data_key = 'ui_locale'
JOIN event_data r
  ON r.website_event_id = e.event_id AND r.data_key = 'result'
WHERE e.event_name = 'contact_form_submitted'
  AND e.created_at >= now() - interval '7 days'
GROUP BY 2
ORDER BY 2;

-- 6. Average read depth per language: the deepest blog_read_progress step
--    (25/50/75/100) of each session and post, averaged.
WITH depth AS (
  SELECT e.session_id,
         s.string_value AS post_slug,
         l.string_value AS ui_locale,
         max(p.number_value) AS max_percent
  FROM website_event e
  JOIN event_data l
    ON l.website_event_id = e.event_id AND l.data_key = 'ui_locale'
  JOIN event_data s
    ON s.website_event_id = e.event_id AND s.data_key = 'post_slug'
  JOIN event_data p
    ON p.website_event_id = e.event_id AND p.data_key = 'percent'
  WHERE e.event_name = 'blog_read_progress'
    AND e.created_at >= now() - interval '7 days'
  GROUP BY 1, 2, 3
)
SELECT 'avg_read_depth' AS report,
       ui_locale,
       round(avg(max_percent), 1) AS avg_max_percent,
       count(*) AS reads
FROM depth
GROUP BY 2
ORDER BY 2;

-- 7. Blog posts read in the other language than the interface
--    (content_language vs ui_locale on page_view events).
SELECT 'content_language_by_ui_locale' AS report,
       l.string_value AS ui_locale,
       c.string_value AS content_language,
       count(*) AS page_views
FROM website_event e
JOIN event_data l
  ON l.website_event_id = e.event_id AND l.data_key = 'ui_locale'
JOIN event_data c
  ON c.website_event_id = e.event_id AND c.data_key = 'content_language'
WHERE e.event_name = 'page_view'
  AND e.created_at >= now() - interval '7 days'
GROUP BY 2, 3
ORDER BY 2, 3;

-- 8. Does a Turkish-browser visitor stay on the English pages? Umami's own
--    "Language" is the browser language (navigator.language), not the site
--    language (tracking-plan.md section 7); it is used only for this
--    comparison.
SELECT 'browser_language_by_ui_locale' AS report,
       CASE WHEN s.language LIKE 'tr%' THEN 'tr browser' ELSE 'other browser' END
         AS browser_language,
       l.string_value AS ui_locale,
       count(DISTINCT e.session_id) AS sessions
FROM website_event e
JOIN session s ON s.session_id = e.session_id
JOIN event_data l
  ON l.website_event_id = e.event_id AND l.data_key = 'ui_locale'
WHERE e.event_name = 'page_view'
  AND e.created_at >= now() - interval '7 days'
GROUP BY 2, 3
ORDER BY 2, 3;
