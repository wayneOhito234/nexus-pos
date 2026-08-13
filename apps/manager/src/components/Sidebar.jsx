import { Package, Boxes, Users, BarChart3, LogOut, ShieldCheck } from 'lucide-react';

const SECTIONS = [
  { id: 'products', label: 'Products', icon: Package },
  { id: 'inventory', label: 'Inventory', icon: Boxes },
  { id: 'staff', label: 'Staff', icon: Users },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
];

export function Sidebar({ active, onSelect, staff, onSignOut }) {
  return (
    <nav className="sidebar">
      <div className="sidebar__brand">
        <ShieldCheck size={18} />
        <span>Nexus POS</span>
      </div>

      <div className="sidebar__links">
        {SECTIONS.map(({ id, label, icon: Icon }) => (
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
          <span>{staff.role}</span>
        </div>
        <button className="sidebar__signout" onClick={onSignOut}>
          <LogOut size={15} />
          Sign out
        </button>
      </div>
    </nav>
  );
}