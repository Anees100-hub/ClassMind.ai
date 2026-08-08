import React, { useState } from 'react';
import { Plus, Users, BookOpen, Calendar, X, Trash2, Edit, Clock, MapPin } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import './Classes.css';

const Classes = () => {
    const { classes, addClass, updateClass, deleteClass, teachers, assignClassToTeacher, students, refreshData, loading } = useData();
    const navigate = useNavigate();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [selectedClass, setSelectedClass] = useState(null);
    const [isSaving, setIsSaving] = useState(false);

    const todayStr = new Date().toISOString().split('T')[0];

    const [formData, setFormData] = useState({
        id: '',
        name: '',
        description: '',
        date: todayStr,
        day: 'Monday',
        startTime: '09:00',
        endTime: '10:30',
        roomNo: 'Room 301',
        teacherId: ''
    });

    const [formError, setFormError] = useState('');

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (formError) setFormError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setFormError('');
        setIsSaving(true);

        const scheduleStr = `${formData.day}s, ${formData.startTime} - ${formData.endTime} (${formData.roomNo})`;

        const classPayload = {
            id: formData.id.trim(),
            name: formData.name.trim(),
            description: formData.description,
            schedule: scheduleStr,
            instructorId: formData.teacherId ? Number(formData.teacherId) : undefined
        };

        let result;
        if (isEditing && selectedClass) {
            result = await updateClass(selectedClass.id, classPayload);
        } else {
            result = await addClass(classPayload);
        }

        if (result && result.success === false) {
            setFormError(result.message);
            setIsSaving(false);
            return;
        }

        try {
            await fetch('/api/timetable/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    teacherId: formData.teacherId ? Number(formData.teacherId) : (selectedClass?.instructorId || null),
                    courseId: isEditing ? selectedClass.id : formData.id.trim(),
                    courseName: formData.name.trim(),
                    roomNo: formData.roomNo,
                    day: formData.day,
                    date: formData.date,
                    startTime: formData.startTime,
                    endTime: formData.endTime
                })
            });
        } catch (err) {
            console.error('Failed to save timetable record', err);
        }

        await refreshData();
        setIsSaving(false);
        closeModal();
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setIsEditing(false);
        setSelectedClass(null);
        setFormError('');
        setFormData({
            id: '', name: '', description: '',
            date: todayStr, day: 'Monday', startTime: '09:00', endTime: '10:30', roomNo: 'Room 301', teacherId: ''
        });
    };

    const openEditModal = (cls) => {
        setIsEditing(true);
        setSelectedClass(cls);
        setFormData({
            id: cls.id,
            name: cls.name,
            description: cls.description || '',
            date: todayStr,
            day: 'Monday',
            startTime: '09:00',
            endTime: '10:30',
            roomNo: 'Room 301',
            teacherId: cls.instructorId ? String(cls.instructorId) : ''
        });
        setIsModalOpen(true);
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this class?')) {
            await deleteClass(id);
            await refreshData();
        }
    };

    const handleInstructorChange = (classId, teacherId) => {
        if (teacherId) {
            assignClassToTeacher(parseInt(teacherId), classId);
        }
    };

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0 }
    };

    return (
        <motion.div
            initial="hidden"
            animate="visible"
            variants={containerVariants}
            className="page-container admin-page"
        >
            <div className="page-header admin-page-header">
                <div>
                    <h1>Classes & Timetable</h1>
                    <p>Schedule, specify dates/times, and manage active courses</p>
                </div>
                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="btn-primary"
                    onClick={() => setIsModalOpen(true)}
                >
                    <Plus size={20} />
                    Create Class & Schedule
                </motion.button>
            </div>

            {loading ? (
                <div className="dashboard-loading"><div className="dashboard-spinner" /><p>Loading classes from database...</p></div>
            ) : classes.length === 0 ? (
                <div className="dashboard-empty">
                    <BookOpen size={48} />
                    <h3>No Classes Yet</h3>
                    <p>Create your first class to get started.</p>
                </div>
            ) : (
            <div className="classes-grid">
                {classes.map((cls) => {
                    const enrolledCount = students.filter(s => s.enrolledClasses && s.enrolledClasses.includes(cls.id)).length;
                    return (
                        <motion.div
                            key={cls.id}
                            variants={itemVariants}
                            whileHover={{ y: -5, boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}
                            className="class-card"
                        >
                            <div className="class-card-header">
                                <div className={`status-tag ${(cls.status || 'Active').toLowerCase()}`}>
                                    {cls.status || 'Active'}
                                </div>
                                <div className="card-actions-mini" style={{ display: 'flex', gap: '8px' }}>
                                    <button className="icon-btn-small" onClick={() => openEditModal(cls)}><Edit size={16} /></button>
                                    <button className="icon-btn-small delete" onClick={() => handleDelete(cls.id)}><Trash2 size={16} /></button>
                                </div>
                            </div>

                            <div className="class-card-body">
                                <h3 className="class-name">{cls.name} <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>({cls.id})</span></h3>
                                <div className="class-info-list">
                                    <div className="info-item">
                                        <Users size={16} />
                                        <select
                                            className="instructor-select"
                                            value={cls.instructorId || ''}
                                            onChange={(e) => handleInstructorChange(cls.id, e.target.value)}
                                            onClick={(e) => e.stopPropagation()}
                                            style={{ border: 'none', background: 'transparent', fontSize: 'inherit', color: 'inherit', fontWeight: 'inherit', outline: 'none', cursor: 'pointer' }}
                                        >
                                            <option value="">Assign Instructor...</option>
                                            {teachers.map(t => (
                                                <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="info-item">
                                        <BookOpen size={16} />
                                        <span>{enrolledCount} Enrolled</span>
                                    </div>
                                    <div className="info-item">
                                        <Calendar size={16} />
                                        <span>{cls.schedule || 'Schedule pending'}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="class-card-footer">
                                <button className="view-details-btn" onClick={() => navigate(`/admin/course/${cls.id}/analytics`)}>View Analytics</button>
                            </div>
                        </motion.div>
                    );
                })}
            </div>
            )}

            <AnimatePresence>
                {isModalOpen && (
                    <div className="modal-overlay">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="modal-content"
                            style={{ maxWidth: '550px' }}
                        >
                            <div className="modal-header">
                                <h2>{isEditing ? 'Edit Class & Timetable' : 'Create Class & Timetable'}</h2>
                                <button onClick={closeModal} className="close-btn"><X size={24} /></button>
                            </div>
                            <form onSubmit={handleSubmit}>
                                {formError && (
                                    <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', padding: '10px 14px', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '16px', fontWeight: 600 }}>
                                        ⚠️ {formError}
                                    </div>
                                )}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                    <div className="form-group">
                                        <label>Course Code / ID *</label>
                                        <input name="id" value={formData.id} onChange={handleInputChange} required placeholder="e.g., CS401" disabled={isEditing} />
                                    </div>
                                    <div className="form-group">
                                        <label>Instructor</label>
                                        <select name="teacherId" value={formData.teacherId} onChange={handleInputChange}>
                                            <option value="">Select Instructor...</option>
                                            {teachers.map(t => (
                                                <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label>Course Title *</label>
                                    <input name="name" value={formData.name} onChange={handleInputChange} required placeholder="e.g., Introduction to Machine Learning" />
                                </div>

                                <div className="form-group">
                                    <label>Description</label>
                                    <textarea name="description" value={formData.description} onChange={handleInputChange} placeholder="Brief details about the class..." rows={2} />
                                </div>

                                {/* Structured Timetable Input Fields */}
                                <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)', margin: '16px 0' }}>
                                    <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Clock size={16} /> Timetable & Schedule Details
                                    </h4>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                                        <div className="form-group" style={{ margin: 0 }}>
                                            <label>Start Date</label>
                                            <input type="date" name="date" value={formData.date} onChange={handleInputChange} required />
                                        </div>
                                        <div className="form-group" style={{ margin: 0 }}>
                                            <label>Day of Week</label>
                                            <select name="day" value={formData.day} onChange={handleInputChange}>
                                                {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => (
                                                    <option key={d} value={d}>{d}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                                        <div className="form-group" style={{ margin: 0 }}>
                                            <label>Start Time</label>
                                            <input type="time" name="startTime" value={formData.startTime} onChange={handleInputChange} required />
                                        </div>
                                        <div className="form-group" style={{ margin: 0 }}>
                                            <label>End Time</label>
                                            <input type="time" name="endTime" value={formData.endTime} onChange={handleInputChange} required />
                                        </div>
                                        <div className="form-group" style={{ margin: 0 }}>
                                            <label>Room / Venue</label>
                                            <input type="text" name="roomNo" value={formData.roomNo} onChange={handleInputChange} placeholder="Room 301" required />
                                        </div>
                                    </div>
                                </div>

                                <div className="modal-footer">
                                    <button type="button" className="btn-secondary" onClick={closeModal}>Cancel</button>
                                    <button type="submit" className="btn-primary" disabled={isSaving} style={{ background: 'var(--primary)', color: 'white', padding: '12px 24px', borderRadius: '10px', border: 'none', fontWeight: 600 }}>
                                        {isSaving ? 'Saving...' : (isEditing ? 'Save Changes' : 'Create Class & Timetable')}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

export default Classes;
