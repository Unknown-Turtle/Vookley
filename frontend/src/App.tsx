import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell";
import { Analyze } from "./pages/Analyze";
import { ComparePage } from "./pages/ComparePage";
import { Home } from "./pages/Home";
import { Library } from "./pages/Library";
import { Report } from "./pages/Report";
import { Research } from "./pages/Research";

function NotFound() {
  return (
    <div className="container page">
      <div className="empty stack">
        <h1 className="display h-section">Page not found</h1>
        <p>
          <Link className="btn btn-primary" to="/">
            Back to the start
          </Link>
        </p>
      </div>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Home />} />
          <Route path="analyze" element={<Analyze />} />
          <Route path="track/:id" element={<Report />} />
          <Route path="library" element={<Library />} />
          <Route path="compare/:a/:b" element={<ComparePage />} />
          <Route path="research" element={<Research />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
