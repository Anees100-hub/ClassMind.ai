import * as XLSX from 'xlsx';
import React, { useState, useRef } from 'react';
import { useData } from '../context/DataContext';
import { Plus, Search, Mail, Edit, Trash2, X, BookOpen, FileSpreadsheet, GraduationCap, Award } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import './Teachers.css';

const Students = () => {
    const { students, addStudent, updateStudent, deleteStudent, classes, enrollStudentInClass, unenrollStudentFromClass, bulkAddStudents, loading } = useData();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [detailStudent, setDetailStudent] = useState(null);
    const [editingStudent, setEditingStudent] = useState(null);
    const [formData, setFormData] = useState({
        firstName: '', lastName: '', email: '', studentId: '', program: '', year: '', enrollmentDate: '', status: 'Active', previousCGPA: '0.00', overallCGPA: '0.00'
    });
    const [enrollmentClassId, setEnrollmentClassId] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const fileInputRef = useRef(null);

    const activeStudent = detailStudent ? students.find(s => s.id === detailStudent.id) : null;

    const filteredStudents = students.filter(student =>
        `${student.firstName} ${student.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
        student.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (student.studentId || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

    const avgOverallCGPA = filteredStudents.length
        ? (filteredStudents.reduce((acc, s) => acc + parseFloat(s.overallCGPA || 0), 0) / filteredStudents.length).toFixed(2)
        : '0.00';

    const handleImportExcel = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = async (evt) => {
                try {
                    const bstr = evt.target.result;
                    const wb = XLSX.read(bstr, { type: 'binary' });
                    const wsname = wb.SheetNames[0];
                    const ws = wb.Sheets[wsname];
                    const data = XLSX.utils.sheet_to_json(ws);

                    if (data.length > 0) {
                        alert(`Found ${data.length} students in Excel. Starting import...`);
                        const results = await bulkAddStudents(data);
                        if (results) {
                            alert(`Successfully imported ${results.success} students! Failures: ${results.failed}`);
                        }
                    } else {
                        alert('No data found in the Excel file.');
                    }
                } catch (error) {
                    console.error('Excel processing error:', error);
                    alert('Error processing Excel file. Please ensure it is a valid .xlsx or .csv file.');
                }
            };
            reader.readAsBinaryString(file);
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            if (isEditing && editingStudent) {
                if (!editingStudent.id) {
                    alert('Error: Student ID is missing. Cannot update.');
                    setIsSaving(false);
                    return;
                }
                await updateStudent(editingStudent.id, formData);
                if (detailStudent?.id === editingStudent.id) {
                    setDetailStudent(prev => ({ ...prev, ...formData }));
                }
                closeModal();
            } else {
                await addStudent(formData);
                closeModal();
            }
        } catch (error) {
            console.error('Submit failed', error);
            alert('Failed to save changes. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    const openAddModal = () => {
        setIsEditing(false);
        setEditingStudent(null);
        setFormData({ firstName: '', lastName: '', email: '', studentId: '', program: '', year: '', enrollmentDate: '', status: 'Active', previousCGPA: '0.00', overallCGPA: '0.00' });
        setIsModalOpen(true);
    };

    const openEditModal = (student) => {
        setIsEditing(true);
        setEditingStudent(student);
        setFormData({
            firstName: student.firstName,
            lastName: student.lastName,
            email: student.email,
            studentId: student.studentId,
            program: student.program,
            year: student.year,
            enrollmentDate: student.enrollmentDate || '',
            status: student.status || 'Active',
            previousCGPA: student.previousCGPA || '0.00',
            overallCGPA: student.overallCGPA || '0.00'
        });
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setIsEditing(false);
        setEditingStudent(null);
        setFormData({ firstName: '', lastName: '', email: '', studentId: '', program: '', year: '', enrollmentDate: '', status: 'Active', previousCGPA: '0.00', overallCGPA: '0.00' });
    };

    const handleDelete = (id) => {
        if (window.confirm('Are you sure you want to delete this student?')) {
            deleteStudent(id);
            if (detailStudent?.id === id) setDetailStudent(null);
        }
    };

    const handleEnroll = async () => {
        if (activeStudent && enrollmentClassId) {
            await enrollStudentInClass(activeStudent.id, enrollmentClassId);
            setEnrollmentClassId('');
        }
    };

    const handleUnenroll = async (classId) => {
        if (window.confirm('Are you sure you want to unenroll the student from this class?')) {
            await unenrollStudentFromClass(activeStudent.id, classId);
        }
    };

    return (
        <div className="page-container admin-page">
            <div className="page-header admin-page-header">
                <div>
                    <h1>Student Management</h1>
                    <p>Manage enrollments, academic records, and CGPA</p>
                </div>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleImportExcel}
                        accept=".xlsx, .xls, .csv"
                        style={{ display: 'none' }}
                    />
                    <button className="btn-secondary" onClick={() => fileInputRef.current?.click()}>
                        <FileSpreadsheet size={20} />
                        Import from Excel
                    </button>
                    <button className="btn-primary" onClick={openAddModal}>
                        <Plus size={20} />
                        Add New Student
                    </button>
                </div>
            </div>

            <div className="filters-bar">
                <div className="search-wrapper">
                    <Search size={20} className="search-icon" />
                    <input
                        type="text"
                        placeholder="Search students by name, email or ID..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            <div className="stats-row">
                <div className="summary-card">
                    <span className="label">Total Students</span>
                    <span className="value">{filteredStudents.length}</span>
                </div>
                <div className="summary-card">
                    <span className="label">Active</span>
                    <span className="value text-green">{filteredStudents.filter(s => s.status === 'Active').length}</span>
                </div>
                <div className="summary-card">
                    <span className="label">Avg. Overall CGPA</span>
                    <span className="value text-blue">{avgOverallCGPA}</span>
                </div>
                <div className="summary-card">
                    <span className="label">Enrolled in Classes</span>
                    <span className="value">{filteredStudents.filter(s => (s.enrolledClasses || []).length > 0).length}</span>
                </div>
            </div>

            <div className="table-container table-scroll-wrapper">
                {loading ? (
                    <div className="dashboard-loading" style={{ minHeight: '200px' }}>
                        <div className="dashboard-spinner" /><p>Loading students from database...</p>
                    </div>
                ) : (
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Student Name</th>
                            <th>ID & Email</th>
                            <th>Program</th>
                            <th>Previous CGPA</th>
                            <th>Overall CGPA</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredStudents.length > 0 ? (
                            filteredStudents.map(student => (
                                <tr key={student.id} onClick={() => setDetailStudent(student)} style={{ cursor: 'pointer' }}>
                                    <td>
                                        <div className="user-cell">
                                            <div className="avatar-circle" style={{ background: '#3B82F6' }}>{student.firstName[0]}</div>
                                            <div>
                                                <p className="cell-title">{student.firstName} {student.lastName}</p>
                                                <p className="cell-subtitle">{student.year}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="contact-cell">
                                            <p style={{ fontWeight: 600, color: '#4B5563' }}>{student.studentId}</p>
                                            <p><Mail size={14} /> {student.email}</p>
                                        </div>
                                    </td>
                                    <td>{student.program}</td>
                                    <td><span className="cgpa-pill previous">{student.previousCGPA || '0.00'}</span></td>
                                    <td><span className="cgpa-pill overall">{student.overallCGPA || '0.00'}</span></td>
                                    <td><span className={`status-pill ${(student.status || 'Active').toLowerCase() === 'active' ? 'active' : 'inactive'}`}>{student.status || 'Active'}</span></td>
                                    <td>
                                        <div className="actions-cell">
                                            <button className="icon-btn" onClick={(e) => { e.stopPropagation(); openEditModal(student); }}><Edit size={18} /></button>
                                            <button className="icon-btn delete" onClick={(e) => { e.stopPropagation(); handleDelete(student.id); }}><Trash2 size={18} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                                    <Search size={40} style={{ opacity: 0.2, marginBottom: '10px' }} />
                                    <p>No students found matching your search.</p>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
                )}
            </div>

            <AnimatePresence>
                {isModalOpen && (
                    <div className="modal-overlay modal-overlay-center">
                        <motion.div
                            initial={{ scale: 0.92, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.92, opacity: 0, y: 20 }}
                            className="premium-form-modal student-form-modal"
                        >
                            <div className="premium-form-modal-header" style={{ background: 'linear-gradient(135deg, #059669 0%, #0891B2 50%, #2563EB 100%)' }}>
                                <div className="premium-form-modal-title">
                                    <div className="premium-form-icon student">
                                        <GraduationCap size={28} />
                                    </div>
                                    <div>
                                        <h2>{isEditing ? 'Edit Student Profile' : 'Add New Student'}</h2>
                                        <p>{isEditing ? 'Update student information and academic records' : 'Register a new student to ClassMind.ai'}</p>
                                    </div>
                                </div>
                                <button type="button" onClick={closeModal} className="close-btn premium-close"><X size={22} /></button>
                            </div>

                            <form onSubmit={handleSubmit} className="premium-form-body">
                                <div className="form-section-card">
                                    <h3 className="form-section-title">Personal Information</h3>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>First Name</label>
                                            <input name="firstName" value={formData.firstName} onChange={handleInputChange} required placeholder="Alex" />
                                        </div>
                                        <div className="form-group">
                                            <label>Last Name</label>
                                            <input name="lastName" value={formData.lastName} onChange={handleInputChange} required placeholder="Smith" />
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label>Email Address</label>
                                        <input type="email" name="email" value={formData.email} onChange={handleInputChange} required placeholder="student@classmind.ai" />
                                    </div>
                                    <div className="form-group">
                                        <label>Student ID</label>
                                        <input name="studentId" value={formData.studentId} onChange={handleInputChange} required placeholder="STU2024001" />
                                    </div>
                                </div>

                                <div className="form-section-card">
                                    <h3 className="form-section-title">Academic Details</h3>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>Program</label>
                                            <input name="program" value={formData.program} onChange={handleInputChange} required placeholder="Computer Science" />
                                        </div>
                                        <div className="form-group">
                                            <label>Year</label>
                                            <input name="year" value={formData.year} onChange={handleInputChange} required placeholder="Year 2" />
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label>Enrollment Date</label>
                                        <input name="enrollmentDate" type="date" value={formData.enrollmentDate} onChange={handleInputChange} required />
                                    </div>
                                    <div className="form-group">
                                        <label>Status</label>
                                        <select name="status" value={formData.status} onChange={handleInputChange} className="premium-select">
                                            <option value="Active">Active</option>
                                            <option value="Suspended">Suspended</option>
                                            <option value="Graduated">Graduated</option>
                                            <option value="Withdrawn">Withdrawn</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="form-section-card">
                                    <h3 className="form-section-title">CGPA Records</h3>
                                    <p className="form-section-hint" style={{ marginBottom: '14px' }}>Scale: 0.00 – 4.00</p>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>Previous Semester CGPA</label>
                                            <div className="cgpa-input-wrap">
                                                <input
                                                    type="number"
                                                    name="previousCGPA"
                                                    value={formData.previousCGPA}
                                                    onChange={handleInputChange}
                                                    min="0"
                                                    max="4"
                                                    step="0.01"
                                                    required
                                                    placeholder="3.20"
                                                />
                                                <span className="cgpa-scale">/ 4.0</span>
                                            </div>
                                        </div>
                                        <div className="form-group">
                                            <label>Overall CGPA</label>
                                            <div className="cgpa-input-wrap">
                                                <input
                                                    type="number"
                                                    name="overallCGPA"
                                                    value={formData.overallCGPA}
                                                    onChange={handleInputChange}
                                                    min="0"
                                                    max="4"
                                                    step="0.01"
                                                    required
                                                    placeholder="3.45"
                                                />
                                                <span className="cgpa-scale">/ 4.0</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="modal-footer premium-footer">
                                    <button type="button" className="btn-secondary" onClick={closeModal} disabled={isSaving}>Cancel</button>
                                    <button type="submit" className="btn-primary" disabled={isSaving}>
                                        {isSaving ? 'Saving...' : (isEditing ? 'Save Changes' : 'Add Student')}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}

                {activeStudent && !isModalOpen && (
                    <div className="modal-overlay" onClick={() => setDetailStudent(null)}>
                        <motion.div
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="detail-panel"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="detail-panel-header">
                                <button onClick={() => setDetailStudent(null)} className="close-btn-round"><X size={20} /></button>
                                <div className="detail-hero">
                                    <div className="detail-avatar">{activeStudent.firstName[0]}</div>
                                    <div className="detail-name-block">
                                        <h3>{activeStudent.firstName} {activeStudent.lastName}</h3>
                                        <p>{activeStudent.program} • {activeStudent.year}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="detail-body">
                                <div className="detail-section">
                                    <h4>Student Information</h4>
                                    <div className="detail-info-item">
                                        <Mail size={18} />
                                        <span>{activeStudent.email}</span>
                                    </div>
                                    <div className="detail-info-item">
                                        <span style={{ fontWeight: 600 }}>ID:</span>
                                        <span style={{ marginLeft: '8px' }}>{activeStudent.studentId}</span>
                                    </div>
                                </div>

                                <div className="detail-section">
                                    <h4>Academic Performance</h4>
                                    <div className="stats-mini-grid">
                                        <div className="mini-stat cgpa-stat">
                                            <Award size={20} color="#6366F1" />
                                            <div>
                                                <p className="mini-value">{activeStudent.previousCGPA || '0.00'}</p>
                                                <p className="mini-label">Previous CGPA</p>
                                            </div>
                                        </div>
                                        <div className="mini-stat cgpa-stat">
                                            <GraduationCap size={20} color="#059669" />
                                            <div>
                                                <p className="mini-value">{activeStudent.overallCGPA || '0.00'}</p>
                                                <p className="mini-label">Overall CGPA</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="detail-section">
                                    <h4>Enrolled Classes</h4>
                                    {classes.filter(c => activeStudent.enrolledClasses?.includes(c.id)).length > 0 ? (
                                        classes.filter(c => activeStudent.enrolledClasses?.includes(c.id)).map(course => (
                                            <div key={course.id} className="schedule-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                                    <BookOpen size={18} />
                                                    <div>
                                                        <p className="schedule-title">{course.name}</p>
                                                        <p className="schedule-time">{course.instructorName || 'Instructor TBD'} • {course.schedule || 'Schedule TBD'}</p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleUnenroll(course.id)}
                                                    style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #FECACA', background: '#FEF2F2', color: '#EF4444', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 500 }}
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        ))
                                    ) : (
                                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Not enrolled in any classes.</p>
                                    )}
                                </div>

                                <div className="detail-section">
                                    <h4>Enroll in New Class</h4>
                                    <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                                        <select
                                            value={enrollmentClassId}
                                            onChange={(e) => setEnrollmentClassId(e.target.value)}
                                            className="premium-select"
                                            style={{ flex: 1 }}
                                        >
                                            <option value="">Select a class...</option>
                                            {classes.filter(c => !activeStudent.enrolledClasses?.includes(c.id)).map(c => (
                                                <option key={c.id} value={c.id}>{c.name} ({c.id})</option>
                                            ))}
                                        </select>
                                        <button className="btn-primary" onClick={handleEnroll} disabled={!enrollmentClassId}>Enroll</button>
                                    </div>
                                </div>
                            </div>

                            <div className="detail-footer">
                                <button className="btn-secondary">Message Student</button>
                                <button className="btn-primary" onClick={() => openEditModal(activeStudent)}>Edit Profile</button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default Students;
