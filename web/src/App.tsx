import { HashRouter, Route, Routes } from "react-router-dom";
import { EmptyState } from "./components/ui/Primitives";
import { Layout, OfflineBadge } from "./components/ui/Shell";
import About from "./pages/About";
import Accuracy from "./pages/Accuracy";
import Analyse from "./pages/Analyse";
import Result from "./pages/Result";
import Scenes from "./pages/Scenes";

export { Layout, OfflineBadge };

export default function App() {
  return (
    <HashRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Scenes />} />
          <Route path="/scene/:id" element={<Result />} />
          <Route path="/job/:id" element={<Result job />} />
          <Route path="/analyse" element={<Analyse />} />
          <Route path="/accuracy" element={<Accuracy />} />
          <Route path="/about" element={<About />} />
          <Route path="*" element={<EmptyState title="Page not found" body="That address does not exist. Use the menu to go back." />} />
        </Routes>
      </Layout>
    </HashRouter>
  );
}
