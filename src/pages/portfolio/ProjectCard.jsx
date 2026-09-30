import { FaTrophy } from "react-icons/fa";
import { useT } from "../../i18n";
import ExternalLink from "../../components/ExternalLink.jsx";
import { PROJECT_IMAGE, projectSrc, projectSrcSet } from "./projectImage.js";
import { projectLinkProps } from "./tracking.js";

// A card shows at most this many stack tags (DSG-08).
export const MAX_TAGS = 5;

// One case of the portfolio (FE-04, DSG-08, MKT-01): image (when the
// responsive set exists), one-line award badge (when there is a podium),
// h2, problem / role / result, stack tags and one or two links.
//
// `project` is the registry record (src/content/projects.js), `text` the card
// text of the page language, `position` the 1-based place among the tracked
// items of the page (tracking.js). A card has several links, so there is no
// stretched link over the whole card.
export default function ProjectCard({ project, text, position }) {
  const t = useT();
  const titleId = `project-${project.id}`;
  const image = project.image;

  return (
    <article
      className="project-card"
      data-project-id={project.id}
      aria-labelledby={titleId}
    >
      {image && text.imageAlt && (
        <picture className="project-card__media">
          <source
            type="image/avif"
            srcSet={projectSrcSet(image.name, "avif")}
            sizes={PROJECT_IMAGE.sizes}
          />
          <source
            type="image/webp"
            srcSet={projectSrcSet(image.name, "webp")}
            sizes={PROJECT_IMAGE.sizes}
          />
          <img
            src={projectSrc(image.name, PROJECT_IMAGE.fallbackWidth, "webp")}
            srcSet={projectSrcSet(image.name, "webp")}
            sizes={PROJECT_IMAGE.sizes}
            width={PROJECT_IMAGE.width}
            height={PROJECT_IMAGE.height}
            alt={text.imageAlt}
            loading="lazy"
            decoding="async"
          />
        </picture>
      )}
      <div className="project-card__body">
        {text.awardLabel && (
          <p className="project-card__award">
            <FaTrophy aria-hidden="true" focusable="false" /> {text.awardLabel}
          </p>
        )}
        <h2 className="project-card__title h4" id={titleId}>
          {text.title}
        </h2>
        <dl className="project-card__facts">
          {["problem", "role", "result"].map((key) => (
            <div key={key} className="project-card__fact">
              <dt>{t(`portfolio.${key}`)}</dt>
              <dd>{text[key]}</dd>
            </div>
          ))}
        </dl>
        <ul
          className="project-card__tags list-unstyled"
          aria-label={t("portfolio.stack")}
        >
          {project.stack.slice(0, MAX_TAGS).map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
        </ul>
        <ul className="project-card__links list-unstyled">
          {project.links.map((link) => (
            <li key={link.type}>
              <ExternalLink
                href={link.href}
                hrefLang={link.hreflang}
                {...projectLinkProps(project.id, link.type, position)}
              >
                {text.cta[link.type]}
                <span aria-hidden="true"> →</span>
              </ExternalLink>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
