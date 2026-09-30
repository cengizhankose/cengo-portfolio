import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import { initAnalytics } from "./lib/analytics";
import "./index.css";

const container = document.getElementById("root");
const root = ReactDOM.createRoot(container);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// ANL-01 / ANL-16 (T-13): loads Umami + field Web Vitals only in a production
// build on www.cengizhankose.com with a website id set and no opt-out.
initAnalytics();
