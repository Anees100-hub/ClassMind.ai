import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { motion as MOTION } from 'framer-motion';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, Smile, Meh, Frown, ArrowLeft, Calendar, Users, BookOpen, Clock } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiFetch } from '../utils/api';
import './TeacherAnalytics.css';

const formatDateTime = (value) => {
    if (!value) return 'N/A';
    return new Date(value).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    });
};

const EMPTY_REPORT = {
    hasData: false,
    emotions: {},
    totalStudentsDetected: 0,
    totalEmotionSamples: 0,
    detectionTimeline: [],
    sessions: [],
    trends: [],
    attendanceLogs: [],
};

const TeacherAnalytics = () => {
    const { getTeacherCourse } = useData();
    const { currentUser } = useAuth();
    const { courseId } = useParams();
    const navigate = useNavigate();

    const course = getTeacherCourse(currentUser?.email, courseId);
    const [fullReport, setFullReport] = useState(null);
    const [loadingReport, setLoadingReport] = useState(true);
    const [selectedSession, setSelectedSession] = useState('all');

    const fetchReport = useCallback(async () => {
        if (!course?.id) return;
        setLoadingReport(true);
        try {
            const res = await apiFetch(`/api/engagement/class-report/${course.id}`);
            if (res.ok) {
                setFullReport(await res.json());
            } else {
                setFullReport(EMPTY_REPORT);
            }
        } catch {
            setFullReport(EMPTY_REPORT);
        } finally {
            setLoadingReport(false);
        }
    }, [course?.id]);

    useEffect(() => {
        if (!course?.id) {
            setLoadingReport(false);
            return;
        }
        fetchReport();
    }, [course?.id, fetchReport]);

    const report = useMemo(() => {
        if (!fullReport) return EMPTY_REPORT;
        if (selectedSession === 'all') return fullReport;

        const session = (fullReport.sessions || []).find(s => s.lectureId === selectedSession);
        const timeline = (fullReport.detectionTimeline || []).filter(t => t.lectureId === selectedSession);
        if (!session && timeline.length === 0) return fullReport;

        return {
            ...fullReport,
            hasData: timeline.length > 0,
            emotions: session?.emotions || fullReport.emotions,
            totalStudentsDetected: session?.totalStudents ?? 0,
            totalEmotionSamples: timeline.reduce((sum, t) => sum + (t.totalStudents || 0), 0),
            sessionStartTime: session?.startTime || timeline[0]?.timestamp,
            sessionEndTime: session?.endTime || timeline[timeline.length - 1]?.timestamp,
            detectionTimeline: timeline,
        };
    }, [fullReport, selectedSession]);

    const handleSessionSelect = (lectureId) => {
        setSelectedSession(lectureId);
    };

    if (!course) {
        return (
            <div className="teacher-analytics-page teacher-page">
                <div className="dashboard-empty">
                    <BookOpen size={56} />
                    <h3>Course Not Available</h3>
                    <p>This class is not assigned to your teacher account.</p>
                    <button onClick={() => navigate('/teacher/dashboard')} className="teacher-btn-main" style={{ marginTop: '16px' }}>Back to Dashboard</button>
                </div>
            </div>
        );
    }

    const summary = {
        happy: report.emotions?.Happy ?? 0,
        engaged: report.emotions?.Engaged ?? 0,
        neutral: report.emotions?.Neutral ?? 0,
        disengaged: report.emotions?.Disengaged ?? 0,
    };

    const trendData = selectedSession === 'all'
        ? (report.trends || []).map((item) => ({
            label: item.label || formatDateTime(item.date),
            happy: item.happy ?? 0,
            engaged: item.engaged ?? 0,
            neutral: item.neutral ?? 0,
            disengaged: item.disengaged ?? 0,
        }))
        : (report.detectionTimeline || []).map((item, index) => ({
            label: formatDateTime(item.timestamp),
            segment: `S${item.segmentNumber || index + 1}`,
            happy: item.emotions?.Happy ?? 0,
            engaged: item.emotions?.Engaged ?? 0,
            neutral: item.emotions?.Neutral ?? 0,
            disengaged: item.emotions?.Disengaged ?? 0,
        }));

    const COLORS = ['#22C55E', '#10B981', '#F59E0B', '#EF4444'];
    const pieData = [
        { name: 'Happy', value: summary.happy },
        { name: 'Engaged', value: summary.engaged },
        { name: 'Neutral', value: summary.neutral },
        { name: 'Disengaged', value: summary.disengaged },
    ];

    const allSessions = fullReport?.sessions || [];

    return (
        <MOTION.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="teacher-analytics-page teacher-page">
            <div className="breadcrumb">
                <button onClick={() => navigate(`/teacher/course/${course.id}`)} className="btn-back">
                    <ArrowLeft size={20} />
                    <span>Back to {course.id}</span>
                </button>
            </div>

            <div className="page-header">
                <div>
                    <h1>Emotion Analytics</h1>
                    <p>Live engagement data for {course.name} ({course.id})</p>
                    {selectedSession !== 'all' && (
                        <p className="session-filter-label">Showing data for: <strong>{selectedSession}</strong></p>
                    )}
                </div>
                {allSessions.length > 0 && (
                    <div className="session-filter">
                        <Calendar size={18} />
                        <select
                            value={selectedSession}
                            onChange={(e) => handleSessionSelect(e.target.value)}
                            className="session-select"
                        >
                            <option value="all">All Sessions ({allSessions.length})</option>
                            {allSessions.map((s) => (
                                <option key={s.lectureId} value={s.lectureId}>
                                    {s.lectureId} — {formatDateTime(s.startTime)}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            <div className="analytics-summary-cards">
                <MOTION.div whileHover={{ y: -5 }} className="ana-card green">
                    <div className="card-top"><Smile size={32} /><span className="value">{summary.happy}%</span></div>
                    <p className="label">Happy</p>
                </MOTION.div>
                <MOTION.div whileHover={{ y: -5 }} className="ana-card blue">
                    <div className="card-top"><TrendingUp size={32} /><span className="value">{summary.engaged}%</span></div>
                    <p className="label">Engaged</p>
                </MOTION.div>
                <MOTION.div whileHover={{ y: -5 }} className="ana-card yellow">
                    <div className="card-top"><Meh size={32} /><span className="value">{summary.neutral}%</span></div>
                    <p className="label">Neutral</p>
                </MOTION.div>
                <MOTION.div whileHover={{ y: -5 }} className="ana-card red">
                    <div className="card-top"><Frown size={32} /><span className="value">{summary.disengaged}%</span></div>
                    <p className="label">Disengaged</p>
                </MOTION.div>
            </div>

            <div className="analytics-metadata-grid">
                <div className="metadata-card"><span>Students Detected</span><strong>{report.totalStudentsDetected ?? 0}</strong></div>
                <div className="metadata-card"><span>Emotion Samples</span><strong>{report.totalEmotionSamples ?? 0}</strong></div>
                <div className="metadata-card"><span>Session Start</span><strong>{formatDateTime(report.sessionStartTime)}</strong></div>
                <div className="metadata-card"><span>Session End</span><strong>{formatDateTime(report.sessionEndTime)}</strong></div>
            </div>

            {loadingReport && <p className="report-status">Loading emotion report from database...</p>}
            {!loadingReport && !report.hasData && (
                <p className="report-status">No emotion data yet. Start a lecture session to begin collecting analytics.</p>
            )}

            <div className="analytics-charts-grid">
                <div className="chart-card">
                    <div className="chart-header">
                        <Calendar size={20} color="#3B82F6" />
                        <h3>{selectedSession === 'all' ? 'Engagement by Session' : `Segment Timeline — ${selectedSession}`}</h3>
                    </div>
                    <div className="chart-container">
                        {trendData.length > 0 ? (
                            <ResponsiveContainer width="100%" height={300}>
                                <LineChart data={trendData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                    <XAxis dataKey={selectedSession === 'all' ? 'label' : 'segment'} axisLine={false} tickLine={false} />
                                    <YAxis axisLine={false} tickLine={false} />
                                    <Tooltip labelFormatter={(_, payload) => payload?.[0]?.payload?.label || ''} />
                                    <Line type="monotone" dataKey="happy" stroke="#22C55E" strokeWidth={3} dot={selectedSession !== 'all'} name="Happy" />
                                    <Line type="monotone" dataKey="engaged" stroke="#10B981" strokeWidth={3} dot={selectedSession !== 'all'} name="Engaged" />
                                    <Line type="monotone" dataKey="neutral" stroke="#F59E0B" strokeWidth={3} dot={selectedSession !== 'all'} name="Neutral" />
                                    <Line type="monotone" dataKey="disengaged" stroke="#EF4444" strokeWidth={3} dot={selectedSession !== 'all'} name="Disengaged" />
                                </LineChart>
                            </ResponsiveContainer>
                        ) : (
                            <p className="empty-section-msg">No timeline data available.</p>
                        )}
                    </div>
                </div>

                <div className="chart-card pie-section">
                    <div className="chart-header">
                        <Users size={20} color="#A855F7" />
                        <h3>Distribution{selectedSession !== 'all' ? ` (${selectedSession})` : ''}</h3>
                    </div>
                    <div className="chart-container">
                        {report.hasData ? (
                            <ResponsiveContainer width="100%" height={260}>
                                <PieChart>
                                    <Pie data={pieData} outerRadius={90} dataKey="value">
                                        {pieData.map((_, index) => (
                                            <Cell key={index} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <p className="empty-section-msg">No distribution data yet.</p>
                        )}
                    </div>
                </div>
            </div>

            {allSessions.length > 0 && (
                <div className="table-container shadow-hover">
                    <div style={{ padding: '20px', borderBottom: '1px solid var(--border)' }}>
                        <h3 style={{ fontSize: '1.2rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Clock size={20} /> Recorded Sessions
                        </h3>
                        <p style={{ margin: '8px 0 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                            Click a session row to view that date&apos;s graph only
                        </p>
                    </div>
                    <table className="data-table session-table">
                        <thead>
                            <tr>
                                <th>Lecture ID</th>
                                <th>Date</th>
                                <th>Start</th>
                                <th>End</th>
                                <th>Segments</th>
                                <th>Students</th>
                                <th>Engaged</th>
                            </tr>
                        </thead>
                        <tbody>
                            {allSessions.map((s) => (
                                <tr
                                    key={s.lectureId}
                                    className={`session-row ${selectedSession === s.lectureId ? 'selected' : ''}`}
                                    onClick={() => handleSessionSelect(s.lectureId)}
                                    title="Click to view this session's graph"
                                >
                                    <td><span style={{ fontWeight: 700, color: '#6366F1' }}>{s.lectureId}</span></td>
                                    <td>{new Date(s.startTime).toLocaleDateString(undefined, { dateStyle: 'medium' })}</td>
                                    <td>{formatDateTime(s.startTime)}</td>
                                    <td>{formatDateTime(s.endTime)}</td>
                                    <td>{s.segmentCount}</td>
                                    <td>{s.totalStudents}</td>
                                    <td>{s.emotions?.Engaged ?? 0}%</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {selectedSession !== 'all' && (
                        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
                            <button type="button" className="btn-secondary" onClick={() => handleSessionSelect('all')}>
                                Show All Sessions
                            </button>
                        </div>
                    )}
                </div>
            )}

            {(fullReport?.attendanceLogs?.length > 0) && (
                <div className="table-container shadow-hover">
                    <div style={{ padding: '20px', borderBottom: '1px solid var(--border)' }}>
                        <h3 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Teacher Attendance Records</h3>
                    </div>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Teacher</th>
                                <th>Lecture</th>
                                <th>Date & Time</th>
                                <th>Confidence</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {fullReport.attendanceLogs.map((a, i) => (
                                <tr key={`${a.lectureId}-${i}`}>
                                    <td>{a.teacherName || a.teacherId}</td>
                                    <td>{a.lectureId}</td>
                                    <td>{formatDateTime(a.date)}</td>
                                    <td>{Math.round((a.confidence || 0) * 100)}%</td>
                                    <td><span className="status-pill active">{a.status}</span></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </MOTION.div>
    );
};

export default TeacherAnalytics;
