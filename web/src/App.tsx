import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { appBasePath } from "./appPaths";
import ConsoleHome from "./ConsoleHome";
import { HelpPage } from "./HelpPage";
import { MetricsGraphPage } from "./MetricsGraphPage";

export default function App() {
  return (
    <BrowserRouter basename={appBasePath()}>
      <Routes>
        <Route path="/" element={<ConsoleHome />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/graph/:panel" element={<MetricsGraphPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
