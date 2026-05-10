import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import ConsoleHome from "./ConsoleHome";
import { HelpPage } from "./HelpPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ConsoleHome />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
