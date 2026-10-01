CREATE TABLE "request_daily_stats" (
	"day" date NOT NULL,
	"host" text NOT NULL,
	"path_group" text NOT NULL,
	"status_class" text NOT NULL,
	"country" text NOT NULL,
	"is_bot" boolean DEFAULT false NOT NULL,
	"requests" integer DEFAULT 0 NOT NULL,
	"origin_ms_sum" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "request_daily_stats_pk" PRIMARY KEY("day","host","path_group","status_class","country","is_bot"),
	CONSTRAINT "request_daily_stats_requests_check" CHECK ("request_daily_stats"."requests" >= 0),
	CONSTRAINT "request_daily_stats_origin_ms_sum_check" CHECK ("request_daily_stats"."origin_ms_sum" >= 0)
);
