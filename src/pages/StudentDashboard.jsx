import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { BookOpen, TrendingUp, Award, Bell, Video, GraduationCap, ArrowRight, Folder } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './StudentDashboard.css';

const StudentDashboard = () => {
    const { getStudentData, loading, refreshData, fetchNotifications, notifications } = useData();
    const { currentUser } = useAuth();
    const navigate = useNavigate();

    const studentData = getStudentData(currentUser?.email);
    const unreadCount = (studentData?.notifications || notifications).filter(n => n.unread).length;

    useEffect(() => {
        refreshData();
    }, []);

    useEffect(() => {
        if (currentUser?.email) {
            fetchNotifications(currentUser.email);
        }
    }, [currentUser?.email]);

    const statIcons = [BookOpen, GraduationCap, Award, Bell];
    const statColors = ['blue', 'green', 'purple', 'pink'];

    if (loading) {
        return (
            <div className="dashboard-loading">
                <div className="dashboard-spinner" />
                <p>Loading your dashboard...</p>
            </div>
        );
    }

    if (!studentData) {
        return (
            <div className="dashboard-empty">
                <GraduationCap size={56} />
                <h3>Student Profile Not Found</h3>
                <p>Your account ({currentUser?.email}) could not be loaded. Please contact your administrator.</p>
            </div>
        );
    }

    const firstName = studentData.firstName || currentUser?.name?.split(' ')[0] || 'Student';

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="dashboard-page student-dashboard student-page"
        >
            <div className="dashboard-hero student-hero">
                <div className="dashboard-hero-content">
                    <div className="dashboard-hero-text">
                        <div className="dashboard-hero-badge">
                            <GraduationCap size={16} />
                            Student Portal
                        </div>
                        <h1>Welcome back, {firstName}!</h1>
                        <p>Track your courses, access materials, and stay updated on class schedules.</p>
                    </div>
                    <div className="dashboard-hero-actions">
                        <button className="hero-action-btn primary" onClick={() => navigate('/notifications')}>
                            <Bell size={16} />
                            Notifications {unreadCount > 0 && `(${unreadCount})`}
                        </button>
                        {studentData.classes?.[0] && (
                            <button className="hero-action-btn ghost" onClick={() => navigate(`/class/${studentData.classes[0].id}`)}>
                                View Classes <ArrowRight size={16} />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className="dashboard-stats-grid">
                {studentData.stats.map((stat, index) => {
                    const Icon = statIcons[index];
                    return (
                        <motion.div
                            key={stat.label}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.08 }}
                            className={`dashboard-stat-card ${statColors[index]}`}
                        >
                            <div className="dashboard-stat-top">
                                <div className={`dashboard-stat-icon ${statColors[index]}`}>
                                    <Icon size={22} />
                                </div>
                            </div>
                            <div>
                                <div className="dashboard-stat-value">{stat.value}</div>
                                <div className="dashboard-stat-label">{stat.label}</div>
                            </div>
                        </motion.div>
                    );
                })}
            </div>

            <div className="dashboard-section-header">
                <h2>My Classes</h2>
                <p>{studentData.classes?.length || 0} enrolled course{(studentData.classes?.length || 0) !== 1 ? 's' : ''}</p>
            </div>

            {studentData.classes?.length === 0 ? (
                <div className="dashboard-empty">
                    <BookOpen size={56} />
                    <h3>No Enrolled Classes</h3>
                    <p>You are not enrolled in any classes yet. Contact your administrator to get enrolled.</p>
                </div>
            ) : (
                <div className="student-classes-grid">
                    {studentData.classes.map((cls, idx) => {
                        const accent = idx % 2 === 0 ? '#3B82F6' : '#A855F7';
                        const isLive = cls.lectureStatus === 'Active';
                        return (
                            <motion.div
                                key={cls.id}
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 + idx * 0.06 }}
                                whileHover={{ y: -6 }}
                                className="student-class-card"
                            >
                                <div className="student-card-accent" style={{ background: isLive ? '#10B981' : accent }} />
                                {isLive && <div className="student-live-badge">Live Now</div>}
                                <div className="student-card-body">
                                    <h3 className="student-class-name">{cls.name}</h3>
                                    <p className="student-class-meta">{cls.id} · {cls.instructor}</p>

                                    <div className="student-meeting-row">
                                        <Video size={15} />
                                        <span>{cls.nextSession}</span>
                                    </div>

                                    <div className="student-meeting-row">
                                        <Folder size={15} />
                                        <span>{cls.materialsCount || 0} material{(cls.materialsCount || 0) !== 1 ? 's' : ''}</span>
                                    </div>

                                    <div className="student-cgpa-row">
                                        <div className="student-cgpa-chip overall">
                                            <span className="cgpa-label">Overall CGPA</span>
                                            <strong>{studentData.overallCGPA && studentData.overallCGPA !== '0.00' ? studentData.overallCGPA : '—'}</strong>
                                        </div>
                                        <div className="student-cgpa-chip previous">
                                            <span className="cgpa-label">Previous</span>
                                            <strong>{studentData.previousCGPA && studentData.previousCGPA !== '0.00' ? studentData.previousCGPA : '—'}</strong>
                                        </div>
                                    </div>

                                    <button className="student-view-btn" onClick={() => navigate(`/class/${cls.id}`)}>
                                        View Class
                                    </button>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            )}
        </motion.div>
    );
};

export default StudentDashboard;
