import React, { useEffect, useState } from 'react';
import { motion as MOTION } from 'framer-motion';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { ArrowLeft, BookOpen, TrendingUp } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiFetch } from '../utils/api';
import './TeacherStudentTracking.css';

const TeacherStudentTracking = () => {
    const { getTeacherCourse, getEnrolledStudents } = useData();
    const { currentUser } = useAuth();
    const { courseId } = useParams();
    const navigate = useNavigate();
    const [classReport, setClassReport] = useState(null);
    const [loading, setLoading] = useState(true);

    const course = getTeacherCourse(currentUser?.email, courseId);

    useEffect(() => {
        if (!course?.id) {
            setLoading(false);
            return;
        }
        apiFetch(`/api/engagement/class-report/${course.id}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => setClassReport(data))
            .catch(() => setClassReport(null))
            .finally(() => setLoading(false));
    }, [course?.id]);

    if (!course) {
        return (
            <div className="student-tracking-page teacher-page">
                <div className="dashboard-empty">
                    <BookOpen size={56} />
                    <h3>Tracking Data Not Found</h3>
                    <p>This class is not assigned to your account.</p>
                    <button onClick={() => navigate('/teacher/dashboard')} className="teacher-btn-main" style={{ marginTop: '16px' }}>Back to Dashboard</button>
                </div>
            </div>
        );
    }

    const students = getEnrolledStudents(course.id);
    const classEngaged = classReport?.hasData ? (classReport.emotions?.Engaged ?? 0) : null;
    const totalSessions = classReport?.sessions?.length ?? 0;

    return (
        <MOTION.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="student-tracking-page">
            <div className="breadcrumb">
                <button onClick={() => navigate(`/teacher/course/${course.id}`)} className="btn-back">
                    <ArrowLeft size={18} />
                    <span>Back to {course.id}</span>
                </button>
            </div>

            <div className="page-header">
                <div>
                    <h1>Individual Student Tracking</h1>
                    <p>{students.length} enrolled student{students.length !== 1 ? 's' : ''} in {course.name}</p>
                </div>
            </div>

            {loading ? (
                <p className="empty-section-msg">Loading live class data...</p>
            ) : (
                <div className="analytics-metadata-grid" style={{ marginBottom: '24px' }}>
                    <div className="metadata-card">
                        <span>Live Class Engagement</span>
                        <strong>{classEngaged !== null ? `${classEngaged}%` : '—'}</strong>
                    </div>
                    <div className="metadata-card">
                        <span>Recorded Sessions</span>
                        <strong>{totalSessions}</strong>
                    </div>
                    <div className="metadata-card">
                        <span>Students Detected (max)</span>
                        <strong>{classReport?.totalStudentsDetected ?? 0}</strong>
                    </div>
                </div>
            )}

            {students.length === 0 ? (
                <div className="tracking-table-container" style={{ textAlign: 'center', padding: '48px' }}>
                    <p style={{ color: 'var(--text-secondary)' }}>No students are enrolled in this class yet.</p>
                </div>
            ) : (
                <div className="tracking-table-container">
                    <table className="tracking-table">
                        <thead>
                            <tr>
                                <th>Student</th>
                                <th>Program</th>
                                <th>Status</th>
                                <th>Class Engagement</th>
                                <th>Sessions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {students.map((student, idx) => {
                                const colors = ['#6366F1', '#A855F7', '#3B82F6'];
                                return (
                                    <MOTION.tr
                                        key={student.id || idx}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: idx * 0.05 }}
                                    >
                                        <td>
                                            <div className="student-cell">
                                                <div className="avatar" style={{ background: colors[idx % colors.length] }}>
                                                    {(student.name || 'S').charAt(0)}
                                                </div>
                                                <div>
                                                    <p className="name">{student.name}</p>
                                                    <p className="email">{student.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td>{student.program || '—'}</td>
                                        <td><span className={`status-pill ${(student.status || 'Active').toLowerCase()}`}>{student.status || 'Active'}</span></td>
                                        <td>
                                            <div className="progress-container">
                                                <TrendingUp size={14} />
                                                <div className="val-text">{classEngaged !== null ? `${classEngaged}%` : '—'}</div>
                                            </div>
                                        </td>
                                        <td>{totalSessions > 0 ? totalSessions : '—'}</td>
                                    </MOTION.tr>
                                );
                            })}
                        </tbody>
                    </table>
                    <p style={{ padding: '16px 20px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        Per-student emotion tracking is not yet available. Engagement shown is the live class average from recorded emotion sessions.
                    </p>
                </div>
            )}
        </MOTION.div>
    );
};

export default TeacherStudentTracking;
