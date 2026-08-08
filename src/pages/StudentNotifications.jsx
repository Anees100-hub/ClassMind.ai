import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { Bell, AlertTriangle, FileText, Check, X, Inbox, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './StudentNotifications.css';

const StudentNotifications = () => {
    const { getStudentData, fetchNotifications, markNotificationRead, markAllNotificationsRead, deleteNotification, notifications } = useData();
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const [filter, setFilter] = useState('all');

    const studentData = getStudentData(currentUser?.email);

    useEffect(() => {
        if (currentUser?.email) {
            fetchNotifications(currentUser.email);
        }
    }, [currentUser?.email]);

    const displayNotifications = studentData?.notifications?.length
        ? studentData.notifications
        : notifications;

    const filtered = filter === 'all'
        ? displayNotifications
        : displayNotifications.filter(n => n.unread);

    const handleNotifClick = (note) => {
        markNotificationRead(note.id);
        if (note.type === 'material' && note.materialId) {
            navigate(`/material/${note.materialId}`);
        } else if (note.classId && note.classId !== 'SYSTEM') {
            navigate(`/class/${note.classId}`);
        }
    };

    const getIcon = (type) => {
        if (type === 'reschedule') return <Bell size={20} color="#6366F1" />;
        if (type === 'material') return <FileText size={20} color="#10B981" />;
        return <Bell size={20} color="#3B82F6" />;
    };

    if (!studentData) {
        return (
            <div className="notifications-page student-page">
                <div className="dashboard-empty">
                    <Inbox size={56} />
                    <h3>Student Profile Not Found</h3>
                    <p>Unable to load your notifications.</p>
                </div>
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="notifications-page student-page"
        >
            <div className="page-header student-notif-header">
                <div>
                    <h1>Notifications</h1>
                    <p>Schedule changes, new materials, and lecture updates</p>
                </div>
                <div className="notif-header-actions">
                    <button className="btn-secondary-sm" onClick={() => fetchNotifications(currentUser.email)}>
                        <RefreshCw size={16} /> Refresh
                    </button>
                    {displayNotifications.some(n => n.unread) && (
                        <button className="btn-secondary-sm" onClick={() => markAllNotificationsRead({ studentId: studentData.id })}>
                            <Check size={16} /> Mark all read
                        </button>
                    )}
                </div>
            </div>

            <div className="stats-header">
                <div className="stat-pill border-blue">
                    <Bell size={20} color="#3B82F6" />
                    <div>
                        <span className="pill-value">{displayNotifications.length}</span>
                        <span className="pill-label">Total</span>
                    </div>
                </div>
                <div className="stat-pill border-orange">
                    <AlertTriangle size={20} color="#F97316" />
                    <div>
                        <span className="pill-value">{displayNotifications.filter(n => n.unread).length}</span>
                        <span className="pill-label">Unread</span>
                    </div>
                </div>
                <div className="stat-pill border-green">
                    <Check size={20} color="#10B981" />
                    <div>
                        <span className="pill-value">{displayNotifications.filter(n => !n.unread).length}</span>
                        <span className="pill-label">Read</span>
                    </div>
                </div>
            </div>

            <div className="notifications-list-container">
                <div className="filter-tabs">
                    <button
                        className={`tab ${filter === 'all' ? 'active' : ''}`}
                        onClick={() => setFilter('all')}
                    >
                        All ({displayNotifications.length})
                    </button>
                    <button
                        className={`tab ${filter === 'unread' ? 'active' : ''}`}
                        onClick={() => setFilter('unread')}
                    >
                        Unread ({displayNotifications.filter(n => n.unread).length})
                    </button>
                </div>

                <div className="notifications-list">
                    {filtered.length === 0 ? (
                        <div className="empty-notifications">
                            <Inbox size={48} style={{ opacity: 0.3 }} />
                            <h3>No notifications found</h3>
                            <p>Updates from teachers and course reschedules will appear here.</p>
                        </div>
                    ) : (
                        <AnimatePresence>
                            {filtered.map((note) => (
                                <motion.div
                                    key={note.id}
                                    layout
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 20 }}
                                    className={`notification-card ${note.unread ? 'unread' : ''}`}
                                    onClick={() => handleNotifClick(note)}
                                >
                                    <div className={`icon-circle ${note.type}`}>
                                        {getIcon(note.type)}
                                    </div>
                                    <div className="note-content">
                                        <h3 className="note-title">
                                            {note.title}
                                            {note.unread && <span className="unread-dot" />}
                                        </h3>
                                        <p className="note-message">{note.message}</p>
                                        <div className="note-meta">
                                            <span className="note-code">{note.code || note.classId}</span>
                                            <span className="note-time">{note.time || 'Recently'}</span>
                                        </div>
                                    </div>
                                    <div className="note-actions">
                                        {note.unread && (
                                            <button
                                                className="btn-circle-action"
                                                title="Mark as read"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    markNotificationRead(note.id);
                                                }}
                                            >
                                                <Check size={18} />
                                            </button>
                                        )}
                                        <button
                                            className="btn-circle-action delete"
                                            title="Delete notification"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                deleteNotification(note.id);
                                            }}
                                        >
                                            <X size={18} />
                                        </button>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    )}
                </div>
            </div>
        </motion.div>
    );
};

export default StudentNotifications;
