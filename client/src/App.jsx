import { Routes, Route } from "react-router-dom";
import Sidebar from "./components/Sidebar.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import MessagesView from "./pages/MessagesView.jsx";
import SummaryView from "./pages/SummaryView.jsx";
import AIActionsView from "./pages/AIActionsView.jsx";
import AIHistoryView from "./pages/AIHistoryView.jsx";
import GroupedMessagesView from "./pages/GroupedMessagesView.jsx";

export default function App() {
  return (
    <div className="layout">
      <Sidebar />
      <main className="main ">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/messages" element={<MessagesView />} />
          <Route path="/summaries" element={<SummaryView />} />
          <Route path="/ai" element={<AIActionsView />} />
          <Route path="/ai/history" element={<AIHistoryView />} />
          <Route path="/grouped" element={<GroupedMessagesView />} />
        </Routes>
      </main>
    </div>
  );
}
