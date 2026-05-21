// Sidebar navigation — shows the logged-in user's avatar + username at the
// bottom, and a logout button that clears the JWT and redirects to /login.

import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

const IconHome = () => (
  <svg
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    viewBox="0 0 24 24"
  >
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

const IconMsg = () => (
  <svg
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    viewBox="0 0 24 24"
  >
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const IconList = () => (
  <svg
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    viewBox="0 0 24 24"
  >
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

const IconAI = () => (
  <svg
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    viewBox="0 0 24 24"
  >
    <path d="M12 2a4 4 0 0 1 4 4v1h1a3 3 0 0 1 0 6h-1v1a4 4 0 0 1-8 0v-1H7a3 3 0 0 1 0-6h1V6a4 4 0 0 1 4-4z" />
    <circle cx="9" cy="10" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="10" r="1" fill="currentColor" stroke="none" />
  </svg>
);

const IconHistory = () => (
  <svg
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    viewBox="0 0 24 24"
  >
    <polyline points="12 8 12 12 14 14" />
    <path d="M3.05 11a9 9 0 1 0 .5-4M3 3v4h4" />
  </svg>
);

const IconGroups = () => (
  <svg
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    viewBox="0 0 24 24"
  >
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);

const IconLogout = () => (
  <svg
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    viewBox="0 0 24 24"
  >
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  // Derive initials for the avatar from the username
  const initials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : "?";

  return (
    <aside className="sidebar">
      {/* Brand */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <IconAI />
        </div>
        <span>WA Intelligence</span>
      </div>

      {/* Navigation links */}
      <nav className="sidebar-nav">
        <NavLink
          to="/"
          end
          className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
        >
          <IconHome /> Dashboard
        </NavLink>
        <NavLink
          to="/messages"
          className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
        >
          <IconList /> Messages
        </NavLink>
        <NavLink
          to="/summaries"
          className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
        >
          <IconMsg /> Summaries
        </NavLink>
        <NavLink
          to="/ai"
          end
          className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
        >
          <IconAI /> AI Actions
        </NavLink>
        <NavLink
          to="/ai/history"
          className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
        >
          <IconHistory /> AI History
        </NavLink>
        <NavLink
          to="/grouped"
          className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
        >
          <IconGroups /> Requirement Groups
        </NavLink>
      </nav>

      {/* User footer — avatar, username, logout button */}
      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="sidebar-avatar">{initials}</div>
          <div className="sidebar-user-info">
            <span className="sidebar-username">{user?.username ?? "User"}</span>
            <span className="sidebar-email">{user?.email ?? ""}</span>
          </div>
        </div>
        <button
          className="sidebar-logout"
          onClick={handleLogout}
          title="Sign out"
        >
          <IconLogout />
        </button>
      </div>
    </aside>
  );
}
