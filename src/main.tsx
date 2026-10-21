import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles/prototype.css";
import "./styles/app.css";
import { useAppStore } from "./store/useAppStore";

if (document.defaultView && ["127.0.0.1", "localhost"].includes(location.hostname)) {
  (document.defaultView as any).__riverStore = useAppStore;
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
