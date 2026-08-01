import { Routes, Route, NavLink } from 'react-router-dom'
import {
  LayoutDashboard, MessageSquare, Cpu, PlayCircle, Code2,
  Wrench, BarChart3, Activity, Server, Key, Target,
} from 'lucide-react'
import Dashboard from './pages/Dashboard'
import Chat from './pages/Chat'
import Agents from './pages/Agents'
import Providers from './pages/Providers'
import WorkflowRuns from './pages/WorkflowRuns'
import Traces from './pages/Traces'
import IDE from './pages/IDE'
import ToolsPlayground from './pages/ToolsPlayground'
import CostAnalytics from './pages/CostAnalytics'
import KeysSettings from './pages/KeysSettings'
import OptimizationSettings from './pages/OptimizationSettings'

const nav = [
  { to: '/',            label: 'Dashboard',    icon: LayoutDashboard },
  { to: '/ide',         label: 'IDE',          icon: Code2           },
  { to: '/chat',        label: 'Chat',         icon: MessageSquare   },
  { to: '/agents',      label: 'Agents',       icon: Cpu             },
  { to: '/runs',        label: 'Runs',         icon: PlayCircle      },
  { to: '/tools',       label: 'Tools',        icon: Wrench          },
  { to: '/costs',       label: 'Cost Analytics', icon: BarChart3     },
  { to: '/traces',      label: 'Traces',       icon: Activity        },
  { to: '/providers',   label: 'Providers',    icon: Server          },
  { to: '/keys',        label: 'API Keys',     icon: Key             },
  { to: '/optimization',label: 'Optimization', icon: Target          },
]

export default function App() {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-950 text-gray-100">
      {/* Sidebar */}
      <aside className="w-[200px] bg-gray-900 border-r border-gray-800 flex flex-col py-5 px-2 shrink-0">
        <div className="mb-6 px-3">
          <h1 className="text-base font-bold text-indigo-400 leading-tight">Cortex IDE</h1>
          <p className="text-xs text-gray-500">Multi-Model AI</p>
        </div>

        <nav className="flex flex-col gap-0.5 flex-1 overflow-y-auto">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`
              }
            >
              <Icon size={15} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="pt-3 border-t border-gray-800 px-3">
          <p className="text-xs text-gray-700">v2.0.0</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-gray-950 min-w-0">
        <Routes>
          <Route path="/"             element={<Dashboard />}            />
          <Route path="/ide"          element={<IDE />}                  />
          <Route path="/chat"         element={<Chat />}                 />
          <Route path="/agents"       element={<Agents />}               />
          <Route path="/runs"         element={<WorkflowRuns />}         />
          <Route path="/tools"        element={<ToolsPlayground />}      />
          <Route path="/costs"        element={<CostAnalytics />}        />
          <Route path="/traces"       element={<Traces />}               />
          <Route path="/providers"    element={<Providers />}            />
          <Route path="/keys"         element={<KeysSettings />}         />
          <Route path="/optimization" element={<OptimizationSettings />} />
        </Routes>
      </main>
    </div>
  )
}
