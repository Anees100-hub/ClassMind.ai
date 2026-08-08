import React, { useEffect, useState } from 'react';
import { motion as MOTION } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Brain, Smile, Meh, Frown, TrendingUp, Calendar, BookOpen } from 'lucide-react';
import { apiFetch } from '../utils/api';
import './TeacherAnalytics.css';

const formatDateTime = (value) => {
    if (!value) return '—';
    return new Date(value).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    });
};

const Analytics = () => {
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchSummary = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await apiFetch('/api/engagement/admin-summary');
                if (!res.ok) throw new Error('Failed to load analytics');
                setSummary(await res.json());
            } catch (err) {
                setError(err.message);
                setSummary(null);
            } finally {
                setLoading(false);
            }
        };
        fetchSummary();
    }, []);

    const classes = summary?.classes || [];
    const averages = summary?.averages || { Happy: 0, Engaged: 0, Neutral: 0, Disengaged: 0 };

    const classComparisonData = classes.map((c) => ({
        name: c.classId,
        happy: c.emotions?.Happy ?? 0,
        engaged: c.emotions?.Engaged ?? 0,
        neutral: c.emotions?.Neutral ?? 0,
        disengaged: c.emotions?.Disengaged ?? 0,
        hasData: c.hasData,
    }));

    return (
        <MOTION.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="teacher-analytics-page admin-page"
        >
            {loading ? (
                <div className="dashboard-loading"><div className="dashboard-spinner" /><p>Loading live analytics from database...</p></div>
            ) : error ? (
                <div className="dashboard-empty">
                    <Brain size={56} />
                    <h3>Analytics Unavailable</h3>
                    <p>{error}</p>
                </div>
            ) : (
            <>
            <div className="page-header admin-page-header">
                <div>
                    <h1>Institutional Emotion Report</h1>
                    <p>Live engagement metrics aggregated from recorded emotion sessions</p>
                    {summary?.generatedAt && (
                        <p className="report-generated-at">
                            <Calendar size={14} /> Last updated: {formatDateTime(summary.generatedAt)}
                        </p>
                    )}
                </div>
            </div>

            <div className="analytics-summary-cards">
                <MOTION.div whileHover={{ y: -5 }} className="ana-card green">
                    <div className="card-top">
                        <Smile size={32} />
                        <span className="value">{averages.Happy}%</span>
                    </div>
                    <p className="label">Avg. Happy</p>
                </MOTION.div>
                <MOTION.div whileHover={{ y: -5 }} className="ana-card blue">
                    <div className="card-top">
                        <TrendingUp size={32} />
                        <span className="value">{averages.Engaged}%</span>
                    </div>
                    <p className="label">Avg. Engaged</p>
                </MOTION.div>
                <MOTION.div whileHover={{ y: -5 }} className="ana-card yellow">
                    <div className="card-top">
                        <Meh size={32} />
                        <span className="value">{averages.Neutral}%</span>
                    </div>
                    <p className="label">Avg. Neutral</p>
                </MOTION.div>
                <MOTION.div whileHover={{ y: -5 }} className="ana-card red">
                    <div className="card-top">
                        <Frown size={32} />
                        <span className="value">{averages.Disengaged}%</span>
                    </div>
                    <p className="label">Avg. Disengaged</p>
                </MOTION.div>
            </div>

            <div className="analytics-metadata-grid">
                <div className="metadata-card"><span>Total Classes</span><strong>{summary?.totalClasses ?? 0}</strong></div>
                <div className="metadata-card"><span>Classes With Data</span><strong>{summary?.classesWithData ?? 0}</strong></div>
            </div>

            <div className="analytics-charts-grid" style={{ gridTemplateColumns: '1fr' }}>
                <div className="chart-card">
                    <div className="chart-header">
                        <Brain size={20} color="#6366F1" />
                        <h3>Emotional Sentiment by Class (Live Data)</h3>
                    </div>
                    <div className="chart-container" style={{ height: '400px' }}>
                        {classComparisonData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={classComparisonData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} />
                                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                                    <Bar dataKey="happy" stackId="a" fill="#22C55E" barSize={50} />
                                    <Bar dataKey="engaged" stackId="a" fill="#10B981" />
                                    <Bar dataKey="neutral" stackId="a" fill="#F59E0B" />
                                    <Bar dataKey="disengaged" stackId="a" fill="#EF4444" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <p className="empty-section-msg">No class data available.</p>
                        )}
                        <div className="chart-legend">
                            <span className="legend-item"><span className="dot" style={{ background: '#22C55E' }} /> Happy</span>
                            <span className="legend-item"><span className="dot engaged" /> Engaged</span>
                            <span className="legend-item"><span className="dot neutral" /> Neutral</span>
                            <span className="legend-item"><span className="dot disengaged" /> Disengaged</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="main-content-grid" style={{ marginTop: '32px' }}>
                <div className="table-container shadow-hover">
                    <div style={{ padding: '20px', borderBottom: '1px solid var(--border)' }}>
                        <h3 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Class Engagement Overview</h3>
                    </div>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Class ID</th>
                                <th>Course Name</th>
                                <th>Instructor</th>
                                <th>Sessions</th>
                                <th>Last Session</th>
                                <th>Engaged</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {classes.length === 0 ? (
                                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>No class data in database yet.</td></tr>
                            ) : classes.map((cls) => (
                                <tr key={cls.classId}>
                                    <td><span style={{ fontWeight: 700, color: '#6366F1' }}>{cls.classId}</span></td>
                                    <td>{cls.className}</td>
                                    <td>{cls.instructorName}</td>
                                    <td>{cls.totalSessions}</td>
                                    <td>{formatDateTime(cls.lastSessionTime)}</td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div style={{ width: '100px', height: '8px', background: '#F3F4F6', borderRadius: '4px', overflow: 'hidden' }}>
                                                <div style={{ width: `${cls.emotions?.Engaged ?? 0}%`, height: '100%', background: '#10B981' }} />
                                            </div>
                                            <span style={{ fontWeight: 600 }}>{cls.hasData ? `${cls.emotions?.Engaged ?? 0}%` : '—'}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <span className={`status-pill ${cls.hasData ? 'active' : ''}`}>
                                            {cls.hasData ? 'Live Data' : 'No Sessions'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            </>
            )}
        </MOTION.div>
    );
};

export default Analytics;
