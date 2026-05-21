// App root — wraps all routes with AuthProvider.
// Protected routes redirect to /login when no JWT is present.
// The /login and /signup routes are always accessible.

import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import Sidebar from './components/Sidebar.jsx';
import Dashboard from './pages/Dashboard.jsx';
import MessagesView from './pages/MessagesView.jsx';
import SummaryView from './pages/SummaryView.jsx';
import AIActionsView from './pages/AIActionsView.jsx';
import AIHistoryView from './pages/AIHistoryView.jsx';
import GroupedMessagesView from './pages/GroupedMessagesView.jsx';
import LoginPage from './pages/LoginPage.jsx';
import SignupPage from './pages/SignupPage.jsx';

// Wrapper that redirects unauthenticated users to /login
function PrivateRoute({ children }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

function AppRoutes() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      {/* Public auth routes */}
      <Route path="/login"  element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/signup" element={isAuthenticated ? <Navigate to="/" replace /> : <SignupPage />} />

      {/* Protected app shell */}
      <Route path="/*" element={
        <PrivateRoute>
          <div className="layout">
            <Sidebar />
            <main className="main">
              <Routes>
                <Route path="/"           element={<Dashboard />} />
                <Route path="/messages"   element={<MessagesView />} />
                <Route path="/summaries"  element={<SummaryView />} />
                <Route path="/ai"         element={<AIActionsView />} />
                <Route path="/ai/history" element={<AIHistoryView />} />
                <Route path="/grouped"    element={<GroupedMessagesView />} />
              </Routes>
            </main>
          </div>
        </PrivateRoute>
      } />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
