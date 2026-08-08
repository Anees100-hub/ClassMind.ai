import React from 'react';
import { motion } from 'framer-motion';
import { Users, UserCheck, BookOpen, Activity, BarChart3, LineChart as LineIcon, ArrowRight, Settings, GraduationCap } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
import './SystemOverview.css';

const SystemOverview = () => {
    const { dashboardStats, loading, students, classes, teachers } = useData();
    const navigate = useNavigate();

    const getWeeklyData = () => {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const weeklyCount = { Sun: 0, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0 };
        students.forEach(s => {
            const date = s.enrollmentDate ? new Date(s.enrollmentDate) : new Date();
            weeklyCount[days[date.getDay()]]++;
        });
        return days.map(day => ({ name: day, users: weeklyCount[day] }));
    };

    const getBarData = () => {
        return classes.slice(0, 6).map(cls => ({
            name: cls.id,
            count: cls.studentsCount || 0
        }));
    };

    const stats = [
        { label: 'Total Students', value: dashboardStats?.totalStudents ?? 0, icon: Users, colorClass: 'blue', badge: 'Updated', badgeType: 'updated' },
        { label: 'Active Teachers', value: dashboardStats?.activeTeachers ?? 0, icon: UserCheck, colorClass: 'purple', badge: 'Live', badgeType: 'live' },
        { label: 'Active Classes', value: dashboardStats?.activeClasses ?? 0, icon: BookOpen, colorClass: 'indigo', badge: 'Live', badgeType: 'live' },
        { label: 'Total Courses', value: dashboardStats?.totalClasses ?? 0, icon: Activity, colorClass: 'pink', badge: 'Live', badgeType: 'live' },
    ];

    if (loading) {
        return (
            <div className="dashboard-loading">
                <div className="dashboard-spinner" />
                <p>Loading system overview...</p>
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="dashboard-page admin-dashboard"
        >
            <div className="dashboard-hero">
                <div className="dashboard-hero-content">
                    <div className="dashboard-hero-text">
                        <div className="dashboard-hero-badge">
                            <GraduationCap size={16} />
                            Admin Control Center
                        </div>
                        <h1>System Overview</h1>
                        <p>Monitor platform health, manage {teachers.length} teachers and {students.length} students across {classes.length} classes.</p>
                    </div>
                    <div className="dashboard-hero-actions">
                        <button className="hero-action-btn primary" onClick={() => navigate('/classes')}>
                            Manage Classes <ArrowRight size={16} />
                        </button>
                        <button className="hero-action-btn ghost" onClick={() => navigate('/settings')}>
                            <Settings size={16} /> Settings
                        </button>
                    </div>
                </div>
            </div>

            <div className="dashboard-stats-grid">
                {stats.map((stat, index) => (
                    <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.08 }}
                        className={`dashboard-stat-card ${stat.colorClass}`}
                    >
                        <div className="dashboard-stat-top">
                            <div className={`dashboard-stat-icon ${stat.colorClass}`}>
                                <stat.icon size={22} />
                            </div>
                            <span className={`dashboard-stat-badge ${stat.badgeType}`}>{stat.badge}</span>
                        </div>
                        <div>
                            <div className="dashboard-stat-value">{stat.value}</div>
                            <div className="dashboard-stat-label">{stat.label}</div>
                        </div>
                    </motion.div>
                ))}
            </div>

            <div className="dashboard-section-header">
                <h2>Analytics</h2>
                <p>Real-time enrollment insights</p>
            </div>

            <div className="dashboard-charts-grid">
                <motion.div
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                    className="dashboard-chart-card"
                >
                    <div className="dashboard-chart-header">
                        <LineIcon size={20} color="#A855F7" />
                        <h3>Student Enrollment Distribution</h3>
                    </div>
                    <div className="chart-body">
                        <ResponsiveContainer width="100%" height={280}>
                            <LineChart data={getWeeklyData()}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} allowDecimals={false} />
                                <Tooltip contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                                <Line type="monotone" dataKey="users" stroke="#A855F7" strokeWidth={3} dot={{ fill: '#A855F7', r: 4 }} activeDot={{ r: 6 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 }}
                    className="dashboard-chart-card"
                >
                    <div className="dashboard-chart-header">
                        <BarChart3 size={20} color="#3B82F6" />
                        <h3>Class Enrollment Overview</h3>
                    </div>
                    <div className="chart-body">
                        <ResponsiveContainer width="100%" height={280}>
                            <BarChart data={getBarData()}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} allowDecimals={false} />
                                <Tooltip contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} cursor={{ fill: 'rgba(59,130,246,0.06)' }} />
                                <Bar dataKey="count" fill="#3B82F6" radius={[6, 6, 0, 0]} barSize={36} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </motion.div>
            </div>

            <div className="admin-quick-links">
                {[
                    { label: 'Teachers', count: teachers.length, path: '/teachers', color: '#A855F7' },
                    { label: 'Students', count: students.length, path: '/students', color: '#3B82F6' },
                    { label: 'Classes', count: classes.length, path: '/classes', color: '#6366F1' },
                    { label: 'Analytics', count: 'Reports', path: '/analytics', color: '#EC4899' },
                ].map(link => (
                    <button key={link.label} className="quick-link-card" onClick={() => navigate(link.path)}>
                        <span className="quick-link-count" style={{ color: link.color }}>{link.count}</span>
                        <span className="quick-link-label">{link.label}</span>
                        <ArrowRight size={16} className="quick-link-arrow" />
                    </button>
                ))}
            </div>
        </motion.div>
    );
};

export default SystemOverview;
