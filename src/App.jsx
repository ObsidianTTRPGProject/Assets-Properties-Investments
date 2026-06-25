import { Routes, Route } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import AddProperty from './pages/AddProperty'
import PropertyDetail from './pages/PropertyDetail'
import Contacts from './pages/Contacts'
import Financials from './pages/Financials'
import MapView from './pages/MapView'
import Pool from './pages/Pool'
import Profile from './pages/Profile'
import Changelog from './pages/Changelog'
import Admin from './pages/Admin'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/reset" element={<ResetPassword />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/properties" element={<Dashboard />} />
                <Route path="/properties/new" element={<AddProperty />} />
                <Route path="/properties/:id" element={<PropertyDetail />} />
                <Route path="/map" element={<MapView />} />
                <Route path="/contacts" element={<Contacts />} />
                <Route path="/financials" element={<Financials />} />
                <Route path="/pool" element={<Pool />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/changelog" element={<Changelog />} />
                <Route path="/admin" element={<Admin />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}
