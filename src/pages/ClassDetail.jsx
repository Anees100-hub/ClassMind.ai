import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useParams, useNavigate } from 'react-router-dom';
import { BookOpen, FileText, Download, Clock, Users, ArrowLeft, Brain } from 'lucide-react';
import './ClassDetail.css';

const ClassDetail = () => {
    const { id } = useParams();
    const { getStudentCourse, getStudentData, refreshData } = useData();
    const { currentUser } = useAuth();
    const navigate = useNavigate();

    const course = getStudentCourse(currentUser?.email, id);
    const studentData = getStudentData(currentUser?.email);
    const [materials, setMaterials] = useState([]);
    const [schedule, setSchedule] = useState([]);
    const [loadingMaterials, setLoadingMaterials] = useState(true);
    const [loadingSchedule, setLoadingSchedule] = useState(true);

    const fetchMaterials = useCallback(async (classId) => {
        if (!classId) return;
        setLoadingMaterials(true);
        try {
            const res = await fetch(`/api/materials/class/${classId}`);
            setMaterials(res.ok ? await res.json() : []);
        } catch {
            setMaterials([]);
        } finally {
            setLoadingMaterials(false);
        }
    }, []);

    const fetchSchedule = useCallback(async (classId) => {
        if (!classId) return;
        setLoadingSchedule(true);
        try {
            const res = await fetch(`/api/timetable/course/${classId}`);
            setSchedule(res.ok ? await res.json() : []);
        } catch {
            setSchedule([]);
        } finally {
            setLoadingSchedule(false);
        }
    }, []);

    useEffect(() => {
        refreshData();
    }, [id]);

    useEffect(() => {
        if (course?.id) {
            fetchMaterials(course.id);
            fetchSchedule(course.id);
        }
    }, [course?.id, fetchMaterials, fetchSchedule]);

    if (!course) {
        return (
            <div className="class-detail-page student-page">
                <div className="breadcrumb">
                    <button onClick={() => navigate('/')} className="btn-back">
                        <ArrowLeft size={20} />
                        <span>Back to Dashboard</span>
                    </button>
                </div>
                <div className="dashboard-empty">
                    <BookOpen size={56} />
                    <h3>Course Not Found</h3>
                    <p>You are not enrolled in this class or it may have been removed.</p>
                </div>
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="class-detail-page student-page"
        >
            <div className="breadcrumb">
                <button onClick={() => navigate('/')} className="btn-back">
                    <ArrowLeft size={20} />
                    <span>Back to Dashboard</span>
                </button>
            </div>

            <div className="hero-banner">
                <div className="hero-content">
                    <div className="hero-main">
                        <h1>{course.name} <span className="course-code">{course.id}</span></h1>
                        <p className="description">{course.description || 'No description provided.'}</p>

                        <div className="hero-meta">
                            <div className="meta-item">
                                <Users size={18} />
                                <span>{course.instructor}</span>
                            </div>
                            <div className="meta-item">
                                <Clock size={18} />
                                <span>{course.nextSession}</span>
                            </div>
                            <div className="meta-item">
                                <FileText size={18} />
                                <span>{materials.length} materials</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="progress-banner cgpa-banner">
                    <div className="cgpa-banner-grid">
                        <div className="cgpa-banner-item">
                            <span className="cgpa-banner-label">Overall CGPA</span>
                            <span className="cgpa-banner-value overall">{(studentData?.overallCGPA && studentData.overallCGPA !== '0.00') ? studentData.overallCGPA : '—'}</span>
                            <span className="cgpa-banner-scale">out of 4.00</span>
                        </div>
                        <div className="cgpa-banner-divider" />
                        <div className="cgpa-banner-item">
                            <span className="cgpa-banner-label">Previous Semester</span>
                            <span className="cgpa-banner-value previous">{(studentData?.previousCGPA && studentData.previousCGPA !== '0.00') ? studentData.previousCGPA : '—'}</span>
                            <span className="cgpa-banner-scale">out of 4.00</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="detail-grid">
                <div className="main-col">
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 }}
                        className="content-card"
                    >
                        <div className="card-header">
                            <FileText size={20} />
                            <h3>Learning Materials</h3>
                            <span className="count">{materials.length} materials</span>
                        </div>
                        <div className="materials-list">
                            {loadingMaterials ? (
                                <p className="empty-section-msg">Loading materials...</p>
                            ) : materials.length === 0 ? (
                                <p className="empty-section-msg centered">No materials uploaded yet. Check back after your instructor uploads lecture slides.</p>
                            ) : materials.map((m, i) => (
                                <motion.div
                                    key={m.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.3 + (i * 0.1) }}
                                    className="material-item"
                                    onClick={() => navigate(`/material/${m.id}`)}
                                >
                                    <div className="file-icon">
                                        <FileText size={24} />
                                    </div>
                                    <div className="material-info">
                                        <h4>{m.title}</h4>
                                        <p>
                                            {m.format || 'Document'} · {m.uploadDate ? new Date(m.uploadDate).toLocaleDateString() : 'Recently'}
                                            {m.aiSummary && (
                                                <span className="ai-inline-badge"><Brain size={12} /> AI Summary</span>
                                            )}
                                        </p>
                                    </div>
                                    <button className="btn-action-primary" onClick={(e) => { e.stopPropagation(); navigate(`/material/${m.id}`); }}>
                                        View Summary
                                    </button>
                                    <a
                                        href={m.fileUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="btn-icon-gray material-download-link"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <Download size={20} />
                                    </a>
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>
                </div>

                <div className="side-col">
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.4 }}
                        className="content-card"
                    >
                        <div className="card-header">
                            <Clock size={20} />
                            <h3>Class Schedule</h3>
                        </div>
                        <div className="sessions-list">
                            {loadingSchedule ? (
                                <p className="empty-section-msg">Loading schedule...</p>
                            ) : schedule.length === 0 ? (
                                <p className="empty-section-msg">No schedule set yet. Your instructor will update the timetable.</p>
                            ) : schedule.map((entry, idx) => (
                                <div key={entry._id || idx} className={`session-item ${idx === 0 ? 'active' : ''}`}>
                                    <div className="session-time">
                                        <Clock size={16} />
                                        <span>{entry.day} · {entry.startTime} – {entry.endTime}</span>
                                    </div>
                                    <h4>{course.name}</h4>
                                    <p>{entry.roomNo ? `Room ${entry.roomNo}` : 'Live Lecture'}</p>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                </div>
            </div>
        </motion.div>
    );
};

export default ClassDetail;
