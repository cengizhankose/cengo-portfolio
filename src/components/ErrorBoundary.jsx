// Route error boundary (FE-03). A page that throws while rendering, or a
// lazy page chunk that fails to load (FE-05, W6), takes down only the route
// content: the header, the menu and the social strip stay usable.
//
// src/app/routes.jsx keys the wrapper around the route outlet by the pathname
//   <div key={pathname}><ErrorBoundary>…</ErrorBoundary></div>
// so moving to another page mounts a fresh boundary and the page renders
// again (FE-03 criterion 3).
//
// React 19 still needs a class for this. React already reports the caught
// error (createRoot's onCaughtError, console.error by default), so nothing
// is logged twice here; `onError` is the hook for an error report.
import { Component } from "react";
import { StatusState } from "./statusstate";
import { useLocalePath, useT, useUiLocale } from "../i18n";

// Fallback: what happened, "Reload the page" (a new chunk or a fresh
// document fixes most failures) and the way home.
export function RouteErrorFallback() {
  const t = useT();
  const lp = useLocalePath();
  const uiLocale = useUiLocale();
  return (
    <StatusState
      role="alert"
      lang={uiLocale}
      className="route-error"
      title={t("status.crash.title")}
      message={t("status.crash.text")}
      onRetry={() => window.location.reload()}
      retryLabel={t("status.reload")}
      actions={[{ to: lp("/"), label: t("status.home") }]}
    />
  );
}

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    this.props.onError?.(error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    const Fallback = this.props.fallback ?? RouteErrorFallback;
    return <Fallback />;
  }
}

export default ErrorBoundary;
