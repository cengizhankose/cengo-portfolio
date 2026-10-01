// Shared error / empty / not-found state (DSG-20). Purely visual: it writes
// no head tags (the page calls usePageMeta, T-03) and fetches nothing (the
// blog states come from src/hooks/usePosts.js, T-04).
//
//   <StatusState
//     title="Post not found"            heading text
//     message="..."                     one short paragraph (optional)
//     headingLevel={1}                  1: the state is the page (a named
//                                       <section>, the page's only h1);
//                                       2+: a state inside a page that has
//                                       its own h1 (a plain block)
//     actions={[{ to, label }]}         router links (localePath'd by the
//                                       caller)
//     onRetry={() => mutate()}          adds the "Try again" button
//     retryLabel="Reload the page"      when the button does something else
//     role="alert"                      for errors that replace content
//     lang="tr"                         when the text's language differs
//                                       from <html lang>
//     className="blog-error" />         page-specific hooks for tests/CSS
import { useId } from "react";
import { Link } from "react-router-dom";
import { useT } from "../../i18n";
import styles from "./statusstate.module.css";

export function StatusState({
  title,
  message,
  headingLevel = 1,
  actions = [],
  onRetry,
  retryLabel,
  role,
  lang,
  className,
}) {
  const t = useT(lang);
  const titleId = useId();
  const pageLevel = headingLevel === 1;
  const Root = pageLevel ? "section" : "div";
  const Heading = `h${Math.min(Math.max(headingLevel, 1), 6)}`;
  const classes = [
    styles.state,
    pageLevel ? styles.statePage : styles.stateInline,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Root
      className={classes}
      aria-labelledby={pageLevel ? titleId : undefined}
      role={role}
      lang={lang}
    >
      <Heading id={titleId} className={styles.title}>
        {title}
      </Heading>
      {message && <p className={styles.text}>{message}</p>}
      {(onRetry || actions.length > 0) && (
        <div className={styles.actions}>
          {onRetry && (
            <button type="button" className={styles.retry} onClick={onRetry}>
              {retryLabel ?? t("status.retry")}
            </button>
          )}
          {actions.length > 0 && (
            <ul className={styles.links}>
              {actions.map(({ to, label }) => (
                <li key={to}>
                  <Link to={to}>{label}</Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Root>
  );
}

export default StatusState;
