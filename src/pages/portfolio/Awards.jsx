import styles from "./portfolio.module.css";
import ExternalLink from "../../components/ExternalLink.jsx";
import { DotLine } from "../../components/proofstrip";
import { awardRecord } from "../../content/awards.js";
import { HACKATHON_ARCHIVE } from "../../content/projects.js";
import { useContent, useT } from "../../i18n";
import {
  AWARD_IMAGE,
  awardSrc,
  awardSrcSet,
  awardWidths,
} from "./awardImage.js";
import { projectLinkProps } from "./tracking.js";

// The hackathon section of the portfolio (W13, MKT-01 step 3): every shown
// podium of the archive (src/content/{en,tr}/awards.js, newest first) as a
// tile: the photo from the owner's own post, or the place as a large numeral
// where there is none; the event (h3), place · project · year, one or two
// sentences and the links to the public evidence, one per line (the first
// is the main one; src/content/{en,tr}/awards.js `links`).
//
// Below 768px a tile is a thumbnail beside its text, from 768px a third of
// the row with the picture on top (portfolio.module.css). The heading counts
// every podium of the archive, the hidden IstanHack record included, as the
// rest of the site does ("10 podiums").
//
// Every evidence link sends project_clicked { hackathon_archive, post,
// position, link_index } (ANL-11): `position` is the section's place among
// the tracked items of the page (after the cases), the slot the archive has
// always had; `link_index` the link's place in its tile, from 1.
export function Awards({ position }) {
  const t = useT();
  const { awards } = useContent();
  const shown = awards.filter((award) => !award.hidden);

  return (
    <section
      className="section-gap"
      id={HACKATHON_ARCHIVE.hash}
      aria-labelledby="portfolio-awards-title"
    >
      <h2 className={styles.sectionTitle} id="portfolio-awards-title">
        {t("portfolio.awards.title", { count: awards.length })}
      </h2>
      <p className={styles.sectionText}>{t("portfolio.awards.text")}</p>
      <ol className={`${styles.awardGrid} list-unstyled`}>
        {shown.map((award) => (
          <AwardTile
            key={award.id}
            award={award}
            record={awardRecord(award.id)}
            position={position}
          />
        ))}
      </ol>
    </section>
  );
}

function AwardPicture({ image, alt }) {
  const widths = awardWidths(image);
  const largest = widths[widths.length - 1];
  return (
    <picture>
      <source
        type="image/avif"
        srcSet={awardSrcSet(image, "avif")}
        sizes={AWARD_IMAGE.sizes}
      />
      <source
        type="image/webp"
        srcSet={awardSrcSet(image, "webp")}
        sizes={AWARD_IMAGE.sizes}
      />
      <img
        src={awardSrc(image.name, widths[0], "webp")}
        srcSet={awardSrcSet(image, "webp")}
        sizes={AWARD_IMAGE.sizes}
        width={largest}
        height={largest}
        alt={alt}
        loading="lazy"
        decoding="async"
      />
    </picture>
  );
}

export function AwardTile({ award, record, position }) {
  const image = record?.image;

  return (
    <li className={styles.award} data-award-id={award.id}>
      <div className={styles.awardMedia}>
        {image && award.imageAlt ? (
          <AwardPicture image={image} alt={award.imageAlt} />
        ) : (
          // The place as a numeral: decoration, the text says it.
          <svg
            className={styles.awardRank}
            viewBox="0 0 100 100"
            aria-hidden="true"
            focusable="false"
          >
            <text
              x="50"
              y="50"
              fontSize="64"
              textAnchor="middle"
              dominantBaseline="central"
            >
              {record?.rank}
            </text>
          </svg>
        )}
      </div>
      <div>
        <h3 className={styles.awardTitle}>{award.event}</h3>
        <p className={styles.awardMeta}>
          <DotLine
            parts={[award.place, award.project, award.year].filter(
              (part) => part !== undefined && part !== "",
            )}
          />
        </p>
        {award.summary && <p className={styles.awardText}>{award.summary}</p>}
        {award.links?.length > 0 && (
          <ul className={`${styles.awardLinks} list-unstyled`}>
            {award.links.map((link, index) => (
              <li key={link.url}>
                <ExternalLink
                  href={link.url}
                  hrefLang={link.hreflang}
                  {...projectLinkProps(
                    HACKATHON_ARCHIVE.id,
                    "post",
                    position,
                    index + 1,
                  )}
                >
                  {link.label}
                  <span aria-hidden="true"> →</span>
                </ExternalLink>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}
