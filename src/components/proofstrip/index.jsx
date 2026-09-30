import "./style.css";
import { Fragment, useId } from "react";
import { Link } from "react-router-dom";
import { useContent, useLocalePath, useT } from "../../i18n";

// The ProofStrip (MKT-04): who the work was done for, the four first places
// and, once they exist, named references. Used by the About page (variant
// "full") and the home page sections of W11 (variant "compact", MKT-03).
// It renders no section title: the page that places it owns the <h2>; the
// strip's own labels are <h3>s. All data comes from src/content (proof.js and
// awards.js), all text from src/i18n (proof.*), both per page language.

// References render only from this many complete entries (recommended
// default, 00-icerik-girdileri.md §6: no named, permitted reference exists
// yet, so nothing shows and nothing is invented).
export const MIN_TESTIMONIALS = 2;

const hasText = (value) => typeof value === "string" && value.trim() !== "";

// A reference needs a quote, a name, a role and a company (MKT-04 step 1).
export const isCompleteTestimonial = (item) =>
  hasText(item?.quote) &&
  hasText(item?.name) &&
  hasText(item?.role) &&
  hasText(item?.company);

// Parts joined by a middle dot, optionally one link around the whole line.
// The dots are decoration for the eye: screen readers get the parts as
// separate runs of text.
export function DotLine({ parts, href }) {
  const line = parts.map((part, index) => (
    <Fragment key={`${index}:${part}`}>
      {index > 0 && <span aria-hidden="true"> · </span>}
      {part}
    </Fragment>
  ));
  return href ? <a href={href}>{line}</a> : <span>{line}</span>;
}

// "event · year · place · project", linked when the record has public
// evidence (a record without a project, such as the IstanHack one, simply
// has one part fewer).
export function AwardLine({ award }) {
  const parts = [award.event, award.year, award.place, award.project].filter(
    (part) => part !== undefined && part !== "",
  );
  return <DotLine parts={parts} href={award.url} />;
}

export function ProofStrip({ variant = "full" }) {
  const t = useT();
  const lp = useLocalePath();
  const { proof, awards } = useContent();
  const id = useId();

  const references = proof.testimonials.filter(isCompleteTestimonial);
  const showReferences = references.length >= MIN_TESTIMONIALS;
  const shape = variant === "compact" ? "compact" : "full";

  return (
    <div className={`proofstrip proofstrip--${shape}`}>
      <div className="proofstrip__group">
        <h3 className="proofstrip__label" id={`${id}-companies`}>
          {t("proof.companies")}
        </h3>
        <ul
          className="proof-companies list-unstyled"
          aria-labelledby={`${id}-companies`}
        >
          {proof.companies.map((company) => (
            <li key={company.name}>{company.name}</li>
          ))}
        </ul>
      </div>

      <div className="proofstrip__group">
        <h3 className="proofstrip__label" id={`${id}-awards`}>
          {t("proof.awards")}
        </h3>
        <ul
          className="proof-awards list-unstyled"
          aria-labelledby={`${id}-awards`}
        >
          {proof.awards.map((award) => (
            <li key={award.id}>
              <AwardLine award={award} />
            </li>
          ))}
        </ul>
        <p className="proofstrip__more">
          <Link to={`${lp("/about")}#awards`}>
            {t("proof.podiums", { count: awards.length })}
          </Link>
        </p>
      </div>

      {showReferences && (
        <div className="proofstrip__group">
          <h3 className="proofstrip__label">{t("proof.testimonials")}</h3>
          <div className="proof-testimonials">
            {references.map((item) => (
              <figure key={item.id} className="proof-testimonial">
                <blockquote>
                  <p>{item.quote}</p>
                </blockquote>
                <figcaption>
                  <span className="proof-testimonial__name">{item.name}</span>
                  <span className="proof-testimonial__role">
                    {item.role} — {item.company}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
