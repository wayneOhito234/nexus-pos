import {
  LayoutDashboard,
  Package,
  Boxes,
  Users,
  KeyRound,
  Monitor,
  BarChart3,
  LogOut,
  ShieldCheck,
} from 'lucide-react';

// adminOnly hides a section from managers. Access itself is enforced on the
// server -- this only decides what's worth putting in front of someone.
const SECTIONS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, adminOnly: true },
  { id: 'products', label: 'Products', icon: Package },
  { id: 'inventory', label: 'Inventory', icon: Boxes },
  { id: 'staff', label: 'Staff', icon: Users },
  { id: 'drawer', label: 'Drawer PINs', icon: KeyRound },
  { id: 'terminals', label: 'Terminals', icon: Monitor, adminOnly: true },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
];

export function Sidebar({ active, onSelect, staff, onSignOut }) {
  const isAdmin = staff.role === 'admin';
  const visible = SECTIONS.filter((s) => !s.adminOnly || isAdmin);

  return (
    <nav className="sidebar">
      <div className="sidebar__brand">
        <ShieldCheck size={18} />
        <span>Nexus POS</span>
      </div>

      <div className="sidebar__links">
        {visible.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`sidebar__link ${active === id ? 'is-active' : ''}`}
            onClick={() => onSelect(id)}
          >
            <Icon size={17} />
            {label}
          </button>
        ))}
      </div>

      <div className="sidebar__foot">
        <div className="sidebar__who">
          <strong>{staff.name}</strong>
          <span>{isAdmin ? 'Owner' : staff.role}</span>
        </div>
        <button className="sidebar__signout" onClick={onSignOut}>
          <LogOut size={15} />
          Sign out
        </button>
      </div>
    </nav>
  );
}