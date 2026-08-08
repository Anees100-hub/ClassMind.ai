import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LayoutDashboard, Users, BookOpen, LogOut, Brain, UserCheck, Bell, BarChart3, Settings, Lock, X } from 'lucide-react';
import './Sidebar.css';

const Sidebar = ({ isOpen, onClose }) => {
    const { logout, currentUser } = useAuth();
    const navigate = useNavigate();

    const adminNavItems = [
        { path: '/', label: 'Dashboard', icon: LayoutDashboard },
        { path: '/teachers', label: 'Teachers', icon: UserCheck },
        { path: '/students', label: 'Students', icon: Users },
        { path: '/classes', label: 'Classes', icon: BookOpen },
        { path: '/analytics', label: 'Analytics', icon: BarChart3 },
        { path: '/settings', label: 'Settings', icon: Settings },
        { path: '/account', label: 'Account', icon: Lock },
    ];

    const studentNavItems = [
        { path: '/', label: 'Dashboard', icon: LayoutDashboard },
        { path: '/notifications', label: 'Notifications', icon: Bell },
        { path: '/account', label: 'Account', icon: Lock },
    ];

    const teacherNavItems = [
        { path: '/teacher/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { path: '/teacher/notifications', label: 'Notifications', icon: Bell },
        { path: '/account', label: 'Account', icon: Lock },
    ];

    const navItems = currentUser?.role === 'student'
        ? studentNavItems
        : currentUser?.role === 'teacher'
            ? teacherNavItems
            : adminNavItems;

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const roleLabel = currentUser?.role === 'student'
        ? 'Student Portal'
        : currentUser?.role === 'teacher'
            ? 'Teacher Portal'
            : 'Admin Portal';

    return (
        <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
            <div className="sidebar-header">
                <div className="app-logo">
                    <div className="logo-icon-container">
                        <Brain size={24} color="white" />
                    </div>
                    <div className="logo-text">
                        <h2>ClassMind.ai</h2>
                        <span className="subtitle">{roleLabel}</span>
                    </div>
                </div>
                <button className="sidebar-close-btn" onClick={onClose} aria-label="Close menu">
                    <X size={20} />
                </button>
            </div>

            <nav className="sidebar-nav">
                {navItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        onClick={onClose}
                        className={({ isActive }) =>
                            `nav-item ${isActive ? 'active' : ''}`
                        }
                    >
                        <item.icon size={20} className="nav-icon" />
                        <span>{item.label}</span>
                    </NavLink>
                ))}
            </nav>

            <div className="sidebar-footer">
                <div className="user-profile">
                    <div className="user-avatar">
                        {(currentUser?.name || 'U').charAt(0).toUpperCase()}
                    </div>
                    <div className="user-info">
                        <p className="user-name">{currentUser?.name || 'User'}</p>
                        <p className="user-email">{currentUser?.email || ''}</p>
                    </div>
                </div>
                <button onClick={handleLogout} className="logout-btn">
                    <LogOut size={18} />
                    <span>Logout</span>
                </button>
            </div>
        </aside>
    );
};

export default Sidebar;
