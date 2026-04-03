import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./App.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <div className="h-screen w-full overflow-hidden bg-transparent">
    <App />
  </div>,
);
