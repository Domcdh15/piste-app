import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import Sign from "./pages/Sign.jsx";
import "./index.css";

// Un signataire arrive sur ?sign=<jeton>. Il n'a pas de compte Closia et ne doit
// pas en créer un : le choix se fait ici, avant App, pour qu'aucune logique de
// session ne se déclenche — ni lecture de session, ni appel à /api/team. C'est
// son jeton, dans l'adresse, qui l'identifie.
const signToken = new URLSearchParams(window.location.search).get("sign");

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {signToken ? <Sign token={signToken} /> : <App />}
  </React.StrictMode>
);
