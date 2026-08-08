import React, { useEffect, useState } from 'react';
import { motion as MOTION } from 'framer-motion';
import { useData } from '../context/DataContext';
import { useParams, useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { ArrowLeft, Users, TrendingUp, Smile, Meh, Frown, Calendar, BookOpen, Clock } from 'lucide-react';
import { apiFetch } from '../utils/api';
import './AdminCourseAnalytics.css';
import './TeacherAnalytics.css';

const formatDateTime = (value) => {
    if (!value) return 'N/A';
    return new Date(value).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    });
};

const AdminCourseAnalytics = () => {
    const { classes, students } = useData() || { classes: [], students: [] };
    const { courseId } = useParams();
    const navigate = useNavigate();

    const course = classes.find(c => c.id === courseId);
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!courseId) {
            setLoading(false);
            return;
        }
        const fetchReport = async () => {
            setLoading(true);
            try {
                const res = await apiFetch(`/api/engagement/class-report/${courseId}`);
                if (res.ok) {
                    setReport(await res.json());
                } else {
                    setReport(null);
                }
            } catch {
                setReport(null);
            } finally {
                setLoading(false);
            }
        };
        fetchReport();
    }, [courseId]);

    if (!course) {
        return (
            <div className="page-container">
                <div className="page-header">
                    <h1>Course Not Found</h1>
                    <p>No class with ID &quot;{courseId}&quot; exists in the database.</p>
                    <button onClick={() => navigate('/classes')} className="btn-primary">Back to Classes</button>
                </div>
            </div>
        );
    }

    const enrolledStudents = students.filter(s => s.enrolledClasses && s.enrolledClasses.includes(course.id));

    const summary = report?.hasData ? {
        happy: report.emotions?.Happy ?? 0,
        engaged: report.emotions?.Engaged ?? 0,
        neutral: report.emotions?.Neutral ?? 0,
        disengaged: report.emotions?.Disengaged ?? 0,
    } : { happy: 0, engaged: 0, neutral: 0, disengaged: 0 };

    const trends = (report?.trends || []).map((t) => ({
        week: t.label || formatDateTime(t.date),
        happy: t.happy ?? 0,
        engaged: t.engaged ?? 0,
        neutral: t.neutral ?? 0,
        disengaged: t.disengaged ?? 0,
    }));

    const COLORS = ['#22C55E', '#10B981', '#F59E0B', '#EF4444'];
    const pieData = [
        { name: 'Happy', value: summary.happy },
        { name: 'Engaged', value: summary.engaged },
        { name: 'Neutral', value: summary.neutral },
        { name: 'Disengaged', value: summary.disengaged },
    ];

    return (
        <MOTION.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="page-container"
        >
            <div className="breadcrumb" style={{ marginBottom: '16px' }}>
                <button onClick={() => navigate('/classes')} className="btn-back" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 500 }}>
                    <ArrowLeft size={20} />
                    <span>Back to Classes</span>
                </button>
            </div>

            <div className="course-header-card" style={{ background: 'white', padding: '24px', borderRadius: '16px', border: '1px solid var(--border)', marginBottom: '24px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <h1 style={{ fontSize: '1.8rem', marginBottom: '8px', color: 'var(--text-dark)' }}>{course.name} <span style={{ color: 'var(--text-muted)', fontSize: '1.1rem', fontWeight: 400 }}>{course.id}</span></h1>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', maxWidth: '600px', lineHeight: '1.5' }}>{course.description || 'No description available for this course.'}</p>

                        <div style={{ display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
                                <div className="avatar-circle-sm" style={{ width: '28px', height: '28px', fontSize: '0.8rem', background: '#3B82F6', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}>
                                    {(course.instructorName || 'T')[0]}
                                </div>
                                <span style={{ fontWeight: 500 }}>{course.instructorName || 'Instructor TBD'}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
                                <Calendar size={18} />
                                <span>{course.schedule || 'Schedule TBD'}</span>
                            </div>
                            {report?.sessionStartTime && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
                                    <Clock size={18} />
                                    <span>Last session: {formatDateTime(report.sessionEndTime || report.sessionStartTime)}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {loading && <p className="report-status">Loading live analytics for {course.id}...</p>}
            {!loading && !report?.hasData && (
                <p className="report-status">No emotion sessions recorded for this class yet.</p>
            )}

            <div className="analytics-summary-cards" style={{ marginBottom: '24px' }}>
                <div className="ana-card green" style={{ padding: '20px' }}>
                    <div className="card-top"><Smile size={24} /><span className="value" style={{ fontSize: '2rem' }}>{summary.happy}%</span></div>
                    <p className="label">Happy</p>
                </div>
                <div className="ana-card blue" style={{ padding: '20px' }}>
                    <div className="card-top"><TrendingUp size={24} /><span className="value" style={{ fontSize: '2rem' }}>{summary.engaged}%</span></div>
                    <p className="label">Engaged</p>
                </div>
                <div className="ana-card yellow" style={{ padding: '20px' }}>
                    <div className="card-top"><Meh size={24} /><span className="value" style={{ fontSize: '2rem' }}>{summary.neutral}%</span></div>
                    <p className="label">Neutral</p>
                </div>
                <div className="ana-card red" style={{ padding: '20px' }}>
                    <div className="card-top"><Frown size={24} /><span className="value" style={{ fontSize: '2rem' }}>{summary.disengaged}%</span></div>
                    <p className="label">Disengaged</p>
                </div>
            </div>

            <div className="analytics-split-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', gap: '24px' }}>

                <div className="chart-card" style={{ height: 'fit-content' }}>
                    <div className="chart-header">
                        <TrendingUp size={20} color="#3B82F6" />
                        <h3>Engagement by Session (Live)</h3>
                    </div>
                    <div className="chart-container">
                        {trends.length > 0 ? (
                            <ResponsiveContainer width="100%" height={350}>
                                <LineChart data={trends}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                    <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} />
                                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                                    <Line type="monotone" dataKey="happy" stroke="#22C55E" strokeWidth={3} dot={{ r: 4 }} name="Happy" />
                                    <Line type="monotone" dataKey="engaged" stroke="#10B981" strokeWidth={3} dot={{ r: 4 }} name="Engaged" />
                                    <Line type="monotone" dataKey="neutral" stroke="#F59E0B" strokeWidth={3} dot={{ r: 4 }} name="Neutral" />
                                    <Line type="monotone" dataKey="disengaged" stroke="#EF4444" strokeWidth={3} dot={{ r: 4 }} name="Disengaged" />
                                </LineChart>
                            </ResponsiveContainer>
                        ) : (
                            <p className="empty-section-msg">No session trend data yet.</p>
                        )}
                    </div>
                </div>

                <div className="chart-card" style={{ height: 'fit-content' }}>
                    <div className="chart-header">
                        <Users size={20} color="#A855F7" />
                        <h3>Distribution</h3>
                    </div>
                    <div className="chart-container">
                        {report?.hasData ? (
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

            {report?.sessions?.length > 0 && (
                <div className="table-container shadow-hover" style={{ marginTop: '24px' }}>
                    <div style={{ padding: '20px', borderBottom: '1px solid var(--border)' }}>
                        <h3 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Session History</h3>
                    </div>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Lecture ID</th>
                                <th>Start</th>
                                <th>End</th>
                                <th>Segments</th>
                                <th>Students</th>
                                <th>Engaged</th>
                            </tr>
                        </thead>
                        <tbody>
                            {report.sessions.map((s) => (
                                <tr key={s.lectureId}>
                                    <td><span style={{ fontWeight: 700, color: '#6366F1' }}>{s.lectureId}</span></td>
                                    <td>{formatDateTime(s.startTime)}</td>
                                    <td>{formatDateTime(s.endTime)}</td>
                                    <td>{s.segmentCount}</td>
                                    <td>{s.totalStudents}</td>
                                    <td>{s.emotions?.Engaged ?? 0}%</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <div className="table-container shadow-hover" style={{ marginTop: '24px', maxHeight: '500px', overflowY: 'auto' }}>
                <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Enrolled Students</h3>
                    <span className="badge" style={{ background: '#EFF6FF', color: '#2563EB', padding: '4px 12px', borderRadius: '12px', fontSize: '0.9rem', fontWeight: 600 }}>
                        {enrolledStudents.length}
                    </span>
                </div>
                {enrolledStudents.length > 0 ? (
                    <table className="data-table" style={{ width: '100%' }}>
                        <thead>
                            <tr>
                                <th style={{ paddingLeft: '24px' }}>Name</th>
                                <th>ID</th>
                                <th>Email</th>
                            </tr>
                        </thead>
                        <tbody>
                            {enrolledStudents.map(student => (
                                <tr key={student.id}>
                                    <td style={{ paddingLeft: '24px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <div className="avatar-circle" style={{ width: '28px', height: '28px', fontSize: '0.8rem', minWidth: '28px' }}>
                                                {(student.firstName || 'S')[0]}
                                            </div>
                                            <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>
                                                {`${student.firstName || ''} ${student.lastName || ''}`.trim() || 'Unknown'}
                                            </span>
                                        </div>
                                    </td>
                                    <td style={{ fontSize: '0.85rem', color: '#6B7280', fontFamily: 'monospace' }}>
                                        {student.studentId || '-'}
                                    </td>
                                    <td style={{ fontSize: '0.85rem', color: '#6B7280' }}>
                                        {student.email || '-'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <BookOpen size={40} style={{ opacity: 0.2, marginBottom: '10px' }} />
                        <p>No students enrolled yet.</p>
                    </div>
                )}
            </div>
        </MOTION.div>
    );
};

export default AdminCourseAnalytics;
