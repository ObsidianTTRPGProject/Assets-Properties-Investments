import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import NotificationBell from './NotificationBell'
import { APP_VERSION } from '../lib/version'

const BASE_NAV = [
  ['/', 'Dashboard', true],
  ['/properties', 'Properties', false],
  ['/map', 'Map', false],
  ['/contacts', 'Contacts', false],
  ['/financials', 'Financials', false],
  ['/pool', 'Pool', false],
  ['/profile', 'Profile', false],
]

export default function Layout({ children }) {
  const { session, isCompanyAdmin } = useAuth()
  const NAV = isCompanyAdmin ? [...BASE_NAV, ['/admin', 'Admin', false]] : BASE_NAV
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const logout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const linkClass = ({ isActive }) =>
    `rounded-lg px-3 py-2 text-sm font-medium ${
      isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'
    }`

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2" onClick={() => setMenuOpen(false)}>
            <img
              src={`${import.meta.env.BASE_URL}logo.png`}
              alt="API"
              className="h-9 w-auto"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
                e.currentTarget.nextSibling.style.display = 'inline'
              }}
            />
            <span style={{ display: 'none' }} className="text-lg font-semibold text-brand-700">API</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map(([to, label, end]) => (
              <NavLink key={to} to={to} end={end} className={linkClass}>{label}</NavLink>
            ))}
            {session && <NotificationBell />}
            {session && (
              <button onClick={logout} className="ml-1 rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100">
                Sign out
              </button>
            )}
          </nav>

          {/* Mobile controls */}
          <div className="flex items-center gap-1 md:hidden">
            {session && <NotificationBell />}
            <button onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu"
              className="rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100">
              <span className="text-xl leading-none">{menuOpen ? '✕' : '☰'}</span>
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <nav className="flex flex-col gap-1 border-t border-slate-100 px-4 py-2 md:hidden">
            {NAV.map(([to, label, end]) => (
              <NavLink key={to} to={to} end={end} className={linkClass} onClick={() => setMenuOpen(false)}>{label}</NavLink>
            ))}
            {session && (
              <button onClick={() => { setMenuOpen(false); logout() }}
                className="rounded-lg px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-100">
                Sign out
              </button>
            )}
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      <footer className="mx-auto max-w-6xl px-4 py-6 text-center text-xs text-slate-400">
        <Link to="/changelog" className="hover:text-brand-600">API v{APP_VERSION} · Changelog</Link>
      </footer>
    </div>
  )
}
