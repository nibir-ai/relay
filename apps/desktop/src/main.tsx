import React from "react";
import {createRoot} from "react-dom/client";
import "@fontsource-variable/jetbrains-mono";
import "../../web/src/styles.css";
import "./desktop.css";
import App from "./App";
createRoot(document.getElementById("root")!).render(<React.StrictMode><App/></React.StrictMode>);
