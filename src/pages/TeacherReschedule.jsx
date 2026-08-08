import React, { useState, useEffect } from 'react';
import { motion as Motion } from 'framer-motion';
import { Calendar, Clock, Bell, ArrowLeft, CheckCircle2, BookOpen } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import './TeacherReschedule.css';

const ALL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const getDayName = (dateStr) => {
    if (!dateStr) return null;
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[new Date(dateStr + 'T12:00:00').getDay()];
};

const TeacherReschedule = () => {
    const navigate = useNavigate();
    const { courseId } = useParams();
    const { rescheduleClass, teachers, timetables, getTeacherCourse } = useData();
    const { currentUser } = useAuth();

    const course = getTeacherCourse(currentUser?.email, courseId);
    const teacherObj = teachers.find(t => t.email === currentUser?.email);
    const teacherId = teacherObj ? teacherObj.id : null;

    const todayStr = new Date().toISOString().split('T')[0];

    const [selectedDays, setSelectedDays] = useState([]);
    const [startTime, setStartTime] = useState('10:00');
    const [endTime, setEndTime] = useState('11:30');
    const [effectiveFrom, setEffectiveFrom] = useState(todayStr);
    const [reason, setReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [initialized, setInitialized] = useState(false);

    // Load existing schedule for this course on mount
    useEffect(() => {
        if (initialized) return;
        const existing = timetables.filter(t => t.courseId === courseId);
        if (existing.length > 0) {
            const days = [...new Set(existing.map(e => e.day).filter(Boolean))];
            setSelectedDays(days.length > 0 ? days : []);
            setStartTime(existing[0].startTime || '10:00');
            setEndTime(existing[0].endTime || '11:30');
            if (existing[0].effectiveFrom) setEffectiveFrom(existing[0].effectiveFrom);
        }
        setInitialized(true);
    }, [timetables, courseId, initialized]);

    const toggleDay = (day) => {
        setSelectedDays(prev =>
            prev.includes(day)
                ? prev.filter(d => d !== day)
                : [...prev, day]
        );
    };

    const handleEffectiveDateChange = (dateStr) => {
        setEffectiveFrom(dateStr);
        const dayName = getDayName(dateStr);
        if (dayName && !selectedDays.includes(dayName)) {
            setSelectedDays(prev => [...prev, dayName]);
        }
    };

    const handleConfirm = async () => {
        if (selectedDays.length === 0) {
            setErrorMsg('Please select at least one class day.');
            return;
        }
        if (!startTime || !endTime || !effectiveFrom) {
            setErrorMsg('Please select valid start time, end time, and effective date.');
            return;
        }
        if (startTime >= endTime) {
            setErrorMsg('Start time must be before end time.');
            return;
        }

        setIsSubmitting(true);
        setErrorMsg('');

        try {
            const res = await rescheduleClass({
                courseId: course.id,
                teacherId,
                days: selectedDays,
                startTime,
                endTime,
                effectiveFrom,
                date: effectiveFrom,
                reason
            });

            if (res) {
                setSuccessMsg('Schedule updated — students and you will receive notifications.');
                setTimeout(() => navigate(`/teacher/course/${course.id}`), 1800);
            } else {
                setErrorMsg('Failed to reschedule class.');
            }
        } catch (err) {
            console.error('Reschedule error:', err);
            setErrorMsg('Network error occurred while rescheduling.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!course) {
        return (
            <div className="teacher-reschedule-page teacher-page">
                <div className="dashboard-empty">
                    <BookOpen size={56} />
                    <h3>Course Not Found</h3>
                    <p>This class is not assigned to your account.</p>
                    <button onClick={() => navigate('/teacher/dashboard')} className="teacher-btn-main" style={{ marginTop: '16px' }}>Back to Dashboard</button>
                </div>
            </div>
        );
    }

    return (
        <Motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="teacher-reschedule-page"
        >
            <div className="breadcrumb">
                <button onClick={() => navigate(`/teacher/course/${course.id}`)} className="btn-back">
                    <ArrowLeft size={20} />
                    <span>Back to {course.id}</span>
                </button>
            </div>

            <div className="page-header">
                <div>
                    <h1>Reschedule Class Timetable</h1>
                    <p>Adjust class timings and notify enrolled students and yourself</p>
                </div>
            </div>

            {successMsg ? (
                <div className="reschedule-form-card" style={{ textAlign: 'center', padding: '40px' }}>
                    <CheckCircle2 size={56} color="#10B981" style={{ margin: '0 auto 16px' }} />
                    <h2 style={{ color: '#065F46' }}>Reschedule Confirmed!</h2>
                    <p style={{ color: '#047857', marginTop: '8px' }}>{successMsg}</p>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '20px' }}>
                        Redirecting back to course page...
                    </p>
                </div>
            ) : (
                <div className="reschedule-form-card">
                    {errorMsg && (
                        <div className="reschedule-error">{errorMsg}</div>
                    )}

                    <div className="form-section">
                        <label>Select Class Days *</label>
                        <p className="form-hint">Click each day this class meets. Only the days you select will be saved.</p>
                        <div className="days-selector">
                            {ALL_DAYS.map(day => (
                                <button
                                    key={day}
                                    type="button"
                                    onClick={() => toggleDay(day)}
                                    className={`day-pill ${selectedDays.includes(day) ? 'selected' : ''}`}
                                >
                                    {day.slice(0, 3)}
                                </button>
                            ))}
                        </div>
                        {selectedDays.length > 0 && (
                            <p className="selected-days-summary">Selected: {selectedDays.join(', ')}</p>
                        )}
                    </div>

                    <div className="form-row">
                        <div className="form-section">
                            <label>Start Time *</label>
                            <div className="input-with-icon">
                                <Clock size={18} />
                                <input
                                    type="time"
                                    value={startTime}
                                    onChange={(e) => setStartTime(e.target.value)}
                                    required
                                />
                            </div>
                        </div>
                        <div className="form-section">
                            <label>End Time *</label>
                            <div className="input-with-icon">
                                <Clock size={18} />
                                <input
                                    type="time"
                                    value={endTime}
                                    onChange={(e) => setEndTime(e.target.value)}
                                    required
                                />
                            </div>
                        </div>
                    </div>

                    <div className="form-section">
                        <label>Effective Date *</label>
                        <div className="input-with-icon">
                            <Calendar size={18} />
                            <input
                                type="date"
                                value={effectiveFrom}
                                min={todayStr}
                                onChange={(e) => handleEffectiveDateChange(e.target.value)}
                                required
                            />
                        </div>
                        <p className="form-hint">The weekday of this date will be added to your selection if not already chosen.</p>
                    </div>

                    <div className="form-section">
                        <label>Reason for Rescheduling (Optional)</label>
                        <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Provide a brief explanation for students (e.g., Room adjustment, makeup session)..."
                            rows={3}
                        />
                    </div>

                    <div className="notify-banner">
                        <Bell size={20} color="#3B82F6" />
                        <div>
                            <h4>Automatic Notifications</h4>
                            <p>All enrolled students and you (the instructor) will be notified when you confirm this reschedule.</p>
                        </div>
                    </div>

                    <div className="form-actions">
                        <button className="btn-cancel" onClick={() => navigate(-1)} disabled={isSubmitting}>Cancel</button>
                        <button className="btn-primary-large" onClick={handleConfirm} disabled={isSubmitting}>
                            {isSubmitting ? 'Saving to Database...' : 'Confirm Reschedule'}
                        </button>
                    </div>
                </div>
            )}
        </Motion.div>
    );
};

export default TeacherReschedule;
