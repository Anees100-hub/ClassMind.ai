import React, { useEffect } from 'react';
import { motion as Motion } from 'framer-motion';
import { Bell, Calendar, FileText, Trash2, CheckCheck, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import './StudentNotifications.css';
import './TeacherNotifications.css';

const TeacherNotifications = () => {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const { teacherNotifications, fetchTeacherNotifications, markNotificationRead, markAllNotificationsRead, deleteNotification, teachers } = useData();

    const teacherObj = teachers.find(t => t.email === currentUser?.email);
    const teacherId = teacherObj?.id;

    useEffect(() => {
        if (teacherId || currentUser?.email) {
            fetchTeacherNotifications(teacherId || currentUser.email);
        }
    }, [teacherId, currentUser?.email]);

    const unreadCount = teacherNotifications.filter(n => n.unread).length;

    const handleNotifClick = (notif) => {
        if (notif.unread) markNotificationRead(notif.id);
        if (notif.classId && notif.classId !== 'SYSTEM') {
            navigate(`/teacher/course/${notif.classId}`);
        }
    };

    const getIcon = (type) => {
        if (type === 'reschedule') return <Calendar size={20} color="#6366F1" />;
        if (type === 'material') return <FileText size={20} color="#10B981" />;
        return <Bell size={20} color="#3B82F6" />;
    };

    return (
        <Motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="notifications-page teacher-page">
            <div className="page-header teacher-notif-header">
                <div>
                    <h1>Notifications</h1>
                    <p>{unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}</p>
                </div>
                <div className="notif-header-actions">
                    <button className="btn-secondary-sm" onClick={() => fetchTeacherNotifications(teacherId || currentUser.email)}>
                        <RefreshCw size={16} /> Refresh
                    </button>
                    {unreadCount > 0 && (
                        <button className="btn-secondary-sm" onClick={() => markAllNotificationsRead({ teacherId: teacherId || teacherObj?.id })}>
                            <CheckCheck size={16} /> Mark all read
                        </button>
                    )}
                </div>
            </div>

            {teacherNotifications.length === 0 ? (
                <div className="empty-notifications">
                    <Bell size={48} style={{ opacity: 0.2 }} />
                    <h3>No notifications yet</h3>
                    <p>You will be notified when classes are rescheduled or updated.</p>
                </div>
            ) : (
                <div className="notifications-list">
                    {teacherNotifications.map((notif) => (
                        <div
                            key={notif.id}
                            className={`notification-card ${notif.unread ? 'unread' : ''}`}
                            onClick={() => handleNotifClick(notif)}
                        >
                            <div className="notif-icon">{getIcon(notif.type)}</div>
                            <div className="notif-content">
                                <h4>{notif.title}</h4>
                                <p>{notif.message}</p>
                                <span className="notif-time">{notif.time || 'Recently'}{notif.classId && notif.classId !== 'SYSTEM' ? ` · ${notif.classId}` : ''}</span>
                            </div>
                            <button className="notif-delete" onClick={(e) => { e.stopPropagation(); deleteNotification(notif.id); }} title="Delete">
                                <Trash2 size={16} />
                            </button>
                            {notif.unread && <div className="unread-dot" />}
                        </div>
                    ))}
                </div>
            )}
        </Motion.div>
    );
};

export default TeacherNotifications;
