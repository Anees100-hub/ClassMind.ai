import React, { useState, useEffect, useCallback } from 'react';
import { motion as MOTION } from 'framer-motion';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { Users, UserCheck, Upload, BarChart3, Calendar, ArrowLeft, Clock, FileText, Camera, Download, Brain, BookOpen } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiFetch } from '../utils/api';
import './TeacherCourseDetails.css';

const TeacherCourseDetails = () => {
    const { getTeacherCourse, getEnrolledStudents, refreshData } = useData();
    const { currentUser } = useAuth();
    const { courseId } = useParams();
    const navigate = useNavigate();

    const course = getTeacherCourse(currentUser?.email, courseId);

    const [attendanceLogs, setAttendanceLogs] = useState([]);
    const [loadingLogs, setLoadingLogs] = useState(false);
    const [materials, setMaterials] = useState([]);
    const [loadingMaterials, setLoadingMaterials] = useState(false);

    const fetchMaterials = useCallback((classId) => {
        if (!classId) return;
        setLoadingMaterials(true);
        apiFetch(`/api/materials/class/${classId}`)
            .then(r => r.ok ? r.json() : [])
            .then(data => {
                setMaterials(Array.isArray(data) ? data : []);
                setLoadingMaterials(false);
            })
            .catch(() => {
                setMaterials([]);
                setLoadingMaterials(false);
            });
    }, []);

    const fetchLogs = useCallback((classId) => {
        if (!classId) return;
        setLoadingLogs(true);
        apiFetch(`/api/attendance/history?classId=${classId}`)
            .then(r => r.ok ? r.json() : [])
            .then(data => {
                setAttendanceLogs(Array.isArray(data) ? data : []);
                setLoadingLogs(false);
            })
            .catch(() => {
                setAttendanceLogs([]);
                setLoadingLogs(false);
            });
    }, []);

    useEffect(() => {
        refreshData();
    }, [courseId]);

    useEffect(() => {
        if (course?.id) {
            fetchLogs(course.id);
            fetchMaterials(course.id);
        }
    }, [course?.id, fetchLogs, fetchMaterials]);

    if (!course) {
        return (
            <div className="course-details-page teacher-page">
                <div className="dashboard-empty">
                    <BookOpen size={56} />
                    <h3>Course Not Found</h3>
                    <p>This class is not assigned to your account or may have been removed.</p>
                    <button onClick={() => navigate('/teacher/dashboard')} className="teacher-btn-main" style={{ marginTop: '16px', maxWidth: '220px' }}>
                        Back to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    const enrolledStudents = getEnrolledStudents(course.id);
    const recentActivity = materials.slice(0, 5).map(m => ({
        title: `Material: ${m.title}`,
        time: m.uploadDate ? new Date(m.uploadDate).toLocaleString() : 'Recently',
        type: 'upload'
    }));

    const isLiveSession = course.lectureStatus === 'Active' && course.lectureId;

    const actions = [
        isLiveSession
            ? { title: 'Resume Session', desc: `Continue ${course.lectureId}`, icon: Camera, color: '#10B981', path: `/teacher/course/${course.id}/attendance-scanner` }
            : { title: 'Start Lecture', desc: 'Face scan to begin session', icon: Camera, color: '#10B981', path: `/teacher/course/${course.id}/attendance-scanner` },
        { title: 'Upload Material', desc: 'Add lecture slides & PDFs', icon: Upload, color: '#3B82F6', path: `/teacher/course/${course.id}/upload` },
        { title: 'Emotion Analytics', desc: 'Engagement & emotion data', icon: BarChart3, color: '#A855F7', path: `/teacher/course/${course.id}/analytics` },
        { title: 'Reschedule', desc: 'Update class schedule', icon: Calendar, color: '#6366F1', path: `/teacher/course/${course.id}/reschedule` },
        { title: 'Student Tracking', desc: 'Monitor enrolled students', icon: UserCheck, color: '#EC4899', path: `/teacher/course/${course.id}/tracking` },
    ];

    return (
        <MOTION.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="course-details-page teacher-page">
            <div className="breadcrumb">
                <button onClick={() => navigate('/teacher/dashboard')} className="btn-back">
                    <ArrowLeft size={18} />
                    <span>Back to Dashboard</span>
                </button>
            </div>

            <div className="details-header">
                <div>
                    <h1>{course.name} <span className="course-code">{course.id}</span></h1>
                    <p>{course.description || 'No description provided.'}</p>
                </div>
            </div>

            <div className="course-stats-row">
                <div className="stat-item">
                    <div className="stat-icon"><Calendar size={20} /></div>
                    <div>
                        <span className="stat-label">Schedule</span>
                        <span className="stat-value">{course.schedule || 'TBD'}</span>
                    </div>
                </div>
                <div className="stat-item">
                    <div className="stat-icon"><Users size={20} /></div>
                    <div>
                        <span className="stat-label">Enrolled</span>
                        <span className="stat-value">{enrolledStudents.length} Students</span>
                    </div>
                </div>
                <div className="stat-item">
                    <div className="stat-icon"><Clock size={20} /></div>
                    <div>
                        <span className="stat-label">Attendance Sessions</span>
                        <span className="stat-value">{attendanceLogs.length}</span>
                    </div>
                </div>
                <div className="stat-item">
                    <div className="stat-icon"><FileText size={20} /></div>
                    <div>
                        <span className="stat-label">Materials</span>
                        <span className="stat-value">{materials.length}</span>
                    </div>
                </div>
            </div>

            {isLiveSession && (
                <div className="live-lecture-banner">
                    <div className="live-lecture-info">
                        <div className="live-pulse-dot" />
                        <div>
                            <h3>Live Lecture in Progress</h3>
                            <p>
                                Started: {course.lectureStartTime ? new Date(course.lectureStartTime).toLocaleString() : 'Just now'}
                                {course.lectureId ? ` · Session ${course.lectureId}` : ''}
                            </p>
                        </div>
                    </div>
                    <button
                        className="end-session-btn resume-session-btn"
                        onClick={() => navigate(`/teacher/course/${course.id}/attendance-scanner`)}
                    >
                        <Camera size={18} /> Resume Session
                    </button>
                </div>
            )}

            <div className="actions-grid">
                {actions.map((action, i) => (
                    <div key={i} className="details-action-card" onClick={() => navigate(action.path)}>
                        <div className="action-icon-wrapper" style={{ background: `${action.color}15`, color: action.color }}>
                            <action.icon size={28} />
                        </div>
                        <div className="action-text">
                            <h3>{action.title}</h3>
                            <p>{action.desc}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="details-content-grid">
                <div className="white-card">
                    <div className="card-header">
                        <h2>Enrolled Students</h2>
                        <span className="student-count-pill static">{enrolledStudents.length} Students</span>
                    </div>
                    {enrolledStudents.length === 0 ? (
                        <p className="empty-section-msg">No students enrolled in this class yet.</p>
                    ) : (
                        <div className="table-scroll-wrapper">
                            <table className="student-table-mini">
                                <thead>
                                    <tr>
                                        <th>Student</th>
                                        <th>Program</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {enrolledStudents.map((student) => (
                                        <tr key={student.id}>
                                            <td>
                                                <div className="student-info-cell">
                                                    <div className="mini-avatar">{(student.name || 'S').charAt(0)}</div>
                                                    <div>
                                                        <span className="mini-name">{student.name}</span>
                                                        <span className="mini-email">{student.email}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td>{student.program || '—'}</td>
                                            <td><span className={`status-pill ${(student.status || 'Active').toLowerCase()}`}>{student.status || 'Active'}</span></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div className="white-card">
                    <div className="card-header"><h2>Recent Activity</h2></div>
                    <div className="timeline">
                        {recentActivity.length === 0 ? (
                            <p className="empty-section-msg">No recent activity yet.</p>
                        ) : recentActivity.map((activity, idx) => (
                            <div key={idx} className="timeline-item">
                                <div className={`timeline-dot ${activity.type || 'upload'}`} />
                                <div className="timeline-content">
                                    <p>{activity.title}</p>
                                    <span>{activity.time}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="white-card section-block">
                <div className="card-header">
                    <h2>Shared Materials ({materials.length})</h2>
                    <button className="upload-new-btn" onClick={() => navigate(`/teacher/course/${course.id}/upload`)}>
                        <Upload size={16} /> Upload New
                    </button>
                </div>

                {loadingMaterials ? (
                    <p className="empty-section-msg">Loading materials...</p>
                ) : materials.length > 0 ? (
                    <div className="materials-list">
                        {materials.map((mat) => (
                            <div key={mat.id} className="material-row">
                                <div className="material-icon-wrap">
                                    <FileText size={22} color={mat.format === 'PDF' ? '#3B82F6' : '#7C3AED'} />
                                </div>
                                <div className="material-info">
                                    <p className="material-title">{mat.title}</p>
                                    <div className="material-meta">
                                        <span className="format-badge">{mat.format}</span>
                                        <span>{mat.uploadDate ? new Date(mat.uploadDate).toLocaleDateString() : 'Recently'}</span>
                                        <span>{mat.accessedBy?.length || 0} views</span>
                                        {mat.aiSummary && (
                                            <span className="ai-badge"><Brain size={12} /> AI Summary</span>
                                        )}
                                    </div>
                                </div>
                                <a href={mat.fileUrl} target="_blank" rel="noreferrer" className="material-download-btn">
                                    <Download size={15} /> View
                                </a>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="empty-section-msg centered">
                        <Upload size={40} style={{ opacity: 0.25, marginBottom: '12px' }} />
                        <p>No materials uploaded yet.</p>
                        <button className="teacher-btn-main" style={{ marginTop: '12px' }} onClick={() => navigate(`/teacher/course/${course.id}/upload`)}>
                            Upload First Material
                        </button>
                    </div>
                )}
            </div>

            <div className="white-card section-block">
                <div className="card-header"><h2>Attendance History</h2></div>
                {loadingLogs ? (
                    <p className="empty-section-msg">Loading attendance logs...</p>
                ) : attendanceLogs.length > 0 ? (
                    <div className="table-scroll-wrapper">
                        <table className="student-table-mini">
                            <thead>
                                <tr>
                                    <th>Session</th>
                                    <th>Date</th>
                                    <th>Match</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {attendanceLogs.map((log) => (
                                    <tr key={log._id}>
                                        <td>{log.lectureId || '—'}</td>
                                        <td>{new Date(log.date).toLocaleString()}</td>
                                        <td style={{ color: '#6366F1', fontWeight: 700 }}>{((log.confidence || 0) * 100).toFixed(0)}%</td>
                                        <td><span className="status-pill active">{log.status || 'Verified'}</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="empty-section-msg">No attendance sessions recorded yet. Start a lecture to begin.</p>
                )}
            </div>
        </MOTION.div>
    );
};

export default TeacherCourseDetails;
