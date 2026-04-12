import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import netlifyIdentity from "netlify-identity-widget";
import App from "./App";
import "./theme.css";

const devAuth = import.meta.env.VITE_DEV_AUTH === "1";
const apiUrl = `${import.meta.env.VITE_SITE_URL || window.location.origin}/.netlify/identity`;
if (!devAuth) {
  netlifyIdentity.init({ APIUrl: apiUrl });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename="/admin">
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
