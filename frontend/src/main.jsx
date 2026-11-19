import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { queryClient } from "./lib/queryClient";
import "./styles/index.css";

// Remove StrictMode in production — it intentionally double-invokes
// lifecycle functions and useEffect calls, which is what causes the
// "setTimeout handler took Nms" Violation warnings you see in the console.
// StrictMode is preserved in development via the env check so you still
// benefit from its checks during local development.
const root = createRoot(document.getElementById("root"));
const AppTree = (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </BrowserRouter>
  </QueryClientProvider>
);

if (import.meta.env.DEV) {
  root.render(<StrictMode>{AppTree}</StrictMode>);
} else {
  root.render(AppTree);
}
