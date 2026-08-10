import React, { useEffect, useState, useCallback } from 'react';
import { motion as MOTION } from 'framer-motion';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { BookOpen, Users, TrendingUp, Upload, Clock, BarChart3, Bell, Sparkles, Camera, Video, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../utils/api';
import './TeacherDashboard.css';

const TeacherDashboard = () => {
    const { getTeacherData, getEnrolledStudents, loading, refreshData, fetchTeacherNotifications, teacherNotifications, teachers } = useData();
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const [liveEngagement, setLiveEngagement] = useState({});
    const [cameraStatus, setCameraStatus] = useState(null);
    const [cameraBusy, setCameraBusy] = useState(false);
    const [streamKey, setStreamKey] = useState(0);

    const teacherData = getTeacherData(currentUser?.email);
    const teacherObj = teachers.find(t => t.email === currentUser?.email);
    const unreadNotifs = teacherNotifications.filter(n => n.unread).length;

    const checkClassroomCamera = useCallback(async () => {
        try {
            const res = await fetch('/python-api/classroom-camera/status', {
                signal: AbortSignal.timeout(10000),
            });
            const data = await res.json().catch(() => null);
            if (data) {
                setCameraStatus(data);
            } else {
                setCameraStatus({ configured: false, running: false, has_frame: false });
            }
        } catch {
            setCameraStatus({
                configured: false,
                running: false,
                has_frame: false,
                aiOffline: true,
                last_error: 'AI server offline',
            });
        }
    }, []);

    const connectClassroomCamera = async () => {
        setCameraBusy(true);
        try {
            const res = await fetch('/python-api/classroom-camera/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
                signal: AbortSignal.timeout(90000),
            });
            const data = await res.json().catch(() => ({}));
            setCameraStatus(data);
            // Restart MJPEG img only after a fresh connect
            if (data.has_frame || data.running) setStreamKey(Date.now());
        } catch {
            setCameraStatus(prev => ({
                ...(prev || {}),
                running: false,
                has_frame: false,
                reconnecting: true,
                last_error: 'Still connecting…',
            }));
        } finally {
            setCameraBusy(false);
            checkClassroomCamera();
        }
    };

    useEffect(() => {
        refreshData();
        checkClassroomCamera();
        const id = setInterval(checkClassroomCamera, 10000);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        if (teacherObj?.id || currentUser?.email) {
            fetchTeacherNotifications(teacherObj?.id || currentUser.email);
        }
    }, [teacherObj?.id, currentUser?.email]);

    useEffect(() => {
        const courses = teacherData?.courses || [];
        if (!courses.length) return;

        const fetchEngagement = async () => {
            const results = {};
            await Promise.all(courses.map(async (course) => {
                try {
                    const res = await apiFetch(`/api/engagement/class-report/${course.id}`);
                    if (res.ok) {
                        const data = await res.json();
                        results[course.id] = data.hasData ? (data.emotions?.Engaged ?? 0) : null;
                    }
                } catch {
                    results[course.id] = null;
                }
            }));
            setLiveEngagement(results);
        };
        fetchEngagement();
    }, [teacherData?.courses?.map(c => c.id).join(',')]);

    const statConfig = [
        { key: 'classes', icon: BookOpen, colorClass: 'blue' },
        { key: 'students', icon: Users, colorClass: 'purple' },
        { key: 'engagement', icon: TrendingUp, colorClass: 'indigo' },
        { key: 'materials', icon: Upload, colorClass: 'pink' },
    ];

    if (loading) {
        return (
            <div className="dashboard-loading">
                <div className="dashboard-spinner" />
                <p>Loading your dashboard...</p>
            </div>
        );
    }

    if (!teacherData) {
        return (
            <div className="dashboard-empty">
                <BookOpen size={56} />
                <h3>Teacher Profile Not Found</h3>
                <p>Your account ({currentUser?.email}) was not found. Please ask your administrator to verify your setup.</p>
            </div>
        );
    }

    return (
        <MOTION.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="dashboard-page teacher-dashboard"
        >
            <div className="dashboard-hero teacher-hero">
                <div className="dashboard-hero-content">
                    <div className="dashboard-hero-text">
                        <div className="dashboard-hero-badge">
                            <Sparkles size={16} />
                            Teacher Portal
                        </div>
                        <h1>Welcome back, {teacherData.firstName}!</h1>
                        <p>Manage your classes, upload materials, and track student engagement — all in one place.</p>
                    </div>
                    <div className="dashboard-hero-actions">
                        <button className="hero-action-btn primary" onClick={() => navigate('/teacher/notifications')}>
                            <Bell size={16} />
                            Notifications {unreadNotifs > 0 && `(${unreadNotifs})`}
                        </button>
                        {teacherData.courses?.[0] && (
                            <button className="hero-action-btn ghost" onClick={() => navigate(`/teacher/course/${teacherData.courses[0].id}/upload`)}>
                                <Upload size={16} /> Upload Material
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className="dashboard-stats-grid">
                {teacherData.summaryStats?.map((stat, idx) => {
                    const cfg = statConfig[idx] || statConfig[0];
                    const Icon = cfg.icon;
                    const courseIds = teacherData.courses?.map(c => c.id) || [];
                    const liveValues = courseIds.map(id => liveEngagement[id]).filter(v => v !== null && v !== undefined);
                    const liveAvg = liveValues.length
                        ? Math.round(liveValues.reduce((a, b) => a + b, 0) / liveValues.length)
                        : null;
                    const displayValue = stat.id === 'engagement'
                        ? (liveAvg !== null ? `${liveAvg}%` : '—')
                        : stat.value;
                    return (
                        <MOTION.div
                            key={stat.id}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.08 }}
                            className={`dashboard-stat-card ${cfg.colorClass}`}
                        >
                            <div className="dashboard-stat-top">
                                <div className={`dashboard-stat-icon ${cfg.colorClass}`}>
                                    <Icon size={22} />
                                </div>
                            </div>
                            <div>
                                <div className="dashboard-stat-value">{displayValue}</div>
                                <div className="dashboard-stat-label">{stat.label}</div>
                            </div>
                        </MOTION.div>
                    );
                })}
            </div>

            {/* Quick classroom camera check — no face scan required */}
            <div className="classroom-cam-check">
                <div className="classroom-cam-check-left">
                    <div className="classroom-cam-check-title">
                        <Video size={20} />
                        <div>
                            <h3>Classroom Camera</h3>
                            <p>Check V380 connection for emotion detection (no face scan needed)</p>
                        </div>
                    </div>
                    <div className={`classroom-cam-badge ${(cameraStatus?.has_frame || cameraStatus?.running) ? 'ok' : cameraStatus?.aiOffline ? 'offline' : 'wait'}`}>
                        {(cameraStatus?.has_frame || cameraStatus?.running) ? (
                            <><Wifi size={16} /> Connected</>
                        ) : cameraStatus?.aiOffline ? (
                            <><WifiOff size={16} /> AI server offline</>
                        ) : cameraStatus?.reconnecting ? (
                            <><RefreshCw size={16} className="spin-slow" /> Connecting…</>
                        ) : (
                            <><WifiOff size={16} /> Not connected</>
                        )}
                    </div>
                    {cameraStatus?.url && (
                        <p className="classroom-cam-url">{cameraStatus.url}</p>
                    )}
                    <div className="classroom-cam-actions">
                        <button type="button" className="teacher-btn-main" disabled={cameraBusy} onClick={connectClassroomCamera}>
                            {cameraBusy ? 'Connecting…' : 'Connect / Test Camera'}
                        </button>
                        <button type="button" className="teacher-btn-icon" disabled={cameraBusy} onClick={checkClassroomCamera} title="Refresh status">
                            <RefreshCw size={18} />
                        </button>
                    </div>
                </div>
                <div className="classroom-cam-preview">
                    {(cameraStatus?.has_frame || cameraStatus?.running || cameraStatus?.ok) ? (
                        <img
                            key={streamKey}
                            src={`/python-api/classroom-camera/stream?t=${streamKey}`}
                            alt="Classroom camera live"
                        />
                    ) : (
                        <div className="classroom-cam-preview-empty">
                            <Camera size={32} />
                            <span>{cameraBusy || cameraStatus?.reconnecting ? 'Connecting…' : 'Click Connect / Test Camera'}</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="dashboard-section-header">
                <h2>My Classes</h2>
                <p>{teacherData.courses?.length || 0} active course{(teacherData.courses?.length || 0) !== 1 ? 's' : ''}</p>
            </div>

            {teacherData.courses?.length === 0 ? (
                <div className="dashboard-empty">
                    <BookOpen size={56} />
                    <h3>No Classes Assigned</h3>
                    <p>You haven't been assigned to any classes yet. Ask your administrator to assign you to a course.</p>
                </div>
            ) : (
                <div className="teacher-courses-grid">
                    {teacherData.courses.map((course, idx) => {
                        const enrolledCount = getEnrolledStudents(course.id).length;
                        const engagement = liveEngagement[course.id] ?? null;
                        const engagementDisplay = engagement !== null ? `${engagement}%` : '—';
                        const accentColor = idx % 2 === 0 ? '#3B82F6' : '#A855F7';
                        const isLiveSession = course.lectureStatus === 'Active' && course.lectureId;

                        return (
                            <MOTION.div
                                key={course.id}
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 + idx * 0.06 }}
                                whileHover={{ y: -6 }}
                                className="teacher-course-card"
                            >
                                <div className="teacher-course-accent" style={{ background: accentColor }} />
                                <div className="teacher-course-pill">
                                    {enrolledCount} student{enrolledCount !== 1 ? 's' : ''}
                                </div>
                                {isLiveSession && (
                                    <div className="teacher-live-badge">
                                        <span className="live-pulse-dot-sm" />
                                        Live — {course.lectureId}
                                    </div>
                                )}

                                <div className="teacher-course-title">
                                    <h3>{course.name}</h3>
                                    <span className="teacher-course-id">{course.id}</span>
                                </div>

                                <div className="teacher-course-schedule">
                                    <Clock size={16} />
                                    <span>{course.schedule || 'Schedule TBD'}</span>
                                </div>

                                <div className="teacher-engagement">
                                    <div className="teacher-engagement-labels">
                                        <span>Engagement</span>
                                        <strong>{engagementDisplay}</strong>
                                    </div>
                                    <div className="teacher-progress-bg">
                                        <div className="teacher-progress-fill" style={{ width: `${engagement ?? 0}%`, background: accentColor }} />
                                    </div>
                                </div>

                                <div className="teacher-course-actions">
                                    {isLiveSession ? (
                                        <button className="teacher-btn-main" onClick={() => navigate(`/teacher/course/${course.id}/attendance-scanner`)}>
                                            <Camera size={16} style={{ marginRight: 6 }} /> Resume Session
                                        </button>
                                    ) : (
                                        <button className="teacher-btn-main" onClick={() => navigate(`/teacher/course/${course.id}`)}>
                                            View Class
                                        </button>
                                    )}
                                    <button className="teacher-btn-icon" onClick={() => navigate(`/teacher/course/${course.id}/upload`)} title="Upload">
                                        <Upload size={18} />
                                    </button>
                                    <button className="teacher-btn-icon" onClick={() => navigate(`/teacher/course/${course.id}/analytics`)} title="Analytics">
                                        <BarChart3 size={18} />
                                    </button>
                                </div>
                            </MOTION.div>
                        );
                    })}
                </div>
            )}
        </MOTION.div>
    );
};

export default TeacherDashboard;
